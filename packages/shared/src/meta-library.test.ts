import { describe, expect, it } from "vitest";
import { META_MARKET_SCOPES, adScore, metaLibraryUrl, type MetaMarketAd, type MetaMarketScope } from "./meta-ads";
import {
  META_AD_MEDIA_FORMATS,
  META_AD_MEDIA_FORMAT_LABELS,
  META_GALLERY_DEFAULT_FILTERS,
  META_GALLERY_RECENT_DAYS,
  META_GALLERY_SORTS,
  META_GALLERY_SORT_LABELS,
  META_LIBRARY_BULK_MAX,
  META_LIBRARY_KEPT_MAX,
  META_LIBRARY_STATUSES,
  META_LIBRARY_VIDEO_MAX_BYTES,
  META_MARKET_MEDIA_SPARE,
  META_MEDIA_ITEMS_MAX,
  META_MEDIA_LOOKUPS_PER_MONTH,
  META_MEDIA_LOOKUP_COST_USD,
  META_MEDIA_POSTER_WIDTH,
  adIsRecent,
  adIsTrending,
  adNote,
  adTopPercent,
  filterGalleryAds,
  galleryAdsFrom,
  galleryCounts,
  galleryScopes,
  isCommercialPageCategory,
  isMetaCdnUrl,
  metaCdnExpiry,
  metaMediaBadge,
  metaMediaCover,
  metaMediaItemImage,
  metaMediaSourceExpired,
  type MetaAdMedia,
  type MetaAdMediaItem,
  type MetaGalleryAd,
  type MetaGalleryFilters,
  type MetaLibraryEntry,
} from "./meta-library";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const now = new Date("2026-10-26T10:00:00Z");
const HOUR = 3_600_000;
const DAY = 86_400_000;

/** Date ISO `days` jours avant `now`. */
function daysAgo(days: number): string {
  return new Date(now.getTime() - days * DAY).toISOString();
}

/** Date ISO `ms` millisecondes après `now`. */
function fromNow(ms: number): string {
  return new Date(now.getTime() + ms).toISOString();
}

const POSTER = "https://medias.theralys.test/meta/annonce-1.webp";
const SOURCE_IMAGE = "https://scontent.fcdg1-1.fna.fbcdn.net/v/t39.35426-6/annonce-1.jpg?_nc_cat=101&oe=6AF90589";
const SOURCE_VIDEO = "https://video.fcdg1-1.fna.fbcdn.net/v/t42.1790-2/annonce-1.mp4?oe=6AF90589";

function item(extra: Partial<MetaAdMediaItem> = {}): MetaAdMediaItem {
  return { kind: "image", posterUrl: POSTER, sourceImageUrl: SOURCE_IMAGE, sourceVideoUrl: null, ...extra };
}

function media(extra: Partial<MetaAdMedia> = {}): MetaAdMedia {
  return {
    version: 1,
    format: "image",
    variants: false,
    items: [item()],
    avatarUrl: null,
    ctaText: "En savoir plus",
    linkUrl: "https://cabinet-exemple.test/",
    pageCategories: ["Osteopathic Doctor"],
    pageLikes: 120,
    sourceExpiresAt: null,
    fetchedAt: now.toISOString(),
    source: "mock",
    ...extra,
  };
}

function marketAd(id: string, extra: Partial<MetaMarketAd> = {}): MetaMarketAd {
  return {
    id,
    pageId: `page-${id}`,
    pageName: `Cabinet ${id}`,
    bodies: ["Une séance pour souffler."],
    titles: [],
    descriptions: [],
    captions: [],
    libraryUrl: metaLibraryUrl(id),
    startedAt: daysAgo(60),
    stoppedAt: null,
    platforms: ["facebook"],
    languages: ["fr"],
    euTotalReach: 1_000,
    targetAges: null,
    targetGender: null,
    targetLocations: [{ name: "France", type: "countries", excluded: false }],
    payer: null,
    scope: "france",
    active: true,
    runningDays: 60,
    signal: "moyen",
    score: 5,
    matchedTerms: [],
    ...extra,
  };
}

function galleryAd(id: string, extra: Partial<MetaGalleryAd> = {}): MetaGalleryAd {
  return { ...marketAd(id), media: null, kept: false, ...extra };
}

function filters(extra: Partial<MetaGalleryFilters> = {}): MetaGalleryFilters {
  return { ...META_GALLERY_DEFAULT_FILTERS, ...extra };
}

function ids(ads: readonly { id: string }[]): string[] {
  return ads.map((ad) => ad.id);
}

