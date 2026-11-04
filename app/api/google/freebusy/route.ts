import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { accessTokenFor } from "@/lib/google/tokens";

/** Só horários ocupados, nunca o título dos eventos, e só de colegas. */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const userId = q.get("userId"), start = q.get("start"), end = q.get("end");
  if (!userId || !start || !end || Number.isNaN(Date.parse(start)) || Number.isNaN(Date.parse(end))) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  const { data } = await (await createClient()).rpc("collaborators");
  if (!(data as { id: string }[] | null)?.some((m) => m.id === userId)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const token = await accessTokenFor(userId);
  if (!token) return NextResponse.json({ available: false });
  const res = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
    method: "POST", cache: "no-store",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ timeMin: new Date(start).toISOString(), timeMax: new Date(end).toISOString(), items: [{ id: "primary" }] }),
  });
  if (!res.ok) return NextResponse.json({ available: false });
  const body = await res.json();
  return NextResponse.json({ available: true, busy: body.calendars?.primary?.busy ?? [] });
}
