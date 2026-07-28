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

export interface MailProvider {
  mode: "resend" | "mock";
  send(message: MailMessage): Promise<MailResult>;
}

class ResendMailProvider implements MailProvider {
  mode = "resend" as const;
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async send(message: MailMessage): Promise<MailResult> {
    const response = await fetch("https://api.resend.com/emails", {
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
    });
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
