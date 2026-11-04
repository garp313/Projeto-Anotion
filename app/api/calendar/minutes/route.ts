import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const text = (t: string) => ({ type: "text", text: t, styles: {} });
const heading = (t: string) => ({ type: "heading", props: { level: 2 }, content: [text(t)] });

/** Cria a página de ata do evento. Clicar de novo abre a mesma página. */
export async function POST(req: Request) {
  const { eventId, summary, start, attendees } = await req.json().catch(() => ({}));
  if (typeof eventId !== "string" || !eventId) return NextResponse.json({ error: "invalid" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const admin = createAdminClient();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const existing = () => admin.from("external_links").select("page_id").eq("provider", "calendar").eq("kind", "minutes").eq("external_id", eventId).maybeSingle();
  const found = (await existing()).data;
  if (found) return NextResponse.json({ pageId: found.page_id });

  const [{ data: ws }, { data: team }] = await Promise.all([
    supabase.from("workspaces").select("id").eq("owner_id", user.id).limit(1).maybeSingle(),
    supabase.rpc("collaborators"),
  ]);
  if (!ws) return NextResponse.json({ error: "no_workspace" }, { status: 400 });
  const people = (team ?? []) as { id: string; name: string; email: string }[];
  const emails: string[] = Array.isArray(attendees) ? attendees.filter((a) => typeof a === "string") : [];
  const participants = emails.flatMap((email, i) => {
    const m = people.find((p) => p.email.toLowerCase() === email.toLowerCase());
    const item = m ? { type: "mention", props: { kind: "person", label: m.name || m.email, target: m.id } } : text(email);
    return i ? [text(", "), item] : [item];
  });
  const when = typeof start === "string" && start ? new Date(start).toLocaleString("pt-BR", { dateStyle: "long", timeZone: "America/Sao_Paulo" }) : "";

  const id = randomUUID();
  const { error } = await supabase.from("pages").insert({
    id, workspace_id: ws.id, position: Date.now(), icon: "📝",
    title: `Ata: ${typeof summary === "string" && summary ? summary : "Reunião"}${when ? ` (${when})` : ""}`,
    content_json: [
      heading("Participantes"), { type: "paragraph", content: participants },
      heading("Pauta"), { type: "bulletListItem", content: [] },
      heading("Notas"), { type: "paragraph", content: [] },
      heading("Itens de ação"), { type: "checkListItem", content: [] },
    ],
  });
  if (error) return NextResponse.json({ error: "create_failed" }, { status: 500 });

  const link = await admin.from("external_links").insert({ page_id: id, provider: "calendar", kind: "minutes", external_id: eventId, owner_id: user.id });
  if (link.error) {
    await admin.from("pages").delete().eq("id", id);
    const winner = (await existing()).data;
    return winner ? NextResponse.json({ pageId: winner.page_id }) : NextResponse.json({ error: "create_failed" }, { status: 500 });
  }
  return NextResponse.json({ pageId: id });
}
