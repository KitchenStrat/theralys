import type { ReactNode } from "react";
import Link from "next/link";
import { clsx } from "clsx";
import { Badge, Card } from "@theralys/ui";
import { USD_TO_EUR_RATE } from "@theralys/shared";
import {
  formatAxisEur,
  formatBucket,
  formatCount,
  formatDateTime,
  formatLongDate,
  formatLongDateTime,
  formatPercent,
  formatRelative,
  formatUsdAsEur,
  niceScale,
  usdToEur,
  type ApiUsageReport,
  type DailySeries,
  type ProviderSummary,
} from "@/lib/api-usage";
import { DailyCostChart } from "./daily-cost-chart";

/**
 * Briques d'affichage du pilotage des API, communes à la vue d'ensemble et à
 * la page « API & coûts ».
 */

export const TH = "whitespace-nowrap px-4 py-2.5 font-medium";
export const TD = "px-4 py-2.5 align-top";
export const THEAD_ROW = "border-b border-cream-200 text-left text-xs uppercase tracking-wide text-ink-500";
export const TBODY_ROW = "border-b border-cream-200 last:border-0 hover:bg-cream-50";
export const LINK = "rounded-sm text-primary-600 underline decoration-primary-200 underline-offset-2 hover:decoration-primary-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500";

export const plural = (count: number, singular: string, pluralForm = `${singular}s`): string => (count > 1 ? pluralForm : singular);

/** « 42 appels », « 1 appel ». */
export const callsLabel = (count: number): string => `${formatCount(count)} ${plural(count, "appel")}`;

/** Chiffre clé. `aside` : précision accolée à la valeur (variation par rapport à la période précédente). */
export function StatCard({
  label,
  value,
  aside,
  detail,
  className,
}: {
  label: string;
  value: ReactNode;
  aside?: ReactNode;
  detail?: ReactNode;
  className?: string;
}) {
  return (
    <Card className={clsx("p-5", className)}>
      <p className="text-xs uppercase tracking-wide text-ink-500">{label}</p>
      <p className="mt-1 flex flex-wrap items-baseline gap-x-2">
        <span className="text-2xl font-bold text-ink-900">{value}</span>
        {aside ? <span className="text-xs font-medium text-ink-700">{aside}</span> : null}
      </p>
      {detail ? <p className="mt-1 text-xs text-ink-500">{detail}</p> : null}
    </Card>
  );
}

/** En-tête d'une carte : titre, précision et action à droite. */
export function CardHeader({ title, hint, action, id }: { title: string; hint?: ReactNode; action?: ReactNode; id?: string }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
      <div className="min-w-0">
        <h2 id={id} className="font-semibold">
          {title}
        </h2>
        {hint ? <p className="mt-0.5 text-xs text-ink-500">{hint}</p> : null}
      </div>
      {action ? <div className="shrink-0 text-xs">{action}</div> : null}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-cream-300 px-4 py-8 text-center">
      <p className="text-sm font-medium text-ink-700">{title}</p>
      {children ? <p className="mx-auto mt-1 max-w-md text-xs text-ink-500">{children}</p> : null}
    </div>
  );
}

/** Jauge fine : la valeur est toujours écrite à côté, la couleur ne porte rien seule. */
export function Meter({ ratio, tone = "primary", className }: { ratio: number; tone?: "primary" | "warning"; className?: string }) {
  const percent = Math.min(100, Math.max(0, (Number.isFinite(ratio) ? ratio : 0) * 100));
  return (
    <span aria-hidden className={clsx("block h-2 overflow-hidden rounded-full", tone === "warning" ? "bg-warning-100" : "bg-primary-100", className)}>
      <span className={clsx("block h-full rounded-full", tone === "warning" ? "bg-warning-500" : "bg-primary-500")} style={{ width: `${percent}%` }} />
    </span>
  );
}

/** Part du total : barre fine + pourcentage. */
export function Share({ share }: { share: number }) {
  return (
    <span className="flex items-center gap-2">
      <Meter ratio={share} className="w-16 shrink-0" />
      <span className="tabular-nums text-ink-700">{formatPercent(share)}</span>
    </span>
  );
}

/** Nombre d'erreurs et taux ; « — » quand il n'y en a pas. */
export function Errors({ errors, rate }: { errors: number; rate: number }) {
  if (errors <= 0) return <span className="text-ink-500">—</span>;
  return (
    <span className="whitespace-nowrap tabular-nums">
      <span className="font-medium text-danger-500">{formatCount(errors)}</span>
      <span className="text-ink-500"> · {formatPercent(rate)}</span>
    </span>
  );
}

