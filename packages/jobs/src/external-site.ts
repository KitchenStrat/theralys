/**
 * Site internet du client (« site de référence », cf. `@theralys/shared`
 * external-site.ts) : service appelé par le studio et par les tâches
 * planifiées.
 *
 * Déroulé : le praticien donne l'adresse de son site et confirme qu'il est
 * le sien (`beginExternalSiteRead`) ; le site est lu puis son profil extrait,
 * en arrière-plan (`runExternalSiteRead`) ; le praticien relit et corrige
 * (`saveExternalOverrides`) puis choisit que ses outils s'appuient dessus
 * (`setExternalSiteActive`). Les outils lisent alors `loadExternalReference`.
 * Si le site refuse la lecture, le praticien colle le texte de ses pages
 * (`submitExternalSiteText`). Un site connecté est relu chaque mois
 * (`refreshExternalSites`) ; les corrections ne sont jamais écrasées.
 *
 * Règles :
 * - une opération à la fois par site : chaque écriture se fait dans une
 *   transaction ouverte par le verrou consultatif `<siteId>:external-site` ;
 *   le réglage `sites.theme.externalSite` s'écrit en plus sous verrou de la
 *   ligne du site (SELECT … FOR UPDATE), comme les autres réglages du thème ;
 * - la lecture du site et l'extraction du profil se font hors transaction :
 *   leur résultat n'est inscrit que si la ligne est restée telle que la
 *   lecture l'a trouvée (une nouvelle lecture, un changement d'adresse ou une
 *   déconnexion survenus entre-temps l'emportent) ;
 * - une lecture aboutie reste la référence jusqu'à ce qu'une autre la
 *   remplace : pendant une relecture, et si elle échoue, les outils gardent
 *   le profil précédent. L'échec est alors gardé à part (`error`), le site
 *   reste « prêt » ; seule une première lecture en échec donne un site en
 *   « erreur ». `source` dit d'où vient ce qui est enregistré, pas la nature
 *   de la dernière tentative ;
 * - l'adresse retenue vit à deux endroits, la ligne et le réglage du site :
 *   ils changent toujours ensemble ; un réglage actif ne survit jamais à un
 *   changement de site (le praticien relit le nouveau profil, puis réactive) ;
 * - quota : EXTERNAL_SITE_LIMITS.readsPerMonth lectures lancées par le
 *   praticien, par site et par mois, comptées dans `google_usage` (kind
 *   EXTERNAL_READ_USAGE_KIND, coût 0 : rien n'entre dans le budget Google) ;
 *   le texte collé et la relecture mensuelle ne sont pas comptés ;
 * - tout est tolérant à l'absence de la table (migration 0009 non
 *   appliquée) : les lectures rendent « indisponible », jamais d'erreur ;
 * - journaux : identifiant du site et code d'échec seulement — jamais le
 *   contenu des pages, ni une adresse, ni une donnée personnelle.
 */

import { createHash, randomInt } from "node:crypto";
import { and, eq, gte, inArray, isNotNull, isNull, lt, lte, or, sql } from "drizzle-orm";
import { createExternalProfileExtractor, type ExternalProfileExtractor, type ExternalProfileInput } from "@theralys/ai";
import { externalSites, googleUsage, prospects, sites, type Database, type ExternalSiteRow, type Site } from "@theralys/db";
import { createWebsiteReader, pastedTextToPages, type WebsiteReader } from "@theralys/providers/website";
import {
  EXTERNAL_READ_ERRORS,
  EXTERNAL_READ_USAGE_KIND,
  EXTERNAL_SITE_LIMITS,
  FOOTER_SOCIAL_NETWORKS,
  activeExternalSite,
  bareHost,
  cleanBookingUrl,
  cleanExternalOverrides,
  cleanExternalProfile,
  externalBriefPages,
  externalProfileGaps,
  isExternalProfileUsable,
  isExternalReadError,
  isSameSiteHost,
  mergeExternalProfile,
  normalizeExternalSiteUrl,
  referenceSiteUrl,
  usageMonthKey,
  type ExternalPageKind,
  type ExternalProfileOverrides,
  type ExternalReadError,
  type ExternalSiteFacts,
  type ExternalSitePage,
  type ExternalSiteProfile,
  type ExternalSiteSetting,
  type ExternalSiteSource,
  type ExternalSiteStatus,
  type SiteSocialLinks,
  type SiteTheme,
  type SocialBriefInput,
} from "@theralys/shared";
import { usageErrorText, withApiUsage } from "@theralys/shared/usage-runtime";
import type { DbExecutor, DbTransaction } from "./google-profile";
// Table ou colonne absente (migration non appliquée) : même détection que pour la bibliothèque Meta Ads
import { isMetaLibrarySchemaMissing as isSchemaMissing } from "./meta-library";

/** Dépendances injectables (tests, démonstration). */
export type ExternalSiteDeps = {
  reader?: WebsiteReader;
  extractor?: ExternalProfileExtractor;
  now?: Date;
  env?: NodeJS.ProcessEnv;
  /** Échéance de la tâche planifiée : passé cet instant, `refreshExternalSites` n'entame plus aucun site. */
  deadline?: Date;
};

/** État du site du client pour l'écran « Mon site » du studio. */
export type ExternalSiteView = {
  url: string;
  /**
   * `ready` : une lecture a abouti, son profil est celui qui est montré —
   * même si une lecture plus récente a échoué (`error` le dit alors).
   * `error` : la première lecture a échoué, rien n'a encore été lu.
   */
  status: ExternalSiteStatus;
  /** Une lecture est en cours (et n'a pas été interrompue) */
  reading: boolean;
  /** Origine de ce qui est enregistré : pages lues sur le site, ou texte collé */
  source: ExternalSiteSource;
  /**
   * Échec de la dernière lecture, jusqu'à ce qu'une lecture aboutisse. Avec
   * `status: "ready"` : « la dernière lecture a échoué, le profil précédent
   * est conservé ».
   */
  error: ExternalReadError | null;
  /** Dernière lecture aboutie : celle dont viennent les pages et le profil montrés */
  readAt: Date | null;
  /** Les outils s'appuient sur ce site */
  active: boolean;
  keepHostedIndexed: boolean;
  pages: { url: string; kind: ExternalPageKind; title: string }[];
  facts: ExternalSiteFacts;
  /** Profil lu sur le site */
  extracted: ExternalSiteProfile | null;
  /** Corrections du praticien */
  overrides: ExternalProfileOverrides | null;
  /** Profil effectif : lu, puis corrigé */
  profile: ExternalSiteProfile;
  /** Le profil suffit pour que les outils s'appuient dessus */
  usable: boolean;
  /** Ce qui manque au profil, dit au praticien */
  gaps: string[];
  measure: {
    /** Clé publique du code de mesure */
    key: string;
    /** Première visite reçue du site (code installé et actif) */
    seenAt: Date | null;
    /** Le code a été repéré dans les pages à la dernière lecture */
    detectedOnSite: boolean;
  };
  /** Lectures lancées ce mois-ci et plafond mensuel */
  reads: { used: number; limit: number };
};

/** `available: false` : la table n'existe pas encore (migration 0009 non appliquée). `site: null` : aucun site connecté. */
export type ExternalSiteState = { available: false } | { available: true; site: ExternalSiteView | null };

/**
 * Motif d'un refus : `url` adresse refusée · `consent` confirmation « ce site
 * est le mien » absente · `quota` lectures du mois épuisées · `busy` lecture
 * déjà en cours · `text` texte collé trop court, trop long ou inexploitable ·
 * `not_ready` site pas encore lu ou profil incomplet · `unavailable` rien à
 * traiter pour l'instant (table pas encore créée, aucun site connecté,
 * extraction en panne).
 */
