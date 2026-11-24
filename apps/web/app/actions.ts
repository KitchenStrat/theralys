"use server";

import { headers } from "next/headers";
import { and, eq, gt } from "drizzle-orm";
import { crmContacts, getDb, hitRateLimit, leads, requestIp, type RateLimitRule } from "@theralys/db";
import { buildEstimate, checkEstimateInput, estimateEmail, estimateLeadNotes } from "@theralys/db/estimate";
import { createMailProvider, sendMailWithRetry } from "@theralys/providers/mail";
import { DEMO_LIMITS, appendNotes, cleanEmail, cleanLine, callablePhone, demoDetailsNotes, demoLeadNotes } from "@theralys/shared/demo-request";

/** Demandes de démo acceptées par adresse IP : assez pour un cabinet à plusieurs, trop peu pour noyer le CRM. */
const DEMO_RATE_LIMIT: RateLimitRule = { scope: "demo:ip", limit: 5, windowSeconds: 60 * 60 };
/** Précisions ajoutées à une même demande : une correction ou deux, pas davantage. */
const DETAILS_RATE_LIMIT: RateLimitRule = { scope: "demo:details", limit: 3, windowSeconds: 60 * 60 };
/** Estimations envoyées par e-mail : par connexion, et par adresse (personne ne reçoit le même e-mail en boucle). */
const ESTIMATE_BY_IP: RateLimitRule = { scope: "estimate:ip", limit: 5, windowSeconds: 60 * 60 };
const ESTIMATE_BY_EMAIL: RateLimitRule = { scope: "estimate:email", limit: 2, windowSeconds: 24 * 60 * 60 };

/** Durée pendant laquelle une demande peut encore recevoir ses précisions. */
const DETAILS_WINDOW_MS = 2 * 60 * 60 * 1000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const record = (raw: unknown): Record<string, unknown> => (raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {});
/** Champ piège anti-robots : rempli uniquement par les robots. */
const trapped = (data: Record<string, unknown>): boolean => typeof data.website === "string" && data.website !== "";

export type DemoRequestResult = { ok: true; ref: string | null } | { ok: false; field: "name" | "phone" | "form"; error: string };

/**
 * Demande de démo depuis la vitrine : quatre champs (nom, métier, ville,
 * téléphone), le nom et le téléphone obligatoires — c'est par téléphone que la
 * démo se présente. Enregistrée comme demande « landing », reprise dans le
 * CRM. Rend la référence de la demande : elle seule permet d'y ajouter des
 * précisions ensuite (`completeDemoRequest`).
 */
export async function requestDemo(raw: unknown): Promise<DemoRequestResult> {
  const data = record(raw);
  // Robot détecté : on répond comme si tout allait bien, sans rien enregistrer
  if (trapped(data)) return { ok: true, ref: null };
  const name = cleanLine(data.name, DEMO_LIMITS.name);
  if (name.length < 2) return { ok: false, field: "name", error: "Indiquez votre nom." };
  const phone = callablePhone(data.phone);
  if (!phone) return { ok: false, field: "phone", error: "Indiquez un numéro de téléphone valide (10 chiffres) : c'est par téléphone que nous vous présentons votre démo." };

  try {
    const db = getDb();
    // Un script qui rejoue le formulaire : refusé au-delà de quelques demandes par heure et par adresse
    const decision = await hitRateLimit(db, DEMO_RATE_LIMIT, requestIp(await headers()));
    if (!decision.allowed) return { ok: false, field: "form", error: "Trop de demandes depuis cette connexion. Réessayez un peu plus tard." };
    const [created] = await db
      .insert(leads)
      .values({ name, phone, source: "landing", notes: demoLeadNotes({ profession: data.profession, city: data.city }) || null })
      .returning({ id: leads.id });
    return { ok: true, ref: created?.id ?? null };
  } catch {
    return { ok: false, field: "form", error: "Une erreur est survenue, réessayez dans un instant." };
  }
}

export type DemoDetailsResult = { ok: true } | { ok: false; field: "email" | "form"; error: string };

/**
 * Précisions facultatives, une fois la demande partie : e-mail, site actuel,
 * un mot sur la pratique. Elles complètent la demande désignée par sa
 * référence (un identifiant aléatoire, connu du seul navigateur qui vient de
 * l'envoyer), pendant deux heures. Rien n'est remplacé : l'e-mail ne se pose
 * que s'il manquait, le reste s'ajoute à la note. Si le CRM a déjà repris la
 * demande, sa fiche reçoit les mêmes précisions.
 */
