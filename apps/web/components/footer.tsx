import { categoryPath } from "@/content/articles";
import { BLOG_CATEGORIES } from "@/content/blog";
import { FEATURED_PROFESSIONS, PROFESSIONS, capitalize, professionPath } from "@/content/professions";
import { Brand } from "./brand";
import { TOOLS } from "./tools";

type FooterLink = { href: string; label: string };

/** Sections de l'accueil : des ancres sur l'accueil, des liens vers l'accueil ailleurs. */
const NAVIGATION: FooterLink[] = [
  { href: "#solution", label: "La solution" },
  { href: "#outils", label: "Les sept outils" },
  { href: "#methode", label: "La méthode" },
  { href: "#deja-un-site", label: "Vous avez déjà un site" },
  { href: "#tarifs", label: "Tarifs" },
  { href: "#simulateur", label: "Simulateur de rentabilité" },
  { href: "#faq", label: "Questions fréquentes" },
];

const BY_PROFESSION: FooterLink[] = [
  { href: "/creation-site-internet", label: "Création de site internet" },
  ...FEATURED_PROFESSIONS.map((profession) => ({ href: professionPath(profession), label: `Site ${capitalize(profession.name)}` })),
];

const LINK = "focus-ring-dark inline-flex min-h-11 min-w-11 items-center rounded text-base text-white/85 transition hover:text-primary-300";
const SMALL_LINK = "focus-ring-dark inline-flex min-h-11 items-center rounded text-sm text-white/70 transition hover:text-primary-300";

function Column({ title, links }: { title: string; links: readonly FooterLink[] }) {
  return (
    <nav aria-label={title}>
      <p className="text-sm font-semibold text-white/70">{title}</p>
      <ul className="mt-3">
        {links.map((link) => (
          <li key={link.href}>
            <a href={link.href} className={LINK}>
              {link.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Une ligne discrète de liens : toutes les pages d'une famille, à portée des visiteurs comme des moteurs de recherche. */
function Row({ title, links }: { title: string; links: readonly FooterLink[] }) {
  return (
    <nav aria-label={title} className="md:flex md:items-baseline md:gap-6">
      <p className="shrink-0 text-sm font-semibold text-white/70 md:w-52">{title}</p>
      <ul className="mt-1 flex flex-wrap gap-x-5 md:mt-0">
        {links.map((link) => (
          <li key={link.href}>
            <a href={link.href} className={SMALL_LINK}>
              {link.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * Pied de page, le même sur toutes les pages : la navigation, les pages par
 * métier, puis deux lignes qui recensent tous les métiers et toutes les
 * thématiques du blog. `home` : cf. `Header`.
 */
export function Footer({ home = true }: { home?: boolean }) {
  const to = (anchor: string) => (home ? anchor : `/${anchor}`);
  const navigation: FooterLink[] = [...(home ? [] : [{ href: "/", label: "Accueil" }]), ...NAVIGATION.map((link) => ({ ...link, href: to(link.href) })), { href: "/blog", label: "Blog" }];
  const harmony: FooterLink[] = [
    { href: to("#demo"), label: "Demander une démo" },
    { href: "https://app.harmony-web.fr", label: "Espace client" },
    { href: "/robot", label: "Notre lecteur de sites" },
  ];

  return (
    <footer className="bg-night-900 py-14 text-white">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr]">
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
        <Column title="Navigation" links={navigation} />
        <Column title="Par métier" links={BY_PROFESSION} />
        <Column title="Harmony" links={harmony} />
      </div>

      <div className="mx-auto mt-10 max-w-6xl px-5">
        <div className="space-y-4 border-t border-white/10 pt-6">
          <Row title="Sites internet par métier" links={PROFESSIONS.map((profession) => ({ href: professionPath(profession), label: capitalize(profession.name) }))} />
          <Row title="Guides du blog" links={BLOG_CATEGORIES.map((category) => ({ href: categoryPath(category.slug), label: category.label }))} />
        </div>
        <p className="mt-8 border-t border-white/10 pt-6 text-sm text-white/70">© {new Date().getFullYear()} Harmony. Tous droits réservés.</p>
      </div>
    </footer>
  );
}
