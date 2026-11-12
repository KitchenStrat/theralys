"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { clsx } from "clsx";
import { GalleryVerticalEnd, ImageOff, Lightbulb, RotateCcw, Sparkles, TriangleAlert } from "lucide-react";
import { AiBadge, Badge, Button, Card, CardHeader, EmptyState, GenerationProgress, InlineSuccess, Skeleton } from "@/components/ds";
import {
  META_ADS_ANGLES,
  META_ADS_FORMATS,
  META_ADS_FORMAT_LABELS,
  META_ADS_TEXT,
  SOCIAL_SIZES,
  type MetaAdCreative,
  type MetaAdsCreativeSet,
  type MetaAdsFormat,
  type MetaAdsPlan,
  type MetaAdsVideoPlan,
} from "@theralys/shared";
import { formatDayFr } from "@/lib/calendar";
import { LANDING_UNAVAILABLE } from "@/lib/google-ads/analysis-site";
import { ctaLabel, metaCreativeTxt, metaLandingUrl, type MetaLanding } from "@/lib/meta-ads/clipboard";
import { pageInitials } from "@/lib/meta-ads/market-view";
import { metaCreativeDownloadUrl, metaCreativePreviewUrl } from "@/lib/meta-ads/urls";
import { regenerateMetaAds } from "./actions";
import { GENERATION_STEPS } from "./analysis-progress";
import { CopyButton } from "./copy-button";
import { DownloadLink, MetaLine, Notice, PressedSegments, StepNumber } from "./parts";
import { RegenerateModal } from "./regenerate-modal";
import type { MetaTab } from "./tabs";
import { VideoPlanSection } from "./video-plan";

const GENERATION_FAILED_FALLBACK = "Les annonces n'ont pas pu être générées.";
const PLAN_FAILED_FALLBACK = "Le plan de campagne n'a pas pu être généré.";

const FORMAT_SHORT: Record<MetaAdsFormat, string> = { square: "Carré", portrait: "Portrait", story: "Story" };

export function angleLabel(angle: MetaAdCreative["angle"]): string {
  return META_ADS_ANGLES.find((a) => a.id === angle)?.label ?? angle;
}

