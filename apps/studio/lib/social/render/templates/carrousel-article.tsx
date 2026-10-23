/**
 * 8. « carrousel-article » — couverture « photo-titre » (badge « Article du
 * blog »), pages d'idées clés avec grand numéro décoratif et fil « n / N »,
 * CTA « L'article complet est sur mon site ».
 */

import { Brand, Dots, Root, accentOn } from "../chrome";
import { fitTitle } from "../frames";
import { RichBody, Title } from "../rich-text";
import { rgba } from "../theme";
import type { TemplateProps } from "./types";

export const ARTICLE_COVER_BADGE = "Article du blog";

export function CarrouselArticlePage({
  frame,
  theme,
  slide,
  index,
  total,
  logo,
  brand,
}: TemplateProps) {
  const pages = Math.max(1, total - 2);
  const bigSize = Math.round(frame.title * 2.5);
  const bar = accentOn(theme, theme.background);
  return (
    <Root frame={frame} style={{ backgroundColor: theme.background, color: theme.text }}>
      <div
        style={{
          position: "absolute",
          top: frame.pad - Math.round(bigSize * 0.18),
          right: frame.pad,
          display: "flex",
          fontFamily: "Heading",
          fontWeight: 700,
          fontSize: bigSize,
          lineHeight: 1,
          color: rgba(theme.accent, 0.16),
        }}
      >
        {String(index).padStart(2, "0")}
      </div>
      <div
        style={{
          display: "flex",
          fontSize: frame.label,
          fontWeight: 700,
          color: theme.primaryDark,
          height: Math.round(bigSize * 0.55),
          alignItems: "center",
        }}
      >
        {`${index} / ${pages}`}
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
            backgroundColor: bar.bg,
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
