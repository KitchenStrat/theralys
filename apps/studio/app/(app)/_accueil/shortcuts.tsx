import { ArrowRight } from "lucide-react";
import { InteractiveCard, SECTIONS, SectionBadge, type SectionKey } from "@/components/ds";
import { frenchSpacing } from "@/lib/external-site/format";

/**
 * « Vos espaces » : une carte par section ouverte par la formule, à sa
 * couleur, avec la phrase qui dit à quoi elle sert (registre des sections).
 * La carte entière est le lien.
 */
export function Shortcuts({ sections }: { sections: readonly SectionKey[] }) {
  if (sections.length === 0) return null;
  return (
    <section aria-labelledby="espaces-title">
      <h2 id="espaces-title" className="font-ds-display text-xl/7 font-bold text-ds-ink-900">
        Vos espaces
      </h2>
      <p className="mt-0.5 text-ds-body text-ds-ink-600">Tout ce que comprend votre formule, et à quoi sert chaque espace.</p>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {sections.map((key) => {
          const section = SECTIONS[key];
          return (
            <li key={key}>
              <InteractiveCard
                href={section.href}
                section={key}
                padding="sm"
                className="h-full bg-linear-to-b from-ds-section-tint to-white to-60% sm:p-5"
              >
                {/* Pastille à gauche du texte ; au-dessus quand les cartes sont quatre par rangée (colonnes étroites) */}
                <span className="flex items-start gap-3.5 xl:flex-col xl:gap-3">
                  <SectionBadge section={key} size="md" />
                  <span className="min-w-0 flex-1 xl:w-full">
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-base font-semibold text-ds-ink-900">{section.label}</span>
                      <ArrowRight size={16} aria-hidden className="shrink-0 text-ds-section-accent" />
                    </span>
                    {/* Séparateur lu, invisible : le nom du lien est « Publications : Les articles de votre blog… » */}
                    <span className="sr-only"> : </span>
                    {/* Espaces insécables : dans une carte étroite, une ligne ne commence jamais par un deux-points */}
                    <span className="mt-0.5 block text-ds-body text-ds-ink-600">{frenchSpacing(section.purpose)}</span>
                  </span>
                </span>
              </InteractiveCard>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
