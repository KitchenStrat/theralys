import { afterEach, describe, expect, it, vi } from "vitest";
import { setApiUsageSink, setApiUsageSinkFactory, withApiUsage, type ResolvedApiUsageEvent } from "@theralys/shared/usage-runtime";
import { MailTransientError, ResendMailProvider, createMailProvider } from "./index";

const KEY = "re_cle_secrete_0123456789abcdef";
const FROM = "Harmony <bonjour@harmony-web.fr>";
const SITE_ID = "11111111-1111-4111-8111-111111111111";
const MESSAGE = { to: "claire.martin@exemple.fr", subject: "Votre site est prêt, Claire", text: "Bonjour Claire, votre site est en ligne.", html: "<p>Bonjour Claire, votre site est en ligne.</p>" };

function fetchReturning(status: number, body = ""): typeof fetch {
  return vi.fn(async () => new Response(body, { status })) as unknown as typeof fetch;
}

function provider(fetchImpl: typeof fetch) {
  return new ResendMailProvider(KEY, FROM, fetchImpl);
}

function capture(): ResolvedApiUsageEvent[] {
  const events: ResolvedApiUsageEvent[] = [];
  setApiUsageSink(async (event) => {
    events.push(event);
  });
  return events;
}

/** Rien du message (destinataire, objet, texte) ni la clé ne doit figurer dans un événement. */
function expectNothingPrivate(events: ResolvedApiUsageEvent[]) {
  const dump = JSON.stringify(events);
  for (const secret of [MESSAGE.to, "claire.martin", MESSAGE.subject, MESSAGE.text, KEY]) expect(dump).not.toContain(secret);
}

afterEach(() => {
  setApiUsageSink(null);
  setApiUsageSinkFactory(null);
  vi.restoreAllMocks();
});

