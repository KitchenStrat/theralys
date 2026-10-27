"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type ReactNode, type RefObject } from "react";
import { clsx } from "clsx";
import { Badge, Button, FieldHint, Input, Modal, Spinner } from "@theralys/ui";
import { GOOGLE_POST_CTAS, GOOGLE_POST_IMAGE, GOOGLE_POST_INSTRUCTIONS_MAX } from "@theralys/shared";
import { formatDayFr } from "@/lib/calendar";
import type { GoogleCalendarItem } from "@/lib/google/posts";
import { archiveGooglePost, markGooglePostPublished, regenerateGooglePost, rescheduleGooglePost } from "./actions";

/** Page de gestion de la fiche (publication d'un post) : lien fixe, jamais une URL venue des données. */
const GOOGLE_BUSINESS_URL = "https://business.google.com/";

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

  const statusBadge = published
    ? { tone: "success" as const, label: `Publié le ${formatDayFr(item.publishedAt ?? item.date)}` }
    : item.downloadedAt
      ? { tone: "info" as const, label: `Téléchargé le ${formatDayFr(item.downloadedAt)}` }
      : downloaded
        ? { tone: "info" as const, label: "Téléchargé" }
        : { tone: "info" as const, label: `À publier — prévu le ${formatDayFr(item.date)}` };

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

  return (
    <Modal open onClose={onClose} title={item.topic} size="xl">
      <div className="-mx-6 -mt-5 bg-gradient-to-br from-primary-50 via-cream-50 to-primary-100 px-6 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={statusBadge.tone}>{statusBadge.label}</Badge>
          {item.source === "request" ? <Badge tone="primary">✦ Sur mesure</Badge> : null}
        </div>
        <p className="mt-2 text-sm text-ink-500">Post Google · visuel 4:3 ({GOOGLE_POST_IMAGE.w}×{GOOGLE_POST_IMAGE.h}) · texte et bouton d&apos;action</p>
        {item.note ? <p className="mt-3 rounded-xl bg-warning-100 px-4 py-3 text-sm text-ink-900">{item.note}</p> : null}
      </div>

      <div className="mt-5 grid gap-6 md:grid-cols-[minmax(0,1fr)_380px]">
        <section aria-label="Aperçu" className="min-w-0">
          <div className="relative aspect-[4/3] w-full max-w-[600px] overflow-hidden rounded-2xl bg-cream-200">
            {loading ? (
              <div className="absolute inset-0 flex animate-pulse items-center justify-center text-sm text-ink-500">Préparation du visuel…</div>
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
                height={405}
                onLoad={() => setLoadedUrl(previewUrl)}
                onError={() => setErrorUrl(previewUrl)}
                className={clsx("h-full w-full object-cover transition-opacity", loading ? "opacity-0" : "opacity-100")}
              />
            )}
          </div>

          <div className="mt-4">
            <h3 className="text-sm font-semibold text-ink-900">Bouton d&apos;action</h3>
            {item.cta.type === "NONE" ? (
              <p className="mt-1 text-sm text-ink-700">Sans bouton.</p>
            ) : (
              <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-700">
                <Badge tone="primary">{ctaLabel(item.cta.type)}</Badge>
                {ctaHref ? (
                  <a href={ctaHref} target="_blank" rel="noopener noreferrer" className="truncate text-primary-600 hover:underline">
                    {ctaHref}
                    <span className="sr-only"> (nouvel onglet)</span>
                  </a>
                ) : (
                  <span className="truncate">{item.cta.url ?? "—"}</span>
                )}
              </p>
            )}
            <FieldHint>Dans Google, choisissez ce bouton et collez l&apos;adresse.</FieldHint>
          </div>
        </section>

        <section aria-label="Prêt à publier" className="min-w-0 space-y-5">
          <div>
            <h3 className="text-sm font-semibold text-ink-900">Texte du post</h3>
            <textarea
              readOnly
              value={item.summary}
              aria-label="Texte du post"
              className="mt-1 h-40 w-full resize-none rounded-xl border border-cream-300 bg-cream-50 px-3 py-2 text-sm text-ink-900"
            />
            <Button className="mt-2 w-full" variant="secondary" onClick={() => copy(item.summary, "text")}>
              {copied === "text" ? "✓ Texte copié !" : "Copier le texte"}
            </Button>
            {!published ? (
              <div className="mt-4 rounded-2xl border border-cream-200 bg-cream-50 p-3">
                <label htmlFor={`instructions-${item.id}`} className="block text-sm font-semibold text-ink-900">
                  Instructions pour régénérer ce post
                </label>
                <p className="mt-0.5 text-xs text-ink-500">
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
                  className="mt-2 w-full rounded-xl border border-cream-300 bg-white px-3 py-2 text-sm text-ink-900 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
                />
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-ink-500">
                    {instructions.length} / {GOOGLE_POST_INSTRUCTIONS_MAX} · {remaining} régénération{remaining > 1 ? "s" : ""} restante{remaining > 1 ? "s" : ""} ce mois-ci
                  </p>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={regenerate}
                    disabled={regenerating || pending || remaining <= 0}
                    title={remaining <= 0 ? "Quota mensuel de régénérations atteint" : undefined}
                  >
                    {regenerating ? (
                      <>
                        <Spinner /> Rédaction…
                      </>
                    ) : (
                      "✦ Régénérer"
                    )}
                  </Button>
                </div>
                {regenMessage ? (
                  <p className="mt-2 text-sm text-success-500" role="status">
                    {regenMessage}
                  </p>
                ) : null}
              </div>
            ) : null}
            <details className="mt-2 text-sm">
              <summary className="cursor-pointer text-ink-700">Texte alternatif du visuel</summary>
              <p className="mt-1 rounded-xl bg-cream-50 px-3 py-2 text-ink-700">{item.altText}</p>
              <Button variant="ghost" size="sm" className="mt-1" onClick={() => copy(item.altText, "alt")}>
                {copied === "alt" ? "✓ Copié !" : "Copier"}
              </Button>
            </details>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-ink-900">Télécharger</h3>
            <div className="mt-2 flex flex-col gap-2">
              <DownloadLink href={download("image")} onClick={onDownload}>
                Télécharger le visuel (JPG 4:3)
              </DownloadLink>
              <div className="flex flex-wrap gap-2">
                <DownloadLink href={download("text")} onClick={onDownload} variant="ghost">
                  Texte (.txt)
                </DownloadLink>
                <DownloadLink href={download("all")} onClick={onDownload} variant="ghost">
                  Tout en un ZIP
                </DownloadLink>
              </div>
            </div>
          </div>

          <div className="rounded-2xl bg-primary-50/60 p-4 text-sm text-ink-700">
            <h3 className="font-semibold text-ink-900">Publier sur Google</h3>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              <li>
                Ouvrez votre fiche :{" "}
                <a href={GOOGLE_BUSINESS_URL} target="_blank" rel="noopener noreferrer" className="font-medium text-primary-600 hover:underline">
                  business.google.com ↗<span className="sr-only"> (nouvel onglet)</span>
                </a>{" "}
                → « Ajouter une nouveauté »
              </li>
              <li>Ajoutez le visuel téléchargé, collez le texte et choisissez le bouton d&apos;action</li>
              <li>Publiez, puis revenez ici marquer le post comme publié</li>
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
                  <span className="font-medium text-success-500">Publié le {formatDayFr(item.publishedAt ?? item.date)}</span>
                  <Button variant="ghost" size="sm" disabled={pending} data-focus="unpublish" onClick={() => run(() => markGooglePostPublished(item.id, false))}>
                    Annuler
                  </Button>
                </>
              ) : (
                <Button className="w-full" disabled={pending} data-focus="publish" onClick={() => run(() => markGooglePostPublished(item.id, true))}>
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
                  <Button variant="danger" size="sm" disabled={pending} onClick={() => run(() => archiveGooglePost(item.id), onClose)}>
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
                  Retirer ce post <span aria-hidden>✕</span>
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

/** Après un basculement d'affichage, place le focus sur l'élément `[data-focus=<cible>]` qui remplace le bouton cliqué. */
function useFocusAfterToggle<T>(value: T, root: RefObject<HTMLElement | null>, targetFor: (value: T) => string) {
  const previous = useRef(value);
  useEffect(() => {
    if (previous.current === value) return;
    previous.current = value;
    root.current?.querySelector<HTMLElement>(`[data-focus="${targetFor(value)}"]`)?.focus();
  }, [value, root, targetFor]);
}

const LINK_VARIANTS = {
  primary: "bg-primary-500 text-white hover:bg-primary-600 shadow-sm px-4 py-2",
  ghost: "text-ink-700 hover:bg-cream-200 px-3 py-1.5",
} as const;

function DownloadLink({ href, onClick, variant = "primary", children }: { href: string; onClick: () => void; variant?: keyof typeof LINK_VARIANTS; children: ReactNode }) {
  return (
    <a href={href} download onClick={onClick} className={clsx("inline-flex items-center justify-center gap-2 rounded-full text-sm font-medium transition-colors", LINK_VARIANTS[variant])}>
      {children}
    </a>
  );
}

function SourceBadge({ href, label }: { href?: string; label: string }) {
  const safe = safeHref(href ?? null);
  if (!safe) return <Badge tone="neutral">{label}</Badge>;
  return (
    <a href={safe} target="_blank" rel="noopener noreferrer">
      <Badge tone="neutral" className="hover:bg-cream-300">
        {label} ↗<span className="sr-only"> (nouvel onglet)</span>
      </Badge>
    </a>
  );
}