export type ExternalSiteRefusal = "url" | "consent" | "quota" | "busy" | "text" | "not_ready" | "unavailable";
/** Issue d'une action : en cas de refus, `message` est prêt à être montré au praticien. */
export type ExternalSiteResult = { ok: true } | { ok: false; reason: ExternalSiteRefusal; message: string };

/** Ce que les outils lisent quand le site du client est la référence. */
export type ExternalReference = { setting: ExternalSiteSetting; profile: ExternalSiteProfile; facts: ExternalSiteFacts };

// ─── Réglages ────────────────────────────────────────────────────────────────

/**
 * Durée accordée à une lecture du site (ms), la même pour une lecture lancée
 * par le praticien et pour la relecture mensuelle : une lecture écourtée
 * ramènerait moins de pages et passerait pour un changement du site. Avec
 * l'extraction du profil, le tout reste bien sous
 * EXTERNAL_SITE_LIMITS.readStaleMs.
 */
export const EXTERNAL_READ_DEADLINE_MS = 90_000;
/** Sites relus au plus par passage de la tâche planifiée. */
export const EXTERNAL_REFRESH_BATCH = 5;
/** Temps au plus consacré aux relectures d'un passage (ms) : la tâche est la dernière du cron quotidien. */
export const EXTERNAL_REFRESH_BUDGET_MS = 300_000;

const DAY_MS = 86_400_000;
const ERROR_DETAIL_MAX = 300;
const LOG = "[site-client]";

const formatCount = (count: number): string => new Intl.NumberFormat("fr-FR").format(count);

const MESSAGES = {
  consent: "Confirmez que ce site est bien le vôtre et que vous autorisez sa lecture.",
  busy: "Une lecture de votre site est déjà en cours. Patientez quelques instants avant de recommencer.",
  busyOverrides: "Une lecture de votre site est en cours. Vous pourrez enregistrer vos corrections dès qu'elle sera terminée.",
  superseded: "Votre site a été modifié pendant l'enregistrement de ce texte. Vérifiez son état, puis recommencez si besoin.",
  unavailable: "Cette fonctionnalité est en cours d'activation. Réessayez dans quelques minutes.",
  notConnected: "Aucun site n'est connecté pour le moment. Indiquez d'abord l'adresse de votre site.",
  siteNotFound: "Votre espace est introuvable. Rechargez la page, puis réessayez.",
  textShort: `Ce texte est trop court pour en tirer un profil. Collez au moins ${formatCount(EXTERNAL_SITE_LIMITS.pastedMinChars)} caractères : votre page d'accueil et vos pages de spécialité, par exemple.`,
  textLong: `Ce texte est trop long. Gardez l'essentiel de vos pages : ${formatCount(EXTERNAL_SITE_LIMITS.pastedMaxChars)} caractères au plus.`,
  textUnreadable: "Nous n'avons pas trouvé assez de texte dans ce que vous avez collé. Collez le contenu de vos pages : accueil, spécialités, présentation.",
  connectFirst: "Indiquez d'abord l'adresse de votre site : nous le lirons, puis vous pourrez choisir que vos outils s'appuient dessus.",
  stillReading: "La lecture de votre site est en cours. Vous pourrez l'activer dès qu'elle sera terminée.",
  readFailed: "La dernière lecture de votre site n'a pas abouti. Relancez-la, ou collez le texte de vos pages, avant de l'activer.",
} as const;

const refuse = (reason: ExternalSiteRefusal, message: string): ExternalSiteResult => ({ ok: false, reason, message });

/** Message d'un échec de lecture, tel que le contrat le formule : ce qui se passe, puis quoi faire. */
function readErrorMessage(error: ExternalReadError): string {
  const { title, hint } = EXTERNAL_READ_ERRORS[error];
  return `${title}. ${hint}`;
}

function gapsMessage(gaps: string[]): string {
  const missing = gaps.length > 1 ? `${gaps.slice(0, -1).join(", ")} et ${gaps[gaps.length - 1]}` : (gaps[0] ?? "des informations");
  return `Vos outils ne peuvent pas encore s'appuyer sur votre site : il manque ${missing}. Complétez le profil, puis réessayez.`;
}

/**
 * Étiquette d'une erreur pour les journaux : son code (SQLSTATE de la base,
 * code réseau de Node) s'il y en a un, sinon son type. Jamais son message :
 * il peut reprendre un extrait de page, une adresse ou les paramètres d'une
 * requête.
 */
function errorName(err: unknown): string {
  let current: unknown = err;
  for (let depth = 0; depth < 5 && current instanceof Error; depth++) {
    const code = (current as Error & { code?: unknown }).code;
    if (typeof code === "string" && /^[A-Z0-9_]{3,24}$/.test(code)) return code;
    current = current.cause;
  }
  return err instanceof Error ? err.name : typeof err;
}

// ─── Hôtes et adresses ───────────────────────────────────────────────────────

/** Hôte d'une adresse ou d'un nom d'hôte de configuration (`https://app.exemple.fr/`, `demo.exemple.fr`, `localhost:3000`). */
function hostOf(value: string): string | null {
  const raw = value.trim();
  if (raw === "") return null;
  try {
    const host = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`).hostname.toLowerCase().replace(/\.$/, "");
    return host === "" ? null : host;
  } catch {
    return null;
  }
}

/**
 * Hôtes du site hébergé (domaine du site, hôte de base des sites, hôte du
 * studio) : jamais acceptés comme « site du client ». Connecter le site
 * hébergé à lui-même ferait lire au studio ses propres pages et masquerait
 * le site des moteurs de recherche au profit… de lui-même.
 */
export function hostedHostsOf(site: Pick<Site, "domain">, env: NodeJS.ProcessEnv = process.env): string[] {
  const hosts = new Set<string>();
  for (const value of [site.domain, env.SITES_BASE_URL, env.DEMO_HOST, env.STUDIO_BASE_URL]) {
    for (const part of (value ?? "").split(/[\s,]+/)) {
      const host = hostOf(part);
      if (host) hosts.add(host);
    }
  }
  return [...hosts];
}

const pathOf = (url: URL): string => url.pathname.replace(/\/+$/, "");

/**
 * Les deux adresses désignent-elles le même site : même hôte (« www. »
 * ignoré) et même chemin ? Relire `mon-cabinet.fr` quand la ligne porte
 * `www.mon-cabinet.fr` est une relecture, pas un changement de site : les
 * corrections du praticien restent.
 */
function isSameAddress(a: string, b: string): boolean {
  try {
    const left = new URL(a);
    const right = new URL(b);
    return bareHost(left.hostname) === bareHost(right.hostname) && pathOf(left) === pathOf(right);
  } catch {
    return false;
  }
}

/**
 * Adresse à retenir après une lecture : l'hôte réellement servi quand le
 * site répond sur l'autre variante (avec ou sans « www. »), le chemin donné
 * par le praticien. Le chemin d'une redirection interne (`/accueil`, `/fr`)
 * n'est pas repris : l'adresse retenue sert de base aux liens et aux pages
 * d'atterrissage, elle doit rester la racine du site.
 */
function servedAddress(current: string, served: string, ownHosts: readonly string[]): string {
  const check = normalizeExternalSiteUrl(served, { ownHosts });
  if (!check.ok || !isSameSiteHost(check.url, current)) return current;
  try {
    const next = normalizeExternalSiteUrl(`https://${check.host}${pathOf(new URL(current))}`, { ownHosts });
    return next.ok ? next.url : current;
  } catch {
    return current;
  }
}

// ─── Clé de mesure, empreinte, faits ─────────────────────────────────────────

const MEASURE_KEY_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const MEASURE_KEY_LENGTH = 24;

/**
 * Clé publique du code de mesure (EXTERNAL_MEASURE_KEY) : elle figure dans la
 * balise collée sur le site du client et désigne son site à la réception des
 * visites — tirée d'une source cryptographique pour ne pas être devinable.
 */
