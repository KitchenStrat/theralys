/**
 * 6. « avis » — client uniquement : citation de l'avis (title), auteur
 * (body), 5 étoiles SVG, pastille avec la note Google de la fiche.
 */

import { Brand, Pill, Root, StarIcon } from "../chrome";
import type { Frame } from "../frames";
import { Title, cleanText } from "../rich-text";
import { rgba } from "../theme";
import type { TemplateProps } from "./types";

/** La citation (≤ 90 caractères) reste grande : ≤ 40 → taille du cadre ; ≤ 70 → ×0,86 ; au-delà ×0,76. */
function quoteSize(text: string, frame: Frame): number {
  const n = text.trim().length;
  return Math.round(frame.title * (n <= 40 ? 1 : n <= 70 ? 0.86 : 0.76));
}

export function Avis({ frame, theme, slide, logo, brand, google, reviewRating }: TemplateProps) {
  const rating = Math.min(5, Math.max(1, Math.round(reviewRating ?? 5)));
  const author = cleanText(slide.body);
  return (
    <Root frame={frame} style={{ backgroundColor: theme.deep, color: theme.onDeep }}>
      <div style={{ display: "flex", gap: 10 }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <StarIcon key={i} size={52} color={i < rating ? theme.soft : rgba(theme.onDeep, 0.25)} />
        ))}
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
        <Title text={slide.title} size={quoteSize(slide.title, frame)} maxLines={5} lineHeight={1.18} />
        {author ? (
          <div
            style={{
              // Nœud texte unique en block : seul mode où satori honore lineClamp
              display: "block",
              marginTop: 32,
              fontWeight: 700,
              fontSize: frame.body,
              lineClamp: 1,
            }}
          >
            {`— ${author}`}
          </div>
        ) : null}
        {google ? (
          <Pill
            text={`Avis Google · ${google.rating.toFixed(1).replace(".", ",")}/5`}
            bg={rgba(theme.onDeep, 0.12)}
            fg={theme.onDeep}
            size={frame.label}
            style={{ marginTop: 28 }}
          />
        ) : null}
      </div>
      <Brand brand={brand} frame={frame} theme={theme} tone="onDeep" logo={logo} />
    </Root>
  );
}
