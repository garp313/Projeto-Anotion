import { describe, expect, it } from "vitest";
import { DEFAULT_STATUS_OPTIONS, type ColumnSchema } from "@/components/database/types";
import { blocksToText, columnFrom, showValue, textToBlocks, toStored } from "@/lib/ai/values";
import { pendingCalls } from "@/lib/ai/types";

const people = [
  { id: "u1", name: "Ana Souza", email: "ana@time.com" },
  { id: "u2", name: "Bruno Lima", email: "bruno@time.com" },
];
const col = (c: Partial<ColumnSchema>): ColumnSchema => ({ id: "c", name: "C", type: "text", ...c });

describe("toStored", () => {
  it("número em formato brasileiro", () => {
    expect(toStored(col({ type: "number" }), "1.234,50", people)).toEqual({ value: 1234.5 });
    expect(toStored(col({ type: "number" }), "abc", people).error).toBeTruthy();
  });

  it("seleção acha a opção sem acento e cria a que falta", () => {
    const c = col({ type: "select", options: [{ id: "o1", value: "Média", color: "" }] });
    expect(toStored(c, "media", people)).toEqual({ value: "o1" });
    const r = toStored(c, "Urgente", people);
    expect(c.options).toHaveLength(2);
    expect(r.value).toBe(c.options![1].id);
  });

  it("status não inventa opção", () => {
    const c = col({ type: "status", options: DEFAULT_STATUS_OPTIONS.map((o) => ({ ...o })) });
    expect(toStored(c, "concluído", people)).toEqual({ value: "done" });
    expect(toStored(c, "Arquivado", people).error).toMatch(/não existe/);
    expect(c.options).toHaveLength(DEFAULT_STATUS_OPTIONS.length);
  });

  it("seleção múltipla separada por vírgula", () => {
    const c = col({ type: "multi_select", options: [] });
    const r = toStored(c, "A, B; A", people);
    expect(r.value).toHaveLength(2);
    expect(c.options!.map((o) => o.value)).toEqual(["A", "B"]);
  });

  it("datas: dia, hora, intervalo e fim em aberto", () => {
    const c = col({ type: "date" });
    expect(toStored(c, "2026-11-20", people)).toEqual({ value: { start: "2026-11-20" } });
    expect(toStored(c, "20/11/2026 14:30", people)).toEqual({ value: { start: "2026-11-20T14:30", time: true } });
    expect(toStored(c, "2026-11-20 → 2026-11-25", people)).toEqual({ value: { start: "2026-11-20", end: "2026-11-25" } });
    expect(toStored(c, "2026-11-20 até 2026-11-25", people)).toEqual({ value: { start: "2026-11-20", end: "2026-11-25" } });
    expect(toStored(c, "2026-11-20 → em aberto", people)).toEqual({ value: { start: "2026-11-20", end: null, openEnd: true } });
    expect(toStored(c, "amanhã", people).error).toBeTruthy();
  });

  it("pessoa por e-mail, nome ou primeiro nome; desconhecida fica só com o nome", () => {
    const c = col({ type: "person" });
    expect(toStored(c, "bruno@time.com, Ana", people)).toEqual({ value: [{ id: "u2", name: "Bruno Lima" }, { id: "u1", name: "Ana Souza" }] });
    expect(toStored(c, "Carla", people)).toEqual({ value: [{ name: "Carla" }] });
  });

  it("caixa, vazio e colunas calculadas", () => {
    expect(toStored(col({ type: "checkbox" }), "sim", people)).toEqual({ value: true });
    expect(toStored(col({ type: "checkbox" }), "talvez", people).error).toBeTruthy();
    expect(toStored(col({ type: "text" }), "", people)).toEqual({ value: null });
    expect(toStored(col({ type: "formula", name: "Total" }), "3", people).error).toMatch(/Total/);
  });
});

describe("showValue", () => {
  it("mostra rótulos e datas legíveis", () => {
    const c = col({ type: "select", options: [{ id: "o1", value: "Alta", color: "" }] });
    expect(showValue(c, "o1")).toBe("Alta");
    expect(showValue(col({ type: "date" }), { start: "2026-11-20", openEnd: true })).toBe("2026-11-20 → em aberto");
    expect(showValue(col({ type: "person" }), [{ name: "Ana" }, { name: "Bruno" }])).toBe("Ana, Bruno");
    expect(showValue(col({ type: "checkbox" }), false)).toBe("não");
  });
});

describe("columnFrom", () => {
  it("aceita tipo sem acento e recusa tipo desconhecido", () => {
    const c = columnFrom({ nome: "Prioridade", tipo: "selecao", opcoes: ["Alta", "Baixa", "alta"] }, { status: DEFAULT_STATUS_OPTIONS });
    expect(typeof c).toBe("object");
    expect((c as ColumnSchema).options!.map((o) => o.value)).toEqual(["Alta", "Baixa"]);
    expect(columnFrom({ nome: "X", tipo: "formula" }, { status: [] })).toMatch(/não existe/);
    const s = columnFrom({ nome: "Status", tipo: "status" }, { status: DEFAULT_STATUS_OPTIONS }) as ColumnSchema;
    expect(s.options).toHaveLength(4);
  });
});

describe("texto das páginas", () => {
  it("vai e volta entre texto e blocos", () => {
    const blocks = textToBlocks("# Plano\nIntro **forte**\n\n- item\n1. passo\n- [x] feito\n- [ ] falta\n");
    expect(blocks.map((b) => b.type)).toEqual(["heading", "paragraph", "paragraph", "bulletListItem", "numberedListItem", "checkListItem", "checkListItem"]);
    expect(blocks[1].content[1]).toEqual({ type: "text", text: "forte", styles: { bold: true } });
    expect(blocksToText(blocks)).toBe("# Plano\nIntro forte\n\n- item\n1. passo\n- [x] feito\n- [ ] falta");
  });

  it("corta texto longo", () => {
    const t = blocksToText(textToBlocks("a".repeat(50)), 10);
    expect(t).toMatch(/cortado/);
  });
});

describe("pendingCalls", () => {
  it("só pede confirmação quando a última resposta altera dados", () => {
    expect(pendingCalls([{ role: "assistant", text: "", calls: [{ id: "1", name: "buscar", args: {} }] }])).toEqual([]);
    expect(pendingCalls([{ role: "assistant", text: "", calls: [{ id: "1", name: "buscar", args: {} }, { id: "2", name: "criar_banco", args: {} }] }])).toHaveLength(2);
    expect(pendingCalls([
      { role: "assistant", text: "", calls: [{ id: "2", name: "criar_banco", args: {} }] },
      { role: "tool", results: [{ id: "2", name: "criar_banco", output: "{}" }] },
    ])).toEqual([]);
  });
});
