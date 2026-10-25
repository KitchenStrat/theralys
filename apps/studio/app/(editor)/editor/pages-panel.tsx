"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { clsx } from "clsx";
import { Button, Modal, Spinner } from "@theralys/ui";
import type { PlanId } from "@theralys/db/plans";
import { DEFAULT_NOT_FOUND, LEGAL_PAGES, type GeneratingMotif, type SiteNotFound } from "@theralys/shared";
import {
  createMotifPage,
  deleteMotifPage,
  regenerateMotifPage,
  renameMotifPage,
  retryMotifGeneration,
  saveNotFoundSettings,
  savePageSeo,
} from "../../(app)/actions";
import {
  canAddHomeCard,
  groupEditorPages,
  motifCounterLabel,
  type EditorPageRef,
  type MotifRow,
} from "@/lib/editor/page-groups";
import type { PreviewTarget } from "@/lib/editor/preview-path";
import { CharCounter, ToggleSwitch } from "./section-fields";

export type PagesPanelProps = {
  pages: EditorPageRef[];
  /** Page chargée dans le panneau Contenu (`?page=`) */
  selectedPageId: string | null;
  /** Ce que l'aperçu affiche (page, page légale, 404) */
  previewTarget: PreviewTarget;
  disabledMotifs: string[];
  generatingMotifs: GeneratingMotif[];
  plan: PlanId;
  /** Cartes de la section Spécialités de l'accueil / plafond de la formule */
  homeSpecialtiesCount: number;
  homeSpecialtiesMax: number;
  /** Page introuvable : valeurs effectives (personnalisées ou par défaut) */
  notFound: Required<SiteNotFound>;
  /** Ouvre une page dans l'éditeur (confirmation gérée par le parent) */
  onSelectPage: (page: EditorPageRef) => void;
  /** Affiche une page légale ou la page introuvable dans l'aperçu */
  onPreview: (target: PreviewTarget) => void;
  /** Active/désactive une page (optimiste) ; résout faux si le serveur a refusé */
  onToggle: (slug: string, enabled: boolean) => Promise<boolean>;
  onOpenSettings: (tab: "legal") => void;
  /** Titre d'une page (et de sa carte d'accueil) modifié */
  onRenamed: (slug: string, title: string) => void;
  /** Données modifiées côté serveur : rafraîchir la liste et l'aperçu */
  onChanged: () => void;
  onDeleted: (page: EditorPageRef) => void;
};

type ModalState =
  | { kind: "rename" | "seo" | "subject" | "delete"; row: MotifRow }
  | { kind: "add" }
  | { kind: "notFound" }
  | null;

/**
 * Panneau « Pages » : page principale, pages de spécialité (activation,
 * menu d'actions, ajout, génération en cours), page introuvable et pages
 * légales générées automatiquement.
 */
