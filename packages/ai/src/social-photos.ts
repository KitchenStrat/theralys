/**
 * Photos des visuels des réseaux sociaux : d'où elles viennent, et comment un
 * contenu reçoit ou perd la sienne.
 *
 * Le générateur ne connaît que les photos du site. Une fois les contenus
 * rédigés, ce module fournit à chaque visuel qui porte une photo une image
 * choisie pour son sujet, d'après le réglage du praticien : générée par IA,
 * prise dans une banque d'images, ou l'un et l'autre en alternance. Deux
 * photos ne sont jamais remplacées : celle que le praticien a envoyée
 * lui-même, et la couverture de l'article qu'un contenu annonce.
 *
 * Rien ici ne fait échouer la préparation d'un contenu : sans photo trouvée,
 * le visuel garde celle du site, ou reste sans photo.
 */

import {
  TEMPLATE_ACCEPTS_PHOTO,
  isSocialPhotoUrl,
  portraitSafeUrl,
  templateCarriesPhoto,
  type SocialFormat,
  type SocialImageOrigin,
  type SocialPhotoSource,
  type SocialPillar,
  type SocialPostContent,
  type SocialTemplate,
} from "@theralys/shared";
import type { ImageProvider } from "./images";
import { socialAltText, type FinalizedPost } from "./social";
import { stockQueryFor, type StockImageProvider } from "./stock";

/** Longueur maximale d'un texte alternatif (la même que celle tenue par le générateur). */
const ALT_MAX = 250;

/** Ce qu'il faut d'un contenu pour lui poser ou lui retirer une photo : le contenu préparé comme celui déjà enregistré. */
export type PhotoCarrier = { template: SocialTemplate; content: SocialPostContent };

export type CoverPhoto = { url: string; origin: SocialImageOrigin };

type Brand = { firstName: string; profession: string };

const altText = (template: SocialTemplate, content: SocialPostContent, brand: Brand) =>
  socialAltText(
    template,
    content.slides.map((slide) => ({ title: slide.title, body: slide.body, hasPhoto: Boolean(slide.imageUrl) })),
    brand,
  ).slice(0, ALT_MAX);

/**
 * Pose une photo en fond de la première diapositive. Un visuel sans photo
 * d'une seule diapositive — carte de couleur ou carte de texte — devient un
 * « photo-titre » : son titre et son texte, sur la photo ; il garde en
 * mémoire le modèle qu'il était (`plainTemplate`). Un carrousel la reçoit sur
 * sa couverture. Le texte alternatif est réécrit quand le visuel change de
 * nature : il décrit ce qui est rendu.
 */
export function applyCoverPhoto<T extends PhotoCarrier>(post: T, photo: CoverPhoto, brand: Brand): T {
  const becomes = !TEMPLATE_ACCEPTS_PHOTO[post.template];
  const template: SocialTemplate = becomes ? "photo-titre" : post.template;
  const hadPhoto = Boolean(post.content.slides[0]?.imageUrl);
  const slides = post.content.slides.map((slide, index) => (index === 0 ? { ...slide, imageUrl: photo.url, imageOrigin: photo.origin } : slide));
  const content: SocialPostContent = { ...post.content, slides, ...(becomes ? { plainTemplate: post.template } : {}) };
  return { ...post, template, content: becomes || !hadPhoto ? { ...content, altText: altText(template, content, brand) } : content };
}

/**
 * Retire la photo de la première diapositive : un « photo-titre » retrouve le
 * modèle qu'il était avant elle (« affirmation » à défaut), les autres
 * modèles restent, sans photo.
 */
export function removeCoverPhoto<T extends PhotoCarrier>(post: T, brand: Brand): T {
  if (!post.content.slides[0]?.imageUrl) return post;
  const template: SocialTemplate = post.template === "photo-titre" ? (post.content.plainTemplate ?? "affirmation") : post.template;
  const slides = post.content.slides.map((slide, index) => {
    if (index !== 0) return slide;
    const rest = { ...slide };
    delete rest.imageUrl;
    delete rest.imageOrigin;
    return rest;
  });
  const content: SocialPostContent = { ...post.content, slides };
  delete content.plainTemplate;
  return { ...post, template, content: { ...content, altText: altText(template, content, brand) } };
}

/** La photo que le praticien a envoyée pour ce contenu, s'il y en a une. */
export function uploadedCoverPhoto(content: SocialPostContent): CoverPhoto | null {
  const cover = content.slides[0];
  return cover?.imageUrl && cover.imageOrigin === "upload" ? { url: cover.imageUrl, origin: "upload" } : null;
}

// ─── Fournir les photos d'après le réglage ───────────────────────────────────

export type SocialPhotoProviders = { stock: StockImageProvider; images: ImageProvider };

