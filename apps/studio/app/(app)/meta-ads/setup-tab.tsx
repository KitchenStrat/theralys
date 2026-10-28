"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { Badge, Button, Card, FieldHint, Input, Label, Spinner } from "@theralys/ui";
import type { MetaAdsCreativeSet, MetaAdsPlan, MetaAdsVideoPlan } from "@theralys/shared";
import { ctaLabel, landingUrl } from "@/lib/meta-ads/clipboard";
import type { PaidResults } from "@/lib/meta-ads/results";
import { validateMetaTracking, type MetaTrackingForm } from "@/lib/meta-ads/tracking";
import { saveMetaTracking } from "./actions";
import { CopyButton } from "./copy-button";
import type { MetaTab } from "./tabs";
import { META_ADS_MANAGER_URL, META_BUSINESS_URL, META_EVENTS_MANAGER_URL, META_PIXEL_HELPER_URL, META_TUTORIAL, type TutorialCopy, type TutorialStep } from "./tutorial";

export function SetupTab({
  creatives,
  videoPlan,
  plan,
  tracking,
  cookieBanner,
  results,
  resultsDays,
  siteDomain,
  onSelectTab,
}: {
  creatives: MetaAdsCreativeSet | null;
  videoPlan: MetaAdsVideoPlan | null;
  plan: MetaAdsPlan | null;
  tracking: MetaTrackingForm;
  /** Bandeau cookies du site actif ; sinon le Pixel part sans consentement (avertissement) */
  cookieBanner: boolean;
  results: PaidResults;
  resultsDays: number;
  siteDomain: string;
  onSelectTab: (tab: MetaTab) => void;
}) {
  const analysisReady = Boolean(creatives || videoPlan || plan);
  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h2 className="text-xl font-semibold">Diffuser vos annonces sur Facebook et Instagram, pas à pas</h2>
        <p className="mt-1 text-sm text-ink-500">
          Une étape à la fois, dans l&apos;ordre : comptez une à deux heures la première fois. Les boutons Copier reprennent les textes de vos
          annonces et de votre plan
          {analysisReady ? "." : " — lancez d'abord l'analyse depuis l'onglet Diagnostic pour les obtenir."}
        </p>
        <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <ExternalLink href={META_BUSINESS_URL}>Ouvrir Meta Business Suite</ExternalLink>
          <ExternalLink href={META_ADS_MANAGER_URL}>Ouvrir le Gestionnaire de publicités</ExternalLink>
          <ExternalLink href={META_EVENTS_MANAGER_URL}>Ouvrir le Gestionnaire d&apos;événements</ExternalLink>
        </p>
        <div className="mt-4 divide-y divide-cream-200 border-t border-cream-200">
          {META_TUTORIAL.map((step, index) => (
            <TutorialStepView key={step.id} step={step} index={index} creatives={creatives} videoPlan={videoPlan} plan={plan} siteDomain={siteDomain} onSelectTab={onSelectTab} />
          ))}
        </div>
      </Card>

      <PixelForm initial={tracking} cookieBanner={cookieBanner} siteDomain={siteDomain} />

      <ResultsCard results={results} days={resultsDays} tracked={tracking.metaPixelId !== ""} />
    </div>
  );
}

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="font-medium text-primary-600 hover:underline">
      {children} ↗<span className="sr-only"> (nouvel onglet)</span>
    </a>
  );
}

function TutorialStepView({
  step,
  index,
  creatives,
  videoPlan,
  plan,
  siteDomain,
  onSelectTab,
}: {
  step: TutorialStep;
  index: number;
  creatives: MetaAdsCreativeSet | null;
  videoPlan: MetaAdsVideoPlan | null;
  plan: MetaAdsPlan | null;
  siteDomain: string;
  onSelectTab: (tab: MetaTab) => void;
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
        {step.id === "evenements" ? (
          <p className="mt-3 text-sm text-ink-700">
            Vérification : <ExternalLink href={META_PIXEL_HELPER_URL}>Meta Pixel Helper (extension Chrome)</ExternalLink>
          </p>
        ) : null}
        {step.copy ? <CopyBlock copy={step.copy} creatives={creatives} videoPlan={videoPlan} plan={plan} siteDomain={siteDomain} onSelectTab={onSelectTab} /> : null}
        {step.note ? <p className="mt-3 rounded-xl bg-warning-100 px-4 py-2 text-sm text-ink-900">{step.note}</p> : null}
      </div>
    </details>
  );
}