export function newExternalMeasureKey(): string {
  let key = "";
  for (let i = 0; i < MEASURE_KEY_LENGTH; i++) key += MEASURE_KEY_ALPHABET.charAt(randomInt(MEASURE_KEY_ALPHABET.length));
  return key;
}

const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");

/** Forme canonique d'une valeur JSON : clés triées, listes triées — deux lectures du même contenu donnent le même texte. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => JSON.stringify(canonical(item))).sort();
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, item]) => [key, canonical(item)]),
    );
  }
  return value;
}

/**
 * Empreinte de ce qui a été lu sur le site (texte de chaque page et faits
 * relevés), indépendante de l'ordre de lecture et des dates. La relecture
 * mensuelle la compare à celle de la lecture précédente : identique, le site
 * n'a pas changé et le profil n'est pas extrait de nouveau.
 */
export function externalContentHash(pages: readonly ExternalSitePage[], facts: ExternalSiteFacts): string {
  const texts = pages.map((page) => `${page.url}\n${page.hash || sha256(page.text)}`).sort();
  return sha256(JSON.stringify([texts, canonical(facts)]));
}

/** Faits complets : une ligne ancienne ou une lecture partielle ne doit faire échouer ni l'écran ni les outils. */
function completeFacts(facts: ExternalSiteFacts | null | undefined): ExternalSiteFacts {
  return {
    ...facts,
    phones: facts?.phones ?? [],
    emails: facts?.emails ?? [],
    hours: facts?.hours ?? [],
    bookingLinks: facts?.bookingLinks ?? [],
    social: facts?.social ?? {},
    tags: facts?.tags ?? {},
  };
}

const textLength = (pages: readonly ExternalSitePage[]): number => pages.reduce((total, page) => total + page.text.trim().length, 0);

// ─── Accès à la base ─────────────────────────────────────────────────────────

async function loadRow(db: DbExecutor, siteId: string): Promise<ExternalSiteRow | null> {
  const [row] = await db.select().from(externalSites).where(eq(externalSites.siteId, siteId)).limit(1);
  return row ?? null;
}

/** Une lecture est-elle en cours ? Commencée depuis plus de EXTERNAL_SITE_LIMITS.readStaleMs, elle est tenue pour interrompue. */
function isReadInProgress(row: Pick<ExternalSiteRow, "status" | "readStartedAt">, now: Date): boolean {
  return row.status === "reading" && row.readStartedAt !== null && now.getTime() - row.readStartedAt.getTime() < EXTERNAL_SITE_LIMITS.readStaleMs;
}

/**
 * Une lecture précédente a-t-elle abouti (date et profil enregistrés) ? Elle
 * reste alors la référence quoi qu'il arrive à la lecture suivante.
 */
function hasPreviousRead(row: Pick<ExternalSiteRow, "readAt" | "profile">): boolean {
  return row.readAt !== null && row.profile !== null && row.profile !== undefined;
}

/**
 * État montré au praticien. Un site « prêt » peut porter l'échec de sa
 * dernière lecture (le profil précédent est conservé). Une lecture
 * interrompue (processus arrêté en route) compte comme un échec `internal` :
 * le site est « prêt » si une lecture avait déjà abouti, « en erreur » sinon —
 * exactement ce que `failRead` aurait inscrit.
 */
function effectiveStatus(row: Pick<ExternalSiteRow, "status" | "readStartedAt" | "error" | "readAt" | "profile">, now: Date): { status: ExternalSiteStatus; error: ExternalReadError | null } {
  const recorded: ExternalReadError | null = row.error === null ? null : isExternalReadError(row.error) ? row.error : "internal";
  if (row.status === "ready") return { status: "ready", error: recorded };
  if (isReadInProgress(row, now)) return { status: "reading", error: null };
  if (row.status === "error") return { status: "error", error: recorded ?? "internal" };
  return { status: hasPreviousRead(row) ? "ready" : "error", error: "internal" };
}

/**
 * Lectures lancées par le praticien ce mois-ci pour un site (registre des
 * quotas `google_usage`, kind EXTERNAL_READ_USAGE_KIND). Ces lignes ont un
 * coût nul : elles ne pèsent jamais sur le budget Google du site.
 */
export async function externalReadsUsed(db: DbExecutor, siteId: string, now = new Date()): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`count(*)`.mapWith(Number) })
    .from(googleUsage)
    .where(and(eq(googleUsage.siteId, siteId), eq(googleUsage.month, usageMonthKey(now)), eq(googleUsage.kind, EXTERNAL_READ_USAGE_KIND)));
  return Number(row?.total ?? 0);
}

/** Verrou consultatif du site du client, tenu jusqu'à la fin de la transaction : une opération à la fois par site. */
async function lockExternalSite(tx: DbTransaction, siteId: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${siteId}:external-site`}))`);
}

type LockedSite = { theme: SiteTheme; bookingUrl: string | null };

/** Ligne du site sous verrou (SELECT … FOR UPDATE) : le thème réécrit ensuite part de l'état le plus frais. */
async function lockSite(tx: DbTransaction, siteId: string): Promise<LockedSite | null> {
  const [row] = await tx.select({ theme: sites.theme, bookingUrl: sites.bookingUrl }).from(sites).where(eq(sites.id, siteId)).for("update");
  return row ?? null;
}

function settingOf(url: string, active: boolean, keepHostedIndexed: boolean): ExternalSiteSetting {
  return { url, active, ...(keepHostedIndexed ? { keepHostedIndexed: true } : {}) };
}

/**
 * L'adresse retenue change : le réglage du site, s'il existe, la suit dans la
 * même transaction. `deactivate` : l'adresse désigne un autre site, les
 * outils cessent de s'appuyer dessus tant que le praticien n'a pas relu le
 * nouveau profil. Sans réglage, rien n'est créé : il naît à l'activation.
 */
async function moveSetting(tx: DbTransaction, siteId: string, url: string, deactivate: boolean, now: Date): Promise<void> {
  const site = await lockSite(tx, siteId);
  const setting = site?.theme.externalSite;
  if (!site || !setting) return;
  const active = deactivate ? false : setting.active;
  if (setting.url === url && setting.active === active) return;
  await tx
    .update(sites)
    .set({ theme: { ...site.theme, externalSite: { ...setting, url, active } }, updatedAt: now })
    .where(eq(sites.id, siteId));
}

/** Ce qui a été lu et compris d'un autre site ne vaut plus pour la nouvelle adresse ; la clé de mesure, elle, reste. */
const OTHER_SITE_RESET = {
  pages: [],
  facts: null,
  profile: null,
  overrides: null,
  contentHash: null,
  readAt: null,
  checkedAt: null,
  measureSeenAt: null,
} satisfies Partial<typeof externalSites.$inferInsert>;

/**
 * Passe le site en « lecture en cours » (sous verrou) : ligne créée avec sa
 * clé de mesure, ou mise à jour. Une adresse qui désigne un autre site efface
 * ce qui avait été lu et les corrections du praticien, et désactive le
 * réglage ; la même adresse (ou sa variante « www. ») garde tout : ce qui
 * avait été lu reste en place, avec son origine (`source`), tant que la
 * nouvelle lecture n'a pas abouti. Rend `true` si une lecture précédente
 * aboutie est ainsi conservée.
 */
async function startRead(tx: DbTransaction, siteId: string, row: ExternalSiteRow | null, url: string, source: ExternalSiteSource, now: Date): Promise<boolean> {
  if (!row) {
    await tx
      .insert(externalSites)
      .values({ siteId, url, status: "reading", source, readStartedAt: now, consentAt: now, measureKey: newExternalMeasureKey(), createdAt: now, updatedAt: now });
    // Un réglage resté d'une connexion antérieure ne vaut pas pour ce site : il suit l'adresse et attend une nouvelle activation
    await moveSetting(tx, siteId, url, true, now);
    return false;
  }
  const sameSite = isSameAddress(row.url, url);
  await tx
    .update(externalSites)
    .set({ url, status: "reading", readStartedAt: now, consentAt: now, error: null, errorDetail: null, updatedAt: now, ...(sameSite ? {} : { ...OTHER_SITE_RESET, source }) })
    .where(eq(externalSites.id, row.id));
  if (row.url !== url) await moveSetting(tx, siteId, url, !sameSite, now);
  return sameSite && hasPreviousRead(row);
}

