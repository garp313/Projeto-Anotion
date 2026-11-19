// Ferramentas oferecidas à IA. Esquema simples (sem additionalProperties) para servir ao Claude e ao Gemini.
import { AI_TYPES } from "./values";

type Schema = { type: string; description?: string; enum?: string[]; items?: Schema; properties?: Record<string, Schema>; required?: string[] };
export type ToolDef = { name: string; description: string; parameters: Schema };

const str = (description: string): Schema => ({ type: "string", description });
const obj = (properties: Record<string, Schema>, required: string[] = []): Schema => ({ type: "object", properties, required });
const arr = (items: Schema, description: string): Schema => ({ type: "array", items, description });

const column = obj({
  nome: str("Nome da coluna."),
  tipo: { type: "string", enum: Object.keys(AI_TYPES), description: "Tipo da coluna." },
  opcoes: arr(str("Opção"), "Opções iniciais, só para selecao e selecao_multipla."),
}, ["nome", "tipo"]);

const values = arr(obj({
  coluna: str("Nome da coluna, exatamente como no banco."),
  valor: str("Valor em texto. Data: AAAA-MM-DD (com HH:MM se tiver hora), intervalo com ' → ', fim em aberto com ' → em aberto'. Seleção múltipla e pessoa: separadas por vírgula. Caixa: sim ou não. Vazio apaga."),
}, ["coluna", "valor"]), "Valores das colunas. O título vai no campo titulo, não aqui.");

const content = str("Texto da página. Aceita # título, ## subtítulo, - lista, 1. lista numerada, - [ ] tarefa e **negrito**.");

export const TOOLS: ToolDef[] = [
  {
    name: "buscar",
    description: "Busca páginas e bancos de dados pelo título. Sem consulta, lista as páginas do topo do workspace.",
    parameters: obj({ consulta: str("Parte do título. Pode ficar vazia.") }),
  },
  {
    name: "ler_pagina",
    description: "Lê uma página: texto, subpáginas e, se for banco de dados, as colunas com tipos e opções. Se for uma linha de banco, mostra os valores dela.",
    parameters: obj({ id: str("Id da página.") }, ["id"]),
  },
  {
    name: "listar_linhas",
    description: "Lista as linhas de um banco de dados com os valores de cada coluna.",
    parameters: obj({
      banco_id: str("Id do banco de dados."),
      busca: str("Filtra linhas cujo título contém este texto. Opcional."),
      limite: { type: "number", description: "Máximo de linhas (padrão 50, até 200)." },
    }, ["banco_id"]),
  },
  {
    name: "listar_membros",
    description: "Lista as pessoas do time (nome e e-mail), para preencher colunas de pessoa.",
    parameters: obj({}),
  },
  {
    name: "criar_pagina",
    description: "Cria uma página com texto. Precisa da confirmação de quem usa.",
    parameters: obj({
      titulo: str("Título."),
      dentro_de: str("Id da página onde ela fica. Vazio cria no topo do workspace."),
      icone: str("Um emoji. Opcional."),
      conteudo: content,
    }, ["titulo"]),
  },
  {
    name: "criar_banco",
    description: "Cria um banco de dados (tabela). A primeira coluna, de título, é criada sozinha com o nome indicado em coluna_titulo. Precisa da confirmação de quem usa.",
    parameters: obj({
      titulo: str("Nome do banco."),
      dentro_de: str("Id da página onde ele fica. Vazio cria no topo do workspace."),
      icone: str("Um emoji. Opcional."),
      coluna_titulo: str("Nome da coluna de título. Padrão: Nome."),
      colunas: arr(column, "Demais colunas. Status vem com A fazer, Em andamento, Bloqueado e Concluído."),
    }, ["titulo", "colunas"]),
  },
  {
    name: "adicionar_colunas",
    description: "Acrescenta colunas a um banco de dados existente. Precisa da confirmação de quem usa.",
    parameters: obj({ banco_id: str("Id do banco."), colunas: arr(column, "Colunas novas.") }, ["banco_id", "colunas"]),
  },
  {
    name: "adicionar_linhas",
    description: "Cria linhas num banco de dados (até 100 por vez). Seleções com valor novo ganham a opção. Precisa da confirmação de quem usa.",
    parameters: obj({
      banco_id: str("Id do banco."),
      linhas: arr(obj({ titulo: str("Título da linha."), valores: values, conteudo: str("Texto dentro da página da linha. Opcional.") }, ["titulo"]), "Linhas novas."),
    }, ["banco_id", "linhas"]),
  },
  {
    name: "editar_linhas",
    description: "Altera título ou valores de linhas existentes (até 100 por vez). Só muda as colunas informadas. Precisa da confirmação de quem usa.",
    parameters: obj({
      linhas: arr(obj({ id: str("Id da linha."), titulo: str("Título novo. Opcional."), valores: values }, ["id"]), "Linhas a alterar."),
    }, ["linhas"]),
  },
  {
    name: "escrever_na_pagina",
    description: "Acrescenta texto ao fim de uma página existente, sem apagar o que já existe. Precisa da confirmação de quem usa.",
    parameters: obj({ id: str("Id da página."), conteudo: content }, ["id", "conteudo"]),
  },
];
