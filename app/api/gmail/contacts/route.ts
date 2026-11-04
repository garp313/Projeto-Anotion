import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { accessToken } from "@/lib/google/calendar";
import { GmailScopeError, recentContacts } from "@/lib/google/gmail";

/** Pessoas com quem a conta conectada troca e-mail. Lê só cabeçalhos, nunca o conteúdo. */
export async function GET() {
  const token = await accessToken();
  if (!token) return NextResponse.json({ contacts: [], reason: "not_connected" });
  const { data: { user } } = await (await createClient()).auth.getUser();
  try {
    return NextResponse.json({ contacts: await recentContacts(token, user?.email) });
  } catch (e) {
    if (e instanceof GmailScopeError) return NextResponse.json({ contacts: [], reason: "not_connected" });
    console.error(e);
    return NextResponse.json({ contacts: [], reason: "failed" });
  }
}
