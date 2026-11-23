"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { getDb, hitRateLimit, leads, requestIp, type RateLimitRule } from "@theralys/db";

/** Demandes de démo acceptées par adresse IP : assez pour un cabinet à plusieurs, trop peu pour noyer le CRM. */
const DEMO_RATE_LIMIT: RateLimitRule = { scope: "demo:ip", limit: 5, windowSeconds: 60 * 60 };

const demoRequestSchema = z.object({
  name: z.string().trim().min(2, "Indiquez votre nom").max(120),
  profession: z.string().trim().max(120).optional().default(""),
  city: z.string().trim().max(120).optional().default(""),
  email: z.string().trim().email("E-mail invalide").max(200).optional().or(z.literal("")),
  phone: z.string().trim().max(30).optional().default(""),
  message: z.string().trim().max(2000).optional().default(""),
  // Site que le praticien a déjà (facultatif) : simple texte, jamais ouvert ni lu par cette action
  currentSite: z.string().trim().max(200).optional().default(""),
  // Champ piège anti-robots : rempli uniquement par les bots
  website: z.string().max(0).optional().or(z.literal("")),
});

/**
 * Demande de démo depuis la vitrine : enregistrée comme lead « landing »,
 * visible immédiatement dans le back office agence (onglet Leads).
 */
export async function requestDemo(
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = demoRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Formulaire invalide" };
  }
  const data = parsed.data;
  // Bot détecté : on répond comme si tout allait bien, sans rien enregistrer
  if (data.website) return { ok: true };
  if (!data.email && !data.phone) {
    return { ok: false, error: "Laissez au moins un e-mail ou un téléphone pour vous recontacter" };
  }

  const notes = [
    [data.profession, data.city].filter(Boolean).join(" à "),
    data.currentSite ? `Site actuel : ${data.currentSite}` : "",
    data.message,
  ]
    .filter(Boolean)
    .join(" — ");

  try {
    const db = getDb();
    // Un script qui rejoue le formulaire : refusé au-delà de quelques demandes par heure et par adresse
    const decision = await hitRateLimit(db, DEMO_RATE_LIMIT, requestIp(await headers()));
    if (!decision.allowed) {
      return { ok: false, error: "Trop de demandes depuis cette connexion. Réessayez un peu plus tard." };
    }
    await db.insert(leads).values({
      name: data.name,
      email: data.email || null,
      phone: data.phone || null,
      source: "landing",
      notes: notes || null,
    });
  } catch {
    return { ok: false, error: "Une erreur est survenue, réessayez dans un instant" };
  }
  return { ok: true };
}
