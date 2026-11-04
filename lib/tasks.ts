import { createClient } from "@/lib/supabase/client";
import type { ColumnSchema, DatabaseRow, DateValue, PersonValue, SelectOption } from "@/components/database/types";
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
};

const DUE_NAME = /prazo|venc|entrega|deadline|data/i;

/** Linhas de todos os bancos que têm data ou responsável: alimenta "Minhas tarefas" e a Agenda. */
export async function loadTasks(): Promise<{ tasks: Task[]; hasDatabases: boolean }> {
  const supabase = createClient();
  const { data: dbs, error } = await supabase
    .from("pages").select("id,title,database_schema").eq("is_database", true).eq("is_archived", false);
  if (error) throw error;

  const schemas = new Map((dbs ?? []).map((d) => [d.id, (d.database_schema?.length ? d.database_schema : DEFAULT_SCHEMA) as ColumnSchema[]]));
  const ids = (dbs ?? []).filter((d) => schemas.get(d.id)!.some((c) => c.type === "date" || c.type === "person")).map((d) => d.id);
  if (!ids.length) return { tasks: [], hasDatabases: false };

  const { data: rows, error: rowsError } = await supabase
    .from("pages").select("id,title,icon,parent_id,row_properties").in("parent_id", ids).eq("is_archived", false);
  if (rowsError) throw rowsError;

  const tasks = (rows as Pick<DatabaseRow, "id" | "title" | "icon" | "parent_id" | "row_properties">[]).map((r) => {
    const schema = schemas.get(r.parent_id)!;
    const dates = schema.filter((c) => c.type === "date");
    const dateCol = dates.find((c) => DUE_NAME.test(c.name)) ?? dates[0];
    const personCol = schema.find((c) => c.type === "person");
    const statusCol = schema.find((c) => c.type === "status");
    const props = r.row_properties ?? {};
    const status = statusCol?.options?.find((o) => o.id === props[statusCol.id]);
    return {
      id: r.id, title: r.title, icon: r.icon, databaseId: r.parent_id, rowProperties: props,
      databaseTitle: dbs!.find((d) => d.id === r.parent_id)?.title ?? "",
      due: dateCol ? asDate(props[dateCol.id]) : null,
      done: status?.group === "complete",
      people: personCol && Array.isArray(props[personCol.id]) ? props[personCol.id] : [],
      statusColId: statusCol?.id,
      doneOption: statusCol?.options?.find((o) => o.group === "complete"),
    };
  });
  return { tasks, hasDatabases: true };
}

export async function completeTask(t: Task) {
  if (!t.statusColId || !t.doneOption) return;
  const { error } = await createClient().from("pages")
    .update({ row_properties: { ...t.rowProperties, [t.statusColId]: t.doneOption.id } }).eq("id", t.id);
  if (error) throw error;
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
  ];
  const projectsSchema: ColumnSchema[] = [
    { id: "title", name: "Projeto", type: "title" },
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
      database_schema: projectsSchema, row_properties: { __views: [defaultView("table", projectsSchema)] },
    },
    {
      id: tasksId, workspace_id: workspaceId, title: "Tarefas", icon: "✅", is_database: true, position: now + 1,
      database_schema: tasksSchema, row_properties: { __views: [board, table, calendar] },
    },
  ]);
  if (error) throw error;
  return tasksId;
}
