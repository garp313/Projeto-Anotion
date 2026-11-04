import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { accessToken } from "@/lib/google/calendar";
import { pushDeadline } from "@/lib/google/sync";

export async function POST(req: Request) {
  const { pageId } = await req.json().catch(() => ({}));
  if (typeof pageId !== "string") return NextResponse.json({ error: "invalid" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  // O push usa a chave de serviço: esta leitura pelo RLS confere se a pessoa enxerga a tarefa.
  const { data: page } = await supabase.from("pages").select("id").eq("id", pageId).maybeSingle();
  if (!page) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const token = await accessToken();
  if (!token) return NextResponse.json({ error: "not_connected" }, { status: 401 });
  try {
    return NextResponse.json({ result: await pushDeadline(token, user.id, pageId, new URL(req.url).origin) });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "sync_failed" }, { status: 502 });
  }
}
