"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { getDb, type Database, type Site } from "@theralys/db";
import {
  beginExternalSiteRead,
  disconnectExternalSite,
  loadExternalSite,
  runExternalSiteRead,
  saveExternalOverrides,
  setExternalSiteActive,
  submitExternalSiteText,
  type ExternalSiteResult,
  type ExternalSiteView,
} from "@theralys/jobs";
import { activeExternalSite } from "@theralys/shared";
import { requireClient } from "@/lib/auth";
import { getSite } from "@/lib/data";
import { RUBRIC_IDS, applyRubricCorrection, restoreRubric } from "@/lib/external-site/rubrics";

/**
 * Actions de l'écran « Mon site » (site internet du client, cf.
 * `@theralys/jobs` external-site.ts). Le site est toujours celui de la
 * session, jamais une valeur du formulaire. Chaque action rend le message du
 * service en cas de refus (`error`, prêt à être montré), et fait relire les
 * pages qui affichent l'adresse du site de référence.
 *
 * Journaux : identifiant du site et code d'erreur seulement — jamais une
 * adresse, un texte collé ni une clé.
 */

const PATH = "/mon-site";

export type MonSiteResult = { error?: string };

const INVALID = "Cette demande n'a pas pu être comprise. Rechargez la page, puis réessayez.";
const FAILED = "Cette action n'a pas abouti. Réessayez dans quelques instants.";
const NOT_ACTIVATED = "Cette section est en cours d'activation. Réessayez dans quelques minutes.";
const NOT_CONNECTED = "Aucun site n'est connecté pour le moment. Indiquez d'abord l'adresse de votre site.";

/** Motifs de refus qui tiennent à l'état du site (et non à la saisie) : l'écran affiché n'est plus à jour, il est relu. */
const STALE_SCREEN = new Set<Extract<ExternalSiteResult, { ok: false }>["reason"]>(["busy", "quota", "not_ready", "unavailable"]);

/** L'adresse du site de référence s'affiche dans la barre latérale (layout du studio), sur l'accueil et sur cet écran. */
function revalidateSiteAddress(): void {
  revalidatePath("/(app)", "layout");
  revalidatePath("/");
  revalidatePath(PATH);
}

/** Code d'une erreur (SQLSTATE, code réseau) ou son type — jamais son message, qui peut reprendre une requête et ses paramètres. */
function errorLabel(err: unknown): string {
  let current: unknown = err;
  for (let depth = 0; depth < 5 && current instanceof Error; depth++) {
    const code = (current as Error & { code?: unknown }).code;
    if (typeof code === "string" && /^[A-Z0-9_]{3,24}$/.test(code)) return code;
    current = current.cause;
  }
  return err instanceof Error ? err.name : typeof err;
}

type Context = { db: Database; site: Site };

/**
 * Déroulé commun : session, site de la session, appel au service, relecture
 * des pages. Une erreur inattendue (base injoignable) devient un message
 * calme plutôt qu'une page d'erreur : le praticien peut réessayer.
 */
async function run(label: string, work: (context: Context) => Promise<ExternalSiteResult>): Promise<MonSiteResult> {
  const session = await requireClient();
  try {
    const context: Context = { db: getDb(), site: await getSite(session.siteId) };
    const result = await work(context);
    if (result.ok) {
      revalidateSiteAddress();
      return {};
    }
    if (STALE_SCREEN.has(result.reason)) revalidateSiteAddress();
    return { error: result.message };
  } catch (err) {
    console.error(`[mon-site] ${label} : échec`, { siteId: session.siteId, code: errorLabel(err) });
    return { error: FAILED };
  }
}

const refused = (reason: Extract<ExternalSiteResult, { ok: false }>["reason"], message: string): ExternalSiteResult => ({ ok: false, reason, message });

/** Site connecté de la session, ou le refus à rendre (section pas encore activée, aucun site connecté). */
async function connectedSite({ db, site }: Context): Promise<{ view: ExternalSiteView } | { refusal: ExternalSiteResult }> {
  const state = await loadExternalSite(db, site);
  if (!state.available) return { refusal: refused("unavailable", NOT_ACTIVATED) };
  if (!state.site) return { refusal: refused("unavailable", NOT_CONNECTED) };
  return { view: state.site };
}

// ─── Lecture du site ─────────────────────────────────────────────────────────

const connectSchema = z.object({ url: z.string().max(1000), consent: z.boolean() });

/**
 * Connecte un site (ou change d'adresse) : l'adresse et la confirmation « ce
 * site est le mien » sont contrôlées par le service, la lecture se poursuit
 * en arrière-plan une fois la réponse partie. L'écran passe en « lecture en
 * cours » et se relit jusqu'à la fin.
 */
export async function connectExternalSite(input: unknown): Promise<MonSiteResult> {
  const parsed = connectSchema.safeParse(input);
  return run("connexion", async ({ db, site }) => {
    if (!parsed.success) return refused("url", INVALID);
    const result = await beginExternalSiteRead(db, site, parsed.data);
    if (result.ok) after(() => runExternalSiteRead(db, site.id));
    return result;
  });
}