export function PagesPanel(props: PagesPanelProps) {
  const {
    pages,
    selectedPageId,
    previewTarget,
    disabledMotifs,
    generatingMotifs,
    plan,
    homeSpecialtiesCount,
    homeSpecialtiesMax,
    onSelectPage,
    onPreview,
    onToggle,
    onOpenSettings,
  } = props;
  const groups = groupEditorPages(pages, { disabledMotifs, generatingMotifs, plan });
  const [modal, setModal] = useState<ModalState>(null);
  const [rowError, setRowError] = useState<{ slug: string; message: string } | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);
  const isPagePreview = previewTarget.kind === "home" || previewTarget.kind === "motif";

  async function retry(slug: string) {
    setRetrying(slug);
    setRowError(null);
    const result = await retryMotifGeneration({ slug });
    setRetrying(null);
    if (result.error) {
      setRowError({ slug, message: result.error });
      return;
    }
    props.onChanged();
  }

  async function removeFailed(row: MotifRow) {
    setRowError(null);
    const result = await deleteMotifPage({ slug: row.page.slug });
    if (result.error) {
      setRowError({ slug: row.page.slug, message: result.error });
      return;
    }
    props.onDeleted(row.page);
  }

  return (
    <div className="space-y-5">
      {/* ── Page principale ─────────────────────────────────────────────── */}
      <Group title="Page principale">
        {groups.home ? (
          <PageRow
            title="Accueil"
            selected={isPagePreview && groups.home.id === selectedPageId}
            onClick={() => onSelectPage(groups.home!)}
            trailing={
              <span
                className="inline-flex items-center gap-1 text-[11px] text-ink-500"
                title="La page d'accueil est toujours en ligne"
              >
                <span aria-hidden>🔒</span> Toujours en ligne
              </span>
            }
          />
        ) : (
          <p className="px-3 text-xs text-ink-500">Aucune page d&apos;accueil.</p>
        )}
      </Group>

      {/* ── Pages de spécialité ─────────────────────────────────────────── */}
      <Group
        title="Pages de spécialité"
        counter={groups.motifCount > 0 ? motifCounterLabel(groups) : undefined}
      >
        {groups.motifs.length === 0 && !groups.canAdd ? (
          <p className="px-3 py-1 text-xs text-ink-500">
            Votre formule ne comprend pas de page de spécialité dédiée.
          </p>
        ) : null}
        {groups.motifs.map((row) => {
          const { page, status } = row;
          if (status === "generating" || status === "error") {
            const error = rowError?.slug === page.slug ? rowError.message : null;
            return (
              <div
                key={page.id}
                className={clsx(
                  "rounded-xl px-3 py-2",
                  status === "error" ? "bg-danger-100/50" : "bg-cream-50",
                )}
                data-page-status={status}
              >
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm text-ink-700">{page.title}</span>
                  {status === "generating" ? (
                    <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-ink-500">
                      <Spinner /> En préparation…
                    </span>
                  ) : (
                    <span className="shrink-0 text-xs font-medium text-danger-500">Échec</span>
                  )}
                </div>
                {status === "error" ? (
                  <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-danger-500">
                      {error ?? row.generating?.error ?? "La génération a échoué."}
                    </p>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={retrying === page.slug}
                        onClick={() => void retry(page.slug)}
                        className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-ink-700 ring-1 ring-cream-300 hover:bg-cream-100 disabled:opacity-60"
                      >
                        {retrying === page.slug ? "Relance…" : "Réessayer"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void removeFailed(row)}
                        className="rounded-full px-2.5 py-1 text-xs font-medium text-danger-500 hover:bg-danger-100"
                      >
                        Supprimer
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          }
          return (
            <PageRow
              key={page.id}
              title={page.title}
              muted={!row.enabled}
              selected={isPagePreview && page.id === selectedPageId}
              onClick={() => onSelectPage(page)}
              trailing={
                <>
                  <label className="flex shrink-0 cursor-pointer items-center gap-1.5">
                    <span
                      aria-hidden
                      className={clsx("h-2 w-2 rounded-full", row.enabled ? "bg-success-500" : "bg-danger-500")}
                    />
                    <select
                      aria-label={`Activation de la page « ${page.title} »`}
                      value={row.enabled ? "on" : "off"}
                      onChange={(event) => void onToggle(page.slug, event.target.value === "on")}
                      className="cursor-pointer rounded-md border-0 bg-transparent py-0.5 pr-1 text-xs font-medium text-ink-700 focus:outline-none focus:ring-2 focus:ring-primary-100"
                    >
                      <option value="on">Activé</option>
                      <option value="off">Désactivé</option>
                    </select>
                  </label>
                  <RowMenu
                    label={`Actions pour « ${page.title} »`}
                    items={[
                      { label: "Modifier le titre", onClick: () => setModal({ kind: "rename", row }) },
                      { label: "Référencement", onClick: () => setModal({ kind: "seo", row }) },
                      { label: "Changer de spécialité", onClick: () => setModal({ kind: "subject", row }) },
                      { label: "Supprimer la page", danger: true, onClick: () => setModal({ kind: "delete", row }) },
                    ]}
                  />
                </>
              }
            />
          );
        })}
        {groups.maxMotifPages > 0 ? (
          <div>
            <button
              type="button"
              disabled={!groups.canAdd}
              onClick={() => setModal({ kind: "add" })}
              className="flex w-full items-center gap-2 rounded-xl border border-dashed border-ink-300 px-3 py-2 text-left text-sm font-medium text-ink-500 transition-colors hover:border-primary-400 hover:text-primary-500 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-ink-300 disabled:hover:text-ink-500"
            >
              <span aria-hidden className="text-base leading-none">
                +
              </span>
              Ajouter une page
            </button>
            {!groups.canAdd ? (
              <p className="mt-1 px-3 text-[11px] leading-snug text-ink-500">
                Votre formule comprend {groups.maxMotifPages} pages de spécialité : pour changer de sujet,
                utilisez « Changer de spécialité » ou supprimez une page.
              </p>
            ) : null}
          </div>
        ) : null}
      </Group>

      {/* ── Page introuvable ────────────────────────────────────────────── */}
      <Group title="Page introuvable">
        <PageRow
          title="Page introuvable (404)"
          selected={previewTarget.kind === "notFound"}
          onClick={() => onPreview({ kind: "notFound" })}
          trailing={
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setModal({ kind: "notFound" });
              }}
              className="shrink-0 rounded-full bg-white px-2.5 py-1 text-xs font-medium text-ink-700 ring-1 ring-cream-300 hover:bg-cream-100"
            >
              Personnaliser
            </button>
          }
        />
      </Group>

      {/* ── Pages légales ───────────────────────────────────────────────── */}
      <Group title="Pages légales">
        {LEGAL_PAGES.map((legal) => (
          <PageRow
            key={legal.slug}
            title={legal.title}
            selected={previewTarget.kind === "legal" && previewTarget.slug === legal.slug}
            onClick={() => onPreview({ kind: "legal", slug: legal.slug })}
            trailing={
              <span
                className="inline-flex shrink-0 items-center gap-1 text-[11px] text-ink-500"
                title="Contenu généré à partir de vos informations légales"
              >
                <span aria-hidden>🔒</span> générée automatiquement
              </span>
            }
          />
        ))}
        <button
          type="button"
          onClick={() => onOpenSettings("legal")}
          className="mt-1 px-3 text-left text-xs font-medium text-primary-600 hover:underline"
        >
          Compléter mes informations légales →
        </button>
      </Group>

      {/* ── Modales ─────────────────────────────────────────────────────── */}
      {modal?.kind === "rename" ? (
        <RenameModal
          row={modal.row}
          onClose={() => setModal(null)}
          onDone={(title) => {
            setModal(null);
            props.onRenamed(modal.row.page.slug, title);
          }}
        />
      ) : null}
      {modal?.kind === "seo" ? (
        <SeoModal
          row={modal.row}
          onClose={() => setModal(null)}
          onDone={() => {
            setModal(null);
            props.onChanged();
          }}
        />
      ) : null}
      {modal?.kind === "subject" ? (
        <ChangeSubjectModal
          row={modal.row}
          onToggle={onToggle}
          onClose={() => setModal(null)}
          onDone={() => {
            setModal(null);
            props.onChanged();
          }}
        />
      ) : null}
      {modal?.kind === "delete" ? (
        <DeleteModal
          row={modal.row}
          onClose={() => setModal(null)}
          onDone={() => {
            setModal(null);
            props.onDeleted(modal.row.page);
          }}
        />
      ) : null}
      {modal?.kind === "add" ? (
        <AddPageModal
          maxMotifPages={groups.maxMotifPages}
          cardAvailable={canAddHomeCard(homeSpecialtiesCount, plan)}
          homeSpecialtiesMax={homeSpecialtiesMax}
          onClose={() => setModal(null)}
          onDone={() => {
            setModal(null);
            props.onChanged();
          }}
        />
      ) : null}
      {modal?.kind === "notFound" ? (
        <NotFoundModal
          value={props.notFound}
          onClose={() => setModal(null)}
          onDone={() => {
            setModal(null);
            props.onChanged();
            onPreview({ kind: "notFound" });
          }}
        />
      ) : null}
    </div>
  );
}

