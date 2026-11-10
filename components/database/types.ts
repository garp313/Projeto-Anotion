export type PropType =
  | "title" | "text" | "number" | "select" | "multi_select" | "status" | "date" | "person"
  | "files" | "checkbox" | "url" | "email" | "phone" | "formula" | "relation" | "rollup"
  | "created_time" | "created_by" | "last_edited_time" | "last_edited_by" | "unique_id" | "checklist";

export type StatusGroup = "todo" | "in_progress" | "complete";
export type SelectOption = { id: string; value: string; color: string; group?: StatusGroup };

export type NumberFormat = "number" | "comma" | "percent" | "real" | "dollar" | "euro";
export type RollupFn =
  | "show_original" | "count" | "count_values" | "count_unique" | "empty" | "not_empty"
  | "percent_empty" | "percent_not_empty" | "sum" | "average" | "median" | "min" | "max" | "range"
  | "earliest" | "latest" | "percent_complete";

export type ColumnSchema = {
  id: string;
  name: string;
  type: PropType;
  options?: SelectOption[];
  numberFormat?: NumberFormat;
  formula?: string;
  relationDatabaseId?: string;
  /** Propriedade espelho no banco de destino (relação de duas vias). */
  relationSyncProp?: string;
  /** Coluna do banco ligado mostrada no lugar do nome da linha. Vazio mostra o nome. */
  relationShowProp?: string;
  rollup?: { relationProp: string; targetProp: string; fn: RollupFn };
  idPrefix?: string;
};

export type Repeat = "daily" | "weekly" | "monthly";
export type DateValue = {
  start: string; end?: string | null; time?: boolean;
  /** Dias de antecedência do lembrete no Inbox (0 = no dia). */
  remind?: number | null;
  /** Ao concluir, cria a próxima ocorrência. */
  repeat?: Repeat | null;
};
export type PersonValue = { id?: string; name: string };
export type FileValue = { name: string; path?: string; url?: string };
export type ChecklistItem = { id: string; text: string; done: boolean };

export type ViewType = "table" | "board" | "list" | "gallery" | "calendar" | "timeline";

export type FilterOp =
  | "contains" | "not_contains" | "is" | "is_not" | "starts_with" | "ends_with"
  | "empty" | "not_empty" | "gt" | "lt" | "gte" | "lte" | "before" | "after" | "checked" | "unchecked"
  | "today" | "this_week" | "next_7" | "this_month" | "overdue" | "is_me";
export type Filter = { id: string; prop: string; op: FilterOp; value?: any };
export type Sort = { prop: string; dir: "asc" | "desc" };

export type DatabaseViewConfig = {
  id: string;
  name: string;
  type: ViewType;
  filters: Filter[];
  filterMode: "and" | "or";
  sorts: Sort[];
  groupBy?: string | null;
  hidden: string[];
  order?: string[];
  widths?: Record<string, number>;
  dateProp?: string | null;
  wrap?: boolean;
  calcs?: Record<string, RollupFn>;
  cardSize?: "small" | "medium" | "large";
  hideEmpty?: boolean;
};

export type DatabaseRow = {
  id: string;
  workspace_id: string;
  parent_id: string;
  title: string;
  icon: string | null;
  cover: string | null;
  position: number;
  is_database: boolean;
  row_properties: Record<string, any>;
  created_at?: string;
  updated_at?: string;
  created_by?: string | null;
  last_edited_by?: string | null;
  seq?: number;
};

