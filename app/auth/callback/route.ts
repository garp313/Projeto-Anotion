import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { storeGoogleTokens } from "@/lib/google/calendar";
import { saveRefreshToken } from "@/lib/google/tokens";
import { ensureChannel } from "@/lib/google/sync";

// Retorno do login com Google: troca o código pela sessão e grava os cookies.
export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get("code");
  // O gatilho da lista do time recusa a conta e o Supabase devolve este erro genérico.
  if (/database error/i.test(searchParams.get("error_description") ?? "")) return NextResponse.redirect(`${origin}/login?error=restricted`);

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const store = await cookies();
      const after = store.get("after_auth")?.value;
      store.delete("after_auth");
      // Só o fluxo "Conectar agenda" pede o escopo do calendário.
      if (after === "/agenda" && data.session?.provider_token) {
        await storeGoogleTokens(data.session.provider_token, data.session.provider_refresh_token);
        if (data.session.provider_refresh_token) await saveRefreshToken(data.session.user.id, data.session.provider_refresh_token);
        await ensureChannel(data.session.provider_token, data.session.user.id, origin).catch((e) => console.error(e));
        return NextResponse.redirect(`${origin}/agenda`);
      }
      return NextResponse.redirect(`${origin}/workspace`);
    }
  }
  return NextResponse.redirect(`${origin}/login?error=oauth`);
}
