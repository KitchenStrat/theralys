import { clsx } from "clsx";
import { Check, Info, Lightbulb, TriangleAlert, type LucideIcon } from "lucide-react";
import type { HTMLAttributes, ReactNode } from "react";

/**
 * Petites pièces de présentation de l'éditeur du site, composées avec les
 * jetons du design system du studio (`components/ds`) là où il n'a pas de
 * composant qui convienne : champ de saisie, encart d'aide, message d'une
 * action, bouton d'icône, bouton pointillé d'ajout. Rien ici ne fixe la
 * section : tout suit celle posée par la mise en page (`mon-site`).
 */

/**
 * Anneau de focus d'un champ. Les `input`, `select` et `textarea` le reçoivent
 * déjà de `ds-scope` ; une zone `contentEditable` ou un bouton en forme de
 * champ, non.
 */
export const FIELD_FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ds-brand-600";

/** Boîte d'un champ : 15 px au pointeur, 16 px au doigt (un téléphone ne zoome pas sur le champ à la saisie). */
export const FIELD_BOX =
  "w-full rounded-ds-sm border border-ds-ink-450 bg-white px-3 py-2 text-ds-body text-ds-ink-900 pointer-coarse:text-base disabled:bg-ds-ink-100 disabled:text-ds-ink-600";

/** Champ sur une ligne (`input`) : 44 px de haut. */
export const INPUT = clsx(FIELD_BOX, FIELD_FOCUS, "min-h-11");

/** Zone de texte (`textarea`). */
export const TEXTAREA = clsx(FIELD_BOX, FIELD_FOCUS, "block resize-y");

/** Libellé d'un champ. */
export const LABEL = "text-ds-meta font-semibold text-ds-ink-800";

/** Aide sous un champ : 13 px, encre lisible sur blanc comme sur une teinte. */
export const HINT = "text-ds-meta text-ds-ink-600";

/** Intertitre d'un panneau ou d'une fenêtre (`h3`, `h4`). */
export const SUB_TITLE = "font-ds-display text-base/6 font-bold text-ds-ink-900";

/** Lien ou bouton dans un texte : souligné (jamais la couleur seule). */
export const TEXT_LINK =
  "rounded-sm font-semibold text-ds-brand-800 underline underline-offset-2 ds-focus hover:text-ds-brand-950";

/** Bouton réduit à son icône (nom accessible à fournir) : 36 px, 44 px au doigt. */
export const ICON_BUTTON =
  "inline-grid size-9 shrink-0 place-items-center rounded-full text-ds-ink-700 ds-focus ds-press hover:bg-ds-ink-100 hover:text-ds-ink-900 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent pointer-coarse:size-11";

/** Bouton pointillé « Ajouter … » : pleine largeur, 44 px. */
export const ADD_BUTTON =
  "flex min-h-11 w-full items-center justify-center gap-2 rounded-ds-sm border border-dashed border-ds-ink-450 bg-white px-3 py-2 text-ds-body font-semibold text-ds-brand-800 ds-focus ds-press hover:border-ds-brand-600 hover:bg-ds-brand-50 disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:border-ds-ink-450 disabled:hover:bg-white";

/** Action discrète de suppression (« Supprimer ce badge ») : icône et mot, 36 px, 44 px au doigt. */
export const DANGER_LINK =
  "inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-ds-danger-700 ds-focus ds-press hover:bg-ds-danger-100 disabled:cursor-not-allowed disabled:opacity-55 pointer-coarse:min-h-11";

export type NoteTone = "help" | "info" | "warning" | "danger";

const NOTE: Record<NoteTone, { box: string; icon: string; Icon: LucideIcon }> = {
  help: { box: "bg-ds-section-tint text-ds-ink-700 ring-1 ring-ds-section-line/70", icon: "text-ds-section-accent", Icon: Lightbulb },
  info: { box: "bg-ds-brand-50 text-ds-ink-700 ring-1 ring-ds-brand-200", icon: "text-ds-brand-700", Icon: Info },
  warning: { box: "bg-ds-warning-100 text-ds-warning-900", icon: "text-ds-warning-700", Icon: TriangleAlert },
  danger: { box: "bg-ds-danger-100 text-ds-danger-900", icon: "text-ds-danger-700", Icon: TriangleAlert },
};

