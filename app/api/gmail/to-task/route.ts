import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { accessToken } from "@/lib/google/calendar";
import { GmailScopeError } from "@/lib/google/gmail";
import { createTaskFromMessage } from "@/lib/google/emailTask";

export async function POST(req: Request) {
  const { messageId, databaseId } = await req.json().catch(() => ({}));
  if (typeof messageId !== "string" || typeof databaseId !== "string") return NextResponse.json({ error: "invalid" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const token = await accessToken();
  if (!token) return NextResponse.json({ error: "not_connected" }, { status: 401 });

  try {
    return NextResponse.json(await createTaskFromMessage(supabase, token, user.id, messageId, databaseId));
  } catch (e) {
    if (e instanceof GmailScopeError) return NextResponse.json({ error: "needs_scope" }, { status: 403 });
    console.error(e);
    return NextResponse.json({ error: "create_failed" }, { status: 500 });
  }
}
