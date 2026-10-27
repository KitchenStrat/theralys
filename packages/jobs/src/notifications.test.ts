import { describe, expect, it } from "vitest";
import {
  DEFAULT_STUDIO_BASE_URL,
  NOTIFICATION_BATCH,
  SEND_SPACING_MS,
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
  isoWeekOf,
  monthLabel,
  nextMonthOf,
  parisDay,
  parisDayOfMonth,
  recipientList,
  renderMonthReminder,
  renderWeeklyDigest,
  socialMonthUrl,
  socialPostUrl,
  studioBaseUrl,
  weekPeriodOf,
  weekRangeLabel,
  type DigestItem,
} from "./notifications";
import { ALL_TICKS } from "./ticks";

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

  it("part le lundi (Europe/Paris) seulement", () => {
    expect(decideWeeklyDigest({ ...base, now: MONDAY })).toMatchObject({ send: true, week: { key: "2026-W45" } });
    expect(decideWeeklyDigest({ ...base, now: new Date("2026-11-03T06:00:00Z") })).toEqual({ send: false, reason: "not_monday" });
    // Dimanche 23 h 30 UTC : déjà lundi à Paris
    expect(decideWeeklyDigest({ ...base, now: new Date("2026-11-01T23:30:00Z") }).send).toBe(true);
    // Lundi 23 h 30 UTC : déjà mardi à Paris
    expect(decideWeeklyDigest({ ...base, now: new Date("2026-11-02T23:30:00Z") })).toEqual({ send: false, reason: "not_monday" });
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

  it("part le 25 (Europe/Paris) seulement", () => {
    expect(decideMonthReminder({ now: the25th, recipients: 1, alreadySent: false, social: empty, google: empty })).toMatchObject({
      send: true,
      month: { key: "2026-11" },
      channels: ["social", "google"],
    });
    expect(decideMonthReminder({ now: new Date("2026-10-24T06:00:00Z"), recipients: 1, alreadySent: false, social: empty, google: empty })).toEqual({
      send: false,
      reason: "not_reminder_day",
    });
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

  it("ticks : e-mails en tête du passage, lot large pour un cron quotidien, envois espacés", () => {
    expect(ALL_TICKS.slice(0, 2).map((t) => t.task)).toEqual(["weekly-content-digests", "month-reminders"]);
    expect(ALL_TICKS.map((t) => t.task)).toContain("scheduled-google-scans");
    expect(NOTIFICATION_BATCH).toBe(1000);
    expect(SEND_SPACING_MS).toBe(500);
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
