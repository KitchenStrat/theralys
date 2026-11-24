/**
 * « Avis clients » : ce que les praticiens nous disent du produit depuis leur
 * espace client. Lecture et suivi (nouveau, lu, pris en compte), réservés à
 * l'admin.
 */

import { and, desc, eq, sql } from "drizzle-orm";
import { PLANS, productFeedback, sites, users, type Database, type PlanId } from "@theralys/db";
import {
  FEEDBACK_STATUSES,
  isFeedbackKind,
  isFeedbackStatus,
  isFeedbackTopic,
  type FeedbackKind,
  type FeedbackStatus,
  type FeedbackTopic,
} from "@theralys/shared";
import { isMissingSchemaError } from "./pg-errors";

/** Ce que la page montre : les avis à lire, tous, ou ceux d'un état donné. */
export const FEEDBACK_VIEWS = ["new", "read", "done", "all"] as const;
export type FeedbackView = (typeof FEEDBACK_VIEWS)[number];

export const FEEDBACK_VIEW_LABELS: Record<FeedbackView, string> = {
  new: "Nouveaux",
  read: "Lus",
  done: "Pris en compte",
  all: "Tous",
};

/** Vue demandée par l'adresse (`?vue=`) ; à défaut, les nouveaux. */
export function feedbackViewFrom(value: unknown): FeedbackView {
  return typeof value === "string" && (FEEDBACK_VIEWS as readonly string[]).includes(value) ? (value as FeedbackView) : "new";
}

/** Avis affichés par page : les plus récents d'abord. */
export const FEEDBACK_PAGE_SIZE = 100;

export type FeedbackRow = {
  id: string;
  createdAt: Date;
  kind: FeedbackKind;
  topic: FeedbackTopic;
  rating: number | null;
  message: string;
  contactOk: boolean;
  page: string | null;
  status: FeedbackStatus;
  site: { id: string; name: string; demo: boolean; formula: string };
  /** L'auteur, tant que son compte existe */
  author: { name: string; email: string } | null;
};

export type FeedbackCounts = Record<FeedbackStatus, number> & { total: number };

export type FeedbackBoard =
  | { available: false }
  | { available: true; rows: FeedbackRow[]; counts: FeedbackCounts; rated: number; average: number | null; truncated: boolean };

/** Moyenne des notes, à une décimale ; null sans aucune note. */
export function averageRating(sum: number, rated: number): number | null {
  return rated > 0 ? Math.round((sum / rated) * 10) / 10 : null;
}

/** « 4,5 / 5 » — virgule décimale, jamais de zéro inutile. */
export function ratingText(value: number): string {
  return `${value.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} / 5`;
}

function formulaLabel(plan: string): string {
  return PLANS[plan as PlanId]?.label ?? plan;
}

/**
 * Les avis de la vue demandée, leurs compteurs par état et la note moyenne.
 * Table absente (migration 0016 pas encore appliquée) : `available: false`,
 * la page affiche son message d'activation.
 */
export async function loadFeedbackBoard(db: Database, view: FeedbackView): Promise<FeedbackBoard> {
  try {
    const [found, totals] = await Promise.all([
      db
        .select({
          id: productFeedback.id,
          createdAt: productFeedback.createdAt,
          kind: productFeedback.kind,
          topic: productFeedback.topic,
          rating: productFeedback.rating,
          message: productFeedback.message,
          contactOk: productFeedback.contactOk,
          page: productFeedback.page,
          status: productFeedback.status,
          siteId: sites.id,
          siteName: sites.name,
          siteType: sites.type,
          sitePlan: sites.plan,
          authorName: users.name,
          authorEmail: users.email,
        })
        .from(productFeedback)
        .innerJoin(sites, eq(sites.id, productFeedback.siteId))
        .leftJoin(users, eq(users.id, productFeedback.userId))
        .where(view === "all" ? undefined : and(eq(productFeedback.status, view)))
        .orderBy(desc(productFeedback.createdAt))
        .limit(FEEDBACK_PAGE_SIZE + 1),
      db
        .select({
          status: productFeedback.status,
          count: sql<number>`count(*)`.mapWith(Number),
          rated: sql<number>`count(${productFeedback.rating})`.mapWith(Number),
          sum: sql<number>`coalesce(sum(${productFeedback.rating}), 0)`.mapWith(Number),
        })
        .from(productFeedback)
        .groupBy(productFeedback.status),
    ]);

    const counts: FeedbackCounts = { new: 0, read: 0, done: 0, total: 0 };
    let rated = 0;
    let sum = 0;
    for (const row of totals) {
      if (isFeedbackStatus(row.status)) counts[row.status] += row.count;
      counts.total += row.count;
      rated += row.rated;
      sum += row.sum;
    }
    const rows: FeedbackRow[] = found.slice(0, FEEDBACK_PAGE_SIZE).map((row) => ({
      id: row.id,
      createdAt: row.createdAt,
      // Une valeur inconnue (écrite par une version plus récente) se lit comme la plus neutre
      kind: isFeedbackKind(row.kind) ? row.kind : "idea",
      topic: isFeedbackTopic(row.topic) ? row.topic : "general",
      rating: row.rating,
      message: row.message,
      contactOk: row.contactOk,
      page: row.page,
      status: isFeedbackStatus(row.status) ? row.status : "new",
      site: { id: row.siteId, name: row.siteName, demo: row.siteType === "demo", formula: formulaLabel(row.sitePlan) },
      author: row.authorName && row.authorEmail ? { name: row.authorName, email: row.authorEmail } : null,
    }));
    return { available: true, rows, counts, rated, average: averageRating(sum, rated), truncated: found.length > FEEDBACK_PAGE_SIZE };
  } catch (err) {
    if (isMissingSchemaError(err)) return { available: false };
    throw err;
  }
}

/** Change l'état d'un avis ; faux si l'avis n'existe pas (ou plus). */
export async function setFeedbackStatus(db: Database, id: string, status: FeedbackStatus): Promise<boolean> {
  if (!(FEEDBACK_STATUSES as readonly string[]).includes(status)) return false;
  const updated = await db.update(productFeedback).set({ status, updatedAt: new Date() }).where(eq(productFeedback.id, id)).returning({ id: productFeedback.id });
  return updated.length > 0;
}
