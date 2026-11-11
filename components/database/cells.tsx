"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { DatePicker } from "./DatePicker";
import { AlertTriangle, Check, ExternalLink, FileUp, Link2, Plus, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { ChecklistItem, ColumnSchema, DatabaseRow, FileValue, PersonValue, SelectOption, StatusGroup } from "./types";
import { COLORS, READ_ONLY, newId } from "./types";
import { asDate, displayText, dueTone, formatDateValue, formatNumber, rawValue, relatedLabel } from "./values";
import type { Db } from "./useDatabase";
import { OptionTag, Pop, fieldClass, menuItem } from "./ui";

type CellProps = { col: ColumnSchema; row: DatabaseRow; db: Db; compact?: boolean; autoFocus?: boolean; dense?: boolean };

const cellBox = "block min-h-[30px] w-full min-w-0 overflow-hidden px-2 py-1 text-left text-sm";
// Na tabela, "Vazio" só aparece ao passar o mouse: repetido em toda linha, poluía a leitura.
const Empty = ({ compact, dense }: { compact?: boolean; dense?: boolean }) =>
  compact ? null : <span className={`text-[var(--n-text-faint)] ${dense ? "opacity-0 group-hover:opacity-100" : ""}`}>Vazio</span>;

/** Cor fixa por nome: letras iguais em cinza não permitiam distinguir as pessoas. */
export const avatarColor = (name: string) => {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) % 360;
  return `hsl(${hash} 45% 42%)`;
};

/** Texto, número, URL, e-mail e telefone: edita localmente e grava ao sair do campo. */
function TextField({ col, row, db, compact, dense }: CellProps) {
  const stored = rawValue(col, row, db.ctx);
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? (stored ?? "");
  const type = col.type === "number" ? "number" : "text";

  const commit = () => {
    if (draft === null) return;
    const next = col.type === "number" ? (draft === "" ? null : Number(draft)) : draft;
    if (next !== (stored ?? (col.type === "number" ? null : ""))) db.setValue(row.id, col.id, next);
    setDraft(null);
  };

  const href = !stored ? null
    : col.type === "url" ? (/^https?:\/\//.test(stored) ? stored : `https://${stored}`)
    : col.type === "email" ? `mailto:${stored}`
    : col.type === "phone" ? `tel:${stored}` : null;

  if (col.type === "number" && draft === null) {
    return (
      <button type="button" onClick={() => setDraft(String(stored ?? ""))} className={`${cellBox} ${compact ? "" : "text-right"}`}>
        {stored === null || stored === undefined ? <Empty compact={compact} dense={dense} /> : formatNumber(stored, col.numberFormat)}
      </button>
    );
  }
  return (
    <div className="group/cell relative flex items-center">
      <input
        type={type} value={value} autoFocus={col.type === "number"} aria-label={col.name}
        placeholder={compact || dense ? "" : "Vazio"}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") { setDraft(null); e.currentTarget.blur(); }
        }}
        className={`${cellBox} bg-transparent outline-none placeholder:text-[var(--n-text-faint)] ${href ? "text-[var(--n-accent)] underline" : ""}`}
      />
      {href && (
        <a href={href} target="_blank" rel="noreferrer" aria-label="Abrir"
          className="absolute right-1 rounded p-0.5 opacity-0 hover:bg-[var(--n-hover)] group-hover/cell:opacity-100">
          <ExternalLink size={12} />
        </a>
      )}
    </div>
  );
}

const GROUP_LABEL: Record<StatusGroup, string> = { todo: "A fazer", in_progress: "Em andamento", complete: "Concluído" };

