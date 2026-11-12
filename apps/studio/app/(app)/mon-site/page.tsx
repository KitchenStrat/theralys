import type { ReactNode } from "react";
import { Hourglass, Link2 } from "lucide-react";
import { getDb } from "@theralys/db";
import { hostedHostsOf, loadExternalSite } from "@theralys/jobs";
import { externalMeasureTag } from "@theralys/shared";
import { Card, EmptyState, IconBadge, PageHeader, Stagger } from "@/components/ds";
import { requireClient } from "@/lib/auth";
import { getSite, siteUrl } from "@/lib/data";
import { detectedItems, formatDayParis, formatMomentParis, siteAddressLabel } from "@/lib/external-site/format";
import { installGuides, measureState, privacyParagraph } from "@/lib/external-site/measure";
import { ActivationCard } from "./activation-card";
import { ConnectForm } from "./connect-form";
import { HostedSiteCard, type HostedSiteRole } from "./hosted-site-card";
import { currentStep, journeyOf, type Journey } from "./journey";
import { JourneyAside, JourneyOutline } from "./journey-aside";
import { MeasureCard } from "./measure-card";
import { ProfileSection } from "./profile-section";
import { ReadAnnouncer, type ReadScreenState } from "./read-announcer";
import { ReadErrorPanel } from "./read-error-panel";
import { ReadingPanel } from "./reading-panel";
import { SiteSummary } from "./site-summary";
import { CARD_TITLE } from "./styles";

export const metadata = { title: "Mon site" };
export const dynamic = "force-dynamic";
// La lecture du site se poursuit après la réponse (`after`) et le texte collé est traité pendant l'appel : jusqu'à quelques minutes en mode réel
export const maxDuration = 300;

/**
 * « Mon site » : le site sur lequel s'appuient les outils du studio. Un
 * praticien qui a déjà son site le connecte ici — lecture, relecture du
 * profil, activation, code de mesure. Ouvert à toutes les formules et aux
 * sites de démonstration.
 *
 * L'écran suit l'état rendu par `loadExternalSite` : section pas encore
 * activée, aucun site connecté, lecture en cours, première lecture en échec,
 * site lu. Les dates sont mises en forme ici, une fois, au fuseau de Paris.
 *
 * Mise en page : l'en-tête de la section, puis les cartes du parcours dans
 * l'ordre où on le suit (connecter, relire, activer, mesurer). Dès qu'un site
 * est en cours de connexion, la liste « Votre parcours » dit où l'on en est :
 * sous l'en-tête sur un écran étroit, dans une colonne qui reste à l'écran à
 * partir de 1 280 px.
 */
