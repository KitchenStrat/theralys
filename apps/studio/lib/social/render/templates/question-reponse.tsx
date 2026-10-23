/**
 * 3. « question-reponse » — idée reçue, FAQ : badge, question en titre, barre
 * d'accent, réponse dans une carte `surface`.
 */

import { Brand, Pill, Root, accentOn } from "../chrome";
import { fitTitle } from "../frames";
import { RichBody, Title, cleanText } from "../rich-text";
import { rgba } from "../theme";
import type { TemplateProps } from "./types";

export function QuestionReponse({ frame, theme, slide, logo, brand }: TemplateProps) {
  const accent = accentOn(theme, theme.background);
  return (
    <Root frame={frame} style={{ backgroundColor: theme.background, color: theme.text }}>
      <Pill
        text={cleanText(slide.badge) || "Idée reçue"}
        bg={accent.bg}
        fg={accent.fg}
        size={frame.label}
        uppercase
      />
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
            backgroundColor: accent.bg,
            marginTop: 30,
            marginBottom: 30,
          }}
        />
        <div
          style={{
            display: "flex",
            backgroundColor: theme.surface,
            borderRadius: 32,
            padding: 40,
            // Pas d'ombre floue : resvg la paie 0,8 s par image (1,5 s en story)
            border: `2px solid ${rgba(theme.text, 0.08)}`,
          }}
        >
          <RichBody
            text={slide.body}
            size={frame.body}
            color={theme.text}
            strong={theme.primaryDark}
            maxLines={6}
          />
        </div>
      </div>
      <Brand brand={brand} frame={frame} theme={theme} tone="light" logo={logo} />
    </Root>
  );
}
