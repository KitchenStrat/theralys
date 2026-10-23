/**
 * 9. « story-rappel » — 1080×1920 : photo (ou dégradé) sur la moitié haute
 * fondue dans le fond, badge, titre, phrase, pastille « Lien dans ma bio »,
 * marque au-dessus de la zone basse réservée à l'interface.
 */

import { Brand, PhotoOrGradient, Pill } from "../chrome";
import { FRAMES, fitTitle } from "../frames";
import { RichBody, Title, cleanText } from "../rich-text";
import { rgba } from "../theme";
import type { TemplateProps } from "./types";

export const STORY_RAPPEL_PHOTO_HEIGHT = Math.round(FRAMES.story.h * 0.5);

export function StoryRappel({ theme, slide, photo, logo, brand }: TemplateProps) {
  const frame = FRAMES.story;
  const { w, h, pad, safeBottom } = frame;
  const photoH = STORY_RAPPEL_PHOTO_HEIGHT;
  const fade = 320;
  const textTop = photoH - 160;
  const body = cleanText(slide.body);
  return (
    <div
      style={{
        display: "flex",
        width: w,
        height: h,
        position: "relative",
        backgroundColor: theme.background,
        fontFamily: "Body",
      }}
    >
      <div style={{ position: "absolute", top: 0, left: 0, display: "flex" }}>
        {photo ? (
          <img src={photo} style={{ width: w, height: photoH, objectFit: "cover" }} />
        ) : (
          <PhotoOrGradient w={w} h={photoH} theme={theme} seed={slide.title} />
        )}
      </div>
      <div
        style={{
          position: "absolute",
          top: photoH - fade,
          left: 0,
          width: w,
          height: fade,
          backgroundImage: `linear-gradient(180deg, ${rgba(theme.background, 0)} 0%, ${rgba(theme.background, 0.85)} 60%, ${theme.background} 100%)`,
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
          display: "flex",
          flexDirection: "column",
          color: theme.text,
          overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", flexGrow: 1 }} />
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
          maxLines={3}
          style={{ marginTop: slide.badge ? 24 : 0 }}
        />
        {body ? (
          <div style={{ display: "flex", marginTop: 24 }}>
            <RichBody
              text={body}
              size={frame.body}
              color={theme.text}
              strong={theme.primaryDark}
              maxLines={4}
            />
          </div>
        ) : null}
        <div
          style={{
            display: "flex",
            alignSelf: "flex-start",
            marginTop: 36,
            backgroundColor: theme.accent,
            color: theme.onAccent,
            borderRadius: 999,
            paddingTop: 20,
            paddingBottom: 20,
            paddingLeft: 40,
            paddingRight: 40,
            fontSize: 34,
            fontWeight: 700,
            lineHeight: 1,
          }}
        >
          Lien dans ma bio
        </div>
        <div style={{ display: "flex", flexGrow: 1 }} />
        <Brand brand={brand} frame={frame} theme={theme} tone="light" logo={logo} />
      </div>
    </div>
  );
}
