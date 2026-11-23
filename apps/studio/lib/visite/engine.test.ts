import { describe, expect, it } from "vitest";
import {
  COMPACT_WIDTH,
  MAX_SNOOZES,
  TOUR_IDS,
  frenchSpacing,
  holeRect,
  isTourId,
  localSeenKey,
  parseSeenList,
  placeCard,
  playableSteps,
  seenFromKeys,
  shouldAutoStart,
  snoozeOutcome,
  stepAfter,
  stepBefore,
  tourIdFromKey,
  tourKey,
  worthPlaying,
  type AutoStartInput,
  type TourStep,
} from "./engine";
import { TOURS, tourForPath } from "./tours";

describe("clés de l'état « déjà vu »", () => {
  it("préfixe chaque visite, et relit sa propre clé", () => {
    for (const id of TOUR_IDS) {
      expect(tourKey(id)).toBe(`tour:${id}`);
      expect(tourIdFromKey(tourKey(id))).toBe(id);
    }
  });

  it("ignore les lignes historiques de `onboarding_tasks`", () => {
    // Tâches de démonstration, marque des formules : aucune n'est une visite vue
    for (const key of ["guided_tour", "connect_google", "verify_pages", "publish_site", "activate_blog", "formulas_split", "tour:inconnue", "tour:", "accueil"]) {
      expect(tourIdFromKey(key)).toBeNull();
    }
  });

  it("ne garde que les visites connues, sans doublon, dans l'ordre de la navigation", () => {
    expect(seenFromKeys(["tour:meta-ads", "verify_pages", "tour:accueil", "tour:accueil", "tour:xyz"])).toEqual(["accueil", "meta-ads"]);
    expect(seenFromKeys([])).toEqual([]);
  });

  it("sépare le repli local par site", () => {
    expect(localSeenKey("site-a")).not.toBe(localSeenKey("site-b"));
  });

  it("lit une liste enregistrée, et écarte tout ce qui n'en est pas une", () => {
    expect(parseSeenList('["publications","accueil","autre",3]')).toEqual(["accueil", "publications"]);
    expect(parseSeenList("pas du json")).toEqual([]);
    expect(parseSeenList('{"accueil":true}')).toEqual([]);
    expect(parseSeenList(null)).toEqual([]);
  });

  it("reconnaît un identifiant de visite", () => {
    expect(isTourId("accueil")).toBe(true);
    expect(isTourId("Accueil")).toBe(false);
    expect(isTourId(undefined)).toBe(false);
  });
});

describe("étapes jouables", () => {
  const steps: TourStep[] = [
    { id: "a", target: "#a", title: "A", body: "a" },
    { id: "b", target: ["#b-ordinateur", "#b-telephone"], title: "B", body: "b", fallbackNote: "Sur téléphone, dans « Plus »." },
    { id: "c", target: "#c", title: "C", body: "c" },
    { id: "fin", title: "Fin", body: "fin" },
  ];

  it("passe l'étape dont la cible n'est pas à l'écran", () => {
    const played = playableSteps(steps, (selector) => selector === "#a" || selector === "#b-ordinateur");
    expect(played.map((step) => step.id)).toEqual(["a", "b", "fin"]);
  });

  it("retient la première cible à l'écran, sans précision", () => {
    const played = playableSteps(steps, () => true);
    expect(played[1]).toMatchObject({ selector: "#b-ordinateur", note: null });
  });

  it("se replie sur la cible suivante, avec sa précision", () => {
    const played = playableSteps(steps, (selector) => selector !== "#b-ordinateur");
    expect(played[1]).toMatchObject({ selector: "#b-telephone", note: "Sur téléphone, dans « Plus »." });
  });

  it("garde toujours une étape sans cible (carte centrée)", () => {
    const played = playableSteps(steps, () => false);
    expect(played).toEqual([{ id: "fin", selector: null, title: "Fin", body: "fin", note: null }]);
  });

  it("ne vaut d'être jouée que si elle montre quelque chose", () => {
    expect(worthPlaying(playableSteps(steps, () => false))).toBe(false);
    expect(worthPlaying(playableSteps(steps, (selector) => selector === "#c"))).toBe(true);
    expect(worthPlaying([])).toBe(false);
  });
});

describe("typographie des textes", () => {
  it("lie les guillemets et la ponctuation haute à leur mot", () => {
    expect(frenchSpacing("Sur téléphone, dans « Plus ».")).toBe("Sur téléphone, dans « Plus ».");
    expect(frenchSpacing("Vous avez déjà un site ?")).toBe("Vous avez déjà un site ?");
    expect(frenchSpacing("Google Ads et Meta Ads : Harmony prépare.")).toBe("Google Ads et Meta Ads : Harmony prépare.");
  });

  it("laisse intact un texte sans ponctuation haute", () => {
    expect(frenchSpacing("Votre prochaine étape")).toBe("Votre prochaine étape");
  });
});

