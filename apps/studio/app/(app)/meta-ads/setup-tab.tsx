"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { ArrowDown, CalendarDays, ChartColumn, ChevronDown, Clock, Crosshair, ExternalLink as ExternalLinkIcon, Info, MousePointerClick, PhoneCall, Route, ShieldCheck, TriangleAlert, Users } from "lucide-react";
import { FieldHint, Input, Label } from "@theralys/ui";
import { Badge, Button, Card, CardHeader, EmptyState, InlineSuccess, KpiTile, LinkButton } from "@/components/ds";
import type { MetaAdsCreativeSet, MetaAdsPlan, MetaAdsVideoPlan } from "@theralys/shared";
import { tagInstallAdvice, type ExternalSiteTracking } from "@/lib/google-ads/external-tracking";
import { ctaLabel, metaLandingUrl, type MetaLanding } from "@/lib/meta-ads/clipboard";
import { META_RESULTS_ACCOUNT, metaPixelFindings } from "@/lib/meta-ads/external-tracking";
import type { AdsResults as PaidResults } from "@theralys/analytics";
import { META_PIXEL_ID_SHAPE, validateMetaTracking, type MetaTrackingForm } from "@/lib/meta-ads/tracking";
import { ExternalResultsCard, ExternalTrackingCard } from "../google-ads/external-site-cards";
import { saveMetaTracking } from "./actions";
import { CopyButton } from "./copy-button";
import { Notice, StepNumber, TEXT_LINK, TEXT_LINK_ON_TINT } from "./parts";
import type { MetaTab } from "./tabs";
import { META_ADS_MANAGER_URL, META_BUSINESS_URL, META_EVENTS_MANAGER_URL, META_PIXEL_HELPER_URL, metaTutorial, type TutorialCopy, type TutorialStep } from "./tutorial";

export function SetupTab({
  creatives,
  videoPlan,
  plan,
  tracking,
  cookieBanner,
  results,
  resultsDays,
  siteDomain,
  landing,
  externalTracking,
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
  /** Adresse du site Harmony, sans protocole : c'est sur lui qu'agit le formulaire du Pixel */
  siteDomain: string;
  /** Site de l'analyse et suffixe de son plan : adresses d'atterrissage des créas */
  landing: MetaLanding;
  /**
   * Les outils s'appuient sur le site du client : le studio ne peut rien y
   * installer. Le formulaire du Pixel et le bloc Résultats, qui n'agissent
   * que sur le site Harmony, laissent la place au relevé de sa dernière
   * lecture et à un pas-à-pas. `null` : site Harmony.
   */
  externalTracking: ExternalSiteTracking | null;
  onSelectTab: (tab: MetaTab) => void;
}) {
  const analysisReady = Boolean(creatives || videoPlan || plan);
  const external = externalTracking !== null;
  const steps = metaTutorial(external);
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          icon={Route}
          title="Diffuser vos annonces sur Facebook et Instagram, pas à pas"
          description={
            <>
              Une étape à la fois, dans l&apos;ordre : comptez une à deux heures la première fois. Les boutons Copier reprennent les textes de vos
              annonces et de votre plan
              {analysisReady ? "." : " — lancez d'abord l'analyse depuis l'onglet Diagnostic pour les obtenir."}
            </>
          }
        />
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Badge tone="section">{steps.length} étapes</Badge>
          <Badge tone="sun" icon={Clock}>
            1 à 2 heures la première fois
          </Badge>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <AccountLink href={META_BUSINESS_URL}>Ouvrir Meta Business Suite</AccountLink>
          <AccountLink href={META_ADS_MANAGER_URL}>Ouvrir le Gestionnaire de publicités</AccountLink>
          <AccountLink href={META_EVENTS_MANAGER_URL}>Ouvrir le Gestionnaire d&apos;événements</AccountLink>
        </div>
        <ol className="mt-5 border-t border-ds-ink-200 pt-3">
          {steps.map((step, index) => (
            <TutorialStepView
              key={step.id}
              step={step}
              index={index}
              last={index === steps.length - 1}
              creatives={creatives}
              videoPlan={videoPlan}
              plan={plan}
              landing={landing}
              externalSite={external}
              onSelectTab={onSelectTab}
            />
          ))}
        </ol>
      </Card>

      {externalTracking ? (
        <>
          <ExternalTrackingCard
            title="Pixel Meta sur votre site"
            intro={
              <>
                Vos outils s&apos;appuient sur votre propre site (<strong className="font-semibold text-ds-ink-900">{externalTracking.address}</strong>), que Harmony
                n&apos;héberge pas : nous ne pouvons rien y installer. Le Pixel s&apos;y pose directement, par vous ou par la personne qui s&apos;en occupe
                (étape 2 du tuto ci-dessus).
              </>
            }
            findings={metaPixelFindings(externalTracking)}
            codeRead={externalTracking.codeRead}
            adviceTitle="Où installer le Pixel"
            advice={tagInstallAdvice(externalTracking.cms, "meta")}
          />
          <ExternalResultsCard
            account={META_RESULTS_ACCOUNT}
            accountLink={{ href: META_ADS_MANAGER_URL, label: "Ouvrir le Gestionnaire de publicités" }}
            measureSnippet={externalTracking.measureSnippet}
          />
        </>
      ) : (
        <>
          <PixelForm initial={tracking} cookieBanner={cookieBanner} siteDomain={siteDomain} />

          <ResultsCard results={results} days={resultsDays} tracked={tracking.metaPixelId !== ""} />
        </>
      )}
    </div>
  );
}

