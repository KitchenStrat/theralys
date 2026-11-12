"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type ReactNode, type RefObject } from "react";
import { clsx } from "clsx";
import {
  ArrowLeft,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  FileArchive,
  FileText,
  Info,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
} from "lucide-react";
import { FieldHint, Input, Modal, Segmented, Select } from "@theralys/ui";
import {
  captionFor,
  GOOGLE_REPLY_TONES,
  SOCIAL_NETWORKS,
  SOCIAL_POST_INSTRUCTIONS_MAX,
  SOCIAL_SIZES,
  type SocialNetwork,
  type SocialSize,
  type SocialVoice,
} from "@theralys/shared";
import {
  AiBadge,
  Badge,
  Button,
  GenerationProgress,
  InlineSuccess,
  Skeleton,
  type TimedStep,
} from "@/components/ds";
import { formatDayFr } from "@/lib/calendar";
import { SOCIAL_CAPTION_MAX } from "@/lib/social/caption";
import type { SocialCalendarItem } from "@/lib/social/data";
import { linkOptionsOf, type SocialSiteLink } from "@/lib/social/site-link";
import {
  archiveSocialPost,
  markSocialPostPublished,
  regenerateSocialPost,
  rescheduleSocialPost,
  updateSocialCaption,
} from "./actions";
import {
  ContentStatus,
  CustomBadge,
  Disclosure,
  DownloadLink,
  ErrorNote,
  FIELD_CLASS,
  FORMAT_LABEL,
  FormatTile,
  ModalHeader,
  TEXTAREA_CLASS,
  TOUCH_BUTTONS_CLASS,
  nbspFr,
  type ContentStatusKey,
} from "./social-ui";

const SIZE_LABEL: Record<SocialSize, string> = { square: "Carré", portrait: "Portrait", story: "Story", landscape: "Paysage" };
const SIZE_HELP: Record<SocialSize, string> = {
  square: "Carré 1080×1080 · Instagram, Facebook, LinkedIn",
  portrait: "Portrait 1080×1350 · Instagram, prend plus de place dans le fil",
  story: "Story 1080×1920 · stories Instagram et Facebook",
  landscape: "Paysage 1200×900 · posts Google",
};
const SIZE_ASPECT: Record<SocialSize, string> = {
  square: "aspect-square max-w-[540px]",
  portrait: "aspect-[4/5] max-w-[400px]",
  story: "aspect-[9/16] max-w-[260px] sm:max-w-[340px]",
  landscape: "aspect-[4/3] max-w-[560px]",
};
const NETWORKS: Record<SocialCalendarItem["format"], string> = {
  static: "Instagram, Facebook, LinkedIn",
  carousel: "Instagram, Facebook, LinkedIn",
  story: "Instagram, Facebook",
};

/**
 * Étapes d'une régénération (un seul appel, comme une demande sur mesure) :
 * la tâche ne remonte pas son avancement, le rythme est estimé et la dernière
 * étape dure jusqu'à la réponse.
 */
const REGEN_STEPS: TimedStep[] = [
  { label: "Lecture de votre site et de vos instructions", seconds: 4 },
  { label: "Rédaction de la nouvelle légende", seconds: 10 },
  { label: "Nouvelle mise en page", seconds: 8 },
];

/** Réseaux où le contenu se publie : LinkedIn n'a pas de stories. */
function networksFor(format: SocialCalendarItem["format"]) {
  return SOCIAL_NETWORKS.filter((n) => format !== "story" || n.id !== "linkedin");
}

/** Où afficher un message d'erreur : au plus près de l'action qui a échoué. */
type ErrorPlace = "caption" | "copy" | "regen" | "publish" | "manage";
/** Action en cours parmi celles qui partagent la même transition (un seul indicateur à la fois). */
type RunKind = "publish" | "date" | "remove";

export function SocialPostModal({
  item,
  todayIso,
  siteLink,
  bioLine,
  regenRemaining,
  defaultTone,
  onClose,
  onBack,
}: {
  item: SocialCalendarItem | null;
  todayIso: string;
  /** Site de référence (lien des légendes Facebook et LinkedIn) : adresse, et lien avec ou sans `src` */
  siteLink: SocialSiteLink;
  /** Ligne « lien dans ma bio » exacte insérée par le générateur */
  bioLine: string;
  /** Régénérations (instructions + ton) restantes ce mois-ci */
  regenRemaining: number;
  /** Ton de la voix du site : valeur initiale du sélecteur de ton */
  defaultTone: SocialVoice["tone"];
  onClose: () => void;
  /** Ouvert depuis la modale d'une journée : « Retour à la journée » */
  onBack?: () => void;
}) {
  if (!item) return null;
  // L'état local (taille, page, copies, légende en cours…) repart de zéro à chaque contenu
  return (
    <PostModalBody
      key={item.id}
      item={item}
      todayIso={todayIso}
      siteLink={siteLink}
      bioLine={bioLine}
      regenRemaining={regenRemaining}
      defaultTone={defaultTone}
      onClose={onClose}
      onBack={onBack}
    />
  );
}

