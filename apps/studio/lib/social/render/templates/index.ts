/**
 * Registre des templates (§4.2) : choisit le composant selon le template du
 * contenu, le rôle de la diapositive et la présence d'une photo.
 */

import type { ReactElement } from "react";
import { createElement } from "react";
import { TEMPLATE_ACCEPTS_PHOTO, type SocialSize, type SocialTemplate } from "@theralys/shared";
import { FRAMES } from "../frames";
import { Affirmation } from "./affirmation";
import { Avis } from "./avis";
import { ARTICLE_COVER_BADGE, CarrouselArticlePage } from "./carrousel-article";
import { CarrouselCta, CarrouselEtape } from "./carrousel-etapes";
import { InfosPratiques } from "./infos-pratiques";
import { ListeConseils } from "./liste-conseils";
import { PhotoTitre, STORY_PHOTO_HEIGHT } from "./photo-titre";
import { QuestionReponse } from "./question-reponse";
import { STORY_RAPPEL_PHOTO_HEIGHT, StoryRappel } from "./story-rappel";
import type { TemplateProps } from "./types";

export type { TemplateProps } from "./types";

/**
 * Géométrie de la photo à préparer pour une diapositive, ou null si le
 * template (ou le rôle) n'en affiche pas.
 */
export function photoGeometry(
  template: SocialTemplate,
  size: SocialSize,
  role: TemplateProps["slide"]["role"],
): { w: number; h: number } | null {
  if (!TEMPLATE_ACCEPTS_PHOTO[template]) return null;
  const frame = FRAMES[size];
  switch (template) {
    case "photo-titre":
      return size === "story" ? { w: frame.w, h: STORY_PHOTO_HEIGHT } : { w: frame.w, h: frame.h };
    case "story-rappel":
      return { w: FRAMES.story.w, h: STORY_RAPPEL_PHOTO_HEIGHT };
    case "carrousel-etapes":
    case "carrousel-article":
      return role === "cover" ? { w: frame.w, h: frame.h } : null;
    default:
      return null;
  }
}

/** Élément React (satori) d'une diapositive. */
export function renderElement(template: SocialTemplate, props: TemplateProps): ReactElement {
  switch (template) {
    case "affirmation":
      return createElement(Affirmation, props);
    case "photo-titre":
      return createElement(PhotoTitre, props);
    case "question-reponse":
      return createElement(QuestionReponse, props);
    case "liste-conseils":
      return createElement(ListeConseils, props);
    case "infos-pratiques":
      return createElement(InfosPratiques, props);
    case "avis":
      return createElement(Avis, props);
    case "story-rappel":
      return createElement(StoryRappel, props);
    case "carrousel-etapes": {
      if (props.slide.role === "cta") return createElement(CarrouselCta, props);
      if (props.slide.role === "cover" || props.index === 0) {
        return createElement(PhotoTitre, { ...props, scrollHint: true });
      }
      return createElement(CarrouselEtape, props);
    }
    case "carrousel-article": {
      if (props.slide.role === "cta") return createElement(CarrouselCta, props);
      if (props.slide.role === "cover" || props.index === 0) {
        const slide = props.slide.badge ? props.slide : { ...props.slide, badge: ARTICLE_COVER_BADGE };
        return createElement(PhotoTitre, { ...props, slide, scrollHint: true });
      }
      return createElement(CarrouselArticlePage, props);
    }
  }
}
