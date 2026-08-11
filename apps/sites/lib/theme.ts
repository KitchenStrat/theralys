import type { SiteTheme, ThemePreset, FontPreset } from "@theralys/shared";

type Palette = {
  primary: string;
  primaryDark: string;
  background: string;
  surface: string;
  text: string;
  soft: string;
  /** Fond des sections sombres (spécialités, contact, footer) */
  deep: string;
  /** Texte crème posé sur `deep` */
  onDeep: string;
};

const PALETTES: Record<ThemePreset, Palette> = {
  terracotta: {
    primary: "#b05038",
    primaryDark: "#8a3d2a",
    background: "#faf5ef",
    surface: "#ffffff",
    text: "#3d2c24",
    soft: "#f6e8de",
    deep: "#33201a",
    onDeep: "#f8ede4",
  },
  sauge: {
    primary: "#587c5e",
    primaryDark: "#41604a",
    background: "#f4f7f2",
    surface: "#ffffff",
    text: "#26332a",
    soft: "#e6efe4",
    deep: "#1f2b21",
    onDeep: "#eef4ea",
  },
  ocean: {
    primary: "#33658a",
    primaryDark: "#264d69",
    background: "#f2f7f9",
    surface: "#ffffff",
    text: "#1e3440",
    soft: "#dfecf2",
    deep: "#152b37",
    onDeep: "#e9f2f6",
  },
  lavande: {
    primary: "#6f5b9c",
    primaryDark: "#57477c",
    background: "#f7f5fa",
    surface: "#ffffff",
    text: "#322b45",
    soft: "#eae4f4",
    deep: "#292138",
    onDeep: "#f0ecf8",
  },
  ambre: {
    primary: "#a8762b",
    primaryDark: "#835c20",
    background: "#fbf7ee",
    surface: "#ffffff",
    text: "#3f3222",
    soft: "#f5ead2",
    deep: "#2f2312",
    onDeep: "#f8f0de",
  },
  rose: {
    primary: "#c26a7d",
    primaryDark: "#a04f62",
    background: "#fdf6f7",
    surface: "#ffffff",
    text: "#40282e",
    soft: "#f9e3e8",
    deep: "#3a2129",
    onDeep: "#fbeef1",
  },
  prune: {
    primary: "#8a5273",
    primaryDark: "#6d3c59",
    background: "#faf5f8",
    surface: "#ffffff",
    text: "#3b2733",
    soft: "#f2e2ec",
    deep: "#33202b",
    onDeep: "#f7ecf2",
  },
  caramel: {
    primary: "#9a6b3f",
    primaryDark: "#7b5330",
    background: "#fbf6f0",
    surface: "#ffffff",
    text: "#3e3021",
    soft: "#f3e6d8",
    deep: "#32261a",
    onDeep: "#f8f0e5",
  },
  marine: {
    primary: "#3f5873",
    primaryDark: "#2f4459",
    background: "#f4f7f9",
    surface: "#ffffff",
    text: "#253442",
    soft: "#e2eaf1",
    deep: "#16222e",
    onDeep: "#ecf2f7",
  },
  olive: {
    primary: "#75793f",
    primaryDark: "#5c6030",
    background: "#f8f9f1",
    surface: "#ffffff",
    text: "#34381f",
    soft: "#ecefda",
    deep: "#262a16",
    onDeep: "#f4f6e8",
  },
};

/**
 * Polices chargées via Google Fonts dans app/layout.tsx — toujours avec un
 * repli système pour que le rendu reste correct sans réseau.
 */
/**
 * Paires de polices par preset — chaque preset change les TITRES ET le CORPS
 * de texte pour un rendu immédiatement différenciable :
 * - chaleureux : serif généreuse + sans arrondie douce
 * - classique  : didone traditionnelle + sans humaniste sobre
 * - moderne    : grotesque géométrique resserrée + Inter
 * - élégant    : garalde fine + corps en serif (esprit magazine)
 */
export const FONTS: Record<
  FontPreset,
  { heading: string; body: string; label: string; headingTracking: string }
