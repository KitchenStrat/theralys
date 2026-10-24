/**
 * Rendu d'une diapositive (§5.3) : élément React du template → satori
 * (`ImageResponse` de next/og, PNG) → sharp (JPEG q85 mozjpeg, ou aperçu
 * 540 px q72). Aucune requête à la base ici : le contexte (site, marque,
 * domaine) est fourni par l'appelant.
 */

import { ImageResponse } from "next/og";
import sharp from "sharp";
import {
  SOCIAL_SIZES,
  TEMPLATE_ACCEPTS_PHOTO,
  type SiteTheme,
  type SocialPostContent,
  type SocialSize,
  type SocialTemplate,
} from "@theralys/shared";
import type { BrandInfo } from "./chrome";
import { loadFonts } from "./fonts";
import { FRAMES } from "./frames";
import { loadImage } from "./images";
import { photoGeometry, renderElement } from "./templates";
import { resolveSocialTheme } from "./theme";

export const PREVIEW_WIDTH = 540;
export const LOGO_BOX = { w: 260, h: 56 } as const;

/** Contexte de rendu d'un site (constant pour tous ses contenus). */
export type RenderContext = {
  siteTheme: SiteTheme;
  brand: BrandInfo;
  /** Domaine du site sans protocole */
  domain: string;
  google: { rating: number; reviewCount: number } | null;
  address: string | null;
};

/** Sous-ensemble d'une ligne `social_posts` nécessaire au rendu. */
export type RenderablePost = {
  template: string;
  accentColor: string | null;
  content: SocialPostContent;
};

export type RenderSlideInput = {
  post: RenderablePost;
  ctx: RenderContext;
  size: SocialSize;
  slideIndex: number;
  preview: boolean;
  /** Note de l'avis cité (template « avis ») */
  reviewRating?: number | null;
};

export type RenderedImage = {
  data: Buffer;
  width: number;
  height: number;
  /**
   * Photo ou logo demandé mais non chargé (échec transitoire : délai, 5xx…) :
   * la variante de repli a été rendue, mais ce résultat ne doit être mis en
   * cache nulle part (LRU, Blob, `assets`, navigateur).
   */
  degraded: boolean;
};

/** Diapositive demandée, ou erreur explicite. */
export function slideAt(content: SocialPostContent, index: number) {
  const slide = content.slides[index];
  if (!slide) throw new Error(`Diapositive ${index} introuvable`);
  return slide;
}

/** JPEG d'aperçu (540 px de large, q72 ≈ 45 Ko). */
export async function previewOf(jpeg: Buffer): Promise<Buffer> {
  return sharp(jpeg).resize({ width: PREVIEW_WIDTH }).jpeg({ quality: 72, mozjpeg: true }).toBuffer();
}

/** Rend une diapositive en JPEG (ou aperçu) — sans cache. */
export async function renderSlide(input: RenderSlideInput): Promise<RenderedImage> {
  const { post, ctx, size, slideIndex, preview } = input;
  const template = post.template as SocialTemplate;
  const frame = FRAMES[size];
  const slide = slideAt(post.content, slideIndex);
  const theme = resolveSocialTheme(ctx.siteTheme, post.accentColor, post.content.accentRole);
  const fonts = await loadFonts(ctx.siteTheme.fontPreset);

  const geometry = photoGeometry(template, size, slide.role);
  const photoOutcome =
    geometry && slide.imageUrl && TEMPLATE_ACCEPTS_PHOTO[template]
      ? await loadImage(slide.imageUrl, geometry.w, geometry.h, "cover")
      : null;
  const logoOutcome = theme.logoUrl ? await loadImage(theme.logoUrl, LOGO_BOX.w, LOGO_BOX.h, "contain") : null;
  const photo = photoOutcome?.status === "ok" ? photoOutcome.dataUri : null;
  const logo = logoOutcome?.status === "ok" ? logoOutcome.dataUri : null;
  // Une URL refusée (hors liste blanche, data:URI invalide) est définitive : la
  // variante sans photo est alors le rendu final ; seul un échec transitoire dégrade.
  const degraded = photoOutcome?.status === "failed" || logoOutcome?.status === "failed";

  const element = renderElement(template, {
    frame,
    size,
    theme,
    slide,
    photo,
    logo,
    brand: ctx.brand,
    index: slideIndex,
    total: post.content.slides.length,
    domain: ctx.domain,
    google: ctx.google,
    address: ctx.address,
    reviewRating: input.reviewRating ?? null,
  });

  const response = new ImageResponse(element, { width: frame.w, height: frame.h, fonts });
  const png = Buffer.from(await response.arrayBuffer());
  const full = await sharp(png).jpeg({ quality: 85, mozjpeg: true }).toBuffer();
  if (!preview) return { data: full, width: frame.w, height: frame.h, degraded };
  const data = await previewOf(full);
  return { data, width: PREVIEW_WIDTH, height: Math.round((frame.h * PREVIEW_WIDTH) / frame.w), degraded };
}

/** Dimensions d'une taille (utilitaire pour les routes et le PDF). */
export function dimensionsOf(size: SocialSize): { w: number; h: number } {
  return SOCIAL_SIZES[size];
}
