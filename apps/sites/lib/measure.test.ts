import { ANALYTICS_ORIGIN_EXTERNAL, type ExternalMeasurePayload } from "@theralys/shared";
import { describe, expect, it } from "vitest";
import {
  MEASURE_BODY_MAX_BYTES,
  decideMeasureEvent,
  externalMeasureSource,
  isMeasureSchemaMissing,
  measureVisitorScope,
  readBoundedText,
  screenMeasureRequest,
  senderHost,
  type MeasureTarget,
} from "./measure";

const KEY = "abcdefghijklmnopqrstuvwx";
const SITE_ID = "b6bed027-6656-4734-926f-501605751fdc";
const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const SITE_URL = "https://www.mon-cabinet.fr";

const target = (overrides: Partial<MeasureTarget> = {}): MeasureTarget => ({
  id: "3f0c7a52-5d0e-4a5b-9a43-0d7f4f0f6b11",
  siteId: SITE_ID,
  url: SITE_URL,
  measureSeenAt: new Date("2026-11-01T08:00:00Z"),
  siteStatus: "published",
  bookingUrl: "https://www.doctolib.fr/sophrologue/albi/claire-dupont",
  ...overrides,
});

const pageview = (overrides: Partial<ExternalMeasurePayload> = {}): ExternalMeasurePayload => ({ k: KEY, t: "p", p: "/tarifs", ...overrides });
const from = (origin: string | null, referer: string | null = null) => ({ origin, referer });

describe("screenMeasureRequest", () => {
  const body = JSON.stringify({ k: KEY, t: "p", p: "/tarifs?utm_source=google#seance", r: "WWW.Google.com" });

  it("visite conforme : gardée, chemin sans paramètre ni ancre", () => {
    expect(screenMeasureRequest(body, CHROME)).toEqual({ ok: true, payload: { k: KEY, t: "p", p: "/tarifs", r: "www.google.com" } });
  });

  it("corps absent, illisible, trop long ou hors contrat : ignoré", () => {
    for (const invalid of [
      null,
      undefined,
      "",
      "pas du JSON",
      "[]",
      JSON.stringify({ t: "p", p: "/" }),
      JSON.stringify({ k: "trop-court", t: "p", p: "/" }),
      JSON.stringify({ k: KEY, t: "x", p: "/" }),
      JSON.stringify({ k: KEY, t: "toString", p: "/" }),
      JSON.stringify({ k: KEY, t: "p", p: `/${"a".repeat(1000)}` }),
      // Caractère de contrôle dans le chemin : un navigateur ne l'envoie jamais tel quel, et la base refuserait le caractère nul
      JSON.stringify({ k: KEY, t: "p", p: `/tarifs${String.fromCharCode(0)}` }),
      JSON.stringify({ k: KEY, t: "p", p: `/tarifs${String.fromCharCode(10)}suite` }),
      JSON.stringify({ k: KEY, t: "p", p: `/${String.fromCharCode(0x1b)}[2J` }),
    ]) {
      expect(screenMeasureRequest(invalid, CHROME), String(invalid).slice(0, 40)).toEqual({ ok: false, reason: "invalid" });
    }
  });

  it("robot : ignoré, même règle que /api/track", () => {
    expect(screenMeasureRequest(body, "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)")).toEqual({ ok: false, reason: "bot" });
    expect(screenMeasureRequest(body, "Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/131.0.0.0 Safari/537.36")).toEqual({ ok: false, reason: "bot" });
    // Sans User-Agent : compté, comme sur le site hébergé
    expect(screenMeasureRequest(body, null).ok).toBe(true);
  });

  it("un corps invalide l'emporte sur le robot : aucune clé à chercher", () => {
    expect(screenMeasureRequest("{", "Googlebot")).toEqual({ ok: false, reason: "invalid" });
  });
});

