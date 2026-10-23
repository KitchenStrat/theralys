/**
 * 2. « photo-titre » — spécialité, nouvel article, ambiance. Photo pleine
 * page sous un dégradé `deep`, texte en bas. Sans photo → « affirmation ».
 * Story : photo sur la moitié haute fondue dans un panneau `deep`, texte
 * entre le fondu et la zone basse réservée.
 */

import { Brand, Pill, ScrollHint } from "../chrome";
import { FRAMES, fitTitle } from "../frames";
import { RichBody, Title, cleanText } from "../rich-text";
import { rgba } from "../theme";
import { Affirmation } from "./affirmation";
import type { TemplateProps } from "./types";

/** Hauteur de la bande photo en story (avant fondu). */
export const STORY_PHOTO_HEIGHT = Math.round(FRAMES.story.h * 0.5);

export function PhotoTitre(props: TemplateProps) {
  const { frame, size, theme, slide, photo, logo, brand, scrollHint } = props;
  if (!photo) return <Affirmation {...props} />;
  if (size === "story") return <PhotoTitreStory {...props} photo={photo} />;
  const { w, h, pad } = frame;
  const body = cleanText(slide.body);
  return (
    <div
      style={{
        display: "flex",
        width: w,
        height: h,
        position: "relative",
        backgroundColor: theme.deep,
        fontFamily: "Body",
      }}
    >
      <img
        src={photo}
        style={{ position: "absolute", top: 0, left: 0, width: w, height: h, objectFit: "cover" }}
      />
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: w,
          height: h,
          backgroundImage: `linear-gradient(180deg, rgba(0,0,0,0) 28%, ${rgba(theme.deep, 0.55)} 58%, ${rgba(theme.deep, 0.94)} 100%)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: w,
          height: h,
          padding: pad,
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          color: theme.onDeep,
        }}
      >
        {slide.badge ? (
          <Pill
            text={cleanText(slide.badge)}
            bg={theme.accent}
            fg={theme.onAccent}
            size={frame.label}
            uppercase
          />
        ) : null}
        <Title
          text={slide.title}
          size={fitTitle(slide.title, frame)}
          color={theme.onDeep}
          maxLines={3}
          style={{ marginTop: 28 }}
        />
        {body ? (
          <div style={{ display: "flex", marginTop: 22 }}>
            <RichBody
              text={body}
              size={frame.body}
              color={theme.onDeep}
              strong={theme.soft}
              maxLines={4}
            />
          </div>
        ) : null}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: 44,
            paddingTop: 28,
            borderTop: `2px solid ${rgba(theme.onDeep, 0.25)}`,
          }}
        >
          <Brand brand={brand} frame={frame} theme={theme} tone="onDeep" logo={logo} />
          {scrollHint ? <ScrollHint color={theme.onDeep} size={frame.label} /> : null}
        </div>
      </div>
    </div>
  );
}

function PhotoTitreStory({ frame, theme, slide, photo, logo, brand }: TemplateProps & { photo: string }) {
  const { w, h, pad, safeBottom } = frame;
  const body = cleanText(slide.body);
  const fade = 360;
  const textTop = STORY_PHOTO_HEIGHT - 140;
  return (
    <div
      style={{
        display: "flex",
        width: w,
        height: h,
        position: "relative",
        backgroundColor: theme.deep,
        fontFamily: "Body",
      }}
    >
      <img
        src={photo}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: w,
          height: STORY_PHOTO_HEIGHT,
          objectFit: "cover",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: STORY_PHOTO_HEIGHT - fade,
          left: 0,
          width: w,
          height: fade,
          backgroundImage: `linear-gradient(180deg, ${rgba(theme.deep, 0)} 0%, ${rgba(theme.deep, 0.75)} 55%, ${theme.deep} 100%)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          top: textTop,
          left: 0,
          width: w,
          height: h - textTop - safeBottom,
          paddingLeft: pad,
          paddingRight: pad,
          paddingBottom: 24,
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          color: theme.onDeep,
          overflow: "hidden",
        }}
      >
        {slide.badge ? (
          <Pill
            text={cleanText(slide.badge)}
            bg={theme.accent}
            fg={theme.onAccent}
            size={frame.label}
            uppercase
          />
        ) : null}
        <Title
          text={slide.title}
          size={fitTitle(slide.title, frame)}
          color={theme.onDeep}
          maxLines={3}
          style={{ marginTop: 28 }}
        />
        {body ? (
          <div style={{ display: "flex", marginTop: 24 }}>
            <RichBody
              text={body}
              size={frame.body}
              color={theme.onDeep}
              strong={theme.soft}
              maxLines={4}
            />
          </div>
        ) : null}
        <div
          style={{
            display: "flex",
            marginTop: 44,
            paddingTop: 28,
            borderTop: `2px solid ${rgba(theme.onDeep, 0.25)}`,
          }}
        >
          <Brand brand={brand} frame={frame} theme={theme} tone="onDeep" logo={logo} />
        </div>
      </div>
    </div>
  );
}