function SelectField({ col, row, db, compact, dense }: CellProps) {
  const multi = col.type === "multi_select";
  const raw = rawValue(col, row, db.ctx);
  const selected: string[] = multi ? raw ?? [] : raw ? [raw] : [];
  const options = col.options ?? [];
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const shown = options.filter((o) => o.value.toLowerCase().includes(q.trim().toLowerCase()));
  const canCreate = q.trim() && !options.some((o) => o.value.toLowerCase() === q.trim().toLowerCase());
  const current = options.filter((o) => selected.includes(o.id) || selected.includes(o.value));

  const toggle = (o: SelectOption) => {
    if (multi) {
      db.setValue(row.id, col.id, selected.includes(o.id) ? selected.filter((x) => x !== o.id) : [...selected, o.id]);
    } else {
      db.setValue(row.id, col.id, selected.includes(o.id) ? null : o.id);
      setOpen(false);
    }
    setQ("");
  };
  const create = () => {
    const o: SelectOption = {
      id: newId("o_"), value: q.trim(), color: COLORS[(options.length + 1) % COLORS.length].cls,
      ...(col.type === "status" ? { group: "todo" as const } : {}),
    };
    void db.saveColumn({ ...col, options: [...options, o] });
    toggle(o);
  };

  const item = (o: SelectOption) => (
    <button key={o.id} type="button" onClick={() => toggle(o)} className={menuItem}>
      <OptionTag option={o} />
      {selected.includes(o.id) && <Check size={14} className="ml-auto" />}
    </button>
  );

  return (
    <Pop
      open={open} onOpenChange={setOpen} triggerClass={cellBox}
      trigger={current.length
        ? <span className={`flex min-w-0 gap-1 ${dense ? "overflow-hidden" : "flex-wrap"}`}>{current.map((o) => <OptionTag key={o.id} option={o} />)}</span>
        : <Empty compact={compact} dense={dense} />}
    >
      <input
        autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar ou criar opção…" className={`${fieldClass} mb-1`}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          if (canCreate) create(); else if (shown[0]) toggle(shown[0]);
        }}
      />
      {col.type === "status"
        ? (["todo", "in_progress", "complete"] as StatusGroup[]).map((g) => {
            const list = shown.filter((o) => (o.group ?? "todo") === g);
            return list.length ? (
              <div key={g}>
                <p className="px-2 pb-0.5 pt-1.5 text-[11px] text-[var(--n-text-faint)]">{GROUP_LABEL[g]}</p>
                {list.map(item)}
              </div>
            ) : null;
          })
        : shown.map(item)}
      {canCreate && (
        <button type="button" onClick={create} className={menuItem}>
          <Plus size={14} /> Criar <OptionTag option={{ value: q.trim(), color: COLORS[0].cls }} />
        </button>
      )}
    </Pop>
  );
}

function DateField({ col, row, db, compact, dense }: CellProps) {
  const value = asDate(rawValue(col, row, db.ctx));
  const [open, setOpen] = useState(false);
  return (
    <Pop open={open} onOpenChange={setOpen} triggerClass={cellBox} width={280}
      trigger={value ? <span title={formatDateValue(value)} className={`block truncate ${dueTone(col, row, db.ctx)}`}>{formatDateValue(value)}</span> : <Empty compact={compact} dense={dense} />}>
      <DatePicker value={value} onChange={(v) => db.setValue(row.id, col.id, v)} onDone={() => setOpen(false)} />
    </Pop>
  );
}