export async function completeDemoRequest(raw: unknown): Promise<DemoDetailsResult> {
  const data = record(raw);
  if (trapped(data)) return { ok: true };
  const typedEmail = typeof data.email === "string" ? data.email.trim() : "";
  const email = typedEmail ? cleanEmail(typedEmail) : null;
  if (typedEmail && !email) return { ok: false, field: "email", error: "Cette adresse e-mail semble incomplète." };
  const site = cleanLine(data.currentSite, DEMO_LIMITS.site);
  const details = demoDetailsNotes({ currentSite: site, message: data.message });
  // Une référence illisible ou rien à ajouter : on remercie sans rien écrire
  if (typeof data.ref !== "string" || !UUID.test(data.ref) || (!email && !details)) return { ok: true };

  try {
    const db = getDb();
    const decision = await hitRateLimit(db, DETAILS_RATE_LIMIT, data.ref);
    if (!decision.allowed) return { ok: true };
    const [lead] = await db
      .select({ id: leads.id, email: leads.email, notes: leads.notes })
      .from(leads)
      .where(and(eq(leads.id, data.ref), eq(leads.source, "landing"), gt(leads.createdAt, new Date(Date.now() - DETAILS_WINDOW_MS))))
      .limit(1);
    if (!lead) return { ok: true };
    await db
      .update(leads)
      .set({ email: lead.email ?? email, notes: appendNotes(lead.notes, details) || null })
      .where(eq(leads.id, lead.id));
    try {
      const [contact] = await db
        .select({ id: crmContacts.id, email: crmContacts.email, website: crmContacts.website, notes: crmContacts.notes })
        .from(crmContacts)
        .where(eq(crmContacts.leadId, lead.id))
        .limit(1);
      if (contact) {
        await db
          .update(crmContacts)
          .set({ email: contact.email || email?.toLowerCase() || null, website: contact.website || site || null, notes: appendNotes(contact.notes, details) || null, updatedAt: new Date() })
          .where(eq(crmContacts.id, contact.id));
      }
    } catch {
      // Le CRM n'est pas en place dans cette base : la demande, elle, est complétée
    }
  } catch {
    return { ok: false, field: "form", error: "Vos précisions n'ont pas pu être ajoutées — réessayez dans un instant." };
  }
  return { ok: true };
}

/** Adresse publique de la vitrine, pour le lien de l'e-mail. */
function siteUrl(): string {
  return (process.env.WEB_BASE_URL || "https://www.harmony-web.fr").replace(/\/+$/, "");
}

export type EstimateEmailResult = { ok: true } | { ok: false; error: string };

/**
 * « Recevoir mon estimation par e-mail » : les hypothèses du simulateur sont
 * relues, le calcul refait ici au prix de la définition des formules, puis
 * l'e-mail part. Il ne contient aucun texte saisi par le visiteur. Une
 * estimation envoyée devient une demande « simulateur » dans le CRM.
 */
export async function emailEstimate(raw: unknown): Promise<EstimateEmailResult> {
  const data = record(raw);
  if (trapped(data)) return { ok: true };
  const email = cleanEmail(data.email);
  if (!email) return { ok: false, error: "Indiquez une adresse e-mail valide." };
  const input = checkEstimateInput(data.estimate);
  const estimate = input ? buildEstimate(input) : null;
  if (!estimate) return { ok: false, error: "Estimation illisible : rechargez la page et réessayez." };
  const mail = createMailProvider();
  if (mail.mode !== "resend") return { ok: false, error: "L'envoi par e-mail n'est pas disponible pour le moment." };

  try {
    const db = getDb();
    const byIp = await hitRateLimit(db, ESTIMATE_BY_IP, requestIp(await headers()));
    if (!byIp.allowed) return { ok: false, error: "Trop d'envois depuis cette connexion. Réessayez un peu plus tard." };
    const byEmail = await hitRateLimit(db, ESTIMATE_BY_EMAIL, email);
    if (!byEmail.allowed) return { ok: false, error: "Une estimation est déjà partie à cette adresse aujourd'hui : regardez dans votre boîte, courriers indésirables compris." };

    const sent = await sendMailWithRetry(mail, { to: email, ...estimateEmail(estimate, siteUrl()) }, { retries: 1 });
    if (!sent.sent) return { ok: false, error: "L'e-mail n'a pas pu partir à cette adresse : vérifiez-la et réessayez." };
    try {
      await db.insert(leads).values({ name: email, email, source: "simulator", notes: estimateLeadNotes(estimate) });
    } catch (error) {
      // L'e-mail est parti : l'échec de l'inscription au CRM ne se montre pas au visiteur
      console.error("[estimation] demande non enregistrée", error instanceof Error ? error.name : "erreur");
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "L'envoi a échoué — réessayez dans un instant." };
  }
}
