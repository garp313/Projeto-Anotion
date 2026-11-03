export type ColumnType =
  | "title"
  | "text"
  | "number"
  | "select"
  | "multi_select"
  | "status"
  | "date"
  | "person"
  | "files"
  | "checkbox"
  | "url"
  | "phone"
  | "email"
  | "relation"
  | "rollup"
  | "formula"
  | "button";

export type SelectOption = {
  id: string;
  value: string;
  color: string;
};

export type ColumnSchema = {
  id: string;
  name: string;
  type: ColumnType;
  options?: SelectOption[];
  width?: number;
};

export type ViewType = "table" | "board" | "list";

export type PeekMode = "side" | "center";

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
  content_json?: any[] | null;
  created_at?: string;
  updated_at?: string;
};

export type NotionColor = {
  name: string;
  bgClass: string;
  dotClass: string;
};

export const NOTION_COLORS: NotionColor[] = [
  { name: "Cinza", bgClass: "bg-neutral-200/70 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200", dotClass: "bg-neutral-400" },
  { name: "Marrom", bgClass: "bg-amber-100 dark:bg-amber-950/70 text-amber-900 dark:text-amber-200", dotClass: "bg-amber-600" },
  { name: "Laranja", bgClass: "bg-orange-100 dark:bg-orange-950/70 text-orange-900 dark:text-orange-200", dotClass: "bg-orange-500" },
  { name: "Amarelo", bgClass: "bg-yellow-100 dark:bg-yellow-950/70 text-yellow-900 dark:text-yellow-200", dotClass: "bg-yellow-500" },
  { name: "Verde", bgClass: "bg-emerald-100 dark:bg-emerald-950/70 text-emerald-900 dark:text-emerald-200", dotClass: "bg-emerald-500" },
  { name: "Azul", bgClass: "bg-blue-100 dark:bg-blue-950/70 text-blue-900 dark:text-blue-200", dotClass: "bg-blue-500" },
  { name: "Roxo", bgClass: "bg-purple-100 dark:bg-purple-950/70 text-purple-900 dark:text-purple-200", dotClass: "bg-purple-500" },
  { name: "Rosa", bgClass: "bg-pink-100 dark:bg-pink-950/70 text-pink-900 dark:text-pink-200", dotClass: "bg-pink-500" },
  { name: "Vermelho", bgClass: "bg-rose-100 dark:bg-rose-950/70 text-rose-900 dark:text-rose-200", dotClass: "bg-rose-500" },
];

export const DEFAULT_SELECT_COLORS = NOTION_COLORS.map((c) => c.bgClass);

export const DEFAULT_SCHEMA: ColumnSchema[] = [
  { id: "title", name: "Nome", type: "title" },
  {
    id: "status",
    name: "Status",
    type: "status",
    options: [
      { id: "not_started", value: "Não iniciado", color: NOTION_COLORS[0].bgClass },
      { id: "in_progress", value: "Em andamento", color: NOTION_COLORS[5].bgClass },
      { id: "done", value: "Concluído", color: NOTION_COLORS[4].bgClass },
    ],
  },
  {
    id: "priority",
    name: "Prioridade",
    type: "select",
    options: [
      { id: "low", value: "Baixa", color: NOTION_COLORS[0].bgClass },
      { id: "medium", value: "Média", color: NOTION_COLORS[2].bgClass },
      { id: "high", value: "Alta", color: NOTION_COLORS[8].bgClass },
    ],
  },
  { id: "date", name: "Data", type: "date" },
];
