import { describe, expect, it } from "vitest";
import type { ColumnSchema, DatabaseRow } from "@/components/database/types";
import type { Ctx } from "@/components/database/values";
import { effectiveMap, matchMember, mirrorRow, sameName, suggestFields, suggestStatus, toSource } from "@/components/database/sources";

const tasks: ColumnSchema[] = [
  { id: "title", name: "Tarefa", type: "title" },
  { id: "status", name: "Status", type: "status", options: [
    { id: "todo", value: "A fazer", color: "", group: "todo" },
    { id: "doing", value: "Em andamento", color: "", group: "in_progress" },
    { id: "blocked", value: "Bloqueado", color: "", group: "in_progress" },
    { id: "done", value: "Concluído", color: "", group: "complete" },
  ] },
  { id: "assignee", name: "Responsável", type: "person" },
  { id: "due", name: "Prazo", type: "date" },
  { id: "priority", name: "Prioridade", type: "select", options: [{ id: "low", value: "Baixa", color: "" }, { id: "medium", value: "Média", color: "" }, { id: "high", value: "Alta", color: "" }] },
  { id: "project", name: "Projeto", type: "relation" },
  { id: "tags", name: "Tags", type: "multi_select", options: [{ id: "t1", value: "SQL", color: "" }] },
  { id: "fonte", name: "Fonte", type: "select", sourceTag: true, options: [] },
];

const demandas: ColumnSchema[] = [
  { id: "title", name: "Nome", type: "title" },
  { id: "resp", name: "Responsável", type: "person" },
  { id: "st", name: "Status", type: "status", options: [
    { id: "s1", value: "Não iniciado", color: "", group: "todo" },
    { id: "s2", value: "Em andamento", color: "", group: "in_progress" },
    { id: "s3", value: "Feito", color: "", group: "complete" },
    { id: "s4", value: "Esperando cliente", color: "" },
  ] },
  { id: "ini", name: "Inicio", type: "date" },
  { id: "fim", name: "Fim", type: "date" },
  { id: "pri", name: "Prioridade", type: "select", options: [{ id: "p1", value: "média", color: "" }, { id: "p2", value: "Urgente", color: "" }] },
  { id: "ferr", name: "Ferramentas", type: "multi_select", options: [{ id: "f1", value: "SQL", color: "" }, { id: "f2", value: "Python", color: "" }] },
  { id: "setor", name: "Setor", type: "select", options: [{ id: "x1", value: "PlanLog", color: "" }] },
];

const ctx = (schema: ColumnSchema[], related: Ctx["related"] = {}): Ctx => ({ schema, related, userLabel: () => "" });
const row = (p: Partial<DatabaseRow>): DatabaseRow => ({
  id: "r1", workspace_id: "w", parent_id: "src", title: "exemplo", icon: null, cover: null, position: 1, is_database: false, row_properties: {}, ...p,
});
const ref = { id: "src_1", databaseId: "src" };
const members = [{ id: "u1", name: "Thiago da Silva Costa", email: "thiago@x.com" }, { id: "u2", name: "Estevão Victor M. da Silva", email: "e@x.com" }];