/** Raccourci vers une page du compte Meta du praticien (nouvel onglet). */
function AccountLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <LinkButton href={href} external variant="secondary" size="sm" iconRight={<ExternalLinkIcon size={15} aria-hidden />}>
      {children}
    </LinkButton>
  );
}

function ExternalLink({ href, children, className = TEXT_LINK }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      {children}
      <ExternalLinkIcon size={14} aria-hidden className="ml-1 inline align-[-0.125em]" />
      <span className="sr-only"> (nouvel onglet)</span>
    </a>
  );
}

/**
 * Une étape du pas-à-pas : son numéro sur le fil qui relie les étapes, son
 * titre, ce qu'elle apporte, puis — une fois dépliée — les gestes à faire dans
 * l'ordre, les textes à copier et la remarque à garder en tête.
 */
function TutorialStepView({
  step,
  index,
  last,
  creatives,
  videoPlan,
  plan,
  landing,
  externalSite,
  onSelectTab,
}: {
  step: TutorialStep;
  index: number;
  last: boolean;
  creatives: MetaAdsCreativeSet | null;
  videoPlan: MetaAdsVideoPlan | null;
  plan: MetaAdsPlan | null;
  landing: MetaLanding;
  externalSite: boolean;
  onSelectTab: (tab: MetaTab) => void;
}) {
  return (
    <li className="relative">
      {/* Le fil du guide : il descend d'un numéro au suivant */}
      {last ? null : <span aria-hidden className="absolute top-14 bottom-0 left-[1.3125rem] hidden w-0.5 rounded-full bg-ds-section-line sm:block" />}
      <details className="group/step" open={index === 0}>
        <summary className="flex cursor-pointer list-none items-center gap-3.5 rounded-ds-md py-2.5 pr-1 text-left ds-focus sm:gap-4 [&::-webkit-details-marker]:hidden">
          <StepNumber size="lg">{index + 1}</StepNumber>
          <span className="min-w-0 flex-1">
            <span className="block text-base font-semibold text-ds-ink-900">{step.title}</span>
            <span className="block text-ds-body text-ds-ink-600">{step.summary}</span>
          </span>
          <ChevronDown
            size={20}
            aria-hidden
            className="shrink-0 text-ds-ink-500 transition-transform duration-ds-base ease-ds-out group-open/step:rotate-180 motion-reduce:transition-none"
          />
        </summary>
        <div className="pt-1 pb-5 sm:pl-[3.75rem]">
          <ol className="list-decimal space-y-2 pl-6 text-base text-ds-ink-700 marker:font-semibold marker:text-ds-section-accent">
            {step.items.map((item) => (
              <li key={item} className="pl-1">
                {item}
              </li>
            ))}
          </ol>
          {step.id === "evenements" ? (
            <p className="mt-3 text-ds-body text-ds-ink-700">
              Vérification : <ExternalLink href={META_PIXEL_HELPER_URL}>Meta Pixel Helper (extension Chrome)</ExternalLink>
            </p>
          ) : null}
          {step.copy ? <CopyBlock copy={step.copy} creatives={creatives} videoPlan={videoPlan} plan={plan} landing={landing} externalSite={externalSite} onSelectTab={onSelectTab} /> : null}
          {step.note ? (
            <Notice tone="warning" icon={Info} role="note" className="mt-4">
              {step.note}
            </Notice>
          ) : null}
        </div>
      </details>
    </li>
  );
}

