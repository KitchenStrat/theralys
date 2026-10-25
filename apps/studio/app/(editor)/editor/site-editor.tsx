"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { clsx } from "clsx";
import { Badge, Button, Segmented, Spinner } from "@theralys/ui";
import type { PlanId } from "@theralys/db/plans";
import {
  FOOTER_SOCIAL_NETWORKS,
  LEGAL_PAGES,
  SECTION_LABELS,
  THEME_PRESETS,
  TRACKING_ID_PATTERNS,
  isSectionType,
  isSectionVisible,
  themeCssVars,
  type GeneratingMotif,
  type Section,
  type SectionType,
  type SiteCabinet,
  type SiteLegal,
  type SiteNotFound,
  type SiteTheme,
  type ThemePreset,
  type FontPreset,
  type ThemeIntensity,
  type ThemeCorners,
  type ThemeAmbiance,
} from "@theralys/shared";
import {
  connectGooglePlace,
  savePageSections,
  saveSiteSettings,
  saveSiteStyle,
  searchGoogle,
  setMotifPageEnabled,
} from "../../(app)/actions";
import { isGenerationStale, type EditorPageRef } from "@/lib/editor/page-groups";
import { previewPath, previewTargetForPage, type PreviewTarget } from "@/lib/editor/preview-path";
import { socialUrlError, type SocialNetworkKey } from "@/lib/editor/social-links";
import { PagesPanel } from "./pages-panel";
import { CharCounter, SectionFields, ToggleSwitch } from "./section-fields";

/** Informations légales telles que le formulaire les manipule (chaînes, jamais undefined). */
type LegalForm = Record<keyof SiteLegal, string>;
type SocialForm = Record<SocialNetworkKey, string>;

type Props = {
  site: {
    id: string;
    name: string;
    plan: PlanId;
    bookingUrl: string;
    themePreset: ThemePreset;
    fontPreset: FontPreset;
    intensity: ThemeIntensity;
    corners: ThemeCorners;
    ambiance: ThemeAmbiance;
    logoUrl: string;
    /** Surcharges ponctuelles de la palette (conservées dans la prévisualisation) */
    palette?: SiteTheme["palette"];
    url: string;
    updatedAt: string;
    /** Slugs des pages de spécialité désactivées par le praticien */
    disabledMotifs: string[];
    /** Cabinets supplémentaires (multi-cabinets), saisis dans les paramètres */
    cabinets: SiteCabinet[];
    /** Icône du navigateur ("" = logo Harmony par défaut) */
    faviconUrl: string;
    /** Image de l'aperçu du lien ("" = photo du hero de l'accueil) */
    shareImageUrl: string;
    /** Jeton signé d'aperçu (`?apercu=`) — vide si AUTH_SECRET est absente */
    previewToken: string;
    /** Pages de spécialité en cours de génération (création depuis le studio) */
    generatingMotifs: GeneratingMotif[];
  };
  city: string;
  /** Numéro affiché sur le site (source : section contact de l'accueil) */
  phone: string;
  /** Aperçu du lien : titre/description Google de l'accueil + photo du hero (repli d'image) */
  seo: { title: string; description: string; heroImageUrl: string };
  /** Suivi : bandeau cookies + identifiants des outils ("" = désactivé) */
  tracking: {
    cookieBanner: boolean;
    googleAnalyticsId: string;
    googleTagManagerId: string;
    googleAdsId: string;
    metaPixelId: string;
  };
  googleBusiness: {
    name: string;
    address: string;
    rating: number | null;
    reviewCount: number | null;
  } | null;
  /** Fiche Google reliée (badge « note Google » du hero) */
  googleConnected: boolean;
  /** Identifiant de la page d'accueil (lien « Modifier sur l'accueil ») */
  homePageId: string | null;
  /** Cartes de la section Spécialités de l'accueil / plafond de la formule */
  homeSpecialtiesCount: number;
  homeSpecialtiesMax: number;
  /** Page introuvable : valeurs effectives */
  notFound: Required<SiteNotFound>;
  legal: LegalForm;
  social: SocialForm;
  footer: { text: string; details: string };
  pages: EditorPageRef[];
  selectedPage: {
    id: string;
    type: string;
    slug: string;
    sections: Section[];
    /** Contenu en préparation : pas d'édition des sections */
    generating: boolean;
  } | null;
};

type Panel = "pages" | "contenu" | "style";
type StyleTab = "couleur" | "typo" | "forme";

/** Largeurs de l'aperçu (null = toute la largeur disponible). */
type PreviewWidth = "desktop" | "tablet" | "mobile";
const PREVIEW_WIDTHS: Record<PreviewWidth, number | null> = { desktop: null, tablet: 820, mobile: 390 };
/** Largeur de rendu du mode Ordinateur (réduite à l'échelle si le panneau est plus étroit). */
const DESKTOP_PREVIEW_WIDTH = 1280;
const PREVIEW_WIDTH_OPTIONS: { value: PreviewWidth; label: string }[] = [
  { value: "desktop", label: "Ordinateur" },
  { value: "tablet", label: "Tablette" },
  { value: "mobile", label: "Mobile" },
];


/** Catégories de la fenêtre Paramètres (navigation de gauche). */
type SettingsTab =
  | "identite"
  | "logo"
  | "apercu"
  | "favicon"
  | "coordonnees"
  | "google"
  | "cabinets"
  | "tracking"
  | "legal"
  | "social"
  | "footer";

const SETTINGS_NAV: { group: string; items: { id: SettingsTab; icon: string; label: string }[] }[] = [
  { group: "Profil", items: [{ id: "identite", icon: "👤", label: "Identité" }] },
  { group: "Apparence", items: [{ id: "logo", icon: "🖼", label: "Logo" }] },
  {
    group: "Visibilité",
    items: [
      { id: "apercu", icon: "🔗", label: "Aperçu du lien" },
      { id: "favicon", icon: "🌐", label: "Icône du navigateur" },
    ],
  },
  { group: "Contact", items: [{ id: "coordonnees", icon: "📞", label: "Rendez-vous & téléphone" }] },
  {
    group: "Cabinets",
    items: [
      { id: "google", icon: "⭐", label: "Fiche Google" },
      { id: "cabinets", icon: "📍", label: "Cabinets" },
    ],
  },
  { group: "Suivi", items: [{ id: "tracking", icon: "📊", label: "Tracking" }] },
  { group: "Légal", items: [{ id: "legal", icon: "⚖️", label: "Informations légales" }] },
  {
    group: "Pied de page",
    items: [
      { id: "social", icon: "📱", label: "Réseaux sociaux" },
      { id: "footer", icon: "📝", label: "Texte du pied de page" },
    ],
  },
];

function isSettingsTab(value: string | null): value is SettingsTab {
  return value !== null && SETTINGS_NAV.some((g) => g.items.some((i) => i.id === value));
}

/** Champs de la catégorie Informations légales. */
const LEGAL_FIELDS: {
  key: keyof SiteLegal;
  label: string;
  placeholder?: string;
  hint?: string;
  limit: number;
  multiline?: boolean;
  type?: "email" | "url";
}[] = [
  {
    key: "legalForm",
    label: "Forme juridique",
    placeholder: "Entrepreneur individuel, SASU, EURL…",
    limit: 80,
  },
  { key: "siret", label: "SIRET", placeholder: "123 456 789 00012", hint: "14 chiffres (ou SIREN à 9 chiffres).", limit: 20 },
  {
    key: "registration",
    label: "Numéro d'enregistrement professionnel",
    placeholder: "ADELI, RPPS, RCS…",
    hint: "Facultatif selon votre profession.",
    limit: 80,
  },
  {
    key: "email",
    label: "E-mail de contact publié",
    placeholder: "contact@votre-cabinet.fr",
    hint: "Affiché dans les mentions légales. À défaut, l'e-mail de la section Contact est utilisé.",
    limit: 120,
    type: "email",
  },
  { key: "mediatorName", label: "Médiateur de la consommation — nom", placeholder: "ex. CM2C, Medicys…", limit: 120 },
  {
    key: "mediatorUrl",
    label: "Médiateur de la consommation — site",
    placeholder: "https://…",
    hint: "Adresse https:// du médiateur désigné (obligatoire pour les professionnels vendant à des particuliers).",
    limit: 300,
    type: "url",
  },
  {
    key: "extra",
    label: "Mentions complémentaires",
    placeholder: "Assurance RC professionnelle, diplômes, adhésions…",
    hint: "Texte libre ajouté en fin de mentions légales.",
    limit: 2000,
    multiline: true,
  },
];

/** Outils de la catégorie Tracking (interrupteur + identifiant). */
type TrackerKey = "googleAnalyticsId" | "googleTagManagerId" | "googleAdsId" | "metaPixelId";

const TRACKER_CARDS: {
  key: TrackerKey;
  icon: string;
  title: string;
  description: string;
  placeholder: string;
  error: string;
}[] = [
  {
    key: "googleAnalyticsId",
    icon: "📈",
    title: "Google Analytics",
    description: "Mesure d'audience via la balise Google.",
    placeholder: "G-XXXXXXXXXX",
    error: "Renseignez un identifiant Google Analytics. Exemple : G-XXXXXXXXXX.",
  },
  {
    key: "googleTagManagerId",
    icon: "🏷️",
    title: "Google Tag Manager",
    description: "Charge votre conteneur GTM selon le mode de bandeau choisi.",
    placeholder: "GTM-XXXXXXX",
    error: "Renseignez un identifiant Google Tag Manager. Exemple : GTM-XXXXXXX.",
  },
  {
    key: "googleAdsId",
    icon: "📣",
    title: "Google Ads",
    description: "Mesure des conversions et remarketing Google Ads.",
    placeholder: "AW-1234567890",
    error: "Renseignez un identifiant Google Ads. Exemple : AW-1234567890.",
  },
  {
    key: "metaPixelId",
    icon: "✨",
    title: "Meta Pixel",
    description: "Suivi publicitaire et audiences personnalisées Meta.",
    placeholder: "123456789012345",
    error: "Renseignez un identifiant Meta Pixel (chiffres uniquement).",
  },
];