/** Galerie de référence : cinq annonces aux formats, zones, notes et dates tous différents. */
const claire = galleryAd("claire", {
  pageName: "Claire Martin - Ostéopathe",
  bodies: ["Votre ostéopathe vous accueille au cabinet. Prenez rendez-vous en ligne."],
  captions: ["clairemartin-osteopathe.fr"],
  targetLocations: [{ name: "Colomiers, France", type: "CITY", excluded: false }],
  scope: "ville",
  score: 6.2,
  runningDays: 45,
  euTotalReach: 3_000,
  startedAt: daysAgo(45),
  media: media({ format: "image" }),
});
const zenith = galleryAd("zenith", {
  pageName: "Cabinet Zénith",
  bodies: [],
  titles: ["Sophrologie et sommeil"],
  descriptions: ["Séances individuelles à Toulouse"],
  targetLocations: [{ name: "Haute-Garonne, Occitanie", type: "regions", excluded: false }],
  scope: "departement",
  score: 8.1,
  runningDays: 120,
  euTotalReach: 800,
  startedAt: daysAgo(122),
  stoppedAt: daysAgo(2),
  active: false,
  signal: "moyen",
  media: media({ format: "video", items: [item({ kind: "video", sourceVideoUrl: SOURCE_VIDEO })] }),
});
const respire = galleryAd("respire", {
  pageName: "Atelier Respire",
  bodies: ["Massage bien-être : la première séance pour souffler."],
  targetLocations: [{ name: "Occitanie", type: "regions", excluded: false }],
  scope: "region",
  score: 3.4,
  runningDays: 10,
  euTotalReach: 12_000,
  startedAt: daysAgo(10),
  media: media({ format: "carousel", items: [item(), item(), item()] }),
});
const lambert = galleryAd("lambert", {
  pageName: "Hypnose Lambert",
  bodies: ["Arrêt du tabac : séances d'hypnose à distance."],
  scope: "france",
  score: 4.9,
  runningDays: null,
  euTotalReach: null,
  startedAt: null,
  media: null,
});
const canal = galleryAd("canal", {
  pageName: "Yoga du Canal",
  bodies: ["Cours de yoga doux le mardi soir."],
  targetLocations: [{ name: "Toulouse, Occitanie", type: "CITY", excluded: false }],
  scope: "ville",
  score: 2.1,
  runningDays: 3,
  euTotalReach: 150,
  startedAt: daysAgo(3),
  signal: "faible",
  media: media({ format: "image", items: [] }),
});
const gallery: readonly MetaGalleryAd[] = [claire, zenith, respire, lambert, canal];

// ─── Paramètres ──────────────────────────────────────────────────────────────

describe("paramètres de la bibliothèque", () => {
  it("formats, tris et états : chaque valeur a son libellé", () => {
    expect(META_AD_MEDIA_FORMATS).toEqual(["image", "video", "carousel"]);
    expect(Object.keys(META_AD_MEDIA_FORMAT_LABELS).sort()).toEqual([...META_AD_MEDIA_FORMATS].sort());
    expect(META_AD_MEDIA_FORMAT_LABELS).toEqual({ image: "Image", video: "Vidéo", carousel: "Carrousel" });
    expect(META_GALLERY_SORTS).toEqual(["note", "diffusion", "portee", "recent"]);
    expect(Object.keys(META_GALLERY_SORT_LABELS).sort()).toEqual([...META_GALLERY_SORTS].sort());
    for (const sort of META_GALLERY_SORTS) expect(META_GALLERY_SORT_LABELS[sort].length, sort).toBeGreaterThan(0);
    expect(META_LIBRARY_STATUSES).toEqual(["kept", "dismissed"]);
  });

  it("filtres par défaut : aucun filtre, tri par note", () => {
    expect(META_GALLERY_DEFAULT_FILTERS).toEqual({ query: "", format: "all", activeOnly: false, recentOnly: false, scope: "all", sort: "note" });
  });

  it("plafonds : entiers positifs, cohérents entre eux", () => {
    for (const value of [META_MEDIA_ITEMS_MAX, META_MEDIA_LOOKUPS_PER_MONTH, META_MARKET_MEDIA_SPARE, META_LIBRARY_KEPT_MAX, META_LIBRARY_BULK_MAX, META_LIBRARY_VIDEO_MAX_BYTES, META_MEDIA_POSTER_WIDTH, META_GALLERY_RECENT_DAYS]) {
      expect(Number.isInteger(value) && value > 0).toBe(true);
    }
    expect(META_MEDIA_ITEMS_MAX).toBe(5);
    expect(META_GALLERY_RECENT_DAYS).toBe(30);
    expect(META_LIBRARY_VIDEO_MAX_BYTES).toBe(40 * 1024 * 1024);
    expect(META_LIBRARY_BULK_MAX).toBeLessThanOrEqual(META_LIBRARY_KEPT_MAX);
    expect(META_MEDIA_LOOKUP_COST_USD).toBeGreaterThan(0);
    expect(META_MEDIA_LOOKUP_COST_USD).toBeLessThan(1);
  });
});

// ─── Liens du CDN de Meta ────────────────────────────────────────────────────

