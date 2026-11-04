import { AuthForm, RESTRICTED } from "../AuthForm";

export default async function Page({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return <AuthForm mode="login" initialError={error === "restricted" ? RESTRICTED : error === "oauth" ? "Não foi possível entrar com o Google. Tente novamente." : null} />;
}
