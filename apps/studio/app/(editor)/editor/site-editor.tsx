"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import { clsx } from "clsx";
import { Button, Select, Spinner } from "@theralys/ui";
import type { Section } from "@theralys/shared";
import { savePageSections, saveSiteSettings, saveSiteStyle } from "../../(app)/actions";
import { SectionFields } from "./section-fields";

type PageRef = { id: string; type: string; slug: string; title: string };

type Props = {
  site: {
    id: string;
    name: string;
    bookingUrl: string;
    themePreset: "terracotta" | "sauge" | "ocean" | "lavande" | "ambre";
    fontPreset: "classique" | "moderne" | "elegant";
    url: string;
    updatedAt: string;
  };
  city: string;
  pages: PageRef[];
  selectedPage: { id: string; type: string; slug: string; sections: Section[] } | null;
};

type Panel = "contenu" | "style" | "parametres";

const THEME_SWATCHES: Record<Props["site"]["themePreset"], string> = {
  terracotta: "#b05038",
  sauge: "#587c5e",
  ocean: "#33658a",
  lavande: "#6f5b9c",
  ambre: "#a8762b",
};

export function SiteEditor({ site, city, pages, selectedPage }: Props) {
  const router = useRouter();
  const [panel, setPanel] = useState<Panel>("contenu");
  const [sections, setSections] = useState<Section[]>(selectedPage?.sections ?? []);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Style & paramètres
  const [themePreset, setThemePreset] = useState(site.themePreset);
  const [fontPreset, setFontPreset] = useState(site.fontPreset);
  const [siteName, setSiteName] = useState(site.name);
  const [bookingUrl, setBookingUrl] = useState(site.bookingUrl);
  const [cityValue, setCityValue] = useState(city);

  const previewPath = useMemo(() => {
    if (!selectedPage || selectedPage.type === "home") return "";
    if (selectedPage.type === "motif") return `/motifs/${selectedPage.slug}`;
    return "";
  }, [selectedPage]);

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
      result = await saveSiteStyle({ preset: themePreset, fontPreset });
    } else {
      result = await saveSiteSettings({ name: siteName, bookingUrl, city: cityValue });
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
                {page.title}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <span
            title="Vidéo tutoriel (2 min) — bientôt disponible"
            className="hidden items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-ink-500 sm:inline-flex"
          >
            ▶ Tutoriel
          </span>
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
                <div className="space-y-4">
                  {sections.map((section, i) => (
                    <SectionFields
                      key={`${section.type}-${i}`}
                      section={section}
                      onChange={(patch) => updateSection(i, patch)}
                    />
                  ))}
                </div>
              ) : (
                <p className="p-4 text-sm text-ink-500">Aucune section éditable sur cette page.</p>
              )
            ) : null}

            {panel === "style" ? (
              <div className="space-y-5">
                <div>
                  <p className="text-sm font-semibold">Palette du site</p>
                  <div className="mt-2 flex gap-2">
                    {(Object.keys(THEME_SWATCHES) as (keyof typeof THEME_SWATCHES)[]).map((preset) => (
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
                          "h-9 w-9 rounded-full border-2 transition-transform",
                          themePreset === preset ? "scale-110 border-ink-900" : "border-transparent",
                        )}
                        style={{ background: THEME_SWATCHES[preset] }}
                      />
                    ))}
                  </div>
                  <p className="mt-1 text-xs capitalize text-ink-500">{themePreset}</p>
                </div>
                <div>
                  <p className="text-sm font-semibold">Polices</p>
                  <Select
                    aria-label="Jeu de polices"
                    value={fontPreset}
                    onChange={(e) => {
                      setFontPreset(e.target.value as typeof fontPreset);
                      setDirty(true);
                    }}
                    className="mt-2"
                  >
                    <option value="classique">Classique (titres serif)</option>
                    <option value="moderne">Moderne (sans serif)</option>
                    <option value="elegant">Élégant (tout serif)</option>
                  </Select>
                </div>
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
                <FieldBlock label="Lien de prise de rendez-vous" hint="Calendly, Crenolib, tel:…">
                  <input
                    value={bookingUrl}
                    onChange={(e) => {
                      setBookingUrl(e.target.value);
                      setDirty(true);
                    }}
                    placeholder="https://calendly.com/…"
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
            src={`${site.url}${previewPath}`}
            title="Prévisualisation de votre site"
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
