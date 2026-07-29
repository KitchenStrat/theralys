"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { clsx } from "clsx";
import { Button, Select, Spinner } from "@theralys/ui";
import {
  THEME_PRESETS,
  type Section,
  type ThemePreset,
  type FontPreset,
  type ThemeIntensity,
  type ThemeCorners,
  type ThemeAmbiance,
} from "@theralys/shared";
import { savePageSections, saveSiteSettings, saveSiteStyle } from "../../(app)/actions";
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
  };
  city: string;
  pages: PageRef[];
  selectedPage: { id: string; type: string; slug: string; sections: Section[] } | null;
};

type Panel = "contenu" | "style" | "parametres";
type StyleTab = "couleur" | "typo" | "forme";

/** Aperçus « Typo » — mêmes polices que les sites publics (chargées au layout). */
const FONT_CHOICES: { value: FontPreset; label: string; family: string }[] = [
  { value: "chaleureux", label: "Chaleureux", family: "'Fraunces', Georgia, serif" },
  { value: "elegant", label: "Élégant", family: "'Cormorant Garamond', Palatino, serif" },
  { value: "moderne", label: "Moderne", family: "'Inter', system-ui, sans-serif" },
  { value: "classique", label: "Classique", family: "'Lora', Georgia, serif" },
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

export function SiteEditor({ site, city, pages, selectedPage }: Props) {
  const router = useRouter();
  const [panel, setPanel] = useState<Panel>("contenu");
  const [sections, setSections] = useState<Section[]>(selectedPage?.sections ?? []);
  const [active, setActive] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
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
  const [logoUrl, setLogoUrl] = useState(site.logoUrl);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

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
      setDirty(true);
    } catch {
      setLogoError("Téléversement impossible — réessayez.");
    } finally {
      setLogoUploading(false);
      if (logoInputRef.current) logoInputRef.current.value = "";
    }
  }

  const previewPath = useMemo(() => {
    if (!selectedPage || selectedPage.type === "home") return "";
    if (selectedPage.type === "motif") return `/motifs/${selectedPage.slug}`;
    return "";
  }, [selectedPage]);

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
    } else {
      result = await saveSiteSettings({ name: siteName, bookingUrl, city: cityValue, logoUrl });
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
            ← Retour
          </Link>
          <Select
            aria-label="Page à éditer"
            value={selectedPage?.id ?? ""}
            onChange={(e) => router.push(`/editor?page=${e.target.value}`)}
            className="w-56"
          >
            {pages.map((page) => (
              <option key={page.id} value={page.id}>
                {page.type === "home" ? "Page d'accueil" : page.title}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <PanelTab label="Contenu" active={panel === "contenu"} onClick={() => setPanel("contenu")} />
          <PanelTab label="🎨 Style" active={panel === "style"} onClick={() => setPanel("style")} />
          <PanelTab label="⚙ Paramètres" active={panel === "parametres"} onClick={() => setPanel("parametres")} />
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
                          <SectionFields section={section} onChange={(patch) => updateSection(i, patch)} />
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

            {panel === "parametres" ? (
              <div className="space-y-4">
                <FieldBlock label="Nom du site">
                  <input
                    value={siteName}
                    onChange={(e) => {
                      setSiteName(e.target.value);
                      setDirty(true);
                    }}
                    className="w-full rounded-xl border border-ink-300 px-3 py-2 text-sm"
                  />
                </FieldBlock>
                <FieldBlock
                  label="Logo"
                  hint="Remplace le nom du site dans l'en-tête. PNG avec fond transparent recommandé."
                >
                  {logoUrl ? (
                    <img
                      src={logoUrl}
                      alt="Logo"
                      className="mb-2 h-14 w-auto max-w-full rounded-lg border border-cream-300 bg-white object-contain p-1"
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
                          setDirty(true);
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
                </FieldBlock>
                <FieldBlock label="Lien de prise de rendez-vous" hint="Doctolib, Calendly, Crenolib, tel:…">
                  <input
                    value={bookingUrl}
                    onChange={(e) => {
                      setBookingUrl(e.target.value);
                      setDirty(true);
                    }}
                    placeholder="https://www.doctolib.fr/…"
                    className="w-full rounded-xl border border-ink-300 px-3 py-2 text-sm"
                  />
                </FieldBlock>
                <FieldBlock label="Ville">
                  <input
                    value={cityValue}
                    onChange={(e) => {
                      setCityValue(e.target.value);
                      setDirty(true);
                    }}
                    className="w-full rounded-xl border border-ink-300 px-3 py-2 text-sm"
                  />
                </FieldBlock>
                <p className="text-xs text-ink-500">
                  Téléphone, adresse et horaires se modifient dans la section « Contact » de la
                  page d&apos;accueil (onglet Contenu).
                </p>
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
    </>
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
