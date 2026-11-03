import { Suspense } from "react";
import { AuthForm } from "../AuthForm";

export default function Page() {
  return (
    <Suspense fallback={<div className="grid min-h-screen place-items-center text-xs text-[var(--n-text-faint)]">Carregando…</div>}>
      <AuthForm mode="register" />
    </Suspense>
  );
}
