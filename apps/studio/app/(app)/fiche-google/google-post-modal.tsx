"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type ReactNode, type RefObject } from "react";
import { clsx } from "clsx";
import {
  CalendarCheck,
  CalendarDays,
  Check,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  FileArchive,
  FileText,
  MousePointerClick,
  Phone,
  RotateCw,
  Sparkles,
  Trash2,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { FieldHint, Input, Modal } from "@theralys/ui";
import { GOOGLE_POST_CTAS, GOOGLE_POST_IMAGE, GOOGLE_POST_INSTRUCTIONS_MAX } from "@theralys/shared";
import { AiBadge, Badge, Button, InlineSuccess, Skeleton, buttonClasses } from "@/components/ds";
import { formatDayFr } from "@/lib/calendar";
import { isRelativeAddress } from "@/lib/google/post-cta";
import type { GoogleCalendarItem } from "@/lib/google/posts";
import { archiveGooglePost, markGooglePostPublished, regenerateGooglePost, rescheduleGooglePost } from "./actions";
import { PostStatusPill, type PostStatusKind } from "./post-status";
import { ErrorNote } from "./shared";

/** Page de gestion de la fiche (publication d'un post) : lien fixe, jamais une URL venue des données. */
const GOOGLE_BUSINESS_URL = "https://business.google.com/";

const CTA_ICON: Partial<Record<GoogleCalendarItem["cta"]["type"], LucideIcon>> = {
  BOOK: CalendarCheck,
  CALL: Phone,
  LEARN_MORE: MousePointerClick,
};

function ctaLabel(type: GoogleCalendarItem["cta"]["type"]): string {
  return GOOGLE_POST_CTAS.find((c) => c.id === type)?.label ?? type;
}

/** URL du bouton d'action affichée comme lien seulement en http(s) (sinon texte brut). */
function safeHref(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export function GooglePostModal({
  item,
  todayIso,
  regenRemaining,
  onClose,
}: {
  item: GoogleCalendarItem | null;
  todayIso: string;
  regenRemaining: number;
  onClose: () => void;
}) {
  if (!item) return null;
  // L'état local (copies, date…) repart de zéro à chaque post
  return <PostModalBody key={item.id} item={item} todayIso={todayIso} regenRemaining={regenRemaining} onClose={onClose} />;
}

function PostModalBody({
  item,
  todayIso,
  regenRemaining,
  onClose,
}: {
  item: GoogleCalendarItem;
  todayIso: string;
  regenRemaining: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const [retry, setRetry] = useState(0);
  const [instructions, setInstructions] = useState("");
  const [regenerating, startRegenerating] = useTransition();
  const [regenMessage, setRegenMessage] = useState<string | null>(null);
  const [remaining, setRemaining] = useState(regenRemaining);

  function regenerate() {
    setError(null);
    setRegenMessage(null);
    startRegenerating(async () => {
      const result = await regenerateGooglePost({ postId: item.id, instructions });
      if (result.error) {
        setError(result.error);
        return;
      }
      if (typeof result.remaining === "number") setRemaining(result.remaining);
      setInstructions("");
      setLoadedUrl(null);
      setErrorUrl(null);
      // Nouveau visuel : l'URL d'aperçu change pour forcer le rechargement
      setRetry((r) => r + 1);
      setRegenMessage("Post régénéré : nouveau texte et nouveau visuel.");
      router.refresh();
    });
  }
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const [errorUrl, setErrorUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState<"text" | "alt" | null>(null);
  const [downloaded, setDownloaded] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const [newDate, setNewDate] = useState(item.date);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const actionsRef = useRef<HTMLDivElement>(null);

  const published = item.status === "published";
  useFocusAfterToggle(dateOpen, actionsRef, (open) => (open ? "new-date" : "change-date"));
  useFocusAfterToggle(confirmRemove, actionsRef, (confirm) => (confirm ? "keep" : "remove"));
  useFocusAfterToggle(published, actionsRef, (isPublished) => (isPublished ? "unpublish" : "publish"));

  const previewUrl = `/api/google-posts/${item.id}/render?size=landscape&preview=1${retry ? `&r=${retry}` : ""}`;
  const loading = loadedUrl !== previewUrl && errorUrl !== previewUrl;
  const failed = errorUrl === previewUrl;
  const ctaHref = safeHref(item.cta.url);
  // Adresse montrée en clair quand elle n'est pas un lien web (numéro `tel:`). Le serveur remet déjà un bouton à jour
  // (`deliveredGoogleCta`) ; par précaution, une adresse relative — chemin du studio d'un ancien post — n'est jamais affichée
  const ctaAddress = isRelativeAddress(item.cta.url) ? null : item.cta.url;

  const statusBadge: { kind: PostStatusKind; label: string } = published
    ? { kind: "publie", label: `Publié le ${formatDayFr(item.publishedAt ?? item.date)}` }
    : item.downloadedAt
      ? { kind: "telecharge", label: `Téléchargé le ${formatDayFr(item.downloadedAt)}` }
      : downloaded
        ? { kind: "telecharge", label: "Téléchargé" }
        : { kind: "a-publier", label: `À publier — prévu le ${formatDayFr(item.date)}` };

  async function copy(text: string, what: "text" | "alt") {
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
    setTimeout(() => router.refresh(), 1500);
  }

  const download = (kind: "image" | "text" | "all") => `/api/google-posts/${item.id}/download?kind=${kind}`;
  const CtaIcon = CTA_ICON[item.cta.type];
  const rowButton =
    "flex min-h-11 w-full items-center justify-between gap-3 rounded-ds-sm text-left text-ds-body font-semibold ds-focus";

  return (
    <Modal open onClose={onClose} title={item.topic} size="xl">
      <div className="-mx-6 -mt-5 bg-ds-section-soft px-6 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <PostStatusPill kind={statusBadge.kind}>{statusBadge.label}</PostStatusPill>
          {item.source === "request" ? (
            <Badge tone="neutral" icon={Sparkles}>
              Sur mesure
            </Badge>
          ) : null}
        </div>
        <p className="mt-2 text-ds-body text-ds-ink-700">
          Post Google · visuel 4:3 ({GOOGLE_POST_IMAGE.w}×{GOOGLE_POST_IMAGE.h}) · texte et bouton d&apos;action
        </p>
        {item.note ? (
          <p className="mt-3 flex items-start gap-2.5 rounded-ds-sm bg-ds-warning-100 px-4 py-3 text-ds-body text-ds-warning-900">
            <TriangleAlert size={18} aria-hidden className="mt-0.5 shrink-0" />
            <span className="min-w-0">{item.note}</span>
          </p>
        ) : null}
      </div>

      <div className="mt-5 grid gap-6 md:grid-cols-[minmax(0,1fr)_380px]">
        <section aria-label="Aperçu" className="min-w-0">
          <div className="relative aspect-[4/3] w-full max-w-[600px] overflow-hidden rounded-ds-md bg-ds-ink-100 ring-1 ring-ds-ink-200">
            {loading ? (
              <div className="absolute inset-0">
                <Skeleton className="absolute inset-0 rounded-none" />
                <span className="absolute inset-0 grid place-items-center text-ds-body font-medium text-ds-ink-700">Préparation du visuel…</span>
              </div>
            ) : null}
            {failed ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center text-ds-body text-ds-ink-700">
                Le visuel n&apos;a pas pu être généré.
                <Button variant="secondary" size="sm" icon={<RotateCw size={16} aria-hidden />} onClick={() => setRetry((r) => r + 1)}>
                  Réessayer
                </Button>
              </div>
            ) : (
              <img
                key={previewUrl}
                src={previewUrl}
                alt={item.altText}
                width={540}
                height={405}
                onLoad={() => setLoadedUrl(previewUrl)}
                onError={() => setErrorUrl(previewUrl)}
                className={clsx("relative h-full w-full object-cover transition-opacity duration-ds-base", loading ? "opacity-0" : "opacity-100")}
              />
            )}
          </div>

          <div className="mt-5">
            <h3 className="text-ds-body font-semibold text-ds-ink-900">Bouton d&apos;action</h3>
            {item.cta.type === "NONE" ? (
              <p className="mt-1.5 text-ds-body text-ds-ink-700">Sans bouton.</p>
            ) : (
              <p className="mt-1.5 flex flex-wrap items-center gap-2 text-ds-body text-ds-ink-700">
                <Badge tone="section" icon={CtaIcon}>
                  {ctaLabel(item.cta.type)}
                </Badge>
                {ctaHref ? (
                  <a
                    href={ctaHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-w-0 truncate rounded-ds-sm font-medium text-ds-brand-700 underline ds-focus"
                  >
                    {ctaHref}
                    <span className="sr-only"> (nouvel onglet)</span>
                  </a>
                ) : (
                  <span className="min-w-0 truncate">{ctaAddress ?? "—"}</span>
                )}
              </p>
            )}
            <FieldHint>Dans Google, choisissez ce bouton et collez l&apos;adresse.</FieldHint>
          </div>
        </section>

        <section aria-label="Prêt à publier" className="min-w-0 space-y-6">
          <div>
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
              <h3 className="text-ds-body font-semibold text-ds-ink-900">Texte du post</h3>
              <AiBadge />
            </div>
            <textarea
              readOnly
              value={item.summary}
              aria-label="Texte du post"
              className="mt-2 block h-44 w-full resize-none rounded-ds-sm border border-ds-ink-450 bg-ds-ink-50 px-3.5 py-3 text-base text-ds-ink-900"
            />
            <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
              <Button variant="secondary" icon={<Copy size={18} aria-hidden />} onClick={() => copy(item.summary, "text")}>
                Copier le texte
              </Button>
              {copied === "text" ? <InlineSuccess>Texte copié !</InlineSuccess> : null}
            </div>
            {!published ? (
              <div className="mt-4 rounded-ds-md bg-ds-ink-50 p-4 ring-1 ring-ds-ink-200">
                <label htmlFor={`instructions-${item.id}`} className="block text-ds-body font-semibold text-ds-ink-900">
                  Instructions pour régénérer ce post
                </label>
                <p className="mt-1 text-ds-meta text-ds-ink-600">
                  Facultatif : ce que vous voulez changer (angle, ton, longueur, élément à mentionner). Le sujet, la date et la couleur sont conservés.
                </p>
                <textarea
                  id={`instructions-${item.id}`}
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value.slice(0, GOOGLE_POST_INSTRUCTIONS_MAX))}
                  maxLength={GOOGLE_POST_INSTRUCTIONS_MAX}
                  rows={3}
                  disabled={regenerating}
                  placeholder="Ex. : mentionnez la respiration holotropique, un ton plus direct, texte plus court."
                  className="mt-2.5 block w-full rounded-ds-sm border border-ds-ink-450 bg-white px-3.5 py-2.5 text-ds-body text-ds-ink-900 placeholder:text-ds-ink-600"
                />
                <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-ds-meta text-ds-ink-600">
                    {instructions.length} / {GOOGLE_POST_INSTRUCTIONS_MAX} · {remaining} régénération{remaining > 1 ? "s" : ""} restante{remaining > 1 ? "s" : ""} ce mois-ci
                  </p>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={regenerate}
                    loading={regenerating}
                    disabled={pending || remaining <= 0}
                    title={remaining <= 0 ? "Quota mensuel de régénérations atteint" : undefined}
                    icon={<Sparkles size={16} aria-hidden />}
                  >
                    {regenerating ? "Rédaction…" : "Régénérer"}
                  </Button>
                </div>
                {regenMessage ? <InlineSuccess className="mt-3">{regenMessage}</InlineSuccess> : null}
              </div>
            ) : null}
            <details className="group/alt mt-3 text-ds-body">
              <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-ds-sm font-medium text-ds-brand-800 ds-focus [&::-webkit-details-marker]:hidden">
                <ChevronRight size={16} aria-hidden className="shrink-0 group-open/alt:rotate-90" />
                Texte alternatif du visuel
              </summary>
              <p className="mt-1 rounded-ds-sm bg-ds-ink-50 px-3.5 py-2.5 text-ds-ink-700 ring-1 ring-ds-ink-200">{item.altText}</p>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
                <Button variant="quiet" size="sm" icon={<Copy size={16} aria-hidden />} onClick={() => copy(item.altText, "alt")}>
                  Copier
                </Button>
                {copied === "alt" ? <InlineSuccess>Copié !</InlineSuccess> : null}
              </div>
            </details>
          </div>

          <div>
            <h3 className="text-ds-body font-semibold text-ds-ink-900">Télécharger</h3>
            <div className="mt-2.5 flex flex-col gap-2">
              <DownloadLink href={download("image")} onClick={onDownload} icon={<Download size={18} aria-hidden />}>
                Télécharger le visuel (JPG 4:3)
              </DownloadLink>
              <div className="flex flex-wrap gap-2">
                <DownloadLink href={download("text")} onClick={onDownload} variant="quiet" icon={<FileText size={16} aria-hidden />}>
                  Texte (.txt)
                </DownloadLink>
                <DownloadLink href={download("all")} onClick={onDownload} variant="quiet" icon={<FileArchive size={16} aria-hidden />}>
                  Tout en un ZIP
                </DownloadLink>
              </div>
            </div>
          </div>

          <div className="rounded-ds-md bg-ds-section-tint p-4 text-ds-body text-ds-ink-700 ring-1 ring-ds-section-line/60">
            <h3 className="font-semibold text-ds-section-ink">Publier sur Google</h3>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5 marker:font-semibold marker:text-ds-section-accent">
              <li>
                Ouvrez votre fiche :{" "}
                <a
                  href={GOOGLE_BUSINESS_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-ds-sm font-semibold text-ds-brand-700 underline ds-focus"
                >
                  business.google.com
                  <ExternalLink size={14} aria-hidden />
                  <span className="sr-only"> (nouvel onglet)</span>
                </a>{" "}
                puis « Ajouter une nouveauté »
              </li>
              <li>Ajoutez le visuel téléchargé, collez le texte et choisissez le bouton d&apos;action</li>
              <li>Publiez, puis revenez ici marquer le post comme publié</li>
            </ol>
          </div>

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

          <div ref={actionsRef} className="divide-y divide-ds-ink-200 border-t border-ds-ink-200">
            <div className="flex items-center justify-between gap-3 py-3 text-ds-body">
              {published ? (
                <>
                  <span className="inline-flex items-center gap-2 font-semibold text-ds-success-700">
                    <Check size={18} aria-hidden />
                    Publié le {formatDayFr(item.publishedAt ?? item.date)}
                  </span>
                  <Button variant="quiet" size="sm" disabled={pending} data-focus="unpublish" onClick={() => run(() => markGooglePostPublished(item.id, false))}>
                    Annuler
                  </Button>
                </>
              ) : (
                <Button
                  className="w-full"
                  loading={pending}
                  data-focus="publish"
                  icon={<Check size={18} aria-hidden />}
                  onClick={() => run(() => markGooglePostPublished(item.id, true))}
                >
                  Marquer comme publié
                </Button>
              )}
            </div>

            {!published ? (
              <div className="py-1.5 text-ds-body">
                {dateOpen ? (
                  <form
                    className="flex flex-wrap items-center gap-2 py-1.5"
                    onSubmit={(e) => {
                      e.preventDefault();
                      run(
                        () => rescheduleGooglePost({ postId: item.id, date: newDate }),
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
                      className="min-h-11 w-auto!"
                      required
                    />
                    <Button type="submit" variant="secondary" size="sm" loading={pending}>
                      Enregistrer
                    </Button>
                    <Button type="button" variant="quiet" size="sm" onClick={() => setDateOpen(false)}>
                      Annuler
                    </Button>
                  </form>
                ) : (
                  <button
                    type="button"
                    data-focus="change-date"
                    onClick={() => setDateOpen(true)}
                    className={clsx(rowButton, "text-ds-ink-900 hover:text-ds-brand-700")}
                  >
                    Changer la date <CalendarDays size={18} aria-hidden className="shrink-0 text-ds-ink-500" />
                  </button>
                )}
              </div>
            ) : null}

            <div className="py-1.5 text-ds-body">
              {confirmRemove ? (
                <div className="flex flex-wrap items-center gap-2 py-1.5">
                  <span className="text-ds-ink-700">Retirer ? Il disparaîtra du calendrier.</span>
                  <Button variant="danger" size="sm" loading={pending} onClick={() => run(() => archiveGooglePost(item.id), onClose)}>
                    Retirer
                  </Button>
                  <Button variant="quiet" size="sm" data-focus="keep" onClick={() => setConfirmRemove(false)}>
                    Garder
                  </Button>
                </div>
              ) : (
                <button
                  type="button"
                  data-focus="remove"
                  onClick={() => setConfirmRemove(true)}
                  className={clsx(rowButton, "text-ds-ink-700 hover:text-ds-danger-700")}
                >
                  Retirer ce post <Trash2 size={18} aria-hidden className="shrink-0 text-ds-ink-500" />
                </button>
              )}
            </div>
          </div>

          {error ? <ErrorNote>{error}</ErrorNote> : null}
        </section>
      </div>
    </Modal>
  );
}

/** Après un basculement d'affichage, place le focus sur l'élément `[data-focus=<cible>]` qui remplace le bouton cliqué. */
function useFocusAfterToggle<T>(value: T, root: RefObject<HTMLElement | null>, targetFor: (value: T) => string) {
  const previous = useRef(value);
  useEffect(() => {
    if (previous.current === value) return;
    previous.current = value;
    root.current?.querySelector<HTMLElement>(`[data-focus="${targetFor(value)}"]`)?.focus();
  }, [value, root, targetFor]);
}

/**
 * Lien de téléchargement à l'apparence d'un bouton du design system. Un vrai
 * `<a download>` (pas `LinkButton`, qui passerait par le routeur) : l'adresse
 * rend un fichier, pas une page.
 */
function DownloadLink({
  href,
  onClick,
  variant = "secondary",
  icon,
  children,
}: {
  href: string;
  onClick: () => void;
  variant?: "secondary" | "quiet";
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      download
      onClick={onClick}
      className={buttonClasses(
        variant,
        variant === "secondary" ? "md" : "sm",
        variant === "secondary" ? "w-full hover:bg-ds-brand-50" : "hover:bg-ds-brand-100",
      )}
    >
      {icon}
      <span>{children}</span>
    </a>
  );
}

function SourceBadge({ href, label }: { href?: string; label: string }) {
  const safe = safeHref(href ?? null);
  if (!safe) {
    return (
      <Badge tone="neutral" className="max-w-full">
        <span className="min-w-0 truncate">{label}</span>
      </Badge>
    );
  }
  return (
    <a href={safe} target="_blank" rel="noopener noreferrer" className="max-w-full min-w-0 rounded-full ds-focus">
      <Badge tone="neutral" className="max-w-full hover:bg-ds-ink-200">
        <span className="min-w-0 truncate">{label}</span>
        <ExternalLink size={13} aria-hidden className="shrink-0" />
        <span className="sr-only"> (nouvel onglet)</span>
      </Badge>
    </a>
  );
}
