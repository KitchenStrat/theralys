/**
 * Équipe commerciale : comptes des commerciaux (utilisateurs de rôle
 * `sales`, table `crm_reps`) et leurs chiffres dans le CRM. Réservé au
 * serveur, et à l'admin : aucune de ces lectures n'est bornée à un
 * commercial, les pages qui s'en servent exigent `requireAdmin`.
 */

import { and, asc, desc, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";
import { crmActivities, crmContacts, crmReps, users, type Database } from "@theralys/db";
import { isInvitePending } from "@/lib/invitations";
import { parisDayBounds, parisMonthStart } from "./filters";
import { LOGGABLE_KINDS } from "./model";
import { emptyRepStats, repStatus, summarizeTeam, type RepStats, type RepStatus, type TeamRows } from "./team-stats";
import { NOT_TRASHED } from "./trash";

const DAY = 86_400_000;

type Reader = Pick<Database, "select">;

// ─── Comptes ─────────────────────────────────────────────────────────────────

export type RepAccount = {
  id: string;
  name: string;
  email: string;
  status: RepStatus;
  lastLoginAt: Date | null;
  createdAt: Date;
};

const ACCOUNT_COLUMNS = {
  id: users.id,
  name: users.name,
  email: users.email,
  passwordHash: users.passwordHash,
  disabledAt: crmReps.disabledAt,
  lastLoginAt: crmReps.lastLoginAt,
  createdAt: crmReps.createdAt,
};

type AccountRow = { id: string; name: string; email: string; passwordHash: string; disabledAt: Date | null; lastLoginAt: Date | null; createdAt: Date };

/** Le mot de passe (ou sa sentinelle) ne quitte pas le serveur : seul l'état du compte en est tiré. */
function toAccount(row: AccountRow): RepAccount {
  return { id: row.id, name: row.name, email: row.email, status: repStatus({ invitePending: isInvitePending(row.passwordHash), disabledAt: row.disabledAt }), lastLoginAt: row.lastLoginAt, createdAt: row.createdAt };
}

/** Tous les commerciaux : les comptes ouverts d'abord, par nom. */
export async function listReps(db: Reader): Promise<RepAccount[]> {
  const rows = await db
    .select(ACCOUNT_COLUMNS)
    .from(users)
    .innerJoin(crmReps, eq(crmReps.userId, users.id))
    .where(eq(users.role, "sales"))
    .orderBy(sql`${crmReps.disabledAt} is not null`, sql`lower(${users.name})`, asc(users.createdAt));
  return rows.map(toAccount);
}

/** Un commercial à qui l'on peut attribuer des prospects : son compte existe et n'est pas désactivé. */
export async function assignableRep(db: Reader, id: string): Promise<{ id: string; name: string } | null> {
  const [rep] = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .innerJoin(crmReps, eq(crmReps.userId, users.id))
    .where(and(eq(users.id, id), eq(users.role, "sales"), isNull(crmReps.disabledAt)))
    .limit(1);
  return rep ?? null;
}

/** Commerciaux proposés dans les listes de choix du CRM (filtre, attribution). */
export type RepOption = { id: string; name: string; disabled: boolean };

export async function listRepOptions(db: Reader): Promise<RepOption[]> {
  return (await listReps(db)).map((rep) => ({ id: rep.id, name: rep.name, disabled: rep.status === "disabled" }));
}

// ─── Chiffres ────────────────────────────────────────────────────────────────

/** Lignes groupées dont `summarizeTeam` tire les chiffres de chaque commercial (tous, ou ceux de `repIds`). */
async function teamRows(db: Reader, repIds: string[], now: Date): Promise<TeamRows> {
  if (repIds.length === 0) return { owned: [], activity: [], overdue: [], last: [] };
  const monthStart = parisMonthStart(now);
  const { start: today } = parisDayBounds(now);
  const weekAgo = new Date(now.getTime() - 7 * DAY);
  const monthAgo = new Date(now.getTime() - 30 * DAY);
  const [owned, activity, overdue, last] = await Promise.all([
    db
      .select({
        ownerId: crmContacts.ownerId,
        stage: crmContacts.stage,
        plan: crmContacts.plan,
        billingPeriod: crmContacts.billingPeriod,
        count: sql<number>`count(*)::int`,
        wonThisMonth: sql<number>`count(*) filter (where ${crmContacts.stage} = 'won' and ${crmContacts.stageChangedAt} >= ${monthStart})::int`,
      })
      .from(crmContacts)
      .where(and(NOT_TRASHED, inArray(crmContacts.ownerId, repIds)))
      .groupBy(crmContacts.ownerId, crmContacts.stage, crmContacts.plan, crmContacts.billingPeriod),
    db
      .select({
        authorId: crmActivities.authorId,
        kind: crmActivities.kind,
        week: sql<number>`count(*) filter (where ${crmActivities.createdAt} >= ${weekAgo})::int`,
        month: sql<number>`count(*)::int`,
      })
      .from(crmActivities)
      .where(and(inArray(crmActivities.authorId, repIds), gte(crmActivities.createdAt, monthAgo), inArray(crmActivities.kind, [...LOGGABLE_KINDS])))
      .groupBy(crmActivities.authorId, crmActivities.kind),
    db
      .select({ ownerId: crmContacts.ownerId, count: sql<number>`count(*)::int` })
      .from(crmActivities)
      .innerJoin(crmContacts, eq(crmContacts.id, crmActivities.contactId))
      .where(and(eq(crmActivities.kind, "task"), isNull(crmActivities.doneAt), lt(crmActivities.dueAt, today), inArray(crmContacts.ownerId, repIds), NOT_TRASHED))
      .groupBy(crmContacts.ownerId),
    db
      .select({ authorId: crmActivities.authorId, at: sql<Date | null>`max(${crmActivities.createdAt})` })
      .from(crmActivities)
      .where(inArray(crmActivities.authorId, repIds))
      .groupBy(crmActivities.authorId),
  ]);
  return { owned, activity, overdue, last };
}

export type TeamMember = RepAccount & { stats: RepStats };

/** L'équipe et ses chiffres, plus le nombre de prospects que personne ne suit. */
export async function loadTeam(db: Reader, now: Date): Promise<{ members: TeamMember[]; unassigned: number }> {
  const reps = await listReps(db);
  const [rows, unassignedRows] = await Promise.all([
    teamRows(
      db,
      reps.map((rep) => rep.id),
      now,
    ),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(crmContacts)
      .where(and(NOT_TRASHED, isNull(crmContacts.ownerId))),
  ]);
  const stats = summarizeTeam(
    reps.map((rep) => rep.id),
    rows,
  );
  return { members: reps.map((rep) => ({ ...rep, stats: stats.get(rep.id) ?? emptyRepStats() })), unassigned: unassignedRows[0]?.total ?? 0 };
}

/** Une ligne du fil d'activité d'un commercial, avec le prospect concerné. */
export type RepFeedEntry = {
  id: string;
  kind: string;
  body: string;
  createdAt: Date;
  doneAt: Date | null;
  contact: { id: string; firstName: string; lastName: string; company: string; email: string | null; phone: string | null };
};

export const REP_FEED_LIMIT = 40;

/** La fiche d'un commercial : son compte, ses chiffres et ses dernières activités (les siennes, où qu'en soit la fiche). */
export async function loadRep(db: Reader, id: string, now: Date): Promise<{ rep: RepAccount; stats: RepStats; feed: RepFeedEntry[] } | null> {
  const [row] = await db
    .select(ACCOUNT_COLUMNS)
    .from(users)
    .innerJoin(crmReps, eq(crmReps.userId, users.id))
    .where(and(eq(users.id, id), eq(users.role, "sales")))
    .limit(1);
  if (!row) return null;
  const [rows, feed] = await Promise.all([
    teamRows(db, [id], now),
    db
      .select({
        id: crmActivities.id,
        kind: crmActivities.kind,
        body: crmActivities.body,
        createdAt: crmActivities.createdAt,
        doneAt: crmActivities.doneAt,
        contact: { id: crmContacts.id, firstName: crmContacts.firstName, lastName: crmContacts.lastName, company: crmContacts.company, email: crmContacts.email, phone: crmContacts.phone },
      })
      .from(crmActivities)
      .innerJoin(crmContacts, eq(crmContacts.id, crmActivities.contactId))
      .where(eq(crmActivities.authorId, id))
      .orderBy(desc(crmActivities.createdAt))
      .limit(REP_FEED_LIMIT),
  ]);
  return { rep: toAccount(row), stats: summarizeTeam([id], rows).get(id) ?? emptyRepStats(), feed };
}
