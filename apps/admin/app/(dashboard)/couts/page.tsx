import { Fragment } from "react";
import Form from "next/form";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge, Button, Card, Label, Select } from "@theralys/ui";
import {
  ANTHROPIC_FALLBACK_PRICE_MODEL,
  API_FEATURE_IDS,
  API_FEATURE_LABELS,
  API_PROVIDERS,
  apiFeatureLabel,
  isApiProviderId,
  resolveApiUsagePeriod,
} from "@theralys/shared";
import { requireAdmin } from "@/lib/auth";
import {
  canonicalUsageHref,
  formatCompact,
  formatCount,
  formatDateTime,
  formatDayTime,
  formatDelta,
  formatDuration,
  formatEur,
  formatLongDateTime,
  formatPercent,
  formatPrice,
  formatTime,
  formatTokens,
  formatUnits,
  formatUsdAsEur,
  hasUsageFilters,
  loadApiUsageReport,
  parseUsageFilters,
  parseUsagePage,
  periodRevenueShare,
  usageFeatureKey,
  usageHref,
  USAGE_NONE,
  type ApiUsageReport,
  type ProviderSummary,
  type UsageJournalEntry,
  type UsageSearchParams,
} from "@/lib/api-usage";
import { PeriodNav } from "../_usage/period-nav";
import { RefreshControl } from "../_usage/refresh-control";
import {
  Ago,
  callsLabel,
  CardHeader,
  DailyChartCard,
  EmptyState,
  Errors,
  isPartialPeriod,
  LINK,
  MeasureFootnote,
  measureNote,
  PlacesFreeTier,
  plural,
  ProviderBadges,
  Share,
  StatCard,
  TBODY_ROW,
  TD,
  TH,
  THEAD_ROW,
  UsageUnavailableBanner,
} from "../_usage/ui";

export const metadata = { title: "API & coûts" };
export const dynamic = "force-dynamic";

const PATH = "/couts";

const providerLabel = (id: string): string => (isApiProviderId(id) ? API_PROVIDERS[id].label : id);

/**
 * « API & coûts » : le détail du registre des appels — filtres par
 * fournisseur, fonctionnalité, site et statut, coût par modèle Anthropic,
 * fiche de chaque fournisseur (tarif, franchise, soldes), coût et marge par
 * site, journal paginé des appels.
 */
