import { Brand } from "./brand";
import { TOOLS } from "./tools";

const COLUMNS = [
  {
    title: "La solution",
    links: [
      { href: "#solution", label: "Tout au même endroit" },
      { href: "#outils", label: "Les sept outils" },
      { href: "#confiance", label: "Vous gardez la main" },
      { href: "#methode", label: "La méthode" },
      { href: "#deja-un-site", label: "Vous avez déjà un site" },
    ],
  },
  {
    title: "Décider",
    links: [
      { href: "#tarifs", label: "Tarifs" },
      { href: "#simulateur", label: "Simulateur de rentabilité" },
      { href: "#faq", label: "Questions fréquentes" },
      { href: "#demo", label: "Demander une démo" },
    ],
  },
  {
    title: "Harmony",
    links: [
      { href: "https://app.harmony-web.fr", label: "Espace client" },
      { href: "/robot", label: "Notre lecteur de sites" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="bg-night-900 py-14 text-white">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
        <div>
          <p className="text-2xl">
            <Brand onDark />
          </p>
          <p className="mt-3 max-w-xs text-base leading-relaxed text-white/75">
            La solution digitale tout-en-un des thérapeutes et des praticiens du bien-être.
          </p>
          <ul aria-label="Les outils de Harmony" className="mt-5 flex max-w-xs flex-wrap gap-1.5">
            {TOOLS.map((tool) => (
              <li key={tool.id} className="rounded-full border border-white/15 px-2.5 py-1 text-xs font-medium text-white/80">
                {tool.short}
              </li>
            ))}
          </ul>
        </div>
        {COLUMNS.map((column) => (
          <nav key={column.title} aria-label={column.title}>
            <p className="text-sm font-semibold text-white/70">{column.title}</p>
            <ul className="mt-3">
              {column.links.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    className="focus-ring-dark inline-flex min-h-11 min-w-11 items-center rounded text-base text-white/85 transition hover:text-primary-300"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="mx-auto mt-12 max-w-6xl border-t border-white/10 px-5 pt-6">
        <p className="text-sm text-white/70">
          © {new Date().getFullYear()} <Brand onDark /> · Tous droits réservés.
        </p>
      </div>
    </footer>
  );
}
