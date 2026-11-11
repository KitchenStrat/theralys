import Link from "next/link";
import { and, count, eq, lt } from "drizzle-orm";
import { Badge, Card } from "@theralys/ui";
import { editorialCalendarEntries, getDb, PLANS, prospects, sites, type OfferedPlanId } from "@theralys/db";
import { resolveAiMode } from "@theralys/ai";
import { API_PROVIDERS, isApiProviderId, resolveApiUsagePeriod } from "@theralys/shared";
import { requireAdmin } from "@/lib/auth";
import { computeMrr, type SubscriptionLike } from "@/lib/metrics";
import {
  clientSitesCost,
  formatCount,
  formatDelta,
  formatEur,
  formatPercent,
  formatPrice,
  formatTime,
  formatTokens,
  formatUnits,
  formatUsdAsEur,
  loadApiUsageReport,
  type ApiUsageUnavailable,
  periodRevenueShare,
  usageHref,
  usdToEur,
  type ApiUsageReport,
  type ProviderSummary,
  type UsageSearchParams,
} from "@/lib/api-usage";
import { PeriodNav } from "./_usage/period-nav";
import { RefreshControl } from "./_usage/refresh-control";
import {
  Ago,
  BalancesCard,
  callsLabel,
  CardHeader,
  DailyChartCard,
  EmptyState,
  Errors,
  isPartialPeriod,
  LINK,
  MeasureFootnote,
  measureNote,
  Meter,
  plural,
  ProviderBadges,
  SeeAll,
  Share,
  StatCard,
  TBODY_ROW,
  TD,
  TH,
  THEAD_ROW,
  UsageUnavailableBanner,
} from "./_usage/ui";

export const metadata = { title: "Vue d'ensemble" };
export const dynamic = "force-dynamic";

/** Sites et fonctionnalités listés sur la vue d'ensemble ; le reste est sur « API & coûts ». */
const TOP_ROWS = 10;

/**
 * Vue d'ensemble agence : revenu, parc de sites, activité et coûts réels de
 * toutes les API sur la période choisie (registre `api_usage`), marge brute,
 * santé des jobs et des fournisseurs.
 */
