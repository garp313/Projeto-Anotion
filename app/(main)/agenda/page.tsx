import { Agenda } from "@/components/agenda/Agenda";

export default async function Page({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date } = await searchParams;
  return <Agenda key={date} initialDate={date} />;
}
