import { clsx } from "clsx";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Download,
  FolderCheck,
  GalleryHorizontalEnd,
  Image as ImageIcon,
  PencilRuler,
  Smartphone,
  TriangleAlert,
  X,
  type LucideIcon,
} from "lucide-react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { Badge, StatusPill, buttonClasses, type BadgeTone, type ButtonSize, type ButtonVariant } from "@/components/ds";
import type { SocialCalendarItem } from "@/lib/social/data";

/**
 * Pièces de présentation propres à la section « Réseaux sociaux », partagées
 * par la page et ses fenêtres : vignette de format, statut d'un contenu,
 * marque « Sur mesure », lien de téléchargement, message d'erreur. Tout est
 * composé à partir du design system (`@/components/ds`).
 */

export type SocialFormatKey = SocialCalendarItem["format"];

export const FORMAT_LABEL: Record<SocialFormatKey, string> = {
  static: "Statique",
  carousel: "Carrousel",
  story: "Story",
};

/**
 * Un format = une forme (pictogramme) et une couleur de la famille du ciel :
 * bleu pour le visuel seul, violet pour le carrousel, turquoise pour la story.
 * Pictogramme blanc ≥ 3:1 sur l'arrêt le plus clair de chaque dégradé.
 */
export const FORMAT_STYLE: Record<SocialFormatKey, { icon: LucideIcon; tile: string }> = {
  static: { icon: ImageIcon, tile: "bg-linear-to-br from-ds-brand-500 to-ds-blue-600" },
  carousel: { icon: GalleryHorizontalEnd, tile: "bg-linear-to-br from-ds-indigo-500 to-ds-violet-600" },
  story: { icon: Smartphone, tile: "bg-linear-to-br from-ds-teal-500 to-ds-cyan-600" },
};

/** Nom accessible d'un contenu : « Carrousel — Un exercice simple (sur mesure) ». */
export function itemLabel(item: SocialCalendarItem): string {
  return `${FORMAT_LABEL[item.format]} — ${item.topic}${item.source === "request" ? " (sur mesure)" : ""}`;
}

export type FormatTileSize = "xs" | "sm" | "md" | "lg";

const TILE: Record<FormatTileSize, { box: string; icon: number; dot: string }> = {
  xs: { box: "size-6 rounded-md", icon: 14, dot: "size-2.5 border" },
  sm: { box: "size-8 rounded-lg", icon: 18, dot: "size-3 border-2" },
  md: { box: "size-11 rounded-ds-sm", icon: 22, dot: "size-3.5 border-2" },
  lg: { box: "size-14 rounded-ds-md", icon: 28, dot: "size-4 border-2" },
};

/**
 * Vignette d'un contenu : la couleur et le pictogramme disent le format, la
 * pastille en coin reprend la couleur dominante du visuel. Décorative : le
 * format est toujours écrit ou lu à côté.
 */
export function FormatTile({
  format,
  accentColor,
  size = "md",
  className,
}: {
  format: SocialFormatKey;
  /** Couleur dominante du visuel (hex) : petite pastille en coin */
  accentColor?: string;
  size?: FormatTileSize;
  className?: string;
}) {
  const { icon: Icon, tile } = FORMAT_STYLE[format];
  const dimensions = TILE[size];
  return (
    <span
      aria-hidden
      className={clsx("relative inline-grid shrink-0 place-items-center text-white", dimensions.box, tile, className)}
    >
      <Icon size={dimensions.icon} strokeWidth={2} />
      {accentColor ? (
        <span
          className={clsx(
            "absolute -right-1 -bottom-1 rounded-full border-white inset-ring inset-ring-ds-ink-900/20",
            dimensions.dot,
          )}
          style={{ backgroundColor: accentColor }}
        />
      ) : null}
    </span>
  );
}

export type ContentStatusKey = "a-telecharger" | "telecharge" | "publie";

/** Les trois états d'un contenu, dans l'ordre du parcours : une icône, un mot, une couleur. */
export const STATUS_META: Record<ContentStatusKey, { label: string; tone: BadgeTone; icon: LucideIcon }> = {
  "a-telecharger": { label: "À télécharger", tone: "warning", icon: Download },
  telecharge: { label: "Téléchargé", tone: "brand", icon: FolderCheck },
  publie: { label: "Publié", tone: "success", icon: Check },
};