describe("fontes conectadas", () => {
  it("sugere os campos pelo nome e pelo tipo", () => {
    const f = suggestFields(tasks, demandas);
    expect(f).toMatchObject({ title: ["title"], status: ["st"], assignee: ["resp"], due: ["fim"], priority: ["pri"] });
    expect(f.tags.sort()).toEqual(["ferr", "setor"]);
    expect(f.fonte).toBeUndefined();
  });

  it("casa status pelo grupo e manda o resto para Sem status", () => {
    const opts = tasks[1].options!;
    expect(suggestStatus({ id: "a", value: "Não iniciado", color: "", group: "todo" }, opts)).toBe("todo");
    expect(suggestStatus({ id: "b", value: "Em andamento", color: "", group: "in_progress" }, opts)).toBe("doing");
    expect(suggestStatus({ id: "c", value: "Feito", color: "" }, opts)).toBe("done");
    expect(suggestStatus({ id: "d", value: "Travado", color: "" }, opts)).toBe("blocked");
    expect(suggestStatus({ id: "e", value: "Esperando cliente", color: "" }, opts)).toBe("doing");
    expect(suggestStatus({ id: "f", value: "Xyz", color: "" }, opts)).toBeNull();
  });

  it("casa pessoas ignorando acento e nomes do meio, sem chutar", () => {
    expect(sameName("Thiago Costa", "THIAGO DA SILVA COSTA")).toBe(true);
    expect(sameName("Thiago", "Thiago Costa")).toBe(false);
    expect(matchMember(["Thiago Costa"], members)?.id).toBe("u1");
    expect(matchMember(["Thiago Costa"], [...members, { id: "u3", name: "Thiago Souza Costa", email: "" }])).toBeNull();
  });

  it("espelha a linha com os campos traduzidos e o resto só leitura", () => {
    const map = effectiveMap(undefined, tasks, demandas);
    const unmatched = { status: [] as string[], people: [] as { id: string; label: string }[] };
    const m = mirrorRow({
      row: row({ row_properties: { st: "s2", resp: [{ id: "u2", name: "Estevão" }], fim: { start: "2026-11-14" }, ini: { start: "2026-11-01" }, pri: "p2", ferr: ["f1", "f2"], setor: "x1" } }),
      ref, label: "Demandas", map, target: tasks, sctx: ctx(demandas), members, editable: true, unmatched,
    });
    expect(m.id).toBe("r1");
    expect(m.row_properties).toMatchObject({ status: "doing", due: { start: "2026-11-14" }, assignee: [{ id: "u2" }], priority: null, tags: ["t1"], fonte: "src_1" });
    expect(m.mirror?.extras).toEqual(expect.arrayContaining([
      { name: "Prioridade", text: "Urgente" }, { name: "Tags", text: "Python" }, { name: "Tags", text: "PlanLog" }, { name: "Inicio", text: expect.any(String) },
    ]));
    expect(m.mirror?.writable).toEqual(expect.arrayContaining(["title", "status", "assignee", "due", "priority"]));
    expect(m.mirror?.writable).not.toContain("tags");
  });

  it("sem permissão de edição, nada é editável", () => {
    const m = mirrorRow({ row: row({}), ref, label: "D", map: effectiveMap(undefined, tasks, demandas), target: tasks, sctx: ctx(demandas), members, editable: false, unmatched: { status: [], people: [] } });
    expect(m.mirror?.writable).toEqual([]);
  });

  it("status sem par vai para Sem status e é avisado", () => {
    const map = effectiveMap({ fields: suggestFields(tasks, demandas), status: { s4: null } }, tasks, demandas);
    const unmatched = { status: [] as string[], people: [] as { id: string; label: string }[] };
    const m = mirrorRow({ row: row({ row_properties: { st: "s4" } }), ref, label: "D", map, target: tasks, sctx: ctx(demandas), members, editable: true, unmatched });
    expect(m.row_properties.status).toBeNull();
    expect(unmatched.status).toEqual(["Esperando cliente"]);
  });

  it("grava de volta traduzindo para as opções da fonte", () => {
    const map = effectiveMap(undefined, tasks, demandas);
    const go = (colId: string, value: unknown) => toSource({ colId, value, map, target: tasks, sctx: ctx(demandas), members });
    expect(go("status", "done")).toEqual({ col: "st", value: "s3" });
    expect(go("status", "todo")).toEqual({ col: "st", value: "s1" });
    expect(go("due", { start: "2026-12-01" })).toEqual({ col: "fim", value: { start: "2026-12-01" } });
    expect(go("priority", "medium")).toEqual({ col: "pri", value: "p1" });
    expect(go("priority", "high")).toHaveProperty("error");
    expect(go("project", ["x"])).toHaveProperty("error");
  });

  it("Responsável como relação com o banco de pessoas: lê e grava pelo nome", () => {
    const pessoas: ColumnSchema[] = [{ id: "title", name: "Nome", type: "title" }, { id: "atr", name: "Atribuir", type: "select", options: [{ id: "t", value: "Thiago Costa", color: "" }] }];
    const src: ColumnSchema[] = [{ id: "title", name: "Nome", type: "title" }, { id: "eq", name: "Equipe", type: "relation", relationDatabaseId: "people", relationShowProp: "atr" }];
    const peopleRows = [row({ id: "pr1", parent_id: "people", title: "THIAGO DA SILVA COSTA", row_properties: { atr: "t" } }), row({ id: "pr2", parent_id: "people", title: "Fulano Externo" })];
    const sctx = ctx(src, { people: { schema: pessoas, rows: peopleRows } });
    const map = effectiveMap(undefined, tasks, src);
    expect(map.fields.assignee).toEqual(["eq"]);
    const unmatched = { status: [] as string[], people: [] as { id: string; label: string }[] };
    const m = mirrorRow({ row: row({ row_properties: { eq: ["pr1", "pr2"] } }), ref, label: "D", map, target: tasks, sctx, members, editable: true, unmatched });
    expect(m.row_properties.assignee).toEqual([{ id: "u1", name: "Thiago da Silva Costa" }]);
    expect(unmatched.people).toEqual([{ id: "pr2", label: "Fulano Externo" }]);
    expect(toSource({ colId: "assignee", value: [{ id: "u1", name: "Thiago" }], map, target: tasks, sctx, members })).toEqual({ col: "eq", value: ["pr1"] });
    expect(toSource({ colId: "assignee", value: [{ id: "u2", name: "Estevão" }], map, target: tasks, sctx, members })).toHaveProperty("error");
    // Ajuste manual na revisão vale nos dois sentidos.
    const fixed = { ...map, people: { pr2: "u2" } };
    expect(toSource({ colId: "assignee", value: [{ id: "u2", name: "Estevão" }], map: fixed, target: tasks, sctx, members })).toEqual({ col: "eq", value: ["pr2"] });
  });
});
