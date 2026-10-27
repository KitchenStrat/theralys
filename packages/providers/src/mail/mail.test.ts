import { describe, expect, it, vi } from "vitest";
import { createMailProvider, MailTransientError, MAIL_TIMEOUT_MS, ResendMailProvider } from "./index";

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
