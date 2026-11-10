import { describe, expect, it } from "vitest";
import { META_GALLERY_DEFAULT_FILTERS, type MetaAdMedia, type MetaLibraryEntry, type MetaMarketAd } from "@theralys/shared";
import {
  AD_HOOK_MAX,
  adDiffusion,
  adHook,
  audienceLabel,
  dismissedNote,
  filteredNote,
  filtersAreDefault,
  formatAdDate,
  galleryCountLabel,
  galleryFormatOf,
  httpUrl,
  libraryGalleryAds,
  metaVideoSrc,
  pageInitials,
  platformsLabel,
  posterTone,
  rankLabel,
  scopeCounters,
  selectionLabel,
  visualsNote,
  watchGalleryAds,
  zonesLabel,
  type LibraryOverrides,
} from "./market-view";

function ad(overrides: Partial<MetaMarketAd> = {}): MetaMarketAd {
  return {
    id: "1000520564083",
    pageId: "101",
    pageName: "Cabinet du Bien-Être Albi",
    bodies: ["Et si vous preniez un moment pour vous ? Au cabinet, chaque séance commence par un temps d'écoute."],
    titles: ["Sophrologue à Albi"],
    descriptions: ["Première séance sur rendez-vous"],
    captions: ["exemple.fr"],
    libraryUrl: "https://www.facebook.com/ads/library/?id=1000520564083",
    startedAt: "2026-03-20T09:00:00.000Z",
    stoppedAt: null,
    platforms: ["facebook", "instagram", "messenger"],
    languages: ["fr"],
    euTotalReach: 42_687,
    targetAges: "25-54",
    targetGender: "Women",
    targetLocations: [{ name: "Albi", type: "city", excluded: false }],
    payer: null,
    scope: "ville",
    active: true,
    runningDays: 209,
    signal: "fort",
    score: 9.1,
    matchedTerms: [],
    rank: 25,
    rankTotal: 111,
    ...overrides,
  };
}

function media(overrides: Partial<MetaAdMedia> = {}): MetaAdMedia {
  return {
    version: 1,
    format: "image",
    variants: false,
    items: [{ kind: "image", posterUrl: "https://stockage.exemple/a.jpg", sourceImageUrl: null, sourceVideoUrl: null }],
    avatarUrl: null,
    ctaText: null,
    linkUrl: null,
    pageCategories: [],
    pageLikes: null,
    sourceExpiresAt: null,
    fetchedAt: "2026-11-10T08:00:00.000Z",
    source: "mock",
    ...overrides,
  };
}

function entry(source: MetaMarketAd, overrides: Partial<MetaLibraryEntry> = {}): MetaLibraryEntry {
  return { adId: source.id, status: "kept", pageName: source.pageName, ad: source, media: media({ format: "video" }), savedAt: "2026-11-01T10:00:00.000Z", ...overrides };
}

const mark = (value: "kept" | "dismissed" | "none", at = "2026-11-10T09:00:00.000Z") => ({ mark: value, at, token: 1 });

