import { afterEach, describe, expect, it, vi } from "vitest";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import type * as DbModule from "@theralys/db";
import { googlePosts, notificationLog, socialPosts, users, type PlanId } from "@theralys/db";
import { MailTransientError, type MailMessage, type MailProvider } from "@theralys/providers/mail";
import {
  DEFAULT_STUDIO_BASE_URL,
  MONTH_REMINDER_KIND,
  NOTIFICATION_PAGE,
  SEND_FAILURE_BREAKER,
  SEND_RETRIES,
  SEND_SPACING_MS,
  WEEKLY_DIGEST_KIND,
  decideMonthReminder,
  decideWeeklyDigest,
  digestItemFromGoogle,
  digestItemFromSocial,
  digestStudioLink,
  escapeHtml,
  firstNameOf,
  googleMonthUrl,
  googlePostUrl,
  groupDigestByDay,
  isMonthReminderDay,
  isWeeklyDigestDay,
  isoWeekOf,
  monthLabel,
  nextMonthOf,
  parisDay,
  parisDayOfMonth,
  recipientList,
  renderMonthReminder,
  renderWeeklyDigest,
  sendMonthReminders,
  sendWeeklyContentDigests,
  socialMonthUrl,
  socialPostUrl,
  studioBaseUrl,
  weekPeriodOf,
  weekRangeLabel,
  type DigestItem,
} from "./notifications";
import { ALL_TICKS } from "./ticks";

// Base simulée pour les passages d'envoi (fin du fichier) ; les fonctions pures n'y touchent pas
const state = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@theralys/db", async (importOriginal) => ({
  ...(await importOriginal<typeof DbModule>()),
  getDb: () => state.db,
}));

// Lundi 2 novembre 2026, 6 h UTC (7 h à Paris) : l'heure du cron
const MONDAY = new Date("2026-11-02T06:00:00Z");

describe("jour civil Europe/Paris", () => {
  it("bascule à minuit heure de Paris, pas à minuit UTC (hiver : UTC+1, été : UTC+2)", () => {
    expect(parisDay(MONDAY)).toBe("2026-11-02");
    // Dimanche 23 h 30 UTC = lundi 0 h 30 à Paris
    expect(parisDay(new Date("2026-11-01T23:30:00Z"))).toBe("2026-11-02");
    // Lundi 22 h 59 UTC = lundi 23 h 59 à Paris ; 23 h UTC = mardi 0 h
    expect(parisDay(new Date("2026-11-02T22:59:00Z"))).toBe("2026-11-02");
    expect(parisDay(new Date("2026-11-02T23:00:00Z"))).toBe("2026-11-03");
    // Heure d'été : dimanche 22 h 30 UTC = lundi 0 h 30 à Paris
    expect(parisDay(new Date("2026-07-05T22:30:00Z"))).toBe("2026-07-06");
  });

  it("jour du mois à Paris", () => {
    expect(parisDayOfMonth(new Date("2026-11-24T23:30:00Z"))).toBe(25);
    expect(parisDayOfMonth(new Date("2026-11-25T23:30:00Z"))).toBe(26);
  });
});

describe("semaine ISO (lundi → dimanche)", () => {
  it("clé, bornes et numéro de semaine", () => {
    expect(isoWeekOf("2026-11-02")).toEqual({ key: "2026-W45", year: 2026, week: 45, monday: "2026-11-02", sunday: "2026-11-08" });
    // Même semaine depuis un dimanche
    expect(isoWeekOf("2026-11-08").key).toBe("2026-W45");
    expect(isoWeekOf("2026-11-08").monday).toBe("2026-11-02");
  });

  it("l'année ISO suit le jeudi de la semaine (1er janvier, semaine 53)", () => {
    // 1er janvier 2026 (jeudi) : semaine 1, qui commence le lundi 29 décembre 2025
    expect(isoWeekOf("2026-01-01")).toMatchObject({ key: "2026-W01", monday: "2025-12-29", sunday: "2026-01-04" });
    // 3 janvier 2027 (dimanche) : encore la semaine 53 de 2026
    expect(isoWeekOf("2027-01-03")).toMatchObject({ key: "2026-W53", monday: "2026-12-28", sunday: "2027-01-03" });
    // 30 décembre 2024 (lundi) : semaine 1 de 2025
    expect(isoWeekOf("2024-12-30").key).toBe("2025-W01");
  });

  it("weekPeriodOf part du jour civil de Paris", () => {
    // Dimanche 1er novembre 23 h 30 UTC = lundi 2 à Paris → semaine 45
    expect(weekPeriodOf(new Date("2026-11-01T23:30:00Z")).key).toBe("2026-W45");
    // Dimanche 1er novembre 20 h UTC = dimanche à Paris → semaine 44
    expect(weekPeriodOf(new Date("2026-11-01T20:00:00Z")).key).toBe("2026-W44");
  });
});

