import { afterEach, describe, expect, it, vi } from "vitest";
import { BOOKING_PLATFORM_HOSTS, EXTERNAL_PASTE_FALLBACK_ERRORS, EXTERNAL_SITE_LIMITS, bookingPlatformOf, cleanPhone, cleanSocialLinks, isExternalReadError, normalizeExternalSiteUrl } from "@theralys/shared";
import { setApiUsageSink, type ResolvedApiUsageEvent } from "@theralys/shared/usage-runtime";
import { createWebsiteReader } from "./index";
import { createMockWebsiteReader, mockSite } from "./mock";
import { sha256Hex } from "./text";

const NOW = new Date("2026-11-12T09:30:00.000Z");
const reader = createMockWebsiteReader({ now: () => NOW });

afterEach(() => {
  setApiUsageSink(null);
  vi.unstubAllGlobals();
});

describe("lecteur de démonstration", () => {
  it("EXTERNAL_SITE_MOCK=1 (ou true) rend le lecteur de démonstration ; sinon le lecteur réel", () => {
    expect(createWebsiteReader({ EXTERNAL_SITE_MOCK: "1" }).mode).toBe("mock");
    expect(createWebsiteReader({ EXTERNAL_SITE_MOCK: "true" }).mode).toBe("mock");
    for (const value of [undefined, "", "0", "false", "non"]) expect(createWebsiteReader({ EXTERNAL_SITE_MOCK: value }).mode, String(value)).toBe("live");
  });

  it("un site plausible : accueil, à propos, trois spécialités, tarifs, contact — sans aucun accès réseau", async () => {
    const network = vi.fn(() => Promise.reject(new Error("réseau interdit")));
    vi.stubGlobal("fetch", network);
    const outcome = await reader.read("https://www.cabinet-des-lilas.fr");
    expect(network).not.toHaveBeenCalled();
    if (!outcome.ok) throw new Error("lecture attendue");
    expect(outcome.url).toBe("https://www.cabinet-des-lilas.fr");
    expect(outcome.pages.map((page) => page.kind)).toEqual(["home", "about", "specialty", "specialty", "specialty", "pricing", "contact"]);
    expect(outcome.skipped).toEqual({ robots: 0, failed: 0 });
    expect(outcome.pages[0]!.url).toBe("https://www.cabinet-des-lilas.fr/");
    expect(outcome.pages[1]!.url).toBe("https://www.cabinet-des-lilas.fr/a-propos");
    expect(outcome.pages[5]!.url).toBe("https://www.cabinet-des-lilas.fr/tarifs");
    expect(new Set(outcome.pages.map((page) => page.url)).size).toBe(7);
  });

  it("chaque page respecte le contrat : texte borné, empreinte, date, intertitres présents dans le texte", async () => {
    const outcome = await reader.read("https://www.cabinet-des-lilas.fr");
    if (!outcome.ok) throw new Error("lecture attendue");
    for (const page of outcome.pages) {
      expect(page.title.length).toBeGreaterThan(5);
      expect(page.description!.length).toBeGreaterThan(20);
      expect(page.text.length).toBeGreaterThan(250);
      expect(page.text.length).toBeLessThanOrEqual(EXTERNAL_SITE_LIMITS.pageChars);
      expect(page.hash).toBe(sha256Hex(page.text));
      expect(page.fetchedAt).toBe("2026-11-12T09:30:00.000Z");
      expect(page.headings.length).toBeGreaterThan(1);
      for (const heading of page.headings) expect(page.text.split("\n"), heading).toContain(heading);
      expect(page.url.startsWith("https://www.cabinet-des-lilas.fr/")).toBe(true);
    }
    expect(outcome.pages.reduce((sum, page) => sum + page.text.length, 0)).toBeGreaterThan(EXTERNAL_SITE_LIMITS.minChars * 5);
    expect(outcome.pages[5]!.text).toMatch(/\| \d+ €/);
  });

  it("faits : nom tiré de l'hôte, téléphone, courriel, adresse, horaires, un lien de rendez-vous sur une plateforme connue, un réseau social", async () => {
    const outcome = await reader.read("https://www.cabinet-des-lilas.fr");
    if (!outcome.ok) throw new Error("lecture attendue");
    const { facts } = outcome;
    expect(facts.name).toBe("Cabinet Des Lilas");
    expect(facts.language).toBe("fr");
    expect(facts.phones).toHaveLength(1);
    expect(cleanPhone(facts.phones[0])).toBe(facts.phones[0]);
    expect(facts.emails).toEqual(["contact@cabinet-des-lilas.fr"]);
    expect(facts.address).toMatch(/^\d+ [^,]+, \d{5} \p{Lu}/u);
    expect(facts.hours.length).toBeGreaterThan(0);
    expect(facts.bookingLinks).toHaveLength(1);
    const booking = facts.bookingLinks[0]!;
    expect(booking.platform).not.toBeNull();
    expect(bookingPlatformOf(booking.url)).toBe(booking.platform);
    expect(BOOKING_PLATFORM_HOSTS.some((host) => new URL(booking.url).hostname.endsWith(host))).toBe(true);
    expect(Object.keys(facts.social)).toHaveLength(1);
    // Le lien social respecte les règles du contrat (page de profil sur l'hôte du réseau)
    expect(cleanSocialLinks(facts.social)).toEqual(facts.social);
    // Les coordonnées des faits sont celles que montrent les pages
    expect(outcome.pages.at(-1)!.text).toContain(facts.phones[0]!);
    expect(outcome.pages.at(-1)!.text).toContain(facts.address!);
  });

  it("rien de réel : numéros des tranches réservées à la fiction, liens préfixés « demo »", async () => {
    for (const host of ["cabinet-des-lilas.fr", "sophro-zen.fr", "mon-naturopathe.com", "espace-bien-etre-rennes.fr", "a.fr", "hypnose-toulouse.fr"]) {
      const outcome = await reader.read(`https://${host}`);
      if (!outcome.ok) throw new Error("lecture attendue");
      expect(outcome.facts.phones[0], host).toMatch(/^(?:02 61 91|04 65 71|05 36 49) \d{2} \d{2}$/);
      expect(outcome.facts.bookingLinks[0]!.url, host).toContain("/demo-");
      expect(outcome.facts.social.instagram, host).toMatch(/^https:\/\/www\.instagram\.com\/demo\./);
    }
  });

  it("déterministe : une même adresse rend toujours le même site ; avec ou sans « www. » aussi", async () => {
    const first = await reader.read("https://www.cabinet-des-lilas.fr");
    const second = await reader.read("https://www.cabinet-des-lilas.fr");
    expect(second).toEqual(first);
    const bare = await reader.read("https://cabinet-des-lilas.fr");
    if (!first.ok || !bare.ok) throw new Error("lecture attendue");
    expect(bare.facts).toEqual(first.facts);
    expect(bare.pages.map((page) => page.text)).toEqual(first.pages.map((page) => page.text));
    expect(bare.url).toBe("https://cabinet-des-lilas.fr");
  });

  it("des hôtes différents rendent des sites différents (métier, ville, praticien)", async () => {
    const titles = new Set<string>();
    const phones = new Set<string>();
    for (let i = 0; i < 24; i++) {
      const outcome = await reader.read(`https://cabinet-numero-${i}.fr`);
      if (!outcome.ok) throw new Error("lecture attendue");
      titles.add(outcome.pages[0]!.title.replace(/^.* — /, ""));
      phones.add(outcome.facts.phones[0]!);
    }
    expect(titles.size).toBeGreaterThan(6);
    expect(phones.size).toBeGreaterThan(12);
  });

  it("l'adresse rendue garde le chemin de base ; les pages sont rangées dessous", () => {
    const site = mockSite("https://www.plateforme.fr/mon-cabinet/", NOW.toISOString());
    expect(site.url).toBe("https://www.plateforme.fr/mon-cabinet");
    expect(site.pages.map((page) => new URL(page.url).pathname).slice(0, 2)).toEqual(["/mon-cabinet/", "/mon-cabinet/a-propos"]);
    // L'adresse rendue est une adresse de site valide pour le contrat
    expect(normalizeExternalSiteUrl(site.url)).toMatchObject({ ok: true, url: site.url });
  });

  it("maxPages borne le nombre de pages, sans jamais dépasser la limite du contrat", async () => {
    const three = await reader.read("https://www.cabinet-des-lilas.fr", { maxPages: 3 });
    if (!three.ok) throw new Error("lecture attendue");
    expect(three.pages.map((page) => page.kind)).toEqual(["home", "about", "specialty"]);
    for (const maxPages of [0, -4, Number.NaN]) {
      const one = await reader.read("https://www.cabinet-des-lilas.fr", { maxPages });
      expect(one.ok && one.pages.length, String(maxPages)).toBe(1);
    }
    const many = await reader.read("https://www.cabinet-des-lilas.fr", { maxPages: 500 });
    expect(many.ok && many.pages.length).toBe(7);
  });

  it("hôtes d'essai des parcours d'échec : demo-bloque, demo-robots, demo-vide, demo-injoignable, demo-lent", async () => {
    const cases = { "demo-bloque.fr": "blocked", "www.demo-robots.fr": "robots", "demo-vide.fr": "empty", "demo-injoignable.fr": "unreachable", "demo-lent-cabinet.fr": "timeout" } as const;
    for (const [host, error] of Object.entries(cases)) {
      const outcome = await reader.read(`https://${host}`);
      expect(outcome, host).toMatchObject({ ok: false, error });
      expect(isExternalReadError(error)).toBe(true);
    }
    // Les échecs qui proposent de coller le texte sont essayables hors ligne
    for (const error of ["blocked", "robots", "empty"] as const) expect(EXTERNAL_PASTE_FALLBACK_ERRORS).toContain(error);
    expect((await reader.read("https://demo-autre.fr")).ok).toBe(true);
    expect((await reader.read("https://cabinet-demo-bloque.fr")).ok).toBe(true);
  });

  it("ne lève jamais : adresse illisible ou lecture déjà interrompue → échec rendu", async () => {
    await expect(reader.read("pas une adresse")).resolves.toMatchObject({ ok: false, error: "unsafe" });
    await expect(reader.read("https://www.cabinet-des-lilas.fr", { signal: AbortSignal.abort() })).resolves.toMatchObject({ ok: false, error: "internal" });
  });

  it("le lecteur de démonstration n'inscrit rien au registre des appels API", async () => {
    const events: ResolvedApiUsageEvent[] = [];
    setApiUsageSink(async (event) => {
      events.push(event);
    });
    await createWebsiteReader({ EXTERNAL_SITE_MOCK: "1" }).read("https://www.cabinet-des-lilas.fr");
    await createWebsiteReader({ EXTERNAL_SITE_MOCK: "1" }).read("https://demo-bloque.fr");
    expect(events).toEqual([]);
  });
});
