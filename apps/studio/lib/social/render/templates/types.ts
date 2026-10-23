import type { SocialSize, SocialSlide } from "@theralys/shared";
import type { BrandInfo } from "../chrome";
import type { Frame } from "../frames";
import type { SocialTheme } from "../theme";

/** Props communes aux 9 templates (§4.2). */
export type TemplateProps = {
  frame: Frame;
  size: SocialSize;
  theme: SocialTheme;
  slide: SocialSlide;
  /** Photo préparée (data:URI JPEG) ou null → variante sans photo */
  photo: string | null;
  /** Logo préparé (data:URI PNG) ou null → disque avec l'initiale */
  logo: string | null;
  brand: BrandInfo;
  /** Index de la diapositive (0 = couverture) */
  index: number;
  /** Nombre total de diapositives du contenu */
  total: number;
  /** Domaine du site, sans protocole (diapositive CTA) */
  domain: string;
  /** Note Google de la fiche (template « avis ») */
  google: { rating: number; reviewCount: number } | null;
  /** Adresse du cabinet (template « infos-pratiques ») */
  address: string | null;
  /** Note de l'avis cité (template « avis »), 5 par défaut */
  reviewRating: number | null;
  /** Couverture de carrousel : « Faites défiler › » */
  scrollHint?: boolean;
};
