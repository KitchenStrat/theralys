"use client";

import { clsx } from "clsx";
import { ChevronRight, Ellipsis, ExternalLink, LogOut, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { Badge } from "../badge";
import { SectionBadge } from "../icon-badge";
import {
  MOBILE_PRIORITY,
  SECTIONS,
  SECTION_ORDER,
  sectionForPath,
  sectionHref,
} from "../sections";
import type { ShellNavProps } from "./sidebar-nav";

const SLOT =
  "relative flex min-h-16 w-full flex-col items-center gap-0.5 rounded-ds-sm px-0.5 pt-1.5 pb-2 text-xs font-medium text-ds-ink-600 ds-focus-inset";

/**
 * Navigation du mobile : une barre basse de quatre destinations, plus « Plus »
 * qui ouvre le reste dans une feuille (`<dialog>` natif : focus piégé, Échap,
 * retour du focus). La pastille en dégradé glisse d'une destination à l'autre.
 */
export function MobileNav({ sections, siteHref, logoutAction, userName, badges, hrefs }: ShellNavProps) {
  const pathname = usePathname();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const sheetId = useId();
  const titleId = useId();

  const allowed = new Set(sections);
  const primary = MOBILE_PRIORITY.filter((key) => allowed.has(key)).slice(0, 4);
  const more = SECTION_ORDER.filter((key) => allowed.has(key) && !primary.includes(key));
  const found = sectionForPath(pathname, hrefs);
  const active = found && allowed.has(found) ? found : null;
  const count = primary.length + 1;
  const activeIndex = active ? (primary.includes(active) ? primary.indexOf(active) : primary.length) : -1;
  const moreBadge = more.some((key) => badges?.[key]);

  // La feuille se referme quand on change de page
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog?.open) dialog.close();
  }, [pathname]);

  return (
    <>
      <nav
        aria-label="Navigation principale"
        className="fixed inset-x-0 bottom-0 z-40 bg-white px-1 pb-[env(safe-area-inset-bottom)] shadow-ds-bar lg:hidden"
      >
        <ul
          className="relative mx-auto grid max-w-xl"
          style={
            {
              gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))`,
              "--ds-n": count,
              "--ds-i": Math.max(0, activeIndex),
            } as CSSProperties
          }
        >
          <li
            aria-hidden
            className="ds-bottom-pill"
            data-ds-section={active ?? undefined}
            data-ds-off={activeIndex < 0 ? "" : undefined}
          >
            {/* Les mêmes pictogrammes, en blanc : visibles seulement sous la pastille */}
            <span>
              {primary.map((key) => {
                const Icon = SECTIONS[key].icon;
                return <Icon key={key} size={22} />;
              })}
              <Ellipsis size={22} />
            </span>
          </li>
          {primary.map((key) => {
            const def = SECTIONS[key];
            const Icon = def.icon;
            const current = active === key;
            return (
              <li key={key}>
                <Link
                  href={sectionHref(key, hrefs)}
                  data-ds-section={key}
                  aria-current={current ? "page" : undefined}
                  className={clsx(SLOT, current && "font-semibold text-ds-section-ink")}
                >
                  <span className="relative grid h-8 place-items-center">
                    <Icon size={22} aria-hidden />
                    {badges?.[key] ? (
                      <span aria-hidden className="absolute -top-0.5 -right-2 size-2.5 rounded-full bg-ds-sun-400 ring-2 ring-white" />
                    ) : null}
                  </span>
                  <span className="max-w-full truncate">{def.shortLabel}</span>
                  {badges?.[key] ? <span className="sr-only"> ({badges[key]})</span> : null}
                </Link>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              aria-haspopup="dialog"
              aria-expanded={open}
              aria-controls={sheetId}
              data-ds-section={active && !primary.includes(active) ? active : undefined}
              onClick={() => {
                dialogRef.current?.showModal();
                setOpen(true);
              }}
              className={clsx(SLOT, activeIndex === primary.length && "font-semibold text-ds-section-ink")}
            >
              <span className="relative grid h-8 place-items-center">
                <Ellipsis size={22} aria-hidden />
                {moreBadge ? (
                  <span aria-hidden className="absolute -top-0.5 -right-2 size-2.5 rounded-full bg-ds-sun-400 ring-2 ring-white" />
                ) : null}
              </span>
              <span>Plus</span>
            </button>
          </li>
        </ul>
      </nav>

      <dialog
        ref={dialogRef}
        id={sheetId}
        aria-labelledby={titleId}
        className="ds-sheet"
        onClose={() => setOpen(false)}
        onClick={(event) => {
          if (event.target === event.currentTarget) event.currentTarget.close();
        }}
      >
        <div className="px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <span aria-hidden className="mx-auto block h-1.5 w-10 rounded-full bg-ds-ink-200" />
          <div className="mt-2 flex items-center justify-between gap-3">
            <h2 id={titleId} className="px-1.5 font-ds-display text-xl font-bold text-ds-ink-900">
              Plus
            </h2>
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="grid size-11 place-items-center rounded-full text-ds-ink-700 ds-focus"
            >
              <X size={22} aria-hidden />
              <span className="sr-only">Fermer</span>
            </button>
          </div>

          <ul className="mt-1 space-y-1">
            {more.map((key) => {
              const def = SECTIONS[key];
              return (
                <li key={key}>
                  <Link
                    href={sectionHref(key, hrefs)}
                    data-ds-section={key}
                    aria-current={active === key ? "page" : undefined}
                    className={clsx(
                      "flex min-h-14 items-center gap-3.5 rounded-ds-md px-2.5 text-base font-medium text-ds-ink-800 ds-focus",
                      active === key && "bg-ds-section-tint-2 font-semibold text-ds-section-ink",
                    )}
                  >
                    <SectionBadge section={key} size="sm" tone={active === key ? "gradient" : "soft"} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{def.label}</span>
                      {key === "compte" && userName ? (
                        <span className="block truncate text-ds-meta font-normal text-ds-ink-600">{userName}</span>
                      ) : null}
                    </span>
                    {badges?.[key] ? <Badge tone="sun">{badges[key]}</Badge> : null}
                    <ChevronRight size={18} aria-hidden className="shrink-0 text-ds-ink-400" />
                  </Link>
                </li>
              );
            })}
          </ul>

          <ul className="mt-3 space-y-1 border-t border-ds-ink-200 pt-3">
            <li>
              <a
                href={siteHref}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-14 items-center gap-3.5 rounded-ds-md px-2.5 text-base font-medium text-ds-ink-800 ds-focus"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-[0.625rem] bg-ds-brand-50 text-ds-brand-700">
                  <ExternalLink size={18} aria-hidden />
                </span>
                <span className="flex-1">
                  Voir mon site<span className="sr-only"> (nouvel onglet)</span>
                </span>
              </a>
            </li>
            <li>
              <form action={logoutAction}>
                <button
                  type="submit"
                  className="flex min-h-14 w-full items-center gap-3.5 rounded-ds-md px-2.5 text-left text-base font-medium text-ds-ink-800 ds-focus"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-[0.625rem] bg-ds-ink-100 text-ds-ink-700">
                    <LogOut size={18} aria-hidden />
                  </span>
                  <span className="flex-1">Déconnexion</span>
                </button>
              </form>
            </li>
          </ul>
        </div>
      </dialog>
    </>
  );
}
