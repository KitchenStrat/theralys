import { eq } from "drizzle-orm";
import { Badge, Card } from "@theralys/ui";
import { domains, getDb, PLANS, subscriptions, type PlanId } from "@theralys/db";
import { formatDateFr } from "@theralys/shared";
import { requireClient } from "@/lib/auth";
import { getSite, siteUrl } from "@/lib/data";
import { DomainSection } from "./domain-section";
import { PortalButton } from "./portal-button";

export const metadata = { title: "Mon compte" };
export const dynamic = "force-dynamic";

const STATUS_BADGES: Record<string, { label: string; tone: "success" | "info" | "warning" | "danger" }> = {
  active: { label: "Actif", tone: "success" },
  trialing: { label: "En attente de paiement", tone: "info" },
  past_due: { label: "Paiement en attente — mettez à jour votre moyen de paiement", tone: "warning" },
  canceled: { label: "Annulé", tone: "danger" },
};

export default async function AccountPage() {
  const session = await requireClient();
  const site = await getSite(session.siteId);
  const db = getDb();
  const [subscription, domainRows] = await Promise.all([
    db.query.subscriptions.findFirst({ where: eq(subscriptions.siteId, site.id) }),
    db.query.domains.findMany({ where: eq(domains.siteId, site.id) }),
  ]);
  // Domaine rattaché (acheté via Harmony) vs demande de rattachement d'un
  // domaine que le client possède déjà (registrar « externe », en attente).
  const attachedDomain = site.domain ? domainRows.find((d) => d.name === site.domain) : undefined;
  const externalRequest = domainRows.find(
    (d) => d.registrar === "externe" && d.status === "pending",
  );

  const plan = PLANS[site.plan as PlanId];
  const badge = subscription ? STATUS_BADGES[subscription.status] : null;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-3xl font-bold">Mon compte</h1>

      <Card className="p-6">
        <h2 className="font-semibold">Mon abonnement</h2>
        {subscription ? (
          <>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <span className="text-lg font-bold">Formule {plan.label}</span>
              {badge ? <Badge tone={badge.tone}>{badge.label}</Badge> : null}
            </div>
            <p className="mt-2 text-sm text-ink-500">
              {subscription.billingPeriod === "annual"
                ? `Engagement annuel — ${plan.annualMonthlyPrice} €/mois`
                : `Mensuel sans engagement — ${plan.monthlyPrice} €/mois`}
              {subscription.currentPeriodEnd
                ? ` · prochaine échéance le ${formatDateFr(subscription.currentPeriodEnd)}`
                : ""}
            </p>
            <ul className="mt-4 space-y-1 text-sm text-ink-700">
              <li>✓ {plan.homeSpecialties} spécialités présentées sur votre page d&apos;accueil</li>
              <li>
                {plan.maxMotifPages > 0
                  ? `✓ ${plan.maxMotifPages} pages de spécialités dédiées (SEO local)`
                  : "— Pages de spécialités dédiées non incluses"}
              </li>
              <li>
                {plan.blogArticlesPerWeek > 0
                  ? `✓ ${plan.blogArticlesPerYear} articles SEO par an (${plan.blogArticlesPerWeek}/semaine)`
                  : "— Blog automatisé non inclus"}
              </li>
              <li>{plan.searchConsoleAccess ? "✓ Suivi des mots-clés Google" : "— Suivi des mots-clés non inclus"}</li>
              <li>✓ Avis Google synchronisés · statistiques · hébergement</li>
            </ul>
            <div className="mt-5">
              <PortalButton />
            </div>
          </>
        ) : (
          <p className="mt-3 text-sm text-ink-500">
            Site de démonstration — l&apos;abonnement démarre à l&apos;activation par Harmony.
          </p>
        )}
      </Card>

      <DomainSection
        currentDomain={site.domain}
        domainStatus={attachedDomain?.status ?? null}
        externalRequest={externalRequest?.name ?? null}
        fallbackUrl={siteUrl(site)}
      />
    </div>
  );
}