/** Statut affiché : « Publié » / « Téléchargé » / « À télécharger ». */
export function statusOf(item: SocialCalendarItem): { key: ContentStatusKey; label: string } {
  const key: ContentStatusKey =
    item.status === "published" ? "publie" : item.downloadedAt ? "telecharge" : "a-telecharger";
  return { key, label: STATUS_META[key].label };
}

/**
 * Pastille de statut d'un contenu. « Publié » est le `StatusPill` commun à
 * toutes les sections ; « À télécharger » et « Téléchargé », propres à cette
 * section, sont des `Badge` de même anatomie (icône + mot).
 */
export function ContentStatus({
  status,
  children,
  className,
}: {
  status: ContentStatusKey;
  /** Remplace le libellé par défaut : « Publié le 12 nov. » */
  children?: ReactNode;
  className?: string;
}) {
  if (status === "publie") {
    return (
      <StatusPill status="publie" className={className}>
        {children}
      </StatusPill>
    );
  }
  const { label, tone, icon } = STATUS_META[status];
  return (
    <Badge tone={tone} icon={icon} className={className}>
      {children ?? label}
    </Badge>
  );
}

/** Pictogramme des contenus demandés par le praticien (l'étincelle reste réservée à l'IA). */
export const CustomIcon = PencilRuler;

/** Marque d'un contenu « sur mesure », demandé par le praticien. */
export function CustomBadge({ className }: { className?: string }) {
  return (
    <Badge tone="section" icon={CustomIcon} className={className}>
      Sur mesure
    </Badge>
  );
}

/**
 * Ligne cliquable d'un contenu (liste du mois, fenêtre d'une journée) :
 * vignette de format, sujet, précisions, statut. Sur mobile, le statut passe
 * sous le sujet pour lui laisser toute la largeur.
 */
export function ContentRow({
  item,
  label,
  meta,
  onClick,
}: {
  item: SocialCalendarItem;
  /** Nom accessible complet de la ligne */
  label: string;
  /** Précisions sous le sujet : date, format, « Sur mesure » */
  meta: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="group/row grid w-full min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3.5 gap-y-1.5 rounded-ds-sm px-2 py-2.5 text-left ds-focus-inset hover:bg-ds-section-tint sm:grid-cols-[auto_minmax(0,1fr)_auto_auto]"
    >
      <FormatTile
        format={item.format}
        accentColor={item.accentColor}
        className="row-span-2 self-start sm:row-span-1 sm:self-center"
      />
      <span className="min-w-0">
        <span className="line-clamp-2 text-base font-semibold text-ds-ink-900">{item.topic}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-ds-meta text-ds-ink-600">{meta}</span>
      </span>
      <span className="col-start-2 justify-self-start sm:col-start-3 sm:justify-self-end">
        <ContentStatus status={statusOf(item).key} />
      </span>
      <ChevronRight
        size={18}
        aria-hidden
        className="hidden shrink-0 text-ds-ink-400 motion-safe:transition-transform motion-safe:duration-ds-fast motion-safe:group-hover/row:translate-x-0.5 sm:block"
      />
    </button>
  );
}

/** Voile de survol, comme celui des boutons du design system (seule son opacité change). */
const LINK_HOVER: Partial<Record<ButtonVariant, string>> = {
  primary: "bg-ds-brand-950/25",
  secondary: "bg-ds-brand-50",
  quiet: "bg-ds-brand-100",
};

/**
 * Lien de téléchargement (`<a download>`) habillé comme un bouton du design
 * system. Un vrai lien, sans `next/link` : rien n'est préchargé, le fichier
 * n'est demandé qu'au clic.
 */
export function DownloadLink({
  variant = "secondary",
  size = "md",
  icon,
  className,
  children,
  ...props
}: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "download"> & {
  variant?: "primary" | "secondary" | "quiet";
  size?: ButtonSize;
  icon?: ReactNode;
}) {
  return (
    <a download className={buttonClasses(variant, size, className)} {...props}>
      <span
        aria-hidden
        className={clsx(
          "pointer-events-none absolute inset-0 -z-10 rounded-[inherit] opacity-0 transition-opacity duration-ds-fast ease-ds-out group-hover/btn:opacity-100",
          LINK_HOVER[variant],
        )}
      />
      {icon}
      <span>{children}</span>
    </a>
  );
}

