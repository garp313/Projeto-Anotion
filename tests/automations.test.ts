import { describe, expect, it } from "vitest";
import type { ColumnSchema } from "@/components/database/types";
import { planChange, planCreate, planOverdue, type Automation } from "@/lib/automations";

const schema: ColumnSchema[] = [
  { id: "title", name: "Nome", type: "title" },
  { id: "st", name: "Status", type: "status", options: [{ id: "doing", value: "Em andamento", color: "" }, { id: "done", value: "Concluído", color: "", group: "complete" }] },
  { id: "end", name: "Concluída em", type: "date" },
  { id: "due", name: "Prazo", type: "date" },
  { id: "who", name: "Responsável", type: "person" },
  { id: "ok", name: "Aprovado", type: "checkbox" },
];
const row = { id: "r1", title: "Relatório", created_by: "criador", row_properties: { st: "doing", who: [{ id: "ana", name: "Ana" }, { name: "Sem conta" }] } };
const done: Automation = {
  id: "a1", name: "Concluiu", enabled: true, when: { type: "changed_to", col: "st", value: "done" },
  then: [{ type: "set_today", col: "end" }, { type: "notify", to: "creator", email: true }],
};
const TODAY = "2026-11-24";

describe("planChange", () => {
  it("dispara ao mudar para o valor e preenche a data", () => {
    const p = planChange([done], schema, row, "st", "doing", "done", TODAY);
    expect(p.props).toEqual({ end: { start: TODAY } });
    expect(p.notices).toEqual([{ rule: "a1", targets: ["criador"], email: true, message: "Concluiu: “Relatório” passou para Concluído" }]);
  });

  it("não dispara em outra coluna, outro valor, regra desligada ou valor repetido", () => {
    expect(planChange([done], schema, row, "st", "done", "doing", TODAY).fired).toEqual([]);
    expect(planChange([done], schema, row, "who", [], [{ id: "x" }], TODAY).fired).toEqual([]);
    expect(planChange([{ ...done, enabled: false }], schema, row, "st", "doing", "done", TODAY).fired).toEqual([]);
    expect(planChange([done], schema, row, "st", "done", "done", TODAY).fired).toEqual([]);
  });

  it("caixa: vazio conta como desmarcada", () => {
    const rule: Automation = { id: "b", name: "Aprovou", enabled: true, when: { type: "changed_to", col: "ok", value: true }, then: [{ type: "set_value", col: "st", value: "done" }] };
    expect(planChange([rule], schema, row, "ok", undefined, true, TODAY).props).toEqual({ st: "done" });
    const off: Automation = { ...rule, when: { type: "changed_to", col: "ok", value: false } };
    expect(planChange([off], schema, row, "ok", true, null, TODAY).fired).toEqual(["b"]);
    expect(planChange([off], schema, row, "ok", undefined, false, TODAY).fired).toEqual([]);
  });

  it("avisa só pessoas com conta e sem repetir", () => {
    const rule: Automation = { ...done, then: [{ type: "notify", to: "people", col: "who", email: false }] };
    const p = planChange([rule], schema, { ...row, row_properties: { ...row.row_properties, who: [{ id: "ana", name: "Ana" }, { id: "ana", name: "Ana" }, { name: "X" }] } }, "st", "doing", "done", TODAY);
    expect(p.notices[0].targets).toEqual(["ana"]);
    expect(p.notices[0].email).toBe(false);
  });
});

describe("planCreate", () => {
  it("roda as regras de criação", () => {
    const rule: Automation = { id: "c", name: "Nova", enabled: true, when: { type: "created" }, then: [{ type: "set_value", col: "st", value: "doing" }, { type: "notify", to: "people", col: "who", email: false }] };
    const p = planCreate([rule, done], row, TODAY);
    expect(p.fired).toEqual(["c"]);
    expect(p.props).toEqual({ st: "doing" });
    expect(p.notices[0].message).toBe("Nova: “Relatório” foi criada");
  });
});

describe("planOverdue", () => {
  const late: Automation = { id: "o", name: "Atrasou", enabled: true, when: { type: "overdue", col: "due" }, then: [{ type: "notify", to: "people", col: "who", email: true }] };
  const withDue = (v: any, extra = {}) => ({ ...row, row_properties: { ...row.row_properties, due: v, ...extra } });

  it("avisa uma vez por prazo", () => {
    const p = planOverdue([late], withDue({ start: "2026-11-20" }), TODAY, false);
    expect(p.notices).toHaveLength(1);
    expect(p.mark).toEqual({ o: "2026-11-20" });
    expect(planOverdue([late], withDue({ start: "2026-11-20" }, { __overdue: { o: "2026-11-20" } }), TODAY, false).fired).toEqual([]);
    // Prazo mudou e venceu de novo: avisa outra vez.
    expect(planOverdue([late], withDue({ start: "2026-11-22" }, { __overdue: { o: "2026-11-20" } }), TODAY, false).fired).toEqual(["o"]);
  });

  it("não avisa concluída, no prazo, sem data ou com fim em aberto", () => {
    expect(planOverdue([late], withDue({ start: "2026-11-20" }), TODAY, true).fired).toEqual([]);
    expect(planOverdue([late], withDue({ start: TODAY }), TODAY, false).fired).toEqual([]);
    expect(planOverdue([late], withDue(null), TODAY, false).fired).toEqual([]);
    expect(planOverdue([late], withDue({ start: "2026-11-01", openEnd: true }), TODAY, false).fired).toEqual([]);
    expect(planOverdue([late], withDue({ start: "2026-11-01", end: "2026-11-30" }), TODAY, false).fired).toEqual([]);
  });
});