/**
 * Une lecture en cours, désignée par son site et l'instant de son début.
 * `hasPrevious` : une lecture précédente a abouti et reste en place — si
 * celle-ci échoue, le site redevient « prêt » avec le profil précédent.
 */
type ReadAttempt = { siteId: string; startedAt: Date; hasPrevious: boolean };

/**
 * Condition « la colonne porte cet instant », à la milliseconde : une date
 * JavaScript n'a pas la précision d'un horodatage PostgreSQL, une égalité
 * stricte manquerait une valeur écrite par la base.
 */
function sameInstant(column: typeof externalSites.readStartedAt | typeof externalSites.readAt, instant: Date | null) {
  return instant === null ? isNull(column) : and(gte(column, instant), lt(column, new Date(instant.getTime() + 1)));
}

/** La ligne est-elle toujours en train d'attendre le résultat de cette lecture ? */
function sameAttempt(attempt: ReadAttempt) {
  return and(eq(externalSites.siteId, attempt.siteId), eq(externalSites.status, "reading"), sameInstant(externalSites.readStartedAt, attempt.startedAt));
}

type ReadContent = { url: string; source: ExternalSiteSource; pages: ExternalSitePage[]; facts: ExternalSiteFacts; profile: ExternalSiteProfile };

/**
 * Inscrit le résultat d'une lecture lancée par le praticien : pages, faits,
 * profil, origine, empreinte, état « prêt » — et l'échec d'une lecture
 * antérieure est effacé. Sans effet (false) si la ligne n'attend plus cette
 * lecture. Les corrections du praticien ne sont pas touchées.
 */
async function storeRead(db: Database, attempt: ReadAttempt, previousUrl: string, content: ReadContent, now: Date): Promise<boolean> {
  return db.transaction(async (tx) => {
    await lockExternalSite(tx, attempt.siteId);
    const updated = await tx
      .update(externalSites)
      .set({
        url: content.url,
        status: "ready",
        source: content.source,
        error: null,
        errorDetail: null,
        pages: content.pages,
        facts: content.facts,
        profile: content.profile,
        contentHash: externalContentHash(content.pages, content.facts),
        readAt: now,
        updatedAt: now,
      })
      .where(sameAttempt(attempt))
      .returning({ id: externalSites.id });
    if (updated.length === 0) return false;
    if (content.url !== previousUrl) await moveSetting(tx, attempt.siteId, content.url, false, now);
    return true;
  });
}

/**
 * Inscrit l'échec d'une lecture (code du contrat, détail technique court).
 * Quand une lecture précédente avait abouti, elle reste la référence : pages,
 * faits et profil ne bougent pas, le site redevient « prêt » et l'échec est
 * gardé pour l'écran (« la dernière lecture a échoué, le profil précédent est
 * conservé »). Seule une première lecture en échec laisse le site en
 * « erreur ».
 */
async function failRead(db: Database, attempt: ReadAttempt, error: ExternalReadError, detail: string | undefined, now: Date): Promise<void> {
  console.warn(`${LOG} lecture du site ${attempt.siteId} en échec : ${error}${attempt.hasPrevious ? " (lecture précédente conservée)" : ""}`);
  const errorDetail = (detail ?? "").replace(/\s+/g, " ").trim().slice(0, ERROR_DETAIL_MAX);
  await db
    .update(externalSites)
    .set({ status: attempt.hasPrevious ? "ready" : "error", error, errorDetail: errorDetail === "" ? null : errorDetail, updatedAt: now })
    .where(sameAttempt(attempt));
}

type SiteContext = { domain: string | null; prospectId: string | null };

async function loadSiteContext(db: DbExecutor, siteId: string): Promise<SiteContext | null> {
  const [site] = await db.select({ domain: sites.domain, prospectId: sites.prospectId }).from(sites).where(eq(sites.id, siteId)).limit(1);
  return site ?? null;
}

/** Ce que le studio sait déjà du praticien (sa fiche), donné à l'extracteur pour lever les ambiguïtés. */
async function practitionerOf(db: DbExecutor, prospectId: string | null): Promise<ExternalProfileInput["practitioner"]> {
  if (!prospectId) return null;
  const [prospect] = await db
    .select({ firstName: prospects.firstName, lastName: prospects.lastName, profession: prospects.profession, city: prospects.city })
    .from(prospects)
    .where(eq(prospects.id, prospectId))
    .limit(1);
  return prospect ? { name: `${prospect.firstName} ${prospect.lastName}`.trim(), profession: prospect.profession, city: prospect.city } : null;
}

/** Profil extrait, nettoyé une seconde fois ici : ce qui est enregistré respecte les bornes du contrat quel que soit l'extracteur. */
async function extractProfile(extractor: ExternalProfileExtractor, input: ExternalProfileInput): Promise<ExternalSiteProfile> {
  return cleanExternalProfile(await extractor.extract(input), input.url);
}

// ─── Écran « Mon site » ──────────────────────────────────────────────────────

/**
 * État du site du client d'un site, pour l'écran « Mon site ».
 *
 * `available: false` tant que la table n'existe pas (déploiement avant la
 * migration) : l'écran se présente « en cours d'activation » plutôt qu'en
 * erreur. Une lecture « en cours » depuis plus de
 * EXTERNAL_SITE_LIMITS.readStaleMs est montrée comme un échec `internal` :
 * le processus qui la menait s'est arrêté, le praticien doit pouvoir la
 * relancer. Ce qui est montré (pages, profil, date) est toujours la dernière
 * lecture aboutie : après une relecture en échec le site reste « prêt » et
 * `error` dit ce qui s'est passé. L'interrupteur (`active`,
 * `keepHostedIndexed`) est lu dans le thème du site passé en argument.
 */
export async function loadExternalSite(db: Database, site: Pick<Site, "id" | "theme">, now: Date = new Date()): Promise<ExternalSiteState> {
  let row: ExternalSiteRow | null;
  try {
    row = await loadRow(db, site.id);
  } catch (err) {
    if (!isSchemaMissing(err)) throw err;
    return { available: false };
  }
  if (!row) return { available: true, site: null };
  const used = await externalReadsUsed(db, site.id, now);
  const { status, error } = effectiveStatus(row, now);
  const profile = mergeExternalProfile(row.profile, row.overrides);
  const facts = completeFacts(row.facts);
  return {
    available: true,
    site: {
      url: row.url,
      status,
      reading: status === "reading",
      source: row.source === "pasted" ? "pasted" : "crawl",
      error,
      readAt: row.readAt,
      active: activeExternalSite(site.theme) !== null,
      keepHostedIndexed: site.theme.externalSite?.keepHostedIndexed === true,
      pages: (row.pages ?? []).map((page) => ({ url: page.url, kind: page.kind, title: page.title })),
      facts,
      extracted: row.profile ?? null,
      overrides: row.overrides ?? null,
      profile,
      usable: isExternalProfileUsable(profile),
      gaps: externalProfileGaps(profile),
      measure: { key: row.measureKey, seenAt: row.measureSeenAt, detectedOnSite: facts.tags.measureSnippet === true },
      reads: { used, limit: EXTERNAL_SITE_LIMITS.readsPerMonth },
    },
  };
}

// ─── Lecture lancée par le praticien ─────────────────────────────────────────