describe("isMetaCdnUrl", () => {
  it("https et sous-domaine de fbcdn.net ou de cdninstagram.com : accepté (casse de l'hôte indifférente)", () => {
    for (const url of [
      SOURCE_IMAGE,
      SOURCE_VIDEO,
      "https://scontent.xx.fbcdn.net/a.jpg",
      "https://scontent.cdninstagram.com/v/t51/a.jpg",
      "https://scontent-cdg4-1.cdninstagram.com/a.jpg?oe=6AF90589",
      "https://SCONTENT.XX.FBCDN.NET/a.jpg",
    ]) {
      expect(isMetaCdnUrl(url), url).toBe(true);
    }
  });

  it("http, autre schéma ou lien sans schéma : refusé", () => {
    for (const url of ["http://scontent.xx.fbcdn.net/a.jpg", "ftp://scontent.xx.fbcdn.net/a.jpg", "//scontent.xx.fbcdn.net/a.jpg", "scontent.xx.fbcdn.net/a.jpg", "data:image/png;base64,AAAA", "javascript:alert(1)"]) {
      expect(isMetaCdnUrl(url), url).toBe(false);
    }
  });

  it("autre hôte, domaine nu ou imitation (« fbcdn.net.evil.com », « evilfbcdn.net », identifiants dans l'URL) : refusé", () => {
    for (const url of [
      "https://example.com/a.jpg",
      "https://www.facebook.com/ads/library/?id=1",
      "https://fbcdn.net/a.jpg",
      "https://cdninstagram.com/a.jpg",
      "https://fbcdn.net.evil.com/a.jpg",
      "https://scontent.xx.fbcdn.net.evil.com/a.jpg",
      "https://evilfbcdn.net/a.jpg",
      "https://scontent.xx.fbcdn.net@evil.com/a.jpg",
      "https://evil.com/?u=https://scontent.xx.fbcdn.net/a.jpg",
      "https://evil.com/scontent.xx.fbcdn.net/a.jpg",
      "https://evil.com/#.fbcdn.net",
    ]) {
      expect(isMetaCdnUrl(url), url).toBe(false);
    }
  });

  it("valeur illisible, vide, null ou undefined : refusé, sans exception", () => {
    for (const value of ["pas une url", "https://", "", null, undefined]) {
      expect(isMetaCdnUrl(value), String(value)).toBe(false);
    }
  });
});

describe("metaCdnExpiry", () => {
  it("paramètre `oe` : secondes Unix en hexadécimal (« oe=6AF90589 ») → date", () => {
    const expiry = metaCdnExpiry("https://scontent.xx.fbcdn.net/a.jpg?oe=6AF90589");
    expect(expiry).toBeInstanceOf(Date);
    expect(expiry?.getTime()).toBe(0x6af90589 * 1000);
    expect(expiry?.toISOString()).toBe("2026-11-15T01:06:17.000Z");
    // Minuscules et autres paramètres autour
    expect(metaCdnExpiry("https://scontent.xx.fbcdn.net/a.jpg?_nc_cat=1&oe=6af90589&_nc_sid=5f2048")?.toISOString()).toBe("2026-11-15T01:06:17.000Z");
    expect(metaCdnExpiry(SOURCE_IMAGE)?.toISOString()).toBe("2026-11-15T01:06:17.000Z");
  });

  it("sans `oe`, valeur non hexadécimale, trop courte, trop longue ou nulle → null", () => {
    for (const url of [
      "https://scontent.xx.fbcdn.net/a.jpg",
      "https://scontent.xx.fbcdn.net/a.jpg?oe=",
      "https://scontent.xx.fbcdn.net/a.jpg?oe=zzzzzzzz",
      "https://scontent.xx.fbcdn.net/a.jpg?oe=6AF90",
      "https://scontent.xx.fbcdn.net/a.jpg?oe=6AF90589123",
      "https://scontent.xx.fbcdn.net/a.jpg?oe=00000000",
      "https://scontent.xx.fbcdn.net/a.jpg?oe=-6AF9058",
      "https://scontent.xx.fbcdn.net/a.jpg?OE=6AF90589",
    ]) {
      expect(metaCdnExpiry(url), url).toBeNull();
    }
  });

  it("lien illisible, vide, null ou undefined → null, sans exception", () => {
    for (const value of ["pas une url", "oe=6AF90589", "", null, undefined]) {
      expect(metaCdnExpiry(value), String(value)).toBeNull();
    }
  });
});

describe("metaMediaSourceExpired", () => {
  it("expiration inconnue (null) ou illisible → jamais expiré", () => {
    expect(metaMediaSourceExpired({ sourceExpiresAt: null }, now)).toBe(false);
    expect(metaMediaSourceExpired({ sourceExpiresAt: "pas une date" }, now)).toBe(false);
    expect(metaMediaSourceExpired({ sourceExpiresAt: null })).toBe(false);
  });

  it("marge d'une heure : expiré dès qu'il reste une heure ou moins", () => {
    expect(metaMediaSourceExpired({ sourceExpiresAt: fromNow(3 * DAY) }, now)).toBe(false);
    expect(metaMediaSourceExpired({ sourceExpiresAt: fromNow(HOUR + 1) }, now)).toBe(false);
    expect(metaMediaSourceExpired({ sourceExpiresAt: fromNow(HOUR) }, now)).toBe(true);
    expect(metaMediaSourceExpired({ sourceExpiresAt: fromNow(HOUR / 2) }, now)).toBe(true);
    expect(metaMediaSourceExpired({ sourceExpiresAt: now.toISOString() }, now)).toBe(true);
    expect(metaMediaSourceExpired({ sourceExpiresAt: daysAgo(1) }, now)).toBe(true);
  });

  it("`now` par défaut : l'instant présent ; s'enchaîne avec metaCdnExpiry", () => {
    expect(metaMediaSourceExpired({ sourceExpiresAt: "2001-01-01T00:00:00Z" })).toBe(true);
    expect(metaMediaSourceExpired({ sourceExpiresAt: "2999-01-01T00:00:00Z" })).toBe(false);
    const sourceExpiresAt = metaCdnExpiry(SOURCE_IMAGE)!.toISOString();
    expect(metaMediaSourceExpired({ sourceExpiresAt }, new Date("2026-11-14T00:00:00Z"))).toBe(false);
    expect(metaMediaSourceExpired({ sourceExpiresAt }, new Date("2026-11-15T00:30:00Z"))).toBe(true);
    expect(metaMediaSourceExpired({ sourceExpiresAt }, new Date("2026-11-16T00:00:00Z"))).toBe(true);
  });
});

