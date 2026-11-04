"use client";
import { useEffect, useState } from "react";
import * as Menu from "@radix-ui/react-dropdown-menu";
import { ChevronsUpDown, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function WorkspaceSwitcher({ name = "Workspace" }: { name?: string }) {
  const router = useRouter();
  const [account, setAccount] = useState<string | null>(null);
  useEffect(() => {
    createClient().auth.getSession().then(({ data }) => setAccount(data.session?.user.email ?? null));
  }, []);
  async function signOut() {
    await createClient().auth.signOut();
    router.push("/login"); router.refresh();
  }
  return (
    <Menu.Root>
      <Menu.Trigger className="flex h-[38px] w-full items-center gap-2 rounded px-2 text-left text-sm font-medium hover:bg-[var(--n-hover)]">
        <span className="grid h-5 w-5 shrink-0 place-items-center rounded bg-[var(--n-active)] text-xs font-semibold">{name[0]?.toUpperCase()}</span>
        {/* O nome é do time: sem a conta aqui, todos pareciam logados como o dono do workspace. */}
        <span className="min-w-0">
          <span className="block truncate">{name}</span>
          {account && <span title={account} aria-label="Conta logada" className="block truncate text-[11px] font-normal text-[var(--n-text-faint)]">{account}</span>}
        </span>
        <ChevronsUpDown size={12} className="ml-auto text-[var(--n-text-faint)]" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content align="start" sideOffset={4} className="z-50 min-w-[220px] rounded-md border border-[var(--n-border)] bg-[var(--n-bg)] p-1 text-sm shadow-lg">
          <Menu.Item onSelect={signOut} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 outline-none data-[highlighted]:bg-[var(--n-hover)]">
            <LogOut size={14} /> Sair
          </Menu.Item>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
