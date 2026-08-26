import { OFFERED_PLANS, PLANS } from "@theralys/db";
import { Band } from "@/components/band";
import { DemoForm } from "@/components/demo-form";
import { ParallaxObserver, SpotlightObserver } from "@/components/effects";
import { Faq } from "@/components/faq";
import { Features } from "@/components/features";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { Hero } from "@/components/hero";
import { Logos } from "@/components/logos";
import { Presence } from "@/components/presence";
import { Pricing, type PlanCard } from "@/components/pricing";
import { RevealObserver } from "@/components/reveal";
import { ScrollProgress } from "@/components/scroll-progress";
import { SocialProof } from "@/components/social-proof";
import { Temoignages } from "@/components/temoignages";

/*
 * Vitrine harmony-web.fr — page unique. Les formules affichées viennent
 * directement de la définition produit (@theralys/db) : impossible que la
 * vitrine et le back office racontent des tarifs différents.
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
      searchConsoleAccess: plan.searchConsoleAccess,
    };
  });

  return (
    <>
      <RevealObserver />
      <SpotlightObserver />
      <ParallaxObserver />
      <ScrollProgress />
      <SocialProof />
      <Header />
      <main>
        <Hero />
        <Logos />
        <Features />
        <Presence />
        <Band />
        <Pricing plans={plans} />
        <Temoignages />
        <Faq />
        <DemoForm />
      </main>
      <Footer />
    </>
  );
}
