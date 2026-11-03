import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isCorporateEmail } from "@/lib/auth/emailValidation";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const origin = requestUrl.origin;

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error("Erro ao autenticar com Google:", error.message);
      return NextResponse.redirect(`${origin}/login?error=auth_failed`);
    }

    const email = data.user?.email;
    const validation = isCorporateEmail(email);

    // Validação estrita: apenas e-mails corporativos permitidos
    if (!validation.isValid) {
      console.warn(`Tentativa de acesso barrada para e-mail não corporativo: ${email}`);
      // Forçar logout e revogar sessão
      await supabase.auth.signOut();

      const reasonMsg = encodeURIComponent(
        validation.reason || "Apenas e-mails corporativos são autorizados."
      );
      return NextResponse.redirect(`${origin}/login?error=corporate_email_only&msg=${reasonMsg}`);
    }
  }

  // Login corporativo bem-sucedido
  return NextResponse.redirect(`${origin}/workspace`);
}
