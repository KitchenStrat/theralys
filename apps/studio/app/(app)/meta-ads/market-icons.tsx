import {
  AlignLeft,
  Bookmark,
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  GalleryHorizontal,
  Image as ImageIcon,
  MapPin,
  Search,
  Sparkles,
  SquareCheckBig,
  SquarePlay,
  Trash2,
  TrendingUp,
  Undo2,
  X,
  type LucideIcon,
} from "lucide-react";

/**
 * Pictogrammes de la galerie du marché : ceux de lucide, la bibliothèque
 * d'icônes du studio, sous les noms que la galerie emploie. Décoratifs : le
 * libellé accessible est porté par le bouton ou le texte voisin.
 */
const ICONS = {
  search: Search,
  close: X,
  check: Check,
  bookmark: Bookmark,
  trash: Trash2,
  image: ImageIcon,
  video: SquarePlay,
  carousel: GalleryHorizontal,
  text: AlignLeft,
  trend: TrendingUp,
  pin: MapPin,
  left: ChevronLeft,
  right: ChevronRight,
  external: ExternalLink,
  select: SquareCheckBig,
  undo: Undo2,
  sparkle: Sparkles,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

export function Icon({ name, className = "size-4", filled = false }: { name: IconName; className?: string; filled?: boolean }) {
  const Glyph = ICONS[name];
  return <Glyph className={className} fill={filled ? "currentColor" : "none"} aria-hidden focusable="false" />;
}

/** Triangle de lecture plein (pastille des vidéos). */
export function PlayGlyph({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden focusable="false">
      <path d="M8.5 5.8v12.4a.8.8 0 0 0 1.2.7l10-6.2a.8.8 0 0 0 0-1.4l-10-6.2a.8.8 0 0 0-1.2.7z" />
    </svg>
  );
}

/** Anneau de focus commun aux commandes de la galerie : celui du design system (2 px, décalé de 2 px). */
export const FOCUS_RING = "ds-focus";

/** Le même, en blanc, pour les commandes posées sur une barre foncée (confirmation, sélection). */
export const FOCUS_RING_INVERSE = "ds-focus-inverse";
