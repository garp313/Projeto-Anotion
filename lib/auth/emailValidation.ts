// Lista de provedores de e-mail pessoais/gratuitos proibidos
export const BLOCKED_EMAIL_DOMAINS = [
  "gmail.com",
  "googlemail.com",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "msn.com",
  "yahoo.com",
  "yahoo.com.br",
  "icloud.com",
  "me.com",
  "mac.com",
  "proton.me",
  "protonmail.com",
  "aol.com",
  "zoho.com",
  "mail.com",
  "bol.com.br",
  "uol.com.br",
  "terra.com.br",
  "ig.com.br",
  "globomail.com",
];

export function isCorporateEmail(email: string | null | undefined): {
  isValid: boolean;
  reason?: string;
  domain?: string;
} {
  if (!email || !email.includes("@")) {
    return { isValid: false, reason: "E-mail inválido." };
  }

  const domain = email.split("@")[1].toLowerCase().trim();

  // Se houver domínios específicos configurados no .env.local
  const allowedDomainsEnv = process.env.NEXT_PUBLIC_ALLOWED_EMAIL_DOMAINS;
  if (allowedDomainsEnv && allowedDomainsEnv.trim().length > 0) {
    const allowed = allowedDomainsEnv
      .split(",")
      .map((d) => d.trim().toLowerCase().replace(/^@/, ""));

    if (!allowed.includes(domain)) {
      return {
        isValid: false,
        reason: `Apenas e-mails dos domínios autorizados (${allowed.join(", ")}) podem acessar.`,
        domain,
      };
    }
    return { isValid: true, domain };
  }

  // Validação padrão: bloqueia e-mails pessoais
  if (BLOCKED_EMAIL_DOMAINS.includes(domain)) {
    return {
      isValid: false,
      reason: "E-mails pessoais (@gmail.com, @hotmail.com, etc.) não são permitidos. Por favor, use seu e-mail corporativo.",
      domain,
    };
  }

  return { isValid: true, domain };
}
