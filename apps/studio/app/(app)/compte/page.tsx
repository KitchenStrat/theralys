import { eq } from "drizzle-orm";
import {
  BadgeCheck,
  Ban,
  CalendarClock,
  Check,
  Clock,
  CreditCard,
  Minus,
  Presentation,
  TriangleAlert,
  UserRound,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { domains, getDb, PLANS, subscriptions, type PlanId } from "@theralys/db";
import { activeExternalSite, formatDateFr } from "@theralys/shared";
import { Badge, Card, CardHeader, EmptyState, PageHeader, Stagger, type BadgeTone } from "@/components/ds";
import { requireClient } from "@/lib/auth";
import { getSite, siteUrl } from "@/lib/data";
import { DomainSection } from "./domain-section";
import { PortalButton } from "./portal-button";

export const metadata = { title: "Mon compte" };
export const dynamic = "force-dynamic";

/** Statut de l'abonnement : une icône et un mot ; `help` dit ce qu'il y a à faire, quand il y a quelque chose à faire. */
const STATUS_BADGES: Record<string, { label: string; tone: BadgeTone; icon: LucideIcon; help?: string }> = {
  active: { label: "Actif", tone: "success", icon: Check },
  trialing: { label: "En attente de paiement", tone: "brand", icon: Clock },
  past_due: {
    label: "Paiement en attente",
    tone: "warning",
    icon: TriangleAlert,
    help: "Mettez à jour votre moyen de paiement.",
  },
  canceled: { label: "Annulé", tone: "danger", icon: Ban },
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
  // Site du client en référence : le bloc « domaine » ne concerne plus que le site Harmony, et le dit
  const ownSite = activeExternalSite(site.theme);

  // Ce que comprend la formule : inclus (coche) ou non (tiret), toujours dit en toutes lettres
  const features: { included: boolean; label: string }[] = [
    { included: true, label: `${plan.homeSpecialties} spécialités présentées sur votre page d'accueil` },
    plan.maxMotifPages > 0
      ? { included: true, label: `${plan.maxMotifPages} pages de spécialités dédiées (référencement local)` }
      : { included: false, label: "Pages de spécialités dédiées non incluses" },
    plan.blogArticlesPerWeek > 0
      ? {
          included: true,
          label: `${plan.blogArticlesPerYear} articles de blog par an (${plan.blogArticlesPerWeek}/semaine), écrits pour le référencement`,
        }
      : { included: false, label: "Blog automatisé non inclus" },
    plan.searchConsoleAccess
      ? { included: true, label: "Suivi des mots-clés Google" }
      : { included: false, label: "Suivi des mots-clés non inclus" },
    plan.academy ? { included: true, label: "Académie" } : { included: false, label: "Académie non incluse" },
    plan.socialMedia
      ? { included: true, label: "Contenus réseaux sociaux prêts à poster (visuels et légendes)" }
      : { included: false, label: "Contenus réseaux sociaux non inclus" },
    plan.googleProfile
      ? { included: true, label: "Fiche Google : audit, visibilité locale, avis et posts" }
      : { included: false, label: "Fiche Google (audit, visibilité locale, avis et posts) non incluse" },
    plan.googleAds
      ? { included: true, label: "Google Ads : analyse, mots-clés et plan d'action" }
      : { included: false, label: "Google Ads (analyse, mots-clés et plan d'action) non inclus" },
    plan.metaAds
      ? { included: true, label: "Meta Ads : veille, annonces et plan vidéo" }
      : { included: false, label: "Meta Ads (veille, annonces et plan vidéo) non inclus" },
    { included: true, label: "Avis Google synchronisés · statistiques · hébergement" },
  ];

  return (
    <Stagger className="space-y-6">
      <PageHeader section="compte">
        {/* À qui est ce compte : le nom de la session et celui du cabinet */}
        <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-ds-body text-ds-ink-700">
          <span className="inline-flex items-center gap-2 font-semibold text-ds-section-ink">
            <span aria-hidden className="grid size-8 place-items-center rounded-full bg-white text-ds-section-accent shadow-sm">
              <UserRound size={18} />
            </span>
            {session.name}
          </span>
          {site.name && site.name !== session.name ? (
            <>
              <span aria-hidden>·</span>
              <span>{site.name}</span>
            </>
          ) : null}
        </p>
      </PageHeader>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Card as="section" aria-labelledby="compte-abonnement">
          <CardHeader
            icon={CreditCard}
            title={<span id="compte-abonnement">Mon abonnement</span>}
            description="Votre formule et sa facturation."
            action={
              subscription ? null : (
                <Badge tone="section" icon={Presentation}>
                  Démonstration
                </Badge>
              )
            }
          />
          {subscription ? (
            <>
              <div className="mt-5 rounded-ds-md bg-ds-section-tint p-4 ring-1 ring-ds-section-line/70 sm:p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="section" icon={BadgeCheck}>
                    Formule en cours
                  </Badge>
                  {badge ? (
                    <Badge tone={badge.tone} icon={badge.icon}>
                      {badge.label}
                    </Badge>
                  ) : null}
                </div>
                <p className="mt-2.5 font-ds-display text-ds-title font-bold text-ds-section-ink sm:text-[2rem]/10">
                  Formule {plan.label}
                </p>
                <ul className="mt-2 space-y-1.5 text-base text-ds-ink-700">
                  <li className="flex items-start gap-2.5">
                    <Wallet size={18} aria-hidden className="mt-[3px] shrink-0 text-ds-section-accent" />
                    {subscription.billingPeriod === "annual"
                      ? `Engagement annuel — ${plan.annualMonthlyPrice} €/mois`
                      : `Mensuel sans engagement — ${plan.monthlyPrice} €/mois`}
                  </li>
                  {subscription.currentPeriodEnd ? (
                    <li className="flex items-start gap-2.5">
                      <CalendarClock size={18} aria-hidden className="mt-[3px] shrink-0 text-ds-section-accent" />
                      Prochaine échéance le {formatDateFr(subscription.currentPeriodEnd)}
                    </li>
                  ) : null}
                </ul>
                {badge?.help ? (
                  <p className="mt-3 flex items-start gap-2 text-ds-body font-semibold text-ds-warning-900">
                    <TriangleAlert size={18} aria-hidden className="mt-0.5 shrink-0" />
                    {badge.help}
                  </p>
                ) : null}
              </div>

              <h3 className="mt-6 text-ds-body font-semibold text-ds-ink-800">Ce que comprend votre formule</h3>
              <ul className="mt-3 grid gap-x-6 gap-y-2.5 sm:grid-cols-2 xl:grid-cols-1 min-[90rem]:grid-cols-2">
                {features.map((feature) => (
                  <li
                    key={feature.label}
                    className={`flex items-start gap-2.5 text-ds-body ${feature.included ? "text-ds-ink-900" : "text-ds-ink-600"}`}
                  >
                    {feature.included ? (
                      <span aria-hidden className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-ds-success-600 text-white">
                        <Check size={12} strokeWidth={3.5} />
                      </span>
                    ) : (
                      <span aria-hidden className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-ds-ink-200 text-ds-ink-600">
                        <Minus size={12} strokeWidth={3.5} />
                      </span>
                    )}
                    {feature.label}
                  </li>
                ))}
              </ul>

              <div className="mt-6 border-t border-ds-ink-200 pt-5">
                <PortalButton />
              </div>
            </>
          ) : (
            <EmptyState icon={Presentation} title="Site de démonstration" className="pb-4 sm:pb-6">
              L&apos;abonnement démarre à l&apos;activation par Harmony. Votre formule et sa facturation apparaîtront ici.
            </EmptyState>
          )}
        </Card>

        <DomainSection
          currentDomain={site.domain}
          domainStatus={attachedDomain?.status ?? null}
          externalRequest={externalRequest?.name ?? null}
          fallbackUrl={siteUrl(site)}
          ownSiteAddress={ownSite ? ownSite.url.replace(/^https?:\/\//, "") : null}
          // Un seul bouton principal par écran : la facturation quand il y a un abonnement, l'achat du domaine sinon
          primaryPurchase={!subscription}
        />
      </div>
    </Stagger>
  );
}
