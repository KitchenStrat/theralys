import type { Metadata } from "next";
import { MIN_COMMITMENT_MONTHS } from "@theralys/db/plans";
import { Budget, HarmonyDelivers, NinetyDays } from "@/components/pages/offer";
import { inline } from "@/components/pages/prose";
import { Section, WideSection } from "@/components/pages/sections";
import { ArticleCard, CtaBand, FaqList, JsonLd, PageHero, PageShell } from "@/components/pages/shell";
import { getArticle } from "@/content/articles";
import type { Article } from "@/content/blog";
import { PROFESSIONS, PROFESSION_FAMILIES, professionPath, professionsIn } from "@/content/professions";
import { ORGANIZATION_JSON_LD, absoluteUrl, breadcrumbJsonLd, faqJsonLd, pageMetadata, type Crumb } from "@/lib/site";

const PATH = "/creation-site-internet";
const TITLE = "Création de site internet pour thérapeutes et praticiens du bien-être";
const DESCRIPTION = "Un site créé pour votre pratique et votre ville, mis en ligne sans technique et référencé près de chez vous. Un guide par métier, démo gratuite.";
const CRUMBS: Crumb[] = [
  { label: "Accueil", href: "/" },
  { label: "Création de site internet", href: PATH },
];

export const metadata: Metadata = pageMetadata({ title: "Création de site internet pour thérapeutes", description: DESCRIPTION, path: PATH });

/** Les étapes, les mêmes que sur l'accueil (section « Méthode »). */
const STEPS: { title: string; text: string }[] = [
  { title: "Vous demandez votre démo", text: "Dites-nous votre pratique et votre ville. Nous préparons **un site complet pour votre cabinet**, gratuitement et sans engagement." },
  { title: "Nous l'ajustons ensemble", text: "Couleurs, textes, photos : le site est retouché **jusqu'à ce qu'il vous ressemble**." },
  { title: "Mise en ligne, sans technique", text: "Nom de domaine, hébergement, certificat de sécurité : **tout est géré pour vous**. Vous validez, c'est en ligne." },
  { title: "Chaque semaine, votre espace se remplit", text: "Articles, contenus pour vos réseaux, suivi de votre fiche Google : **le travail arrive prêt**, vous gardez un œil dessus." },
];

const FAQ: { q: string; a: string }[] = [
  { q: "Combien de temps faut-il pour être en ligne ?", a: "Quelques jours suffisent le plus souvent. Nous préparons d'abord une démo personnalisée de votre futur site. Une fois validée avec vous — textes, couleurs, photos —, la mise en ligne est immédiate." },
  { q: "Dois-je m'occuper de la technique ?", a: "Non. Nom de domaine, hébergement, certificat de sécurité, mises à jour : tout est géré pour vous, et le site reste maintenu en permanence." },
  { q: "J'ai déjà un site : dois-je en changer ?", a: "Non. Avec la formule Scale seule, vous indiquez l'adresse de votre site dans votre espace : la fiche Google, les réseaux sociaux et la publicité s'appuient dessus, sans qu'il soit modifié." },
  { q: "Puis-je utiliser mon nom de domaine actuel ?", a: "Oui. Vous nous l'indiquez depuis votre espace, et notre équipe s'occupe du rattachement. Sinon, le nom de domaine de votre choix est inclus dans la formule Site." },
  { q: "Y a-t-il un engagement ?", a: `Oui, de ${MIN_COMMITMENT_MONTHS} mois minimum, quel que soit le rythme de règlement. Les frais de création et la formation sont offerts.` },
  { q: "Mon métier n'est pas dans la liste : est-ce possible ?", a: "Oui. Harmony s'adresse à tous les thérapeutes et praticiens du bien-être : indiquez votre pratique dans la demande de démo, le site est préparé pour elle." },
];

const GUIDES = ["combien-coute-site-internet-therapeute", "pages-site-therapeute", "referencement-local-therapeute"];

