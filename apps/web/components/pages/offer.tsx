import { MIN_COMMITMENT_MONTHS, PLANS, PLAN_COMPLETE, PLAN_SCALE, PLAN_SITE, planPrice, type PlanId } from "@theralys/db/plans";
import { PROFESSIONS, professionPath, type Profession } from "@/content/professions";
import { inline } from "./prose";
import { Checklist, Section, WideSection } from "./sections";

/*
 * Ce que les pages « Création de site internet » disent de l'offre : tout
 * vient de la définition du produit (@theralys/db/plans), comme sur l'accueil.
 * Une page par métier ne peut donc pas annoncer un autre prix ni un autre
 * contenu que la grille des tarifs.
 */

const NBSP = String.fromCharCode(160);
const euros = (value: number | null) => `${(value ?? 0).toLocaleString("fr-FR")}${NBSP}€`;

const site = PLANS[PLAN_SITE];
const scale = PLANS[PLAN_SCALE];

/** Ce que Harmony met en place, tel que le produit le fait. */
export const DELIVERS: readonly string[] = [
  "**Un site à vos couleurs**, préparé pour votre pratique et votre ville. Vous le modifiez vous-même en quelques clics, avec l'aperçu en direct.",
  `**${site.maxMotifPages} pages de spécialités**, une par motif ou par public, pour vous placer sur les recherches locales.`,
  `**Un blog qui se remplit** : ${site.blogArticlesPerWeek} articles par semaine, rédigés à partir de vos spécialités et de votre ville. Vous pouvez relire, modifier ou retirer chacun d'eux.`,
  "**Nom de domaine, hébergement, certificat de sécurité** : la technique est gérée pour vous.",
  "**Vos statistiques** : visiteurs, clics sur la prise de rendez-vous, appels et provenance de chaque visite.",
  "Avec la formule Scale : **fiche Google, réseaux sociaux et publicité**, préparés dans le même espace.",
];

export function HarmonyDelivers({ tone = "white" }: { tone?: "white" | "cream" }) {
  return (
    <Section tone={tone} title="Ce que Harmony met en place" intro="Vous n'avez ni à écrire, ni à installer, ni à maintenir. Le travail arrive prêt, et **vous gardez la main** sur tout ce qui paraît.">
      <Checklist items={DELIVERS} />
    </Section>
  );
}

const TILES: { plan: PlanId; text: string }[] = [
  { plan: PLAN_SITE, text: `Votre site professionnel et son blog : ${site.maxMotifPages} pages de spécialités, ${site.blogArticlesPerYear} articles par an, nom de domaine et hébergement inclus.` },
  { plan: PLAN_SCALE, text: `Fiche Google, réseaux sociaux${scale.googleAds && scale.metaAds ? ", Google Ads et Meta Ads" : ""} : sur votre site Harmony, ou sur le vôtre.` },
  { plan: PLAN_COMPLETE, text: "Les deux formules réunies : le site, et tout ce qui le fait connaître." },
];

/** « Quel budget prévoir » : les formules et leur prix, lus dans la grille des tarifs. */
export function Budget({ title, tone = "cream" }: { title: string; tone?: "white" | "cream" }) {
  return (
    <WideSection tone={tone} title={title} intro="Pas de devis à attendre : les prix sont publics, et les frais de création sont offerts.">
      <ul className="grid gap-5 md:grid-cols-3">
        {TILES.map(({ plan, text }) => (
          <li key={plan} className="flex flex-col rounded-3xl border border-cream-200 bg-white p-7 shadow-[var(--shadow-card)]">
            <h3 className="font-title text-lg font-bold text-ink-900">Formule {PLANS[plan].label}</h3>
            <p className="mt-3 flex items-end gap-2">
              <span className="font-display text-4xl leading-none font-bold text-ink-900">{euros(planPrice(plan, "monthly"))}</span>
              <span className="pb-1 text-sm text-ink-500">TTC / mois</span>
            </p>
            <p className="mt-2 text-sm font-medium text-success-700">ou {euros(planPrice(plan, "annual"))} par mois en réglant à l&apos;année</p>
            <p className="mt-4 flex-1 leading-relaxed text-ink-700">{text}</p>
          </li>
        ))}
      </ul>
      <p className="mt-6 text-base leading-relaxed text-ink-700">
        Engagement de {MIN_COMMITMENT_MONTHS} mois minimum. Les budgets publicitaires se règlent directement à Google ou à Meta.{" "}
        <a href="/#tarifs" className="focus-ring rounded font-semibold text-primary-700 underline decoration-primary-300 underline-offset-4 hover:text-primary-800">
          Voir le détail des tarifs
        </a>
      </p>
    </WideSection>
  );
}

