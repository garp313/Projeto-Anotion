import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/safeNext";

// Retorno do login com Google: troca o código pela sessão e grava os cookies.
export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get("code");
  // O gatilho da lista do time recusa a conta e o Supabase devolve este erro genérico.
  if (/database error/i.test(searchParams.get("error_description") ?? "")) return NextResponse.redirect(`${origin}/login?error=restricted`);

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const store = await cookies();
      const after = store.get("after_auth")?.value;
      store.delete("after_auth");
      return NextResponse.redirect(`${origin}${safeNext(after) ?? "/workspace"}`);
    }
  }
  return NextResponse.redirect(`${origin}/login?error=oauth`);
}
