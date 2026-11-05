import { readFileSync, readdirSync } from "fs";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { nameMatch, parseCheckbox, parseDate, parseMulti, parseNumber, parsePercent, parseRelation } from "@/lib/import/parsers";
import { parseCsvText, readNotionZip, splitMarkdown } from "@/lib/import/notionZip";
import { applyToSchema, convertRow, detectType, suggestColumns, suggestPeople, suggestValues, type DbPlan } from "@/lib/import/mapping";
import type { ColumnSchema } from "@/components/database/types";

describe("parseDate", () => {
  it.each([
    ["30/09/2026", { start: "2026-09-30", end: null, time: false }],
    ["29 de setembro de 2026", { start: "2026-09-29", end: null, time: false }],
    ["September 29, 2026", { start: "2026-09-29", end: null, time: false }],
    ["Sep 9, 2026", { start: "2026-09-09", end: null, time: false }],
    ["2026-09-30", { start: "2026-09-30", end: null, time: false }],
    ["02/07/2026 10:00", { start: "2026-07-02T10:00", end: null, time: true }],
    ["September 29, 2026 3:30 PM", { start: "2026-09-29T15:30", end: null, time: true }],
    ["01/06/2026 → 25/09/2026", { start: "2026-06-01", end: "2026-09-25", time: false }],
  ])("%s", (text, expected) => expect(parseDate(text)).toEqual(expected));
  it.each(["31/02/2026", "01/11/26", "0026-11-20", "qualquer coisa", ""])("recusa %s", (t) => expect(parseDate(t)).toBeNull());
});

describe("números", () => {
  it.each([["1.234,50", 1234.5], ["1,234.50", 1234.5], ["12,5", 12.5], ["R$ 1.000,00", 1000], ["42", 42]])("%s", (t, n) => expect(parseNumber(t)).toBe(n));
  it.each([["70%", 70], ["0.7", 70], ["0,7", 70], ["4%", 4], ["100%", 100], ["12,5%", 12.5]])("percentual %s", (t, n) => expect(parsePercent(t)).toBe(n));
  it("texto não vira número", () => expect(parseNumber("abc")).toBeNull());
});

describe("listas e relação", () => {
  it("separa respeitando aspas", () => expect(parseMulti('Excel 📈, "A, B", SQL')).toEqual(["Excel 📈", "A, B", "SQL"]));
  it("remove repetidos e espaços", () => expect(parseMulti("Humberto Barbatti , Humberto Barbatti")).toEqual(["Humberto Barbatti"]));
  it.each([["Yes", true], ["Sim", true], ["true", true], ["No", false], ["Não", false], ["talvez", null]])("caixa %s", (t, v) => expect(parseCheckbox(t)).toBe(v));
  it("extrai título e id do link do Notion", () => {
    expect(parseRelation("Verificar BI BF (https://www.notion.so/Verificar-2e7a07882d928020a86bc6a048d5600b?pvs=21), Outra (https://www.notion.so/2e7a07882d9280e59d2ef31f380906fe)")).toEqual([
      { title: "Verificar BI BF", id: "2e7a07882d928020a86bc6a048d5600b" }, { title: "Outra", id: "2e7a07882d9280e59d2ef31f380906fe" },
    ]);
  });
  it("sem link usa o título", () => expect(parseRelation("Projeto A, Projeto B")).toEqual([{ title: "Projeto A", id: null }, { title: "Projeto B", id: null }]));
});

describe("nomes", () => {
  it("ignora acento e caixa", () => expect(nameMatch("LUDMILA de souza Soares", "Ludmila de Souza Soares")).toBe("exact"));
  it("reconhece nome abreviado", () => expect(nameMatch("Thiago Costa", "Thiago da Silva Costa")).toBe("partial"));
  it("não confunde pessoas", () => expect(nameMatch("Thiago Costa", "Thiago Mendes")).toBeNull());
  it("primeiro nome sozinho não basta", () => expect(nameMatch("Thiago", "Thiago da Silva Costa")).toBeNull());
});

