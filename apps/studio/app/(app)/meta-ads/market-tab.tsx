"use client";

import { useMemo, useState } from "react";
import { Badge, Button, Card } from "@theralys/ui";
import {
  META_MARKET_SCOPES,
  META_MARKET_SCOPE_LABELS,
  marketScopeNote,
  type MetaAdsMarket,
  type MetaAdsSeed,
  type MetaMarketAd,
  type MetaMarketInsights,
  type MetaMarketScope,
  type MetaMarketSignal,
} from "@theralys/shared";
import { formatDayFr } from "@/lib/calendar";
import { marketUnavailableNotice } from "@/lib/meta-ads/market-status";
import type { MetaTab } from "./tabs";

const SIGNAL: Record<MetaMarketSignal, { label: string; tone: "success" | "warning" | "neutral" }> = {
  fort: { label: "Signal fort", tone: "success" },
  moyen: { label: "Signal moyen", tone: "warning" },
  faible: { label: "Signal faible", tone: "neutral" },
};

const PLATFORM_LABELS: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  messenger: "Messenger",
  audience_network: "Audience Network",
  threads: "Threads",
};

const GENDER_LABELS: Record<string, string> = { All: "tous", Women: "femmes", Men: "hommes" };

/** Longueur du texte affiché avant « voir plus ». */
const BODY_PREVIEW = 180;

type Segment = { id: "local" | "region" | "france"; title: string; hint: string; ads: MetaMarketAd[] };

/**
 * Segments affichés selon la zone retenue : « Autour de vous » (ville +
 * département), « Votre région », « En France » — seuls les segments
 * atteints par l'élargissement existent, et seuls les non vides s'affichent.
 */
export function marketSegments(market: Pick<MetaAdsMarket, "ads" | "scopeUsed">, seed: Pick<MetaAdsSeed, "city" | "department" | "region">): Segment[] {
  const by = (scopes: MetaMarketScope[]) => market.ads.filter((a) => scopes.includes(a.scope));
  const localZones = [seed.city, seed.department?.name].filter((z): z is string => Boolean(z)).join(" et ");
  const segments: Segment[] = [
    { id: "local", title: META_MARKET_SCOPE_LABELS.ville, hint: localZones ? `Annonces diffusées sur ${localZones}` : "Annonces diffusées sur votre ville et votre département", ads: by(["ville", "departement"]) },
    { id: "region", title: META_MARKET_SCOPE_LABELS.region, hint: seed.region ? `Annonces diffusées en ${seed.region}` : "Annonces diffusées dans votre région", ads: by(["region"]) },
    // Zone « france » : annonces nationales ou diffusées hors de votre région (libellé partagé : « Autres zones et France »)
    { id: "france", title: META_MARKET_SCOPE_LABELS.france, hint: "Annonces nationales ou diffusées dans d'autres zones, par des praticiens du même métier", ads: by(["france"]) },
  ];
  return segments.filter((s) => s.ads.length > 0);
}

export type ScopeCounter = { scope: MetaMarketScope; label: string; spotted: number; kept: number };

/**
 * Compteurs par zone, jusqu'à la zone retenue seulement (les zones plus
 * larges n'ont pas été explorées) : annonces repérées dans la bibliothèque
 * (`counts`) et conservées dans la veille (`ads`, après tri et plafond).
 */
export function scopeCounters(market: Pick<MetaAdsMarket, "ads" | "scopeUsed" | "counts">): ScopeCounter[] {
  const used = META_MARKET_SCOPES.indexOf(market.scopeUsed);
  return META_MARKET_SCOPES.filter((_, i) => i <= used).map((scope) => ({
    scope,
    label: META_MARKET_SCOPE_LABELS[scope],
    spotted: market.counts[scope],
    kept: market.ads.filter((a) => a.scope === scope).length,
  }));
}

