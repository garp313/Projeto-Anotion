import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { storeGoogleTokens } from "@/lib/google/calendar";
import { saveRefreshToken } from "@/lib/google/tokens";
import { ensureChannel, sameSecret } from "@/lib/google/sync";
import { safeNext } from "@/lib/safeNext";

/** Guarda os tokens para a pessoa logada no app, seja qual for a conta Google escolhida. */
export async function GET(req: NextRequest) {
  const { origin, searchParams } = new URL(req.url);
  const store = await cookies();
  const expected = store.get("g_state")?.value ?? "";
  const next = safeNext(store.get("g_next")?.value) ?? "/inbox";
  store.delete("g_state");
  store.delete("g_next");
  const back = (status: string) => NextResponse.redirect(`${origin}${next}${next.includes("?") ? "&" : "?"}google=${status}`);

  const state = searchParams.get("state") ?? "";
  const code = searchParams.get("code");
  if (!expected || !sameSecret(expected, state)) return back("failed");
  if (!code) return back("denied");

  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user) return NextResponse.redirect(`${origin}/login`);

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code, grant_type: "authorization_code", redirect_uri: `${origin}/api/google/callback`,
      client_id: process.env.GOOGLE_CLIENT_ID ?? "", client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),
  });
  if (!res.ok) return back("failed");
  const tokens = await res.json();

  await storeGoogleTokens(tokens.access_token, tokens.refresh_token, Math.max(60, (tokens.expires_in ?? 3600) - 60), user.id);
  if (tokens.refresh_token) await saveRefreshToken(user.id, tokens.refresh_token);
  await ensureChannel(tokens.access_token, user.id, origin).catch((e) => console.error(e));
  // Na tela do Google cada permissão é uma caixa: dá para conectar sem marcar a leitura do Gmail.
  const granted: string | undefined = tokens.scope;
  return back(granted && !granted.includes("gmail.readonly") ? "partial" : "connected");
}
