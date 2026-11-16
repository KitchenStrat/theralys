import { OFFERED_PLANS, PLANS } from "@theralys/db";
import { Band } from "@/components/band";
import { Control } from "@/components/control";
import { DemoForm } from "@/components/demo-form";
import { ParallaxObserver, SpotlightObserver } from "@/components/effects";
import { Faq } from "@/components/faq";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { Hero } from "@/components/hero";
import { Logos } from "@/components/logos";
import { Method } from "@/components/method";
import { OwnSite } from "@/components/own-site";
import { Pricing, type PlanCard } from "@/components/pricing";
import { RevealObserver } from "@/components/reveal";
import { RoiCalculator } from "@/components/roi-calculator";
import { ScrollProgress } from "@/components/scroll-progress";
import { Solution } from "@/components/solution";
import { Tour } from "@/components/tour";

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
 *   et la page ne porte ni témoignage ni chiffre de clientèle tant que de
 *   vrais retours ne sont pas disponibles.
 */
export default function HomePage() {
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
