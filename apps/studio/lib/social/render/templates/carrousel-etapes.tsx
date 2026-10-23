/**
 * 7. « carrousel-etapes » — couverture (« photo-titre » ou « affirmation »
 * avec « Faites défiler › »), pages numérotées, dernière page CTA écrite par
 * le code. Formats carré et portrait.
 */

import { Brand, Dots, Root, accentGradient, accentOn } from "../chrome";
import { fitTitle } from "../frames";
import { RichBody, Title, cleanText } from "../rich-text";
import type { TemplateProps } from "./types";

/** Page « role: page » : disque numéroté, fil « n / N », titre, barre, corps. */
export function CarrouselEtape({ frame, theme, slide, index, total, logo, brand }: TemplateProps) {
  const pages = Math.max(1, total - 2);
  const disc = accentOn(theme, theme.background);
  return (
    <Root frame={frame} style={{ backgroundColor: theme.background, color: theme.text }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div
          style={{
            display: "flex",
            width: 112,
            height: 112,
            borderRadius: 56,
            backgroundColor: disc.bg,
            color: disc.fg,
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "Heading",
            fontWeight: 700,
            fontSize: 56,
          }}
        >
          {String(index)}
        </div>
        <div
          style={{
            display: "flex",
            fontSize: frame.label,
            fontWeight: 700,
            color: theme.primaryDark,
          }}
        >
          {`${index} / ${pages}`}
        </div>
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flexGrow: 1,
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        <Title text={slide.title} size={fitTitle(slide.title, frame)} maxLines={3} lineHeight={1.1} />
        <div
          style={{
            display: "flex",
            width: 96,
            height: 8,
            borderRadius: 4,
            backgroundColor: disc.bg,
            marginTop: 30,
            marginBottom: 30,
          }}
        />
        <RichBody
          text={slide.body}
          size={frame.body}
          color={theme.text}
          strong={theme.primaryDark}
          maxLines={6}
        />
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Brand brand={brand} frame={frame} theme={theme} tone="light" logo={logo} compact />
        <Dots total={total} current={index} accent={theme.accent} muted={theme.soft} />
      </div>
    </Root>
  );
}

/** Dernière page (« Envie d'en parler ? » / « L'article complet est sur mon site »). */
export function CarrouselCta({ frame, theme, slide, index, total, logo, brand, domain }: TemplateProps) {
  const body = cleanText(slide.body);
  return (
    <Root frame={frame} style={{ backgroundImage: accentGradient(theme), color: theme.onAccent }}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flexGrow: 1,
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        <Title text={slide.title} size={fitTitle(slide.title, frame)} maxLines={3} />
        {body ? (
          <div style={{ display: "flex", marginTop: 24 }}>
            <RichBody
              text={body}
              size={frame.body}
              color={theme.onAccent}
              strong={theme.onAccent}
              maxLines={4}
            />
          </div>
        ) : null}
        <div
          style={{
            display: "flex",
            alignSelf: "flex-start",
            marginTop: 44,
            backgroundColor: "#ffffff",
            color: theme.primaryDark,
            borderRadius: 999,
            paddingTop: 20,
            paddingBottom: 20,
            paddingLeft: 40,
            paddingRight: 40,
            fontSize: frame.body,
            fontWeight: 700,
            lineHeight: 1,
          }}
        >
          Le lien est dans ma bio
        </div>
        {domain ? (
          <div style={{ display: "flex", marginTop: 18, fontSize: frame.label, opacity: 0.85 }}>
            {domain}
          </div>
        ) : null}
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Brand brand={brand} frame={frame} theme={theme} tone="onAccent" logo={logo} compact />
        <Dots
          total={total}
          current={index}
          accent={theme.onAccent}
          muted={theme.onAccent === "#ffffff" ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.2)"}
        />
      </div>
    </Root>
  );
}