/**
 * Enregistre l'adresse (validée, consentement exigé, quota mensuel vérifié)
 * et passe le site en « lecture en cours ». La lecture elle-même est lancée
 * ensuite par `runExternalSiteRead` (en arrière-plan, côté studio).
 *
 * Tout se joue sous le verrou du site, dans une seule transaction : deux
 * envois simultanés ne passent pas tous les deux, et une lecture comptée au
 * quota est toujours une lecture réellement lancée. Changer d'adresse pour
 * un autre site efface ce qui avait été lu et les corrections (elles
 * décrivaient l'ancien site) ; la clé de mesure reste. Relire le même site
 * ne retire rien : les outils gardent le profil précédent le temps de la
 * lecture.
 */
export async function beginExternalSiteRead(db: Database, site: Site, input: { url: string; consent: boolean }, deps: ExternalSiteDeps = {}): Promise<ExternalSiteResult> {
  const now = deps.now ?? new Date();
  const address = normalizeExternalSiteUrl(input.url, { ownHosts: hostedHostsOf(site, deps.env ?? process.env) });
  if (!address.ok) return refuse("url", address.message);
  if (input.consent !== true) return refuse("consent", MESSAGES.consent);
  try {
    return await db.transaction(async (tx): Promise<ExternalSiteResult> => {
      await lockExternalSite(tx, site.id);
      const row = await loadRow(tx, site.id);
      if (row && isReadInProgress(row, now)) return refuse("busy", MESSAGES.busy);
      if ((await externalReadsUsed(tx, site.id, now)) >= EXTERNAL_SITE_LIMITS.readsPerMonth) return refuse("quota", readErrorMessage("quota"));
      await startRead(tx, site.id, row, address.url, "crawl", now);
      await tx.insert(googleUsage).values({ siteId: site.id, month: usageMonthKey(now), kind: EXTERNAL_READ_USAGE_KIND, costUsd: 0, requests: 1, createdAt: now });
      return { ok: true };
    });
  } catch (err) {
    if (!isSchemaMissing(err)) throw err;
    return refuse("unavailable", MESSAGES.unavailable);
  }
}

/**
 * Lit le site puis en extrait le profil, et inscrit le résultat (ou l'échec).
 * Ne lève jamais et ne laisse jamais le site en « lecture en cours » : tout
 * échec est inscrit avec le code du contrat, que le praticien voit. Si une
 * lecture précédente avait abouti, elle reste en place et le site reste
 * « prêt » — une relecture ratée ne retire jamais leur référence aux outils ;
 * seule une première lecture en échec laisse le site en « erreur ». Un profil
 * encore incomplet est enregistré tel quel : le praticien le complète à la
 * main. Si le site répond sur l'autre variante de son adresse (avec ou sans
 * « www. »), c'est elle qui est retenue.
 */
export function runExternalSiteRead(db: Database, siteId: string, deps: ExternalSiteDeps = {}): Promise<void> {
  // Registre des appels API : la lecture et l'extraction sont rattachées à la fonctionnalité et au site
  return withApiUsage({ feature: "client_site", siteId }, () => readAndStore(db, siteId, deps));
}

async function readAndStore(db: Database, siteId: string, deps: ExternalSiteDeps): Promise<void> {
  const clock = () => deps.now ?? new Date();
  let attempt: ReadAttempt | null = null;
  try {
    const row = await loadRow(db, siteId);
    // Rien à mener sans lecture lancée par `beginExternalSiteRead`
    if (!row || row.status !== "reading" || !row.readStartedAt) return;
    attempt = { siteId, startedAt: row.readStartedAt, hasPrevious: hasPreviousRead(row) };
    const env = deps.env ?? process.env;
    const site = await loadSiteContext(db, siteId);
    const reader = deps.reader ?? createWebsiteReader(env);
    const outcome = await reader.read(row.url, { deadlineMs: EXTERNAL_READ_DEADLINE_MS });
    if (!outcome.ok) {
      await failRead(db, attempt, isExternalReadError(outcome.error) ? outcome.error : "internal", outcome.detail, clock());
      return;
    }
    if (textLength(outcome.pages) < EXTERNAL_SITE_LIMITS.minChars) {
      await failRead(db, attempt, "empty", `${outcome.pages.length} page(s), ${textLength(outcome.pages)} caractère(s)`, clock());
      return;
    }
    const facts = completeFacts(outcome.facts);
    const url = servedAddress(row.url, outcome.url, hostedHostsOf({ domain: site?.domain ?? null }, env));
    const extractor = deps.extractor ?? createExternalProfileExtractor(env);
    const profile = await extractProfile(extractor, { url, pages: outcome.pages, facts, practitioner: await practitionerOf(db, site?.prospectId ?? null) });
    const stored = await storeRead(db, attempt, row.url, { url, source: "crawl", pages: outcome.pages, facts, profile }, clock());
    if (!stored) console.warn(`${LOG} lecture du site ${siteId} sans suite : l'état du site a changé entre-temps`);
  } catch (err) {
    if (isSchemaMissing(err)) return;
    console.error(`${LOG} lecture du site ${siteId} interrompue (${errorName(err)})`);
    if (!attempt) return;
    try {
      await failRead(db, attempt, "internal", usageErrorText(err), clock());
    } catch (failure) {
      // La base ne répond plus : la lecture sera tenue pour interrompue passé EXTERNAL_SITE_LIMITS.readStaleMs
      console.error(`${LOG} échec de la lecture du site ${siteId} non inscrit (${errorName(failure)})`);
    }
  }
}

/**
 * Repli quand le site refuse la lecture : le texte collé par le praticien
 * tient lieu de pages lues. Mêmes contrôles que pour une lecture (adresse,
 * consentement, pas de lecture en cours), sans quota : aucune page n'est
 * demandée au site. Le profil est extrait et enregistré dans la foulée ; si
 * l'extraction échoue, l'issue le dit et l'échec est inscrit comme celui
 * d'une lecture : ce qui avait été lu auparavant sur ce site reste en place.
 */
export function submitExternalSiteText(db: Database, site: Site, input: { url: string; text: string; consent: boolean }, deps: ExternalSiteDeps = {}): Promise<ExternalSiteResult> {
  // Registre des appels API : l'extraction est rattachée à la fonctionnalité et au site
  return withApiUsage({ feature: "client_site", siteId: site.id }, () => submitText(db, site, input, deps));
}

async function submitText(db: Database, site: Site, input: { url: string; text: string; consent: boolean }, deps: ExternalSiteDeps): Promise<ExternalSiteResult> {
  const clock = () => deps.now ?? new Date();
  const now = clock();
  const env = deps.env ?? process.env;
  const address = normalizeExternalSiteUrl(input.url, { ownHosts: hostedHostsOf(site, env) });
  if (!address.ok) return refuse("url", address.message);
  if (input.consent !== true) return refuse("consent", MESSAGES.consent);
  const text = typeof input.text === "string" ? input.text.trim() : "";
  if (text.length < EXTERNAL_SITE_LIMITS.pastedMinChars) return refuse("text", MESSAGES.textShort);
  if (text.length > EXTERNAL_SITE_LIMITS.pastedMaxChars) return refuse("text", MESSAGES.textLong);
  // Le texte devient des pages avant toute écriture : un texte inexploitable ne change rien à l'état du site
  let pages: ExternalSitePage[];
  try {
    pages = pastedTextToPages(text, address.url, now);
  } catch (err) {
    console.error(`${LOG} texte collé pour le site ${site.id} : mise en pages interrompue (${errorName(err)})`);
    return refuse("unavailable", readErrorMessage("internal"));
  }
  if (textLength(pages) === 0) return refuse("text", MESSAGES.textUnreadable);

  let attempt: ReadAttempt;
  try {
    const started = await db.transaction(async (tx): Promise<ReadAttempt | null> => {
      await lockExternalSite(tx, site.id);
      const row = await loadRow(tx, site.id);
      if (row && isReadInProgress(row, now)) return null;
      const hasPrevious = await startRead(tx, site.id, row, address.url, "pasted", now);
      return { siteId: site.id, startedAt: now, hasPrevious };
    });
    if (!started) return refuse("busy", MESSAGES.busy);
    attempt = started;
  } catch (err) {
    if (!isSchemaMissing(err)) throw err;
    return refuse("unavailable", MESSAGES.unavailable);
  }

  try {
    // Un texte collé ne porte ni balise ni lien relevé dans le code des pages
    const facts = completeFacts(null);
    const extractor = deps.extractor ?? createExternalProfileExtractor(env);
    const profile = await extractProfile(extractor, { url: address.url, pages, facts, practitioner: await practitionerOf(db, site.prospectId) });
    const stored = await storeRead(db, attempt, address.url, { url: address.url, source: "pasted", pages, facts, profile }, clock());
    return stored ? { ok: true } : refuse("busy", MESSAGES.superseded);
  } catch (err) {
    console.error(`${LOG} texte collé pour le site ${site.id} : extraction interrompue (${errorName(err)})`);
    try {
      await failRead(db, attempt, "internal", usageErrorText(err), clock());
    } catch (failure) {
      console.error(`${LOG} échec non inscrit pour le site ${site.id} (${errorName(failure)})`);
    }
    return refuse("unavailable", readErrorMessage("internal"));
  }
}