describe("adHook", () => {
  it("garde la première phrase, ponctuation française comprise", () => {
    expect(adHook(ad())).toBe("Et si vous preniez un moment pour vous ?");
  });

  it("prend la première ligne non vide et ignore les suivantes", () => {
    expect(adHook(ad({ bodies: ["\n  Stress, sommeil, émotions : retrouvez votre calme\nPremière séance à 45 €."] }))).toBe("Stress, sommeil, émotions : retrouvez votre calme");
  });

  it("ajoute la phrase suivante quand la première n'est qu'une amorce", () => {
    expect(adHook(ad({ bodies: ["Bonjour ! Je vous reçois au cabinet d'Albi. Sur rendez-vous."] }))).toBe("Bonjour ! Je vous reçois au cabinet d'Albi.");
  });

  it("ne coupe ni un prix ni une adresse de site", () => {
    expect(adHook(ad({ bodies: ["Séance découverte à 45.50 € sur cabinet-albi.fr dès lundi. Places limitées."] }))).toBe("Séance découverte à 45.50 € sur cabinet-albi.fr dès lundi.");
  });

  it("coupe au mot à la longueur maximale", () => {
    const long = "Un accompagnement pas à pas pour apprendre à relâcher les tensions du quotidien et retrouver un sommeil réparateur sans médicament ni contrainte";
    const hook = adHook(ad({ bodies: [long] }));
    expect(hook.length).toBeLessThanOrEqual(AD_HOOK_MAX);
    expect(hook.endsWith("…")).toBe(true);
    expect(long.startsWith(hook.slice(0, -1))).toBe(true);
    expect(hook).not.toMatch(/\s…$/);
  });

  it("se rabat sur le titre puis la description, et rend une chaîne vide sans texte", () => {
    expect(adHook(ad({ bodies: ["  "], titles: ["Sophrologue à Albi"] }))).toBe("Sophrologue à Albi");
    expect(adHook(ad({ bodies: [], titles: [], descriptions: ["Première séance sur rendez-vous"] }))).toBe("Première séance sur rendez-vous");
    expect(adHook(ad({ bodies: [], titles: [], descriptions: [] }))).toBe("");
  });
});

describe("textes d'une annonce", () => {
  it("formate la date au jour civil de Paris", () => {
    expect(formatAdDate("2026-03-20T09:00:00.000Z")).toBe("20/03/2026");
    expect(formatAdDate("2026-03-20T23:30:00.000Z")).toBe("21/03/2026");
    expect(formatAdDate(null)).toBeNull();
    expect(formatAdDate("pas une date")).toBeNull();
  });

  it("limite les plateformes à deux puis compte les suivantes", () => {
    expect(platformsLabel(["facebook", "instagram"])).toBe("Facebook, Instagram");
    expect(platformsLabel(["facebook", "instagram", "messenger", "audience_network"])).toBe("Facebook, Instagram +2");
    expect(platformsLabel(["facebook", "facebook", "whatsapp"])).toBe("Facebook, whatsapp");
    expect(platformsLabel(["facebook", "instagram", "threads"], 5)).toBe("Facebook, Instagram, Threads");
    expect(platformsLabel([])).toBeNull();
  });

  it("décrit l'audience et les zones comme la liste d'origine", () => {
    expect(audienceLabel(ad())).toBe("25-54 ans · femmes");
    expect(audienceLabel(ad({ targetAges: null, targetGender: "All" }))).toBe("tous");
    expect(audienceLabel(ad({ targetAges: null, targetGender: null }))).toBeNull();
    const locations = ["Albi", "Castres", "Gaillac", "Carmaux", "Lavaur", "Graulhet"].map((name) => ({ name, type: "city", excluded: false }));
    expect(zonesLabel(ad({ targetLocations: [...locations, { name: "Toulouse", type: "city", excluded: true }] }))).toBe("Albi, Castres, Gaillac, Carmaux (+2)");
    expect(zonesLabel(ad({ targetLocations: [{ name: "Toulouse", type: "city", excluded: true }] }))).toBeNull();
  });

  it("distingue diffusion en cours, arrêtée et inconnue", () => {
    expect(adDiffusion(ad())).toEqual({ state: "active", short: "209\u00a0j", long: "En diffusion depuis 209\u00a0j" });
    expect(adDiffusion(ad({ active: false, runningDays: 42 }))).toEqual({ state: "stopped", short: "42\u00a0j · arrêtée", long: "Diffusée 42\u00a0j, arrêtée" });
    expect(adDiffusion(ad({ runningDays: null })).short).toBe("—");
    expect(adDiffusion(ad({ runningDays: null })).state).toBe("unknown");
  });

  it("écrit le rang et la part devancée", () => {
    expect(rankLabel(ad())).toBe("#25 /111 · top 23\u00a0%");
    expect(rankLabel(ad({ rank: 1, rankTotal: 64 }))).toBe("#1 /64 · top 2\u00a0%");
    expect(rankLabel(ad({ rank: 3, rankTotal: undefined }))).toBe("#3");
    expect(rankLabel(ad({ rank: undefined, rankTotal: undefined }))).toBeNull();
  });

  it("tire des initiales sans les mots de liaison", () => {
    expect(pageInitials("Cabinet du Bien-Être Albi")).toBe("CB");
    expect(pageInitials("L'Atelier de Élodie")).toBe("AÉ");
    expect(pageInitials("sophro & co")).toBe("SC");
    expect(pageInitials("Zen")).toBe("Z");
    expect(pageInitials("  ")).toBe("?");
  });

  it("donne toujours la même teinte à une annonce", () => {
    expect(posterTone("1000520564083")).toEqual(posterTone("1000520564083"));
    expect(new Set(["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"].map((id) => posterTone(id).from)).size).toBeGreaterThan(2);
  });

  it("n'accepte que des liens http(s)", () => {
    expect(httpUrl("https://exemple.fr/rdv?x=1")).toBe("https://exemple.fr/rdv?x=1");
    expect(httpUrl("javascript:alert(1)")).toBeNull();
    expect(httpUrl("exemple.fr")).toBeNull();
    expect(httpUrl(null)).toBeNull();
  });

  it("construit l'adresse de lecture d'une vidéo", () => {
    expect(metaVideoSrc("1000520564083", 2)).toBe("/api/meta-ads/media/1000520564083/video?i=2");
  });
});