describe("detecção de tipo", () => {
  it.each([
    ["Inicio", ["01/06/2026", "15/06/2026"], "date"],
    ["Progresso", ["70%", "100%"], "number"],
    ["Responsável", ["Ana, Bia"], "person"],
    ["Status", ["Pausado"], "status"],
    ["Anexar arquivo", ["https://a.com"], "files"],
    ["Ferramentas", ["Python 🐍, SQL 🛢", "SQL 🛢"], "multi_select"],
    ["Site", ["https://a.com", "https://b.com"], "url"],
    ["Contato", ["a@b.com"], "email"],
    ["Prioridade", ["Alta", "Baixa", "Alta", "Alta"], "select"],
  ] as const)("%s", (name, values, type) => expect(detectType(name, [...values])).toBe(type));
});

describe("export do Notion", () => {
  it("lê cabeçalho com espaço e BOM", () => {
    const db = parseCsvText('﻿Nome,"Responsável "\nA,"Ana "\n', "x.csv");
    expect(db.headers).toEqual(["Nome", "Responsável"]);
    expect(db.rows[0]["Responsável"]).toBe("Ana ");
  });
  it("tira do corpo o cabeçalho de propriedades", () => {
    const s = splitMarkdown("# ⚙️ Projetos\n\nStatus: Não iniciado\nEquipe: Ana\n\nTexto real: com dois pontos\n");
    expect(s).toMatchObject({ title: "Projetos", icon: "⚙️", body: "Texto real: com dois pontos" });
  });
  it("parágrafo com dois pontos não é cabeçalho", () => {
    expect(splitMarkdown("# T\n\nObservação: importante\nsegunda linha sem chave\n").body).toContain("Observação");
  });
  it("monta bancos, páginas de linha, banco interno e imagem", async () => {
    const id = (n: number) => String(n).repeat(32);
    const zip = new JSZip();
    zip.file(`Projetos ${id(1)}.csv`, "Nome,Status\nBF,Ativo\n");
    zip.file(`Projetos ${id(1)}_all.csv`, "Nome,Status,Extra\nBF,Ativo,x\n");
    zip.file(`Projetos ${id(1)}/BF ${id(2)}.md`, "# BF\n\nStatus: Ativo\n\nCorpo do projeto\n\n![](BF%20" + id(2) + "/foto.png)\n");
    zip.file(`Projetos ${id(1)}/BF ${id(2)}/foto.png`, new Uint8Array([1, 2, 3]));
    zip.file(`Projetos ${id(1)}/BF ${id(2)}/Demandas ${id(3)}.csv`, "Demanda,Status\nA,Em Atendimento\n");
    zip.file(`Projetos ${id(1)}/BF ${id(2)}/Sub ${id(4)}.md`, "# Sub\n\nFilha\n");
    const exp = await readNotionZip(await zip.generateAsync({ type: "uint8array" }), "t.zip");
    expect(exp.databases.map((d) => d.name).sort()).toEqual(["Demandas", "Projetos"]);
    expect(exp.databases.find((d) => d.name === "Projetos")?.headers).toContain("Extra");
    const page = exp.pages.find((p) => p.title === "BF")!;
    expect(page.rowOf).toBe(id(1));
    expect(page.body).toContain("Corpo do projeto");
    expect(page.body).not.toContain("Status: Ativo");
    expect(exp.databases.find((d) => d.name === "Demandas")?.parent).toBe(page.path);
    expect(exp.pages.find((p) => p.title === "Sub")?.parent).toBe(page.path);
    expect(exp.assets.size).toBe(1);
  });
  it("abre zip dentro de zip", async () => {
    const inner = new JSZip();
    inner.file(`A ${"a".repeat(32)}.csv`, "Nome\nX\n");
    const outer = new JSZip();
    outer.file("Export-Part-1.zip", await inner.generateAsync({ type: "uint8array" }));
    expect((await readNotionZip(await outer.generateAsync({ type: "uint8array" }), "t.zip")).databases).toHaveLength(1);
  });
});

const schema: ColumnSchema[] = [
  { id: "title", name: "Tarefa", type: "title" },
  { id: "status", name: "Status", type: "status", options: [
    { id: "todo", value: "A fazer", color: "c", group: "todo" }, { id: "doing", value: "Em andamento", color: "c", group: "in_progress" },
    { id: "blocked", value: "Bloqueado", color: "c", group: "in_progress" }, { id: "done", value: "Concluído", color: "c", group: "complete" },
  ] },
  { id: "assignee", name: "Responsável", type: "person" },
  { id: "due", name: "Prazo", type: "date" },
];
const members = [{ id: "u1", name: "Thiago da Silva Costa", email: "t@x.com" }, { id: "u2", name: "Ludmila de Souza Soares", email: "l@x.com" }];