// ─── Image d'un visuel, couverture, libellé ──────────────────────────────────

describe("metaMediaItemImage", () => {
  const alive = { sourceExpiresAt: fromNow(3 * DAY) };
  const expired = { sourceExpiresAt: daysAgo(1) };

  it("la copie durable d'abord, que le lien d'origine vive encore ou non", () => {
    expect(metaMediaItemImage(item(), alive, now)).toBe(POSTER);
    expect(metaMediaItemImage(item(), expired, now)).toBe(POSTER);
    expect(metaMediaItemImage(item({ sourceImageUrl: null }), expired, now)).toBe(POSTER);
  });

  it("sans copie durable : le lien d'origine tant qu'il vit (marge d'une heure), null ensuite", () => {
    const noPoster = item({ posterUrl: null });
    expect(metaMediaItemImage(noPoster, alive, now)).toBe(SOURCE_IMAGE);
    expect(metaMediaItemImage(noPoster, { sourceExpiresAt: null }, now)).toBe(SOURCE_IMAGE);
    expect(metaMediaItemImage(noPoster, { sourceExpiresAt: fromNow(HOUR + 1) }, now)).toBe(SOURCE_IMAGE);
    expect(metaMediaItemImage(noPoster, { sourceExpiresAt: fromNow(HOUR) }, now)).toBeNull();
    expect(metaMediaItemImage(noPoster, expired, now)).toBeNull();
    expect(metaMediaItemImage(item({ posterUrl: "" }), alive, now)).toBe(SOURCE_IMAGE);
  });

  it("ni copie ni lien d'origine → null ; une vidéo n'est jamais son propre visuel", () => {
    expect(metaMediaItemImage(item({ posterUrl: null, sourceImageUrl: null }), alive, now)).toBeNull();
    const video = item({ kind: "video", posterUrl: null, sourceImageUrl: null, sourceVideoUrl: SOURCE_VIDEO, videoUrl: "https://medias.theralys.test/meta/annonce-1.mp4" });
    expect(metaMediaItemImage(video, alive, now)).toBeNull();
    expect(metaMediaItemImage({ ...video, sourceImageUrl: SOURCE_IMAGE }, alive, now)).toBe(SOURCE_IMAGE);
  });
});

describe("metaMediaCover", () => {
  it("premier visuel affichable : copie durable, sinon lien d'origine encore servi", () => {
    expect(metaMediaCover(media(), now)).toBe(POSTER);
    expect(metaMediaCover(media({ items: [item({ posterUrl: null })], sourceExpiresAt: fromNow(DAY) }), now)).toBe(SOURCE_IMAGE);
    const second = "https://medias.theralys.test/meta/annonce-2.webp";
    // Le premier visuel n'a plus rien d'affichable : on passe au suivant
    expect(metaMediaCover(media({ format: "carousel", items: [item({ posterUrl: null }), item({ posterUrl: second })], sourceExpiresAt: daysAgo(1) }), now)).toBe(second);
    expect(metaMediaCover(media({ format: "carousel", items: [item({ posterUrl: null, sourceImageUrl: null }), item({ posterUrl: second })] }), now)).toBe(second);
  });

  it("aucun visuel affichable, aucun visuel, visuels inconnus (null, undefined) → null", () => {
    expect(metaMediaCover(media({ items: [item({ posterUrl: null }), item({ posterUrl: null })], sourceExpiresAt: daysAgo(1) }), now)).toBeNull();
    expect(metaMediaCover(media({ items: [] }), now)).toBeNull();
    expect(metaMediaCover(null, now)).toBeNull();
    expect(metaMediaCover(undefined, now)).toBeNull();
    expect(metaMediaCover(null)).toBeNull();
  });
});

describe("metaMediaBadge", () => {
  it("visuel unique : le format seul", () => {
    expect(metaMediaBadge(media({ format: "image" }))).toBe("Image");
    expect(metaMediaBadge(media({ format: "video", items: [item({ kind: "video" })] }))).toBe("Vidéo");
    expect(metaMediaBadge(media({ format: "carousel", items: [item()] }))).toBe("Carrousel");
    expect(metaMediaBadge(media({ format: "image", items: [] }))).toBe("Image");
  });

  it("carrousel : « Carrousel 1/3 » ; une image ou une vidéo à plusieurs visuels sans déclinaison garde son libellé", () => {
    expect(metaMediaBadge(media({ format: "carousel", items: [item(), item(), item()] }))).toBe("Carrousel 1/3");
    expect(metaMediaBadge(media({ format: "carousel", items: [item(), item()] }))).toBe("Carrousel 1/2");
    expect(metaMediaBadge(media({ format: "image", items: [item(), item()] }))).toBe("Image");
  });

  it("déclinaisons d'une annonce dynamique : « Image · 4 déclinaisons », quel que soit le format", () => {
    expect(metaMediaBadge(media({ format: "image", variants: true, items: [item(), item(), item(), item()] }))).toBe("Image · 4 déclinaisons");
    expect(metaMediaBadge(media({ format: "video", variants: true, items: [item({ kind: "video" }), item({ kind: "video" })] }))).toBe("Vidéo · 2 déclinaisons");
    expect(metaMediaBadge(media({ format: "carousel", variants: true, items: [item(), item(), item()] }))).toBe("Carrousel · 3 déclinaisons");
    // Une seule déclinaison n'en est pas une
    expect(metaMediaBadge(media({ format: "image", variants: true, items: [item()] }))).toBe("Image");
  });
});

