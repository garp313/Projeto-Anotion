import { accessToken } from "./calendar";

const EMAIL = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/;
const encodeHeader = (s: string) => `=?UTF-8?B?${Buffer.from(s, "utf8").toString("base64")}?=`;

const API = "https://gmail.googleapis.com/gmail/v1/users/me";

export type SendResult = "sent" | "not_connected" | "failed";
export type MessageSummary = { id: string; subject: string; from: string; date: string; snippet: string };
export type FullMessage = MessageSummary & { body: string; threadId?: string; messageId: string; replyTo: string };

/** O token existe, mas falta o escopo gmail.readonly: a pessoa precisa autorizar de novo. */
export class GmailScopeError extends Error {}

async function read<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { cache: "no-store", headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401 || res.status === 403) throw new GmailScopeError();
  if (!res.ok) throw new Error(`Gmail respondeu ${res.status}`);
  return res.json();
}

type Part = { mimeType?: string; body?: { data?: string }; parts?: Part[] };
const header = (m: any, name: string): string =>
  m.payload?.headers?.find((h: any) => h.name.toLowerCase() === name)?.value ?? "";
const decode = (data: string) => Buffer.from(data, "base64url").toString("utf8");

function findPart(part: Part, mime: string): string | null {
  if (part.mimeType === mime && part.body?.data) return decode(part.body.data);
  for (const child of part.parts ?? []) {
    const hit = findPart(child, mime);
    if (hit !== null) return hit;
  }
  return null;
}

/** E-mail só em HTML vira texto: remove marcação, estilos e scripts. */
export function htmlToText(html: string) {
  return html
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const summary = (m: any): MessageSummary => ({
  id: m.id, subject: header(m, "subject"), from: header(m, "from"), date: header(m, "date"), snippet: m.snippet ?? "",
});

export async function listMessages(token: string, q: string, max = 20): Promise<MessageSummary[]> {
  const qs = new URLSearchParams({ q, maxResults: String(max) });
  const { messages = [] } = await read<{ messages?: { id: string }[] }>(token, `/messages?${qs}`);
  const fields = "format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date";
  const full = await Promise.all(messages.map((m) => read<any>(token, `/messages/${encodeURIComponent(m.id)}?${fields}`)));
  return full.map(summary);
}

export type Contact = { name: string; email: string };

const ADDRESS = /(?:"?([^",<]*?)"?\s*)?<([^<>\s]+@[^<>\s]+)>|([^\s<>,;"]+@[^\s<>,;"]+)/g;
const AUTOMATED = /no-?reply|do-?not-?reply|mailer-daemon|notifications?@|bounce|postmaster/i;
const COMPANY = /@usereserva\.com$/i;

/** Nome e e-mail de cabeçalhos como: "Ana Lima" <ana@x.com>, joao@y.com */
export function parseAddresses(value: string): Contact[] {
  return [...value.matchAll(ADDRESS)].map((m) => ({ name: (m[1] ?? "").trim(), email: (m[2] ?? m[3]).toLowerCase() }));
}

/** Quem aparece nos e-mails recentes: primeiro a empresa, depois quem aparece mais. */
export async function recentContacts(token: string, self?: string | null): Promise<Contact[]> {
  const { messages = [] } = await read<{ messages?: { id: string }[] }>(token, "/messages?maxResults=100&q=newer_than%3A180d");
  const fields = "format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc";
  const seen = new Map<string, Contact & { count: number }>();
  // Em lotes: 100 chamadas de uma vez esbarram no limite de requisições do Gmail.
  for (let i = 0; i < messages.length; i += 20) {
    const batch = await Promise.all(messages.slice(i, i + 20).map((m) => read<any>(token, `/messages/${encodeURIComponent(m.id)}?${fields}`)));
    for (const m of batch) {
      for (const name of ["from", "to", "cc"]) {
        for (const c of parseAddresses(header(m, name))) {
          if (c.email === self?.toLowerCase() || AUTOMATED.test(c.email)) continue;
          const cur = seen.get(c.email);
          seen.set(c.email, { email: c.email, name: cur?.name || c.name, count: (cur?.count ?? 0) + 1 });
        }
      }
    }
  }
  const rank = (c: Contact) => (COMPANY.test(c.email) ? 0 : 1);
  return [...seen.values()]
    .sort((a, b) => rank(a) - rank(b) || b.count - a.count)
    .slice(0, 200)
    .map(({ name, email }) => ({ name, email }));
}

export async function getMessage(token: string, id: string): Promise<FullMessage> {
  const m = await read<any>(token, `/messages/${encodeURIComponent(id)}?format=full`);
  const plain = findPart(m.payload ?? {}, "text/plain");
  const html = plain === null ? findPart(m.payload ?? {}, "text/html") : null;
  return {
    ...summary(m), body: plain ?? (html ? htmlToText(html) : m.snippet ?? ""),
    threadId: m.threadId, messageId: header(m, "message-id"), replyTo: header(m, "reply-to"),
  };
}

/** Envia pela conta Google de quem está logado. Falta de escopo não derruba a conexão da Agenda. */
export async function sendGmail(
  to: string, subject: string, text: string,
  opts: { token?: string; threadId?: string; headers?: Record<string, string> } = {}
): Promise<SendResult> {
  if (!EMAIL.test(to)) return "failed";
  const token = opts.token ?? await accessToken();
  if (!token) return "not_connected";
  const extra = Object.entries(opts.headers ?? {}).map(([k, v]) => `${k}: ${v.replace(/[\r\n]+/g, " ")}`);
  const mime = [
    `To: ${to}`,
    `Subject: ${encodeHeader(subject.replace(/[\r\n]+/g, " "))}`,
    ...extra,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(text, "utf8").toString("base64"),
  ].join("\r\n");
  const res = await fetch(`${API}/messages/send`, {
    method: "POST",
    cache: "no-store",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw: Buffer.from(mime, "utf8").toString("base64url"), ...(opts.threadId ? { threadId: opts.threadId } : {}) }),
  });
  if (res.ok) return "sent";
  return res.status === 401 || res.status === 403 ? "not_connected" : "failed";
}