/** Aperçus « Typo » — mêmes polices que les sites publics (chargées au layout). */
const FONT_CHOICES: { value: FontPreset; label: string; family: string; bodyFamily: string }[] = [
  {
    value: "chaleureux",
    label: "Chaleureux",
    family: "'Lora', Georgia, serif",
    bodyFamily: "'Open Sans', 'Segoe UI', sans-serif",
  },
  {
    value: "elegant",
    label: "Élégant",
    family: "'Playfair Display', Georgia, serif",
    bodyFamily: "'Lato', 'Segoe UI', sans-serif",
  },
  {
    value: "moderne",
    label: "Moderne",
    family: "'Figtree', system-ui, sans-serif",
    bodyFamily: "'Inter', system-ui, sans-serif",
  },
  {
    value: "classique",
    label: "Classique",
    family: "'Libre Baskerville', Georgia, serif",
    bodyFamily: "'Source Sans 3', 'Segoe UI', sans-serif",
  },
];

const INTENSITY_CHOICES: { value: ThemeIntensity; label: string }[] = [
  { value: "pastel", label: "Pastel" },
  { value: "naturel", label: "Naturel" },
  { value: "intense", label: "Intense" },
];

const CORNER_CHOICES: { value: ThemeCorners; label: string; radius: string }[] = [
  { value: "rond", label: "Tout en rondeur", radius: "999px" },
  { value: "adouci", label: "Adouci", radius: "10px" },
  { value: "equilibre", label: "Équilibré", radius: "6px" },
  { value: "net", label: "Droit et net", radius: "2px" },
];

const AMBIANCE_CHOICES: { value: ThemeAmbiance; label: string; caption: string }[] = [
  { value: "naturel", label: "Naturel", caption: "Courbes douces et textures" },
  { value: "structure", label: "Structuré", caption: "Lignes droites et géométrie" },
];

const THEME_SWATCHES: Record<ThemePreset, string> = {
  terracotta: "#b05038",
  caramel: "#9a6b3f",
  ambre: "#a8762b",
  rose: "#c26a7d",
  prune: "#8a5273",
  sauge: "#587c5e",
  olive: "#75793f",
  turquoise: "#3c8b83",
  ocean: "#33658a",
  marine: "#3f5873",
  lavande: "#6f5b9c",
  taupe: "#8c7767",
};

