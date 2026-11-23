/**
 * Chiffres de l'équipe commerciale : état d'un compte, prospects par étape,
 * affaires gagnées du mois, activité des 7 et 30 derniers jours. Les
 * requêtes d'agrégat (`team.ts`) rendent des lignes groupées ; tout le
 * calcul est ici, sans dépendance serveur.
 */

import { CRM_STAGES, LOGGABLE_KINDS, OPEN_STAGES, contactMonthlyValue, isCrmStage, type CrmStage, type LoggableKind } from "./model";

// ─── État d'un compte ────────────────────────────────────────────────────────

export type RepStatus = "pending" | "active" | "disabled";

export const REP_STATUS_LABELS: Record<RepStatus, string> = {
  pending: "Invitation en attente",
  active: "Actif",
  disabled: "Désactivé",
};

/** Un compte désactivé l'est quoi qu'il arrive ; sinon il attend son mot de passe, ou il est actif. */
export function repStatus(account: { invitePending: boolean; disabledAt: Date | null }): RepStatus {
  if (account.disabledAt) return "disabled";
  return account.invitePending ? "pending" : "active";
}

// ─── Lignes rendues par les requêtes ─────────────────────────────────────────

/** Fiches vivantes d'un commercial pour une étape, une formule et une durée. */
export type OwnedGroup = { ownerId: string | null; stage: string; plan: string | null; billingPeriod: string | null; count: number; wonThisMonth: number };
/** Activités saisies par un commercial sur 30 jours, pour un type, dont celles des 7 derniers jours. */
export type ActivityGroup = { authorId: string | null; kind: string; week: number; month: number };

export type TeamRows = {
  owned: OwnedGroup[];
  activity: ActivityGroup[];
  overdue: { ownerId: string | null; count: number }[];
  last: { authorId: string | null; at: Date | string | null }[];
};

// ─── Chiffres d'un commercial ────────────────────────────────────────────────

export type ActivityCounts = Record<LoggableKind, number>;
export type StageLine = { stage: CrmStage; count: number; monthlyValue: number };

export type RepStats = {
  /** Prospects ni gagnés ni perdus, et ce qu'ils représentent par mois (formules envisagées) */
  open: number;
  openMonthlyValue: number;
  /** Prospects passés à « Client » depuis le début du mois (heure de Paris) */
  wonThisMonth: number;
  wonThisMonthValue: number;
  /** Tous ses prospects, corbeille exclue */
  total: number;
  byStage: StageLine[];
  /** Appels, e-mails, rendez-vous et notes saisis sur 7 et 30 jours glissants */
  week: ActivityCounts;
  month: ActivityCounts;
  /** Tâches ouvertes dont l'échéance est passée, sur ses prospects */
  overdueTasks: number;
  lastActivityAt: Date | null;
};

const noActivity = (): ActivityCounts => ({ note: 0, call: 0, email: 0, meeting: 0 });

export function emptyRepStats(): RepStats {
  return {
    open: 0,
    openMonthlyValue: 0,
    wonThisMonth: 0,
    wonThisMonthValue: 0,
    total: 0,
    byStage: CRM_STAGES.map((stage) => ({ stage, count: 0, monthlyValue: 0 })),
    week: noActivity(),
    month: noActivity(),
    overdueTasks: 0,
    lastActivityAt: null,
  };
}

const isLoggable = (kind: string): kind is LoggableKind => (LOGGABLE_KINDS as readonly string[]).includes(kind);

/**
 * Chiffres de chaque commercial demandé, à partir des lignes groupées. Un
 * commercial sans fiche ni activité a des chiffres à zéro ; les lignes d'un
 * compte qui n'est pas demandé (admin, compte supprimé) sont ignorées.
 */
export function summarizeTeam(repIds: string[], rows: TeamRows): Map<string, RepStats> {
  const stats = new Map(repIds.map((id) => [id, emptyRepStats()]));
  for (const group of rows.owned) {
    const own = group.ownerId ? stats.get(group.ownerId) : undefined;
    if (!own || !isCrmStage(group.stage)) continue;
    const value = contactMonthlyValue(group);
    own.total += group.count;
    const line = own.byStage.find((entry) => entry.stage === group.stage)!;
    line.count += group.count;
    line.monthlyValue += group.count * value;
    if (OPEN_STAGES.includes(group.stage)) {
      own.open += group.count;
      own.openMonthlyValue += group.count * value;
    }
    if (group.stage === "won") {
      own.wonThisMonth += group.wonThisMonth;
      own.wonThisMonthValue += group.wonThisMonth * value;
    }
  }
  for (const group of rows.activity) {
    const own = group.authorId ? stats.get(group.authorId) : undefined;
    if (!own || !isLoggable(group.kind)) continue;
    own.week[group.kind] += group.week;
    own.month[group.kind] += group.month;
  }
  for (const row of rows.overdue) {
    const own = row.ownerId ? stats.get(row.ownerId) : undefined;
    if (own) own.overdueTasks += row.count;
  }
  for (const row of rows.last) {
    const own = row.authorId ? stats.get(row.authorId) : undefined;
    if (own && row.at) own.lastActivityAt = new Date(row.at);
  }
  return stats;
}

/** Total des activités d'une période, tous types confondus. */
export function activityTotal(counts: ActivityCounts): number {
  return LOGGABLE_KINDS.reduce((total, kind) => total + counts[kind], 0);
}

/** Libellé court d'un type d'activité, accordé au nombre (« 3 appels », « 1 rendez-vous »). */
const KIND_NOUNS: Record<LoggableKind, [string, string]> = {
  call: ["appel", "appels"],
  email: ["e-mail", "e-mails"],
  meeting: ["rendez-vous", "rendez-vous"],
  note: ["note", "notes"],
};

/** Ordre d'affichage : ce qui compte comme un contact d'abord, les notes ensuite. */
export const ACTIVITY_ORDER: readonly LoggableKind[] = ["call", "email", "meeting", "note"];

export function activityLabel(kind: LoggableKind, count: number): string {
  return `${count.toLocaleString("fr-FR")} ${KIND_NOUNS[kind][count > 1 ? 1 : 0]}`;
}

/** « 3 appels · 1 e-mail · 2 notes », ou « aucune activité » : les types à zéro ne sont pas listés. */
export function activitySummary(counts: ActivityCounts): string {
  const parts = ACTIVITY_ORDER.filter((kind) => counts[kind] > 0).map((kind) => activityLabel(kind, counts[kind]));
  return parts.length > 0 ? parts.join(" · ") : "aucune activité";
}
