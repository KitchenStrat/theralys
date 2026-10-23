/**
 * 4. « liste-conseils » — repères, bénéfices, déroulé : titre + 3 lignes
 * numérotées sur fond `soft`.
 */

import { bulletLines } from "@theralys/shared";
import { Brand, Root, accentOn } from "../chrome";
import { fitTitle } from "../frames";
import { RichBody, Title, cleanText } from "../rich-text";
import type { TemplateProps } from "./types";

export function ListeConseils({ frame, theme, slide, logo, brand }: TemplateProps) {
  const lines = bulletLines(cleanText(slide.body)).slice(0, 3);
  const disc = Math.round(frame.body * 2.1);
  const discColors = accentOn(theme, theme.soft);
  return (
    <Root frame={frame} style={{ backgroundColor: theme.soft, color: theme.text }}>
      <Title text={slide.title} size={fitTitle(slide.title, frame)} maxLines={2} lineHeight={1.1} />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flexGrow: 1,
          justifyContent: "center",
          gap: 28,
          overflow: "hidden",
        }}
      >
        {lines.map((line, i) => (
          <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 24 }}>
            <div
              style={{
                display: "flex",
                width: disc,
                height: disc,
                borderRadius: disc / 2,
                backgroundColor: discColors.bg,
                color: discColors.fg,
                alignItems: "center",
                justifyContent: "center",
                fontFamily: "Heading",
                fontWeight: 700,
                fontSize: Math.round(disc * 0.47),
                flexShrink: 0,
              }}
            >
              {String(i + 1)}
            </div>
            <RichBody
              text={line}
              size={frame.body}
              color={theme.text}
              strong={theme.primaryDark}
              maxLines={2}
              style={{
                flexGrow: 1,
                flexShrink: 1,
                minWidth: 0,
                marginTop: Math.round((disc - frame.body * 1.35) / 2),
              }}
            />
          </div>
        ))}
      </div>
      <Brand brand={brand} frame={frame} theme={theme} tone="light" logo={logo} />
    </Root>
  );
}