// ─── Catégories de page ──────────────────────────────────────────────────────

describe("isCommercialPageCategory", () => {
  it("boutique, marque, école, assurance, média : catégories hors veille (casse et ponctuation indifférentes)", () => {
    for (const category of ["Shopping & retail", "SHOPPING & RETAIL", "shopping retail", "E-commerce website", "Brand", "Insurance company", "School", "College & university", "Vitamins/supplements", "App page", "Magazine"]) {
      expect(isCommercialPageCategory([category]), category).toBe(true);
    }
    // Une seule catégorie commerciale suffit
    expect(isCommercialPageCategory(["Health/beauty", "Shopping & retail"])).toBe(true);
  });

  it("catégories de praticien ou catégories vagues (« Product/service », « Local business ») : jamais commerciales", () => {
    for (const category of ["Osteopathic Doctor", "Product/service", "Local business", "Alternative & holistic health service", "Massage therapist", "Medical & health", "Health/beauty", "Yoga studio", ""]) {
      expect(isCommercialPageCategory([category]), category).toBe(false);
    }
    expect(isCommercialPageCategory(["Osteopathic Doctor", "Product/service", "Local business"])).toBe(false);
    expect(isCommercialPageCategory([])).toBe(false);
  });
});

// ─── Note, tendance, rang ────────────────────────────────────────────────────

describe("adNote", () => {
  it("note entière bornée de 1 à 10 ; NaN, score nul ou négatif → 1", () => {
    expect(adNote(Number.NaN)).toBe(1);
    expect(adNote(0)).toBe(1);
    expect(adNote(-3)).toBe(1);
    expect(adNote(100)).toBe(10);
    for (let score = -2; score <= 15; score += 0.25) {
      const note = adNote(score);
      expect(Number.isInteger(note), String(score)).toBe(true);
      expect(note, String(score)).toBeGreaterThanOrEqual(1);
      expect(note, String(score)).toBeLessThanOrEqual(10);
    }
  });

  it("croît avec le score : une annonce à peine lancée a 1, une annonce longue à large portée a 10", () => {
    let previous = adNote(0);
    for (let score = 0; score <= 12; score += 0.1) {
      const note = adNote(score);
      expect(note, String(score)).toBeGreaterThanOrEqual(previous);
      previous = note;
    }
    expect(adNote(adScore(0, 0, false))).toBe(1);
    expect(adNote(adScore(120, 100_000, true))).toBe(10);
    expect(adNote(adScore(30, 999, false))).toBeGreaterThan(adNote(adScore(2, 50, false)));
    expect(adNote(adScore(30, 999, false))).toBeLessThan(10);
  });
});

describe("adIsTrending", () => {
  it("tendance = encore diffusée ET signal fort", () => {
    expect(adIsTrending({ active: true, signal: "fort" })).toBe(true);
    expect(adIsTrending({ active: false, signal: "fort" })).toBe(false);
    expect(adIsTrending({ active: true, signal: "moyen" })).toBe(false);
    expect(adIsTrending({ active: true, signal: "faible" })).toBe(false);
    expect(adIsTrending({ active: false, signal: "faible" })).toBe(false);
  });
});

describe("adTopPercent", () => {
  it("part des annonces repérées, arrondie au pourcent supérieur : 23e sur 100 → 23, 1re sur 3 → 34", () => {
    expect(adTopPercent({ rank: 23, rankTotal: 100 })).toBe(23);
    expect(adTopPercent({ rank: 1, rankTotal: 3 })).toBe(34);
    expect(adTopPercent({ rank: 2, rankTotal: 3 })).toBe(67);
    expect(adTopPercent({ rank: 1, rankTotal: 100 })).toBe(1);
    expect(adTopPercent({ rank: 50, rankTotal: 100 })).toBe(50);
  });

  it("bornes : 1 au minimum (1re sur 1 000), 100 au maximum (dernière, ou rang au-delà du total)", () => {
    expect(adTopPercent({ rank: 1, rankTotal: 1_000 })).toBe(1);
    expect(adTopPercent({ rank: 3, rankTotal: 3 })).toBe(100);
    expect(adTopPercent({ rank: 1, rankTotal: 1 })).toBe(100);
    expect(adTopPercent({ rank: 12, rankTotal: 10 })).toBe(100);
  });

  it("sans rang (veilles antérieures) ou total nul → null", () => {
    expect(adTopPercent({})).toBeNull();
    expect(adTopPercent({ rank: 3 })).toBeNull();
    expect(adTopPercent({ rankTotal: 10 })).toBeNull();
    expect(adTopPercent({ rank: 0, rankTotal: 10 })).toBeNull();
    expect(adTopPercent({ rank: 5, rankTotal: 0 })).toBeNull();
    expect(adTopPercent(marketAd("sans-rang"))).toBeNull();
    expect(adTopPercent(marketAd("rang", { rank: 2, rankTotal: 8 }))).toBe(25);
  });
});