describe("decideMeasureEvent — visites ignorées", () => {
  it("clé inconnue", () => {
    expect(decideMeasureEvent(pageview(), null, from(SITE_URL))).toEqual({ ok: false, reason: "unknown_key" });
  });

  it("site archivé (abonnement arrêté)", () => {
    expect(decideMeasureEvent(pageview(), target({ siteStatus: "archived" }), from(SITE_URL))).toEqual({ ok: false, reason: "archived" });
  });

  it("page émettrice hors du site du client", () => {
    for (const sender of [
      from("https://autre-site.fr"),
      from("https://mon-cabinet.fr.exemple.com"),
      from("https://blog.mon-cabinet.fr"),
      from("https://faux-mon-cabinet.fr"),
      // Le site hébergé lui-même n'est pas le site du client
      from("https://demo.harmony-web.fr"),
      // Origin lisible : c'est lui qui compte, même si Referer désigne le site
      from("https://autre-site.fr", `${SITE_URL}/tarifs`),
      // Ni Origin ni Referer (outil en ligne de commande), ou illisibles
      from(null),
      from("null"),
      from("null", "pas une adresse"),
      from("", ""),
      from("file://"),
      from("chrome-extension://abcdefghijklmnop"),
    ]) {
      expect(decideMeasureEvent(pageview(), target(), sender), JSON.stringify(sender)).toEqual({ ok: false, reason: "origin" });
    }
  });

  it("hôte partagé (Google Sites) : la page comptée doit être dans le dossier du site, pas dans celui d'un autre site du même hôte", () => {
    const shared = target({ url: "https://sites.google.com/view/cabinet-dupont" });
    const sender = from("https://sites.google.com");
    for (const path of ["/view/cabinet-dupont", "/view/cabinet-dupont/tarifs", "/view/cabinet-dupont/seances/hypnose"]) {
      expect(decideMeasureEvent(pageview({ p: path }), shared, sender), path).toMatchObject({ ok: true, event: { path } });
    }
    for (const path of ["/", "/view/site-d-un-tiers", "/view/site-d-un-tiers/tarifs", "/view/cabinet-dupont-bis", "/view", "/site/cabinet-dupont"]) {
      expect(decideMeasureEvent(pageview({ p: path }), shared, sender), path).toEqual({ ok: false, reason: "origin" });
    }
    // Un site qui a son propre hôte n'est pas concerné, même enregistré sous un chemin
    expect(decideMeasureEvent(pageview({ p: "/tarifs" }), target({ url: "https://www.mon-cabinet.fr/fr" }), from("https://www.mon-cabinet.fr")).ok).toBe(true);
  });

  it("adresse du site du client illisible en base : rien n'est accepté", () => {
    expect(decideMeasureEvent(pageview(), target({ url: "pas une adresse" }), from(SITE_URL))).toEqual({ ok: false, reason: "origin" });
  });
});

describe("decideMeasureEvent — visites acceptées", () => {
  it("page émettrice sur le site du client, avec ou sans « www. », en http ou https, quel que soit le port", () => {
    for (const origin of ["https://www.mon-cabinet.fr", "https://mon-cabinet.fr", "http://mon-cabinet.fr", "https://WWW.Mon-Cabinet.FR", "https://www.mon-cabinet.fr:8443"]) {
      expect(decideMeasureEvent(pageview(), target(), from(origin)).ok, origin).toBe(true);
    }
    // Site déclaré sans « www. » : les deux formes sont acceptées aussi
    for (const origin of ["https://mon-cabinet.fr", "https://www.mon-cabinet.fr"]) {
      expect(decideMeasureEvent(pageview(), target({ url: "https://mon-cabinet.fr/cabinet" }), from(origin)).ok, origin).toBe(true);
    }
  });

  it("sans Origin (ou « null ») : le Referer en tient lieu", () => {
    expect(decideMeasureEvent(pageview(), target(), from(null, "https://www.mon-cabinet.fr/tarifs?x=1")).ok).toBe(true);
    expect(decideMeasureEvent(pageview(), target(), from("null", "https://mon-cabinet.fr/")).ok).toBe(true);
    expect(decideMeasureEvent(pageview(), target(), from(null, "https://autre-site.fr/")).ok).toBe(false);
  });

  it("ligne inscrite : site, type, chemin, provenance, origine « external »", () => {
    expect(decideMeasureEvent(pageview({ r: "www.google.fr" }), target(), from(SITE_URL))).toEqual({
      ok: true,
      event: { siteId: SITE_ID, type: "pageview", path: "/tarifs", source: "google", origin: ANALYTICS_ORIGIN_EXTERNAL },
      externalSiteId: "3f0c7a52-5d0e-4a5b-9a43-0d7f4f0f6b11",
      first: false,
    });
    expect(ANALYTICS_ORIGIN_EXTERNAL).toBe("external");
  });

  it("types : page vue, clic de rendez-vous, clic d'appel", () => {
    const typeOf = (t: ExternalMeasurePayload["t"]) => {
      const decision = decideMeasureEvent(pageview({ t }), target(), from(SITE_URL));
      return decision.ok ? decision.event.type : null;
    };
    expect(typeOf("p")).toBe("pageview");
    expect(typeOf("r")).toBe("rdv_click");
    expect(typeOf("c")).toBe("call_click");
  });

  it("première visite reçue du site : à dater ; les suivantes non", () => {
    const first = decideMeasureEvent(pageview(), target({ measureSeenAt: null }), from(SITE_URL));
    expect(first.ok && first.first).toBe(true);
    const next = decideMeasureEvent(pageview(), target(), from(SITE_URL));
    expect(next.ok && next.first).toBe(false);
    // Une visite ignorée ne date rien
    expect(decideMeasureEvent(pageview(), target({ measureSeenAt: null }), from("https://autre-site.fr"))).toEqual({ ok: false, reason: "origin" });
  });

  it("démo ou site client en ligne : acceptés ; seul l'archivage coupe la mesure", () => {
    for (const siteStatus of ["published", "ready", "generating", "error"] as const) {
      expect(decideMeasureEvent(pageview(), target({ siteStatus }), from(SITE_URL)).ok, siteStatus).toBe(true);
    }
  });
});