describe("phrases de l'en-tête et de la barre d'outils", () => {
  it("détaille les annonces écartées sans les catégories vides", () => {
    expect(filteredNote({ commerce: 180, formation: 95, autre: 137 })).toBe(
      "412 annonces écartées d'office : 180 commerciales (produits, applications, assurances), 95 formations ou services aux praticiens, 137 hors sujet.",
    );
    expect(filteredNote({ commerce: 10, formation: 0, autre: 17 })).toBe("27 annonces écartées d'office : 10 commerciales (produits, applications, assurances), 17 hors sujet.");
    expect(filteredNote({ commerce: 0, formation: 1, autre: 0 })).toBe("1 annonce écartée d'office : 1 formation ou service aux praticiens.");
    expect(filteredNote({ commerce: 1, formation: 0, autre: 0 })).toBe("1 annonce écartée d'office : 1 commerciale (produits, applications, assurances).");
    expect(filteredNote({ commerce: 0, formation: 0, autre: 0 })).toBeNull();
    expect(filteredNote(undefined)).toBeNull();
  });

  it("accorde les autres phrases", () => {
    expect(dismissedNote(0)).toBeNull();
    expect(dismissedNote(1)).toBe("1 annonce que vous avez supprimée n'est plus proposée.");
    expect(dismissedNote(3)).toBe("3 annonces que vous avez supprimées ne sont plus proposées.");
    expect(visualsNote(1)).toBe("Les visuels de 1 annonce ne sont pas encore affichés.");
    expect(visualsNote(12)).toBe("Les visuels de 12 annonces ne sont pas encore affichés.");
    expect(galleryCountLabel(60, 60)).toBe("60 annonces");
    expect(galleryCountLabel(37, 60)).toBe("37 annonces sur 60");
    expect(galleryCountLabel(1, 1)).toBe("1 annonce");
    expect(galleryCountLabel(0, 60)).toBe("0 annonce sur 60");
    expect(selectionLabel(1)).toBe("1 sélectionnée");
    expect(selectionLabel(4)).toBe("4 sélectionnées");
  });

  it("reconnaît les filtres par défaut", () => {
    expect(filtersAreDefault(META_GALLERY_DEFAULT_FILTERS)).toBe(true);
    expect(filtersAreDefault({ ...META_GALLERY_DEFAULT_FILTERS, query: "   " })).toBe(true);
    expect(filtersAreDefault({ ...META_GALLERY_DEFAULT_FILTERS, query: "albi" })).toBe(false);
    expect(filtersAreDefault({ ...META_GALLERY_DEFAULT_FILTERS, sort: "recent" })).toBe(false);
    expect(filtersAreDefault({ ...META_GALLERY_DEFAULT_FILTERS, activeOnly: true })).toBe(false);
  });

  it("compte chaque zone qui a des annonces repérées ou conservées, au-delà de la zone retenue", () => {
    const market = {
      counts: { ville: 30, departement: 0, region: 17, france: 5 },
      ads: [ad({ id: "1" }), ad({ id: "2" }), ad({ id: "3", scope: "region" }), ad({ id: "4", scope: "france" })],
    };
    expect(scopeCounters(market)).toEqual([
      { scope: "ville", label: "Autour de vous", spotted: 30, kept: 2 },
      { scope: "region", label: "Votre région", spotted: 17, kept: 1 },
      { scope: "france", label: "Autres zones et France", spotted: 5, kept: 1 },
    ]);
    expect(scopeCounters({ counts: { ville: 0, departement: 0, region: 0, france: 0 }, ads: [ad({ scope: "departement" })] }).map((c) => c.scope)).toEqual(["departement"]);
  });
});

