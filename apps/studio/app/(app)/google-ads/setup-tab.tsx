"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { clsx } from "clsx";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  CalendarCheck,
  CalendarDays,
  ChartColumn,
  ChevronDown,
  Clock,
  ExternalLink,
  ListOrdered,
  PhoneCall,
  Route,
  Save,
  ShieldCheck,
  Target,
  Users,
} from "lucide-react";
import { FieldHint, Input, Label } from "@theralys/ui";
import { GOOGLE_ADS_CONVERSION_KINDS, type GoogleAdsKeywordSet, type GoogleAdsPlan } from "@theralys/shared";
import { Badge, Button, Card, CardHeader, EmptyState, InlineSuccess, KpiTile, LinkButton, ProgressBar } from "@/components/ds";
import { landingDisplay, landingHref, type AnalysisSite } from "@/lib/google-ads/analysis-site";
import { formatAdsKeywordList, formatAdsLines, formatAdsNegativeList } from "@/lib/google-ads/clipboard";
import { ADS_RESULTS_ACCOUNT, googleAdsFindings, tagInstallAdvice, type ExternalSiteTracking } from "@/lib/google-ads/external-tracking";
import type { AdsResults } from "@theralys/analytics";
import { validateAdsTracking, type AdsTrackingForm } from "@/lib/google-ads/tracking";
import { saveAdsTracking } from "./actions";
import { FinePrint, Notice, TEXT_LINK } from "./ads-ui";
import { CopyButton } from "./copy-button";
import { ExternalResultsCard, ExternalTrackingCard } from "./external-site-cards";
import type { AdsTab } from "./tabs";
import { GOOGLE_ADS_URL, TAG_ASSISTANT_URL, adsTutorial, type TutorialCopy, type TutorialStep } from "./tutorial";

/** Ancre du bloc de suivi (formulaire, ou relevé du site du client), visé par l'étape « conversions » du pas-à-pas. */
const TRACKING_ANCHOR = "suivi-des-conversions";