describe("externalMeasureSource", () => {
  const source = (payload: Pick<ExternalMeasurePayload, "t" | "r">) => externalMeasureSource(payload, SITE_URL);

  it("page vue sans provenance (navigation interne, rechargement, retour arrière) : non renseigné", () => {
    expect(source({ t: "p" })).toBeNull();
  });

  it("accès direct", () => {
    expect(source({ t: "p", r: "direct" })).toBe("direct");
  });

  it("hôte du site d'origine classé comme sur le site hébergé", () => {
    expect(source({ t: "p", r: "www.google.fr" })).toBe("google");
    expect(source({ t: "p", r: "www.google.com" })).toBe("google");
    expect(source({ t: "p", r: "l.instagram.com" })).toBe("instagram");
    expect(source({ t: "p", r: "m.facebook.com" })).toBe("facebook");
    expect(source({ t: "p", r: "l.messenger.com" })).toBe("facebook");
    expect(source({ t: "p", r: "www.linkedin.com" })).toBe("linkedin");
    expect(source({ t: "p", r: "lnkd.in" })).toBe("linkedin");
    expect(source({ t: "p", r: "annuaire.exemple.fr" })).toBe("other");
    expect(source({ t: "p", r: "demo.harmony-web.fr" })).toBe("other");
  });

  it("hôte du site lui-même, avec ou sans « www. » : navigation interne, jamais « autres sites »", () => {
    expect(source({ t: "p", r: "www.mon-cabinet.fr" })).toBeNull();
    expect(source({ t: "p", r: "mon-cabinet.fr" })).toBeNull();
    expect(externalMeasureSource({ t: "p", r: "www.mon-cabinet.fr" }, "https://mon-cabinet.fr")).toBeNull();
    // Un autre hôte du même domaine n'est pas le site
    expect(source({ t: "p", r: "blog.mon-cabinet.fr" })).toBe("other");
  });

  it("application Android (nom du paquet) : réseau de l'application", () => {
    expect(source({ t: "p", r: "com.instagram.android" })).toBe("instagram");
    expect(source({ t: "p", r: "com.facebook.katana" })).toBe("facebook");
    expect(source({ t: "p", r: "com.linkedin.android" })).toBe("linkedin");
    expect(source({ t: "p", r: "com.google.android.gm" })).toBe("google");
    expect(source({ t: "p", r: "com.autre.application" })).toBe("other");
  });

  it("clics : jamais de provenance, même si le script en envoyait une", () => {
    expect(source({ t: "r" })).toBeNull();
    expect(source({ t: "c" })).toBeNull();
    expect(source({ t: "r", r: "www.google.fr" })).toBeNull();
    expect(source({ t: "c", r: "direct" })).toBeNull();
  });

  it("jamais de provenance publicitaire : la mesure ne lit aucun identifiant de campagne", () => {
    const sources = ["direct", "www.google.fr", "l.instagram.com", "m.facebook.com", "www.linkedin.com", "ads.google.com", "googleads.g.doubleclick.net", "x.fr"].map((r) =>
      source({ t: "p", r }),
    );
    expect(sources).not.toContain("google_ads");
    expect(sources).not.toContain("meta_ads");
  });
});

describe("senderHost", () => {
  it("Origin d'abord, Referer à défaut, hôte en minuscules sans port", () => {
    expect(senderHost("https://WWW.Mon-Cabinet.fr:8443", null)).toBe("www.mon-cabinet.fr");
    expect(senderHost(null, "https://mon-cabinet.fr/tarifs?x=1")).toBe("mon-cabinet.fr");
    expect(senderHost("null", "https://mon-cabinet.fr/")).toBe("mon-cabinet.fr");
    expect(senderHost("https://a.fr", "https://b.fr/")).toBe("a.fr");
    expect(senderHost(undefined, undefined)).toBeNull();
    expect(senderHost("null", null)).toBeNull();
    expect(senderHost("ftp://mon-cabinet.fr", null)).toBeNull();
  });
});

describe("measureVisitorScope", () => {
  it("propre au site du client : distinct du périmètre du site hébergé et de celui d'un autre praticien", () => {
    expect(measureVisitorScope(SITE_ID)).toBe(`${SITE_ID}:external`);
    expect(measureVisitorScope(SITE_ID)).not.toBe(SITE_ID);
    expect(measureVisitorScope(SITE_ID)).not.toBe(measureVisitorScope("00000000-0000-4000-8000-000000000000"));
  });
});

