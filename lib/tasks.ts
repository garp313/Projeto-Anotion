import { createClient } from "@/lib/supabase/client";
import type { ColumnSchema, DatabaseRow, DateValue, PersonValue, Repeat, SelectOption } from "@/components/database/types";
import { COLORS, DEFAULT_SCHEMA, defaultView } from "@/components/database/types";
import { asDate } from "@/components/database/values";

export type Task = {
  id: string;
  title: string;
  icon: string | null;
  databaseId: string;
  databaseTitle: string;
  rowProperties: Record<string, any>;
  due: DateValue | null;
  done: boolean;
  people: PersonValue[];
  statusColId?: string;
  doneOption?: SelectOption;
  statusOption?: SelectOption;
  statusOptions: SelectOption[];
  priority?: SelectOption;
  schema: ColumnSchema[];
  row: Pick<DatabaseRow, "workspace_id" | "parent_id" | "title" | "icon" | "row_properties">;
};

const DUE_NAME = /prazo|venc|entrega|deadline|data/i;

/** Linhas de todos os bancos que têm data ou responsável: alimenta "Minhas tarefas" e a Agenda. */
export async function loadTasks(client?: ReturnType<typeof createClient>): Promise<{ tasks: Task[]; hasDatabases: boolean }> {
  const supabase = client ?? createClient();
  const { data: dbs, error } = await supabase
    .from("pages").select("id,title,database_schema").eq("is_database", true).eq("is_archived", false);
  if (error) throw error;

  const schemas = new Map((dbs ?? []).map((d) => [d.id, (d.database_schema?.length ? d.database_schema : DEFAULT_SCHEMA) as ColumnSchema[]]));
  const ids = (dbs ?? []).filter((d) => schemas.get(d.id)!.some((c) => c.type === "date" || c.type === "person")).map((d) => d.id);
  if (!ids.length) return { tasks: [], hasDatabases: false };

  const { data: rows, error: rowsError } = await supabase
    .from("pages").select("id,workspace_id,title,icon,parent_id,row_properties").in("parent_id", ids).eq("is_archived", false);
  if (rowsError) throw rowsError;

  const tasks = (rows as Pick<DatabaseRow, "id" | "workspace_id" | "title" | "icon" | "parent_id" | "row_properties">[]).map((r) => {
    const schema = schemas.get(r.parent_id)!;
    const dates = schema.filter((c) => c.type === "date");
    const dateCol = dates.find((c) => DUE_NAME.test(c.name)) ?? dates[0];
    const personCol = schema.find((c) => c.type === "person");
    const statusCol = schema.find((c) => c.type === "status");
    const props = r.row_properties ?? {};
    const status = statusCol?.options?.find((o) => o.id === props[statusCol.id]);
    const priorityCol = schema.find((c) => c.type === "select" && /prioridade|priority/i.test(c.name));
    return {
      id: r.id, title: r.title, icon: r.icon, databaseId: r.parent_id, rowProperties: props,
      databaseTitle: dbs!.find((d) => d.id === r.parent_id)?.title ?? "",
      due: dateCol ? asDate(props[dateCol.id]) : null,
      done: status?.group === "complete",
      people: personCol && Array.isArray(props[personCol.id]) ? props[personCol.id] : [],
      statusColId: statusCol?.id,
      doneOption: statusCol?.options?.find((o) => o.group === "complete"),
      statusOption: status,
      statusOptions: statusCol?.options ?? [],
      priority: priorityCol?.options?.find((o) => o.id === props[priorityCol.id]),
      schema, row: r,
    };
  });
  return { tasks, hasDatabases: true };
}

export async function setTaskStatus(t: Task, optionId: string) {
  if (!t.statusColId) return;
  const { error } = await createClient().from("pages")
    .update({ row_properties: { ...t.rowProperties, [t.statusColId]: optionId } }).eq("id", t.id);
  if (error) throw error;
  const finishing = t.statusOptions.find((o) => o.id === optionId)?.group === "complete" && t.statusOption?.group !== "complete";
  if (finishing) await spawnNextOccurrence(t.row, t.schema);
}

export const completeTask = (t: Task) => (t.doneOption ? setTaskStatus(t, t.doneOption.id) : Promise.resolve());

