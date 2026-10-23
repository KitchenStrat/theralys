/**
 * Couleurs d'un visuel (§4.1) : palette effective du site (preset, intensité,
 * overrides) + couleur d'accent (hex choisi par le praticien, sinon rôle rendu
 * par le modèle) + couleur de texte lisible sur l'accent.
 */

import {
  contrastOn,
  isHexColor,
  relativeLuminance,
  resolvePalette,
  type SiteTheme,
  type SocialAccentRole,
} from "@theralys/shared";

export type SocialTheme = {
  primary: string;
  primaryDark: string;
  background: string;
  surface: string;
  text: string;
  soft: string;
  deep: string;
  onDeep: string;
  /** Couleur dominante du visuel */
  accent: string;
  /** Texte lisible sur `accent` (blanc si sombre, sinon `text`) */
  onAccent: string;
  logoUrl: string | null;
};

function parseHex(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

/** Mélange linéaire de deux couleurs hex (ratio ∈ [0,1] vers `into`). */
export function mix(hex: string, into: string, ratio: number): string {
  if (!isHexColor(hex) || !isHexColor(into)) return hex;
  const a = parseHex(hex);
  const b = parseHex(into);
  const channel = (i: 0 | 1 | 2) => Math.round(a[i] + (b[i] - a[i]) * ratio);
  return `#${[channel(0), channel(1), channel(2)].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

/** `rgba(r, g, b, alpha)` depuis un hex #rrggbb. */
export function rgba(hex: string, alpha: number): string {
  if (!isHexColor(hex)) return `rgba(0, 0, 0, ${alpha})`;
  const [r, g, b] = parseHex(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Rapport de contraste WCAG entre deux couleurs hex. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * Texte lisible sur `accent` : `contrastOn` (blanc si luminance < 0,45),
 * sauf si le blanc n'atteint pas 3:1 (tons moyens des palettes pastel) et
 * que le texte du thème fait mieux — on prend alors le texte du thème.
 */
export function onAccentColor(accent: string, text: string): string {
  const chosen = contrastOn(accent, text);
  if (chosen === "#ffffff" && contrastRatio(accent, "#ffffff") < 3) {
    if (contrastRatio(accent, text) > contrastRatio(accent, "#ffffff")) return text;
  }
  return chosen;
}

/**
 * Thème d'un visuel : `accentColor` (hex validé) prime sur `accentRole` ;
 * `onAccent` = blanc si la luminance relative de l'accent < 0,45, sinon le
 * texte du thème (cf. `onAccentColor`).
 */
export function resolveSocialTheme(
  siteTheme: SiteTheme,
  accentColor: string | null | undefined,
  accentRole: SocialAccentRole,
): SocialTheme {
  const palette = resolvePalette(siteTheme);
  const roleHex: Record<SocialAccentRole, string> = {
    primary: palette.primary,
    primaryDark: palette.primaryDark,
    deep: palette.deep,
    soft: palette.soft,
  };
  const accent = (isHexColor(accentColor) ? accentColor : roleHex[accentRole] ?? palette.primary)
    .toLowerCase();
  return {
    primary: palette.primary,
    primaryDark: palette.primaryDark,
    background: palette.background,
    surface: palette.surface,
    text: palette.text,
    soft: palette.soft,
    deep: palette.deep,
    onDeep: palette.onDeep,
    accent,
    onAccent: onAccentColor(accent, palette.text),
    logoUrl: siteTheme.logoUrl ?? null,
  };
}

export type SocialSwatch = {
  /** Libellé de la pastille (barre « sur mesure ») */
  label: string;
  hex: string;
};

/** Les 5 pastilles de la palette proposées dans la barre « Couleur dominante ». */
export function swatchesFor(siteTheme: SiteTheme): SocialSwatch[] {
  const palette = resolvePalette(siteTheme);
  return [
    { label: "Couleur principale", hex: palette.primary },
    { label: "Foncée", hex: palette.primaryDark },
    { label: "Profonde", hex: palette.deep },
    { label: "Douce", hex: palette.soft },
    { label: "Claire", hex: palette.background },
  ];
}
