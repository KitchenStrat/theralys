"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type ReactNode, type RefObject } from "react";
import { clsx } from "clsx";
import { Badge, Button, FieldHint, Input, Modal, Segmented, Spinner } from "@theralys/ui";
import { SOCIAL_SIZES, type SocialSize } from "@theralys/shared";
import { formatDayFr } from "@/lib/calendar";
import type { SocialCalendarItem } from "@/lib/social/data";
import { archiveSocialPost, markSocialPostPublished, rescheduleSocialPost } from "./actions";
import { FORMAT_LABEL } from "./day-modal";

const SIZE_LABEL: Record<SocialSize, string> = { square: "Carré", portrait: "Portrait", story: "Story", landscape: "Paysage" };
const SIZE_HELP: Record<SocialSize, string> = {
  square: "Carré 1080×1080 · Instagram, Facebook, LinkedIn",
  portrait: "Portrait 1080×1350 · Instagram, prend plus de place dans le fil",
  story: "Story 1080×1920 · stories Instagram et Facebook",
  landscape: "Paysage 1200×900 · posts Google",
};
const SIZE_ASPECT: Record<SocialSize, string> = {
  square: "aspect-square max-w-[540px]",
  portrait: "aspect-[4/5] max-w-[480px]",
  story: "aspect-[9/16] max-w-[340px]",
  landscape: "aspect-[4/3] max-w-[560px]",
};
const NETWORKS: Record<SocialCalendarItem["format"], string> = {
  static: "Instagram, Facebook, LinkedIn",
  carousel: "Instagram, Facebook, LinkedIn",
  story: "Instagram, Facebook",
};

export function SocialPostModal({
  item,
  todayIso,
  onClose,
  onBack,
}: {
  item: SocialCalendarItem | null;
  todayIso: string;
  onClose: () => void;
  /** Ouvert depuis la modale d'une journée : « ← Retour à la journée » */
  onBack?: () => void;
}) {
  if (!item) return null;
  // L'état local (taille, page, copies…) repart de zéro à chaque contenu
  return <PostModalBody key={item.id} item={item} todayIso={todayIso} onClose={onClose} onBack={onBack} />;
}

