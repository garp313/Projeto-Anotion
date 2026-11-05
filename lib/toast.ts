export type ToastAction = { label: string; run: () => void };
export type ToastInput = { message: string; tone?: "error" | "info"; action?: ToastAction };

const EVENT = "app-toast";

export const toast = (input: ToastInput) => window.dispatchEvent(new CustomEvent<ToastInput>(EVENT, { detail: input }));

export function onToast(fn: (t: ToastInput) => void) {
  const handler = (e: Event) => fn((e as CustomEvent<ToastInput>).detail);
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}

/** Mensagem para a pessoa: a falta de permissão pede outra ação que uma falha de rede. */
export const saveErrorMessage = (e: unknown) =>
  (e as { code?: string })?.code === "42501" ? "Você não tem permissão para editar aqui." : "Não foi possível salvar. Tente de novo.";
