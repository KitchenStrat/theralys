import type { ReactNode } from "react";
import { getDb } from "@theralys/db";
import { hostedHostsOf, loadExternalSite } from "@theralys/jobs";
import { externalMeasureTag } from "@theralys/shared";
import { Card } from "@theralys/ui";
import { requireClient } from "@/lib/auth";
import { getSite, siteUrl } from "@/lib/data";
import { detectedItems, formatDayParis, formatMomentParis, siteAddressLabel } from "@/lib/external-site/format";
import { installGuides, measureState, privacyParagraph } from "@/lib/external-site/measure";
import { ActivationCard } from "./activation-card";
import { ConnectForm } from "./connect-form";
import { HostedSiteCard, type HostedSiteRole } from "./hosted-site-card";
import { MeasureCard } from "./measure-card";
import { ProfileSection } from "./profile-section";
import { ReadErrorPanel } from "./read-error-panel";
import { ReadingPanel } from "./reading-panel";
import { SiteSummary } from "./site-summary";

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
 */
export default async function MonSitePage() {
  const session = await requireClient();
  const site = await getSite(session.siteId);
  const state = await loadExternalSite(getDb(), site);
  const hostedUrl = siteUrl(site);

  if (!state.available) {
    return (
      <Screen>
        <Card className="p-10 text-center" data-testid="mon-site-unavailable">
          <p className="text-base font-medium text-ink-900">Cette section est en cours d&apos;activation</p>
          <p className="mt-1 text-sm text-ink-700">Revenez dans quelques minutes.</p>
        </Card>
      </Screen>
    );
  }

  const view = state.site;
  // Hôtes du site Harmony : refusés comme « site du praticien », ici pour répondre tout de suite, et de nouveau par le service
  const ownHosts = hostedHostsOf(site);

  if (!view) {
    return (
      <Screen>
        <HostedSiteCard url={hostedUrl} role="reference" />
        <section aria-labelledby="connect-title" data-testid="connect-card">
          <Card className="p-6 md:p-7">
            <h2 id="connect-title" className="text-xl font-semibold">
              Vous avez déjà un site ?
            </h2>
            <p className="mt-1 max-w-2xl text-base text-ink-700">
              Indiquez son adresse : nous lisons ses pages pour comprendre votre activité. Tous vos outils s&apos;appuient ensuite sur lui : vos contenus reprennent ce que vous
              proposez vraiment, vos liens y mènent et vos statistiques comptent ses visites.
            </p>
            <div className="mt-5">
              <ConnectForm idPrefix="connect" ownHosts={ownHosts} />
            </div>
          </Card>
        </section>
      </Screen>
    );
  }

  const hostedRole: HostedSiteRole = !view.active ? "reference" : view.keepHostedIndexed ? "visible" : "hidden";

  if (view.status === "reading") {
    return (
      <Screen>
        <ReadingPanel address={siteAddressLabel(view.url)} hasPrevious={view.readAt !== null} />
        <HostedSiteCard url={hostedUrl} role={hostedRole} />
      </Screen>
    );
  }

  if (view.status === "error") {
    return (
      <Screen>
        <ReadErrorPanel url={view.url} error={view.error ?? "internal"} reads={view.reads} ownHosts={ownHosts} />
        <HostedSiteCard url={hostedUrl} role={hostedRole} />
      </Screen>
    );
  }

  const measure = measureState(view.measure);
  return (
    <Screen>
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
      />
      <HostedSiteCard url={hostedUrl} role={hostedRole} />
    </Screen>
  );
}

function Screen({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="text-4xl font-bold">Mon site</h1>
        <p className="mt-1 text-base text-ink-700">Le site sur lequel s&apos;appuient vos outils : contenus, liens et statistiques.</p>
      </header>
      {children}
    </div>
  );
}
