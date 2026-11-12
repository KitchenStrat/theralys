"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { clsx } from "clsx";
import {
  ArrowRight,
  Ban,
  CalendarClock,
  Check,
  ClipboardList,
  Flag,
  Gavel,
  Lightbulb,
  Link2,
  MapPin,
  Megaphone,
  Minus,
  Puzzle,
  Sparkles,
  Tag,
  TriangleAlert,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { GOOGLE_ADS_RSA, intentLabel, type GoogleAdsAd, type GoogleAdsAdGroup, type GoogleAdsPlan } from "@theralys/shared";
import { AiBadge, Badge, Button, Card, CardHeader, EmptyState, GenerationProgress, InlineSuccess } from "@/components/ds";
import { formatDayFr } from "@/lib/calendar";
import { LANDING_UNAVAILABLE, landingDisplay, landingPathOf, type AnalysisSite } from "@/lib/google-ads/analysis-site";
import { formatAdsKeywordList, formatAdsLines, formatAdsNegativeList } from "@/lib/google-ads/clipboard";
import { regenerateAdsPlan } from "./actions";
import { FinePrint, Notice } from "./ads-ui";
import { CopyButton } from "./copy-button";
import { PLAN_STEPS, PlanRegenerateModal } from "./plan-regenerate-modal";
import type { AdsTab } from "./tabs";

const eur = (value: number, digits = 0) => `${value.toLocaleString("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits })} €`;

const PLAN_FAILED_FALLBACK = "Le plan d'action n'a pas pu être généré.";

export function PlanTab({
  plan,
  analysisReady,
  planError,
  instructions,
  regenRemaining,
  analysisSite,
  onSelectTab,
}: {
  plan: GoogleAdsPlan | null;
  /** Analyse aboutie (mots-clés et diagnostic présents) : sans plan, il peut être généré seul */
  analysisReady: boolean;
  /** Message d'erreur de l'analyse (plan IA en échec), déjà en français */
  planError: string | null;
  instructions: string | null;
  regenRemaining: number;
  /** Site pour lequel l'analyse a été préparée : son adresse accompagne les chemins du plan, jamais celle de l'autre site */
  analysisSite: AnalysisSite;
  onSelectTab: (tab: AdsTab) => void;
}) {
  const [modalOpen, setModalOpen] = useState(false);

  if (!plan && analysisReady) {
    return <MissingPlanCard error={planError} remaining={regenRemaining} onSelectTab={onSelectTab} />;
  }

  if (!plan) {
    return (
      <Card padding="none">
        <EmptyState
          as="h2"
          icon={ClipboardList}
          title="Votre plan d'action apparaîtra ici."
          action={
            <Button type="button" iconRight={<ArrowRight size={18} aria-hidden />} onClick={() => onSelectTab("diagnostic")}>
              Aller au diagnostic
            </Button>
          }
        >
          Lancez l&apos;analyse depuis l&apos;onglet Diagnostic : structure de campagne, groupes d&apos;annonces avec leurs mots-clés, annonces
          prêtes à coller, extensions, enchères, budget et jalons à 7, 30, 60 et 90 jours.
        </EmptyState>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card variant="tinted" padding="lg">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
          <div className="min-w-0 flex-[1_1_22rem]">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <h2 className="font-ds-display text-lg/7 font-bold text-ds-section-ink sm:text-xl/7">Objectif</h2>
              {plan.generator === "anthropic" ? <AiBadge>Préparé par l&apos;IA, à relire</AiBadge> : null}
            </div>
            <p className="mt-3 font-ds-display text-xl/7 font-bold text-ds-ink-900 text-pretty sm:text-2xl/8">{plan.objective}</p>
            <p className="mt-2.5 text-base text-ds-ink-700 text-pretty">{plan.summary}</p>
            <FinePrint className="mt-3">
              Plan préparé le {formatDayFr(plan.generatedAt, "day")}
              {instructions ? " avec vos instructions" : ""}
              {plan.generator === "mock" ? " · mode démonstration" : ""}.
            </FinePrint>
            {instructions ? (
              <p className="mt-3 rounded-ds-md border-l-4 border-ds-section-accent bg-white px-4 py-3 text-ds-body text-ds-ink-800">« {instructions} »</p>
            ) : null}
          </div>
          <Button type="button" variant="secondary" icon={<Sparkles size={18} aria-hidden />} onClick={() => setModalOpen(true)}>
            Instructions &amp; régénérer
          </Button>
        </div>
      </Card>

      <Card>
        <CardHeader icon={Megaphone} title="Campagne" description="Réseau de Recherche uniquement — les réglages à reporter dans Google Ads." />
        {/* Trois réglages courts sur une rangée, puis les deux consignes rédigées côte à côte */}
        <dl className="mt-5 grid gap-3 md:grid-cols-6">
          <Field className="md:col-span-2" icon={Tag} label="Nom de la campagne" value={plan.campaign.name} />
          <Field
            className="md:col-span-2"
            icon={MapPin}
            label="Zone"
            value={`${plan.campaign.geo.city} + ${plan.campaign.geo.radiusKm} km`}
            hint={plan.campaign.geo.note}
          />
          <Field
            className="md:col-span-2"
            icon={Wallet}
            label="Budget quotidien"
            value={eur(plan.campaign.dailyBudgetEur, 2)}
            hint={`soit ${eur(plan.campaign.monthlyBudgetEur)} par mois`}
          />
          <Field className="md:col-span-3" icon={CalendarClock} label="Calendrier de diffusion" value={plan.campaign.schedule} prose />
          <Field className="md:col-span-3" icon={Gavel} label="Enchères" value={plan.campaign.bidding} prose />
        </dl>
      </Card>

      {plan.adGroups.map((group, index) => (
        <AdGroupCard key={`${group.name}-${index}`} group={group} index={index} analysisSite={analysisSite} />
      ))}

      <Card>
        <CardHeader
          icon={Ban}
          title="Mots-clés négatifs"
          description="À exclure au niveau de la campagne."
          action={<CopyButton text={formatAdsNegativeList(plan.negatives)} label={`Copier les négatifs (${plan.negatives.length})`} />}
        />
        <ul className="mt-4 flex flex-wrap gap-2" aria-label="Mots-clés négatifs du plan">
          {plan.negatives.map((n) => (
            <li key={n}>
              <Badge tone="neutral">{n}</Badge>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <CardHeader icon={Puzzle} title="Extensions" description="Elles agrandissent l'annonce sans coût supplémentaire." />
        <div className="mt-5 grid gap-x-8 gap-y-6 md:grid-cols-2">
          <div>
            <h3 className="text-base font-semibold text-ds-ink-900">Liens annexes</h3>
            {plan.extensions.sitelinks.length === 0 ? (
              <p className="mt-2 text-ds-body text-ds-ink-600">Aucun : ajoutez des pages de spécialités à votre site.</p>
            ) : (
              <ul className="mt-2 divide-y divide-ds-ink-200 text-ds-body">
                {plan.extensions.sitelinks.map((s, i) => {
                  // Chemin enregistré ramené à la page actuelle du site de l'analyse ; sans adresse connue, le titre seul
                  const address = landingDisplay(analysisSite, s.path);
                  return (
                    <li key={`${i}-${s.title}-${s.path}`} className="py-2.5">
                      <span className="block font-semibold text-ds-ink-900">{s.title}</span>
                      {address ? (
                        <span className="mt-0.5 flex items-start gap-1.5 text-ds-meta text-ds-ink-600">
                          <Link2 size={14} aria-hidden className="mt-[3px] shrink-0 text-ds-section-accent" />
                          <span className="min-w-0 break-all">{address}</span>
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-base font-semibold text-ds-ink-900">Accroches</h3>
              <CopyButton text={formatAdsLines(plan.extensions.callouts)} label="Copier" variant="ghost" />
            </div>
            <ul className="mt-2 flex flex-wrap gap-2">
              {plan.extensions.callouts.map((c, i) => (
                <li key={`${i}-${c}`}>
                  <Badge tone="section">{c}</Badge>
                </li>
              ))}
            </ul>
            <p className="mt-4 flex flex-wrap gap-2">
              <Badge tone={plan.extensions.call ? "success" : "neutral"} icon={plan.extensions.call ? Check : Minus}>
                {plan.extensions.call ? "Extension d'appel" : "Extension d'appel : non"}
              </Badge>
              <Badge tone={plan.extensions.location ? "success" : "neutral"} icon={plan.extensions.location ? Check : Minus}>
                {plan.extensions.location ? "Extension de lieu" : "Extension de lieu : reliez votre fiche"}
              </Badge>
            </p>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader icon={Flag} title="Jalons" description="Ce qu'il faut faire et mesurer, semaine après semaine." />
        <ol className="mt-5 grid gap-4 md:grid-cols-2" aria-label="Jalons">
          {plan.milestones.map((m, i) => (
            <li key={`${i}-${m.horizon}`} className="rounded-ds-md bg-ds-section-tint p-4 ring-1 ring-ds-section-line/70 sm:p-5">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                <Badge tone="section" icon={CalendarClock}>
                  {m.horizon}
                </Badge>
                <h3 className="text-base font-semibold text-ds-section-ink">{m.title}</h3>
              </div>
              <ul className="mt-3 space-y-1.5 text-ds-body text-ds-ink-700">
                {m.actions.map((a, j) => (
                  <li key={`${j}-${a}`} className="flex items-start gap-2.5">
                    <span aria-hidden className="mt-[0.5625rem] size-1.5 shrink-0 rounded-full bg-ds-section-accent" />
                    <span className="min-w-0">{a}</span>
                  </li>
                ))}
              </ul>
              {m.kpis.length > 0 ? (
                <p className="mt-3 border-t border-ds-section-line pt-3 text-ds-meta text-ds-ink-600">
                  <span className="font-semibold text-ds-ink-800">Indicateurs : </span>
                  {m.kpis.join(" · ")}
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      </Card>

      {plan.tips.length > 0 ? (
        <Card>
          <CardHeader icon={Lightbulb} title="Conseils" />
          <ul className="mt-4 space-y-3 text-base text-ds-ink-700">
            {plan.tips.map((t, i) => (
              <li key={`${i}-${t}`} className="flex items-start gap-3">
                <Check size={18} strokeWidth={2.5} aria-hidden className="mt-[3px] shrink-0 text-ds-section-accent" />
                <span className="min-w-0">{t}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <PlanRegenerateModal open={modalOpen} onClose={() => setModalOpen(false)} remaining={regenRemaining} currentInstructions={instructions} />
    </div>
  );
}

/**
 * Analyse aboutie sans plan (plan IA en échec) : mots-clés et diagnostic sont
 * là, le plan se génère seul — même action que la régénération, sans
 * instructions, décomptée du même quota mensuel.
 */
function MissingPlanCard({ error, remaining, onSelectTab }: { error: string | null; remaining: number; onSelectTab: (tab: AdsTab) => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ error?: string; message?: string }>({});

  function generate() {
    setResult({});
    startTransition(async () => {
      const outcome = await regenerateAdsPlan({});
      if (outcome.error) {
        setResult({ error: outcome.error });
        return;
      }
      setResult({ message: "Plan d'action généré : campagne, groupes d'annonces et annonces prêts." });
      router.refresh();
    });
  }

  return (
    <Card padding="none">
      <EmptyState
        as="h2"
        icon={ClipboardList}
        title={error?.trim() ? error.trim() : PLAN_FAILED_FALLBACK}
        action={
          <Button
            type="button"
            icon={<Sparkles size={18} aria-hidden />}
            onClick={generate}
            loading={pending}
            disabled={remaining <= 0}
            title={remaining <= 0 ? "Quota mensuel de générations atteint" : undefined}
          >
            {pending ? "Génération…" : "Générer le plan d'action"}
          </Button>
        }
        secondary={
          <Button type="button" variant="quiet" onClick={() => onSelectTab("diagnostic")}>
            Aller au diagnostic
          </Button>
        }
      >
        Vos mots-clés et votre diagnostic sont bien enregistrés : générez le plan d&apos;action (structure de campagne, groupes
        d&apos;annonces, annonces, budget et jalons) sans relancer l&apos;analyse.
      </EmptyState>
      <div className="mx-auto -mt-3 flex max-w-xl flex-col items-center gap-4 px-5 pb-9 sm:px-8 sm:pb-11">
        {/* Région vivante permanente : l'attente y est annoncée une fois ; le bloc d'étapes annonce ensuite chaque changement */}
        <p aria-live="polite" className="sr-only">
          {pending ? "Génération en cours, jusqu'à une minute…" : ""}
        </p>
        {pending ? (
          <div className="w-full rounded-ds-md bg-ds-ink-50 p-4 text-left ring-1 ring-ds-ink-200">
            <GenerationProgress
              title="Nous rédigeons votre plan d'action"
              steps={PLAN_STEPS}
              running
              estimate="jusqu'à une minute"
              hint="Vos mots-clés et votre diagnostic ne changent pas : seul le plan est écrit."
            />
          </div>
        ) : null}
        {result.error ? (
          <Notice tone="danger" role="alert" className="w-full text-left">
            {result.error}
          </Notice>
        ) : null}
        {result.message ? <InlineSuccess>{result.message}</InlineSuccess> : null}
        <FinePrint>
          {remaining} génération{remaining > 1 ? "s" : ""} restante{remaining > 1 ? "s" : ""} ce mois-ci.
        </FinePrint>
      </div>
    </Card>
  );
}

/** Un réglage de la campagne. `prose` : la valeur est une consigne rédigée (plusieurs phrases), pas un chiffre ou un nom. */
function Field({
  icon: Icon,
  label,
  value,
  hint,
  prose = false,
  className,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
  prose?: boolean;
  className?: string;
}) {
  return (
    <div className={clsx("rounded-ds-md bg-ds-section-tint p-4 ring-1 ring-ds-section-line/70", className)}>
      <dt className="flex items-center gap-2 text-ds-meta font-semibold text-ds-ink-600">
        <Icon size={16} aria-hidden className="shrink-0 text-ds-section-accent" />
        {label}
      </dt>
      <dd className={clsx("mt-1.5 text-ds-ink-900", prose ? "text-ds-body" : "text-lg/7 font-semibold")}>{value}</dd>
      {hint ? <dd className="mt-1 text-ds-meta text-ds-ink-600">{hint}</dd> : null}
    </div>
  );
}

function AdGroupCard({ group, index, analysisSite }: { group: GoogleAdsAdGroup; index: number; analysisSite: AnalysisSite }) {
  const keywordsText = formatAdsKeywordList(group.keywords);
  // Les plans enregistrés avant la correction portent « /<slug> » : la page est montrée sous son adresse actuelle
  const landingPath = landingPathOf(analysisSite, group.landingPath);
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 flex-[1_1_18rem] items-start gap-3.5">
          {/* Numéro du groupe : blanc sur le dégradé profond de la section */}
          <span
            aria-hidden
            className="grid size-11 shrink-0 place-items-center rounded-ds-sm bg-ds-section-gradient-deep font-ds-display text-lg font-bold text-ds-section-on-deep shadow-ds-glow"
          >
            {index + 1}
          </span>
          <div className="min-w-0">
            <h2 className="font-ds-display text-lg/7 font-bold text-ds-ink-900 sm:text-xl/7">
              <span className="sr-only">Groupe {index + 1} : </span>
              {group.name}
            </h2>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-ds-body text-ds-ink-600">
              <Badge tone="section">{intentLabel(group.intent)}</Badge>
              <span className="inline-flex min-w-0 items-start gap-1.5">
                <Link2 size={16} aria-hidden className="mt-1 shrink-0 text-ds-section-accent" />
                <span className="min-w-0">
                  Page d&apos;arrivée :{" "}
                  <span className="font-semibold break-all text-ds-ink-800">{landingDisplay(analysisSite, group.landingPath) ?? LANDING_UNAVAILABLE}</span>
                </span>
              </span>
            </p>
          </div>
        </div>
        <CopyButton text={keywordsText} label={`Copier les mots-clés (${group.keywords.length})`} />
      </div>

      <ul className="mt-4 flex flex-wrap gap-2" aria-label={`Mots-clés du groupe ${group.name}`}>
        {group.keywords.map((k) => (
          <li key={`${k.text}-${k.match}`} className="max-w-full">
            {/* `!` : le badge du design system interdit le retour à la ligne ; un mot-clé long doit pouvoir se replier à 320 px */}
            <Badge tone="neutral" className="max-w-full rounded-ds-sm! text-left font-mono whitespace-normal!">
              {k.match === "phrase" ? `"${k.text}"` : k.match === "exact" ? `[${k.text}]` : k.text}
            </Badge>
          </li>
        ))}
      </ul>

      {group.ads.map((ad, i) => (
        <AdView key={i} ad={ad} index={i} count={group.ads.length} siteDomain={analysisSite.domain} landingPath={landingPath} />
      ))}
    </Card>
  );
}

function AdView({
  ad,
  index,
  count,
  siteDomain,
  landingPath,
}: {
  ad: GoogleAdsAd;
  index: number;
  count: number;
  /** Adresse du site de l'analyse ; `null` quand elle n'est plus connue (l'aperçu dit alors « votre site ») */
  siteDomain: string | null;
  landingPath: string;
}) {
  const display = [siteDomain ?? "votre site", ad.path1, ad.path2].filter(Boolean).join(" › ");
  return (
    <div className="mt-6 border-t border-ds-ink-200 pt-5">
      <h3 className="text-base font-semibold text-ds-ink-900">Annonce responsive{count > 1 ? ` ${index + 1}` : ""}</h3>
      <p className="mt-0.5 text-ds-body text-ds-ink-600">Aperçu d&apos;une combinaison possible — Google assemble lui-même titres et descriptions.</p>
      <div role="group" className="mt-3 max-w-2xl rounded-ds-md bg-white p-4 shadow-ds-card ring-1 ring-ds-ink-200" aria-label="Aperçu de l'annonce">
        <p className="text-ds-meta text-ds-ink-700">
          <span className="font-bold text-ds-ink-900">Annonce</span> · <span className="break-all">{display}</span>
          {siteDomain ? <span className="sr-only"> (page {landingPath})</span> : null}
        </p>
        <p className="mt-1.5 text-lg/6 font-medium text-ds-blue-700">{ad.headlines.slice(0, 3).join(" | ")}</p>
        <p className="mt-1.5 text-ds-body text-ds-ink-700">{ad.descriptions.slice(0, 2).join(" ")}</p>
      </div>

      {/* Titres courts sur deux ou trois colonnes, descriptions sur deux : la carte reste lisible d'un regard */}
      <div className="mt-5 space-y-5">
        <TextList title="Titres" items={ad.headlines} max={GOOGLE_ADS_RSA.headlineMax} copyLabel="Copier les titres" columns="sm:grid-cols-2 xl:grid-cols-3" />
        <TextList
          title="Descriptions"
          items={ad.descriptions}
          max={GOOGLE_ADS_RSA.descriptionMax}
          copyLabel="Copier les descriptions"
          columns="lg:grid-cols-2"
        />
      </div>
    </div>
  );
}

function TextList({ title, items, max, copyLabel, columns }: { title: string; items: string[]; max: number; copyLabel: string; columns: string }) {
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-ds-body font-semibold text-ds-ink-900">
          {title} ({items.length})
        </h4>
        <CopyButton text={formatAdsLines(items)} label={copyLabel} variant="ghost" />
      </div>
      <ol className={clsx("mt-2 grid gap-2", columns)}>
        {items.map((text, i) => {
          const tooLong = text.length > max;
          return (
            <li key={`${i}-${text}`} className="flex items-start justify-between gap-3 rounded-ds-sm bg-ds-ink-50 px-3.5 py-2 text-ds-body ring-1 ring-ds-ink-200">
              <span className="min-w-0 text-ds-ink-900">{text}</span>
              {/* Longueur du texte sur la limite Google : un dépassement est dit par un pictogramme et un mot, pas par la seule couleur */}
              <span className={clsx("inline-flex shrink-0 items-center gap-1 pt-0.5 text-ds-meta ds-tnum", tooLong ? "font-semibold text-ds-danger-700" : "text-ds-ink-600")}>
                {tooLong ? <TriangleAlert size={14} aria-hidden /> : null}
                {text.length}
                <span aria-hidden>/</span>
                <span className="sr-only"> caractères sur </span>
                {max}
                {tooLong ? <span className="sr-only"> : trop long</span> : null}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
