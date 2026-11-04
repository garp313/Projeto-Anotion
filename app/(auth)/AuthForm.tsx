"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function AuthForm({ mode, initialError = null }: { mode: "login" | "register"; initialError?: string | null }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(initialError);
  const [loading, setLoading] = useState(false);

  async function signInWithGoogle() {
    setLoading(true); setError(null);
    const { error } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    // Em caso de sucesso o navegador já saiu para o Google.
    if (error) { setLoading(false); setError(error.message); }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError(null);
    const supabase = createClient();
    const { error } = mode === "login"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password });
    setLoading(false);
    if (error) return setError(error.message);
    router.push("/workspace"); router.refresh();
  }

  const input = "w-full rounded-md border border-[var(--n-border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--n-accent)] focus:ring-2 focus:ring-[var(--n-accent)]/20";
  return (
    <main className="grid min-h-screen place-items-center px-4">
      <form onSubmit={submit} className="w-full max-w-[320px] space-y-3">
        <h1 className="mb-4 text-center text-3xl font-bold">{mode === "login" ? "Entrar" : "Criar conta"}</h1>
        <input className={input} type="email" placeholder="E-mail" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className={input} type="password" placeholder="Senha" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
        <button disabled={loading} className="w-full rounded-md bg-[var(--n-accent)] py-2 text-sm font-medium text-white hover:brightness-95 disabled:opacity-60">
          {loading ? "Aguarde…" : mode === "login" ? "Continuar" : "Criar conta"}
        </button>
        {mode === "login" && (
          <>
            <div className="flex items-center gap-3 text-xs text-[var(--n-text-muted)]">
              <span className="h-px flex-1 bg-[var(--n-border)]" /> ou <span className="h-px flex-1 bg-[var(--n-border)]" />
            </div>
            <button type="button" onClick={signInWithGoogle} disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-md border border-[var(--n-border)] py-2 text-sm font-medium hover:bg-[var(--n-border)]/40 disabled:opacity-60">
              <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
              </svg>
              Continuar com o Google
            </button>
          </>
        )}
        <p className="text-center text-sm text-[var(--n-text-muted)]">
          {mode === "login" ? <>Não tem conta? <Link className="underline" href="/register">Cadastre-se</Link></> : <>Já tem conta? <Link className="underline" href="/login">Entrar</Link></>}
        </p>
      </form>
    </main>
  );
}
