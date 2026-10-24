/**
 * Éléments communs des templates (§4.1) : racine, pastille, marque, points
 * de carrousel, icônes SVG inline (satori n'affiche ni emoji ni police
 * d'icônes), bloc dégradé « sans photo ».
 * Contraintes satori : `display:"flex"` sur tout parent à plusieurs enfants,
 * pas de `grid`, images en data:URI uniquement.
 */

import type { CSSProperties, ReactNode } from "react";
import type { Frame } from "./frames";
import { contrastRatio, mix, onAccentColor, rgba, type SocialTheme } from "./theme";

export type BrandInfo = {
  firstName: string;
  lastName: string;
  profession: string;
  city: string;
};

export function Root({
  frame,
  style,
  children,
}: {
  frame: Frame;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: frame.w,
        height: frame.h,
        paddingTop: frame.pad + frame.safeTop,
        paddingRight: frame.pad,
        paddingBottom: frame.pad + frame.safeBottom,
        paddingLeft: frame.pad,
        fontFamily: "Body",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function Pill({
  text,
  bg,
  fg,
  size,
  uppercase = false,
  style,
}: {
  text: string;
  bg: string;
  fg: string;
  size: number;
  uppercase?: boolean;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignSelf: "flex-start",
        maxWidth: "100%",
        backgroundColor: bg,
        color: fg,
        borderRadius: 999,
        paddingTop: Math.round(size * 0.42),
        paddingBottom: Math.round(size * 0.42),
        paddingLeft: Math.round(size * 0.9),
        paddingRight: Math.round(size * 0.9),
        fontSize: uppercase ? Math.round(size * 0.86) : size,
        fontWeight: 700,
        lineHeight: 1,
        letterSpacing: uppercase ? 1.5 : 0,
        textTransform: uppercase ? "uppercase" : "none",
        ...style,
      }}
    >
      {/* Nœud texte unique en block : seul mode où satori honore lineClamp */}
      <div style={{ display: "block", lineClamp: 1 }}>{text}</div>
    </div>
  );
}

export type BrandTone = "light" | "onDeep" | "onAccent";

/**
 * Rangée de marque : logo (PNG data:URI) ou disque avec l'initiale, nom,
 * « métier · Ville ». Hors fond clair, le logo — conçu pour l'en-tête clair du
 * site, donc en général sombre sur transparent — est posé sur une plaque
 * blanche arrondie pour rester lisible sur `deep` et sur l'accent.
 */
export function Brand({
  brand,
  frame,
  theme,
  tone,
  logo,
  compact = false,
}: {
  brand: BrandInfo;
  frame: Frame;
  theme: SocialTheme;
  tone: BrandTone;
  logo: string | null;
  compact?: boolean;
}) {
  const color = tone === "light" ? theme.text : tone === "onDeep" ? theme.onDeep : theme.onAccent;
  // Fond sous la rangée (approximation : background / deep / accent) : si l'accent
  // s'y confond (avis sur fond deep avec accent deep…), disque translucide
  const surface = tone === "light" ? theme.background : tone === "onDeep" ? theme.deep : theme.accent;
  const translucent = tone === "onAccent" || contrastRatio(theme.accent, surface) < 1.5;
  const discBg = translucent ? rgba(color === "#ffffff" ? "#ffffff" : color, 0.18) : theme.accent;
  const discFg = translucent ? color : theme.onAccent;
  const name = `${brand.firstName} ${brand.lastName}`.trim();
  const sub = [brand.profession, brand.city].filter((s) => s.trim() !== "").join(" · ");
  const initial = (brand.firstName.trim().charAt(0) || name.charAt(0) || "H").toUpperCase();
  const mark = compact ? 48 : 56;
  const label = compact ? frame.label - 2 : frame.label;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 18, color, flexShrink: 0, minWidth: 0 }}>
      {logo && tone === "light" ? (
        <img src={logo} style={{ height: mark, maxWidth: 260, objectFit: "contain" }} />
      ) : logo ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            backgroundColor: "#ffffff",
            borderRadius: 16,
            padding: 8,
            flexShrink: 0,
          }}
        >
          <img src={logo} style={{ height: mark, maxWidth: 260, objectFit: "contain" }} />
        </div>
      ) : (
        <div
          style={{
            display: "flex",
            width: mark,
            height: mark,
            borderRadius: mark / 2,
            backgroundColor: discBg,
            color: discFg,
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "Heading",
            fontWeight: 700,
            fontSize: Math.round(mark * 0.5),
            flexShrink: 0,
          }}
        >
          {initial}
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        {/* Nœuds texte uniques en block : seul mode où satori honore lineClamp */}
        <div style={{ display: "block", fontWeight: 700, fontSize: label, lineHeight: 1.2, lineClamp: 1 }}>
          {name}
        </div>
        {sub ? (
          <div style={{ display: "block", fontSize: label - 2, lineHeight: 1.2, opacity: 0.8, lineClamp: 1 }}>
            {sub}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Points de pagination d'un carrousel (le courant est allongé et en accent). */
export function Dots({
  total,
  current,
  accent,
  muted,
}: {
  total: number;
  current: number;
  accent: string;
  muted: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      {Array.from({ length: Math.max(1, total) }, (_, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            width: i === current ? 36 : 14,
            height: 14,
            borderRadius: 7,
            backgroundColor: i === current ? accent : muted,
          }}
        />
      ))}
    </div>
  );
}

export function StarIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <path
        fill={color}
        d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6L2.5 9.4l6.6-.8z"
      />
    </svg>
  );
}