describe("enchaînement des étapes", () => {
  it("avance jusqu'à la dernière, puis termine", () => {
    expect(stepAfter(0, 3)).toBe(1);
    expect(stepAfter(1, 3)).toBe(2);
    expect(stepAfter(2, 3)).toBeNull();
    expect(stepAfter(0, 1)).toBeNull();
  });

  it("recule jusqu'à la première, pas au-delà", () => {
    expect(stepBefore(2)).toBe(1);
    expect(stepBefore(1)).toBe(0);
    expect(stepBefore(0)).toBeNull();
  });
});

describe("lancement automatique", () => {
  const base: AutoStartInput = { tour: "accueil", seenServer: [], seenLocal: [], support: false, modalOpen: false, activeTour: null, framed: false, snoozed: false };

  it("propose une visite jamais vue", () => {
    expect(shouldAutoStart(base)).toBe(true);
  });

  it("fait passer la visite d'accueil d'abord : celle d'un espace attend qu'elle ait été vue", () => {
    expect(shouldAutoStart({ ...base, tour: "publications" })).toBe(false);
    expect(shouldAutoStart({ ...base, tour: "publications", seenServer: ["accueil"] })).toBe(true);
    expect(shouldAutoStart({ ...base, tour: "editeur", seenLocal: ["accueil"] })).toBe(true);
    expect(shouldAutoStart({ ...base, tour: "publications", seenServer: ["accueil", "publications"] })).toBe(false);
  });

  it("ne repropose pas une visite vue, en base ou sur ce navigateur", () => {
    expect(shouldAutoStart({ ...base, seenServer: ["accueil"] })).toBe(false);
    expect(shouldAutoStart({ ...base, seenLocal: ["accueil"] })).toBe(false);
    // Une autre visite vue ne compte pas
    expect(shouldAutoStart({ ...base, seenServer: ["mon-site"], seenLocal: ["publications"] })).toBe(true);
    // Refus définitif : toutes sont notées vues, plus aucune ne se propose
    for (const tour of TOUR_IDS) expect(shouldAutoStart({ ...base, tour, seenServer: TOUR_IDS })).toBe(false);
  });

  it("ne propose rien à l'équipe en mode support", () => {
    expect(shouldAutoStart({ ...base, support: true })).toBe(false);
  });

  it("ne se lance ni sous une fenêtre, ni pendant une autre visite, ni dans une iframe", () => {
    expect(shouldAutoStart({ ...base, modalOpen: true })).toBe(false);
    expect(shouldAutoStart({ ...base, activeTour: "mon-site" })).toBe(false);
    expect(shouldAutoStart({ ...base, framed: true })).toBe(false);
  });

  it("s'abstient quand l'état n'a pas pu être lu", () => {
    expect(shouldAutoStart({ ...base, seenServer: null })).toBe(false);
  });

  it("respecte « Plus tard » pour la session, puis renonce à toutes les visites au deuxième report", () => {
    expect(shouldAutoStart({ ...base, snoozed: true })).toBe(false);
    expect(snoozeOutcome(0)).toEqual({ snoozes: 1, dismissAll: false });
    expect(snoozeOutcome(1)).toEqual({ snoozes: 2, dismissAll: true });
    expect(snoozeOutcome(MAX_SNOOZES + 3).dismissAll).toBe(true);
    expect(snoozeOutcome(-4)).toEqual({ snoozes: 1, dismissAll: false });
  });
});

describe("découpe autour de la cible", () => {
  const viewport = { width: 390, height: 844 };

  it("élargit la cible de la marge", () => {
    expect(holeRect({ top: 100, left: 50, width: 200, height: 40 }, viewport, 6)).toEqual({ top: 94, left: 44, width: 212, height: 52 });
  });

  it("reste dans la fenêtre pour une cible collée au bord", () => {
    // La barre basse du téléphone : toute la largeur, en bas de l'écran
    expect(holeRect({ top: 780, left: 0, width: 390, height: 64 }, viewport, 6)).toEqual({ top: 774, left: 0, width: 390, height: 70 });
  });
});

