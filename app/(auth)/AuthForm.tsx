"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ShieldCheck, AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { isCorporateEmail } from "@/lib/auth/emailValidation";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  useEffect(() => {
    const errParam = searchParams.get("error");
    const msgParam = searchParams.get("msg");
    if (errParam === "corporate_email_only") {
      setError(
        msgParam
          ? decodeURIComponent(msgParam)
          : "Acesso não autorizado: É obrigatório utilizar um e-mail corporativo para acessar a ferramenta. Provedores pessoais (@gmail.com, etc.) são bloqueados."
      );
    } else if (errParam === "auth_failed") {
      setError("Falha ao autenticar com o Google. Por favor, tente novamente.");
    }
  }, [searchParams]);

  async function handleGoogleLogin() {
    try {
      setGoogleLoading(true);
      setError(null);
      const supabase = createClient();
      const origin = window.location.origin;

      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${origin}/auth/callback`,
          queryParams: {
            access_type: "offline",
            prompt: "select_account",
          },
        },
      });

      if (error) {
        setGoogleLoading(false);
        setError(error.message);
      }
    } catch (e: any) {
      setGoogleLoading(false);
      setError(e?.message || "Erro inesperado ao conectar com o Google.");
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Validação de e-mail corporativo no formulário direto
    const validation = isCorporateEmail(email);
    if (!validation.isValid) {
      setError(validation.reason || "Por favor, utilize seu e-mail corporativo.");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error } =
      mode === "login"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });
    setLoading(false);

    if (error) return setError(error.message);
    router.push("/workspace");
    router.refresh();
  }

  const input =
    "w-full rounded-lg border border-[var(--n-border)] bg-[var(--n-bg-sidebar)]/30 px-3 py-2 text-sm text-[var(--n-text)] outline-none transition-colors placeholder:text-[var(--n-text-faint)] focus:border-[var(--n-accent)] focus:bg-[var(--n-bg)] focus:ring-2 focus:ring-[var(--n-accent)]/20";

  return (
    <main className="grid min-h-screen place-items-center px-4 py-8">
      <div className="w-full max-w-[360px] space-y-5 rounded-2xl border border-[var(--n-border)] bg-[var(--n-bg)] p-6 shadow-xl">
        {/* Header */}
        <div className="text-center">
          <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-[var(--n-accent)]/10 text-[var(--n-accent)]">
            <ShieldCheck size={26} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--n-text)]">
            {mode === "login" ? "Entrar no Workspace" : "Criar sua Conta"}
          </h1>
          <p className="mt-1 text-xs text-[var(--n-text-faint)]">
            Acesso exclusivo com e-mail corporativo
          </p>
        </div>

        {/* Mensagem de Erro / Bloqueio */}
        {error && (
          <div className="flex items-start gap-2.5 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-600 dark:text-red-400 animate-in fade-in">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <p className="leading-relaxed">{error}</p>
          </div>
        )}

        {/* Botão Oficial do Google */}
        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={googleLoading || loading}
          className="flex w-full items-center justify-center gap-2.5 rounded-lg border border-[var(--n-border)] bg-[var(--n-bg)] py-2.5 text-xs font-semibold text-[var(--n-text)] shadow-xs transition-colors hover:bg-[var(--n-hover)] disabled:opacity-60"
        >
          {googleLoading ? (
            <span>Conectando com o Google…</span>
          ) : (
            <>
              {/* Google Official SVG Logo */}
              <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>Continuar com o Google</span>
            </>
          )}
        </button>

        {/* Divisor */}
        <div className="relative flex items-center justify-center">
          <div className="w-full border-t border-[var(--n-border)]" />
          <span className="absolute bg-[var(--n-bg)] px-2 text-[11px] font-medium text-[var(--n-text-faint)]">
            ou com e-mail corporativo
          </span>
        </div>

        {/* Formulário Manual */}
        <form onSubmit={submit} className="space-y-3">
          <div>
            <input
              className={input}
              type="email"
              placeholder="seu.nome@suaempresa.com"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <input
              className={input}
              type="password"
              placeholder="Senha"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button
            type="submit"
            disabled={loading || googleLoading}
            className="w-full rounded-lg bg-[var(--n-accent)] py-2 text-xs font-semibold text-white shadow-xs transition-opacity hover:opacity-95 disabled:opacity-60"
          >
            {loading ? "Aguarde…" : mode === "login" ? "Entrar com e-mail" : "Cadastrar com e-mail"}
          </button>
        </form>

        <p className="text-center text-xs text-[var(--n-text-muted)]">
          {mode === "login" ? (
            <>
              Não tem conta?{" "}
              <Link className="font-medium text-[var(--n-accent)] hover:underline" href="/register">
                Cadastre-se
              </Link>
            </>
          ) : (
            <>
              Já tem conta?{" "}
              <Link className="font-medium text-[var(--n-accent)] hover:underline" href="/login">
                Entrar
              </Link>
            </>
          )}
        </p>
      </div>
    </main>
  );
}
