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
import { describeSubscriptionPricing, domains, FORMULA_DEFINITIONS, formulaPrice, getDb, hasFormula, hasSite, PLAN_SITE, PLANS, subscriptions, type FormulaId, type PlanId } from "@theralys/db";
import { activeExternalSite, formatDateFr } from "@theralys/shared";
import { Badge, Card, CardHeader, EmptyState, PageHeader, Sequence, Stagger, type BadgeTone } from "@/components/ds";
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

  // Formule Scale seule : pas de site Harmony, donc pas de nom de domaine à lui rattacher
  const hosted = site.type === "demo" || hasSite(site.plan);
  const formulaLabel = plan.formulas.length > 1 ? `Formules ${plan.label}` : `Formule ${plan.label}`;
  // Ce que comprend chaque formule, souscrite (coche) ou non (tiret) : toujours dit en toutes lettres
  const site6 = PLANS[PLAN_SITE];
  const groups: { formula: FormulaId; included: boolean; from: number; features: string[] }[] = [
    {
      formula: "site",
      included: hasFormula(site.plan, "site"),
      from: formulaPrice("site", "triennial"),
      features: [
        "Votre site, son éditeur, son hébergement et son nom de domaine",
        `${site6.maxMotifPages} pages de spécialités dédiées (référencement local)`,
        `${site6.blogArticlesPerYear} articles de blog par an (${site6.blogArticlesPerWeek}/semaine), écrits pour le référencement`,
        "Suivi des mots-clés Google",
      ],
    },
    {
      formula: "scale",
      included: hasFormula(site.plan, "scale"),
      from: formulaPrice("scale", "triennial"),
      features: [
        "Fiche Google : audit, visibilité locale, avis et posts",
        "Contenus réseaux sociaux prêts à poster (visuels et légendes)",
        "Google Ads : analyse, mots-clés et plan d'action",
        "Meta Ads : veille, annonces et plan vidéo",
        "Académie",
      ],
    },
  ];

  return (
    <Stagger className="space-y-6">
      {/* Sans site Harmony (formule Scale seule), pas de nom de domaine à gérer ici */}
      <PageHeader section="compte" purpose={hosted ? undefined : "Vos formules et votre facturation."}>
        {/* À qui est ce compte : le nom de la session et celui du cabinet */}
        <p className="flex items-center gap-3">
          <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-white text-ds-section-accent shadow-sm">
            <UserRound size={20} />
          </span>
          <span className="min-w-0">
            <span className="block text-base font-semibold text-ds-section-ink">{session.name}</span>
            {site.name && site.name !== session.name ? (
              <span className="block text-ds-body text-ds-ink-700">{site.name}</span>
            ) : null}
          </span>
        </p>
      </PageHeader>

      <div className={`grid items-start gap-6 ${hosted ? "xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]" : ""}`}>
        <Card as="section" aria-labelledby="compte-abonnement">
          <CardHeader
            icon={CreditCard}
            title={<span id="compte-abonnement">Mon abonnement</span>}
            description="Vos formules et leur facturation."
          />
          {subscription ? (
            <>
              <div className="mt-5 rounded-ds-md bg-ds-section-tint p-4 ring-1 ring-ds-section-line/70 sm:p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="section" icon={BadgeCheck}>
                    {plan.formulas.length > 1 ? "Formules en cours" : "Formule en cours"}
                  </Badge>
                  {badge ? (
                    <Badge tone={badge.tone} icon={badge.icon}>
                      {badge.label}
                    </Badge>
                  ) : null}
                </div>
                <p className="mt-2.5 font-ds-display text-ds-title font-bold text-ds-section-ink sm:text-[2rem]/10">
                  {formulaLabel}
                </p>
                <ul className="mt-2 space-y-1.5 text-base text-ds-ink-700">
                  <li className="flex items-start gap-2.5">
                    <Wallet size={18} aria-hidden className="mt-[3px] shrink-0 text-ds-section-accent" />
                    {/* Le prix des formules souscrites, sur la durée choisie */}
                    {describeSubscriptionPricing(subscription)}
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

              {/* Chaque formule monte, son état se pose, puis ses lignes arrivent une à une (cf. `Sequence`) */}
              <Sequence kind="formulas" className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-1 min-[90rem]:grid-cols-2" data-testid="compte-formules">
                {groups.map((group) => (
                  <section
                    key={group.formula}
                    aria-labelledby={`formule-${group.formula}`}
                    data-seq="card"
                    data-formula={group.formula}
                    data-included={group.included}
                    className={`rounded-ds-md p-4 ring-1 ${group.included ? "bg-white ring-ds-ink-200" : "bg-ds-ink-50 ring-ds-ink-200"}`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 id={`formule-${group.formula}`} className="text-base font-semibold text-ds-ink-900">
                        Formule {FORMULA_DEFINITIONS[group.formula].label}
                      </h3>
                      <span data-seq="state" className="inline-flex">
                        <Badge tone={group.included ? "success" : "neutral"} icon={group.included ? Check : Minus}>
                          {group.included ? "Souscrite" : "Non souscrite"}
                        </Badge>
                      </span>
                    </div>
                    <ul className="mt-3 space-y-2.5">
                      {group.features.map((feature) => (
                        <li key={feature} data-seq="line" className={`flex items-start gap-2.5 text-ds-body ${group.included ? "text-ds-ink-900" : "text-ds-ink-600"}`}>
                          {group.included ? (
                            <span aria-hidden className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-ds-success-600 text-white">
                              <Check size={12} strokeWidth={3.5} />
                            </span>
                          ) : (
                            <span aria-hidden className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-ds-ink-200 text-ds-ink-600">
                              <Minus size={12} strokeWidth={3.5} />
                            </span>
                          )}
                          {feature}
                        </li>
                      ))}
                    </ul>
                    {group.included ? null : (
                      <p data-seq="note" className="mt-3 text-ds-body text-ds-ink-700">
                        À partir de {group.from}&nbsp;€ TTC par mois. Écrivez à Harmony pour l&apos;ajouter à votre abonnement.
                      </p>
                    )}
                  </section>
                ))}
              </Sequence>
              <p className="mt-3 text-ds-body text-ds-ink-700">Toujours inclus&nbsp;: avis Google synchronisés et statistiques.</p>

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

        {hosted ? (
        <DomainSection
          currentDomain={site.domain}
          domainStatus={attachedDomain?.status ?? null}
          externalRequest={externalRequest?.name ?? null}
          fallbackUrl={siteUrl(site)}
          ownSiteAddress={ownSite ? ownSite.url.replace(/^https?:\/\//, "") : null}
          // Un seul bouton principal par écran : la facturation quand il y a un abonnement, l'achat du domaine sinon
          primaryPurchase={!subscription}
        />
        ) : null}
      </div>
    </Stagger>
  );
}