export function Chevron({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <path
        d="M9 5l7 7-7 7"
        fill="none"
        stroke={color}
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** « Faites défiler › » (couverture de carrousel). */
export function ScrollHint({ color, size }: { color: string; size: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, color, fontSize: size, fontWeight: 700 }}>
      <div style={{ display: "flex" }}>Faites défiler</div>
      <Chevron size={Math.round(size * 1.3)} color={color} />
    </div>
  );
}

/**
 * Couleurs d'un élément d'accent (disque numéroté, barre) posé sur `surface` :
 * l'accent, sauf s'il s'y confond (accent « soft » sur fond soft…) — on
 * prend alors `primaryDark`.
 */
export function accentOn(theme: SocialTheme, surface: string): { bg: string; fg: string } {
  if (contrastRatio(theme.accent, surface) >= 1.5) return { bg: theme.accent, fg: theme.onAccent };
  return { bg: theme.primaryDark, fg: onAccentColor(theme.primaryDark, theme.text) };
}

function hash31(text: string): number {
  let h = 7;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return h;
}

/** Dégradé d'accent (couleur `theme.accent` → mélange avec `deep`). */
export function accentGradient(theme: SocialTheme): string {
  return `linear-gradient(160deg, ${theme.accent} 0%, ${mix(theme.accent, theme.deep, 0.35)} 100%)`;
}

/**
 * Dégradé du bloc « sans photo » : celui de l'accent, sauf quand l'accent se
 * confond avec le fond du visuel (rôle `soft`, pastille « Claire ») — un
 * dégradé presque blanc en haut d'une story serait invisible : on le tire
 * alors vers `primaryDark` et `deep`.
 */
export function photoGradient(theme: SocialTheme): string {
  if (contrastRatio(theme.accent, theme.background) >= 1.5) return accentGradient(theme);
  const from = mix(theme.accent, theme.primaryDark, 0.55);
  const to = mix(theme.accent, theme.deep, 0.7);
  return `linear-gradient(160deg, ${from} 0%, ${to} 100%)`;
}

/**
 * Bloc de même géométrie qu'une photo, sans photo : dégradé d'accent
 * (`photoGradient`) et deux disques `soft` translucides positionnés par le
 * hachage du titre.
 */
export function PhotoOrGradient({
  w,
  h,
  theme,
  seed,
  children,
}: {
  w: number;
  h: number;
  theme: SocialTheme;
  seed: string;
  children?: ReactNode;
}) {
  const hash = hash31(seed);
  const r1 = Math.round(Math.min(w, h) * 0.55);
  const r2 = Math.round(Math.min(w, h) * 0.32);
  const x1 = Math.round((hash % 40) / 100 * w) - r1 / 2;
  const y1 = Math.round(((hash >> 8) % 40) / 100 * h) - r1 / 2;
  const x2 = w - Math.round(((hash >> 16) % 45) / 100 * w) - r2 / 2;
  const y2 = h - Math.round(((hash >> 24) % 45) / 100 * h) - r2 / 2;
  return (
    <div
      style={{
        display: "flex",
        position: "relative",
        width: w,
        height: h,
        overflow: "hidden",
        backgroundImage: photoGradient(theme),
      }}
    >
      <div
        style={{
          position: "absolute",
          left: x1,
          top: y1,
          width: r1,
          height: r1,
          borderRadius: r1 / 2,
          backgroundColor: rgba(theme.soft, 0.18),
        }}
      />
      <div
        style={{
          position: "absolute",
          left: x2,
          top: y2,
          width: r2,
          height: r2,
          borderRadius: r2 / 2,
          backgroundColor: rgba(theme.soft, 0.18),
        }}
      />
      {children}
    </div>
  );
}
