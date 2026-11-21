import { and, desc, eq, sql } from "drizzle-orm";
import Link from "next/link";
import { Badge, Card } from "@theralys/ui";
import {
  blogArticles,
  describeSubscriptionPricing,
  domains,
  getDb,
  hasSite,
  PLANS,
  prospects,
  sites,
  subscriptions,
  users,
  type PlanId,
} from "@theralys/db";
import { relativeTimeFr } from "@theralys/shared";
import { requireAdmin } from "@/lib/auth";
import { alignLegacyAccounts } from "@/lib/formulas";
import { blogHealth } from "@/lib/metrics";
import { FormulaSwitch } from "./formula-switch";
import { ClientRowActions } from "./row-actions";

export const metadata = { title: "Clients" };
export const dynamic = "force-dynamic";

const SUBSCRIPTION_BADGES: Record<
  string,
  { label: string; tone: "success" | "info" | "warning" | "danger" | "neutral" }
> = {
  active: { label: "Actif", tone: "success" },
  trialing: { label: "En attente de paiement", tone: "info" },
  past_due: { label: "Impayé", tone: "warning" },
  canceled: { label: "Annulé", tone: "danger" },
};

/**
 * Comptes clients : formules (Site, Scale, ou les deux), abonnement, accès
 * rapide au site public et au studio (impersonation), santé du blog.
 */
export default async function ClientsPage() {
  await requireAdmin();
  const db = getDb();
  // Les comptes d'avant le découpage de l'offre ont les deux formules
  await alignLegacyAccounts(db);

  const [rows, articleStats, externalRequests] = await Promise.all([
    db
      .select({ site: sites, prospect: prospects, subscription: subscriptions, user: users })
      .from(sites)
      .leftJoin(prospects, eq(sites.prospectId, prospects.id))
      .leftJoin(subscriptions, eq(subscriptions.siteId, sites.id))
      .leftJoin(users, eq(users.siteId, sites.id))
      .where(eq(sites.type, "client"))
      .orderBy(desc(sites.createdAt)),
    db
      .select({
        siteId: blogArticles.siteId,
        lastPublishedAt: sql<Date | null>`max(case when ${blogArticles.status} = 'published' then ${blogArticles.publishedAt} end)`,
        nextScheduledAt: sql<Date | null>`min(case when ${blogArticles.status} = 'scheduled' then ${blogArticles.publishAt} end)`,
      })
      .from(blogArticles)
      .groupBy(blogArticles.siteId),
    // Domaines que les clients possèdent déjà et confient à l'équipe pour
    // rattachement (demande faite depuis leur back office, statut en attente).
    db
      .select({ siteId: domains.siteId, name: domains.name })
      .from(domains)
      .where(and(eq(domains.registrar, "externe"), eq(domains.status, "pending"))),
  ]);

  const statsBySite = new Map(articleStats.map((s) => [s.siteId, s]));
  const externalRequestBySite = new Map(externalRequests.map((d) => [d.siteId, d.name]));
  const sitesBase = (process.env.SITES_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");

  return (
    <div>
      <h1 className="text-2xl font-bold">Clients</h1>
      <p className="mt-1 text-sm text-ink-500">
        {rows.length} compte{rows.length > 1 ? "s" : ""} client{rows.length > 1 ? "s" : ""}
      </p>

      {rows.length === 0 ? (
        <Card className="mt-6 p-10 text-center text-ink-500">
          <p className="font-medium text-ink-700">Aucun client pour l&apos;instant</p>
          <p className="mt-1 text-sm">
            Convertissez une démo « Prête à vérifier » depuis sa page d&apos;édition.
          </p>
        </Card>
      ) : (
        <Card className="mt-6 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-cream-200 text-left text-xs uppercase tracking-wide text-ink-500">
                <th className="px-4 py-3 font-medium">Client</th>
                <th className="px-4 py-3 font-medium">Formules</th>
                <th className="px-4 py-3 font-medium">Abonnement</th>
                <th className="px-4 py-3 font-medium">Santé du blog</th>
                <th className="px-4 py-3 font-medium">Domaine</th>
                <th className="px-4 py-3 font-medium">Depuis</th>
                <th className="px-4 py-3 text-right font-medium">Accès</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ site, prospect, subscription, user }) => {
                const badge = SUBSCRIPTION_BADGES[subscription?.status ?? ""] ?? {
                  label: "—",
                  tone: "neutral" as const,
                };
                const url = site.domain ? `https://${site.domain}` : `${sitesBase}/${site.slug}`;
                const stats = statsBySite.get(site.id);
                const health = blogHealth({
                  plan: site.plan as PlanId,
                  lastPublishedAt: stats?.lastPublishedAt ? new Date(stats.lastPublishedAt) : null,
                  nextScheduledFor: stats?.nextScheduledAt ? new Date(stats.nextScheduledAt) : null,
                });
                return (
                  <tr key={site.id} className="border-b border-cream-200 last:border-0 hover:bg-cream-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-ink-900">
                        {prospect ? `${prospect.firstName} ${prospect.lastName}` : site.name}
                      </p>
                      <p className="text-xs text-ink-500">{user?.email ?? "—"}</p>
                    </td>
                    <td className="px-4 py-3">
                      <FormulaSwitch siteId={site.id} plan={site.plan as PlanId} clientName={prospect ? `${prospect.firstName} ${prospect.lastName}` : site.name} />
                      <span className="mt-1 block text-xs text-ink-500" title={PLANS[site.plan as PlanId].label}>
                        {subscription ? describeSubscriptionPricing({ plan: site.plan as PlanId, billingPeriod: subscription.billingPeriod }) : "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={badge.tone}>{badge.label}</Badge>
                      {site.status === "archived" ? (
                        <span className="mt-1 block text-xs text-danger-500">site archivé</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1.5">
                        <span
                          aria-hidden
                          className={
                            health.status === "ok"
                              ? "h-2 w-2 rounded-full bg-success-500"
                              : health.status === "late"
                                ? "h-2 w-2 rounded-full bg-warning-500"
                                : "h-2 w-2 rounded-full bg-ink-300"
                          }
                        />
                        <span className="text-xs text-ink-700">{health.label}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {!hasSite(site.plan as PlanId) ? (
                        <span className="text-xs text-ink-500">Pas de site hébergé</span>
                      ) : site.domain ? (
                        <span className="font-medium">{site.domain}</span>
                      ) : externalRequestBySite.has(site.id) ? (
                        <span>
                          <span className="font-medium">{externalRequestBySite.get(site.id)}</span>
                          <span className="block text-xs font-medium text-warning-500">
                            à rattacher — domaine du client
                          </span>
                        </span>
                      ) : (
                        <span className="text-ink-500">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-ink-500">{relativeTimeFr(site.updatedAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        {hasSite(site.plan as PlanId) ? (
                          <Link
                            href={url}
                            target="_blank"
                            className="rounded-full border border-ink-300 px-3 py-1 text-xs font-medium text-ink-700 hover:bg-cream-100"
                          >
                            Site ↗
                          </Link>
                        ) : null}
                        <ClientRowActions
                          siteId={site.id}
                          hasSite={hasSite(site.plan as PlanId)}
                          invitePending={Boolean(user?.passwordHash.startsWith("invite:"))}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