export default async function ApiCostsPage({ searchParams }: { searchParams: Promise<UsageSearchParams> }) {
  await requireAdmin();
  const params = await searchParams;
  const now = new Date();
  const period = resolveApiUsagePeriod(typeof params.periode === "string" ? params.periode : null, now);
  // Tout paramètre est validé (listes fermées, UUID) ; une adresse non canonique est réécrite
  const canonical = canonicalUsageHref(PATH, params, period.id);
  if (!canonical.isCanonical) redirect(canonical.href);
  const filters = parseUsageFilters(params);
  const filtered = hasUsageFilters(filters);

  const report = await loadApiUsageReport({ period, filters, journalPage: parseUsagePage(params.page), now });

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <h1 className="text-2xl font-bold">API &amp; coûts</h1>
        <RefreshControl updatedAt={formatTime(now)} />
      </div>
      <p className="mt-1 text-sm text-ink-500">Chaque appel aux API externes, son volume et son coût.{report.available ? ` ${measureNote(report)}` : ""}</p>

      <div className="mt-4">
        <PeriodNav path={PATH} current={period.id} filters={filters} />
        {report.available && isPartialPeriod(report) ? (
          <p className="mt-2 text-xs text-ink-500">
            <span aria-hidden>ⓘ </span>La période commence avant le début de la mesure réelle : les chiffres antérieurs sont partiels.
          </p>
        ) : null}
      </div>

      {!report.available ? (
        <UsageUnavailableBanner reason={report.reason} />
      ) : (
        <>
          <FiltersCard report={report} filtered={filtered} />

          <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
            <StatCard
              label={filtered ? "Coût de la sélection" : "Coût API"}
              value={formatUsdAsEur(report.totals.costUsd)}
              aside={report.costDelta !== null ? formatDelta(report.costDelta) : null}
              detail={`${period.label.toLowerCase()}${report.costDelta !== null ? ", vs période précédente" : ""}`}
            />
            <StatCard
              label="Appels"
              value={formatCount(report.totals.calls)}
              aside={report.callsDelta !== null ? formatDelta(report.callsDelta) : null}
              detail={report.callsDelta !== null ? "vs période précédente" : "pas de période de comparaison"}
            />
            <StatCard
              label="Erreurs"
              value={formatCount(report.totals.errors)}
              detail={report.totals.calls > 0 ? `${formatPercent(report.totals.errorRate)} des appels` : "aucun appel"}
            />
            <StatCard
              label="Coût moyen par appel"
              value={report.totals.calls > 0 ? formatUsdAsEur(report.totals.avgCostUsd) : "—"}
              detail={
                report.totals.inputTokens + report.totals.outputTokens > 0
                  ? `Claude : ${formatTokens(report.totals.inputTokens, report.totals.outputTokens)}`
                  : filtered
                    ? "sur la sélection"
                    : "tous fournisseurs confondus"
              }
            />
            <StatCard
              className="col-span-2 lg:col-span-1"
              label="Durée moyenne"
              value={report.totals.avgDurationMs === null ? "—" : formatDuration(report.totals.avgDurationMs)}
              detail="par appel mesuré"
            />
          </div>

          <DailyChartCard className="mt-6" daily={report.daily} calls={report.totals.calls} />
          <ProviderCards report={report} now={now} />
          <AnthropicCard report={report} />
          <SitesCard report={report} />
          <JournalCard report={report} />
        </>
      )}

      <MeasureFootnote />
    </div>
  );
}

// ─── Filtres ─────────────────────────────────────────────────────────────────

/** Filtres en paramètres GET : fonctionnent sans JavaScript, chaque valeur est validée côté serveur. */
function FiltersCard({ report, filtered }: { report: ApiUsageReport; filtered: boolean }) {
  const { filters, options, period } = report;
  return (
    <Card className="mt-6 p-4">
      <Form action={PATH} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto] lg:items-end">
        {period.id !== "mois" ? <input type="hidden" name="periode" value={period.id} /> : null}
        <div>
          <Label htmlFor="filtre-fournisseur">Fournisseur</Label>
          <Select id="filtre-fournisseur" name="fournisseur" defaultValue={filters.provider ?? ""} key={`fournisseur-${filters.provider ?? ""}`}>
            <option value="">Tous les fournisseurs</option>
            {options.providers.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="filtre-fonctionnalite">Fonctionnalité</Label>
          <Select
            id="filtre-fonctionnalite"
            name="fonctionnalite"
            defaultValue={filters.feature === USAGE_NONE ? "aucune" : (filters.feature ?? "")}
            key={`fonctionnalite-${filters.feature ?? ""}`}
          >
            <option value="">Toutes les fonctionnalités</option>
            {API_FEATURE_IDS.map((id) => (
              <option key={id} value={id}>
                {API_FEATURE_LABELS[id]}
              </option>
            ))}
            <option value="aucune">Non attribué</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="filtre-site">Site</Label>
          <Select id="filtre-site" name="site" defaultValue={filters.siteId === USAGE_NONE ? "aucun" : (filters.siteId ?? "")} key={`site-${filters.siteId ?? ""}`}>
            <option value="">Tous les sites</option>
            {options.sites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name}
              </option>
            ))}
            <option value="aucun">Sans site (plateforme)</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="filtre-statut">Statut</Label>
          <Select id="filtre-statut" name="statut" defaultValue={filters.status === "error" ? "erreur" : (filters.status ?? "")} key={`statut-${filters.status ?? ""}`}>
            <option value="">Tous les statuts</option>
            <option value="ok">Réussis</option>
            <option value="erreur">En erreur</option>
          </Select>
        </div>
        <div className="flex items-center gap-3 sm:col-span-2 lg:col-span-1">
          <Button type="submit" size="md">
            Filtrer
          </Button>
          {filtered ? (
            <Link href={usageHref(PATH, { period: period.id })} className={`text-sm ${LINK}`}>
              Réinitialiser
            </Link>
          ) : null}
        </div>
      </Form>
    </Card>
  );
}

