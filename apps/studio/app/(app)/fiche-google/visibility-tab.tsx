"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition, type FormEvent } from "react";
import { clsx } from "clsx";
import { Badge, Button, Card, FieldHint, Input, Label, Select, Spinner } from "@theralys/ui";
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
import { formatDayFr } from "@/lib/calendar";
import type { GoogleKeywordView, GoogleProfileData, GoogleScanView } from "@/lib/google/data";
import { KEYWORD_MAX, radiusLabel } from "@/lib/google/keywords";
import type { ScanUsage } from "@/lib/google/scans";
import { GoogleVisibilityCard } from "../google-visibility-card";
import { addGoogleKeyword, removeGoogleKeyword, scanGoogleKeyword } from "./actions";
import { RANK_LEGEND_TICKS, RANK_MAX, rankGradientCss } from "@/lib/google/rank-colors";

// Leaflet touche `window` : chargé côté client seulement
const VisibilityMap = dynamic(() => import("./visibility-map").then((m) => m.VisibilityMap), {
  ssr: false,
  loading: () => (
    <div className="flex h-[360px] w-full animate-pulse items-center justify-center rounded-2xl bg-cream-100 text-sm text-ink-500 sm:h-[460px]">
      Chargement de la carte…
    </div>
  ),
});

/** Votre fiche, pour la comparaison avec les concurrents. */
export type OwnListing = { name: string; rating: number | null; votes: number | null; photos: number | null };

const usd = (value: number) => `${value.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`;

