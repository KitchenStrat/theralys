/**
 * Fixture du rendu (script de fumée et tests) : site de démo « Claire Dupont »,
 * photos et logo SVG en data:URI, diapositives des 9 templates (exemples de
 * la conception §1.5) et cas limites.
 */

import {
  TEMPLATE_FORMATS,
  type FontPreset,
  type SiteTheme,
  type SocialFormat,
  type SocialPostContent,
  type SocialSlide,
  type SocialTemplate,
  type ThemePreset,
} from "@theralys/shared";
import type { RenderContext, RenderablePost } from "./render";

// ─── Fixture ─────────────────────────────────────────────────────────────────

/** Photo d'ambiance SVG (data:URI) : dégradé + formes, rasterisée par sharp. */
export function fixturePhoto(seed: number, w = 1600, h = 1067): string {
  const hue = (seed * 47) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="hsl(${hue},45%,70%)"/><stop offset="1" stop-color="hsl(${(hue + 60) % 360},40%,35%)"/>
  </linearGradient></defs>
  <rect width="${w}" height="${h}" fill="url(#g)"/>
  <circle cx="${w * 0.7}" cy="${h * 0.35}" r="${h * 0.28}" fill="rgba(255,255,255,0.25)"/>
  <circle cx="${w * 0.25}" cy="${h * 0.75}" r="${h * 0.18}" fill="rgba(0,0,0,0.18)"/>
  <rect x="${w * 0.1}" y="${h * 0.15}" width="${w * 0.3}" height="${h * 0.2}" rx="40" fill="rgba(255,255,255,0.15)"/>
</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

/** Logo SVG (data:URI) avec transparence. */
export function fixtureLogo(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="520" height="112" viewBox="0 0 520 112">
  <circle cx="56" cy="56" r="48" fill="#6f5b9c"/><path d="M36 60 q20 -30 40 0 q-20 30 -40 0z" fill="#fff"/>
  <text x="124" y="72" font-family="Georgia, serif" font-size="48" font-weight="700" fill="#322b45">Claire Dupont</text>
</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

export const SMOKE_BRAND = {
  firstName: "Claire",
  lastName: "Dupont",
  profession: "Sophrologue",
  city: "Albi",
};

export function smokeContext(
  fontPreset: FontPreset,
  preset: ThemePreset = "lavande",
  withLogo = false,
): RenderContext {
  const siteTheme: SiteTheme = withLogo
    ? { preset, fontPreset, logoUrl: fixtureLogo() }
    : { preset, fontPreset };
  return {
    siteTheme,
    brand: SMOKE_BRAND,
    domain: "claire-dupont-sophrologue-albi.harmony-web.fr",
    google: { rating: 4.9, reviewCount: 27 },
    address: "14 rue de la Berbie, 81000 Albi",
  };
}

export const singleSlide = (slide: Omit<SocialSlide, "role">): SocialSlide[] => [{ role: "single", ...slide }];

/** Diapositives de la fixture par template (exemples de la conception §1.5). */
export const SMOKE_SLIDES: Record<SocialTemplate, SocialSlide[]> = {
  affirmation: singleSlide({
    badge: "Sophrologue à Albi",
    title: "Respirer, relâcher, retrouver votre équilibre intérieur",
    body: "Un espace pour **relâcher le corps** et apaiser le mental, à votre rythme.",
  }),
  "photo-titre": singleSlide({
    badge: "Sophrologue à Albi",
    title: "Respirer avant de réagir",
    body: "Quand tout s'accélère, le souffle se raccourcit. **Trois respirations lentes** suffisent souvent à reprendre la main.",
    imageUrl: fixturePhoto(4),
  }),
  "question-reponse": singleSlide({
    badge: "Idée reçue",
    title: "La sophrologie, c'est de l'hypnose ?",
    body: "Pas tout à fait : **vous restez pleinement actif**, guidé par ma voix, les yeux fermés ou ouverts.",
  }),
  "liste-conseils": singleSlide({
    title: "Comment se passe une séance ?",
    body: "- **Un temps d'échange** pour poser ce qui vous amène\n- Des exercices guidés, assis ou allongé\n- Un retour au calme et des repères à emporter",
  }),
  "infos-pratiques": singleSlide({
    title: "Infos pratiques",
    body: "- Séance individuelle de **60 minutes**\n- Sur rendez-vous, du lundi au vendredi\n- Cabinet au cœur d'Albi, parking à proximité",
  }),
  avis: singleSlide({
    title: "« J'ai retrouvé un vrai calme intérieur, séance après séance. »",
    body: "Marie D. · Avis Google",
  }),
  "carrousel-etapes": [
    {
      role: "cover",
      title: "3 minutes pour relâcher les épaules",
      body: "Un exercice à faire au bureau, les yeux fermés",
      imageUrl: fixturePhoto(2),
    },
    { role: "page", title: "Installez-vous", body: "Pieds à plat, mains sur les cuisses, **yeux fermés**." },
    {
      role: "page",
      title: "Expirez 6 secondes",
      body: "En relâchant les épaules, lentement. **Six fois de suite**, sans forcer.",
    },
    { role: "cta", title: "Envie d'en parler ?", body: "Je vous accueille sur rendez-vous à Albi." },
  ],
  "carrousel-article": [
    {
      role: "cover",
      badge: "Article du blog",
      title: "Sommeil léger, réveils nocturnes",
      body: "Ce qui se joue, et ce que la sophrologie peut apporter",
      imageUrl: fixturePhoto(7),
    },
    {
      role: "page",
      title: "Ce qui se joue",
      body: "- Des pensées qui tournent au moment de s'endormir\n- Un corps qui **reste en alerte**\n- Des réveils entre 3 h et 5 h",
    },
    {
      role: "cta",
      title: "L'article complet est sur mon site",
      body: "Je vous accueille sur rendez-vous à Albi.",
    },
  ],
  "story-rappel": singleSlide({
    badge: "Première séance",
    title: "Première séance : à quoi s'attendre ?",
    body: "Un temps d'échange, puis des exercices simples. **60 minutes**, à votre rythme.",
    imageUrl: fixturePhoto(9, 1200, 1600),
  }),
};

/** Cas limites : titre 60 caractères, corps 200 caractères, 3 lignes. */
export const STRESS_SLIDE: SocialSlide = {
  role: "single",
  badge: "Un badge volontairement long pour tester",
  title: "Et si vous retrouviez un sommeil paisible dès les prochaines nuits ?",
  body: "- **Un endormissement plus serein** grâce à des rituels simples à mettre en place\n- Des réveils nocturnes moins fréquents et moins longs\n- Une énergie retrouvée au matin, sans effort",
};

export function smokePost(
  template: SocialTemplate,
  slides: SocialSlide[] = SMOKE_SLIDES[template],
): RenderablePost {
  return {
    template,
    accentColor: null,
    content: {
      pillar: "projection",
      accentRole: "primary",
      caption: "Légende de test.",
      hashtags: ["#SophrologueAlbi", "#Albi"],
      altText: "Visuel de test.",
      slides,
      sourceRefs: [{ kind: "section", id: "section:home:hero", label: "Page d'accueil" }],
      voice: { designation: "je", accord: "feminin", reader: "vous", tone: "chaleureux" },
      generator: "mock",
    } satisfies SocialPostContent,
  };
}

/** Format « naturel » d'un template (premier de TEMPLATE_FORMATS). */
export function formatOf(template: SocialTemplate): SocialFormat {
  return TEMPLATE_FORMATS[template][0] ?? "static";
}