describe("mois suivant", () => {
  it("clé, bornes [1er, 1er du suivant[ et passage d'année", () => {
    expect(nextMonthOf(new Date("2026-10-25T06:00:00Z"))).toEqual({
      key: "2026-11",
      year: 2026,
      month: 11,
      startIso: "2026-11-01",
      endIso: "2026-12-01",
    });
    expect(nextMonthOf(new Date("2026-12-25T06:00:00Z"))).toMatchObject({ key: "2027-01", startIso: "2027-01-01", endIso: "2027-02-01" });
    // 30 novembre 23 h 30 UTC = 1er décembre à Paris → mois suivant : janvier
    expect(nextMonthOf(new Date("2026-11-30T23:30:00Z")).key).toBe("2027-01");
  });

  it("libellé français", () => {
    expect(monthLabel({ year: 2026, month: 11 })).toBe("novembre 2026");
  });
});

describe("décision de l'e-mail hebdomadaire", () => {
  const base = { recipients: 1, contents: 2, alreadySent: false };

  it("part le lundi (Europe/Paris) ; rattrapage le mardi et le mercredi pour la même semaine, plus rien ensuite", () => {
    expect(decideWeeklyDigest({ ...base, now: MONDAY })).toMatchObject({ send: true, week: { key: "2026-W45" } });
    // Mardi et mercredi : la même semaine, pour les sites que le lundi n'a pas servis
    expect(decideWeeklyDigest({ ...base, now: new Date("2026-11-03T06:00:00Z") })).toMatchObject({ send: true, week: { key: "2026-W45" } });
    expect(decideWeeklyDigest({ ...base, now: new Date("2026-11-04T06:00:00Z") })).toMatchObject({ send: true, week: { key: "2026-W45" } });
    for (const day of ["2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08"]) {
      expect(decideWeeklyDigest({ ...base, now: new Date(`${day}T06:00:00Z`) })).toEqual({ send: false, reason: "not_send_day" });
    }
    // Dimanche 23 h 30 UTC : déjà lundi à Paris
    expect(decideWeeklyDigest({ ...base, now: new Date("2026-11-01T23:30:00Z") })).toMatchObject({ send: true, week: { key: "2026-W45" } });
    // Dimanche 20 h UTC : encore dimanche à Paris
    expect(decideWeeklyDigest({ ...base, now: new Date("2026-11-01T20:00:00Z") })).toEqual({ send: false, reason: "not_send_day" });
    // Mercredi 23 h 30 UTC : déjà jeudi à Paris
    expect(decideWeeklyDigest({ ...base, now: new Date("2026-11-04T23:30:00Z") })).toEqual({ send: false, reason: "not_send_day" });
    expect(["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-08"].map(isWeeklyDigestDay)).toEqual([true, true, true, false, false]);
  });

  it("exige un destinataire et un contenu, et pas d'envoi antérieur", () => {
    expect(decideWeeklyDigest({ ...base, now: MONDAY, recipients: 0 })).toEqual({ send: false, reason: "no_recipient" });
    expect(decideWeeklyDigest({ ...base, now: MONDAY, contents: 0 })).toEqual({ send: false, reason: "no_content" });
    expect(decideWeeklyDigest({ ...base, now: MONDAY, alreadySent: true })).toEqual({ send: false, reason: "already_sent" });
  });
});

describe("décision du rappel mensuel", () => {
  const the25th = new Date("2026-10-25T06:00:00Z");
  const empty = { access: true, nextMonthPosts: 0 };
  const planned = { access: true, nextMonthPosts: 3 };
  const noAccess = { access: false, nextMonthPosts: 0 };

  it("part le 25 (Europe/Paris) ; rattrapage jusqu'au 28 pour le même mois, plus rien ensuite", () => {
    expect(decideMonthReminder({ now: the25th, recipients: 1, alreadySent: false, social: empty, google: empty })).toMatchObject({
      send: true,
      month: { key: "2026-11" },
      channels: ["social", "google"],
    });
    expect(decideMonthReminder({ now: new Date("2026-10-24T06:00:00Z"), recipients: 1, alreadySent: false, social: empty, google: empty })).toEqual({
      send: false,
      reason: "not_reminder_day",
    });
    for (const day of ["2026-10-26", "2026-10-27", "2026-10-28"]) {
      expect(decideMonthReminder({ now: new Date(`${day}T06:00:00Z`), recipients: 1, alreadySent: false, social: empty, google: empty })).toMatchObject({ send: true, month: { key: "2026-11" } });
    }
    for (const day of ["2026-10-29", "2026-10-31", "2026-11-01"]) {
      expect(decideMonthReminder({ now: new Date(`${day}T06:00:00Z`), recipients: 1, alreadySent: false, social: empty, google: empty })).toEqual({ send: false, reason: "not_reminder_day" });
    }
    // Février : le rattrapage tient dans le mois, la période reste mars
    expect(decideMonthReminder({ now: new Date("2027-02-28T06:00:00Z"), recipients: 1, alreadySent: false, social: empty, google: empty })).toMatchObject({ send: true, month: { key: "2027-03" } });
    expect(["2026-10-24", "2026-10-25", "2026-10-28", "2026-10-29"].map((day) => isMonthReminderDay(new Date(`${day}T06:00:00Z`)))).toEqual([false, true, true, false]);
    // 24 octobre 23 h 30 UTC = 25 octobre 1 h 30 à Paris (heure d'été)
    expect(decideMonthReminder({ now: new Date("2026-10-24T23:30:00Z"), recipients: 1, alreadySent: false, social: empty, google: empty }).send).toBe(true);
  });

  it("ne cite que les canaux accessibles et vides", () => {
    expect(decideMonthReminder({ now: the25th, recipients: 1, alreadySent: false, social: empty, google: planned })).toMatchObject({ channels: ["social"] });
    expect(decideMonthReminder({ now: the25th, recipients: 1, alreadySent: false, social: noAccess, google: empty })).toMatchObject({ channels: ["google"] });
    expect(decideMonthReminder({ now: the25th, recipients: 1, alreadySent: false, social: planned, google: planned })).toEqual({
      send: false,
      reason: "nothing_to_prepare",
    });
    expect(decideMonthReminder({ now: the25th, recipients: 1, alreadySent: false, social: noAccess, google: noAccess })).toEqual({
      send: false,
      reason: "nothing_to_prepare",
    });
  });

  it("exige un destinataire et pas d'envoi antérieur", () => {
    expect(decideMonthReminder({ now: the25th, recipients: 0, alreadySent: false, social: empty, google: empty })).toEqual({ send: false, reason: "no_recipient" });
    expect(decideMonthReminder({ now: the25th, recipients: 1, alreadySent: true, social: empty, google: empty })).toEqual({ send: false, reason: "already_sent" });
  });
});

