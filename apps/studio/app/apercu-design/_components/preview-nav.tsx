import { clsx } from "clsx";
import { FlaskConical } from "lucide-react";
import Link from "next/link";

const PAGES = [
  { id: "fondations", label: "Fondations et composants", href: "/apercu-design" },
  { id: "accueil", label: "Composition : Accueil", href: "/apercu-design/accueil" },
  { id: "section", label: "Composition : page de section", href: "/apercu-design/section/reseaux-sociaux" },
] as const;

/** Bandeau propre à l'aperçu : rappelle que la page est une démonstration et relie ses trois vues. */
export function PreviewNav({ current }: { current: (typeof PAGES)[number]["id"] }) {
  return (
    <nav
      aria-label="Vues de l'aperçu"
      className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-ds-md border border-dashed border-ds-ink-300 bg-white/70 px-3 py-2"
    >
      <span className="inline-flex items-center gap-2 text-ds-meta font-semibold text-ds-ink-700">
        <FlaskConical size={16} aria-hidden />
        Aperçu du design system · hors production
      </span>
      <ul className="flex flex-wrap items-center gap-1">
        {PAGES.map((page) => (
          <li key={page.id}>
            <Link
              href={page.href}
              aria-current={page.id === current ? "page" : undefined}
              className={clsx(
                "inline-flex min-h-9 items-center rounded-full px-3 text-ds-meta font-medium ds-focus pointer-coarse:min-h-11",
                page.id === current ? "bg-ds-brand-100 font-semibold text-ds-brand-900" : "text-ds-brand-700 hover:bg-ds-brand-50",
              )}
            >
              {page.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