/** Message d'erreur : annoncé (`role="alert"`), avec une icône — jamais la couleur seule. */
export function ErrorNote({ id, className, children }: { id?: string; className?: string; children: ReactNode }) {
  return (
    <p id={id} role="alert" className={clsx("flex items-start gap-2 text-ds-body font-medium text-ds-danger-700", className)}>
      <TriangleAlert size={18} aria-hidden className="mt-0.5 shrink-0" />
      <span className="min-w-0">{children}</span>
    </p>
  );
}

/**
 * Détail replié (`<details>` natif, sans script) : l'essentiel reste à l'écran,
 * l'explication complète s'ouvre à la demande. Le chevron pivote, le contenu
 * arrive en fondu.
 */
export function Disclosure({
  summary,
  className,
  children,
}: {
  summary: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <details className={clsx("group/details rounded-ds-sm bg-ds-ink-50 ring-1 ring-ds-ink-200", className)}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-ds-sm px-3.5 py-2 text-ds-body font-semibold text-ds-brand-800 ds-focus [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">{summary}</span>
        <ChevronDown
          size={18}
          aria-hidden
          className="shrink-0 transition-transform duration-ds-base ease-ds-out group-open/details:rotate-180 motion-reduce:transition-none"
        />
      </summary>
      <div className="space-y-2 px-3.5 pb-3.5 text-ds-body text-ds-ink-700 ds-fade-in">{children}</div>
    </details>
  );
}

/**
 * En-tête des fenêtres de la section (`Modal` partagée en mode `plain`) :
 * bandeau doux à la couleur de la section, titre de la fenêtre, bouton de
 * fermeture de 44 px. Le bouton vient en premier dans le code : c'est le
 * premier arrêt de tabulation, comme dans la fenêtre partagée.
 */
export function ModalHeader({
  title,
  onClose,
  lead,
  before,
  children,
}: {
  title: ReactNode;
  onClose: () => void;
  /** Vignette à gauche du titre */
  lead?: ReactNode;
  /** Au-dessus du titre : retour, étape en cours */
  before?: ReactNode;
  /** Sous le titre : précisions, badges */
  children?: ReactNode;
}) {
  return (
    <div className="relative isolate overflow-hidden bg-ds-section-soft px-5 py-5 sm:px-8 sm:py-6">
      <span aria-hidden className="-z-10 ds-band-art" />
      <button
        type="button"
        onClick={onClose}
        aria-label="Fermer"
        className="absolute top-2.5 right-2.5 grid size-11 place-items-center rounded-full text-ds-ink-700 ds-focus hover:bg-white/70 sm:top-4 sm:right-4"
      >
        <X size={22} aria-hidden />
      </button>
      {before ? <div className="mb-3 pr-12">{before}</div> : null}
      <div className={clsx("flex items-start gap-3.5", before ? null : "pr-10 sm:pr-8")}>
        {lead}
        <div className="min-w-0 flex-1">
          <h2 className="font-ds-display text-xl/7 font-bold text-ds-section-ink text-balance sm:text-2xl/8">{title}</h2>
          {children}
        </div>
      </div>
    </div>
  );
}

/**
 * Zones de texte de la section : même dessin que les champs partagés
 * (`Input`, `Select`), que la coquille restyle ; texte en 15 px pour la lecture.
 */
export const TEXTAREA_CLASS =
  "w-full rounded-xl border border-ink-300 px-3 py-2 text-ds-body text-ink-900 placeholder:text-ink-500 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100";

/** Champs à une ligne : 44 px de haut, comme les boutons qu'ils côtoient. */
export const FIELD_CLASS = "min-h-11";

/**
 * À poser sur un `Segmented` partagé (ou sur le conteneur de boutons hérités) :
 * ses boutons, hauts de 32 px, remontent à 36 px, et à 44 px au doigt.
 */
export const TOUCH_BUTTONS_CLASS = "[&_button]:min-h-9 pointer-coarse:[&_button]:min-h-11";