function realPlan(text: string): DbPlan {
  const db = parseCsvText(text, "p.csv");
  const columns = suggestColumns(db, schema);
  return { db, target: { kind: "existing", id: "x" }, columns, values: suggestValues(db, columns, schema), people: suggestPeople(db, columns, schema, members), sendToTasks: false };
}
const CSV = 'Nome do projeto,"Responsável ",Status,Inicio,Fim,Progresso,Ferramentas\nBF,"Thiago Costa, Humberto Barbatti ",Em Atendimento,30/09/2026,16/11/2026,10%,"Excel 📈, SQL 🛢"\nHC,,Não iniciado,,29/09/2026,4%,\nX,Ludmila de Souza Soares,Concluído,data ruim,,,\n';

describe("plano no formato real", () => {
  const plan = realPlan(CSV);
  let n = 0;
  const { schema: next, ids } = applyToSchema(plan, schema, (p) => `${p}${++n}`);
  const rows = plan.db.rows.map((r, i) => convertRow(plan, r, i, next, ids));

  it("sugere destinos", () => {
    const by = Object.fromEntries(plan.columns.map((c) => [c.source, c.dest]));
    expect(by["Nome do projeto"]).toEqual({ kind: "title" });
    expect(by["Responsável"]).toEqual({ kind: "existing", colId: "assignee" });
    expect(by["Inicio"]).toEqual({ kind: "existing", colId: "due", part: "start" });
    expect(by["Fim"]).toEqual({ kind: "existing", colId: "due", part: "end" });
    expect(by["Ferramentas"]).toMatchObject({ kind: "new", type: "multi_select" });
  });
  it("mapeia status por sugestão", () => {
    expect(plan.values["Status"]).toEqual({ "Em Atendimento": "Em andamento", "Não iniciado": "A fazer", "Concluído": "Concluído" });
    expect(rows[0].props.status).toBe("doing");
    expect(next.find((c) => c.id === "status")?.options).toHaveLength(4);
  });
  it("junta início e fim em intervalo", () => expect(rows[0].props.due).toEqual({ start: "2026-09-30", end: "2026-11-16" }));
  it("só com fim usa o fim como data", () => expect(rows[1].props.due).toEqual({ start: "2026-09-29", end: null }));
  it("nunca cria pessoa sem conta", () => {
    expect(rows[0].props.assignee).toEqual([{ id: "u1", name: "Thiago da Silva Costa" }]);
    const text = next.find((c) => c.name === "Responsáveis (Notion)")!;
    expect(rows[0].props[text.id]).toBe("Humberto Barbatti");
  });
  it("percentual mantém o formato", () => {
    const col = next.find((c) => c.name === "Progresso")!;
    expect(col.numberFormat).toBe("percent");
    expect(rows[0].props[col.id]).toBe(10);
  });
  it("multi-seleção vira opções", () => {
    const col = next.find((c) => c.name === "Ferramentas")!;
    expect(col.options?.map((o) => o.value)).toEqual(["Excel 📈", "SQL 🛢"]);
    expect(rows[0].props[col.id]).toHaveLength(2);
  });
  it("valor ilegível é reportado, sem perder", () => {
    expect(rows[2].issues).toEqual([{ row: 4, column: "Inicio", value: "data ruim", reason: "Data não reconhecida" }]);
  });
});

describe("coluna criada pela importação", () => {
  it("volta como texto, não como pessoa", () => expect(detectType("Responsáveis (Notion)", ["Humberto Barbatti"])).toBe("text"));
});

// O arquivo real fica fora do git: o teste só roda onde ele existir.
const real = readdirSync(process.cwd()).find((f) => /ExportBlock.*\.zip$/.test(f));
describe.skipIf(!real)("export real", () => {
  it("lê o zip enviado", async () => {
    const exp = await readNotionZip(readFileSync(real!), real!);
    expect(exp.databases).toHaveLength(1);
    const db = exp.databases[0];
    expect(db.headers).toContain("Responsável");
    expect(db.headers).toHaveLength(10);
    expect(db.rows.length).toBeGreaterThan(30);
    expect(db.parent).toBe(exp.pages[0].path);
    expect(exp.pages[0]).toMatchObject({ title: "Projetos", icon: "⚙️" });
  });
});