describe("readBoundedText", () => {
  const post = (body: string, headers: Record<string, string> = {}) => new Request("https://demo.harmony-web.fr/api/m", { method: "POST", body, headers });
  /** Corps reçu par morceaux, sans taille annoncée. */
  const streamed = (chunks: string[]) => {
    let pulled = 0;
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        const chunk = chunks[pulled];
        pulled += 1;
        if (chunk === undefined) controller.close();
        else controller.enqueue(new TextEncoder().encode(chunk));
      },
      cancel() {
        cancelled = true;
      },
    });
    return { source: { headers: new Headers(), body }, pulled: () => pulled, cancelled: () => cancelled };
  };

  it("corps ordinaire : lu en texte, accents compris", async () => {
    expect(await readBoundedText(post('{"k":"x","p":"/séance"}'), MEASURE_BODY_MAX_BYTES)).toBe('{"k":"x","p":"/séance"}');
    const split = streamed(['{"p":"/s', "éance", '"}']);
    expect(await readBoundedText(split.source, MEASURE_BODY_MAX_BYTES)).toBe('{"p":"/séance"}');
  });

  it("sans corps : chaîne vide", async () => {
    expect(await readBoundedText(new Request("https://demo.harmony-web.fr/api/m", { method: "POST" }), MEASURE_BODY_MAX_BYTES)).toBe("");
    expect(await readBoundedText({ headers: new Headers(), body: null }, MEASURE_BODY_MAX_BYTES)).toBe("");
  });

  it("taille annoncée au-delà de la borne : refusé sans rien lire", async () => {
    const big = streamed(["a".repeat(100)]);
    big.source.headers.set("content-length", String(MEASURE_BODY_MAX_BYTES + 1));
    expect(await readBoundedText(big.source, MEASURE_BODY_MAX_BYTES)).toBeNull();
    expect(big.pulled()).toBeLessThanOrEqual(1);
    const garbled = streamed(["{}"]);
    garbled.source.headers.set("content-length", "beaucoup");
    expect(await readBoundedText(garbled.source, MEASURE_BODY_MAX_BYTES)).toBeNull();
  });

  it("taille réelle au-delà de la borne, sans annonce ou avec une annonce mensongère : la lecture s'arrête", async () => {
    const endless = streamed(Array.from({ length: 1000 }, () => "a".repeat(1024)));
    expect(await readBoundedText(endless.source, MEASURE_BODY_MAX_BYTES)).toBeNull();
    expect(endless.cancelled()).toBe(true);
    // Arrêt dès le dépassement : le reste du flux n'est jamais demandé
    expect(endless.pulled()).toBeLessThan(10);
    const lying = streamed(["a".repeat(MEASURE_BODY_MAX_BYTES + 1)]);
    lying.source.headers.set("content-length", "10");
    expect(await readBoundedText(lying.source, MEASURE_BODY_MAX_BYTES)).toBeNull();
  });

  it("juste à la borne : accepté", async () => {
    const exact = "a".repeat(MEASURE_BODY_MAX_BYTES);
    expect(await readBoundedText(post(exact), MEASURE_BODY_MAX_BYTES)).toBe(exact);
    expect(await readBoundedText(post(`${exact}a`), MEASURE_BODY_MAX_BYTES)).toBeNull();
  });

  it("la borne laisse passer toute visite conforme au contrat (1 000 caractères au plus)", () => {
    expect(MEASURE_BODY_MAX_BYTES).toBeGreaterThanOrEqual(1000);
    expect(MEASURE_BODY_MAX_BYTES).toBeLessThanOrEqual(8192);
  });
});

describe("isMeasureSchemaMissing", () => {
  const pg = (code: string) => Object.assign(new Error("erreur"), { code });

  it("table ou colonne absente (migration 0009 non appliquée), directe ou enveloppée par drizzle", () => {
    expect(isMeasureSchemaMissing(pg("42P01"))).toBe(true);
    expect(isMeasureSchemaMissing(pg("42703"))).toBe(true);
    expect(isMeasureSchemaMissing(new Error("Failed query: select … from external_sites", { cause: pg("42P01") }))).toBe(true);
  });

  it("toute autre erreur n'est pas une migration manquante", () => {
    expect(isMeasureSchemaMissing(pg("22P02"))).toBe(false);
    expect(isMeasureSchemaMissing(pg("23503"))).toBe(false);
    expect(isMeasureSchemaMissing(Object.assign(new Error("réseau"), { code: "ECONNREFUSED" }))).toBe(false);
    expect(isMeasureSchemaMissing(new Error("DATABASE_URL manquante"))).toBe(false);
    expect(isMeasureSchemaMissing(null)).toBe(false);
  });
});
