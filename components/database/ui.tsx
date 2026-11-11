"use client";
import { useState } from "react";
import * as P from "@radix-ui/react-popover";
import {
  AlignLeft, AtSign, Calendar, CheckSquare, CircleDot, Clock, FileText, Fingerprint, Hash, Link2, List, Mail, Paperclip,
  Phone, Search, Sigma, Tag, User, UserCog, ArrowUpRight, ListChecks, ChevronDown,
} from "lucide-react";
import type { PropType, SelectOption } from "./types";

export function Pop({
  trigger, children, align = "start", width = 260, open, onOpenChange, triggerClass,
}: {
  trigger: React.ReactNode; children: React.ReactNode; align?: "start" | "center" | "end"; width?: number;
  open?: boolean; onOpenChange?: (o: boolean) => void; triggerClass?: string;
}) {
  return (
    <P.Root open={open} onOpenChange={onOpenChange}>
      <P.Trigger className={triggerClass}>{trigger}</P.Trigger>
      <P.Portal>
        <P.Content
          align={align} sideOffset={4} collisionPadding={12}
          style={{ width, maxWidth: "calc(100vw - 24px)", maxHeight: "min(70vh, var(--radix-popover-content-available-height))" }}
          // Um seletor aberto dentro de outro menu vive em outro portal: mexer nele não é "clicar fora".
          onInteractOutside={(e) => {
            if ((e.target as Element | null)?.closest?.("[data-radix-popper-content-wrapper]")) e.preventDefault();
          }}
          className="n-scroll z-[70] overflow-y-auto rounded-lg border border-[var(--n-border)] bg-[var(--n-bg)] p-1 text-sm text-[var(--n-text)] shadow-xl"
        >
          {children}
        </P.Content>
      </P.Portal>
    </P.Root>
  );
}

export const menuItem =
  "flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-[var(--n-hover)]";
export const fieldClass =
  "w-full rounded border border-[var(--n-border)] bg-transparent px-2 py-1 text-sm outline-none focus:border-[var(--n-accent)]";
export const toolbarBtn =
  "flex items-center gap-1 rounded px-1.5 py-1 text-xs text-[var(--n-text-muted)] hover:bg-[var(--n-hover)]";

export const OptionTag = ({ option }: { option: Pick<SelectOption, "value" | "color"> }) => (
  <span title={option.value} className={`inline-block max-w-full truncate rounded px-1.5 py-0.5 text-xs font-medium leading-4 ${option.color}`}>
    {option.value}
  </span>
);

/** Seletor no padrão visual do app, no lugar do <select> nativo. */
export function Choice<T extends string>({ value, options, onChange, label, width = 180, plain = false }: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string; width?: number;
  /** Sem borda, para ficar dentro de uma pílula. */
  plain?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Pop open={open} onOpenChange={setOpen} width={width}
      triggerClass={plain
        ? "flex min-w-0 max-w-[180px] items-center gap-0.5 rounded px-1 py-0.5 text-xs hover:bg-[var(--n-active)]"
        : "flex min-w-0 items-center gap-1 rounded border border-[var(--n-border)] px-1.5 py-1 text-xs hover:bg-[var(--n-hover)]"}
      trigger={<><span aria-label={label} className="truncate">{options.find((o) => o.value === value)?.label ?? "Escolha…"}</span><ChevronDown size={11} className="shrink-0" /></>}>
      {options.map((o) => (
        <button key={o.value} type="button" className={menuItem} onClick={() => { onChange(o.value); setOpen(false); }}>
          <span className="truncate">{o.label}</span>
        </button>
      ))}
    </Pop>
  );
}

const ICONS: Record<PropType, typeof Tag> = {
  title: FileText, text: AlignLeft, number: Hash, select: CircleDot, multi_select: List, status: Tag, date: Calendar,
  person: User, files: Paperclip, checkbox: CheckSquare, url: Link2, email: AtSign, phone: Phone, formula: Sigma,
  relation: ArrowUpRight, rollup: Search, created_time: Clock, created_by: User, last_edited_time: Clock,
  last_edited_by: UserCog, unique_id: Fingerprint, checklist: ListChecks,
};
export const PropIcon = ({ type, size = 14 }: { type: PropType; size?: number }) => {
  const I = ICONS[type] ?? Mail;
  return <I size={size} className="shrink-0 text-[var(--n-text-faint)]" />;
};

const UUID = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\/([A-Za-z0-9_-]+))?/i;

/** ID de banco é o id da página; o de coluna leva o banco junto ("banco/coluna"), para valer sozinho em qualquer lugar. */
export const columnRef = (databaseId: string, columnId: string) => `${databaseId}/${columnId}`;

/** Lê um ID colado: aceita o ID puro, "banco/coluna" ou até o link da página. */
export function parseRef(text: string): { id: string; column?: string } | null {
  const m = UUID.exec(text.trim());
  return m ? { id: m[1].toLowerCase(), column: m[2] } : null;
}

/** Item de menu que copia um ID e confirma ali mesmo. */
export function CopyIdItem({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState<"ok" | "fail" | null>(null);
  return (
    <button type="button" className={menuItem} title={value}
      onClick={async () => {
        try { await navigator.clipboard.writeText(value); setDone("ok"); } catch { setDone("fail"); }
        setTimeout(() => setDone(null), 1800);
      }}>
      <Fingerprint size={14} />
      <span className="min-w-0 flex-1 truncate">{done === "ok" ? "ID copiado!" : done === "fail" ? value : label}</span>
    </button>
  );
}
