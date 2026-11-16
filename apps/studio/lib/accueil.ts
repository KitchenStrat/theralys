import { and, eq, sql } from "drizzle-orm";
import { blogSettings, getDb, pages, prospects, socialSettings, type Site } from "@theralys/db";
import { hasRealGoogleProvider } from "@theralys/jobs";
import type { CalendarItem } from "@/lib/data";
import { linkedProfileOf } from "@/lib/google/data";

/**
 * Accueil du studio : étapes de mise en route et choix de la « prochaine
 * étape ». Tout est en lecture seule, et tout se lit sur l'état réel du
 * compte : une étape est faite quand la base le montre, pour tous les comptes,
 * sans rien cocher à la main.
 *
 * La table `onboarding_tasks` (cases cochées par `completeOnboardingTask`,
 * créées seulement par les données de démonstration) n'est plus lue ici.
 */

/**
 * Étapes de mise en route, avec le fait qui les dit faites :
 *
 *   verify_pages     une page du site Harmony a été enregistrée depuis l'éditeur
 *   booking_link     le site a un lien de prise de rendez-vous
 *   install_measure  le site du praticien a envoyé une première visite mesurée
 *   link_google      la fiche Google de l'établissement est reliée
 *   blog_settings    les paramètres du blog ont été enregistrés au moins une fois
 *   social_settings  le paramétrage des réseaux sociaux a été enregistré
 */
export const SETUP_KEYS = ["verify_pages", "booking_link", "install_measure", "link_google", "blog_settings", "social_settings"] as const;

export type SetupKey = (typeof SETUP_KEYS)[number];

export type SetupTask = { key: SetupKey; done: boolean };

/**
 * Ce que la base dit de chaque étape. `null` : le fait n'a pas pu être lu
 * (table absente d'une base pas encore migrée, panne passagère) ou ne
 * s'applique pas à ce compte — l'étape n'est alors pas proposée, plutôt que
 * d'être affichée à tort comme faite ou à faire.
 */
export type SetupSignals = {
  /** Une page du site Harmony a été enregistrée depuis l'éditeur */
  pagesEdited: boolean | null;
  /** Le site a un lien de prise de rendez-vous */
  bookingLink: boolean;
  /** Le site du praticien, quand il est la référence, a envoyé une première visite mesurée */
  measureSeen: boolean | null;
  /** La fiche Google de l'établissement est reliée */
  googleLinked: boolean | null;
  /** Les paramètres du blog ont été enregistrés au moins une fois */
  blogConfigured: boolean | null;
  /** Le paramétrage des réseaux sociaux a été enregistré */
  socialConfigured: boolean | null;
};

/** Ce que la formule et le site de référence rendent faisable depuis le studio. */
export type SetupAccess = {
  /** Le site de référence des outils : le site Harmony (son éditeur est proposé) ou celui du praticien (son code de mesure l'est) */
  reference: "hosted" | "external";
  /** La section « Fiche Google » est ouverte */
  google: boolean;
  /** La section « Publications » est ouverte */
  blog: boolean;
  /** La section « Réseaux sociaux » est ouverte */
  social: boolean;
};

/**
 * Un fait de la mise en route, lu sans jamais faire tomber l'accueil : en cas
 * d'échec, l'étape concernée n'est simplement pas proposée. Seul le nom de
 * l'erreur est journalisé, jamais une donnée du compte.
 */
async function readSignal(name: string, read: () => Promise<boolean>): Promise<boolean | null> {
  try {
    return await read();
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? String((error as { code: unknown }).code) : "";
    console.error(`[accueil] mise en route : fait « ${name} » illisible`, error instanceof Error ? error.name : "erreur", code);
    return null;
  }
}

/**
 * Lit en base les faits de la mise en route d'un site. Seuls ceux dont
 * l'étape peut être proposée à ce compte sont lus (`access`).
 *
 * - Pages : les pages sont créées par la génération du site, puis modifiées
 *   seulement depuis l'éditeur du studio (par le praticien, ou par l'équipe en
 *   mode support). Une page dont la date de modification dépasse la date de
 *   création dit donc que le site a été repris dans l'éditeur.
 * - Fiche Google : même règle que la section (`linkedProfileOf`).
 * - Blog : un site reçoit des réglages par défaut à sa création, sans
 *   thématiques ; l'assistant « Paramètres » les enregistre toujours avec ses
 *   thématiques. Des thématiques présentes disent donc qu'il a été validé.
 * - Réseaux sociaux : la ligne n'existe qu'une fois le paramétrage enregistré.
 *
 * `measureSeen` vient de l'état du site du praticien, déjà lu par l'accueil.
 */
