import { NextResponse, type NextRequest } from "next/server";
import { NotConnected, calendarError, google, toGoogleEvent, type EventInput } from "@/lib/google/calendar";

type CalendarEntry = { id: string; summary: string; backgroundColor?: string; primary?: boolean; selected?: boolean; accessRole: string };

/** Feriados vêm no idioma do id da agenda: tenta as versões em português antes da original. */
async function eventsOf(id: string, qs: URLSearchParams) {
  const list = (calendarId: string) => google<{ items: any[] }>(`/calendars/${encodeURIComponent(calendarId)}/events?${qs}`);
  const holiday = /^[a-z_-]+\.(.+#holiday@group\.v\.calendar\.google\.com)$/.exec(id);
  if (holiday && !id.startsWith("pt")) {
    for (const prefix of ["pt-br", "pt_br", "pt"]) {
      try {
        return await list(`${prefix}.${holiday[1]}`);
      } catch (e) {
        if (e instanceof NotConnected) throw e;
      }
    }
  }
  return list(id);
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const timeMin = searchParams.get("timeMin");
  const timeMax = searchParams.get("timeMax");
  if (!timeMin || !timeMax) return NextResponse.json({ error: "timeMin e timeMax são obrigatórios" }, { status: 400 });

  try {
    const { items: calendars } = await google<{ items: CalendarEntry[] }>("/users/me/calendarList");
    const qs = new URLSearchParams({ timeMin, timeMax, singleEvents: "true", orderBy: "startTime", maxResults: "500" });
    // Uma agenda com problema (feriados, compartilhada) não pode derrubar as outras.
    const settled = await Promise.allSettled(
      calendars.map(async (c) => {
        const { items } = await eventsOf(c.id, qs);
        return items.map((e) => ({ ...e, calendarId: c.id, color: c.backgroundColor, writable: ["owner", "writer"].includes(c.accessRole) }));
      })
    );
    const lists = settled.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
    const lost = settled.find((r) => r.status === "rejected" && r.reason instanceof NotConnected);
    if (lost) throw (lost as PromiseRejectedResult).reason;
    settled.forEach((r, i) => { if (r.status === "rejected") console.error(`agenda ${calendars[i].summary}`, r.reason); });
    return NextResponse.json({
      failed: calendars.filter((_, i) => settled[i].status === "rejected").map((c) => c.summary),
      calendars: calendars.map((c) => ({
        id: c.id, name: c.summary, color: c.backgroundColor, primary: Boolean(c.primary), writable: ["owner", "writer"].includes(c.accessRole),
      })),
      events: lists.flat(),
    });
  } catch (e) {
    return calendarError(e);
  }
}

export async function POST(req: NextRequest) {
  const { calendarId = "primary", ...input } = (await req.json()) as EventInput & { calendarId?: string };
  try {
    const qs = input.attendees?.length ? "?sendUpdates=all" : "";
    const created = await google(`/calendars/${encodeURIComponent(calendarId)}/events${qs}`, {
      method: "POST",
      body: JSON.stringify(toGoogleEvent(input)),
    });
    return NextResponse.json(created);
  } catch (e) {
    return calendarError(e);
  }
}