> = {
  chaleureux: {
    label: "Chaleureux",
    heading: "'Fraunces', Georgia, 'Times New Roman', serif",
    body: "'Nunito', 'Trebuchet MS', ui-sans-serif, system-ui, sans-serif",
    headingTracking: "-0.01em",
  },
  classique: {
    label: "Classique",
    heading: "'Playfair Display', Georgia, 'Times New Roman', serif",
    body: "'Source Sans 3', 'Segoe UI', ui-sans-serif, system-ui, sans-serif",
    headingTracking: "0",
  },
  moderne: {
    label: "Moderne",
    heading: "'Space Grotesk', ui-sans-serif, system-ui, -apple-system, sans-serif",
    body: "'Inter', ui-sans-serif, system-ui, -apple-system, sans-serif",
    headingTracking: "-0.03em",
  },
  elegant: {
    label: "Élégant",
    heading: "'Cormorant Garamond', 'Palatino Linotype', Palatino, serif",
    body: "'EB Garamond', 'Palatino Linotype', Georgia, serif",
    headingTracking: "0.015em",
  },
};

/** Rayons de courbure par forme de coins (photos/panneaux, cartes, pilules). */
const CORNER_RADII: Record<NonNullable<SiteTheme["corners"]>, Record<string, string>> = {
  rond: { xl: "2.5rem", lg: "1.75rem", md: "1rem", pill: "999px", arch: "9rem" },
  adouci: { xl: "1.5rem", lg: "1.15rem", md: "0.8rem", pill: "999px", arch: "3.5rem" },
  equilibre: { xl: "1rem", lg: "0.75rem", md: "0.6rem", pill: "0.9rem", arch: "1rem" },
  net: { xl: "0.25rem", lg: "0.25rem", md: "0.25rem", pill: "0.35rem", arch: "0.25rem" },
};

/** Mélange linéaire de deux couleurs hex (ratio ∈ [0,1] vers `into`). */
function mix(hex: string, into: string, ratio: number): string {
  const parse = (h: string) => [
    parseInt(h.slice(1, 3), 16),
    parseInt(h.slice(3, 5), 16),
    parseInt(h.slice(5, 7), 16),
  ];
  const [r1, g1, b1] = parse(hex);
  const [r2, g2, b2] = parse(into);
  const channel = (a: number, b: number) => Math.round(a + (b - a) * ratio);
  return `#${[channel(r1!, r2!), channel(g1!, g2!), channel(b1!, b2!)]
    .map((c) => c.toString(16).padStart(2, "0"))
    .join("")}`;
}

/** Décline la palette selon l'intensité choisie (pastel / naturel / intense). */
function applyIntensity(palette: Palette, intensity: SiteTheme["intensity"]): Palette {
  if (intensity === "pastel") {
    return {
      ...palette,
      primary: mix(palette.primary, "#ffffff", 0.22),
      primaryDark: mix(palette.primaryDark, "#ffffff", 0.14),
      soft: mix(palette.soft, "#ffffff", 0.45),
      background: mix(palette.background, "#ffffff", 0.5),
      deep: mix(palette.deep, "#ffffff", 0.12),
    };
  }
  if (intensity === "intense") {
    return {
      ...palette,
      primary: mix(palette.primary, "#000000", 0.08),
      primaryDark: mix(palette.primaryDark, "#000000", 0.12),
      soft: mix(palette.soft, palette.primary, 0.14),
      background: mix(palette.background, palette.primary, 0.05),
      deep: mix(palette.deep, "#000000", 0.25),
    };
  }
  return palette;
}

/** Variables CSS injectées sur le conteneur du site (thème par site). */
export function themeCssVars(theme: SiteTheme): Record<string, string> {
  const palette = {
    ...applyIntensity(PALETTES[theme.preset], theme.intensity ?? "naturel"),
    ...theme.palette,
  };
  const fonts = FONTS[theme.fontPreset] ?? FONTS.chaleureux;
  const radii = CORNER_RADII[theme.corners ?? "rond"];
  return {
    "--site-primary": palette.primary,
    "--site-primary-dark": palette.primaryDark,
    "--site-bg": palette.background,
    "--site-surface": palette.surface,
    "--site-text": palette.text,
    "--site-soft": palette.soft,
    "--site-deep": palette.deep,
    "--site-on-deep": palette.onDeep,
    "--site-font-heading": fonts.heading,
    "--site-font-body": fonts.body,
    "--site-heading-tracking": fonts.headingTracking,
    "--r-xl": radii.xl!,
    "--r-lg": radii.lg!,
    "--r-md": radii.md!,
    "--r-pill": radii.pill!,
    "--r-arch": radii.arch!,
  };
}
