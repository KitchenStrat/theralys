"use client";

import { useMemo } from "react";
import {
  ArrowRight,
  Ban,
  Building2,
  CalendarCheck,
  Eye,
  LocateFixed,
  Receipt,
  Search,
  SearchX,
  SignalHigh,
  SignalLow,
  SignalMedium,
  Sparkles,
  Star,
  Target,
  type LucideIcon,
} from "lucide-react";
import {
  GOOGLE_ADS_MATCH_LABELS,
  type GoogleAdsCompetition,
  type GoogleAdsIntent,
  type GoogleAdsKeyword,
  type GoogleAdsKeywordGroup,
  type GoogleAdsKeywordSet,
} from "@theralys/shared";
import { Badge, Button, Card, CardHeader, EmptyState, type BadgeTone } from "@/components/ds";
import { formatDayFr } from "@/lib/calendar";
import { formatAdsKeywordList, formatAdsNegativeList } from "@/lib/google-ads/clipboard";
import { nationalQueryExample } from "@/lib/google-ads/keywords";
import { Notice } from "./ads-ui";
import { CopyButton } from "./copy-button";
import type { AdsTab } from "./tabs";

/** Niveau de concurrence : un mot, des barres de signal et une couleur — jamais la couleur seule. */
const COMPETITION: Record<GoogleAdsCompetition, { label: string; tone: BadgeTone; icon: LucideIcon }> = {
  LOW: { label: "Faible", tone: "success", icon: SignalLow },
  MEDIUM: { label: "Moyenne", tone: "warning", icon: SignalMedium },
  HIGH: { label: "Forte", tone: "danger", icon: SignalHigh },
};

/** Un pictogramme par intention de recherche : les groupes se repèrent d'un coup d'œil. */
const INTENT_ICON: Record<GoogleAdsIntent, LucideIcon> = {
  metier_ville: Building2,
  rendez_vous: CalendarCheck,
  specialite: Sparkles,
  proximite: LocateFixed,
  reputation: Star,
  tarif: Receipt,
};

const num = (value: number | null) => (value === null ? "—" : value.toLocaleString("fr-FR"));
const eur = (value: number | null) => (value === null ? "—" : `${value.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`);

/** Marques d'un mot-clé : « cœur » (cœur de cible) et « suivi » (déjà suivi dans Fiche Google). */
function CoreBadge() {
  return (
    <Badge tone="section" icon={Target}>
      cœur
    </Badge>
  );
}
function TrackedBadge() {
  return (
    <Badge tone="brand" icon={Eye}>
      suivi
    </Badge>
  );
}

