"use client";

import { useMemo } from "react";
import { Badge, Button, Card } from "@theralys/ui";
import {
  GOOGLE_ADS_MATCH_LABELS,
  type GoogleAdsCompetition,
  type GoogleAdsKeyword,
  type GoogleAdsKeywordGroup,
  type GoogleAdsKeywordSet,
} from "@theralys/shared";
import { formatDayFr } from "@/lib/calendar";
import { formatAdsKeywordList, formatAdsNegativeList } from "@/lib/google-ads/clipboard";
import { nationalQueryExample } from "@/lib/google-ads/keywords";
import { CopyButton } from "./copy-button";
import type { AdsTab } from "./tabs";

const COMPETITION: Record<GoogleAdsCompetition, { label: string; tone: "success" | "warning" | "danger" }> = {
  LOW: { label: "Faible", tone: "success" },
  MEDIUM: { label: "Moyenne", tone: "warning" },
  HIGH: { label: "Forte", tone: "danger" },
};

const num = (value: number | null) => (value === null ? "—" : value.toLocaleString("fr-FR"));
const eur = (value: number | null) => (value === null ? "—" : `${value.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`);

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
      <Card className="p-8 text-center text-ink-500">
        <p className="font-medium text-ink-700">
          {analysisReady ? "Aucun mot-clé n'a été retenu pour votre cabinet." : "Vos mots-clés à cibler apparaîtront ici."}
        </p>
        <p className="mt-1 text-sm">
          {analysisReady
            ? "Les idées renvoyées par Google Ads n'avaient pas assez de volume ou étaient hors sujet : relancez une analyse plus tard, ou ajoutez des pages de spécialités à votre site."
            : "Lancez l'analyse depuis l'onglet Diagnostic : volumes de recherche, coûts par clic et concurrence réels, regroupés par intention, avec les mots-clés négatifs à exclure."}
        </p>
        <div className="mt-5">
          <Button variant="secondary" onClick={() => onSelectTab("diagnostic")}>
            Aller au diagnostic
          </Button>
        </div>
      </Card>
    );
  }

  const core = keywords.keywords.filter((k) => k.core);
  const coreText = formatAdsKeywordList(core.map((k) => ({ text: k.keyword, match: k.match })));
  const nationalExample = nationalQueryExample(keywords, city);

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-xl font-semibold">Mots-clés à cibler</h2>
            <p className="mt-1 text-sm text-ink-500">
              {keywords.keywords.length} expression{keywords.keywords.length > 1 ? "s" : ""} retenue{keywords.keywords.length > 1 ? "s" : ""} sur{" "}
              {keywords.rawCount} idée{keywords.rawCount > 1 ? "s" : ""} ({keywords.dropped} écartée{keywords.dropped > 1 ? "s" : ""} : hors sujet,
              informationnelles ou sans volume) · relevé le {formatDayFr(keywords.fetchedAt, "day")}
              {keywords.source === "mock" ? " · données de démonstration" : ""}.
            </p>
          </div>
          <CopyButton text={coreText} label={`Copier le cœur (${core.length})`} variant="primary" size="md" />
        </div>
        <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-500" aria-label="Légende">
          <li>
            <Badge tone="primary">cœur</Badge> les {core.length} meilleures expressions, envoyées à la prévision et mises en avant dans le plan
          </li>
          <li>
            <Badge tone="info">suivi</Badge> mot-clé déjà suivi dans Fiche Google (position naturelle)
          </li>
        </ul>
        <p className="mt-3 rounded-xl bg-cream-100 px-4 py-3 text-sm text-ink-700">
          Les volumes des requêtes sans ville{nationalExample ? ` (« ${nationalExample} »)` : ""} sont nationaux : diffusées autour du cabinet
          grâce au ciblage géographique, elles touchent bien moins de personnes que ce chiffre — mais ce sont souvent elles qui amènent les
          patients proches.
        </p>
      </Card>

      {keywords.groups.map((group) => (
        <GroupCard key={group.intent} group={group} byText={byText} />
      ))}

      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-xl font-semibold">Mots-clés négatifs</h2>
            <p className="mt-1 text-sm text-ink-500">
              Les recherches d&apos;emploi, de formation, d&apos;information ou de produits ne doivent jamais déclencher vos annonces : à coller dans
              la liste d&apos;exclusion de la campagne.
            </p>
          </div>
          <CopyButton text={formatAdsNegativeList(keywords.negatives)} label={`Copier les négatifs (${keywords.negatives.length})`} />
        </div>
        <ul className="mt-4 flex flex-wrap gap-1.5" aria-label="Mots-clés négatifs">
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

function GroupCard({ group, byText }: { group: GoogleAdsKeywordGroup; byText: Map<string, GoogleAdsKeyword> }) {
  const rows = group.keywords.map((text) => byText.get(text)).filter((k): k is GoogleAdsKeyword => k !== undefined);
  const text = formatAdsKeywordList(rows.map((k) => ({ text: k.keyword, match: k.match })));
  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold">{group.label}</h2>
          <p className="mt-1 text-sm text-ink-500">
            {rows.length} mot{rows.length > 1 ? "s" : ""}-clé{rows.length > 1 ? "s" : ""} · {num(group.totalVolume)} recherches / mois
            {group.medianCpcEur !== null ? ` · CPC médian ${eur(group.medianCpcEur)}` : ""}
          </p>
        </div>
        <CopyButton text={text} label="Copier le groupe" />
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-ink-500">
              <th scope="col" className="py-2 pr-3 font-medium">
                Mot-clé
              </th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">
                Volume / mois
              </th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">
                CPC
              </th>
              <th scope="col" className="py-2 pr-3 font-medium">
                Concurrence
              </th>
              <th scope="col" className="py-2 font-medium">
                Correspondance
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-cream-200">
            {rows.map((k) => {
              const competition = k.competition ? COMPETITION[k.competition] : null;
              return (
                <tr key={k.keyword} className="text-ink-700">
                  <th scope="row" className="py-2 pr-3 text-left font-normal">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="font-medium text-ink-900">{k.keyword}</span>
                      {k.core ? <Badge tone="primary">cœur</Badge> : null}
                      {k.tracked ? <Badge tone="info">suivi</Badge> : null}
                    </span>
                  </th>
                  <td className="py-2 pr-3 text-right tabular-nums">{num(k.searchVolume)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{eur(k.cpcEur)}</td>
                  <td className="py-2 pr-3">
                    {competition ? (
                      <Badge tone={competition.tone}>
                        {competition.label}
                        {k.competitionIndex !== null ? <span className="font-normal opacity-80"> {k.competitionIndex}</span> : null}
                      </Badge>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-2">{GOOGLE_ADS_MATCH_LABELS[k.match]}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
