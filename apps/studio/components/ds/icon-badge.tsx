import { clsx } from "clsx";
import type { LucideIcon } from "lucide-react";
import { SECTIONS, type SectionKey } from "./sections";

export type IconBadgeSize = "sm" | "md" | "lg" | "xl";

const BOX: Record<IconBadgeSize, string> = {
  sm: "size-9 rounded-[0.625rem]",
  md: "size-11 rounded-ds-sm",
  lg: "size-14 rounded-ds-md",
  xl: "size-[4.5rem] rounded-[1.375rem]",
};
const ICON_SIZE: Record<IconBadgeSize, number> = { sm: 18, md: 22, lg: 28, xl: 34 };

export type IconBadgeProps = {
  icon: LucideIcon;
  /** Identité à porter ; sans valeur, celle de la section englobante */
  section?: SectionKey;
  /** `gradient` : dégradé vif et halo (repère fort) ; `soft` : teinte douce (listes, états au repos) */
  tone?: "gradient" | "soft";
  size?: IconBadgeSize;
  className?: string;
};

/**
 * Pastille d'icône arrondie. Toujours décorative : le libellé voisin porte le sens,
 * l'icône est masquée aux lecteurs d'écran.
 */
export function IconBadge({ icon: Icon, section, tone = "gradient", size = "md", className }: IconBadgeProps) {
  return (
    <span
      data-ds-section={section}
      className={clsx(
        "relative inline-grid shrink-0 place-items-center",
        BOX[size],
        tone === "gradient"
          ? "bg-ds-section-gradient text-ds-section-on shadow-ds-glow"
          : "bg-ds-section-tint-2 text-ds-section-accent",
        className,
      )}
    >
      <Icon size={ICON_SIZE[size]} strokeWidth={2} aria-hidden />
    </span>
  );
}

/** Pastille d'une section : son icône et son dégradé, tirés du registre. */
export function SectionBadge({
  section,
  ...props
}: Omit<IconBadgeProps, "icon" | "section"> & { section: SectionKey }) {
  return <IconBadge icon={SECTIONS[section].icon} section={section} {...props} />;
}
