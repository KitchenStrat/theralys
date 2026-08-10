import { z } from "zod";

/** Schémas zod des structures retournées par le modèle (validation stricte). */

export const heroSectionSchema = z.object({
  type: z.literal("hero"),
  badge: z.string().optional(),
  title: z.string().min(10),
  paragraphs: z.array(z.string()),
  showGoogleRating: z.boolean().optional(),
  ctaLabel: z.string().optional(),
  stats: z
    .array(z.object({ icon: z.string().optional(), value: z.string(), label: z.string() }))
    .optional(),
});

export const highlightsSectionSchema = z.object({
  type: z.literal("highlights"),
  items: z
    .array(z.object({ icon: z.string().optional(), title: z.string(), text: z.string().optional() }))
    .min(2),
});

export const specialtiesSectionSchema = z.object({
  type: z.literal("specialties"),
  title: z.string(),
  intro: z.string().optional(),
  items: z.array(
    z.object({ slug: z.string(), title: z.string(), excerpt: z.string() }),
  ),
});

export const aboutSectionSchema = z.object({
  type: z.literal("about"),
  title: z.string(),
  paragraphs: z.array(z.string()).min(1),
  infoCards: z
    .array(z.object({ icon: z.string().optional(), title: z.string(), text: z.string() }))
    .optional(),
});

export const futureSectionSchema = z.object({
  type: z.literal("future"),
  badge: z.string().optional(),
  title: z.string().min(10),
  intro: z.string().optional(),
  bullets: z.array(z.string()).min(3),
  ctaLabel: z.string().optional(),
});

export const reviewsSectionSchema = z.object({
  type: z.literal("reviews"),
  title: z.string(),
  intro: z.string().optional(),
});

export const processSectionSchema = z.object({
  type: z.literal("process"),
  title: z.string(),
  steps: z.array(z.object({ title: z.string(), description: z.string() })).min(2),
});

export const faqSectionSchema = z.object({
  type: z.literal("faq"),
  title: z.string(),
  items: z.array(z.object({ question: z.string(), answer: z.string() })).min(2),
});

export const contactSectionSchema = z.object({
  type: z.literal("contact"),
  title: z.string(),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  note: z.string().optional(),
  infoCards: z
    .array(z.object({ icon: z.string().optional(), title: z.string(), text: z.string() }))
    .optional(),
});

export const richTextSectionSchema = z.object({
  type: z.literal("richText"),
  title: z.string().optional(),
  body: z.string().min(100),
});

export const ctaSectionSchema = z.object({
  type: z.literal("cta"),
  title: z.string(),
  body: z.string().optional(),
  buttonLabel: z.string(),
});

export const sectionSchema = z.discriminatedUnion("type", [
  heroSectionSchema,
  highlightsSectionSchema,
  specialtiesSectionSchema,
  futureSectionSchema,
  aboutSectionSchema,
  reviewsSectionSchema,
  processSectionSchema,
  faqSectionSchema,
  contactSectionSchema,
  richTextSectionSchema,
  ctaSectionSchema,
]);

export const generatedHomeSchema = z.object({
  siteName: z.string(),
  metaTitle: z.string(),
  metaDescription: z.string(),
  sections: z.array(sectionSchema).min(5),
  motifsPlan: z.array(
    z.object({ slug: z.string(), title: z.string(), excerpt: z.string() }),
  ),
});

export const generatedMotifPageSchema = z.object({
  slug: z.string(),
  title: z.string(),
  metaTitle: z.string(),
  metaDescription: z.string(),
  sections: z.array(sectionSchema).min(2),
});

export const generatedReviewsSchema = z.array(
  z.object({
    authorName: z.string(),
    rating: z.number().int().min(3).max(5),
    text: z.string().min(20),
  }),
);

export const generatedArticlesSchema = z.array(
  z.object({
    title: z.string(),
    slug: z.string(),
    excerpt: z.string(),
    content: z.string().min(300),
    motifSlug: z.string().nullable(),
  }),
);
