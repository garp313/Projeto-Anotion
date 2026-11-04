import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/safeNext";

const SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly",
];

/**
 * Autoriza o Google para quem já está logado. Não passa pelo login do Supabase de propósito:
 * aquele fluxo troca a sessão do app pela conta Google ativa no navegador.
 */
export async function GET(req: NextRequest) {
  const { origin, searchParams } = new URL(req.url);
  const next = safeNext(searchParams.get("next")) ?? "/inbox";
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId || !process.env.GOOGLE_CLIENT_SECRET) {
    return NextResponse.redirect(`${origin}${next}${next.includes("?") ? "&" : "?"}google=missing_keys`);
  }
  const { data: { user } } = await (await createClient()).auth.getUser();

  const state = randomBytes(24).toString("hex");
  const store = await cookies();
  const base = { httpOnly: true, sameSite: "lax" as const, secure: origin.startsWith("https://"), path: "/", maxAge: 600 };
  store.set("g_state", state, base);
  store.set("g_next", next, base);

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: clientId, redirect_uri: `${origin}/api/google/callback`, response_type: "code", state,
    access_type: "offline", prompt: "consent select_account", scope: SCOPES.join(" "),
    ...(user?.email ? { login_hint: user.email } : {}),
  }).toString();
  return NextResponse.redirect(url);
}