describe("galerie : état serveur et gestes en attente", () => {
  const a = ad({ id: "11111" });
  const b = ad({ id: "22222", pageName: "Cabinet Morel" });
  const c = ad({ id: "33333", pageName: "Cabinet Fontaine" });
  const mediaById = { "11111": media(), "22222": media({ format: "carousel" }) };

  it("retire les annonces supprimées et marque les gardées", () => {
    const view = watchGalleryAds([a, b, c], mediaById, { kept: [entry(b)], dismissedIds: ["33333"] }, {});
    expect(view.map((x) => [x.id, x.kept])).toEqual([["11111", false], ["22222", true]]);
    expect(view[0]!.media?.format).toBe("image");
    expect(galleryFormatOf(view[0]!)).toBe("image");
    expect(galleryFormatOf({ media: null })).toBe("sans");
    expect(galleryFormatOf({ media: media({ items: [] }) })).toBe("sans");
  });

  it("applique les gestes en attente par-dessus l'état du serveur", () => {
    const overrides: LibraryOverrides = { "11111": mark("kept"), "22222": mark("dismissed"), "33333": mark("none") };
    const view = watchGalleryAds([a, b, c], mediaById, { kept: [entry(b)], dismissedIds: ["33333"] }, overrides);
    expect(view.map((x) => [x.id, x.kept])).toEqual([["11111", true], ["33333", false]]);
  });

  it("compose la bibliothèque : exemples conservés, retraits en attente, gardes en attente", () => {
    const gone = ad({ id: "99999", pageName: "Cabinet Disparu" });
    const library = { kept: [entry(b), entry(gone, { media: null })], dismissedIds: [] };
    const base = libraryGalleryAds([a, b, c], mediaById, library, {});
    expect(base.map((x) => [x.id, x.inWatch, x.savedAt])).toEqual([["22222", true, "2026-11-01T10:00:00.000Z"], ["99999", false, "2026-11-01T10:00:00.000Z"]]);
    // Visuels conservés avec l'exemple, pas ceux de la veille
    expect(base[0]!.media?.format).toBe("video");
    expect(base[1]!.media).toBeNull();
    expect(base.every((x) => x.kept)).toBe(true);

    const pending = libraryGalleryAds([a, b, c], mediaById, library, { "11111": mark("kept", "2026-11-10T09:00:00.000Z"), "22222": mark("none"), "99999": mark("dismissed"), "44444": mark("kept") });
    expect(pending.map((x) => [x.id, x.savedAt, x.inWatch])).toEqual([["11111", "2026-11-10T09:00:00.000Z", true]]);
    expect(pending[0]!.media?.format).toBe("image");
  });

  it("ne duplique pas un exemple déjà gardé que le praticien garde à nouveau", () => {
    const view = libraryGalleryAds([a, b], mediaById, { kept: [entry(b)], dismissedIds: [] }, { "22222": mark("kept") });
    expect(view.map((x) => x.id)).toEqual(["22222"]);
  });
});