describe("adIsRecent", () => {
  it("lancée depuis META_GALLERY_RECENT_DAYS jours ou moins : nouveauté ; au-delà, non", () => {
    expect(adIsRecent({ startedAt: now.toISOString() }, now)).toBe(true);
    expect(adIsRecent({ startedAt: daysAgo(1) }, now)).toBe(true);
    expect(adIsRecent({ startedAt: daysAgo(META_GALLERY_RECENT_DAYS - 1) }, now)).toBe(true);
    expect(adIsRecent({ startedAt: daysAgo(META_GALLERY_RECENT_DAYS) }, now)).toBe(true);
    expect(adIsRecent({ startedAt: new Date(now.getTime() - META_GALLERY_RECENT_DAYS * DAY - 1).toISOString() }, now)).toBe(false);
    expect(adIsRecent({ startedAt: daysAgo(META_GALLERY_RECENT_DAYS + 1) }, now)).toBe(false);
    expect(adIsRecent({ startedAt: daysAgo(400) }, now)).toBe(false);
  });

  it("sans date de début ou date illisible → jamais une nouveauté", () => {
    expect(adIsRecent({ startedAt: null }, now)).toBe(false);
    expect(adIsRecent({ startedAt: "pas une date" }, now)).toBe(false);
    expect(adIsRecent({ startedAt: "" }, now)).toBe(false);
    expect(adIsRecent({ startedAt: null })).toBe(false);
    expect(adIsRecent({ startedAt: "2001-01-01T00:00:00Z" })).toBe(false);
  });
});

// ─── Galerie : recherche, filtres, tri ───────────────────────────────────────