function PostModalBody({
  item,
  todayIso,
  siteLink,
  bioLine,
  regenRemaining,
  defaultTone,
  onClose,
  onBack,
}: {
  item: SocialCalendarItem;
  todayIso: string;
  siteLink: SocialSiteLink;
  bioLine: string;
  regenRemaining: number;
  defaultTone: SocialVoice["tone"];
  onClose: () => void;
  onBack?: () => void;
}) {
  const router = useRouter();
  const [size, setSize] = useState<SocialSize>(item.sizes[0] ?? "square");
  const [slide, setSlide] = useState(0);
  const [retry, setRetry] = useState(0);
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const [errorUrl, setErrorUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState<SocialNetwork | "alt" | null>(null);
  const [downloaded, setDownloaded] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const [newDate, setNewDate] = useState(item.date);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [error, setError] = useState<{ place: ErrorPlace; message: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [running, setRunning] = useState<RunKind | null>(null);
  // Publié pendant cette ouverture de la fenêtre : la confirmation arrive avec sa coche
  const [justPublished, setJustPublished] = useState(false);
  const actionsRef = useRef<HTMLElement>(null);

  // Légende modifiable : repart de la légende enregistrée dès que le serveur la change (régénération)
  const [caption, setCaption] = useState(item.caption);
  const [captionMessage, setCaptionMessage] = useState<string | null>(null);
  const [savingCaption, startSavingCaption] = useTransition();
  useEffect(() => {
    setCaption(item.caption);
  }, [item.caption]);
  const captionDirty = caption !== item.caption;

  // Variante par réseau (aperçu + copie), calculée sur la légende affichée
  const [network, setNetwork] = useState<SocialNetwork>("instagram");
  const networks = networksFor(item.format);

  // Régénération : instructions libres + ton choisi
  const [instructions, setInstructions] = useState("");
  const [tone, setTone] = useState<SocialVoice["tone"]>(defaultTone);
  const [regenerating, startRegenerating] = useTransition();
  const [regenMessage, setRegenMessage] = useState<string | null>(null);
  const [remaining, setRemaining] = useState(regenRemaining);
  // « Régénérer », inactif pendant l'attente, a perdu le focus : il le retrouve à la réponse
  const wasRegenerating = useRef(false);
  const regenWaitingRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // L'attente s'affiche sous le bouton : elle est amenée à l'écran si elle en dépasse
    if (regenerating) regenWaitingRef.current?.scrollIntoView({ block: "nearest" });
    if (wasRegenerating.current && !regenerating && document.activeElement === document.body) {
      actionsRef.current?.querySelector<HTMLElement>('[data-focus="regen"]:not(:disabled)')?.focus({ preventScroll: true });
    }
    wasRegenerating.current = regenerating;
  }, [regenerating]);

  const isCarousel = item.format === "carousel";
  const published = item.status === "published";
  // Un contenu « nouvel article » est lié à son créneau : il se refait depuis « Préparer le mois », pas ici
  const announcesArticle = item.pillar === "nouvel_article";
  // Chaque bascule démonte le bouton cliqué : le focus suit l'élément qui le remplace
  useFocusAfterToggle(dateOpen, actionsRef, (open) => (open ? "new-date" : "change-date"));
  useFocusAfterToggle(confirmRemove, actionsRef, (confirm) => (confirm ? "keep" : "remove"));
  useFocusAfterToggle(published, actionsRef, (isPublished) => (isPublished ? "unpublish" : "publish"));
  // Un contenu régénéré peut changer de gabarit, donc de tailles disponibles
  useEffect(() => {
    if (!item.sizes.includes(size)) setSize(item.sizes[0] ?? "square");
  }, [item.sizes, size]);
  const previewUrl = `/api/social/${item.id}/render?size=${size}&slide=${slide}&preview=1${retry ? `&r=${retry}` : ""}`;
  const loading = loadedUrl !== previewUrl && errorUrl !== previewUrl;
  const failed = errorUrl === previewUrl;
  const captionSource = { caption, hashtags: item.hashtags };
  // Lien des légendes Facebook et LinkedIn : avec `src` vers le site hébergé, l'adresse seule vers le site du client
  const captionOf = (target: SocialNetwork) => captionFor(target, captionSource, siteLink.url, bioLine, linkOptionsOf(siteLink));
  const activeNetwork = networks.some((n) => n.id === network) ? network : "instagram";
  const networkCaption = captionOf(activeNetwork);
  const networkLabel = SOCIAL_NETWORKS.find((n) => n.id === activeNetwork)?.label ?? activeNetwork;
  const otherNetworks = networks.filter((n) => n.id !== activeNetwork);

  const isDownloaded = Boolean(item.downloadedAt) || downloaded;
  const statusBadge: { status: ContentStatusKey; label: string } = published
    ? { status: "publie", label: `Publié le ${formatDayFr(item.publishedAt ?? item.date)}` }
    : item.downloadedAt
      ? { status: "telecharge", label: `Téléchargé le ${formatDayFr(item.downloadedAt)}` }
      : downloaded
        ? { status: "telecharge", label: "Téléchargé" }
        : { status: "a-telecharger", label: `À télécharger — prévu le ${formatDayFr(item.date)}` };
  // Une seule action principale, celle de l'étape où en est le contenu : télécharger, puis marquer comme publié
  const mainStep: "download" | "publish" | null = published ? null : isDownloaded ? "publish" : "download";

  async function copy(text: string, what: SocialNetwork | "alt") {
    try {
      await navigator.clipboard.writeText(text);
      setError(null);
      setCopied(what);
      setTimeout(() => setCopied((c) => (c === what ? null : c)), 2000);
    } catch {
      setError({ place: "copy", message: "Copie impossible — sélectionnez le texte et copiez-le manuellement." });
    }
  }

  function run(kind: RunKind, action: () => Promise<{ error?: string }>, after?: () => void) {
    setError(null);
    setRunning(kind);
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        setError({ place: kind === "publish" ? "publish" : "manage", message: result.error });
        return;
      }
      router.refresh();
      after?.();
    });
  }

  function saveCaption() {
    setError(null);
    setCaptionMessage(null);
    startSavingCaption(async () => {
      const result = await updateSocialCaption({ postId: item.id, caption });
      if (result.error) {
        setError({ place: "caption", message: result.error });
        return;
      }
      if (typeof result.caption === "string") setCaption(result.caption);
      setCaptionMessage("Légende enregistrée.");
      router.refresh();
    });
  }

  function regenerate() {
    setError(null);
    setRegenMessage(null);
    setCaptionMessage(null);
    startRegenerating(async () => {
      const result = await regenerateSocialPost({ postId: item.id, instructions, tone });
      if (result.error) {
        setError({ place: "regen", message: result.error });
        return;
      }
      if (typeof result.remaining === "number") setRemaining(result.remaining);
      setInstructions("");
      setSlide(0);
      setLoadedUrl(null);
      setErrorUrl(null);
      // Nouveau visuel : l'URL d'aperçu change pour forcer le rechargement
      setRetry((r) => r + 1);
      setRegenMessage("Contenu régénéré : nouvelle légende et nouveau visuel.");
      router.refresh();
    });
  }

  function onDownload() {
    setDownloaded(true);
    // `downloaded_at` est posé par la route : rafraîchir pour la bordure du calendrier
    setTimeout(() => router.refresh(), 1500);
  }

  const download = (kind: "image" | "zip" | "pdf" | "caption" | "all") =>
    `/api/social/${item.id}/download?kind=${kind}${kind === "caption" ? "" : `&size=${size}`}`;
  const busy = pending || savingCaption || regenerating;
  // Pourquoi « Régénérer » est désactivé (aide au survol), sinon undefined
  const regenBlocked = announcesArticle
    ? "Ce contenu annonce un nouvel article : il se régénère depuis « Préparer le mois » après l'avoir retiré."
    : remaining <= 0
      ? "Quota mensuel de régénérations atteint"
      : captionDirty
        ? "Enregistrez ou annulez votre légende avant de régénérer"
        : undefined;
  const firstNetwork = networks[0]?.label ?? "Instagram";
  const alternatives = networks
    .slice(1)
    .map((n) => n.label)
    .join(", ");
  const errorAt = (place: ErrorPlace) =>
    error?.place === place ? <ErrorNote className="mt-3">{error.message}</ErrorNote> : null;

  return (
    <Modal open onClose={onClose} title={item.topic} size="xl" plain>
      {/* Bandeau : retour, sujet, format, statut, origine */}
      <ModalHeader
        title={nbspFr(item.topic)}
        onClose={onClose}
        lead={
          <span className="hidden sm:block">
            <FormatTile format={item.format} accentColor={item.accentColor} size="lg" />
          </span>
        }
        before={
          onBack ? (
            <Button
              variant="quiet"
              size="sm"
              className="-ml-3"
              icon={<ArrowLeft size={16} aria-hidden />}
              onClick={onBack}
            >
              Retour à la journée
            </Button>
          ) : undefined
        }
      >
        <p className="mt-1 text-ds-body text-ds-ink-700">
          {FORMAT_LABEL[item.format]}
          {isCarousel ? ` · ${item.slideCount} pages` : ""} · {NETWORKS[item.format]}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <ContentStatus status={statusBadge.status}>{statusBadge.label}</ContentStatus>
          {item.source === "request" ? <CustomBadge /> : null}
          <AiBadge />
        </div>
      </ModalHeader>

      <div className="space-y-5 px-5 py-5 sm:px-8 sm:py-6">
        {/* Note d'adaptation du générateur */}
        {item.note ? (
          <p className="flex items-start gap-2.5 rounded-ds-sm bg-ds-warning-100 px-4 py-3 text-ds-body text-ds-warning-900">
            <Info size={18} aria-hidden className="mt-0.5 shrink-0" />
            <span className="min-w-0">{item.note}</span>
          </p>
        ) : null}

        {/* minmax(0, 1fr) + min-w-0 : la bande de vignettes défile au lieu d'élargir la colonne */}
        <div className="grid gap-x-8 gap-y-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          {/* Aperçu : reste à l'écran pendant que la colonne de droite défile, si la fenêtre est assez haute */}
          <section
            aria-label="Aperçu"
            className="min-w-0 self-start lg:[@media(min-height:50rem)]:sticky lg:[@media(min-height:50rem)]:top-6"
          >
            {item.sizes.length > 1 ? (
              <Segmented
                aria-label="Taille du visuel"
                options={item.sizes.map((s) => ({ value: s, label: SIZE_LABEL[s] }))}
                value={size}
                onChange={(s) => {
                  setSize(s);
                  setSlide(0);
                }}
                className={clsx("inline-flex", TOUCH_BUTTONS_CLASS)}
              />
            ) : null}
            <p className="mt-2 text-ds-meta text-ds-ink-600">{SIZE_HELP[size]}</p>

            <div
              className={clsx(
                "relative mx-auto mt-3 w-full overflow-hidden rounded-ds-md bg-ds-ink-100 shadow-ds-card ring-1 ring-ds-ink-900/10 lg:mx-0",
                SIZE_ASPECT[size],
              )}
            >
              {loading ? (
                <div className="absolute inset-0 grid place-items-center">
                  <Skeleton className="absolute inset-0 rounded-none" />
                  <span className="relative px-4 text-center text-ds-body font-medium text-ds-ink-700">
                    {regenerating ? "Nouveau visuel en préparation…" : "Préparation du visuel…"}
                  </span>
                </div>
              ) : null}
              {failed ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center text-ds-body text-ds-ink-700">
                  Le visuel n&apos;a pas pu être généré.
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<RotateCcw size={16} aria-hidden />}
                    onClick={() => setRetry((r) => r + 1)}
                  >
                    Réessayer
                  </Button>
                </div>
              ) : (
                <img
                  key={previewUrl}
                  src={previewUrl}
                  alt={item.altText}
                  width={540}
                  height={Math.round((540 * SOCIAL_SIZES[size].h) / SOCIAL_SIZES[size].w)}
                  onLoad={() => setLoadedUrl(previewUrl)}
                  onError={() => setErrorUrl(previewUrl)}
                  className={clsx("h-full w-full object-cover transition-opacity", loading ? "opacity-0" : "opacity-100")}
                />
              )}
            </div>

            {isCarousel ? (
              <div className="mt-3">
                <div className="flex items-center justify-between text-ds-body font-medium text-ds-ink-700">
                  <button
                    type="button"
                    aria-label="Page précédente"
                    disabled={slide === 0}
                    onClick={() => setSlide((s) => Math.max(0, s - 1))}
                    className="grid size-11 place-items-center rounded-full text-ds-brand-800 ds-focus ds-press hover:bg-ds-section-tint-2 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                  >
                    <ChevronLeft size={22} aria-hidden />
                  </button>
                  <span className="ds-tnum">
                    Page {slide + 1} / {item.slideCount}
                  </span>
                  <button
                    type="button"
                    aria-label="Page suivante"
                    disabled={slide >= item.slideCount - 1}
                    onClick={() => setSlide((s) => Math.min(item.slideCount - 1, s + 1))}
                    className="grid size-11 place-items-center rounded-full text-ds-brand-800 ds-focus ds-press hover:bg-ds-section-tint-2 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                  >
                    <ChevronRight size={22} aria-hidden />
                  </button>
                </div>
                <div className="mt-1 flex min-w-0 gap-2 overflow-x-auto p-1">
                  {item.slides.map((s, i) => (
                    <button
                      key={i}
                      type="button"
                      aria-label={`Page ${i + 1} : ${s.title}`}
                      aria-current={i === slide ? "true" : undefined}
                      onClick={() => setSlide(i)}
                      className={clsx(
                        "h-16 shrink-0 overflow-hidden rounded-ds-sm bg-ds-ink-100 ds-focus",
                        i === slide
                          ? "ring-2 ring-ds-section-accent ring-offset-2"
                          : "ring-1 ring-ds-ink-900/10 hover:ring-ds-ink-450",
                      )}
                      style={{ width: Math.round((64 * SOCIAL_SIZES[size].w) / SOCIAL_SIZES[size].h) }}
                    >
                      <img
                        src={`/api/social/${item.id}/render?size=${size}&slide=${i}&preview=1${retry ? `&r=${retry}` : ""}`}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </section>

          {/* Prêt à poster : les trois gestes, dans l'ordre */}
          <section aria-label="Prêt à poster" ref={actionsRef} className="min-w-0 space-y-4">
            {/* 1 — Télécharger */}
            <div className="rounded-ds-md p-4 ring-1 ring-ds-ink-200">
              <StepTitle n={1} done={isDownloaded || published}>
                Téléchargez le visuel
              </StepTitle>
              <div className="mt-3 flex flex-col gap-2">
                {isCarousel ? (
                  <>
                    <DownloadLink
                      href={download("zip")}
                      onClick={onDownload}
                      variant={mainStep === "download" ? "primary" : "secondary"}
                      icon={<Download size={18} aria-hidden />}
                    >
                      Télécharger les pages (ZIP de JPG)
                    </DownloadLink>
                    <DownloadLink href={download("pdf")} onClick={onDownload} icon={<FileText size={18} aria-hidden />}>
                      Version PDF pour LinkedIn
                    </DownloadLink>
                  </>
                ) : (
                  <DownloadLink
                    href={download("image")}
                    onClick={onDownload}
                    variant={mainStep === "download" ? "primary" : "secondary"}
                    icon={<Download size={18} aria-hidden />}
                  >
                    Télécharger le visuel (JPG)
                  </DownloadLink>
                )}
                <div className="flex flex-wrap gap-1">
                  <DownloadLink
                    href={download("caption")}
                    onClick={onDownload}
                    variant="quiet"
                    size="sm"
                    icon={<FileText size={16} aria-hidden />}
                  >
                    Légendes (.txt)
                  </DownloadLink>
                  <DownloadLink
                    href={download("all")}
                    onClick={onDownload}
                    variant="quiet"
                    size="sm"
                    icon={<FileArchive size={16} aria-hidden />}
                  >
                    Tout en un ZIP
                  </DownloadLink>
                </div>
              </div>
              <FieldHint>
                JPG : accepté par tous les réseaux. Le .txt contient une légende par réseau. Sur iPhone, appui long →
                Enregistrer l&apos;image ; les ZIP s&apos;ouvrent dans Fichiers.
              </FieldHint>
            </div>

            {/* 2 — Légende : modifiable, puis copiée pour le réseau choisi */}
            <div className="rounded-ds-md p-4 ring-1 ring-ds-ink-200">
              <StepTitle n={2}>Copiez la légende</StepTitle>
              <div className="mt-3 flex items-center justify-between gap-2">
                <label htmlFor={`caption-${item.id}`} className="text-ds-body font-semibold text-ds-ink-900">
                  Légende
                </label>
                <span className="text-ds-meta text-ds-ink-600 ds-tnum">
                  {caption.length} / {SOCIAL_CAPTION_MAX}
                </span>
              </div>
              <textarea
                id={`caption-${item.id}`}
                value={caption}
                onChange={(e) => {
                  setCaptionMessage(null);
                  setCaption(e.target.value.slice(0, SOCIAL_CAPTION_MAX));
                }}
                maxLength={SOCIAL_CAPTION_MAX}
                rows={7}
                disabled={regenerating}
                className={clsx(TEXTAREA_CLASS, "mt-1 resize-y bg-white leading-relaxed disabled:opacity-60")}
              />
              {captionDirty ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<Save size={16} aria-hidden />}
                    loading={savingCaption}
                    onClick={saveCaption}
                    disabled={busy || caption.trim() === ""}
                  >
                    Enregistrer
                  </Button>
                  <Button
                    size="sm"
                    variant="quiet"
                    disabled={savingCaption}
                    onClick={() => {
                      setCaption(item.caption);
                      setCaptionMessage(null);
                    }}
                  >
                    Annuler
                  </Button>
                  <span className="text-ds-meta text-ds-ink-600">Modifications non enregistrées</span>
                </div>
              ) : captionMessage ? (
                <InlineSuccess className="mt-2">{captionMessage}</InlineSuccess>
              ) : null}
              {errorAt("caption")}
              <FieldHint>
                {item.hashtags.length > 0
                  ? `Modifiez le texte à votre guise ; les ${item.hashtags.length} hashtags du contenu sont ajoutés selon le réseau.`
                  : "Modifiez le texte à votre guise."}
              </FieldHint>

              {/* Variantes par réseau */}
              <h4 className="mt-4 text-ds-body font-semibold text-ds-ink-900">Copier pour un réseau</h4>
              <Segmented
                aria-label="Réseau"
                options={networks.map((n) => ({ value: n.id, label: n.label }))}
                value={activeNetwork}
                onChange={setNetwork}
                className={clsx("mt-2 inline-flex max-w-full", TOUCH_BUTTONS_CLASS)}
              />
              <textarea
                readOnly
                value={networkCaption}
                aria-label={`Légende pour ${networkLabel}`}
                className={clsx(TEXTAREA_CLASS, "mt-2 h-32 resize-none bg-ds-ink-50")}
              />
              <Button
                variant="secondary"
                className="mt-2 w-full"
                icon={copied === activeNetwork ? <Check size={18} aria-hidden /> : <Copy size={18} aria-hidden />}
                onClick={() => copy(captionOf(activeNetwork), activeNetwork)}
              >
                {copied === activeNetwork ? "Légende copiée !" : `Copier pour ${networkLabel}`}
              </Button>
              {otherNetworks.length > 0 ? (
                <div className="mt-1 flex flex-wrap items-center gap-x-1">
                  {otherNetworks.map((n) => (
                    <Button
                      key={n.id}
                      variant="quiet"
                      size="sm"
                      icon={copied === n.id ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
                      onClick={() => copy(captionOf(n.id), n.id)}
                    >
                      {copied === n.id ? "Légende copiée !" : `Copier pour ${n.label}`}
                    </Button>
                  ))}
                </div>
              ) : null}
              {/* La copie est annoncée sans déplacer le focus */}
              <span role="status" className="sr-only">
                {copied === "alt" ? "Texte alternatif copié." : copied ? "Légende copiée." : ""}
              </span>
              {errorAt("copy")}
              <FieldHint>
                {siteLink.sourceParam
                  ? "Instagram : « lien dans ma bio » et tous les hashtags. Facebook et LinkedIn : le lien de votre site (tracé dans vos statistiques) et 3 hashtags."
                  : "Instagram : « lien dans ma bio » et tous les hashtags. Facebook et LinkedIn : l'adresse de votre site et 3 hashtags."}
              </FieldHint>
              <Disclosure summary="Texte alternatif" className="mt-3">
                <p>{item.altText}</p>
                <Button
                  variant="quiet"
                  size="sm"
                  className="-ml-2"
                  icon={copied === "alt" ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
                  onClick={() => copy(item.altText, "alt")}
                >
                  {copied === "alt" ? "Copié !" : "Copier"}
                </Button>
              </Disclosure>
            </div>

            {/* 3 — Publier sur le réseau, puis le dire ici */}
            <div className="rounded-ds-md p-4 ring-1 ring-ds-ink-200">
              <StepTitle n={3} done={published}>
                Publiez, puis cochez ici
              </StepTitle>
              <p className="mt-2 text-ds-body text-ds-ink-700">
                Ouvrez {firstNetwork}
                {alternatives ? ` (ou ${alternatives})` : ""} et créez une publication avec ce fichier
                {isCarousel ? " — pour un carrousel, sélectionnez toutes les pages dans l'ordre" : ""}. Collez la légende
                du réseau, puis revenez ici et marquez le contenu comme publié.
              </p>
              <div className="mt-3">
                {published ? (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    {justPublished ? (
                      <InlineSuccess>Publié le {formatDayFr(item.publishedAt ?? item.date)}</InlineSuccess>
                    ) : (
                      <p className="inline-flex items-center gap-2.5 text-ds-body font-semibold text-ds-success-900">
                        <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-full bg-ds-success-600 text-white">
                          <Check size={14} strokeWidth={3} />
                        </span>
                        Publié le {formatDayFr(item.publishedAt ?? item.date)}
                      </p>
                    )}
                    <Button
                      variant="quiet"
                      size="sm"
                      disabled={busy}
                      data-focus="unpublish"
                      onClick={() =>
                        run(
                          "publish",
                          () => markSocialPostPublished(item.id, false),
                          () => setJustPublished(false),
                        )
                      }
                    >
                      Annuler
                    </Button>
                  </div>
                ) : (
                  <Button
                    className="w-full"
                    variant={mainStep === "publish" ? "primary" : "secondary"}
                    icon={<Check size={18} aria-hidden />}
                    loading={pending && running === "publish"}
                    disabled={busy}
                    data-focus="publish"
                    onClick={() =>
                      run(
                        "publish",
                        () => markSocialPostPublished(item.id, true),
                        () => setJustPublished(true),
                      )
                    }
                  >
                    Marquer comme publié
                  </Button>
                )}
              </div>
              {errorAt("publish")}
            </div>

            {/* Régénération (contenu non publié) */}
            {!published ? (
              <div className="rounded-ds-md bg-ds-section-tint p-4 ring-1 ring-ds-section-line/70">
                <h3 className="flex items-center gap-2 font-ds-display text-lg/7 font-bold text-ds-section-ink">
                  <Sparkles size={18} aria-hidden className="shrink-0 text-ds-section-accent" />
                  Envie d&apos;une autre version&nbsp;?
                </h3>
                <label htmlFor={`instructions-${item.id}`} className="mt-2 block text-ds-body font-semibold text-ds-ink-900">
                  Instructions pour régénérer ce contenu
                </label>
                <p className="mt-0.5 text-ds-meta text-ds-ink-600">
                  Facultatif : ce que vous voulez changer (angle, longueur, élément à mentionner). Le sujet, le format, la
                  date et la couleur sont conservés ; la légende, les hashtags et le visuel sont refaits.
                </p>
                <textarea
                  id={`instructions-${item.id}`}
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value.slice(0, SOCIAL_POST_INSTRUCTIONS_MAX))}
                  maxLength={SOCIAL_POST_INSTRUCTIONS_MAX}
                  rows={3}
                  disabled={regenerating}
                  placeholder="Ex. : insistez sur la respiration, une légende plus courte, terminez par une question."
                  className={clsx(TEXTAREA_CLASS, "mt-2 bg-white disabled:opacity-60")}
                />
                <div className="mt-2 flex items-center gap-2.5">
                  <label htmlFor={`tone-${item.id}`} className="shrink-0 text-ds-body font-medium text-ds-ink-700">
                    Ton
                  </label>
                  <Select
                    id={`tone-${item.id}`}
                    value={tone}
                    onChange={(e) => setTone(e.target.value as SocialVoice["tone"])}
                    disabled={regenerating}
                    className={clsx(FIELD_CLASS, "min-w-0")}
                  >
                    {GOOGLE_REPLY_TONES.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                        {t.id === defaultTone ? " (votre voix)" : ""}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-ds-meta text-ds-ink-600">
                    {instructions.length} / {SOCIAL_POST_INSTRUCTIONS_MAX} · {remaining} régénération{remaining > 1 ? "s" : ""}{" "}
                    restante{remaining > 1 ? "s" : ""} ce mois-ci
                  </p>
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<Sparkles size={16} aria-hidden />}
                    loading={regenerating}
                    data-focus="regen"
                    onClick={regenerate}
                    disabled={busy || regenBlocked !== undefined}
                    title={regenBlocked}
                    aria-describedby={regenBlocked ? `regen-help-${item.id}` : undefined}
                  >
                    Régénérer
                  </Button>
                </div>
                {regenBlocked ? (
                  <p id={`regen-help-${item.id}`} className="mt-2 text-ds-meta text-ds-ink-600">
                    {regenBlocked}
                  </p>
                ) : null}
                {regenerating && error === null ? (
                  <div
                    ref={regenWaitingRef}
                    className="mt-3 scroll-mb-4 rounded-ds-sm bg-white p-4 shadow-ds-card ring-1 ring-ds-ink-900/5 ds-fade-in"
                  >
                    <GenerationProgress
                      title="Harmony prépare une nouvelle version"
                      steps={REGEN_STEPS}
                      running
                      estimate="10 à 30 secondes"
                      hint="Ne fermez pas la page."
                    />
                  </div>
                ) : null}
                {regenMessage ? <InlineSuccess className="mt-3">{regenMessage}</InlineSuccess> : null}
                {errorAt("regen")}
              </div>
            ) : null}

            {item.sourceRefs.length > 0 ? (
              <div>
                <h3 className="text-ds-body font-semibold text-ds-ink-900">D&apos;après votre site :</h3>
                <div className="mt-2 flex flex-wrap gap-2">
                  {item.sourceRefs.map((ref) => (
                    <SourceBadge key={ref.id} href={ref.href} label={ref.label} />
                  ))}
                </div>
              </div>
            ) : null}

            {/* Autres gestes : changer la date, retirer */}
            <div className="border-t border-ds-ink-200 pt-3">
              <div className="flex flex-wrap items-center gap-x-1 gap-y-2">
                {!published ? (
                  dateOpen ? (
                    <form
                      className="flex basis-full flex-wrap items-center gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        run(
                          "date",
                          () => rescheduleSocialPost({ postId: item.id, date: newDate }),
                          () => setDateOpen(false),
                        );
                      }}
                    >
                      <div className="min-w-40 flex-1">
                        <Input
                          type="date"
                          aria-label="Nouvelle date"
                          data-focus="new-date"
                          value={newDate}
                          min={todayIso}
                          onChange={(e) => setNewDate(e.target.value)}
                          className={FIELD_CLASS}
                          required
                        />
                      </div>
                      <Button
                        type="submit"
                        size="sm"
                        variant="secondary"
                        loading={pending && running === "date"}
                        disabled={busy}
                      >
                        Enregistrer
                      </Button>
                      <Button type="button" variant="quiet" size="sm" onClick={() => setDateOpen(false)}>
                        Annuler
                      </Button>
                    </form>
                  ) : (
                    <Button
                      variant="quiet"
                      size="sm"
                      icon={<CalendarDays size={16} aria-hidden />}
                      data-focus="change-date"
                      onClick={() => setDateOpen(true)}
                    >
                      Changer la date
                    </Button>
                  )
                ) : null}

                {confirmRemove ? (
                  <div className="flex basis-full flex-wrap items-center gap-2">
                    <span className="text-ds-body text-ds-ink-700">Retirer ? Il disparaîtra du calendrier.</span>
                    <Button
                      variant="danger"
                      size="sm"
                      loading={pending && running === "remove"}
                      disabled={busy}
                      onClick={() => run("remove", () => archiveSocialPost(item.id), onClose)}
                    >
                      Retirer
                    </Button>
                    <Button variant="quiet" size="sm" data-focus="keep" onClick={() => setConfirmRemove(false)}>
                      Garder
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="quiet"
                    size="sm"
                    icon={<Trash2 size={16} aria-hidden />}
                    data-focus="remove"
                    onClick={() => setConfirmRemove(true)}
                  >
                    Retirer ce contenu
                  </Button>
                )}
              </div>
              {errorAt("manage")}
            </div>
          </section>
        </div>
      </div>
    </Modal>
  );
}

