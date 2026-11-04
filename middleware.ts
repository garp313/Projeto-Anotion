import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

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
  // Lê a sessão do cookie (renova se expirou) sem ida à rede: aqui só decidimos o redirect;
  // quem protege os dados é o RLS, que valida o JWT em cada consulta.
  const { data: { session } } = await supabase.auth.getSession();
  const isAuthRoute = req.nextUrl.pathname.startsWith("/login") || req.nextUrl.pathname.startsWith("/register");
  const isOAuthCallback = req.nextUrl.pathname.startsWith("/auth/callback");
  // Cron e webhooks não têm sessão: cada rota valida o próprio segredo.
  if (/^\/api\/(cron|google\/webhook)\//.test(req.nextUrl.pathname)) return res;
  if (!session && req.nextUrl.pathname.startsWith("/api/")) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!session && !isAuthRoute && !isOAuthCallback) {
    // Link de e-mail sem sessão: depois do login a pessoa cai na tarefa, não na página inicial.
    const login = new URL("/login", req.url);
    login.searchParams.set("next", req.nextUrl.pathname + req.nextUrl.search);
    return NextResponse.redirect(login);
  }
  if (session && isAuthRoute) return NextResponse.redirect(new URL("/workspace", req.url));
  return res;
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico|css|js|woff2?)$).*)"] };