describe("liens profonds", () => {
  it("STUDIO_BASE_URL sans barre finale, repli sur l'URL publique", () => {
    expect(studioBaseUrl({ STUDIO_BASE_URL: "http://localhost:3002/" } as NodeJS.ProcessEnv)).toBe("http://localhost:3002");
    expect(studioBaseUrl({} as NodeJS.ProcessEnv)).toBe(DEFAULT_STUDIO_BASE_URL);
  });

  it("pages du studio avec mois et contenu", () => {
    const base = "https://app.harmony-web.fr";
    expect(socialPostUrl(base, "2026-11", "abc")).toBe("https://app.harmony-web.fr/reseaux-sociaux?mois=2026-11&post=abc");
    expect(googlePostUrl(base, "2026-11", "abc")).toBe("https://app.harmony-web.fr/fiche-google?onglet=posts&mois=2026-11&post=abc");
    expect(socialMonthUrl(base, "2026-12")).toBe("https://app.harmony-web.fr/reseaux-sociaux?mois=2026-12");
    expect(googleMonthUrl(base, "2026-12")).toBe("https://app.harmony-web.fr/fiche-google?onglet=posts&mois=2026-12");
  });
});

const BASE = "https://app.harmony-web.fr";

function items(): DigestItem[] {
  return [
    digestItemFromGoogle(
      { id: "g1", scheduledFor: "2026-11-03", topic: "Horaires d'hiver", content: { summary: "Le cabinet ouvre désormais dès 8 h le mardi.  " } },
      BASE,
    ),
    digestItemFromSocial(
      {
        id: "s2",
        scheduledFor: "2026-11-06",
        topic: "Respiration & détente",
        content: { caption: "Trois respirations pour relâcher les épaules.\n\nLien dans ma bio.", hashtags: ["#sophrologie", "#albi"] },
      },
      BASE,
    ),
    digestItemFromSocial(
      {
        id: "s1",
        scheduledFor: "2026-11-03",
        topic: "Sommeil <réparateur> \"test\"",
        content: { caption: "Un rituel du soir en 3 étapes.", hashtags: [] },
      },
      BASE,
    ),
  ];
}

describe("contenus de la semaine", () => {
  it("légende Instagram = légende + hashtags ; résumé Google nettoyé ; liens profonds", () => {
    const [google, social] = items();
    expect(google).toMatchObject({
      kind: "google",
      text: "Le cabinet ouvre désormais dès 8 h le mardi.",
      url: "https://app.harmony-web.fr/fiche-google?onglet=posts&mois=2026-11&post=g1",
    });
    expect(social).toMatchObject({
      kind: "social",
      text: "Trois respirations pour relâcher les épaules.\n\nLien dans ma bio.\n\n#sophrologie #albi",
      url: "https://app.harmony-web.fr/reseaux-sociaux?mois=2026-11&post=s2",
    });
  });

  it("groupe par jour croissant, réseaux sociaux avant fiche Google", () => {
    const days = groupDigestByDay(items());
    expect(days.map((d) => d.date)).toEqual(["2026-11-03", "2026-11-06"]);
    expect(days[0]?.label).toBe("Mardi 3 novembre");
    expect(days[0]?.items.map((i) => i.id)).toEqual(["s1", "g1"]);
    expect(days[1]?.items.map((i) => i.id)).toEqual(["s2"]);
  });
});

