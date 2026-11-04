"use client";

import { useEffect, useState } from "react";
import { getCalendarEvents, CalendarEvent } from "@/lib/google/calendar";
import { Calendar as CalendarIcon, ExternalLink } from "lucide-react";

export function CalendarWidget() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getCalendarEvents()
      .then((data) => setEvents(data.slice(0, 5))) // Pega os 5 próximos eventos
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="p-3 text-xs text-[var(--n-text-faint)]">A carregar compromissos...</div>;
  }

  if (error) {
    return <div className="p-3 text-xs text-red-400">{error}</div>;
  }

  return (
    <div className="rounded-xl border border-[var(--n-border)] bg-[var(--n-bg-sidebar)]/30 p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-[var(--n-text)]">
        <CalendarIcon size={14} className="text-[var(--n-accent)]" />
        <span>Próximos Compromissos</span>
      </div>

      {events.length === 0 ? (
        <p className="text-xs text-[var(--n-text-faint)]">Nenhum evento agendado.</p>
      ) : (
        <div className="space-y-2">
          {events.map((evt) => {
            const startDate = evt.start.dateTime
              ? new Date(evt.start.dateTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
              : "Dia inteiro";

            return (
              <a
                key={evt.id}
                href={evt.htmlLink}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between rounded-md p-1.5 text-xs transition-colors hover:bg-[var(--n-hover)]"
              >
                <div>
                  <div className="font-medium text-[var(--n-text)]">{evt.summary}</div>
                  <div className="text-[10px] text-[var(--n-text-faint)]">{startDate}</div>
                </div>
                <ExternalLink size={12} className="text-[var(--n-text-faint)]" />
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}