import "./globals.css";
import type { Metadata } from "next";
import { Providers } from "./providers";

const THEME_SCRIPT = `try{var t=localStorage.getItem("theme");if(t!=="light"&&t!=="dark")t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme="light"}`;

export const metadata: Metadata = { title: "Notion Clone" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        {/* Antes da pintura: sem isso a tela piscaria no tema errado. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body><Providers>{children}</Providers></body>
    </html>
  );
}