export default async function MonSitePage() {
  const session = await requireClient();
  const site = await getSite(session.siteId);
  const state = await loadExternalSite(getDb(), site);
  const hostedUrl = siteUrl(site);

  if (!state.available) {
    return (
      <Screen state="none">
        <Card padding="none" className="xl:col-span-2" data-testid="mon-site-unavailable">
          <EmptyState icon={Hourglass} as="h2" title="Cette section est en cours d'activation">
            Revenez dans quelques minutes.
          </EmptyState>
        </Card>
      </Screen>
    );
  }

  const view = state.site;
  // Hôtes du site Harmony : refusés comme « site du praticien », ici pour répondre tout de suite, et de nouveau par le service
  const ownHosts = hostedHostsOf(site);

  if (!view) {
    return (
      <Screen state="none">
        <HostedSiteCard url={hostedUrl} role="reference" className="xl:col-span-2" />
        <section aria-labelledby="connect-title" data-testid="connect-card">
          <Card padding="lg" className="h-full">
            <div className="flex items-start gap-3.5">
              <IconBadge icon={Link2} size="md" />
              <div className="min-w-0">
                <h2 id="connect-title" className={CARD_TITLE}>
                  Vous avez déjà un site&nbsp;?
                </h2>
                <p className="mt-1 max-w-[62ch] text-base text-ds-ink-700">
                  Indiquez son adresse&nbsp;: nous lisons ses pages pour comprendre votre activité. Tous vos outils s&apos;appuient ensuite sur lui&nbsp;: vos contenus reprennent ce que vous
                  proposez vraiment, vos liens y mènent et vos statistiques comptent ses visites.
                </p>
              </div>
            </div>
            <div className="mt-6">
              <ConnectForm idPrefix="connect" ownHosts={ownHosts} />
            </div>
          </Card>
        </section>
        <JourneyOutline />
      </Screen>
    );
  }

  const hostedRole: HostedSiteRole = !view.active ? "reference" : view.keepHostedIndexed ? "visible" : "hidden";

  if (view.status === "reading") {
    // Relecture d'un site déjà lu : le parcours reste où il en était (replié, le temps de la lecture) ; première lecture : tout reste à faire
    const journey: Journey =
      view.readAt !== null
        ? { ...journeyOf({ screen: "ready", active: view.active, usable: view.usable, measure: measureState(view.measure) }), open: false, summary: "Nous relisons votre site\u00a0: votre profil reste en place." }
        : journeyOf({ screen: "reading" });
    return (
      <Screen state="reading" journey={journey} rows={2}>
        <ReadingPanel address={siteAddressLabel(view.url)} hasPrevious={view.readAt !== null} />
        <HostedSiteCard url={hostedUrl} role={hostedRole} />
      </Screen>
    );
  }

  if (view.status === "error") {
    return (
      <Screen state="error" journey={journeyOf({ screen: "error" })} rows={2}>
        <ReadErrorPanel url={view.url} error={view.error ?? "internal"} reads={view.reads} ownHosts={ownHosts} />
        <HostedSiteCard url={hostedUrl} role={hostedRole} />
      </Screen>
    );
  }

  const measure = measureState(view.measure);
  const journey = journeyOf({ screen: "ready", active: view.active, usable: view.usable, measure });
  return (
    <Screen state={view.error ? "kept" : "ready"} journey={journey} rows={5}>
      <SiteSummary
        url={view.url}
        source={view.source}
        readAtLabel={view.readAt ? formatMomentParis(view.readAt) : null}
        error={view.error}
        reads={view.reads}
        active={view.active}
        pages={view.pages}
        detected={detectedItems(view.facts)}
      />
      <ProfileSection siteUrl={view.url} source={view.source} profile={view.profile} overrides={view.overrides} />
      <ActivationCard url={view.url} active={view.active} usable={view.usable} gaps={view.gaps} keepHostedIndexed={view.keepHostedIndexed} />
      <MeasureCard
        // Même adresse de base que celle des sites Harmony (`siteUrl`) : c'est là que le code de mesure est servi
        tag={externalMeasureTag(process.env.SITES_BASE_URL ?? "http://localhost:3000", view.measure.key)}
        state={measure}
        seenLabel={view.measure.seenAt ? formatDayParis(view.measure.seenAt) : null}
        guides={installGuides(view.facts.cms)}
        privacyText={privacyParagraph(view.url)}
        next={currentStep(journey) === "mesurer"}
      />
      <HostedSiteCard url={hostedUrl} role={hostedRole} />
    </Screen>
  );
}

/**
 * Cadre commun à tous les états : l'en-tête de la section (le seul `h1`), l'annonce de fin de lecture — rendue à la
 * même place dans tous les états, pour que sa région vivante survive au passage de l'un à l'autre — puis les cartes.
 * `journey` : le parcours à montrer (aucun tant qu'aucun site n'est en cours de connexion) ; `rows` : nombre de cartes
 * que la colonne du parcours longe sur un écran large.
 */
function Screen({ state, journey, rows = 1, children }: { state: ReadScreenState; journey?: Journey; rows?: number; children: ReactNode }) {
  return (
    <Stagger className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_21rem]">
      <div className="min-w-0 xl:col-span-2">
        <PageHeader section="mon-site" />
        <ReadAnnouncer state={state} />
      </div>
      {journey ? <JourneyAside journey={journey} rows={rows} /> : null}
      {children}
    </Stagger>
  );
}