/** Boutons Copier des étapes qui collent des données de l'analyse (nom de campagne, textes des créas, textes des vidéos). */
function CopyBlock({
  copy,
  creatives,
  videoPlan,
  plan,
  landing,
  externalSite,
  onSelectTab,
}: {
  copy: TutorialCopy;
  creatives: MetaAdsCreativeSet | null;
  videoPlan: MetaAdsVideoPlan | null;
  plan: MetaAdsPlan | null;
  landing: MetaLanding;
  /** Les outils s'appuient sur le site du client : pas de formulaire du Pixel, un pas-à-pas à sa place */
  externalSite: boolean;
  onSelectTab: (tab: MetaTab) => void;
}) {
  if (copy === "pixel") {
    return (
      <p className="mt-4 flex items-start gap-2 text-ds-body font-medium text-ds-ink-800">
        <ArrowDown size={18} aria-hidden className="mt-0.5 shrink-0 text-ds-section-accent" />
        {externalSite ? "Le bloc « Pixel Meta sur votre site » se trouve sous ce tuto." : "Le formulaire « Pixel Meta » se trouve sous ce tuto."}
      </p>
    );
  }
  const missing = (copy === "campaign" && !plan) || (copy === "creatives" && !creatives) || (copy === "videos" && !videoPlan);
  if (missing) {
    return (
      <Notice tone="section" icon={Info} className="mt-4">
        Les données à coller viendront de votre analyse :{" "}
        <button type="button" onClick={() => onSelectTab("diagnostic")} className={TEXT_LINK_ON_TINT}>
          lancer l&apos;analyse
        </button>
      </Notice>
    );
  }
  if (copy === "campaign" && plan) {
    return (
      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-ds-md bg-ds-section-tint px-4 py-3 inset-ring inset-ring-ds-section-line/70">
        <CopyButton text={plan.campaign.name} label="Copier le nom de la campagne" />
        <span className="text-ds-meta text-ds-ink-700">
          Événement : {plan.objective.pixelEvent} · {plan.campaign.geo.city} + {plan.campaign.geo.radiusKm} km · {plan.budget.dailyEur} € / jour
        </span>
      </div>
    );
  }
  if (copy === "creatives" && creatives) {
    return (
      <ul className="mt-4 space-y-2" aria-label="Textes par créa">
        {creatives.creatives.map((c) => {
          // Adresse de la page sur le site de l'analyse ; sans adresse connue, ni affichage ni bouton URL
          const url = metaLandingUrl(landing, c.landingPath);
          return (
            <li key={c.id} className="rounded-ds-md bg-ds-section-tint px-4 py-3 inset-ring inset-ring-ds-section-line/70">
              <p className="text-ds-body font-semibold text-ds-ink-900">{c.name}</p>
              <p className="text-ds-meta break-all text-ds-ink-700">
                {ctaLabel(c.cta)}
                {url ? ` → ${url.replace(/^https?:\/\//, "")}` : ""}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <CopyButton text={c.primaryText} label="Texte principal" />
                <CopyButton text={c.headline} label="Titre" />
                <CopyButton text={c.description} label="Description" />
                {url ? <CopyButton text={url} label="URL" /> : null}
              </div>
            </li>
          );
        })}
      </ul>
    );
  }
  if (copy === "videos" && videoPlan) {
    return (
      <ul className="mt-4 space-y-2" aria-label="Textes par vidéo">
        {videoPlan.videos.map((v) => (
          <li key={v.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-ds-md bg-ds-section-tint px-4 py-3 inset-ring inset-ring-ds-section-line/70">
            <div className="min-w-0 flex-[1_1_14rem]">
              <p className="text-ds-body font-semibold text-ds-ink-900">{v.title}</p>
              <p className="text-ds-meta text-ds-ink-700">{ctaLabel(v.cta)}</p>
            </div>
            <CopyButton text={v.caption} label="Texte à coller" />
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
      // Le champ reflète la valeur enregistrée (identifiant extrait d'un extrait de code collé, espaces retirés, vide = retiré)
      setForm({ metaPixelId: result.metaPixelId ?? checked.value.metaPixelId ?? "" });
      setMessage(result.message ?? "Pixel enregistré.");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader
        icon={Crosshair}
        title="Pixel Meta"
        description={
          <>
            Votre site ({siteDomain}) charge le Pixel et envoie l&apos;événement <strong className="font-semibold text-ds-ink-900">Schedule</strong> à chaque
            clic « Prendre rendez-vous » et <strong className="font-semibold text-ds-ink-900">Contact</strong> au clic sur votre numéro de téléphone ou votre
            adresse e-mail — après consentement, si le bandeau cookies est actif. Laissez vide pour retirer le Pixel.
          </>
        }
      />
      {!cookieBanner ? (
        <Notice tone="warning" icon={TriangleAlert} role="alert" className="mt-4">
          Votre bandeau cookies est désactivé : le Pixel et les événements partent dès l&apos;arrivée du visiteur. Réactivez-le dans{" "}
          <Link href="/editor" className={TEXT_LINK_ON_TINT}>
            l&apos;éditeur
          </Link>{" "}
          (Paramètres → Tracking) pour rester conforme.
        </Notice>
      ) : null}
      <form onSubmit={onSubmit} className="mt-5 grid gap-4">
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
            Où le trouver : Gestionnaire d&apos;événements → Sources de données → votre jeu de données → l&apos;identifiant ({META_PIXEL_ID_SHAPE}) sous son
            nom, ou dans l&apos;extrait de code : fbq(&apos;init&apos;, &apos;1234567890123456&apos;). Vous pouvez coller la ligne entière, le nombre est extrait.
          </FieldHint>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <Button type="submit" loading={pending}>
            Enregistrer
          </Button>
          {error ? (
            <p className="flex items-start gap-2 text-ds-body font-medium text-ds-danger-700" role="alert">
              <TriangleAlert size={18} aria-hidden className="mt-0.5 shrink-0" />
              {error}
            </p>
          ) : null}
          {message ? <InlineSuccess>{message}</InlineSuccess> : null}
        </div>
      </form>
      <p className="mt-5 flex items-start gap-2.5 border-t border-ds-ink-200 pt-4 text-ds-meta text-ds-ink-600">
        <ShieldCheck size={16} aria-hidden className="mt-0.5 shrink-0 text-ds-section-accent" />
        <span>
          RGPD : le Pixel et les événements ne partent qu&apos;après le consentement donné dans le bandeau cookies de votre site, si ce bandeau est
          actif ; sans consentement, aucune donnée n&apos;est envoyée à Meta. Jamais chargé dans l&apos;aperçu de l&apos;éditeur. L&apos;identifiant est aussi
          modifiable dans l&apos;éditeur (Paramètres → Tracking).
        </span>
      </p>
    </Card>
  );
}

function ResultsCard({ results, days, tracked }: { results: PaidResults; days: number; tracked: boolean }) {
  const empty = results.visits === 0 && results.rdvClicks === 0 && results.callClicks === 0;
  return (
    <section aria-labelledby="meta-resultats">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 id="meta-resultats" className="font-ds-display text-xl/7 font-bold text-ds-ink-900">
          Résultats
        </h2>
        <Badge tone="neutral" icon={CalendarDays}>
          {days} derniers jours
        </Badge>
      </div>
      <p className="mt-1 max-w-[80ch] text-ds-body text-ds-ink-600">
        Ce que vos annonces Meta apportent réellement sur votre site, mesuré par Harmony grâce au suffixe{" "}
        <code className="rounded-md bg-ds-ink-200 px-1.5 py-0.5 font-mono text-[0.875em] text-ds-ink-900">?src=meta</code> des annonces (sans compte publicitaire à
        connecter).
      </p>
      {empty ? (
        <Card padding="none" className="mt-4">
          <EmptyState as="h3" icon={ChartColumn} title="Pas encore de visite venue de vos annonces">
            Mesure automatique dès la première visite depuis une annonce : l&apos;URL de chaque annonce pointe vers votre site avec le suffixe ?src=meta
            (déjà ajouté aux URL copiées depuis le studio), votre site le reconnaît et compte les visites, les clics « Prendre rendez-vous » et les
            appels qui en découlent. Ce bloc se remplira dès que la campagne diffusera.
            {tracked ? "" : " Renseignez aussi votre Pixel ci-dessus pour que Meta reçoive ces conversions et optimise vos annonces."}
          </EmptyState>
        </Card>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-3 sm:gap-4">
          <KpiTile icon={Users} label={results.unit === "visitors" ? "Visiteurs" : "Visites"} caption="venus d'une annonce Meta" value={results.visits} />
          <KpiTile icon={MousePointerClick} label="Clics RDV" caption="« Prendre rendez-vous »" value={results.rdvClicks} />
          <KpiTile icon={PhoneCall} label="Appels" caption="clics sur le numéro" value={results.callClicks} />
        </div>
      )}
    </section>
  );
}
