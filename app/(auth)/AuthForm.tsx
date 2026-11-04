"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type AuthFormProps = {
  mode?: "login" | "signup";
};

export function AuthForm({ mode = "login" }: AuthFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const supabase = createClient();

  // Função de Login com Google contendo os Escopos das ferramentas
  const handleGoogleLogin = async () => {
    setLoading(true);
    setErrorMsg(null);

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          // Escopos para acessar o Google Calendar, Drive e Sheets
          scopes: [
            "https://www.googleapis.com/auth/calendar.readonly",
            "https://www.googleapis.com/auth/drive.readonly",
            "https://www.googleapis.com/auth/spreadsheets",
          ].join(" "),
          queryParams: {
            access_type: "offline", // Mantém o refresh token ativo no Supabase
            prompt: "consent",      // Garante que o usuário aceite os novos escopos
          },
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) {
        setErrorMsg(error.message);
      }
    } catch (err: any) {
      setErrorMsg("Ocorreu um erro ao tentar entrar com o Google.");
    } finally {
      setLoading(false);
    }
  };

  // Login / Cadastro manual com Email e Senha
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);

    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        window.location.href = "/workspace";
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Erro na autenticação.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-[320px] flex-col justify-center space-y-4">
      <div className="flex flex-col space-y-1 text-center">
        <h1 className="text-xl font-semibold tracking-tight text-[var(--n-text)]">
          {mode === "login" ? "Entrar na sua conta" : "Criar uma conta"}
        </h1>
        <p className="text-xs text-[var(--n-text-muted)]">
          Escolha uma das opções para continuar
        </p>
      </div>

      {errorMsg && (
        <div className="rounded-md bg-red-500/10 p-2.5 text-center text-xs text-red-500">
          {errorMsg}
        </div>
      )}

      {/* Botão Oficial do Google */}
      <button
        type="button"
        onClick={handleGoogleLogin}
        disabled={loading}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--n-border)] bg-[var(--n-bg)] px-3 py-2 text-xs font-medium text-[var(--n-text)] transition-colors hover:bg-[var(--n-hover)] disabled:opacity-50"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24">
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
        Continuar com o Google
      </button>

      <div className="relative my-2">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-[var(--n-border)]" />
        </div>
        <div className="relative flex justify-center text-[10px] uppercase">
          <span className="bg-[var(--n-bg)] px-2 text-[var(--n-text-faint)]">
            ou
          </span>
        </div>
      </div>

      {/* Formulário com Email e Senha */}
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-[var(--n-text-faint)]">
            E-mail
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="nome@empresa.com"
            required
            className="w-full rounded-md border border-[var(--n-border)] bg-[var(--n-bg-sidebar)]/50 px-2.5 py-1.5 text-xs text-[var(--n-text)] outline-none focus:border-[var(--n-accent)] focus:bg-[var(--n-bg)]"
          />
        </div>

        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-[var(--n-text-faint)]">
            Senha
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            className="w-full rounded-md border border-[var(--n-border)] bg-[var(--n-bg-sidebar)]/50 px-2.5 py-1.5 text-xs text-[var(--n-text)] outline-none focus:border-[var(--n-accent)] focus:bg-[var(--n-bg)]"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-[var(--n-accent)] px-3 py-2 text-xs font-medium text-white hover:brightness-95 disabled:opacity-50"
        >
          {loading
            ? "Carregando…"
            : mode === "login"
            ? "Entrar"
            : "Criar conta"}
        </button>
      </form>
    </div>
  );
}