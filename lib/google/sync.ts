import { randomBytes, randomUUID, timingSafeEqual } from "crypto";
import type { DateValue } from "@/components/database/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { toGoogleEvent } from "./calendar";
import { accessTokenFor } from "./tokens";

const API = "https://www.googleapis.com/calendar/v3";
/** Horário salvo sem fuso é o de Brasília: é o do time, e o servidor roda em UTC. */
export const APP_TZ = "America/Sao_Paulo";

class GoogleError extends Error { constructor(public status: number) { super(`Google Calendar respondeu ${status}`); } }

async function cal<T = any>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init, cache: "no-store",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init.headers },
  });
  if (!res.ok) throw new GoogleError(res.status);
  return (res.status === 204 ? null : await res.json()) as T;
}

const yearOk = (s?: string | null) => { const y = Number(s?.slice(0, 4)); return y >= 1900 && y <= 2100; };
/** Última barreira: uma data como 0026 nunca vira evento, venha de onde vier. */
export const validDate = (v: DateValue) => yearOk(v.start) && (!v.end || yearOk(v.end));

const plusHour = (s: string) => {
  // Soma como UTC só para fazer a conta: a parte do fuso continua a cargo do timeZone do evento.
  const d = new Date(`${s.slice(0, 16)}:00Z`);
  d.setUTCHours(d.getUTCHours() + 1);
  return d.toISOString().slice(0, 16);
};

function eventBody(title: string, v: DateValue, link: string) {
  const start = v.time ? v.start : v.start.slice(0, 10);
  const end = v.time ? v.end ?? plusHour(v.start) : (v.end ?? v.start).slice(0, 10);
  const pad = (s: string) => (v.time && s.length === 16 ? `${s}:00` : s);
  return toGoogleEvent({
    summary: title || "Sem título", description: `Tarefa: ${link}`, allDay: !v.time,
    start: pad(start), end: pad(end), timeZone: v.time ? APP_TZ : undefined,
  });
}

export type PushResult = "created" | "updated" | "removed" | "skipped" | "invalid";

/** Leva o prazo da tarefa para o Google. Só age em bancos com a sincronização ligada. */
export async function pushDeadline(token: string, userId: string, pageId: string, origin: string): Promise<PushResult> {
  const admin = createAdminClient();
  if (!admin) return "skipped";
  const { data: page } = await admin.from("pages").select("id,title,parent_id,row_properties").eq("id", pageId).single();
  if (!page?.parent_id) return "skipped";
  const { data: db } = await admin.from("pages").select("row_properties").eq("id", page.parent_id).single();
  const prop: string | undefined = db?.row_properties?.__calendarSync;
  if (!prop) return "skipped";

  const raw = page.row_properties?.[prop];
  const value: DateValue | null = !raw ? null : typeof raw === "string" ? { start: raw } : raw.start ? raw : null;
  const { data: link } = await admin.from("external_links").select("id,external_id,owner_id")
    .eq("page_id", pageId).eq("provider", "calendar").eq("kind", "deadline").maybeSingle();
  const legacy: string | undefined = page.row_properties?.[`__gcal_${prop}`];
  const eventId = link?.external_id ?? legacy;

  // O evento vive na agenda de quem o criou: outra pessoa alterar o prazo usa o acesso dessa conta.
  const owner = link?.owner_id ?? userId;
  const ownerToken = owner === userId ? token : await accessTokenFor(owner);
  if (!ownerToken) return "skipped";

  if (!value) {
    if (!eventId) return "skipped";
    await cal(ownerToken, `/calendars/primary/events/${encodeURIComponent(eventId)}`, { method: "DELETE" }).catch(() => null);
    if (link) await admin.from("external_links").delete().eq("id", link.id);
    return "removed";
  }
  if (!validDate(value)) return "invalid";

  const body = JSON.stringify(eventBody(page.title, value, `${origin}/workspace/${pageId}`));
  if (eventId) {
    try {
      await cal(ownerToken, `/calendars/primary/events/${encodeURIComponent(eventId)}`, { method: "PATCH", body });
      if (!link) await admin.from("external_links").insert({ page_id: pageId, provider: "calendar", kind: "deadline", external_id: eventId, calendar_id: "primary", prop, owner_id: owner });
      return "updated";
    } catch (e) {
      if (!(e instanceof GoogleError) || ![404, 410].includes(e.status)) throw e;
      if (link) await admin.from("external_links").delete().eq("id", link.id);
    }
  }
  const created = await cal<{ id: string }>(ownerToken, "/calendars/primary/events", { method: "POST", body });
  await admin.from("external_links").insert({ page_id: pageId, provider: "calendar", kind: "deadline", external_id: created.id, calendar_id: "primary", prop, owner_id: owner });
  return "created";
}

