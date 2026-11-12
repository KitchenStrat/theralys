"use client";

import { clsx } from "clsx";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from "react";

export type TabItem<T extends string = string> = {
  id: T;
  label: string;
  icon?: LucideIcon;
  /** Compteur ou pastille à droite du libellé */
  badge?: ReactNode;
  /** Onglet-lien : la page se recharge avec ce paramètre (période, mois…) */
  href?: string;
};

export type TabsProps<T extends string = string> = {
  tabs: readonly TabItem<T>[];
  value: T;
  onChange?: (id: T) => void;
  /** Nom accessible du groupe d'onglets : « Vues de la fiche Google » */
  label: string;
  /** Préfixe des identifiants : l'onglet `x` s'appelle `<idBase>-tab-x`, son panneau `<idBase>-panel-x` */
  idBase: string;
  /**
   * `underline` : onglets de page, trait en dégradé qui glisse sous l'onglet actif.
   * `pill` : sélecteur à segments de largeur égale (périodes, vues), pastille blanche qui glisse.
   */
  variant?: "underline" | "pill";
  className?: string;
};

// `useLayoutEffect` côté navigateur seulement (pas d'avertissement au rendu serveur)
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Onglets accessibles (modèle WAI-ARIA : flèches, Début, Fin, activation au
 * focus) avec indicateur glissant. Trois indices pour l'onglet actif : le
 * trait ou la pastille, la graisse, la couleur. L'indicateur ne s'anime que
 * par translation et échelle ; en mouvement réduit il change de place sans
 * transition.
 */
export function Tabs<T extends string = string>({
  tabs,
  value,
  onChange,
  label,
  idBase,
  variant = "underline",
  className,
}: TabsProps<T>) {
  const listRef = useRef<HTMLDivElement>(null);
  const selectedIndex = Math.max(
    0,
    tabs.findIndex((tab) => tab.id === value),
  );

  const measure = useCallback(() => {
    const list = listRef.current;
    if (!list || variant !== "underline") return;
    const selected = list.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!selected) return;
    list.style.setProperty("--ds-tab-x", `${selected.offsetLeft}px`);
    list.style.setProperty("--ds-tab-w", String(selected.offsetWidth));
  }, [variant]);

  // Une lecture puis une écriture par changement d'onglet ; la transition n'est
  // activée qu'après la première mesure (pas de glissement au chargement).
  useIsomorphicLayoutEffect(() => {
    measure();
    const list = listRef.current;
    if (!list) return;
    if (!list.hasAttribute("data-ds-ready")) {
      void list.offsetWidth; // la position est prise en compte avant que la transition existe
      list.setAttribute("data-ds-ready", "");
    }
    // L'onglet actif reste visible quand la rangée défile (mobile)
    const selected = list.querySelector<HTMLElement>('[aria-selected="true"]');
    if (selected && list.scrollWidth > list.clientWidth) {
      list.scrollLeft = Math.max(0, selected.offsetLeft - (list.clientWidth - selected.offsetWidth) / 2);
    }
  }, [measure, value, tabs.length]);

  useEffect(() => {
    const list = listRef.current;
    if (!list || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => measure());
    observer.observe(list);
    return () => observer.disconnect();
  }, [measure]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const last = tabs.length - 1;
    const next =
      event.key === "ArrowRight"
        ? selectedIndex === last
          ? 0
          : selectedIndex + 1
        : event.key === "ArrowLeft"
          ? selectedIndex === 0
            ? last
            : selectedIndex - 1
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : null;
    if (next === null) return;
    const target = tabs[next];
    if (!target) return;
    event.preventDefault();
    const element = listRef.current?.querySelector<HTMLElement>(`#${CSS.escape(`${idBase}-tab-${target.id}`)}`);
    element?.focus();
    if (target.href) element?.click();
    else onChange?.(target.id);
  }

  const pill = variant === "pill";
  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      style={pill ? ({ "--ds-n": tabs.length, "--ds-i": selectedIndex } as CSSProperties) : undefined}
      className={clsx(
        "relative",
        pill
          ? "inline-grid max-w-full auto-cols-fr grid-flow-col rounded-full bg-ds-ink-100 p-1 inset-ring inset-ring-ds-ink-200"
          : "ds-tabs-scroll flex gap-1 overflow-x-auto border-b border-ds-ink-200 sm:gap-2",
        className,
      )}
    >
      {pill ? <span aria-hidden className="ds-segmented-indicator" /> : null}
      {tabs.map((tab) => {
        const selected = tab.id === value;
        const Icon = tab.icon;
        const classes = clsx(
          "relative shrink-0 items-center justify-center gap-2 whitespace-nowrap",
          pill
            ? "z-10 inline-flex min-h-9 rounded-full px-4 text-sm font-medium ds-focus pointer-coarse:min-h-11"
            : "ds-tab inline-flex min-h-12 rounded-t-ds-sm px-3 text-ds-body font-medium ds-focus-inset sm:px-4",
          selected
            ? pill
              ? "font-semibold text-ds-ink-900"
              : "font-semibold text-ds-section-ink"
            : "text-ds-ink-600 hover:text-ds-ink-900",
        );
        const content = (
          <>
            {Icon ? (
              <Icon size={18} aria-hidden className={selected && !pill ? "text-ds-section-accent" : undefined} />
            ) : null}
            <span className="ds-tab-label" data-label={tab.label}>
              {tab.label}
            </span>
            {tab.badge}
          </>
        );
        const common = {
          id: `${idBase}-tab-${tab.id}`,
          role: "tab" as const,
          "aria-selected": selected,
          "aria-controls": `${idBase}-panel-${tab.id}`,
          tabIndex: selected ? 0 : -1,
          className: classes,
        };
        return tab.href ? (
          <Link key={tab.id} href={tab.href} scroll={false} {...common}>
            {content}
          </Link>
        ) : (
          <button key={tab.id} type="button" onClick={() => onChange?.(tab.id)} {...common}>
            {content}
          </button>
        );
      })}
      {pill ? null : <span aria-hidden className="ds-tabs-indicator" />}
    </div>
  );
}

/**
 * Panneau d'un onglet : relié à son onglet, atteignable au clavier. À ne rendre
 * que pour l'onglet actif (avec `key` égal à l'onglet) : son contenu arrive en
 * fondu — même endroit, autre contenu, donc pas de déplacement.
 */
export function TabPanel({
  idBase,
  tab,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { idBase: string; tab: string }) {
  return (
    <div
      role="tabpanel"
      id={`${idBase}-panel-${tab}`}
      aria-labelledby={`${idBase}-tab-${tab}`}
      tabIndex={0}
      className={clsx("rounded-ds-sm ds-focus ds-fade-in", className)}
      {...props}
    />
  );
}
