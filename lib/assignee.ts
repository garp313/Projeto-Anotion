import { fold, nameMatch } from "./import/parsers";

export type Me = { id: string; names: string[] };

/**
 * A demanda é da pessoa? Vale em qualquer banco: id da conta, nome, e-mail ou nome abreviado,
 * porque os nomes vindos do Notion nem sempre são iguais aos do perfil.
 */
export function isAssignedTo(people: { id?: string; name: string }[], me: Me | null) {
  if (!me) return false;
  return people.some((p) => p.id === me.id || me.names.some((n) => fold(n) === fold(p.name) || nameMatch(n, p.name) !== null));
}