// ─── Corrections, activation, déconnexion ────────────────────────────────────

/**
 * Enregistre les corrections du praticien (nettoyées), sans toucher au profil
 * lu : une relecture du site remplace ce qui a été lu, jamais ce que le
 * praticien a corrigé. Refusé pendant une lecture en cours, qui peut être en
 * train de changer de site.
 */
export async function saveExternalOverrides(db: Database, siteId: string, overrides: unknown): Promise<ExternalSiteResult> {
  const now = new Date();
  try {
    return await db.transaction(async (tx): Promise<ExternalSiteResult> => {
      await lockExternalSite(tx, siteId);
      const row = await loadRow(tx, siteId);
      if (!row) return refuse("unavailable", MESSAGES.notConnected);
      if (isReadInProgress(row, now)) return refuse("busy", MESSAGES.busyOverrides);
      const cleaned = cleanExternalOverrides(overrides, row.url);
      await tx
        .update(externalSites)
        .set({ overrides: Object.keys(cleaned).length > 0 ? cleaned : null, updatedAt: now })
        .where(eq(externalSites.id, row.id));
      return { ok: true };
    });
  } catch (err) {
    if (!isSchemaMissing(err)) throw err;
    return refuse("unavailable", MESSAGES.unavailable);
  }
}

/** Lien de réseau social tel que les réglages du site l'acceptent (pied de page : https, hôte du réseau ou sous-domaine, 300 caractères au plus). */
function footerSocialLink(host: string, url: string | undefined): string | null {
  const value = (url ?? "").trim();
  if (value === "" || value.length > 300 || !/^https:\/\//i.test(value)) return null;
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname === host || hostname.endsWith(`.${host}`) ? value : null;
  } catch {
    return null;
  }
}

/** Réseaux sociaux du site complétés par ceux trouvés sur le site du client : seuls les réseaux restés vides sont remplis. */
function completedSocial(current: SiteSocialLinks | undefined, found: SiteSocialLinks): SiteSocialLinks | undefined {
  const next: SiteSocialLinks = { ...current };
  let added = false;
  for (const network of FOOTER_SOCIAL_NETWORKS) {
    if ((next[network.key] ?? "").trim() !== "") continue;
    const link = footerSocialLink(network.host, found[network.key]);
    if (!link) continue;
    next[network.key] = link;
    added = true;
  }
  return added ? next : current;
}

/**
 * Fait du site du client la référence des outils, ou y renonce. À
 * l'activation, le lien de rendez-vous et les réseaux sociaux trouvés sur le
 * site complètent les réglages restés vides (jamais d'écrasement).
 *
 * L'activation exige un site lu et un profil exploitable : sans cela les
 * outils n'auraient rien sur quoi s'appuyer. Renoncer garde la lecture et les
 * corrections : le praticien peut réactiver sans relire son site. Sans
 * `keepHostedIndexed`, le choix déjà enregistré est conservé.
 */
export async function setExternalSiteActive(db: Database, siteId: string, input: { active: boolean; keepHostedIndexed?: boolean }): Promise<ExternalSiteResult> {
  const now = new Date();
  try {
    return await db.transaction(async (tx): Promise<ExternalSiteResult> => {
      await lockExternalSite(tx, siteId);
      const site = await lockSite(tx, siteId);
      if (!site) return refuse("unavailable", MESSAGES.siteNotFound);
      const row = await loadRow(tx, siteId);
      const previous = site.theme.externalSite;
      const keepHostedIndexed = input.keepHostedIndexed ?? previous?.keepHostedIndexed ?? false;

      if (!input.active) {
        const url = row?.url ?? previous?.url;
        // Rien n'est connecté : rien à désactiver
        if (url === undefined) return { ok: true };
        await tx
          .update(sites)
          .set({ theme: { ...site.theme, externalSite: settingOf(url, false, keepHostedIndexed) }, updatedAt: now })
          .where(eq(sites.id, siteId));
        return { ok: true };
      }

      if (!row) return refuse("not_ready", MESSAGES.connectFirst);
      const { status } = effectiveStatus(row, now);
      if (status === "reading") return refuse("not_ready", MESSAGES.stillReading);
      if (status === "error") return refuse("not_ready", MESSAGES.readFailed);
      // Le profil effectif : ce que le praticien a corrigé l'emporte sur ce qui a été lu
      const profile = mergeExternalProfile(row.profile, row.overrides);
      if (!isExternalProfileUsable(profile)) return refuse("not_ready", gapsMessage(externalProfileGaps(profile)));

      const social = completedSocial(site.theme.social, profile.social);
      const bookingUrl = (site.bookingUrl ?? "").trim() === "" ? cleanBookingUrl(profile.bookingUrl) : undefined;
      await tx
        .update(sites)
        .set({
          theme: { ...site.theme, ...(social ? { social } : {}), externalSite: settingOf(row.url, true, keepHostedIndexed) },
          ...(bookingUrl ? { bookingUrl } : {}),
          updatedAt: now,
        })
        .where(eq(sites.id, siteId));
      return { ok: true };
    });
  } catch (err) {
    if (!isSchemaMissing(err)) throw err;
    return refuse("unavailable", MESSAGES.unavailable);
  }
}

/**
 * Oublie le site du client : réglage retiré, lecture et corrections
 * supprimées. Les outils retrouvent aussitôt le site hébergé. Le décompte
 * des lectures du mois reste : se déconnecter puis se reconnecter ne rend
 * pas de lectures.
 */
export async function disconnectExternalSite(db: Database, siteId: string): Promise<ExternalSiteResult> {
  const now = new Date();
  try {
    await db.transaction(async (tx) => {
      await lockExternalSite(tx, siteId);
      await tx.delete(externalSites).where(eq(externalSites.siteId, siteId));
      const site = await lockSite(tx, siteId);
      if (!site?.theme.externalSite) return;
      const { externalSite: _removed, ...theme } = site.theme;
      await tx.update(sites).set({ theme, updatedAt: now }).where(eq(sites.id, siteId));
    });
    return { ok: true };
  } catch (err) {
    if (!isSchemaMissing(err)) throw err;
    return refuse("unavailable", MESSAGES.unavailable);
  }
}

// ─── Ce que lisent les outils ────────────────────────────────────────────────