export function SiteEditor({
  site,
  city,
  phone,
  seo,
  tracking,
  googleBusiness,
  googleConnected,
  homePageId,
  homeSpecialtiesCount,
  homeSpecialtiesMax,
  notFound,
  legal: legalProp,
  social: socialProp,
  footer: footerProp,
  pages,
  selectedPage,
}: Props) {
  const router = useRouter();
  const [panel, setPanel] = useState<Panel>("contenu");
  const [sections, setSections] = useState<Section[]>(selectedPage?.sections ?? []);
  const [active, setActive] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  // Activation des pages de spécialité (optimiste, persistée côté serveur) —
  // resynchronisée quand le serveur change l'état (page créée désactivée…)
  const [disabledMotifs, setDisabledMotifs] = useState<string[]>(site.disabledMotifs);
  const disabledKey = site.disabledMotifs.join("|");
  useEffect(() => {
    setDisabledMotifs(disabledKey === "" ? [] : disabledKey.split("|"));
  }, [disabledKey]);
  // Informations légales, réseaux sociaux et pied de page (paramètres)
  const [legal, setLegal] = useState<LegalForm>(legalProp);
  const [social, setSocial] = useState<SocialForm>(socialProp);
  const [footerText, setFooterText] = useState(footerProp.text);
  const [footerDetails, setFooterDetails] = useState(footerProp.details);
  const socialErrors = FOOTER_SOCIAL_NETWORKS.filter((n) => socialUrlError(n.key, social[n.key]) !== null).map(
    (n) => n.key,
  );
  // Cabinets supplémentaires (multi-cabinets), sauvegardés avec les paramètres
  const [cabinets, setCabinets] = useState<SiteCabinet[]>(site.cabinets);
  // Icône du navigateur ("" = logo Harmony)
  const [faviconUrl, setFaviconUrl] = useState<string>(site.faviconUrl);
  // Aperçu du lien (titre/description Google + image de partage)
  const [seoTitle, setSeoTitle] = useState(seo.title);
  const [seoDescription, setSeoDescription] = useState(seo.description);
  const [shareImageUrl, setShareImageUrl] = useState(site.shareImageUrl);
  const [shareUploading, setShareUploading] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const shareInputRef = useRef<HTMLInputElement>(null);
  // Suivi : bandeau cookies + identifiants (activé = identifiant conservé à la publication)
  const [cookieBanner, setCookieBanner] = useState(tracking.cookieBanner);
  const [trackingIds, setTrackingIds] = useState<Record<TrackerKey, string>>({
    googleAnalyticsId: tracking.googleAnalyticsId,
    googleTagManagerId: tracking.googleTagManagerId,
    googleAdsId: tracking.googleAdsId,
    metaPixelId: tracking.metaPixelId,
  });
  const [trackingEnabled, setTrackingEnabled] = useState<Record<TrackerKey, boolean>>({
    googleAnalyticsId: tracking.googleAnalyticsId !== "",
    googleTagManagerId: tracking.googleTagManagerId !== "",
    googleAdsId: tracking.googleAdsId !== "",
    metaPixelId: tracking.metaPixelId !== "",
  });
  // Outils activés dont l'identifiant ne respecte pas le format attendu
  const trackingErrors = TRACKER_CARDS.filter(
    (card) =>
      trackingEnabled[card.key] && !TRACKING_ID_PATTERNS[card.key].test(trackingIds[card.key].trim()),
  ).map((card) => card.key);

  // ── Fenêtre Paramètres (modale centrée) ──────────────────────────────────
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("identite");
  const [settingsDirty, setSettingsDirty] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsFeedback, setSettingsFeedback] = useState<string | null>(null);
  // Valeurs de référence (ouverture ou dernière publication) : « Annuler » les restaure
  const settingsSnapshot = useRef<{
    siteName: string;
    bookingUrl: string;
    city: string;
    phone: string;
    logoUrl: string;
    faviconUrl: string;
    cabinets: SiteCabinet[];
    seoTitle: string;
    seoDescription: string;
    shareImageUrl: string;
    cookieBanner: boolean;
    trackingIds: Record<TrackerKey, string>;
    trackingEnabled: Record<TrackerKey, boolean>;
    legal: LegalForm;
    social: SocialForm;
    footerText: string;
    footerDetails: string;
  } | null>(null);

  /** Active/désactive une page (optimiste) ; faux si le serveur a refusé. */
  async function togglePageEnabled(slug: string, enabled: boolean): Promise<boolean> {
    setDisabledMotifs((prev) => (enabled ? prev.filter((s) => s !== slug) : [...prev, slug]));
    const result = await setMotifPageEnabled({ slug, enabled });
    if (result.error) {
      // Retour arrière si le serveur a refusé
      setDisabledMotifs((prev) => (enabled ? [...prev, slug] : prev.filter((s) => s !== slug)));
      return false;
    }
    setPreviewKey((k) => k + 1); // cartes de l'accueil et navigation changent
    router.refresh();
    return true;
  }
  const [previewKey, setPreviewKey] = useState(0);
  const [feedback, setFeedback] = useState<string | null>(null);

  // ── Aperçu : cible (page, page légale, 404) et largeur ───────────────────
  const [previewTarget, setPreviewTarget] = useState<PreviewTarget>(() => previewTargetForPage(selectedPage));
  const [previewWidth, setPreviewWidth] = useState<PreviewWidth>("desktop");
  // Section héritée de l'accueil (avis, contact) cliquée dans l'aperçu d'une autre page
  const [sharedNotice, setSharedNotice] = useState<SectionType | null>(null);
  // Interrupteur de visibilité mis en évidence après un clic sur une barre « Section masquée »
  const [highlightVisibility, setHighlightVisibility] = useState<number | null>(null);
  useEffect(() => {
    if (highlightVisibility === null) return;
    const timer = setTimeout(() => setHighlightVisibility(null), 2500);
    return () => clearTimeout(timer);
  }, [highlightVisibility]);

  // Pages en génération : sondage toutes les 5 s jusqu'à la fin (une entrée
  // périmée ou orpheline — page supprimée — n'entretient pas le sondage)
  const generatingSlugs = site.generatingMotifs
    .filter((g) => !g.error && pages.some((p) => p.slug === g.slug))
    .map((g) => `${g.slug}@${g.startedAt}`)
    .join(",");
  useEffect(() => {
    if (generatingSlugs === "") return;
    const live = () =>
      site.generatingMotifs.some(
        (g) => !isGenerationStale(g) && pages.some((p) => p.slug === g.slug),
      );
    if (!live()) return;
    const timer = setInterval(() => {
      if (live()) router.refresh();
    }, 5000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `generatingSlugs` résume site.generatingMotifs et pages
  }, [generatingSlugs, router]);

  // Garde : modifications non publiées → avertissement avant de quitter l'onglet
  const [settingsDirtyForGuard, setSettingsDirtyForGuard] = useState(false);
  const anyDirty = dirty || settingsDirtyForGuard;
  useEffect(() => {
    if (!anyDirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [anyDirty]);

  /** Confirmation avant de perdre les modifications non publiées de la page. */
  function confirmLeavePage(): boolean {
    if (!dirty) return true;
    return window.confirm(
      "Des modifications de cette page ne sont pas publiées et seront perdues. Changer de page quand même ?",
    );
  }

  /** Ouvre une page dans l'éditeur (navigation `?page=`). */
  function goToPage(page: EditorPageRef, section?: SectionType) {
    if (page.id === selectedPage?.id && !section) {
      setPreviewTarget(previewTargetForPage(page));
      setPanel("contenu");
      return;
    }
    if (!confirmLeavePage()) return;
    router.push(`/editor?page=${page.id}${section ? `&section=${section}` : ""}`);
  }

  /** Affiche une page légale ou la page introuvable dans l'aperçu (sans quitter la page éditée). */
  function showInPreview(target: PreviewTarget) {
    if (dirty) {
      const label =
        target.kind === "legal"
          ? `« ${LEGAL_PAGES.find((p) => p.slug === target.slug)?.title ?? "cette page"} »`
          : "la page introuvable";
      const ok = window.confirm(
        `Des modifications de cette page ne sont pas publiées. Afficher ${label} dans l'aperçu quand même ? Vos modifications restent disponibles dans le panneau Contenu.`,
      );
      if (!ok) return;
    }
    setPreviewTarget(target);
  }

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const siteOrigin = useMemo(() => new URL(site.url).origin, [site.url]);

  // Style & paramètres
  const [styleTab, setStyleTab] = useState<StyleTab>("couleur");
  const [themePreset, setThemePreset] = useState(site.themePreset);
  const [fontPreset, setFontPreset] = useState(site.fontPreset);
  const [intensity, setIntensity] = useState(site.intensity);
  const [corners, setCorners] = useState(site.corners);
  const [ambiance, setAmbiance] = useState(site.ambiance);
  const [siteName, setSiteName] = useState(site.name);
  const [bookingUrl, setBookingUrl] = useState(site.bookingUrl);
  const [cityValue, setCityValue] = useState(city);
  const [phoneValue, setPhoneValue] = useState(phone);
  const [logoUrl, setLogoUrl] = useState(site.logoUrl);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Fiche Google (recherche + connexion)
  const [gBusiness, setGBusiness] = useState(googleBusiness);
  const [gQuery, setGQuery] = useState("");
  const [gResults, setGResults] = useState<
    { placeId: string; name: string; address: string; rating: number; reviewCount: number }[]
  >([]);
  const [gSearching, setGSearching] = useState(false);
  const [gStatus, setGStatus] = useState<string | null>(null);
  const gTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  function onGoogleQueryChange(value: string) {
    setGQuery(value);
    setGStatus(null);
    clearTimeout(gTimer.current);
    if (value.trim().length < 3) {
      setGResults([]);
      return;
    }
    gTimer.current = setTimeout(() => {
      setGSearching(true);
      searchGoogle(value)
        .then(setGResults)
        .finally(() => setGSearching(false));
    }, 350);
  }

  async function onConnectPlace(place: {
    placeId: string;
    name: string;
    address: string;
    rating: number;
    reviewCount: number;
  }) {
    setGStatus(null);
    const result = await connectGooglePlace(place);
    if (result.error) {
      setGStatus(result.error);
      return;
    }
    setGBusiness({
      name: place.name,
      address: place.address,
      rating: place.rating,
      reviewCount: place.reviewCount,
    });
    setGQuery("");
    setGResults([]);
    setGStatus("Fiche reliée — les avis Google du site sont synchronisés.");
    setPreviewKey((k) => k + 1);
  }

  async function uploadLogo(file: File) {
    setLogoUploading(true);
    setLogoError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/upload", { method: "POST", body: form });
      const data = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !data.url) {
        setLogoError(data.error ?? "Téléversement impossible");
        return;
      }
      setLogoUrl(data.url);
      setSettingsDirty(true);
    } catch {
      setLogoError("Téléversement impossible — réessayez.");
    } finally {
      setLogoUploading(false);
      if (logoInputRef.current) logoInputRef.current.value = "";
    }
  }

  async function uploadShareImage(file: File) {
    setShareUploading(true);
    setShareError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/upload", { method: "POST", body: form });
      const data = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !data.url) {
        setShareError(data.error ?? "Téléversement impossible");
        return;
      }
      setShareImageUrl(data.url);
      setSettingsDirty(true);
    } catch {
      setShareError("Téléversement impossible — réessayez.");
    } finally {
      setShareUploading(false);
      if (shareInputRef.current) shareInputRef.current.value = "";
    }
  }

  function currentSettingsSnapshot() {
    return {
      siteName,
      bookingUrl,
      city: cityValue,
      phone: phoneValue,
      logoUrl,
      faviconUrl,
      cabinets,
      seoTitle,
      seoDescription,
      shareImageUrl,
      cookieBanner,
      trackingIds,
      trackingEnabled,
      legal,
      social,
      footerText,
      footerDetails,
    };
  }

  function openSettings(tab?: SettingsTab) {
    settingsSnapshot.current = currentSettingsSnapshot();
    setSettingsFeedback(null);
    setSettingsDirty(false);
    if (tab) setSettingsTab(tab);
    setSettingsOpen(true);
  }

  // La garde beforeunload suit l'état « modifié » des paramètres
  useEffect(() => {
    setSettingsDirtyForGuard(settingsOpen && settingsDirty);
  }, [settingsOpen, settingsDirty]);

  // Paramètres de l'URL au montage : `?section=<type>` ouvre la première
  // section de ce type ; `?surface=settings&tab=<id>` ouvre les Paramètres.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sectionType = params.get("section");
    if (sectionType) {
      const index = sections.findIndex((s) => s.type === sectionType);
      if (index >= 0) {
        setPanel("contenu");
        setActive(index);
        setTimeout(() => cardRefs.current[index]?.scrollIntoView({ block: "nearest" }), 50);
      }
    }
    if (params.get("surface") === "settings") {
      const tab = params.get("tab");
      openSettings(isSettingsTab(tab) ? tab : undefined);
    }
    // Lecture unique au montage (l'état initial vient du serveur)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // L'URL reflète la fenêtre Paramètres ouverte (onglet) — sans toucher à `?page=`
  useEffect(() => {
    const url = new URL(window.location.href);
    if (settingsOpen) {
      url.searchParams.set("surface", "settings");
      url.searchParams.set("tab", settingsTab);
    } else {
      url.searchParams.delete("surface");
      url.searchParams.delete("tab");
    }
    const next = `${url.pathname}${url.search}${url.hash}`;
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (next !== current) window.history.replaceState(window.history.state, "", next);
  }, [settingsOpen, settingsTab]);

  /** Ferme la fenêtre en abandonnant les modifications non publiées. */
  const cancelSettings = useCallback(() => {
    const snap = settingsSnapshot.current;
    if (snap) {
      setSiteName(snap.siteName);
      setBookingUrl(snap.bookingUrl);
      setCityValue(snap.city);
      setPhoneValue(snap.phone);
      setLogoUrl(snap.logoUrl);
      setFaviconUrl(snap.faviconUrl);
      setCabinets(snap.cabinets);
      setSeoTitle(snap.seoTitle);
      setSeoDescription(snap.seoDescription);
      setShareImageUrl(snap.shareImageUrl);
      setCookieBanner(snap.cookieBanner);
      setTrackingIds(snap.trackingIds);
      setTrackingEnabled(snap.trackingEnabled);
      setLegal(snap.legal);
      setSocial(snap.social);
      setFooterText(snap.footerText);
      setFooterDetails(snap.footerDetails);
    }
    setSettingsDirty(false);
    setSettingsFeedback(null);
    setSettingsOpen(false);
  }, []);

  // Échap ferme la fenêtre Paramètres (comme « Annuler »)
  useEffect(() => {
    if (!settingsOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") cancelSettings();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [settingsOpen, cancelSettings]);

  async function onSaveSettings() {
    if (trackingErrors.length > 0) {
      setSettingsTab("tracking");
      setSettingsFeedback("Corrigez le format des identifiants de tracking avant de publier.");
      return;
    }
    if (socialErrors.length > 0) {
      setSettingsTab("social");
      setSettingsFeedback("Corrigez les liens des réseaux sociaux avant de publier.");
      return;
    }
    setSettingsSaving(true);
    setSettingsFeedback(null);
    const result = await saveSiteSettings({
      name: siteName,
      bookingUrl,
      city: cityValue,
      logoUrl,
      phone: phoneValue,
      cabinets,
      faviconUrl,
      seoTitle,
      seoDescription,
      seoImageUrl: shareImageUrl,
      tracking: {
        cookieBanner,
        googleAnalyticsId: trackingEnabled.googleAnalyticsId ? trackingIds.googleAnalyticsId.trim() : "",
        googleTagManagerId: trackingEnabled.googleTagManagerId
          ? trackingIds.googleTagManagerId.trim()
          : "",
        googleAdsId: trackingEnabled.googleAdsId ? trackingIds.googleAdsId.trim() : "",
        metaPixelId: trackingEnabled.metaPixelId ? trackingIds.metaPixelId.trim() : "",
      },
      legal,
      social,
      footer: { text: footerText, details: footerDetails },
    });
    setSettingsSaving(false);
    if (result.error) {
      setSettingsFeedback(result.error);
      return;
    }
    // Garde l'état local du panneau Contenu aligné : si la page d'accueil y
    // est chargée, sa section contact reflète le numéro fraîchement publié.
    if (selectedPage?.type === "home") {
      setSections((prev) =>
        prev.map((s) => (s.type === "contact" ? { ...s, phone: phoneValue.trim() || undefined } : s)),
      );
    }
    // « Annuler » après publication ne doit pas revenir en deçà de la publication
    settingsSnapshot.current = currentSettingsSnapshot();
    setSettingsDirty(false);
    setSettingsFeedback("Publié ✓ — votre site est à jour.");
    setPreviewKey((k) => k + 1);
    router.refresh();
  }

  // ?apercu=<jeton signé> : l'aperçu affiche la démo même expirée, les pages
  // désactivées et la page introuvable (vérifié côté sites par le middleware)
  const previewSrc = useMemo(
    () => `${site.url}${previewPath(previewTarget, site.previewToken)}`,
    [site.url, previewTarget, site.previewToken],
  );
  const previewLabel = useMemo(() => {
    switch (previewTarget.kind) {
      case "home":
        return "Page d'accueil";
      case "motif":
        return pages.find((p) => p.slug === previewTarget.slug && p.type === "motif")?.title ?? previewTarget.slug;
      case "legal":
        return LEGAL_PAGES.find((p) => p.slug === previewTarget.slug)?.title ?? "Page légale";
      case "notFound":
        return "Page introuvable (404)";
    }
  }, [previewTarget, pages]);
  const currentPageTitle =
    selectedPage?.type === "home"
      ? "Page d'accueil"
      : (pages.find((p) => p.id === selectedPage?.id)?.title ?? "Choisir une page");

  const activeSettingsLabel =
    SETTINGS_NAV.flatMap((g) => g.items).find((i) => i.id === settingsTab)?.label ?? "";

  // ── Pont avec l'aperçu (EditorBridge côté site public) ────────────────────
  // Style en cours de prévisualisation (non publié) : réappliqué à chaque
  // rechargement de l'iframe pour que l'aperçu reste fidèle aux choix.
  const pendingThemeMsg = useRef<Record<string, unknown> | null>(null);

  /** Applique immédiatement un choix de style dans l'aperçu (avant publication). */
  function previewTheme(
    patch: Partial<{
      preset: ThemePreset;
      fontPreset: FontPreset;
      intensity: ThemeIntensity;
      corners: ThemeCorners;
      ambiance: ThemeAmbiance;
    }>,
  ) {
    const next = { preset: themePreset, fontPreset, intensity, corners, ambiance, ...patch };
    const message = {
      type: "hy:theme",
      vars: themeCssVars({ ...next, palette: site.palette }),
      ambiance: next.ambiance,
    };
    pendingThemeMsg.current = message;
    iframeRef.current?.contentWindow?.postMessage(message, siteOrigin);
  }

  // Zone d'aperçu mesurée (ResizeObserver) : en mode Ordinateur, le site est
  // rendu à DESKTOP_PREVIEW_WIDTH puis réduit pour tenir dans le panneau
  const previewBoxRef = useRef<HTMLDivElement>(null);
  const [previewBox, setPreviewBox] = useState<{ width: number; height: number } | null>(null);
  useEffect(() => {
    const el = previewBoxRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) setPreviewBox({ width: rect.width, height: rect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const desktopScale =
    previewWidth === "desktop" && previewBox && previewBox.width > 0 && previewBox.width < DESKTOP_PREVIEW_WIDTH
      ? previewBox.width / DESKTOP_PREVIEW_WIDTH
      : 1;

  // Pont annoncé jusqu'à l'accusé de réception `hy:ready` du site : son
  // hydratation peut suivre l'événement load de plusieurs secondes (réseau
  // lent, premier chargement)
  const bridgeReady = useRef(false);
  const announceTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  function announceEditor() {
    bridgeReady.current = false;
    if (announceTimer.current) clearInterval(announceTimer.current);
    const send = () => {
      iframeRef.current?.contentWindow?.postMessage({ type: "hy:hello" }, siteOrigin);
      if (pendingThemeMsg.current) {
        iframeRef.current?.contentWindow?.postMessage(pendingThemeMsg.current, siteOrigin);
      }
    };
    send();
    let tries = 0;
    announceTimer.current = setInterval(() => {
      if (bridgeReady.current || ++tries >= 50) {
        if (announceTimer.current) clearInterval(announceTimer.current);
        announceTimer.current = null;
        return;
      }
      send();
    }, 600);
  }

  useEffect(
    () => () => {
      if (announceTimer.current) clearInterval(announceTimer.current);
    },
    [],
  );

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== siteOrigin) return;
      const data = event.data as
        | { type?: string; index?: number; hidden?: boolean; shared?: string }
        | null;
      if (data?.type === "hy:ready") {
        bridgeReady.current = true;
        return;
      }
      if (data?.type !== "hy:select") return;
      // Section héritée de l'accueil (avis, contact) sur une page de spécialité
      if (typeof data.shared === "string") {
        if (isSectionType(data.shared)) {
          setPanel("contenu");
          setSharedNotice(data.shared);
        }
        return;
      }
      if (typeof data.index === "number") {
        const index = data.index;
        setPanel("contenu");
        setSharedNotice(null);
        setActive(index);
        // Barre « Section masquée » cliquée : on montre où la réafficher
        if (data.hidden === true) setHighlightVisibility(index);
        requestAnimationFrame(() =>
          cardRefs.current[index]?.scrollIntoView({ behavior: "smooth", block: "nearest" }),
        );
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [siteOrigin]);

  function selectSection(index: number) {
    setActive(index);
    iframeRef.current?.contentWindow?.postMessage({ type: "hy:focus", index }, siteOrigin);
  }

  function updateSection(index: number, patch: Partial<Section>) {
    setSections((prev) => prev.map((s, i) => (i === index ? ({ ...s, ...patch } as Section) : s)));
    setDirty(true);
  }

  async function onSave() {
    if (panel === "pages") return;
    setSaving(true);
    setFeedback(null);
    let result: { error?: string } = {};
    if (panel === "contenu" && selectedPage) {
      result = await savePageSections({ pageId: selectedPage.id, sections });
    } else if (panel === "style") {
      result = await saveSiteStyle({ preset: themePreset, fontPreset, intensity, corners, ambiance });
    }
    setSaving(false);
    if (result.error) {
      setFeedback(result.error);
      return;
    }
    // Style publié : la prévisualisation devient l'état réel du site
    if (panel === "style") pendingThemeMsg.current = null;
    setDirty(false);
    setFeedback("Publié ✓ — votre site est à jour.");
    setPreviewKey((k) => k + 1);
    router.refresh();
  }

  return (
    <>
      {/* ── Barre supérieure ─────────────────────────────────────────────── */}
      <header className="flex items-center justify-between gap-4 border-b border-cream-300 bg-white px-4 py-2.5">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-full bg-cream-100 px-4 py-1.5 text-sm font-medium text-ink-700 hover:bg-cream-200"
          >
            ← Accueil
          </Link>
          <button
            type="button"
            onClick={() => setPanel("pages")}
            aria-label={`Page éditée : ${currentPageTitle} — ouvrir le panneau Pages`}
            title="Ouvrir le panneau Pages"
            className="flex max-w-72 items-center gap-2 rounded-xl border border-ink-300 bg-white px-3 py-1.5 text-sm hover:border-primary-400"
          >
            <span aria-hidden>📄</span>
            <span className="truncate">{currentPageTitle}</span>
            {dirty ? (
              <span
                aria-label="Modifications non publiées"
                title="Modifications non publiées"
                className="h-2 w-2 shrink-0 rounded-full bg-amber-500"
              />
            ) : null}
          </button>
        </div>

        <div className="flex items-center gap-2">
          <PanelTab label="Pages" active={panel === "pages"} onClick={() => setPanel("pages")} />
          <PanelTab label="Contenu" active={panel === "contenu"} onClick={() => setPanel("contenu")} />
          <PanelTab label="🎨 Style" active={panel === "style"} onClick={() => setPanel("style")} />
          <PanelTab label="⚙ Paramètres" active={settingsOpen} onClick={() => openSettings()} />
          <a
            href={site.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full bg-primary-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-primary-600"
          >
            ↗ Voir mon site
          </a>
        </div>
      </header>

      {/* ── Panneau + prévisualisation ───────────────────────────────────── */}
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-96 shrink-0 flex-col border-r border-cream-300 bg-white">
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {panel === "pages" ? (
              <PagesPanel
                pages={pages}
                selectedPageId={selectedPage?.id ?? null}
                previewTarget={previewTarget}
                disabledMotifs={disabledMotifs}
                generatingMotifs={site.generatingMotifs}
                plan={site.plan}
                homeSpecialtiesCount={homeSpecialtiesCount}
                homeSpecialtiesMax={homeSpecialtiesMax}
                notFound={notFound}
                onSelectPage={goToPage}
                onPreview={showInPreview}
                onToggle={togglePageEnabled}
                onOpenSettings={(tab) => openSettings(tab)}
                onRenamed={(slug, title) => {
                  // Carte de l'accueil chargée dans le panneau Contenu : titre aligné
                  setSections((prev) =>
                    prev.map((s) =>
                      s.type === "specialties"
                        ? { ...s, items: s.items.map((it) => (it.slug === slug ? { ...it, title } : it)) }
                        : s,
                    ),
                  );
                  setPreviewKey((k) => k + 1);
                  router.refresh();
                }}
                onChanged={() => {
                  setPreviewKey((k) => k + 1);
                  router.refresh();
                }}
                onDeleted={(page) => {
                  if (page.id === selectedPage?.id) {
                    router.push("/editor");
                    return;
                  }
                  if (previewTarget.kind === "motif" && previewTarget.slug === page.slug) {
                    setPreviewTarget({ kind: "home" });
                  }
                  setPreviewKey((k) => k + 1);
                  router.refresh();
                }}
              />
            ) : null}

            {panel === "contenu" ? (
              selectedPage?.generating ? (
                <div className="rounded-2xl border border-cream-300 bg-cream-50 p-4 text-sm text-ink-700">
                  <p className="flex items-center gap-2 font-semibold">
                    <Spinner /> Page en préparation…
                  </p>
                  <p className="mt-1 text-xs text-ink-500">
                    Le contenu de cette page est en cours de rédaction (environ une minute). Ses sections
                    seront modifiables dès qu&apos;il sera prêt — vous pouvez suivre l&apos;avancement
                    dans le panneau Pages.
                  </p>
                </div>
              ) : sections.length > 0 ? (
                <div className="space-y-2">
                  {sharedNotice ? (
                    <div
                      role="status"
                      className="mb-3 flex items-start gap-2 rounded-xl border border-primary-200 bg-primary-50 px-3 py-2 text-xs text-ink-700"
                    >
                      <span aria-hidden>ℹ️</span>
                      <div className="min-w-0 flex-1">
                        <p>
                          Cette section (<strong>{SECTION_LABELS[sharedNotice]}</strong>) est partagée avec la
                          page d&apos;accueil : son contenu se modifie depuis l&apos;accueil.
                        </p>
                        {homePageId ? (
                          <button
                            type="button"
                            onClick={() => {
                              const home = pages.find((p) => p.id === homePageId);
                              if (home) goToPage(home, sharedNotice);
                            }}
                            className="mt-1 font-medium text-primary-600 hover:underline"
                          >
                            Modifier sur l&apos;accueil →
                          </button>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        aria-label="Fermer ce message"
                        onClick={() => setSharedNotice(null)}
                        className="shrink-0 rounded-full px-1 text-ink-500 hover:text-ink-900"
                      >
                        ✕
                      </button>
                    </div>
                  ) : null}
                  <p className="mb-3 rounded-xl bg-cream-100 px-3 py-2 text-xs text-ink-500">
                    💡 Cliquez sur une section de l&apos;aperçu à droite pour l&apos;ouvrir ici,
                    puis modifiez textes et photos. L&apos;interrupteur masque une section sans
                    perdre son contenu.
                  </p>
                  {sections.map((section, i) => {
                    const visible = isSectionVisible(section);
                    const label = SECTION_LABELS[section.type];
                    return (
                      <div
                        key={`${section.type}-${i}`}
                        ref={(el) => {
                          cardRefs.current[i] = el;
                        }}
                        data-section-type={section.type}
                        data-section-hidden={visible ? undefined : "true"}
                        className={clsx(
                          "rounded-2xl border transition-colors",
                          active === i ? "border-primary-400 shadow-sm" : "border-cream-300",
                          !visible && "bg-cream-50",
                        )}
                      >
                        <div className={clsx("flex items-center gap-2 py-2 pl-3 pr-3", !visible && "opacity-70")}>
                          <button
                            type="button"
                            onClick={() => selectSection(i)}
                            aria-expanded={active === i}
                            className="flex min-w-0 flex-1 items-center gap-2 py-1 text-left text-sm font-semibold"
                          >
                            <span aria-hidden className="w-3 text-ink-500">
                              {active === i ? "−" : "+"}
                            </span>
                            <span className="truncate">{label}</span>
                            {!visible ? <Badge tone="neutral">Masquée</Badge> : null}
                          </button>
                          <span
                            className={clsx(
                              "flex shrink-0 items-center rounded-full p-0.5 transition-shadow",
                              highlightVisibility === i && "animate-pulse ring-2 ring-amber-400 ring-offset-1",
                            )}
                          >
                            <ToggleSwitch
                              size="sm"
                              checked={visible}
                              label={`Visible sur cette page : ${label}`}
                              onChange={(next) => updateSection(i, { hidden: !next })}
                            />
                          </span>
                        </div>
                        {active === i ? (
                          <div className={clsx("border-t border-cream-200 p-4", !visible && "opacity-75")}>
                            {!visible ? (
                              <p className="mb-3 rounded-xl bg-cream-100 px-3 py-2 text-xs text-ink-500">
                                Cette section est masquée : elle n&apos;apparaît pas sur le site public.
                                Réactivez l&apos;interrupteur « Visible sur cette page » pour l&apos;afficher.
                              </p>
                            ) : null}
                            <SectionFields
                              section={section}
                              googleConnected={googleConnected || gBusiness !== null}
                              onChange={(patch) => updateSection(i, patch)}
                              onPageRegenerated={() => {
                                setPreviewKey((k) => k + 1);
                                router.refresh();
                              }}
                            />
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="p-4 text-sm text-ink-500">Aucune section éditable sur cette page.</p>
              )
            ) : null}

            {panel === "style" ? (
              <div className="space-y-5">
                <div className="flex gap-1 rounded-full bg-cream-100 p-1">
                  {(
                    [
                      ["couleur", "🎨 Couleur"],
                      ["typo", "T Typo"],
                      ["forme", "◫ Style"],
                    ] as [StyleTab, string][]
                  ).map(([tab, label]) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setStyleTab(tab)}
                      className={clsx(
                        "flex-1 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                        styleTab === tab ? "bg-white text-ink-900 shadow-sm" : "text-ink-500",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {styleTab === "couleur" ? (
                  <>
                    <div>
                      <p className="text-sm font-semibold">Couleur du site</p>
                      <div className="mt-2 grid grid-cols-6 gap-2">
                        {THEME_PRESETS.map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            title={preset}
                            aria-pressed={themePreset === preset}
                            onClick={() => {
                              setThemePreset(preset);
                              setDirty(true);
                              previewTheme({ preset });
                            }}
                            className={clsx(
                              "h-10 w-10 rounded-xl border-2 transition-transform",
                              themePreset === preset ? "scale-110 border-ink-900" : "border-transparent",
                            )}
                            style={{ background: THEME_SWATCHES[preset] }}
                          />
                        ))}
                      </div>
                      <p className="mt-2 text-xs capitalize text-ink-500">{themePreset}</p>
                    </div>
                    <div>
                      <p className="text-sm font-semibold">Intensité</p>
                      <div className="mt-2 grid grid-cols-3 gap-2">
                        {INTENSITY_CHOICES.map((choice) => (
                          <button
                            key={choice.value}
                            type="button"
                            aria-pressed={intensity === choice.value}
                            onClick={() => {
                              setIntensity(choice.value);
                              setDirty(true);
                              previewTheme({ intensity: choice.value });
                            }}
                            className={clsx(
                              "flex flex-col items-center gap-1.5 rounded-2xl border p-3 text-xs font-medium",
                              intensity === choice.value
                                ? "border-ink-900 bg-cream-100"
                                : "border-cream-300 hover:bg-cream-50",
                            )}
                          >
                            <span
                              aria-hidden
                              className="h-6 w-6 rounded-lg"
                              style={{
                                background: THEME_SWATCHES[themePreset],
                                opacity:
                                  choice.value === "pastel" ? 0.35 : choice.value === "naturel" ? 0.65 : 1,
                              }}
                            />
                            {choice.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                ) : null}

                {styleTab === "typo" ? (
                  <div className="grid grid-cols-2 gap-2">
                    {FONT_CHOICES.map((choice) => (
                      <button
                        key={choice.value}
                        type="button"
                        aria-pressed={fontPreset === choice.value}
                        onClick={() => {
                          setFontPreset(choice.value);
                          setDirty(true);
                          previewTheme({ fontPreset: choice.value });
                        }}
                        className={clsx(
                          "rounded-2xl border p-4 text-center",
                          fontPreset === choice.value
                            ? "border-ink-900 bg-cream-100"
                            : "border-cream-300 hover:bg-cream-50",
                        )}
                      >
                        <span className="block text-xl leading-tight" style={{ fontFamily: choice.family }}>
                          Votre cabinet
                        </span>
                        <span
                          className="mt-1 block text-[0.8rem] leading-snug text-ink-700"
                          style={{ fontFamily: choice.bodyFamily }}
                        >
                          Un espace pour souffler
                        </span>
                        <span className="mt-1.5 block text-xs text-ink-500">{choice.label}</span>
                      </button>
                    ))}
                  </div>
                ) : null}

                {styleTab === "forme" ? (
                  <>
                    <div>
                      <p className="text-sm font-semibold">Forme des coins</p>
                      <div className="mt-2 grid grid-cols-4 gap-2">
                        {CORNER_CHOICES.map((choice) => (
                          <button
                            key={choice.value}
                            type="button"
                            aria-pressed={corners === choice.value}
                            title={choice.label}
                            onClick={() => {
                              setCorners(choice.value);
                              setDirty(true);
                              previewTheme({ corners: choice.value });
                            }}
                            className={clsx(
                              "flex flex-col items-center gap-1.5 rounded-2xl border p-2.5 text-[10px] font-medium leading-tight",
                              corners === choice.value
                                ? "border-ink-900 bg-cream-100"
                                : "border-cream-300 hover:bg-cream-50",
                            )}
                          >
                            <span
                              aria-hidden
                              className="h-6 w-6 border-2 border-ink-500 bg-white"
                              style={{ borderRadius: choice.radius }}
                            />
                            {choice.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-sm font-semibold">Ambiance</p>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        {AMBIANCE_CHOICES.map((choice) => (
                          <button
                            key={choice.value}
                            type="button"
                            aria-pressed={ambiance === choice.value}
                            onClick={() => {
                              setAmbiance(choice.value);
                              setDirty(true);
                              previewTheme({ ambiance: choice.value });
                            }}
                            className={clsx(
                              "rounded-2xl border p-3 text-left",
                              ambiance === choice.value
                                ? "border-ink-900 bg-cream-100"
                                : "border-cream-300 hover:bg-cream-50",
                            )}
                          >
                            <span className="block text-sm font-semibold">{choice.label}</span>
                            <span className="mt-0.5 block text-xs text-ink-500">{choice.caption}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                ) : null}
              </div>
            ) : null}
          </div>

          {panel !== "pages" ? (
            <div className="border-t border-cream-300 p-4">
              {feedback ? (
                <p className={clsx("mb-2 text-xs", feedback.startsWith("Publié") ? "text-success-500" : "text-danger-500")}>
                  {feedback}
                </p>
              ) : null}
              <Button onClick={onSave} disabled={saving || (!dirty && panel === "contenu")} className="w-full">
                {saving ? <Spinner className="text-white" /> : null}
                {saving ? "Publication…" : "Enregistrer et publier"}
              </Button>
            </div>
          ) : (
            <p className="border-t border-cream-300 px-4 py-3 text-xs text-ink-500">
              Une page désactivée n&apos;apparaît plus sur votre site (carte, menu, Google) mais reste
              éditable ici.
            </p>
          )}
        </aside>

        <div className="flex min-w-0 flex-1 flex-col bg-cream-200">
          <div className="flex items-center justify-between gap-3 px-4 pt-3">
            <p className="min-w-0 truncate text-xs text-ink-500">
              Aperçu : <span className="font-medium text-ink-700">{previewLabel}</span>
            </p>
            <Segmented
              aria-label="Largeur de l'aperçu"
              options={PREVIEW_WIDTH_OPTIONS}
              value={previewWidth}
              onChange={setPreviewWidth}
              className="shrink-0 bg-white/70"
            />
          </div>
          <div
            ref={previewBoxRef}
            className={clsx(
              "flex min-h-0 flex-1 overflow-hidden p-4",
              desktopScale < 1 ? "justify-start" : "justify-center",
            )}
          >
            {/* Ordinateur : rendu à 1280 px puis réduit à l'échelle du panneau,
                sinon le site passerait en version mobile (menu hamburger) dès
                que la zone d'aperçu est plus étroite que 1024 px */}
            <iframe
              key={previewKey}
              ref={iframeRef}
              src={previewSrc}
              title="Prévisualisation de votre site"
              onLoad={announceEditor}
              data-preview-width={previewWidth}
              data-preview-scale={desktopScale < 1 ? desktopScale.toFixed(3) : undefined}
              style={
                desktopScale < 1 && previewBox
                  ? {
                      width: DESKTOP_PREVIEW_WIDTH,
                      height: previewBox.height / desktopScale,
                      transform: `scale(${desktopScale})`,
                      transformOrigin: "top left",
                      flex: "none",
                    }
                  : { width: PREVIEW_WIDTHS[previewWidth] ?? "100%", maxWidth: "100%" }
              }
              className={clsx(
                "rounded-2xl border border-cream-300 bg-white shadow-card transition-[width] duration-300",
                desktopScale < 1 ? "" : "h-full",
              )}
            />
          </div>
        </div>
      </div>

      {/* ── Fenêtre Paramètres (modale centrée, quasi pleine page) ─────────── */}
      {settingsOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/50 p-4 sm:p-10"
          onMouseDown={(e) => {
            // Clic sur le fond : ferme seulement s'il n'y a rien à perdre
            if (e.target === e.currentTarget && !settingsDirty) cancelSettings();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Paramètres du site"
            className="flex h-full max-h-[860px] w-full max-w-5xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between gap-4 border-b border-cream-200 px-6 py-4">
              <p className="flex items-center gap-3 text-lg font-semibold">
                Paramètres
                {trackingErrors.length > 0 || socialErrors.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => setSettingsTab(trackingErrors.length > 0 ? "tracking" : "social")}
                    className="inline-flex items-center gap-1 rounded-full border border-warning-500/50 bg-warning-100 px-2.5 py-0.5 text-xs font-medium text-warning-500"
                  >
                    ⚠ Format à corriger
                  </button>
                ) : null}
                <span aria-hidden className="h-5 w-px bg-cream-300" />
                <span className="text-base font-normal text-ink-500">{activeSettingsLabel}</span>
              </p>
              <button
                type="button"
                onClick={cancelSettings}
                aria-label="Fermer les paramètres"
                className="flex h-9 w-9 items-center justify-center rounded-full text-lg text-ink-500 transition-colors hover:bg-cream-100 hover:text-ink-900"
              >
                ✕
              </button>
            </div>

            <div className="flex min-h-0 flex-1">
              <nav className="w-72 shrink-0 space-y-5 overflow-y-auto border-r border-cream-200 bg-cream-50 p-4">
                {SETTINGS_NAV.map((group) => (
                  <div key={group.group}>
                    <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-500">
                      {group.group}
                    </p>
                    <div className="space-y-1">
                      {group.items.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setSettingsTab(item.id)}
                          className={clsx(
                            "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-medium transition-colors",
                            settingsTab === item.id
                              ? "bg-primary-500 text-white"
                              : "text-ink-700 hover:bg-cream-100",
                          )}
                        >
                          <span aria-hidden>{item.icon}</span>
                          <span className="min-w-0 flex-1 truncate">{item.label}</span>
                          {(item.id === "tracking" && trackingErrors.length > 0) ||
                          (item.id === "social" && socialErrors.length > 0) ? (
                            <span
                              aria-hidden
                              className={clsx(
                                "h-2 w-2 shrink-0 rounded-full",
                                settingsTab === item.id ? "bg-white" : "bg-warning-500",
                              )}
                            />
                          ) : null}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </nav>

              <div className="min-h-0 flex-1 overflow-y-auto p-6 sm:p-8">
                {settingsTab === "identite" ? (
                  <SettingsPane
                    title="Identité"
                    description="Le nom du site apparaît dans l'en-tête, l'onglet du navigateur et les résultats Google."
                  >
                    <FieldBlock label="Nom du site">
                      <input
                        value={siteName}
                        onChange={(e) => {
                          setSiteName(e.target.value);
                          setSettingsDirty(true);
                        }}
                        className="w-full rounded-xl border border-ink-300 px-3 py-2 text-sm"
                      />
                    </FieldBlock>
                    <FieldBlock label="Ville">
                      <input
                        value={cityValue}
                        onChange={(e) => {
                          setCityValue(e.target.value);
                          setSettingsDirty(true);
                        }}
                        className="w-full max-w-xs rounded-xl border border-ink-300 px-3 py-2 text-sm"
                      />
                    </FieldBlock>
                  </SettingsPane>
                ) : null}

                {settingsTab === "logo" ? (
                  <SettingsPane
                    title="Logo"
                    description="Remplace le nom du site dans l'en-tête. PNG avec fond transparent recommandé."
                  >
                    <div>
                      {logoUrl ? (
                        <img
                          src={logoUrl}
                          alt="Logo"
                          className="mb-3 h-16 w-auto max-w-full rounded-lg border border-cream-300 bg-white object-contain p-1"
                        />
                      ) : null}
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          disabled={logoUploading}
                          onClick={() => logoInputRef.current?.click()}
                          className="rounded-full bg-primary-500 px-4 py-1.5 text-xs font-medium text-white hover:bg-primary-600 disabled:opacity-60"
                        >
                          {logoUploading ? "Envoi en cours…" : "🖼 Téléverser un logo"}
                        </button>
                        {logoUrl ? (
                          <button
                            type="button"
                            onClick={() => {
                              setLogoUrl("");
                              setSettingsDirty(true);
                            }}
                            className="rounded-full bg-cream-100 px-4 py-1.5 text-xs font-medium text-ink-700 hover:bg-cream-200"
                          >
                            Retirer (afficher le nom)
                          </button>
                        ) : null}
                      </div>
                      <input
                        ref={logoInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) void uploadLogo(file);
                        }}
                      />
                      {logoError ? <p className="mt-1 text-xs text-danger-500">{logoError}</p> : null}
                    </div>
                  </SettingsPane>
                ) : null}

                {settingsTab === "apercu" ? (
                  <SettingsPane
                    title="Aperçu du lien"
                    description="Voici comment votre site apparaît dans les résultats de recherche Google et lors d'un partage du lien (WhatsApp, réseaux sociaux…)."
                  >
                    {/* Aperçu façon résultat Google */}
                    <div className="rounded-2xl border border-cream-300 bg-white p-4 shadow-sm">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full border border-cream-300 bg-cream-100 p-1">
                              <img
                                src={
                                  faviconUrl === ""
                                    ? `${siteOrigin}/favicons/harmony.svg`
                                    : faviconUrl.startsWith("/")
                                      ? `${siteOrigin}${faviconUrl}`
                                      : faviconUrl
                                }
                                alt=""
                                className="h-full w-full rounded-full"
                              />
                            </span>
                            <span className="min-w-0 text-xs leading-tight">
                              <span className="block truncate text-ink-900">
                                {siteOrigin.replace(/^https?:\/\//, "")}
                              </span>
                              <span className="block truncate text-ink-500">{site.url}</span>
                            </span>
                          </div>
                          <p className="mt-1.5 truncate text-xl text-[#1a0dab]">
                            {seoTitle || site.name}
                          </p>
                          <p className="mt-0.5 line-clamp-2 text-sm text-ink-700">
                            {seoDescription || "Ajoutez une description pour ce résultat."}
                          </p>
                        </div>
                        {shareImageUrl || seo.heroImageUrl ? (
                          <img
                            src={shareImageUrl || seo.heroImageUrl}
                            alt=""
                            className="h-24 w-24 shrink-0 rounded-2xl object-cover"
                          />
                        ) : null}
                      </div>
                    </div>

                    <div>
                      <div className="mb-1 flex items-baseline justify-between gap-2">
                        <p className="text-sm font-medium">Titre du lien</p>
                        <span
                          className={clsx(
                            "text-xs",
                            seoTitle.length > 70 ? "text-danger-500" : "text-ink-500",
                          )}
                        >
                          {seoTitle.length}/70
                        </span>
                      </div>
                      <input
                        value={seoTitle}
                        maxLength={120}
                        onChange={(e) => {
                          setSeoTitle(e.target.value);
                          setSettingsDirty(true);
                        }}
                        className="w-full rounded-xl border border-ink-300 px-3 py-2 text-sm"
                      />
                      <p className="mt-1 text-xs text-ink-500">
                        Le titre bleu du résultat Google. Recommandé : métier + ville, 70 caractères
                        maximum.
                      </p>
                    </div>

                    <div>
                      <div className="mb-1 flex items-baseline justify-between gap-2">
                        <p className="text-sm font-medium">Description</p>
                        <span
                          className={clsx(
                            "text-xs",
                            seoDescription.length > 170 ? "text-danger-500" : "text-ink-500",
                          )}
                        >
                          {seoDescription.length}/170
                        </span>
                      </div>
                      <textarea
                        value={seoDescription}
                        maxLength={300}
                        rows={3}
                        onChange={(e) => {
                          setSeoDescription(e.target.value);
                          setSettingsDirty(true);
                        }}
                        className="w-full resize-y rounded-xl border border-ink-300 px-3 py-2 text-sm"
                      />
                      <p className="mt-1 text-xs text-ink-500">
                        Les deux lignes grises sous le titre. Recommandé : 170 caractères maximum,
                        avec une invitation à prendre rendez-vous.
                      </p>
                    </div>

                    <FieldBlock
                      label="Image de partage"
                      hint="Affichée à côté du résultat Google et en grand lors d'un partage du lien. Idéal : 1200×630 px. Sans image choisie, la photo d'accueil du site est utilisée."
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          disabled={shareUploading}
                          onClick={() => shareInputRef.current?.click()}
                          className="rounded-full bg-primary-500 px-4 py-1.5 text-xs font-medium text-white hover:bg-primary-600 disabled:opacity-60"
                        >
                          {shareUploading ? "Envoi en cours…" : "🖼 Téléverser une image"}
                        </button>
                        {shareImageUrl ? (
                          <button
                            type="button"
                            onClick={() => {
                              setShareImageUrl("");
                              setSettingsDirty(true);
                            }}
                            className="rounded-full bg-cream-100 px-4 py-1.5 text-xs font-medium text-ink-700 hover:bg-cream-200"
                          >
                            Revenir à la photo d&apos;accueil
                          </button>
                        ) : null}
                      </div>
                      <input
                        ref={shareInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) void uploadShareImage(file);
                        }}
                      />
                      {shareError ? <p className="mt-1 text-xs text-danger-500">{shareError}</p> : null}
                    </FieldBlock>
                  </SettingsPane>
                ) : null}

                {settingsTab === "favicon" ? (
                  <SettingsPane
                    title="Icône du navigateur"
                    description="Choisissez une suggestion ou téléversez votre propre icône (64×64 px recommandé). Il faut parfois vider le cache du navigateur pour voir le changement — les nouveaux visiteurs verront directement la bonne icône."
                  >
                    <FaviconPicker
                      siteUrl={siteOrigin}
                      siteName={siteName}
                      value={faviconUrl}
                      onChange={(next) => {
                        setFaviconUrl(next);
                        setSettingsDirty(true);
                      }}
                    />
                  </SettingsPane>
                ) : null}

                {settingsTab === "coordonnees" ? (
                  <SettingsPane
                    title="Rendez-vous & téléphone"
                    description="Les boutons du site (« Prendre rendez-vous », « Appeler au … ») utilisent ces coordonnées."
                  >
                    <FieldBlock label="Lien de prise de rendez-vous" hint="Doctolib, Calendly, Crenolib, tel:…">
                      <input
                        value={bookingUrl}
                        onChange={(e) => {
                          setBookingUrl(e.target.value);
                          setSettingsDirty(true);
                        }}
                        placeholder="https://www.doctolib.fr/…"
                        className="w-full rounded-xl border border-ink-300 px-3 py-2 text-sm"
                      />
                    </FieldBlock>
                    <FieldBlock
                      label="Numéro de téléphone"
                      hint="Affiché sur les boutons « Appeler au … » du site. Laisser vide pour les masquer."
                    >
                      <input
                        type="tel"
                        value={phoneValue}
                        onChange={(e) => {
                          setPhoneValue(e.target.value);
                          setSettingsDirty(true);
                        }}
                        placeholder="06 12 34 56 78"
                        className="w-full max-w-xs rounded-xl border border-ink-300 px-3 py-2 text-sm"
                      />
                    </FieldBlock>
                    <p className="text-xs text-ink-500">
                      Adresse et horaires se modifient dans la section « Contact » de la page
                      d&apos;accueil (onglet Contenu).
                    </p>
                  </SettingsPane>
                ) : null}

                {settingsTab === "google" ? (
                  <SettingsPane
                    title="Fiche Google"
                    description="Les vrais avis Google de la fiche reliée s'affichent sur le site."
                  >
                    <div>
                      {gBusiness ? (
                        <div className="mb-2 rounded-xl bg-cream-100 px-3 py-2 text-sm">
                          <p className="font-medium">{gBusiness.name}</p>
                          <p className="text-xs text-ink-500">
                            {gBusiness.address}
                            {gBusiness.rating ? (
                              <>
                                {" · ★ "}
                                {gBusiness.rating}
                                {gBusiness.reviewCount ? ` (${gBusiness.reviewCount} avis)` : null}
                              </>
                            ) : null}
                          </p>
                        </div>
                      ) : null}
                      <input
                        value={gQuery}
                        onChange={(e) => onGoogleQueryChange(e.target.value)}
                        placeholder={
                          gBusiness ? "Changer de fiche : rechercher…" : "Rechercher votre cabinet sur Google…"
                        }
                        className="w-full rounded-xl border border-ink-300 px-3 py-2 text-sm"
                      />
                      {gSearching ? (
                        <p className="mt-2 flex items-center gap-2 text-xs text-ink-500">
                          <Spinner /> Recherche…
                        </p>
                      ) : null}
                      {gResults.length > 0 ? (
                        <ul className="mt-2 overflow-hidden rounded-xl border border-cream-300">
                          {gResults.map((place) => (
                            <li key={place.placeId}>
                              <button
                                type="button"
                                onClick={() => void onConnectPlace(place)}
                                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-cream-100"
                              >
                                <span className="min-w-0">
                                  <span className="block truncate font-medium">{place.name}</span>
                                  <span className="block truncate text-xs text-ink-500">{place.address}</span>
                                </span>
                                <span className="shrink-0 text-xs text-primary-600">
                                  ★ {place.rating} · {place.reviewCount}
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      {gStatus ? (
                        <p
                          className={clsx(
                            "mt-2 text-xs",
                            gStatus.startsWith("Fiche reliée") ? "text-success-500" : "text-danger-500",
                          )}
                        >
                          {gStatus}
                        </p>
                      ) : null}
                    </div>
                  </SettingsPane>
                ) : null}

                {settingsTab === "cabinets" ? (
                  <SettingsPane
                    title="Cabinets"
                    description="Pour les praticiens multi-cabinets : chaque cabinet ajouté apparaît sous l'en-tête du site et dans la section Contact, avec un lien vers Google Maps. La fiche Google reliée reste le cabinet principal."
                  >
                    <CabinetsEditor
                      cabinets={cabinets}
                      onChange={(next) => {
                        setCabinets(next);
                        setSettingsDirty(true);
                      }}
                    />
                  </SettingsPane>
                ) : null}

                {settingsTab === "legal" ? (
                  <SettingsPane
                    title="Informations légales"
                    description="Ces informations alimentent les pages Mentions légales, Politique de confidentialité et Politique de cookies de votre site."
                  >
                    <div className="rounded-2xl border border-primary-200 bg-primary-50 px-4 py-3 text-xs text-ink-700">
                      <p className="font-semibold">Pages générées automatiquement</p>
                      <p className="mt-0.5 leading-relaxed">
                        Elles reprennent le nom du site, vos coordonnées, l&apos;hébergeur, le bandeau cookies
                        et les outils de suivi configurés : aucune rédaction nécessaire, complétez simplement
                        les champs ci-dessous. Les pages sont liées depuis le pied de page du site.
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {LEGAL_PAGES.map((page) => (
                          <a
                            key={page.slug}
                            href={`${site.url}${previewPath({ kind: "legal", slug: page.slug }, site.previewToken)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-full bg-white px-3 py-1 font-medium text-primary-600 ring-1 ring-primary-200 hover:bg-primary-100"
                          >
                            ↗ {page.title}
                          </a>
                        ))}
                      </div>
                    </div>
                    {LEGAL_FIELDS.map((field) => (
                      <div key={field.key}>
                        <div className="mb-1 flex items-baseline justify-between gap-2">
                          <label htmlFor={`legal-${field.key}`} className="text-sm font-medium">
                            {field.label}
                          </label>
                          <CharCounter length={legal[field.key].length} limit={field.limit} />
                        </div>
                        {field.multiline ? (
                          <textarea
                            id={`legal-${field.key}`}
                            value={legal[field.key]}
                            rows={4}
                            maxLength={field.limit}
                            placeholder={field.placeholder}
                            onChange={(e) => {
                              setLegal((prev) => ({ ...prev, [field.key]: e.target.value }));
                              setSettingsDirty(true);
                            }}
                            className="w-full resize-y rounded-xl border border-ink-300 px-3 py-2 text-sm"
                          />
                        ) : (
                          <input
                            id={`legal-${field.key}`}
                            type={field.type ?? "text"}
                            value={legal[field.key]}
                            maxLength={field.limit}
                            placeholder={field.placeholder}
                            onChange={(e) => {
                              setLegal((prev) => ({ ...prev, [field.key]: e.target.value }));
                              setSettingsDirty(true);
                            }}
                            className="w-full rounded-xl border border-ink-300 px-3 py-2 text-sm"
                          />
                        )}
                        {field.hint ? <p className="mt-1 text-xs text-ink-500">{field.hint}</p> : null}
                      </div>
                    ))}
                  </SettingsPane>
                ) : null}

                {settingsTab === "social" ? (
                  <SettingsPane
                    title="Réseaux sociaux"
                    description="Les réseaux renseignés apparaissent sous forme d'icônes dans le pied de page du site. Laissez vide ceux que vous n'utilisez pas."
                  >
                    {FOOTER_SOCIAL_NETWORKS.map((network) => {
                      const error = socialUrlError(network.key, social[network.key]);
                      return (
                        <div key={network.key}>
                          <label htmlFor={`social-${network.key}`} className="mb-1 block text-sm font-medium">
                            {network.label}
                          </label>
                          <input
                            id={`social-${network.key}`}
                            type="url"
                            value={social[network.key]}
                            placeholder={`https://www.${network.host}/votre-page`}
                            onChange={(e) => {
                              setSocial((prev) => ({ ...prev, [network.key]: e.target.value }));
                              setSettingsDirty(true);
                            }}
                            className={clsx(
                              "w-full rounded-xl border px-3 py-2 text-sm",
                              error ? "border-danger-500" : "border-ink-300",
                            )}
                          />
                          {error ? <p className="mt-1 text-xs text-danger-500">⚠ {error}</p> : null}
                        </div>
                      );
                    })}
                  </SettingsPane>
                ) : null}

                {settingsTab === "footer" ? (
                  <SettingsPane
                    title="Texte du pied de page"
                    description="Une phrase d'accompagnement sous le nom du site, et des informations complémentaires (SIRET, diplômes, adhésions…) en bas de chaque page."
                  >
                    <div>
                      <div className="mb-1 flex items-baseline justify-between gap-2">
                        <label htmlFor="footer-text" className="text-sm font-medium">
                          Phrase d&apos;accompagnement
                        </label>
                        <CharCounter length={footerText.length} limit={300} />
                      </div>
                      <textarea
                        id="footer-text"
                        value={footerText}
                        rows={3}
                        maxLength={300}
                        placeholder="ex. Sophrologie à Albi : un espace pour souffler, respirer et retrouver l'équilibre."
                        onChange={(e) => {
                          setFooterText(e.target.value);
                          setSettingsDirty(true);
                        }}
                        className="w-full resize-y rounded-xl border border-ink-300 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <div className="mb-1 flex items-baseline justify-between gap-2">
                        <label htmlFor="footer-details" className="text-sm font-medium">
                          Informations complémentaires
                        </label>
                        <CharCounter length={footerDetails.length} limit={500} />
                      </div>
                      <textarea
                        id="footer-details"
                        value={footerDetails}
                        rows={4}
                        maxLength={500}
                        placeholder="ex. SIRET 123 456 789 00012 · Diplômée de l'ISEBA · Membre de la Chambre syndicale de la sophrologie"
                        onChange={(e) => {
                          setFooterDetails(e.target.value);
                          setSettingsDirty(true);
                        }}
                        className="w-full resize-y rounded-xl border border-ink-300 px-3 py-2 text-sm"
                      />
                      <p className="mt-1 text-xs text-ink-500">
                        Affichées en petit sous les liens du pied de page. Un retour à la ligne sépare deux
                        informations.
                      </p>
                    </div>
                  </SettingsPane>
                ) : null}

                {settingsTab === "tracking" ? (
                  <SettingsPane
                    title="Tracking"
                    description="Connectez vos outils de statistiques et de marketing, puis choisissez le bandeau cookies affiché sur le site public."
                  >
                    <div className="space-y-3">
                      <div className="rounded-2xl border border-cream-300 bg-cream-50 p-4">
                        <div className="flex items-center gap-3">
                          <span aria-hidden className="text-lg">
                            🍪
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold">Activer le bandeau cookies</p>
                            <p className="mt-0.5 text-xs text-ink-500">
                              {cookieBanner
                                ? "Le bandeau est affiché : les outils ci-dessous ne se chargent qu'après « Accepter »."
                                : "Aucun bandeau ne sera affiché. Le tracking sera actif par défaut."}
                            </p>
                          </div>
                          <ToggleSwitch
                            checked={cookieBanner}
                            label="Activer le bandeau cookies"
                            onChange={(next) => {
                              setCookieBanner(next);
                              setSettingsDirty(true);
                            }}
                          />
                        </div>
                      </div>

                      {TRACKER_CARDS.map((card) => {
                        const enabled = trackingEnabled[card.key];
                        const invalid = trackingErrors.includes(card.key);
                        return (
                          <div
                            key={card.key}
                            className={clsx(
                              "rounded-2xl border p-4",
                              invalid
                                ? "border-danger-500/50 bg-danger-100/40"
                                : "border-cream-300 bg-cream-50",
                            )}
                          >
                            <div className="flex items-center gap-3">
                              <span aria-hidden className="text-lg">
                                {card.icon}
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold">{card.title}</p>
                                <p className="mt-0.5 text-xs text-ink-500">{card.description}</p>
                              </div>
                              <ToggleSwitch
                                checked={enabled}
                                label={`Activer ${card.title}`}
                                onChange={(next) => {
                                  setTrackingEnabled((prev) => ({ ...prev, [card.key]: next }));
                                  setSettingsDirty(true);
                                }}
                              />
                            </div>
                            {enabled ? (
                              <div className="mt-3">
                                <input
                                  value={trackingIds[card.key]}
                                  placeholder={card.placeholder}
                                  aria-label={`Identifiant ${card.title}`}
                                  onChange={(e) => {
                                    setTrackingIds((prev) => ({ ...prev, [card.key]: e.target.value }));
                                    setSettingsDirty(true);
                                  }}
                                  className={clsx(
                                    "w-full rounded-xl border bg-white px-3 py-2 text-sm",
                                    invalid ? "border-danger-500" : "border-ink-300",
                                  )}
                                />
                                {invalid ? (
                                  <p className="mt-1 text-xs text-danger-500">⚠ {card.error}</p>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </SettingsPane>
                ) : null}
              </div>
            </div>

            <div className="flex items-center justify-between gap-4 border-t border-cream-200 px-6 py-4">
              <p
                className={clsx(
                  "min-w-0 text-xs",
                  settingsFeedback?.startsWith("Publié") ? "text-success-500" : "text-danger-500",
                )}
              >
                {settingsFeedback}
              </p>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={cancelSettings}
                  className="rounded-full px-5 py-2 text-sm font-medium text-ink-500 transition-colors hover:bg-cream-100 hover:text-ink-900"
                >
                  Annuler
                </button>
                <Button onClick={onSaveSettings} disabled={settingsSaving}>
                  {settingsSaving ? <Spinner className="text-white" /> : null}
                  {settingsSaving ? "Publication…" : "Enregistrer et publier"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

/** Colonne de contenu d'une catégorie de la fenêtre Paramètres. */
function SettingsPane({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-ink-500">{description}</p>
      </div>
      {children}
    </div>
  );
}

function PanelTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
        active ? "bg-cream-200 text-ink-900" : "text-ink-500 hover:text-ink-900",
      )}
    >
      {label}
    </button>
  );
}

function FieldBlock({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-sm font-medium">{label}</p>
      {children}
      {hint ? <p className="mt-1 text-xs text-ink-500">{hint}</p> : null}
    </div>
  );
}

/** Pictogrammes de favicon proposés (servis par l'app sites : /favicons/…). */
const FAVICON_PICTOS = [
  "coeur",
  "feuille",
  "fleur",
  "soleil",
  "lune",
  "mains",
  "etoile",
  "bouclier",
] as const;

/**
 * Choix de l'icône du navigateur : logo Harmony (défaut), pictogrammes
 * proposés, ou image téléversée — avec un aperçu façon onglet de navigateur.
 */
function FaviconPicker({
  siteUrl,
  siteName,
  value,
  onChange,
}: {
  siteUrl: string;
  siteName: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isCustom = value !== "" && !value.startsWith("/favicons/");
  const display = (v: string) =>
    v === "" ? `${siteUrl}/favicons/harmony.svg` : v.startsWith("/") ? `${siteUrl}${v}` : v;

  async function upload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/upload", { method: "POST", body: form });
      const data = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !data.url) {
        setError(data.error ?? "Téléversement impossible");
        return;
      }
      onChange(data.url);
    } catch {
      setError("Téléversement impossible — réessayez.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const tile = (selected: boolean) =>
    clsx(
      "flex h-11 w-11 items-center justify-center rounded-full border-2 bg-white p-1.5 transition",
      selected ? "border-primary-500 ring-2 ring-primary-100" : "border-cream-300 hover:border-primary-300",
    );

  return (
    <div>
      {/* Aperçu façon onglet de navigateur */}
      <div className="mb-3 rounded-xl border border-cream-300 bg-cream-100 px-3 pt-2.5">
        <div className="flex items-end gap-3">
          <span aria-hidden className="mb-2 flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-cream-300" />
            <span className="h-2.5 w-2.5 rounded-full bg-cream-300" />
            <span className="h-2.5 w-2.5 rounded-full bg-cream-300" />
          </span>
          <span className="flex min-w-0 items-center gap-2 rounded-t-lg bg-white px-3.5 py-2 text-xs text-ink-700 shadow-sm">
            <img src={display(value)} alt="" className="h-4 w-4 shrink-0 rounded-sm" />
            <span className="truncate">{siteName}</span>
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          title="Logo Harmony (défaut)"
          aria-label="Logo Harmony (défaut)"
          onClick={() => onChange("")}
          className={tile(value === "")}
        >
          <img src={`${siteUrl}/favicons/harmony.svg`} alt="" className="h-full w-full rounded-full" />
        </button>
        {FAVICON_PICTOS.map((name) => (
          <button
            key={name}
            type="button"
            title={`Pictogramme ${name}`}
            aria-label={`Pictogramme ${name}`}
            onClick={() => onChange(`/favicons/${name}.svg`)}
            className={tile(value === `/favicons/${name}.svg`)}
          >
            <img src={`${siteUrl}/favicons/${name}.svg`} alt="" className="h-full w-full rounded-full" />
          </button>
        ))}
        {isCustom ? (
          <button
            type="button"
            title="Icône personnalisée (active)"
            aria-label="Icône personnalisée"
            onClick={() => onChange(value)}
            className={tile(true)}
          >
            <img src={value} alt="" className="h-full w-full rounded-full object-cover" />
          </button>
        ) : null}
        <button
          type="button"
          disabled={uploading}
          title="Téléverser une icône personnalisée"
          aria-label="Téléverser une icône personnalisée"
          onClick={() => inputRef.current?.click()}
          className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-dashed border-ink-300 text-lg text-ink-500 transition hover:border-primary-400 hover:text-primary-500 disabled:opacity-60"
        >
          {uploading ? "…" : "+"}
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      {error ? <p className="mt-1 text-xs text-danger-500">{error}</p> : null}
    </div>
  );
}

/** Champ compact des cartes cabinet (paramètres). */
function CabinetInput({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-ink-700">{label}</span>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-ink-300 bg-white px-3 py-2 text-sm focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
      />
    </label>
  );
}

/** Photo facultative d'un cabinet : téléversement + aperçu + retrait. */
function CabinetPhotoButton({
  value,
  onChange,
}: {
  value: string;
  onChange: (url: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/upload", { method: "POST", body: form });
      const data = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !data.url) {
        setError(data.error ?? "Téléversement impossible");
        return;
      }
      onChange(data.url);
    } catch {
      setError("Téléversement impossible — réessayez.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex items-center gap-2">
      {value ? (
        <img src={value} alt="" className="h-12 w-12 shrink-0 rounded-lg border border-cream-300 object-cover" />
      ) : null}
      <button
        type="button"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
        className="rounded-full bg-cream-100 px-3 py-1.5 text-xs font-medium text-ink-700 hover:bg-cream-200 disabled:opacity-60"
      >
        {uploading ? "Envoi…" : value ? "Changer la photo" : "📷 Photo (facultatif)"}
      </button>
      {value ? (
        <button
          type="button"
          onClick={() => onChange("")}
          className="text-xs text-ink-500 hover:underline"
        >
          Retirer
        </button>
      ) : null}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      {error ? <p className="text-xs text-danger-500">{error}</p> : null}
    </div>
  );
}

/**
 * Cabinets supplémentaires (multi-cabinets) : nom, adresse, code postal,
 * ville et photo facultative — sauvegardés avec les paramètres du site.
 */
function CabinetsEditor({
  cabinets,
  onChange,
}: {
  cabinets: SiteCabinet[];
  onChange: (cabinets: SiteCabinet[]) => void;
}) {
  const update = (index: number, patch: Partial<SiteCabinet>) =>
    onChange(cabinets.map((c, i) => (i === index ? { ...c, ...patch } : c)));

  return (
    <div className="space-y-3">
      {cabinets.map((cabinet, i) => (
        <div key={i} className="space-y-2.5 rounded-xl bg-cream-100 p-3">
          <CabinetInput
            label="Nom du cabinet"
            placeholder="Cabinet du Marais"
            value={cabinet.name}
            onChange={(name) => update(i, { name })}
          />
          <CabinetInput
            label="Adresse du cabinet"
            placeholder="46 rue de Bretagne"
            value={cabinet.address}
            onChange={(address) => update(i, { address })}
          />
          <div className="grid grid-cols-[7rem_1fr] gap-2">
            <CabinetInput
              label="Code postal"
              placeholder="75003"
              value={cabinet.postalCode}
              onChange={(postalCode) => update(i, { postalCode })}
            />
            <CabinetInput
              label="Ville"
              placeholder="Paris"
              value={cabinet.city}
              onChange={(city) => update(i, { city })}
            />
          </div>
          <CabinetPhotoButton
            value={cabinet.photoUrl ?? ""}
            onChange={(photoUrl) => update(i, { photoUrl: photoUrl || undefined })}
          />
          <div className="text-right">
            <button
              type="button"
              onClick={() => onChange(cabinets.filter((_, j) => j !== i))}
              className="text-xs text-danger-500 hover:underline"
            >
              Supprimer ce cabinet
            </button>
          </div>
        </div>
      ))}
      {cabinets.length < 8 ? (
        <button
          type="button"
          onClick={() =>
            onChange([...cabinets, { name: "", address: "", postalCode: "", city: "" }])
          }
          className="w-full rounded-xl border border-dashed border-ink-300 px-3 py-2 text-sm font-medium text-ink-500 hover:border-primary-400 hover:text-primary-500"
        >
          + Ajouter un cabinet
        </button>
      ) : null}
    </div>
  );
}