export function SetupTab({
  plan,
  keywords,
  tracking,
  cookieBanner,
  results,
  resultsDays,
  siteDomain,
  analysisSite,
  externalTracking,
  onSelectTab,
}: {
  plan: GoogleAdsPlan | null;
  keywords: GoogleAdsKeywordSet | null;
  tracking: AdsTrackingForm;
  /** Bandeau cookies du site actif ; sinon la balise part sans consentement (avertissement) */
  cookieBanner: boolean;
  results: AdsResults;
  resultsDays: number;
  /** Adresse du site Harmony, sans protocole : c'est sur lui qu'agit le formulaire de suivi */
  siteDomain: string;
  /** Site pour lequel l'analyse a été préparée : adresses d'atterrissage et liens annexes du plan */
  analysisSite: AnalysisSite;
  /**
   * Les outils s'appuient sur le site du client : le studio ne peut rien y
   * installer. Le formulaire et le bloc Résultats, qui n'agissent que sur le
   * site Harmony, laissent la place au relevé de sa dernière lecture et à un
   * pas-à-pas. `null` : site Harmony.
   */
  externalTracking: ExternalSiteTracking | null;
  onSelectTab: (tab: AdsTab) => void;
}) {
  const external = externalTracking !== null;
  return (
    <div className="space-y-6">
      <Guide steps={adsTutorial(external)} plan={plan} keywords={keywords} analysisSite={analysisSite} externalSite={external} onSelectTab={onSelectTab} />

      {/* `scroll-mt` : l'ancre visée depuis le pas-à-pas ne se glisse pas sous la barre du haut (mobile) */}
      <div id={TRACKING_ANCHOR} className="scroll-mt-20 space-y-6">
        {externalTracking ? (
          <>
            <ExternalTrackingCard
              title="Suivi des conversions sur votre site"
              intro={
                <>
                  Vos outils s&apos;appuient sur votre propre site (<strong className="font-semibold text-ds-ink-800">{externalTracking.address}</strong>), que
                  Harmony n&apos;héberge pas : nous ne pouvons rien y installer. La balise Google Ads et le comptage des clics s&apos;y règlent directement, par
                  vous ou par la personne qui s&apos;en occupe (étape 9 du pas-à-pas ci-dessus).
                </>
              }
              findings={googleAdsFindings(externalTracking)}
              codeRead={externalTracking.codeRead}
              adviceTitle="Où installer la balise Google"
              advice={tagInstallAdvice(externalTracking.cms, "google")}
            />
            <ExternalResultsCard account={ADS_RESULTS_ACCOUNT} accountLink={{ href: GOOGLE_ADS_URL, label: "Ouvrir Google Ads" }} measureSnippet={externalTracking.measureSnippet} />
          </>
        ) : (
          <>
            <TrackingForm initial={tracking} cookieBanner={cookieBanner} siteDomain={siteDomain} />
            <Results results={results} days={resultsDays} tracked={tracking.googleAdsId !== ""} />
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Le pas-à-pas : des étapes numérotées, une seule ouverte à la fois, une jauge
 * qui dit où l'on en est et des boutons pour passer d'une étape à l'autre.
 * Chaque étape reste un `<details>` natif (recherche dans la page, clavier) ;
 * l'étape ouverte est tenue par l'état pour alimenter la jauge.
 */
function Guide({
  steps,
  plan,
  keywords,
  analysisSite,
  externalSite,
  onSelectTab,
}: {
  steps: TutorialStep[];
  plan: GoogleAdsPlan | null;
  keywords: GoogleAdsKeywordSet | null;
  analysisSite: AnalysisSite;
  externalSite: boolean;
  onSelectTab: (tab: AdsTab) => void;
}) {
  // `index` : l'étape où l'on en est (la dernière ouverte) ; `open` : elle est dépliée
  const [position, setPosition] = useState({ index: 0, open: true });
  const summaries = useRef<(HTMLElement | null)[]>([]);
  const focusAfterMove = useRef<number | null>(null);
  const total = steps.length;
  const currentStep = steps[position.index];

  // Après « Étape suivante » ou « précédente », le focus suit : le bouton cliqué vient de se replier avec son étape
  useEffect(() => {
    if (focusAfterMove.current === null) return;
    summaries.current[focusAfterMove.current]?.focus();
    focusAfterMove.current = null;
  }, [position]);

  function onToggle(index: number, open: boolean) {
    setPosition((prev) => {
      if (open) return prev.index === index && prev.open ? prev : { index, open: true };
      return prev.index === index && prev.open ? { index, open: false } : prev;
    });
  }

  function goTo(index: number) {
    focusAfterMove.current = index;
    setPosition({ index, open: true });
  }

  return (
    <Card>
      <CardHeader
        icon={Route}
        title="Paramétrer votre compte Google Ads, pas à pas"
        description={
          <>
            Une étape à la fois, dans l&apos;ordre : comptez une à deux heures la première fois. Les boutons Copier reprennent les données de
            votre plan d&apos;action
            {plan ? "." : " — lancez d'abord l'analyse depuis l'onglet Diagnostic pour les obtenir."}
          </>
        }
        action={
          <LinkButton
            href={GOOGLE_ADS_URL}
            external
            // Sur le site du client, pas de formulaire à enregistrer : ouvrir Google Ads est l'action de l'écran
            variant={externalSite ? "primary" : "secondary"}
            iconRight={<ExternalLink size={18} aria-hidden />}
          >
            Ouvrir Google Ads
          </LinkButton>
        }
      />

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Badge tone="sun" icon={Clock}>
          1 à 2 heures la première fois
        </Badge>
        <Badge tone="section" icon={ListOrdered}>
          {total} étapes
        </Badge>
      </div>

      <ProgressBar
        className="mt-5"
        value={position.index + 1}
        max={total}
        label={
          <>
            Étape {position.index + 1} sur {total}
            {currentStep ? <span className="font-normal text-ds-ink-600"> · {currentStep.title}</span> : null}
          </>
        }
        valueText={`Étape ${position.index + 1} sur ${total}`}
        hideValueText
      />

      <ol className="mt-5 space-y-2.5">
        {steps.map((step, index) => {
          const open = position.open && position.index === index;
          return (
            <li key={step.id}>
              <details
                open={open}
                onToggle={(event) => onToggle(index, event.currentTarget.open)}
                className={clsx("group/step rounded-ds-md ring-1", open ? "bg-ds-section-tint ring-ds-section-line" : "bg-white ring-ds-ink-200")}
              >
                <summary
                  ref={(element) => {
                    summaries.current[index] = element;
                  }}
                  className="flex cursor-pointer list-none items-start gap-3.5 rounded-ds-md p-3.5 ds-focus sm:px-4 [&::-webkit-details-marker]:hidden"
                >
                  <span
                    aria-hidden
                    className={clsx(
                      "grid size-9 shrink-0 place-items-center rounded-full text-ds-body font-bold ds-tnum",
                      open ? "bg-ds-section-gradient-deep text-ds-section-on-deep shadow-ds-glow" : "bg-ds-section-tint-2 text-ds-section-ink",
                    )}
                  >
                    {index + 1}
                  </span>
                  {/* `min-h-9` : un titre d'une ligne reste centré sur sa pastille */}
                  <span className="flex min-h-9 min-w-0 flex-1 flex-col justify-center">
                    <span className="block text-base font-semibold text-ds-ink-900">
                      <span className="sr-only">Étape {index + 1} : </span>
                      {step.title}
                    </span>
                    {/* Sur téléphone, l'accroche d'une étape repliée est masquée : la liste des onze étapes tient en deux écrans */}
                    <span className={clsx("block text-ds-body text-ds-ink-600", open ? "" : "max-sm:hidden")}>{step.summary}</span>
                  </span>
                  <ChevronDown
                    size={20}
                    aria-hidden
                    className="mt-2 shrink-0 text-ds-ink-600 transition-transform duration-ds-base ease-ds-out group-open/step:rotate-180 motion-reduce:transition-none"
                  />
                </summary>
                <div className="px-3.5 pb-4 sm:pr-5 sm:pl-[4.125rem]">
                  <ol className="list-decimal space-y-2 pl-5 text-base text-ds-ink-800 marker:font-semibold marker:text-ds-section-accent">
                    {step.items.map((item) => (
                      <li key={item} className="pl-1">
                        {item}
                      </li>
                    ))}
                  </ol>
                  {step.copy ? (
                    <CopyBlock copy={step.copy} plan={plan} keywords={keywords} analysisSite={analysisSite} externalSite={externalSite} onSelectTab={onSelectTab} />
                  ) : null}
                  {step.note ? (
                    <Notice tone="warning" className="mt-4">
                      {step.note}
                    </Notice>
                  ) : null}
                  <div className="mt-5 flex flex-wrap items-center gap-2">
                    {index > 0 ? (
                      <Button type="button" variant="quiet" size="sm" icon={<ArrowLeft size={16} aria-hidden />} onClick={() => goTo(index - 1)}>
                        Étape précédente
                      </Button>
                    ) : null}
                    {index < total - 1 ? (
                      <Button type="button" variant="secondary" size="sm" iconRight={<ArrowRight size={16} aria-hidden />} onClick={() => goTo(index + 1)}>
                        Étape suivante
                      </Button>
                    ) : null}
                  </div>
                </div>
              </details>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

/** Boutons Copier des étapes qui collent des données du plan (ou du jeu de mots-clés à défaut de plan). */
function CopyBlock({
  copy,
  plan,
  keywords,
  analysisSite,
  externalSite,
  onSelectTab,
}: {
  copy: TutorialCopy;
  plan: GoogleAdsPlan | null;
  keywords: GoogleAdsKeywordSet | null;
  analysisSite: AnalysisSite;
  /** Les outils s'appuient sur le site du client : pas de formulaire de suivi, un pas-à-pas à sa place */
  externalSite: boolean;
  onSelectTab: (tab: AdsTab) => void;
}) {
  // Zone « à copier » d'une étape : fond blanc, pour ressortir sur la teinte de l'étape ouverte
  const box = "mt-4 rounded-ds-md bg-white p-3.5 ring-1 ring-ds-section-line/70";
  if (copy === "tracking") {
    return (
      <p className={clsx(box, "text-ds-body text-ds-ink-700")}>
        {externalSite ? "Le bloc « Suivi des conversions sur votre site » se trouve sous ce pas-à-pas" : "Le formulaire « Suivi des conversions » se trouve sous ce pas-à-pas"}{" "}
        <a href={`#${TRACKING_ANCHOR}`} className={clsx(TEXT_LINK, "inline-flex items-center gap-1 whitespace-nowrap")}>
          y aller
          <ArrowDown size={14} aria-hidden />
        </a>
        . Vérification :{" "}
        <a href={TAG_ASSISTANT_URL} target="_blank" rel="noopener noreferrer" className={clsx(TEXT_LINK, "inline-flex items-center gap-1 whitespace-nowrap")}>
          Tag Assistant
          <ExternalLink size={14} aria-hidden />
          <span className="sr-only"> (nouvel onglet)</span>
        </a>
      </p>
    );
  }
  if (!plan && !keywords) {
    return (
      <div className={clsx(box, "flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5")}>
        <p className="min-w-0 flex-[1_1_14rem] text-ds-body text-ds-ink-700">Les données à coller viendront de votre analyse : lancez-la depuis l&apos;onglet Diagnostic.</p>
        <Button type="button" variant="secondary" size="sm" iconRight={<ArrowRight size={16} aria-hidden />} onClick={() => onSelectTab("diagnostic")}>
          Aller au diagnostic
        </Button>
      </div>
    );
  }
  if (copy === "negatives") {
    const negatives = plan?.negatives ?? keywords?.negatives ?? [];
    return (
      <div className={clsx(box, "flex flex-wrap items-center gap-2")}>
        <CopyButton text={formatAdsNegativeList(negatives)} label={`Copier les mots-clés négatifs (${negatives.length})`} />
      </div>
    );
  }
  if (copy === "keywords") {
    if (!plan) {
      const core = (keywords?.keywords ?? []).filter((k) => k.core);
      return (
        <div className={clsx(box, "flex flex-wrap items-center gap-2")}>
          <CopyButton text={formatAdsKeywordList(core.map((k) => ({ text: k.keyword, match: k.match })))} label={`Copier le cœur de cible (${core.length})`} />
        </div>
      );
    }
    return (
      <ul className={clsx(box, "divide-y divide-ds-ink-200 py-1!")} aria-label="Mots-clés par groupe">
        {plan.adGroups.map((g, i) => {
          // Chemin enregistré ramené à la page actuelle du site de l'analyse ; rien quand son adresse n'est plus connue
          const address = landingDisplay(analysisSite, g.landingPath);
          return (
            <li key={`${i}-${g.name}`} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 py-2.5">
              <span className="min-w-0 flex-[1_1_12rem]">
                <span className="block text-ds-body font-semibold text-ds-ink-900">{g.name}</span>
                {address ? <span className="block text-ds-meta break-all text-ds-ink-600">{address}</span> : null}
              </span>
              <CopyButton text={formatAdsKeywordList(g.keywords)} label={`Copier (${g.keywords.length})`} />
            </li>
          );
        })}
      </ul>
    );
  }
  if (copy === "ads") {
    if (!plan) return <p className={clsx(box, "text-ds-body text-ds-ink-700")}>Les annonces sont rédigées avec le plan d&apos;action.</p>;
    return (
      <ul className={clsx(box, "divide-y divide-ds-ink-200 py-1!")} aria-label="Annonces par groupe">
        {plan.adGroups.map((g, i) => {
          const ad = g.ads[0];
          if (!ad) return null;
          return (
            <li key={`${i}-${g.name}`} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 py-2.5">
              <span className="min-w-0 flex-[1_1_10rem] text-ds-body font-semibold text-ds-ink-900">{g.name}</span>
              <span className="flex flex-wrap items-center gap-2">
                <CopyButton text={formatAdsLines(ad.headlines)} label={`Titres (${ad.headlines.length})`} />
                <CopyButton text={formatAdsLines(ad.descriptions)} label={`Descriptions (${ad.descriptions.length})`} />
              </span>
            </li>
          );
        })}
      </ul>
    );
  }
  // extensions
  if (!plan) return null;
  // Un lien annexe sans adresse connue (analyse d'un site qui n'est plus la référence) n'est pas proposé à la copie
  const sitelinks = plan.extensions.sitelinks.flatMap((s) => {
    const href = landingHref(analysisSite, s.path);
    return href ? [`${s.title} — ${href}`] : [];
  });
  return (
    <div className={clsx(box, "flex flex-wrap items-center gap-2")}>
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
    <Card>
      <CardHeader
        icon={Target}
        title="Suivi des conversions"
        description={
          <>
            Votre site (<span className="break-all">{siteDomain}</span>) charge la balise Google Ads et envoie une conversion à chaque clic « Prendre
            rendez-vous », sur votre numéro de téléphone et sur votre adresse e-mail — après consentement, si le bandeau cookies est actif. Laissez vide
            pour désactiver.
          </>
        }
      />
      {!cookieBanner ? (
        <Notice tone="warning" role="alert" className="mt-4">
          Votre bandeau cookies est désactivé : la balise et les conversions partent dès l&apos;arrivée du visiteur. Réactivez-le dans{" "}
          <Link href="/editor" className={TEXT_LINK}>
            l&apos;éditeur
          </Link>{" "}
          (Paramètres → Tracking) pour rester conforme.
        </Notice>
      ) : null}
      <form onSubmit={onSubmit} className="mt-5 grid gap-x-4 gap-y-5 md:grid-cols-2">
        <div className="md:col-span-2">
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
        <div className="md:col-span-2">
          <FieldHint>
            Libellé = la partie après « AW-…/ » dans l&apos;extrait d&apos;événement de chaque action (vous pouvez coller la valeur complète, l&apos;identifiant
            est retiré). Où trouver : Google Ads → Objectifs → Conversions → l&apos;action → Configuration de la balise → Installer la balise
            vous-même.
          </FieldHint>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3 md:col-span-2">
          <Button type="submit" loading={pending} icon={<Save size={18} aria-hidden />}>
            Enregistrer
          </Button>
          {error ? (
            <Notice tone="danger" role="alert" className="min-w-0 flex-[1_1_16rem]">
              {error}
            </Notice>
          ) : null}
          {message ? <InlineSuccess className="min-w-0 flex-[1_1_16rem]">{message}</InlineSuccess> : null}
        </div>
      </form>
      <FinePrint className="mt-5 flex items-start gap-2.5 border-t border-ds-ink-200 pt-4">
        <ShieldCheck size={16} aria-hidden className="mt-0.5 shrink-0 text-ds-section-accent" />
        <span>
          RGPD : la balise Google Ads et les conversions ne partent qu&apos;après le consentement donné dans le bandeau cookies de votre site, si ce
          bandeau est actif ; sans consentement, aucune donnée n&apos;est envoyée à Google. Jamais chargée dans l&apos;aperçu de l&apos;éditeur.
        </span>
      </FinePrint>
    </Card>
  );
}

/** Ce que les annonces apportent sur le site Harmony : trois chiffres, ou l'explication de ce qui s'affichera. */
function Results({ results, days, tracked }: { results: AdsResults; days: number; tracked: boolean }) {
  const empty = results.visits === 0 && results.rdvClicks === 0 && results.callClicks === 0;
  return (
    <section aria-labelledby="ads-results-title">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-1">
        <h2 id="ads-results-title" className="font-ds-display text-lg/7 font-bold text-ds-ink-900 sm:text-xl/7">
          Résultats
        </h2>
        <Badge tone="section" icon={CalendarDays}>
          {days} derniers jours
        </Badge>
      </div>
      <p className="mt-1 px-1 text-ds-body text-ds-ink-600">
        Ce que vos annonces apportent réellement sur votre site, mesuré par Harmony (sans compte Google Ads à connecter).
      </p>
      {empty ? (
        <Card padding="none" className="mt-4">
          <EmptyState icon={ChartColumn} title="Pas encore de visite venue d'une annonce">
            Mesure automatique dès la première visite depuis une annonce : Google ajoute un paramètre (gclid) aux liens de vos annonces, votre
            site le reconnaît et compte les visites, les clics « Prendre rendez-vous » et les appels qui en découlent.
            {tracked ? "" : " Renseignez aussi votre identifiant AW-… ci-dessus pour que Google Ads reçoive ces conversions et optimise vos annonces."}
          </EmptyState>
        </Card>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3">
          <KpiTile
            className="max-md:col-span-2"
            icon={Users}
            label={results.unit === "visitors" ? "Visiteurs des annonces" : "Visites des annonces"}
            caption="venus d'une annonce"
            value={results.visits}
          />
          <KpiTile icon={CalendarCheck} label="Clics rendez-vous" caption="« Prendre rendez-vous »" value={results.rdvClicks} />
          <KpiTile icon={PhoneCall} label="Appels" caption="clics sur le numéro" value={results.callClicks} />
        </div>
      )}
    </section>
  );
}