function PersonField({ col, row, db, compact, dense }: CellProps) {
  const people: PersonValue[] = rawValue(col, row, db.ctx) ?? [];
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const known = useMemo(() => {
    const map = new Map<string, PersonValue>();
    if (db.me) map.set(db.me.label, { id: db.me.id, name: db.me.label });
    for (const m of db.members) { const name = m.name || m.email; if (!map.has(name)) map.set(name, { id: m.id, name }); }
    for (const r of db.rows) for (const p of Array.isArray(r.row_properties?.[col.id]) ? r.row_properties[col.id] : []) map.set(p.name, p);
    return [...map.values()];
  }, [db.rows, db.me, db.members, col.id]);
  const has = (p: PersonValue) => people.some((x) => x.name === p.name);
  const toggle = (p: PersonValue) => {
    db.setValue(row.id, col.id, has(p) ? people.filter((x) => x.name !== p.name) : [...people, p]);
    setQ("");
    setOpen(false);
  };
  const shown = known.filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase()));
  const avatar = (name: string) => (
    <span style={{ background: avatarColor(name) }} className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-medium uppercase text-white">{name[0]}</span>
  );
  return (
    <Pop
      open={open} onOpenChange={setOpen} triggerClass={cellBox}
      trigger={dense && people.length > 1
        // Vários responsáveis numa linha só: o nome de todos deixava a linha muito mais alta.
        ? <span title={people.map((p) => p.name).join(", ")} className="flex items-center">
            {people.slice(0, 3).map((p, i) => <span key={p.name} className={i ? "-ml-1.5 rounded-full ring-2 ring-[var(--n-bg)]" : "rounded-full ring-2 ring-[var(--n-bg)]"}>{avatar(p.name)}</span>)}
            {people.length > 3 && <span className="ml-1 text-xs text-[var(--n-text-muted)]">+{people.length - 3}</span>}
          </span>
        : people.length
        ? <span className="flex min-w-0 flex-wrap gap-1.5">{people.map((p) => <span key={p.name} title={p.name} className="flex min-w-0 max-w-full items-center gap-1">{avatar(p.name)}<span className="min-w-0 truncate">{p.name}</span></span>)}</span>
        : <Empty compact={compact} dense={dense} />}
    >
      <input
        autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome ou e-mail…" className={`${fieldClass} mb-1`}
        onKeyDown={(e) => { if (e.key === "Enter" && q.trim()) { e.preventDefault(); toggle(shown[0] ?? { name: q.trim() }); } }}
      />
      {shown.map((p) => (
        <button key={p.name} type="button" onClick={() => toggle(p)} className={menuItem}>
          {avatar(p.name)} <span className="truncate">{p.name}</span>
          {has(p) && <Check size={14} className="ml-auto" />}
        </button>
      ))}
      {q.trim() && !known.some((p) => p.name === q.trim()) && (
        <button type="button" onClick={() => toggle({ name: q.trim() })} className={menuItem}><Plus size={14} /> Adicionar “{q.trim()}”</button>
      )}
    </Pop>
  );
}

