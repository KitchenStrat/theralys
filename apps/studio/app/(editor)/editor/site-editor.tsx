"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { clsx } from "clsx";
import {
  AppWindow,
  ArrowLeft,
  ArrowRight,
  Building2,
  Camera,
  ChartLine,
  ChartNoAxesColumn,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  CloudUpload,
  Cookie,
  ExternalLink,
  EyeOff,
  FileText,
  Files,
  Image as ImageIcon,
  ImageUp,
  Info,
  LayoutGrid,
  LayoutTemplate,
  Link2,
  ListOrdered,
  MapPin,
  Megaphone,
  MessageSquareQuote,
  MousePointerClick,
  Palette,
  PanelBottom,
  PenLine,
  Phone,
  Plus,
  Scale,
  Settings,
  Share2,
  Star,
  Sunrise,
  Tag,
  Target,
  Trash2,
  TriangleAlert,
  UserRound,
  X,
  type LucideIcon,
} from "lucide-react";
import { Segmented, useDialogFocus } from "@theralys/ui";
import { Badge, Button, IconBadge, LinkButton, Spinner, TabPanel, Tabs } from "@/components/ds";
import type { PlanId } from "@theralys/db/plans";
import {
  FOOTER_SOCIAL_NETWORKS,
  LEGAL_PAGES,
  formatSiret,
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
import {
  ActionMessage,
  ADD_BUTTON,
  DANGER_LINK,
  FieldError,
  HINT,
  ICON_BUTTON,
  INPUT,
  LABEL,
  Note,
  SUB_TITLE,
  TEXTAREA,
  TEXT_LINK,
} from "./editor-ui";
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

const SETTINGS_NAV: { group: string; items: { id: SettingsTab; icon: LucideIcon; label: string }[] }[] = [
  { group: "Profil", items: [{ id: "identite", icon: UserRound, label: "Identité" }] },
  { group: "Apparence", items: [{ id: "logo", icon: ImageIcon, label: "Logo" }] },
  {
    group: "Visibilité",
    items: [
      { id: "apercu", icon: Link2, label: "Aperçu du lien" },
      { id: "favicon", icon: AppWindow, label: "Icône du navigateur" },
    ],
  },
  { group: "Contact", items: [{ id: "coordonnees", icon: Phone, label: "Rendez-vous & téléphone" }] },
  {
    group: "Cabinets",
    items: [
      { id: "google", icon: Star, label: "Fiche Google" },
      { id: "cabinets", icon: Building2, label: "Cabinets" },
    ],
  },
  { group: "Suivi", items: [{ id: "tracking", icon: ChartNoAxesColumn, label: "Tracking" }] },
  { group: "Légal", items: [{ id: "legal", icon: Scale, label: "Informations légales" }] },
  {
    group: "Pied de page",
    items: [
      { id: "social", icon: Share2, label: "Réseaux sociaux" },
      { id: "footer", icon: PanelBottom, label: "Texte du pied de page" },
    ],
  },
];

/** Pictogramme de chaque type de section, sur sa carte du panneau Contenu. */
const SECTION_CARD_ICONS: Record<SectionType, LucideIcon> = {
  hero: LayoutTemplate,
  highlights: Star,
  specialties: LayoutGrid,
  future: Sunrise,
  about: UserRound,
  reviews: MessageSquareQuote,
  process: ListOrdered,
  faq: CircleHelp,
  contact: MapPin,
  richText: FileText,
  cta: MousePointerClick,
};

/** Sous-onglets du panneau Style. */
const STYLE_TABS: { id: StyleTab; label: string }[] = [
  { id: "couleur", label: "Couleur" },
  { id: "typo", label: "Typo" },
  { id: "forme", label: "Style" },
];

/**
 * Carte de choix du panneau Style (`aria-pressed`). Choix retenu : fond teinté,
 * liseré épais à l'accent de la section et coche (`ChoiceMark`) — jamais la
 * couleur seule.
 */
const choiceCard = (selected: boolean, className?: string) =>
  clsx(
    "relative rounded-ds-md ds-focus ds-press",
    selected ? "bg-ds-section-tint ring-2 ring-ds-section-accent" : "bg-white ring-1 ring-ds-ink-300 hover:bg-ds-ink-50",
    className,
  );

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
  icon: LucideIcon;
  title: string;
  description: string;
  placeholder: string;
  error: string;
}[] = [
  {
    key: "googleAnalyticsId",
    icon: ChartLine,
    title: "Google Analytics",
    description: "Mesure d'audience via la balise Google.",
    placeholder: "G-XXXXXXXXXX",
    error: "Renseignez un identifiant Google Analytics. Exemple : G-XXXXXXXXXX.",
  },
  {
    key: "googleTagManagerId",
    icon: Tag,
    title: "Google Tag Manager",
    description: "Charge votre conteneur GTM selon le mode de bandeau choisi.",
    placeholder: "GTM-XXXXXXX",
    error: "Renseignez un identifiant Google Tag Manager. Exemple : GTM-XXXXXXX.",
  },
  {
    key: "googleAdsId",
    icon: Megaphone,
    title: "Google Ads",
    description: "Mesure des conversions et remarketing Google Ads.",
    placeholder: "AW-1234567890",
    error: "Renseignez un identifiant Google Ads. Exemple : AW-1234567890.",
  },
  {
    key: "metaPixelId",
    icon: Target,
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

/**
 * Le site est-il déjà dans le cadre d'aperçu ? Tant que le cadre est sur sa page vide initiale (même origine que
 * l'éditeur), son adresse se lit et vaut « about:blank » ; dès que le site, servi par une autre origine, y est
 * chargé, la lecture est refusée par le navigateur.
 */
function frameHoldsSite(frame: HTMLIFrameElement | null): boolean {
  const target = frame?.contentWindow;
  if (!target) return false;
  try {
    return target.location.href !== "about:blank";
  } catch {
    return true;
  }
}

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
  const [previewTarget, setPreviewTarget] = useState<PreviewTarget>(() => previewTargetForPage(selectedPage, site.generatingMotifs));
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
      setPreviewTarget(previewTargetForPage(page, site.generatingMotifs));
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
      legal: { ...legal, siret: formatSiret(legal.siret) },
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

  // Focus dans la fenêtre Paramètres à l'ouverture, Tab en boucle, retour au déclencheur
  const settingsDialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(settingsOpen, settingsDialogRef);

  // Présentation seulement : la catégorie active reste visible dans sa barre, qui défile
  // (en largeur sur un écran étroit, en hauteur sinon). Seule la barre défile, rien d'autre.
  const settingsNavRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!settingsOpen) return;
    const nav = settingsNavRef.current;
    const current = nav?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!nav || !current) return;
    const box = nav.getBoundingClientRect();
    const item = current.getBoundingClientRect();
    if (item.left < box.left || item.right > box.right) {
      nav.scrollLeft += item.left - box.left - (box.width - item.width) / 2;
    }
    if (item.top < box.top || item.bottom > box.bottom) {
      nav.scrollTop += item.top - box.top - (box.height - item.height) / 2;
    }
  }, [settingsOpen, settingsTab]);

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
    // SIRET affiché comme il sera publié (groupes de chiffres)
    setLegal((current) => ({ ...current, siret: formatSiret(current.siret) }));
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
        return selectedPage?.generating
          ? "Page d'accueil — la page en préparation s'affichera ici une fois son contenu prêt"
          : "Page d'accueil";
      case "motif":
        return pages.find((p) => p.slug === previewTarget.slug && p.type === "motif")?.title ?? previewTarget.slug;
      case "legal":
        return LEGAL_PAGES.find((p) => p.slug === previewTarget.slug)?.title ?? "Page légale";
      case "notFound":
        return "Page introuvable (404)";
    }
  }, [previewTarget, pages, selectedPage?.generating]);
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

  // Le cadre peut finir de charger avant l'hydratation : son `onLoad` passe alors sans que React l'entende, et le
  // pont ne serait jamais annoncé (clic dans l'aperçu et prévisualisation du style inertes jusqu'au rechargement
  // du cadre). Au montage, si le site est déjà dans le cadre, on l'annonce donc aussi : l'annonce se répète
  // jusqu'à l'accusé de réception, et un `onLoad` qui arriverait ensuite la relance sans dommage.
  useEffect(() => {
    if (frameHoldsSite(iframeRef.current)) announceEditor();
    return () => {
      if (announceTimer.current) clearInterval(announceTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- au montage seulement : `announceEditor` ne lit que des références
  }, []);

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
      {/* Une ligne à partir de 1 024 px ; en dessous, deux : la page en cours, puis les onglets
          (qui défilent, avec un fondu aux bords, si l'écran est trop étroit pour les quatre). */}
      <header className="relative flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-ds-ink-200 bg-white px-3 pt-2.5 sm:px-4 lg:flex-nowrap lg:pt-0">
        <span aria-hidden className="absolute inset-x-0 top-0 h-[3px] bg-ds-section-gradient" />
        <h1 className="sr-only">Éditeur de votre site</h1>
        <div className="flex w-full min-w-0 items-center gap-2 lg:w-auto lg:flex-none">
          <LinkButton
            href="/"
            variant="quiet"
            size="sm"
            icon={<ArrowLeft size={17} aria-hidden />}
            onClick={(e) => {
              // Même garde que le changement de page : la navigation Next ne
              // déclenche pas `beforeunload`
              if (!confirmLeavePage()) e.preventDefault();
            }}
            className="px-3!"
          >
            Accueil
          </LinkButton>
          <button
            type="button"
            onClick={() => setPanel("pages")}
            aria-label={`Page éditée : ${currentPageTitle} — ouvrir le panneau Pages`}
            title="Ouvrir le panneau Pages"
            className="inline-flex min-h-9 min-w-0 items-center gap-2 rounded-[1.125rem] bg-white px-3.5 py-1.5 text-sm font-semibold text-ds-brand-800 shadow-sm inset-ring inset-ring-ds-ink-300 ds-focus ds-press hover:bg-ds-brand-50 pointer-coarse:min-h-11 pointer-coarse:rounded-[1.375rem] lg:max-w-64"
          >
            <FileText size={16} aria-hidden className="shrink-0 text-ds-section-accent" />
            <span className="truncate">{currentPageTitle}</span>
            {dirty ? (
              <span
                role="img"
                aria-label="Modifications non publiées"
                title="Modifications non publiées"
                className="size-2.5 shrink-0 rounded-full bg-ds-warning-700 ring-2 ring-ds-warning-100"
              />
            ) : null}
          </button>
        </div>

        <div className="flex w-full min-w-0 items-center gap-2 lg:ml-auto lg:w-auto">
          <div
            role="group"
            aria-label="Panneaux de l'éditeur"
            className="-ml-3 flex min-w-0 flex-1 overflow-x-auto pl-3 ds-tabs-scroll max-lg:[mask-image:linear-gradient(to_right,transparent,#000_0.75rem,#000_calc(100%_-_1.75rem),transparent)] sm:-ml-4 sm:pl-4 lg:ml-0 lg:flex-none lg:overflow-visible lg:pl-0"
          >
            <PanelTab label="Pages" icon={Files} active={panel === "pages"} aria-pressed={panel === "pages"} onClick={() => setPanel("pages")} />
            <PanelTab label="Contenu" icon={PenLine} active={panel === "contenu"} aria-pressed={panel === "contenu"} onClick={() => setPanel("contenu")} />
            <PanelTab label="Style" icon={Palette} active={panel === "style"} aria-pressed={panel === "style"} onClick={() => setPanel("style")} />
            <PanelTab label="Paramètres" icon={Settings} active={settingsOpen} aria-haspopup="dialog" onClick={() => openSettings()} />
            {/* Marge de fin : le fondu du bord ne couvre jamais le dernier onglet une fois la rangée défilée */}
            <span aria-hidden className="w-5 shrink-0 lg:hidden" />
          </div>
          <LinkButton
            href={site.url}
            external
            variant="secondary"
            size="sm"
            icon={<ExternalLink size={16} aria-hidden />}
            className="max-sm:px-3.5!"
          >
            {/* Sous 640 px, le bouton se réduit à son icône ; son nom reste lu */}
            <span className="max-sm:sr-only">Voir mon site</span>
          </LinkButton>
        </div>
      </header>

      {/* ── Panneau + prévisualisation ───────────────────────────────────── */}
      {/* Sous 768 px, l'aperçu passe au-dessus du panneau (ordre visuel seulement). `role="main"` et non
          `<main>` : la feuille partagée anime les enfants d'un `<main>` par des règles hors couche. */}
      <div role="main" className="flex min-h-0 flex-1 flex-col-reverse md:flex-row">
        <aside
          role="region"
          aria-label="Panneau d'édition"
          className="flex min-h-0 w-full flex-1 flex-col border-ds-ink-200 bg-white max-md:border-t md:w-96 md:flex-none md:border-r xl:w-[26rem]"
        >
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {panel === "pages" ? (
              <PanelIntro icon={Files} title="Pages">
                Choisissez la page à modifier, ou affichez une page légale dans l&apos;aperçu.
              </PanelIntro>
            ) : null}
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
              <PanelIntro icon={PenLine} title="Contenu">
                Cliquez sur une section de l&apos;aperçu pour l&apos;ouvrir ici, puis modifiez textes et photos.
                L&apos;interrupteur masque une section sans perdre son contenu.
              </PanelIntro>
            ) : null}
            {panel === "contenu" ? (
              selectedPage?.generating ? (
                <div className="rounded-ds-md bg-ds-section-tint p-4 ring-1 ring-ds-section-line/70">
                  <p className="flex items-center gap-2.5 text-ds-body font-semibold text-ds-section-ink">
                    <Spinner className="size-[1.125rem] text-ds-section-accent" /> Page en préparation…
                  </p>
                  <p className="mt-1.5 text-ds-meta text-ds-ink-700">
                    Le contenu de cette page est en cours de rédaction (environ une minute). Ses sections
                    seront modifiables dès qu&apos;il sera prêt — vous pouvez suivre l&apos;avancement
                    dans le panneau Pages.
                  </p>
                </div>
              ) : sections.length > 0 ? (
                <div className="space-y-2.5">
                  {sharedNotice ? (
                    <Note tone="info" role="status" className="mb-3">
                      <div className="flex items-start gap-1">
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
                              className={clsx(TEXT_LINK, "mt-1 inline-flex min-h-8 items-center gap-1.5 pointer-coarse:min-h-11")}
                            >
                              Modifier sur l&apos;accueil
                              <ArrowRight size={14} aria-hidden className="shrink-0" />
                            </button>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          aria-label="Fermer ce message"
                          onClick={() => setSharedNotice(null)}
                          className={clsx(ICON_BUTTON, "-mr-1.5 -mt-1.5 hover:bg-ds-brand-100")}
                        >
                          <X size={16} aria-hidden />
                        </button>
                      </div>
                    </Note>
                  ) : null}
                  {sections.map((section, i) => {
                    const visible = isSectionVisible(section);
                    const label = SECTION_LABELS[section.type];
                    const open = active === i;
                    return (
                      <div
                        key={`${section.type}-${i}`}
                        ref={(el) => {
                          cardRefs.current[i] = el;
                        }}
                        data-section-type={section.type}
                        data-section-hidden={visible ? undefined : "true"}
                        className={clsx(
                          "rounded-ds-md",
                          // Carte ouverte : liseré épais à l'accent de la section, en-tête teinté, chevron vers le bas
                          open ? "shadow-ds-card ring-2 ring-ds-section-accent" : "ring-1 ring-ds-ink-200",
                          visible ? "bg-white" : "bg-ds-ink-50",
                        )}
                      >
                        <div
                          className={clsx(
                            "flex items-center gap-2 py-1 pl-2 pr-3",
                            open && (visible ? "rounded-t-ds-md bg-ds-section-tint" : "rounded-t-ds-md bg-ds-ink-100"),
                          )}
                        >
                          <h3 className="min-w-0 flex-1">
                            <button
                              type="button"
                              onClick={() => selectSection(i)}
                              aria-expanded={open}
                              className={clsx(
                                "flex min-h-12 w-full min-w-0 items-center gap-2.5 rounded-ds-sm py-1 text-left text-ds-body font-semibold ds-focus",
                                visible ? "text-ds-ink-900" : "text-ds-ink-600",
                              )}
                            >
                              {open ? (
                                <ChevronDown size={18} aria-hidden className="shrink-0 text-ds-section-accent" />
                              ) : (
                                <ChevronRight size={18} aria-hidden className="shrink-0 text-ds-ink-600" />
                              )}
                              <IconBadge
                                icon={SECTION_CARD_ICONS[section.type]}
                                tone="soft"
                                size="sm"
                                className={visible ? undefined : "bg-ds-ink-200! text-ds-ink-600!"}
                              />
                              <span className="min-w-0">{label}</span>
                              {!visible ? (
                                <Badge tone="neutral" icon={EyeOff} className="bg-ds-ink-200!">
                                  Masquée
                                </Badge>
                              ) : null}
                            </button>
                          </h3>
                          {/* Après un clic sur « Section masquée » dans l'aperçu : l'interrupteur surgit une fois, cerclé
                              (`data-highlight` : repère des parcours automatisés, à la place de l'ancienne classe en boucle) */}
                          <span
                            data-highlight={highlightVisibility === i ? "true" : undefined}
                            className={clsx(
                              "flex shrink-0 items-center rounded-full",
                              highlightVisibility === i && "ring-2 ring-ds-section-accent ring-offset-2 ds-pop",
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
                        {open ? (
                          <div className="border-t border-ds-ink-200 p-4">
                            {!visible ? (
                              <Note tone="info" icon={EyeOff} className="mb-4">
                                Cette section est masquée : elle n&apos;apparaît pas sur le site public.
                                Réactivez l&apos;interrupteur « Visible sur cette page » pour l&apos;afficher.
                              </Note>
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
                <p className="text-ds-body text-ds-ink-600">Aucune section éditable sur cette page.</p>
              )
            ) : null}

            {panel === "style" ? (
              <div className="space-y-5">
                <PanelIntro icon={Palette} title="Style">
                  Couleur, polices et formes de votre site. L&apos;aperçu change tout de suite ; rien n&apos;est en
                  ligne avant « Enregistrer et publier ».
                </PanelIntro>
                <Tabs
                  variant="pill"
                  label="Réglages de style"
                  idBase="style"
                  tabs={STYLE_TABS}
                  value={styleTab}
                  onChange={setStyleTab}
                  className="w-full"
                />

                {styleTab === "couleur" ? (
                  <TabPanel idBase="style" tab="couleur" className="space-y-6">
                    <div>
                      <h3 className={SUB_TITLE}>Couleur du site</h3>
                      <div className="mt-2.5 grid grid-cols-4 gap-2.5 min-[360px]:grid-cols-6">
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
                              "grid aspect-square w-full place-items-center rounded-ds-sm text-white ds-focus ds-press",
                              // Couleur retenue : cerclée d'encre et cochée
                              themePreset === preset ? "ring-2 ring-ds-ink-900 ring-offset-2" : "ring-1 ring-ds-ink-900/10",
                            )}
                            style={{ background: THEME_SWATCHES[preset] }}
                          >
                            {themePreset === preset ? <Check size={20} strokeWidth={3} aria-hidden /> : null}
                          </button>
                        ))}
                      </div>
                      <p className={clsx("mt-3", HINT)}>
                        Couleur choisie : <span className="font-semibold capitalize text-ds-ink-900">{themePreset}</span>
                      </p>
                    </div>
                    <div>
                      <h3 className={SUB_TITLE}>Intensité</h3>
                      <div className="mt-2.5 grid grid-cols-3 gap-2.5">
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
                            className={choiceCard(
                              intensity === choice.value,
                              "flex flex-col items-center gap-2 px-2 py-3 text-ds-meta font-semibold text-ds-ink-900",
                            )}
                          >
                            {intensity === choice.value ? <ChoiceMark /> : null}
                            <span
                              aria-hidden
                              className="size-7 rounded-lg"
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
                  </TabPanel>
                ) : null}

                {styleTab === "typo" ? (
                  <TabPanel idBase="style" tab="typo">
                    <h3 className={SUB_TITLE}>Polices du site</h3>
                    <div className="mt-2.5 grid grid-cols-1 gap-2.5 min-[360px]:grid-cols-2">
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
                          className={choiceCard(fontPreset === choice.value, "px-3 py-4 text-center text-ds-ink-900")}
                        >
                          {fontPreset === choice.value ? <ChoiceMark /> : null}
                          <span className="block text-xl leading-tight" style={{ fontFamily: choice.family }}>
                            Votre cabinet
                          </span>
                          <span
                            className="mt-1 block text-[0.8125rem] leading-snug text-ds-ink-700"
                            style={{ fontFamily: choice.bodyFamily }}
                          >
                            Un espace pour souffler
                          </span>
                          <span className="mt-2 block text-ds-meta font-semibold text-ds-ink-900">{choice.label}</span>
                        </button>
                      ))}
                    </div>
                  </TabPanel>
                ) : null}

                {styleTab === "forme" ? (
                  <TabPanel idBase="style" tab="forme" className="space-y-6">
                    <div>
                      <h3 className={SUB_TITLE}>Forme des coins</h3>
                      <div className="mt-2.5 grid grid-cols-2 gap-2.5">
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
                            className={choiceCard(
                              corners === choice.value,
                              "flex min-h-14 items-center gap-2.5 px-3 py-2 text-left text-ds-meta font-semibold text-ds-ink-900",
                            )}
                          >
                            <span
                              aria-hidden
                              className="size-6 shrink-0 border-2 border-ds-ink-600 bg-white"
                              style={{ borderRadius: choice.radius }}
                            />
                            <span className="min-w-0">{choice.label}</span>
                            {corners === choice.value ? <ChoiceMark inline /> : null}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <h3 className={SUB_TITLE}>Ambiance</h3>
                      <div className="mt-2.5 grid grid-cols-1 gap-2.5 min-[360px]:grid-cols-2">
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
                            className={choiceCard(ambiance === choice.value, "p-3 text-left")}
                          >
                            {ambiance === choice.value ? <ChoiceMark /> : null}
                            <span className="block pr-5 text-ds-body font-semibold text-ds-ink-900">{choice.label}</span>
                            <span className={clsx("mt-0.5 block", HINT)}>{choice.caption}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </TabPanel>
                ) : null}
              </div>
            ) : null}
          </div>

          {panel !== "pages" ? (
            <div className="border-t border-ds-ink-200 bg-white px-4 py-3 shadow-ds-bar md:py-4">
              {/* Réussite : la coche surgit ; échec : le message du service, annoncé aussitôt */}
              {feedback ? (
                <ActionMessage tone={feedback.startsWith("Publié") ? "success" : "error"} className="mb-3">
                  {feedback}
                </ActionMessage>
              ) : null}
              <Button
                onClick={onSave}
                loading={saving}
                disabled={!dirty && panel === "contenu"}
                icon={<CloudUpload size={18} aria-hidden />}
                className="w-full"
              >
                {saving ? "Publication…" : "Enregistrer et publier"}
              </Button>
              {!dirty && panel === "contenu" && !feedback ? (
                <p className={clsx("mt-2 text-center", HINT)}>Modifiez un texte ou une photo pour pouvoir publier.</p>
              ) : null}
            </div>
          ) : (
            <p className={clsx("flex items-start gap-2 border-t border-ds-ink-200 px-4 py-3", HINT)}>
              <Info size={15} aria-hidden className="mt-0.5 shrink-0 text-ds-section-accent" />
              <span>
                Une page désactivée n&apos;apparaît plus sur votre site (carte, menu, Google) mais reste
                éditable ici.
              </span>
            </p>
          )}
        </aside>

        {/* Sous 768 px l'aperçu occupe le haut de l'écran ; si l'écran est aussi très bas (zoom fort), il laisse
            toute la place au panneau. */}
        <section
          aria-label="Aperçu du site"
          className="flex min-w-0 flex-col bg-ds-section-soft max-md:h-[34dvh] max-md:shrink-0 max-md:[@media(max-height:35rem)]:hidden md:flex-1"
        >
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 px-3 pt-2.5 sm:px-4 sm:pt-3">
            <h2 className="min-w-0 truncate text-ds-meta font-normal text-ds-ink-700">
              Aperçu : <span className="font-semibold text-ds-ink-900">{previewLabel}</span>
            </h2>
            <Segmented
              aria-label="Largeur de l'aperçu"
              options={PREVIEW_WIDTH_OPTIONS}
              value={previewWidth}
              onChange={setPreviewWidth}
              className="max-w-full shrink-0 bg-white! inset-ring inset-ring-ds-section-line [&>button]:max-sm:px-3 [&>button]:pointer-coarse:min-h-11 [&>button[aria-pressed=true]]:bg-ds-section-tint-2 [&>button[aria-pressed=true]]:font-semibold [&>button[aria-pressed=true]]:text-ds-section-ink [&>button[aria-pressed=true]]:ring-ds-section-line"
            />
          </div>
          <div
            ref={previewBoxRef}
            className={clsx(
              "flex min-h-0 flex-1 overflow-hidden p-3 sm:p-4",
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
                "rounded-ds-md bg-white shadow-ds-card ring-1 ring-ds-ink-900/10",
                desktopScale < 1 ? "" : "h-full",
              )}
            />
          </div>
        </section>
      </div>

      {/* ── Fenêtre Paramètres (modale centrée, quasi pleine page) ─────────── */}
      {settingsOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ds-brand-950/50 sm:p-6 lg:p-10"
          onMouseDown={(e) => {
            // Clic sur le fond : ferme seulement s'il n'y a rien à perdre
            if (e.target === e.currentTarget && !settingsDirty) cancelSettings();
          }}
        >
          <div
            ref={settingsDialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="Paramètres du site"
            tabIndex={-1}
            className="flex h-full w-full max-w-5xl flex-col overflow-hidden bg-white shadow-ds-pop focus:outline-none sm:max-h-[860px] sm:rounded-ds-band"
          >
            <div className="flex items-center justify-between gap-3 border-b border-ds-section-line bg-ds-section-soft px-4 py-3 sm:px-6 sm:py-4">
              <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
                <IconBadge icon={Settings} size="sm" />
                <h2 className="font-ds-display text-xl/7 font-bold text-ds-ink-900">Paramètres</h2>
                {trackingErrors.length > 0 || socialErrors.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => setSettingsTab(trackingErrors.length > 0 ? "tracking" : "social")}
                    className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-ds-warning-100 px-3 text-ds-meta font-semibold text-ds-warning-900 ring-1 ring-ds-warning-700/40 ds-focus pointer-coarse:min-h-11"
                  >
                    <TriangleAlert size={14} aria-hidden className="shrink-0" />
                    Format à corriger
                  </button>
                ) : null}
                <span aria-hidden className="h-5 w-px bg-ds-ink-300 max-sm:hidden" />
                <span className="text-ds-body text-ds-ink-700 max-sm:hidden">{activeSettingsLabel}</span>
              </div>
              <button
                type="button"
                onClick={cancelSettings}
                aria-label="Fermer les paramètres"
                className={clsx(ICON_BUTTON, "size-11! hover:bg-white")}
              >
                <X size={20} aria-hidden />
              </button>
            </div>

            <div className="flex min-h-0 flex-1 flex-col md:flex-row">
              {/* À partir de 768 px : colonne de gauche, groupée. En dessous : une rangée qui défile, avec un fondu aux bords. */}
              <nav
                ref={settingsNavRef}
                aria-label="Catégories des paramètres"
                className="flex shrink-0 gap-1.5 overflow-x-auto border-ds-ink-200 bg-ds-ink-50 px-3 py-2 ds-tabs-scroll max-md:border-b max-md:[mask-image:linear-gradient(to_right,transparent,#000_0.75rem,#000_calc(100%_-_2rem),transparent)] md:w-72 md:flex-col md:gap-5 md:overflow-y-auto md:overflow-x-hidden md:border-r md:p-4"
              >
                {SETTINGS_NAV.map((group) => (
                  <div key={group.group} className="max-md:contents">
                    <p className="px-3 pb-1.5 text-ds-meta font-semibold text-ds-ink-600 max-md:hidden">{group.group}</p>
                    <div className="max-md:contents md:space-y-1">
                      {group.items.map((item) => {
                        const current = settingsTab === item.id;
                        const invalid =
                          (item.id === "tracking" && trackingErrors.length > 0) ||
                          (item.id === "social" && socialErrors.length > 0);
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => setSettingsTab(item.id)}
                            aria-current={current ? "true" : undefined}
                            className={clsx(
                              "flex min-h-11 shrink-0 items-center gap-2.5 rounded-ds-sm px-3 py-1.5 text-left text-ds-body ds-focus md:w-full",
                              // Catégorie affichée : aplat en dégradé profond, graisse, chevron — plus `aria-current`
                              current
                                ? "bg-ds-section-gradient-deep font-semibold text-ds-section-on-deep shadow-sm"
                                : "font-medium text-ds-ink-700 hover:bg-ds-section-tint-2 hover:text-ds-section-ink",
                            )}
                          >
                            <item.icon size={18} aria-hidden className="shrink-0" />
                            <span className="whitespace-nowrap md:min-w-0 md:flex-1 md:truncate">{item.label}</span>
                            {invalid ? (
                              <TriangleAlert
                                size={16}
                                aria-hidden
                                className={clsx("shrink-0", current ? "text-white" : "text-ds-warning-700")}
                              />
                            ) : null}
                            {current ? <ChevronRight size={16} aria-hidden className="shrink-0 max-md:hidden" /> : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
                {/* Marge de fin : le fondu du bord ne couvre pas la dernière catégorie une fois la rangée défilée */}
                <span aria-hidden className="w-6 shrink-0 md:hidden" />
              </nav>

              <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6 md:p-8">
                {settingsTab === "identite" ? (
                  <SettingsPane
                    title="Identité"
                    description="Le nom du site apparaît dans l'en-tête, l'onglet du navigateur et les résultats Google."
                  >
                    <FieldBlock label="Nom du site">
                      <input
                        value={siteName}
                        aria-label="Nom du site"
                        onChange={(e) => {
                          setSiteName(e.target.value);
                          setSettingsDirty(true);
                        }}
                        className={INPUT}
                      />
                    </FieldBlock>
                    <FieldBlock label="Ville">
                      <input
                        value={cityValue}
                        aria-label="Ville"
                        onChange={(e) => {
                          setCityValue(e.target.value);
                          setSettingsDirty(true);
                        }}
                        className={clsx(INPUT, "max-w-xs")}
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
                          className="mb-3 h-16 w-auto max-w-full rounded-ds-sm bg-white object-contain p-1.5 ring-1 ring-ds-ink-200"
                        />
                      ) : null}
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          loading={logoUploading}
                          icon={<ImageUp size={16} aria-hidden />}
                          onClick={() => logoInputRef.current?.click()}
                        >
                          {logoUploading ? "Envoi en cours…" : "Téléverser un logo"}
                        </Button>
                        {logoUrl ? (
                          <Button
                            type="button"
                            variant="quiet"
                            size="sm"
                            icon={<X size={16} aria-hidden />}
                            onClick={() => {
                              setLogoUrl("");
                              setSettingsDirty(true);
                            }}
                          >
                            Retirer (afficher le nom)
                          </Button>
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
                      {logoError ? <FieldError>{logoError}</FieldError> : null}
                    </div>
                  </SettingsPane>
                ) : null}

                {settingsTab === "apercu" ? (
                  <SettingsPane
                    title="Aperçu du lien"
                    description="Voici comment votre site apparaît dans les résultats de recherche Google et lors d'un partage du lien (WhatsApp, réseaux sociaux…)."
                  >
                    {/* Aperçu façon résultat Google */}
                    <div className="rounded-ds-md bg-white p-4 shadow-ds-card ring-1 ring-ds-ink-200">
                      <div className="flex items-start justify-between gap-3 sm:gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-ds-ink-100 p-1 ring-1 ring-ds-ink-200">
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
                              <span className="block truncate text-ds-ink-900">
                                {siteOrigin.replace(/^https?:\/\//, "")}
                              </span>
                              <span className="block truncate text-ds-ink-600">{site.url}</span>
                            </span>
                          </div>
                          <p className="mt-1.5 truncate text-xl text-[#1a0dab]">
                            {seoTitle || site.name}
                          </p>
                          <p className="mt-0.5 line-clamp-2 text-sm text-ds-ink-700">
                            {seoDescription || "Ajoutez une description pour ce résultat."}
                          </p>
                        </div>
                        {shareImageUrl || seo.heroImageUrl ? (
                          <img
                            src={shareImageUrl || seo.heroImageUrl}
                            alt=""
                            className="size-20 shrink-0 rounded-ds-md object-cover sm:size-24"
                          />
                        ) : null}
                      </div>
                    </div>

                    <div>
                      <div className="mb-1.5 flex items-baseline justify-between gap-2">
                        <p className={LABEL}>Titre du lien</p>
                        <LengthMark length={seoTitle.length} limit={70} />
                      </div>
                      <input
                        value={seoTitle}
                        maxLength={120}
                        aria-label="Titre du lien"
                        onChange={(e) => {
                          setSeoTitle(e.target.value);
                          setSettingsDirty(true);
                        }}
                        className={INPUT}
                      />
                      <p className={clsx("mt-1.5", HINT)}>
                        Le titre bleu du résultat Google. Recommandé : métier + ville, 70 caractères
                        maximum.
                      </p>
                    </div>

                    <div>
                      <div className="mb-1.5 flex items-baseline justify-between gap-2">
                        <p className={LABEL}>Description</p>
                        <LengthMark length={seoDescription.length} limit={170} />
                      </div>
                      <textarea
                        value={seoDescription}
                        maxLength={300}
                        rows={3}
                        aria-label="Description"
                        onChange={(e) => {
                          setSeoDescription(e.target.value);
                          setSettingsDirty(true);
                        }}
                        className={TEXTAREA}
                      />
                      <p className={clsx("mt-1.5", HINT)}>
                        Les deux lignes grises sous le titre. Recommandé : 170 caractères maximum,
                        avec une invitation à prendre rendez-vous.
                      </p>
                    </div>

                    <FieldBlock
                      label="Image de partage"
                      hint="Affichée à côté du résultat Google et en grand lors d'un partage du lien. Idéal : 1200×630 px. Sans image choisie, la photo d'accueil du site est utilisée."
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          loading={shareUploading}
                          icon={<ImageUp size={16} aria-hidden />}
                          onClick={() => shareInputRef.current?.click()}
                        >
                          {shareUploading ? "Envoi en cours…" : "Téléverser une image"}
                        </Button>
                        {shareImageUrl ? (
                          <Button
                            type="button"
                            variant="quiet"
                            size="sm"
                            onClick={() => {
                              setShareImageUrl("");
                              setSettingsDirty(true);
                            }}
                          >
                            Revenir à la photo d&apos;accueil
                          </Button>
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
                      {shareError ? <FieldError>{shareError}</FieldError> : null}
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
                        aria-label="Lien de prise de rendez-vous"
                        onChange={(e) => {
                          setBookingUrl(e.target.value);
                          setSettingsDirty(true);
                        }}
                        placeholder="https://www.doctolib.fr/…"
                        className={INPUT}
                      />
                    </FieldBlock>
                    <FieldBlock
                      label="Numéro de téléphone"
                      hint="Affiché sur les boutons « Appeler au … » du site. Laisser vide pour les masquer."
                    >
                      <input
                        type="tel"
                        value={phoneValue}
                        aria-label="Numéro de téléphone"
                        onChange={(e) => {
                          setPhoneValue(e.target.value);
                          setSettingsDirty(true);
                        }}
                        placeholder="06 12 34 56 78"
                        className={clsx(INPUT, "max-w-xs")}
                      />
                    </FieldBlock>
                    <Note tone="info">
                      Adresse et horaires se modifient dans la section « Contact » de la page
                      d&apos;accueil (onglet Contenu).
                    </Note>
                  </SettingsPane>
                ) : null}

                {settingsTab === "google" ? (
                  <SettingsPane
                    title="Fiche Google"
                    description="Les vrais avis Google de la fiche reliée s'affichent sur le site."
                  >
                    <div>
                      {gBusiness ? (
                        <div className="mb-3 flex items-start gap-3 rounded-ds-sm bg-ds-section-tint px-3 py-2.5 ring-1 ring-ds-section-line/70">
                          <MapPin size={18} aria-hidden className="mt-0.5 shrink-0 text-ds-section-accent" />
                          <div className="min-w-0">
                            <p className="text-ds-body font-semibold text-ds-ink-900">{gBusiness.name}</p>
                            <p className="text-ds-meta text-ds-ink-700">
                              {gBusiness.address}
                              {gBusiness.rating ? (
                                <>
                                  {" · "}
                                  <StarMark />
                                  {gBusiness.rating}
                                  {gBusiness.reviewCount ? ` (${gBusiness.reviewCount} avis)` : null}
                                </>
                              ) : null}
                            </p>
                          </div>
                        </div>
                      ) : null}
                      <input
                        value={gQuery}
                        aria-label={gBusiness ? "Changer de fiche Google : rechercher" : "Rechercher votre cabinet sur Google"}
                        onChange={(e) => onGoogleQueryChange(e.target.value)}
                        placeholder={
                          gBusiness ? "Changer de fiche : rechercher…" : "Rechercher votre cabinet sur Google…"
                        }
                        className={INPUT}
                      />
                      {gSearching ? (
                        <p role="status" className={clsx("mt-2 flex items-center gap-2", HINT)}>
                          <Spinner className="size-4 text-ds-section-accent" /> Recherche…
                        </p>
                      ) : null}
                      {gResults.length > 0 ? (
                        <ul className="mt-2 divide-y divide-ds-ink-200 overflow-hidden rounded-ds-sm ring-1 ring-ds-ink-300">
                          {gResults.map((place) => (
                            <li key={place.placeId}>
                              <button
                                type="button"
                                onClick={() => void onConnectPlace(place)}
                                className="flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2 text-left text-ds-body ds-focus-inset hover:bg-ds-section-tint"
                              >
                                <span className="min-w-0">
                                  <span className="block truncate font-semibold text-ds-ink-900">{place.name}</span>
                                  <span className="block truncate text-ds-meta text-ds-ink-600">{place.address}</span>
                                </span>
                                <span className="shrink-0 text-ds-meta font-medium text-ds-ink-700 ds-tnum">
                                  <StarMark />
                                  {place.rating} · {place.reviewCount}
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      {gStatus ? (
                        <ActionMessage tone={gStatus.startsWith("Fiche reliée") ? "success" : "error"} className="mt-3">
                          {gStatus}
                        </ActionMessage>
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
                    <Note tone="info" className="py-3">
                      <p className="font-semibold text-ds-ink-900">Pages générées automatiquement</p>
                      <p className="mt-0.5 leading-relaxed">
                        Elles reprennent le nom du site, vos coordonnées, l&apos;hébergeur, le bandeau cookies
                        et les outils de suivi configurés : aucune rédaction nécessaire, complétez simplement
                        les champs ci-dessous. Les pages sont liées depuis le pied de page du site.
                      </p>
                      <div className="mt-2.5 flex flex-wrap gap-2">
                        {LEGAL_PAGES.map((page) => (
                          <a
                            key={page.slug}
                            href={`${site.url}${previewPath({ kind: "legal", slug: page.slug }, site.previewToken)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-white px-3 py-1 font-semibold text-ds-brand-800 ring-1 ring-ds-brand-200 ds-focus hover:bg-ds-brand-100 pointer-coarse:min-h-11"
                          >
                            <ExternalLink size={14} aria-hidden className="shrink-0" />
                            {page.title}
                            <span className="sr-only"> (nouvel onglet)</span>
                          </a>
                        ))}
                      </div>
                    </Note>
                    {LEGAL_FIELDS.map((field) => (
                      <div key={field.key}>
                        <div className="mb-1.5 flex items-baseline justify-between gap-2">
                          <label htmlFor={`legal-${field.key}`} className={LABEL}>
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
                            className={TEXTAREA}
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
                            className={INPUT}
                          />
                        )}
                        {field.hint ? <p className={clsx("mt-1.5", HINT)}>{field.hint}</p> : null}
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
                          <label htmlFor={`social-${network.key}`} className={clsx("mb-1.5 block", LABEL)}>
                            {network.label}
                          </label>
                          <input
                            id={`social-${network.key}`}
                            type="url"
                            value={social[network.key]}
                            placeholder={`https://www.${network.host}/votre-page`}
                            aria-invalid={error ? true : undefined}
                            onChange={(e) => {
                              setSocial((prev) => ({ ...prev, [network.key]: e.target.value }));
                              setSettingsDirty(true);
                            }}
                            className={clsx(INPUT, "aria-invalid:border-ds-danger-700")}
                          />
                          {error ? <FieldError>{error}</FieldError> : null}
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
                      <div className="mb-1.5 flex items-baseline justify-between gap-2">
                        <label htmlFor="footer-text" className={LABEL}>
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
                        className={TEXTAREA}
                      />
                    </div>
                    <div>
                      <div className="mb-1.5 flex items-baseline justify-between gap-2">
                        <label htmlFor="footer-details" className={LABEL}>
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
                        className={TEXTAREA}
                      />
                      <p className={clsx("mt-1.5", HINT)}>
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
                      <div className="rounded-ds-md bg-ds-section-tint p-4 ring-1 ring-ds-section-line/70">
                        <div className="flex items-center gap-3">
                          <IconBadge icon={Cookie} tone="soft" size="sm" />
                          <div className="min-w-0 flex-1">
                            <h4 className="text-ds-body font-semibold text-ds-ink-900">Activer le bandeau cookies</h4>
                            <p className={clsx("mt-0.5", "text-ds-meta text-ds-ink-700")}>
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
                              "rounded-ds-md p-4 ring-1",
                              invalid ? "bg-ds-danger-100 ring-ds-danger-700/40" : "bg-white shadow-ds-card ring-ds-ink-200",
                            )}
                          >
                            <div className="flex items-center gap-3">
                              <IconBadge icon={card.icon} tone="soft" size="sm" className={invalid ? "bg-white!" : undefined} />
                              <div className="min-w-0 flex-1">
                                <h4 className="text-ds-body font-semibold text-ds-ink-900">{card.title}</h4>
                                <p className={clsx("mt-0.5", invalid ? "text-ds-meta text-ds-ink-700" : HINT)}>{card.description}</p>
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
                                  aria-invalid={invalid ? true : undefined}
                                  onChange={(e) => {
                                    setTrackingIds((prev) => ({ ...prev, [card.key]: e.target.value }));
                                    setSettingsDirty(true);
                                  }}
                                  className={clsx(INPUT, "aria-invalid:border-ds-danger-700")}
                                />
                                {invalid ? <FieldError>{card.error}</FieldError> : null}
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

            <div className="flex flex-col gap-x-4 gap-y-2.5 border-t border-ds-ink-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-4">
              <div className="min-w-0">
                {settingsFeedback ? (
                  <ActionMessage tone={settingsFeedback.startsWith("Publié") ? "success" : "error"}>
                    {settingsFeedback}
                  </ActionMessage>
                ) : null}
              </div>
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                <Button type="button" variant="quiet" onClick={cancelSettings}>
                  Annuler
                </Button>
                <Button onClick={onSaveSettings} loading={settingsSaving} icon={<CloudUpload size={18} aria-hidden />}>
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
    <div className="max-w-2xl space-y-5 ds-fade-in">
      <div>
        <h3 className="font-ds-display text-lg/7 font-bold text-ds-ink-900">{title}</h3>
        <p className="mt-1 text-ds-body text-ds-ink-600">{description}</p>
      </div>
      {children}
    </div>
  );
}

/** Tête d'un panneau : pastille de la section, titre (`h2`) et, en une phrase, ce qu'on y fait. */
function PanelIntro({ icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) {
  return (
    <div className="mb-4 flex items-start gap-3">
      <IconBadge icon={icon} size="sm" />
      <div className="min-w-0">
        <h2 className="font-ds-display text-lg/7 font-bold text-ds-ink-900">{title}</h2>
        <p className={clsx("mt-0.5", HINT)}>{children}</p>
      </div>
    </div>
  );
}

/**
 * Onglet de la barre du haut, au dessin des onglets du design system. Trois
 * indices pour l'onglet actif : le trait en dégradé, la graisse, la couleur.
 * Un vrai bouton : « Paramètres » ouvre une fenêtre, les trois autres
 * changent le panneau (`aria-pressed`).
 */
function PanelTab({
  label,
  icon: Icon,
  active,
  onClick,
  ...aria
}: {
  label: string;
  icon: LucideIcon;
  active: boolean;
  onClick: () => void;
  "aria-pressed"?: boolean;
  "aria-haspopup"?: "dialog";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "relative inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-t-ds-sm px-2 text-ds-body ds-focus-inset sm:px-3 lg:min-h-14",
        active ? "font-semibold text-ds-section-ink" : "font-medium text-ds-ink-600 hover:text-ds-ink-900",
      )}
      {...aria}
    >
      <Icon size={18} aria-hidden className={clsx("max-sm:hidden", active && "text-ds-section-accent")} />
      {/* `ds-tab-label` réserve la largeur de la graisse active : pas de saut à la sélection */}
      <span className="ds-tab-label" data-label={label}>
        {label}
      </span>
      {active ? <span aria-hidden className="absolute inset-x-1.5 bottom-0 h-[3px] rounded-t-full bg-ds-section-gradient" /> : null}
    </button>
  );
}

/** Coche d'une carte de choix retenue (panneau Style) : dans son coin, ou en fin de ligne (`inline`). */
function ChoiceMark({ inline = false }: { inline?: boolean }) {
  return (
    <span
      aria-hidden
      className={clsx(
        "grid size-5 shrink-0 place-items-center rounded-full bg-ds-section-accent text-white",
        inline ? "ml-auto" : "absolute right-1.5 top-1.5",
      )}
    >
      <Check size={12} strokeWidth={3} />
    </span>
  );
}

/** Compteur « 45/70 » d'un champ de l'aperçu du lien : au-delà du repère, un pictogramme et la graisse doublent la couleur. */
function LengthMark({ length, limit }: { length: number; limit: number }) {
  const over = length > limit;
  return (
    <span className={clsx("inline-flex shrink-0 items-center gap-1 text-xs ds-tnum", over ? "font-semibold text-ds-danger-700" : "text-ds-ink-600")}>
      {over ? <TriangleAlert size={12} strokeWidth={2.5} aria-hidden /> : null}
      {length}/{limit}
    </span>
  );
}

/** Étoile d'une note Google : décorative, le mot « note » est lu à sa place. */
function StarMark() {
  return (
    <>
      <Star size={13} aria-hidden className="mr-1 inline-block fill-current align-[-1.5px]" />
      <span className="sr-only">note </span>
    </>
  );
}

function FieldBlock({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <p className={clsx("mb-1.5", LABEL)}>{label}</p>
      {children}
      {hint ? <p className={clsx("mt-1.5", HINT)}>{hint}</p> : null}
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

  // Icône retenue : liseré épais à l'accent de la section, détaché de la pastille (et `aria-pressed`)
  const tile = (selected: boolean) =>
    clsx(
      "grid size-11 place-items-center rounded-full bg-white p-1.5 ds-focus ds-press",
      selected
        ? "ring-[3px] ring-ds-section-accent ring-offset-2"
        : "ring-1 ring-ds-ink-300 hover:ring-2 hover:ring-ds-section-line",
    );

  return (
    <div>
      {/* Aperçu façon onglet de navigateur */}
      <div className="mb-4 rounded-ds-sm bg-ds-ink-100 px-3 pt-2.5 ring-1 ring-ds-ink-200">
        <div className="flex items-end gap-3">
          <span aria-hidden className="mb-2 flex gap-1.5">
            <span className="size-2.5 rounded-full bg-ds-ink-300" />
            <span className="size-2.5 rounded-full bg-ds-ink-300" />
            <span className="size-2.5 rounded-full bg-ds-ink-300" />
          </span>
          <span className="flex min-w-0 items-center gap-2 rounded-t-lg bg-white px-3.5 py-2 text-ds-meta text-ds-ink-800 shadow-sm">
            <img src={display(value)} alt="" className="h-4 w-4 shrink-0 rounded-sm" />
            <span className="truncate">{siteName}</span>
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          title="Logo Harmony (défaut)"
          aria-label="Logo Harmony (défaut)"
          aria-pressed={value === ""}
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
            aria-pressed={value === `/favicons/${name}.svg`}
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
            aria-pressed
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
          className="grid size-11 place-items-center rounded-full border-2 border-dashed border-ds-ink-450 text-ds-brand-800 ds-focus ds-press hover:border-ds-brand-600 hover:bg-ds-brand-50 disabled:cursor-progress"
        >
          {uploading ? <Spinner className="size-[1.125rem]" label="Envoi en cours" /> : <Plus size={20} aria-hidden />}
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
      {error ? <FieldError>{error}</FieldError> : null}
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
      <span className={clsx("mb-1.5 block", LABEL)}>{label}</span>
      <input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={INPUT} />
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
    <div className="flex flex-wrap items-center gap-2">
      {value ? (
        <img src={value} alt="" className="size-12 shrink-0 rounded-ds-sm object-cover ring-1 ring-ds-ink-200" />
      ) : null}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        loading={uploading}
        icon={<Camera size={16} aria-hidden />}
        onClick={() => inputRef.current?.click()}
      >
        {uploading ? "Envoi…" : value ? "Changer la photo" : "Photo (facultatif)"}
      </Button>
      {value ? (
        <Button type="button" variant="quiet" size="sm" icon={<X size={16} aria-hidden />} onClick={() => onChange("")}>
          Retirer
        </Button>
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
      {error ? <FieldError className="mt-0 w-full">{error}</FieldError> : null}
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
        <div key={i} className="space-y-3 rounded-ds-md bg-ds-ink-50 p-4 ring-1 ring-ds-ink-200">
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
          <div className="flex justify-end">
            <button type="button" onClick={() => onChange(cabinets.filter((_, j) => j !== i))} className={DANGER_LINK}>
              <Trash2 size={15} aria-hidden />
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
          className={ADD_BUTTON}
        >
          <Plus size={18} aria-hidden />
          Ajouter un cabinet
        </button>
      ) : null}
    </div>
  );
}
