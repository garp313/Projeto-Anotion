import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { accessToken } from "@/lib/google/calendar";
import { GmailScopeError, listMessages } from "@/lib/google/gmail";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() || "in:inbox newer_than:7d";
  const token = await accessToken();
  if (!token) return NextResponse.json({ error: "not_connected" }, { status: 401 });
  try {
    const messages = await listMessages(token, q);
    const supabase = await createClient();
    const { data } = await supabase.from("external_links").select("external_id,page_id")
      .eq("provider", "gmail").in("external_id", messages.map((m) => m.id));
    const linked = new Map((data ?? []).map((l) => [l.external_id, l.page_id]));
    return NextResponse.json({ messages: messages.map((m) => ({ ...m, pageId: linked.get(m.id) ?? null })) });
  } catch (e) {
    if (e instanceof GmailScopeError) return NextResponse.json({ error: e.kind, project: e.project }, { status: 403 });
    console.error(e);
    return NextResponse.json({ error: "gmail_error" }, { status: 502 });
  }
}
