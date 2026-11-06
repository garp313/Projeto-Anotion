"use client";

import { AppError } from "@/components/AppError";

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  return <html lang="pt-BR"><body><AppError error={error} /></body></html>;
}
