import { ExternalLink, LifeBuoy } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { LinkButton } from "../button";
import { sectionHref } from "../sections";
import { MobileNav } from "./mobile-nav";
import { SidebarNav, type ShellNavProps } from "./sidebar-nav";

export type AppShellProps = ShellNavProps & {
  /** Mode support : nom du compte dont l'équipe a pris la main (affiche le bandeau) */
  supportName?: string;
  /** Nom de marque affiché (marque blanche à venir) */
  brand?: string;
  children: ReactNode;
};

/**
 * Coquille du studio : barre latérale à partir de 1 024 px, barre du haut et
 * barre basse en dessous. Composant serveur ; seules les deux navigations sont
 * clientes (chemin courant, pastille glissante, feuille « Plus »).
 *
 * La zone de contenu est un `<div role="main">` et non un `<main>` : la feuille
 * partagée de packages/ui cible `main > * > *` (montée de page de 550 ms) et
 * `main .shadow-card` (soulèvement de toutes les cartes) par des règles hors
 * couche, que rien ici ne pourrait surcharger. Le rôle ARIA est identique.
 *
 * Aucun ancêtre du contenu ne porte `transform`, `filter` ni `backdrop-filter` :
 * la `Modal` partagée (sans portail) reste positionnée dans la fenêtre.
 */
export function AppShell({ supportName, brand = "Harmony", children, ...nav }: AppShellProps) {
  const homeHref = sectionHref("accueil", nav.hrefs);
  return (
    <div className="ds-app">
      <a href="#contenu" className="ds-skip">
        Aller au contenu
      </a>

      {supportName ? (
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-ds-warning-100 px-4 py-2 text-ds-body text-ds-warning-900">
          <span className="inline-flex items-center gap-2">
            <LifeBuoy size={18} aria-hidden />
            <span>
              Mode support — connecté en tant que <strong className="font-semibold">{supportName}</strong>
            </span>
          </span>
          <form action={nav.logoutAction}>
            <button type="submit" className="min-h-8 rounded-full px-2 font-semibold underline underline-offset-2 ds-focus">
              Quitter
            </button>
          </form>
        </div>
      ) : null}

      {/* Mobile et tablette : barre du haut (marque, accès au site) */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-ds-ink-200 bg-white px-4 lg:hidden">
        <Link href={homeHref} className="ds-brand-word inline-flex min-h-11 items-center rounded-lg text-2xl ds-focus">
          {brand}
        </Link>
        <LinkButton href={nav.siteHref} external variant="secondary" size="sm" icon={<ExternalLink size={16} aria-hidden />}>
          Voir mon site
        </LinkButton>
      </header>

      <div className="lg:flex">
        {/* La colonne blanche court sur toute la hauteur de la page ; son contenu reste collé à la fenêtre */}
        <aside className="hidden w-[280px] shrink-0 border-r border-ds-ink-200 bg-white lg:block">
          <div className="sticky top-0 flex h-dvh flex-col">
            <div className="px-6 pt-6 pb-4">
              <Link href={homeHref} className="ds-brand-word inline-block rounded-lg text-3xl ds-focus">
                {brand}
              </Link>
            </div>
            <SidebarNav {...nav} />
          </div>
        </aside>

        <div role="main" id="contenu" tabIndex={-1} className="min-w-0 flex-1 outline-none">
          {/* Pas de `@container` ici : il ferait de ce bloc le repère des éléments `position: fixed` (la Modal partagée) */}
          <div className="mx-auto w-full max-w-[1200px] px-4 pt-5 pb-28 sm:px-6 lg:px-10 lg:pt-9 lg:pb-16">{children}</div>
        </div>
      </div>

      <MobileNav {...nav} />
    </div>
  );
}
