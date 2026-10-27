"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { Badge, Button, Card, FieldHint, Input, Label, Spinner } from "@theralys/ui";
import { GOOGLE_ADS_CONVERSION_KINDS, type GoogleAdsKeywordSet, type GoogleAdsPlan } from "@theralys/shared";
import { formatAdsKeywordList, formatAdsLines, formatAdsNegativeList } from "@/lib/google-ads/clipboard";
import type { AdsResults } from "@theralys/analytics";
import { validateAdsTracking, type AdsTrackingForm } from "@/lib/google-ads/tracking";
import { saveAdsTracking } from "./actions";
import { CopyButton } from "./copy-button";
import type { AdsTab } from "./tabs";
import { ADS_TUTORIAL, GOOGLE_ADS_URL, TAG_ASSISTANT_URL, type TutorialCopy, type TutorialStep } from "./tutorial";

export function SetupTab({
  plan,
  keywords,
  tracking,
  cookieBanner,
  results,
  resultsDays,
  siteDomain,
  onSelectTab,
}: {
  plan: GoogleAdsPlan | null;
  keywords: GoogleAdsKeywordSet | null;
  tracking: AdsTrackingForm;
  /** Bandeau cookies du site actif ; sinon la balise part sans consentement (avertissement) */
  cookieBanner: boolean;
  results: AdsResults;
  resultsDays: number;
  siteDomain: string;
  onSelectTab: (tab: AdsTab) => void;
}) {
  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h2 className="text-xl font-semibold">Paramétrer votre compte Google Ads, pas à pas</h2>
        <p className="mt-1 text-sm text-ink-500">
          Une étape à la fois, dans l&apos;ordre : comptez une à deux heures la première fois. Les boutons Copier reprennent les données
          de votre plan d&apos;action
          {plan ? "." : " — lancez d'abord l'analyse depuis l'onglet Diagnostic pour les obtenir."}
        </p>
        <p className="mt-2 text-sm">
          <a href={GOOGLE_ADS_URL} target="_blank" rel="noopener noreferrer" className="font-medium text-primary-600 hover:underline">
            Ouvrir Google Ads ↗<span className="sr-only"> (nouvel onglet)</span>
          </a>
        </p>
        <div className="mt-4 divide-y divide-cream-200 border-t border-cream-200">
          {ADS_TUTORIAL.map((step, index) => (
            <TutorialStepView key={step.id} step={step} index={index} plan={plan} keywords={keywords} siteDomain={siteDomain} onSelectTab={onSelectTab} />
          ))}
        </div>
      </Card>

      <TrackingForm initial={tracking} cookieBanner={cookieBanner} siteDomain={siteDomain} />

      <ResultsCard results={results} days={resultsDays} tracked={tracking.googleAdsId !== ""} />
    </div>
  );
}

