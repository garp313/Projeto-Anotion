"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { LogOut, Plus, Trash2 } from "lucide-react";
import { createBrowserClient } from "@supabase/ssr";

export type PageItem = {
  id: string;
  title: string;
  icon?: string | null;
};

// Lista de páginas iniciais simuladas
const INITIAL_PAGES: PageItem[] = [
  { id: "1", title: "Projetos", icon: "💼" },
  { id: "2", title: "Planejamento Logístico", icon: "🦺" },
  { id: "3", title: "Atividades", icon: "🔖" },
];

export function Sidebar() {
  const params = useParams();
  const router = useRouter();
  const activeId = params?.pageId as string;

  // Estado que guarda as páginas da barra lateral
  const [pages, setPages] = useState<PageItem[]>(INITIAL_PAGES);

  // Função para criar uma nova aba/página
  const handleAddPage = () => {
    const newId = crypto.randomUUID(); // Gera um ID único
    const newPage = { id: newId, title: "Nova Página", icon: "📄" };
    
    setPages((prev) => [...prev, newPage]);
    
    // Redireciona automaticamente para a aba recém-criada
    router.push(`/workspace/${newId}`);
  };

  // Função para excluir uma aba/página
  const handleDeletePage = (id: string) => {
    if (!confirm("Tem certeza que deseja excluir esta página?")) return;
    
    setPages((prev) => prev.filter((p) => p.id !== id));
    
    // Se estiver a excluir a página que está aberta, volta para a primeira
    if (activeId === id && pages.length > 1) {
      const firstPage = pages.find((p) => p.id !== id);
      if (firstPage) router.push(`/workspace/${firstPage.id}`);
    }
  };

  const handleLogout = async () => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <aside className="w-64 h-full bg-[var(--n-bg-sidebar)] border-r border-[var(--n-border)] p-3 flex flex-col justify-between select-none">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between px-2 py-1 text-xs font-semibold text-[var(--n-text-faint)] uppercase tracking-wider">
          <span>Páginas</span>
          {/* BOTÃO + AGORA FUNCIONA */}
          <button
            onClick={handleAddPage}
            className="p-1 rounded hover:bg-[var(--n-hover)] text-[var(--n-text)] transition-colors"
            title="Criar nova aba/página"
          >
            <Plus size={14} />
          </button>
        </div>

        <nav className="flex flex-col gap-0.5">
          {pages.map((item) => {
            const isActive = item.id === activeId;
            return (
              <div key={item.id} className="group relative flex items-center">
                <Link
                  href={`/workspace/${item.id}`}
                  className={`flex-1 flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                    isActive
                      ? "bg-[var(--n-hover)] text-[var(--n-text)] font-semibold"
                      : "text-[var(--n-text-muted)] hover:bg-[var(--n-hover)] hover:text-[var(--n-text)]"
                  }`}
                >
                  <span>{item.icon || "📄"}</span>
                  <span className="truncate">{item.title || "Sem título"}</span>
                </Link>

                {/* BOTÃO DE LIXO PARA EXCLUIR */}
                <button
                  onClick={(e) => {
                    e.preventDefault(); // Evita que o clique navegue para a página
                    handleDeletePage(item.id);
                  }}
                  className="absolute right-2 opacity-0 group-hover:opacity-100 p-1 bg-[var(--n-bg-sidebar)] text-[var(--n-text-faint)] hover:text-red-400 rounded transition-opacity"
                  title="Excluir aba"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            );
          })}
        </nav>
      </div>

      <div className="border-t border-[var(--n-border)] pt-2">
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium text-red-400 hover:bg-[var(--n-hover)] transition-colors"
        >
          <LogOut size={14} />
          <span>Sair da conta</span>
        </button>
      </div>
    </aside>
  );
}

export default Sidebar;