export function KeywordsTab({
  keywords,
  city,
  analysisReady,
  onSelectTab,
}: {
  keywords: GoogleAdsKeywordSet | null;
  /** Ville des graines de l'analyse (`seed.city`), pour l'exemple de requête « sans ville » */
  city: string;
  analysisReady: boolean;
  onSelectTab: (tab: AdsTab) => void;
}) {
  const byText = useMemo(() => new Map((keywords?.keywords ?? []).map((k) => [k.keyword, k])), [keywords]);

  if (!keywords || keywords.keywords.length === 0) {
    return (
      <Card padding="none">
        <EmptyState
          as="h2"
          icon={analysisReady ? SearchX : Search}
          title={analysisReady ? "Aucun mot-clé n'a été retenu pour votre cabinet." : "Vos mots-clés à cibler apparaîtront ici."}
          action={
            <Button type="button" iconRight={<ArrowRight size={18} aria-hidden />} onClick={() => onSelectTab("diagnostic")}>
              Aller au diagnostic
            </Button>
          }
        >
          {analysisReady
            ? "Les idées renvoyées par Google Ads n'avaient pas assez de volume ou étaient hors sujet : relancez une analyse plus tard, ou ajoutez des pages de spécialités à votre site."
            : "Lancez l'analyse depuis l'onglet Diagnostic : volumes de recherche, coûts par clic et concurrence réels, regroupés par intention, avec les mots-clés négatifs à exclure."}
        </EmptyState>
      </Card>
    );
  }

  const core = keywords.keywords.filter((k) => k.core);
  const coreText = formatAdsKeywordList(core.map((k) => ({ text: k.keyword, match: k.match })));
  const nationalExample = nationalQueryExample(keywords, city);

  return (
    <div className="space-y-6">
      <Card variant="tinted">
        <CardHeader
          icon={Target}
          title="Mots-clés à cibler"
          description={
            <>
              {keywords.keywords.length} expression{keywords.keywords.length > 1 ? "s" : ""} retenue{keywords.keywords.length > 1 ? "s" : ""} sur{" "}
              {keywords.rawCount} idée{keywords.rawCount > 1 ? "s" : ""} ({keywords.dropped} écartée{keywords.dropped > 1 ? "s" : ""} : hors sujet,
              informationnelles ou sans volume) · relevé le {formatDayFr(keywords.fetchedAt, "day")}
              {keywords.source === "mock" ? " · données de démonstration" : ""}.
            </>
          }
          action={<CopyButton text={coreText} label={`Copier le cœur (${core.length})`} variant="primary" size="md" />}
        />
        <ul className="mt-4 grid gap-2.5 text-ds-body text-ds-ink-700 md:grid-cols-2" aria-label="Légende">
          <li className="flex items-start gap-2.5">
            <CoreBadge />
            <span className="pt-0.5">les {core.length} meilleures expressions, envoyées à la prévision et mises en avant dans le plan</span>
          </li>
          <li className="flex items-start gap-2.5">
            <TrackedBadge />
            <span className="pt-0.5">mot-clé déjà suivi dans Fiche Google (position naturelle)</span>
          </li>
        </ul>
        <Notice tone="plain" className="mt-4">
          Les volumes des requêtes sans ville{nationalExample ? ` (« ${nationalExample} »)` : ""} sont nationaux : diffusées autour du cabinet
          grâce au ciblage géographique, elles touchent bien moins de personnes que ce chiffre — mais ce sont souvent elles qui amènent les
          patients proches.
        </Notice>
      </Card>

      {keywords.groups.map((group) => (
        <GroupCard key={group.intent} group={group} byText={byText} />
      ))}

      <Card>
        <CardHeader
          icon={Ban}
          title="Mots-clés négatifs"
          description="Les recherches d'emploi, de formation, d'information ou de produits ne doivent jamais déclencher vos annonces : à coller dans la liste d'exclusion de la campagne."
          action={<CopyButton text={formatAdsNegativeList(keywords.negatives)} label={`Copier les négatifs (${keywords.negatives.length})`} />}
        />
        <ul className="mt-4 flex flex-wrap gap-2" aria-label="Mots-clés négatifs">
          {keywords.negatives.map((n) => (
            <li key={n}>
              <Badge tone="neutral">{n}</Badge>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function CompetitionBadge({ keyword }: { keyword: GoogleAdsKeyword }) {
  const competition = keyword.competition ? COMPETITION[keyword.competition] : null;
  if (!competition) return <>—</>;
  return (
    <Badge tone={competition.tone} icon={competition.icon}>
      {competition.label}
      {keyword.competitionIndex !== null ? <span className="font-normal ds-tnum">{keyword.competitionIndex}</span> : null}
    </Badge>
  );
}

function GroupCard({ group, byText }: { group: GoogleAdsKeywordGroup; byText: Map<string, GoogleAdsKeyword> }) {
  const rows = group.keywords.map((text) => byText.get(text)).filter((k): k is GoogleAdsKeyword => k !== undefined);
  const text = formatAdsKeywordList(rows.map((k) => ({ text: k.keyword, match: k.match })));
  return (
    <Card>
      <CardHeader
        icon={INTENT_ICON[group.intent]}
        title={group.label}
        description={
          <>
            {rows.length} mot{rows.length > 1 ? "s" : ""}-clé{rows.length > 1 ? "s" : ""} · {num(group.totalVolume)} recherches / mois
            {group.medianCpcEur !== null ? ` · coût par clic médian ${eur(group.medianCpcEur)}` : ""}
          </>
        }
        action={<CopyButton text={text} label="Copier le groupe" />}
      />
      {/*
        Un seul tableau pour toutes les largeurs. Sur petit écran, il garde deux colonnes (le mot-clé, ses recherches) :
        coût, concurrence et correspondance passent sous le mot-clé, au lieu d'un défilement horizontal.
      */}
      <table className="mt-4 w-full text-ds-body">
        <thead>
          <tr className="border-b border-ds-ink-200 text-left text-ds-meta text-ds-ink-600">
            <th scope="col" className="py-2.5 pr-3 font-semibold">
              Mot-clé
            </th>
            {/* Largeurs fixes : les colonnes tombent au même endroit d'un groupe à l'autre */}
            <th scope="col" className="py-2.5 pl-3 text-right font-semibold md:w-36 md:pr-5 md:pl-0">
              Recherches / mois
            </th>
            <th scope="col" className="w-28 py-2.5 pr-5 text-right font-semibold max-md:hidden">
              Coût par clic
            </th>
            <th scope="col" className="w-36 py-2.5 pr-3 font-semibold max-md:hidden">
              Concurrence
            </th>
            <th scope="col" className="w-32 py-2.5 font-semibold max-md:hidden">
              Correspondance
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ds-ink-200">
          {rows.map((k) => (
            <tr key={k.keyword} className="align-top text-ds-ink-700">
              <th scope="row" className="py-3 pr-3 text-left font-normal">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                  <span className="text-base font-semibold text-ds-ink-900">{k.keyword}</span>
                  {k.core ? <CoreBadge /> : null}
                  {k.tracked ? <TrackedBadge /> : null}
                </span>
                {/* Petit écran : le détail des colonnes masquées, sous le mot-clé */}
                <span className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-ds-meta text-ds-ink-600 md:hidden">
                  <span>
                    <span className="font-semibold text-ds-ink-800 ds-tnum">{eur(k.cpcEur)}</span> le clic
                  </span>
                  {k.competition ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="sr-only">Concurrence :</span>
                      <CompetitionBadge keyword={k} />
                    </span>
                  ) : null}
                  <span>Correspondance : {GOOGLE_ADS_MATCH_LABELS[k.match].toLowerCase()}</span>
                </span>
              </th>
              <td className="py-3 pl-3 text-right font-semibold text-ds-ink-900 ds-tnum md:pr-5 md:pl-0">{num(k.searchVolume)}</td>
              <td className="py-3 pr-5 text-right ds-tnum max-md:hidden">{eur(k.cpcEur)}</td>
              <td className="py-3 pr-3 max-md:hidden">
                <CompetitionBadge keyword={k} />
              </td>
              <td className="py-3 max-md:hidden">{GOOGLE_ADS_MATCH_LABELS[k.match]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