/** Ancienneté d'un événement, avec la date exacte au survol. */
export function Ago({ date, now }: { date: Date | null; now: Date }) {
  if (!date) return <span className="text-ink-500">—</span>;
  return (
    <time dateTime={date.toISOString()} title={formatDateTime(date)} className="whitespace-nowrap">
      {formatRelative(date, now)}
    </time>
  );
}

/** Provenance du coût d'un fournisseur : gratuit, coût réel renvoyé par l'API, ou calculé au barème. */
export function ProviderBadges({ provider }: { provider: ProviderSummary }) {
  const badges: { label: string; tone: "neutral" | "primary" | "warning"; title: string }[] = [];
  if (provider.free) badges.push({ label: "gratuit", tone: "neutral", title: "Aucun coût à l'appel" });
  if (provider.costSources.includes("provider")) badges.push({ label: "coût réel", tone: "primary", title: "Coût renvoyé par le fournisseur à chaque appel" });
  if (provider.costSources.includes("tariff")) badges.push({ label: "au barème", tone: "neutral", title: "Coût calculé d'après le barème public du fournisseur" });
  if (!provider.known) badges.push({ label: "hors barème", tone: "warning", title: "Fournisseur présent dans le registre mais absent du barème" });
  if (badges.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {badges.map((badge) => (
        <Badge key={badge.label} tone={badge.tone} title={badge.title}>
          {badge.label}
        </Badge>
      ))}
    </span>
  );
}

/** La table `api_usage` n'existe pas encore : bandeau explicite, le reste de la page reste utilisable. */
export function UsageUnavailableBanner({ reason = "missing" }: { reason?: "missing" | "error" }) {
  if (reason === "error") {
    return (
      <div role="alert" className="mt-6 rounded-card border border-warning-500/40 bg-warning-100 px-5 py-4 text-sm text-ink-900">
        <p className="font-semibold">Le registre des appels API est momentanément illisible</p>
        <p className="mt-1 text-ink-700">Les coûts ne peuvent pas être affichés pour l&apos;instant — réessayez dans un instant. Les appels continuent d&apos;être comptés.</p>
      </div>
    );
  }
  return (
    <div role="alert" className="mt-6 rounded-card border border-warning-500/40 bg-warning-100 px-5 py-4 text-sm text-ink-900">
      <p className="font-semibold">Le registre des appels API n&apos;est pas encore activé : appliquez la migration 0008</p>
      <p className="mt-1 text-ink-700">
        La table <code className="rounded bg-white/70 px-1 py-0.5 text-xs">api_usage</code> est absente de cette base. Tant que la migration n&apos;est pas appliquée — le
        SQL de <code className="rounded bg-white/70 px-1 py-0.5 text-xs">packages/db/drizzle/0008_api_usage.sql</code> à passer dans l&apos;éditeur SQL de Neon, ou{" "}
        <code className="rounded bg-white/70 px-1 py-0.5 text-xs">pnpm --filter @theralys/db db:migrate</code> —, aucun appel n&apos;est compté et les coûts ne peuvent pas être
        affichés. Le reste de la plateforme fonctionne normalement.
      </p>
    </div>
  );
}

/** « Mesure réelle depuis le … » : date du premier appel mesuré, hors reprise de l'historique. */
export function measureNote(report: ApiUsageReport): string {
  if (report.firstMeasuredAt) {
    const since = `Mesure réelle depuis le ${formatLongDate(report.firstMeasuredAt)}`;
    return report.firstRowAt && report.firstRowAt < report.firstMeasuredAt
      ? `${since} — avant cette date, seuls les coûts DataForSEO et ScrapeCreators repris de l'historique sont connus.`
      : `${since}.`;
  }
  return report.firstRowAt
    ? "Aucun appel mesuré pour l'instant : seuls les coûts DataForSEO et ScrapeCreators repris de l'historique apparaissent."
    : "Aucun appel enregistré pour l'instant : la mesure commence au premier appel à une API.";
}

/** La période affichée commence-t-elle avant le début de la mesure réelle ? (chiffres partiels) */
export function isPartialPeriod(report: ApiUsageReport): boolean {
  return report.firstMeasuredAt !== null && report.period.from < report.firstMeasuredAt && report.period.to > report.firstMeasuredAt;
}

