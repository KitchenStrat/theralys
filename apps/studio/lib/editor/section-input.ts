import { z } from "zod";
import type { Section } from "@theralys/shared";

/**
 * Contrôle de ce que l'éditeur envoie pour une section, avant la fusion avec
 * le contenu enregistré. Une action serveur se rejoue sans l'interface : sans
 * ce contrôle, n'importe quelle clé et n'importe quel type entraient en base
 * (un objet à la place d'un texte fait planter le rendu public du site).
 *
 * - Un schéma par type de section : seuls les champs de ce type passent, avec
 *   leur type ; toute autre clé est écartée.
 * - Des plafonds serveur, larges : bien au-delà des repères de lisibilité de
 *   l'éditeur (`SECTION_LIMITS`), ils n'arrêtent que l'abus.
 * - Une image est une adresse `https://`, un chemin du site (`/…`) ou la photo
 *   embarquée du stockage de secours ; l'adresse déjà enregistrée passe telle
 *   quelle.
 * Fonction pure, sans accès à la base.
 */

const SHORT = 300;
const TEXT = 5_000;
const BODY = 100_000;
/** Photo embarquée (stockage de secours) : 2,5 Mo de fichier, soit ~3,4 Mo en base64. */
const IMAGE = 3_600_000;

const IMAGE_SOURCE = /^(https:\/\/[^\s<>"']+|\/[^\s<>"']*|data:image\/(jpeg|png|webp|avif);base64,[A-Za-z0-9+/=]+)$/;

const short = z.string().max(SHORT);
const text = z.string().max(TEXT);
const body = z.string().max(BODY);
const icon = z.string().max(40);

/** Image : vide (retirée), bien formée, ou identique à une image déjà enregistrée dans la section. */
function imageField(known: ReadonlySet<string>) {
  return z
    .string()
    .max(IMAGE)
    .refine((value) => value === "" || known.has(value) || IMAGE_SOURCE.test(value), "Image invalide");
}

const card = z.object({ icon: icon.optional(), title: short, text: text });

function schemaFor(type: Section["type"], knownImages: ReadonlySet<string>) {
  const image = imageField(knownImages);
  switch (type) {
    case "hero":
      return z.object({
        badge: short,
        title: short,
        paragraphs: z.array(text).max(30),
        imageUrl: image,
        showGoogleRating: z.boolean(),
        ctaLabel: short,
        stats: z.array(z.object({ icon: icon.optional(), value: short, label: short })).max(10),
      });
    case "highlights":
      return z.object({
        items: z.array(z.object({ icon: icon.optional(), title: short, text: text.optional() })).max(20),
      });
    case "specialties":
      return z.object({
        title: short,
        intro: text,
        items: z
          .array(
            z.object({
              slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(120),
              title: short,
              excerpt: text,
              imageUrl: image.optional(),
              icon: icon.optional(),
            }),
          )
          .max(40),
      });
    case "about":
      return z.object({
        title: short,
        paragraphs: z.array(text).max(30),
        imageUrl: image,
        infoCards: z.array(card).max(20),
      });
    case "future":
      return z.object({
        badge: short,
        title: short,
        body: body,
        intro: text,
        bullets: z.array(text).max(40),
        ctaLabel: short,
        imageUrl: image,
      });
    case "reviews":
      return z.object({ title: short, intro: text });
    case "process":
      return z.object({
        title: short,
        steps: z.array(z.object({ title: short, description: text })).max(20),
      });
    case "faq":
      return z.object({
        title: short,
        items: z.array(z.object({ question: short, answer: text })).max(40),
      });
    case "contact":
      return z.object({
        title: short,
        address: short,
        phone: z.string().max(60),
        email: z.string().max(200),
        hours: z.array(z.object({ label: short, value: short })).max(20),
        note: text,
        infoCards: z.array(card).max(20),
      });
    case "richText":
      return z.object({ title: short, body: body });
    case "cta":
      return z.object({ title: short, body: text, buttonLabel: short });
  }
}

/** Images déjà enregistrées dans la section (au premier niveau et dans ses cartes). */
function knownImagesOf(section: Section): Set<string> {
  const known = new Set<string>();
  const visit = (value: unknown) => {
    if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === "object") {
      for (const [key, child] of Object.entries(value)) {
        if (key === "imageUrl" && typeof child === "string") known.add(child);
        else visit(child);
      }
    }
  };
  visit(section);
  return known;
}

/** Retire les clés à valeur `null` (un champ vidé côté navigateur) : absent vaut « inchangé ». */
function withoutNulls(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutNulls);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, child]) => child !== null)
        .map(([key, child]) => [key, withoutNulls(child)]),
    );
  }
  return value;
}

export type SectionMerge = { ok: true; section: Section } | { ok: false };

/**
 * Fusionne ce que l'éditeur envoie dans la section enregistrée.
 * - Type différent : la section enregistrée est gardée telle quelle (les types
 *   et l'ordre ne changent jamais par cette voie).
 * - Champ du mauvais type ou hors plafond : refus (`ok: false`), rien n'est écrit.
 * - `hidden` : `true` masque la section ; toute autre valeur la rend visible.
 */
export function mergeSectionInput(current: Section, incoming: unknown): SectionMerge {
  if (!incoming || typeof incoming !== "object" || Array.isArray(incoming)) return { ok: false };
  const raw = incoming as Record<string, unknown>;
  if (raw.type !== current.type) return { ok: true, section: current };

  const parsed = schemaFor(current.type, knownImagesOf(current)).partial().safeParse(withoutNulls(raw));
  if (!parsed.success) return { ok: false };

  const next = { ...current, ...parsed.data } as Section;
  if (raw.hidden === true) next.hidden = true;
  else delete next.hidden;
  return { ok: true, section: next };
}
