import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { Badge, Card } from "@theralys/ui";
import { getDb, prospects, sites, subscriptions, users } from "@theralys/db";
import { PLANS, type PlanId } from "@theralys/db";
import { relativeTimeFr } from "@theralys/shared";
import { requireAdmin } from "@/lib/auth";

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
 * Liste des sites clients (version minimale Phase 3 — l'onglet complet avec
 * impersonation et santé du blog arrive en Phase 4).
 */
export default async function ClientsPage() {
  await requireAdmin();
  const db = getDb();

  const rows = await db
    .select({ site: sites, prospect: prospects, subscription: subscriptions, user: users })
    .from(sites)
    .leftJoin(prospects, eq(sites.prospectId, prospects.id))
    .leftJoin(subscriptions, eq(subscriptions.siteId, sites.id))
    .leftJoin(users, eq(users.siteId, sites.id))
    .where(eq(sites.type, "client"))
    .orderBy(desc(sites.createdAt));

  const sitesBase = (process.env.SITES_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");

  return (
    <div>
      <h1 className="text-2xl font-bold">Clients</h1>
      <p className="mt-1 text-sm text-ink-500">
        {rows.length} site{rows.length > 1 ? "s" : ""} client{rows.length > 1 ? "s" : ""} actif
        {rows.length > 1 ? "s" : ""}
      </p>

      {rows.length === 0 ? (
        <Card className="mt-6 p-10 text-center text-ink-500">
          <p className="font-medium text-ink-700">Aucun site client pour l&apos;instant</p>
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
                <th className="px-4 py-3 font-medium">Formule</th>
                <th className="px-4 py-3 font-medium">Abonnement</th>
                <th className="px-4 py-3 font-medium">Domaine</th>
                <th className="px-4 py-3 font-medium">Depuis</th>
                <th className="px-4 py-3 text-right font-medium">Site</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ site, prospect, subscription, user }) => {
                const badge = SUBSCRIPTION_BADGES[subscription?.status ?? ""] ?? {
                  label: "—",
                  tone: "neutral" as const,
                };
                const url = site.domain ? `https://${site.domain}` : `${sitesBase}/${site.slug}`;
                return (
                  <tr key={site.id} className="border-b border-cream-200 last:border-0 hover:bg-cream-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-ink-900">
                        {prospect ? `${prospect.firstName} ${prospect.lastName}` : site.name}
                      </p>
                      <p className="text-xs text-ink-500">{user?.email ?? "—"}</p>
                    </td>
                    <td className="px-4 py-3">
                      {PLANS[site.plan as PlanId].label}
                      <span className="block text-xs text-ink-500">
                        {subscription?.billingPeriod === "annual" ? "engagement annuel" : "mensuel"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={badge.tone}>{badge.label}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      {site.domain ? (
                        <span className="font-medium">{site.domain}</span>
                      ) : (
                        <span className="text-ink-500">pas encore de domaine</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-ink-500">{relativeTimeFr(site.updatedAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={url}
                        target="_blank"
                        className="text-primary-600 underline-offset-2 hover:underline"
                      >
                        Voir ↗
                      </Link>
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