function FilesField({ col, row, db, compact, dense }: CellProps) {
  const files: FileValue[] = rawValue(col, row, db.ctx) ?? [];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState("");
  const input = useRef<HTMLInputElement>(null);

  async function upload(list: FileList | null) {
    if (!list?.length || !db.me) return;
    setBusy(true); setError(null);
    const supabase = createClient();
    const added: FileValue[] = [];
    for (const f of Array.from(list)) {
      const path = `${db.me.id}/${newId()}-${f.name.replace(/[^\w.-]+/g, "_")}`;
      const { error } = await supabase.storage.from("files").upload(path, f);
      if (error) { setError(error.message); continue; }
      added.push({ name: f.name, path });
    }
    if (added.length) db.setValue(row.id, col.id, [...files, ...added]);
    setBusy(false);
  }
  async function open(f: FileValue) {
    if (f.url) return void window.open(f.url, "_blank", "noopener");
    const { data, error } = await createClient().storage.from("files").createSignedUrl(f.path!, 300);
    if (error) return setError(error.message);
    window.open(data.signedUrl, "_blank", "noopener");
  }
  function remove(f: FileValue) {
    if (f.path) void createClient().storage.from("files").remove([f.path]);
    db.setValue(row.id, col.id, files.filter((x) => x !== f));
  }
  return (
    <Pop triggerClass={cellBox} width={300}
      trigger={files.length
        ? <span className="flex flex-wrap gap-1">{files.map((f) => <span key={f.name} className="truncate rounded bg-[var(--n-hover)] px-1.5 text-xs">{f.name}</span>)}</span>
        : <Empty compact={compact} dense={dense} />}>
      {files.map((f) => (
        <div key={f.name} className="flex items-center gap-1">
          <button type="button" onClick={() => open(f)} className={`${menuItem} min-w-0 flex-1`}><span className="truncate">{f.name}</span></button>
          <button type="button" aria-label={`Remover ${f.name}`} onClick={() => remove(f)} className="rounded p-1 hover:bg-[var(--n-hover)]"><X size={13} /></button>
        </div>
      ))}
      <input ref={input} type="file" multiple hidden onChange={(e) => upload(e.target.files)} />
      <button type="button" disabled={busy} onClick={() => input.current?.click()} className={menuItem}>
        <FileUp size={14} /> {busy ? "Enviando…" : "Enviar arquivo"}
      </button>
      <div className="flex items-center gap-1 p-1">
        <Link2 size={14} className="shrink-0 text-[var(--n-text-faint)]" />
        <input
          value={link} onChange={(e) => setLink(e.target.value)} placeholder="Colar link e Enter" className={fieldClass}
          onKeyDown={(e) => {
            if (e.key !== "Enter" || !link.trim()) return;
            e.preventDefault();
            const url = link.trim();
            db.setValue(row.id, col.id, [...files, { name: url.replace(/^https?:\/\//, "").slice(0, 40), url }]);
            setLink("");
          }}
        />
      </div>
      {error && <p role="alert" className="px-2 py-1 text-xs text-red-500">{error}</p>}
    </Pop>
  );
}

type TreePage = { id: string; title: string; icon: string | null; is_database: boolean; parent_id: string | null };

/** Bancos para escolher. Lê do que já está carregado: esta célula se repete em toda linha. */
function databasesFor(qc: ReturnType<typeof useQueryClient>) {
  const all = qc.getQueryData<TreePage[]>(["pages"]) ?? [];
  const ids = new Set(all.filter((p) => p.is_database).map((p) => p.id));
  return all.filter((p) => p.is_database && !(p.parent_id && ids.has(p.parent_id)));
}

const MAX_CHIPS = 12;
/** Tipos que a relação mostra com a mesma cara da coluna de origem; os de texto já saem idênticos como texto. */
const LOOKS_SAME = new Set(["select", "status", "multi_select", "person", "checkbox"]);

/** O banco ligado foi excluído: sem isto o campo só dizia "Nenhuma página encontrada" e parecia quebrado. */
function MissingRelation({ col, db, compact }: Pick<CellProps, "col" | "db" | "compact">) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const options = databasesFor(qc).filter((d) => d.id !== col.relationDatabaseId);
  return (
    <Pop triggerClass={cellBox} width={280}
      trigger={<span className="flex min-w-0 items-center gap-1 text-xs text-orange-600"><AlertTriangle size={12} className="shrink-0" /><span className="truncate">{compact ? "Banco excluído" : "Banco relacionado excluído — escolha outro"}</span></span>}>
      <p role="alert" className="px-2 py-1 text-xs text-orange-600">Banco relacionado excluído — escolha outro banco para “{col.name}”:</p>
      {options.map((d) => (
        <button key={d.id} type="button" disabled={busy} className={`${menuItem} disabled:opacity-60`}
          onClick={async () => { setBusy(true); try { await db.linkRelation(col, d.id); } finally { setBusy(false); } }}>
          <span className="truncate">{d.icon} {d.title || "Sem título"}</span>
        </button>
      ))}
      {!options.length && <p className="px-2 py-1 text-xs text-[var(--n-text-faint)]">Não há outro banco neste espaço de trabalho.</p>}
    </Pop>
  );
}

function RelationField({ col, row, db, compact, dense }: CellProps) {
  const router = useRouter();
  const ids: string[] = rawValue(col, row, db.ctx) ?? [];
  const target = col.relationDatabaseId ? db.ctx.related[col.relationDatabaseId] : undefined;
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [changing, setChanging] = useState(false);
  const [picked, setPicked] = useState<{ id: string; title: string } | null>(null);
  const qc = useQueryClient();
  if (!target) return <span className={`${cellBox} text-[var(--n-text-faint)]`}>{compact ? "" : "Escolha o banco de destino"}</span>;
  if (target.missing) return <MissingRelation col={col} db={db} compact={compact || dense} />;
  const label = (r: DatabaseRow) => relatedLabel(col, r, db.ctx);
  // Coluna mostrada do tipo etiqueta ou pessoa: aparece igual à do banco de origem, com as mesmas cores.
  const showCol = col.relationShowProp ? target.schema.find((c) => c.id === col.relationShowProp) : undefined;
  const there = showCol && LOOKS_SAME.has(showCol.type) ? { ...db, ctx: { ...db.ctx, schema: target.schema } } : null;
  const look = (r: DatabaseRow) => {
    const v = there && showCol ? rawValue(showCol, r, there.ctx) : null;
    return there && showCol && !(v == null || v === "" || (Array.isArray(v) && !v.length))
      ? <PropertyPreview col={showCol} row={r} db={there} />
      : null;
  };
  const needle = q.trim().toLowerCase();
  // Busca pelo nome e pela coluna mostrada: quem escolheu "Atribuir" procura pela pessoa.
  const shown = target.rows.filter((r) => `${r.title} ${label(r)}`.toLowerCase().includes(needle)).slice(0, 50);
  const chosen = target.rows.filter((r) => ids.includes(r.id));
  const typed = q.trim();
  const createNew = async () => {
    setBusy(true);
    try {
      const id = await db.createRelated(col.relationDatabaseId!, typed);
      db.setValue(row.id, col.id, [...ids, id]);
      setQ("");
    } finally { setBusy(false); }
  };
  return (
    <Pop triggerClass={cellBox}
      trigger={there && chosen.length
        ? <span title={chosen.map(label).join(", ")} className={`flex min-w-0 items-center gap-1 ${dense ? "overflow-hidden" : "flex-wrap"}`}>
            {chosen.slice(0, MAX_CHIPS).map((r) => (
              <span key={r.id} role="link" onClick={(e) => { e.stopPropagation(); e.preventDefault(); router.push(`/workspace/${r.id}`); }}
                className="min-w-0 shrink-0 cursor-pointer hover:opacity-80">
                {look(r) ?? <span className="rounded bg-[var(--n-hover)] px-1.5 text-sm">{label(r)}</span>}
              </span>
            ))}
            {chosen.length > MAX_CHIPS && <span className="text-sm text-[var(--n-text-muted)]">+{chosen.length - MAX_CHIPS}</span>}
          </span>
        : dense && chosen.length > 1
        // Na tabela, os nomes por escrito numa linha; a lista inteira aparece ao parar o mouse.
        ? <span title={chosen.map(label).join(", ")} className="block min-w-0 truncate text-sm">{chosen.map(label).join(", ")}</span>
        : chosen.length
        ? <span className={`flex min-w-0 gap-1 ${dense ? "overflow-hidden" : "flex-wrap"}`}>
            {chosen.slice(0, MAX_CHIPS).map((r) => (
              <span key={r.id} role="link" title={label(r)}
                onClick={(e) => { e.stopPropagation(); e.preventDefault(); router.push(`/workspace/${r.id}`); }}
                className="min-w-0 max-w-full shrink-0 cursor-pointer truncate rounded bg-[var(--n-hover)] px-1.5 text-sm hover:bg-[var(--n-active)]">{label(r)}</span>
            ))}
            {/* Mais que isso empurrava o resto da página para baixo. */}
            {chosen.length > MAX_CHIPS && <span className="text-sm text-[var(--n-text-muted)]">+{chosen.length - MAX_CHIPS}</span>}
          </span>
        : <Empty compact={compact} dense={dense} />}>
      <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar ou criar…" className={`${fieldClass} mb-1`}
        onKeyDown={(e) => { if (e.key === "Enter" && typed && !shown.length) { e.preventDefault(); void createNew(); } }} />
      {shown.map((r) => (
        <button key={r.id} type="button" className={menuItem}
          onClick={() => db.setValue(row.id, col.id, ids.includes(r.id) ? ids.filter((x) => x !== r.id) : [...ids, r.id])}>
          <span className="min-w-0 truncate">{look(r) ?? <>{r.icon} {label(r)}</>}</span>
          {label(r) !== (r.title || "Sem título") && <span className="min-w-0 shrink truncate text-xs text-[var(--n-text-faint)]">{r.title}</span>}
          {ids.includes(r.id) && <Check size={14} className="ml-auto shrink-0" />}
        </button>
      ))}
      {!shown.length && !typed && <p className="px-2 py-1 text-xs text-[var(--n-text-faint)]">Nenhuma página encontrada neste banco.</p>}
      <button type="button" disabled={busy || !typed} onClick={createNew} className={`${menuItem} disabled:opacity-60`}>
        <Plus size={14} /> {typed ? <span className="truncate">Criar “{typed}”</span> : <span>Digite um nome para criar novo</span>}
      </button>
      <div className="mt-1 border-t border-[var(--n-border)] pt-1 text-xs text-[var(--n-text-muted)]">
        {!changing ? (
          <p className="flex items-center gap-1 px-2 py-0.5">
            <span className="min-w-0 flex-1 truncate">Busca em: {databasesFor(qc).find((d) => d.id === col.relationDatabaseId)?.title || "banco"}</span>
            <button type="button" onClick={() => setChanging(true)} className="shrink-0 text-[var(--n-accent)] hover:underline">Trocar banco</button>
          </p>
        ) : picked ? (
          <div className="px-2 py-1">
            <p className="mb-1">Buscar em “{picked.title}”? Vínculos deste campo com o banco atual deixam de valer.</p>
            <div className="flex gap-1">
              <button type="button" disabled={busy} className="rounded bg-[var(--n-accent)] px-2 py-0.5 font-medium text-white disabled:opacity-60"
                onClick={async () => { setBusy(true); try { await db.linkRelation(col, picked.id); } finally { setBusy(false); setPicked(null); setChanging(false); } }}>Trocar</button>
              <button type="button" className="rounded px-2 py-0.5 hover:bg-[var(--n-hover)]" onClick={() => setPicked(null)}>Cancelar</button>
            </div>
          </div>
        ) : databasesFor(qc).filter((d) => d.id !== col.relationDatabaseId).map((d) => (
          <button key={d.id} type="button" className={menuItem} onClick={() => setPicked({ id: d.id, title: d.title || "Sem título" })}>
            <span className="truncate">{d.icon} {d.title || "Sem título"}</span>
          </button>
        ))}
      </div>
    </Pop>
  );
}

export function ChecklistProgress({ items }: { items: ChecklistItem[] }) {
  const done = items.filter((i) => i.done).length;
  return (
    <span className="flex w-full max-w-[160px] items-center gap-1.5">
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--n-active)]">
        <span className="block h-full bg-green-500" style={{ width: `${items.length ? (done / items.length) * 100 : 0}%` }} />
      </span>
      <span className="text-xs text-[var(--n-text-muted)]">{done}/{items.length}</span>
    </span>
  );
}

function ChecklistField({ col, row, db, compact, dense }: CellProps) {
  const items: ChecklistItem[] = rawValue(col, row, db.ctx) ?? [];
  const [text, setText] = useState("");
  const write = (next: ChecklistItem[]) => db.setValue(row.id, col.id, next);
  return (
    <Pop triggerClass={cellBox} width={300} trigger={items.length ? <ChecklistProgress items={items} /> : <Empty compact={compact} dense={dense} />}>
      {items.map((it) => (
        <div key={it.id} className="flex items-center gap-1">
          <label className={`${menuItem} min-w-0 flex-1`}>
            <input type="checkbox" checked={it.done} className="accent-[var(--n-accent)]"
              onChange={(e) => write(items.map((x) => (x.id === it.id ? { ...x, done: e.target.checked } : x)))} />
            <span className={`truncate ${it.done ? "text-[var(--n-text-faint)] line-through" : ""}`}>{it.text}</span>
          </label>
          <button type="button" aria-label={`Remover ${it.text}`} onClick={() => write(items.filter((x) => x.id !== it.id))}
            className="rounded p-1 hover:bg-[var(--n-hover)]"><X size={13} /></button>
        </div>
      ))}
      <input
        autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="Nova subtarefa e Enter" className={`${fieldClass} mt-1`}
        onKeyDown={(e) => {
          if (e.key !== "Enter" || !text.trim()) return;
          e.preventDefault();
          write([...items, { id: newId("c_"), text: text.trim(), done: false }]);
          setText("");
        }}
      />
    </Pop>
  );
}

function TitleField({ col, row, db, autoFocus }: CellProps) {
  const [draft, setDraft] = useState(row.title);
  useEffect(() => setDraft(row.title), [row.title]);
  return (
    <input
      value={draft} placeholder="Sem título" aria-label={col.name} title={draft || undefined} autoFocus={autoFocus}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft !== row.title && db.setValue(row.id, col.id, draft)}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
      className="w-full min-w-0 truncate bg-transparent px-2 py-1 text-sm font-medium outline-none placeholder:text-[var(--n-text-faint)]"
    />
  );
}