// ─── Briques du panneau ───────────────────────────────────────────────────────

function Group({ title, counter, children }: { title: string; counter?: string; children: ReactNode }) {
  return (
    <section aria-label={title}>
      <div className="mb-1.5 flex items-baseline justify-between gap-2 px-3">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">{title}</h3>
        {counter ? <span className="text-[11px] tabular-nums text-ink-500">{counter}</span> : null}
      </div>
      <div className="space-y-1">{children}</div>
    </section>
  );
}

/** Ligne de page : titre cliquable + zone d'actions à droite. */
function PageRow({
  title,
  selected,
  muted,
  onClick,
  trailing,
}: {
  title: string;
  selected: boolean;
  muted?: boolean;
  onClick: () => void;
  trailing?: ReactNode;
}) {
  return (
    <div
      className={clsx(
        "flex items-center gap-2 rounded-xl px-3 py-1.5 transition-colors",
        selected ? "bg-primary-50 ring-1 ring-primary-200" : "hover:bg-cream-100",
      )}
      aria-current={selected ? "true" : undefined}
    >
      <button
        type="button"
        onClick={onClick}
        className={clsx(
          "min-w-0 flex-1 truncate py-0.5 text-left text-sm",
          selected ? "font-semibold text-ink-900" : "text-ink-700",
          muted && "text-ink-500 line-through decoration-ink-300",
        )}
      >
        {title}
      </button>
      {trailing}
    </div>
  );
}

