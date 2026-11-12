"use client";

import { clsx } from "clsx";
import { ExternalLink, LogOut } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useId, useLayoutEffect, useRef } from "react";
import { Badge } from "../badge";
import {
  SECTIONS,
  SECTION_GROUPS,
  sectionForPath,
  sectionHref,
  type SectionHrefs,
  type SectionKey,
} from "../sections";

export type ShellNavProps = {
  /** Sections ouvertes par la formule, dans l'ordre du registre */
  sections: readonly SectionKey[];
  /** Adresse de « Voir mon site » */
  siteHref: string;
  /** Action serveur de déconnexion */
  logoutAction: (formData: FormData) => void | Promise<void>;
  /** Nom du praticien, rappelé sous « Compte » */
  userName?: string;
  /** Pastille par section : un compteur (« 2 ») ou « Nouveau » */
  badges?: Partial<Record<SectionKey, string>>;
  /** Adresses de substitution (page d'aperçu) */
  hrefs?: SectionHrefs;
};

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

const ROW =
  "ds-nav-item group flex min-h-11 items-center gap-3 rounded-ds-sm px-2.5 py-1 text-ds-body font-medium text-ds-ink-700 ds-focus";

function NavItem({
  section,
  href,
  active,
  hint,
  badge,
}: {
  section: SectionKey;
  href: string;
  active: boolean;
  hint?: string;
  badge?: string;
}) {
  const def = SECTIONS[section];
  const Icon = def.icon;
  return (
    <Link
      href={href}
      data-ds-section={section}
      aria-current={active ? "page" : undefined}
      className={clsx(ROW, active && "font-semibold text-ds-section-ink")}
    >
      {/* Pastille : teinte douce au repos, dégradé de la section quand l'entrée est active (fondu d'opacité) */}
      <span className="relative grid size-9 shrink-0 place-items-center rounded-[0.625rem] bg-ds-section-tint-2 text-ds-section-accent">
        <Icon size={18} aria-hidden />
        <span
          aria-hidden
          className={clsx(
            "absolute inset-0 grid place-items-center rounded-[inherit] bg-ds-section-gradient text-ds-section-on shadow-ds-glow transition-opacity duration-ds-base ease-ds-out",
            active ? "opacity-100" : "opacity-0",
          )}
        >
          <Icon size={18} />
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate">{def.label}</span>
        {hint ? <span className="block truncate text-ds-meta font-normal text-ds-ink-600">{hint}</span> : null}
      </span>
      {badge ? <Badge tone="sun">{badge}</Badge> : null}
    </Link>
  );
}

/**
 * Navigation latérale (ordinateur) : icône et libellé toujours visibles,
 * entrées groupées par objectif, pastille de fond qui glisse jusqu'à l'entrée
 * active. Trois indices pour l'entrée active : le fond teinté, la pastille en
 * dégradé, la graisse — plus `aria-current="page"`.
 */
export function SidebarNav({ sections, siteHref, logoutAction, userName, badges, hrefs }: ShellNavProps) {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);
  const headingBase = useId();
  const allowed = new Set(sections);
  const found = sectionForPath(pathname, hrefs);
  const active = found && allowed.has(found) ? found : null;

  const measure = useCallback(() => {
    const nav = navRef.current;
    const indicator = indicatorRef.current;
    if (!nav || !indicator) return;
    const link = nav.querySelector<HTMLElement>('a[aria-current="page"]');
    if (!link) return;
    indicator.style.setProperty("--ds-ind-y", `${link.offsetTop}px`);
    indicator.style.setProperty("--ds-ind-h", `${link.offsetHeight}px`);
  }, []);

  // La pastille est placée sans transition à la première mesure, puis glisse à chaque navigation
  useIsomorphicLayoutEffect(() => {
    measure();
    const nav = navRef.current;
    if (nav && !nav.hasAttribute("data-ds-ready")) {
      void nav.offsetWidth;
      nav.setAttribute("data-ds-ready", "");
    }
  }, [measure, active]);

  useEffect(() => {
    const nav = navRef.current;
    if (!nav || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => measure());
    observer.observe(nav);
    return () => observer.disconnect();
  }, [measure]);

  const item = (key: SectionKey, hint?: string) => (
    <li key={key}>
      <NavItem section={key} href={sectionHref(key, hrefs)} active={active === key} hint={hint} badge={badges?.[key]} />
    </li>
  );

  return (
    <nav ref={navRef} aria-label="Navigation principale" className="relative flex min-h-0 flex-1 flex-col overflow-y-auto px-3 pb-4">
      <span
        ref={indicatorRef}
        aria-hidden
        className="ds-nav-indicator"
        data-ds-section={active ?? undefined}
        data-ds-on={active ? "" : undefined}
      />

      {allowed.has("accueil") ? <ul className="space-y-1">{item("accueil")}</ul> : null}

      {SECTION_GROUPS.map((group) => {
        const keys = group.sections.filter((key) => allowed.has(key));
        const first = keys[0];
        if (!first) return null;
        // Un groupe réduit à une entrée du même nom ne répète pas son intitulé
        const heading = !(keys.length === 1 && SECTIONS[first].label === group.label);
        const headingId = `${headingBase}-${group.key}`;
        return (
          <div key={group.key} className={heading ? "mt-4" : "mt-1"}>
            {heading ? (
              <p id={headingId} className="px-2.5 pb-1.5 text-ds-meta font-semibold text-ds-ink-500">
                {group.label}
              </p>
            ) : null}
            <ul
              aria-labelledby={heading ? headingId : undefined}
              aria-label={heading ? undefined : group.label}
              className="space-y-1"
            >
              {keys.map((key) => item(key))}
            </ul>
          </div>
        );
      })}

      <div className="mt-auto pt-5">
        <ul className="space-y-1 border-t border-ds-ink-200 pt-3">
          {allowed.has("compte") ? item("compte", userName) : null}
          <li>
            {/* `data-testid` : le même que le lien de la mise en page actuelle (un seul par page ; les liens du mobile n'en portent pas) */}
            <a
              href={siteHref}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="view-site-link"
              className={ROW}
              data-ds-section="accueil"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-[0.625rem] bg-ds-brand-50 text-ds-brand-700">
                <ExternalLink size={18} aria-hidden />
              </span>
              <span className="min-w-0 flex-1 truncate">
                Voir mon site<span className="sr-only"> (nouvel onglet)</span>
              </span>
            </a>
          </li>
          <li>
            <form action={logoutAction}>
              <button type="submit" className={clsx(ROW, "w-full text-left")} data-ds-section="compte">
                <span className="grid size-9 shrink-0 place-items-center rounded-[0.625rem] bg-ds-ink-100 text-ds-ink-700">
                  <LogOut size={18} aria-hidden />
                </span>
                <span className="min-w-0 flex-1 truncate">Déconnexion</span>
              </button>
            </form>
          </li>
        </ul>
      </div>
    </nav>
  );
}