const advance = (s: string, repeat: Repeat) => {
  const dateOnly = s.length <= 10;
  const d = new Date(dateOnly ? `${s}T12:00:00` : s);
  if (repeat === "daily") d.setDate(d.getDate() + 1);
  else if (repeat === "weekly") d.setDate(d.getDate() + 7);
  else d.setMonth(d.getMonth() + 1);
  const p = (n: number) => String(n).padStart(2, "0");
  const day = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  return dateOnly ? day : `${day}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

/** Ao concluir uma tarefa recorrente, cria a próxima com o status inicial. */
export async function spawnNextOccurrence(
  row: Pick<DatabaseRow, "workspace_id" | "parent_id" | "title" | "icon" | "row_properties">, schema: ColumnSchema[]
) {
  const col = schema.find((c) => c.type === "date" && asDate(row.row_properties?.[c.id])?.repeat);
  if (!col) return false;
  const due = asDate(row.row_properties[col.id])!;
  const status = schema.find((c) => c.type === "status");
  const props: Record<string, any> = { ...row.row_properties };
  for (const k of Object.keys(props)) if (k.startsWith("__gcal_")) delete props[k];
  props[col.id] = { ...due, start: advance(due.start, due.repeat!), end: due.end ? advance(due.end, due.repeat!) : due.end };
  if (status) props[status.id] = status.options?.find((o) => (o.group ?? "todo") === "todo")?.id ?? null;
  const { error } = await createClient().from("pages").insert({
    workspace_id: row.workspace_id, parent_id: row.parent_id, title: row.title, icon: row.icon, position: Date.now(), row_properties: props,
  });
  if (error) throw error;
  return true;
}

const color = (name: string) => COLORS.find((c) => c.name === name)!.cls;

/** Cria Projetos e Tarefas já relacionados, com rollup de % concluído. Devolve o id de Tarefas. */
export async function createTaskTemplate(workspaceId: string): Promise<string> {
  const projectsId = crypto.randomUUID();
  const tasksId = crypto.randomUUID();

  const tasksSchema: ColumnSchema[] = [
    { id: "title", name: "Tarefa", type: "title" },
    {
      id: "status", name: "Status", type: "status",
      options: [
        { id: "todo", value: "A fazer", color: color("Padrão"), group: "todo" },
        { id: "doing", value: "Em andamento", color: color("Azul"), group: "in_progress" },
        { id: "blocked", value: "Bloqueado", color: color("Vermelho"), group: "in_progress" },
        { id: "done", value: "Concluído", color: color("Verde"), group: "complete" },
      ],
    },
    { id: "assignee", name: "Responsável", type: "person" },
    { id: "due", name: "Prazo", type: "date" },
    {
      id: "priority", name: "Prioridade", type: "select",
      options: [
        { id: "low", value: "Baixa", color: color("Padrão") },
        { id: "medium", value: "Média", color: color("Amarelo") },
        { id: "high", value: "Alta", color: color("Vermelho") },
      ],
    },
    { id: "project", name: "Projeto", type: "relation", relationDatabaseId: projectsId, relationSyncProp: "tasks" },
    { id: "tags", name: "Tags", type: "multi_select", options: [] },
    { id: "subtasks", name: "Subtarefas", type: "checklist" },
    { id: "blocked_by", name: "Bloqueado por", type: "relation", relationDatabaseId: tasksId, relationSyncProp: "blocks" },
    { id: "blocks", name: "Bloqueia", type: "relation", relationDatabaseId: tasksId, relationSyncProp: "blocked_by" },
  ];
  const projectsSchema: ColumnSchema[] = [
    { id: "title", name: "Projeto", type: "title" },
    { id: "period", name: "Período", type: "date" },
    { id: "tasks", name: "Tarefas", type: "relation", relationDatabaseId: tasksId, relationSyncProp: "project" },
    { id: "progress", name: "% concluído", type: "rollup", rollup: { relationProp: "tasks", targetProp: "status", fn: "percent_complete" } },
    { id: "count", name: "Nº de tarefas", type: "rollup", rollup: { relationProp: "tasks", targetProp: "status", fn: "count" } },
  ];

  const board = { ...defaultView("board", tasksSchema), name: "Quadro", groupBy: "status" };
  const calendar = { ...defaultView("calendar", tasksSchema), name: "Calendário", dateProp: "due" };
  const table = { ...defaultView("table", tasksSchema), name: "Todas" };
  const now = Date.now();

  const { error } = await createClient().from("pages").insert([
    {
      id: projectsId, workspace_id: workspaceId, title: "Projetos", icon: "📁", is_database: true, position: now,
      database_schema: projectsSchema, row_properties: { __views: [defaultView("table", projectsSchema), { ...defaultView("timeline", projectsSchema), name: "Linha do tempo", dateProp: "period" }] },
    },
    {
      id: tasksId, workspace_id: workspaceId, title: "Tarefas", icon: "✅", is_database: true, position: now + 1,
      database_schema: tasksSchema, row_properties: { __views: [board, table, calendar] },
    },
  ]);
  if (error) throw error;
  return tasksId;
}