/**
 * Référence des outils : profil effectif et faits du site du client dès que
 * le réglage est actif et qu'un profil exploitable est enregistré, sinon
 * `null` (les outils lisent alors le site hébergé). `null` aussi tant que la
 * table n'existe pas.
 *
 * L'état de la dernière tentative ne compte pas : pendant une relecture, ou
 * après une relecture en échec, ce qui est enregistré est toujours la
 * dernière lecture aboutie — les outils ne retombent pas sur le site hébergé
 * parce que le site du client a mis du temps à répondre. Pendant une
 * première lecture rien n'est enregistré : `null`.
 *
 * Sans réglage actif, aucune requête n'est faite : un site qui n'a pas
 * connecté le sien ne paie rien. Un profil devenu inexploitable, ou une ligne
 * qui ne décrit pas le site du réglage, rendent `null` : les outils ne
 * s'appuient jamais sur un état douteux.
 */
export async function loadExternalReference(db: Database, site: Pick<Site, "id" | "theme">): Promise<ExternalReference | null> {
  const setting = activeExternalSite(site.theme);
  if (!setting) return null;
  try {
    const [row] = await db
      .select({ url: externalSites.url, profile: externalSites.profile, overrides: externalSites.overrides, facts: externalSites.facts })
      .from(externalSites)
      .where(eq(externalSites.siteId, site.id))
      .limit(1);
    if (!row || !isSameAddress(row.url, setting.url)) return null;
    const profile = mergeExternalProfile(row.profile, row.overrides);
    if (!isExternalProfileUsable(profile)) return null;
    return { setting, profile, facts: completeFacts(row.facts) };
  } catch (err) {
    if (!isSchemaMissing(err)) throw err;
    return null;
  }
}

/** Ce que le brief d'un site reçoit du site lui-même : ses pages, ses adresses et son thème. */
export type BriefSiteSource = {
  /** Pages données au brief : le profil du site du client converti en pages, ou les pages du site hébergé */
  pages: SocialBriefInput["pages"];
  /** Adresse publique de référence (site du client s'il est la référence, sinon site hébergé), avec protocole */
  url: string;
  /** Adresse du site hébergé, où vivent les articles du blog */
  hostedUrl: string;
  /** Thème donné au brief (il n'y lit que les pages de spécialité désactivées) */
  theme: SiteTheme;
  /** Référence active (site du client), sinon `null` */
  reference: ExternalReference | null;
};

/**
 * Pages et adresses à donner à `buildSocialBrief` : la règle unique des deux
 * chargeurs de brief (`loadGoogleBrief` côté jobs, `loadSocialBrief` côté
 * studio). Quand le site du client est la référence : son profil converti en
 * pages (`externalBriefPages`), les photos d'accueil et « à propos » du site
 * hébergé gardées au catalogue (elles ont déjà été admises par le studio),
 * et l'adresse du site du client — c'est aussi elle qui sert de source aux
 * spécialités sans page à elles (pas de lien vers une page qui n'existe pas
 * sur ce site). Sinon : les pages et l'adresse du site hébergé, comme avant.
 * Dans les deux cas `hostedUrl` reste l'adresse du site hébergé : c'est là
 * que vivent les articles du blog.
 *
 * Les pages de spécialité désactivées sont une notion du site hébergé : elles
 * ne masquent pas une spécialité du site du client qui porterait le même nom.
 *
 * `hostedUrl` : adresse du site hébergé (`siteUrl(site)` de l'appelant).
 */
export async function briefPagesFor(db: Database, site: Pick<Site, "id" | "theme">, hostedPages: SocialBriefInput["pages"], hostedUrl: string): Promise<BriefSiteSource> {
  const reference = await loadExternalReference(db, site);
  if (!reference) return { pages: hostedPages, url: hostedUrl, hostedUrl, theme: site.theme, reference: null };
  const home = hostedPages.find((page) => page.type === "home");
  const imageOf = (type: "hero" | "about"): string | undefined => {
    const section = home?.sections.find((candidate) => candidate.type === type);
    return section && "imageUrl" in section ? section.imageUrl : undefined;
  };
  return {
    pages: externalBriefPages(reference.profile, { siteUrl: reference.setting.url, images: { hero: imageOf("hero"), about: imageOf("about") } }),
    url: referenceSiteUrl(hostedUrl, site.theme),
    hostedUrl,
    theme: { ...site.theme, disabledMotifs: [] },
    reference,
  };
}

// ─── Relecture mensuelle ─────────────────────────────────────────────────────

const lastSeenAt = (row: { readAt: Date | null; checkedAt: Date | null }): number | null => {
  const times = [row.readAt, row.checkedAt].filter((date): date is Date => date !== null).map((date) => date.getTime());
  return times.length > 0 ? Math.max(...times) : null;
};

/**
 * Sites à relire : ceux dont la dernière lecture aboutie et le dernier
 * contrôle datent de EXTERNAL_SITE_LIMITS.refreshDays jours ou plus, les plus
 * anciens d'abord (jamais contrôlés en tête), au plus `batch`. Un contrôle en
 * échec compte : un site en panne n'est pas relu chaque jour.
 */
export function selectDueExternalSites<T extends { readAt: Date | null; checkedAt: Date | null }>(rows: readonly T[], now: Date, batch = EXTERNAL_REFRESH_BATCH): T[] {
  const dueBefore = now.getTime() - EXTERNAL_SITE_LIMITS.refreshDays * DAY_MS;
  return rows
    .map((row) => ({ row, seen: lastSeenAt(row) }))
    .filter(({ seen }) => seen === null || seen <= dueBefore)
    .sort((a, b) => (a.seen ?? -Infinity) - (b.seen ?? -Infinity))
    .slice(0, Math.max(0, batch))
    .map(({ row }) => row);
}

type RefreshCandidate = { siteId: string; readAt: Date | null; checkedAt: Date | null };

/** Sites connectés, actifs et lus sur le site (pas un texte collé), dus pour une relecture. Les sites archivés ne sont plus lus. */
async function dueExternalSites(db: Database, now: Date): Promise<RefreshCandidate[]> {
  const rows = await db
    .select({ siteId: externalSites.siteId, url: externalSites.url, readAt: externalSites.readAt, checkedAt: externalSites.checkedAt })
    .from(externalSites)
    .where(and(eq(externalSites.status, "ready"), eq(externalSites.source, "crawl")));
  if (rows.length === 0) return [];
  // L'interrupteur vit dans le thème du site (JSONB) : il est lu ici, sur les seuls sites connectés
  const owners = await db
    .select({ id: sites.id, status: sites.status, theme: sites.theme })
    .from(sites)
    .where(inArray(sites.id, rows.map((row) => row.siteId)));
  const ownerById = new Map(owners.map((owner) => [owner.id, owner]));
  const active = rows.filter((row) => {
    const owner = ownerById.get(row.siteId);
    const setting = owner && owner.status !== "archived" ? activeExternalSite(owner.theme) : null;
    return setting !== null && isSameAddress(setting.url, row.url);
  });
  return selectDueExternalSites(active, now);
}

type RefreshOutcome = "unchanged" | "changed" | "failed" | "skipped";

/**
 * Date du contrôle inscrite, sans rien changer à ce qui a été lu : la lecture
 * précédente reste la référence. `readable` : le site vient d'être relu sans
 * encombre — l'échec d'une lecture antérieure, s'il en restait un, n'a plus
 * lieu d'être montré au praticien.
 */
async function recordCheck(db: Database, rowId: string, now: Date, readable = false): Promise<void> {
  await db
    .update(externalSites)
    .set({ checkedAt: now, updatedAt: now, ...(readable ? { error: null, errorDetail: null } : {}) })
    .where(and(eq(externalSites.id, rowId), eq(externalSites.status, "ready")));
}

/** Détail technique inscrit quand la tâche planifiée solde une lecture restée « en cours ». */
const INTERRUPTED_DETAIL = "Lecture interrompue avant la fin";

