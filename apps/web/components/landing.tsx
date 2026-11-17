import {
  BILLING_PERIODS,
  BILLING_PERIOD_CADENCE,
  BILLING_PERIOD_LABELS,
  MIN_COMMITMENT_MONTHS,
  OFFERED_PLANS,
  PLANS,
  commitmentMonths,
  periodTotal,
  planPeriods,
  planPrice,
  savedMonths,
} from "@theralys/db";
import { Band } from "./band";
import { Control } from "./control";
import { DemoForm } from "./demo-form";
import { ParallaxObserver, SpotlightObserver } from "./effects";
import { Faq } from "./faq";
import { Footer } from "./footer";
import { Header } from "./header";
import { Hero } from "./hero";
import { Logos } from "./logos";
import { Method } from "./method";
import { OwnSite } from "./own-site";
import { Pricing, type PlanCard } from "./pricing";
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
 * - les formules, leurs prix sur chaque durée de facturation, les économies
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
  const plans: PlanCard[] = OFFERED_PLANS.map((id) => {
    const plan = PLANS[id];
    return {
      id,
      label: plan.label,
      periods: planPeriods(id).map((period) => ({
        id: period,
        price: planPrice(id, period) ?? 0,
        total: periodTotal(id, period) ?? 0,
        cadence: BILLING_PERIOD_CADENCE[period],
        savedMonths: savedMonths(id, period),
        commitmentMonths: commitmentMonths(period),
      })),
      homeSpecialties: plan.homeSpecialties,
      maxMotifPages: plan.maxMotifPages,
      blogArticlesPerWeek: plan.blogArticlesPerWeek,
      blogArticlesPerYear: plan.blogArticlesPerYear,
      academy: plan.academy,
      socialMedia: plan.socialMedia,
      googleProfile: plan.googleProfile,
      googleAds: plan.googleAds,
      metaAds: plan.metaAds,
    };
  });
  // Les durées proposées par au moins une formule, dans l'ordre du sélecteur
  const periods = BILLING_PERIODS.filter((period) => OFFERED_PLANS.some((id) => planPrice(id, period) !== null)).map((period) => ({
    id: period,
    label: BILLING_PERIOD_LABELS[period],
  }));
  // Le simulateur raisonne sur la formule complète, en facturation annuelle
  const complete = PLANS.scale;
  const completeAnnualPrice = planPrice("scale", "annual") ?? 0;

  return (
    <>
      <RevealObserver />
      <SpotlightObserver />
      <ParallaxObserver />
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
        <Pricing plans={plans} periods={periods} minCommitmentMonths={MIN_COMMITMENT_MONTHS} />
        <RoiCalculator monthlyCost={completeAnnualPrice} planLabel={complete.label} />
        <Faq />
        <DemoForm />
      </main>
      <Footer />
    </>
  );
}
