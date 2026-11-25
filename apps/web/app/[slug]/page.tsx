import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Budget, HarmonyDelivers, NinetyDays, OtherProfessions } from "@/components/pages/offer";
import { Callout, Checklist, Section, WideSection } from "@/components/pages/sections";
import { ArticleCard, CtaBand, FaqList, JsonLd, PageHero, PageShell } from "@/components/pages/shell";
import { getArticle } from "@/content/articles";
import type { Article } from "@/content/blog";
import { PROFESSIONS, PROFESSION_PREFIX, capitalize, professionFromSegment, professionPath } from "@/content/professions";
import { ORGANIZATION_JSON_LD, absoluteUrl, breadcrumbJsonLd, faqJsonLd, pageMetadata, type Crumb } from "@/lib/site";

type Params = { params: Promise<{ slug: string }> };

/*
 * Les pages « Création de site internet pour <métier> », à l'adresse
 * `/creation-site-internet-<métier>`. Ce segment dynamique ne sert qu'à elles :
 * les métiers sont connus à la construction, toute autre adresse est une page
 * introuvable.
 */
export const dynamicParams = false;

export function generateStaticParams() {
  return PROFESSIONS.map((profession) => ({ slug: `${PROFESSION_PREFIX}${profession.slug}` }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const profession = professionFromSegment((await params).slug);
  if (!profession) return {};
  return pageMetadata({ title: `Création de site internet pour ${profession.name}`, description: profession.description, path: professionPath(profession) });
}

/** Les guides du blog proposés en fin de page, quel que soit le métier. */
const GUIDES = ["referencement-local-therapeute", "fiche-google-therapeute", "pages-site-therapeute"];

export default async function ProfessionPage({ params }: Params) {
  const profession = professionFromSegment((await params).slug);
  if (!profession) notFound();
  const path = professionPath(profession);
  const title = `Création de site internet pour ${profession.name}`;
  const crumbs: Crumb[] = [
    { label: "Accueil", href: "/" },
    { label: "Création de site internet", href: "/creation-site-internet" },
    { label: capitalize(profession.name), href: path },
  ];
  const guides = GUIDES.map(getArticle).filter((article): article is Article => Boolean(article));
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "Service",
      name: title,
      serviceType: "Création et référencement de site internet",
      description: profession.description,
      url: absoluteUrl(path),
      areaServed: { "@type": "Country", name: "France" },
      audience: { "@type": "Audience", audienceType: capitalize(profession.plural) },
      provider: ORGANIZATION_JSON_LD,
    },
    faqJsonLd(profession.faq),
    breadcrumbJsonLd(crumbs),
  ];

  return (
    <PageShell>
      <JsonLd data={jsonLd} />
      <PageHero crumbs={crumbs} title={title} lead={profession.hook} pricing />

      <Section title={`Comment on cherche ${profession.a} sur Google`} intro={profession.search.intro}>
        <Checklist items={profession.search.points} />
      </Section>

      <Section tone="cream" title={`Les pages à prévoir sur un site ${profession.of}`} intro={profession.pages.intro} cta="Ces pages, Harmony les prépare pour votre cabinet.">
        <Checklist items={profession.pages.items} />
      </Section>

      <Section title="Être trouvé près de chez vous" intro={profession.local.intro}>
        <Checklist items={profession.local.items} />
      </Section>

      <Section tone="cream" title="Le cadre à respecter" intro={profession.frame.intro}>
        <Checklist items={profession.frame.items} />
      </Section>

      <Section
        title="De quoi parler sur votre blog"
        intro="Des sujets qui répondent à de vraies recherches. Avec Harmony, les articles sont rédigés pour vous, sur les thématiques que vous choisissez."
        cta="Vos articles rédigés pour vous, chaque semaine."
      >
        <ol className="space-y-3">
          {profession.topics.map((topic, index) => (
            <li key={topic} className="flex items-center gap-4 rounded-2xl border border-cream-200 bg-cream-50 px-5 py-4 text-[1.0625rem] leading-snug font-medium text-ink-900">
              <span aria-hidden className="font-display text-2xl leading-none text-primary-600">
                {index + 1}
              </span>
              <span>{topic}</span>
            </li>
          ))}
        </ol>
      </Section>

      <Section
        tone="cream"
        title="Et la publicité ?"
        intro={profession.ordered ? "Votre déontologie tranche : votre visibilité se gagne sans annonce payante." : "Elle amplifie un site qui convertit ; elle ne remplace pas le reste."}
      >
        <Callout>{profession.ads}</Callout>
        {profession.ordered ? null : (
          <p className="mt-4 text-base text-ink-700">
            <a href="/blog/google-ads-therapeute" className="focus-ring rounded font-semibold text-primary-700 underline decoration-primary-300 underline-offset-4 hover:text-primary-800">
              Dans quels cas Google Ads vaut le coup
            </a>
          </p>
        )}
      </Section>

      <HarmonyDelivers ordered={profession.ordered} />
      <Budget title={`Quel budget prévoir pour un site ${profession.of}`} ordered={profession.ordered} />
      <NinetyDays ordered={profession.ordered} />

      <Section title="Questions fréquentes" intro={`Ce que l'on nous demande le plus souvent avant de lancer un site ${profession.of}.`} cta="Une autre question ? Posez-la pendant votre démo.">
        <FaqList faq={profession.faq} />
      </Section>

      {guides.length > 0 ? (
        <WideSection tone="cream" title="Pour aller plus loin">
          <ul className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {guides.map((article) => (
              <li key={article.slug}>
                <ArticleCard article={article} />
              </li>
            ))}
          </ul>
        </WideSection>
      ) : null}

      <OtherProfessions current={profession} tone="white" />

      <section className="bg-cream-100">
        <div className="mx-auto max-w-6xl px-5 py-14 md:py-16">
          <CtaBand
            title={`Votre site ${profession.of}, prêt à être vu`}
            text="Dites-nous votre pratique et votre ville : nous préparons une démo de votre futur site, **gratuitement et sans engagement**."
            secondary={{ href: "/creation-site-internet", label: "Tous les métiers" }}
          />
        </div>
      </section>
    </PageShell>
  );
}
