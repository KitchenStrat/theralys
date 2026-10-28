"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { clsx } from "clsx";
import { Badge, Button, Card, Spinner } from "@theralys/ui";
import {
  META_ADS_ANGLES,
  META_ADS_FORMATS,
  META_ADS_FORMAT_LABELS,
  META_ADS_TEXT,
  SOCIAL_SIZES,
  type MetaAdCreative,
  type MetaAdsCreativeSet,
  type MetaAdsFormat,
  type MetaAdsVideoPlan,
} from "@theralys/shared";
import { formatDayFr } from "@/lib/calendar";
import { ctaLabel, landingUrl, metaCreativeTxt } from "@/lib/meta-ads/clipboard";
import { regenerateMetaAds } from "./actions";
import { CopyButton } from "./copy-button";
import { RegenerateModal } from "./regenerate-modal";
import type { MetaTab } from "./tabs";
import { VideoPlanSection } from "./video-plan";

const GENERATION_FAILED_FALLBACK = "Les annonces n'ont pas pu être générées.";

const FORMAT_SHORT: Record<MetaAdsFormat, string> = { square: "Carré", portrait: "Portrait", story: "Story" };

export function angleLabel(angle: MetaAdCreative["angle"]): string {
  return META_ADS_ANGLES.find((a) => a.id === angle)?.label ?? angle;
}

