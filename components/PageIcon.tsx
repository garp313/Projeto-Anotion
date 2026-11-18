"use client";
import { useState } from "react";

/** Ícone de página: um emoji ou o endereço de uma imagem enviada. */
export const isImageIcon = (icon?: string | null): icon is string => Boolean(icon && /^(https?:\/\/|\/)/.test(icon));

/** Texto do ícone para lugares que só aceitam texto (título exportado, arrastar): imagem não entra. */
export const iconText = (icon?: string | null) => (icon && !isImageIcon(icon) ? icon : "");

/** Mostra o ícone no tamanho da fonte em volta, como um emoji. Imagem que não carrega vira 📄. */
export function PageIcon({ icon, className = "" }: { icon?: string | null; className?: string }) {
  const [broken, setBroken] = useState<string | null>(null);
  if (!icon) return null;
  if (isImageIcon(icon) && broken !== icon) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={icon} alt="" draggable={false} onError={() => setBroken(icon)}
      className={`inline-block h-[1.1em] w-[1.1em] shrink-0 rounded-[3px] object-cover align-[-0.15em] ${className}`} />;
  }
  return <span className={className}>{isImageIcon(icon) ? "📄" : icon}</span>;
}