/** La page « Création de site internet » : l'entrée vers les pages par métier. */
export default function CreationPage() {
  const guides = GUIDES.map(getArticle).filter((article): article is Article => Boolean(article));
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "Service",
      name: TITLE,
      serviceType: "Création et référencement de site internet",
      description: DESCRIPTION,
      url: absoluteUrl(PATH),
      areaServed: { "@type": "Country", name: "France" },
      provider: ORGANIZATION_JSON_LD,
    },
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: "Sites internet par métier",
      itemListElement: PROFESSIONS.map((profession, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: `Création de site internet pour ${profession.name}`,
        url: absoluteUrl(professionPath(profession)),
      })),
    },
    faqJsonLd(FAQ),
    breadcrumbJsonLd(CRUMBS),
  ];

  return (
    <PageShell>
      <JsonLd data={jsonLd} />
      <PageHero crumbs={CRUMBS} title={TITLE} lead="Un site préparé pour **votre pratique et votre ville**, mis en ligne sans technique, puis nourri chaque semaine." pricing />

      <WideSection
        title="Un guide pour chaque métier"
        intro={`${PROFESSIONS.length} métiers, chacun avec sa page : comment on vous cherche, les pages à prévoir, le cadre à respecter.`}
        cta="Quel que soit votre métier, la démo est préparée pour votre pratique."
      >
        <div className="space-y-11">
          {PROFESSION_FAMILIES.map((family) => (
            <section key={family.id} aria-labelledby={`famille-${family.id}`}>
              <h3 id={`famille-${family.id}`} className="font-title text-xl font-bold text-ink-900">
                {family.label}
              </h3>
              <p className="mt-1.5 max-w-2xl text-base leading-relaxed text-ink-700">{family.intro}</p>
              <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {professionsIn(family.id).map((profession) => (
                  <li key={profession.slug}>
                    <a
                      href={professionPath(profession)}
                      data-metier={profession.slug}
                      className="focus-ring flex min-h-14 items-center rounded-2xl border border-cream-200 bg-white px-5 py-3.5 text-[1.0625rem] leading-snug font-semibold text-ink-900 shadow-[var(--shadow-card)] transition-[border-color,color,translate] hover:-translate-y-0.5 hover:border-primary-300 hover:text-primary-800"
                    >
                      Site internet {profession.of}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </WideSection>

      <HarmonyDelivers tone="cream" />

      <Section title="Comment cela se passe" intro="De la première demande à un site qui vit, en quatre étapes." cta="La première étape prend une minute.">
        <ol className="space-y-3">
          {STEPS.map((step, index) => (
            <li key={step.title} className="flex gap-4 rounded-2xl border border-cream-200 bg-white px-5 py-5 shadow-[var(--shadow-card)]">
              <span aria-hidden className="font-display grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary-100 text-xl leading-none text-primary-800">
                {index + 1}
              </span>
              <div>
                <h3 className="font-title text-lg font-bold text-ink-900">{step.title}</h3>
                <p className="mt-1.5 text-[1.0625rem] leading-[1.65] text-ink-700">{inline(step.text)}</p>
              </div>
            </li>
          ))}
        </ol>
      </Section>

      <Budget title="Quel budget prévoir" />
      <NinetyDays />

      <Section title="Questions fréquentes" intro="Ce que l'on nous demande le plus souvent avant de lancer un site." cta="Une autre question ? Posez-la pendant votre démo.">
        <FaqList faq={FAQ} />
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

      <section className="bg-white">
        <div className="mx-auto max-w-6xl px-5 py-14 md:py-16">
          <CtaBand
            title="Voyez votre futur site avant de décider"
            text="Dites-nous votre pratique et votre ville : nous préparons une démo de votre site, **gratuitement et sans engagement**."
            secondary={{ href: "/blog", label: "Lire le blog" }}
          />
        </div>
      </section>
    </PageShell>
  );
}
