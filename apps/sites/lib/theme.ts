import type { SiteTheme, ThemePreset, FontPreset } from "@theralys/shared";

type Palette = {
  primary: string;
  primaryDark: string;
  background: string;
  surface: string;
  text: string;
  soft: string;
};

const PALETTES: Record<ThemePreset, Palette> = {
  terracotta: {
    primary: "#b05038",
    primaryDark: "#8a3d2a",
    background: "#faf5ef",
    surface: "#ffffff",
    text: "#3d2c24",
    soft: "#f6e8de",
  },
  sauge: {
    primary: "#587c5e",
    primaryDark: "#41604a",
    background: "#f4f7f2",
    surface: "#ffffff",
    text: "#26332a",
    soft: "#e6efe4",
  },
  ocean: {
    primary: "#33658a",
    primaryDark: "#264d69",
    background: "#f2f7f9",
    surface: "#ffffff",
    text: "#1e3440",
    soft: "#dfecf2",
  },
  lavande: {
    primary: "#6f5b9c",
    primaryDark: "#57477c",
    background: "#f7f5fa",
    surface: "#ffffff",
    text: "#322b45",
    soft: "#eae4f4",
  },
  ambre: {
    primary: "#a8762b",
    primaryDark: "#835c20",
    background: "#fbf7ee",
    surface: "#ffffff",
    text: "#3f3222",
    soft: "#f5ead2",
  },
};

const FONTS: Record<FontPreset, { heading: string; body: string }> = {
  classique: {
    heading: "Georgia, 'Times New Roman', serif",
    body: "ui-sans-serif, system-ui, -apple-system, sans-serif",
  },
  moderne: {
    heading: "ui-sans-serif, system-ui, -apple-system, sans-serif",
    body: "ui-sans-serif, system-ui, -apple-system, sans-serif",
  },
  elegant: {
    heading: "'Palatino Linotype', Palatino, 'Book Antiqua', serif",
    body: "Georgia, 'Times New Roman', serif",
  },
};

/** Variables CSS injectées sur le conteneur du site (thème par site). */
export function themeCssVars(theme: SiteTheme): Record<string, string> {
  const palette = { ...PALETTES[theme.preset], ...theme.palette };
  const fonts = FONTS[theme.fontPreset] ?? FONTS.classique;
  return {
    "--site-primary": palette.primary,
    "--site-primary-dark": palette.primaryDark,
    "--site-bg": palette.background,
    "--site-surface": palette.surface,
    "--site-text": palette.text,
    "--site-soft": palette.soft,
    "--site-font-heading": fonts.heading,
    "--site-font-body": fonts.body,
  };
}
