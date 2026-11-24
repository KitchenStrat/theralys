/**
 * Envoi d'e-mails transactionnels (invitations client, plus tard reçus…).
 * Resend si RESEND_API_KEY est configurée, sinon mock : rien ne part, l'appelant
 * affiche le lien à transmettre manuellement.
 */

import { trackApiCall } from "@theralys/shared/usage-runtime";

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
 * réessayer plus tard, ou tout de suite avec `sendMailWithRetry`.
 */
export interface MailProvider {
  mode: "resend" | "mock";
  send(message: MailMessage): Promise<MailResult>;
}

/** Délai maximal d'un appel au fournisseur (ms). */
export const MAIL_TIMEOUT_MS = 15_000;
/** Relances par défaut de `sendMailWithRetry` sur échec transitoire. */
export const MAIL_RETRIES = 2;
/** Première attente avant une relance (ms), doublée à chaque relance quand le fournisseur n'en demande pas une. */
export const MAIL_RETRY_BASE_MS = 1_000;
/** Attente maximale avant une relance (ms), même si le fournisseur en demande davantage. */
export const MAIL_RETRY_MAX_WAIT_MS = 10_000;

/** Erreur transitoire du fournisseur (429, 5xx) : à réessayer, pas un refus. */
export class MailTransientError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** Attente demandée par le fournisseur (en-tête Retry-After), en ms ; null s'il n'en demande pas */
    readonly retryAfterMs: number | null = null,
  ) {
    super(message);
    this.name = "MailTransientError";
  }
}

/** En-tête Retry-After en secondes → ms ; null s'il est absent ou donné sous une autre forme. */
function retryAfterMs(response: Response): number | null {
  const seconds = Number(response.headers.get("retry-after"));
  return Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds * 1000) : null;
}

/**
 * Envoi avec relances sur échec transitoire (toute erreur levée par `send` :
 * 429, 5xx, délai dépassé, réseau) : `retries` relances au plus, après
 * l'attente demandée par le fournisseur (Retry-After) ou, à défaut, une
 * attente doublée à chaque relance — jamais plus de MAIL_RETRY_MAX_WAIT_MS.
 * Un refus définitif est rendu tel quel, sans relance. L'erreur de la
 * dernière tentative est levée si toutes échouent.
 */
export async function sendMailWithRetry(
  provider: MailProvider,
  message: MailMessage,
  opts: { retries?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<MailResult> {
  const retries = opts.retries ?? MAIL_RETRIES;
  const wait = opts.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  for (let attempt = 0; ; attempt++) {
    try {
      return await provider.send(message);
    } catch (err) {
      if (attempt >= retries) throw err;
      const asked = err instanceof MailTransientError ? err.retryAfterMs : null;
      await wait(Math.min(MAIL_RETRY_MAX_WAIT_MS, asked ?? MAIL_RETRY_BASE_MS * 2 ** attempt));
    }
  }
}

/** L'API de Resend. `RESEND_API_URL` la remplace dans un environnement d'essai (serveur local qui joue Resend). */
export const RESEND_API_URL = "https://api.resend.com";

export class ResendMailProvider implements MailProvider {
  mode = "resend" as const;
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly fetchImpl: typeof fetch = fetch,
    /** Adresse de l'API (sans barre finale) ; autre que celle de Resend seulement pour un environnement d'essai */
    private readonly baseUrl: string = RESEND_API_URL,
  ) {}

  async send(message: MailMessage): Promise<MailResult> {
    // Registre des appels API : e-mails compris dans l'abonnement, comptés pour l'activité (jamais le destinataire)
    return trackApiCall(
      { provider: "resend", operation: "email", costSource: "free" },
      () => this.sendOnce(message),
      (result) => (result.sent ? { units: 1 } : { status: "error", error: result.error ?? "E-mail refusé" }),
    );
  }

  private async sendOnce(message: MailMessage): Promise<MailResult> {
    const response = await this.fetchImpl(`${this.baseUrl}/emails`, {
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
      throw new MailTransientError(`Resend ${response.status} (transitoire): ${detail}`, response.status, retryAfterMs(response));
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
      fetch,
      (env.RESEND_API_URL || RESEND_API_URL).replace(/\/+$/, ""),
    );
  }
  return new MockMailProvider();
}
