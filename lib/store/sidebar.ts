import { create } from "zustand";
import { persist } from "zustand/middleware";

type S = {
  collapsed: boolean;
  width: number;
  toggle: () => void;
  setWidth: (w: number) => void;
};

export const useSidebar = create<S>()(
  persist(
    (set) => ({
      collapsed: false,
      width: 260,
      toggle: () => set((s) => ({ collapsed: !s.collapsed })),
      setWidth: (w) => set({ width: Math.min(480, Math.max(220, w)) }),
    }),
    { name: "sidebar" }
  )
);
