"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { clsx } from "clsx";
import {
  ChevronRight,
  Crosshair,
  Eye,
  House,
  Info,
  MapPinned,
  Medal,
  Percent,
  Plus,
  Radar,
  Search,
  Trash2,
  TriangleAlert,
  Trophy,
} from "lucide-react";
import { FieldHint, Input, Label, Select } from "@theralys/ui";
import {
  GOOGLE_GRID_RADII,
  GOOGLE_KEYWORDS_MAX,
  GOOGLE_MANUAL_SCANS_PER_MONTH,
  estimateScanCostUsd,
  rankTone,
  type GoogleCompetitor,
  type GoogleGridRadius,
} from "@theralys/shared";
import type { GoogleBudget } from "@theralys/jobs";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  GenerationProgress,
  InlineSuccess,
  ProgressBar,
  ProgressRing,
  Skeleton,
  type TimedStep,
} from "@/components/ds";
import { formatDayFr } from "@/lib/calendar";
import type { GoogleKeywordView, GoogleProfileData, GoogleScanView } from "@/lib/google/data";
import { KEYWORD_MAX, radiusLabel } from "@/lib/google/keywords";
import type { ScanUsage } from "@/lib/google/scans";
import { GoogleVisibilityCard } from "../google-visibility-card";
import { addGoogleKeyword, removeGoogleKeyword, scanGoogleKeyword } from "./actions";
import { RANK_LEGEND_TICKS, RANK_MAX, RANK_NONE_COLOR, rankColor, rankGradientCss } from "@/lib/google/rank-colors";
import { ErrorNote, StatTile, WaitNote, type StatDelta } from "./shared";

// Leaflet touche `window` : chargé côté client seulement
const VisibilityMap = dynamic(() => import("./visibility-map").then((m) => m.VisibilityMap), {
  ssr: false,
  loading: () => (
    <div role="status" className="relative h-[360px] w-full overflow-hidden rounded-ds-md sm:h-[460px]">
      <Skeleton className="absolute inset-0 rounded-none" />
      <span className="absolute inset-0 grid place-items-center text-ds-body font-medium text-ds-ink-700">Chargement de la carte…</span>
    </div>
  ),
});

/** Votre fiche, pour la comparaison avec les concurrents. */
export type OwnListing = { name: string; rating: number | null; votes: number | null; photos: number | null };

const usd = (value: number) => `${value.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`;

/** Étapes d'un relevé lancé à la main : la dernière dure jusqu'à la réponse du serveur. */
const SCAN_STEPS: TimedStep[] = [
  { label: "Recherche sur Google Maps depuis chaque emplacement", seconds: 20 },
  { label: "Repérage de votre fiche dans les résultats", seconds: 8 },
  { label: "Calcul de votre part de visibilité", seconds: 8 },
];