export default async function OverviewPage({ searchParams }: { searchParams: Promise<UsageSearchParams> }) {
  await requireAdmin();
  const params = await searchParams;
  const db = getDb();
  const now = new Date();
  const todayIso = now.toISOString().slice(0, 10);
  const period = resolveApiUsagePeriod(typeof params.periode === "string" ? params.periode : null, now);

  const [subs, siteCounts, erroredSites, lateEntries, report] = await Promise.all([
    db.query.subscriptions.findMany(),
    db
      .select({ type: sites.type, status: sites.status, value: count() })
      .from(sites)
      .groupBy(sites.type, sites.status),
    db
      .select({ site: sites, prospect: prospects })
      .from(sites)
      .leftJoin(prospects, eq(sites.prospectId, prospects.id))
      .where(eq(sites.status, "error")),
    db
      .select({ value: count() })
      .from(editorialCalendarEntries)
      .where(and(eq(editorialCalendarEntries.status, "planned"), lt(editorialCalendarEntries.scheduledFor, todayIso))),
    // L'accueil de l'admin reste lisible même si le registre des appels ne l'est pas
    loadApiUsageReport({ period, now }).catch((err): ApiUsageUnavailable => {
      console.error("[admin] registre des appels API illisible", err);
      return { available: false, period, reason: "error" };
    }),
  ]);

  const mrr = computeMrr(subs as SubscriptionLike[]);
  const demoCount = siteCounts.filter((r) => r.type === "demo").reduce((sum, r) => sum + r.value, 0);
  const clientCount = siteCounts.filter((r) => r.type === "client" && r.status !== "archived").reduce((sum, r) => sum + r.value, 0);
  const archivedCount = siteCounts.filter((r) => r.type === "client" && r.status === "archived").reduce((sum, r) => sum + r.value, 0);
  const lateCount = lateEntries[0]?.value ?? 0;
  const usage = report.available ? report : null;
  const tokenExpired = usage?.balances.metaToken.status === "expired";
  const problemCount = erroredSites.length + lateCount + (tokenExpired ? 1 : 0);
  const aiMode = resolveAiMode();
  const imageMode = process.env.IMAGE_PROVIDER !== "mock" && process.env.FAL_API_KEY ? "fal" : "mock";

  // Marge brute : revenu mensuel récurrent moins le coût des API du mois civil en cours
  const monthCostEur = usage ? usdToEur(usage.monthCostUsd) : null;
  const grossMarginEur = monthCostEur === null ? null : mrr.total - monthCostEur;
  const clientCost = usage ? clientSitesCost(usage.sites, clientCount) : null;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <h1 className="text-2xl font-bold">Vue d&apos;ensemble</h1>
        <RefreshControl updatedAt={formatTime(now)} />
      </div>
      <p className="mt-1 text-sm text-ink-500">Revenu, activité et coûts réels de toutes les API.{usage ? ` ${measureNote(usage)}` : ""}</p>

      <div className="mt-4">
        <PeriodNav path="/" current={period.id} />
        {usage && isPartialPeriod(usage) ? (
          <p className="mt-2 text-xs text-ink-500">
            <span aria-hidden>ⓘ </span>La période commence avant le début de la mesure réelle : les chiffres antérieurs sont partiels.
          </p>
        ) : null}
      </div>

      {!report.available ? <UsageUnavailableBanner reason={report.reason} /> : null}

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard
          label="MRR"
          value={`${mrr.total} €`}
          detail={`${mrr.payingCount} abonnement${mrr.payingCount > 1 ? "s" : ""} payant${mrr.payingCount > 1 ? "s" : ""}${mrr.pastDueCount > 0 ? ` · ${mrr.pastDueCount} impayé${mrr.pastDueCount > 1 ? "s" : ""}` : ""}`}
        />
        <StatCard
          label="Sites clients"
          value={String(clientCount)}
          detail={`${demoCount} ${plural(demoCount, "démo")} ${plural(demoCount, "active")}${archivedCount > 0 ? ` · ${archivedCount} ${plural(archivedCount, "archivé")}` : ""}`}
        />
        <StatCard
          label="Coût API"
          value={usage ? formatUsdAsEur(usage.totals.costUsd) : "—"}
          aside={usage && usage.costDelta !== null ? <span title="Variation par rapport à la période précédente">{formatDelta(usage.costDelta)}</span> : null}
          detail={
            usage
              ? `${callsLabel(usage.totals.calls)} · ${period.label.toLowerCase()}${usage.costDelta !== null ? ", vs période précédente" : ""}`
              : "registre des appels non activé"
          }
        />
        <StatCard
          label="Marge brute"
          value={grossMarginEur === null ? "—" : formatEur(grossMarginEur)}
          detail={
            grossMarginEur === null
              ? "coût des API inconnu"
              : mrr.total > 0
                ? `${formatPercent(grossMarginEur / mrr.total)} du MRR · après ${formatEur(monthCostEur)} d'API ce mois-ci`
                : `aucun revenu · ${formatEur(monthCostEur)} d'API ce mois-ci`
          }
        />
        <StatCard
          className="col-span-2 lg:col-span-1"
          label="Coût par site client"
          value={clientCost?.avgCostUsd === null || !clientCost ? "—" : formatUsdAsEur(clientCost.avgCostUsd)}
          detail={
            !clientCost
              ? "coût des API inconnu"
              : clientCount > 0
                ? `en moyenne · ${formatUsdAsEur(clientCost.costUsd)} pour ${clientCount} ${plural(clientCount, "site")}, ${period.label.toLowerCase()}`
                : "aucun site client pour l'instant"
          }
        />
      </div>

      {usage ? (
        <>
          <DailyChartCard className="mt-6" daily={usage.daily} calls={usage.totals.calls} />
          <ProvidersCard report={usage} now={now} />

          <div className="mt-6 grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
            <FeaturesCard report={usage} />
            <SitesCard report={usage} />
          </div>
        </>
      ) : null}

      <div className="mt-6 grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
        <div className={`min-w-0 space-y-6 ${usage ? "lg:col-span-2" : "lg:col-span-3"}`}>
          <Card className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">Santé</h2>
              <div className="flex flex-wrap gap-2">
                {problemCount === 0 ? (
                  <Badge tone="success">Tout est en ordre</Badge>
                ) : (
                  <Badge tone="danger">
                    {problemCount} problème{problemCount > 1 ? "s" : ""}
                  </Badge>
                )}
                {usage && usage.totals.calls > 0 ? (
                  <Badge tone={usage.totals.errorRate >= 0.05 ? "danger" : usage.totals.errors > 0 ? "neutral" : "success"}>
                    API : {formatPercent(usage.totals.errorRate)} d&apos;erreurs
                  </Badge>
                ) : null}
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-6 md:grid-cols-2">
              <section aria-labelledby="sante-jobs" className="min-w-0">
                <h3 id="sante-jobs" className="text-xs font-medium uppercase tracking-wide text-ink-500">
                  Jobs IA
                </h3>
                <div className="mt-2 flex flex-wrap gap-2">
                  {aiMode === "anthropic" ? (
                    <Badge tone="success">Rédaction : API Anthropic ({process.env.ANTHROPIC_MODEL ?? "claude-opus-5"})</Badge>
                  ) : (
                    <Badge tone="warning">Rédaction : mode mock — aucune clé Anthropic active</Badge>
                  )}
                  {imageMode === "fal" ? <Badge tone="success">Images : fal.ai (FLUX.1 schnell)</Badge> : <Badge tone="neutral">Images : mock (SVG)</Badge>}
                </div>

                {erroredSites.length > 0 ? (
                  <ul className="mt-4 space-y-2">
                    {erroredSites.map(({ site, prospect }) => (
                      <li key={site.id} className="flex items-center justify-between gap-3 text-sm">
                        <span className="min-w-0">
                          <span className="font-medium">{prospect ? `${prospect.firstName} ${prospect.lastName}` : site.name}</span>
                          <span className="block truncate text-xs text-danger-500">{site.generationError ?? "Génération en échec"}</span>
                        </span>
                        <Link href={`/demos/${site.id}/edit`} className={`shrink-0 text-xs ${LINK}`}>
                          Relancer →
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : null}

                {lateCount > 0 ? (
                  <p className="mt-3 text-sm text-ink-700">
                    <span aria-hidden>⚠ </span>
                    {lateCount} article{lateCount > 1 ? "s" : ""} du calendrier éditorial en retard de rédaction — vérifier le cron des jobs.
                  </p>
                ) : null}

                {erroredSites.length === 0 && lateCount === 0 ? (
                  <p className="mt-3 text-sm text-ink-500">Aucune génération en échec, aucun article en retard. Le cron tourne toutes les heures.</p>
                ) : null}
              </section>

              <section aria-labelledby="sante-api" className="min-w-0">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 id="sante-api" className="text-xs font-medium uppercase tracking-wide text-ink-500">
                    Dernières erreurs des API
                  </h3>
                  {usage && usage.totals.errors > 0 ? (
                    <span className="text-xs">
                      <SeeAll href={usageHref("/couts", { period: period.id, filters: { status: "error" }, hash: "journal" })}>Journal des erreurs</SeeAll>
                    </span>
                  ) : null}
                </div>
                {!usage ? (
                  <p className="mt-2 text-sm text-ink-500">Registre des appels non activé.</p>
                ) : usage.recentErrors.length === 0 ? (
                  <p className="mt-2 text-sm text-ink-500">
                    {usage.totals.calls > 0 ? `Aucune erreur sur ${callsLabel(usage.totals.calls)}.` : "Aucun appel sur la période."}
                  </p>
                ) : (
                  <>
                    <p className="mt-2 text-xs text-ink-500">
                      {formatCount(usage.totals.errors)} {plural(usage.totals.errors, "erreur")} sur {callsLabel(usage.totals.calls)} ({formatPercent(usage.totals.errorRate)}) ·{" "}
                      {period.label.toLowerCase()}
                    </p>
                    <ul className="mt-2 divide-y divide-cream-200">
                      {usage.recentErrors.map((entry) => (
                        <li key={entry.id} className="py-2 text-sm">
                          <p className="flex items-baseline justify-between gap-3">
                            <span className="min-w-0 truncate">
                              <span className="font-medium text-ink-900">{isApiProviderId(entry.provider) ? API_PROVIDERS[entry.provider].label : entry.provider}</span>
                              <span className="text-xs text-ink-500"> · {entry.operation}</span>
                            </span>
                            <span className="shrink-0 text-xs text-ink-500">
                              <Ago date={entry.createdAt} now={now} />
                            </span>
                          </p>
                          <p className="mt-0.5 line-clamp-2 break-words text-xs text-danger-500" title={entry.error ?? undefined}>
                            {entry.error ?? "Erreur sans message"}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </section>
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="font-semibold">MRR par formule</h2>
            <ul className="mt-4 space-y-2">
              {(Object.keys(mrr.byPlan) as OfferedPlanId[]).map((plan) => {
                const value = mrr.byPlan[plan];
                return (
                  <li key={plan} className="flex items-center gap-3 text-sm">
                    <span className="w-16 font-medium">{PLANS[plan].label}</span>
                    <Meter ratio={mrr.total > 0 ? value / mrr.total : 0} className="flex-1" />
                    <span className="w-16 text-right tabular-nums text-ink-700">{value} €</span>
                  </li>
                );
              })}
            </ul>
            <p className="mt-4 border-t border-cream-200 pt-3 text-xs text-ink-500">Actifs + impayés, au tarif de la période souscrite (annuel ou mensuel).</p>
          </Card>
        </div>
        {usage ? <BalancesCard report={usage} className="min-w-0" /> : null}
      </div>

      <MeasureFootnote />
    </div>
  );
}

/** Volume d'un fournisseur : tokens pour Anthropic, unités du fournisseur sinon. */
function ProviderVolume({ provider }: { provider: ProviderSummary }) {
  if (provider.id === "anthropic" && provider.inputTokens + provider.outputTokens > 0) {
    return (
      <>
        <span className="whitespace-nowrap">{formatTokens(provider.inputTokens, provider.outputTokens)}</span>
        <span className="block text-xs text-ink-500">≈ {formatUsdAsEur(provider.calls > 0 ? provider.costUsd / provider.calls : 0)} par appel</span>
      </>
    );
  }
  // « appels » : le volume répéterait la colonne voisine
  if (provider.units > 0 && provider.unit !== "appels") return <span className="whitespace-nowrap">{formatUnits(provider.units, provider.unit)}</span>;
  return <span className="text-ink-500">—</span>;
}

/** « Par fournisseur » : toutes les API, même sans appel sur la période. */
function ProvidersCard({ report, now }: { report: ApiUsageReport; now: Date }) {
  const active = report.providers.filter((provider) => provider.calls > 0).length;
  return (
    <Card className="mt-6">
      <div className="px-5 pt-5">
        <CardHeader
          title="Par fournisseur"
          hint={`${report.providers.length} API suivies · ${active} ${plural(active, "active")} sur la période`}
          action={<SeeAll href={usageHref("/couts", { period: report.period.id })}>Détail et journal</SeeAll>}
        />
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[960px] text-sm">
          <thead>
            <tr className={THEAD_ROW}>
              <th scope="col" className={`${TH} w-[34%]`}>
                Fournisseur
              </th>
              <th scope="col" className={`${TH} text-right`}>
                Appels
              </th>
              <th scope="col" className={TH}>
                Volume
              </th>
              <th scope="col" className={`${TH} text-right`}>
                Coût
              </th>
              <th scope="col" className={TH}>
                Part du coût
              </th>
              <th scope="col" className={TH}>
                Erreurs
              </th>
              <th scope="col" className={TH}>
                Dernier appel
              </th>
            </tr>
          </thead>
          <tbody>
            {report.providers.map((provider) => (
              <tr key={provider.id} className={TBODY_ROW}>
                <th scope="row" className={`${TD} text-left font-normal`}>
                  {/* Largeur minimale portée par le contenu : la colonne ne s'écrase pas quand le tableau défile */}
                  <div className="min-w-64">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <Link href={usageHref("/couts", { period: report.period.id, filters: { provider: provider.id } })} className={`font-medium ${LINK}`}>
                        {provider.label}
                      </Link>
                      <ProviderBadges provider={provider} />
                    </span>
                    <span className="mt-0.5 block text-xs text-ink-500">{provider.role}</span>
                  </div>
                </th>
                <td className={`${TD} text-right tabular-nums`}>{provider.calls > 0 ? formatCount(provider.calls) : <span className="text-ink-500">0</span>}</td>
                <td className={`${TD} text-ink-700`}>
                  <ProviderVolume provider={provider} />
                </td>
                <td className={`${TD} text-right tabular-nums`}>
                  {provider.calls === 0 ? (
                    <span className="text-ink-500">—</span>
                  ) : provider.free && provider.costUsd === 0 ? (
                    <span className="text-ink-500">gratuit</span>
                  ) : (
                    <span className="font-medium text-ink-900">{formatUsdAsEur(provider.costUsd)}</span>
                  )}
                  {provider.listCostUsd > provider.costUsd + 1e-9 ? (
                    <span className="block whitespace-nowrap text-xs text-ink-500">
                      franchise déduite
                      <span className="block">catalogue {formatUsdAsEur(provider.listCostUsd)}</span>
                    </span>
                  ) : null}
                </td>
                <td className={TD}>{provider.costUsd > 0 ? <Share share={provider.share} /> : <span className="text-ink-500">—</span>}</td>
                <td className={TD}>
                  <Errors errors={provider.errors} rate={provider.errorRate} />
                </td>
                <td className={`${TD} text-ink-700`}>
                  <Ago date={provider.lastCallAt} now={now} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {report.totals.calls === 0 ? (
        <p className="border-t border-cream-200 px-5 py-3 text-xs text-ink-500">Aucun appel enregistré sur cette période : chaque API apparaîtra ici dès son premier appel.</p>
      ) : null}
    </Card>
  );
}

/** « Par fonctionnalité » : barres classées, une seule teinte. */
function FeaturesCard({ report }: { report: ApiUsageReport }) {
  const features = report.features.slice(0, TOP_ROWS);
  const max = features.reduce((value, feature) => Math.max(value, feature.costUsd), 0);
  return (
    <Card className="p-5">
      <CardHeader title="Par fonctionnalité" hint="Coût des API par usage de la plateforme" />
      {features.length === 0 ? (
        <div className="mt-4">
          <EmptyState title="Aucun appel sur la période">Le coût de chaque fonctionnalité (blog, génération de sites, fiche Google…) apparaîtra ici.</EmptyState>
        </div>
      ) : (
        <ul className="mt-3 divide-y divide-cream-200">
          {features.map((feature) => (
            <li
              key={feature.id ?? "aucune"}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 py-2.5 text-sm sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)_5.5rem]"
            >
              <div className="min-w-0">
                <Link
                  href={usageHref("/couts", { period: report.period.id, filters: { feature: feature.id ?? "none" } })}
                  className={`block truncate font-medium ${LINK}`}
                >
                  {feature.label}
                </Link>
                <span className="block text-xs text-ink-500">
                  {callsLabel(feature.calls)}
                  {feature.errors > 0 ? ` · ${formatCount(feature.errors)} ${plural(feature.errors, "erreur")}` : ""}
                </span>
              </div>
              <Meter ratio={max > 0 ? feature.costUsd / max : 0} className="order-3 col-span-2 sm:order-none sm:col-span-1" />
              <div className="text-right tabular-nums">
                <span className="font-medium text-ink-900">{formatUsdAsEur(feature.costUsd)}</span>
                <span className="block text-xs text-ink-500">{feature.costUsd > 0 ? formatPercent(feature.share) : "sans coût"}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** « Par site » : les sites les plus coûteux, avec revenu mensuel et marge des sites clients. */
function SitesCard({ report }: { report: ApiUsageReport }) {
  const rows = report.sites.filter((site) => site.calls > 0).slice(0, TOP_ROWS);
  const total = report.sites.length;
  const share = periodRevenueShare(report.period.id);
  return (
    <Card>
      <div className="px-5 pt-5">
        <CardHeader
          title="Par site"
          hint={rows.length < total ? `Les ${rows.length} sites les plus coûteux sur ${total}` : "Coût des API, revenu mensuel et marge"}
          action={total > 0 ? <SeeAll href={usageHref("/couts", { period: report.period.id, hash: "par-site" })} /> : null}
        />
      </div>
      {rows.length === 0 ? (
        <div className="p-5">
          <EmptyState title="Aucun appel rattaché à un site">Le coût de chaque site client et de chaque démo apparaîtra ici.</EmptyState>
        </div>
      ) : (
        <>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[460px] text-sm">
              <thead>
                <tr className={THEAD_ROW}>
                  <th scope="col" className={TH}>
                    Site
                  </th>
                  <th scope="col" className={`${TH} text-right`}>
                    Coût API
                  </th>
                  <th scope="col" className={`${TH} text-right`}>
                    Revenu mensuel
                  </th>
                  <th scope="col" className={`${TH} text-right`}>
                    Marge
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((site) => (
                  <tr key={site.siteId ?? "plateforme"} className={TBODY_ROW}>
                    <th scope="row" className={`${TD} max-w-56 text-left font-normal`}>
                      <Link
                        href={usageHref("/couts", { period: report.period.id, filters: { siteId: site.siteId ?? "none" } })}
                        className={`block truncate font-medium ${LINK}`}
                        title={site.name}
                      >
                        {site.name}
                      </Link>
                      <span className="block text-xs text-ink-500">
                        {site.type === "client" ? `Client · ${site.planLabel}` : site.type === "demo" ? "Démo" : "Hors site"} · {callsLabel(site.calls)}
                      </span>
                    </th>
                    <td className={`${TD} text-right font-medium tabular-nums text-ink-900`}>{formatUsdAsEur(site.costUsd)}</td>
                    <td className={`${TD} text-right tabular-nums text-ink-700`}>{site.revenueEur === null ? <span className="text-ink-500">—</span> : formatPrice(site.revenueEur)}</td>
                    <td className={`${TD} text-right tabular-nums`}>
                      {site.marginEur === null ? (
                        <span className="text-ink-500">—</span>
                      ) : (
                        <>
                          <span className={site.marginEur < 0 ? "font-medium text-danger-500" : "text-ink-900"}>{formatEur(site.marginEur)}</span>
                          {site.marginRate !== null ? <span className="block text-xs text-ink-500">{formatPercent(site.marginRate)}</span> : null}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t border-cream-200 px-5 py-3 text-xs text-ink-500">
            {share === 1
              ? "Marge = revenu mensuel de l'abonnement − coût des API de la période."
              : "Marge = revenu mensuel ramené à la durée de la période − coût des API."}
          </p>
        </>
      )}
    </Card>
  );
}