describe("rendu des e-mails", () => {
  it("échappe & < > \" et l'apostrophe", () => {
    expect(escapeHtml(`Tom & Jerry <b>"x"</b> l'été`)).toBe("Tom &amp; Jerry &lt;b&gt;&quot;x&quot;&lt;/b&gt; l&#39;été");
  });

  it("prénom seul", () => {
    expect(firstNameOf("Claire Dupont")).toBe("Claire");
    expect(firstNameOf("  Jean-Pierre  Martin ")).toBe("Jean-Pierre");
    expect(firstNameOf("Claire")).toBe("Claire");
  });

  it("libellé de semaine : même mois, mois différents, années différentes, premier du mois en « 1er »", () => {
    expect(weekRangeLabel({ monday: "2026-11-02", sunday: "2026-11-08" })).toBe("du 2 au 8 novembre 2026");
    expect(weekRangeLabel({ monday: "2026-11-30", sunday: "2026-12-06" })).toBe("du 30 novembre au 6 décembre 2026");
    expect(weekRangeLabel({ monday: "2025-12-29", sunday: "2026-01-04" })).toBe("du 29 décembre 2025 au 4 janvier 2026");
    expect(weekRangeLabel({ monday: "2026-10-26", sunday: "2026-11-01" })).toBe("du 26 octobre au 1er novembre 2026");
    expect(weekRangeLabel({ monday: "2026-06-01", sunday: "2026-06-07" })).toBe("du 1er au 7 juin 2026");
    expect(weekRangeLabel({ monday: "2026-11-09", sunday: "2026-11-15" })).toBe("du 9 au 15 novembre 2026");
  });

  it("libellé de jour : « 1er » pour le premier du mois, « 11 » intact", () => {
    expect(groupDigestByDay([{ ...items()[0]!, date: "2026-11-01" }])[0]?.label).toBe("Dimanche 1er novembre");
    expect(groupDigestByDay([{ ...items()[0]!, date: "2026-11-11" }])[0]?.label).toBe("Mercredi 11 novembre");
  });

  it("e-mail hebdomadaire : sujet, texte et HTML (instantané lisible)", () => {
    const mail = renderWeeklyDigest({ firstName: "Claire", week: isoWeekOf("2026-11-02"), items: items(), studioUrl: BASE });
    expect(mail.subject).toBe("Vos contenus de la semaine (du 2 au 8 novembre 2026)");
    expect(mail.text).toMatchSnapshot();
    expect(mail.html).toMatchSnapshot();
    // Prénom seul, jamais d'adresse e-mail
    expect(mail.text).toContain("Bonjour Claire,");
    expect(mail.text).not.toMatch(/@/);
    expect(mail.html).not.toMatch(/@/);
    // Texte à coller et liens profonds, dans l'ordre des jours
    expect(mail.text.indexOf("Mardi 3 novembre")).toBeLessThan(mail.text.indexOf("Vendredi 6 novembre"));
    expect(mail.text).toContain("#sophrologie #albi");
    expect(mail.text).toContain("https://app.harmony-web.fr/reseaux-sociaux?mois=2026-11&post=s1");
    expect(mail.text).toContain("https://app.harmony-web.fr/fiche-google?onglet=posts&mois=2026-11&post=g1");
    // HTML : textes injectés échappés, aucune balise brute venue des contenus
    expect(mail.html).toContain("Sommeil &lt;réparateur&gt; &quot;test&quot;");
    expect(mail.html).toContain("Respiration &amp; détente");
    expect(mail.html).not.toContain("<réparateur>");
  });

  it("e-mail hebdomadaire : le lien général suit les canaux présents (social → Réseaux sociaux, fiche Google seule → onglet Posts)", () => {
    const week = isoWeekOf("2026-11-02");
    const [google, social] = items();
    expect(digestStudioLink(BASE, "2026-11", [google!, social!])).toBe("https://app.harmony-web.fr/reseaux-sociaux?mois=2026-11");
    expect(digestStudioLink(BASE, "2026-11", [social!])).toBe("https://app.harmony-web.fr/reseaux-sociaux?mois=2026-11");
    expect(digestStudioLink(BASE, "2026-11", [google!])).toBe("https://app.harmony-web.fr/fiche-google?onglet=posts&mois=2026-11");
    const googleOnly = renderWeeklyDigest({ firstName: "Claire", week, items: [google!], studioUrl: BASE });
    expect(googleOnly.text).toContain("Tous vos contenus : https://app.harmony-web.fr/fiche-google?onglet=posts&mois=2026-11");
    expect(googleOnly.html).toContain('href="https://app.harmony-web.fr/fiche-google?onglet=posts&amp;mois=2026-11"');
    expect(googleOnly.text).not.toContain("reseaux-sociaux?mois=");
    const mixed = renderWeeklyDigest({ firstName: "Claire", week, items: items(), studioUrl: BASE });
    expect(mixed.text).toContain("Tous vos contenus : https://app.harmony-web.fr/reseaux-sociaux?mois=2026-11");
  });

  it("journal : identifiants de comptes, jamais d'adresse e-mail (RGPD)", () => {
    expect(recipientList([{ id: "u1" }, { id: "u2" }])).toBe("user:u1, user:u2");
    expect(recipientList([])).toBe("");
  });

  it("ticks : les e-mails ont leur groupe et passent avant les appels fournisseur longs ; pages de sites, envois espacés, relances", () => {
    const emails = ALL_TICKS.filter((t) => t.group === "emails").map((t) => t.task);
    expect(emails).toEqual(["month-reminders", "weekly-content-digests"]);
    const tasks = ALL_TICKS.map((t) => t.task);
    for (const task of emails) expect(tasks.indexOf(task)).toBeLessThan(tasks.indexOf("generate-articles"));
    expect(tasks).toContain("scheduled-google-scans");
    expect(NOTIFICATION_PAGE).toBe(100);
    expect(SEND_SPACING_MS).toBe(500);
    expect(SEND_RETRIES).toBeGreaterThanOrEqual(2);
    expect(SEND_RETRIES).toBeLessThanOrEqual(3);
  });

  it("e-mail hebdomadaire : rien d'autre que le prénom comme donnée personnelle", () => {
    const mail = renderWeeklyDigest({ firstName: "O'Neil <script>", week: isoWeekOf("2026-11-02"), items: items(), studioUrl: BASE });
    expect(mail.html).toContain("Bonjour O&#39;Neil &lt;script&gt;,");
    expect(mail.html).not.toContain("<script>");
  });

  it("rappel mensuel : seulement les canaux concernés", () => {
    const month = nextMonthOf(new Date("2026-10-25T06:00:00Z"));
    const both = renderMonthReminder({
      firstName: "Claire",
      month,
      social: socialMonthUrl(BASE, month.key),
      google: googleMonthUrl(BASE, month.key),
    });
    expect(both.subject).toBe("Préparez votre mois de novembre 2026");
    expect(both.text).toMatchSnapshot();
    expect(both.html).toMatchSnapshot();
    expect(both.text).toContain("Réseaux sociaux (Instagram, Facebook, LinkedIn) :");
    expect(both.text).toContain("Fiche Google :");
    expect(both.text).toContain("https://app.harmony-web.fr/reseaux-sociaux?mois=2026-11");
    expect(both.text).toContain("https://app.harmony-web.fr/fiche-google?onglet=posts&mois=2026-11");

    const googleOnly = renderMonthReminder({ firstName: "Claire", month, social: null, google: googleMonthUrl(BASE, month.key) });
    expect(googleOnly.text).not.toContain("Réseaux sociaux");
    expect(googleOnly.text).toContain("Fiche Google :");
    expect(googleOnly.html).not.toContain("reseaux-sociaux");
    expect((googleOnly.html.match(/Préparer mon mois/g) ?? []).length).toBe(1);
  });
});

