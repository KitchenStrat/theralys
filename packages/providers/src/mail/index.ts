/**
 * Envoi d'e-mails transactionnels (invitations client, plus tard reçus…).
 * Resend si RESEND_API_KEY est configurée, sinon mock : rien ne part, l'appelant
 * affiche le lien à transmettre manuellement.
 */

export type MailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export type MailResult = { sent: boolean; error?: string };

/**
 * `send` rend `{ sent: false, error }` pour un refus définitif (4xx autre que
 * 429 : adresse invalide, domaine non vérifié…) et LÈVE une erreur pour un
 * échec transitoire (429, 5xx, délai dépassé, réseau) : l'appelant peut
 * réessayer plus tard.
 */
export interface MailProvider {
  mode: "resend" | "mock";
  send(message: MailMessage): Promise<MailResult>;
}

/** Délai maximal d'un appel au fournisseur (ms). */
export const MAIL_TIMEOUT_MS = 15_000;

/** Erreur transitoire du fournisseur (429, 5xx) : à réessayer, pas un refus. */
export class MailTransientError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "MailTransientError";
  }
}

export class ResendMailProvider implements MailProvider {
  mode = "resend" as const;
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async send(message: MailMessage): Promise<MailResult> {
    const response = await this.fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: this.from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        ...(message.html ? { html: message.html } : {}),
      }),
      signal: AbortSignal.timeout(MAIL_TIMEOUT_MS),
    });
    if (response.status === 429 || response.status >= 500) {
      const detail = (await response.text()).slice(0, 300);
      throw new MailTransientError(`Resend ${response.status} (transitoire): ${detail}`, response.status);
    }
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 300);
      return { sent: false, error: `Resend ${response.status}: ${detail}` };
    }
    return { sent: true };
  }
}

class MockMailProvider implements MailProvider {
  mode = "mock" as const;
  async send(message: MailMessage): Promise<MailResult> {
    console.log(`[mail mock] à: ${message.to} — ${message.subject}`);
    return { sent: false };
  }
}

export function createMailProvider(env: NodeJS.ProcessEnv = process.env): MailProvider {
  if (env.RESEND_API_KEY) {
    return new ResendMailProvider(
      env.RESEND_API_KEY,
      env.MAIL_FROM ?? "Harmony <onboarding@resend.dev>",
    );
  }
  return new MockMailProvider();
}
