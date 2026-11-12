import { asc, eq } from "drizzle-orm";
import { getDb, onboardingTasks } from "@theralys/db";
import type { CalendarItem } from "@/lib/data";

/**
 * Accueil du studio : lecture des étapes de mise en route (`onboarding_tasks`)
 * et choix de la « prochaine étape ». Tout est en lecture seule : rien ici ne
 * termine une étape, ce sont les actions du studio qui le font.
 */

/**
 * Étapes de mise en route présentées au praticien, avec l'action qui termine
 * chacune (`completeOnboardingTask`, `app/(app)/actions.ts`) :
 *
 *   connect_google ← `connectGoogle`    : Fiche Google › Visibilité
 *   verify_pages   ← `savePageSections` : éditeur du site
 *   publish_site   ← `savePageSections` : éditeur du site
 *   activate_blog  ← `saveBlogSettings` : Publications › Paramètres
 *
 * La clé `guided_tour` existe aussi en base, mais plus rien ne la termine
 * depuis le retrait de la carte « Vos tâches » (et le studio n'a pas de
 * visite guidée) : la présenter laisserait la mise en route à jamais
 * incomplète. Elle n'est donc pas lue.
 */
export const SETUP_KEYS = ["connect_google", "verify_pages", "publish_site", "activate_blog"] as const;

export type SetupKey = (typeof SETUP_KEYS)[number];

export type SetupTask = { key: SetupKey; done: boolean };

export function isSetupKey(value: string): value is SetupKey {
  return (SETUP_KEYS as readonly string[]).includes(value);
}

/**
 * Étapes de mise en route d'un site, dans l'ordre de la base (`position`).
 * Les clés inconnues ou sans écran (`guided_tour`) sont écartées. Un site sans
 * aucune ligne — le cas de tous les sites créés hors données de démonstration —
 * rend une liste vide : l'accueil n'affiche alors pas de mise en route.
 */
export async function getSetupTasks(siteId: string): Promise<SetupTask[]> {
  const rows = await getDb().query.onboardingTasks.findMany({
    where: eq(onboardingTasks.siteId, siteId),
    orderBy: [asc(onboardingTasks.position)],
    columns: { key: true, done: true },
  });
  return toSetupTasks(rows);
}

/** Lignes de la base → étapes présentées (ordre conservé, une seule par clé). */
export function toSetupTasks(rows: readonly { key: string; done: boolean }[]): SetupTask[] {
  const seen = new Set<string>();
  const tasks: SetupTask[] = [];
  for (const row of rows) {
    if (!isSetupKey(row.key) || seen.has(row.key)) continue;
    seen.add(row.key);
    tasks.push({ key: row.key, done: row.done });
  }
  return tasks;
}

/** Ce que la formule et le site de référence rendent faisable depuis le studio. */
export type SetupAccess = {
  /** La section « Fiche Google » est ouverte : la connexion du compte Google s'y fait */
  google: boolean;
  /** La section « Publications » est ouverte : les réglages du blog s'y font */
  blog: boolean;
  /** Le site Harmony est le site de référence : l'accueil mène à son éditeur */
  editor: boolean;
};

const REQUIRES: Record<SetupKey, keyof SetupAccess> = {
  connect_google: "google",
  verify_pages: "editor",
  publish_site: "editor",
  activate_blog: "blog",
};

/**
 * Étapes que ce compte peut réellement mener à bien : une étape dont l'écran
 * n'est pas ouvert par la formule, ou qui porte sur le site Harmony alors que
 * le site du praticien est la référence, n'est pas proposée (faite ou non).
 */
export function availableSetupTasks(tasks: readonly SetupTask[], access: SetupAccess): SetupTask[] {
  return tasks.filter((task) => access[REQUIRES[task.key]]);
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
 * Choisit la prochaine étape, de la plus bloquante à la plus facultative :
 * 1. installer le code de mesure (sans lui, l'accueil n'a aucun chiffre) ;
 * 2. la première étape de mise en route non faite ;
 * 3. le premier article à venir déjà écrit (brouillon ou programmé), à relire ;
 * 4. à défaut, le prochain sujet planifié — une invitation à ouvrir Publications.
 * `null` quand rien de tout cela n'existe : l'accueil n'affiche alors pas de carte.
 *
 * `setup` : étapes proposées à ce compte (`availableSetupTasks`) ; `upcoming` :
 * prochains contenus du calendrier, du plus proche au plus lointain.
 */
export function pickNextStep(input: {
  awaitingMeasure: { address: string } | null;
  setup: readonly SetupTask[];
  upcoming: readonly Pick<CalendarItem, "kind" | "articleId" | "title" | "date" | "status" | "readingTimeMin">[];
}): NextStep | null {
  if (input.awaitingMeasure) return { kind: "measure", address: input.awaitingMeasure.address };

  const todo = input.setup.find((task) => !task.done);
  if (todo) return { kind: "setup", key: todo.key };

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

  const planned = input.upcoming.find((item) => item.status === "planned");
  if (planned) return { kind: "upcoming", title: planned.title, date: planned.date };

  return null;
}
