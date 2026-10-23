/**
 * 5. « infos-pratiques » — durée, tarif, prise en charge (3 lignes « - »
 * strictement issues du site) + adresse si connue.
 */

import { bulletLines } from "@theralys/shared";
import { Brand, Pill, Root } from "../chrome";
import { fitTitle } from "../frames";
import { RichBody, Title, cleanText } from "../rich-text";
import type { TemplateProps } from "./types";

export function InfosPratiques({ frame, theme, slide, logo, brand, address }: TemplateProps) {
  const lines = bulletLines(cleanText(slide.body)).slice(0, 3);
  return (
    <Root frame={frame} style={{ backgroundColor: theme.surface, color: theme.text }}>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <Pill text="Sur rendez-vous" bg={theme.accent} fg={theme.onAccent} size={frame.label} />
        <Title
          text={slide.title}
          size={fitTitle(slide.title, frame)}
          maxLines={2}
          lineHeight={1.1}
          style={{ marginTop: 24 }}
        />
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flexGrow: 1,
          justifyContent: "center",
          gap: 24,
          overflow: "hidden",
        }}
      >
        {lines.map((line, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              flexDirection: "column",
              backgroundColor: theme.soft,
              borderRadius: 28,
              padding: 32,
            }}
          >
            <RichBody
              text={line}
              size={frame.body}
              color={theme.text}
              strong={theme.primaryDark}
              maxLines={2}
            />
          </div>
        ))}
        {address ? (
          <div
            style={{
              display: "flex",
              fontSize: frame.label,
              opacity: 0.8,
              marginTop: 8,
              lineClamp: 2,
            }}
          >
            {cleanText(address)}
          </div>
        ) : null}
      </div>
      <Brand brand={brand} frame={frame} theme={theme} tone="light" logo={logo} />
    </Root>
  );
}