// ─── Passages d'envoi (base et fournisseur simulés) ──────────────────────────

const DIALECT = new PgDialect();
const paramsOf = (condition: unknown) => DIALECT.sqlToQuery(condition as SQL).params;

type Post = { id: string; siteId: string; scheduledFor: string; topic: string; status: "ready" | "archived" };
type Account = { siteId: string; type: "demo" | "client"; plan: PlanId; recipients: { id: string; email: string; name: string }[] };
type LogRow = { id: string; siteId: string; kind: string; periodKey: string; recipient: string; sent: boolean };

const account = (n: number, overrides: Partial<Account> = {}): Account => ({ siteId: `site-${n}`, type: "client", plan: "scale", recipients: [{ id: `user-${n}`, email: `praticien${n}@exemple.fr`, name: `Claire Dupont ${n}` }], ...overrides });
const socialPost = (siteId: string, day = "2026-11-03"): Post => ({ id: `post-${siteId}-${day}`, siteId, scheduledFor: day, topic: "Respiration", status: "ready" });

/**
 * Base simulée des notifications : comptes clients par site, contenus et
 * journal. La réservation (`insert … on conflict do nothing`) respecte
 * l'unicité (site, kind, période) ; les lectures de contenus sont filtrées
 * par les identifiants de sites et les bornes de dates de la requête.
 */
function notificationDb(seed: { accounts: Account[]; social?: Post[]; google?: Post[]; logged?: Omit<LogRow, "id" | "recipient" | "sent">[] }) {
  const log: LogRow[] = (seed.logged ?? []).map((row, i) => ({ id: `log-${i + 1}`, recipient: "", sent: true, ...row }));
  const posts = new Map<unknown, Post[]>([
    [socialPosts, seed.social ?? []],
    [googlePosts, seed.google ?? []],
  ]);
  /** Tailles des pages de sites dont les contenus ont été chargés */
  const pages: number[] = [];
  let nextLog = log.length + 1;
  /** Contenus d'une table dans les bornes de la requête : semaine [lundi, dimanche] (`ready`) ou mois [début, fin[ (non archivés) */
  const inPeriod = (table: unknown, params: unknown[]) => {
    const strings = params.filter((p): p is string => typeof p === "string");
    const [from, to] = strings.filter((p) => /^\d{4}-\d{2}-\d{2}$/.test(p));
    const weekly = strings.includes("ready");
    return (posts.get(table) ?? []).filter((post) => (weekly ? post.status === "ready" && post.scheduledFor >= from! && post.scheduledFor <= to! : post.status !== "archived" && post.scheduledFor >= from! && post.scheduledFor < to!));
  };
  const findPosts = (table: unknown) => ({
    findMany: async (config: { where: unknown }) => {
      const params = paramsOf(config.where);
      const siteIds = params.filter((p) => typeof p === "string" && p.startsWith("site-"));
      if (table === socialPosts) pages.push(siteIds.length);
      return inPeriod(table, params)
        .filter((post) => siteIds.includes(post.siteId))
        .map((post) => ({ ...post, content: table === socialPosts ? { caption: "Trois respirations.", hashtags: [] } : { summary: "Horaires d'hiver." } }));
    },
  });
  const db = {
    selectDistinct: () => ({
      from: (table: unknown) => ({
        where: async (condition: unknown) => [...new Set(inPeriod(table, paramsOf(condition)).map((post) => post.siteId))].map((siteId) => ({ siteId })),
      }),
    }),
    select: () => ({
      from: (table: unknown) => {
        if (table !== users) throw new Error("Requête non simulée");
        const rows = seed.accounts.flatMap((a) => a.recipients.map((r) => ({ siteId: a.siteId, type: a.type, plan: a.plan, userId: r.id, email: r.email, name: r.name })));
        const chain = { innerJoin: () => chain, where: () => chain, orderBy: async () => rows };
        return chain;
      },
    }),
    query: {
      notificationLog: {
        findMany: async (config: { where: unknown }) => {
          const [kind, periodKey] = paramsOf(config.where);
          return log.filter((row) => row.kind === kind && row.periodKey === periodKey).map((row) => ({ siteId: row.siteId }));
        },
      },
      socialPosts: findPosts(socialPosts),
      googlePosts: findPosts(googlePosts),
    },
    transaction: async <T>(run: (tx: unknown) => Promise<T>): Promise<T> =>
      run({
        insert: (table: unknown) => ({
          values: (values: Omit<LogRow, "id">) => ({
            onConflictDoNothing: () => ({
              returning: async () => {
                if (table !== notificationLog) throw new Error("Écriture non simulée");
                if (log.some((row) => row.siteId === values.siteId && row.kind === values.kind && row.periodKey === values.periodKey)) return [];
                const row = { ...values, id: `log-${nextLog++}` };
                log.push(row);
                return [{ id: row.id }];
              },
            }),
          }),
        }),
      }),
    update: () => ({
      set: (values: Partial<LogRow>) => ({
        where: async (condition: unknown) => {
          const row = log.find((entry) => paramsOf(condition).includes(entry.id));
          if (row) Object.assign(row, values);
        },
      }),
    }),
    delete: () => ({
      where: async (condition: unknown) => {
        const index = log.findIndex((entry) => paramsOf(condition).includes(entry.id));
        if (index >= 0) log.splice(index, 1);
      },
    }),
  };
  state.db = db;
  return { log, pages };
}