// ─── Fournisseurs ────────────────────────────────────────────────────────────

/** Volume d'un fournisseur sur la sélection ; chaîne vide quand il n'en déclare pas. */
function providerVolume(provider: ProviderSummary): string {
  if (provider.id === "anthropic" && provider.inputTokens + provider.outputTokens > 0) return formatTokens(provider.inputTokens, provider.outputTokens);
  // « appels » : le volume répéterait le nombre d'appels déjà affiché
  return provider.units > 0 && provider.unit !== "appels" ? formatUnits(provider.units, provider.unit) : "";
}

/** Fiche de chaque fournisseur : rôle, tarif, activité de la sélection, franchise et soldes. */
function ProviderCards({ report, now }: { report: ApiUsageReport; now: Date }) {
  const { scrapeCreators, metaToken } = report.balances;
  return (
    <section aria-labelledby="fournisseurs" className="mt-8">
      <h2 id="fournisseurs" className="font-semibold">
        Fournisseurs
      </h2>
      <p className="mt-0.5 text-xs text-ink-500">
        {report.filters.provider ? "Fournisseur sélectionné" : `${report.providers.length} API suivies, les plus coûteuses d'abord`} · {report.period.label.toLowerCase()}
      </p>
      <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {report.providers.map((provider) => (
          <Card key={provider.id} className="flex flex-col p-4">
            <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
              <h3 className="font-medium text-ink-900">{provider.label}</h3>
              <ProviderBadges provider={provider} />
            </div>
            <p className="mt-0.5 text-xs text-ink-500">{provider.role}</p>

            <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
              <div>
                <dt className="text-xs text-ink-500">Appels</dt>
                <dd className="font-medium tabular-nums text-ink-900">{formatCount(provider.calls)}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-500">Coût</dt>
                <dd className="font-medium tabular-nums text-ink-900">
                  {provider.calls === 0 ? "—" : provider.free && provider.costUsd === 0 ? "gratuit" : formatUsdAsEur(provider.costUsd)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-ink-500">Erreurs</dt>
                <dd>
                  <Errors errors={provider.errors} rate={provider.errorRate} />
                </dd>
              </div>
            </dl>

            {provider.calls > 0 ? (
              <p className="mt-2 text-xs text-ink-700">
                {[providerVolume(provider), provider.avgDurationMs !== null ? `${formatDuration(provider.avgDurationMs)} en moyenne` : null].filter(Boolean).join(" · ")}
                {" · "}dernier appel <Ago date={provider.lastCallAt} now={now} />
              </p>
            ) : (
              <p className="mt-2 text-xs text-ink-500">Aucun appel sur la période.</p>
            )}

            {provider.listCostUsd > provider.costUsd + 1e-9 ? (
              <p className="mt-1 text-xs text-ink-500">
                Franchise gratuite déduite : {formatUsdAsEur(provider.listCostUsd)} au prix catalogue, {formatUsdAsEur(provider.costUsd)} réellement facturés.
              </p>
            ) : null}

            {provider.id === "google_places" ? (
              <div className="mt-3 rounded-xl bg-cream-100 p-3">
                <p className="text-xs font-medium text-ink-700">Franchise gratuite : appels utilisés ce mois-ci</p>
                <PlacesFreeTier report={report} className="mt-2" />
              </div>
            ) : null}

            {provider.id === "scrapecreators" && scrapeCreators ? (
              <p className="mt-3 rounded-xl bg-cream-100 p-3 text-xs text-ink-700">
                <span className="font-medium text-ink-900">
                  Crédits restants : <span className="tabular-nums">{formatCount(scrapeCreators.credits)}</span>
                </span>{" "}
                {scrapeCreators.low ? (
                  <Badge tone="warning">
                    <span aria-hidden>⚠</span> solde bas
                  </Badge>
                ) : null}
                <span className="block text-ink-500">Au dernier appel, le {formatLongDateTime(scrapeCreators.at)}</span>
              </p>
            ) : null}

            {provider.id === "meta_ad_library" ? (
              metaToken.status === "expired" ? (
                <p role="alert" className="mt-3 rounded-xl border border-danger-500/30 bg-danger-100 p-3 text-xs text-ink-700">
                  <span className="font-semibold text-danger-500">
                    <span aria-hidden>⚠ </span>Jeton Meta expiré ou refusé — à renouveler
                  </span>
                  <span className="block">Erreur du {metaToken.errorAt ? formatLongDateTime(metaToken.errorAt) : "dernier appel"}</span>
                </p>
              ) : (
                <p className="mt-3 rounded-xl bg-cream-100 p-3 text-xs text-ink-700">
                  {metaToken.lastSuccessAt ? `Jeton : dernier appel réussi le ${formatLongDateTime(metaToken.lastSuccessAt)}.` : "Jeton : aucun appel réussi enregistré."}
                </p>
              )
            ) : null}

            {provider.lastError ? (
              <p className="mt-3 text-xs">
                <span className="text-ink-500">
                  Dernière erreur (<Ago date={provider.lastError.at} now={now} />) :
                </span>{" "}
                <span className="break-words text-danger-500 line-clamp-3" title={provider.lastError.message}>
                  {provider.lastError.message}
                </span>
              </p>
            ) : null}

            <div className="mt-auto pt-3">
              <p className="border-t border-cream-200 pt-3 text-xs leading-relaxed text-ink-500">{provider.pricing}</p>
              {!report.filters.provider && provider.calls > 0 ? (
                <p className="mt-2 text-xs">
                  <Link href={usageHref(PATH, { period: report.period.id, filters: { ...report.filters, provider: provider.id }, hash: "journal" })} className={LINK}>
                    Voir ses appels <span aria-hidden>→</span>
                  </Link>
                </p>
              ) : null}
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}

// ─── Anthropic ───────────────────────────────────────────────────────────────

/** Anthropic, premier poste de coût : par modèle, puis coût moyen par appel et par fonctionnalité. */
function AnthropicCard({ report }: { report: ApiUsageReport }) {
  const { anthropic, models } = report;
  if (report.filters.provider && report.filters.provider !== "anthropic") return null;
  const unknown = models.filter((model) => !model.priceKnown && model.model !== "");
  return (
    <Card className="mt-8">
      <div className="px-5 pt-5">
        <CardHeader
          id="anthropic"
          title="Anthropic (Claude) — par modèle"
          hint={
            anthropic.calls > 0
              ? `${callsLabel(anthropic.calls)} · ${formatUsdAsEur(anthropic.costUsd)} · ${formatUsdAsEur(anthropic.avgCostUsd)} en moyenne par appel (réflexion comprise)`
              : "Tokens consommés et coût au barème de chaque modèle"
          }
        />
      </div>
      {models.length === 0 ? (
        <div className="p-5">
          <EmptyState title="Aucun appel à Claude dans cette sélection">Le détail par modèle apparaîtra au premier texte généré.</EmptyState>
        </div>
      ) : (
        <>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className={THEAD_ROW}>
                  <th scope="col" className={TH}>
                    Modèle
                  </th>
                  <th scope="col" className={`${TH} text-right`}>
                    Appels
                  </th>
                  <th scope="col" className={`${TH} text-right`}>
                    Tokens entrée
                  </th>
                  <th scope="col" className={`${TH} text-right`}>
                    Tokens sortie
                  </th>
                  <th scope="col" className={`${TH} text-right`}>
                    Coût
                  </th>
                  <th scope="col" className={`${TH} text-right`}>
                    Coût moyen par appel
                  </th>
                  <th scope="col" className={TH}>
                    Part
                  </th>
                </tr>
              </thead>
              <tbody>
                {models.map((model) => (
                  <tr key={model.model || "inconnu"} className={TBODY_ROW}>
                    <th scope="row" className={`${TD} text-left font-normal`}>
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-mono text-[13px] text-ink-900">{model.model || "modèle non précisé"}</span>
                        {!model.priceKnown && model.model !== "" ? (
                          <Badge tone="warning" title={`Coût estimé au prix de la même famille de modèles ou, à défaut, de ${ANTHROPIC_FALLBACK_PRICE_MODEL}`}>
                            <span aria-hidden>⚠</span> prix inconnu
                          </Badge>
                        ) : null}
                      </span>
                      {model.errors > 0 || model.fallbackCalls > 0 ? (
                        <span className="mt-0.5 block text-xs text-ink-500">
                          {[
                            model.errors > 0 ? `${formatCount(model.errors)} ${plural(model.errors, "erreur")}` : null,
                            model.fallbackCalls > 0 ? `${formatCount(model.fallbackCalls)} ${plural(model.fallbackCalls, "appel")} en repli d'un autre modèle` : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      ) : null}
                    </th>
                    <td className={`${TD} text-right tabular-nums`}>{formatCount(model.calls)}</td>
                    <td className={`${TD} text-right tabular-nums text-ink-700`}>
                      {formatCompact(model.inputTokens)}
                      {model.cacheReadTokens > 0 ? <span className="block text-xs text-ink-500">+ {formatCompact(model.cacheReadTokens)} lus en cache</span> : null}
                    </td>
                    <td className={`${TD} text-right tabular-nums text-ink-700`}>{formatCompact(model.outputTokens)}</td>
                    <td className={`${TD} text-right font-medium tabular-nums text-ink-900`}>{formatUsdAsEur(model.costUsd)}</td>
                    <td className={`${TD} text-right tabular-nums text-ink-700`}>{formatUsdAsEur(model.avgCostUsd)}</td>
                    <td className={TD}>{model.costUsd > 0 ? <Share share={model.share} /> : <span className="text-ink-500">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {unknown.length > 0 || anthropic.fallbackCalls > 0 ? (
            <ul className="space-y-1 border-t border-cream-200 px-5 py-3 text-xs text-ink-700">
              {unknown.length > 0 ? (
                <li>
                  <span aria-hidden>⚠ </span>
                  {unknown.length > 1 ? "Modèles absents" : "Modèle absent"} du barème ({unknown.map((model) => model.model).join(", ")}) : coût estimé au prix de la même
                  famille de modèles ou, à défaut, de {ANTHROPIC_FALLBACK_PRICE_MODEL} — à corriger dans le barème.
                </li>
              ) : null}
              {anthropic.fallbackCalls > 0 ? (
                <li>
                  Modèle demandé ≠ modèle servi : {callsLabel(anthropic.fallbackCalls)} ({formatPercent(anthropic.fallbackCalls / Math.max(1, anthropic.calls))}) — repli côté serveur,
                  facturé au prix du modèle qui a répondu.
                </li>
              ) : null}
            </ul>
          ) : null}

          <div className="border-t border-cream-200 px-5 pb-1 pt-4">
            <h3 className="text-sm font-semibold">Coût moyen d&apos;un appel à Claude, par fonctionnalité</h3>
            <p className="mt-0.5 text-xs text-ink-500">Un appel avec réflexion approfondie peut coûter bien plus qu&apos;un appel simple : c&apos;est le coût moyen réel qui compte.</p>
          </div>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[620px] text-sm">
              <thead>
                <tr className={THEAD_ROW}>
                  <th scope="col" className={TH}>
                    Fonctionnalité
                  </th>
                  <th scope="col" className={`${TH} text-right`}>
                    Appels
                  </th>
                  <th scope="col" className={TH}>
                    Tokens
                  </th>
                  <th scope="col" className={`${TH} text-right`}>
                    Coût
                  </th>
                  <th scope="col" className={`${TH} text-right`}>
                    Coût moyen par appel
                  </th>
                </tr>
              </thead>
              <tbody>
                {anthropic.byFeature.map((feature) => (
                  <tr key={feature.id ?? "aucune"} className={TBODY_ROW}>
                    <th scope="row" className={`${TD} text-left font-medium text-ink-900`}>
                      {feature.label}
                      {feature.errors > 0 ? (
                        <span className="block text-xs font-normal text-ink-500">
                          {formatCount(feature.errors)} {plural(feature.errors, "erreur")}
                        </span>
                      ) : null}
                    </th>
                    <td className={`${TD} text-right tabular-nums`}>{formatCount(feature.calls)}</td>
                    <td className={`${TD} whitespace-nowrap text-ink-700`}>{formatTokens(feature.inputTokens, feature.outputTokens)}</td>
                    <td className={`${TD} text-right tabular-nums text-ink-700`}>{formatUsdAsEur(feature.costUsd)}</td>
                    <td className={`${TD} text-right font-medium tabular-nums text-ink-900`}>{formatUsdAsEur(feature.avgCostUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  );
}

// ─── Par site ────────────────────────────────────────────────────────────────

const SUBSCRIPTION_LABELS: Record<string, string> = { active: "actif", trialing: "en attente de paiement", past_due: "impayé", canceled: "annulé" };

function SitesCard({ report }: { report: ApiUsageReport }) {
  const share = periodRevenueShare(report.period.id);
  return (
    <Card className="mt-8">
      <div className="px-5 pt-5">
        <CardHeader
          id="par-site"
          title="Par site"
          hint={`Coût des API ${report.period.label.toLowerCase()}, revenu mensuel et marge brute des sites clients`}
        />
      </div>
      {report.sites.length === 0 ? (
        <div className="p-5">
          <EmptyState title="Aucun site dans cette sélection">Les sites clients et les démos ayant consommé des API apparaîtront ici.</EmptyState>
        </div>
      ) : (
        <>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className={THEAD_ROW}>
                  <th scope="col" className={TH}>
                    Site
                  </th>
                  <th scope="col" className={TH}>
                    Type
                  </th>
                  <th scope="col" className={TH}>
                    Formule
                  </th>
                  <th scope="col" className={`${TH} text-right`}>
                    Appels
                  </th>
                  <th scope="col" className={`${TH} text-right`}>
                    Coût API
                  </th>
                  <th scope="col" className={TH}>
                    Part du coût
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
                {report.sites.map((site) => (
                  <tr key={site.siteId ?? "plateforme"} className={TBODY_ROW}>
                    <th scope="row" className={`${TD} max-w-72 text-left font-normal`}>
                      {site.calls > 0 ? (
                        <Link
                          href={usageHref(PATH, { period: report.period.id, filters: { ...report.filters, siteId: site.siteId ?? USAGE_NONE }, hash: "journal" })}
                          className={`block truncate font-medium ${LINK}`}
                          title={site.name}
                        >
                          {site.name}
                        </Link>
                      ) : (
                        <span className="block truncate font-medium text-ink-900" title={site.name}>
                          {site.name}
                        </span>
                      )}
                      {site.siteStatus === "archived" ? <span className="block text-xs text-ink-500">site archivé</span> : null}
                    </th>
                    <td className={TD}>
                      {site.type === "client" ? <Badge tone="primary">Client</Badge> : site.type === "demo" ? <Badge tone="neutral">Démo</Badge> : <span className="text-ink-500">—</span>}
                    </td>
                    <td className={`${TD} text-ink-700`}>
                      {site.type === "client" ? (
                        <>
                          {site.planLabel}
                          <span className="block text-xs text-ink-500">{site.subscriptionStatus ? SUBSCRIPTION_LABELS[site.subscriptionStatus] : "sans abonnement"}</span>
                        </>
                      ) : (
                        <span className="text-ink-500">—</span>
                      )}
                    </td>
                    <td className={`${TD} text-right tabular-nums`}>
                      {formatCount(site.calls)}
                      {site.errors > 0 ? (
                        <span className="block text-xs text-ink-500">
                          {formatCount(site.errors)} {plural(site.errors, "erreur")}
                        </span>
                      ) : null}
                    </td>
                    <td className={`${TD} text-right font-medium tabular-nums text-ink-900`}>{formatUsdAsEur(site.costUsd)}</td>
                    <td className={TD}>{site.costUsd > 0 ? <Share share={site.share} /> : <span className="text-ink-500">—</span>}</td>
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
              : "Marge = revenu mensuel ramené à la durée de la période − coût des API."}{" "}
            Revenu : abonnements actifs et impayés, au tarif de la période souscrite.
            {hasUsageFilters(report.filters) ? " Coût limité à la sélection filtrée." : ""}
          </p>
        </>
      )}
    </Card>
  );
}

// ─── Journal ─────────────────────────────────────────────────────────────────

/** Cellules du journal : marges resserrées, le tableau tient sans défilement sur un écran d'ordinateur. */
const JTH = "whitespace-nowrap px-3 py-2.5 font-medium first:pl-5 last:pr-5";
const JTD = "px-3 py-2 align-top first:pl-5 last:pr-5";

function journalVolume(entry: UsageJournalEntry): string {
  if (entry.inputTokens + entry.outputTokens > 0) return `${formatCompact(entry.inputTokens)} → ${formatCompact(entry.outputTokens)} tokens`;
  if (entry.units > 0) return formatUnits(entry.units, isApiProviderId(entry.provider) ? API_PROVIDERS[entry.provider].unit : "unités");
  return "—";
}

function JournalCard({ report }: { report: ApiUsageReport }) {
  const journal = report.journal;
  if (!journal) return null;
  const { page, pageCount, total, pageSize, entries } = journal;
  const first = (page - 1) * pageSize + 1;
  const pageHref = (target: number) => usageHref(PATH, { period: report.period.id, filters: report.filters, page: target, hash: "journal" });
  return (
    <Card className="mt-8">
      <div className="px-5 pt-5">
        <CardHeader
          id="journal"
          title="Journal des appels"
          hint={
            total > 0
              ? `${callsLabel(total)} ${hasUsageFilters(report.filters) ? "dans la sélection" : "sur la période"} · lignes ${formatCount(first)} à ${formatCount(first + entries.length - 1)}, les plus récentes d'abord`
              : "Une ligne par appel à une API externe"
          }
        />
      </div>
      {entries.length === 0 ? (
        <div className="p-5">
          <EmptyState title={hasUsageFilters(report.filters) ? "Aucun appel ne correspond à ces filtres" : "Aucun appel enregistré sur cette période"}>
            {hasUsageFilters(report.filters)
              ? "Élargissez la période ou retirez un filtre."
              : "Le journal se remplit à chaque appel à une API (hors mode démonstration)."}
          </EmptyState>
        </div>
      ) : (
        <>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead>
                <tr className={THEAD_ROW}>
                  <th scope="col" className={JTH}>
                    Date
                  </th>
                  <th scope="col" className={JTH}>
                    Fournisseur · opération
                  </th>
                  <th scope="col" className={JTH}>
                    Fonctionnalité · site
                  </th>
                  <th scope="col" className={JTH}>
                    Volume · modèle
                  </th>
                  <th scope="col" className={`${JTH} text-right`}>
                    Coût
                  </th>
                  <th scope="col" className={`${JTH} text-right`}>
                    Durée
                  </th>
                  <th scope="col" className={JTH}>
                    Statut
                  </th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => {
                  const failed = entry.status === "error";
                  const underFreeTier = entry.listCostUsd > entry.costUsd + 1e-9;
                  return (
                    <Fragment key={entry.id}>
                      <tr className={failed ? "hover:bg-cream-50" : TBODY_ROW}>
                        <td className={`${JTD} whitespace-nowrap tabular-nums text-ink-700`}>
                          <time dateTime={entry.createdAt.toISOString()} title={formatDateTime(entry.createdAt)}>
                            {formatDayTime(entry.createdAt)}
                          </time>
                        </td>
                        <th scope="row" className={`${JTD} text-left font-normal`}>
                          <span className="block max-w-52 truncate font-medium text-ink-900" title={providerLabel(entry.provider)}>
                            {providerLabel(entry.provider)}
                          </span>
                          <span className="block max-w-52 truncate font-mono text-xs text-ink-500" title={entry.operation}>
                            {entry.operation}
                          </span>
                        </th>
                        <td className={JTD}>
                          <span className="block max-w-52 truncate text-ink-900">{apiFeatureLabel(usageFeatureKey(entry.feature))}</span>
                          <span className="block max-w-52 truncate text-xs text-ink-500" title={entry.siteName ?? undefined}>
                            {entry.siteName ?? "sans site"}
                          </span>
                        </td>
                        <td className={`${JTD} tabular-nums`}>
                          <span className="block whitespace-nowrap text-ink-900">{journalVolume(entry)}</span>
                          {entry.model ? (
                            <span className="block max-w-48 truncate font-mono text-xs text-ink-500" title={entry.model}>
                              {entry.model}
                            </span>
                          ) : null}
                          {entry.cacheReadTokens > 0 ? <span className="block whitespace-nowrap text-xs text-ink-500">+ {formatCompact(entry.cacheReadTokens)} lus en cache</span> : null}
                        </td>
                        <td className={`${JTD} whitespace-nowrap text-right tabular-nums`}>
                          {failed && entry.costUsd === 0 ? (
                            <span className="text-ink-500" title="Un appel en échec n'est pas facturé">
                              —
                            </span>
                          ) : entry.costSource === "free" && entry.costUsd === 0 ? (
                            <span className="text-ink-500">gratuit</span>
                          ) : (
                            <span className="font-medium text-ink-900">{formatUsdAsEur(entry.costUsd)}</span>
                          )}
                          {underFreeTier ? (
                            <span className="block text-xs text-ink-500" title={`Prix catalogue : ${formatUsdAsEur(entry.listCostUsd)}`}>
                              sous franchise
                            </span>
                          ) : null}
                        </td>
                        <td className={`${JTD} whitespace-nowrap text-right tabular-nums text-ink-700`}>{entry.durationMs > 0 ? formatDuration(entry.durationMs) : "—"}</td>
                        <td className={JTD}>{failed ? <Badge tone="danger">Erreur</Badge> : <Badge tone="success">OK</Badge>}</td>
                      </tr>
                      {failed ? (
                        // Le message d'erreur a sa propre ligne, sur toute la largeur : c'est lui qu'on vient lire
                        <tr className="border-b border-cream-200 last:border-0">
                          <td className="pl-5" />
                          <td colSpan={6} className="px-3 pb-2.5 pr-5 text-xs text-danger-500">
                            <span className="line-clamp-2 break-words" title={entry.error ?? undefined}>
                              {entry.error ?? "Erreur sans message"}
                            </span>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          {pageCount > 1 ? (
            <nav aria-label="Pages du journal" className="flex items-center justify-between gap-3 border-t border-cream-200 px-5 py-3 text-sm">
              {page > 1 ? (
                <Link href={pageHref(page - 1)} className={LINK} rel="prev">
                  <span aria-hidden>← </span>Plus récents
                </Link>
              ) : (
                <span className="text-ink-300" aria-hidden>
                  ← Plus récents
                </span>
              )}
              <span className="text-xs text-ink-500">
                Page {formatCount(page)} sur {formatCount(pageCount)}
              </span>
              {page < pageCount ? (
                <Link href={pageHref(page + 1)} className={LINK} rel="next">
                  Plus anciens<span aria-hidden> →</span>
                </Link>
              ) : (
                <span className="text-ink-300" aria-hidden>
                  Plus anciens →
                </span>
              )}
            </nav>
          ) : null}
        </>
      )}
    </Card>
  );
}