describe("filterGalleryAds", () => {
  const search = (query: string) => ids(filterGalleryAds(gallery, filters({ query }), now));

  it("filtres par défaut : toutes les annonces, de la mieux notée à la moins bien notée ; la liste d'origine n'est pas modifiée", () => {
    const before = ids(gallery);
    const result = filterGalleryAds(gallery, META_GALLERY_DEFAULT_FILTERS, now);
    expect(ids(result)).toEqual(["zenith", "claire", "lambert", "respire", "canal"]);
    expect(ids(gallery)).toEqual(before);
    expect(result).not.toBe(gallery);
    expect(result[0]).toBe(zenith);
    expect(filterGalleryAds([], META_GALLERY_DEFAULT_FILTERS, now)).toEqual([]);
  });

  it("recherche dans le nom de page, les textes, les titres, les descriptions, le lien et les zones ciblées", () => {
    expect(search("Lambert")).toEqual(["lambert"]);
    expect(search("tabac")).toEqual(["lambert"]);
    expect(search("sommeil")).toEqual(["zenith"]);
    expect(search("individuelles")).toEqual(["zenith"]);
    expect(search("clairemartin")).toEqual(["claire"]);
    expect(search("Colomiers")).toEqual(["claire"]);
    expect(search("Haute-Garonne")).toEqual(["zenith"]);
    expect(search("Occitanie")).toEqual(["zenith", "respire", "canal"]);
  });

  it("recherche sans accent ni casse, sur des débuts ou des morceaux de mots", () => {
    expect(search("zenith")).toEqual(["zenith"]);
    expect(search("ZÉNITH")).toEqual(["zenith"]);
    expect(search("osteopathe")).toEqual(["claire"]);
    expect(search("ostéo")).toEqual(["claire"]);
    expect(search("bien etre")).toEqual(["respire"]);
    expect(search("  Séances  ")).toEqual(["zenith", "lambert"]);
  });

  it("recherche à plusieurs mots : tous exigés, dans n'importe quel ordre et n'importe quel champ", () => {
    expect(search("ostéopathe Colomiers")).toEqual(["claire"]);
    expect(search("colomiers rendez-vous claire")).toEqual(["claire"]);
    expect(search("ostéopathe Toulouse")).toEqual([]);
    expect(search("séance souffler")).toEqual(["respire"]);
    expect(search("yoga mardi toulouse")).toEqual(["canal"]);
    expect(search("introuvable")).toEqual([]);
  });

  it("recherche vide, espaces ou ponctuation seule : aucun filtre", () => {
    for (const query of ["", "   ", "?!", "—"]) expect(search(query), JSON.stringify(query)).toHaveLength(gallery.length);
  });

  it("format : image, vidéo, carrousel ; « sans » regroupe les visuels inconnus ou vides", () => {
    const byFormat = (format: MetaGalleryFilters["format"]) => ids(filterGalleryAds(gallery, filters({ format }), now));
    expect(byFormat("all")).toHaveLength(5);
    expect(byFormat("image")).toEqual(["claire"]);
    expect(byFormat("video")).toEqual(["zenith"]);
    expect(byFormat("carousel")).toEqual(["respire"]);
    // « canal » a un visuel déclaré « image » mais aucun visuel : rangée avec « lambert » (visuels inconnus)
    expect(byFormat("sans")).toEqual(["lambert", "canal"]);
  });

  it("`activeOnly` : annonces encore diffusées seulement", () => {
    expect(ids(filterGalleryAds(gallery, filters({ activeOnly: true }), now))).toEqual(["claire", "lambert", "respire", "canal"]);
    expect(ids(filterGalleryAds([zenith], filters({ activeOnly: true }), now))).toEqual([]);
  });

  it("`recentOnly` : annonces lancées depuis 30 jours au plus, d'après `now` ; sans date de début, jamais", () => {
    expect(ids(filterGalleryAds(gallery, filters({ recentOnly: true }), now))).toEqual(["respire", "canal"]);
    // Trois semaines plus tard, seule la plus récente reste une nouveauté
    expect(ids(filterGalleryAds(gallery, filters({ recentOnly: true }), new Date(now.getTime() + 21 * DAY)))).toEqual(["canal"]);
    expect(ids(filterGalleryAds(gallery, filters({ recentOnly: true }), new Date(now.getTime() + 60 * DAY)))).toEqual([]);
  });

  it("zone : une seule zone à la fois, « all » pour toutes", () => {
    const byScope = (scope: MetaGalleryFilters["scope"]) => ids(filterGalleryAds(gallery, filters({ scope }), now));
    expect(byScope("all")).toHaveLength(5);
    expect(byScope("ville")).toEqual(["claire", "canal"]);
    expect(byScope("departement")).toEqual(["zenith"]);
    expect(byScope("region")).toEqual(["respire"]);
    expect(byScope("france")).toEqual(["lambert"]);
  });

  it("filtres cumulés : recherche, format, diffusion, nouveauté et zone s'ajoutent", () => {
    expect(ids(filterGalleryAds(gallery, filters({ query: "séance", activeOnly: true }), now))).toEqual(["lambert", "respire"]);
    expect(ids(filterGalleryAds(gallery, filters({ scope: "ville", recentOnly: true }), now))).toEqual(["canal"]);
    expect(ids(filterGalleryAds(gallery, filters({ scope: "ville", format: "image", activeOnly: true }), now))).toEqual(["claire"]);
    expect(ids(filterGalleryAds(gallery, filters({ query: "occitanie", format: "video", activeOnly: true }), now))).toEqual([]);
  });

  it("tris : meilleure note, diffusion la plus longue, plus grande portée, plus récentes ; les valeurs inconnues en dernier", () => {
    const sorted = (sort: MetaGalleryFilters["sort"]) => ids(filterGalleryAds(gallery, filters({ sort }), now));
    expect(sorted("note")).toEqual(["zenith", "claire", "lambert", "respire", "canal"]);
    expect(sorted("diffusion")).toEqual(["zenith", "claire", "respire", "canal", "lambert"]);
    expect(sorted("portee")).toEqual(["respire", "claire", "zenith", "canal", "lambert"]);
    expect(sorted("recent")).toEqual(["canal", "respire", "claire", "zenith", "lambert"]);
  });

  it("tri : une valeur nulle (0 jour, portée 0) passe avant une valeur inconnue", () => {
    const zero = galleryAd("zero", { pageName: "Cabinet Zéro", runningDays: 0, euTotalReach: 0, startedAt: daysAgo(0) });
    const unknown = galleryAd("inconnue", { pageName: "Cabinet Inconnu", runningDays: null, euTotalReach: null, startedAt: null });
    for (const sort of ["diffusion", "portee", "recent"] as const) {
      expect(ids(filterGalleryAds([unknown, zero], filters({ sort }), now)), sort).toEqual(["zero", "inconnue"]);
    }
  });

  it("ordre stable : à égalité, nom de page (ordre alphabétique français, sans casse ni accent) puis identifiant", () => {
    const ties = [
      galleryAd("t4", { pageName: "Zen Cabinet" }),
      galleryAd("t3", { pageName: "Écoute et Soin" }),
      galleryAd("t2", { pageName: "cabinet alpha" }),
      galleryAd("t1", { pageName: "Cabinet Bêta" }),
      galleryAd("t0", { pageName: "Cabinet Bêta" }),
    ];
    const expected = ["t2", "t0", "t1", "t3", "t4"];
    for (const sort of META_GALLERY_SORTS) {
      expect(ids(filterGalleryAds(ties, filters({ sort }), now)), sort).toEqual(expected);
      expect(ids(filterGalleryAds([...ties].reverse(), filters({ sort }), now)), sort).toEqual(expected);
    }
    // Le critère de tri passe toujours avant le nom
    const best = galleryAd("t9", { pageName: "Zut", score: 9 });
    expect(ids(filterGalleryAds([...ties, best], filters({ sort: "note" }), now))[0]).toBe("t9");
  });
});

// ─── Galerie : compteurs et zones ────────────────────────────────────────────

describe("galleryCounts", () => {
  it("compteurs des filtres sur toute la vue : total, en cours, nouveautés, formats (dont « sans »), zones", () => {
    expect(galleryCounts(gallery, now)).toEqual({
      total: 5,
      active: 4,
      recent: 2,
      formats: { image: 1, video: 1, carousel: 1, sans: 2 },
      scopes: { ville: 2, departement: 1, region: 1, france: 1 },
    });
  });

  it("cohérent avec filterGalleryAds, filtre par filtre", () => {
    const counts = galleryCounts(gallery, now);
    expect(filterGalleryAds(gallery, filters({ activeOnly: true }), now)).toHaveLength(counts.active);
    expect(filterGalleryAds(gallery, filters({ recentOnly: true }), now)).toHaveLength(counts.recent);
    for (const format of [...META_AD_MEDIA_FORMATS, "sans"] as const) {
      expect(filterGalleryAds(gallery, filters({ format }), now), format).toHaveLength(counts.formats[format]);
    }
    for (const scope of META_MARKET_SCOPES) {
      expect(filterGalleryAds(gallery, filters({ scope }), now), scope).toHaveLength(counts.scopes[scope]);
    }
    const formats = counts.formats;
    expect(formats.image + formats.video + formats.carousel + formats.sans).toBe(counts.total);
    expect(META_MARKET_SCOPES.reduce((sum, scope) => sum + counts.scopes[scope], 0)).toBe(counts.total);
  });

  it("vue vide : tout à zéro ; les nouveautés suivent `now`", () => {
    expect(galleryCounts([], now)).toEqual({
      total: 0,
      active: 0,
      recent: 0,
      formats: { image: 0, video: 0, carousel: 0, sans: 0 },
      scopes: { ville: 0, departement: 0, region: 0, france: 0 },
    });
    expect(galleryCounts(gallery, new Date(now.getTime() + 21 * DAY)).recent).toBe(1);
    expect(galleryCounts(gallery, new Date(now.getTime() + 60 * DAY)).recent).toBe(0);
  });
});