function PostModalBody({
  item,
  todayIso,
  onClose,
  onBack,
}: {
  item: SocialCalendarItem;
  todayIso: string;
  onClose: () => void;
  onBack?: () => void;
}) {
  const router = useRouter();
  const [size, setSize] = useState<SocialSize>(item.sizes[0] ?? "square");
  const [slide, setSlide] = useState(0);
  const [retry, setRetry] = useState(0);
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const [errorUrl, setErrorUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState<"caption" | "alt" | null>(null);
  const [downloaded, setDownloaded] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const [newDate, setNewDate] = useState(item.date);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const actionsRef = useRef<HTMLDivElement>(null);

  const isCarousel = item.format === "carousel";
  const published = item.status === "published";
  // Chaque bascule démonte le bouton cliqué : le focus suit l'élément qui le remplace
  useFocusAfterToggle(dateOpen, actionsRef, (open) => (open ? "new-date" : "change-date"));
  useFocusAfterToggle(confirmRemove, actionsRef, (confirm) => (confirm ? "keep" : "remove"));
  useFocusAfterToggle(published, actionsRef, (isPublished) => (isPublished ? "unpublish" : "publish"));
  const previewUrl = `/api/social/${item.id}/render?size=${size}&slide=${slide}&preview=1${retry ? `&r=${retry}` : ""}`;
  const loading = loadedUrl !== previewUrl && errorUrl !== previewUrl;
  const failed = errorUrl === previewUrl;
  const captionText = `${item.caption}\n\n${item.hashtags.join(" ")}`;

  const statusBadge = published
    ? { tone: "success" as const, label: `Publié le ${formatDayFr(item.publishedAt ?? item.date)}` }
    : item.downloadedAt
      ? { tone: "info" as const, label: `Téléchargé le ${formatDayFr(item.downloadedAt)}` }
      : downloaded
        ? { tone: "info" as const, label: "Téléchargé" }
        : { tone: "info" as const, label: `À télécharger — prévu le ${formatDayFr(item.date)}` };

  async function copy(text: string, what: "caption" | "alt") {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied((c) => (c === what ? null : c)), 2000);
    } catch {
      setError("Copie impossible — sélectionnez le texte et copiez-le manuellement.");
    }
  }

  function run(action: () => Promise<{ error?: string }>, after?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
      after?.();
    });
  }

  function onDownload() {
    setDownloaded(true);
    // `downloaded_at` est posé par la route : rafraîchir pour la bordure du calendrier
    setTimeout(() => router.refresh(), 1500);
  }

  const download = (kind: "image" | "zip" | "pdf" | "caption" | "all") =>
    `/api/social/${item.id}/download?kind=${kind}${kind === "caption" ? "" : `&size=${size}`}`;

  return (
    <Modal open onClose={onClose} title={item.topic} size="xl">
      {/* Bandeau : statut, origine, format, note d'adaptation */}
      <div className="-mx-6 -mt-5 bg-gradient-to-br from-primary-50 via-cream-50 to-primary-100 px-6 py-4">
        {onBack ? (
          <button type="button" onClick={onBack} className="mb-2 text-sm font-medium text-ink-700 hover:text-ink-900">
            ← Retour à la journée
          </button>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={statusBadge.tone}>{statusBadge.label}</Badge>
          {item.source === "request" ? <Badge tone="primary">✦ Sur mesure</Badge> : null}
        </div>
        <p className="mt-2 text-sm text-ink-500">
          {FORMAT_LABEL[item.format]}
          {isCarousel ? ` · ${item.slideCount} pages` : ""} · {NETWORKS[item.format]}
        </p>
        {item.note ? (
          <p className="mt-3 rounded-xl bg-warning-100 px-4 py-3 text-sm text-ink-900">{item.note}</p>
        ) : null}
      </div>

      {/* minmax(0, 1fr) + min-w-0 : la bande de vignettes défile au lieu d'élargir la colonne */}
      <div className="mt-5 grid gap-6 md:grid-cols-[minmax(0,1fr)_380px]">
        {/* Aperçu */}
        <section aria-label="Aperçu" className="min-w-0">
          {item.sizes.length > 1 ? (
            <Segmented
              aria-label="Taille du visuel"
              options={item.sizes.map((s) => ({ value: s, label: SIZE_LABEL[s] }))}
              value={size}
              onChange={(s) => {
                setSize(s);
                setSlide(0);
              }}
              className="inline-flex"
            />
          ) : null}
          <p className="mt-2 text-xs text-ink-500">{SIZE_HELP[size]}</p>

          <div className={clsx("relative mt-3 w-full overflow-hidden rounded-2xl bg-cream-200", SIZE_ASPECT[size])}>
            {loading ? (
              <div className="absolute inset-0 flex animate-pulse items-center justify-center text-sm text-ink-500">
                Préparation du visuel…
              </div>
            ) : null}
            {failed ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center text-sm text-ink-700">
                Le visuel n&apos;a pas pu être généré.
                <Button variant="secondary" size="sm" onClick={() => setRetry((r) => r + 1)}>
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
              <div className="flex items-center justify-between text-sm text-ink-700">
                <button
                  type="button"
                  aria-label="Page précédente"
                  disabled={slide === 0}
                  onClick={() => setSlide((s) => Math.max(0, s - 1))}
                  className="rounded-full px-3 py-1 hover:bg-cream-200 disabled:opacity-40"
                >
                  ‹
                </button>
                <span>
                  Page {slide + 1} / {item.slideCount}
                </span>
                <button
                  type="button"
                  aria-label="Page suivante"
                  disabled={slide >= item.slideCount - 1}
                  onClick={() => setSlide((s) => Math.min(item.slideCount - 1, s + 1))}
                  className="rounded-full px-3 py-1 hover:bg-cream-200 disabled:opacity-40"
                >
                  ›
                </button>
              </div>
              <div className="mt-2 flex min-w-0 gap-2 overflow-x-auto pb-1">
                {item.slides.map((s, i) => (
                  <button
                    key={i}
                    type="button"
                    aria-label={`Page ${i + 1} : ${s.title}`}
                    aria-current={i === slide ? "true" : undefined}
                    onClick={() => setSlide(i)}
                    className={clsx(
                      "h-16 shrink-0 overflow-hidden rounded-lg border-2 bg-cream-200",
                      i === slide ? "border-primary-500" : "border-transparent hover:border-cream-300",
                    )}
                    style={{ width: Math.round((64 * SOCIAL_SIZES[size].w) / SOCIAL_SIZES[size].h) }}
                  >
                    <img
                      src={`/api/social/${item.id}/render?size=${size}&slide=${i}&preview=1`}
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

        {/* Prêt à poster */}
        <section aria-label="Prêt à poster" className="min-w-0 space-y-5">
          <div>
            <h3 className="text-sm font-semibold text-ink-900">Légende</h3>
            <textarea
              readOnly
              value={captionText}
              aria-label="Légende et hashtags"
              className="mt-1 h-40 w-full resize-none rounded-xl border border-cream-300 bg-cream-50 px-3 py-2 text-sm text-ink-900"
            />
            <Button className="mt-2 w-full" variant="secondary" onClick={() => copy(captionText, "caption")}>
              {copied === "caption" ? "✓ Légende copiée !" : "Copier la légende"}
            </Button>
            <FieldHint>Collez-la dans la description de votre publication.</FieldHint>
            <details className="mt-2 text-sm">
              <summary className="cursor-pointer text-ink-700">Texte alternatif</summary>
              <p className="mt-1 rounded-xl bg-cream-50 px-3 py-2 text-ink-700">{item.altText}</p>
              <Button variant="ghost" size="sm" className="mt-1" onClick={() => copy(item.altText, "alt")}>
                {copied === "alt" ? "✓ Copié !" : "Copier"}
              </Button>
            </details>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-ink-900">Télécharger</h3>
            <div className="mt-2 flex flex-col gap-2">
              {isCarousel ? (
                <>
                  <DownloadLink href={download("zip")} onClick={onDownload}>
                    Télécharger les pages (ZIP de JPG)
                  </DownloadLink>
                  <DownloadLink href={download("pdf")} onClick={onDownload} variant="secondary">
                    Version PDF pour LinkedIn
                  </DownloadLink>
                </>
              ) : (
                <DownloadLink href={download("image")} onClick={onDownload}>
                  Télécharger le visuel (JPG)
                </DownloadLink>
              )}
              <div className="flex flex-wrap gap-2">
                <DownloadLink href={download("caption")} onClick={onDownload} variant="ghost">
                  Légende (.txt)
                </DownloadLink>
                <DownloadLink href={download("all")} onClick={onDownload} variant="ghost">
                  Tout en un ZIP
                </DownloadLink>
              </div>
            </div>
            <FieldHint>
              JPG : accepté par tous les réseaux. Sur iPhone, appui long → Enregistrer l&apos;image ;
              les ZIP s&apos;ouvrent dans Fichiers.
            </FieldHint>
          </div>

          <div className="rounded-2xl bg-primary-50/60 p-4 text-sm text-ink-700">
            <h3 className="font-semibold text-ink-900">Comment publier ?</h3>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              <li>Téléchargez le visuel</li>
              <li>
                Ouvrez Instagram (ou Facebook, LinkedIn) et créez une publication avec ce fichier
                {isCarousel ? " — pour un carrousel, sélectionnez toutes les pages dans l'ordre" : ""}
              </li>
              <li>Collez la légende</li>
              <li>Revenez ici et marquez le contenu comme publié</li>
            </ol>
          </div>

          {item.sourceRefs.length > 0 ? (
            <div>
              <h3 className="text-sm font-semibold text-ink-900">D&apos;après votre site :</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {item.sourceRefs.map((ref) => (
                  <SourceBadge key={ref.id} href={ref.href} label={ref.label} />
                ))}
              </div>
            </div>
          ) : null}

          <div ref={actionsRef} className="divide-y divide-cream-200 border-t border-cream-200">
            <div className="flex items-center justify-between gap-3 py-3 text-sm">
              {published ? (
                <>
                  <span className="font-medium text-success-500">
                    Publié le {formatDayFr(item.publishedAt ?? item.date)}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    data-focus="unpublish"
                    onClick={() => run(() => markSocialPostPublished(item.id, false))}
                  >
                    Annuler
                  </Button>
                </>
              ) : (
                <Button
                  className="w-full"
                  disabled={pending}
                  data-focus="publish"
                  onClick={() => run(() => markSocialPostPublished(item.id, true))}
                >
                  {pending ? <Spinner className="text-white" /> : null} Marquer comme publié
                </Button>
              )}
            </div>

            {!published ? (
              <div className="py-3 text-sm">
                {dateOpen ? (
                  <form
                    className="flex flex-wrap items-center gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      run(
                        () => rescheduleSocialPost({ postId: item.id, date: newDate }),
                        () => setDateOpen(false),
                      );
                    }}
                  >
                    <Input
                      type="date"
                      aria-label="Nouvelle date"
                      data-focus="new-date"
                      value={newDate}
                      min={todayIso}
                      onChange={(e) => setNewDate(e.target.value)}
                      className="w-auto"
                      required
                    />
                    <Button type="submit" size="sm" disabled={pending}>
                      {pending ? <Spinner className="text-white" /> : null} Enregistrer
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setDateOpen(false)}>
                      Annuler
                    </Button>
                  </form>
                ) : (
                  <button
                    type="button"
                    data-focus="change-date"
                    onClick={() => setDateOpen(true)}
                    className="flex w-full items-center justify-between text-left font-medium hover:text-primary-600"
                  >
                    Changer la date <span aria-hidden>📅</span>
                  </button>
                )}
              </div>
            ) : null}

            <div className="py-3 text-sm">
              {confirmRemove ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-ink-700">Retirer ? Il disparaîtra du calendrier.</span>
                  <Button variant="danger" size="sm" disabled={pending} onClick={() => run(() => archiveSocialPost(item.id), onClose)}>
                    {pending ? <Spinner className="text-white" /> : null} Retirer
                  </Button>
                  <Button variant="ghost" size="sm" data-focus="keep" onClick={() => setConfirmRemove(false)}>
                    Garder
                  </Button>
                </div>
              ) : (
                <button
                  type="button"
                  data-focus="remove"
                  onClick={() => setConfirmRemove(true)}
                  className="flex w-full items-center justify-between text-left font-medium text-ink-700 hover:text-danger-500"
                >
                  Retirer ce contenu <span aria-hidden>✕</span>
                </button>
              )}
            </div>
          </div>

          {error ? (
            <p className="text-sm text-danger-500" role="alert">
              {error}
            </p>
          ) : null}
        </section>
      </div>
    </Modal>
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

const LINK_VARIANTS = {
  primary: "bg-primary-500 text-white hover:bg-primary-600 shadow-sm px-4 py-2",
  secondary: "bg-white text-ink-900 border border-ink-300 hover:bg-cream-100 px-4 py-2",
  ghost: "text-ink-700 hover:bg-cream-200 px-3 py-1.5",
} as const;

/** Lien de téléchargement (`<a download>`) habillé comme un `Button`. */
function DownloadLink({
  href,
  onClick,
  variant = "primary",
  children,
}: {
  href: string;
  onClick: () => void;
  variant?: keyof typeof LINK_VARIANTS;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      download
      onClick={onClick}
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-full text-sm font-medium transition-colors",
        LINK_VARIANTS[variant],
      )}
    >
      {children}
    </a>
  );
}

/** Source du contenu (page, article, avis) : toujours dans un nouvel onglet, la modale reste ouverte. */
function SourceBadge({ href, label }: { href?: string; label: string }) {
  if (!href) return <Badge tone="neutral">{label}</Badge>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      <Badge tone="neutral" className="hover:bg-cream-300">
        {label} ↗<span className="sr-only"> (nouvel onglet)</span>
      </Badge>
    </a>
  );
}