/** Fournisseur de capture en mode réel : `failures` donne, par adresse, le nombre d'échecs transitoires avant la réussite (Infinity : toujours). */
function captureMail(failures: Record<string, number> = {}, status = 429) {
  const sent: MailMessage[] = [];
  const attempts: string[] = [];
  const remaining = new Map(Object.entries(failures));
  const provider: MailProvider = {
    mode: "resend",
    send: async (message) => {
      attempts.push(message.to);
      const left = remaining.get(message.to) ?? remaining.get("*") ?? 0;
      if (left > 0) {
        remaining.set(remaining.has(message.to) ? message.to : "*", left - 1);
        throw new MailTransientError(`Resend ${status} (transitoire): ${message.to}`, status, status === 429 ? 2_000 : null);
      }
      sent.push(message);
      return { sent: true };
    },
  };
  return { provider, sent, attempts };
}

const TUESDAY = new Date("2026-11-03T06:00:00Z");
const WEDNESDAY = new Date("2026-11-04T06:00:00Z");
const THURSDAY = new Date("2026-11-05T06:00:00Z");
const ENV = { STUDIO_BASE_URL: BASE } as NodeJS.ProcessEnv;

describe("sendWeeklyContentDigests : passages d'envoi", () => {
  /** Attentes demandées (espacement, relances) : rien n'attend pour de bon */
  const waits: number[] = [];
  const sleep = async (ms: number) => void waits.push(ms);

  afterEach(() => {
    state.db = null;
    waits.length = 0;
    vi.restoreAllMocks();
  });

  it("lundi : un e-mail par compte des sites qui ont un contenu cette semaine ; journal sans adresse", async () => {
    const accounts = [account(1), account(2, { recipients: [{ id: "user-2a", email: "a@exemple.fr", name: "Anne Martin" }, { id: "user-2b", email: "b@exemple.fr", name: "Bruno Martin" }] }), account(3)];
    const handle = notificationDb({ accounts, social: [socialPost("site-1"), socialPost("site-2")], google: [{ ...socialPost("site-2", "2026-11-06"), id: "g1" }] });
    const mail = captureMail();
    expect(await sendWeeklyContentDigests(MONDAY, { mail: mail.provider, env: ENV, sleep })).toEqual({ task: "weekly-content-digests", processed: 2, status: "ok" });
    expect(mail.sent.map((m) => m.to)).toEqual(["praticien1@exemple.fr", "a@exemple.fr", "b@exemple.fr"]);
    expect(mail.sent[1]!.text).toContain("Bonjour Anne,");
    expect(handle.log).toEqual([
      { id: "log-1", siteId: "site-1", kind: WEEKLY_DIGEST_KIND, periodKey: "2026-W45", recipient: "user:user-1", sent: true, sentAt: MONDAY },
      { id: "log-2", siteId: "site-2", kind: WEEKLY_DIGEST_KIND, periodKey: "2026-W45", recipient: "user:user-2a, user:user-2b", sent: true, sentAt: MONDAY },
    ]);
    expect(JSON.stringify(handle.log)).not.toContain("@");
  });

  it("rattrapage : mardi et mercredi ne servent que les sites sans ligne au journal ; jeudi, plus rien", async () => {
    const handle = notificationDb({
      accounts: [account(1), account(2), account(3)],
      social: [socialPost("site-1"), socialPost("site-2"), socialPost("site-3")],
      logged: [{ siteId: "site-1", kind: WEEKLY_DIGEST_KIND, periodKey: "2026-W45" }],
    });
    const mail = captureMail();
    expect(await sendWeeklyContentDigests(TUESDAY, { mail: mail.provider, env: ENV, sleep })).toEqual({ task: "weekly-content-digests", processed: 2, status: "ok" });
    expect(mail.sent.map((m) => m.to)).toEqual(["praticien2@exemple.fr", "praticien3@exemple.fr"]);
    // Mercredi : tout le monde a été servi ; jeudi : hors fenêtre
    expect(await sendWeeklyContentDigests(WEDNESDAY, { mail: mail.provider, env: ENV, sleep })).toEqual({ task: "weekly-content-digests", processed: 0, status: "ok" });
    expect(await sendWeeklyContentDigests(THURSDAY, { mail: mail.provider, env: ENV, sleep })).toEqual({ task: "weekly-content-digests", processed: 0, status: "ok" });
    expect(mail.sent).toHaveLength(2);
    expect(handle.log.filter((row) => row.periodKey === "2026-W45")).toHaveLength(3);
  });

  it("tout le parc est parcouru, par pages de sites : plus de coupe à 1 000", async () => {
    const accounts = Array.from({ length: 1_050 }, (_, i) => account(i + 1));
    const handle = notificationDb({ accounts, social: accounts.map((a) => socialPost(a.siteId)) });
    const mail = captureMail();
    expect(await sendWeeklyContentDigests(MONDAY, { mail: mail.provider, env: ENV, sleep })).toEqual({ task: "weekly-content-digests", processed: 1_050, status: "ok" });
    expect(mail.sent).toHaveLength(1_050);
    // Les contenus ne sont chargés que pour la page en cours
    expect(handle.pages).toEqual([...Array(10).fill(NOTIFICATION_PAGE), 50]);
    // Plus de mille e-mails composés : large délai, la machine de la CI partage ses cœurs entre tous les paquets
  }, 120_000);

  it("envois espacés d'un site à l'autre, pas seulement entre destinataires d'un même site", async () => {
    notificationDb({ accounts: [account(1), account(2), account(3)], social: [socialPost("site-1"), socialPost("site-2"), socialPost("site-3")] });
    const mail = captureMail();
    await sendWeeklyContentDigests(MONDAY, { mail: mail.provider, env: ENV, sleep });
    // Trois envois : une attente avant le deuxième et avant le troisième, jamais plus que l'espacement
    expect(waits).toHaveLength(2);
    for (const wait of waits) {
      expect(wait).toBeGreaterThan(SEND_SPACING_MS - 100);
      expect(wait).toBeLessThanOrEqual(SEND_SPACING_MS);
    }
  });

  it("erreur transitoire (429) : relancée après l'attente demandée par le fournisseur, l'e-mail part", async () => {
    const handle = notificationDb({ accounts: [account(1)], social: [socialPost("site-1")] });
    const mail = captureMail({ "praticien1@exemple.fr": 2 });
    expect(await sendWeeklyContentDigests(MONDAY, { mail: mail.provider, env: ENV, sleep })).toEqual({ task: "weekly-content-digests", processed: 1, status: "ok" });
    expect(mail.attempts).toEqual(Array(3).fill("praticien1@exemple.fr"));
    expect(waits.filter((wait) => wait === 2_000)).toHaveLength(2);
    expect(handle.log[0]).toMatchObject({ sent: true });
  });

  it("erreur qui persiste : la réservation est libérée, les sites suivants sont servis, le rattrapage du lendemain reprend le site", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const handle = notificationDb({ accounts: [account(1), account(2)], social: [socialPost("site-1"), socialPost("site-2")] });
    const down = captureMail({ "praticien1@exemple.fr": Infinity }, 503);
    expect(await sendWeeklyContentDigests(MONDAY, { mail: down.provider, env: ENV, sleep })).toEqual({ task: "weekly-content-digests", processed: 1, status: "ok", failed: 1 });
    expect(down.attempts.filter((to) => to === "praticien1@exemple.fr")).toHaveLength(SEND_RETRIES + 1);
    expect(handle.log.map((row) => row.siteId)).toEqual(["site-2"]);
    // Journal : le site et le type d'erreur, jamais l'adresse
    const logged = error.mock.calls.flat().join("\n");
    expect(logged).toBe("[notifications] e-mail hebdomadaire du site site-1 non envoyé (MailTransientError 503)");
    // Mardi : le fournisseur répond, seul le site manquant reçoit son e-mail
    const up = captureMail();
    expect(await sendWeeklyContentDigests(TUESDAY, { mail: up.provider, env: ENV, sleep })).toEqual({ task: "weekly-content-digests", processed: 1, status: "ok" });
    expect(up.sent.map((m) => m.to)).toEqual(["praticien1@exemple.fr"]);
    expect(handle.log.map((row) => row.siteId).sort()).toEqual(["site-1", "site-2"]);
  });

  it("fournisseur en panne : le passage s'arrête après quelques sites en échec d'affilée, la tâche est en erreur, rien n'est journalisé", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const accounts = Array.from({ length: 40 }, (_, i) => account(i + 1));
    const handle = notificationDb({ accounts, social: accounts.map((a) => socialPost(a.siteId)) });
    const mail = captureMail({ "*": Infinity }, 500);
    expect(await sendWeeklyContentDigests(MONDAY, { mail: mail.provider, env: ENV, sleep })).toEqual({ task: "weekly-content-digests", processed: 0, status: "error", failed: SEND_FAILURE_BREAKER, error: "MailTransientError 500" });
    expect(mail.attempts).toHaveLength(SEND_FAILURE_BREAKER * (SEND_RETRIES + 1));
    expect(handle.log).toEqual([]);
  });

  it("premier destinataire servi, second en échec : la réservation reste (jamais de doublon au rattrapage)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const handle = notificationDb({ accounts: [account(1, { recipients: [{ id: "u1", email: "a@exemple.fr", name: "Anne" }, { id: "u2", email: "b@exemple.fr", name: "Bruno" }] })], social: [socialPost("site-1")] });
    const mail = captureMail({ "b@exemple.fr": Infinity });
    expect(await sendWeeklyContentDigests(MONDAY, { mail: mail.provider, env: ENV, sleep })).toEqual({ task: "weekly-content-digests", processed: 1, status: "ok" });
    expect(handle.log).toHaveLength(1);
    expect(handle.log[0]).toMatchObject({ sent: true });
    const retry = captureMail();
    expect(await sendWeeklyContentDigests(TUESDAY, { mail: retry.provider, env: ENV, sleep })).toMatchObject({ processed: 0 });
    expect(retry.sent).toEqual([]);
  });

  it("échéance dépassée : aucun site n'est entamé, le rattrapage reprendra", async () => {
    const handle = notificationDb({ accounts: [account(1)], social: [socialPost("site-1")] });
    const mail = captureMail();
    expect(await sendWeeklyContentDigests(MONDAY, { mail: mail.provider, env: ENV, sleep, deadline: new Date(Date.now() - 1) })).toEqual({ task: "weekly-content-digests", processed: 0, status: "ok" });
    expect(mail.attempts).toEqual([]);
    expect(handle.log).toEqual([]);
  });

  it("sans fournisseur réel (mock) : journalisé avec `sent = false`, sans attente entre les sites", async () => {
    const handle = notificationDb({ accounts: [account(1), account(2)], social: [socialPost("site-1"), socialPost("site-2")] });
    const mock: MailProvider = { mode: "mock", send: async () => ({ sent: false }) };
    expect(await sendWeeklyContentDigests(MONDAY, { mail: mock, env: ENV, sleep })).toEqual({ task: "weekly-content-digests", processed: 2, status: "ok" });
    expect(handle.log.map((row) => row.sent)).toEqual([false, false]);
    expect(waits).toEqual([]);
  });
});

