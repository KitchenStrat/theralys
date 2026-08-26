import Link from "next/link";
import { and, count, eq, gte, isNotNull, lt } from "drizzle-orm";
import { Badge, Card } from "@theralys/ui";
import {
  blogArticles,
  editorialCalendarEntries,
  getDb,
  PLANS,
  prospects,
  sites,
  type OfferedPlanId,
} from "@theralys/db";
import { resolveAiMode } from "@theralys/ai";
import { requireAdmin } from "@/lib/auth";
import { computeMrr, estimateAiCosts, type SubscriptionLike } from "@/lib/metrics";

export const metadata = { title: "Vue d'ensemble" };
export const dynamic = "force-dynamic";

/** Vue d'ensemble agence : MRR, parc de sites, jobs IA en erreur, coûts API. */
export default async function OverviewPage() {
  await requireAdmin();
  const db = getDb();
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const todayIso = now.toISOString().slice(0, 10);

  const [subs, siteCounts, erroredSites, lateEntries, monthArticles, monthImages, monthDemos] =
    await Promise.all([
      db.query.subscriptions.findMany(),
      db
        .select({ type: sites.type, status: sites.status, value: count() })
        .from(sites)
        .groupBy(sites.type, sites.status),
      db
        .select({ site: sites, prospect: prospects })
        .from(sites)
        .leftJoin(prospects, eq(sites.prospectId, prospects.id))
        .where(eq(sites.status, "error")),
      db
        .select({ value: count() })
        .from(editorialCalendarEntries)
        .where(
          and(
            eq(editorialCalendarEntries.status, "planned"),
            lt(editorialCalendarEntries.scheduledFor, todayIso),
          ),
        ),
      db
        .select({ value: count() })
        .from(blogArticles)
        .where(and(eq(blogArticles.aiGenerated, true), gte(blogArticles.createdAt, monthStart))),
      db
        .select({ value: count() })
        .from(blogArticles)
        .where(
          and(
            eq(blogArticles.imageAiGenerated, true),
            isNotNull(blogArticles.imageUrl),
            gte(blogArticles.createdAt, monthStart),
          ),
        ),
      db
        .select({ value: count() })
        .from(sites)
        .where(and(eq(sites.type, "demo"), gte(sites.createdAt, monthStart))),
    ]);

  const mrr = computeMrr(subs as SubscriptionLike[]);
  const demoCount = siteCounts
    .filter((r) => r.type === "demo")
    .reduce((sum, r) => sum + r.value, 0);
  const clientCount = siteCounts
    .filter((r) => r.type === "client" && r.status !== "archived")
    .reduce((sum, r) => sum + r.value, 0);
  const archivedCount = siteCounts
    .filter((r) => r.type === "client" && r.status === "archived")
    .reduce((sum, r) => sum + r.value, 0);
  const lateCount = lateEntries[0]?.value ?? 0;
  const costs = estimateAiCosts({
    articlesGenerated: monthArticles[0]?.value ?? 0,
    imagesGenerated: monthImages[0]?.value ?? 0,
    demosGenerated: monthDemos[0]?.value ?? 0,
  });
  const jobsHealthy = erroredSites.length === 0 && lateCount === 0;
  const aiMode = resolveAiMode();
  const imageMode = process.env.IMAGE_PROVIDER !== "mock" && process.env.FAL_API_KEY ? "fal" : "mock";

  return (
    <div>
      <h1 className="text-2xl font-bold">Vue d&apos;ensemble</h1>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="MRR"
          value={`${mrr.total} €`}
          detail={`${mrr.payingCount} abonnement${mrr.payingCount > 1 ? "s" : ""} payant${mrr.payingCount > 1 ? "s" : ""}${mrr.pastDueCount > 0 ? ` · ${mrr.pastDueCount} impayé${mrr.pastDueCount > 1 ? "s" : ""}` : ""}`}
        />
        <StatCard
          label="Sites clients"
          value={String(clientCount)}
          detail={archivedCount > 0 ? `+ ${archivedCount} archivé${archivedCount > 1 ? "s" : ""}` : "objectif : 100 à 12 mois"}
        />
        <StatCard label="Démos" value={String(demoCount)} detail="sites d'avant-vente actifs" />
        <StatCard
          label="Coûts API du mois"
          value={`${costs.totalEur.toFixed(2)} €`}
          detail="estimation Claude + fal.ai"
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="font-semibold">MRR par formule</h2>
          <ul className="mt-4 space-y-2">
            {(Object.keys(mrr.byPlan) as OfferedPlanId[]).map((plan) => {
              const value = mrr.byPlan[plan];
              const share = mrr.total > 0 ? (value / mrr.total) * 100 : 0;
              return (
                <li key={plan} className="flex items-center gap-3 text-sm">
                  <span className="w-16 font-medium">{PLANS[plan].label}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-cream-200">
                    <div
                      className="h-full rounded-full bg-primary-500"
                      style={{ width: `${share}%` }}
                    />
                  </div>
                  <span className="w-16 text-right text-ink-700">{value} €</span>
                </li>
              );
            })}
          </ul>
          <p className="mt-4 border-t border-cream-200 pt-3 text-xs text-ink-500">
            Actifs + impayés, au tarif de la période souscrite (annuel ou mensuel).
          </p>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Jobs IA</h2>
            {jobsHealthy ? (
              <Badge tone="success">Tout est en ordre</Badge>
            ) : (
              <Badge tone="danger">
                {erroredSites.length + lateCount} problème{erroredSites.length + lateCount > 1 ? "s" : ""}
              </Badge>
            )}
          </div>

          <div className="mt-3 flex flex-wrap gap-2 border-b border-cream-200 pb-3">
            {aiMode === "anthropic" ? (
              <Badge tone="success">
                Rédaction : API Anthropic ({process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5"})
              </Badge>
            ) : (
              <Badge tone="warning">Rédaction : mode mock — aucune clé Anthropic active</Badge>
            )}
            {imageMode === "fal" ? (
              <Badge tone="success">Images : fal.ai (FLUX.1 schnell)</Badge>
            ) : (
              <Badge tone="neutral">Images : mock (SVG)</Badge>
            )}
          </div>

          {erroredSites.length > 0 ? (
            <ul className="mt-4 space-y-2">
              {erroredSites.map(({ site, prospect }) => (
                <li key={site.id} className="flex items-center justify-between gap-3 text-sm">
                  <span>
                    <span className="font-medium">
                      {prospect ? `${prospect.firstName} ${prospect.lastName}` : site.name}
                    </span>
                    <span className="block max-w-72 truncate text-xs text-danger-500">
                      {site.generationError ?? "Génération en échec"}
                    </span>
                  </span>
                  <Link
                    href={`/demos/${site.id}/edit`}
                    className="shrink-0 text-xs text-primary-600 underline"
                  >
                    Relancer →
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}

          {lateCount > 0 ? (
            <p className="mt-3 text-sm text-warning-500">
              {lateCount} article{lateCount > 1 ? "s" : ""} du calendrier éditorial en retard de
              rédaction — vérifier le cron des jobs.
            </p>
          ) : null}

          {jobsHealthy ? (
            <p className="mt-4 text-sm text-ink-500">
              Aucune génération en échec, aucun article en retard. Le cron tourne toutes les
              heures.
            </p>
          ) : null}
        </Card>
      </div>

      <Card className="mt-6 p-5">
        <h2 className="font-semibold">Coûts API du mois (estimation)</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {costs.details.map((detail) => (
            <div key={detail.label} className="rounded-2xl bg-cream-100 p-4">
              <p className="text-xs text-ink-500">{detail.label}</p>
              <p className="mt-1 text-xl font-bold">{detail.count}</p>
              <p className="text-xs text-ink-500">≈ {detail.costEur.toFixed(2)} €</p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-ink-500">
          Barème estimatif : article ≈ 0,03 € (claude-sonnet-5) · image ≈ 0,0025 € (fal.ai
          FLUX.1 schnell) · démo complète ≈ 0,30 €. En mode mock, rien n&apos;est facturé.
        </p>
      </Card>
    </div>
  );
}

function StatCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <Card className="p-5">
      <p className="text-xs uppercase tracking-wide text-ink-500">{label}</p>
      <p className="mt-1 text-3xl font-bold text-ink-900">{value}</p>
      <p className="mt-1 text-xs text-ink-500">{detail}</p>
    </Card>
  );
}