describe("placement de la carte", () => {
  const phone = { width: 390, height: 844 };
  const desktop = { width: 1440, height: 900 };
  const sheet = { width: 366, height: 240 };
  const card = { width: 376, height: 240 };

  /** La carte tient dans la fenêtre, marges comprises. */
  function inside(place: { top: number; left: number }, size: { width: number; height: number }, viewport: { width: number; height: number }) {
    expect(place.left).toBeGreaterThanOrEqual(12);
    expect(place.top).toBeGreaterThanOrEqual(12);
    expect(place.left + size.width).toBeLessThanOrEqual(viewport.width - 12);
    expect(place.top + size.height).toBeLessThanOrEqual(viewport.height - 12);
  }

  it("centre la carte sans cible", () => {
    const place = placeCard({ target: null, viewport: phone, card: sheet });
    expect(place.side).toBe("center");
    expect(place.left).toBe(12);
    expect(place.top).toBe((844 - 240) / 2);
  });

  it("téléphone : sous une cible du haut de l'écran", () => {
    const target = { top: 120, left: 16, width: 358, height: 160 };
    const place = placeCard({ target, viewport: phone, card: sheet });
    expect(place.side).toBe("bottom");
    expect(place.top).toBe(120 + 160 + 14);
    inside(place, sheet, phone);
  });

  it("téléphone : au-dessus de la barre basse, sans la recouvrir", () => {
    const target = { top: 774, left: 0, width: 390, height: 70 };
    const place = placeCard({ target, viewport: phone, card: sheet });
    expect(place.side).toBe("top");
    expect(place.top + sheet.height).toBeLessThanOrEqual(target.top - 14);
    inside(place, sheet, phone);
  });

  it("téléphone : en bas de l'écran devant une cible plus haute que lui, son début restant lisible", () => {
    for (const tall of [{ top: 88, left: 12, width: 366, height: 700 }, { top: 88, left: 12, width: 366, height: 1400 }]) {
      const place = placeCard({ target: tall, viewport: phone, card: sheet });
      inside(place, sheet, phone);
      expect(place.side).toBe("bottom");
      expect(place.top).toBe(844 - 240 - 12);
    }
  });

  it("téléphone : en haut de l'écran quand seule la fin d'une cible haute est visible", () => {
    const place = placeCard({ target: { top: -600, left: 12, width: 366, height: 1300 }, viewport: phone, card: sheet });
    expect(place.side).toBe("top");
    expect(place.top).toBe(12);
  });

  it("ordinateur : à droite d'une entrée de la barre latérale", () => {
    const target = { top: 300, left: 12, width: 256, height: 44 };
    const place = placeCard({ target, viewport: desktop, card });
    expect(place.side).toBe("right");
    expect(place.left).toBe(12 + 256 + 14);
    inside(place, card, desktop);
  });

  it("ordinateur : sous une rangée large (onglets)", () => {
    const target = { top: 240, left: 320, width: 1080, height: 48 };
    const place = placeCard({ target, viewport: desktop, card });
    expect(place.side).toBe("bottom");
    expect(place.left).toBe(320);
    inside(place, card, desktop);
  });

  it("ordinateur : à gauche d'une carte étroite du bord droit", () => {
    const target = { top: 120, left: 1010, width: 400, height: 700 };
    const place = placeCard({ target, viewport: desktop, card });
    expect(place.side).toBe("left");
    expect(place.left + card.width).toBeLessThanOrEqual(target.left - 14);
    inside(place, card, desktop);
  });

  it("ne sort jamais de la fenêtre, où que soit la cible", () => {
    for (const viewport of [{ width: 320, height: 568 }, phone, { width: 768, height: 1024 }, desktop]) {
      const size = viewport.width < COMPACT_WIDTH ? { width: viewport.width - 24, height: 260 } : card;
      for (const target of [
        { top: -40, left: -10, width: 80, height: 60 },
        { top: viewport.height - 30, left: viewport.width - 60, width: 120, height: 90 },
        { top: 0, left: 0, width: viewport.width, height: viewport.height },
        { top: viewport.height / 2, left: viewport.width / 2, width: 4, height: 4 },
      ]) {
        inside(placeCard({ target, viewport, card: size }), size, viewport);
      }
    }
  });
});

describe("registre des visites", () => {
  it("définit chaque visite sous son identifiant, avec des étapes aux identifiants distincts", () => {
    for (const id of TOUR_IDS) {
      const tour = TOURS[id];
      expect(tour.id).toBe(id);
      expect(tour.steps.length).toBeGreaterThanOrEqual(2);
      const ids = tour.steps.map((step) => step.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("garde chaque visite courte : huit étapes au plus pour l'accueil, cinq pour un espace", () => {
    expect(TOURS.accueil.steps.length).toBeLessThanOrEqual(8);
    for (const id of TOUR_IDS) {
      if (id !== "accueil") expect(TOURS[id].steps.length).toBeLessThanOrEqual(5);
    }
  });

  it("écrit des textes courts, sans majuscules criardes ni flèches décoratives", () => {
    for (const tour of Object.values(TOURS)) {
      for (const text of [tour.label, tour.intro?.title, tour.intro?.body, ...tour.steps.flatMap((step) => [step.title, step.body, step.fallbackNote])]) {
        if (!text) continue;
        expect(text.length).toBeLessThanOrEqual(170);
        expect(text).not.toMatch(/[→➜➔›]/);
        expect(text).not.toMatch(/\b[A-ZÉÈÀ]{4,}\b/);
        expect(text).not.toMatch(/!/);
      }
    }
  });

  it("n'offre une fenêtre de bienvenue qu'à la visite d'accueil", () => {
    expect(TOURS.accueil.intro).toBeDefined();
    for (const id of TOUR_IDS) {
      if (id !== "accueil") expect(TOURS[id].intro).toBeUndefined();
    }
  });

  it("retrouve la visite d'une page", () => {
    expect(tourForPath("/")).toBe("accueil");
    expect(tourForPath("/meta-ads")).toBe("meta-ads");
    expect(tourForPath("/editor")).toBe("editeur");
    expect(tourForPath("/compte")).toBeNull();
  });
});