export function MarketTab({
  market,
  seed,
  provider,
  error,
  generationMissing,
  analysisReady,
  siteType,
  onSelectTab,
}: {
  market: MetaAdsMarket | null;
  seed: MetaAdsSeed | null;
  /** meta | mock | none (aucun jeton ni fournisseur) de la dernière analyse aboutie */
  provider: string | null;
  /** Message d'erreur de l'analyse (échec de la veille quand `market` est null et la génération a abouti) */
  error: string | null;
  /** Créas, plan vidéo ou plan manquants : `error` concerne alors la génération */
  generationMissing: boolean;
  analysisReady: boolean;
  siteType: "demo" | "client";
  onSelectTab: (tab: MetaTab) => void;
}) {
  const segments = useMemo(() => (market && seed ? marketSegments(market, seed) : []), [market, seed]);
  const adsById = useMemo(() => new Map((market?.ads ?? []).map((a) => [a.id, a])), [market]);
  const counters = useMemo(() => (market ? scopeCounters(market) : []), [market]);

  if (!analysisReady || !seed) {
    return (
      <Card className="p-8 text-center text-ink-500">
        <p className="font-medium text-ink-700">La veille du marché apparaîtra ici.</p>
        <p className="mt-1 text-sm">
          Lancez l&apos;analyse depuis l&apos;onglet Diagnostic : les annonces des praticiens autour de vous (bibliothèque publicitaire Meta,
          annonces publiques), classées par zone, avec leur durée de diffusion et leur portée, puis une synthèse des angles, accroches et
          offres qui marchent.
        </p>
        <div className="mt-5">
          <Button variant="secondary" onClick={() => onSelectTab("diagnostic")}>
            Aller au diagnostic
          </Button>
        </div>
      </Card>
    );
  }

  if (!market) {
    const notice = marketUnavailableNotice({ provider, error, siteType, generationMissing });
    return (
      <Card className="p-8 text-center text-ink-500" data-testid="meta-market-notice">
        <p className="font-medium text-ink-700">{notice.title}</p>
        <p className="mt-1 text-sm">{notice.detail}</p>
        {notice.retry ? (
          <div className="mt-5">
            <Button variant="secondary" onClick={() => onSelectTab("diagnostic")}>
              Aller au diagnostic
            </Button>
          </div>
        ) : null}
      </Card>
    );
  }

  const active = market.ads.filter((a) => a.active).length;
  const strong = market.ads.filter((a) => a.signal === "fort").length;

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h2 className="text-xl font-semibold">Les annonces des praticiens autour de vous</h2>
        <p className="mt-1 text-sm text-ink-700">{marketScopeNote(market, seed)}</p>
        <p className="mt-1 text-xs text-ink-500">
          Bibliothèque publicitaire Meta (annonces publiques diffusées en Europe), relevée le {formatDayFr(market.fetchedAt, "day")} sur{" "}
          {market.terms.length} terme{market.terms.length > 1 ? "s" : ""} ({market.terms.join(", ")}) · {active} en diffusion, {strong} à signal fort
          {market.truncated ? " · relevé plafonné" : ""}
          {market.source === "mock" ? " · données de démonstration" : ""}.
        </p>
        {/* Zones explorées seulement (jusqu'à la zone retenue) : repérées dans la bibliothèque, conservées dans la veille */}
        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Annonces par zone">
          {counters.map(({ scope, label, spotted, kept }) => (
            <div key={scope} className="rounded-2xl bg-cream-50 p-3">
              <dt className="text-xs text-ink-500">{label}</dt>
              <dd className="text-xl font-semibold text-ink-900">
                {spotted} <span className="text-sm font-normal text-ink-500">repérée{spotted > 1 ? "s" : ""}</span>
              </dd>
              <dd className="text-[11px] text-ink-500">
                {kept} conservée{kept > 1 ? "s" : ""} ·{" "}
                {scope === "ville" ? seed.city || "ville" : scope === "departement" ? (seed.department?.name ?? "département") : scope === "region" ? (seed.region ?? "région") : "autres zones, national"}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 rounded-xl bg-cream-100 px-4 py-3 text-sm text-ink-700">
          <strong className="text-ink-900">Le signal</strong> : personne ne paie longtemps une annonce qui ne marche pas. Une annonce diffusée
          depuis plus de 30 jours avec une large portée européenne est un signal fort. Seuls les textes et le lien public sont repris — jamais
          les images des confrères.
        </p>
      </Card>

      {market.insights ? <InsightsCard insights={market.insights} adsById={adsById} /> : null}

      {segments.map((segment) => (
        <Card key={segment.id} className="p-6">
          <h2 className="text-xl font-semibold">{segment.title}</h2>
          <p className="mt-1 text-sm text-ink-500">
            {segment.hint} · {segment.ads.length} annonce{segment.ads.length > 1 ? "s" : ""}
          </p>
          <ul className="mt-4 grid gap-4 md:grid-cols-2" aria-label={`Annonces — ${segment.title}`}>
            {segment.ads.map((ad) => (
              <AdCard key={ad.id} ad={ad} />
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}

function AdCard({ ad }: { ad: MetaMarketAd }) {
  const [expanded, setExpanded] = useState(false);
  const body = ad.bodies.find((b) => b.trim() !== "") ?? "";
  const long = body.length > BODY_PREVIEW;
  const shown = expanded || !long ? body : `${body.slice(0, BODY_PREVIEW).replace(/\s+\S*$/, "")}…`;
  const title = ad.titles.find((t) => t.trim() !== "") ?? null;
  const signal = SIGNAL[ad.signal];
  const platforms = ad.platforms.map((p) => PLATFORM_LABELS[p] ?? p);
  const zones = ad.targetLocations.filter((l) => !l.excluded).map((l) => l.name);
  const audience = [ad.targetAges ? `${ad.targetAges} ans` : null, ad.targetGender ? (GENDER_LABELS[ad.targetGender] ?? ad.targetGender.toLowerCase()) : null].filter(Boolean).join(" · ");
  return (
    <li className="flex flex-col rounded-2xl border border-cream-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="min-w-0 font-semibold text-ink-900">{ad.pageName}</p>
        <Badge tone={signal.tone}>{signal.label}</Badge>
      </div>
      {body ? (
        <p className="mt-2 whitespace-pre-line text-sm text-ink-700">
          {shown}
          {long ? (
            <>
              {" "}
              <button type="button" onClick={() => setExpanded((e) => !e)} className="font-medium text-primary-600 hover:underline" aria-expanded={expanded}>
                {expanded ? "voir moins" : "voir plus"}
              </button>
            </>
          ) : null}
        </p>
      ) : (
        <p className="mt-2 text-sm italic text-ink-500">Annonce sans texte (visuel seul).</p>
      )}
      {title ? (
        <p className="mt-2 text-sm">
          <span className="text-ink-500">Titre du lien : </span>
          <span className="font-medium text-ink-900">{title}</span>
        </p>
      ) : null}
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-ink-500">
        <div>
          <dt className="sr-only">Diffusion</dt>
          <dd>
            {ad.runningDays === null ? "Durée inconnue" : ad.active ? `En diffusion depuis ${ad.runningDays} j` : `Diffusée ${ad.runningDays} j, arrêtée`}
          </dd>
        </div>
        <div>
          <dt className="sr-only">Portée européenne</dt>
          <dd>{ad.euTotalReach === null ? "Portée inconnue" : `Portée ≈ ${ad.euTotalReach.toLocaleString("fr-FR")} personnes`}</dd>
        </div>
        {platforms.length > 0 ? (
          <div>
            <dt className="sr-only">Plateformes</dt>
            <dd>{platforms.join(", ")}</dd>
          </div>
        ) : null}
        {audience ? (
          <div>
            <dt className="sr-only">Audience</dt>
            <dd>{audience}</dd>
          </div>
        ) : null}
        {zones.length > 0 ? (
          <div className="col-span-2">
            <dt className="sr-only">Zones</dt>
            <dd>Zones : {zones.slice(0, 4).join(", ")}{zones.length > 4 ? ` (+${zones.length - 4})` : ""}</dd>
          </div>
        ) : null}
      </dl>
      <p className="mt-3 text-xs">
        <a href={ad.libraryUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-primary-600 hover:underline">
          Voir dans la bibliothèque ↗<span className="sr-only"> (nouvel onglet)</span>
        </a>
      </p>
    </li>
  );
}

function InsightsCard({ insights, adsById }: { insights: MetaMarketInsights; adsById: Map<string, MetaMarketAd> }) {
  return (
    <Card className="p-6">
      <h2 className="text-xl font-semibold">Ce que la veille nous apprend</h2>
      <p className="mt-2 text-sm text-ink-700">{insights.summary}</p>

      {insights.angles.length > 0 ? (
        <div className="mt-5">
          <h3 className="text-sm font-semibold text-ink-900">Angles qui marchent</h3>
          <ul className="mt-2 grid gap-3 sm:grid-cols-2" aria-label="Angles observés">
            {insights.angles.map((angle, i) => {
              const refs = angle.adIds.map((id) => adsById.get(id)).filter((a): a is MetaMarketAd => a !== undefined);
              return (
                // Clé par index : deux angles peuvent porter le même libellé (sortie du modèle)
                <li key={`${i}-${angle.label}`} className="rounded-2xl bg-cream-50 p-3">
                  <p className="font-medium text-ink-900">{angle.label}</p>
                  <p className="mt-1 text-sm text-ink-700">{angle.description}</p>
                  {refs.length > 0 ? (
                    <p className="mt-2 text-xs text-ink-500">
                      Exemples :{" "}
                      {refs.map((ad, i) => (
                        <span key={ad.id}>
                          {i > 0 ? ", " : ""}
                          <a href={ad.libraryUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-primary-600 hover:underline">
                            {ad.pageName}
                          </a>
                        </span>
                      ))}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <TextList title="Accroches relevées" items={insights.hooks} quoted />
        <TextList title="Offres observées" items={insights.offers} />
      </div>

      <dl className="mt-5 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl bg-cream-50 p-3">
          <dt className="text-xs text-ink-500">Formats</dt>
          <dd className="mt-1 text-sm text-ink-700">{insights.formats}</dd>
        </div>
        <div className="rounded-2xl bg-cream-50 p-3">
          <dt className="text-xs text-ink-500">Saisonnalité</dt>
          <dd className="mt-1 text-sm text-ink-700">{insights.seasonality}</dd>
        </div>
      </dl>

      {insights.gaps.length > 0 ? (
        <div className="mt-5 rounded-2xl bg-primary-50 p-4">
          <h3 className="text-sm font-semibold text-primary-800">Ce que personne ne fait encore</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-700">
            {insights.gaps.map((g, i) => (
              <li key={`${i}-${g}`}>{g}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {insights.warnings.length > 0 ? (
        <div className="mt-4 rounded-2xl bg-warning-100 p-4">
          <h3 className="text-sm font-semibold text-ink-900">À ne pas copier</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-700">
            {insights.warnings.map((w, i) => (
              <li key={`${i}-${w}`}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}

function TextList({ title, items, quoted = false }: { title: string; items: string[]; quoted?: boolean }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h3 className="text-sm font-semibold text-ink-900">{title}</h3>
      <ul className="mt-1 divide-y divide-cream-200 rounded-xl border border-cream-200 bg-cream-50">
        {items.map((text, i) => (
          <li key={`${i}-${text}`} className="px-3 py-1.5 text-sm text-ink-900">
            {quoted ? `« ${text} »` : text}
          </li>
        ))}
      </ul>
    </div>
  );
}
