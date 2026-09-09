"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { clsx } from "clsx";
import { Button, Spinner } from "@theralys/ui";
import {
  THEME_PRESETS,
  TRACKING_ID_PATTERNS,
  type Section,
  type SiteCabinet,
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
import { SECTION_LABELS, SectionFields } from "./section-fields";

type PageRef = { id: string; type: string; slug: string; title: string };

type Props = {
  site: {
    id: string;
    name: string;
    bookingUrl: string;
    themePreset: ThemePreset;
    fontPreset: FontPreset;
    intensity: ThemeIntensity;
    corners: ThemeCorners;
    ambiance: ThemeAmbiance;
    logoUrl: string;
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
  pages: PageRef[];
  selectedPage: { id: string; type: string; slug: string; sections: Section[] } | null;
};

type Panel = "contenu" | "style";
type StyleTab = "couleur" | "typo" | "forme";

/** Catégories de la fenêtre Paramètres (navigation de gauche). */
type SettingsTab =
  | "identite"
  | "logo"
  | "apercu"
  | "favicon"
  | "coordonnees"
  | "google"
  | "cabinets"
  | "tracking";

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
    family: "'Fraunces', Georgia, serif",
    bodyFamily: "'Nunito', 'Trebuchet MS', sans-serif",
  },
  {
    value: "elegant",
    label: "Élégant",
    family: "'Cormorant Garamond', Palatino, serif",
    bodyFamily: "'EB Garamond', Palatino, serif",
  },
  {
    value: "moderne",
    label: "Moderne",
    family: "'Space Grotesk', system-ui, sans-serif",
    bodyFamily: "'Inter', system-ui, sans-serif",
  },
  {
    value: "classique",
    label: "Classique",
    family: "'Playfair Display', Georgia, serif",
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
  ocean: "#33658a",
  marine: "#3f5873",
  lavande: "#6f5b9c",
};

export function SiteEditor({
  site,
  city,
  phone,
  seo,
  tracking,
  googleBusiness,
  pages,
  selectedPage,
}: Props) {
  const router = useRouter();
  const [panel, setPanel] = useState<Panel>("contenu");
  const [sections, setSections] = useState<Section[]>(selectedPage?.sections ?? []);
  const [active, setActive] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  // Activation des pages de spécialité (optimiste, persistée côté serveur)
  const [disabledMotifs, setDisabledMotifs] = useState<string[]>(site.disabledMotifs);
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
  } | null>(null);

  async function togglePageEnabled(slug: string, enabled: boolean) {
    setDisabledMotifs((prev) => (enabled ? prev.filter((s) => s !== slug) : [...prev, slug]));
    const result = await setMotifPageEnabled({ slug, enabled });
    if (result.error) {
      // Retour arrière si le serveur a refusé
      setDisabledMotifs((prev) => (enabled ? [...prev, slug] : prev.filter((s) => s !== slug)));
      return;
    }
    setPreviewKey((k) => k + 1); // cartes de l'accueil et navigation changent
    router.refresh();
  }
  const [previewKey, setPreviewKey] = useState(0);
  const [feedback, setFeedback] = useState<string | null>(null);

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

  function openSettings() {
    settingsSnapshot.current = {
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
    };
    setSettingsFeedback(null);
    setSettingsDirty(false);
    setSettingsOpen(true);
  }

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
    settingsSnapshot.current = {
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
    };
    setSettingsDirty(false);
    setSettingsFeedback("Publié ✓ — votre site est à jour.");
    setPreviewKey((k) => k + 1);
    router.refresh();
  }

  const previewPath = useMemo(() => {
    if (!selectedPage || selectedPage.type === "home") return "";
    // ?apercu=1 : les pages désactivées restent prévisualisables dans l'éditeur
    if (selectedPage.type === "motif") return `/motifs/${selectedPage.slug}?apercu=1`;
    return "";
  }, [selectedPage]);

  const activeSettingsLabel =
    SETTINGS_NAV.flatMap((g) => g.items).find((i) => i.id === settingsTab)?.label ?? "";

  // ── Pont avec l'aperçu (EditorBridge côté site public) ────────────────────
  function announceEditor() {
    // Plusieurs annonces : l'hydratation du site peut suivre l'événement load
    const send = () =>
      iframeRef.current?.contentWindow?.postMessage({ type: "hy:hello" }, siteOrigin);
    send();
    let tries = 0;
    const interval = setInterval(() => {
      send();
      if (++tries >= 5) clearInterval(interval);
    }, 600);
  }

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== siteOrigin) return;
      const data = event.data as { type?: string; index?: number } | null;
      if (data?.type === "hy:select" && typeof data.index === "number") {
        setPanel("contenu");
        setActive(data.index);
        cardRefs.current[data.index]?.scrollIntoView({ behavior: "smooth", block: "nearest" });
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
          <PagePicker
            pages={pages}
            selectedPage={selectedPage}
            disabledMotifs={disabledMotifs}
            onSelect={(id) => router.push(`/editor?page=${id}`)}
            onToggle={togglePageEnabled}
          />
        </div>

        <div className="flex items-center gap-2">
          <PanelTab label="Contenu" active={panel === "contenu"} onClick={() => setPanel("contenu")} />
          <PanelTab label="🎨 Style" active={panel === "style"} onClick={() => setPanel("style")} />
          <PanelTab label="⚙ Paramètres" active={settingsOpen} onClick={openSettings} />
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
            {panel === "contenu" ? (
              sections.length > 0 ? (
                <div className="space-y-2">
                  <p className="mb-3 rounded-xl bg-cream-100 px-3 py-2 text-xs text-ink-500">
                    💡 Cliquez sur une section de l&apos;aperçu à droite pour l&apos;ouvrir ici,
                    puis modifiez textes et photos.
                  </p>
                  {sections.map((section, i) => (
                    <div
                      key={`${section.type}-${i}`}
                      ref={(el) => {
                        cardRefs.current[i] = el;
                      }}
                      className={clsx(
                        "rounded-2xl border transition-colors",
                        active === i ? "border-primary-400 shadow-sm" : "border-cream-300",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => selectSection(i)}
                        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-semibold"
                      >
                        {SECTION_LABELS[section.type]}
                        <span aria-hidden className="text-ink-500">
                          {active === i ? "−" : "+"}
                        </span>
                      </button>
                      {active === i ? (
                        <div className="border-t border-cream-200 p-4">
                          <SectionFields
                            section={section}
                            onChange={(patch) => updateSection(i, patch)}
                            onPageRegenerated={() => {
                              setPreviewKey((k) => k + 1);
                              router.refresh();
                            }}
                          />
                        </div>
                      ) : null}
                    </div>
                  ))}
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
                      <div className="mt-2 grid grid-cols-5 gap-2">
                        {THEME_PRESETS.map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            title={preset}
                            aria-pressed={themePreset === preset}
                            onClick={() => {
                              setThemePreset(preset);
                              setDirty(true);
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
        </aside>

        <div className="min-w-0 flex-1 bg-cream-200 p-4">
          <iframe
            key={previewKey}
            ref={iframeRef}
            src={`${site.url}${previewPath}`}
            title="Prévisualisation de votre site"
            onLoad={announceEditor}
            className="h-full w-full rounded-2xl border border-cream-300 bg-white shadow-card"
          />
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
                {trackingErrors.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => setSettingsTab("tracking")}
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
                          {item.id === "tracking" && trackingErrors.length > 0 ? (
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

/** Interrupteur des cartes de la catégorie Tracking. */
function ToggleSwitch({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={clsx(
        "relative h-6 w-11 shrink-0 rounded-full transition-colors",
        checked ? "bg-primary-500" : "bg-ink-300",
      )}
    >
      <span
        aria-hidden
        className={clsx(
          "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-[left]",
          checked ? "left-[22px]" : "left-0.5",
        )}
      />
    </button>
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

/**
 * Sélecteur de page : liste les pages du site et, pour chaque page de
 * spécialité, un petit contrôle Activé/Désactivé (pastille + menu) — une page
 * désactivée n'est plus servie sur le site public mais reste éditable ici.
 */
function PagePicker({
  pages,
  selectedPage,
  disabledMotifs,
  onSelect,
  onToggle,
}: {
  pages: PageRef[];
  selectedPage: { id: string } | null;
  disabledMotifs: string[];
  onSelect: (id: string) => void;
  onToggle: (slug: string, enabled: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const current = pages.find((p) => p.id === selectedPage?.id);
  const label = current ? (current.type === "home" ? "Page d'accueil" : current.title) : "Choisir une page";

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Page à éditer"
        onClick={() => setOpen((o) => !o)}
        className="flex w-64 items-center justify-between gap-2 rounded-xl border border-ink-300 bg-white px-3 py-2 text-sm focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
      >
        <span className="truncate">{label}</span>
        <span aria-hidden className={clsx("text-ink-500 transition-transform", open && "rotate-180")}>
          ⌄
        </span>
      </button>

      {open ? (
        <div className="absolute left-0 top-full z-50 mt-1 w-80 rounded-xl border border-cream-300 bg-white p-1 shadow-lg">
          {pages.map((page) => {
            const isHome = page.type === "home";
            const enabled = !disabledMotifs.includes(page.slug);
            return (
              <div
                key={page.id}
                className={clsx(
                  "flex items-center justify-between gap-2 rounded-lg px-2 py-1.5",
                  page.id === selectedPage?.id ? "bg-primary-50" : "hover:bg-cream-100",
                )}
              >
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onSelect(page.id);
                  }}
                  className={clsx(
                    "min-w-0 flex-1 truncate text-left text-sm",
                    !isHome && !enabled && "text-ink-500 line-through decoration-ink-300",
                  )}
                >
                  {isHome ? "Page d'accueil" : page.title}
                </button>
                {!isHome ? (
                  <label className="flex shrink-0 cursor-pointer items-center gap-1.5">
                    <span
                      aria-hidden
                      className={clsx(
                        "h-2 w-2 rounded-full",
                        enabled ? "bg-[#22a06b]" : "bg-danger-500",
                      )}
                    />
                    <select
                      aria-label={`Activation de la page « ${page.title} »`}
                      value={enabled ? "on" : "off"}
                      onChange={(event) => onToggle(page.slug, event.target.value === "on")}
                      className="cursor-pointer rounded-md border-0 bg-transparent py-0.5 pr-1 text-xs font-medium text-ink-700 focus:outline-none focus:ring-2 focus:ring-primary-100"
                    >
                      <option value="on">Activé</option>
                      <option value="off">Désactivé</option>
                    </select>
                  </label>
                ) : null}
              </div>
            );
          })}
          <p className="mt-1 border-t border-cream-200 px-2 pb-1 pt-2 text-xs text-ink-500">
            Une page désactivée n'apparaît plus sur votre site (carte, menu, Google) mais reste
            éditable ici.
          </p>
        </div>
      ) : null}
    </div>
  );
}