/** Editor da propriedade, usado em tabela, cartões e na página da linha. */
export function PropertyValue(props: CellProps) {
  const { col, row, db, compact, dense } = props;
  if (READ_ONLY.includes(col.type)) {
    const v = rawValue(col, row, db.ctx);
    const err = v && typeof v === "object" && "__error" in v ? (v.__error as string) : null;
    const text = displayText(col, v, db.ctx);
    if (col.rollup?.fn === "percent_complete" && !err) {
      return (
        <span className={`${cellBox} flex items-center gap-2`}>
          <span role="progressbar" aria-valuenow={parseInt(text, 10) || 0} className="h-1.5 max-w-[120px] flex-1 overflow-hidden rounded-full bg-[var(--n-active)]">
            <span className="block h-full bg-green-500" style={{ width: text || "0%" }} />
          </span>
          <span className="text-xs text-[var(--n-text-muted)]">{text || "0%"}</span>
        </span>
      );
    }
    return (
      <span title={err ?? undefined} className={`${cellBox} ${err ? "text-red-500" : "text-[var(--n-text-muted)]"}`}>
        {text || <Empty compact={compact} dense={dense} />}
      </span>
    );
  }
  switch (col.type) {
    case "title": return <TitleField {...props} />;
    case "checkbox":
      return (
        <span className={cellBox}>
          <input type="checkbox" aria-label={col.name} checked={Boolean(rawValue(col, row, db.ctx))}
            onChange={(e) => db.setValue(row.id, col.id, e.target.checked)} className="h-4 w-4 accent-[var(--n-accent)]" />
        </span>
      );
    case "select": case "multi_select": case "status": return <SelectField {...props} />;
    case "date": return <DateField {...props} />;
    case "person": return <PersonField {...props} />;
    case "files": return <FilesField {...props} />;
    case "relation": return <RelationField {...props} />;
    case "checklist": return <ChecklistField {...props} />;
    default: return <TextField {...props} />;
  }
}