function TutorialStepView({
  step,
  index,
  plan,
  keywords,
  siteDomain,
  onSelectTab,
}: {
  step: TutorialStep;
  index: number;
  plan: GoogleAdsPlan | null;
  keywords: GoogleAdsKeywordSet | null;
  siteDomain: string;
  onSelectTab: (tab: AdsTab) => void;
}) {
  return (
    <details className="group py-3" open={index === 0}>
      <summary className="flex cursor-pointer list-none items-center gap-3 text-left">
        <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-100 text-sm font-bold text-primary-700">
          {index + 1}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium text-ink-900">{step.title}</span>
          <span className="block text-xs text-ink-500">{step.summary}</span>
        </span>
        <span aria-hidden className="text-ink-500 transition-transform group-open:rotate-180">
          ⌄
        </span>
      </summary>
      <div className="mt-3 pl-10">
        <ol className="list-decimal space-y-1.5 pl-5 text-sm text-ink-700">
          {step.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
        {step.copy ? <CopyBlock copy={step.copy} plan={plan} keywords={keywords} siteDomain={siteDomain} onSelectTab={onSelectTab} /> : null}
        {step.note ? <p className="mt-3 rounded-xl bg-warning-100 px-4 py-2 text-sm text-ink-900">{step.note}</p> : null}
      </div>
    </details>
  );
}

/** Boutons Copier des étapes qui collent des données du plan (ou du jeu de mots-clés à défaut de plan). */
function CopyBlock({
  copy,
  plan,
  keywords,
  siteDomain,
  onSelectTab,
}: {
  copy: TutorialCopy;
  plan: GoogleAdsPlan | null;
  keywords: GoogleAdsKeywordSet | null;
  siteDomain: string;
  onSelectTab: (tab: AdsTab) => void;
}) {
  if (copy === "tracking") {
    return (
      <p className="mt-3 text-sm text-ink-700">
        Le formulaire « Suivi des conversions » se trouve sous ce tuto. Vérification :{" "}
        <a href={TAG_ASSISTANT_URL} target="_blank" rel="noopener noreferrer" className="font-medium text-primary-600 hover:underline">
          Tag Assistant ↗<span className="sr-only"> (nouvel onglet)</span>
        </a>
      </p>
    );
  }
  if (!plan && !keywords) {
    return (
      <p className="mt-3 text-sm text-ink-500">
        Les données à coller viendront de votre analyse :{" "}
        <button type="button" onClick={() => onSelectTab("diagnostic")} className="font-medium text-primary-600 hover:underline">
          lancer l&apos;analyse →
        </button>
      </p>
    );
  }
  const wrap = "mt-3 flex flex-wrap items-center gap-2";
  if (copy === "negatives") {
    const negatives = plan?.negatives ?? keywords?.negatives ?? [];
    return (
      <div className={wrap}>
        <CopyButton text={formatAdsNegativeList(negatives)} label={`Copier les mots-clés négatifs (${negatives.length})`} />
      </div>
    );
  }
  if (copy === "keywords") {
    if (!plan) {
      const core = (keywords?.keywords ?? []).filter((k) => k.core);
      return (
        <div className={wrap}>
          <CopyButton text={formatAdsKeywordList(core.map((k) => ({ text: k.keyword, match: k.match })))} label={`Copier le cœur de cible (${core.length})`} />
        </div>
      );
    }
    return (
      <ul className="mt-3 space-y-2" aria-label="Mots-clés par groupe">
        {plan.adGroups.map((g, i) => (
          <li key={`${i}-${g.name}`} className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium text-ink-900">{g.name}</span>
            <span className="text-xs text-ink-500">→ {siteDomain}{g.landingPath}</span>
            <CopyButton text={formatAdsKeywordList(g.keywords)} label={`Copier (${g.keywords.length})`} variant="ghost" />
          </li>
        ))}
      </ul>
    );
  }
  if (copy === "ads") {
    if (!plan) return <p className="mt-3 text-sm text-ink-500">Les annonces sont rédigées avec le plan d&apos;action.</p>;
    return (
      <ul className="mt-3 space-y-2" aria-label="Annonces par groupe">
        {plan.adGroups.map((g, i) => {
          const ad = g.ads[0];
          if (!ad) return null;
          return (
            <li key={`${i}-${g.name}`} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium text-ink-900">{g.name}</span>
              <CopyButton text={formatAdsLines(ad.headlines)} label={`Titres (${ad.headlines.length})`} variant="ghost" />
              <CopyButton text={formatAdsLines(ad.descriptions)} label={`Descriptions (${ad.descriptions.length})`} variant="ghost" />
            </li>
          );
        })}
      </ul>
    );
  }
  // extensions
  if (!plan) return null;
  const sitelinks = plan.extensions.sitelinks.map((s) => `${s.title} — https://${siteDomain}${s.path}`);
  return (
    <div className={wrap}>
      <CopyButton text={formatAdsLines(plan.extensions.callouts)} label={`Copier les accroches (${plan.extensions.callouts.length})`} />
      {sitelinks.length > 0 ? <CopyButton text={formatAdsLines(sitelinks)} label={`Copier les liens annexes (${sitelinks.length})`} /> : null}
    </div>
  );
}

function TrackingForm({ initial, cookieBanner, siteDomain }: { initial: AdsTrackingForm; cookieBanner: boolean; siteDomain: string }) {
  const router = useRouter();
  const [form, setForm] = useState<AdsTrackingForm>(initial);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function set<K extends keyof AdsTrackingForm>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    const checked = validateAdsTracking(form);
    if (!checked.ok) {
      setError(checked.error);
      return;
    }
    startTransition(async () => {
      const result = await saveAdsTracking(form);
      if (result.error) {
        setError(result.error);
        return;
      }
      setMessage(result.message ?? "Suivi enregistré.");
      router.refresh();
    });
  }

  return (
    <Card className="p-6">
      <h2 className="text-xl font-semibold">Suivi des conversions</h2>
      <p className="mt-1 text-sm text-ink-500">
        Votre site ({siteDomain}) charge la balise Google Ads et envoie une conversion à chaque clic « Prendre rendez-vous », sur votre
        numéro de téléphone et sur votre adresse e-mail — après consentement, si le bandeau cookies est actif. Laissez vide pour
        désactiver.
      </p>
      {!cookieBanner ? (
        <p className="mt-4 rounded-xl bg-warning-100 px-4 py-3 text-sm text-ink-900" role="alert">
          Votre bandeau cookies est désactivé : la balise et les conversions partent dès l&apos;arrivée du visiteur. Réactivez-le dans{" "}
          <Link href="/editor" className="font-medium text-primary-700 underline">
            l&apos;éditeur
          </Link>{" "}
          (Paramètres → Tracking) pour rester conforme.
        </p>
      ) : null}
      <form onSubmit={onSubmit} className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label htmlFor="ads-id">Identifiant Google Ads</Label>
          <Input
            id="ads-id"
            value={form.googleAdsId}
            onChange={(e) => set("googleAdsId", e.target.value)}
            placeholder="AW-1234567890"
            autoComplete="off"
            spellCheck={false}
            disabled={pending}
            className="max-w-xs font-mono"
          />
          <FieldHint>Dans l&apos;extrait d&apos;événement d&apos;une action de conversion : send_to: &apos;AW-1234567890/…&apos; → la partie avant la barre oblique.</FieldHint>
        </div>
        {GOOGLE_ADS_CONVERSION_KINDS.map((kind) => (
          <div key={kind.id}>
            <Label htmlFor={`ads-label-${kind.id}`}>{kind.label}</Label>
            <Input
              id={`ads-label-${kind.id}`}
              value={form[kind.id]}
              onChange={(e) => set(kind.id, e.target.value)}
              placeholder="AbCdEfGhIjKlMnOp"
              autoComplete="off"
              spellCheck={false}
              disabled={pending}
              className="font-mono"
            />
          </div>
        ))}
        <div className="sm:col-span-2">
          <FieldHint>
            Libellé = la partie après « AW-…/ » dans l&apos;extrait d&apos;événement de chaque action (vous pouvez coller la valeur complète, l&apos;identifiant
            est retiré). Où trouver : Google Ads → Objectifs → Conversions → l&apos;action → Configuration de la balise → Installer la balise
            vous-même.
          </FieldHint>
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <Button type="submit" disabled={pending}>
            {pending ? <Spinner className="text-white" /> : null} Enregistrer
          </Button>
          {error ? (
            <p className="text-sm text-danger-500" role="alert">
              {error}
            </p>
          ) : null}
          {message ? (
            <p className="text-sm text-success-500" role="status">
              {message}
            </p>
          ) : null}
        </div>
      </form>
      <p className="mt-4 border-t border-cream-200 pt-3 text-xs text-ink-500">
        RGPD : la balise Google Ads et les conversions ne partent qu&apos;après le consentement donné dans le bandeau cookies de votre
        site, si ce bandeau est actif ; sans consentement, aucune donnée n&apos;est envoyée à Google. Jamais chargée dans l&apos;aperçu de
        l&apos;éditeur.
      </p>
    </Card>
  );
}

