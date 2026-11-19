import { create } from "zustand";

type S = { open: boolean; toggle: () => void; setOpen: (open: boolean) => void };

/** Painel do assistente de IA, aberto pela barra lateral. */
export const useAssistant = create<S>()((set) => ({
  open: false,
  toggle: () => set((s) => ({ open: !s.open })),
  setOpen: (open) => set({ open }),
}));
