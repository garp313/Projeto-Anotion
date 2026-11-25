import { describe, expect, it } from "vitest";
import type { ColumnSchema } from "@/components/database/types";
import { defaultCharts, groupBars, kpis, monday, weekly } from "@/lib/charts";

const schema: ColumnSchema[] = [
  { id: "title", name: "Tarefa", type: "title" },
  { id: "st", name: "Status", type: "status", options: [
    { id: "todo", value: "A fazer", color: "", group: "todo" },
    { id: "doing", value: "Em andamento", color: "", group: "in_progress" },
    { id: "done", value: "Concluído", color: "", group: "complete" },
  ] },
  { id: "who", name: "Responsável", type: "person" },
  { id: "due", name: "Prazo", type: "date" },
];
const TODAY = "2026-11-25"; // quarta-feira
const row = (id: string, p: Record<string, any>, created_at = "2026-11-20T10:00:00Z") => ({ id, row_properties: p, created_at });
const rows = [
  row("1", { st: "todo", who: [{ name: "Ana" }], due: { start: "2026-11-20" } }),          // atrasada
  row("2", { st: "doing", who: [{ name: "Ana" }, { name: "Bia" }], due: { start: "2026-12-01" } }),
  row("3", { st: "done", who: [{ name: "Bia" }], due: { start: "2026-11-01" } }),          // concluída: não atrasa
  row("4", { who: [], due: { start: "2026-08-01" } }, "2026-08-01T00:00:00Z"),              // sem status, atrasada há muito
  row("5", { st: "todo", due: { start: "2026-11-10", openEnd: true } }),                   // fim em aberto: não atrasa
];

describe("kpis", () => {
  it("conta abertas, concluídas e atrasadas", () => {
    expect(kpis(rows, schema, TODAY)).toEqual({ total: 5, open: 4, done: 1, overdue: 2, pct: 20 });
    expect(kpis([], schema, TODAY).pct).toBe(0);
  });
});

describe("groupBars", () => {
  it("status na ordem das opções, com Sem valor no fim", () => {
    expect(groupBars(rows, schema, "st")).toEqual([
      { label: "A fazer", open: 2, done: 0 },
      { label: "Em andamento", open: 1, done: 0 },
      { label: "Concluído", open: 0, done: 1 },
      { label: "Sem valor", open: 1, done: 0 },
    ]);
  });

  it("pessoa: cada uma conta, maior primeiro", () => {
    expect(groupBars(rows, schema, "who")).toEqual([
      { label: "Ana", open: 2, done: 0 },
      { label: "Bia", open: 1, done: 1 },
      { label: "Sem valor", open: 2, done: 0 },
    ]);
  });

  it("mais de 8 categorias viram Outros", () => {
    const many = Array.from({ length: 12 }, (_, i) => row(String(i), { who: [{ name: `P${String(i).padStart(2, "0")}` }] }));
    const bars = groupBars(many, schema, "who");
    expect(bars).toHaveLength(8);
    expect(bars[7]).toEqual({ label: "Outros", open: 5, done: 0 });
  });
});

describe("weekly", () => {
  it("semana começa na segunda", () => {
    expect(monday("2026-11-25")).toBe("2026-11-23");
    expect(monday("2026-11-23")).toBe("2026-11-23");
    expect(monday("2026-11-29")).toBe("2026-11-23");
  });

  it("atrasadas pela semana do prazo, antigas em Antes", () => {
    const w = weekly(rows, schema, "overdue_weeks", TODAY, 4);
    expect(w).toEqual([
      { label: "Antes", value: 1 },
      { label: "02/11", value: 0 },
      { label: "09/11", value: 0 },
      { label: "16/11", value: 1 },
      { label: "23/11", value: 0 },
    ]);
  });

  it("criadas por semana", () => {
    const w = weekly(rows, schema, "created_weeks", TODAY, 2);
    expect(w).toEqual([{ label: "16/11", value: 4 }, { label: "23/11", value: 0 }]);
  });
});

describe("defaultCharts", () => {
  it("monta os três gráficos quando há as colunas", () => {
    expect(defaultCharts(schema).map((c) => c.kind + (c.col ?? ""))).toEqual(["groupst", "groupwho", "overdue_weeks"]);
    expect(defaultCharts([{ id: "title", name: "Nome", type: "title" }])).toEqual([]);
  });
});
