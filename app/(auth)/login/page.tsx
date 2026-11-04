import { AuthForm } from "../AuthForm";

export default async function Page({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return <AuthForm mode="login" initialError={error === "oauth" ? "Não foi possível entrar com o Google. Tente novamente." : null} />;
}