describe("galleryScopes", () => {
  it("zones présentes dans la vue, de la plus proche à la plus large", () => {
    expect(galleryScopes(galleryCounts(gallery, now))).toEqual(["ville", "departement", "region", "france"]);
    expect(galleryScopes(galleryCounts([lambert, claire], now))).toEqual(["ville", "france"]);
    expect(galleryScopes(galleryCounts([respire], now))).toEqual(["region"]);
    expect(galleryScopes(galleryCounts([], now))).toEqual([]);
  });
});

// ─── Galerie « Veille » ──────────────────────────────────────────────────────

describe("galleryAdsFrom", () => {
  const ads = [marketAd("a", { scope: "ville", rank: 1, rankTotal: 4 }), marketAd("b"), marketAd("c"), marketAd("d")];
  const mediaA = media({ format: "video", items: [item({ kind: "video" })] });
  const mediaC = media({ format: "carousel", items: [item(), item()] });
  const none = { keptIds: new Set<string>(), dismissedIds: new Set<string>() };

  it("annonces supprimées retirées, annonces gardées signalées, visuels rattachés par identifiant ; l'ordre de la veille est conservé", () => {
    const result = galleryAdsFrom(ads, { a: mediaA, c: mediaC, absente: media() }, { keptIds: new Set(["a", "d"]), dismissedIds: new Set(["b"]) });
    expect(ids(result)).toEqual(["a", "c", "d"]);
    expect(result.map((ad) => ad.kept)).toEqual([true, false, true]);
    expect(result.map((ad) => ad.media)).toEqual([mediaA, mediaC, null]);
    expect(result[0]?.media).toBe(mediaA);
    // L'annonce et son analyse sont reprises telles quelles
    expect(result[0]).toMatchObject({ id: "a", scope: "ville", rank: 1, rankTotal: 4, pageName: "Cabinet a", score: 5 });
  });

  it("sans bibliothèque ni visuels : toutes les annonces, non gardées, sans visuel ; la veille n'est pas modifiée", () => {
    const result = galleryAdsFrom(ads, {}, none);
    expect(ids(result)).toEqual(["a", "b", "c", "d"]);
    expect(result.every((ad) => ad.media === null && ad.kept === false)).toBe(true);
    expect(result[0]).not.toBe(ads[0]);
    expect("media" in ads[0]!).toBe(false);
    expect("kept" in ads[0]!).toBe(false);
    expect(galleryAdsFrom([], { a: mediaA }, { keptIds: new Set(["a"]), dismissedIds: new Set() })).toEqual([]);
  });

  it("une annonce à la fois gardée et supprimée reste supprimée ; un visuel `undefined` vaut absence de visuel", () => {
    const result = galleryAdsFrom(ads, { a: undefined, b: mediaA }, { keptIds: new Set(["a", "b"]), dismissedIds: new Set(["b", "inconnue"]) });
    expect(ids(result)).toEqual(["a", "c", "d"]);
    expect(result[0]).toMatchObject({ kept: true, media: null });
  });

  it("de la bibliothèque du site à la galerie filtrée : exemples gardés, annonces supprimées, compteurs", () => {
    const library: MetaLibraryEntry[] = [
      { adId: "a", status: "kept", pageName: "Cabinet a", ad: ads[0]!, media: mediaA, savedAt: daysAgo(3) },
      { adId: "c", status: "dismissed", pageName: "Cabinet c", ad: null, media: null, savedAt: daysAgo(1) },
    ];
    const byStatus = (status: MetaLibraryEntry["status"]) => new Set(library.filter((entry) => entry.status === status).map((entry) => entry.adId));
    const view = galleryAdsFrom(ads, { a: mediaA }, { keptIds: byStatus("kept"), dismissedIds: byStatus("dismissed") });
    expect(ids(view)).toEqual(["a", "b", "d"]);
    expect(view.filter((ad) => ad.kept).map((ad) => ad.id)).toEqual(["a"]);
    const counts = galleryCounts(view, now);
    expect(counts).toMatchObject({ total: 3, active: 3, formats: { image: 0, video: 1, carousel: 0, sans: 2 }, scopes: { ville: 1, departement: 0, region: 0, france: 2 } });
    expect(galleryScopes(counts)).toEqual<MetaMarketScope[]>(["ville", "france"]);
    expect(ids(filterGalleryAds(view, filters({ format: "video" }), now))).toEqual(["a"]);
  });
});