export function CreativesTab({
  analysisId,
  creatives,
  videoPlan,
  analysisReady,
  generationError,
  instructions,
  regenRemaining,
  siteDomain,
  onSelectTab,
}: {
  analysisId: string | null;
  creatives: MetaAdsCreativeSet | null;
  videoPlan: MetaAdsVideoPlan | null;
  /** Analyse aboutie (diagnostic présent) : sans créas, elles peuvent être générées seules */
  analysisReady: boolean;
  /** Message d'erreur de l'analyse (génération en échec), déjà en français */
  generationError: string | null;
  instructions: string | null;
  regenRemaining: number;
  siteDomain: string;
  onSelectTab: (tab: MetaTab) => void;
}) {
  const [modalOpen, setModalOpen] = useState(false);

  if ((!creatives || !videoPlan) && analysisReady) {
    return <MissingCreativesCard error={generationError} remaining={regenRemaining} onSelectTab={onSelectTab} />;
  }

  if (!creatives || !videoPlan || !analysisId) {
    return (
      <Card className="p-8 text-center text-ink-500">
        <p className="font-medium text-ink-700">Vos annonces apparaîtront ici.</p>
        <p className="mt-1 text-sm">
          Lancez l&apos;analyse depuis l&apos;onglet Diagnostic : 3 à 5 annonces prêtes à publier (visuel en carré, portrait et story, texte
          principal, titre, description, bouton), puis un plan vidéo pour 3 vidéos courtes à tourner vous-même.
        </p>
        <div className="mt-5">
          <Button variant="secondary" onClick={() => onSelectTab("diagnostic")}>
            Aller au diagnostic
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          {/* Largeur minimale : sur mobile, le bouton passe à la ligne au lieu d'écraser le texte */}
          <div className="min-w-[16rem] flex-1">
            <h2 className="text-xl font-semibold">Vos annonces</h2>
            <p className="mt-1 text-sm text-ink-700">
              {creatives.creatives.length} créas statiques, un angle différent chacune, rendues dans les trois formats Meta avec vos photos et les
              couleurs de votre site. Téléchargez le visuel ou le kit complet, copiez les textes dans le Gestionnaire de publicités.
            </p>
            <p className="mt-2 text-xs text-ink-500">
              Préparées le {formatDayFr(creatives.generatedAt, "day")}
              {instructions ? " avec vos instructions" : ""}
              {creatives.generator === "mock" ? " · mode démonstration" : ""}.
            </p>
            {instructions ? <p className="mt-2 rounded-xl bg-cream-100 px-4 py-2 text-sm text-ink-700">« {instructions} »</p> : null}
          </div>
          <Button variant="secondary" onClick={() => setModalOpen(true)}>
            ✦ Instructions &amp; régénérer
          </Button>
        </div>
      </Card>

      {creatives.creatives.map((creative, index) => (
        <CreativeCard key={creative.id} analysisId={analysisId} creative={creative} index={index} siteDomain={siteDomain} />
      ))}

      {creatives.notes.length > 0 ? (
        <Card className="p-6">
          <h2 className="text-xl font-semibold">Conseils de déclinaison et de test</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-ink-700">
            {creatives.notes.map((n, i) => (
              <li key={`${i}-${n}`}>{n}</li>
            ))}
          </ul>
        </Card>
      ) : null}

      <VideoPlanSection plan={videoPlan} />

      <RegenerateModal open={modalOpen} onClose={() => setModalOpen(false)} remaining={regenRemaining} currentInstructions={instructions} />
    </div>
  );
}

/**
 * Analyse aboutie sans créas ou sans plan vidéo (génération en échec) : le
 * diagnostic est là, les annonces se génèrent seules — même action que la
 * régénération, sans instructions, décomptée du même quota mensuel.
 */
function MissingCreativesCard({ error, remaining, onSelectTab }: { error: string | null; remaining: number; onSelectTab: (tab: MetaTab) => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ error?: string; message?: string }>({});

  function generate() {
    setResult({});
    startTransition(async () => {
      const outcome = await regenerateMetaAds({});
      if (outcome.error) {
        setResult({ error: outcome.error });
        return;
      }
      setResult({ message: "Annonces générées : créas, plan vidéo et plan de campagne prêts." });
      router.refresh();
    });
  }

  return (
    <Card className="p-8 text-center text-ink-500">
      <p className="font-medium text-ink-700">{error?.trim() ? error.trim() : GENERATION_FAILED_FALLBACK}</p>
      <p className="mt-1 text-sm">
        Votre diagnostic et votre veille sont bien enregistrés : générez les annonces (créas, plan vidéo et plan de campagne) sans relancer
        l&apos;analyse.
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-3">
        <Button onClick={generate} disabled={pending || remaining <= 0} title={remaining <= 0 ? "Quota mensuel de générations atteint" : undefined}>
          {pending ? (
            <>
              <Spinner className="text-white" /> Génération…
            </>
          ) : (
            "✦ Générer les annonces"
          )}
        </Button>
        <Button variant="secondary" onClick={() => onSelectTab("diagnostic")}>
          Aller au diagnostic
        </Button>
      </div>
      <div aria-live="polite">
        {pending ? <p className="mt-3 text-sm text-ink-700">Génération en cours, jusqu&apos;à une minute…</p> : null}
        {result.error ? (
          <p className="mt-3 text-sm text-danger-500" role="alert">
            {result.error}
          </p>
        ) : null}
        {result.message ? (
          <p className="mt-3 text-sm text-success-500" role="status">
            {result.message}
          </p>
        ) : null}
      </div>
      <p className="mt-3 text-xs">
        {remaining} génération{remaining > 1 ? "s" : ""} restante{remaining > 1 ? "s" : ""} ce mois-ci.
      </p>
    </Card>
  );
}

function CreativeCard({ analysisId, creative, index, siteDomain }: { analysisId: string; creative: MetaAdCreative; index: number; siteDomain: string }) {
  const [size, setSize] = useState<MetaAdsFormat>("square");
  const base = `/api/meta-ads/${analysisId}/creatives/${creative.id}`;
  const allTexts = metaCreativeTxt(creative, siteDomain);
  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold">
            <span className="mr-2 text-ink-500">{index + 1}.</span>
            {creative.name}
          </h2>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-500">
            <Badge tone="info">{angleLabel(creative.angle)}</Badge>
            Page d&apos;atterrissage : <span className="font-medium text-ink-700">{landingUrl(siteDomain, creative.landingPath).replace(/^https?:\/\//, "")}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={`${base}/download?size=${size}`} download className="inline-flex items-center rounded-xl border border-ink-300 bg-white px-3 py-1.5 text-sm font-medium text-ink-900 hover:bg-cream-100">
            Télécharger le visuel ({FORMAT_SHORT[size].toLowerCase()})
          </a>
          <a href={`${base}/download?kit=1`} download className="inline-flex items-center rounded-xl bg-primary-500 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-primary-600">
            Télécharger le kit
          </a>
        </div>
      </div>

      <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div>
          <div className="flex flex-wrap gap-1" role="group" aria-label="Format du visuel">
            {META_ADS_FORMATS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setSize(f)}
                aria-pressed={size === f}
                title={META_ADS_FORMAT_LABELS[f]}
                className={clsx(
                  "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                  size === f ? "bg-primary-500 text-white" : "bg-cream-100 text-ink-700 hover:bg-cream-200",
                )}
              >
                {FORMAT_SHORT[f]}
              </button>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-ink-500">{META_ADS_FORMAT_LABELS[size]}</p>
          <Preview key={size} src={`${base}/render?size=${size}&preview=1`} size={size} alt={creative.altText} />
        </div>

        <div className="space-y-3">
          <TextField label="Texte principal" text={creative.primaryText} max={META_ADS_TEXT.primaryRecommended} hint={`${META_ADS_TEXT.primaryRecommended} caractères visibles avant « … voir plus » (maximum ${META_ADS_TEXT.primaryMax})`} hardMax={META_ADS_TEXT.primaryMax} multiline />
          <TextField label="Titre" text={creative.headline} max={META_ADS_TEXT.headlineMax} />
          <TextField label="Description" text={creative.description} max={META_ADS_TEXT.descriptionMax} />
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField label="Accroche sur le visuel" text={creative.hook} max={META_ADS_TEXT.hookMax} />
            <TextField label="Ligne secondaire" text={creative.subline} max={META_ADS_TEXT.sublineMax} />
          </div>
          <dl className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-cream-50 p-3">
              <dt className="text-xs text-ink-500">Bouton</dt>
              <dd className="text-sm font-medium text-ink-900">{ctaLabel(creative.cta)}</dd>
            </div>
            <div className="rounded-2xl bg-cream-50 p-3">
              <dt className="text-xs text-ink-500">Texte alternatif</dt>
              <dd className="text-sm text-ink-700">{creative.altText}</dd>
            </div>
          </dl>
          <div className="flex flex-wrap items-center gap-2 border-t border-cream-200 pt-3">
            <CopyButton text={allTexts} label="Copier tous les textes" />
            <CopyButton text={landingUrl(siteDomain, creative.landingPath)} label="Copier l'URL de la page" variant="ghost" />
          </div>
        </div>
      </div>
    </Card>
  );
}

/** Aperçu rendu (540 px de large) : état de chargement, échec avec « Réessayer ». */
function Preview({ src, size, alt }: { src: string; size: MetaAdsFormat; alt: string }) {
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState<"loading" | "ok" | "failed">("loading");
  const url = retry ? `${src}&r=${retry}` : src;
  const { w, h } = SOCIAL_SIZES[size];
  return (
    <div className="relative mt-2 overflow-hidden rounded-2xl bg-cream-100" style={{ aspectRatio: `${w} / ${h}`, maxWidth: size === "story" ? 300 : 420 }}>
      {state === "loading" ? (
        <div className="absolute inset-0 flex items-center justify-center" aria-live="polite">
          <Spinner />
          <span className="sr-only">Rendu du visuel…</span>
        </div>
      ) : null}
      {state === "failed" ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center text-sm text-ink-700">
          Le visuel n&apos;a pas pu être généré.
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setState("loading");
              setRetry((r) => r + 1);
            }}
          >
            Réessayer
          </Button>
        </div>
      ) : (
        <img
          key={url}
          src={url}
          alt={alt}
          width={540}
          height={Math.round((540 * h) / w)}
          onLoad={() => setState("ok")}
          onError={() => setState("failed")}
          className={clsx("h-full w-full object-cover transition-opacity", state === "ok" ? "opacity-100" : "opacity-0")}
        />
      )}
    </div>
  );
}

function TextField({
  label,
  text,
  max,
  hardMax,
  hint,
  multiline = false,
}: {
  label: string;
  text: string;
  /** Limite recommandée (compteur en orange au-delà) */
  max: number;
  /** Limite absolue (compteur en rouge au-delà) */
  hardMax?: number;
  hint?: string;
  multiline?: boolean;
}) {
  const over = text.length > max;
  const tooLong = hardMax !== undefined ? text.length > hardMax : over;
  return (
    <div className="rounded-xl border border-cream-200 bg-cream-50 px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold text-ink-900">{label}</p>
        <div className="flex items-center gap-2">
          <span className={clsx("tabular-nums text-[11px]", tooLong ? "font-semibold text-danger-500" : over ? "font-semibold text-warning-500" : "text-ink-500")}>
            {text.length}/{hardMax ?? max}
          </span>
          <CopyButton text={text} label="Copier" variant="ghost" />
        </div>
      </div>
      <p className={clsx("mt-1 text-sm text-ink-900", multiline && "whitespace-pre-line")}>{text || <span className="italic text-ink-500">—</span>}</p>
      {hint ? <p className="mt-1 text-[11px] text-ink-500">{hint}</p> : null}
    </div>
  );
}