const inAppZone = (iso: string) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: APP_TZ, dateStyle: "short", timeStyle: "short" }).format(new Date(iso)).replace(" ", "T");

/** Evento do Google no formato da propriedade. O fim de dia inteiro é exclusivo lá. */
function fromEvent(e: any): Pick<DateValue, "start" | "end" | "time"> | null {
  if (e.start?.date) {
    const last = new Date(`${e.end.date}T00:00:00Z`);
    last.setUTCDate(last.getUTCDate() - 1);
    const end = last.toISOString().slice(0, 10);
    return { start: e.start.date, end: end === e.start.date ? null : end, time: false };
  }
  return e.start?.dateTime ? { start: inAppZone(e.start.dateTime), end: inAppZone(e.end.dateTime), time: true } : null;
}

const same = (a: DateValue, b: Pick<DateValue, "start" | "end" | "time">) => {
  const day = (s?: string | null) => (s ? s.slice(0, b.time ? 16 : 10) : null);
  // Sem fim definido, o evento com horário dura 1 hora: isso não é mudança.
  const end = b.time && !a.end ? plusHour(a.start) : a.end;
  return Boolean(a.time) === Boolean(b.time) && day(a.start) === day(b.start) && day(end) === day(b.end);
};

/** Traz do Google só o que mudou desde a última leitura. Evento apagado solta o vínculo; a tarefa fica. */
export async function pullChanges(token: string, userId: string) {
  const admin = createAdminClient();
  if (!admin) return 0;
  const { data: channel } = await admin.from("calendar_channels").select("sync_token").eq("user_id", userId).maybeSingle();
  if (!channel) return 0;

  let pageToken: string | undefined;
  let syncToken: string | null = channel.sync_token;
  let next: string | undefined;
  let changed = 0;
  do {
    const qs = new URLSearchParams({ maxResults: "250", showDeleted: "true", singleEvents: "true" });
    if (syncToken) qs.set("syncToken", syncToken);
    if (pageToken) qs.set("pageToken", pageToken);
    let res: { items?: any[]; nextPageToken?: string; nextSyncToken?: string };
    try {
      res = await cal(token, `/calendars/primary/events?${qs}`);
    } catch (e) {
      // 410: o token expirou. Recomeça a leitura sem ele.
      if (e instanceof GoogleError && e.status === 410 && syncToken) { syncToken = null; pageToken = undefined; continue; }
      throw e;
    }
    const items = res.items ?? [];
    const { data: links } = items.length
      ? await admin.from("external_links").select("id,page_id,prop,external_id").eq("provider", "calendar").eq("kind", "deadline").in("external_id", items.map((i) => i.id))
      : { data: [] };
    for (const link of links ?? []) {
      const event = items.find((i) => i.id === link.external_id);
      if (event.status === "cancelled") {
        await admin.from("external_links").delete().eq("id", link.id);
        continue;
      }
      const incoming = fromEvent(event);
      if (!incoming || !link.prop) continue;
      const { data: page } = await admin.from("pages").select("row_properties").eq("id", link.page_id).single();
      const props = page?.row_properties ?? {};
      const cur = props[link.prop];
      if (cur?.start && same(cur, incoming)) continue;
      await admin.from("pages").update({ row_properties: { ...props, [link.prop]: { ...cur, ...incoming } } }).eq("id", link.page_id);
      changed++;
    }
    pageToken = res.nextPageToken;
    next = res.nextSyncToken ?? next;
  } while (pageToken);
  if (next) await admin.from("calendar_channels").update({ sync_token: next }).eq("user_id", userId);
  return changed;
}

/** Pede ao Google para avisar mudanças. O canal vale 7 dias e o cron renova. Exige https público. */
export async function ensureChannel(token: string, userId: string, origin: string) {
  const admin = createAdminClient();
  if (!admin || !origin.startsWith("https://")) return false;
  const { data: cur } = await admin.from("calendar_channels").select("expires_at,sync_token").eq("user_id", userId).maybeSingle();
  if (cur && new Date(cur.expires_at).getTime() > Date.now() + 2 * 86_400_000) return true;

  const id = randomUUID();
  const secret = randomBytes(24).toString("hex");
  const made = await cal<{ resourceId: string; expiration: string }>(token, "/calendars/primary/events/watch", {
    method: "POST",
    body: JSON.stringify({ id, type: "web_hook", address: `${origin}/api/google/webhook/calendar`, token: secret, params: { ttl: "604800" } }),
  });
  await admin.from("calendar_channels").upsert({
    user_id: userId, channel_id: id, resource_id: made.resourceId, token: secret,
    sync_token: cur?.sync_token ?? null, expires_at: new Date(Number(made.expiration)).toISOString(),
  });
  if (!cur?.sync_token) await pullChanges(token, userId);
  return true;
}

export const sameSecret = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};