/** As 10 cores do Notion. As classes ficam literais para o Tailwind encontrá-las. */
export const COLORS: { name: string; cls: string }[] = [
  { name: "Padrão", cls: "bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-zinc-300" },
  { name: "Cinza", cls: "bg-stone-200 dark:bg-stone-700/60 text-stone-700 dark:text-stone-200" },
  { name: "Marrom", cls: "bg-amber-200/60 dark:bg-amber-900/50 text-amber-900 dark:text-amber-200" },
  { name: "Laranja", cls: "bg-orange-100 dark:bg-orange-950/60 text-orange-700 dark:text-orange-300" },
  { name: "Amarelo", cls: "bg-yellow-100 dark:bg-yellow-950/60 text-yellow-700 dark:text-yellow-300" },
  { name: "Verde", cls: "bg-green-100 dark:bg-green-950/60 text-green-700 dark:text-green-300" },
  { name: "Azul", cls: "bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300" },
  { name: "Roxo", cls: "bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300" },
  { name: "Rosa", cls: "bg-pink-100 dark:bg-pink-950/60 text-pink-700 dark:text-pink-300" },
  { name: "Vermelho", cls: "bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300" },
];
const c = (name: string) => COLORS.find((x) => x.name === name)!.cls;

export const DEFAULT_STATUS_OPTIONS: SelectOption[] = [
  { id: "not_started", value: "A fazer", color: c("Padrão"), group: "todo" },
  { id: "in_progress", value: "Em andamento", color: c("Azul"), group: "in_progress" },
  { id: "blocked", value: "Bloqueado", color: c("Vermelho"), group: "in_progress" },
  { id: "done", value: "Concluído", color: c("Verde"), group: "complete" },
];

export const DEFAULT_SCHEMA: ColumnSchema[] = [
  { id: "title", name: "Nome", type: "title" },
  { id: "status", name: "Status", type: "status", options: DEFAULT_STATUS_OPTIONS },
  { id: "assignee", name: "Responsável", type: "person" },
  {
    id: "priority", name: "Prioridade", type: "select",
    options: [
      { id: "low", value: "Baixa", color: c("Padrão") },
      { id: "medium", value: "Média", color: c("Amarelo") },
      { id: "high", value: "Alta", color: c("Vermelho") },
    ],
  },
  { id: "date", name: "Data", type: "date" },
];

export const PROP_LABEL: Record<PropType, string> = {
  title: "Título", text: "Texto", number: "Número", select: "Seleção", multi_select: "Seleção múltipla",
  status: "Status", date: "Data", person: "Pessoa", files: "Arquivos e mídia", checkbox: "Caixa de seleção",
  url: "URL", email: "E-mail", phone: "Telefone", formula: "Fórmula", relation: "Relação", rollup: "Rollup",
  created_time: "Data de criação", created_by: "Criado por", last_edited_time: "Última edição",
  last_edited_by: "Editado por", unique_id: "ID", checklist: "Checklist",
};

export const VIEW_LABEL: Record<ViewType, string> = {
  table: "Tabela", board: "Quadro", list: "Lista", gallery: "Galeria", calendar: "Calendário", timeline: "Linha do tempo",
};

/** Tipos calculados: o usuário não edita o valor diretamente. */
export const READ_ONLY: PropType[] = ["formula", "rollup", "created_time", "created_by", "last_edited_time", "last_edited_by", "unique_id"];

export const newId = (p = "") => p + Math.random().toString(36).slice(2, 10);

/** Campos que transformam uma página em banco de dados. As visões vivem em row_properties.__views. */
export function databasePatch(
  page: { database_schema?: ColumnSchema[]; row_properties?: Record<string, any> },
  type: ViewType = "table"
) {
  const database_schema = page.database_schema?.length ? page.database_schema : DEFAULT_SCHEMA;
  const __views = page.row_properties?.__views?.length ? page.row_properties.__views : [defaultView(type, database_schema)];
  return { is_database: true, database_schema, row_properties: { ...page.row_properties, __views } };
}

export function defaultView(type: ViewType = "table", schema: ColumnSchema[] = []): DatabaseViewConfig {
  const groupable = schema.find((s) => s.type === "status" || s.type === "select");
  const date = schema.find((s) => s.type === "date");
  return {
    id: newId("v_"), name: VIEW_LABEL[type], type, filters: [], filterMode: "and", sorts: [], hidden: [],
    groupBy: type === "board" ? groupable?.id ?? null : null,
    dateProp: date?.id ?? null, cardSize: "medium",
  };
}