/** Menu ⋯ d'une page de spécialité. */
function RowMenu({
  label,
  items,
}: {
  label: string;
  items: { label: string; onClick: () => void; danger?: boolean }[];
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex h-7 w-7 items-center justify-center rounded-full text-base leading-none text-ink-500 hover:bg-cream-200 hover:text-ink-900"
      >
        ⋯
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-1 w-52 overflow-hidden rounded-xl border border-cream-300 bg-white py-1 shadow-lg"
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
              className={clsx(
                "block w-full px-3 py-1.5 text-left text-sm hover:bg-cream-100",
                item.danger ? "text-danger-500" : "text-ink-700",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

const inputClass =
  "w-full rounded-xl border border-ink-300 bg-white px-3 py-2 text-sm focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100";

function ModalField({
  label,
  hint,
  length,
  limit,
  children,
}: {
  label: string;
  hint?: string;
  length?: number;
  limit?: number;
  children: ReactNode;
}) {
  // `<label>` englobant : le champ (enfant) est associé à son libellé sans id
  return (
    <div>
      <label className="block">
        <span className="mb-1 flex items-baseline justify-between gap-2">
          <span className="text-sm font-medium">{label}</span>
          {limit !== undefined && length !== undefined ? <CharCounter length={length} limit={limit} /> : null}
        </span>
        {children}
      </label>
      {hint ? <p className="mt-1 text-xs text-ink-500">{hint}</p> : null}
    </div>
  );
}

function ErrorLine({ message }: { message: string | null }) {
  return message ? <p className="text-xs text-danger-500">{message}</p> : null;
}

function CancelButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <Button variant="ghost" onClick={onClick} disabled={disabled}>
      Annuler
    </Button>
  );
}

// ─── Modales ──────────────────────────────────────────────────────────────────

function RenameModal({
  row,
  onClose,
  onDone,
}: {
  row: MotifRow;
  onClose: () => void;
  onDone: (title: string) => void;
}) {
  const [title, setTitle] = useState(row.page.title);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const trimmed = title.trim();

  // Champ pré-rempli et sélectionné à l'ouverture (après le focus initial de la boîte)
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  async function submit() {
    if (trimmed.length < 3 || busy) return;
    setBusy(true);
    setError(null);
    const result = await renameMotifPage({ slug: row.page.slug, title: trimmed });
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    onDone(trimmed);
  }

  return (
    <Modal
      open
      onClose={() => !busy && onClose()}
      title="Modifier le titre"
      footer={
        <>
          <CancelButton onClick={onClose} disabled={busy} />
          <Button onClick={() => void submit()} disabled={busy || trimmed.length < 3 || trimmed === row.page.title}>
            {busy ? <Spinner className="text-white" /> : null}
            Enregistrer
          </Button>
        </>
      }
    >
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <ModalField label="Titre de la page" length={title.length} limit={120}>
          <input
            ref={inputRef}
            value={title}
            maxLength={180}
            onChange={(e) => setTitle(e.target.value)}
            className={inputClass}
          />
        </ModalField>
        <p className="rounded-xl bg-cream-100 px-3 py-2 text-xs text-ink-500">
          L&apos;adresse de cette page reste inchangée. Son contenu ne sera pas régénéré. Le titre de la carte
          correspondante sur l&apos;accueil est mis à jour.
        </p>
        <ErrorLine message={error} />
      </form>
    </Modal>
  );
}

function SeoModal({ row, onClose, onDone }: { row: MotifRow; onClose: () => void; onDone: () => void }) {
  const [metaTitle, setMetaTitle] = useState(row.page.metaTitle ?? "");
  const [metaDescription, setMetaDescription] = useState(row.page.metaDescription ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await savePageSeo({ pageId: row.page.id, metaTitle, metaDescription });
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    onDone();
  }

  return (
    <Modal
      open
      onClose={() => !busy && onClose()}
      title={`Référencement — ${row.page.title}`}
      footer={
        <>
          <CancelButton onClick={onClose} disabled={busy} />
          <Button onClick={() => void submit()} disabled={busy}>
            {busy ? <Spinner className="text-white" /> : null}
            Enregistrer
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <ModalField
          label="Titre SEO"
          hint="Le titre bleu du résultat Google. Recommandé : spécialité + ville, 70 caractères maximum."
          length={metaTitle.length}
          limit={70}
        >
          <input
            autoFocus
            value={metaTitle}
            maxLength={120}
            placeholder={`${row.page.title} — …`}
            onChange={(e) => setMetaTitle(e.target.value)}
            className={inputClass}
          />
        </ModalField>
        <ModalField
          label="Description"
          hint="Les deux lignes grises sous le titre. Recommandé : 170 caractères maximum, avec une invitation à prendre rendez-vous."
          length={metaDescription.length}
          limit={170}
        >
          <textarea
            value={metaDescription}
            maxLength={300}
            rows={3}
            onChange={(e) => setMetaDescription(e.target.value)}
            className={clsx(inputClass, "resize-y")}
          />
        </ModalField>
        <ErrorLine message={error} />
      </div>
    </Modal>
  );
}

function ChangeSubjectModal({
  row,
  onToggle,
  onClose,
  onDone,
}: {
  row: MotifRow;
  onToggle: (slug: string, enabled: boolean) => Promise<boolean>;
  onClose: () => void;
  onDone: () => void;
}) {
  const [subject, setSubject] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmed = subject.trim();

  async function submit() {
    if (trimmed.length < 3 || busy) return;
    setBusy(true);
    setError(null);
    // Hors ligne pendant la préparation : l'ancien contenu ne reste pas servi
    // sous un nouveau titre. Ré-activée ensuite si elle l'était.
    const wasEnabled = row.enabled;
    if (wasEnabled) await onToggle(row.page.slug, false);
    const result = await regenerateMotifPage({ slug: row.page.slug, title: trimmed });
    if (wasEnabled) await onToggle(row.page.slug, true);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    onDone();
  }

  return (
    <Modal
      open
      onClose={() => !busy && onClose()}
      title={`Changer de spécialité — ${row.page.title}`}
      footer={
        <>
          <CancelButton onClick={onClose} disabled={busy} />
          <Button onClick={() => void submit()} disabled={busy || trimmed.length < 3}>
            {busy ? <Spinner className="text-white" /> : null}
            {busy ? "Préparation en cours…" : "Régénérer la page"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <ModalField label="Nouvelle spécialité" length={subject.length} limit={120}>
          <input
            autoFocus
            value={subject}
            maxLength={180}
            disabled={busy}
            placeholder="ex. Anxiété et stress"
            onChange={(e) => setSubject(e.target.value)}
            className={inputClass}
          />
        </ModalField>
        <div className="rounded-xl border border-warning-500/40 bg-warning-100 px-3 py-2.5 text-xs leading-relaxed text-ink-700">
          <p className="font-semibold">⚠ Le contenu de la page sera entièrement régénéré.</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            <li>Textes, questions et photo sont réécrits pour le nouveau sujet (environ une minute).</li>
            <li>La page est hors ligne pendant la préparation, puis remise en ligne si elle l&apos;était.</li>
            <li>La carte correspondante de l&apos;accueil est synchronisée ; l&apos;adresse de la page ne change pas.</li>
          </ul>
        </div>
        {busy ? (
          <p className="flex items-center gap-2 rounded-xl bg-cream-100 px-3 py-2 text-xs text-ink-700">
            <Spinner /> Préparation en cours — cela prend environ une minute, ne fermez pas cette fenêtre.
          </p>
        ) : null}
        <ErrorLine message={error} />
      </div>
    </Modal>
  );
}

function DeleteModal({ row, onClose, onDone }: { row: MotifRow; onClose: () => void; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await deleteMotifPage({ slug: row.page.slug });
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    onDone();
  }

  return (
    <Modal
      open
      onClose={() => !busy && onClose()}
      title="Supprimer la page"
      footer={
        <>
          <CancelButton onClick={onClose} disabled={busy} />
          <Button variant="danger" onClick={() => void submit()} disabled={busy}>
            {busy ? <Spinner className="text-white" /> : null}
            Supprimer définitivement
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm text-ink-700">
        <p>
          Supprimer la page <strong>« {row.page.title} »</strong> ? Cette action est{" "}
          <strong>irréversible</strong>.
        </p>
        <ul className="list-disc space-y-0.5 pl-5 text-xs text-ink-500">
          <li>La page et son contenu sont effacés ; son adresse ne répond plus (page introuvable).</li>
          <li>Sa carte disparaît de l&apos;accueil et du menu.</li>
          <li>Les sujets d&apos;articles prévus pour cette spécialité sont retirés du calendrier.</li>
        </ul>
        <ErrorLine message={error} />
      </div>
    </Modal>
  );
}

function AddPageModal({
  maxMotifPages,
  cardAvailable,
  homeSpecialtiesMax,
  onClose,
  onDone,
}: {
  maxMotifPages: number;
  cardAvailable: boolean;
  homeSpecialtiesMax: number;
  onClose: () => void;
  onDone: () => void;
}) {
  const [subject, setSubject] = useState("");
  const [showCard, setShowCard] = useState(cardAvailable);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmed = subject.trim();

  async function submit() {
    if (trimmed.length < 3 || busy) return;
    setBusy(true);
    setError(null);
    const result = await createMotifPage({ subject: trimmed, showCard: cardAvailable && showCard });
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    onDone();
  }

  return (
    <Modal
      open
      onClose={() => !busy && onClose()}
      title="Ajouter une page de spécialité"
      footer={
        <>
          <CancelButton onClick={onClose} disabled={busy} />
          <Button onClick={() => void submit()} disabled={busy || trimmed.length < 3}>
            {busy ? <Spinner className="text-white" /> : null}
            Créer la page
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <ModalField
          label="Sujet de la page"
          hint={`Votre formule comprend ${maxMotifPages} pages de spécialité. Le contenu (textes, questions, photo) est préparé en arrière-plan : la page apparaît désactivée, vous la relisez puis l'activez.`}
          length={subject.length}
          limit={120}
        >
          <input
            autoFocus
            required
            value={subject}
            maxLength={180}
            placeholder="ex. Anxiété et stress"
            onChange={(e) => setSubject(e.target.value)}
            className={inputClass}
          />
        </ModalField>
        <label
          className={clsx(
            "flex items-start gap-3 rounded-xl border px-3 py-2.5",
            cardAvailable ? "cursor-pointer border-cream-300" : "border-cream-200 bg-cream-50",
          )}
        >
          <input
            type="checkbox"
            disabled={!cardAvailable}
            checked={cardAvailable && showCard}
            onChange={(e) => setShowCard(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-primary-500"
          />
          <span className="min-w-0">
            <span className={clsx("block text-sm font-medium", !cardAvailable && "text-ink-500")}>
              Afficher une carte sur l&apos;accueil
            </span>
            <span className="mt-0.5 block text-xs text-ink-500">
              {cardAvailable
                ? "Ajoute la spécialité à la section « Spécialités » de la page d'accueil, une fois le contenu prêt."
                : `Les ${homeSpecialtiesMax} emplacements de cartes sont occupés. Vous pourrez modifier les cartes existantes dans la section « Spécialités » de l'accueil.`}
            </span>
          </span>
        </label>
        <ErrorLine message={error} />
      </form>
    </Modal>
  );
}

function NotFoundModal({
  value,
  onClose,
  onDone,
}: {
  value: Required<SiteNotFound>;
  onClose: () => void;
  onDone: () => void;
}) {
  const [title, setTitle] = useState(value.title);
  const [message, setMessage] = useState(value.message);
  const [buttonLabel, setButtonLabel] = useState(value.buttonLabel);
  const [showSpecialties, setShowSpecialties] = useState(value.showSpecialties);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setTitle(DEFAULT_NOT_FOUND.title);
    setMessage(DEFAULT_NOT_FOUND.message);
    setButtonLabel(DEFAULT_NOT_FOUND.buttonLabel);
    setShowSpecialties(DEFAULT_NOT_FOUND.showSpecialties);
  }

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await saveNotFoundSettings({ title, message, buttonLabel, showSpecialties });
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    onDone();
  }

  return (
    <Modal
      open
      onClose={() => !busy && onClose()}
      title="Page introuvable"
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={reset} disabled={busy} className="mr-auto">
            Rétablir les valeurs par défaut
          </Button>
          <CancelButton onClick={onClose} disabled={busy} />
          <Button onClick={() => void submit()} disabled={busy}>
            {busy ? <Spinner className="text-white" /> : null}
            Enregistrer et voir la page
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-ink-500">
          Affichée quand un visiteur suit un lien qui n&apos;existe plus (ancienne page, faute de frappe). Elle
          le ramène vers votre site plutôt que vers une erreur brute.
        </p>
        <ModalField label="Titre" length={title.length} limit={80}>
          <input
            autoFocus
            value={title}
            maxLength={120}
            placeholder={DEFAULT_NOT_FOUND.title}
            onChange={(e) => setTitle(e.target.value)}
            className={inputClass}
          />
        </ModalField>
        <ModalField label="Message" hint="Facultatif : vide = aucun message affiché." length={message.length} limit={200}>
          <textarea
            value={message}
            maxLength={300}
            rows={2}
            onChange={(e) => setMessage(e.target.value)}
            className={clsx(inputClass, "resize-y")}
          />
        </ModalField>
        <ModalField label="Texte du bouton (retour à l'accueil)" length={buttonLabel.length} limit={40}>
          <input
            value={buttonLabel}
            maxLength={60}
            placeholder={DEFAULT_NOT_FOUND.buttonLabel}
            onChange={(e) => setButtonLabel(e.target.value)}
            className={clsx(inputClass, "max-w-xs")}
          />
        </ModalField>
        <div className="flex items-center gap-3 rounded-xl bg-cream-100 px-3 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Afficher les spécialités</p>
            <p className="mt-0.5 text-xs text-ink-500">
              Propose des liens vers vos premières pages de spécialité activées.
            </p>
          </div>
          <ToggleSwitch checked={showSpecialties} label="Afficher les spécialités" onChange={setShowSpecialties} />
        </div>
        <ErrorLine message={error} />
      </div>
    </Modal>
  );
}