export function CreativesTab({
  analysisId,
  creatives,
  videoPlan,
  plan,
  analysisReady,
  generationError,
  instructions,
  regenRemaining,
  landing,
  externalSite,
  siteName,
  onSelectTab,
}: {
  analysisId: string | null;
  creatives: MetaAdsCreativeSet | null;
  videoPlan: MetaAdsVideoPlan | null;
  /** Plan de campagne (généré avec les créas) : absent, la régénération le produit */
  plan: MetaAdsPlan | null;
  /** Analyse aboutie (diagnostic présent) : sans créas, elles peuvent être générées seules */
  analysisReady: boolean;
  /** Message d'erreur de l'analyse (génération en échec), déjà en français */
  generationError: string | null;
  instructions: string | null;
  regenRemaining: number;
  /** Site de l'analyse et suffixe de son plan : de quoi composer l'adresse d'atterrissage de chaque créa */
  landing: MetaLanding;
  /** Analyse préparée pour le site du client : « votre site » désigne alors le sien, pas celui dont viennent les couleurs des visuels */
  externalSite: boolean;
  /** Nom du cabinet : il signe l'aperçu de chaque annonce, comme le fera la page Facebook */
  siteName: string;
  onSelectTab: (tab: MetaTab) => void;
}) {
  const [modalOpen, setModalOpen] = useState(false);

  if ((!creatives || !videoPlan) && analysisReady) {
    return <MissingCreativesCard error={generationError} remaining={regenRemaining} onSelectTab={onSelectTab} />;
  }

  if (!creatives || !videoPlan || !analysisId) {
    return (
      <Card padding="none">
        <EmptyState
          as="h2"
          icon={GalleryVerticalEnd}
          title="Vos annonces apparaîtront ici."
          action={<Button onClick={() => onSelectTab("diagnostic")}>Aller au diagnostic</Button>}
        >
          Lancez l&apos;analyse depuis l&apos;onglet Diagnostic : 3 à 5 annonces prêtes à publier (visuel en carré, portrait et story, texte
          principal, titre, description, bouton), puis un plan vidéo pour 3 vidéos courtes à tourner vous-même.
        </EmptyState>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          icon={GalleryVerticalEnd}
          title="Vos annonces"
          description={
            <>
              {creatives.creatives.length} créas statiques, un angle différent chacune, rendues dans les trois formats Meta avec vos photos et{" "}
              {externalSite ? "vos couleurs" : "les couleurs de votre site"}. Téléchargez le visuel ou le kit complet, copiez les textes dans le
              Gestionnaire de publicités.
            </>
          }
          action={
            <Button variant="secondary" onClick={() => setModalOpen(true)} icon={<Sparkles size={18} aria-hidden />}>
              Instructions &amp; régénérer
            </Button>
          }
        />
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
          <AiBadge />
          <MetaLine>
            Préparées le {formatDayFr(creatives.generatedAt, "day")}
            {instructions ? " avec vos instructions" : ""}
            {creatives.generator === "mock" ? " · mode démonstration" : ""}.
          </MetaLine>
        </div>
        {instructions ? (
          <Notice tone="section" className="mt-4">
            <p className="text-ds-meta font-semibold text-ds-section-ink">Vos instructions</p>
            <p>« {instructions} »</p>
          </Notice>
        ) : null}
      </Card>

      {!plan ? (
        // Créas et plan vidéo présents, plan de campagne manquant (génération en échec) : la même régénération le produit
        <div role="alert" className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-ds-card bg-ds-warning-100 px-5 py-4 text-ds-warning-900">
          {/* Largeur minimale : sur mobile, le bouton passe à la ligne au lieu d'écraser le texte */}
          <div className="flex min-w-[min(16rem,100%)] flex-1 items-start gap-3">
            <TriangleAlert size={20} aria-hidden className="mt-0.5 shrink-0 text-ds-warning-700" />
            <div className="min-w-0">
              <p className="text-base font-semibold">{generationError?.trim() ? generationError.trim() : PLAN_FAILED_FALLBACK}</p>
              <p className="mt-0.5 text-ds-body">
                Vos créas et votre plan vidéo sont là ; régénérez les annonces pour obtenir le plan de campagne (onglet Plan et ciblage).
              </p>
            </div>
          </div>
          <Button
            onClick={() => setModalOpen(true)}
            disabled={regenRemaining <= 0}
            title={regenRemaining <= 0 ? "Quota mensuel de régénérations atteint" : undefined}
            icon={<Sparkles size={18} aria-hidden />}
          >
            Régénérer
          </Button>
        </div>
      ) : null}

      {creatives.creatives.map((creative, index) => (
        // Clé versionnée : après une régénération, la carte (et son aperçu) se remonte au lieu de garder l'ancien visuel
        <CreativeCard
          key={`${creative.id}-${creatives.generatedAt}`}
          analysisId={analysisId}
          creative={creative}
          version={creatives.generatedAt}
          index={index}
          landing={landing}
          siteName={siteName}
        />
      ))}

      {creatives.notes.length > 0 ? (
        <Card>
          <CardHeader icon={Lightbulb} title="Conseils de déclinaison et de test" />
          <ul className="mt-4 space-y-2.5 text-base text-ds-ink-700">
            {creatives.notes.map((n, i) => (
              <li key={`${i}-${n}`} className="flex items-start gap-3">
                <span aria-hidden className="mt-2.5 size-1.5 shrink-0 rounded-full bg-ds-section-accent" />
                {n}
              </li>
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
    <Card padding="none">
      <EmptyState
        as="h2"
        icon={ImageOff}
        title={error?.trim() ? error.trim() : GENERATION_FAILED_FALLBACK}
        action={
          <Button
            onClick={generate}
            loading={pending}
            disabled={remaining <= 0}
            title={remaining <= 0 ? "Quota mensuel de générations atteint" : undefined}
            icon={<Sparkles size={18} aria-hidden />}
          >
            {pending ? "Génération…" : "Générer les annonces"}
          </Button>
        }
        secondary={
          <Button variant="secondary" onClick={() => onSelectTab("diagnostic")}>
            Aller au diagnostic
          </Button>
        }
        className="pb-6 sm:pb-7"
      >
        Votre diagnostic et votre veille sont bien enregistrés : générez les annonces (créas, plan vidéo et plan de campagne) sans relancer
        l&apos;analyse.
      </EmptyState>
      <div className="flex flex-col items-center px-5 pb-8 text-center sm:px-8">
        <MetaLine>
          {remaining} génération{remaining > 1 ? "s" : ""} restante{remaining > 1 ? "s" : ""} ce mois-ci.
        </MetaLine>
        {/* Région vivante : l'attente et son issue y sont annoncées ; le détail des étapes s'affiche dessous, hors région */}
        <div aria-live="polite" className="w-full">
          {pending ? <p className="sr-only">Génération en cours, jusqu&apos;à une minute…</p> : null}
          {result.error ? (
            <Notice tone="danger" icon={TriangleAlert} role="alert" className="mx-auto mt-4 max-w-xl text-left">
              {result.error}
            </Notice>
          ) : null}
          {result.message ? (
            <InlineSuccess className="mt-4 text-left">{result.message}</InlineSuccess>
          ) : null}
        </div>
        {pending ? (
          <div className="mt-5 w-full max-w-xl rounded-ds-md bg-ds-ink-50 p-4 text-left inset-ring inset-ring-ds-ink-200">
            <GenerationProgress title="Nous préparons vos annonces" steps={GENERATION_STEPS} running estimate="jusqu'à une minute" />
          </div>
        ) : null}
      </div>
    </Card>
  );
}

function CreativeCard({
  analysisId,
  creative,
  version,
  index,
  landing,
  siteName,
}: {
  analysisId: string;
  creative: MetaAdCreative;
  /** Date de génération du jeu de créas : versionne l'URL d'aperçu */
  version: string;
  index: number;
  landing: MetaLanding;
  siteName: string;
}) {
  const [size, setSize] = useState<MetaAdsFormat>("square");
  const allTexts = metaCreativeTxt(creative, landing);
  // Adresse de la page sur le site de l'analyse ; `null` quand ce site n'est plus la référence (rien n'est alors composé)
  const pageUrl = metaLandingUrl(landing, creative.landingPath);
  const pageAddress = pageUrl ? pageUrl.replace(/^https?:\/\//, "") : null;
  const headingId = `meta-crea-${creative.id}`;
  return (
    <Card as="article" aria-labelledby={headingId}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 flex-[1_1_18rem] items-start gap-3.5">
          <StepNumber size="lg">{index + 1}</StepNumber>
          <div className="min-w-0">
            <h2 id={headingId} className="font-ds-display text-lg/7 font-bold text-ds-ink-900 sm:text-xl/7">
              <span className="sr-only">{index + 1}. </span>
              {creative.name}
            </h2>
            <p className="mt-0.5 text-ds-body text-ds-ink-600">
              Page d&apos;atterrissage : <span className="font-medium break-all text-ds-ink-800">{pageAddress ?? LANDING_UNAVAILABLE}</span>
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Badge tone="section">{angleLabel(creative.angle)}</Badge>
          <AiBadge />
        </div>
      </div>

      <div className="mt-5 grid gap-x-8 gap-y-6 xl:grid-cols-[minmax(0,26.25rem)_minmax(0,1fr)]">
        {/* L'annonce telle qu'elle se présentera dans le fil : la page, le texte, le visuel, puis le lien et son bouton */}
        <div>
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <PressedSegments
              label="Format du visuel"
              value={size}
              onChange={setSize}
              options={META_ADS_FORMATS.map((f) => ({ id: f, label: FORMAT_SHORT[f], title: META_ADS_FORMAT_LABELS[f] }))}
            />
            <MetaLine>{META_ADS_FORMAT_LABELS[size]}</MetaLine>
          </div>
          <figure className="mx-auto mt-3 overflow-hidden rounded-ds-md bg-white shadow-ds-card ring-1 ring-ds-ink-200 xl:mx-0" style={{ maxWidth: size === "story" ? 300 : 420 }}>
            <figcaption className="sr-only">Aperçu de l&apos;annonce « {creative.name} » dans le fil</figcaption>
            <div aria-hidden className="flex items-center gap-2.5 px-3.5 pt-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-ds-section-gradient text-ds-meta font-bold text-ds-section-on">
                {pageInitials(siteName)}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-ds-body font-semibold text-ds-ink-900">{siteName}</span>
                <span className="block text-xs text-ds-ink-600">Sponsorisé</span>
              </span>
            </div>
            <p aria-hidden className="px-3.5 pt-2.5 pb-3 text-ds-body whitespace-pre-line text-ds-ink-900">
              <FeedText text={creative.primaryText} />
            </p>
            <Preview key={size} src={metaCreativePreviewUrl(analysisId, creative.id, size, version)} size={size} alt={creative.altText} />
            <div aria-hidden className="flex items-center gap-3 bg-ds-ink-100 px-3.5 py-3">
              <span className="min-w-0 flex-1">
                {pageAddress ? <span className="block truncate text-xs text-ds-ink-600">{pageAddress.split(/[/?]/)[0]}</span> : null}
                <span className="block truncate text-ds-body font-semibold text-ds-ink-900">{creative.headline}</span>
                {creative.description ? <span className="block truncate text-ds-meta text-ds-ink-600">{creative.description}</span> : null}
              </span>
              <span className="shrink-0 rounded-lg bg-ds-ink-300 px-3 py-2 text-ds-meta font-semibold text-ds-ink-900">{ctaLabel(creative.cta)}</span>
            </div>
          </figure>
          <MetaLine className="mt-2 text-center xl:text-left">Aperçu indicatif : Meta adapte la présentation à chaque emplacement.</MetaLine>
          <div className="mt-3 flex flex-wrap justify-center gap-2 xl:justify-start">
            <DownloadLink href={metaCreativeDownloadUrl(analysisId, creative.id, { size })}>Télécharger le visuel ({FORMAT_SHORT[size].toLowerCase()})</DownloadLink>
            <DownloadLink href={metaCreativeDownloadUrl(analysisId, creative.id, { kit: true })}>Télécharger le kit</DownloadLink>
          </div>
        </div>

        <div className="space-y-3">
          <TextField
            label="Texte principal"
            text={creative.primaryText}
            max={META_ADS_TEXT.primaryRecommended}
            hint={`${META_ADS_TEXT.primaryRecommended} caractères visibles avant « … voir plus » (maximum ${META_ADS_TEXT.primaryMax})`}
            hardMax={META_ADS_TEXT.primaryMax}
            multiline
          />
          <TextField label="Titre" text={creative.headline} max={META_ADS_TEXT.headlineMax} />
          <TextField label="Description" text={creative.description} max={META_ADS_TEXT.descriptionMax} />
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField label="Accroche sur le visuel" text={creative.hook} max={META_ADS_TEXT.hookMax} />
            <TextField label="Ligne secondaire" text={creative.subline} max={META_ADS_TEXT.sublineMax} />
          </div>
          <dl className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-ds-md bg-ds-section-tint px-4 py-3 inset-ring inset-ring-ds-section-line/70">
              <dt className="text-ds-meta font-semibold text-ds-ink-700">Bouton</dt>
              <dd className="mt-0.5 text-base font-semibold text-ds-section-ink">{ctaLabel(creative.cta)}</dd>
            </div>
            <div className="rounded-ds-md bg-ds-section-tint px-4 py-3 inset-ring inset-ring-ds-section-line/70">
              <dt className="text-ds-meta font-semibold text-ds-ink-700">Texte alternatif</dt>
              <dd className="mt-0.5 text-ds-body text-ds-ink-700">{creative.altText}</dd>
            </div>
          </dl>
          <div className="flex flex-wrap items-center gap-2 border-t border-ds-ink-200 pt-4">
            <CopyButton text={allTexts} label="Copier tous les textes" />
            {pageUrl ? <CopyButton text={pageUrl} label="Copier l'URL de la page" /> : null}
          </div>
        </div>
      </div>
    </Card>
  );
}

/** Texte principal tel que le fil le montre : coupé à la longueur visible, suivi de « … voir plus ». */
function FeedText({ text }: { text: string }) {
  const visible = META_ADS_TEXT.primaryRecommended;
  if (text.length <= visible) return <>{text}</>;
  return (
    <>
      {text.slice(0, visible).trimEnd()}… <span className="font-medium text-ds-ink-600">voir plus</span>
    </>
  );
}

/** Aperçu rendu (540 px de large) : état de chargement, échec avec « Réessayer ». */
function Preview({ src, size, alt }: { src: string; size: MetaAdsFormat; alt: string }) {
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState<"loading" | "ok" | "failed">("loading");
  const url = retry ? `${src}&r=${retry}` : src;
  const { w, h } = SOCIAL_SIZES[size];
  return (
    <div className="relative overflow-hidden bg-ds-section-tint-2" style={{ aspectRatio: `${w} / ${h}` }}>
      {state === "loading" ? (
        <div className="absolute inset-0" aria-live="polite">
          <Skeleton className="size-full rounded-none" />
          <span className="sr-only">Rendu du visuel…</span>
        </div>
      ) : null}
      {state === "failed" ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center text-ds-body text-ds-ink-700">
          <ImageOff size={28} aria-hidden className="text-ds-section-accent" />
          Le visuel n&apos;a pas pu être généré.
          <Button
            variant="secondary"
            size="sm"
            icon={<RotateCcw size={16} aria-hidden />}
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
          className={clsx("relative h-full w-full object-cover", state === "ok" ? "ds-fade-in" : "opacity-0")}
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
  /** Limite recommandée (compteur signalé au-delà) */
  max: number;
  /** Limite absolue (compteur en erreur au-delà) */
  hardMax?: number;
  hint?: string;
  multiline?: boolean;
}) {
  const over = text.length > max;
  const tooLong = hardMax !== undefined ? text.length > hardMax : over;
  return (
    <div className="rounded-ds-md bg-ds-ink-50 px-4 py-3 inset-ring inset-ring-ds-ink-200">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p className="text-ds-meta font-semibold text-ds-ink-700">{label}</p>
        <div className="-mr-2 flex items-center gap-1.5">
          {/* Le dépassement se lit sans la couleur : une icône et un mot l'accompagnent */}
          <span
            className={clsx(
              "inline-flex items-center gap-1 text-ds-meta ds-tnum",
              tooLong ? "font-semibold text-ds-danger-700" : over ? "font-semibold text-ds-warning-700" : "text-ds-ink-600",
            )}
          >
            {tooLong || over ? <TriangleAlert size={14} aria-hidden /> : null}
            {text.length}/{hardMax ?? max}
            {tooLong ? <span> · trop long</span> : over ? <span> · long</span> : null}
          </span>
          <CopyButton text={text} label="Copier" variant="quiet" />
        </div>
      </div>
      <p className={clsx("mt-1 text-base text-ds-ink-900", multiline && "whitespace-pre-line")}>{text || <span className="text-ds-ink-600 italic">—</span>}</p>
      {hint ? <p className="mt-1.5 text-ds-meta text-ds-ink-600">{hint}</p> : null}
    </div>
  );
}