function ResultsCard({ results, days, tracked }: { results: AdsResults; days: number; tracked: boolean }) {
  const empty = results.visits === 0 && results.rdvClicks === 0 && results.callClicks === 0;
  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold">Résultats</h2>
        <Badge tone="neutral">{days} derniers jours</Badge>
      </div>
      <p className="mt-1 text-sm text-ink-500">
        Ce que vos annonces apportent réellement sur votre site, mesuré par Harmony (sans compte Google Ads à connecter).
      </p>
      {empty ? (
        <p className="mt-4 rounded-xl bg-cream-100 px-4 py-3 text-sm text-ink-700">
          Mesure automatique dès la première visite depuis une annonce : Google ajoute un paramètre (gclid) aux liens de vos annonces,
          votre site le reconnaît et compte les visites, les clics « Prendre rendez-vous » et les appels qui en découlent.
          {tracked ? "" : " Renseignez aussi votre identifiant AW-… ci-dessus pour que Google Ads reçoive ces conversions et optimise vos annonces."}
        </p>
      ) : (
        <dl className="mt-4 grid grid-cols-3 gap-3">
          <Stat label={results.unit === "visitors" ? "Visiteurs" : "Visites"} value={results.visits} hint="venus d'une annonce" />
          <Stat label="Clics RDV" value={results.rdvClicks} hint="« Prendre rendez-vous »" />
          <Stat label="Appels" value={results.callClicks} hint="clics sur le numéro" />
        </dl>
      )}
    </Card>
  );
}

function Stat({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <div className="rounded-2xl bg-cream-50 p-3">
      <dt className="text-xs text-ink-500">{label}</dt>
      <dd className="text-xl font-semibold text-ink-900">{value.toLocaleString("fr-FR")}</dd>
      <dd className="text-[11px] text-ink-500">{hint}</dd>
    </div>
  );
}
