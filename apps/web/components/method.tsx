import { type CSSProperties } from "react";
import { Mail, MapPin, Newspaper, Share2, type LucideIcon } from "lucide-react";
import { Timeline } from "./timeline";
import { rich } from "./rich";
import { Kinetic } from "./kinetic";
import { SectionCta } from "./section-cta";

const STEPS = [
  {
    title: "Vous demandez votre démo",
    text: "Dites-nous votre pratique et votre ville. Nous préparons **un site complet pour votre cabinet**, gratuitement et sans engagement.",
  },
  {
    title: "Nous l'ajustons ensemble",
    text: "Couleurs, textes, photos : le site est retouché **jusqu'à ce qu'il vous ressemble**. Vous avez déjà un site ? Nous y branchons vos outils.",
  },
  {
    title: "Mise en ligne, sans technique",
    text: "Nom de domaine, hébergement, certificat de sécurité : **tout est géré pour vous**. Vous validez, c'est en ligne.",
  },
  {
    title: "Chaque semaine, votre espace se remplit",
    text: "Articles, contenus pour vos réseaux, suivi de votre fiche Google : **le travail arrive prêt**, vous gardez un œil dessus.",
  },
];

type WeekItem = { icon: LucideIcon; label: string; from: string; to: string };
const BLOG: WeekItem = { icon: Newspaper, label: "Un article paraît", from: "#01A2B9", to: "#0A88CC" };

/* Exemple de semaine avec les deux formules, Site et Scale : 4 articles, 2 contenus pour les réseaux, et le relevé de visibilité (toutes les deux semaines) */
const WEEK: { day: string; items: WeekItem[] }[] = [
  { day: "Lundi", items: [BLOG, { icon: Share2, label: "Un visuel prêt à poster", from: "#0E97DD", to: "#8F6CE0" }] },
  { day: "Mardi", items: [BLOG] },
  { day: "Mercredi", items: [{ icon: MapPin, label: "Relevé Google Maps, une semaine sur deux", from: "#00A497", to: "#008EB3" }] },
  { day: "Jeudi", items: [BLOG, { icon: Share2, label: "Un carrousel prêt à poster", from: "#0E97DD", to: "#8F6CE0" }] },
  { day: "Vendredi", items: [BLOG] },
];

export function Method() {
  let rank = 0;
  return (
    <section id="methode" className="relative overflow-hidden py-24 md:py-28">

      <div className="mx-auto max-w-6xl px-5">
        <div className="max-w-2xl">
          <h2
            data-reveal="kinetic"
            className="font-display text-3xl leading-tight font-bold text-balance text-ink-900 md:text-5xl"
          >
            <Kinetic>De la démo à votre première semaine</Kinetic>
          </h2>
          <p data-reveal style={{ "--rv-delay": "160ms" } as CSSProperties} className="mt-4 text-lg leading-relaxed text-pretty text-ink-700">
            Quatre étapes, aucune compétence technique. Vous savez à tout moment où vous en êtes.
          </p>
        </div>

        <div className="mt-14 grid gap-14 lg:grid-cols-[1fr_0.92fr] lg:gap-16">
          <Timeline className="space-y-10">
            {STEPS.map((step, index) => (
              <li key={step.title} data-reveal style={{ "--rv-delay": `${index * 90}ms` } as CSSProperties} className="relative flex gap-5">
                <span className="timeline-dot font-title relative z-10 grid h-11 w-11 shrink-0 place-items-center rounded-full text-lg font-bold">
                  {index + 1}
                </span>
                <div className="pt-1">
                  <h3 className="font-title text-xl font-bold text-ink-900 md:text-2xl">{step.title}</h3>
                  <p className="mt-1.5 leading-relaxed text-ink-700">{rich(step.text)}</p>
                </div>
              </li>
            ))}
          </Timeline>

          {/* Une semaine type : les contenus arrivent l'un après l'autre */}
          <div data-reveal data-week className="week lg:sticky lg:top-28 lg:self-start">
            <div className="rounded-3xl border border-cream-200 bg-white p-6 shadow-[var(--shadow-pop)] md:p-7">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-title text-xl font-bold text-ink-900">
                  Une semaine avec Harmony
                </h3>
                <p className="rounded-full bg-primary-100 px-3 py-1 text-xs font-bold text-primary-800">Exemple, formules Site + Scale</p>
              </div>
              <ol className="mt-5 space-y-2.5">
                {WEEK.map((entry) => (
                  <li key={entry.day} className="grid grid-cols-[5.25rem_1fr] items-start gap-3 rounded-2xl bg-cream-100/80 p-2.5">
                    <span className="pt-1.5 text-sm font-bold text-ink-900">{entry.day}</span>
                    <ul className="flex flex-wrap gap-1.5">
                      {entry.items.map((item) => (
                        <li
                          key={item.label}
                          className="week-item inline-flex items-center gap-2 rounded-full bg-white py-1 pr-3 pl-1 text-sm font-medium text-ink-900 shadow-sm ring-1 ring-cream-200"
                          style={{ "--t-from": item.from, "--t-to": item.to, "--week-delay": `${rank++ * 160}ms` } as CSSProperties}
                        >
                          <span className="tool-chip grid h-6 w-6 shrink-0 place-items-center rounded-full">
                            <item.icon size={13} strokeWidth={2.4} aria-hidden />
                          </span>
                          {item.label}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ol>
              <p className="mt-4 flex items-start gap-2.5 rounded-2xl bg-primary-50 p-3 text-sm leading-relaxed text-ink-700">
                <Mail size={18} className="mt-0.5 shrink-0 text-primary-700" aria-hidden />
                Chaque semaine, un e-mail vous rappelle les contenus à poster. Les jours de publication se règlent dans votre
                espace.
              </p>
            </div>
          </div>
        </div>

        {/* Un bouton de démo à la fin de chaque grande section */}
        <SectionCta text="La première étape prend une minute." label="Demander ma démo" />
      </div>
    </section>
  );
}
