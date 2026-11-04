import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { accessTokenFor } from "./tokens";

export const ACCESS_COOKIE = "g_at";
export const REFRESH_COOKIE = "g_rt";
/** Cookie é do navegador, não da pessoa: sem este dono, quem entrasse depois usaria a conta Google anterior. */
export const OWNER_COOKIE = "g_uid";
const API = "https://www.googleapis.com/calendar/v3";
const secure = process.env.NODE_ENV === "production";

/** Tokens do Google ficam em cookies httpOnly: o JavaScript da página nunca os enxerga. */
export async function storeGoogleTokens(access: string, refresh: string | null | undefined, expiresIn: number, userId: string) {
  const store = await cookies();
  const base = { httpOnly: true, sameSite: "lax" as const, secure, path: "/" };
  store.set(ACCESS_COOKIE, access, { ...base, maxAge: expiresIn });
  store.set(OWNER_COOKIE, userId, { ...base, maxAge: 60 * 60 * 24 * 180 });
  if (refresh) store.set(REFRESH_COOKIE, refresh, { ...base, maxAge: 60 * 60 * 24 * 180 });
}

export async function clearGoogleTokens() {
  const store = await cookies();
  store.delete(ACCESS_COOKIE);
  store.delete(REFRESH_COOKIE);
  store.delete(OWNER_COOKIE);
}

export async function accessToken(): Promise<string | null> {
  const store = await cookies();
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user) return null;
  const mine = store.get(OWNER_COOKIE)?.value === user.id;
  const current = mine ? store.get(ACCESS_COOKIE)?.value : undefined;
  if (current) return current;

  // Conta guardada no servidor vale em qualquer aparelho; o cookie é só o cache de 1 hora.
  const stored = await accessTokenFor(user.id);
  if (stored) {
    await storeGoogleTokens(stored, null, 3000, user.id);
    return stored;
  }

  const refresh = mine ? store.get(REFRESH_COOKIE)?.value : undefined;
  const { GOOGLE_CLIENT_ID: id, GOOGLE_CLIENT_SECRET: secret } = process.env;
  if (!refresh || !id || !secret) return null;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: id, client_secret: secret, refresh_token: refresh, grant_type: "refresh_token" }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  await storeGoogleTokens(data.access_token, null, Math.max(60, data.expires_in - 60), user.id);
  return data.access_token;
}

export class NotConnected extends Error {}

export async function google<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await accessToken();
  if (!token) throw new NotConnected();
  const res = await fetch(`${API}${path}`, {
    ...init,
    cache: "no-store",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init.headers },
  });
  const failure = res.ok ? "" : await res.text();
  // 401: token revogado. 403 de escopo: entrou com Google sem autorizar a agenda.
  // Outros 403 (como agenda somente leitura) não derrubam a conexão.
  if (res.status === 401 || (res.status === 403 && /insufficient/i.test(failure))) {
    await clearGoogleTokens();
    throw new NotConnected();
  }
  if (!res.ok) throw new Error(`Google Calendar respondeu ${res.status}: ${failure}`);
  return (res.status === 204 ? null : await res.json()) as T;
}

export function calendarError(e: unknown) {
  if (e instanceof NotConnected) return NextResponse.json({ error: "not_connected" }, { status: 401 });
  console.error(e);
  return NextResponse.json({ error: "calendar_error" }, { status: 502 });
}

export type EventInput = {
  summary: string; description?: string; location?: string;
  start: string; end: string; allDay: boolean; timeZone?: string; attendees?: string[];
};

const nextDay = (d: string) => {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + 1);
  return x.toISOString().slice(0, 10);
};

/** No Google o fim de um evento de dia inteiro é exclusivo; na interface é o último dia. */
export function toGoogleEvent(e: EventInput) {
  return {
    summary: e.summary,
    description: e.description,
    location: e.location,
    start: e.allDay ? { date: e.start } : { dateTime: e.start, timeZone: e.timeZone },
    end: e.allDay ? { date: nextDay(e.end) } : { dateTime: e.end, timeZone: e.timeZone },
    ...(e.attendees ? { attendees: e.attendees.map((email) => ({ email })) } : {}),
  };
}
