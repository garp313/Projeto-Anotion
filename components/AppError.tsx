"use client";

import { useEffect, useState } from "react";

const STALE = /ChunkLoadError|Loading (CSS )?chunk|dynamically imported module/i;
const KEY = "stale-reload";

/** Uma tentativa por vez: se o arquivo continuar faltando, recarregar em laço só esconderia o erro. */
function reloadOnce() {
  try {
    if (Date.now() - Number(sessionStorage.getItem(KEY)) < 30_000) return false;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch { return false; }
  location.reload();
  return true;
}

/**
 * Tela de erro do app. Aba aberta durante uma publicação pede arquivos que já não existem:
 * nesse caso recarrega sozinha. Nos demais, mostra o erro para a pessoa poder enviá-lo.
 * Estilo inline porque também aparece quando o layout, e com ele o CSS, não carregou.
 */
export function AppError({ error }: { error: Error & { digest?: string } }) {
  const stale = STALE.test(`${error.name} ${error.message}`);
  const [reloading, setReloading] = useState(stale);
  useEffect(() => {
    console.error(error);
    if (stale) setReloading(reloadOnce());
  }, [error, stale]);

  return (
    <div role="alert" style={{ maxWidth: 520, margin: "0 auto", padding: "15vh 16px", textAlign: "center", color: "var(--n-text, inherit)", fontSize: 14 }}>
      {reloading ? <p>Atualizando o app…</p> : (
        <>
          <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Não foi possível abrir esta tela</p>
          <p style={{ opacity: 0.7, marginBottom: 16 }}>Seus dados continuam salvos. Se o erro voltar depois de recarregar, envie o detalhe abaixo.</p>
          <button type="button" onClick={() => location.reload()}
            style={{ padding: "6px 14px", borderRadius: 6, border: 0, background: "#2383e2", color: "#fff", fontWeight: 500, cursor: "pointer" }}>Recarregar</button>
          <pre style={{ marginTop: 20, padding: 10, borderRadius: 6, fontSize: 11, opacity: 0.7, whiteSpace: "pre-wrap", wordBreak: "break-word", textAlign: "left", border: "1px solid rgba(128,128,128,.3)" }}>
            {error.message || error.name}{error.digest ? ` (${error.digest})` : ""}
          </pre>
        </>
      )}
    </div>
  );
}
