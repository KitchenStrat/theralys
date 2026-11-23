import { describe, expect, it, vi } from "vitest";
import { createMailProvider, MailTransientError, MAIL_RETRIES, MAIL_RETRY_MAX_WAIT_MS, MAIL_TIMEOUT_MS, ResendMailProvider, sendMailWithRetry, type MailProvider } from "./index";

const message = { to: "claire@exemple.fr", subject: "Sujet", text: "Texte" };

function fetchReturning(status: number, body = ""): typeof fetch {
  return vi.fn(async () => new Response(body, { status })) as unknown as typeof fetch;
}

describe("ResendMailProvider", () => {
  it("200 → envoyé ; corps, en-têtes et délai d'abandon transmis", async () => {
    const fetchImpl = fetchReturning(200, "{}");
    const provider = new ResendMailProvider("re_test", "Harmony <bonjour@harmony-web.fr>", fetchImpl);
    await expect(provider.send({ ...message, html: "<p>Texte</p>" })).resolves.toEqual({ sent: true });
    const call = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(call[0]).toBe("https://api.resend.com/emails");
    const init = call[1] as RequestInit;
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer re_test");
    expect(JSON.parse(init.body as string)).toEqual({
      from: "Harmony <bonjour@harmony-web.fr>",
      to: ["claire@exemple.fr"],
      subject: "Sujet",
      text: "Texte",
      html: "<p>Texte</p>",
    });
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(MAIL_TIMEOUT_MS).toBe(15_000);
  });

  it("4xx définitif (422, 403) → refus rendu, pas d'exception", async () => {
    const provider = new ResendMailProvider("re_test", "x@y.fr", fetchReturning(422, '{"message":"Invalid to"}'));
    await expect(provider.send(message)).resolves.toEqual({ sent: false, error: 'Resend 422: {"message":"Invalid to"}' });
    const forbidden = new ResendMailProvider("re_test", "x@y.fr", fetchReturning(403, "domain not verified"));
    await expect(forbidden.send(message)).resolves.toMatchObject({ sent: false, error: "Resend 403: domain not verified" });
  });

  it("429 et 5xx → erreur transitoire levée", async () => {
    const limited = new ResendMailProvider("re_test", "x@y.fr", fetchReturning(429, "rate limited"));
    await expect(limited.send(message)).rejects.toBeInstanceOf(MailTransientError);
    await expect(limited.send(message)).rejects.toMatchObject({ status: 429, message: "Resend 429 (transitoire): rate limited" });
    const down = new ResendMailProvider("re_test", "x@y.fr", fetchReturning(503, ""));
    await expect(down.send(message)).rejects.toMatchObject({ status: 503 });
  });

  it("erreur réseau ou délai dépassé → exception propagée (transitoire)", async () => {
    const failing = vi.fn(async () => {
      throw new Error("fetch failed");
    }) as unknown as typeof fetch;
    const provider = new ResendMailProvider("re_test", "x@y.fr", failing);
    await expect(provider.send(message)).rejects.toThrow("fetch failed");
  });
});

describe("createMailProvider", () => {
  it("mock sans clé (rien ne part), Resend avec RESEND_API_KEY", async () => {
    const mock = createMailProvider({} as NodeJS.ProcessEnv);
    expect(mock.mode).toBe("mock");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await expect(mock.send(message)).resolves.toEqual({ sent: false });
    log.mockRestore();
    expect(createMailProvider({ RESEND_API_KEY: "re_x" } as NodeJS.ProcessEnv).mode).toBe("resend");
  });
});

