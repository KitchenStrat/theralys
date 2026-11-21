import {
  BILLING_PERIODS,
  BILLING_PERIOD_CADENCE,
  BILLING_PERIOD_LABELS,
  MIN_COMMITMENT_MONTHS,
  FORMULA_DEFINITIONS,
  PLANS,
  PLAN_COMPLETE,
  PLAN_SCALE,
  PLAN_SITE,
  commitmentMonths,
  periodTotal,
  planPeriods,
  planPrice,
  savedMonths,
  type PlanId,
} from "@theralys/db";
import { Band } from "./band";
import { BillingPeriodProvider } from "./billing-period";
import { Control } from "./control";
import { DemoForm } from "./demo-form";
import { MagneticObserver, ParallaxObserver, SpotlightObserver } from "./effects";
import { Faq } from "./faq";
import { Footer } from "./footer";
import { Header } from "./header";
import { Hero } from "./hero";
import { Logos } from "./logos";
import { Method } from "./method";
import { OwnSite } from "./own-site";
import { Pricing, type FormulaCard, type PlanPeriod } from "./pricing";
import { RevealObserver } from "./reveal";
import { RoiCalculator } from "./roi-calculator";
import { ScrollProgress } from "./scroll-progress";
import { Solution } from "./solution";
import { Testimonials } from "./testimonials";
import { Tour } from "./tour";

/*
 * Vitrine harmony-web.fr, page unique. Harmony y est présenté comme ce qu'il
 * est devenu : une solution complète pour la présence en ligne d'un
 * thérapeute (site, blog, fiche Google, réseaux sociaux, publicité,
 * statistiques), et non plus un seul outil de site internet.
 *
 * Deux règles tiennent la page :
 * - les deux formules (Site, Scale — à prendre seules ou ensemble), leurs
 *   prix sur chaque durée de facturation, les économies
 *   et l'engagement viennent de la définition produit (@theralys/db) : la
 *   vitrine, le studio et la facturation ne peuvent pas se contredire ;
 * - rien n'y est inventé. Les captures sont de vrais écrans du studio (compte
 *   de démonstration), chaque phrase décrit un comportement réel du produit,
 *   et la page ne porte aucun chiffre de clientèle. La section des
 *   témoignages est en place avec des contenus provisoires, signalés comme
 *   tels sur la page tant qu'ils n'ont pas été remplacés par de vrais retours
 *   (cf. `PROVISIONAL` dans `testimonials.tsx`).
 */
export function Landing() {
  const pricesOf = (plan: PlanId): PlanPeriod[] =>
    planPeriods(plan).map((period) => ({
      id: period,
      price: planPrice(plan, period) ?? 0,
      total: periodTotal(plan, period) ?? 0,
      cadence: BILLING_PERIOD_CADENCE[period],
      savedMonths: savedMonths(plan, period),
      commitmentMonths: commitmentMonths(period),
    }));
  const site = PLANS[PLAN_SITE];
  const scale = PLANS[PLAN_SCALE];
  const ads = [scale.googleAds && "Google Ads", scale.metaAds && "Meta Ads"].filter(Boolean).join(" et ");
  // Ce que comprend chaque formule, lu dans sa définition : une ligne par outil
  const formulas: FormulaCard[] = [
    {
      id: "site",
      label: FORMULA_DEFINITIONS.site.label,
      periods: pricesOf(PLAN_SITE),
      features: [
        "Site professionnel clé en main, à vos couleurs",
        `${site.maxMotifPages} pages de spécialités pour le référencement local`,
        `Blog SEO : ${site.blogArticlesPerYear} articles par an`,
        "Hébergement et nom de domaine inclus",
      ],
    },
    {
      id: "scale",
      label: FORMULA_DEFINITIONS.scale.label,
      periods: pricesOf(PLAN_SCALE),
      features: [
        scale.googleProfile && "Fiche Google : audit, visibilité, avis et posts",
        scale.socialMedia && "Réseaux sociaux : contenus prêts à poster",
        ads && `${ads} : diagnostic, plan d'action et contenus`,
        "Sur votre site Harmony, ou sur le vôtre connecté",
      ].filter((line): line is string => Boolean(line)),
    },
  ];
  // Les prix de chaque choix : une formule seule, ou les deux (la somme)
  const totals = { site: pricesOf(PLAN_SITE), scale: pricesOf(PLAN_SCALE), both: pricesOf(PLAN_COMPLETE) };
  const labels = { site: site.label, scale: scale.label, both: PLANS[PLAN_COMPLETE].label };
  // Les durées du sélecteur, dans l'ordre
  const periods = BILLING_PERIODS.map((period) => ({ id: period, label: BILLING_PERIOD_LABELS[period] }));

  return (
    <>
      <RevealObserver />
      <SpotlightObserver />
      <ParallaxObserver />
      <MagneticObserver />
      <ScrollProgress />
      <a href="#contenu" className="skip-link">
        Aller au contenu
      </a>
      <Header />
      <main id="contenu">
        <Hero />
        <Logos />
        <Solution />
        <Tour />
        <Control />
        <Method />
        <OwnSite />
        <Testimonials />
        <Band />
        <BillingPeriodProvider>
          <Pricing formulas={formulas} totals={totals} periods={periods} minCommitmentMonths={MIN_COMMITMENT_MONTHS} />
          <RoiCalculator prices={totals} labels={labels} />
        </BillingPeriodProvider>
        <Faq />
        <DemoForm />
      </main>
      <Footer />
    </>
  );
}
