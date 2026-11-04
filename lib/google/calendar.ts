import { createClient } from "@/lib/supabase/client";

export type CalendarEvent = {
  id: string;
  summary: string;
  description?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  htmlLink: string;
};

export async function getCalendarEvents(): Promise<CalendarEvent[]> {
  const supabase = createClient();
  
  // Obter o token de acesso exclusivo da Google
  const { data: { session } } = await supabase.auth.getSession();
  const providerToken = session?.provider_token;

  if (!providerToken) {
    throw new Error("Sessão expirada ou sem permissões da Google. Faça login novamente.");
  }

  // Fazer a chamada à API oficial do Google Calendar
  const response = await fetch(
    "https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=" +
      new Date().toISOString() +
      "&orderBy=startTime&singleEvents=true",
    {
      headers: {
        Authorization: `Bearer ${providerToken}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error("Erro ao obter eventos da Google Agenda.");
  }

  const data = await response.json();
  return data.items || [];
}