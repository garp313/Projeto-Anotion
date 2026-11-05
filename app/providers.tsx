"use client";
import { MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { Toaster } from "@/components/collab/Toaster";
import { saveErrorMessage, toast } from "@/lib/toast";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } },
    // Nenhuma gravação falha em silêncio: antes a tela só voltava ao valor anterior, sem explicar.
    mutationCache: new MutationCache({ onError: (e) => toast({ message: saveErrorMessage(e), tone: "error" }) }),
  }));
  return <QueryClientProvider client={client}>{children}<Toaster /></QueryClientProvider>;
}