export async function readSetupSignals(
  site: Pick<Site, "id" | "prospectId" | "bookingUrl">,
  access: SetupAccess,
  measureSeen: boolean | null,
): Promise<SetupSignals> {
  const db = getDb();
  const hosted = access.reference === "hosted";
  const [pagesEdited, googleLinked, blogConfigured, socialConfigured] = await Promise.all([
    hosted
      ? readSignal("pages", async () => {
          const rows = await db
            .select({ id: pages.id })
            .from(pages)
            // Deux secondes de marge : une page tout juste créée a ses deux dates à l'identique, à l'horloge près
            .where(and(eq(pages.siteId, site.id), sql`${pages.updatedAt} > ${pages.createdAt} + interval '2 seconds'`))
            .limit(1);
          return rows.length > 0;
        })
      : null,
    access.google
      ? readSignal("fiche Google", async () => {
          if (!site.prospectId) return false;
          const prospect = await db.query.prospects.findFirst({ where: eq(prospects.id, site.prospectId) });
          return linkedProfileOf(prospect ?? null, { realProviders: hasRealGoogleProvider() }) !== null;
        })
      : null,
    access.blog
      ? readSignal("blog", async () => {
          const row = await db.query.blogSettings.findFirst({ where: eq(blogSettings.siteId, site.id), columns: { themes: true } });
          return row?.themes != null;
        })
      : null,
    access.social
      ? readSignal("réseaux sociaux", async () => {
          const row = await db.query.socialSettings.findFirst({ where: eq(socialSettings.siteId, site.id), columns: { id: true } });
          return row !== undefined;
        })
      : null,
  ]);
  return {
    pagesEdited,
    bookingLink: (site.bookingUrl ?? "").trim() !== "",
    measureSeen: hosted ? null : measureSeen,
    googleLinked,
    blogConfigured,
    socialConfigured,
  };
}

/**
 * Les étapes proposées à ce compte, dans l'ordre où les mener : d'abord le
 * site (son contenu et son lien de rendez-vous, ou le code de mesure quand le
 * site du praticien est la référence), puis la fiche Google, le blog et les
 * réseaux sociaux — chacun seulement si la formule l'ouvre et si son fait a pu
 * être lu.
 */
export function deriveSetupTasks(signals: SetupSignals, access: SetupAccess): SetupTask[] {
  const tasks: SetupTask[] = [];
  const add = (key: SetupKey, done: boolean | null) => {
    if (done !== null) tasks.push({ key, done });
  };
  if (access.reference === "hosted") {
    add("verify_pages", signals.pagesEdited);
    add("booking_link", signals.bookingLink);
  } else {
    add("install_measure", signals.measureSeen);
  }
  if (access.google) add("link_google", signals.googleLinked);
  if (access.blog) add("blog_settings", signals.blogConfigured);
  if (access.social) add("social_settings", signals.socialConfigured);
  return tasks;
}

/** Nombre d'étapes qu'il reste à faire. */
export function remainingSetupTasks(tasks: readonly SetupTask[]): number {
  return tasks.filter((task) => !task.done).length;
}

/** La « prochaine étape » de l'accueil : une seule, choisie d'après l'état réel du compte. */
export type NextStep =
  /** Le site du praticien est la référence et son code de mesure n'a encore rien envoyé */
  | { kind: "measure"; address: string }
  /** Une étape de mise en route reste à faire */
  | { kind: "setup"; key: SetupKey }
  /** Un article écrit attend sa parution : il peut être relu */
  | {
      kind: "review";
      articleId: string;
      title: string;
      /** Date de parution prévue, ISO yyyy-mm-dd */
      date: string;
      status: "draft" | "scheduled";
      readingTimeMin?: number;
    }
  /** Rien à faire : le prochain sujet du calendrier, pour information */
  | { kind: "upcoming"; title: string; date: string };

/**
 * Choisit la prochaine étape, de la plus pressante à la plus facultative :
 * 1. installer le code de mesure (sans lui, l'accueil n'a aucun chiffre) ;
 * 2. le premier article à venir déjà écrit (brouillon ou programmé), à relire :
 *    il a une date de parution, il passe donc avant la mise en route, qui
 *    n'en a pas et reste visible dans sa carte ;
 * 3. la première étape de mise en route non faite ;
 * 4. à défaut, le prochain sujet planifié — une invitation à ouvrir Publications.
 * `null` quand rien de tout cela n'existe : l'accueil n'affiche alors pas de carte.
 *
 * `setup` : étapes proposées à ce compte (`deriveSetupTasks`) ; `upcoming` :
 * prochains contenus du calendrier, du plus proche au plus lointain.
 */
export function pickNextStep(input: {
  awaitingMeasure: { address: string } | null;
  setup: readonly SetupTask[];
  upcoming: readonly Pick<CalendarItem, "kind" | "articleId" | "title" | "date" | "status" | "readingTimeMin">[];
}): NextStep | null {
  if (input.awaitingMeasure) return { kind: "measure", address: input.awaitingMeasure.address };

  for (const item of input.upcoming) {
    if (item.kind === "article" && item.articleId && (item.status === "draft" || item.status === "scheduled")) {
      return {
        kind: "review",
        articleId: item.articleId,
        title: item.title,
        date: item.date,
        status: item.status,
        readingTimeMin: item.readingTimeMin,
      };
    }
  }

  const todo = input.setup.find((task) => !task.done);
  if (todo) return { kind: "setup", key: todo.key };

  const planned = input.upcoming.find((item) => item.status === "planned");
  if (planned) return { kind: "upcoming", title: planned.title, date: planned.date };

  return null;
}
