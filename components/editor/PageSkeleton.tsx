/** Feedback imediato enquanto a próxima página carrega. */
export function PageSkeleton() {
  return (
    <div role="status" aria-label="Carregando">
      <div className="n-progress fixed inset-x-0 top-0 z-[90] h-0.5" />
      <div className="mx-auto w-full max-w-[900px] animate-pulse space-y-4 px-6 pt-24 sm:px-24">
        <div className="h-10 w-2/3 rounded bg-[var(--n-hover)]" />
        <div className="h-4 w-full rounded bg-[var(--n-hover)]" />
        <div className="h-4 w-5/6 rounded bg-[var(--n-hover)]" />
        <div className="h-4 w-3/4 rounded bg-[var(--n-hover)]" />
      </div>
    </div>
  );
}