export function VisibilityTab({
  linked,
  keywords,
  scanUsage,
  budget,
  own,
  searchVisibility,
}: {
  linked: boolean;
  keywords: GoogleKeywordView[];
  scanUsage: ScanUsage;
  budget: GoogleBudget;
  own: OwnListing;
  /** Carte « Visibilité Google » (Search Console), en tête de l'onglet */
  searchVisibility: GoogleProfileData["searchVisibility"];
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

  return (
    <div className="space-y-6">
      <GoogleVisibilityCard gscAccess connected={searchVisibility.connected} visibility={searchVisibility.visibility} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Card className="p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xl font-semibold">Mots-clés suivis</h2>
            <Badge tone="neutral">
              {keywords.length} / {GOOGLE_KEYWORDS_MAX}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-ink-500">
            Les recherches que tapent vos futurs patients, par exemple « sophrologue albi ». Chaque relevé
            interroge Google Maps depuis 49 emplacements autour de votre cabinet.
          </p>

          {keywords.length === 0 ? (
            <p className="mt-4 rounded-xl bg-cream-100 px-4 py-3 text-sm text-ink-700">Ajoutez un premier mot-clé pour commencer.</p>
          ) : (
            <ul className="mt-4 divide-y divide-cream-200" aria-label="Mots-clés suivis">
              {keywords.map((k) => {
                const selected = keyword?.id === k.id;
                const isScanning = scanning === k.id || k.scans.some((s) => s.status === "running");
                return (
                  <li key={k.id} className="py-3">
                    <div className="flex flex-col gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedKeywordId(k.id);
                          setSelectedScanId(null);
                        }}
                        aria-pressed={selected}
                        className={clsx(
                          "w-full min-w-0 rounded-lg px-2 py-1 text-left hover:bg-cream-100",
                          selected && "bg-primary-50 text-primary-800",
                        )}
                      >
                        <span className="block truncate font-medium">{k.keyword}</span>
                        <span className="block text-xs text-ink-500">
                          {radiusLabel(k.radius)}
                          {k.lastScannedAt ? ` · relevé le ${formatDayFr(k.lastScannedAt)}` : " · jamais relevé"}
                        </span>
                      </button>
                      <div className="flex flex-wrap items-center gap-1.5 px-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={pending || isScanning || !canScan}
                          onClick={() => runScan(k.id)}
                          aria-label={`Relever ma visibilité pour « ${k.keyword} »`}
                        >
                          {isScanning ? <Spinner /> : null} {isScanning ? "Relevé en cours…" : "Relever ma visibilité"}
                        </Button>
                        {removing === k.id ? (
                          <>
                            <Button size="sm" variant="danger" disabled={pending} onClick={() => remove(k.id)}>
                              Retirer
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setRemoving(null)}>
                              Garder
                            </Button>
                          </>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={pending}
                            onClick={() => setRemoving(k.id)}
                            aria-label={`Retirer « ${k.keyword} »`}
                          >
                            ✕
                          </Button>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {keywords.length < GOOGLE_KEYWORDS_MAX ? <AddKeywordForm disabled={pending || !linked} /> : null}

          <div className="mt-4 border-t border-cream-200 pt-3 text-xs text-ink-500">
            <p>
              Relevés à la demande restants ce mois-ci :{" "}
              <strong className="text-ink-700">
                {scanUsage.remaining} sur {GOOGLE_MANUAL_SCANS_PER_MONTH}
              </strong>{" "}
              · Budget restant : <strong className="text-ink-700">{usd(budget.remainingUsd)}</strong> sur {usd(budget.budgetUsd)}
            </p>
            <p className="mt-1">
              Un relevé ≈ {usd(estimateScanCostUsd())}, compris dans votre formule. Les mots-clés suivis sont aussi relevés
              automatiquement toutes les deux semaines.
            </p>
          </div>
          {error ? (
            <p className="mt-3 text-sm text-danger-500" role="alert">
              {error}
            </p>
          ) : null}
          {message ? (
            <p className="mt-3 text-sm text-success-500" role="status">
              {message}
            </p>
          ) : null}
        </Card>

        <Card className="p-6">
          {!keyword ? (
            <EmptyMap title="Votre carte de visibilité">
              Ajoutez un mot-clé, puis lancez un relevé : vous verrez où votre fiche apparaît sur Google Maps, emplacement par
              emplacement autour de votre cabinet. Un relevé ≈ {usd(estimateScanCostUsd())}, compris dans votre formule.
            </EmptyMap>
          ) : !scan ? (
            <EmptyMap title={`« ${keyword.keyword} » n'a pas encore été relevé`}>
              {running ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner /> Relevé en cours, la carte s&apos;affichera dans un instant.
                </span>
              ) : (
                <>
                  Lancez un premier relevé pour voir votre position depuis les 49 emplacements de la grille (
                  {radiusLabel(keyword.radius)} autour du cabinet). Un relevé ≈ {usd(estimateScanCostUsd())}, compris dans votre
                  formule.
                  <span className="mt-3 block">
                    <Button disabled={pending || !canScan} onClick={() => runScan(keyword.id)}>
                      {scanning === keyword.id ? <Spinner className="text-white" /> : null} Relever ma visibilité
                    </Button>
                  </span>
                </>
              )}
            </EmptyMap>
          ) : (
            <ScanView
              keyword={keyword}
              scan={scan}
              scans={doneScans}
              running={Boolean(running) || scanning === keyword.id}
              onSelectScan={setSelectedScanId}
            />
          )}
        </Card>
      </div>

      {scan ? <CompetitorsTable competitors={scan.competitors} own={own} scan={scan} /> : null}
    </div>
  );
}

function EmptyMap({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center py-10 text-center text-sm text-ink-500">
      <p className="font-medium text-ink-700">{title}</p>
      <p className="mt-2 max-w-md">{children}</p>
    </div>
  );
}

function AddKeywordForm({ disabled }: { disabled: boolean }) {
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
    <form onSubmit={onSubmit} className="mt-4 grid gap-3 sm:grid-cols-2 sm:items-end">
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
        />
      </div>
      <div>
        <Label htmlFor="google-radius">Rayon</Label>
        <Select id="google-radius" value={radius} onChange={(e) => setRadius(e.target.value as GoogleGridRadius)} disabled={disabled || pending}>
          {GOOGLE_GRID_RADII.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label} ({r.km} km)
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Button type="submit" disabled={disabled || pending || keyword.trim().length < 3}>
          {pending ? <Spinner className="text-white" /> : null} Ajouter
        </Button>
      </div>
      {!disabled ? (
        <div className="sm:col-span-2">
          <FieldHint>Minuscules et espaces simples ; un mot-clé retiré peut être réactivé avec son historique.</FieldHint>
        </div>
      ) : (
        <p className="text-xs text-ink-500 sm:col-span-2">Reliez d&apos;abord votre fiche Google.</p>
      )}
      {error ? (
        <p className="text-sm text-danger-500 sm:col-span-2" role="alert">
          {error}
        </p>
      ) : null}
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
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold">« {keyword.keyword} »</h2>
          <p className="text-xs text-ink-500">
            {scan.grid.rows * scan.grid.cols} emplacements testés · {radiusLabel(scan.grid.radius)} · relevé le {formatDayFr(scan.scannedAt, "day")}
          </p>
          <p className="mt-1 text-sm text-ink-700">
            Depuis chacun de ces emplacements autour de votre cabinet, nous notons la place de votre fiche dans les résultats
            Google Maps pour « {keyword.keyword} ».
          </p>
        </div>
        {scans.length > 1 ? (
          <div className="shrink-0">
            <Label htmlFor="google-scan-select" className="sr-only">
              Relevé affiché
            </Label>
            <Select id="google-scan-select" value={scan.id} onChange={(e) => onSelectScan(e.target.value)} className="w-auto text-xs">
              {scans.map((s) => (
                <option key={s.id} value={s.id}>
                  {scanLabel(s)}
                </option>
              ))}
            </Select>
          </div>
        ) : null}
      </div>
      {running ? (
        <p className="mt-2 flex items-center gap-2 text-sm text-ink-700" aria-live="polite">
          <Spinner /> Nouveau relevé en cours…
        </p>
      ) : null}

      {summary ? (
        <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Stat label="Part de visibilité" value={`${summary.visibility} %`} hint="100 % = première place partout, 0 % = absente partout" />
          <Stat
            label="Dans les 3 premiers"
            value={`${summary.top3} sur ${summary.total}`}
            hint="emplacements d'où Google Maps vous affiche parmi ses 3 fiches mises en avant"
          />
          <Stat
            label="Place moyenne"
            value={summary.avgRank === null ? "—" : summary.avgRank.toLocaleString("fr-FR")}
            hint="là où votre fiche apparaît dans les 20 premiers résultats"
          />
        </dl>
      ) : null}

      <div className="mt-4">
        <VisibilityMap grid={scan.grid} points={scan.points} keyword={keyword.keyword} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-ink-700" aria-label="Légende">
        <div className="flex items-center gap-2">
          <span className="text-ink-500">1re place</span>
          <span aria-hidden className="relative block h-2.5 w-32 rounded-full" style={{ backgroundImage: rankGradientCss() }}>
            {RANK_LEGEND_TICKS.slice(1, -1).map((rank) => (
              <span
                key={rank}
                className="absolute -top-0.5 h-3.5 w-0.5 rounded-full bg-white/90"
                style={{ left: `${((rank - 1) / (RANK_MAX - 1)) * 100}%` }}
              />
            ))}
          </span>
          <span className="text-ink-500">20e</span>
        </div>
        <span className="inline-flex items-center gap-1.5 text-ink-500">
          <span aria-hidden className="inline-block h-3 w-3 rounded-full border-2 border-ink-300 bg-white" /> Au-delà de 20
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-3 w-3 rounded-full bg-ink-900 ring-2 ring-primary-200" /> Votre cabinet
        </span>
        <span className="text-ink-500">Vert : pack local (3 premiers) · orange : 4 à 10 · rouge : 11 à 20</span>
      </div>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-2xl bg-cream-50 p-3">
      <dt className="text-xs text-ink-500">{label}</dt>
      <dd className="text-xl font-semibold text-ink-900">{value}</dd>
      <dd className="text-[11px] text-ink-500">{hint}</dd>
    </div>
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
  return (
    <Card className="p-6">
      <h2 className="text-xl font-semibold">Qui occupe le podium ?</h2>
      <p className="mt-1 text-sm text-ink-500">
        Les cabinets le plus souvent dans les 3 premiers sur ce relevé, comparés à votre fiche. Avis, note et photos : ce
        sur quoi vous pouvez agir.
      </p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-ink-500">
              <th scope="col" className="py-2 pr-3 font-medium">
                Établissement
              </th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">
                Note
              </th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">
                Avis
              </th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">
                Photos
              </th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">
                Dans les 3 premiers
              </th>
              <th scope="col" className="py-2 text-right font-medium">
                Place moyenne
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-cream-200">
            <tr className="bg-primary-50/60 font-medium text-ink-900">
              <th scope="row" className="py-2 pr-3 text-left">
                {own.name} <Badge tone="primary">Vous</Badge>
              </th>
              <td className="py-2 pr-3 text-right">{num(own.rating, 1)}</td>
              <td className="py-2 pr-3 text-right">{num(own.votes)}</td>
              <td className="py-2 pr-3 text-right">{num(own.photos)}</td>
              <td className="py-2 pr-3 text-right">
                {ownTop3} / {scan.points.length}
              </td>
              <td className="py-2 text-right">{num(ownAvg, 1)}</td>
            </tr>
            {competitors.map((c) => (
              <tr key={c.cid ?? c.placeId ?? c.title} className="text-ink-700">
                <th scope="row" className="py-2 pr-3 text-left font-normal">
                  <span className="block truncate text-ink-900">{c.title}</span>
                  {c.category ? <span className="block text-xs text-ink-500">{c.category}</span> : null}
                </th>
                <td className="py-2 pr-3 text-right">{num(c.rating, 1)}</td>
                <td className="py-2 pr-3 text-right">{num(c.votes)}</td>
                <td className="py-2 pr-3 text-right">{num(c.totalPhotos)}</td>
                <td className="py-2 pr-3 text-right">
                  {c.appearances} / {scan.points.length}
                </td>
                <td className="py-2 text-right">{num(c.avgRank, 1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