// ─── Graphique ───────────────────────────────────────────────────────────────

/** Carte « Évolution quotidienne » : coût par jour (par heure pour la journée), empilé par fournisseur. */
export function DailyChartCard({ daily, calls, className }: { daily: DailySeries; calls: number; className?: string }) {
  const hourly = daily.granularity === "hour";
  const scale = niceScale(usdToEur(daily.maxUsd));
  const first = daily.buckets[0];
  const last = daily.buckets[daily.buckets.length - 1];
  const peak = daily.buckets.reduce<(typeof daily.buckets)[number] | null>((best, bucket) => (bucket.totalUsd > (best?.totalUsd ?? 0) ? bucket : best), null);
  const summary =
    hourly && first
      ? `Coût des API heure par heure aujourd'hui : ${formatUsdAsEur(daily.totalUsd)} au total.`
      : first && last
        ? `Coût des API par jour du ${formatBucket(first.key, "long")} au ${formatBucket(last.key, "long")} : ${formatUsdAsEur(daily.totalUsd)} au total${
            peak ? `, maximum ${formatUsdAsEur(peak.totalUsd)} le ${formatBucket(peak.key, "long")}` : ""
          }.`
        : "Coût des API sur la période.";

  return (
    <Card className={clsx("p-5", className)}>
      <CardHeader
        title={hourly ? "Évolution horaire" : "Évolution quotidienne"}
        hint={hourly ? "Coût par heure (heure de Paris), par fournisseur" : "Coût par jour, par fournisseur · jours comptés en temps universel (UTC)"}
      />
      <div className="mt-4">
        {daily.totalUsd > 0 ? (
          <DailyCostChart
            series={daily.series}
            buckets={daily.buckets.map((bucket) => ({
              key: bucket.key,
              label: formatBucket(bucket.key),
              longLabel: formatBucket(bucket.key, "long"),
              total: usdToEur(bucket.totalUsd),
              totalText: formatUsdAsEur(bucket.totalUsd),
              callsText: `${callsLabel(bucket.calls)}${bucket.errors > 0 ? ` dont ${formatCount(bucket.errors)} en erreur` : ""}`,
              callsCountText: formatCount(bucket.calls),
              values: bucket.valuesUsd.map(usdToEur),
              texts: bucket.valuesUsd.map((value) => formatUsdAsEur(value)),
            }))}
            ticks={scale.ticks.map((value) => ({ value, label: formatAxisEur(value, scale.step) }))}
            top={scale.top}
            bucketHeading={hourly ? "Heure" : "Jour"}
            summary={summary}
          />
        ) : (
          <EmptyState title="Aucun coût sur la période">
            {calls > 0
              ? `${callsLabel(calls)} sur la période, tous gratuits ou couverts par une franchise.`
              : "Aucun appel à une API n'a été enregistré sur cette période."}
          </EmptyState>
        )}
      </div>
    </Card>
  );
}

// ─── Soldes et échéances ─────────────────────────────────────────────────────

/**
 * Soldes et échéances, relevés au dernier appel connu : crédits
 * ScrapeCreators, jeton de la bibliothèque publicitaire Meta (à renouveler
 * tous les 60 jours environ), franchise Google Places du mois.
 */