/**
 * Relit le site déjà connecté (bouton « Relire mon site », ou nouvel essai
 * après un échec). L'adresse est celle qui est enregistrée ; l'autorisation
 * de lecture est celle donnée à la connexion de ce site, qui vaut pour ses
 * relectures. Comptée dans les lectures du mois, comme la première.
 */
export async function rereadExternalSite(): Promise<MonSiteResult> {
  return run("relecture", async (context) => {
    const current = await connectedSite(context);
    if ("refusal" in current) return current.refusal;
    const result = await beginExternalSiteRead(context.db, context.site, { url: current.view.url, consent: true });
    if (result.ok) after(() => runExternalSiteRead(context.db, context.site.id));
    return result;
  });
}

// Le service borne le texte et dit pourquoi il le refuse ; cette borne-ci n'écarte que l'envoi démesuré
const pasteSchema = z.object({ text: z.string().max(500_000), consent: z.boolean() });

/**
 * Repli quand le site refuse la lecture : le texte collé par le praticien
 * tient lieu de pages lues, pour le site déjà enregistré. Le profil est
 * préparé pendant l'appel (jusqu'à une minute).
 */
export async function submitExternalSitePaste(input: unknown): Promise<MonSiteResult> {
  const parsed = pasteSchema.safeParse(input);
  return run("texte collé", async (context) => {
    if (!parsed.success) return refused("text", INVALID);
    const current = await connectedSite(context);
    if ("refusal" in current) return current.refusal;
    return submitExternalSiteText(context.db, context.site, { url: current.view.url, text: parsed.data.text, consent: parsed.data.consent });
  });
}

// ─── Corrections du profil ───────────────────────────────────────────────────

const correctionSchema = z.object({ rubric: z.enum(RUBRIC_IDS), value: z.unknown() });

/**
 * Enregistre la correction d'une rubrique. Les corrections complètes sont
 * recomposées ici, à partir de celles qui sont enregistrées à cet instant
 * (`applyRubricCorrection`) : une rubrique corrigée dans un autre onglet
 * n'est pas perdue. Le service nettoie puis enregistre l'ensemble.
 */
export async function saveExternalCorrection(input: unknown): Promise<MonSiteResult> {
  const parsed = correctionSchema.safeParse(input);
  return run("correction", async (context) => {
    if (!parsed.success) return refused("unavailable", INVALID);
    const current = await connectedSite(context);
    if ("refusal" in current) return current.refusal;
    const { url, extracted, overrides } = current.view;
    return saveExternalOverrides(context.db, context.site.id, applyRubricCorrection({ url, extracted, overrides }, parsed.data.rubric, parsed.data.value));
  });
}

/** Rétablit une rubrique telle qu'elle a été lue sur le site : sa correction est retirée, les autres restent. */
export async function restoreExternalRubric(input: unknown): Promise<MonSiteResult> {
  const parsed = z.enum(RUBRIC_IDS).safeParse(input);
  return run("rétablissement", async (context) => {
    if (!parsed.success) return refused("unavailable", INVALID);
    const current = await connectedSite(context);
    if ("refusal" in current) return current.refusal;
    return saveExternalOverrides(context.db, context.site.id, restoreRubric(current.view.overrides, parsed.data));
  });
}

// ─── Site de référence des outils ────────────────────────────────────────────

const activateSchema = z.object({ keepHostedVisible: z.boolean() });

/** « Utiliser ce site pour mes outils » : le service exige un site lu et un profil exploitable, et dit ce qui manque sinon. */
export async function activateExternalSite(input: unknown): Promise<MonSiteResult> {
  const parsed = activateSchema.safeParse(input);
  return run("activation", async ({ db, site }) => {
    if (!parsed.success) return refused("unavailable", INVALID);
    return setExternalSiteActive(db, site.id, { active: true, keepHostedIndexed: parsed.data.keepHostedVisible });
  });
}

/** « Revenir au site Harmony » : la lecture et les corrections sont gardées, le site pourra être réactivé sans être relu. */
export async function deactivateExternalSite(): Promise<MonSiteResult> {
  return run("désactivation", ({ db, site }) => setExternalSiteActive(db, site.id, { active: false }));
}

/** « Garder aussi mon site Harmony visible sur Google » : seul ce choix change, le site de référence reste le même. */
export async function setHostedSiteVisible(input: unknown): Promise<MonSiteResult> {
  const parsed = z.boolean().safeParse(input);
  return run("visibilité du site Harmony", async ({ db, site }) => {
    if (!parsed.success) return refused("unavailable", INVALID);
    return setExternalSiteActive(db, site.id, { active: activeExternalSite(site.theme) !== null, keepHostedIndexed: parsed.data });
  });
}

/** « Déconnecter mon site » : le profil lu et les corrections sont supprimés, les outils retrouvent le site Harmony. */
export async function disconnectExternalSiteAction(): Promise<MonSiteResult> {
  return run("déconnexion", ({ db, site }) => disconnectExternalSite(db, site.id));
}
