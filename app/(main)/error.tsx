"use client";

import { AppError } from "@/components/AppError";

export default function Error({ error }: { error: Error & { digest?: string } }) {
  return <AppError error={error} />;
}
