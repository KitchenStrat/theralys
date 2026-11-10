import { Card } from "@theralys/ui";
import type { MetaMarketAd, MetaMarketInsights } from "@theralys/shared";

/** Synthèse de l'IA sur les annonces de la veille : angles, accroches, offres, formats, manques et mises en garde. */
export function InsightsCard({ insights, adsById }: { insights: MetaMarketInsights; adsById: Map<string, MetaMarketAd> }) {
  return (
    <Card className="p-6">
      <h2 className="text-xl font-semibold">Ce que la veille nous apprend</h2>
      <p className="mt-2 text-sm text-ink-700">{insights.summary}</p>

      {insights.angles.length > 0 ? (
        <div className="mt-5">
          <h3 className="text-sm font-semibold text-ink-900">Angles qui marchent</h3>
          <ul className="mt-2 grid gap-3 sm:grid-cols-2" aria-label="Angles observés">
            {insights.angles.map((angle, i) => {
              const refs = angle.adIds.map((id) => adsById.get(id)).filter((a): a is MetaMarketAd => a !== undefined);
              return (
                // Clé par index : deux angles peuvent porter le même libellé (sortie du modèle)
                <li key={`${i}-${angle.label}`} className="rounded-2xl bg-cream-50 p-3">
                  <p className="font-medium text-ink-900">{angle.label}</p>
                  <p className="mt-1 text-sm text-ink-700">{angle.description}</p>
                  {refs.length > 0 ? (
                    <p className="mt-2 text-xs text-ink-500">
                      Exemples :{" "}
                      {refs.map((ad, i) => (
                        <span key={ad.id}>
                          {i > 0 ? ", " : ""}
                          <a href={ad.libraryUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-primary-600 hover:underline">
                            {ad.pageName}
                          </a>
                        </span>
                      ))}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <TextList title="Accroches relevées" items={insights.hooks} quoted />
        <TextList title="Offres observées" items={insights.offers} />
      </div>

      <dl className="mt-5 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl bg-cream-50 p-3">
          <dt className="text-xs text-ink-500">Formats</dt>
          <dd className="mt-1 text-sm text-ink-700">{insights.formats}</dd>
        </div>
        <div className="rounded-2xl bg-cream-50 p-3">
          <dt className="text-xs text-ink-500">Saisonnalité</dt>
          <dd className="mt-1 text-sm text-ink-700">{insights.seasonality}</dd>
        </div>
      </dl>

      {insights.gaps.length > 0 ? (
        <div className="mt-5 rounded-2xl bg-primary-50 p-4">
          <h3 className="text-sm font-semibold text-primary-800">Ce que personne ne fait encore</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-700">
            {insights.gaps.map((g, i) => (
              <li key={`${i}-${g}`}>{g}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {insights.warnings.length > 0 ? (
        <div className="mt-4 rounded-2xl bg-warning-100 p-4">
          <h3 className="text-sm font-semibold text-ink-900">À ne pas copier</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-700">
            {insights.warnings.map((w, i) => (
              <li key={`${i}-${w}`}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}

function TextList({ title, items, quoted = false }: { title: string; items: string[]; quoted?: boolean }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h3 className="text-sm font-semibold text-ink-900">{title}</h3>
      <ul className="mt-1 divide-y divide-cream-200 rounded-xl border border-cream-200 bg-cream-50">
        {items.map((text, i) => (
          <li key={`${i}-${text}`} className="px-3 py-1.5 text-sm text-ink-900">
            {quoted ? `« ${text} »` : text}
          </li>
        ))}
      </ul>
    </div>
  );
}