/** Boutons Copier des étapes qui collent des données de l'analyse (nom de campagne, textes des créas, textes des vidéos). */
function CopyBlock({
  copy,
  creatives,
  videoPlan,
  plan,
  siteDomain,
  onSelectTab,
}: {
  copy: TutorialCopy;
  creatives: MetaAdsCreativeSet | null;
  videoPlan: MetaAdsVideoPlan | null;
  plan: MetaAdsPlan | null;
  siteDomain: string;
  onSelectTab: (tab: MetaTab) => void;
}) {
  if (copy === "pixel") {
    return <p className="mt-3 text-sm text-ink-700">Le formulaire « Pixel Meta » se trouve sous ce tuto.</p>;
  }
  const missing = (copy === "campaign" && !plan) || (copy === "creatives" && !creatives) || (copy === "videos" && !videoPlan);
  if (missing) {
    return (
      <p className="mt-3 text-sm text-ink-500">
        Les données à coller viendront de votre analyse :{" "}
        <button type="button" onClick={() => onSelectTab("diagnostic")} className="font-medium text-primary-600 hover:underline">
          lancer l&apos;analyse →
        </button>
      </p>
    );
  }
  if (copy === "campaign" && plan) {
    return (
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <CopyButton text={plan.campaign.name} label="Copier le nom de la campagne" />
        <span className="text-xs text-ink-500">
          Événement : {plan.objective.pixelEvent} · {plan.campaign.geo.city} + {plan.campaign.geo.radiusKm} km · {plan.budget.dailyEur} € / jour
        </span>
      </div>
    );
  }
  if (copy === "creatives" && creatives) {
    return (
      <ul className="mt-3 space-y-2" aria-label="Textes par créa">
        {creatives.creatives.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium text-ink-900">{c.name}</span>
            <span className="text-xs text-ink-500">
              {ctaLabel(c.cta)} → {landingUrl(siteDomain, c.landingPath).replace(/^https?:\/\//, "")}
            </span>
            <CopyButton text={c.primaryText} label="Texte principal" variant="ghost" />
            <CopyButton text={c.headline} label="Titre" variant="ghost" />
            <CopyButton text={c.description} label="Description" variant="ghost" />
            <CopyButton text={landingUrl(siteDomain, c.landingPath)} label="URL" variant="ghost" />
          </li>
        ))}
      </ul>
    );
  }
  if (copy === "videos" && videoPlan) {
    return (
      <ul className="mt-3 space-y-2" aria-label="Textes par vidéo">
        {videoPlan.videos.map((v) => (
          <li key={v.id} className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium text-ink-900">{v.title}</span>
            <span className="text-xs text-ink-500">{ctaLabel(v.cta)}</span>
            <CopyButton text={v.caption} label="Texte à coller" variant="ghost" />
          </li>
        ))}
      </ul>
    );
  }
  return null;
}

