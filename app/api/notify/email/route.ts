import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendGmail } from "@/lib/google/gmail";

/** Envia a fila de quem está logado. Com { invite } avisa uma pessoa convidada por essa conta. */
export async function POST(req: Request) {
  const supabase = await createClient();
  const origin = new URL(req.url).origin;
  const input = await req.json().catch(() => ({}));

  if (typeof input.invite === "string") {
    const email = input.invite.trim().toLowerCase();
    // Só para quem a própria pessoa convidou: a rota não vira um disparador de e-mails.
    const [{ data: invites }, { data: people }] = await Promise.all([
      supabase.from("invites").select("id").eq("email", email).limit(1),
      supabase.rpc("collaborators"),
    ]);
    const known = invites?.length || (people as { email: string }[] | null)?.some((p) => p.email.toLowerCase() === email);
    if (!known) return NextResponse.json({ error: "not_invited" }, { status: 403 });
    const result = await sendGmail(email, "Você foi convidado para um workspace", `Você recebeu acesso a um workspace.\n\nEntre com este e-mail em: ${origin}/login`);
    return NextResponse.json({ result });
  }

  const { data, error } = await supabase.rpc("pending_emails");
  if (error) return NextResponse.json({ sent: 0 });
  const sent: string[] = [];
  let reason: string | undefined;
  for (const n of data as { id: string; email: string; body: string; page_id: string | null }[]) {
    const link = n.page_id ? `\n\nAbrir: ${origin}/workspace/${n.page_id}` : "";
    const result = await sendGmail(n.email, n.body, `${n.body}${link}`);
    if (result === "sent") sent.push(n.id);
    else if (result === "not_connected") { reason = result; break; }
  }
  if (sent.length) await supabase.rpc("mark_emailed", { ids: sent });
  return NextResponse.json({ sent: sent.length, reason });
}
