import { AuthForm, RESTRICTED } from "../AuthForm";
import { safeNext } from "@/lib/safeNext";

export default async function Page({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const { error, next } = await searchParams;
  return <AuthForm mode="login" next={safeNext(next)} initialError={error === "restricted" ? RESTRICTED : error === "oauth" ? "Não foi possível entrar com o Google. Tente novamente." : null} />;
}
