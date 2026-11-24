import { ArrowRight } from "lucide-react";

/**
 * Appel à l'action de fin de section : une phrase et le bouton de démo, pour
 * qu'il y en ait toujours un à portée au fil de la page (l'en-tête n'est pas
 * le seul à en porter). Le bouton est un lien vers `#demo` : il ouvre la
 * fenêtre de demande, ou mène au formulaire du bas de page sans JavaScript.
 */
export function SectionCta({
  text,
  label = "Demander ma démo gratuite",
  dark = false,
  grid = false,
}: {
  text: string;
  label?: string;
  /** Section sur fond sombre */
  dark?: boolean;
  /** Posé dans une grille à deux colonnes : il en prend toute la largeur, l'écart de la grille fait la marge */
  grid?: boolean;
}) {
  return (
    <div data-reveal data-section-cta className={`flex flex-col items-center gap-4 text-center sm:flex-row sm:justify-center sm:gap-6 ${grid ? "lg:col-span-2" : "mt-12"}`}>
      <p className={`text-lg font-medium text-pretty ${dark ? "text-white/90" : "text-ink-900"}`}>{text}</p>
      <a
        href="#demo"
        className={`cta inline-flex min-h-12 shrink-0 items-center gap-2 rounded-full px-7 py-3.5 text-base font-semibold shadow-md transition-[background-color,scale] active:scale-[0.98] ${
          dark ? "focus-ring-dark bg-white text-primary-800 shadow-black/25 hover:bg-primary-50" : "focus-ring bg-primary-600 text-white shadow-black/15 hover:bg-primary-700"
        }`}
      >
        {label}
        <ArrowRight size={18} aria-hidden />
      </a>
    </div>
  );
}
