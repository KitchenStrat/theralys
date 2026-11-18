/**
 * Lectures du CRM : liste filtrée et paginée, compteurs, pipeline, fiche d'un
 * prospect. Réservé au serveur. Tant que la migration 0011 n'est pas
 * appliquée, `crmAvailable` renvoie faux et la page l'explique.
 */

import { and, asc, desc, eq, gte, ilike, inArray, isNotNull, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import { crmActivities, crmContacts, crmImports, leads, prospects, sites, type CrmActivity, type CrmContact, type Database } from "@theralys/db";
import { isMissingTableError } from "@/lib/api-usage";
import { PAGE_SIZE, PIPELINE_COLUMN_LIMIT, parisDayBounds, type CrmFilters } from "./filters";
import { CRM_STAGES, OPEN_STAGES, contactMonthlyValue, stageFromLeadStatus, type CrmStage } from "./model";
import { cleanMultiline, cleanText, departmentOf, normalizeEmail, normalizePhone, splitFullName } from "./normalize";

const DAY = 86_400_000;

/** Les tables du CRM existent-elles ? (migration 0011) */
export async function crmAvailable(db: Database): Promise<boolean> {
  try {
    await db.select({ id: crmContacts.id }).from(crmContacts).limit(1);
    await db.select({ id: crmActivities.id }).from(crmActivities).limit(1);
    await db.select({ id: crmImports.id }).from(crmImports).limit(1);
    return true;
  } catch (error) {
    if (isMissingTableError(error)) return false;
    throw error;
  }
}

// ─── Reprise des demandes de la vitrine et des démos ─────────────────────────

/**
 * Les demandes de démo de la vitrine et les démos créées s'inscrivent dans la
 * table `leads`. Chacune est reprise une fois dans le CRM (`leadId`) ; ensuite
 * c'est la fiche du CRM qui fait foi. Sans effet quand tout est déjà repris.
 */
export async function syncLeadsIntoCrm(db: Database): Promise<number> {
  // Une démo créée depuis une fiche du CRM : sa ligne `leads` se rattache à cette fiche plutôt que d'en créer une autre
  await db.execute(sql`
    update crm_contacts c set lead_id = l.id
    from leads l
    where c.lead_id is null and c.prospect_id is not null and l.prospect_id = c.prospect_id
      and not exists (select 1 from crm_contacts x where x.lead_id = l.id)
  `);
  const pending = await db
    .select({ lead: leads, prospect: prospects })
    .from(leads)
    .leftJoin(prospects, eq(leads.prospectId, prospects.id))
    .leftJoin(crmContacts, eq(crmContacts.leadId, leads.id))
    .where(isNull(crmContacts.id))
    .orderBy(asc(leads.createdAt))
    .limit(500);
  if (pending.length === 0) return 0;
  const prospectIds = pending.map((row) => row.prospect?.id).filter((id): id is string => Boolean(id));
  const siteRows = prospectIds.length > 0 ? await db.select({ id: sites.id, prospectId: sites.prospectId }).from(sites).where(inArray(sites.prospectId, prospectIds)) : [];
  const siteByProspect = new Map(siteRows.map((row) => [row.prospectId, row.id]));
  const values = pending.map(({ lead, prospect }) => {
    const name = prospect ? { firstName: prospect.firstName, lastName: prospect.lastName } : splitFullName(lead.name);
    // Demande de la vitrine : la note commence par « Métier à Ville » quand le formulaire les donnait
    const hint = !prospect && lead.notes ? /^([^—,;]{2,60}?) à ([^—,;]{2,60}?)(?: —|[,;]|$)/.exec(lead.notes) : null;
    return {
      firstName: cleanText(name.firstName, 80),
      lastName: cleanText(name.lastName, 80),
      company: cleanText(prospect?.googleBusinessName ?? "", 160),
      profession: cleanText(prospect?.profession ?? hint?.[1] ?? "", 120),
      city: cleanText(prospect?.city ?? hint?.[2] ?? "", 120),
      address: prospect?.googleAddress ? cleanText(prospect.googleAddress, 200) : null,
      email: normalizeEmail(lead.email) || null,
      phone: normalizePhone(lead.phone) || null,
      source: cleanText(lead.source, 60) || "landing",
      stage: stageFromLeadStatus(lead.status),
      notes: cleanMultiline(lead.notes, 4000) || null,
      leadId: lead.id,
      prospectId: prospect?.id ?? null,
      siteId: prospect ? (siteByProspect.get(prospect.id) ?? null) : null,
      createdAt: lead.createdAt,
      updatedAt: lead.createdAt,
      stageChangedAt: lead.createdAt,
    };
  });
  const inserted = await db.insert(crmContacts).values(values).onConflictDoNothing().returning({ id: crmContacts.id });
  return inserted.length;
}

// ─── Filtres ─────────────────────────────────────────────────────────────────

const SEARCHABLE = sql`(${crmContacts.firstName} || ' ' || ${crmContacts.lastName} || ' ' || ${crmContacts.company} || ' ' || ${crmContacts.profession} || ' ' || ${crmContacts.city} || ' ' || coalesce(${crmContacts.email}, '') || ' ' || coalesce(${crmContacts.postalCode}, '') || ' ' || coalesce(${crmContacts.website}, ''))`;

function likePattern(token: string): string {
  return `%${token.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

function departmentCondition(department: string): SQL | undefined {
  if (department === "2A") return and(gte(crmContacts.postalCode, "20000"), lt(crmContacts.postalCode, "20200"), sql`${crmContacts.postalCode} ~ '^[0-9]{5}$'`);
  if (department === "2B") return and(gte(crmContacts.postalCode, "20200"), lt(crmContacts.postalCode, "21000"), sql`${crmContacts.postalCode} ~ '^[0-9]{5}$'`);
  return and(ilike(crmContacts.postalCode, `${department}%`), sql`${crmContacts.postalCode} ~ '^[0-9]{5}$'`);
}

/** Condition SQL d'un jeu de filtres. `ignoreStages` sert aux compteurs par étape. */
export function buildWhere(filters: CrmFilters, now: Date, options: { ignoreStages?: boolean } = {}): SQL | undefined {
  const conditions: (SQL | undefined)[] = [];
  for (const token of filters.q.split(/\s+/).filter(Boolean).slice(0, 5)) {
    const digits = token.replace(/\D/g, "");
    const phoneDigits = digits.length >= 4 ? (digits.startsWith("0") ? digits.slice(1) : digits) : "";
    conditions.push(phoneDigits ? or(sql`${SEARCHABLE} ilike ${likePattern(token)}`, ilike(crmContacts.phone, likePattern(phoneDigits))) : sql`${SEARCHABLE} ilike ${likePattern(token)}`);
  }
  if (!options.ignoreStages && filters.stages.length > 0) conditions.push(inArray(crmContacts.stage, filters.stages));
  if (filters.source) conditions.push(eq(crmContacts.source, filters.source));
  if (filters.profession) conditions.push(sql`lower(${crmContacts.profession}) = lower(${filters.profession})`);
  if (filters.city) conditions.push(sql`lower(${crmContacts.city}) = lower(${filters.city})`);
  if (filters.department) conditions.push(departmentCondition(filters.department));
  if (filters.tag) conditions.push(sql`${crmContacts.tags} @> ${JSON.stringify([filters.tag])}::jsonb`);
  if (filters.importId) conditions.push(eq(crmContacts.importId, filters.importId));
  if (filters.reach === "email") conditions.push(isNotNull(crmContacts.email));
  if (filters.reach === "phone") conditions.push(isNotNull(crmContacts.phone));
  if (filters.reach === "both") conditions.push(and(isNotNull(crmContacts.email), isNotNull(crmContacts.phone)));
  if (filters.reach === "none") conditions.push(and(isNull(crmContacts.email), isNull(crmContacts.phone)));
  const { start, end } = parisDayBounds(now);
  if (filters.action === "overdue") conditions.push(lt(crmContacts.nextActionAt, start));
  if (filters.action === "today") conditions.push(and(gte(crmContacts.nextActionAt, start), lt(crmContacts.nextActionAt, end)));
  if (filters.action === "week") conditions.push(and(gte(crmContacts.nextActionAt, start), lt(crmContacts.nextActionAt, new Date(start.getTime() + 7 * DAY))));
  if (filters.action === "none") conditions.push(and(isNull(crmContacts.nextActionAt), inArray(crmContacts.stage, [...OPEN_STAGES])));
  if (filters.created) conditions.push(gte(crmContacts.createdAt, new Date(now.getTime() - Number(filters.created) * DAY)));
  if (filters.touched === "never") conditions.push(isNull(crmContacts.lastContactAt));
  if (filters.touched === "30" || filters.touched === "90") conditions.push(lt(crmContacts.lastContactAt, new Date(now.getTime() - Number(filters.touched) * DAY)));
  if (filters.plan === "none") conditions.push(isNull(crmContacts.plan));
  else if (filters.plan) conditions.push(eq(crmContacts.plan, filters.plan));
  if (filters.dnc === "only") conditions.push(eq(crmContacts.doNotContact, true));
  if (filters.dnc === "hide") conditions.push(eq(crmContacts.doNotContact, false));
  const present = conditions.filter((condition): condition is SQL => condition !== undefined);
  return present.length > 0 ? and(...present) : undefined;
}

const STAGE_RANK = sql`case ${crmContacts.stage} ${sql.join(
  CRM_STAGES.map((stage, index) => sql`when ${stage} then ${index}`),
  sql` `,
)} else 99 end`;

function orderBy(sort: CrmFilters["sort"]): SQL[] {
  if (sort === "name") return [sql`lower(${crmContacts.lastName} || ' ' || ${crmContacts.firstName} || ' ' || ${crmContacts.company})`, desc(crmContacts.createdAt)];
  if (sort === "updated") return [desc(crmContacts.updatedAt)];
  if (sort === "action") return [sql`${crmContacts.nextActionAt} asc nulls last`, desc(crmContacts.createdAt)];
  if (sort === "stage") return [STAGE_RANK, desc(crmContacts.createdAt)];
  return [desc(crmContacts.createdAt), desc(crmContacts.id)];
}

// ─── Liste ───────────────────────────────────────────────────────────────────

export type ContactListRow = Pick<
  CrmContact,
  "id" | "firstName" | "lastName" | "company" | "profession" | "email" | "phone" | "city" | "postalCode" | "source" | "stage" | "tags" | "plan" | "billingPeriod" | "doNotContact" | "nextActionAt" | "nextAction" | "lastContactAt" | "createdAt" | "siteId"
>;

const LIST_COLUMNS = {
  id: crmContacts.id,
  firstName: crmContacts.firstName,
  lastName: crmContacts.lastName,
  company: crmContacts.company,
  profession: crmContacts.profession,
  email: crmContacts.email,
  phone: crmContacts.phone,
  city: crmContacts.city,
  postalCode: crmContacts.postalCode,
  source: crmContacts.source,
  stage: crmContacts.stage,
  tags: crmContacts.tags,
  plan: crmContacts.plan,
  billingPeriod: crmContacts.billingPeriod,
  doNotContact: crmContacts.doNotContact,
  nextActionAt: crmContacts.nextActionAt,
  nextAction: crmContacts.nextAction,
  lastContactAt: crmContacts.lastContactAt,
  createdAt: crmContacts.createdAt,
  siteId: crmContacts.siteId,
};

export async function listContacts(db: Database, filters: CrmFilters, now: Date): Promise<{ rows: ContactListRow[]; total: number; page: number; pageCount: number }> {
  const where = buildWhere(filters, now);
  const [count] = await db.select({ total: sql<number>`count(*)::int` }).from(crmContacts).where(where);
  const total = count?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(filters.page, pageCount);
  const rows = await db
    .select(LIST_COLUMNS)
    .from(crmContacts)
    .where(where)
    .orderBy(...orderBy(filters.sort))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);
  return { rows, total, page, pageCount };
}

/** Identifiants de tous les prospects qui répondent aux filtres (actions groupées, export). */
export async function matchingIds(db: Database, filters: CrmFilters, now: Date, limit = 20_000): Promise<string[]> {
  const rows = await db.select({ id: crmContacts.id }).from(crmContacts).where(buildWhere(filters, now)).limit(limit);
  return rows.map((row) => row.id);
}

export type StageSummary = { stage: CrmStage; count: number; monthlyValue: number };

/** Nombre de prospects et valeur mensuelle par étape, pour les filtres donnés (étape mise à part). */
export async function stageSummary(db: Database, filters: CrmFilters, now: Date): Promise<StageSummary[]> {
  const rows = await db
    .select({ stage: crmContacts.stage, plan: crmContacts.plan, billingPeriod: crmContacts.billingPeriod, count: sql<number>`count(*)::int` })
    .from(crmContacts)
    .where(buildWhere(filters, now, { ignoreStages: true }))
    .groupBy(crmContacts.stage, crmContacts.plan, crmContacts.billingPeriod);
  return CRM_STAGES.map((stage) => {
    const own = rows.filter((row) => row.stage === stage);
    return { stage, count: own.reduce((total, row) => total + row.count, 0), monthlyValue: own.reduce((total, row) => total + row.count * contactMonthlyValue(row), 0) };
  });
}

// ─── Pipeline ────────────────────────────────────────────────────────────────

export type PipelineColumn = StageSummary & { cards: ContactListRow[] };

export async function pipelineColumns(db: Database, filters: CrmFilters, now: Date): Promise<PipelineColumn[]> {
  const summary = await stageSummary(db, filters, now);
  const base = buildWhere(filters, now, { ignoreStages: true });
  const shown = filters.stages.length > 0 ? filters.stages : [...CRM_STAGES];
  const columns = await Promise.all(
    shown.map(async (stage) => {
      const cards = await db
        .select(LIST_COLUMNS)
        .from(crmContacts)
        .where(and(base, eq(crmContacts.stage, stage)))
        .orderBy(sql`${crmContacts.nextActionAt} asc nulls last`, desc(crmContacts.updatedAt))
        .limit(PIPELINE_COLUMN_LIMIT);
      return { ...summary.find((entry) => entry.stage === stage)!, cards };
    }),
  );
  return columns;
}

// ─── Critères proposés dans les filtres ──────────────────────────────────────

export type Facet = { value: string; count: number };
export type ImportSummary = { id: string; filename: string; format: string; source: string; createdAt: Date; contacts: number; totalRows: number; createdCount: number; updatedCount: number; skippedCount: number };

export type CrmFacets = { sources: Facet[]; professions: Facet[]; cities: Facet[]; departments: Facet[]; tags: Facet[]; imports: ImportSummary[] };

export async function loadFacets(db: Database): Promise<CrmFacets> {
  const count = sql<number>`count(*)::int`;
  const [sources, professions, cities, postalCodes, tags, imports] = await Promise.all([
    db.select({ value: crmContacts.source, count }).from(crmContacts).groupBy(crmContacts.source).orderBy(desc(count)).limit(60),
    db
      .select({ value: sql<string>`min(${crmContacts.profession})`, count })
      .from(crmContacts)
      .where(sql`${crmContacts.profession} <> ''`)
      .groupBy(sql`lower(${crmContacts.profession})`)
      .orderBy(desc(count))
      .limit(150),
    db
      .select({ value: sql<string>`min(${crmContacts.city})`, count })
      .from(crmContacts)
      .where(sql`${crmContacts.city} <> ''`)
      .groupBy(sql`lower(${crmContacts.city})`)
      .orderBy(desc(count))
      .limit(300),
    db
      .select({ value: sql<string>`left(${crmContacts.postalCode}, 3)`, count })
      .from(crmContacts)
      .where(sql`${crmContacts.postalCode} ~ '^[0-9]{5}$'`)
      .groupBy(sql`left(${crmContacts.postalCode}, 3)`),
    db.execute<{ value: string; count: number }>(sql`select t.tag as value, count(*)::int as count from crm_contacts c, jsonb_array_elements_text(c.tags) as t(tag) group by t.tag order by count(*) desc, t.tag limit 120`),
    db
      .select({
        id: crmImports.id,
        filename: crmImports.filename,
        format: crmImports.format,
        source: crmImports.source,
        createdAt: crmImports.createdAt,
        totalRows: crmImports.totalRows,
        createdCount: crmImports.createdCount,
        updatedCount: crmImports.updatedCount,
        skippedCount: crmImports.skippedCount,
        // Table nommée en toutes lettres : dans la sous-requête, « id » seul désignerait la colonne de crm_contacts
        contacts: sql<number>`(select count(*)::int from crm_contacts c where c.import_id = "crm_imports"."id")`,
      })
      .from(crmImports)
      .orderBy(desc(crmImports.createdAt))
      .limit(60),
  ]);
  // Départements : regroupés d'après les trois premiers chiffres du code postal (Corse et outre-mer compris)
  const byDepartment = new Map<string, number>();
  for (const row of postalCodes) {
    const department = departmentOf(`${row.value}00`);
    if (department) byDepartment.set(department, (byDepartment.get(department) ?? 0) + row.count);
  }
  return {
    sources,
    professions,
    cities,
    departments: [...byDepartment.entries()].map(([value, total]) => ({ value, count: total })).sort((a, b) => a.value.localeCompare(b.value, "fr", { numeric: true })),
    tags: tags.rows.map((row) => ({ value: String(row.value), count: Number(row.count) })),
    imports,
  };
}

// ─── Indicateurs ─────────────────────────────────────────────────────────────

export type CrmKpis = { total: number; open: number; overdue: number; dueToday: number; wonThisMonth: number; addedThisWeek: number; openMonthlyValue: number; winRate: number | null };

export async function loadKpis(db: Database, now: Date): Promise<CrmKpis> {
  const { start, end } = parisDayBounds(now);
  const monthStart = new Date(start.getTime());
  const parisDay = Number(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", day: "2-digit" }).format(now));
  monthStart.setTime(start.getTime() - (parisDay - 1) * DAY);
  const [row] = await db
    .select({
      total: sql<number>`count(*)::int`,
      open: sql<number>`count(*) filter (where ${inArray(crmContacts.stage, [...OPEN_STAGES])})::int`,
      overdue: sql<number>`count(*) filter (where ${crmContacts.nextActionAt} < ${start})::int`,
      dueToday: sql<number>`count(*) filter (where ${crmContacts.nextActionAt} >= ${start} and ${crmContacts.nextActionAt} < ${end})::int`,
      wonThisMonth: sql<number>`count(*) filter (where ${crmContacts.stage} = 'won' and ${crmContacts.stageChangedAt} >= ${monthStart})::int`,
      addedThisWeek: sql<number>`count(*) filter (where ${crmContacts.createdAt} >= ${new Date(now.getTime() - 7 * DAY)})::int`,
      won: sql<number>`count(*) filter (where ${crmContacts.stage} = 'won')::int`,
      lost: sql<number>`count(*) filter (where ${crmContacts.stage} = 'lost')::int`,
    })
    .from(crmContacts);
  const valued = await db
    .select({ plan: crmContacts.plan, billingPeriod: crmContacts.billingPeriod, count: sql<number>`count(*)::int` })
    .from(crmContacts)
    .where(and(inArray(crmContacts.stage, [...OPEN_STAGES]), isNotNull(crmContacts.plan)))
    .groupBy(crmContacts.plan, crmContacts.billingPeriod);
  const closed = (row?.won ?? 0) + (row?.lost ?? 0);
  return {
    total: row?.total ?? 0,
    open: row?.open ?? 0,
    overdue: row?.overdue ?? 0,
    dueToday: row?.dueToday ?? 0,
    wonThisMonth: row?.wonThisMonth ?? 0,
    addedThisWeek: row?.addedThisWeek ?? 0,
    openMonthlyValue: valued.reduce((total, entry) => total + entry.count * contactMonthlyValue(entry), 0),
    winRate: closed > 0 ? (row?.won ?? 0) / closed : null,
  };
}

// ─── Fiche ───────────────────────────────────────────────────────────────────

export type ContactDetail = {
  contact: CrmContact;
  activities: CrmActivity[];
  site: { id: string; slug: string; name: string; type: string; status: string } | null;
  importName: string | null;
};

export async function loadContact(db: Database, id: string): Promise<ContactDetail | null> {
  const [contact] = await db.select().from(crmContacts).where(eq(crmContacts.id, id)).limit(1);
  if (!contact) return null;
  const [activities, siteRows, importRows] = await Promise.all([
    db.select().from(crmActivities).where(eq(crmActivities.contactId, id)).orderBy(desc(crmActivities.createdAt)).limit(300),
    contact.siteId ? db.select({ id: sites.id, slug: sites.slug, name: sites.name, type: sites.type, status: sites.status }).from(sites).where(eq(sites.id, contact.siteId)).limit(1) : Promise.resolve([]),
    contact.importId ? db.select({ filename: crmImports.filename }).from(crmImports).where(eq(crmImports.id, contact.importId)).limit(1) : Promise.resolve([]),
  ]);
  return { contact, activities, site: siteRows[0] ?? null, importName: importRows[0]?.filename ?? null };
}

/**
 * Recopie sur la fiche sa prochaine tâche ouverte (la plus proche), pour que
 * la liste se filtre et se trie sans relire l'historique.
 */
export async function refreshNextAction(db: Database, contactId: string): Promise<void> {
  const [next] = await db
    .select({ dueAt: crmActivities.dueAt, body: crmActivities.body })
    .from(crmActivities)
    .where(and(eq(crmActivities.contactId, contactId), eq(crmActivities.kind, "task"), isNull(crmActivities.doneAt), isNotNull(crmActivities.dueAt)))
    .orderBy(asc(crmActivities.dueAt))
    .limit(1);
  await db
    .update(crmContacts)
    .set({ nextActionAt: next?.dueAt ?? null, nextAction: next ? cleanText(next.body, 200) : null })
    .where(eq(crmContacts.id, contactId));
}