/** Titre d'une étape du parcours : son numéro, remplacé par une coche quand elle est faite. */
function StepTitle({ n, done = false, children }: { n: number; done?: boolean; children: ReactNode }) {
  return (
    <h3 className="flex items-center gap-2.5 font-ds-display text-lg/7 font-bold text-ds-ink-900">
      <span
        aria-hidden
        className={clsx(
          "grid size-7 shrink-0 place-items-center rounded-full text-ds-meta font-bold",
          done ? "bg-ds-success-600 text-white" : "bg-ds-section-gradient-deep text-ds-section-on-deep",
        )}
      >
        {done ? <Check size={15} strokeWidth={3} /> : n}
      </span>
      <span className="min-w-0">
        <span className="sr-only">Étape {n} : </span>
        {children}
        {done ? <span className="sr-only"> — fait</span> : null}
      </span>
    </h3>
  );
}

/**
 * Après un basculement d'affichage (`value` change), place le focus sur
 * l'élément `[data-focus=<cible>]` qui remplace le bouton cliqué. Rien au
 * premier rendu : le focus initial appartient à la modale.
 */
function useFocusAfterToggle<T>(
  value: T,
  root: RefObject<HTMLElement | null>,
  targetFor: (value: T) => string,
) {
  const previous = useRef(value);
  useEffect(() => {
    if (previous.current === value) return;
    previous.current = value;
    root.current?.querySelector<HTMLElement>(`[data-focus="${targetFor(value)}"]`)?.focus();
  }, [value, root, targetFor]);
}

/** Source du contenu (page, article, avis) : toujours dans un nouvel onglet, la modale reste ouverte. */
function SourceBadge({ href, label }: { href?: string; label: string }) {
  if (!href) return <Badge tone="neutral">{label}</Badge>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-ds-sm bg-ds-ink-100 px-3 py-1.5 text-ds-meta font-medium text-ds-brand-800 ds-focus hover:bg-ds-brand-100 pointer-coarse:min-h-11"
    >
      <span className="min-w-0">{label}</span>
      <ExternalLink size={14} aria-hidden className="shrink-0" />
      <span className="sr-only"> (nouvel onglet)</span>
    </a>
  );
}