export type SocialPhotoOptions = {
  source: SocialPhotoSource;
  practitioner: Brand;
  /** Couleur du site (illustrations du mode démonstration) */
  themeColor?: string;
  /** Graine de variation : deux préparations du même sujet ne reçoivent pas la même photo */
  seed: string;
  /**
   * Accepter les illustrations de démonstration (fournisseur sans clé). Vrai
   * seulement quand tout le contenu est lui-même de démonstration : jamais
   * une illustration factice n'est posée sur le visuel d'un vrai praticien —
   * sans clé pour l'origine choisie, la photo du site reste.
   */
  allowPlaceholders?: boolean;
};

/** La photo couvre le visuel le plus haut de son format (côtés multiples de 16, attendus par le générateur d'images). */
const PHOTO_SIZE: Record<SocialFormat, { width: number; height: number }> = {
  static: { width: 1088, height: 1360 },
  carousel: { width: 1088, height: 1360 },
  story: { width: 1088, height: 1936 },
};

const ARTICLE_PILLARS: readonly SocialPillar[] = ["nouvel_article", "article"];

/**
 * La photo en place reste : le praticien l'a envoyée (pour ce contenu, ou
 * dans son site), ou c'est la couverture de l'article que le contenu annonce.
 */
function keepsItsPhoto(post: FinalizedPost): boolean {
  const cover = post.content.slides[0];
  if (!cover?.imageUrl) return false;
  if (cover.imageOrigin === "upload" || portraitSafeUrl(cover.imageUrl)) return true;
  return ARTICLE_PILLARS.includes(post.pillar) || post.template === "carrousel-article";
}

function hash(value: string): number {
  let result = 0;
  for (let i = 0; i < value.length; i++) result = (result * 31 + value.charCodeAt(i)) | 0;
  return Math.abs(result);
}

async function fetchPhoto(kind: "ai" | "stock", post: FinalizedPost, options: SocialPhotoOptions, providers: SocialPhotoProviders): Promise<CoverPhoto | null> {
  const cover = post.content.slides[0];
  const query = stockQueryFor(`${post.topic} ${cover?.title ?? ""}`, options.practitioner.profession);
  const size = PHOTO_SIZE[post.format];
  const seed = `${options.seed}:${post.scheduledFor}:${post.topic}`;
  try {
    if (kind === "stock") {
      if (providers.stock.mode === "mock" && !options.allowPlaceholders) return null;
      const found = await providers.stock.find({ query, ...size, seed });
      return found && isSocialPhotoUrl(found.url) ? { url: found.url, origin: "stock" } : null;
    }
    const image = await providers.images.generate({
      // Le bas du visuel porte le titre : la photo y laisse de la place
      subject: `${query}, calm uncluttered scene, vertical composition with quiet empty space in the lower third (variation ${hash(seed) % 97})`,
      themeColor: options.themeColor,
      ...size,
    });
    if (image.provider === "mock" && !options.allowPlaceholders) return null;
    return isSocialPhotoUrl(image.url) ? { url: image.url, origin: "ai" } : null;
  } catch (error) {
    console.warn(`[social] photo (${kind === "ai" ? "IA" : "banque d'images"}) indisponible : ${error instanceof Error ? error.message.slice(0, 160) : "erreur"}`);
    return null;
  }
}

const CONCURRENCY = 3;

/**
 * Donne sa photo à chaque contenu dont le visuel en porte une, d'après le
 * réglage. « Mixte » alterne banque d'images et IA d'un contenu au suivant,
 * et se rabat sur l'autre si la première ne donne rien ; « IA » et « Banque
 * d'images » ne débordent jamais l'un sur l'autre. L'ordre des contenus est
 * gardé ; l'indication `photoWanted` ne ressort pas.
 */
export async function sourceSocialPhotos(posts: readonly FinalizedPost[], options: SocialPhotoOptions, providers: SocialPhotoProviders): Promise<FinalizedPost[]> {
  const out = posts.map((post) => {
    const { photoWanted: _wanted, ...rest } = post;
    // Une photo du site qui reste en place est dite telle
    const cover = rest.content.slides[0];
    if (!cover?.imageUrl || cover.imageOrigin) return rest;
    return { ...rest, content: { ...rest.content, slides: rest.content.slides.map((slide, index) => (index === 0 ? { ...slide, imageOrigin: "site" as const } : slide)) } };
  });
  const wanted = posts.map((post, index) => ({ post, index })).filter(({ post }) => (templateCarriesPhoto(post.template) && post.template !== "affirmation") || post.photoWanted).filter(({ post }) => !keepsItsPhoto(post));
  const offset = hash(options.seed) % 2;
  let next = 0;
  const work = async () => {
    for (;;) {
      const rank = next++;
      const item = wanted[rank];
      if (!item) return;
      const first: "ai" | "stock" = options.source === "mixed" ? ((rank + offset) % 2 === 0 ? "stock" : "ai") : options.source;
      let photo = await fetchPhoto(first, item.post, options, providers);
      if (!photo && options.source === "mixed") photo = await fetchPhoto(first === "ai" ? "stock" : "ai", item.post, options, providers);
      if (photo) out[item.index] = applyCoverPhoto(out[item.index]!, photo, options.practitioner);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, wanted.length) }, work));
  return out;
}
