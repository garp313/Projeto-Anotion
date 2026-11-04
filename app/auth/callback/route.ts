import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { storeGoogleTokens } from "@/lib/google/calendar";

// Retorno do login com Google: troca o código pela sessão e grava os cookies.
export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get("code");

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
        return NextResponse.redirect(`${origin}/agenda`);
      }
      return NextResponse.redirect(`${origin}/workspace`);
    }
  }
  return NextResponse.redirect(`${origin}/login?error=oauth`);
}