/**
 * Encart : une aide (teinte de la section, ampoule), une information, un point
 * d'attention ou une erreur — toujours avec son pictogramme.
 */
export function Note({
  tone = "help",
  icon,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & { tone?: NoteTone; icon?: LucideIcon }) {
  const def = NOTE[tone];
  const Icon = icon ?? def.Icon;
  return (
    <div className={clsx("flex items-start gap-2.5 rounded-ds-sm px-3 py-2.5 text-ds-meta", def.box, className)} {...props}>
      <Icon size={16} aria-hidden className={clsx("mt-0.5 shrink-0", def.icon)} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/**
 * Renvoi à un bouton de la barre de mise en forme dans un texte d'aide : son
 * pictogramme (décoratif) suivi de son nom, qui porte le sens.
 */
export function ToolRef({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <span className="whitespace-nowrap font-semibold text-ds-ink-800">
      <Icon size={14} strokeWidth={2.5} aria-hidden className="mr-1 inline-block align-[-2px] text-ds-section-accent" />
      {children}
    </span>
  );
}

/**
 * Coche de confirmation, au dessin de l'`InlineSuccess` du design system : elle
 * surgit et une onde chaude passe une fois.
 */
export function SuccessMark({ className }: { className?: string }) {
  return (
    <span aria-hidden className={clsx("relative grid size-6 shrink-0 place-items-center rounded-full bg-ds-success-600 text-white ds-pop", className)}>
      <span className="ds-success-ripple" />
      <Check size={14} strokeWidth={3} />
    </span>
  );
}

/**
 * Texte d'un message d'action. Les messages de réussite de l'éditeur portent
 * une coche typographique (« Publié ✓ — … ») : elle reste dans le texte, mais
 * hors de l'écran — la coche dessinée la remplace pour l'œil.
 */
function messageText(message: string): ReactNode {
  const [before, ...rest] = message.split("✓");
  if (rest.length === 0) return message;
  return (
    <>
      {before?.trimEnd()}
      <span className="sr-only"> ✓</span>
      {rest.join("✓")}
    </>
  );
}

/**
 * Message d'une action : réussite (coche qui surgit, annoncée poliment), échec
 * (annoncé aussitôt) ou simple information. Le pictogramme double la couleur.
 */
export function ActionMessage({
  tone,
  children,
  className,
}: {
  tone: "success" | "error" | "info";
  children: string;
  className?: string;
}) {
  if (tone === "success") {
    return (
      <p role="status" className={clsx("flex items-center gap-2.5 text-sm font-semibold text-ds-success-900", className)}>
        <SuccessMark />
        <span className="min-w-0">{messageText(children)}</span>
      </p>
    );
  }
  if (tone === "error") {
    return (
      <p role="alert" className={clsx("flex items-start gap-2 text-sm font-medium text-ds-danger-700", className)}>
        <TriangleAlert size={16} aria-hidden className="mt-0.5 shrink-0" />
        <span className="min-w-0">{children}</span>
      </p>
    );
  }
  return (
    <p role="status" className={clsx("flex items-start gap-2 text-ds-meta text-ds-ink-600", className)}>
      <Info size={15} aria-hidden className="mt-0.5 shrink-0 text-ds-section-accent" />
      <span className="min-w-0">{children}</span>
    </p>
  );
}

/** Message d'erreur sous un champ : texte précédé d'un pictogramme. */
export function FieldError({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={clsx("mt-1.5 flex items-start gap-1.5 text-ds-meta font-medium text-ds-danger-700", className)}>
      <TriangleAlert size={15} aria-hidden className="mt-0.5 shrink-0" />
      <span className="min-w-0">{children}</span>
    </p>
  );
}
