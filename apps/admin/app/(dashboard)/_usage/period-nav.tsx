import Link from "next/link";
import { clsx } from "clsx";
import { API_USAGE_PERIOD_IDS, API_USAGE_PERIOD_LABELS, type ApiUsagePeriodId } from "@theralys/shared";
import { usageHref, type UsageFilters } from "@/lib/api-usage";

/**
 * Sélecteur de période (liens `?periode=…`) : commun à la vue d'ensemble et à
 * la page « API & coûts ». Les filtres en cours sont conservés ; la
 * pagination repart de la première page.
 */
export function PeriodNav({ path, current, filters }: { path: string; current: ApiUsagePeriodId; filters?: UsageFilters }) {
  return (
    <nav aria-label="Période" className="inline-flex max-w-full flex-wrap gap-1 rounded-2xl bg-cream-200/70 p-1">
      {API_USAGE_PERIOD_IDS.map((id) => (
        <Link
          key={id}
          href={usageHref(path, { period: id, filters })}
          aria-current={id === current ? "true" : undefined}
          className={clsx(
            "rounded-xl px-2.5 py-1.5 text-sm font-medium transition-colors sm:px-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500",
            id === current ? "bg-white text-ink-900 shadow-sm ring-1 ring-cream-300" : "text-ink-500 hover:text-ink-900",
          )}
        >
          {API_USAGE_PERIOD_LABELS[id]}
        </Link>
      ))}
    </nav>
  );
}