function PixelForm({ initial, cookieBanner, siteDomain }: { initial: MetaTrackingForm; cookieBanner: boolean; siteDomain: string }) {
  const router = useRouter();
  const [form, setForm] = useState<MetaTrackingForm>(initial);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    const checked = validateMetaTracking(form);
    if (!checked.ok) {
      setError(checked.error);
      return;
    }
    startTransition(async () => {
      const result = await saveMetaTracking(form);
      if (result.error) {
        setError(result.error);
        return;
      }
      setMessage(result.message ?? "Pixel enregistré.");
      router.refresh();
    });
  }

  return (
    <Card className="p-6">
      <h2 className="text-xl font-semibold">Pixel Meta</h2>
      <p className="mt-1 text-sm text-ink-500">
        Votre site ({siteDomain}) charge le Pixel et envoie l&apos;événement <strong className="text-ink-700">Schedule</strong> à chaque clic « Prendre
        rendez-vous » et <strong className="text-ink-700">Contact</strong> au clic sur votre numéro de téléphone ou votre adresse e-mail — après
        consentement, si le bandeau cookies est actif. Laissez vide pour retirer le Pixel.
      </p>
      {!cookieBanner ? (
        <p className="mt-4 rounded-xl bg-warning-100 px-4 py-3 text-sm text-ink-900" role="alert">
          Votre bandeau cookies est désactivé : le Pixel et les événements partent dès l&apos;arrivée du visiteur. Réactivez-le dans{" "}
          <Link href="/editor" className="font-medium text-primary-700 underline">
            l&apos;éditeur
          </Link>{" "}
          (Paramètres → Tracking) pour rester conforme.
        </p>
      ) : null}
      <form onSubmit={onSubmit} className="mt-4 grid gap-4">
        <div>
          <Label htmlFor="meta-pixel-id">Identifiant du Pixel (jeu de données)</Label>
          <Input
            id="meta-pixel-id"
            value={form.metaPixelId}
            onChange={(e) => setForm({ metaPixelId: e.target.value })}
            placeholder="1234567890123456"
            autoComplete="off"
            inputMode="numeric"
            spellCheck={false}
            disabled={pending}
            className="max-w-xs font-mono"
          />
          <FieldHint>
            Où le trouver : Gestionnaire d&apos;événements → Sources de données → votre jeu de données → l&apos;identifiant (15 à 16 chiffres) sous son nom, ou
            dans l&apos;extrait de code : fbq(&apos;init&apos;, &apos;1234567890123456&apos;). Vous pouvez coller la ligne entière, le nombre est extrait.
          </FieldHint>
        </div>
        <div className="flex flex-wrap items-center gap-3">
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
        RGPD : le Pixel et les événements ne partent qu&apos;après le consentement donné dans le bandeau cookies de votre site, si ce bandeau est
        actif ; sans consentement, aucune donnée n&apos;est envoyée à Meta. Jamais chargé dans l&apos;aperçu de l&apos;éditeur. L&apos;identifiant est aussi
        modifiable dans l&apos;éditeur (Paramètres → Tracking).
      </p>
    </Card>
  );
}

function ResultsCard({ results, days, tracked }: { results: PaidResults; days: number; tracked: boolean }) {
  const empty = results.visits === 0 && results.rdvClicks === 0 && results.callClicks === 0;
  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold">Résultats</h2>
        <Badge tone="neutral">{days} derniers jours</Badge>
      </div>
      <p className="mt-1 text-sm text-ink-500">
        Ce que vos annonces Meta apportent réellement sur votre site, mesuré par Harmony (sans compte publicitaire à connecter).
      </p>
      {empty ? (
        <p className="mt-4 rounded-xl bg-cream-100 px-4 py-3 text-sm text-ink-700">
          Mesure automatique dès la première visite depuis une annonce : Meta ajoute un paramètre (fbclid) aux liens de vos annonces, votre site
          le reconnaît et compte les visites, les clics « Prendre rendez-vous » et les appels qui en découlent. Rien à paramétrer : ce bloc se
          remplira dès que la campagne diffusera.
          {tracked ? "" : " Renseignez aussi votre Pixel ci-dessus pour que Meta reçoive ces conversions et optimise vos annonces."}
        </p>
      ) : (
        <dl className="mt-4 grid grid-cols-3 gap-3">
          <Stat label={results.unit === "visitors" ? "Visiteurs" : "Visites"} value={results.visits} hint="venus d'une annonce Meta" />
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