const PLAN_90: { days: string; title: string; items: string[] }[] = [
  {
    days: "Jours 1 à 30",
    title: "Poser les bases",
    items: [
      "Votre site est ajusté avec vous, puis mis en ligne, la prise de rendez-vous en haut de chaque page.",
      "Votre fiche Google est vérifiée et remplie entièrement.",
      "Vos pages de spécialités couvrent vos motifs les plus fréquents.",
    ],
  },
  {
    days: "Jours 31 à 60",
    title: "Nourrir",
    items: [
      "Les articles paraissent chaque semaine sur votre blog.",
      "Vous demandez un avis à la fin de chaque suivi.",
      "Vous publiez régulièrement sur le réseau que vous avez choisi.",
    ],
  },
  {
    days: "Jours 61 à 90",
    title: "Mesurer et ajuster",
    items: [
      "Vous regardez d'où viennent vos visiteurs et vos prises de contact.",
      "Vous renforcez les pages qui amènent des demandes.",
      "Si la demande manque encore, la publicité devient une option.",
    ],
  },
];

/** « Votre plan sur 90 jours » : le travail, mois par mois — pas un résultat promis. */
export function NinetyDays() {
  return (
    <section className="relative isolate overflow-hidden bg-night-900 text-white">
      <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(50rem_24rem_at_100%_0%,rgb(14_151_221/0.22),transparent_62%)]" />
      <div className="mx-auto max-w-6xl px-5 py-14 md:py-20">
        <h2 className="font-display text-3xl leading-[1.15] font-bold text-balance sm:text-[2.35rem]">Votre plan sur 90 jours</h2>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-white/80">Trois mois pour installer une présence qui travaille pour vous, dans l&apos;ordre où chaque étape sert la suivante.</p>
        <ol className="mt-10 grid gap-5 md:grid-cols-3">
          {PLAN_90.map((step) => (
            <li key={step.days} className="rounded-3xl border border-white/10 bg-white/[0.06] p-6 sm:p-7">
              <p className="text-sm font-semibold text-primary-300">{step.days}</p>
              <h3 className="font-title mt-2 text-xl font-bold">{step.title}</h3>
              <ul className="mt-4 space-y-3">
                {step.items.map((item) => (
                  <li key={item} className="flex gap-3 leading-relaxed text-white/85">
                    <span aria-hidden className="mt-[0.65em] h-1.5 w-1.5 shrink-0 rounded-full bg-primary-400" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
        <p className="mt-8 max-w-3xl text-base leading-relaxed text-white/70">Le référencement naturel met quelques mois à s&apos;installer. Ce plan décrit le travail à mener ; il ne garantit pas un nombre de rendez-vous.</p>
      </div>
    </section>
  );
}

/** Liens vers les pages des autres métiers. */
export function OtherProfessions({ current, title = "Sites internet pour d'autres métiers", tone = "cream" }: { current?: Profession; title?: string; tone?: "white" | "cream" }) {
  const others = PROFESSIONS.filter((profession) => profession.slug !== current?.slug);
  return (
    <WideSection tone={tone} title={title}>
      <ul className="flex flex-wrap gap-2.5">
        {others.map((profession) => (
          <li key={profession.slug}>
            <a
              href={professionPath(profession)}
              className="focus-ring inline-flex min-h-11 items-center rounded-full border border-cream-300 bg-white px-5 py-2.5 text-base font-medium text-ink-900 transition-[border-color,color] hover:border-primary-400 hover:text-primary-700"
            >
              {inline(`Site internet ${profession.of}`)}
            </a>
          </li>
        ))}
        {current ? (
          <li>
            <a
              href="/creation-site-internet"
              className="focus-ring inline-flex min-h-11 items-center rounded-full border border-primary-200 bg-primary-50 px-5 py-2.5 text-base font-semibold text-primary-800 transition-[border-color] hover:border-primary-400"
            >
              Tous les métiers
            </a>
          </li>
        ) : null}
      </ul>
    </WideSection>
  );
}