describe("sendMonthReminders : passages d'envoi", () => {
  const sleep = async () => {};

  afterEach(() => {
    state.db = null;
    vi.restoreAllMocks();
  });

  it("le 25 : les sites dont le mois suivant est vide ; rattrapage le 26 pour ceux que le 25 n'a pas servis ; plus rien le 29", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const handle = notificationDb({
      accounts: [account(1), account(2), account(3)],
      // Le site 3 a déjà préparé novembre (réseaux sociaux et fiche Google)
      social: [socialPost("site-3", "2026-11-10")],
      google: [{ ...socialPost("site-3", "2026-11-12"), id: "g3" }],
    });
    const down = captureMail({ "praticien2@exemple.fr": Infinity });
    expect(await sendMonthReminders(new Date("2026-10-25T06:00:00Z"), { mail: down.provider, env: ENV, sleep })).toEqual({ task: "month-reminders", processed: 1, status: "ok", failed: 1 });
    expect(down.sent.map((m) => m.to)).toEqual(["praticien1@exemple.fr"]);
    expect(down.sent[0]!.subject).toBe("Préparez votre mois de novembre 2026");
    expect(handle.log.map((row) => [row.siteId, row.kind, row.periodKey])).toEqual([["site-1", MONTH_REMINDER_KIND, "2026-11"]]);

    const up = captureMail();
    expect(await sendMonthReminders(new Date("2026-10-26T06:00:00Z"), { mail: up.provider, env: ENV, sleep })).toEqual({ task: "month-reminders", processed: 1, status: "ok" });
    expect(up.sent.map((m) => m.to)).toEqual(["praticien2@exemple.fr"]);
    expect(await sendMonthReminders(new Date("2026-10-29T06:00:00Z"), { mail: up.provider, env: ENV, sleep })).toEqual({ task: "month-reminders", processed: 0, status: "ok" });
    expect(up.sent).toHaveLength(1);
  });

  it("tout le parc est parcouru : plus de coupe à 1 000 sites", async () => {
    const accounts = Array.from({ length: 1_020 }, (_, i) => account(i + 1));
    const handle = notificationDb({ accounts });
    const mail = captureMail();
    expect(await sendMonthReminders(new Date("2026-10-25T06:00:00Z"), { mail: mail.provider, env: ENV, sleep })).toEqual({ task: "month-reminders", processed: 1_020, status: "ok" });
    expect(handle.log).toHaveLength(1_020);
  }, 120_000);
});
