import { describe, expect, it } from "vitest";
import { DEFAULT_THEME, type ExternalSiteSetting, type Section, type SiteTheme } from "./content";
import {
  ANALYTICS_ORIGIN_EXTERNAL,
  BOOKING_PLATFORMS,
  BOOKING_PLATFORM_HOSTS,
  EMPTY_EXTERNAL_FACTS,
  EMPTY_EXTERNAL_PROFILE,
  EXTERNAL_BOT_NAME,
  EXTERNAL_CMS,
  EXTERNAL_CMS_LABELS,
  EXTERNAL_MEASURE_EVENTS,
  EXTERNAL_MEASURE_KEY,
  EXTERNAL_MEASURE_OPTOUT,
  EXTERNAL_MEASURE_PATH,
  EXTERNAL_PAGE_KINDS,
  EXTERNAL_PASTE_FALLBACK_ERRORS,
  EXTERNAL_PROFILE_LIMITS,
  EXTERNAL_READ_ERRORS,
  EXTERNAL_SITE_LIMITS,
  EXTERNAL_SITE_STATUSES,
  EXTERNAL_URL_ERRORS,
  EXTERNAL_URL_MAX,
  activeExternalSite,
  bareHost,
  bookingPlatformLabel,
  bookingPlatformOf,
  cleanBookingUrl,
  cleanExternalOverrides,
  cleanExternalProfile,
  cleanPhone,
  cleanSocialLinks,
  externalBriefPages,
  externalHosts,
  externalLandingPages,
  externalLandingPath,
  externalMeasureTag,
  externalPageId,
  externalProfileGaps,
  externalSpecialties,
  isExternalMeasureKey,
  isExternalProfileUsable,
  isExternalReadError,
  isHostedSiteHidden,
  isSameSiteHost,
  mergeExternalProfile,
  normalizeExternalSiteUrl,
  parseExternalMeasure,
  referenceSiteUrl,
  type ExternalProfileOverrides,
  type ExternalReadError,
  type ExternalSiteProfile,
  type ExternalUrlError,
} from "./external-site";
import { SOCIAL_BRIEF_MAX_CHARS, buildSocialBrief, type SocialBriefInput } from "./social-brief";

/**
 * Les tests nommés « constat — … » décrivent le comportement ATTENDU là où le
 * module s'en écarte aujourd'hui. Ils sont écrits avec `it.fails` : la suite
 * reste verte tant que l'écart existe, et le test « échoue » le jour où il
 * est corrigé — il suffit alors de remplacer `it.fails` par `it`. Chaque
 * constat dit ce qui se passe aujourd'hui, qui en pâtit et le correctif
 * proposé.
 */

const SITE = "https://www.mon-cabinet.fr";
/** Site sous un chemin, sur un hôte partagé avec d'autres sites. */
const SHARED_SITE = "https://sites.google.com/view/mon-cabinet";
const HOSTED = "https://claire.harmony-web.fr";
const L = EXTERNAL_PROFILE_LIMITS;

/** Propriétés héritées de Object.prototype : aucune n'est une valeur du contrat. */
const PROTOTYPE_KEYS = ["constructor", "toString", "valueOf", "hasOwnProperty", "__proto__"] as const;

/** Caractère d'après son code : aucun caractère invisible n'est écrit tel quel dans ce fichier. */
const char = (code: number): string => String.fromCodePoint(code);
const hex = (code: number): string => `U+${code.toString(16).toUpperCase().padStart(4, "0")}`;
/** « 0612345678 » en chiffres arabo-indiens, puis en chiffres « pleine largeur » : ce ne sont pas des chiffres ASCII. */
const ARABIC_DIGITS = [0x660, 0x666, 0x661, 0x662, 0x663, 0x664, 0x665, 0x666, 0x667, 0x668].map(char).join("");
const FULLWIDTH_DIGITS = [0xff10, 0xff16, 0xff11, 0xff12, 0xff13, 0xff14, 0xff15, 0xff16, 0xff17, 0xff18].map(char).join("");
/** Caractères invisibles que le nettoyage du profil retire : largeur nulle, sens d'écriture, séparateurs de ligne, marque d'ordre des octets. */
const INVISIBLE_RANGES: [from: number, to: number][] = [
  [0x200b, 0x200f],
  [0x2028, 0x202e],
  [0x2060, 0x206f],
  [0xfeff, 0xfeff],
];
const INVISIBLE = new RegExp(`[${INVISIBLE_RANGES.map(([from, to]) => `${char(from)}-${char(to)}`).join("")}]`);

/** Tous les textes d'une valeur JSON, en profondeur. */
function textsOf(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const item of value) textsOf(item, out);
  else if (value !== null && typeof value === "object") for (const item of Object.values(value)) textsOf(item, out);
  return out;
}

/** Le texte porte-t-il un caractère de contrôle (C0 ou DEL) ? */
function hasControl(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

/** Demi-codets isolés (moitié d'un caractère hors du plan de base) : PostgreSQL refuse un JSONB qui en porte un. */
function loneSurrogates(text: string): number {
  let count = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) i++;
      else count++;
    } else if (code >= 0xdc00 && code <= 0xdfff) count++;
  }
  return count;
}

/** Gèle une valeur en profondeur : le nettoyage ne doit jamais écrire dans ce qu'il reçoit. */
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const item of Object.values(value)) deepFreeze(item);
    Object.freeze(value);
  }
  return value;
}

// ─── Réglage porté par le site ───────────────────────────────────────────────

/** Thème réduit à son réglage « site du client », y compris des réglages mal formés. */
const themeWith = (externalSite: unknown): Pick<SiteTheme, "externalSite"> => ({ externalSite: externalSite as ExternalSiteSetting });

describe("activeExternalSite, referenceSiteUrl, isHostedSiteHidden", () => {
  const setting: ExternalSiteSetting = { url: SITE, active: true };

  it("réglage présent, actif, à l'adresse valide : le réglage lui-même, l'adresse du site du client, le site hébergé masqué", () => {
    const theme = themeWith(setting);
    expect(activeExternalSite(theme)).toBe(setting);
    expect(referenceSiteUrl(`${HOSTED}/`, theme)).toBe(SITE);
    expect(isHostedSiteHidden(theme)).toBe(true);
  });

  it("sans réglage, réglage inactif ou adresse refusée : null, l'adresse hébergée reste la référence, rien n'est masqué", () => {
    const themes: [string, Pick<SiteTheme, "externalSite"> | null | undefined][] = [
      ["thème absent", null],
      ["thème non chargé", undefined],
      ["aucun réglage", {}],
      ["réglage inactif", themeWith({ url: SITE, active: false })],
      ["`active` absent", themeWith({ url: SITE })],
      ["`active` vaut 1", themeWith({ url: SITE, active: 1 })],
      ["`active` vaut « true »", themeWith({ url: SITE, active: "true" })],
      ["adresse vide", themeWith({ url: "", active: true })],
      ["adresse absente", themeWith({ active: true })],
      ["adresse illisible", themeWith({ url: "pas une adresse", active: true })],
      ["réseau social", themeWith({ url: "https://www.facebook.com/cabinet", active: true })],
      ["plateforme de rendez-vous", themeWith({ url: "https://www.doctolib.fr/sophrologue/albi", active: true })],
      ["adresse IP", themeWith({ url: "http://127.0.0.1", active: true })],
    ];
    for (const [label, theme] of themes) {
      expect([label, activeExternalSite(theme)]).toEqual([label, null]);
      expect([label, referenceSiteUrl(HOSTED, theme)]).toEqual([label, HOSTED]);
      expect([label, isHostedSiteHidden(theme)]).toEqual([label, false]);
    }
  });

  it("referenceSiteUrl rend l'adresse hébergée sans barre finale ; pour un site du client sous un chemin, son adresse entière", () => {
    expect(referenceSiteUrl(`${HOSTED}///`, null)).toBe(HOSTED);
    expect(referenceSiteUrl("http://localhost:3000/claire-dupont/", {})).toBe("http://localhost:3000/claire-dupont");
    expect(referenceSiteUrl(`${HOSTED}/`, themeWith({ url: SHARED_SITE, active: true }))).toBe(SHARED_SITE);
  });

  it("isHostedSiteHidden : le site hébergé reste visible si le praticien l'a demandé (`keepHostedIndexed: true`, strictement)", () => {
    expect(isHostedSiteHidden(themeWith({ url: SITE, active: true, keepHostedIndexed: true }))).toBe(false);
    expect(isHostedSiteHidden(themeWith({ url: SITE, active: true, keepHostedIndexed: false }))).toBe(true);
    expect(isHostedSiteHidden(themeWith({ url: SITE, active: true, keepHostedIndexed: 1 }))).toBe(true);
    // Le choix ne compte que si le site du client est la référence
    expect(isHostedSiteHidden(themeWith({ url: SITE, active: false, keepHostedIndexed: false }))).toBe(false);
  });

  // Aujourd'hui : l'adresse du réglage est contrôlée (`normalizeExternalSiteUrl(...).ok`) mais rendue telle qu'elle
  // est stockée → « www.mon-cabinet.fr » sans protocole, ou une adresse avec paramètres. Les outils composent leurs
  // liens sur cette adresse (`referenceSiteUrl` : liens de bio, légendes, pages d'atterrissage).
  // Correctif proposé : rendre l'adresse normalisée (`check.url`), ou tenir pour inactif un réglage qui n'est pas sous sa forme normalisée.
  it.fails("constat — un réglage dont l'adresse n'est pas sous sa forme normalisée donne une adresse de référence inutilisable telle quelle", () => {
    for (const stored of ["www.mon-cabinet.fr", "HTTP://WWW.MON-CABINET.FR/?utm_source=x#haut"]) {
      expect([SITE, HOSTED]).toContain(referenceSiteUrl(HOSTED, themeWith({ url: stored, active: true })));
    }
  });
});

// ─── Adresse du site ─────────────────────────────────────────────────────────

type UrlOptions = { ownHosts?: readonly string[] };

/** Issue d'un contrôle d'adresse sur une ligne : l'adresse normalisée, ou le motif du refus. */
function verdict(input: string | null | undefined, opts?: UrlOptions): string {
  const check = normalizeExternalSiteUrl(input, opts);
  return check.ok ? check.url : check.reason;
}

/** Vérifie qu'une liste d'adresses est refusée pour un même motif. */
function expectRefused(reason: ExternalUrlError, inputs: readonly (string | null | undefined)[], opts?: UrlOptions): void {
  for (const input of inputs) expect([input, verdict(input, opts)]).toEqual([input, reason]);
}

