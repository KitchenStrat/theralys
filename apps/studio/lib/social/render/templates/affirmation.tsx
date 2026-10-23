/**
 * 1. « affirmation » — projection, titre du site, point fort, démo sans avis.
 * Aplat dégradé d'accent, grand guillemet décoratif, titre centré
 * verticalement. Formats static (carré, portrait, story) ; sert aussi de
 * couverture de carrousel sans photo (`scrollHint`).
 */

import { Brand, Pill, Root, ScrollHint, accentGradient } from "../chrome";
import { fitTitle } from "../frames";
import { RichBody, Title, cleanText } from "../rich-text";
import { rgba } from "../theme";
import type { TemplateProps } from "./types";

export function Affirmation({ frame, theme, slide, logo, brand, scrollHint }: TemplateProps) {
  const body = cleanText(slide.body);
  return (
    <Root frame={frame} style={{ backgroundImage: accentGradient(theme), color: theme.onAccent }}>
      <div
        style={{
          display: "flex",
          height: Math.round(frame.title * 1.6),
          fontFamily: "Heading",
          fontWeight: 700,
          fontSize: Math.round(frame.title * 2.8),
          lineHeight: 1,
          opacity: 0.25,
          overflow: "hidden",
        }}
      >
        “
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
        {slide.badge ? (
          <Pill
            text={cleanText(slide.badge)}
            bg={rgba(theme.onAccent === "#ffffff" ? "#ffffff" : "#000000", 0.16)}
            fg={theme.onAccent}
            size={frame.label}
          />
        ) : null}
        <Title
          text={slide.title}
          size={fitTitle(slide.title, frame)}
          maxLines={4}
          style={{ marginTop: slide.badge ? 28 : 0 }}
        />
        {body ? (
          <div style={{ display: "flex", marginTop: 28, opacity: 0.92 }}>
            <RichBody
              text={body}
              size={frame.body}
              color={theme.onAccent}
              strong={theme.onAccent}
              maxLines={3}
            />
          </div>
        ) : null}
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Brand brand={brand} frame={frame} theme={theme} tone="onAccent" logo={logo} />
        {scrollHint ? <ScrollHint color={theme.onAccent} size={frame.label} /> : null}
      </div>
    </Root>
  );
}