export function BalancesCard({ report, className }: { report: ApiUsageReport; className?: string }) {
  const { scrapeCreators, metaToken } = report.balances;
  return (
    <Card className={clsx("p-5", className)}>
      <CardHeader title="Soldes et échéances" hint="Relevés au dernier appel connu" />
      <ul className="mt-4 space-y-4 text-sm">
        {metaToken.status === "expired" ? (
          <li role="alert" className="rounded-xl border border-danger-500/30 bg-danger-100 px-3 py-2.5">
            <p className="font-semibold text-danger-500">
              <span aria-hidden>⚠ </span>Jeton Meta expiré ou refusé — à renouveler
            </p>
            <p className="mt-1 text-xs text-ink-700">
              Erreur du {metaToken.errorAt ? formatLongDateTime(metaToken.errorAt) : "dernier appel"}
              {metaToken.lastSuccessAt ? ` · dernier appel réussi le ${formatLongDateTime(metaToken.lastSuccessAt)}` : " · aucun appel réussi enregistré"}
            </p>
            {metaToken.errorMessage ? <p className="mt-1 line-clamp-2 break-words text-xs text-ink-500">{metaToken.errorMessage}</p> : null}
          </li>
        ) : (
          <li>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-medium text-ink-900">Jeton Meta</span>
              {metaToken.status === "ok" ? <Badge tone="success">valide au dernier appel</Badge> : <Badge tone="neutral">état inconnu</Badge>}
            </p>
            <p className="mt-0.5 text-xs text-ink-500">
              {metaToken.lastSuccessAt
                ? `Dernier appel réussi le ${formatLongDateTime(metaToken.lastSuccessAt)}`
                : "Aucun appel réussi à la bibliothèque publicitaire enregistré"}
              {" · à renouveler tous les 60 jours environ"}
            </p>
          </li>
        )}

        {scrapeCreators ? (
          <li>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-medium text-ink-900">
                Crédits ScrapeCreators restants : <span className="tabular-nums">{formatCount(scrapeCreators.credits)}</span>
              </span>
              {scrapeCreators.low ? (
                <Badge tone="warning">
                  <span aria-hidden>⚠</span> solde bas
                </Badge>
              ) : null}
            </p>
            <p className="mt-0.5 text-xs text-ink-500">Au dernier appel, le {formatLongDateTime(scrapeCreators.at)}</p>
          </li>
        ) : null}

        <li>
          <p className="font-medium text-ink-900">Franchise gratuite Google Places</p>
          <p className="mt-0.5 text-xs text-ink-500">1 000 appels offerts par mois et par type d&apos;appel — utilisés ce mois-ci :</p>
          <PlacesFreeTier report={report} className="mt-2" />
        </li>
      </ul>
    </Card>
  );
}

/** « franchise gratuite : N / 1 000 appels utilisés ce mois-ci », pour chaque type d'appel Google Places. */
export function PlacesFreeTier({ report, className }: { report: ApiUsageReport; className?: string }) {
  return (
    <ul className={clsx("space-y-2", className)}>
      {report.placesFreeTier.map((line) => {
        const over = line.billedCalls > 0;
        const ratio = line.freePerMonth > 0 ? line.used / line.freePerMonth : 0;
        return (
          <li key={line.operation} className="text-xs">
            <p className="flex items-baseline justify-between gap-3">
              <span className="text-ink-700">{line.label}</span>
              <span className="whitespace-nowrap tabular-nums text-ink-900">
                {formatCount(Math.min(line.used, line.freePerMonth))} / {formatCount(line.freePerMonth)}
              </span>
            </p>
            <Meter ratio={ratio} tone={ratio >= 0.8 ? "warning" : "primary"} className="mt-1" />
            {over ? (
              <p className="mt-1 text-ink-700">
                <span aria-hidden>⚠ </span>Franchise épuisée : {callsLabel(line.billedCalls)} {plural(line.billedCalls, "facturé")} ce mois-ci ({formatUsdAsEur(line.billedUsd)})
              </p>
            ) : ratio >= 0.8 ? (
              <p className="mt-1 text-ink-700">
                <span aria-hidden>⚠ </span>Franchise bientôt épuisée
              </p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

/** Note de bas de page : comment les coûts sont mesurés. */
export function MeasureFootnote() {
  return (
    <p className="mt-6 text-xs leading-relaxed text-ink-500">
      <strong className="font-medium text-ink-700">Comment les coûts sont mesurés.</strong> Chaque appel à une API externe est inscrit au registre avec son coût en dollars :{" "}
      <em className="not-italic text-ink-700">coût réel</em> quand le fournisseur le renvoie (DataForSEO), <em className="not-italic text-ink-700">au barème</em> sinon — tokens
      réellement consommés pour Claude, prix public à l&apos;image, à l&apos;appel ou au crédit pour les autres. Google Places est affiché après déduction de sa franchise
      mensuelle. Conversion au taux fixe de 1 $ = {USD_TO_EUR_RATE.toLocaleString("fr-FR")} €. Les abonnements des fournisseurs (Vercel, Resend…) ne sont pas comptés. En mode
      démonstration (mock), aucun appel n&apos;est fait ni compté.
    </p>
  );
}

/** Lien « Tout voir » d'une carte de la vue d'ensemble vers la page de détail. */
export function SeeAll({ href, children = "Tout voir" }: { href: string; children?: ReactNode }) {
  return (
    <Link href={href} className={LINK}>
      {children} <span aria-hidden>→</span>
    </Link>
  );
}