describe("normalizeExternalSiteUrl — adresses acceptées", () => {
  const ACCEPTED: [input: string, url: string, host: string][] = [
    ["www.mon-cabinet.fr", "https://www.mon-cabinet.fr", "www.mon-cabinet.fr"],
    ["mon-cabinet.fr", "https://mon-cabinet.fr", "mon-cabinet.fr"],
    ["https://www.mon-cabinet.fr/", "https://www.mon-cabinet.fr", "www.mon-cabinet.fr"],
    ["http://mon-cabinet.fr", "https://mon-cabinet.fr", "mon-cabinet.fr"],
    ["  www.mon-cabinet.fr\n", "https://www.mon-cabinet.fr", "www.mon-cabinet.fr"],
    ["//www.mon-cabinet.fr", "https://www.mon-cabinet.fr", "www.mon-cabinet.fr"],
    // Casse : le protocole et l'hôte passent en minuscules, le chemin garde la sienne
    ["HTTPS://WWW.Mon-Cabinet.FR/Accueil/", "https://www.mon-cabinet.fr/Accueil", "www.mon-cabinet.fr"],
    // Point final de l'hôte
    ["www.mon-cabinet.fr.", "https://www.mon-cabinet.fr", "www.mon-cabinet.fr"],
    ["https://www.mon-cabinet.fr./cabinet", "https://www.mon-cabinet.fr/cabinet", "www.mon-cabinet.fr"],
    // Chemin gardé, sans barre finale ; paramètres et ancre retirés
    ["www.mon-cabinet.fr/a/b/?utm_source=x&id=1#contact", "https://www.mon-cabinet.fr/a/b", "www.mon-cabinet.fr"],
    ["www.mon-cabinet.fr?page=2", "https://www.mon-cabinet.fr", "www.mon-cabinet.fr"],
    ["www.mon-cabinet.fr#contact", "https://www.mon-cabinet.fr", "www.mon-cabinet.fr"],
    ["www.mon-cabinet.fr//", "https://www.mon-cabinet.fr", "www.mon-cabinet.fr"],
    ["www.mon-cabinet.fr/a/../b/./c//", "https://www.mon-cabinet.fr/b/c", "www.mon-cabinet.fr"],
    ["https://mon-cabinet.fr\\cabinet", "https://mon-cabinet.fr/cabinet", "mon-cabinet.fr"],
    ["mon-cabinet.fr/café", "https://mon-cabinet.fr/caf%C3%A9", "mon-cabinet.fr"],
    ["mon-cabinet.fr/caf%C3%A9", "https://mon-cabinet.fr/caf%C3%A9", "mon-cabinet.fr"],
    // Port par défaut du protocole : ce n'est pas un port
    ["https://mon-cabinet.fr:443", "https://mon-cabinet.fr", "mon-cabinet.fr"],
    ["http://mon-cabinet.fr:80/", "https://mon-cabinet.fr", "mon-cabinet.fr"],
    ["mon-cabinet.fr:443", "https://mon-cabinet.fr", "mon-cabinet.fr"],
    // Sites hébergés sous un chemin ou un sous-domaine d'un outil de création
    ["sites.google.com/view/mon-cabinet", SHARED_SITE, "sites.google.com"],
    ["claire.wixsite.com/sophrologie/", "https://claire.wixsite.com/sophrologie", "claire.wixsite.com"],
    ["mon-cabinet.jimdofree.com", "https://mon-cabinet.jimdofree.com", "mon-cabinet.jimdofree.com"],
    ["cabinet.photography", "https://cabinet.photography", "cabinet.photography"],
    ["123.fr", "https://123.fr", "123.fr"],
  ];

  it("protocole facultatif, http converti, hôte en minuscules, chemin gardé sans barre finale, ni paramètre ni ancre", () => {
    for (const [input, url, host] of ACCEPTED) expect([input, normalizeExternalSiteUrl(input)]).toEqual([input, { ok: true, url, host }]);
  });

  it("noms de domaine accentués ou non latins : rendus sous leur forme ASCII (punycode), la même pour toutes les écritures", () => {
    const IDN: [string, string][] = [
      ["café-santé.fr", "https://xn--caf-sant-d1af.fr"],
      ["CAFÉ-SANTÉ.FR", "https://xn--caf-sant-d1af.fr"],
      ["https://xn--caf-sant-d1af.fr/", "https://xn--caf-sant-d1af.fr"],
      ["sophrologie.рф", "https://sophrologie.xn--p1ai"],
      // Lettres « pleine largeur » et point idéographique : ramenés aux caractères ASCII
      ["ｍｏｎ-ｃａｂｉｎｅｔ.ｆｒ", "https://mon-cabinet.fr"],
      ["mon-cabinet。fr", "https://mon-cabinet.fr"],
      ["https://%6d%6fn-cabinet.fr", "https://mon-cabinet.fr"],
    ];
    for (const [input, url] of IDN) expect([input, verdict(input)]).toEqual([input, url]);
  });

  it("une adresse acceptée est stable : la normaliser de nouveau ne change rien, et elle tient ses promesses de forme", () => {
    const urls = [...ACCEPTED.map(([, url]) => url), "https://xn--caf-sant-d1af.fr", "https://mon-cabinet.fr//a//b", "https://mon-cabinet.fr/a'b%22c%3Cd%3Ee|f", "https://mon-cabinet.fr/%zz"];
    for (const url of urls) {
      const check = normalizeExternalSiteUrl(url);
      expect([url, check.ok && check.url]).toEqual([url, url]);
      if (!check.ok) continue;
      expect(check.host).toBe(new URL(url).hostname);
      expect(check.host).toBe(check.host.toLowerCase());
      expect(url).toMatch(/^https:\/\/[\x21-\x7e]+$/);
      expect(url).not.toMatch(/[?#]|\/$/);
      expect(url.length).toBeLessThanOrEqual(EXTERNAL_URL_MAX);
    }
  });

  it("caractères à risque (chevrons, guillemets, caractères de contrôle ou invisibles) : encodés ou ignorés, jamais gardés tels quels dans l'adresse rendue", () => {
    expect(verdict('mon-cabinet.fr/"><script>alert(1)</script>')).toBe("https://mon-cabinet.fr/%22%3E%3Cscript%3Ealert(1)%3C/script%3E");
    expect(verdict("mon-cabinet.fr/a`b{c}d")).toBe("https://mon-cabinet.fr/a%60b%7Bc%7Dd");
    // Caractères de contrôle et caractères invisibles : encodés dans le chemin, ignorés dans l'hôte — jamais gardés tels quels
    const CASES: [string, string][] = [
      [`https://mon-cabinet.fr/cabinet${char(0)}`, "https://mon-cabinet.fr/cabinet"],
      [`https://mon-cabinet.fr/${char(0)}cabinet`, "https://mon-cabinet.fr/%00cabinet"],
      [`https://mon-cabinet.fr/a${char(0x1b)}b${char(0x7f)}c`, "https://mon-cabinet.fr/a%1Bb%7Fc"],
      [`mon-cabinet.fr/${char(0x202e)}tenibac`, "https://mon-cabinet.fr/%E2%80%AEtenibac"],
      [`mon-${char(0x200b)}cabinet.fr`, "https://mon-cabinet.fr"],
      [`mon-cabi${char(0xad)}net.fr`, "https://mon-cabinet.fr"],
    ];
    for (const [input, url] of CASES) expect([JSON.stringify(input), verdict(input)]).toEqual([JSON.stringify(input), url]);
    expectRefused("invalid", [`${char(0)}https://mon-cabinet.fr`, `https://mon-${char(7)}cabinet.fr`, `https://mon-cabinet.fr/${char(0x2028)}cabinet`]);
  });

  it("longueur : 200 caractères au plus une fois normalisée, la saisie elle-même n'étant lue que jusqu'à 500 caractères", () => {
    expect(EXTERNAL_URL_MAX).toBe(200);
    const atLimit = `https://mon-cabinet.fr/${"a".repeat(EXTERNAL_URL_MAX - "https://mon-cabinet.fr/".length)}`;
    expect(atLimit).toHaveLength(EXTERNAL_URL_MAX);
    expect(verdict(atLimit)).toBe(atLimit);
    expect(verdict(`${atLimit}a`)).toBe("too_long");
    // Les paramètres ne comptent pas dans l'adresse normalisée…
    const withQuery = `mon-cabinet.fr/?${"a".repeat(484)}`;
    expect(withQuery).toHaveLength(500);
    expect(verdict(withQuery)).toBe("https://mon-cabinet.fr");
    // … mais au-delà de 500 caractères la saisie est refusée d'emblée, sans être analysée
    expect(verdict(`${withQuery}a`)).toBe("invalid");
    // Les espaces autour de l'adresse ne comptent pas
    expect(verdict(`${" ".repeat(600)}mon-cabinet.fr${" ".repeat(600)}`)).toBe("https://mon-cabinet.fr");
    // Hôte de plus de 200 caractères, aux libellés valides : trop long
    expect(verdict(`${`${"a".repeat(50)}.`.repeat(4)}fr`)).toBe("too_long");
  });
});

describe("normalizeExternalSiteUrl — refus", () => {
  it("rien de saisi : « empty »", () => {
    expectRefused("empty", ["", "   ", "\n\t ", null, undefined]);
  });

  it("espaces dans l'adresse, adresse sans hôte ou illisible : « invalid »", () => {
    expectRefused("invalid", [
      "mon cabinet.fr",
      "mon\tcabinet.fr",
      "www.mon-cabinet.fr\nwww.autre.fr",
      `mon${char(0xa0)}cabinet.fr`,
      "https://",
      "http://",
      "https:///",
      "://mon-cabinet.fr",
      "/",
      "?",
      "#",
      "https://?page=1",
      "mon-cabinet.fr:99999",
      "https://mon-cabinet.fr%40autre.fr",
      "https ://mon-cabinet.fr",
    ]);
  });

  it("très longue saisie : refusée sans être analysée, quel que soit son contenu", () => {
    expectRefused("invalid", ["a".repeat(100_000), `${"a.".repeat(50_000)}fr`, `https://mon-cabinet.fr/${"a".repeat(600)}`, `mon-cabinet.fr/${"é".repeat(500)}`, `${"<script>".repeat(10_000)}`]);
  });

  it("autre protocole que le web (« ftp:// », « file:// »…) : « scheme »", () => {
    expectRefused("scheme", ["ftp://mon-cabinet.fr", "sftp://mon-cabinet.fr/www", "file:///etc/passwd", "ws://mon-cabinet.fr", "wss://mon-cabinet.fr", "htp://mon-cabinet.fr", "httpss://mon-cabinet.fr", "gopher://mon-cabinet.fr", "javascript://mon-cabinet.fr/%0aalert(1)", "android-app://com.instagram.android", "chrome://settings"]);
  });

  it("protocoles sans « // » (javascript:, data:, mailto:, tel:…) et protocole mal écrit : jamais acceptés, quel que soit le motif retenu", () => {
    const inputs = ["javascript:alert(1)", "JavaScript:alert(document.cookie)", "data:text/html,<h1>x</h1>", "data:text/html;base64,PHNjcmlwdD4=", "vbscript:msgbox(1)", "mailto:contact@mon-cabinet.fr", "tel:0612345678", "tel:443", "sms:0612345678", "about:blank", "blob:https://mon-cabinet.fr/uuid", "view-source:https://mon-cabinet.fr", "https:mon-cabinet.fr", "https:/mon-cabinet.fr", "https//mon-cabinet.fr", "http:/\\mon-cabinet.fr"];
    for (const input of inputs) expect([input, normalizeExternalSiteUrl(input).ok]).toEqual([input, false]);
  });

  it("identifiant ou mot de passe dans l'adresse : « credentials » (y compris l'hôte déguisé en identifiant, et une adresse e-mail)", () => {
    expectRefused("credentials", ["https://claire:secret@mon-cabinet.fr", "https://claire@mon-cabinet.fr", "claire:secret@mon-cabinet.fr/page", "https://mon-cabinet.fr@autre-site.example.org", "https://www.mon-cabinet.fr:443@autre-site.fr/", "contact@mon-cabinet.fr"]);
  });

  it("numéro de port : « port » (un port par défaut de l'autre protocole compris)", () => {
    expectRefused("port", ["mon-cabinet.fr:8080", "https://mon-cabinet.fr:8443/", "https://mon-cabinet.fr:80", "http://mon-cabinet.fr:443", "mon-cabinet.fr:0", "http://localhost:3000", "http://127.0.0.1:8080"]);
  });

  it("adresse IP dans toutes ses écritures (décimale, octale, hexadécimale, abrégée, IPv6, IPv4 portée par une IPv6, chiffres Unicode) : jamais acceptée", () => {
    expectRefused("host", [
      "127.0.0.1",
      "http://127.0.0.1/",
      "https://192.168.1.10/admin",
      "10.0.0.1",
      "169.254.169.254/latest/meta-data",
      "0.0.0.0",
      "http://0",
      "http://1.1.1.1.",
      // Abrégée
      "http://127.1",
      // Un seul nombre décimal
      "http://2130706433",
      // Octale
      "http://017700000001",
      "http://0177.0.0.1",
      // Hexadécimale
      "http://0x7f000001",
      "http://0x7f.0.0.1",
      "http://0x7f.0x0.0x0.0x1",
      // IPv6, et IPv4 portée par une IPv6
      "http://[::1]",
      "[::1]",
      "http://[2001:db8::1]/",
      "http://[::ffff:127.0.0.1]",
      "http://[::ffff:7f00:1]",
      "http://[0:0:0:0:0:ffff:7f00:1]",
      "http://[64:ff9b::7f00:1]",
      // Chiffres cerclés et points idéographiques, que l'analyse d'adresse ramène à 127.0.0.1
      "http://①②⑦.⓪.⓪.①",
      "http://127。0。0。1",
    ]);
    // Écritures que l'analyse d'adresse rejette elle-même
    expectRefused("invalid", ["http://1.2.3.4.5", "http://256.256.256.256", "http://[fe80::1%25eth0]", "http://[::1", "mon-cabinet.123"]);
  });

  it("hôte local ou réservé : « host »", () => {
    expectRefused("host", [
      "localhost",
      "LOCALHOST",
      "localhost.",
      "http://localhost/",
      "cabinet.localhost",
      "cabinet.local",
      "imprimante.local.",
      "serveur.internal",
      "metadata.google.internal",
      "cabinet.intranet",
      "nas.lan",
      "box.home",
      "partage.corp",
      "cabinet.test",
      "www.example",
      "cabinet.invalid",
      "abcdefghijklmnop.onion",
      "1.0.0.127.in-addr.arpa",
      "intranet",
      "serveur",
    ]);
    // Seul le dernier libellé compte : ces noms-là sont des domaines publics ordinaires
    for (const input of ["local.fr", "cabinet.home.fr", "test-cabinet.fr", "onion.fr", "corp.example.fr"]) expect([input, verdict(input)]).toEqual([input, `https://${input}`]);
  });

  it("hôte mal formé (tiret bas, tiret en bord de libellé, libellé vide ou de plus de 63 caractères, extension absente ou non alphabétique) : « host »", () => {
    expectRefused("host", ["mon_cabinet.fr", "-cabinet.fr", "cabinet-.fr", "mon..cabinet.fr", ".mon-cabinet.fr", "www.mon-cabinet.fr..", "mon-cabinet", "mon-cabinet.f", "mon-cabinet.c0m", `${"a".repeat(64)}.fr`, `${`${"a".repeat(63)}.`.repeat(4)}fr`, "www", "fr", ".fr", ".", ".."]);
    expect(verdict(`${"a".repeat(63)}.fr`)).toBe(`https://${"a".repeat(63)}.fr`);
  });

  it("réseaux sociaux et services Google, sous-domaines, casse et point final compris : « social »", () => {
    expectRefused("social", [
      "facebook.com",
      "www.facebook.com/moncabinet",
      "m.facebook.com/moncabinet",
      "fr-fr.facebook.com",
      "FACEBOOK.COM",
      "facebook.com.",
      "https://www.facebook.com/profile.php?id=100012345678",
      "fb.com/moncabinet",
      "fb.me/moncabinet",
      "instagram.com/cabinet.claire",
      "www.linkedin.com/in/claire-dupont",
      "tiktok.com/@claire",
      "youtube.com/@claire",
      "youtu.be/dQw4w9WgXcQ",
      "x.com/claire",
      "twitter.com/claire",
      "pinterest.com/claire",
      "pinterest.fr/claire",
      "snapchat.com/add/claire",
      "threads.net/@claire",
      "wa.me/33612345678",
      "api.whatsapp.com/send?phone=33612345678",
      "t.me/claire",
      "linktr.ee/claire",
      "google.com",
      "www.google.fr/maps/place/Cabinet",
      "maps.google.com",
      "docs.google.com/document/d/1",
      "business.google.com",
      "g.page/cabinet-claire",
      "goo.gl/maps/abc",
      "maps.app.goo.gl/abc",
    ]);
    // Seule exception : un site créé avec Google Sites est un vrai site
    expect(verdict("https://sites.google.com/view/mon-cabinet/accueil")).toBe(`${SHARED_SITE}/accueil`);
  });

  it("plateformes de rendez-vous et annuaires, sous-domaines compris : « directory »", () => {
    for (const host of BOOKING_PLATFORM_HOSTS) expectRefused("directory", [host, `www.${host}`, `https://cabinet-claire.${host}/rdv`, host.toUpperCase()]);
    expectRefused("directory", ["www.doctolib.fr/sophrologue/albi/claire-dupont", "partners.doctolib.fr", "calendly.com/claire/seance", "pagesjaunes.fr", "www.pagesjaunes.fr/pros/12345", "therapeutes.com/sophrologue/albi", "psychologue.net", "annuaire-therapeutes.com", "www.mondocteur.fr"]);
  });

  it("un hôte qui ressemble seulement à un hôte refusé (nom contenu, préfixe, sous-domaine d'un autre domaine, lettre d'un autre alphabet) est un site ordinaire", () => {
    const LOOKALIKES: [string, string][] = [
      ["notfacebook.com", "https://notfacebook.com"],
      ["mon-facebook.com", "https://mon-facebook.com"],
      ["facebook.com.mon-cabinet.fr", "https://facebook.com.mon-cabinet.fr"],
      ["instagram.com.autre.fr/cabinet", "https://instagram.com.autre.fr/cabinet"],
      ["mon-cabinet.fr/facebook.com/moncabinet", "https://mon-cabinet.fr/facebook.com/moncabinet"],
      ["mon-cabinet.fr/?lien=https://facebook.com", "https://mon-cabinet.fr"],
      // x.com, t.me, wa.me, g.page : le domaine entier, pas une fin de nom
      ["max.com", "https://max.com"],
      ["linux.com", "https://linux.com"],
      ["chat.me", "https://chat.me"],
      ["awa.me", "https://awa.me"],
      ["blog.page", "https://blog.page"],
      ["mygoogle.com", "https://mygoogle.com"],
      // « a » cyrillique (U+0430) : un autre domaine, rendu en punycode
      [`f${char(0x430)}cebook.com`, "https://xn--fcebook-2fg.com"],
      // Plateformes et annuaires
      ["mon-doctolib.fr", "https://mon-doctolib.fr"],
      ["doctolib.fr.autre.com", "https://doctolib.fr.autre.com"],
      ["medical.com", "https://medical.com"],
      ["mon-agenda.ch", "https://mon-agenda.ch"],
      ["mes-pagesjaunes.fr", "https://mes-pagesjaunes.fr"],
      ["mon-cabinet.fr/doctolib.fr", "https://mon-cabinet.fr/doctolib.fr"],
    ];
    for (const [input, url] of LOOKALIKES) expect([input, verdict(input)]).toEqual([input, url]);
  });

  it("chaque refus porte son motif et le message du contrat ; tous les motifs sont atteignables", () => {
    const EXAMPLES: Record<ExternalUrlError, string> = {
      empty: "",
      invalid: "mon cabinet.fr",
      scheme: "ftp://mon-cabinet.fr",
      host: "localhost",
      credentials: "https://claire@mon-cabinet.fr",
      port: "mon-cabinet.fr:8080",
      too_long: `mon-cabinet.fr/${"a".repeat(300)}`,
      own: "claire.harmony-web.fr",
      social: "facebook.com/moncabinet",
      directory: "doctolib.fr",
    };
    expect(Object.keys(EXAMPLES).sort()).toEqual(Object.keys(EXTERNAL_URL_ERRORS).sort());
    for (const [reason, input] of Object.entries(EXAMPLES)) {
      expect([input, normalizeExternalSiteUrl(input, { ownHosts: ["harmony-web.fr"] })]).toEqual([input, { ok: false, reason, message: EXTERNAL_URL_ERRORS[reason as ExternalUrlError] }]);
    }
    for (const message of Object.values(EXTERNAL_URL_ERRORS)) {
      expect(message.trim()).not.toBe("");
      expect(message.endsWith(".")).toBe(true);
    }
  });
});

describe("normalizeExternalSiteUrl — ownHosts", () => {
  const ownHosts = ["harmony-web.fr", "www.cabinet-claire.fr", "Demo.Harmony-Web.fr.", " app.harmony-web.fr ", "", "   "];

  it("les hôtes du site hébergé et leurs sous-domaines sont refusés (« own »), « www. », casse, point final et espaces ignorés", () => {
    expectRefused("own", ["harmony-web.fr", "www.harmony-web.fr", "claire.harmony-web.fr", "a.b.harmony-web.fr/page", "HARMONY-WEB.FR.", "http://demo.harmony-web.fr/claire-dupont", "app.harmony-web.fr", "cabinet-claire.fr", "www.cabinet-claire.fr", "blog.cabinet-claire.fr"], { ownHosts });
  });

  it("un hôte voisin (autre extension, nom contenu, hôte hébergé placé devant un autre domaine, domaine parent) reste accepté ; une entrée vide ne refuse rien", () => {
    for (const input of ["harmony-web.com", "notharmony-web.fr", "harmony-web.fr.autre.com", "mon-cabinet.fr", "cabinet-claire.com"]) expect([input, verdict(input, { ownHosts })]).toEqual([input, `https://${input}`]);
    // Les sous-domaines d'un hôte hébergé sont refusés, pas le domaine dont il dépend
    expect(verdict("harmony-web.fr", { ownHosts: ["app.harmony-web.fr"] })).toBe("https://harmony-web.fr");
    expect(verdict("mon-cabinet.fr", { ownHosts: [] })).toBe("https://mon-cabinet.fr");
    expect(verdict("mon-cabinet.fr", {})).toBe("https://mon-cabinet.fr");
    expect(verdict("mon-cabinet.fr", { ownHosts: ["", " ", "."] })).toBe("https://mon-cabinet.fr");
  });

  it("le site hébergé l'emporte sur les autres motifs propres à l'hôte, pas sur la forme de l'adresse", () => {
    expect(verdict("facebook.com", { ownHosts: ["facebook.com"] })).toBe("own");
    expect(verdict("doctolib.fr", { ownHosts: ["doctolib.fr"] })).toBe("own");
    expect(verdict("localhost", { ownHosts: ["localhost"] })).toBe("host");
    expect(verdict("harmony-web.fr:8080", { ownHosts })).toBe("port");
    expect(verdict("https://claire@harmony-web.fr", { ownHosts })).toBe("credentials");
  });

  it("l'option attend des noms d'hôte, sous leur forme ASCII : c'est ce que donne `new URL(...).hostname`", () => {
    expect(verdict("café-santé.fr", { ownHosts: [new URL("https://café-santé.fr").hostname] })).toBe("own");
    expect(verdict("mon-cabinet.fr", { ownHosts: [new URL("https://Mon-Cabinet.fr:3000/accueil").hostname] })).toBe("own");
  });

  // Aujourd'hui : l'hôte saisi est comparé sous sa forme ASCII (punycode) à l'entrée de `ownHosts` telle quelle ;
  // un hôte accentué fourni tel qu'on le lit n'est donc jamais reconnu, et le site hébergé peut être connecté à
  // lui-même. Aucun appelant touché pour l'instant : `hostedHostsOf` (`@theralys/jobs`) passe par `new URL`.
  // Correctif proposé : normaliser chaque entrée comme l'hôte saisi (`new URL(`https://${own}`).hostname`).
  it.fails("constat — un hôte de `ownHosts` écrit avec ses accents n'est pas reconnu", () => {
    expect(verdict("café-santé.fr", { ownHosts: ["café-santé.fr"] })).toBe("own");
  });
});

// ─── Hôtes ───────────────────────────────────────────────────────────────────

describe("bareHost, externalHosts, isSameSiteHost", () => {
  it("bareHost : minuscules, sans point final, sans un « www. » de tête (un seul)", () => {
    const CASES: [string, string][] = [
      ["www.mon-cabinet.fr", "mon-cabinet.fr"],
      ["WWW.Mon-Cabinet.FR.", "mon-cabinet.fr"],
      ["mon-cabinet.fr", "mon-cabinet.fr"],
      ["www.www.mon-cabinet.fr", "www.mon-cabinet.fr"],
      ["www2.mon-cabinet.fr", "www2.mon-cabinet.fr"],
      ["wwwmon-cabinet.fr", "wwwmon-cabinet.fr"],
      ["m.mon-cabinet.fr", "m.mon-cabinet.fr"],
      ["xn--caf-dma.fr", "xn--caf-dma.fr"],
      ["", ""],
    ];
    for (const [host, bare] of CASES) expect([host, bareHost(host)]).toEqual([host, bare]);
  });

  it("externalHosts : l'hôte nu puis sa variante « www. », quelle que soit l'écriture de l'adresse ; rien pour une adresse illisible", () => {
    for (const url of [SITE, "https://mon-cabinet.fr", "http://WWW.MON-CABINET.FR.:8080/page?x=1#y", "https://www.mon-cabinet.fr/cabinet/"]) {
      expect([url, externalHosts(url)]).toEqual([url, ["mon-cabinet.fr", "www.mon-cabinet.fr"]]);
    }
    expect(externalHosts("https://café-santé.fr")).toEqual(["xn--caf-sant-d1af.fr", "www.xn--caf-sant-d1af.fr"]);
    expect(externalHosts(SHARED_SITE)).toEqual(["sites.google.com", "www.sites.google.com"]);
    for (const url of ["", "www.mon-cabinet.fr", "pas une adresse", "https://", "//mon-cabinet.fr"]) expect([url, externalHosts(url)]).toEqual([url, []]);
  });

  it("isSameSiteHost : même hôte, « www. », casse, point final, protocole, port et chemin ignorés", () => {
    const SAME: [string, string][] = [
      [SITE, "https://mon-cabinet.fr/sophrologie"],
      ["http://mon-cabinet.fr", SITE],
      ["https://MON-CABINET.FR./", "https://mon-cabinet.fr"],
      ["https://mon-cabinet.fr:8443/x", "https://mon-cabinet.fr"],
      ["https://café-santé.fr", "https://xn--caf-sant-d1af.fr/page"],
      // Seul l'hôte compte : deux sites d'un même hôte partagé ne sont pas distingués ici (cf. `externalLandingPath`)
      [SHARED_SITE, "https://sites.google.com/view/un-autre-site"],
    ];
    for (const [a, b] of SAME) expect([a, b, isSameSiteHost(a, b), isSameSiteHost(b, a)]).toEqual([a, b, true, true]);
  });

  it("isSameSiteHost : faux pour un autre hôte (sous-domaine, autre extension, hôte en chemin ou en identifiant) et pour une adresse illisible", () => {
    const DIFFERENT: [string, string][] = [
      ["https://blog.mon-cabinet.fr", SITE],
      ["https://mon-cabinet.com", SITE],
      ["https://www.mon-cabinet.fr.autre.fr", SITE],
      ["https://autre.fr/www.mon-cabinet.fr", SITE],
      ["https://www.mon-cabinet.fr@autre.fr/", SITE],
      ["https://www.www.mon-cabinet.fr", SITE],
      ["mon-cabinet.fr", "mon-cabinet.fr"],
      ["www.mon-cabinet.fr", SITE],
      ["", ""],
      ["", SITE],
      ["pas une adresse", SITE],
      ["mailto:contact@mon-cabinet.fr", SITE],
    ];
    for (const [a, b] of DIFFERENT) expect([a, b, isSameSiteHost(a, b), isSameSiteHost(b, a)]).toEqual([a, b, false, false]);
  });

  // Aujourd'hui : deux adresses sans hôte (mailto:, tel:, javascript:, data:) ont toutes deux un hôte vide et
  // passent donc pour « le même site » ; `externalHosts("mailto:…")` rend de même ["", "www."]. Aucun appelant
  // touché pour l'instant (les adresses comparées sont déjà des adresses web).
  // Correctif proposé : exiger un hôte non vide (ou un protocole http/https) des deux côtés.
  it.fails("constat — deux adresses sans hôte (mailto:, tel:) passent pour le même site", () => {
    expect(isSameSiteHost("mailto:contact@mon-cabinet.fr", "tel:0612345678")).toBe(false);
  });
});

// ─── Plateformes de rendez-vous ──────────────────────────────────────────────

describe("BOOKING_PLATFORMS, bookingPlatformOf, bookingPlatformLabel", () => {
  it("identifiants et hôtes uniques, hôtes nus en minuscules, libellés renseignés ; BOOKING_PLATFORM_HOSTS les réunit tous", () => {
    const ids = BOOKING_PLATFORMS.map((platform) => platform.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z][a-z0-9_]*$/);
    expect(BOOKING_PLATFORM_HOSTS).toEqual(BOOKING_PLATFORMS.flatMap((platform) => [...platform.hosts]));
    expect(new Set(BOOKING_PLATFORM_HOSTS).size).toBe(BOOKING_PLATFORM_HOSTS.length);
    for (const host of BOOKING_PLATFORM_HOSTS) {
      expect(host).toBe(bareHost(host));
      expect(host).toMatch(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/);
    }
    for (const platform of BOOKING_PLATFORMS) {
      expect(platform.label.trim()).not.toBe("");
      expect(platform.hosts.length).toBeGreaterThan(0);
      expect(bookingPlatformLabel(platform.id)).toBe(platform.label);
    }
    expect(bookingPlatformLabel("doctolib")).toBe("Doctolib");
    expect(bookingPlatformLabel("agenda_ch")).toBe("Agenda.ch");
  });

  it("un lien vers une plateforme, son « www. » ou l'un de ses sous-domaines est reconnu, quel que soit le chemin", () => {
    for (const platform of BOOKING_PLATFORMS) {
      for (const host of platform.hosts) {
        for (const url of [`https://${host}`, `https://www.${host}/praticien/claire-dupont?motif=1#rdv`, `http://cabinet-claire.${host}/`, `https://${host.toUpperCase()}./x`]) {
          expect([url, bookingPlatformOf(url)]).toEqual([url, platform.id]);
        }
      }
    }
    expect(bookingPlatformOf("https://www.doctolib.fr/sophrologue/albi/claire-dupont")).toBe("doctolib");
    expect(bookingPlatformOf("https://calendly.com/claire-dupont/premiere-seance")).toBe("calendly");
    expect(bookingPlatformOf("https://claire.simplybook.it/v2/")).toBe("simplybook");
  });

  it("null pour un autre hôte, un hôte qui ne fait que ressembler, une adresse relative, vide ou d'un autre type", () => {
    const OTHERS: unknown[] = [
      "https://www.mon-cabinet.fr/rendez-vous",
      "https://mon-doctolib.fr/",
      "https://doctolib.fr.autre.com/x",
      "https://autre.com/doctolib.fr",
      "https://doctolib.fr@autre.com/",
      "https://autre.com/?retour=https://doctolib.fr",
      "https://medical.com/x",
      "https://mon-agenda.ch/",
      "https://calendly.co/x",
      "doctolib.fr",
      "www.doctolib.fr/x",
      "//doctolib.fr/x",
      "/rendez-vous",
      "mailto:rdv@doctolib.fr",
      "tel:0612345678",
      "",
      null,
      undefined,
      42,
      {},
      [],
    ];
    for (const url of OTHERS) expect([url, bookingPlatformOf(url as string)]).toEqual([url, null]);
  });
});

// ─── Lecture du site ─────────────────────────────────────────────────────────

describe("contrat de la lecture du site", () => {
  const errors = Object.keys(EXTERNAL_READ_ERRORS) as ExternalReadError[];

  it("chaque échec a un titre (sans point final : il est suivi du conseil) et un conseil (une phrase entière)", () => {
    expect(errors.length).toBeGreaterThan(0);
    for (const error of errors) {
      const { title, hint } = EXTERNAL_READ_ERRORS[error];
      for (const text of [title, hint]) {
        expect(text.trim()).not.toBe("");
        expect(text).toBe(text.trim());
      }
      expect([error, title.endsWith(".")]).toEqual([error, false]);
      expect([error, hint.endsWith(".")]).toEqual([error, true]);
    }
    expect(new Set(errors.map((error) => EXTERNAL_READ_ERRORS[error].title)).size).toBe(errors.length);
    expect(EXTERNAL_READ_ERRORS.robots.hint).toContain(`« ${EXTERNAL_BOT_NAME} »`);
  });

  it("isExternalReadError : vrai pour chaque code, faux pour tout le reste (casse, autres types, propriétés héritées)", () => {
    for (const error of errors) expect(isExternalReadError(error)).toBe(true);
    for (const value of ["", "BLOCKED", " blocked", "inconnu", null, undefined, 404, {}, ["blocked"], ...PROTOTYPE_KEYS]) expect([value, isExternalReadError(value)]).toEqual([value, false]);
  });

  it("coller le texte des pages est proposé pour les échecs dont le conseil le dit, et pour eux seuls", () => {
    const suggestsPasting = errors.filter((error) => /coll(er|ez)/i.test(EXTERNAL_READ_ERRORS[error].hint));
    expect([...EXTERNAL_PASTE_FALLBACK_ERRORS].sort()).toEqual([...suggestsPasting].sort());
    expect([...EXTERNAL_PASTE_FALLBACK_ERRORS].sort()).toEqual(["blocked", "empty", "robots", "too_large"]);
  });

  it("limites cohérentes entre elles ; états, types de page et outils de création sans doublon", () => {
    const S = EXTERNAL_SITE_LIMITS;
    for (const value of Object.values(S)) expect(value).toBeGreaterThan(0);
    expect(S.pastedMinChars).toBeLessThan(S.pastedMaxChars);
    // Une seule page bien remplie suffit à tenter un profil
    expect(S.minChars).toBeLessThanOrEqual(S.pageChars);
    expect(Number.isInteger(S.maxPages) && Number.isInteger(S.readsPerMonth) && Number.isInteger(S.refreshDays)).toBe(true);
    for (const list of [EXTERNAL_SITE_STATUSES, EXTERNAL_PAGE_KINDS, EXTERNAL_CMS] as readonly (readonly string[])[]) expect(new Set(list).size).toBe(list.length);
    expect(EXTERNAL_PAGE_KINDS).toContain("home");
    expect(EXTERNAL_PAGE_KINDS).toContain("other");
    expect(Object.keys(EXTERNAL_CMS_LABELS).sort()).toEqual([...EXTERNAL_CMS].sort());
    const labels = EXTERNAL_CMS.map((cms) => EXTERNAL_CMS_LABELS[cms]);
    for (const label of labels) expect(label.trim()).not.toBe("");
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("faits et profil vides : rien dedans, et le profil vide n'est pas exploitable", () => {
    expect(EMPTY_EXTERNAL_FACTS).toEqual({ phones: [], emails: [], hours: [], bookingLinks: [], social: {}, tags: {} });
    expect(EMPTY_EXTERNAL_PROFILE).toEqual({ headline: "", intro: [], highlights: [], specialties: [], about: { paragraphs: [], credentials: [] }, practical: [], process: [], faq: [], contact: { hours: [] }, social: {} });
    expect(isExternalProfileUsable(EMPTY_EXTERNAL_PROFILE)).toBe(false);
  });
});

// ─── Lien de rendez-vous ─────────────────────────────────────────────────────

describe("cleanBookingUrl", () => {
  it("adresse web : https (http converti), sans ancre, paramètres gardés, espaces extérieurs retirés", () => {
    const CASES: [string, string][] = [
      ["https://www.doctolib.fr/sophrologue/albi/claire-dupont", "https://www.doctolib.fr/sophrologue/albi/claire-dupont"],
      ["http://www.doctolib.fr/claire", "https://www.doctolib.fr/claire"],
      ["HTTPS://WWW.DOCTOLIB.FR/Claire?motif=1#rdv", "https://www.doctolib.fr/Claire?motif=1"],
      ["  https://calendly.com/claire\n", "https://calendly.com/claire"],
      ["https://calendly.com/claire?month=2026-11&utm_source=site", "https://calendly.com/claire?month=2026-11&utm_source=site"],
      ["https://www.mon-cabinet.fr/prendre-rendez-vous", "https://www.mon-cabinet.fr/prendre-rendez-vous"],
      ["https://cal.com/café rdv", "https://cal.com/caf%C3%A9%20rdv"],
      ["https://wa.me/33612345678", "https://wa.me/33612345678"],
      ["http://calendly.com:80/claire", "https://calendly.com/claire"],
    ];
    for (const [input, url] of CASES) expect([input, cleanBookingUrl(input)]).toEqual([input, url]);
  });

  it("refusés : adresse relative ou sans protocole, identifiants, autres protocoles (javascript:, data:, mailto:…), adresse démesurée", () => {
    const REFUSED: string[] = [
      "",
      "   ",
      "calendly.com/claire",
      "www.doctolib.fr/claire",
      "//calendly.com/claire",
      "/rendez-vous",
      "#rdv",
      "?rdv=1",
      "https://",
      "https://claire:secret@calendly.com/claire",
      "https://claire@calendly.com/",
      "javascript:alert(1)",
      "JaVaScRiPt:alert(1)",
      " javascript:alert(1)",
      "java\tscript:alert(1)",
      "javascript://calendly.com/%0aalert(1)",
      "data:text/html;base64,PHNjcmlwdD4=",
      "vbscript:msgbox(1)",
      "file:///etc/passwd",
      "ftp://calendly.com/claire",
      "mailto:rdv@mon-cabinet.fr",
      "sms:0612345678",
      "whatsapp://send?phone=33612345678",
      "blob:https://calendly.com/uuid",
      "about:blank",
      `https://calendly.com/${"a".repeat(480)}`,
      `https://calendly.com/${"a".repeat(380)}`,
      `https://calendly.com/?${"é".repeat(100)}`,
    ];
    for (const input of REFUSED) expect([input, cleanBookingUrl(input)]).toEqual([input, undefined]);
    // 400 caractères au plus une fois l'adresse écrite
    const atLimit = `https://calendly.com/${"a".repeat(400 - "https://calendly.com/".length)}`;
    expect(cleanBookingUrl(atLimit)).toBe(atLimit);
    expect(cleanBookingUrl(`${atLimit}a`)).toBeUndefined();
  });

  it("numéro en « tel: » : chiffres seuls, « + » de tête gardé, 6 à 15 chiffres", () => {
    const CASES: [string, string | undefined][] = [
      ["tel:0612345678", "tel:0612345678"],
      ["tel:06 12 34 56 78", "tel:0612345678"],
      ["tel:06.12.34.56.78", "tel:0612345678"],
      ["tel:06-12-34-56-78", "tel:0612345678"],
      ["TEL:0612345678", "tel:0612345678"],
      ["Tel:+33 6 12 34 56 78", "tel:+33612345678"],
      ["  tel:+33612345678  ", "tel:+33612345678"],
      ["tel: 0612345678", "tel:0612345678"],
      ["tel://0612345678", "tel:0612345678"],
      ["tel:0033612345678", "tel:0033612345678"],
      ["tel:123456", "tel:123456"],
      ["tel:123456789012345", "tel:123456789012345"],
      // Trop court, trop long, sans chiffre, « + » mal placé
      ["tel:12345", undefined],
      ["tel:1234567890123456", undefined],
      ["tel:", undefined],
      ["tel:+", undefined],
      ["tel:abc", undefined],
      ["tel:0800-VOYAGE", undefined],
      ["tel:06+12345678", undefined],
      ["tel:++33612345678", undefined],
      [`tel:${ARABIC_DIGITS}`, undefined],
      // Un numéro sans « tel: » n'est pas un lien
      ["06 12 34 56 78", undefined],
      ["+33612345678", undefined],
      ["telephone:0612345678", undefined],
    ];
    for (const [input, link] of CASES) expect([input, cleanBookingUrl(input)]).toEqual([input, link]);
  });

  it("toute valeur qui n'est pas un texte : undefined", () => {
    for (const value of [null, undefined, 42, true, {}, [], ["https://calendly.com/claire"], { toString: () => "https://calendly.com/claire" }]) expect(cleanBookingUrl(value)).toBeUndefined();
  });

  it("un lien nettoyé reste le même au nettoyage suivant", () => {
    for (const input of ["http://www.doctolib.fr/Claire?motif=1#rdv", "Tel:+33 6 12 34 56 78", "https://cal.com/café rdv"]) {
      const cleaned = cleanBookingUrl(input);
      expect(cleaned).toBeDefined();
      expect(cleanBookingUrl(cleaned)).toBe(cleaned);
    }
  });

  // Aujourd'hui : « tel:+33 (0)6 12 34 56 78 » → « tel:+330612345678 ». Le zéro entre parenthèses ne se compose pas
  // après l'indicatif : le bouton « Prendre rendez-vous » appelle un numéro qui n'existe pas. Ce lien est proposé
  // par l'extraction du profil, saisi dans le studio (rubrique « Prise de rendez-vous »), puis recopié dans
  // `sites.booking_url` à l'activation (`setExternalSiteActive`).
  // Correctif proposé : retirer « (0) » quand le numéro commence par « + » ou « 00 » (ou refuser le lien).
  it.fails("constat — « tel:+33 (0)6… » : le zéro entre parenthèses est gardé après l'indicatif", () => {
    expect(["tel:+33612345678", undefined]).toContain(cleanBookingUrl("tel:+33 (0)6 12 34 56 78"));
  });

  // Aujourd'hui : « tel:0612%20345678 » → « tel:061220345678 » et « tel:%2B33612345678 » → « tel:233612345678 » :
  // les chiffres du code d'encodage (%20 = espace, %2B = « + ») entrent dans le numéro.
  // Correctif proposé : décoder le lien (`decodeURIComponent`, sous garde) avant d'en garder les chiffres.
  it.fails("constat — « tel: » encodé (%20, %2B) : les chiffres du code d'encodage entrent dans le numéro", () => {
    expect(["tel:0612345678", undefined]).toContain(cleanBookingUrl("tel:0612%20345678"));
    expect(["tel:+33612345678", undefined]).toContain(cleanBookingUrl("tel:%2B33612345678"));
  });
});

// ─── Téléphone ───────────────────────────────────────────────────────────────

describe("cleanPhone", () => {
  it("numéro gardé tel qu'il est écrit : chiffres, espaces, points, tirets, parenthèses, « + »", () => {
    for (const phone of ["06 12 34 56 78", "06.12.34.56.78", "06-12-34-56-78", "0612345678", "+33 6 12 34 56 78", "+33 (0)6 12 34 56 78", "(+33) 6 12 34 56 78", "0033 6 12 34 56 78", "+41 22 123 45 67", "123456", "123456789012345"]) {
      expect([phone, cleanPhone(phone)]).toEqual([phone, phone]);
    }
  });

  it("espaces resserrés et retirés en bordure ; jamais de lettre, de balise ni d'autre signe dans le numéro rendu", () => {
    expect(cleanPhone("  06  12   34 56 78 ")).toBe("06 12 34 56 78");
    expect(cleanPhone("+33 6 12  34 56 78\n")).toBe("+33 6 12 34 56 78");
    for (const input of ["<b>06 12 34 56 78</b>", "tel:0612345678", "06/12/34/56/78", "06 12 34 56 78 ☎", "Portable : 06 12 34 56 78", `06${char(0xa0)}12${char(0xa0)}34${char(0xa0)}56${char(0xa0)}78`, "06 12 34 56 78<script>alert(1)</script>"]) {
      const phone = cleanPhone(input);
      // Selon le cas le numéro est gardé ou la valeur refusée ; ce qui est rendu ne porte que des signes de numéro
      expect([input, phone === undefined || /^[\d+ .()-]{6,24}$/.test(phone)]).toEqual([input, true]);
    }
  });

  it("refusés : moins de 6 chiffres, plus de 15, plus de 24 caractères, aucun chiffre, chiffres non ASCII, autre type", () => {
    const REFUSED: unknown[] = [
      "",
      " ",
      "abc",
      "12345",
      "1234567890123456",
      "06 12 34 56 78 / 05 55 01 02 03",
      "0 6 1 2 3 4 5 6 7 8 9 0 1",
      "------------------------1234567",
      ARABIC_DIGITS,
      FULLWIDTH_DIGITS,
      null,
      undefined,
      612345678,
      ["0612345678"],
      { phone: "0612345678" },
      true,
    ];
    for (const value of REFUSED) expect([value, cleanPhone(value)]).toEqual([value, undefined]);
    expect(cleanPhone("1".repeat(1_000_000))).toBeUndefined();
  });

  it("un numéro nettoyé reste le même au nettoyage suivant", () => {
    for (const input of ["  06  12   34 56 78 ", "+33 (0)6 12 34 56 78", "06.12.34.56.78"]) {
      const cleaned = cleanPhone(input);
      expect(cleaned).toBeDefined();
      expect(cleanPhone(cleaned)).toBe(cleaned);
    }
  });

  // Aujourd'hui : les lettres sont retirées, la ponctuation et les chiffres voisins restent →
  // « Tél. : 06.12.34.56.78 » donne « . 06.12.34.56.78 », « 06 12 34 56 78 (portable) » donne « 06 12 34 56 78 () »,
  // « 9h-19h : 0612345678 » donne « 9-19 0612345678 » (un autre numéro). Le formulaire « Contact » du studio
  // tient ces saisies pour valides (`checkRubricDraft` s'appuie sur `cleanPhone`) et les outils publicitaires
  // reprennent le numéro (`externalAdsSite`).
  // Correctif proposé : ne garder qu'un numéro (première suite de chiffres et de séparateurs de la bonne longueur),
  // ou refuser dès que le texte porte autre chose qu'un numéro.
  it.fails("constat — un numéro entouré de texte garde une ponctuation orpheline ou agrège les chiffres voisins", () => {
    const CASES: [string, string][] = [
      ["Tél. : 06.12.34.56.78", "06.12.34.56.78"],
      ["06 12 34 56 78 (portable)", "06 12 34 56 78"],
      ["9h-19h : 0612345678", "0612345678"],
    ];
    for (const [input, phone] of CASES) expect([phone, undefined]).toContain(cleanPhone(input));
  });
});

// ─── Réseaux sociaux ─────────────────────────────────────────────────────────

describe("cleanSocialLinks", () => {
  it("page de profil sur l'hôte du réseau (sous-domaines compris) : gardée en https, sans ancre", () => {
    expect(
      cleanSocialLinks({
        instagram: "https://www.instagram.com/cabinet.claire/",
        facebook: "http://m.facebook.com/cabinetclaire#avis",
        linkedin: "https://fr.linkedin.com/in/claire-dupont",
        tiktok: "https://www.tiktok.com/@claire.sophro",
        youtube: "HTTPS://WWW.YOUTUBE.COM/@ClaireSophro",
      }),
    ).toEqual({
      instagram: "https://www.instagram.com/cabinet.claire/",
      facebook: "https://m.facebook.com/cabinetclaire",
      linkedin: "https://fr.linkedin.com/in/claire-dupont",
      tiktok: "https://www.tiktok.com/@claire.sophro",
      youtube: "https://www.youtube.com/@ClaireSophro",
    });
    expect(cleanSocialLinks({ facebook: "https://fb.com/cabinetclaire" })).toEqual({ facebook: "https://fb.com/cabinetclaire" });
    expect(cleanSocialLinks({ facebook: "https://www.facebook.com/profile.php?id=100012345678" })).toEqual({ facebook: "https://www.facebook.com/profile.php?id=100012345678" });
    expect(cleanSocialLinks({ linkedin: "https://www.linkedin.com/company/cabinet-claire/" })).toEqual({ linkedin: "https://www.linkedin.com/company/cabinet-claire/" });
  });

  it("écartés : lien d'un autre réseau, hôte qui ne fait que ressembler, accueil du réseau, autre protocole, valeur d'un autre type", () => {
    const REFUSED: Record<string, unknown>[] = [
      // Le lien doit être celui du réseau de sa clé
      { instagram: "https://www.facebook.com/cabinetclaire" },
      { facebook: "https://www.instagram.com/cabinet.claire" },
      { youtube: "https://www.tiktok.com/@claire" },
      // Hôtes ressemblants
      { instagram: "https://instagram.com.autre.fr/cabinet" },
      { instagram: "https://autre.fr/instagram.com/cabinet" },
      { instagram: "https://notinstagram.com/cabinet" },
      { instagram: "https://instagram.com@autre.fr/cabinet" },
      { instagram: "https://xn--nstagram-vfb.com/cabinet" },
      { facebook: "https://www.messenger.com/t/cabinetclaire" },
      // Accueil du réseau : pas un profil
      { instagram: "https://www.instagram.com/" },
      { facebook: "https://facebook.com" },
      { linkedin: "https://www.linkedin.com/?trk=accueil" },
      { youtube: "https://www.youtube.com/#haut" },
      // Protocole, forme, type
      { instagram: "javascript:alert(1)" },
      { instagram: "data:text/html,<script>alert(1)</script>" },
      { instagram: "instagram.com/cabinet.claire" },
      { instagram: "@cabinet.claire" },
      { instagram: "" },
      { instagram: null },
      { instagram: 42 },
      { instagram: ["https://www.instagram.com/cabinet.claire"] },
      { instagram: `https://www.instagram.com/${"a".repeat(480)}` },
    ];
    for (const value of REFUSED) expect([value, cleanSocialLinks(value)]).toEqual([value, {}]);
  });

  it("boutons de partage, fenêtres et modules du réseau : ce ne sont pas des profils", () => {
    const SHARE: Record<string, string>[] = [
      { facebook: "https://www.facebook.com/sharer/sharer.php?u=https%3A%2F%2Fwww.mon-cabinet.fr" },
      { facebook: "https://www.facebook.com/sharer.php?u=https%3A%2F%2Fwww.mon-cabinet.fr" },
      { facebook: "https://www.facebook.com/share.php?u=https%3A%2F%2Fwww.mon-cabinet.fr" },
      { facebook: "https://www.facebook.com/dialog/share?app_id=1&href=https%3A%2F%2Fwww.mon-cabinet.fr" },
      { facebook: "https://www.facebook.com/plugins/like.php?href=https%3A%2F%2Fwww.mon-cabinet.fr" },
      { linkedin: "https://www.linkedin.com/sharing/share-offsite/?url=https%3A%2F%2Fwww.mon-cabinet.fr" },
      { linkedin: "https://www.linkedin.com/cws/share?url=https%3A%2F%2Fwww.mon-cabinet.fr" },
      { tiktok: "https://www.tiktok.com/share/video/123" },
    ];
    for (const value of SHARE) expect([value, cleanSocialLinks(value)]).toEqual([value, {}]);
  });

  it("seuls les cinq réseaux du contrat sont lus ; toute valeur qui n'est pas un objet donne un objet vide", () => {
    expect(cleanSocialLinks({ twitter: "https://twitter.com/claire", pinterest: "https://www.pinterest.fr/claire", x: "https://x.com/claire", instagram: "https://www.instagram.com/claire" })).toEqual({ instagram: "https://www.instagram.com/claire" });
    for (const value of [null, undefined, "https://www.instagram.com/claire", 42, true, [], [{ instagram: "https://www.instagram.com/claire" }]]) expect(cleanSocialLinks(value)).toEqual({});
  });

  it("clés « __proto__ » et « constructor » : ni lues comme des réseaux, ni écrites où que ce soit", () => {
    const hostile: unknown = JSON.parse('{"__proto__":{"instagram":"https://www.instagram.com/injecte"},"constructor":{"prototype":{"instagram":"https://www.instagram.com/injecte"}},"facebook":"https://www.facebook.com/cabinetclaire"}');
    const links = cleanSocialLinks(hostile);
    expect(links).toEqual({ facebook: "https://www.facebook.com/cabinetclaire" });
    expect(Object.keys(links)).toEqual(["facebook"]);
    expect(({} as Record<string, unknown>).instagram).toBeUndefined();
  });

  // Aujourd'hui : le bouton « Partager sur LinkedIn » (« /shareArticle?mini=true&url=… ») est gardé comme page de
  // profil — le motif des boutons de partage exige une fin de mot après « share ». Le formulaire « Réseaux
  // sociaux » du studio l'accepte donc, et le lien peut compléter le pied de page du site à l'activation.
  // Correctif proposé : des motifs par réseau, comme `NOT_A_PROFILE` du lecteur (`providers/website/facts.ts`).
  it.fails("constat — le bouton de partage LinkedIn « /shareArticle » passe pour une page de profil", () => {
    expect(cleanSocialLinks({ linkedin: "https://www.linkedin.com/shareArticle?mini=true&url=https%3A%2F%2Fwww.mon-cabinet.fr" })).toEqual({});
  });

  // Aujourd'hui : le même motif cherche « /share », « /intent », « /dialog »… n'importe où dans le chemin ; un
  // profil nommé « share.the.calm » ou « share-yoga » est refusé (« Ce lien n'est pas celui d'une page Instagram »).
  // Correctif proposé : ne tester que le premier segment du chemin, par réseau.
  it.fails("constat — un profil dont le nom commence par « share » est pris pour un bouton de partage", () => {
    const profile = "https://www.instagram.com/share.the.calm/";
    expect(cleanSocialLinks({ instagram: profile })).toEqual({ instagram: profile });
  });
});

// ─── Profil ──────────────────────────────────────────────────────────────────

const clean = (raw: unknown, siteUrl: string = SITE): ExternalSiteProfile => cleanExternalProfile(raw, siteUrl);

/** Rubriques du profil, dans l'ordre où le nettoyage les rend (`bookingUrl` seulement s'il y en a un). */
const PROFILE_KEYS = ["headline", "intro", "highlights", "specialties", "about", "practical", "process", "faq", "contact", "social"];

/**
 * Longueurs appliquées par le nettoyage : celles que le contrat nomme (`EXTERNAL_PROFILE_LIMITS`) et celles qu'il
 * applique sans les nommer (titres courts, intertitres, diplômes, horaires, liens), reprises par les formulaires du studio.
 */
const MAX = {
  headline: L.headline,
  paragraph: L.paragraph,
  cardTitle: 60,
  shortText: L.shortText,
  specialtyTitle: L.specialtyTitle,
  excerpt: L.specialtyExcerpt,
  summary: L.specialtySummary,
  heading: 90,
  answer: L.answer,
  credential: 120,
  hoursLabel: 40,
  hoursValue: 80,
  phone: 24,
  email: 120,
  link: 400,
  slug: 60,
} as const;

/** Un texte tient-il dans sa borne ? Un texte raccourci garde au plus `max` caractères, suivis de « … ». */
const within = (text: string, max: number): boolean => text.length <= max || (text.length === max + 1 && text.endsWith("…"));

/**
 * Ce que tout profil nettoyé garantit, quelle que soit la valeur reçue : forme complète, rien que du JSON, textes
 * sur une ligne sans chevron ni caractère de contrôle, listes et textes bornés, identifiants uniques, et un second
 * nettoyage qui ne change rien.
 */
function expectContract(profile: ExternalSiteProfile, siteUrl: string = SITE): void {
  const issues: string[] = [];
  const check = (ok: boolean, label: string): void => {
    if (!ok) issues.push(label);
  };
  const pair = (items: readonly object[], first: string, second: string, max1: number, max2: number, label: string): void => {
    for (const item of items as readonly Record<string, string>[]) {
      check(Object.keys(item).join() === `${first},${second}`, `${label} : clés ${Object.keys(item).join()}`);
      check((item[first] ?? "") !== "" && within(item[first] ?? "", max1), `${label}.${first}`);
      check((item[second] ?? "") !== "" && within(item[second] ?? "", max2), `${label}.${second}`);
    }
  };

  check(Object.keys(profile).filter((key) => key !== "bookingUrl").join() === PROFILE_KEYS.join(), `rubriques : ${Object.keys(profile).join()}`);
  for (const text of textsOf(profile)) {
    check(text === text.trim() && !/\s\s/.test(text), `espaces : ${JSON.stringify(text)}`);
    check(!/[<>]/.test(text), `chevron : ${JSON.stringify(text)}`);
    check(!hasControl(text), `caractère de contrôle : ${JSON.stringify(text)}`);
    check(!INVISIBLE.test(text), `caractère invisible : ${JSON.stringify(text)}`);
  }

  check(within(profile.headline, MAX.headline), "headline");
  check(profile.intro.length <= L.introParagraphs && profile.intro.every((text) => text !== "" && within(text, MAX.paragraph)), "intro");
  check(profile.highlights.length <= L.highlights, "highlights : nombre");
  for (const item of profile.highlights) {
    check(item.title !== "" && within(item.title, MAX.cardTitle), "highlights.title");
    check(item.text === undefined ? !Object.hasOwn(item, "text") : item.text !== "" && within(item.text, MAX.shortText), "highlights.text");
  }

  check(profile.specialties.length <= L.specialties, "specialties : nombre");
  const slugs = profile.specialties.map((specialty) => specialty.slug);
  check(new Set(slugs).size === slugs.length, `identifiants en double : ${slugs.join()}`);
  for (const specialty of profile.specialties) {
    check(/^[a-z0-9]+(-[a-z0-9]+)*$/.test(specialty.slug) && specialty.slug.length <= MAX.slug + 4, `identifiant : ${specialty.slug}`);
    check(specialty.title !== "" && within(specialty.title, MAX.specialtyTitle), "specialties.title");
    check(within(specialty.excerpt, MAX.excerpt), "specialties.excerpt");
    check(specialty.summary === undefined ? !Object.hasOwn(specialty, "summary") : specialty.summary !== "" && within(specialty.summary, MAX.summary), "specialties.summary");
    check(specialty.url === undefined ? !Object.hasOwn(specialty, "url") : specialty.url.startsWith("https://") && specialty.url.length <= MAX.link && isSameSiteHost(specialty.url, siteUrl), `specialties.url : ${specialty.url}`);
    check(specialty.headings.length <= L.specialtyHeadings && specialty.headings.every((text) => text !== "" && within(text, MAX.heading)), "specialties.headings");
    check(specialty.faq.length <= L.specialtyFaq, "specialties.faq : nombre");
    pair(specialty.faq, "question", "answer", MAX.shortText, MAX.answer, "specialties.faq");
  }

  check(profile.about.paragraphs.length <= L.aboutParagraphs && profile.about.paragraphs.every((text) => text !== "" && within(text, MAX.paragraph)), "about.paragraphs");
  check(profile.about.credentials.length <= L.credentials && profile.about.credentials.every((text) => text !== "" && within(text, MAX.credential)), "about.credentials");
  check(profile.practical.length <= L.practical && profile.process.length <= L.process && profile.faq.length <= L.faq && profile.contact.hours.length <= L.hours, "listes : nombre");
  pair(profile.practical, "title", "text", MAX.cardTitle, MAX.shortText, "practical");
  pair(profile.process, "title", "description", MAX.cardTitle, MAX.shortText, "process");
  pair(profile.faq, "question", "answer", MAX.shortText, MAX.answer, "faq");
  pair(profile.contact.hours, "label", "value", MAX.hoursLabel, MAX.hoursValue, "contact.hours");

  const { address, phone, email, note } = profile.contact;
  check(address === undefined || (address !== "" && within(address, MAX.shortText)), "contact.address");
  check(note === undefined || (note !== "" && within(note, MAX.shortText)), "contact.note");
  check(phone === undefined || (/^[\d+ .()-]+$/.test(phone) && phone.length <= MAX.phone), `contact.phone : ${phone}`);
  check(email === undefined || (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email === email.toLowerCase() && email.length <= MAX.email), `contact.email : ${email}`);
  check(profile.bookingUrl === undefined ? !Object.hasOwn(profile, "bookingUrl") : /^(https:\/\/\S+|tel:\+?\d{6,15})$/.test(profile.bookingUrl) && profile.bookingUrl.length <= MAX.link, `bookingUrl : ${profile.bookingUrl}`);
  for (const [network, link] of Object.entries(profile.social)) check(["instagram", "facebook", "linkedin", "tiktok", "youtube"].includes(network) && link.startsWith("https://") && link.length <= MAX.link, `social.${network} : ${link}`);

  expect(issues).toEqual([]);
  // Rien que du JSON : aucune clé à valeur `undefined`, aucun objet exotique — la valeur ressort intacte d'une colonne JSONB
  expect(JSON.parse(JSON.stringify(profile))).toStrictEqual(profile);
  // Un profil nettoyé reste le même au nettoyage suivant (le service nettoie de nouveau ce que l'extracteur lui rend)
  expect(cleanExternalProfile(profile, siteUrl)).toStrictEqual(profile);
}

/** Profil complet tel que le lecteur et l'extracteur le rendraient pour un site ordinaire. */
const RAW_PROFILE = {
  headline: "Sophrologue à Albi : retrouver le calme, à votre rythme",
  intro: ["Je vous reçois au cabinet ou en visio, du lundi au samedi.", "Chaque accompagnement est construit avec vous."],
  highlights: [{ title: "Séances en visio", text: "Depuis chez vous, partout en France" }, { title: "Cabinet accessible" }],
  specialties: [
    {
      title: "Gestion du stress",
      excerpt: "Relâcher le corps pour apaiser le mental.",
      url: `${SITE}/gestion-du-stress`,
      summary: "Six à huit séances pour repérer vos signaux d'alerte et apprendre des exercices courts.",
      headings: ["Pour qui ?", "Comment se déroule l'accompagnement ?"],
      faq: [{ question: "Combien de séances ?", answer: "Six à huit en moyenne." }],
    },
    { title: "Sommeil", excerpt: "Retrouver des nuits sereines." },
    { title: "Préparation aux examens", summary: "Des exercices courts à refaire avant l'épreuve." },
  ],
  about: {
    paragraphs: ["Sophrologue certifiée, j'exerce à Albi depuis 2015."],
    credentials: ["Certification RNCP de sophrologue (2015)", "Formation en sophrologie périnatale"],
  },
  practical: [
    { title: "Durée", text: "1 heure" },
    { title: "Tarif", text: "60 € la séance" },
  ],
  process: [{ title: "Un temps d'échange", description: "Nous faisons le point sur ce qui vous amène." }],
  faq: [{ question: "Est-ce remboursé ?", answer: "Certaines mutuelles remboursent une partie des séances." }],
  contact: {
    address: "12 rue des Lilas, 81000 Albi",
    phone: "05 63 00 00 00",
    email: "contact@mon-cabinet.fr",
    hours: [{ label: "Lundi au vendredi", value: "9h – 18h" }],
    note: "Parking gratuit devant le cabinet",
  },
  bookingUrl: "https://www.doctolib.fr/sophrologue/albi/claire-dupont",
  social: { instagram: "https://www.instagram.com/cabinet.claire" },
};

/** Le même profil, nettoyé : ce que le service enregistre. */
const READ: ExternalSiteProfile = clean(RAW_PROFILE);

describe("cleanExternalProfile — forme et valeurs inexploitables", () => {
  it("profil ordinaire : gardé tel quel, identifiants de spécialité dérivés des titres", () => {
    expect(READ).toStrictEqual({
      headline: RAW_PROFILE.headline,
      intro: RAW_PROFILE.intro,
      highlights: RAW_PROFILE.highlights,
      specialties: [
        { slug: "gestion-du-stress", ...RAW_PROFILE.specialties[0] },
        { slug: "sommeil", title: "Sommeil", excerpt: "Retrouver des nuits sereines.", headings: [], faq: [] },
        { slug: "preparation-aux-examens", title: "Préparation aux examens", excerpt: "", summary: "Des exercices courts à refaire avant l'épreuve.", headings: [], faq: [] },
      ],
      about: RAW_PROFILE.about,
      practical: RAW_PROFILE.practical,
      process: RAW_PROFILE.process,
      faq: RAW_PROFILE.faq,
      contact: RAW_PROFILE.contact,
      bookingUrl: RAW_PROFILE.bookingUrl,
      social: RAW_PROFILE.social,
    });
    expectContract(READ);
  });

  it("valeur inexploitable (rien, texte, nombre, liste, fonction, date…) : un profil vide, jamais d'erreur", () => {
    const values: unknown[] = [null, undefined, 0, 42, NaN, "", "texte", true, [], [RAW_PROFILE], () => RAW_PROFILE, Symbol("profil"), new Date(0), new Map([["headline", "Accroche"]]), {}];
    for (const value of values) {
      const profile = clean(value);
      expect(profile).toStrictEqual(EMPTY_EXTERNAL_PROFILE);
      // Un nouvel objet à chaque fois : la constante partagée n'est jamais rendue
      expect(profile).not.toBe(EMPTY_EXTERNAL_PROFILE);
      expect(profile.contact.hours).not.toBe(EMPTY_EXTERNAL_PROFILE.contact.hours);
    }
  });

  it("mauvais type à chaque rubrique : la rubrique est vide, les autres ne sont pas touchées", () => {
    expect(clean({ headline: 42, intro: "un paragraphe", highlights: { title: "Point fort" }, specialties: "Sommeil", about: [], practical: null, process: 3, faq: "?", contact: "06 12 34 56 78", bookingUrl: 42, social: [] })).toStrictEqual(EMPTY_EXTERNAL_PROFILE);
    for (const key of PROFILE_KEYS) {
      for (const value of [null, 42, "texte", true, [[]], { length: 3 }]) {
        const profile = clean({ ...RAW_PROFILE, [key]: value });
        expectContract(profile);
        for (const other of PROFILE_KEYS.filter((name) => name !== key)) expect([key, other, profile[other as keyof ExternalSiteProfile]]).toStrictEqual([key, other, READ[other as keyof ExternalSiteProfile]]);
      }
    }
  });

  it("mauvais type à l'intérieur des rubriques : seules les entrées bien formées restent", () => {
    const profile = clean({
      headline: ["Accroche"],
      intro: [1, null, {}, ["x"], "Présentation", true],
      highlights: ["Point fort", 1, null, { title: 1 }, { title: "Titre", text: 2 }, { title: " ", text: "texte seul" }],
      specialties: ["Sommeil", null, 1, { title: null }, { title: 12 }, { title: "Stress", slug: 7, excerpt: 1, url: 2, summary: [], headings: "intertitre", faq: {} }],
      about: { paragraphs: "un paragraphe", credentials: [1, "Diplôme", { name: "x" }] },
      practical: [{ title: "Tarif" }, { text: "60 €" }, { title: "Tarif", text: 60 }, { title: "Durée", text: "1 heure" }],
      process: [{ title: "Étape", description: "" }, ["Étape", "Description"], { title: "Échange", description: "Nous faisons le point." }],
      faq: [{ question: "Question ?" }, { answer: "Réponse." }, { question: "Où ?", answer: "À Albi." }],
      contact: { address: 12, phone: 612345678, email: ["contact@mon-cabinet.fr"], hours: [{ label: "Lundi" }, "9h-18h", { label: "Mardi", value: "9h – 18h" }], note: {} },
      bookingUrl: ["https://www.doctolib.fr/claire"],
      social: { instagram: 42, facebook: null },
    });
    expect(profile).toStrictEqual({
      headline: "",
      intro: ["Présentation"],
      highlights: [{ title: "Titre" }],
      specialties: [{ slug: "stress", title: "Stress", excerpt: "", headings: [], faq: [] }],
      about: { paragraphs: [], credentials: ["Diplôme"] },
      practical: [{ title: "Durée", text: "1 heure" }],
      process: [{ title: "Échange", description: "Nous faisons le point." }],
      faq: [{ question: "Où ?", answer: "À Albi." }],
      contact: { hours: [{ label: "Mardi", value: "9h – 18h" }] },
      social: {},
    });
  });

  it("valeurs hostiles à chaque emplacement du profil : le contrat tient toujours", () => {
    const HOSTILE: unknown[] = [
      null,
      undefined,
      0,
      -1,
      NaN,
      true,
      "",
      "   ",
      "<script>alert(1)</script>",
      '"><img src=x onerror=alert(1)>',
      "a < b > c",
      `${char(0)}${char(7)}${char(0x1b)}[31m${char(0x7f)}`,
      `invisible${char(0x200b)}${char(0x202e)}${char(0xfeff)}`,
      "😀".repeat(300),
      "é".repeat(2_000),
      "mot ".repeat(1_000),
      "x".repeat(20_000),
      "javascript:alert(1)",
      "https://autre.fr/page",
      `${SITE}/page`,
      "__proto__",
      [],
      [null, 1, "a", ["b"], {}],
      Array.from({ length: 200 }, (_, index) => `Entrée ${index}`),
      Array.from({ length: 200 }, (_, index) => ({ title: `Titre ${index}`, text: "Texte", description: "Texte", question: `Question ${index} ?`, answer: "Réponse", label: `Jour ${index}`, value: "9h" })),
      {},
      { title: "<b>Titre</b>", text: "x".repeat(5_000), question: "?", answer: "x", label: "L", value: "V", slug: "../..", url: "javascript:alert(1)" },
    ];
    const TEMPLATES: ((value: unknown) => unknown)[] = [
      ...PROFILE_KEYS.map((key) => (value: unknown) => ({ [key]: value })),
      (value) => ({ bookingUrl: value }),
      (value) => ({ highlights: [{ title: value, text: value }] }),
      (value) => ({ specialties: [{ title: value }, { title: "Sommeil", slug: value, excerpt: value, url: value, summary: value, headings: value, faq: value }] }),
      (value) => ({ specialties: [{ title: "Sommeil", headings: [value, value], faq: [{ question: value, answer: value }] }] }),
      (value) => ({ about: { paragraphs: value, credentials: value } }),
      (value) => ({ about: { paragraphs: [value], credentials: [value] } }),
      (value) => ({ practical: [{ title: value, text: value }], process: [{ title: value, description: value }], faq: [{ question: value, answer: value }] }),
      (value) => ({ contact: { address: value, phone: value, email: value, hours: value, note: value } }),
      (value) => ({ contact: { hours: [{ label: value, value }] } }),
      (value) => ({ social: { instagram: value, facebook: value, linkedin: value, tiktok: value, youtube: value } }),
    ];
    for (const template of TEMPLATES) for (const value of HOSTILE) expectContract(clean(template(value)));
  });

  it("ce qui est reçu n'est jamais modifié, et ce qui est rendu ne partage rien avec lui", () => {
    const frozen = deepFreeze(structuredClone(RAW_PROFILE));
    const profile = clean(frozen);
    expect(profile).toStrictEqual(READ);
    expect(frozen).toStrictEqual(RAW_PROFILE);
    expect(profile.intro).not.toBe(frozen.intro);
    expect(profile.specialties[0]).not.toBe(frozen.specialties[0]);
    expect(profile.contact).not.toBe(frozen.contact);
  });

  it("clés « __proto__ », « constructor », « prototype » : ignorées, rien n'est écrit dans Object.prototype", () => {
    const hostile: unknown = JSON.parse(
      '{"__proto__":{"headline":"injectée","polluted":true},"constructor":{"prototype":{"polluted":true}},"prototype":{"polluted":true},"headline":"Accroche",' +
        '"specialties":[{"__proto__":{"title":"injectée"},"constructor":"x","title":"Sommeil","faq":[{"__proto__":{"question":"injectée"},"question":"Où ?","answer":"À Albi."}]},{"__proto__":{"title":"Spécialité héritée"}}],' +
        '"contact":{"__proto__":{"phone":"0612345678"},"hours":[{"__proto__":{"label":"injecté"},"label":"Lundi","value":"9h"}]},' +
        '"social":{"__proto__":{"instagram":"https://www.instagram.com/injecte"}}}',
    );
    const profile = clean(hostile);
    expect(profile).toStrictEqual({
      ...EMPTY_EXTERNAL_PROFILE,
      headline: "Accroche",
      specialties: [{ slug: "sommeil", title: "Sommeil", excerpt: "", headings: [], faq: [{ question: "Où ?", answer: "À Albi." }] }],
      contact: { hours: [{ label: "Lundi", value: "9h" }] },
    });
    for (const value of [profile, profile.contact, profile.social, profile.specialties[0], profile.about]) expect(Object.getPrototypeOf(value)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(({} as Record<string, unknown>).headline).toBeUndefined();
    // Une spécialité nommée comme une propriété héritée reste une spécialité ordinaire
    expect(clean({ specialties: PROTOTYPE_KEYS.map((title) => ({ title })) }).specialties.map((specialty) => specialty.slug)).toEqual(["constructor", "tostring", "valueof", "hasownproperty", "proto"]);
  });
});

describe("cleanExternalProfile — textes", () => {
  const headlineOf = (text: unknown): string => clean({ headline: text }).headline;

  it("une seule ligne : espaces, tabulations et sauts de ligne réduits à une espace, bords retirés", () => {
    expect(headlineOf("  Sophrologue   à\tAlbi\r\n\nau cabinet  ")).toBe("Sophrologue à Albi au cabinet");
    expect(headlineOf(`10${char(0xa0)}h${char(0xa0)}30 — 60${char(0x202f)}€`)).toBe("10 h 30 — 60 €");
    expect(headlineOf(" \n\t ")).toBe("");
  });

  it("balises retirées, et plus aucun chevron dans le texte rendu, quelle que soit la ruse", () => {
    const CASES: [string, string][] = [
      ["<b>Sophrologue</b> à <i>Albi</i>", "Sophrologue à Albi"],
      ["<p class=\"intro\">Sophrologue</p><br/>à Albi", "Sophrologue à Albi"],
      ["<script>alert(1)</script>Sophrologue", "alert(1) Sophrologue"],
      ["<img src=x onerror=alert(1)>", ""],
      ["Sophrologue <!-- commentaire --> à Albi", "Sophrologue à Albi"],
      // Un caractère invisible glissé dans la balise ne la protège pas
      [`Sophro<${char(0x200b)}script>logue`, "Sophro logue"],
    ];
    for (const [input, text] of CASES) expect([input, headlineOf(input)]).toEqual([input, text]);
    // Balise jamais refermée, balises imbriquées pour se reformer une fois nettoyées, balise démesurée, chevrons en vrac
    const TRICKS = ["<img src=x onerror=alert(1)", "<<script>script>alert(1)<</script>/script>", "<scr<script>ipt>alert(1)</scr</script>ipt>", `<a href="${"x".repeat(1_000)}">lien</a>`, "<a <b <c >> d> e", "<".repeat(1_000), ">".repeat(1_000), "<>".repeat(1_000), "<a ".repeat(10_000)];
    for (const input of TRICKS) expect([input.slice(0, 40), /[<>]/.test(headlineOf(input))]).toEqual([input.slice(0, 40), false]);
  });

  it("caractères de contrôle et caractères invisibles (largeur nulle, sens d'écriture, marque d'ordre des octets) retirés", () => {
    const controls = [0x00, 0x01, 0x07, 0x08, 0x0e, 0x1b, 0x1f, 0x7f];
    const invisible = [0x200b, 0x200c, 0x200d, 0x200e, 0x200f, 0x2028, 0x2029, 0x202a, 0x202e, 0x2060, 0x2066, 0x2069, 0x206f, 0xfeff];
    for (const code of [...controls, ...invisible]) expect([hex(code), headlineOf(`Sophro${char(code)}logue${char(code)}`)]).toEqual([hex(code), "Sophrologue"]);
    // Un texte « retourné » par une marque de sens d'écriture redevient lisible dans l'ordre où il est écrit
    expect(headlineOf(`${char(0x202e)}Sophrologue${char(0x202c)} à Albi`)).toBe("Sophrologue à Albi");
  });

  it("accents, emojis, ponctuation française et signes de mise en forme : gardés tels quels (ce n'est pas du HTML)", () => {
    for (const text of ["Séances à l'unité — 60 € « tout compris »", "🌿 Sophrologie & relaxation 🌸", "**gras** [lien](https://autre.fr) # titre", "Tarifs &amp; remboursement", "100 % naturel ; 1/2 journée"]) {
      expect(headlineOf(text)).toBe(text);
    }
    // Accents décomposés (lettre + accent combinant) : le texte lu reste le même, quelle que soit sa forme Unicode
    const decomposed = `E${char(0x301)}te${char(0x301)} et rentre${char(0x301)}e`;
    expect(headlineOf(decomposed).normalize("NFC")).toBe("Été et rentrée");
  });

  it("texte trop long : coupé sur un mot, ponctuation finale retirée, terminé par « … » ; à la borne exacte il n'est pas touché", () => {
    const exact = "a".repeat(L.headline);
    expect(headlineOf(exact)).toBe(exact);
    const words = "mot ".repeat(100);
    expect(headlineOf(words)).toBe(`${"mot ".repeat(34)}mot…`);
    expect(headlineOf(words)).toHaveLength(L.headline);
    // Ponctuation et tirets juste avant la coupe
    expect(headlineOf(`${"a".repeat(100)} suite, ; : – — - ${"b".repeat(100)}`)).toBe(`${"a".repeat(100)} suite…`);
    // Pas d'espace assez près de la borne : coupe nette à la borne, puis « … »
    expect(headlineOf("a".repeat(500))).toBe(`${"a".repeat(L.headline)}…`);
    expect(headlineOf(`${"a".repeat(50)} ${"b".repeat(500)}`)).toBe(`${"a".repeat(50)} ${"b".repeat(L.headline - 51)}…`);
    expect(headlineOf("é".repeat(1_000))).toBe(`${"é".repeat(L.headline)}…`);
  });

  it("chaque texte du profil a sa borne : `max` caractères gardés au plus, « … » compris ou en plus", () => {
    const long = (prefix: string): string => `${prefix} ${"mot ".repeat(300)}`;
    const solid = "x".repeat(2_000);
    for (const text of [long, () => solid]) {
      const profile = clean({
        headline: text("accroche"),
        intro: [text("intro")],
        highlights: [{ title: text("fort"), text: text("texte") }],
        specialties: [{ title: text("spécialité"), excerpt: text("extrait"), summary: text("résumé"), headings: [text("intertitre")], faq: [{ question: text("question"), answer: text("réponse") }] }],
        about: { paragraphs: [text("à propos")], credentials: [text("diplôme")] },
        practical: [{ title: text("info"), text: text("détail") }],
        process: [{ title: text("étape"), description: text("description") }],
        faq: [{ question: text("question"), answer: text("réponse") }],
        contact: { address: text("adresse"), note: text("précision"), hours: [{ label: text("jour"), value: text("horaire") }] },
      });
      expectContract(profile);
      const lengths: [string, string | undefined, number][] = [
        ["headline", profile.headline, L.headline],
        ["intro", profile.intro[0], L.paragraph],
        ["highlights.title", profile.highlights[0]?.title, 60],
        ["highlights.text", profile.highlights[0]?.text, L.shortText],
        ["specialties.title", profile.specialties[0]?.title, L.specialtyTitle],
        ["specialties.excerpt", profile.specialties[0]?.excerpt, L.specialtyExcerpt],
        ["specialties.summary", profile.specialties[0]?.summary, L.specialtySummary],
        ["specialties.headings", profile.specialties[0]?.headings[0], 90],
        ["specialties.faq.question", profile.specialties[0]?.faq[0]?.question, L.shortText],
        ["specialties.faq.answer", profile.specialties[0]?.faq[0]?.answer, L.answer],
        ["about.paragraphs", profile.about.paragraphs[0], L.paragraph],
        ["about.credentials", profile.about.credentials[0], 120],
        ["practical.title", profile.practical[0]?.title, 60],
        ["practical.text", profile.practical[0]?.text, L.shortText],
        ["process.title", profile.process[0]?.title, 60],
        ["process.description", profile.process[0]?.description, L.shortText],
        ["faq.question", profile.faq[0]?.question, L.shortText],
        ["faq.answer", profile.faq[0]?.answer, L.answer],
        ["contact.address", profile.contact.address, L.shortText],
        ["contact.note", profile.contact.note, L.shortText],
        ["contact.hours.label", profile.contact.hours[0]?.label, 40],
        ["contact.hours.value", profile.contact.hours[0]?.value, 80],
      ];
      for (const [field, value, max] of lengths) {
        // Le texte gardé tient dans la borne ; il en approche (coupe sur un mot) et se termine par « … »
        expect([field, value?.endsWith("…"), (value ?? "").length - 1 <= max, (value ?? "").length > max * 0.6]).toEqual([field, true, true, true]);
      }
    }
  });

  // Aujourd'hui : la coupe se fait sur une unité UTF-16, sans regarder si elle sépare les deux moitiés d'un
  // caractère hors du plan de base (emoji). Le texte finit alors par un demi-codet isolé (U+D83D suivi de « … »), que
  // PostgreSQL refuse dans une colonne JSONB (22P02, vérifié sur PostgreSQL 16) : l'enregistrement du profil
  // échoue (`storeRead` : la lecture du site se solde par un échec « internal ») ou celui des corrections
  // (`saveExternalOverrides` : « Cette action n'a pas abouti »), sans que le praticien puisse savoir pourquoi.
  // Correctif proposé : reculer d'une unité quand la coupe tombe après un demi-codet haut, comme `safeSlice`
  // (`providers/website/text.ts`) et `clipChars` (`ai/external-site-text.ts`).
  it.fails("constat — un texte coupé au milieu d'un emoji se termine par un demi-codet isolé (le profil ne s'enregistre plus)", () => {
    const headline = headlineOf(`${"a".repeat(L.headline - 1)}😀 suite du texte`);
    expect(loneSurrogates(headline)).toBe(0);
  });

  // Aujourd'hui : un demi-codet isolé déjà présent dans la valeur reçue (réponse JSON d'un modèle : l'échappement U+D83D
  // sans sa seconde moitié) traverse le nettoyage. Même conséquence que ci-dessus.
  // Correctif proposé : retirer les demi-codets isolés avec les autres caractères sans dessin.
  it.fails("constat — un demi-codet isolé présent dans le texte reçu est gardé", () => {
    expect(loneSurrogates(headlineOf(`Sophrologue ${char(0xd83d)} à Albi`))).toBe(0);
  });

  // Aujourd'hui : tout ce qui se trouve entre un « < » et le « > » suivant (200 caractères au plus) est tenu pour
  // une balise et supprimé : « Enfant (<12 ans) : 40 €, adulte (>12 ans) : 60 € » devient « Enfant ( 12 ans) : 60 € »
  // — un tarif faux, sans que rien ne le signale. Cela vaut pour ce que le praticien saisit dans le studio
  // (l'action d'enregistrement promet qu'une saisie acceptée est gardée telle quelle) et pour ce qui est lu.
  // Correctif proposé : ne retirer que ce qui a la forme d'une balise (« < » suivi d'une lettre, de « / » ou de
  // « ! ») et remplacer les chevrons restants par « ‹ › », comme le fait `sanitizeSiteText` côté `@theralys/ai`.
  it.fails("constat — un texte pris entre « < » et « > » est supprimé comme une balise : le tarif des moins de 12 ans disparaît", () => {
    const [card] = clean({ practical: [{ title: "Tarifs", text: "Enfant (<12 ans) : 40 €, adulte (>12 ans) : 60 €" }] }).practical;
    expect(card?.text).toContain("40 €");
  });

  // Aujourd'hui : les « étiquettes » Unicode (U+E0000–E007F, du texte que personne ne voit mais qu'un modèle de
  // langage lit), la césure conditionnelle, les contrôles C1, la marque de sens d'écriture arabe et d'autres
  // caractères sans dessin traversent le nettoyage, alors que le lecteur (`providers/website/text.ts`) et le
  // prompt d'extraction (`sanitizeSiteText`) les retirent. Le profil — corrections du praticien comprises, qui ne
  // passent par aucun autre filtre — alimente ensuite le brief des générateurs (`externalBriefPages`).
  // Correctif proposé : la même liste que `stripInvisible` (ou `\p{Cf}\p{Cc}` avec le drapeau `u`).
  it.fails("constat — caractères invisibles gardés : étiquettes Unicode, césure conditionnelle, contrôles C1, marque arabe…", () => {
    for (const code of [0xe0001, 0xe0041, 0xe007f, 0x00ad, 0x0085, 0x009b, 0x061c, 0x180e, 0xfff9]) {
      expect([hex(code), headlineOf(`Sophro${char(code)}logue`).includes(char(code))]).toEqual([hex(code), false]);
    }
  });
});

describe("cleanExternalProfile — listes", () => {
  const numbered = (count: number, prefix: string): string[] => Array.from({ length: count }, (_, index) => `${prefix} ${index + 1}`);

  it("chaque liste garde ses premières entrées, jusqu'à son plafond", () => {
    const profile = clean({
      intro: numbered(50, "Présentation"),
      highlights: numbered(50, "Point fort").map((title) => ({ title })),
      specialties: numbered(50, "Spécialité").map((title) => ({ title, headings: numbered(50, "Intertitre"), faq: numbered(50, "Question").map((question) => ({ question, answer: "Réponse." })) })),
      about: { paragraphs: numbered(50, "Paragraphe"), credentials: numbered(50, "Diplôme") },
      practical: numbered(50, "Info").map((title) => ({ title, text: "Détail" })),
      process: numbered(50, "Étape").map((title) => ({ title, description: "Description" })),
      faq: numbered(50, "Question").map((question) => ({ question, answer: "Réponse." })),
      contact: { hours: numbered(50, "Jour").map((label) => ({ label, value: "9h – 18h" })) },
    });
    expect(profile.intro).toEqual(numbered(L.introParagraphs, "Présentation"));
    expect(profile.highlights.map((item) => item.title)).toEqual(numbered(L.highlights, "Point fort"));
    expect(profile.specialties.map((item) => item.title)).toEqual(numbered(L.specialties, "Spécialité"));
    expect(profile.specialties[0]?.headings).toEqual(numbered(L.specialtyHeadings, "Intertitre"));
    expect(profile.specialties[0]?.faq.map((item) => item.question)).toEqual(numbered(L.specialtyFaq, "Question"));
    expect(profile.about.paragraphs).toEqual(numbered(L.aboutParagraphs, "Paragraphe"));
    expect(profile.about.credentials).toEqual(numbered(L.credentials, "Diplôme"));
    expect(profile.practical.map((item) => item.title)).toEqual(numbered(L.practical, "Info"));
    expect(profile.process.map((item) => item.title)).toEqual(numbered(L.process, "Étape"));
    expect(profile.faq.map((item) => item.question)).toEqual(numbered(L.faq, "Question"));
    expect(profile.contact.hours.map((item) => item.label)).toEqual(numbered(L.hours, "Jour"));
    expectContract(profile);
  });

  it("listes démesurées (100 000 entrées, vides ou identiques) : bornées sans erreur", () => {
    const profile = clean({
      intro: Array.from({ length: 100_000 }, () => "Même présentation"),
      specialties: Array.from({ length: 100_000 }, () => ({ title: "Même spécialité" })),
      faq: Array.from({ length: 100_000 }, () => ({ question: "Question sans réponse ?" })),
      about: { credentials: Array.from({ length: 100_000 }, () => "") },
    });
    expect(profile.intro).toEqual(["Même présentation"]);
    expect(profile.specialties).toHaveLength(L.specialties);
    expect(profile.faq).toEqual([]);
    expect(profile.about.credentials).toEqual([]);
  });

  it("listes de textes : entrées vides passées, doublons retirés sans égard à la casse ni aux espaces, avant le plafond", () => {
    expect(clean({ intro: ["", "  ", "<br>", "Présentation", "PRÉSENTATION", "  présentation  ", "Suite", "Troisième"] }).intro).toEqual(["Présentation", "Suite"]);
    expect(clean({ about: { paragraphs: ["A", "a", "B", "b", "C", "D"], credentials: ["Diplôme", "diplôme", "DIPLÔME"] } }).about).toEqual({ paragraphs: ["A", "B", "C"], credentials: ["Diplôme"] });
    expect(clean({ specialties: [{ title: "Sommeil", headings: ["Pour qui ?", "pour qui ?", "", "Comment ?"] }] }).specialties[0]?.headings).toEqual(["Pour qui ?", "Comment ?"]);
  });

  it("listes à deux champs : une entrée sans premier champ, ou sans second quand il est exigé, est passée", () => {
    const profile = clean({
      highlights: [{ title: "Avec texte", text: "Texte" }, { title: "Sans texte" }, { title: "Texte vide", text: "  " }, { text: "Sans titre" }],
      practical: [{ title: "Tarif", text: "60 €" }, { title: "Sans texte" }, { text: "Sans titre" }, { title: "<b></b>", text: "Titre vide" }],
      process: [{ title: "Échange", description: "Nous faisons le point." }, { title: "Sans description", description: "" }],
      faq: [{ question: "Où ?", answer: "À Albi." }, { question: "Sans réponse ?" }, { answer: "Sans question." }],
      contact: { hours: [{ label: "Lundi", value: "9h – 18h" }, { label: "Mardi" }, { value: "9h – 18h" }] },
    });
    // Le texte d'un point fort est facultatif : la clé `text` est alors absente, jamais vide
    expect(profile.highlights).toStrictEqual([{ title: "Avec texte", text: "Texte" }, { title: "Sans texte" }, { title: "Texte vide" }]);
    expect(profile.practical).toStrictEqual([{ title: "Tarif", text: "60 €" }]);
    expect(profile.process).toStrictEqual([{ title: "Échange", description: "Nous faisons le point." }]);
    expect(profile.faq).toStrictEqual([{ question: "Où ?", answer: "À Albi." }]);
    expect(profile.contact.hours).toStrictEqual([{ label: "Lundi", value: "9h – 18h" }]);
  });

  it("les clés inconnues d'une entrée ne sont pas recopiées", () => {
    const profile = clean({
      highlights: [{ title: "Titre", text: "Texte", icon: "medaille", onclick: "alert(1)" }],
      faq: [{ question: "Où ?", answer: "À Albi.", html: "<b>x</b>" }],
      specialties: [{ title: "Sommeil", imageUrl: "https://autre.fr/photo.jpg", id: 12 }],
      contact: { hours: [], fax: "05 63 00 00 01" },
      inconnue: "valeur",
    });
    expect(profile.highlights).toStrictEqual([{ title: "Titre", text: "Texte" }]);
    expect(profile.faq).toStrictEqual([{ question: "Où ?", answer: "À Albi." }]);
    expect(profile.specialties).toStrictEqual([{ slug: "sommeil", title: "Sommeil", excerpt: "", headings: [], faq: [] }]);
    expect(profile.contact).toStrictEqual({ hours: [] });
    expect(Object.keys(profile)).toEqual(PROFILE_KEYS);
  });

  // Aujourd'hui : seules les listes de textes sont dédoublonnées ; une question, un horaire ou un point fort
  // répétés (réponse d'un modèle qui se répète, ligne saisie deux fois) restent en double dans le profil, puis
  // dans le brief des générateurs — alors que le contrat annonce des « listes bornées et dédoublonnées ».
  // Correctif proposé : dédoublonner `cleanPairs` sur son premier champ, comme `cleanTexts`.
  it.fails("constat — les listes à deux champs (questions, horaires, points forts, infos pratiques) ne sont pas dédoublonnées", () => {
    const question = { question: "Est-ce remboursé ?", answer: "Certaines mutuelles remboursent." };
    expect(clean({ faq: [question, { ...question }, { ...question, question: "est-ce remboursé ?" }] }).faq).toEqual([question]);
  });
});

describe("cleanExternalProfile — spécialités", () => {
  const specialtiesOf = (list: unknown[], siteUrl: string = SITE) => clean({ specialties: list }, siteUrl).specialties;
  const slugsOf = (list: unknown[]): string[] => specialtiesOf(list).map((specialty) => specialty.slug);

  it("le titre est exigé ; extrait, résumé, intertitres et questions sont nettoyés, le résumé vide est omis", () => {
    expect(specialtiesOf([{ excerpt: "Sans titre" }, { title: "  " }, { title: "<br>" }, {}])).toEqual([]);
    expect(specialtiesOf([{ title: " Gestion  du <b>stress</b> ", excerpt: " Relâcher\nle corps. ", summary: "  ", headings: [" Pour qui ? "], faq: [{ question: " Où ? ", answer: " À Albi. " }] }])).toStrictEqual([
      { slug: "gestion-du-stress", title: "Gestion du stress", excerpt: "Relâcher le corps.", headings: ["Pour qui ?"], faq: [{ question: "Où ?", answer: "À Albi." }] },
    ]);
  });

  it("identifiant dérivé du titre : minuscules, sans accent, mots séparés par un tiret, 60 caractères au plus", () => {
    const CASES: [string, string][] = [
      ["Gestion du stress", "gestion-du-stress"],
      ["Préparation à l'accouchement", "preparation-a-l-accouchement"],
      ["  Sommeil & récupération !  ", "sommeil-recuperation"],
      ["EMDR", "emdr"],
      ["Accompagnement des troubles du sommeil chez l'enfant et l'adolescent", "accompagnement-des-troubles-du-sommeil-chez-l-enfant-et-l-ad"],
      // Coupe nette au soixantième caractère, sans tiret en fin d'identifiant
      [`${"mot ".repeat(14)}motif final`, `${"mot-".repeat(14)}moti`],
      [`${"mot ".repeat(15)}suite`, `${"mot-".repeat(14)}mot`],
    ];
    for (const [title, slug] of CASES) expect([title, slugsOf([{ title }])]).toEqual([title, [slug]]);
    for (const slug of slugsOf(CASES.map(([title]) => ({ title })))) expect(slug.length).toBeLessThanOrEqual(60);
  });

  it("titre sans lettre ni chiffre latin (emojis, signes, autre alphabet) : « specialite », numéroté au besoin", () => {
    expect(slugsOf([{ title: "🌿🌿" }, { title: "???" }, { title: "鍼灸" }, { title: "Spécialité" }])).toEqual(["specialite", "specialite-2", "specialite-3", "specialite-4"]);
  });

  it("titres en double ou qui se rejoignent une fois simplifiés : chacun garde un identifiant unique, numéroté dans l'ordre", () => {
    expect(slugsOf([{ title: "Gestion du stress" }, { title: "Gestion du stress" }, { title: "gestion du STRESS" }, { title: "Gestion du stress !" }, { title: "Gestion-du-stress" }])).toEqual([
      "gestion-du-stress",
      "gestion-du-stress-2",
      "gestion-du-stress-3",
      "gestion-du-stress-4",
      "gestion-du-stress-5",
    ]);
    // Un titre qui porte déjà le suffixe d'un autre ne crée pas de doublon
    expect(slugsOf([{ title: "Stress" }, { title: "Stress 2" }, { title: "Stress" }])).toEqual(["stress", "stress-2", "stress-3"]);
    // Titres identiques sur leurs 60 premiers caractères
    const long = "accompagnement des troubles du sommeil chez l'enfant et l'ad";
    expect(slugsOf([{ title: `${long}o` }, { title: `${long}ulte` }])).toEqual(["accompagnement-des-troubles-du-sommeil-chez-l-enfant-et-l-ad", "accompagnement-des-troubles-du-sommeil-chez-l-enfant-et-l-ad-2"]);
  });

  it("identifiant fourni : repris une fois simplifié (il reste stable quand le titre change), vide ou d'un autre type il est dérivé du titre", () => {
    expect(slugsOf([{ title: "Stress et anxiété", slug: "gestion-du-stress" }])).toEqual(["gestion-du-stress"]);
    expect(slugsOf([{ title: "Sommeil", slug: "../../etc/passwd" }, { title: "Stress", slug: "<script>alert(1)</script>" }, { title: "Deuil", slug: "Mon Identifiant É" }])).toEqual(["etc-passwd", "script-alert-1-script", "mon-identifiant-e"]);
    expect(slugsOf([{ title: "Sommeil", slug: "" }, { title: "Stress", slug: "   " }, { title: "Deuil", slug: 42 }, { title: "Examens", slug: null }, { title: "Enfants", slug: ["enfants"] }])).toEqual(["sommeil", "stress", "deuil", "examens", "enfants"]);
    // Collision entre un identifiant fourni et un identifiant dérivé
    expect(slugsOf([{ title: "A", slug: "a-2" }, { title: "A" }, { title: "A" }, { title: "B", slug: "a" }])).toEqual(["a-2", "a", "a-3", "a-4"]);
    expect(slugsOf([{ title: "Sommeil", slug: "s".repeat(200) }, { title: "Stress", slug: "s".repeat(200) }])).toEqual(["s".repeat(60), `${"s".repeat(60)}-2`]);
  });

  it("page de la spécialité : gardée si elle est sur le site du client (« www. », casse et protocole ignorés), en https et sans ancre", () => {
    const KEPT: [string, string][] = [
      [`${SITE}/sophrologie`, `${SITE}/sophrologie`],
      ["https://mon-cabinet.fr/sophrologie/", "https://mon-cabinet.fr/sophrologie/"],
      ["http://www.mon-cabinet.fr/sophrologie", `${SITE}/sophrologie`],
      ["HTTPS://WWW.MON-CABINET.FR/Sophrologie", `${SITE}/Sophrologie`],
      [`  ${SITE}/sophrologie#tarifs  `, `${SITE}/sophrologie`],
      [`${SITE}/?page_id=12&lang=fr`, `${SITE}/?page_id=12&lang=fr`],
      [`${SITE}/gestion du stress/é`, `${SITE}/gestion%20du%20stress/%C3%A9`],
      [`${SITE}/"><script>alert(1)</script>`, `${SITE}/%22%3E%3Cscript%3Ealert(1)%3C/script%3E`],
      [SITE, `${SITE}/`],
    ];
    for (const [url, kept] of KEPT) expect([url, specialtiesOf([{ title: "Sophrologie", url }])[0]?.url]).toEqual([url, kept]);
    // Le site peut avoir été déclaré sans « www. » alors que ses pages en portent un
    expect(specialtiesOf([{ title: "Sophrologie", url: `${SITE}/sophrologie` }], "https://mon-cabinet.fr")[0]?.url).toBe(`${SITE}/sophrologie`);
  });

  it("page écartée (la spécialité reste) : autre site, sous-domaine, hôte ressemblant, adresse relative, protocole dangereux, identifiants, adresse démesurée", () => {
    const DROPPED: unknown[] = [
      "https://autre-cabinet.fr/sophrologie",
      "https://blog.mon-cabinet.fr/sophrologie",
      "https://www.mon-cabinet.fr.autre.fr/sophrologie",
      "https://autre.fr/www.mon-cabinet.fr/sophrologie",
      "https://www.mon-cabinet.fr@autre.fr/sophrologie",
      "https://claire:secret@www.mon-cabinet.fr/sophrologie",
      "https://www.doctolib.fr/sophrologue/albi/claire-dupont",
      "https://www.facebook.com/cabinetclaire",
      "/sophrologie",
      "sophrologie",
      "www.mon-cabinet.fr/sophrologie",
      "//www.mon-cabinet.fr/sophrologie",
      "javascript:alert(1)",
      "JAVASCRIPT:alert(1)",
      "javascript://www.mon-cabinet.fr/%0aalert(1)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox(1)",
      "file:///etc/passwd",
      "ftp://www.mon-cabinet.fr/sophrologie",
      "mailto:contact@mon-cabinet.fr",
      "tel:0612345678",
      `${SITE}/${"a".repeat(480)}`,
      "",
      " ",
      null,
      42,
      {},
      [`${SITE}/sophrologie`],
    ];
    for (const url of DROPPED) expect([url, specialtiesOf([{ title: "Sophrologie", url }])]).toStrictEqual([url, [{ slug: "sophrologie", title: "Sophrologie", excerpt: "", headings: [], faq: [] }]]);
  });

  it("sans adresse de site lisible, aucune page de spécialité n'est gardée", () => {
    for (const siteUrl of ["", "www.mon-cabinet.fr", "pas une adresse", "mailto:contact@mon-cabinet.fr"]) expect([siteUrl, specialtiesOf([{ title: "Sophrologie", url: `${SITE}/sophrologie` }], siteUrl)[0]?.url]).toEqual([siteUrl, undefined]);
  });

  // Aujourd'hui : seule la comparaison des hôtes décide. Pour un site hébergé sous un chemin sur un hôte partagé
  // (`sites.google.com/view/…`, `….wixsite.com/…`), la page d'un autre site du même hôte est gardée comme « page
  // du site du client » : le formulaire « Spécialités » du studio l'accepte (au lieu de « Indiquez l'adresse
  // d'une page de votre site »), elle devient le lien-source de la spécialité dans le brief
  // (`externalBriefPages`), alors qu'`externalLandingPath` la tient, lui, pour étrangère au site.
  // Correctif proposé : exiger en plus `externalLandingPath(siteUrl, pageUrl) !== null`.
  it.fails("constat — site sous un chemin : la page d'un autre site du même hôte est gardée comme page de spécialité", () => {
    const [specialty] = specialtiesOf([{ title: "Sommeil", url: "https://sites.google.com/view/un-autre-cabinet/sommeil" }], SHARED_SITE);
    expect(specialty?.url).toBeUndefined();
  });
});

describe("cleanExternalProfile — contact, rendez-vous, réseaux", () => {
  const emailOf = (email: unknown): string | undefined => clean({ contact: { email } }).contact.email;

  it("adresse et précision nettoyées sur une ligne ; les champs absents ou vides sont omis, jamais vides", () => {
    expect(clean({ contact: { address: "12 rue des Lilas\n81000  Albi", note: "Parking <b>gratuit</b>", phone: " 05 63 00 00 00 ", email: " Contact@Mon-Cabinet.FR " } }).contact).toStrictEqual({
      address: "12 rue des Lilas 81000 Albi",
      phone: "05 63 00 00 00",
      email: "contact@mon-cabinet.fr",
      hours: [],
      note: "Parking gratuit",
    });
    expect(clean({ contact: { address: "  ", note: "", phone: "", email: "" } }).contact).toStrictEqual({ hours: [] });
    expect(clean({ contact: { phone: "pas un numéro", email: "pas une adresse" } }).contact).toStrictEqual({ hours: [] });
  });

  it("e-mail : gardé en minuscules sous sa forme simple (nom@domaine.extension)", () => {
    const KEPT: [string, string][] = [
      ["contact@mon-cabinet.fr", "contact@mon-cabinet.fr"],
      [" Contact@Mon-Cabinet.FR\n", "contact@mon-cabinet.fr"],
      ["claire.dupont+rdv@cabinet-claire.co.uk", "claire.dupont+rdv@cabinet-claire.co.uk"],
      ["contact_albi%test@mon-cabinet.fr", "contact_albi%test@mon-cabinet.fr"],
      ["contact@xn--caf-sant-d1af.fr", "contact@xn--caf-sant-d1af.fr"],
      // 120 caractères tout juste
      [`${"a".repeat(109)}@cabinet.fr`, `${"a".repeat(109)}@cabinet.fr`],
    ];
    for (const [input, email] of KEPT) expect([input, emailOf(input)]).toEqual([input, email]);
  });

  it("e-mail refusé : lien « mailto: », nom affiché, plusieurs adresses, paramètres, espace, domaine sans extension, accents, plus de 120 caractères, autre type", () => {
    const REFUSED: unknown[] = [
      "",
      "contact",
      "contact@",
      "@mon-cabinet.fr",
      "contact@mon-cabinet",
      "contact@localhost",
      "contact@mon-cabinet..fr",
      "contact@[127.0.0.1]",
      "mailto:contact@mon-cabinet.fr",
      "Claire Dupont <contact@mon-cabinet.fr>",
      "<contact@mon-cabinet.fr>",
      "contact@mon-cabinet.fr, autre@mon-cabinet.fr",
      "contact@mon-cabinet.fr?subject=Rendez-vous",
      "contact@mon-cabinet.fr\nBcc: autre@exemple.fr",
      "contact @mon-cabinet.fr",
      "contact [at] mon-cabinet.fr",
      "hélène@mon-cabinet.fr",
      "contact@café-santé.fr",
      "o'brien@mon-cabinet.fr",
      `${"a".repeat(110)}@cabinet.fr`,
      `${"a".repeat(1_000_000)}@cabinet.fr`,
      `a@${"b.".repeat(500_000)}fr`,
      42,
      null,
      ["contact@mon-cabinet.fr"],
      { email: "contact@mon-cabinet.fr" },
    ];
    // Les valeurs démesurées sont abrégées dans le message d'un échec
    const label = (input: unknown): unknown => (typeof input === "string" && input.length > 200 ? `${input.slice(0, 20)}…` : input);
    for (const input of REFUSED) expect([label(input), emailOf(input)]).toEqual([label(input), undefined]);
  });

  it("téléphone : les règles de `cleanPhone`", () => {
    for (const phone of ["06 12 34 56 78", " +33 (0)6 12 34 56 78 ", "12345", "pas un numéro", 612345678, null]) expect([phone, clean({ contact: { phone } }).contact.phone]).toEqual([phone, cleanPhone(phone)]);
  });

  it("lien de rendez-vous : les règles de `cleanBookingUrl` ; la clé est absente quand il n'y en a pas", () => {
    expect(clean({ bookingUrl: " http://www.doctolib.fr/claire#rdv " }).bookingUrl).toBe("https://www.doctolib.fr/claire");
    expect(clean({ bookingUrl: "tel:06 12 34 56 78" }).bookingUrl).toBe("tel:0612345678");
    for (const bookingUrl of ["", "javascript:alert(1)", "06 12 34 56 78", "doctolib.fr/claire", null, 42]) expect(Object.hasOwn(clean({ bookingUrl }), "bookingUrl")).toBe(false);
  });

  it("réseaux sociaux : les règles de `cleanSocialLinks`", () => {
    const social = { instagram: "http://instagram.com/cabinet.claire#bio", facebook: "https://www.facebook.com/sharer/sharer.php?u=x", linkedin: "https://autre.fr/in/claire", twitter: "https://twitter.com/claire" };
    expect(clean({ social }).social).toStrictEqual({ instagram: "https://instagram.com/cabinet.claire" });
    expect(clean({ social }).social).toStrictEqual(cleanSocialLinks(social));
  });
});

// ─── Corrections du praticien ────────────────────────────────────────────────

describe("cleanExternalOverrides", () => {
  const overridesOf = (raw: unknown): ExternalProfileOverrides => cleanExternalOverrides(raw, SITE);

  it("seules les rubriques fournies sont gardées, nettoyées comme le profil", () => {
    expect(overridesOf({})).toStrictEqual({});
    expect(overridesOf({ headline: "  Nouvelle <b>accroche</b> " })).toStrictEqual({ headline: "Nouvelle accroche" });
    expect(overridesOf({ intro: ["A", "a", "B", "C"], faq: [{ question: "Où ?", answer: "À Albi." }, { question: "Sans réponse ?" }] })).toStrictEqual({ intro: ["A", "B"], faq: [{ question: "Où ?", answer: "À Albi." }] });
    expect(overridesOf({ about: { paragraphs: ["Nouveau paragraphe"] } })).toStrictEqual({ about: { paragraphs: ["Nouveau paragraphe"], credentials: [] } });
    expect(overridesOf({ specialties: [{ title: "Sommeil", url: `${SITE}/sommeil` }, { title: "Sommeil", url: "https://autre.fr/sommeil" }] })).toStrictEqual({
      specialties: [
        { slug: "sommeil", title: "Sommeil", excerpt: "", url: `${SITE}/sommeil`, headings: [], faq: [] },
        { slug: "sommeil-2", title: "Sommeil", excerpt: "", headings: [], faq: [] },
      ],
    });
    expect(overridesOf({ social: { instagram: "https://www.instagram.com/claire", twitter: "https://x.com/claire" } })).toStrictEqual({ social: { instagram: "https://www.instagram.com/claire" } });
    // Toutes les rubriques à la fois : le profil entier, plus rien d'autre
    expect(overridesOf(RAW_PROFILE)).toStrictEqual({ ...READ });
  });

  it("ce qui n'est pas une rubrique du profil n'entre jamais dans les corrections (adresse, état, clé de mesure, clés héritées)", () => {
    expect(overridesOf({ url: "https://autre.fr", status: "ready", measureKey: "abcdefghijklmnopqrstuvwx", active: true, profile: RAW_PROFILE, headline: "Accroche" })).toStrictEqual({ headline: "Accroche" });
    expect(overridesOf(Object.create({ headline: "héritée", contact: { phone: "06 12 34 56 78" } }))).toStrictEqual({});
    const hostile: unknown = JSON.parse('{"__proto__":{"headline":"injectée"},"constructor":{"prototype":{"headline":"injectée"}},"faq":[]}');
    expect(overridesOf(hostile)).toStrictEqual({ faq: [] });
    expect(({} as Record<string, unknown>).headline).toBeUndefined();
    for (const raw of [null, undefined, "texte", 42, true, [], [{ headline: "Accroche" }]]) expect(overridesOf(raw)).toStrictEqual({});
  });

  it("une rubrique vidée par le praticien est une correction : elle est gardée vide", () => {
    expect(overridesOf({ headline: "", intro: [], highlights: [], specialties: [], about: { paragraphs: [], credentials: [] }, practical: [], process: [], faq: [], social: {}, bookingUrl: "" })).toStrictEqual({
      headline: "",
      intro: [],
      highlights: [],
      specialties: [],
      about: { paragraphs: [], credentials: [] },
      practical: [],
      process: [],
      faq: [],
      social: {},
      bookingUrl: "",
    });
  });

  it("contact : champ par champ — seuls les champs fournis sont gardés, un champ vidé reste une correction", () => {
    expect(overridesOf({ contact: { phone: "06 12 34 56 78" } })).toStrictEqual({ contact: { phone: "06 12 34 56 78" } });
    expect(overridesOf({ contact: { phone: "", note: "  " } })).toStrictEqual({ contact: { phone: "", note: "" } });
    expect(overridesOf({ contact: { hours: [] } })).toStrictEqual({ contact: { hours: [] } });
    expect(overridesOf({ contact: { address: " 3 place du Vigan ", email: "Claire@Mon-Cabinet.fr", hours: [{ label: "Samedi", value: "9h – 12h" }, { label: "Dimanche" }], fax: "05 63 00 00 01" } })).toStrictEqual({
      contact: { address: "3 place du Vigan", email: "claire@mon-cabinet.fr", hours: [{ label: "Samedi", value: "9h – 12h" }] },
    });
  });

  it("une valeur fournie mais inexploitable vaut une valeur vidée (le formulaire du studio contrôle la saisie avant)", () => {
    expect(overridesOf({ headline: 42, intro: "texte", specialties: null, about: "x", bookingUrl: "javascript:alert(1)", social: [] })).toStrictEqual({ headline: "", intro: [], specialties: [], about: { paragraphs: [], credentials: [] }, bookingUrl: "", social: {} });
    expect(overridesOf({ contact: { phone: "pas un numéro", email: "pas une adresse", address: 12, hours: "9h-18h" } })).toStrictEqual({ contact: { address: "", phone: "", email: "", hours: [] } });
  });

  it("des corrections nettoyées restent les mêmes au nettoyage suivant", () => {
    for (const raw of [RAW_PROFILE, { headline: "", contact: { phone: "", hours: [] }, bookingUrl: "" }, { specialties: [{ title: "A" }, { title: "A" }, { title: "A", slug: "a-2" }] }, { bookingUrl: "tel:+33 6 12 34 56 78", social: { facebook: "http://fb.com/claire" } }]) {
      const overrides = overridesOf(raw);
      expect(overridesOf(overrides)).toStrictEqual(overrides);
    }
  });
});

describe("mergeExternalProfile", () => {
  it("sans correction : ce qui a été lu, tel quel ; sans rien de lu : un profil vide", () => {
    expect(mergeExternalProfile(READ, null)).toStrictEqual(READ);
    expect(mergeExternalProfile(READ, undefined)).toStrictEqual(READ);
    expect(mergeExternalProfile(READ, {})).toStrictEqual(READ);
    expect(mergeExternalProfile(null, null)).toStrictEqual(EMPTY_EXTERNAL_PROFILE);
    expect(mergeExternalProfile(undefined, {})).toStrictEqual(EMPTY_EXTERNAL_PROFILE);
  });

  it("chaque rubrique corrigée remplace en entier celle qui a été lue ; une rubrique absente des corrections reste celle du site", () => {
    const CORRECTIONS: ExternalProfileOverrides[] = [
      { headline: "Accroche corrigée" },
      { intro: ["Présentation corrigée"] },
      { highlights: [{ title: "Point fort corrigé" }] },
      { specialties: [{ slug: "deuil", title: "Deuil", excerpt: "Traverser une perte.", headings: [], faq: [] }] },
      { about: { paragraphs: ["À propos corrigé"], credentials: [] } },
      { practical: [{ title: "Tarif", text: "65 € la séance" }] },
      { process: [] },
      { faq: [{ question: "Où ?", answer: "À Albi." }] },
      { social: { facebook: "https://www.facebook.com/cabinetclaire" } },
      { bookingUrl: "tel:0563000000" },
    ];
    for (const overrides of CORRECTIONS) {
      const merged = mergeExternalProfile(READ, overrides);
      const [key] = Object.keys(overrides) as (keyof ExternalSiteProfile)[];
      expect(merged).toStrictEqual({ ...READ, ...overrides });
      for (const other of [...PROFILE_KEYS, "bookingUrl"].filter((name) => name !== key)) expect([key, other, merged[other as keyof ExternalSiteProfile]]).toStrictEqual([key, other, READ[other as keyof ExternalSiteProfile]]);
      expectContract(merged);
    }
  });

  it("contact : champ par champ — le champ corrigé remplace, les autres restent ceux du site", () => {
    expect(mergeExternalProfile(READ, { contact: { phone: "06 12 34 56 78" } }).contact).toStrictEqual({ ...READ.contact, phone: "06 12 34 56 78" });
    expect(mergeExternalProfile(READ, { contact: { hours: [{ label: "Samedi", value: "9h – 12h" }] } }).contact).toStrictEqual({ ...READ.contact, hours: [{ label: "Samedi", value: "9h – 12h" }] });
    // Un contact corrigé sans aucun champ ne change rien, qu'il vienne du formulaire ou du nettoyage
    expect(mergeExternalProfile(READ, { contact: {} }).contact).toStrictEqual(READ.contact);
    for (const contact of [{}, null, "06 12 34 56 78"]) expect(mergeExternalProfile(READ, cleanExternalOverrides({ contact }, SITE))).toStrictEqual(READ);
    // Sur un site dont rien n'a été lu
    expect(mergeExternalProfile(null, { contact: { email: "contact@mon-cabinet.fr" } }).contact).toStrictEqual({ email: "contact@mon-cabinet.fr", hours: [] });
  });

  it("un champ vidé par le praticien reste vide après la fusion : la valeur lue sur le site ne revient pas", () => {
    const emptied: ExternalProfileOverrides = { headline: "", intro: [], faq: [], social: {}, bookingUrl: "", contact: { address: "", phone: "", email: "", note: "", hours: [] } };
    const merged = mergeExternalProfile(READ, emptied);
    const { bookingUrl: _readBookingUrl, ...readWithoutBooking } = READ;
    expect(merged).toStrictEqual({ ...readWithoutBooking, headline: "", intro: [], faq: [], social: {}, contact: { hours: [] } });
    // Les champs vidés disparaissent : ni clé vide, ni clé `undefined`
    expect(Object.keys(merged.contact)).toEqual(["hours"]);
    expect(Object.hasOwn(merged, "bookingUrl")).toBe(false);
    expectContract(merged);
    // Un seul champ vidé : les autres restent
    expect(mergeExternalProfile(READ, { contact: { note: "" } }).contact).toStrictEqual({ address: READ.contact.address, phone: READ.contact.phone, email: READ.contact.email, hours: READ.contact.hours });
  });

  it("les corrections survivent à une nouvelle lecture du site : ce qui est corrigé ou vidé le reste, le reste suit le site", () => {
    const overrides = cleanExternalOverrides({ headline: "Mon accroche", contact: { phone: "", note: "Sonnez à l'interphone" }, bookingUrl: "", faq: [] }, SITE);
    const reread = clean({ ...RAW_PROFILE, headline: "Accroche relue", intro: ["Présentation relue"], faq: [{ question: "Nouvelle question ?", answer: "Nouvelle réponse." }], contact: { ...RAW_PROFILE.contact, phone: "05 63 99 99 99", address: "3 place du Vigan, 81000 Albi" }, bookingUrl: "https://calendly.com/claire" });
    const merged = mergeExternalProfile(reread, overrides);
    expect(merged.headline).toBe("Mon accroche");
    expect(merged.faq).toEqual([]);
    expect(merged.contact.phone).toBeUndefined();
    expect(merged.contact.note).toBe("Sonnez à l'interphone");
    expect(merged.bookingUrl).toBeUndefined();
    expect(merged.intro).toEqual(["Présentation relue"]);
    expect(merged.contact.address).toBe("3 place du Vigan, 81000 Albi");
    expect(merged.specialties).toStrictEqual(reread.specialties);
    expectContract(merged);
  });

  it("ni le profil lu ni les corrections ne sont modifiés", () => {
    const read = deepFreeze(structuredClone(READ));
    const overrides = deepFreeze<ExternalProfileOverrides>({ headline: "Accroche corrigée", contact: { phone: "", hours: [] }, bookingUrl: "" });
    const merged = mergeExternalProfile(read, overrides);
    expect(merged.headline).toBe("Accroche corrigée");
    expect(read).toStrictEqual(READ);
    expect(overrides).toStrictEqual({ headline: "Accroche corrigée", contact: { phone: "", hours: [] }, bookingUrl: "" });
  });

  it("des corrections passées par `cleanExternalOverrides` donnent toujours un profil conforme au contrat", () => {
    for (const raw of [RAW_PROFILE, { headline: 42, intro: "x", specialties: null, contact: { phone: "x", hours: 3 }, bookingUrl: [], social: "x" }, { contact: null }, { specialties: [{ title: "<b>Deuil</b>", url: "javascript:alert(1)" }] }]) {
      expectContract(mergeExternalProfile(READ, cleanExternalOverrides(raw, SITE)));
      expectContract(mergeExternalProfile(null, cleanExternalOverrides(raw, SITE)));
    }
  });

  // Aujourd'hui : une clé présente dans les corrections avec la valeur `undefined` — ce que le type
  // `ExternalProfileOverrides` autorise — écrase la rubrique lue : `headline` devient `undefined` (et
  // `isExternalProfileUsable` répond alors « oui » à un profil sans présentation, puisque `undefined !== ""`).
  // Correctif proposé : ignorer les clés à valeur `undefined` avant la fusion.
  it.fails("constat — une rubrique présente mais `undefined` dans les corrections ne retombe pas sur ce qui a été lu", () => {
    expect(mergeExternalProfile(READ, { headline: undefined }).headline).toBe(READ.headline);
  });

  // Aujourd'hui : même cause pour le contact — `{ phone: undefined, hours: undefined }` retire le téléphone lu et
  // vide les horaires au lieu de les laisser tels qu'ils ont été lus.
  it.fails("constat — un champ de contact présent mais `undefined` efface la valeur lue", () => {
    expect(mergeExternalProfile(READ, { contact: { phone: undefined, hours: undefined } }).contact).toEqual(READ.contact);
  });
});

describe("isExternalProfileUsable, externalProfileGaps", () => {
  const SPECIALTY = { slug: "sommeil", title: "Sommeil", excerpt: "", headings: [], faq: [] };

  it("il faut une présentation (accroche, présentation ou « à propos ») et au moins une spécialité", () => {
    const CASES: [string, ExternalSiteProfile | null | undefined, boolean, string[]][] = [
      ["profil absent", null, false, ["une présentation de votre activité", "au moins une spécialité"]],
      ["profil non chargé", undefined, false, ["une présentation de votre activité", "au moins une spécialité"]],
      ["profil vide", EMPTY_EXTERNAL_PROFILE, false, ["une présentation de votre activité", "au moins une spécialité"]],
      ["profil complet", READ, true, []],
      ["accroche seule et une spécialité", { ...EMPTY_EXTERNAL_PROFILE, headline: "Accroche", specialties: [SPECIALTY] }, true, []],
      ["présentation seule et une spécialité", { ...EMPTY_EXTERNAL_PROFILE, intro: ["Présentation"], specialties: [SPECIALTY] }, true, []],
      ["« à propos » seul et une spécialité", { ...EMPTY_EXTERNAL_PROFILE, about: { paragraphs: ["À propos"], credentials: [] }, specialties: [SPECIALTY] }, true, []],
      ["sans spécialité", { ...READ, specialties: [] }, false, ["au moins une spécialité"]],
      ["sans présentation", { ...READ, headline: "", intro: [], about: { paragraphs: [], credentials: READ.about.credentials } }, false, ["une présentation de votre activité"]],
      ["des diplômes ne font pas une présentation", { ...EMPTY_EXTERNAL_PROFILE, about: { paragraphs: [], credentials: ["Diplôme"] }, specialties: [SPECIALTY] }, false, ["une présentation de votre activité"]],
    ];
    for (const [label, profile, usable, gaps] of CASES) {
      expect([label, isExternalProfileUsable(profile)]).toEqual([label, usable]);
      expect([label, externalProfileGaps(profile)]).toEqual([label, gaps]);
      // Les deux fonctions disent la même chose
      expect([label, externalProfileGaps(profile).length === 0]).toEqual([label, usable]);
    }
  });
});

// ─── Du profil aux outils ────────────────────────────────────────────────────

type BriefPage = SocialBriefInput["pages"][number];

/** Section d'un type donné dans une pseudo-page. */
function sectionOf<T extends Section["type"]>(page: BriefPage | undefined, type: T): Extract<Section, { type: T }> | undefined {
  return page?.sections.find((section): section is Extract<Section, { type: T }> => section.type === type);
}

/** Entrée de `buildSocialBrief` pour un site client dont le site de référence est celui du praticien. */
function briefInput(pages: SocialBriefInput["pages"], url: string = SITE): SocialBriefInput {
  return {
    site: { id: "site-1", name: "Claire Dupont, sophrologue à Albi", type: "client", theme: DEFAULT_THEME, bookingUrl: null, url, hostedUrl: HOSTED },
    prospect: null,
    pages,
    articles: [],
    reviews: [],
    voice: null,
    practiceName: "la sophrologie",
    now: new Date("2026-11-12T10:00:00Z"),
  };
}

/** Photos déjà admises par le studio : banque d'images (ambiance), photo téléversée par le praticien. */
const PEXELS = "https://images.pexels.com/photos/3759657/pexels-photo-3759657.jpeg?w=1200&h=800";
const BLOB = "https://abc123.public.blob.vercel-storage.com/portrait-claire.jpg";

describe("externalSpecialties, externalPageId", () => {
  it("les spécialités du profil, identifiant et titre, dans l'ordre", () => {
    expect(externalSpecialties(READ)).toStrictEqual([
      { slug: "gestion-du-stress", title: "Gestion du stress" },
      { slug: "sommeil", title: "Sommeil" },
      { slug: "preparation-aux-examens", title: "Préparation aux examens" },
    ]);
    expect(externalSpecialties(EMPTY_EXTERNAL_PROFILE)).toEqual([]);
    expect(externalPageId("gestion-du-stress")).toBe("ext-gestion-du-stress");
  });
});

describe("externalBriefPages", () => {
  it("l'accueil d'abord, puis une page par spécialité, dans l'ordre du profil", () => {
    const pages = externalBriefPages(READ, { siteUrl: SITE });
    expect(pages.map((page) => [page.id, page.type, page.slug, page.title])).toEqual([
      ["ext-accueil", "home", "", READ.headline],
      ["ext-gestion-du-stress", "motif", "gestion-du-stress", "Gestion du stress"],
      ["ext-sommeil", "motif", "sommeil", "Sommeil"],
      ["ext-preparation-aux-examens", "motif", "preparation-aux-examens", "Préparation aux examens"],
    ]);
    expect(pages.slice(1).map((page) => page.id)).toEqual(READ.specialties.map((specialty) => externalPageId(specialty.slug)));
    expect(pages[0]?.metaDescription).toBe(READ.intro[0]);
    expect(pages[0]?.href).toBeUndefined();
  });

  it("accueil : les sections d'un site hébergé, dans leur ordre, remplies par le profil", () => {
    const [home] = externalBriefPages(READ, { siteUrl: SITE });
    expect(home?.sections).toStrictEqual([
      { type: "hero", title: READ.headline, paragraphs: READ.intro },
      { type: "highlights", items: READ.highlights },
      {
        type: "specialties",
        title: "Spécialités",
        items: [
          { slug: "gestion-du-stress", title: "Gestion du stress", excerpt: "Relâcher le corps pour apaiser le mental." },
          { slug: "sommeil", title: "Sommeil", excerpt: "Retrouver des nuits sereines." },
          // Sans extrait, le résumé de la page en tient lieu
          { slug: "preparation-aux-examens", title: "Préparation aux examens", excerpt: "Des exercices courts à refaire avant l'épreuve." },
        ],
      },
      {
        type: "about",
        title: "À propos",
        // Diplômes et formations : un dernier paragraphe de lignes « - », que le brief reconnaît
        paragraphs: [...READ.about.paragraphs, "- Certification RNCP de sophrologue (2015)\n- Formation en sophrologie périnatale"],
        infoCards: READ.practical,
      },
      { type: "process", title: "Déroulement d'une séance", steps: READ.process },
      { type: "faq", title: "Questions fréquentes", items: READ.faq },
      { type: "contact", title: "Contact", ...READ.contact },
    ]);
  });

  it("une rubrique vide ne donne aucune section ; un profil vide donne un accueil sans section et aucune autre page", () => {
    expect(externalBriefPages(EMPTY_EXTERNAL_PROFILE, { siteUrl: SITE })).toStrictEqual([{ id: "ext-accueil", type: "home", slug: "", title: "", metaDescription: null, sections: [] }]);
    const TYPES: [string, Partial<ExternalSiteProfile>, Section["type"][]][] = [
      ["accroche seule", { headline: "Accroche" }, ["hero"]],
      ["points forts", { highlights: [{ title: "Point fort" }] }, ["highlights"]],
      ["diplômes seuls", { about: { paragraphs: [], credentials: ["Diplôme"] } }, ["about"]],
      ["infos pratiques seules", { practical: [{ title: "Tarif", text: "60 €" }] }, ["about"]],
      ["déroulement", { process: [{ title: "Étape", description: "Description" }] }, ["process"]],
      ["questions", { faq: [{ question: "Où ?", answer: "À Albi." }] }, ["faq"]],
      ["téléphone seul", { contact: { phone: "05 63 00 00 00", hours: [] } }, ["contact"]],
      ["horaires seuls", { contact: { hours: [{ label: "Lundi", value: "9h" }] } }, ["contact"]],
      ["lien de rendez-vous et réseaux seuls", { bookingUrl: "https://www.doctolib.fr/claire", social: { instagram: "https://www.instagram.com/claire" } }, []],
    ];
    for (const [label, part, types] of TYPES) expect([label, externalBriefPages({ ...EMPTY_EXTERNAL_PROFILE, ...part })[0]?.sections.map((section) => section.type)]).toEqual([label, types]);
    // Section « à propos » réduite aux infos pratiques : ni paragraphe ni ligne de diplômes vide
    expect(sectionOf(externalBriefPages({ ...EMPTY_EXTERNAL_PROFILE, practical: [{ title: "Tarif", text: "60 €" }] })[0], "about")?.paragraphs).toEqual([]);
    // Contact : seules les coordonnées connues figurent dans la section
    expect(sectionOf(externalBriefPages({ ...EMPTY_EXTERNAL_PROFILE, contact: { phone: "05 63 00 00 00", hours: [] } })[0], "contact")).toStrictEqual({ type: "contact", title: "Contact", phone: "05 63 00 00 00" });
  });

  it("sans accroche, le premier paragraphe de présentation sert de titre et n'est pas répété", () => {
    const pages = externalBriefPages({ ...READ, headline: "" }, { siteUrl: SITE });
    expect(sectionOf(pages[0], "hero")).toStrictEqual({ type: "hero", title: READ.intro[0], paragraphs: READ.intro.slice(1) });
    expect(pages[0]?.title).toBe("");
    expect(sectionOf(externalBriefPages({ ...READ, headline: "", intro: [] })[0], "hero")).toBeUndefined();
  });

  it("photos : seules celles que l'appelant fournit entrent dans les sections (accueil et « à propos »)", () => {
    const [home] = externalBriefPages(READ, { siteUrl: SITE, images: { hero: PEXELS, about: BLOB } });
    expect(sectionOf(home, "hero")?.imageUrl).toBe(PEXELS);
    expect(sectionOf(home, "about")?.imageUrl).toBe(BLOB);
    const [bare] = externalBriefPages(READ, { siteUrl: SITE, images: { hero: null, about: "" } });
    expect(Object.hasOwn(sectionOf(bare, "hero") ?? {}, "imageUrl")).toBe(false);
    expect(Object.hasOwn(sectionOf(bare, "about") ?? {}, "imageUrl")).toBe(false);
    expect(textsOf(externalBriefPages(READ, { siteUrl: SITE })).filter((text) => /\.(jpe?g|png|webp)/.test(text))).toEqual([]);
  });

  it("page de spécialité : résumé (à défaut l'extrait) en description, intertitres en titres « ## », questions de la page", () => {
    const [, stress, sleep, exams] = externalBriefPages(READ, { siteUrl: SITE });
    expect(stress).toStrictEqual({
      id: "ext-gestion-du-stress",
      type: "motif",
      slug: "gestion-du-stress",
      title: "Gestion du stress",
      metaDescription: "Six à huit séances pour repérer vos signaux d'alerte et apprendre des exercices courts.",
      sections: [
        { type: "richText", body: "## Pour qui ?\n\n## Comment se déroule l'accompagnement ?" },
        { type: "faq", title: "Questions fréquentes", items: [{ question: "Combien de séances ?", answer: "Six à huit en moyenne." }] },
      ],
      href: `${SITE}/gestion-du-stress`,
    });
    expect(sleep).toStrictEqual({ id: "ext-sommeil", type: "motif", slug: "sommeil", title: "Sommeil", metaDescription: "Retrouver des nuits sereines.", sections: [], href: SITE });
    expect(exams?.metaDescription).toBe("Des exercices courts à refaire avant l'épreuve.");
    const [, bare] = externalBriefPages({ ...EMPTY_EXTERNAL_PROFILE, specialties: [{ slug: "deuil", title: "Deuil", excerpt: "", headings: [], faq: [] }] });
    expect(bare).toStrictEqual({ id: "ext-deuil", type: "motif", slug: "deuil", title: "Deuil", metaDescription: null, sections: [] });
  });

  it("lien de chaque spécialité : sa page si elle en a une, sinon l'adresse du site ; sans `siteUrl`, aucun lien n'est posé", () => {
    expect(externalBriefPages(READ, { siteUrl: SITE }).map((page) => page.href)).toEqual([undefined, `${SITE}/gestion-du-stress`, SITE, SITE]);
    expect(externalBriefPages(READ, { siteUrl: "https://mon-cabinet.fr" }).map((page) => page.href)).toEqual([undefined, `${SITE}/gestion-du-stress`, "https://mon-cabinet.fr", "https://mon-cabinet.fr"]);
    for (const pages of [externalBriefPages(READ), externalBriefPages(READ, {}), externalBriefPages(READ, { siteUrl: "" })]) {
      expect(pages.map((page) => [page.href, Object.hasOwn(page, "href")])).toEqual([[undefined, false], [`${SITE}/gestion-du-stress`, true], [undefined, false], [undefined, false]]);
    }
  });

  it("le profil n'est pas modifié", () => {
    const profile = deepFreeze(structuredClone(READ));
    expect(externalBriefPages(profile, { siteUrl: SITE, images: { hero: PEXELS } })).toHaveLength(4);
    expect(profile).toStrictEqual(READ);
  });
});

describe("externalBriefPages → buildSocialBrief", () => {
  it("le brief lit les pseudo-pages comme celles d'un site hébergé : accueil, spécialités, à propos, infos, déroulement, questions, contact", () => {
    const { brief } = buildSocialBrief(briefInput(externalBriefPages(READ, { siteUrl: SITE })));
    expect(brief.domain).toBe("www.mon-cabinet.fr");
    expect(brief.home.hero).toEqual({ title: READ.headline, paragraphs: READ.intro, stats: [] });
    expect(brief.home.highlights).toEqual([
      { id: "section:home:highlights:0", title: "Séances en visio", text: "Depuis chez vous, partout en France" },
      { id: "section:home:highlights:1", title: "Cabinet accessible" },
    ]);
    expect(brief.home.specialties).toEqual([
      { id: "section:home:specialties:gestion-du-stress", slug: "gestion-du-stress", title: "Gestion du stress", excerpt: "Relâcher le corps pour apaiser le mental.", pageId: "page:ext-gestion-du-stress" },
      { id: "section:home:specialties:sommeil", slug: "sommeil", title: "Sommeil", excerpt: "Retrouver des nuits sereines.", pageId: "page:ext-sommeil" },
      { id: "section:home:specialties:preparation-aux-examens", slug: "preparation-aux-examens", title: "Préparation aux examens", excerpt: "Des exercices courts à refaire avant l'épreuve.", pageId: "page:ext-preparation-aux-examens" },
    ]);
    // Les diplômes sont reconnus à part des paragraphes
    expect(brief.home.about).toEqual({ id: "section:home:about", title: "À propos", paragraphs: READ.about.paragraphs, credentials: READ.about.credentials });
    expect(brief.home.infoCards.map((card) => [card.title, card.text])).toEqual([["Durée", "1 heure"], ["Tarif", "60 € la séance"]]);
    expect(brief.home.process.map((step) => [step.title, step.description])).toEqual([["Un temps d'échange", "Nous faisons le point sur ce qui vous amène."]]);
    expect(brief.home.faq.map((item) => [item.question, item.answer])).toEqual([["Est-ce remboursé ?", "Certaines mutuelles remboursent une partie des séances."]]);
    expect(brief.home.contact).toEqual({ id: "section:home:contact", address: "12 rue des Lilas, 81000 Albi", note: "Parking gratuit devant le cabinet" });
    expect(brief.motifPages).toEqual([
      {
        id: "page:ext-gestion-du-stress",
        slug: "gestion-du-stress",
        title: "Gestion du stress",
        summary: "Six à huit séances pour repérer vos signaux d'alerte et apprendre des exercices courts.",
        headings: ["Pour qui ?", "Comment se déroule l'accompagnement ?"],
        faq: [{ id: "page:ext-gestion-du-stress:faq:0", question: "Combien de séances ?", answer: "Six à huit en moyenne." }],
      },
      { id: "page:ext-sommeil", slug: "sommeil", title: "Sommeil", summary: "Retrouver des nuits sereines.", headings: [], faq: [] },
      { id: "page:ext-preparation-aux-examens", slug: "preparation-aux-examens", title: "Préparation aux examens", summary: "Des exercices courts à refaire avant l'épreuve.", headings: [], faq: [] },
    ]);
    expect(brief.articles).toEqual([]);
    expect(brief.photos).toEqual([]);
  });

  it("liens des sources : la page de la spécialité quand elle existe, sinon l'accueil du site du client — jamais une page « /motifs/… »", () => {
    const { refsById } = buildSocialBrief(briefInput(externalBriefPages(READ, { siteUrl: SITE })));
    const hrefs = Object.fromEntries(Object.values(refsById).map((ref) => [ref.id, ref.href]));
    expect(hrefs["page:ext-gestion-du-stress"]).toBe(`${SITE}/gestion-du-stress`);
    expect(hrefs["page:ext-gestion-du-stress:faq:0"]).toBe(`${SITE}/gestion-du-stress`);
    expect(hrefs["page:ext-sommeil"]).toBe(SITE);
    expect(hrefs["page:ext-preparation-aux-examens"]).toBe(SITE);
    expect(hrefs["section:home:hero"]).toBe(SITE);
    expect(hrefs["section:home:specialties:sommeil"]).toBe(SITE);
    for (const ref of Object.values(refsById)) {
      expect([ref.id, ref.href?.includes("/motifs/")]).toEqual([ref.id, false]);
      expect([ref.id, ref.href !== undefined && isSameSiteHost(ref.href, SITE)]).toEqual([ref.id, true]);
    }
  });

  it("site sous un chemin : aucune source ne sort du site ni ne pointe vers « /motifs/… »", () => {
    const profile = clean({ ...RAW_PROFILE, specialties: [{ title: "Sommeil", url: `${SHARED_SITE}/sommeil` }, { title: "Stress" }] }, SHARED_SITE);
    const { brief, refsById } = buildSocialBrief(briefInput(externalBriefPages(profile, { siteUrl: SHARED_SITE }), SHARED_SITE));
    expect(brief.domain).toBe("sites.google.com/view/mon-cabinet");
    expect(refsById["page:ext-sommeil"]?.href).toBe(`${SHARED_SITE}/sommeil`);
    expect(refsById["page:ext-stress"]?.href).toBe(SHARED_SITE);
    for (const ref of Object.values(refsById)) expect([ref.id, ref.href?.startsWith(SHARED_SITE)]).toEqual([ref.id, true]);
  });

  it("sans `siteUrl`, le brief retombe sur le chemin des pages hébergées pour les spécialités sans page : l'option est donc à fournir", () => {
    const { refsById } = buildSocialBrief(briefInput(externalBriefPages(READ)));
    expect(refsById["page:ext-gestion-du-stress"]?.href).toBe(`${SITE}/gestion-du-stress`);
    expect(refsById["page:ext-sommeil"]?.href).toBe(`${SITE}/motifs/sommeil`);
  });

  it("photos fournies par l'appelant : au catalogue du brief, la photo téléversée seule pouvant représenter le praticien", () => {
    const { brief, photosById } = buildSocialBrief(briefInput(externalBriefPages(READ, { siteUrl: SITE, images: { hero: PEXELS, about: BLOB } })));
    expect(photosById).toEqual({ p1: PEXELS, p2: BLOB });
    expect(brief.photos.map((photo) => [photo.id, photo.kind, photo.portraitSafe])).toEqual([["p1", "hero", false], ["p2", "about", true]]);
  });

  it("profil au plus large que le contrat autorise : le brief tient sous son plafond et garde ses propres bornes", () => {
    const text = (prefix: string): string => `${prefix} ${"mot ".repeat(300)}`;
    const many = (count: number, prefix: string): string[] => Array.from({ length: count }, (_, index) => text(`${prefix} ${index + 1}`));
    const profile = clean({
      headline: text("Accroche"),
      intro: many(5, "Présentation"),
      highlights: many(9, "Point fort").map((title) => ({ title, text: text("Texte") })),
      specialties: many(12, "Spécialité").map((title, index) => ({ title, excerpt: text("Extrait"), url: `${SITE}/specialite-${index + 1}`, summary: text("Résumé"), headings: many(10, "Intertitre"), faq: many(6, "Question").map((question) => ({ question, answer: text("Réponse") })) })),
      about: { paragraphs: many(6, "Paragraphe"), credentials: many(10, "Diplôme") },
      practical: many(8, "Info").map((title) => ({ title, text: text("Détail") })),
      process: many(8, "Étape").map((title) => ({ title, description: text("Description") })),
      faq: many(12, "Question").map((question) => ({ question, answer: text("Réponse") })),
      contact: { address: text("Adresse"), note: text("Précision"), hours: many(12, "Jour").map((label) => ({ label, value: text("Horaire") })) },
    });
    expectContract(profile);
    expect(profile.specialties).toHaveLength(L.specialties);
    const { brief, refsById } = buildSocialBrief(briefInput(externalBriefPages(profile, { siteUrl: SITE })));
    expect(JSON.stringify(brief).length).toBeLessThanOrEqual(SOCIAL_BRIEF_MAX_CHARS);
    expect(brief.home.specialties).toHaveLength(6);
    expect(brief.motifPages).toHaveLength(6);
    expect(brief.motifPages.map((page) => page.slug)).toEqual(profile.specialties.slice(0, 6).map((specialty) => specialty.slug));
    for (const page of brief.motifPages) expect(refsById[page.id]?.href).toMatch(/^https:\/\/www\.mon-cabinet\.fr\/specialite-\d+$/);
    for (const ref of Object.values(refsById)) expect(ref.href?.includes("/motifs/")).toBe(false);
  });

  it("profil venu de valeurs hostiles puis nettoyé : le brief se construit, sans chevron ni caractère de contrôle", () => {
    const profile = clean({
      headline: `<script>alert(1)</script>Sophrologue${char(0)} à Albi`,
      intro: [`Présentation${char(0x202e)} <img src=x onerror=alert(1)>`],
      highlights: [{ title: "<b>Point fort</b>", text: `Texte${char(0x1b)}[31m` }],
      specialties: [{ title: "<i>Sommeil</i>", url: "javascript:alert(1)", headings: ["## <h2>Pour qui ?</h2>", "- puce"], faq: [{ question: "<u>Où ?</u>", answer: `À Albi.${char(7)}` }] }, { title: "__proto__" }, { title: "constructor" }],
      about: { paragraphs: ["<p>À propos</p>"], credentials: ["<li>Diplôme</li>"] },
      contact: { address: "<address>12 rue des Lilas</address>", note: "\n\n" },
    });
    expectContract(profile);
    const { brief, refsById } = buildSocialBrief(briefInput(externalBriefPages(profile, { siteUrl: SITE })));
    for (const text of textsOf(brief)) {
      expect(text).not.toMatch(/[<>]/);
      expect(hasControl(text.replace(/\n/g, ""))).toBe(false);
    }
    expect(brief.home.hero?.title).toBe("alert(1) Sophrologue à Albi");
    expect(brief.motifPages.map((page) => [page.id, page.title, refsById[page.id]?.href])).toEqual([
      ["page:ext-sommeil", "Sommeil", SITE],
      ["page:ext-proto", "__proto__", SITE],
      ["page:ext-constructor", "constructor", SITE],
    ]);
    expect(brief.home.about?.credentials).toEqual(["Diplôme"]);
  });
});

// ─── Pages d'atterrissage ────────────────────────────────────────────────────

describe("externalLandingPath", () => {
  it("chemin de la page relatif au site : « www. », protocole et casse de l'hôte ignorés, barre finale et ancre retirées, paramètres gardés", () => {
    const CASES: [siteUrl: string, pageUrl: string, path: string][] = [
      [SITE, `${SITE}/sophrologie`, "/sophrologie"],
      [SITE, "https://mon-cabinet.fr/sophrologie/", "/sophrologie"],
      ["https://mon-cabinet.fr", `${SITE}/sophrologie`, "/sophrologie"],
      [SITE, "http://WWW.MON-CABINET.FR./Sophrologie", "/Sophrologie"],
      [SITE, `${SITE}/seances/sophrologie/#tarifs`, "/seances/sophrologie"],
      [SITE, `${SITE}/?page_id=12`, "/?page_id=12"],
      [SITE, `${SITE}/sophrologie/?lang=fr&ref=menu#haut`, "/sophrologie?lang=fr&ref=menu"],
      [SITE, `${SITE}/a/../sophrologie`, "/sophrologie"],
      [SITE, `${SITE}/gestion du stress/é`, "/gestion%20du%20stress/%C3%A9"],
      // L'accueil
      [SITE, SITE, "/"],
      [`${SITE}/`, `${SITE}/`, "/"],
      [SITE, "https://mon-cabinet.fr/#contact", "/"],
    ];
    for (const [siteUrl, pageUrl, path] of CASES) expect([siteUrl, pageUrl, externalLandingPath(siteUrl, pageUrl)]).toEqual([siteUrl, pageUrl, path]);
  });

  it("site sous un chemin : le chemin est relatif à ce préfixe, et une page hors du préfixe est hors du site", () => {
    const INSIDE: [string, string][] = [
      [`${SHARED_SITE}/sophrologie`, "/sophrologie"],
      [`${SHARED_SITE}/seances/sophrologie/`, "/seances/sophrologie"],
      [SHARED_SITE, "/"],
      [`${SHARED_SITE}/`, "/"],
      [`${SHARED_SITE}?lang=fr`, "/?lang=fr"],
      ["https://www.sites.google.com/view/mon-cabinet/sophrologie", "/sophrologie"],
    ];
    for (const [pageUrl, path] of INSIDE) {
      expect([pageUrl, externalLandingPath(SHARED_SITE, pageUrl)]).toEqual([pageUrl, path]);
      expect([pageUrl, externalLandingPath(`${SHARED_SITE}/`, pageUrl)]).toEqual([pageUrl, path]);
    }
    const OUTSIDE = [
      "https://sites.google.com/view/un-autre-cabinet/sophrologie",
      // Le préfixe est un dossier entier, pas un début de nom
      "https://sites.google.com/view/mon-cabinet-2/sophrologie",
      "https://sites.google.com/view/mon-cabinet-albi",
      "https://sites.google.com/view",
      "https://sites.google.com/",
      "https://sites.google.com/view/mon-cabinet/../un-autre-cabinet/sophrologie",
      "https://sites.google.com/View/Mon-Cabinet/sophrologie",
    ];
    for (const pageUrl of OUTSIDE) expect([pageUrl, externalLandingPath(SHARED_SITE, pageUrl)]).toEqual([pageUrl, null]);
  });

  it("page d'un autre hôte, adresse relative ou illisible : null", () => {
    const CASES: [string, string][] = [
      [SITE, "https://blog.mon-cabinet.fr/sophrologie"],
      [SITE, "https://autre-cabinet.fr/sophrologie"],
      [SITE, "https://www.mon-cabinet.fr.autre.fr/sophrologie"],
      [SITE, "https://autre.fr/www.mon-cabinet.fr/sophrologie"],
      [SITE, "https://www.mon-cabinet.fr@autre.fr/sophrologie"],
      [SITE, "/sophrologie"],
      [SITE, "sophrologie"],
      [SITE, ""],
      [SITE, "javascript:alert(1)"],
      ["", `${SITE}/sophrologie`],
      ["www.mon-cabinet.fr", `${SITE}/sophrologie`],
      ["pas une adresse", "pas une adresse"],
    ];
    for (const [siteUrl, pageUrl] of CASES) expect([siteUrl, pageUrl, externalLandingPath(siteUrl, pageUrl)]).toEqual([siteUrl, pageUrl, null]);
  });

  it("adresse de référence + chemin redonne la page (à la barre finale et à l'ancre près)", () => {
    for (const [siteUrl, pageUrl] of [[SITE, `${SITE}/sophrologie`], [SITE, `${SITE}/seances/stress?lang=fr`], [SHARED_SITE, `${SHARED_SITE}/sophrologie`], [SITE, `${SITE}/${"a".repeat(180)}`]] as const) {
      expect(`${siteUrl}${externalLandingPath(siteUrl, pageUrl)}`).toBe(pageUrl);
    }
    expect(`${SITE}${externalLandingPath(SITE, SITE)}`).toBe(`${SITE}/`);
    expect(`${SHARED_SITE}${externalLandingPath(SHARED_SITE, SHARED_SITE)}`).toBe(`${SHARED_SITE}/`);
  });

  // Aujourd'hui : le chemin est coupé à 200 caractères (`.slice(0, 200)`), paramètres compris, parfois au milieu
  // d'un caractère encodé (« …/%C »). Les outils publicitaires composent leurs adresses d'atterrissage en
  // « adresse de référence + chemin » (`externalAdsSite`, pages d'atterrissage Google Ads et Meta Ads) : l'annonce
  // mène alors à une page qui n'existe pas.
  // Correctif proposé : rendre `null` au-delà de la borne (la page n'est pas proposée) plutôt qu'un chemin tronqué.
  it.fails("constat — un chemin de plus de 200 caractères est tronqué au lieu d'être écarté : la page d'atterrissage n'existe pas", () => {
    for (const page of [`${SITE}/${"a".repeat(250)}`, `${SITE}/${"a".repeat(196)}/é`, `${SITE}/sophrologie?utm_content=${"b".repeat(250)}`]) {
      const path = externalLandingPath(SITE, page);
      expect([page, path === null || `${SITE}${path}` === new URL(page).href]).toEqual([page, true]);
    }
  });
});

describe("externalLandingPages", () => {
  const profileWith = (specialties: { title: string; url?: string }[]): ExternalSiteProfile => ({
    ...EMPTY_EXTERNAL_PROFILE,
    specialties: specialties.map((specialty, index) => ({ slug: `specialite-${index + 1}`, excerpt: "", headings: [], faq: [], ...specialty })),
  });

  it("l'accueil, puis les pages de spécialité qui existent sur le site, dans l'ordre du profil", () => {
    expect(externalLandingPages(READ, SITE)).toStrictEqual([
      { path: "/", title: "Accueil", kind: "home" },
      { path: "/gestion-du-stress", title: "Gestion du stress", kind: "motif" },
    ]);
    expect(externalLandingPages(EMPTY_EXTERNAL_PROFILE, SITE)).toStrictEqual([{ path: "/", title: "Accueil", kind: "home" }]);
    expect(externalLandingPages(profileWith([{ title: "Sommeil" }, { title: "Stress" }]), SITE)).toHaveLength(1);
    // Adresse de référence + chemin : la page de la spécialité, celle que le brief donne pour source
    const [, stress] = externalBriefPages(READ, { siteUrl: SITE });
    expect(`${SITE}${externalLandingPages(READ, SITE)[1]?.path}`).toBe(stress?.href);
  });

  it("doublons : une même page (variante « www. », protocole, barre finale, ancre) n'apparaît qu'une fois, sous le titre de la première spécialité", () => {
    const profile = profileWith([
      { title: "Sophrologie", url: `${SITE}/sophrologie` },
      { title: "Sophrologie enfants", url: "https://mon-cabinet.fr/sophrologie/" },
      { title: "Sophrologie ados", url: "http://www.mon-cabinet.fr/sophrologie#ados" },
      { title: "Hypnose", url: `${SITE}/hypnose` },
      // Des paramètres ou une autre casse désignent une autre page
      { title: "Sophrologie en anglais", url: `${SITE}/sophrologie?lang=en` },
      { title: "Sophrologie (ancienne page)", url: `${SITE}/Sophrologie` },
    ]);
    expect(externalLandingPages(profile, SITE)).toStrictEqual([
      { path: "/", title: "Accueil", kind: "home" },
      { path: "/sophrologie", title: "Sophrologie", kind: "motif" },
      { path: "/hypnose", title: "Hypnose", kind: "motif" },
      { path: "/sophrologie?lang=en", title: "Sophrologie en anglais", kind: "motif" },
      { path: "/Sophrologie", title: "Sophrologie (ancienne page)", kind: "motif" },
    ]);
    const paths = externalLandingPages(profile, SITE).map((page) => page.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("une spécialité dont la page est l'accueil, hors du site ou illisible n'ajoute aucune page", () => {
    const profile = profileWith([
      { title: "Accueil bis", url: `${SITE}/` },
      { title: "Accueil ter", url: "https://mon-cabinet.fr#haut" },
      { title: "Autre site", url: "https://autre-cabinet.fr/sophrologie" },
      { title: "Sous-domaine", url: "https://blog.mon-cabinet.fr/sophrologie" },
      { title: "Illisible", url: "pas une adresse" },
      { title: "Relative", url: "/sophrologie" },
      { title: "Sommeil", url: `${SITE}/sommeil` },
    ]);
    expect(externalLandingPages(profile, SITE)).toStrictEqual([
      { path: "/", title: "Accueil", kind: "home" },
      { path: "/sommeil", title: "Sommeil", kind: "motif" },
    ]);
    // Sans adresse de site lisible : l'accueil seul
    expect(externalLandingPages(profile, "")).toStrictEqual([{ path: "/", title: "Accueil", kind: "home" }]);
  });

  it("site sous un chemin : seules les pages sous ce chemin, en chemins relatifs à lui", () => {
    const profile = profileWith([
      { title: "Sommeil", url: `${SHARED_SITE}/sommeil` },
      { title: "Page d'un autre site", url: "https://sites.google.com/view/un-autre-cabinet/sommeil" },
      { title: "Accueil du site", url: SHARED_SITE },
      { title: "Stress", url: `${SHARED_SITE}/seances/stress/` },
    ]);
    expect(externalLandingPages(profile, SHARED_SITE)).toStrictEqual([
      { path: "/", title: "Accueil", kind: "home" },
      { path: "/sommeil", title: "Sommeil", kind: "motif" },
      { path: "/seances/stress", title: "Stress", kind: "motif" },
    ]);
  });
});

// ─── Code de mesure ──────────────────────────────────────────────────────────

const KEY = "abcdefghijklmnopqrstuv42";
const SITES_BASE = "https://sites.harmony-web.fr";

describe("isExternalMeasureKey, externalMeasureTag", () => {
  it("clé : exactement 24 minuscules ou chiffres", () => {
    expect(KEY).toHaveLength(24);
    for (const key of [KEY, "a".repeat(24), "0".repeat(24), "abcdefghijklmnopqrstuvwx"]) expect([key, isExternalMeasureKey(key)]).toEqual([key, true]);
    const REFUSED: unknown[] = [
      "",
      KEY.slice(1),
      `${KEY}a`,
      KEY.toUpperCase(),
      `${KEY.slice(0, 23)}-`,
      `${KEY.slice(0, 23)}_`,
      `${KEY.slice(0, 23)}é`,
      `${KEY.slice(0, 23)} `,
      ` ${KEY.slice(1)}`,
      `${KEY}\n`,
      `\n${KEY}`,
      `${KEY.slice(0, 12)}\n${KEY.slice(13)}`,
      char(0xff10).repeat(24),
      null,
      undefined,
      123456789012,
      [KEY],
      { length: 24 },
      new String(KEY),
    ];
    for (const value of REFUSED) expect([value, isExternalMeasureKey(value)]).toEqual([value, false]);
    expect(EXTERNAL_MEASURE_KEY.test(KEY)).toBe(true);
    expect(EXTERNAL_MEASURE_KEY.flags).toBe("");
  });

  it("balise : un script asynchrone servi par l'hôte des sites, au chemin du contrat, avec la clé en paramètre", () => {
    expect(externalMeasureTag(SITES_BASE, KEY)).toBe(`<script async src="https://sites.harmony-web.fr/api/m?k=${KEY}"></script>`);
    expect(externalMeasureTag(`${SITES_BASE}///`, KEY)).toBe(externalMeasureTag(SITES_BASE, KEY));
    expect(externalMeasureTag("http://localhost:3000/", KEY)).toBe(`<script async src="http://localhost:3000/api/m?k=${KEY}"></script>`);
    // La route qui sert le script retrouve la clé telle quelle
    const src = /src="([^"]+)"/.exec(externalMeasureTag(SITES_BASE, KEY))?.[1] ?? "";
    expect(new URL(src).pathname).toBe(EXTERNAL_MEASURE_PATH);
    expect(isExternalMeasureKey(new URL(src).searchParams.get("k"))).toBe(true);
  });

  it("constantes du contrat : chemin, types de visite, refus du visiteur, origine", () => {
    expect(EXTERNAL_MEASURE_PATH).toBe("/api/m");
    expect(EXTERNAL_MEASURE_EVENTS).toEqual({ p: "pageview", r: "rdv_click", c: "call_click" });
    expect(EXTERNAL_MEASURE_OPTOUT.off).toMatch(/^#[a-z-]+$/);
    expect(EXTERNAL_MEASURE_OPTOUT.on).toMatch(/^#[a-z-]+$/);
    expect(EXTERNAL_MEASURE_OPTOUT.off).not.toBe(EXTERNAL_MEASURE_OPTOUT.on);
    expect(EXTERNAL_MEASURE_OPTOUT.storageKey.trim()).not.toBe("");
    expect(ANALYTICS_ORIGIN_EXTERNAL).toBe("external");
  });

  // Aujourd'hui : la base et la clé sont recopiées telles quelles dans la balise ; une clé hors format (guillemet,
  // chevron) y ouvre un second script. Aucun appelant touché pour l'instant : la clé vient de
  // `newExternalMeasureKey` et la base de `SITES_BASE_URL`. Le praticien colle cette balise sur son propre site.
  // Correctif proposé : refuser une clé qui ne passe pas `isExternalMeasureKey` et échapper la base.
  it.fails("constat — une clé hors format est recopiée telle quelle dans la balise", () => {
    let tag = "";
    try {
      tag = externalMeasureTag(SITES_BASE, 'x"></script><script>alert(1)</script>');
    } catch {
      // Un refus net conviendrait aussi
    }
    expect(tag).not.toContain("alert(1)");
  });
});

describe("parseExternalMeasure", () => {
  /** Corps d'une visite valide, complété ou corrigé par `fields`. */
  const body = (fields: Record<string, unknown> = {}): string => JSON.stringify({ k: KEY, t: "p", p: "/", ...fields });

  it("visite telle que le code de mesure l'envoie : clé, type, chemin, hôte d'origine", () => {
    expect(parseExternalMeasure(JSON.stringify({ k: KEY, t: "p", p: "/sophrologie", r: "www.google.com" }))).toStrictEqual({ k: KEY, t: "p", p: "/sophrologie", r: "www.google.com" });
    expect(parseExternalMeasure(JSON.stringify({ k: KEY, t: "p", p: "/", r: "direct" }))).toStrictEqual({ k: KEY, t: "p", p: "/", r: "direct" });
    // Sans provenance (navigation interne, clic) : la clé `r` est absente
    expect(parseExternalMeasure(JSON.stringify({ k: KEY, t: "r", p: "/contact", r: undefined }))).toStrictEqual({ k: KEY, t: "r", p: "/contact" });
    expect(parseExternalMeasure(JSON.stringify({ k: KEY, t: "c", p: "/contact" }))).toStrictEqual({ k: KEY, t: "c", p: "/contact" });
    for (const code of Object.keys(EXTERNAL_MEASURE_EVENTS)) expect(parseExternalMeasure(body({ t: code }))?.t).toBe(code);
    // Espaces autour du JSON, clés en plus : seules les quatre clés du contrat ressortent
    expect(parseExternalMeasure(`  ${body({ extra: "valeur", siteId: "site-1", u: "https://www.mon-cabinet.fr/?gclid=abc" })}\n`)).toStrictEqual({ k: KEY, t: "p", p: "/" });
  });

  it("chemin : le chemin seul — paramètres et ancre retirés, 300 caractères au plus", () => {
    const CASES: [unknown, string][] = [
      ["/", "/"],
      ["/sophrologie/", "/sophrologie/"],
      ["/sophrologie?utm_source=newsletter&gclid=abc123", "/sophrologie"],
      ["/sophrologie#tarifs", "/sophrologie"],
      ["/sophrologie?lang=fr#tarifs", "/sophrologie"],
      ["/sophrologie#tarifs?faux=parametre", "/sophrologie"],
      ["/?fbclid=abc", "/"],
      ["/#mesure-off", "/"],
      ["/caf%C3%A9/s%C3%A9ances", "/caf%C3%A9/s%C3%A9ances"],
      [`/${"a".repeat(400)}`, `/${"a".repeat(299)}`],
      // Ce qui n'est pas un chemin compte pour l'accueil
      ["", "/"],
      ["?utm_source=x", "/"],
      ["#haut", "/"],
      ["sophrologie", "/"],
      ["https://autre.fr/page", "/"],
      ["javascript:alert(1)", "/"],
      [42, "/"],
      [null, "/"],
      [["/sophrologie"], "/"],
      [{ toString: "/sophrologie" }, "/"],
    ];
    for (const [given, path] of CASES) expect([given, parseExternalMeasure(body({ p: given }))?.p]).toEqual([given, path]);
    expect(parseExternalMeasure(JSON.stringify({ k: KEY, t: "p" }))).toStrictEqual({ k: KEY, t: "p", p: "/" });
  });

  it("provenance : un nom d'hôte en minuscules ou « direct » ; toute autre valeur est omise sans faire rejeter la visite", () => {
    const KEPT: [string, string][] = [
      ["www.google.com", "www.google.com"],
      [" WWW.Google.COM ", "www.google.com"],
      ["Direct", "direct"],
      ["l.instagram.com", "l.instagram.com"],
      ["com.instagram.android", "com.instagram.android"],
      ["xn--caf-sant-d1af.fr", "xn--caf-sant-d1af.fr"],
      ["127.0.0.1", "127.0.0.1"],
      ["localhost", "localhost"],
      ["google.com\n", "google.com"],
    ];
    for (const [given, referrer] of KEPT) expect([given, parseExternalMeasure(body({ r: given }))]).toStrictEqual([given, { k: KEY, t: "p", p: "/", r: referrer }]);
    const OMITTED: unknown[] = [
      // Jamais l'adresse entière, jamais de paramètre de campagne
      "https://www.google.com/search?q=sophrologue+albi",
      "www.google.com/search",
      "google.com?utm_campaign=x",
      "google.com#x",
      "google.com:443",
      "claire@mon-cabinet.fr",
      "google.com\nautre.fr",
      "google .com",
      "café-santé.fr",
      "[::1]",
      "a_b.fr",
      "<script>alert(1)</script>",
      "",
      "   ",
      42,
      null,
      true,
      ["google.com"],
      { host: "google.com" },
    ];
    for (const given of OMITTED) expect([given, parseExternalMeasure(body({ r: given }))]).toStrictEqual([given, { k: KEY, t: "p", p: "/" }]);
    // Bornée à 120 caractères
    expect((parseExternalMeasure(body({ r: `${"a".repeat(200)}.fr` }))?.r ?? "").length).toBeLessThanOrEqual(120);
  });

  it("type de visite inconnu, absent ou d'un autre type (propriétés héritées comprises) : visite rejetée", () => {
    for (const type of ["x", "P", "pageview", "rdv_click", " p", "p ", "", "pr", ...PROTOTYPE_KEYS, 1, null, true, ["p"], { p: 1 }]) expect([type, parseExternalMeasure(body({ t: type }))]).toEqual([type, null]);
    expect(parseExternalMeasure(JSON.stringify({ k: KEY, p: "/" }))).toBeNull();
  });

  it("clé absente ou hors format : visite rejetée", () => {
    for (const key of ["", KEY.toUpperCase(), KEY.slice(1), `${KEY}a`, `${KEY}\n`, `${KEY.slice(0, 23)}-`, null, 123456789012, [KEY], { k: KEY }]) expect([key, parseExternalMeasure(body({ k: key }))]).toEqual([key, null]);
    expect(parseExternalMeasure(JSON.stringify({ t: "p", p: "/" }))).toBeNull();
  });

  it("corps absent, vide, illisible ou qui n'est pas un objet JSON : visite rejetée", () => {
    for (const raw of [null, undefined, "", " ", "pas du json", "{", `{"k":"${KEY}","t":"p"`, "null", "42", "true", `"${KEY}"`, "[]", `[${body()}]`, "{}", `${char(0xfeff)}${body()}`, `k=${KEY}&t=p`, `<script>${body()}</script>`]) {
      expect([raw, parseExternalMeasure(raw)]).toEqual([raw, null]);
    }
  });

  it("corps démesuré : rejeté au-delà de 1 000 caractères, même s'il est valide", () => {
    const padded = (length: number): string => {
      const base = body({ extra: "" });
      return base.replace('"extra":""', `"extra":"${"x".repeat(length - base.length)}"`);
    };
    expect(padded(1_000)).toHaveLength(1_000);
    expect(parseExternalMeasure(padded(1_000))).toStrictEqual({ k: KEY, t: "p", p: "/" });
    expect(padded(1_001)).toHaveLength(1_001);
    expect(parseExternalMeasure(padded(1_001))).toBeNull();
    expect(parseExternalMeasure(`${body()}${" ".repeat(1_000)}`)).toBeNull();
    expect(parseExternalMeasure(body({ p: `/${"a".repeat(2_000)}` }))).toBeNull();
    expect(parseExternalMeasure("{".repeat(1_000_000))).toBeNull();
  });

  it("clés en double, « __proto__ » et « constructor » : la dernière valeur compte, rien n'est hérité ni écrit ailleurs", () => {
    expect(parseExternalMeasure(`{"k":"${KEY}","t":"x","t":"p"}`)).toStrictEqual({ k: KEY, t: "p", p: "/" });
    expect(parseExternalMeasure(`{"k":"${KEY}","t":"p","t":"x"}`)).toBeNull();
    expect(parseExternalMeasure(`{"__proto__":{"k":"${KEY}","t":"p","p":"/herite"}}`)).toBeNull();
    const visit = parseExternalMeasure(`{"k":"${KEY}","t":"p","__proto__":{"p":"/herite","r":"herite.fr"},"constructor":{"prototype":{"r":"herite.fr"}}}`);
    expect(visit).toStrictEqual({ k: KEY, t: "p", p: "/" });
    expect(Object.getPrototypeOf(visit)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>).p).toBeUndefined();
    expect(({} as Record<string, unknown>).r).toBeUndefined();
  });

  // Aujourd'hui : le chemin est gardé tel qu'il arrive, caractères de contrôle compris. Un caractère nul fait
  // échouer l'insertion de la visite dans `analytics_events.path` (PostgreSQL : 22021, vérifié) : la route
  // publique `/api/m` (`apps/sites`) journalise alors une erreur de base à chaque envoi, et la clé est publique.
  // Un saut de ligne ou un caractère d'échappement entrent, eux, dans les statistiques.
  // Correctif proposé : rejeter la visite (ou ramener le chemin à « / ») dès que le chemin porte un caractère de
  // contrôle.
  it.fails("constat — un chemin qui porte un caractère nul, un saut de ligne ou un caractère d'échappement est gardé tel quel", () => {
    for (const path of [`/a${char(0)}b`, "/a\nb", `/a${char(0x1b)}[2Jb`, `/a${char(0x7f)}`]) {
      const visit = parseExternalMeasure(body({ p: path }));
      expect([JSON.stringify(path), visit === null || !hasControl(visit.p)]).toEqual([JSON.stringify(path), true]);
    }
  });
});
