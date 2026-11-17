import { OFFERED_PLANS, PLANS } from "@theralys/db";
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
 * - les formules et leurs prix viennent de la définition produit
 *   (@theralys/db) : la vitrine et le studio ne peuvent pas se contredire ;
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
      monthlyPrice: plan.monthlyPrice,
      annualMonthlyPrice: plan.annualMonthlyPrice,
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
  // Le simulateur raisonne sur la formule complète, au tarif annuel
  const complete = PLANS.scale;

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
        <Pricing plans={plans} />
        <RoiCalculator monthlyCost={complete.annualMonthlyPrice} planLabel={complete.label} />
        <Faq />
        <DemoForm />
      </main>
      <Footer />
    </>
  );
}