describe("ResendMailProvider.send — registre des appels API", () => {
  it("e-mail envoyé : un événement resend / email, gratuit, une unité, rattaché au contexte — sans le destinataire", async () => {
    const events = capture();
    const result = await withApiUsage({ feature: "notifications", siteId: SITE_ID }, () => provider(fetchReturning(200, '{"id":"49a3999c-0ce1-4ea6-ab68-afcd6dc2e794"}')).send(MESSAGE));
    expect(result).toEqual({ sent: true });
    expect(events).toHaveLength(1);
    const { createdAt, durationMs, ...event } = events[0]!;
    expect(event).toEqual({
      provider: "resend",
      operation: "email",
      feature: "notifications",
      siteId: SITE_ID,
      model: null,
      status: "ok",
      requests: 1,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      units: 1,
      costUsd: 0,
      costSource: "free",
      error: null,
      meta: null,
    });
    expect(createdAt).toBeInstanceOf(Date);
    expect(durationMs).toBeGreaterThanOrEqual(0);
    expectNothingPrivate(events);
  });

  it("e-mail refusé (4xx définitif) : `{ sent: false, error }` rendu sans exception, événement en erreur sans unité", async () => {
    const events = capture();
    const refused = await withApiUsage({ feature: "notifications", siteId: SITE_ID }, () => provider(fetchReturning(422, '{"statusCode":422,"name":"validation_error",\n  "message":"Invalid `from` field."}')).send(MESSAGE));
    expect(refused.sent).toBe(false);
    expect(refused.error).toMatch(/^Resend 422: /);
    const forbidden = await provider(fetchReturning(403, "The harmony-web.fr domain is not verified.")).send(MESSAGE);
    expect(forbidden).toEqual({ sent: false, error: "Resend 403: The harmony-web.fr domain is not verified." });
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      provider: "resend",
      operation: "email",
      feature: "notifications",
      siteId: SITE_ID,
      status: "error",
      units: 0,
      costUsd: 0,
      costSource: "free",
      // Sur une ligne, comme tout message d'erreur du registre
      error: 'Resend 422: {"statusCode":422,"name":"validation_error", "message":"Invalid `from` field."}',
    });
    expect(events[1]).toMatchObject({ status: "error", units: 0, error: "Resend 403: The harmony-web.fr domain is not verified.", feature: null, siteId: null });
    expectNothingPrivate(events);
  });

  it("erreur transitoire (429, 5xx) : levée pour une nouvelle tentative, et inscrite en erreur", async () => {
    const events = capture();
    const limited = provider(fetchReturning(429, "rate limited"));
    const err = await withApiUsage({ feature: "notifications", siteId: SITE_ID }, () => limited.send(MESSAGE)).then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(MailTransientError);
    expect(err).toMatchObject({ status: 429 });
    await expect(provider(fetchReturning(503, "")).send(MESSAGE)).rejects.toMatchObject({ status: 503 });
    expect(events.map((event) => [event.status, event.units, event.costUsd, event.costSource, event.error, event.feature])).toEqual([
      ["error", 0, 0, "free", "Resend 429 (transitoire): rate limited", "notifications"],
      ["error", 0, 0, "free", "Resend 503 (transitoire):", null],
    ]);
    expectNothingPrivate(events);
  });

  it("erreur réseau ou délai dépassé : inscrite en erreur, l'erreur d'origine est relancée", async () => {
    const events = capture();
    const failure = new TypeError("fetch failed");
    const failing = vi.fn(async () => {
      throw failure;
    }) as unknown as typeof fetch;
    await expect(provider(failing).send(MESSAGE)).rejects.toBe(failure);
    expect(events.map((event) => [event.provider, event.operation, event.status, event.units, event.error])).toEqual([["resend", "email", "error", 0, "fetch failed"]]);
    expectNothingPrivate(events);
  });

  it("chaque envoi est compté : trois e-mails, trois événements, chacun avec le contexte de son appel", async () => {
    const events = capture();
    const mail = provider(fetchReturning(200, "{}"));
    await Promise.all([
      withApiUsage({ feature: "notifications", siteId: "site-a" }, () => mail.send(MESSAGE)),
      withApiUsage({ feature: "notifications", siteId: "site-b" }, () => mail.send({ ...MESSAGE, to: "paul@exemple.fr" })),
      withApiUsage({ feature: "notifications" }, () => mail.send(MESSAGE)),
    ]);
    expect(events).toHaveLength(3);
    expect(events.map((event) => String(event.siteId)).sort()).toEqual(["null", "site-a", "site-b"]);
    expect(events.reduce((sum, event) => sum + event.units, 0)).toBe(3);
  });

  it("sans puits : l'e-mail part, le refus est rendu, l'erreur transitoire levée", async () => {
    await expect(provider(fetchReturning(200, "{}")).send(MESSAGE)).resolves.toEqual({ sent: true });
    await expect(provider(fetchReturning(422, "refus")).send(MESSAGE)).resolves.toEqual({ sent: false, error: "Resend 422: refus" });
    await expect(provider(fetchReturning(500, "panne")).send(MESSAGE)).rejects.toBeInstanceOf(MailTransientError);
  });

  // Le détail d'un refus (ou d'une erreur transitoire) est le corps de la réponse de Resend : une adresse qu'il
  // recopie est masquée avant d'entrer dans le registre (et de s'afficher dans l'admin).
  it("le destinataire ne figure jamais dans l'événement, même quand la réponse de Resend le recopie", async () => {
    const events = capture();
    await provider(fetchReturning(422, `{"name":"validation_error","message":"Invalid \`to\` field: ${MESSAGE.to} is not a valid address."}`)).send(MESSAGE);
    await provider(fetchReturning(503, `Mailbox ${MESSAGE.to} temporarily unavailable`)).send(MESSAGE).catch(() => undefined);
    expect(events).toHaveLength(2);
    expect(JSON.stringify(events)).not.toContain(MESSAGE.to);
    expect(events.map((event) => event.error)).toEqual([expect.stringContaining("[adresse masquée] is not a valid address"), expect.stringContaining("Mailbox [adresse masquée] temporarily unavailable")]);
  });
});

describe("fournisseur d'e-mails factice — registre des appels API", () => {
  it("sans clé Resend : rien ne part, rien n'est inscrit", async () => {
    const events = capture();
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const mock = createMailProvider({} as NodeJS.ProcessEnv);
    expect(mock.mode).toBe("mock");
    await expect(mock.send(MESSAGE)).resolves.toEqual({ sent: false });
    expect(log).toHaveBeenCalledTimes(1);
    expect(events).toHaveLength(0);
  });
});