/**
 * Lectures interrompues (processus arrêté en route) : restées « en cours »
 * au-delà de EXTERNAL_SITE_LIMITS.readStaleMs, elles sont soldées comme un
 * échec `internal` ordinaire — site « prêt » si une lecture avait déjà
 * abouti, « en erreur » sinon. L'écran et les outils s'accommodent d'une
 * lecture interrompue, mais la ligne resterait « en lecture » pour toujours
 * et le site ne serait plus jamais relu. Rend le nombre de lectures soldées.
 */
async function settleInterruptedReads(db: Database, now: Date): Promise<number> {
  const staleBefore = new Date(now.getTime() - EXTERNAL_SITE_LIMITS.readStaleMs);
  const interrupted = and(eq(externalSites.status, "reading"), or(isNull(externalSites.readStartedAt), lte(externalSites.readStartedAt, staleBefore)));
  const failure = { error: "internal", errorDetail: INTERRUPTED_DETAIL, updatedAt: now } as const;
  // D'abord les sites qui gardent une lecture aboutie ; ceux qui restent n'en ont jamais eu
  const kept = await db
    .update(externalSites)
    .set({ status: "ready", ...failure })
    .where(and(interrupted, isNotNull(externalSites.readAt), isNotNull(externalSites.profile)))
    .returning({ siteId: externalSites.siteId });
  const never = await db
    .update(externalSites)
    .set({ status: "error", ...failure })
    .where(interrupted)
    .returning({ siteId: externalSites.siteId });
  for (const row of kept) console.warn(`${LOG} lecture du site ${row.siteId} interrompue : soldée en échec (lecture précédente conservée)`);
  for (const row of never) console.warn(`${LOG} lecture du site ${row.siteId} interrompue : soldée en échec`);
  return kept.length + never.length;
}

async function refreshFailed(db: Database, row: Pick<ExternalSiteRow, "id" | "siteId">, reason: string, now: Date): Promise<RefreshOutcome> {
  console.warn(`${LOG} relecture du site ${row.siteId} en échec : ${reason} (lecture précédente conservée)`);
  await recordCheck(db, row.id, now);
  return "failed";
}

/**
 * Relecture d'un site : contrôle inscrit si rien n'a changé, sinon profil
 * extrait de nouveau et enregistré. Une relecture aboutie efface l'échec
 * qu'une lecture du praticien aurait laissé ; une relecture en échec ne
 * touche à rien d'autre que la date du contrôle.
 */
async function refreshOne(db: Database, siteId: string, reader: WebsiteReader, extractor: ExternalProfileExtractor, deps: ExternalSiteDeps): Promise<RefreshOutcome> {
  const clock = () => deps.now ?? new Date();
  let row: ExternalSiteRow | null = null;
  try {
    row = await loadRow(db, siteId);
    // L'état a pu changer depuis la sélection : lecture lancée par le praticien, texte collé, déconnexion
    if (!row || row.status !== "ready" || row.source !== "crawl") return "skipped";
    const env = deps.env ?? process.env;
    const site = await loadSiteContext(db, siteId);
    const outcome = await reader.read(row.url, { deadlineMs: EXTERNAL_READ_DEADLINE_MS });
    if (!outcome.ok) return await refreshFailed(db, row, isExternalReadError(outcome.error) ? outcome.error : "internal", clock());
    if (textLength(outcome.pages) < EXTERNAL_SITE_LIMITS.minChars) return await refreshFailed(db, row, "empty", clock());
    const facts = completeFacts(outcome.facts);
    const contentHash = externalContentHash(outcome.pages, facts);
    if (contentHash === row.contentHash) {
      await recordCheck(db, row.id, clock(), true);
      return "unchanged";
    }
    const url = servedAddress(row.url, outcome.url, hostedHostsOf({ domain: site?.domain ?? null }, env));
    const profile = await extractProfile(extractor, { url, pages: outcome.pages, facts, practitioner: await practitionerOf(db, site?.prospectId ?? null) });
    // Un profil devenu inexploitable (site en maintenance, page vidée) ferait retomber tous les outils sur le site hébergé sans que le praticien l'ait décidé
    if (!isExternalProfileUsable(mergeExternalProfile(profile, row.overrides))) return await refreshFailed(db, row, "profil inexploitable", clock());

    const previous = row;
    const now = clock();
    const stored = await db.transaction(async (tx) => {
      await lockExternalSite(tx, siteId);
      const updated = await tx
        .update(externalSites)
        .set({ url, pages: outcome.pages, facts, profile, contentHash, readAt: now, checkedAt: now, error: null, errorDetail: null, updatedAt: now })
        // Une lecture du praticien commencée ou terminée entre-temps l'emporte sur la relecture automatique
        .where(and(eq(externalSites.id, previous.id), eq(externalSites.status, "ready"), eq(externalSites.source, "crawl"), sameInstant(externalSites.readAt, previous.readAt)))
        .returning({ id: externalSites.id });
      if (updated.length === 0) return false;
      if (url !== previous.url) await moveSetting(tx, siteId, url, false, now);
      return true;
    });
    return stored ? "changed" : "skipped";
  } catch (err) {
    console.error(`${LOG} relecture du site ${siteId} interrompue (${errorName(err)})`);
    if (row) {
      try {
        await recordCheck(db, row.id, clock());
      } catch (failure) {
        console.error(`${LOG} contrôle du site ${siteId} non inscrit (${errorName(failure)})`);
      }
    }
    return "failed";
  }
}

/**
 * Tâche planifiée : relit les sites connectés dont la dernière lecture date.
 * Bornée par passage (EXTERNAL_REFRESH_BATCH sites, EXTERNAL_REFRESH_BUDGET_MS,
 * échéance `deps.deadline`) : un site n'est entamé que s'il reste le temps
 * d'une lecture complète.
 *
 * Seuls les sites actifs et lus sur le site lui-même sont relus (un texte
 * collé ne se relit pas). Empreinte inchangée : seule la date du contrôle est
 * inscrite. Empreinte différente : le profil est extrait de nouveau et
 * enregistré, les corrections du praticien restent. En cas d'échec, la
 * lecture précédente reste la référence des outils. Ces relectures ne sont
 * pas comptées dans le quota du praticien. `checked` : sites relus ;
 * `changed` : profils mis à jour ; `failed` : relectures en échec.
 *
 * Le passage commence par solder les lectures interrompues
 * (`settleInterruptedReads`) : un site resté « en lecture » retrouve un état
 * stable et, s'il avait déjà été lu, redevient éligible à la relecture.
 */
export async function refreshExternalSites(db: Database, deps: ExternalSiteDeps = {}): Promise<{ checked: number; changed: number; failed: number }> {
  const report = { checked: 0, changed: 0, failed: 0 };
  const until = Math.min(Date.now() + EXTERNAL_REFRESH_BUDGET_MS, deps.deadline?.getTime() ?? Infinity);
  let due: RefreshCandidate[];
  try {
    const now = deps.now ?? new Date();
    await settleInterruptedReads(db, now);
    due = await dueExternalSites(db, now);
  } catch (err) {
    if (!isSchemaMissing(err)) throw err;
    return report;
  }
  if (due.length === 0) return report;
  // Lecteur et extracteur créés une fois : s'ils ne peuvent pas l'être, le passage échoue en entier plutôt que de repousser chaque site d'un mois
  const env = deps.env ?? process.env;
  const reader = deps.reader ?? createWebsiteReader(env);
  const extractor = deps.extractor ?? createExternalProfileExtractor(env);
  for (const candidate of due) {
    if (Date.now() + EXTERNAL_READ_DEADLINE_MS > until) break;
    // Registre des appels API : la relecture est rattachée à la fonctionnalité et au site
    const outcome = await withApiUsage({ feature: "client_site", siteId: candidate.siteId }, () => refreshOne(db, candidate.siteId, reader, extractor, deps));
    if (outcome === "skipped") continue;
    report.checked++;
    if (outcome === "changed") report.changed++;
    if (outcome === "failed") report.failed++;
  }
  return report;
}