/** Versão só-leitura compacta para cartões do quadro, galeria e lista. */
export function PropertyPreview({ col, row, db }: Omit<CellProps, "compact">) {
  const v = rawValue(col, row, db.ctx);
  if (col.type === "checkbox") return <input type="checkbox" readOnly tabIndex={-1} checked={Boolean(v)} className="pointer-events-none h-3.5 w-3.5 accent-[var(--n-accent)]" />;
  if (col.type === "select" || col.type === "status" || col.type === "multi_select") {
    const ids = Array.isArray(v) ? v : v ? [v] : [];
    const opts = (col.options ?? []).filter((o) => ids.includes(o.id) || ids.includes(o.value));
    return opts.length ? <span className="flex flex-wrap gap-1">{opts.map((o) => <OptionTag key={o.id} option={o} />)}</span> : null;
  }
  if (col.type === "checklist") return (v as ChecklistItem[]).length ? <ChecklistProgress items={v} /> : null;
  if (col.type === "person") {
    const people = (v ?? []) as PersonValue[];
    if (!people.length) return null;
    return <span title={people.map((p) => p.name).join(", ")} className="block max-w-full truncate text-xs text-[var(--n-text-muted)]">{people[0].name}{people.length > 1 ? ` +${people.length - 1}` : ""}</span>;
  }
  const text = displayText(col, v, db.ctx);
  // Duas cores na mesma classe disputam pela ordem do CSS: o alerta de prazo podia perder.
  return text ? <span className={`block max-w-full truncate text-xs ${dueTone(col, row, db.ctx) || "text-[var(--n-text-muted)]"}`}>{text}</span> : null;
}
