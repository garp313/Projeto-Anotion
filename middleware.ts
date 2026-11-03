import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isCorporateEmail } from "@/lib/auth/emailValidation";

export async function middleware(req: NextRequest) {
  let res = NextResponse.next({ request: req });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (list: Array<{ name: string; value: string; options?: any }>) => {
          list.forEach(({ name, value }) => req.cookies.set(name, value));
          res = NextResponse.next({ request: req });
          list.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
        },
      },
    }
  );

  const isCallback = req.nextUrl.pathname.startsWith("/auth/callback");
  if (isCallback) return res;

  const { data: { user } } = await supabase.auth.getUser();
  const isAuthRoute = req.nextUrl.pathname.startsWith("/login") || req.nextUrl.pathname.startsWith("/register");

  if (user) {
    // Validar se o e-mail logado é estritamente corporativo
    const validation = isCorporateEmail(user.email);
    if (!validation.isValid) {
      await supabase.auth.signOut();
      return NextResponse.redirect(new URL("/login?error=corporate_email_only", req.url));
    }

    if (isAuthRoute) {
      return NextResponse.redirect(new URL("/workspace", req.url));
    }
  } else if (!isAuthRoute) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return res;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
