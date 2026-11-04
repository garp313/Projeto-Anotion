import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { accessToken } from "@/lib/google/calendar";
import { ensureChannel, pullChanges } from "@/lib/google/sync";

/** Reserva do webhook: ao abrir a Agenda, confere o canal e traz o que mudou. */
export async function POST(req: Request) {
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const token = await accessToken();
  if (!token) return NextResponse.json({ error: "not_connected" }, { status: 401 });
  try {
    await ensureChannel(token, user.id, new URL(req.url).origin);
    return NextResponse.json({ changed: await pullChanges(token, user.id) });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "sync_failed" }, { status: 502 });
  }
}
