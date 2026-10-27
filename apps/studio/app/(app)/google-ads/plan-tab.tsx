"use client";

import { useState } from "react";
import { clsx } from "clsx";
import { Badge, Button, Card } from "@theralys/ui";
import { GOOGLE_ADS_RSA, intentLabel, type GoogleAdsAd, type GoogleAdsAdGroup, type GoogleAdsPlan } from "@theralys/shared";
import { formatDayFr } from "@/lib/calendar";
import { formatAdsKeywordList, formatAdsLines, formatAdsNegativeList } from "@/lib/google-ads/clipboard";
import { CopyButton } from "./copy-button";
import { PlanRegenerateModal } from "./plan-regenerate-modal";
import type { AdsTab } from "./tabs";

const eur = (value: number, digits = 0) => `${value.toLocaleString("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits })} €`;

export function PlanTab({
  plan,
  instructions,
  regenRemaining,
  siteDomain,
  onSelectTab,
}: {
  plan: GoogleAdsPlan | null;
  instructions: string | null;
  regenRemaining: number;
  siteDomain: string;
  onSelectTab: (tab: AdsTab) => void;
}) {
  const [modalOpen, setModalOpen] = useState(false);

  if (!plan) {
    return (
      <Card className="p-8 text-center text-ink-500">
        <p className="font-medium text-ink-700">Votre plan d&apos;action apparaîtra ici.</p>
        <p className="mt-1 text-sm">
          Lancez l&apos;analyse depuis l&apos;onglet Diagnostic : structure de campagne, groupes d&apos;annonces avec leurs mots-clés, annonces
          prêtes à coller, extensions, enchères, budget et jalons à 7, 30, 60 et 90 jours.
        </p>
        <div className="mt-5">
          <Button variant="secondary" onClick={() => onSelectTab("diagnostic")}>
            Aller au diagnostic
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-semibold">Objectif</h2>
            <p className="mt-2 text-base text-ink-900">{plan.objective}</p>
            <p className="mt-2 text-sm text-ink-700">{plan.summary}</p>
            <p className="mt-2 text-xs text-ink-500">
              Plan préparé le {formatDayFr(plan.generatedAt, "day")}
              {instructions ? " avec vos instructions" : ""}
              {plan.generator === "mock" ? " · mode démonstration" : ""}.
            </p>
            {instructions ? <p className="mt-2 rounded-xl bg-cream-100 px-4 py-2 text-sm text-ink-700">« {instructions} »</p> : null}
          </div>
          <Button variant="secondary" onClick={() => setModalOpen(true)}>
            ✦ Instructions &amp; régénérer
          </Button>
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="text-xl font-semibold">Campagne</h2>
        <p className="mt-1 text-sm text-ink-500">Réseau de Recherche uniquement — les réglages à reporter dans Google Ads.</p>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Nom de la campagne" value={plan.campaign.name} />
          <Field label="Zone" value={`${plan.campaign.geo.city} + ${plan.campaign.geo.radiusKm} km`} hint={plan.campaign.geo.note} />
          <Field label="Calendrier de diffusion" value={plan.campaign.schedule} />
          <Field label="Enchères" value={plan.campaign.bidding} />
          <Field label="Budget quotidien" value={eur(plan.campaign.dailyBudgetEur, 2)} hint={`soit ${eur(plan.campaign.monthlyBudgetEur)} par mois`} />
        </dl>
      </Card>

      {plan.adGroups.map((group, index) => (
        <AdGroupCard key={`${group.name}-${index}`} group={group} index={index} siteDomain={siteDomain} />
      ))}

      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">Mots-clés négatifs</h2>
            <p className="mt-1 text-sm text-ink-500">À exclure au niveau de la campagne.</p>
          </div>
          <CopyButton text={formatAdsNegativeList(plan.negatives)} label={`Copier les négatifs (${plan.negatives.length})`} />
        </div>
        <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Mots-clés négatifs du plan">
          {plan.negatives.map((n) => (
            <li key={n}>
              <Badge tone="neutral">{n}</Badge>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="p-6">
        <h2 className="text-xl font-semibold">Extensions</h2>
        <p className="mt-1 text-sm text-ink-500">Elles agrandissent l&apos;annonce sans coût supplémentaire.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <h3 className="text-sm font-semibold text-ink-900">Liens annexes</h3>
            {plan.extensions.sitelinks.length === 0 ? (
              <p className="mt-1 text-sm text-ink-500">Aucun : ajoutez des pages de spécialités à votre site.</p>
            ) : (
              <ul className="mt-1 space-y-1 text-sm text-ink-700">
                {plan.extensions.sitelinks.map((s) => (
                  <li key={`${s.title}-${s.path}`}>
                    <span className="font-medium text-ink-900">{s.title}</span> <span className="text-ink-500">→ {siteDomain}{s.path}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-ink-900">Accroches</h3>
              <CopyButton text={formatAdsLines(plan.extensions.callouts)} label="Copier" variant="ghost" />
            </div>
            <ul className="mt-1 flex flex-wrap gap-1.5">
              {plan.extensions.callouts.map((c) => (
                <li key={c}>
                  <Badge tone="neutral">{c}</Badge>
                </li>
              ))}
            </ul>
            <p className="mt-3 flex flex-wrap gap-1.5 text-sm">
              <Badge tone={plan.extensions.call ? "success" : "neutral"}>{plan.extensions.call ? "✓ Extension d'appel" : "Extension d'appel : non"}</Badge>
              <Badge tone={plan.extensions.location ? "success" : "neutral"}>{plan.extensions.location ? "✓ Extension de lieu" : "Extension de lieu : reliez votre fiche"}</Badge>
            </p>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="text-xl font-semibold">Jalons</h2>
        <p className="mt-1 text-sm text-ink-500">Ce qu&apos;il faut faire et mesurer, semaine après semaine.</p>
        <ol className="mt-4 grid gap-4 sm:grid-cols-2" aria-label="Jalons">
          {plan.milestones.map((m) => (
            <li key={m.horizon} className="rounded-2xl border border-cream-200 bg-cream-50 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="primary">{m.horizon}</Badge>
                <h3 className="font-semibold text-ink-900">{m.title}</h3>
              </div>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-700">
                {m.actions.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
              {m.kpis.length > 0 ? (
                <p className="mt-2 text-xs text-ink-500">
                  <span className="font-medium text-ink-700">Indicateurs : </span>
                  {m.kpis.join(" · ")}
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      </Card>

      {plan.tips.length > 0 ? (
        <Card className="p-6">
          <h2 className="text-xl font-semibold">Conseils</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-ink-700">
            {plan.tips.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </Card>
      ) : null}

      <PlanRegenerateModal open={modalOpen} onClose={() => setModalOpen(false)} remaining={regenRemaining} currentInstructions={instructions} />
    </div>
  );
}

function Field({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl bg-cream-50 p-3">
      <dt className="text-xs text-ink-500">{label}</dt>
      <dd className="text-sm font-medium text-ink-900">{value}</dd>
      {hint ? <dd className="mt-1 text-[11px] text-ink-500">{hint}</dd> : null}
    </div>
  );
}

function AdGroupCard({ group, index, siteDomain }: { group: GoogleAdsAdGroup; index: number; siteDomain: string }) {
  const keywordsText = formatAdsKeywordList(group.keywords);
  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold">
            <span className="mr-2 text-ink-500">{index + 1}.</span>
            {group.name}
          </h2>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-500">
            <Badge tone="info">{intentLabel(group.intent)}</Badge>
            Page d&apos;atterrissage : <span className="font-medium text-ink-700">{siteDomain}{group.landingPath}</span>
          </p>
        </div>
        <CopyButton text={keywordsText} label={`Copier les mots-clés (${group.keywords.length})`} />
      </div>

      <ul className="mt-4 flex flex-wrap gap-1.5" aria-label={`Mots-clés du groupe ${group.name}`}>
        {group.keywords.map((k) => (
          <li key={`${k.text}-${k.match}`}>
            <Badge tone="neutral" className="font-mono text-[11px]">
              {k.match === "phrase" ? `"${k.text}"` : k.match === "exact" ? `[${k.text}]` : k.text}
            </Badge>
          </li>
        ))}
      </ul>

      {group.ads.map((ad, i) => (
        <AdView key={i} ad={ad} index={i} count={group.ads.length} siteDomain={siteDomain} landingPath={group.landingPath} />
      ))}
    </Card>
  );
}

function AdView({ ad, index, count, siteDomain, landingPath }: { ad: GoogleAdsAd; index: number; count: number; siteDomain: string; landingPath: string }) {
  const display = [siteDomain, ad.path1, ad.path2].filter(Boolean).join(" › ");
  return (
    <div className="mt-5 border-t border-cream-200 pt-4">
      <h3 className="text-sm font-semibold text-ink-900">
        Annonce responsive{count > 1 ? ` ${index + 1}` : ""}
      </h3>
      <p className="mt-0.5 text-xs text-ink-500">Aperçu d&apos;une combinaison possible — Google assemble lui-même titres et descriptions.</p>
      <div className="mt-3 max-w-2xl rounded-2xl border border-cream-200 bg-white p-4" aria-label="Aperçu de l'annonce">
        <p className="text-xs text-ink-700">
          <span className="font-bold">Annonce</span> · {display}
          <span className="sr-only"> (page {landingPath})</span>
        </p>
        <p className="mt-1 text-lg leading-snug text-info-500">{ad.headlines.slice(0, 3).join(" | ")}</p>
        <p className="mt-1 text-sm text-ink-700">{ad.descriptions.slice(0, 2).join(" ")}</p>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <TextList title="Titres" items={ad.headlines} max={GOOGLE_ADS_RSA.headlineMax} copyLabel="Copier les titres" />
        <TextList title="Descriptions" items={ad.descriptions} max={GOOGLE_ADS_RSA.descriptionMax} copyLabel="Copier les descriptions" />
      </div>
    </div>
  );
}

function TextList({ title, items, max, copyLabel }: { title: string; items: string[]; max: number; copyLabel: string }) {
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-ink-900">
          {title} ({items.length})
        </h4>
        <CopyButton text={formatAdsLines(items)} label={copyLabel} variant="ghost" />
      </div>
      <ol className="mt-1 divide-y divide-cream-200 rounded-xl border border-cream-200 bg-cream-50">
        {items.map((text, i) => (
          <li key={`${i}-${text}`} className="flex items-start justify-between gap-3 px-3 py-1.5 text-sm">
            <span className="text-ink-900">{text}</span>
            <span className={clsx("shrink-0 tabular-nums text-[11px]", text.length > max ? "font-semibold text-danger-500" : "text-ink-500")}>
              {text.length}/{max}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