export function VisibilityTab({
  linked,
  keywords,
  scanUsage,
  budget,
  own,
  searchVisibility,
  onLinkRequest,
}: {
  linked: boolean;
  keywords: GoogleKeywordView[];
  scanUsage: ScanUsage;
  budget: GoogleBudget;
  own: OwnListing;
  /** Carte « Visibilité Google » (Search Console), en tête de l'onglet */
  searchVisibility: GoogleProfileData["searchVisibility"];
  /** Fiche non reliée : ramène au champ de recherche de l'écran d'accueil */
  onLinkRequest?: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [scanning, setScanning] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedKeywordId, setSelectedKeywordId] = useState<string | null>(null);
  const [selectedScanId, setSelectedScanId] = useState<string | null>(null);

  // Mot-clé sélectionné : celui choisi s'il existe encore, sinon le premier relevé, sinon le premier
  const keyword = useMemo(() => {
    const chosen = keywords.find((k) => k.id === selectedKeywordId);
    return chosen ?? keywords.find((k) => k.scans.some((s) => s.status === "done")) ?? keywords[0] ?? null;
  }, [keywords, selectedKeywordId]);
  const doneScans = useMemo(() => keyword?.scans.filter((s) => s.status === "done") ?? [], [keyword]);
  const scan = doneScans.find((s) => s.id === selectedScanId) ?? doneScans[0] ?? null;
  const running = keyword?.scans.find((s) => s.status === "running") ?? null;
  const canScan = scanUsage.remaining > 0 && budget.remainingUsd >= estimateScanCostUsd();

  function runScan(keywordId: string) {
    setError(null);
    setMessage(null);
    setScanning(keywordId);
    startTransition(async () => {
      const result = await scanGoogleKeyword(keywordId);
      setScanning(null);
      if (result.error) {
        setError(result.error);
        return;
      }
      setSelectedKeywordId(keywordId);
      setSelectedScanId(result.scanId ?? null);
      setMessage(result.message ?? "Relevé terminé.");
      router.refresh();
    });
  }

  function remove(keywordId: string) {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await removeGoogleKeyword(keywordId);
      setRemoving(null);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (selectedKeywordId === keywordId) setSelectedKeywordId(null);
      router.refresh();
    });
  }

  const canAdd = keywords.length < GOOGLE_KEYWORDS_MAX;
  // Premier mot-clé : le formulaire est l'action de l'onglet, dans la carte des mots-clés. Ensuite il passe sous la carte.
  const firstKeyword = keywords.length === 0;
  const scanningHere = keyword !== null && scanning === keyword.id;

  return (
    <div className="space-y-6">
      <GoogleVisibilityCard gscAccess connected={searchVisibility.connected} visibility={searchVisibility.visibility} />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] xl:grid-rows-[auto_1fr] xl:items-start">
        <Card>
          <CardHeader
            icon={Search}
            title="Mots-clés suivis"
            action={
              <Badge tone="section">
                {keywords.length} / {GOOGLE_KEYWORDS_MAX}
                <span className="sr-only"> mots-clés suivis</span>
              </Badge>
            }
          />
          <p className="mt-3 text-ds-body text-ds-ink-600">
            Les recherches que tapent vos futurs patients, par exemple « sophrologue albi ». Chaque relevé interroge Google Maps
            depuis 49 emplacements autour de votre cabinet.
          </p>

          {firstKeyword ? (
            <p className="mt-5 flex items-start gap-2.5 rounded-ds-md bg-ds-section-tint px-4 py-3 text-ds-body font-medium text-ds-section-ink">
              <Info size={18} aria-hidden className="mt-0.5 shrink-0 text-ds-section-accent" />
              Ajoutez un premier mot-clé pour commencer.
            </p>
          ) : (
            <ul className="mt-5 space-y-3" aria-label="Mots-clés suivis">
              {keywords.map((k) => {
                const selected = keyword?.id === k.id;
                const isScanning = scanning === k.id || k.scans.some((s) => s.status === "running");
                const lastVisibility = k.scans.find((s) => s.status === "done")?.summary?.visibility ?? null;
                return (
                  <li
                    key={k.id}
                    className={clsx(
                      "rounded-ds-md p-3 ring-1 sm:p-3.5",
                      selected ? "bg-ds-section-tint ring-ds-section-line" : "bg-white ring-ds-ink-200",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedKeywordId(k.id);
                        setSelectedScanId(null);
                      }}
                      aria-pressed={selected}
                      className="flex min-h-11 w-full min-w-0 items-center gap-3 rounded-ds-sm text-left ds-focus"
                    >
                      <KeywordGauge visibility={lastVisibility} onTint={selected} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-base font-semibold text-ds-ink-900 [overflow-wrap:anywhere]">{k.keyword}</span>
                        <span className="block text-ds-meta text-ds-ink-600">
                          {radiusLabel(k.radius)}
                          {k.lastScannedAt ? ` · relevé le ${formatDayFr(k.lastScannedAt)}` : " · jamais relevé"}
                        </span>
                        {lastVisibility !== null ? <span className="sr-only"> — part de visibilité : {lastVisibility} %</span> : null}
                      </span>
                      {selected ? (
                        <span className="inline-flex shrink-0 items-center gap-1.5 text-ds-meta font-semibold text-ds-section-accent">
                          <Eye size={16} aria-hidden />
                          <span className="max-sm:sr-only">Sur la carte</span>
                        </span>
                      ) : (
                        <ChevronRight size={18} aria-hidden className="shrink-0 text-ds-ink-400" />
                      )}
                    </button>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={pending || !canScan}
                        loading={isScanning}
                        icon={<Radar size={16} aria-hidden />}
                        onClick={() => runScan(k.id)}
                        aria-label={`Relever ma visibilité pour « ${k.keyword} »`}
                      >
                        {isScanning ? "Relevé en cours…" : "Relever ma visibilité"}
                      </Button>
                      {removing === k.id ? (
                        <>
                          <Button size="sm" variant="danger" disabled={pending} onClick={() => remove(k.id)}>
                            Retirer
                          </Button>
                          <Button size="sm" variant="quiet" onClick={() => setRemoving(null)}>
                            Garder
                          </Button>
                        </>
                      ) : (
                        <Button
                          size="sm"
                          variant="quiet"
                          disabled={pending}
                          onClick={() => setRemoving(k.id)}
                          aria-label={`Retirer « ${k.keyword} »`}
                        >
                          <Trash2 size={16} aria-hidden className="block" />
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {firstKeyword ? <AddKeywordForm disabled={pending || !linked} primary onLinkRequest={linked ? undefined : onLinkRequest} /> : null}
          {!canAdd ? (
            <p className="mt-4 text-ds-meta text-ds-ink-600">
              Vous suivez déjà {GOOGLE_KEYWORDS_MAX} mots-clés : retirez-en un pour en ajouter un autre.
            </p>
          ) : null}

          <div className="mt-5 space-y-3.5 border-t border-ds-ink-200 pt-4">
            <ProgressBar
              size="sm"
              label={
                <>
                  Relevés à la demande restants ce mois-ci :{" "}
                  <strong className="font-semibold text-ds-ink-900">
                    {scanUsage.remaining} sur {GOOGLE_MANUAL_SCANS_PER_MONTH}
                  </strong>
                </>
              }
              value={scanUsage.remaining}
              max={GOOGLE_MANUAL_SCANS_PER_MONTH}
              valueText={`${scanUsage.remaining} sur ${GOOGLE_MANUAL_SCANS_PER_MONTH}`}
              hideValueText
            />
            <ProgressBar
              size="sm"
              label={
                <>
                  Budget restant : <strong className="font-semibold text-ds-ink-900">{usd(budget.remainingUsd)}</strong> sur{" "}
                  {usd(budget.budgetUsd)}
                </>
              }
              value={budget.remainingUsd}
              max={Math.max(budget.budgetUsd, 0.01)}
              valueText={`${usd(budget.remainingUsd)} sur ${usd(budget.budgetUsd)}`}
              hideValueText
            />
            {!canScan && !firstKeyword ? (
              <p className="flex items-start gap-2 text-ds-meta font-medium text-ds-warning-900">
                <TriangleAlert size={15} aria-hidden className="mt-0.5 shrink-0 text-ds-warning-700" />
                {scanUsage.remaining === 0
                  ? `Vous avez utilisé vos ${GOOGLE_MANUAL_SCANS_PER_MONTH} relevés du mois — les relevés planifiés continuent.`
                  : "Le budget mensuel de votre fiche est atteint — les relevés reprendront le mois prochain."}
              </p>
            ) : null}
            <p className="text-ds-meta text-ds-ink-600">
              Un relevé ≈ {usd(estimateScanCostUsd())}, compris dans votre formule. Les mots-clés suivis sont aussi relevés
              automatiquement toutes les deux semaines.
            </p>
          </div>
          {error ? <ErrorNote className="mt-4">{error}</ErrorNote> : null}
          {message ? <InlineSuccess className="mt-4">{message}</InlineSuccess> : null}
        </Card>

        <Card padding={!keyword || !scan ? "none" : undefined} className="min-w-0 xl:col-start-2 xl:row-span-2 xl:row-start-1">
          {!keyword ? (
            <EmptyState as="h2" icon={MapPinned} title="Votre carte de visibilité">
              Ajoutez un mot-clé, puis lancez un relevé : vous verrez où votre fiche apparaît sur Google Maps, emplacement par
              emplacement autour de votre cabinet. Un relevé ≈ {usd(estimateScanCostUsd())}, compris dans votre formule.
            </EmptyState>
          ) : !scan ? (
            scanningHere ? (
              <div className="p-5 sm:p-6">
                <GenerationProgress
                  as="h2"
                  icon={Radar}
                  title={`Relevé en cours pour « ${keyword.keyword} »`}
                  steps={SCAN_STEPS}
                  running
                  hint="La carte s'affichera ici dès que le relevé sera terminé."
                />
              </div>
            ) : running ? (
              <EmptyState as="h2" icon={MapPinned} title={`« ${keyword.keyword} » n'a pas encore été relevé`}>
                <WaitNote className="justify-center text-left">Relevé en cours, la carte s&apos;affichera dans un instant.</WaitNote>
              </EmptyState>
            ) : (
              <EmptyState
                as="h2"
                icon={MapPinned}
                title={`« ${keyword.keyword} » n'a pas encore été relevé`}
                action={
                  <Button disabled={pending || !canScan} icon={<Radar size={18} aria-hidden />} onClick={() => runScan(keyword.id)}>
                    Relever ma visibilité
                  </Button>
                }
              >
                Lancez un premier relevé pour voir votre position depuis les 49 emplacements de la grille (
                {radiusLabel(keyword.radius)} autour du cabinet). Un relevé ≈ {usd(estimateScanCostUsd())}, compris dans votre
                formule.
              </EmptyState>
            )
          ) : (
            <ScanView
              keyword={keyword}
              scan={scan}
              scans={doneScans}
              running={Boolean(running) || scanningHere}
              onSelectScan={setSelectedScanId}
            />
          )}
        </Card>

        {!firstKeyword && canAdd ? (
          <Card className="xl:self-start">
            <CardHeader icon={Plus} title="Suivre un autre mot-clé" as="h2" />
            <AddKeywordForm disabled={pending || !linked} onLinkRequest={linked ? undefined : onLinkRequest} />
          </Card>
        ) : null}
      </div>

      {scan ? <CompetitorsTable competitors={scan.competitors} own={own} scan={scan} /> : null}
    </div>
  );
}

/** Dernière part de visibilité d'un mot-clé, en anneau (décoratif : le chiffre est aussi dit dans le libellé du bouton). */
function KeywordGauge({ visibility, onTint }: { visibility: number | null; onTint: boolean }) {
  if (visibility === null) {
    return (
      <span
        aria-hidden
        className="grid size-[3.25rem] shrink-0 place-items-center rounded-full border-2 border-dashed border-ds-ink-300 text-ds-body font-semibold text-ds-ink-600"
      >
        —
      </span>
    );
  }
  return (
    <span aria-hidden className="shrink-0">
      <ProgressRing
        value={visibility}
        label="Part de visibilité"
        size={52}
        thickness={5}
        className={onTint ? "[--ds-ring-track:white]" : undefined}
      >
        <span className="text-ds-meta font-bold text-ds-ink-900 ds-tnum">{visibility} %</span>
      </ProgressRing>
    </span>
  );
}

function AddKeywordForm({
  disabled,
  primary = false,
  onLinkRequest,
}: {
  disabled: boolean;
  /** Premier mot-clé : c'est l'action principale de l'onglet */
  primary?: boolean;
  onLinkRequest?: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [keyword, setKeyword] = useState("");
  const [radius, setRadius] = useState<GoogleGridRadius>("ville");
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await addGoogleKeyword({ keyword, radius });
      if (result.error) {
        setError(result.error);
        return;
      }
      setKeyword("");
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
      <div className="sm:col-span-2">
        <Label htmlFor="google-keyword">Ajouter un mot-clé</Label>
        <Input
          id="google-keyword"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="Ex. : sophrologue albi"
          maxLength={KEYWORD_MAX}
          minLength={3}
          required
          disabled={disabled || pending}
          className="min-h-11"
        />
      </div>
      <div className="min-w-0">
        <Label htmlFor="google-radius">Rayon</Label>
        <Select
          id="google-radius"
          value={radius}
          onChange={(e) => setRadius(e.target.value as GoogleGridRadius)}
          disabled={disabled || pending}
          className="min-h-11"
        >
          {GOOGLE_GRID_RADII.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label} ({r.km} km)
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Button
          type="submit"
          variant={primary ? "primary" : "secondary"}
          disabled={disabled || keyword.trim().length < 3}
          loading={pending}
          icon={<Plus size={18} aria-hidden />}
        >
          Ajouter
        </Button>
      </div>
      {!disabled ? (
        <div className="sm:col-span-2">
          <FieldHint>Minuscules et espaces simples ; un mot-clé retiré peut être réactivé avec son historique.</FieldHint>
        </div>
      ) : (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-ds-meta text-ds-ink-600 sm:col-span-2">
          Reliez d&apos;abord votre fiche Google.
          {onLinkRequest ? (
            <button type="button" onClick={onLinkRequest} className="min-h-9 rounded-ds-sm font-semibold text-ds-brand-700 underline ds-focus pointer-coarse:min-h-11">
              Retrouver ma fiche
            </button>
          ) : null}
        </p>
      )}
      {error ? <ErrorNote className="sm:col-span-2">{error}</ErrorNote> : null}
    </form>
  );
}

function scanLabel(scan: GoogleScanView): string {
  return `${formatDayFr(scan.scannedAt, "day")} · ${scan.trigger === "manual" ? "à la demande" : "planifié"}`;
}

function ScanView({
  keyword,
  scan,
  scans,
  running,
  onSelectScan,
}: {
  keyword: GoogleKeywordView;
  scan: GoogleScanView;
  scans: GoogleScanView[];
  running: boolean;
  onSelectScan: (id: string) => void;
}) {
  const summary = scan.summary;
  // Relevé précédent (les relevés sont rangés du plus récent au plus ancien) : variation de la part de visibilité
  const previous = scans[scans.findIndex((s) => s.id === scan.id) + 1];
  const visibilityDelta: StatDelta | null =
    summary && previous?.summary
      ? {
          value: summary.visibility - previous.summary.visibility,
          unit: ["point", "points"],
          label: `depuis le relevé précédent (${formatDayFr(previous.scannedAt)})`,
        }
      : null;
  return (
    <div>
      <CardHeader
        icon={MapPinned}
        title={<>« {keyword.keyword} »</>}
        description={
          <>
            {scan.grid.rows * scan.grid.cols} emplacements testés · {radiusLabel(scan.grid.radius)} · relevé le{" "}
            {formatDayFr(scan.scannedAt, "day")}
          </>
        }
        action={
          scans.length > 1 ? (
            <>
              <Label htmlFor="google-scan-select" className="sr-only">
                Relevé affiché
              </Label>
              <Select
                id="google-scan-select"
                value={scan.id}
                onChange={(e) => onSelectScan(e.target.value)}
                className="min-h-10 max-w-60 pointer-coarse:min-h-11"
              >
                {scans.map((s) => (
                  <option key={s.id} value={s.id}>
                    {scanLabel(s)}
                  </option>
                ))}
              </Select>
            </>
          ) : undefined
        }
      />
      {running ? <WaitNote className="mt-3">Nouveau relevé en cours…</WaitNote> : null}

      {summary ? (
        <dl className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatTile
            icon={Percent}
            label="Part de visibilité"
            value={summary.visibility}
            suffix=" %"
            delta={visibilityDelta}
            hint="100 % = première place partout, 0 % = absente partout"
          />
          <StatTile
            icon={Medal}
            label="Dans les 3 premiers"
            value={summary.top3}
            suffix={` sur ${summary.total}`}
            hint="emplacements d'où Google Maps vous affiche parmi ses 3 fiches mises en avant"
          />
          <StatTile
            icon={Crosshair}
            label="Place moyenne"
            value={summary.avgRank}
            hint="là où votre fiche apparaît dans les 20 premiers résultats"
          />
        </dl>
      ) : null}

      <p className="mt-5 flex items-start gap-2.5 text-ds-body text-ds-ink-700">
        <Info size={18} aria-hidden className="mt-0.5 shrink-0 text-ds-section-accent" />
        <span>
          Depuis chacun de ces emplacements autour de votre cabinet, nous notons la place de votre fiche dans les résultats
          Google Maps pour « {keyword.keyword} ». Chaque pastille de la carte porte ce chiffre : 1 veut dire que vous êtes en
          tête à cet endroit.
        </span>
      </p>

      <div className="mt-4">
        <VisibilityMap grid={scan.grid} points={scan.points} keyword={keyword.keyword} />
      </div>
      <MapLegend />
    </div>
  );
}

/** Rangs repérés sous l'échelle de couleurs, à leur place sur la barre. */
function tickLeft(rank: number): string {
  return `${((rank - 1) / (RANK_MAX - 1)) * 100}%`;
}

/**
 * Légende de la carte : l'échelle continue (1re → 20e place) avec ses rangs en
 * chiffres, puis chaque famille de pastilles avec sa couleur, son nom et ses
 * places — jamais la couleur seule. Les couleurs viennent de `rank-colors`.
 */
function MapLegend() {
  const bands: { id: string; swatch: ReactNode; range: string; text: string }[] = [
    {
      id: "top",
      swatch: <BandSwatch from={1} to={3} />,
      range: "1 à 3",
      text: "Vert : parmi les 3 fiches que Google met en avant (le « pack local »)",
    },
    { id: "good", swatch: <BandSwatch from={4} to={10} />, range: "4 à 10", text: "Orange : dans les 10 premières" },
    { id: "weak", swatch: <BandSwatch from={11} to={20} />, range: "11 à 20", text: "Rouge : entre la 11e et la 20e place" },
    {
      id: "none",
      swatch: <span aria-hidden className="block size-5 rounded-full bg-white" style={{ boxShadow: `0 0 0 2px ${RANK_NONE_COLOR}` }} />,
      range: "20+",
      text: "Gris : au-delà de la 20e place",
    },
    {
      id: "missing",
      swatch: <span aria-hidden className="block size-5 rounded-full border-2 border-dashed border-ds-ink-450 bg-white" />,
      range: "?",
      text: "Pointillés : pas de réponse pour cet emplacement",
    },
    {
      id: "home",
      swatch: (
        <span aria-hidden className="grid size-6 place-items-center rounded-full bg-ds-ink-900 text-white ring-2 ring-ds-brand-200">
          <House size={13} strokeWidth={2.5} />
        </span>
      ),
      range: "",
      text: "Votre cabinet, au centre de la carte",
    },
  ];
  return (
    <div className="mt-4 rounded-ds-md bg-ds-ink-50 p-4 ring-1 ring-ds-ink-200" role="group" aria-label="Légende">
      <div className="flex flex-wrap items-start gap-x-8 gap-y-4">
        <div className="min-w-0">
          <h3 className="text-ds-body font-semibold text-ds-ink-900">Lire les pastilles</h3>
          {/* L'échelle continue, et sous elle les rangs repérés, en chiffres, à leur place sur la barre */}
          <div className="mt-3 flex items-start gap-2.5 text-ds-meta/3 font-medium whitespace-nowrap text-ds-ink-700">
            <span>1re place</span>
            <span aria-hidden className="block w-24 shrink-0 min-[360px]:w-36 sm:w-44">
              <span className="relative block h-3 rounded-full" style={{ backgroundImage: rankGradientCss() }}>
                {RANK_LEGEND_TICKS.slice(1, -1).map((rank) => (
                  <span key={rank} className="absolute -top-0.5 h-4 w-0.5 rounded-full bg-white" style={{ left: tickLeft(rank) }} />
                ))}
              </span>
              <span className="relative mt-1.5 block h-4 text-xs/4 font-normal text-ds-ink-600 ds-tnum">
                {RANK_LEGEND_TICKS.map((rank, index) => (
                  <span
                    key={rank}
                    className={clsx(
                      "absolute top-0",
                      index === 0 ? "" : index === RANK_LEGEND_TICKS.length - 1 ? "-translate-x-full" : "-translate-x-1/2",
                    )}
                    style={{ left: tickLeft(rank) }}
                  >
                    {rank}
                  </span>
                ))}
              </span>
            </span>
            <span>20e</span>
          </div>
        </div>
        <ul className="grid min-w-0 flex-[1_1_18rem] grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
          {bands.map((band) => (
            <li key={band.id} className="flex items-start gap-2.5 text-ds-meta text-ds-ink-700">
              <span className="mt-0.5 grid w-9 shrink-0 place-items-center">{band.swatch}</span>
              <span className="min-w-0">
                {band.range ? <strong className="mr-1.5 font-bold text-ds-ink-900 ds-tnum">{band.range}</strong> : null}
                {band.text}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Pastille de légende d'une famille de places : le dégradé va de sa première à sa dernière couleur. */
function BandSwatch({ from, to }: { from: number; to: number }) {
  return (
    <span
      aria-hidden
      className="block h-5 w-9 rounded-full ring-2 ring-white"
      style={{ backgroundImage: `linear-gradient(90deg, ${rankColor(from)}, ${rankColor(to)})` }}
    />
  );
}

function num(value: number | null, digits = 0): string {
  return value === null ? "—" : value.toLocaleString("fr-FR", { maximumFractionDigits: digits });
}

/** Concurrents du podium (agrégés sur les 49 emplacements), votre fiche en tête pour comparer. */
function CompetitorsTable({ competitors, own, scan }: { competitors: GoogleCompetitor[]; own: OwnListing; scan: GoogleScanView }) {
  if (competitors.length === 0) return null;
  const ownTop3 = scan.summary?.top3 ?? scan.points.filter((p) => rankTone(p.rank) === "top").length;
  const ownAvg = scan.summary?.avgRank ?? null;
  const total = scan.points.length;
  return (
    <Card>
      <CardHeader
        icon={Trophy}
        title="Qui occupe le podium ?"
        description="Les cabinets le plus souvent dans les 3 premiers sur ce relevé, comparés à votre fiche. Avis, note et photos : ce sur quoi vous pouvez agir."
      />

      {/* À partir de 640 px : le tableau. En dessous : la même comparaison, une fiche par bloc. */}
      <div className="mt-5 overflow-x-auto max-sm:hidden">
        <table className="w-full min-w-[560px] text-ds-body">
          <thead>
            <tr className="border-b border-ds-ink-200 text-left text-ds-meta text-ds-ink-600">
              <th scope="col" className="py-2.5 pr-3 pl-3 font-semibold">
                Établissement
              </th>
              <th scope="col" className="py-2.5 pr-3 text-right font-semibold">
                Note
              </th>
              <th scope="col" className="py-2.5 pr-3 text-right font-semibold">
                Avis
              </th>
              <th scope="col" className="py-2.5 pr-3 text-right font-semibold">
                Photos
              </th>
              <th scope="col" className="py-2.5 pr-3 text-right font-semibold">
                Dans les 3 premiers
              </th>
              <th scope="col" className="py-2.5 pr-3 text-right font-semibold">
                Place moyenne
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ds-ink-200 ds-tnum">
            <tr className="bg-ds-section-tint font-semibold text-ds-ink-900">
              <th scope="row" className="rounded-l-ds-sm py-3 pr-3 pl-3 text-left font-semibold">
                <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
                  {own.name} <Badge tone="section">Vous</Badge>
                </span>
              </th>
              <td className="py-3 pr-3 text-right">{num(own.rating, 1)}</td>
              <td className="py-3 pr-3 text-right">{num(own.votes)}</td>
              <td className="py-3 pr-3 text-right">{num(own.photos)}</td>
              <td className="py-3 pr-3 text-right">
                {ownTop3} / {total}
              </td>
              <td className="rounded-r-ds-sm py-3 pr-3 text-right">{num(ownAvg, 1)}</td>
            </tr>
            {competitors.map((c) => (
              <tr key={c.cid ?? c.placeId ?? c.title} className="text-ds-ink-700">
                <th scope="row" className="py-3 pr-3 pl-3 text-left font-normal">
                  <span className="block text-ds-ink-900">{c.title}</span>
                  {c.category ? <span className="block text-ds-meta text-ds-ink-600">{c.category}</span> : null}
                </th>
                <td className="py-3 pr-3 text-right">{num(c.rating, 1)}</td>
                <td className="py-3 pr-3 text-right">{num(c.votes)}</td>
                <td className="py-3 pr-3 text-right">{num(c.totalPhotos)}</td>
                <td className="py-3 pr-3 text-right">
                  {c.appearances} / {total}
                </td>
                <td className="py-3 pr-3 text-right">{num(c.avgRank, 1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="mt-5 space-y-3 sm:hidden">
        <CompetitorBlock
          own
          title={own.name}
          rating={own.rating}
          votes={own.votes}
          photos={own.photos}
          top3={`${ownTop3} / ${total}`}
          avgRank={ownAvg}
        />
        {competitors.map((c) => (
          <CompetitorBlock
            key={c.cid ?? c.placeId ?? c.title}
            title={c.title}
            category={c.category}
            rating={c.rating}
            votes={c.votes}
            photos={c.totalPhotos}
            top3={`${c.appearances} / ${total}`}
            avgRank={c.avgRank}
          />
        ))}
      </ul>
    </Card>
  );
}

/** Une fiche du podium sur petit écran : les mêmes six colonnes que le tableau, en liste. */
function CompetitorBlock({
  own = false,
  title,
  category,
  rating,
  votes,
  photos,
  top3,
  avgRank,
}: {
  own?: boolean;
  title: string;
  category?: string | null;
  rating: number | null;
  votes: number | null;
  photos: number | null;
  top3: string;
  avgRank: number | null;
}) {
  const cells: [string, string][] = [
    ["Note", num(rating, 1)],
    ["Avis", num(votes)],
    ["Photos", num(photos)],
    ["Dans les 3 premiers", top3],
    ["Place moyenne", num(avgRank, 1)],
  ];
  return (
    <li className={clsx("rounded-ds-md p-3.5 ring-1", own ? "bg-ds-section-tint ring-ds-section-line" : "bg-white ring-ds-ink-200")}>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-base font-semibold text-ds-ink-900">
        {title} {own ? <Badge tone="section">Vous</Badge> : null}
      </p>
      {category ? <p className="text-ds-meta text-ds-ink-600">{category}</p> : null}
      <dl className="mt-2.5 grid grid-cols-3 gap-x-3 gap-y-2">
        {cells.map(([label, value], index) => (
          <div key={label} className={clsx("min-w-0", index >= 3 && "col-span-3 flex items-baseline justify-between gap-3 border-t border-ds-ink-200 pt-2")}>
            <dt className="text-ds-meta text-ds-ink-600">{label}</dt>
            <dd className="text-base font-semibold text-ds-ink-900 ds-tnum">{value}</dd>
          </div>
        ))}
      </dl>
    </li>
  );
}