describe("sendMailWithRetry", () => {
  /** Fournisseur qui suit un scénario : une erreur levée ou un résultat par tentative. */
  function scripted(...steps: (Error | { sent: boolean; error?: string })[]) {
    let attempts = 0;
    const provider: MailProvider = {
      mode: "resend",
      send: async () => {
        const step = steps[Math.min(attempts++, steps.length - 1)]!;
        if (step instanceof Error) throw step;
        return step;
      },
    };
    return { provider, attempts: () => attempts };
  }
  const waits: number[] = [];
  const sleep = async (ms: number) => void waits.push(ms);
  const limited = (retryAfterMs: number | null = null) => new MailTransientError("Resend 429 (transitoire): rate limited", 429, retryAfterMs);

  it("erreur transitoire puis réussite : relancé, l'e-mail part", async () => {
    waits.length = 0;
    const { provider, attempts } = scripted(limited(), new MailTransientError("Resend 503 (transitoire): ", 503), { sent: true });
    await expect(sendMailWithRetry(provider, message, { sleep })).resolves.toEqual({ sent: true });
    expect(attempts()).toBe(3);
    // Sans attente demandée par le fournisseur : 1 s, puis 2 s
    expect(waits).toEqual([1_000, 2_000]);
  });

  it("429 avec Retry-After : l'attente demandée est respectée, bornée à 10 s", async () => {
    waits.length = 0;
    const { provider } = scripted(limited(3_000), limited(120_000), { sent: true });
    await sendMailWithRetry(provider, message, { sleep });
    expect(waits).toEqual([3_000, MAIL_RETRY_MAX_WAIT_MS]);
    expect(MAIL_RETRY_MAX_WAIT_MS).toBe(10_000);
  });

  it("erreur qui persiste : 2 relances par défaut, puis l'erreur de la dernière tentative", async () => {
    waits.length = 0;
    const { provider, attempts } = scripted(limited());
    await expect(sendMailWithRetry(provider, message, { sleep })).rejects.toMatchObject({ status: 429 });
    expect(MAIL_RETRIES).toBe(2);
    expect(attempts()).toBe(3);
    expect(waits).toHaveLength(2);
    // Nombre de relances au choix de l'appelant
    const once = scripted(limited());
    await expect(sendMailWithRetry(once.provider, message, { sleep, retries: 0 })).rejects.toBeInstanceOf(MailTransientError);
    expect(once.attempts()).toBe(1);
  });

  it("délai dépassé ou réseau coupé : relancé aussi", async () => {
    waits.length = 0;
    const { provider, attempts } = scripted(new DOMException("The operation was aborted due to timeout", "TimeoutError"), new TypeError("fetch failed"), { sent: true });
    await expect(sendMailWithRetry(provider, message, { sleep })).resolves.toEqual({ sent: true });
    expect(attempts()).toBe(3);
  });

  it("refus définitif (adresse invalide, domaine non vérifié) : rendu tel quel, aucune relance", async () => {
    waits.length = 0;
    const { provider, attempts } = scripted({ sent: false, error: "Resend 422: Invalid to" });
    await expect(sendMailWithRetry(provider, message, { sleep })).resolves.toEqual({ sent: false, error: "Resend 422: Invalid to" });
    expect(attempts()).toBe(1);
    expect(waits).toEqual([]);
  });

  it("Resend : l'en-tête Retry-After d'un 429 est lu (secondes → ms) ; absent ou illisible → null", async () => {
    const respond = (headers: Record<string, string>) => vi.fn(async () => new Response("rate limited", { status: 429, headers })) as unknown as typeof fetch;
    const send = (headers: Record<string, string>) => new ResendMailProvider("re_test", "x@y.fr", respond(headers)).send(message).catch((err: unknown) => err);
    expect(await send({ "retry-after": "2" })).toMatchObject({ status: 429, retryAfterMs: 2_000 });
    expect(await send({ "retry-after": "0.5" })).toMatchObject({ retryAfterMs: 500 });
    expect(await send({})).toMatchObject({ status: 429, retryAfterMs: null });
    expect(await send({ "retry-after": "Wed, 21 Oct 2026 07:28:00 GMT" })).toMatchObject({ retryAfterMs: null });
  });
});
