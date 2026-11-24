import { describe, expect, it } from "vitest";
import {
  FEEDBACK_KINDS,
  FEEDBACK_KIND_LABELS,
  FEEDBACK_KIND_PROMPTS,
  FEEDBACK_MESSAGE_MAX,
  FEEDBACK_MESSAGE_MIN,
  FEEDBACK_STATUSES,
  FEEDBACK_STATUS_LABELS,
  FEEDBACK_TOPICS,
  FEEDBACK_TOPIC_LABELS,
  checkFeedback,
  feedbackPagePath,
  feedbackTopicForPath,
  isFeedbackStatus,
  normalizeFeedbackMessage,
} from "./feedback";

const MESSAGE = "J'aimerais pouvoir dupliquer un contenu du mois précédent.";

describe("vocabulaire des avis", () => {
  it("chaque nature, chaque outil et chaque état a son libellé ; chaque nature a sa question", () => {
    for (const kind of FEEDBACK_KINDS) {
      expect(FEEDBACK_KIND_LABELS[kind]).toBeTruthy();
      expect(FEEDBACK_KIND_PROMPTS[kind]).toMatch(/\?$/);
    }
    for (const topic of FEEDBACK_TOPICS) expect(FEEDBACK_TOPIC_LABELS[topic]).toBeTruthy();
    for (const status of FEEDBACK_STATUSES) expect(FEEDBACK_STATUS_LABELS[status]).toBeTruthy();
    expect(isFeedbackStatus("done")).toBe(true);
    expect(isFeedbackStatus("archived")).toBe(false);
  });
});

describe("texte d'un avis", () => {
  it("fins de ligne unifiées, espaces resserrés, jamais plus d'une ligne vide de suite", () => {
    expect(normalizeFeedbackMessage("  Bonjour,\r\n\r\n\r\n\r\nle   calendrier\test   lent.  \n ")).toBe("Bonjour,\n\nle calendrier est lent.");
  });

  it("caractères de contrôle et invisibles retirés, émojis composés gardés entiers", () => {
    const hidden = String.fromCharCode(0x202e);
    const zeroWidth = String.fromCharCode(0x200b);
    const doctor = `${String.fromCodePoint(0x1f469)}${String.fromCharCode(0x200d)}${String.fromCodePoint(0x2695)}`;
    expect(normalizeFeedbackMessage(`Très${zeroWidth} bien${hidden}${String.fromCharCode(7)} ${doctor}`)).toBe(`Très bien ${doctor}`);
  });
});

describe("page et outil d'un avis", () => {
  it("l'outil présélectionné suit la page ; l'accueil et l'inconnu valent « Harmony en général »", () => {
    expect(feedbackTopicForPath("/")).toBe("general");
    expect(feedbackTopicForPath("/reseaux-sociaux?mois=2026-12")).toBe("reseaux-sociaux");
    expect(feedbackTopicForPath("/fiche-google/avis")).toBe("fiche-google");
    expect(feedbackTopicForPath("/mots-cles")).toBe("publications");
    expect(feedbackTopicForPath("/compte")).toBe("compte");
    expect(feedbackTopicForPath("/general")).toBe("general");
    expect(feedbackTopicForPath("/editor")).toBe("general");
  });

  it("le chemin gardé n'a ni paramètres ni fragment ; tout autre texte est écarté", () => {
    expect(feedbackPagePath("/reseaux-sociaux?post=abc#photo")).toBe("/reseaux-sociaux");
    expect(feedbackPagePath("/")).toBe("/");
    expect(feedbackPagePath("https://exemple.fr/")).toBeNull();
    expect(feedbackPagePath("/<script>")).toBeNull();
    expect(feedbackPagePath(`/${"a".repeat(200)}`)).toBeNull();
    expect(feedbackPagePath(42)).toBeNull();
  });
});

describe("relecture de ce que la fenêtre envoie", () => {
  const base = { kind: "idea", topic: "reseaux-sociaux", message: MESSAGE, rating: 4, contactOk: true, page: "/reseaux-sociaux?mois=2026-12" };

  it("un avis complet est accepté, texte normalisé et page nettoyée", () => {
    expect(checkFeedback({ ...base, message: `  ${MESSAGE}\r\n\r\n\r\nMerci.  ` })).toEqual({
      ok: true,
      value: { kind: "idea", topic: "reseaux-sociaux", message: `${MESSAGE}\n\nMerci.`, rating: 4, contactOk: true, page: "/reseaux-sociaux" },
    });
  });

  it("la note et l'accord de recontact sont facultatifs", () => {
    const result = checkFeedback({ kind: "praise", topic: "general", message: MESSAGE });
    expect(result).toMatchObject({ ok: true, value: { rating: null, contactOk: false, page: null } });
    // Seul `true` vaut accord
    expect(checkFeedback({ ...base, contactOk: "oui" })).toMatchObject({ ok: true, value: { contactOk: false } });
  });

  it("trop court : on demande la situation plutôt qu'un simple mot", () => {
    const result = checkFeedback({ ...base, message: "C'est nul." });
    expect(result).toMatchObject({ ok: false, field: "message" });
    expect(result.ok ? "" : result.error).toMatch(/racontez-nous la situation/);
    // Des espaces ne font pas un avis
    expect(checkFeedback({ ...base, message: " ".repeat(FEEDBACK_MESSAGE_MIN + 10) })).toMatchObject({ ok: false, field: "message" });
  });

  it("trop long : refusé avec la limite", () => {
    expect(checkFeedback({ ...base, message: "a".repeat(FEEDBACK_MESSAGE_MAX) })).toMatchObject({ ok: true });
    expect(checkFeedback({ ...base, message: "a".repeat(FEEDBACK_MESSAGE_MAX + 1) })).toMatchObject({ ok: false, field: "message" });
    expect(checkFeedback({ ...base, message: "a".repeat(FEEDBACK_MESSAGE_MAX * 4) })).toMatchObject({ ok: false, field: "message" });
  });

  it("nature, outil ou note hors liste : refusés", () => {
    expect(checkFeedback({ ...base, kind: "insulte" })).toMatchObject({ ok: false, field: "form" });
    expect(checkFeedback({ ...base, topic: "academie" })).toMatchObject({ ok: false, field: "form" });
    for (const rating of [0, 6, 2.5, "5"]) expect(checkFeedback({ ...base, rating }), String(rating)).toMatchObject({ ok: false, field: "form" });
    expect(checkFeedback(null)).toMatchObject({ ok: false, field: "form" });
    expect(checkFeedback({ ...base, message: 12 })).toMatchObject({ ok: false, field: "message" });
  });
});
