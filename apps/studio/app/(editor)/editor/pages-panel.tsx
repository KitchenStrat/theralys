"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { clsx } from "clsx";
import {
  ArrowRight,
  ChevronDown,
  CircleCheck,
  CircleOff,
  Ellipsis,
  EyeOff,
  FileQuestion,
  FileText,
  House,
  Lock,
  PenLine,
  Plus,
  Replace,
  RotateCw,
  Scale,
  Search,
  Trash2,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { Modal } from "@theralys/ui";
import { Badge, Button, Spinner } from "@/components/ds";
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
import { ADD_BUTTON, DANGER_LINK, HINT, ICON_BUTTON, INPUT, LABEL, Note, TEXTAREA, TEXT_LINK } from "./editor-ui";
import { CharCounter, ToggleSwitch, visibleLength } from "./section-fields";

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
    <div className="space-y-6">
      {/* ── Page principale ─────────────────────────────────────────────── */}
      <Group title="Page principale">
        {groups.home ? (
          <PageRow
            title="Accueil"
            icon={House}
            selected={isPagePreview && groups.home.id === selectedPageId}
            onClick={() => onSelectPage(groups.home!)}
            trailing={
              <span
                className={clsx("inline-flex shrink-0 items-center gap-1.5 pr-1", HINT)}
                title="La page d'accueil est toujours en ligne"
              >
                <Lock size={14} aria-hidden /> Toujours en ligne
              </span>
            }
          />
        ) : (
          <p className={clsx("px-1", HINT)}>Aucune page d&apos;accueil.</p>
        )}
      </Group>

      {/* ── Pages de spécialité ─────────────────────────────────────────── */}
      <Group
        title="Pages de spécialité"
        counter={groups.motifCount > 0 ? motifCounterLabel(groups) : undefined}
      >
        {groups.motifs.length === 0 && !groups.canAdd ? (
          <p className={clsx("px-1 py-1", HINT)}>Votre formule ne comprend pas de page de spécialité dédiée.</p>
        ) : null}
        {groups.motifs.map((row) => {
          const { page, status } = row;
          if (status === "generating" || status === "error") {
            const error = rowError?.slug === page.slug ? rowError.message : null;
            return (
              <div
                key={page.id}
                className={clsx(
                  "rounded-ds-sm px-3 py-2.5",
                  status === "error" ? "bg-ds-danger-100" : "bg-ds-section-tint inset-ring inset-ring-ds-section-line/70",
                )}
                data-page-status={status}
              >
                <div className="flex min-h-7 items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-ds-body font-medium text-ds-ink-800">{page.title}</span>
                  {status === "generating" ? (
                    <span className="inline-flex shrink-0 items-center gap-1.5 text-ds-meta font-medium text-ds-section-ink">
                      <Spinner /> En préparation…
                    </span>
                  ) : (
                    <Badge tone="danger" icon={TriangleAlert} className="shrink-0 bg-white!">
                      Échec
                    </Badge>
                  )}
                </div>
                {status === "error" ? (
                  <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-ds-meta font-medium text-ds-danger-900">
                      {error ?? row.generating?.error ?? "La génération a échoué."}
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        loading={retrying === page.slug}
                        icon={<RotateCw size={15} aria-hidden />}
                        onClick={() => void retry(page.slug)}
                      >
                        {retrying === page.slug ? "Relance…" : "Réessayer"}
                      </Button>
                      <button type="button" onClick={() => void removeFailed(row)} className={clsx(DANGER_LINK, "hover:bg-white")}>
                        <Trash2 size={15} aria-hidden />
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
              icon={row.enabled ? FileText : EyeOff}
              muted={!row.enabled}
              selected={isPagePreview && page.id === selectedPageId}
              onClick={() => onSelectPage(page)}
              trailing={
                <>
                  {/* L'état se lit dans le mot (« Activé », « Désactivé ») ; le pictogramme et sa couleur le doublent */}
                  <label className="relative flex shrink-0 cursor-pointer items-center">
                    {row.enabled ? (
                      <CircleCheck size={16} aria-hidden className="pointer-events-none absolute left-2.5 text-ds-success-700" />
                    ) : (
                      <CircleOff size={16} aria-hidden className="pointer-events-none absolute left-2.5 text-ds-ink-600" />
                    )}
                    <select
                      aria-label={`Activation de la page « ${page.title} »`}
                      value={row.enabled ? "on" : "off"}
                      onChange={(event) => void onToggle(page.slug, event.target.value === "on")}
                      className="min-h-9 cursor-pointer appearance-none rounded-full bg-white py-1 pl-8 pr-7 text-ds-meta font-semibold text-ds-ink-800 inset-ring inset-ring-ds-ink-300 pointer-coarse:min-h-11"
                    >
                      <option value="on">Activé</option>
                      <option value="off">Désactivé</option>
                    </select>
                    <ChevronDown size={14} aria-hidden className="pointer-events-none absolute right-2.5 text-ds-ink-600" />
                  </label>
                  <RowMenu
                    label={`Actions pour « ${page.title} »`}
                    items={[
                      { label: "Modifier le titre", icon: PenLine, onClick: () => setModal({ kind: "rename", row }) },
                      { label: "Référencement", icon: Search, onClick: () => setModal({ kind: "seo", row }) },
                      { label: "Changer de spécialité", icon: Replace, onClick: () => setModal({ kind: "subject", row }) },
                      { label: "Supprimer la page", icon: Trash2, danger: true, onClick: () => setModal({ kind: "delete", row }) },
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
              className={ADD_BUTTON}
            >
              <Plus size={18} aria-hidden />
              Ajouter une page
            </button>
            {!groups.canAdd ? (
              <p className={clsx("mt-1.5 px-1", HINT)}>
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
          icon={FileQuestion}
          selected={previewTarget.kind === "notFound"}
          onClick={() => onPreview({ kind: "notFound" })}
          trailing={
            <Button
              type="button"
              variant="secondary"
              size="sm"
              icon={<PenLine size={15} aria-hidden />}
              onClick={(e) => {
                e.stopPropagation();
                setModal({ kind: "notFound" });
              }}
            >
              Personnaliser
            </Button>
          }
        />
      </Group>

      {/* ── Pages légales ───────────────────────────────────────────────── */}
      <Group
        title="Pages légales"
        note={
          <p className={clsx("mb-2 flex items-start gap-1.5 px-1", HINT)}>
            <Lock size={14} aria-hidden className="mt-[3px] shrink-0" />
            Générées automatiquement à partir de vos informations légales.
          </p>
        }
      >
        {LEGAL_PAGES.map((legal) => (
          <PageRow
            key={legal.slug}
            title={legal.title}
            icon={Scale}
            selected={previewTarget.kind === "legal" && previewTarget.slug === legal.slug}
            onClick={() => onPreview({ kind: "legal", slug: legal.slug })}
          />
        ))}
        <button
          type="button"
          onClick={() => onOpenSettings("legal")}
          className={clsx(TEXT_LINK, "mt-1 inline-flex min-h-9 items-center gap-1.5 px-1 text-left text-ds-meta pointer-coarse:min-h-11")}
        >
          Compléter mes informations légales
          <ArrowRight size={14} aria-hidden className="shrink-0" />
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

function Group({
  title,
  counter,
  note,
  children,
}: {
  title: string;
  counter?: string;
  /** Mention commune à toutes les lignes du groupe, sous son titre */
  note?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-label={title}>
      <div className="mb-2 flex items-baseline justify-between gap-2 px-1">
        <h3 className="font-ds-display text-ds-body font-bold text-ds-ink-900">{title}</h3>
        {counter ? <span className="text-ds-meta text-ds-ink-600 ds-tnum">{counter}</span> : null}
      </div>
      {note}
      <div className="space-y-1.5">{children}</div>
    </section>
  );
}

/** Ligne de page : titre cliquable + zone d'actions à droite. */
function PageRow({
  title,
  icon: Icon,
  selected,
  muted,
  onClick,
  trailing,
}: {
  title: string;
  icon: LucideIcon;
  selected: boolean;
  /** Page désactivée : titre atténué (son état est dit par le sélecteur voisin) */
  muted?: boolean;
  onClick: () => void;
  trailing?: ReactNode;
}) {
  // Ligne affichée dans l'aperçu : fond teinté, trait en dégradé à gauche, graisse — plus `aria-current`.
  // Si le titre et les actions ne tiennent pas côte à côte (écran étroit), les actions passent dessous.
  return (
    <div
      className={clsx(
        "relative flex flex-wrap items-center gap-x-2 rounded-ds-sm py-0.5 pl-3 pr-1.5",
        selected
          ? "bg-ds-section-tint-2 inset-ring inset-ring-ds-section-line"
          : "bg-white inset-ring inset-ring-ds-ink-200 hover:bg-ds-ink-50",
      )}
      aria-current={selected ? "true" : undefined}
    >
      {selected ? <span aria-hidden className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-ds-section-gradient" /> : null}
      <button
        type="button"
        onClick={onClick}
        className={clsx(
          "flex min-h-11 min-w-40 flex-1 items-center gap-2.5 rounded-ds-sm py-1 text-left text-ds-body ds-focus",
          selected ? "font-semibold text-ds-section-ink" : muted ? "text-ds-ink-600" : "font-medium text-ds-ink-800",
        )}
      >
        <Icon size={18} aria-hidden className={clsx("shrink-0", selected ? "text-ds-section-accent" : "text-ds-ink-600")} />
        <span className="line-clamp-2 min-w-0">{title}</span>
      </button>
      {trailing ? <div className="ml-auto flex shrink-0 items-center gap-1.5 pb-0.5">{trailing}</div> : null}
    </div>
  );
}

/** Menu ⋯ d'une page de spécialité. */
function RowMenu({
  label,
  items,
}: {
  label: string;
  items: { label: string; icon: LucideIcon; onClick: () => void; danger?: boolean }[];
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    // Clavier : focus sur le premier élément, flèches ↑↓ / Début / Fin, Échap
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const onDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
        return;
      }
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      const entries = [...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
      if (entries.length === 0) return;
      event.preventDefault();
      const index = entries.findIndex((el) => el === document.activeElement);
      const next =
        event.key === "Home" ? 0
        : event.key === "End" ? entries.length - 1
        : event.key === "ArrowDown" ? (index + 1) % entries.length
        : (index - 1 + entries.length) % entries.length;
      entries[next]?.focus();
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
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={ICON_BUTTON}
      >
        <Ellipsis size={18} aria-hidden />
      </button>
      {open ? (
        <div
          ref={menuRef}
          role="menu"
          className="absolute right-0 top-full z-30 mt-1 w-60 max-w-[calc(100vw-2rem)] overflow-hidden rounded-ds-md bg-white py-1.5 shadow-ds-pop ring-1 ring-ds-ink-200 ds-fade-in"
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                // Le focus revient au bouton ⋯ avant l'ouverture d'une modale :
                // c'est lui qui le récupère à la fermeture (l'élément de menu est démonté)
                buttonRef.current?.focus();
                item.onClick();
              }}
              className={clsx(
                "flex min-h-10 w-full items-center gap-2.5 px-3.5 py-1.5 text-left text-ds-body font-medium ds-focus-inset pointer-coarse:min-h-11",
                item.danger ? "text-ds-danger-700 hover:bg-ds-danger-100" : "text-ds-ink-800 hover:bg-ds-ink-100",
              )}
            >
              <item.icon size={16} aria-hidden className="shrink-0" />
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

const inputClass = INPUT;

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
        <span className="mb-1.5 flex items-baseline justify-between gap-2">
          <span className={LABEL}>{label}</span>
          {limit !== undefined && length !== undefined ? <CharCounter length={length} limit={limit} /> : null}
        </span>
        {children}
      </label>
      {hint ? <p className={clsx("mt-1.5", HINT)}>{hint}</p> : null}
    </div>
  );
}

/** Erreur rendue par le service à l'envoi d'une fenêtre : annoncée aussitôt, pictogramme et texte. */
function ErrorLine({ message }: { message: string | null }) {
  return message ? (
    <p role="alert" className="flex items-start gap-2 text-sm font-medium text-ds-danger-700">
      <TriangleAlert size={16} aria-hidden className="mt-0.5 shrink-0" />
      <span className="min-w-0">{message}</span>
    </p>
  ) : null;
}

function CancelButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <Button variant="quiet" onClick={onClick} disabled={disabled}>
      Annuler
    </Button>
  );
}

/**
 * Boutons du pied d'une fenêtre : alignés à droite, ils passent à la ligne sur
 * un écran étroit au lieu de faire défiler la fenêtre (le pied de la `Modal`
 * partagée ne le fait pas).
 */
function ModalActions({ children }: { children: ReactNode }) {
  return <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-x-3 gap-y-2">{children}</div>;
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
        <ModalActions>
          <CancelButton onClick={onClose} disabled={busy} />
          <Button loading={busy} onClick={() => void submit()} disabled={trimmed.length < 3 || trimmed === row.page.title}>
            Enregistrer
          </Button>
        </ModalActions>
      }
    >
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <ModalField label="Titre de la page" length={visibleLength(title)} limit={120}>
          <input
            ref={inputRef}
            value={title}
            maxLength={180}
            onChange={(e) => setTitle(e.target.value)}
            className={inputClass}
          />
        </ModalField>
        <Note tone="info">
          L&apos;adresse de cette page reste inchangée. Son contenu ne sera pas régénéré. Le titre de la carte
          correspondante sur l&apos;accueil est mis à jour.
        </Note>
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
        <ModalActions>
          <CancelButton onClick={onClose} disabled={busy} />
          <Button loading={busy} onClick={() => void submit()}>
            Enregistrer
          </Button>
        </ModalActions>
      }
    >
      <div className="space-y-4">
        <ModalField
          label="Titre SEO"
          hint="Le titre bleu du résultat Google. Recommandé : spécialité + ville, 70 caractères maximum."
          length={visibleLength(metaTitle)}
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
          length={visibleLength(metaDescription)}
          limit={170}
        >
          <textarea
            value={metaDescription}
            maxLength={300}
            rows={3}
            onChange={(e) => setMetaDescription(e.target.value)}
            className={TEXTAREA}
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
        <ModalActions>
          <CancelButton onClick={onClose} disabled={busy} />
          <Button loading={busy} onClick={() => void submit()} disabled={trimmed.length < 3}>
            {busy ? "Préparation en cours…" : "Régénérer la page"}
          </Button>
        </ModalActions>
      }
    >
      <div className="space-y-4">
        <ModalField label="Nouvelle spécialité" length={visibleLength(subject)} limit={120}>
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
        <Note tone="warning">
          <p className="font-semibold">Le contenu de la page sera entièrement régénéré.</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            <li>Textes, questions et photo sont réécrits pour le nouveau sujet (environ une minute).</li>
            <li>La page est hors ligne pendant la préparation, puis remise en ligne si elle l&apos;était.</li>
            <li>La carte correspondante de l&apos;accueil est synchronisée ; l&apos;adresse de la page ne change pas.</li>
          </ul>
        </Note>
        {busy ? (
          <p role="status" className="flex items-start gap-2.5 rounded-ds-sm bg-ds-section-tint px-3 py-2.5 text-ds-meta font-medium text-ds-ink-700 ring-1 ring-ds-section-line/70">
            <Spinner className="mt-0.5 size-4 text-ds-section-accent" />
            <span className="min-w-0">Préparation en cours — cela prend environ une minute, ne fermez pas cette fenêtre.</span>
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
        <ModalActions>
          <CancelButton onClick={onClose} disabled={busy} />
          <Button variant="danger" loading={busy} icon={<Trash2 size={17} aria-hidden />} onClick={() => void submit()}>
            Supprimer définitivement
          </Button>
        </ModalActions>
      }
    >
      <div className="space-y-3 text-ds-body text-ds-ink-800">
        <p>
          Supprimer la page <strong>« {row.page.title} »</strong> ? Cette action est{" "}
          <strong>irréversible</strong>.
        </p>
        <ul className="list-disc space-y-1 pl-5 text-ds-meta text-ds-ink-600">
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
        <ModalActions>
          <CancelButton onClick={onClose} disabled={busy} />
          <Button loading={busy} icon={<Plus size={18} aria-hidden />} onClick={() => void submit()} disabled={trimmed.length < 3}>
            Créer la page
          </Button>
        </ModalActions>
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
          length={visibleLength(subject)}
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
            "flex items-start gap-3 rounded-ds-sm px-3 py-3 inset-ring",
            cardAvailable ? "cursor-pointer bg-white inset-ring-ds-ink-300" : "bg-ds-ink-50 inset-ring-ds-ink-200",
          )}
        >
          <input
            type="checkbox"
            disabled={!cardAvailable}
            checked={cardAvailable && showCard}
            onChange={(e) => setShowCard(e.target.checked)}
            className="size-6 shrink-0 rounded accent-ds-brand-600"
          />
          <span className="min-w-0">
            <span className={clsx("block text-ds-body font-semibold", cardAvailable ? "text-ds-ink-900" : "text-ds-ink-600")}>
              Afficher une carte sur l&apos;accueil
            </span>
            <span className={clsx("mt-0.5 block", HINT)}>
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
        <ModalActions>
          <Button variant="quiet" size="sm" icon={<RotateCw size={15} aria-hidden />} onClick={reset} disabled={busy} className="mr-auto">
            Rétablir les valeurs par défaut
          </Button>
          <CancelButton onClick={onClose} disabled={busy} />
          <Button loading={busy} onClick={() => void submit()}>
            Enregistrer et voir la page
          </Button>
        </ModalActions>
      }
    >
      <div className="space-y-4">
        <p className="text-ds-body text-ds-ink-700">
          Affichée quand un visiteur suit un lien qui n&apos;existe plus (ancienne page, faute de frappe). Elle
          le ramène vers votre site plutôt que vers une erreur brute.
        </p>
        <ModalField label="Titre" length={visibleLength(title)} limit={80}>
          <input
            autoFocus
            value={title}
            maxLength={120}
            placeholder={DEFAULT_NOT_FOUND.title}
            onChange={(e) => setTitle(e.target.value)}
            className={inputClass}
          />
        </ModalField>
        <ModalField label="Message" hint="Facultatif : vide = aucun message affiché." length={visibleLength(message)} limit={200}>
          <textarea
            value={message}
            maxLength={300}
            rows={2}
            onChange={(e) => setMessage(e.target.value)}
            className={TEXTAREA}
          />
        </ModalField>
        <ModalField label="Texte du bouton (retour à l'accueil)" length={visibleLength(buttonLabel)} limit={40}>
          <input
            value={buttonLabel}
            maxLength={60}
            placeholder={DEFAULT_NOT_FOUND.buttonLabel}
            onChange={(e) => setButtonLabel(e.target.value)}
            className={clsx(inputClass, "max-w-xs")}
          />
        </ModalField>
        <div className="flex items-center gap-3 rounded-ds-sm bg-ds-ink-50 px-3 py-2.5 ring-1 ring-ds-ink-200">
          <div className="min-w-0 flex-1">
            <p className="text-ds-body font-semibold text-ds-ink-900">Afficher les spécialités</p>
            <p className={clsx("mt-0.5", HINT)}>Propose des liens vers vos premières pages de spécialité activées.</p>
          </div>
          <ToggleSwitch checked={showSpecialties} label="Afficher les spécialités" onChange={setShowSpecialties} />
        </div>
        <ErrorLine message={error} />
      </div>
    </Modal>
  );
}
