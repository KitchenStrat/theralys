import { Ban, CalendarRange, Compass, Lightbulb, MessageSquareQuote, Shapes, Sparkles, Tag, type LucideIcon } from "lucide-react";
import { AiBadge, Card, CardHeader, IconBadge } from "@/components/ds";
import type { MetaMarketAd, MetaMarketInsights } from "@theralys/shared";
import { TEXT_LINK_ON_TINT } from "./parts";

/** Synthèse de l'IA sur les annonces de la veille : angles, accroches, offres, formats, manques et mises en garde. */
export function InsightsCard({ insights, adsById }: { insights: MetaMarketInsights; adsById: Map<string, MetaMarketAd> }) {
  return (
    <Card>
      <CardHeader icon={Sparkles} title="Ce que la veille nous apprend" action={<AiBadge />} />
      <p className="mt-4 text-base text-ds-ink-700 text-pretty">{insights.summary}</p>

      {insights.angles.length > 0 ? (
        <div className="mt-6">
          <SectionTitle icon={Compass}>Angles qui marchent</SectionTitle>
          <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2" aria-label="Angles observés">
            {insights.angles.map((angle, i) => {
              const refs = angle.adIds.map((id) => adsById.get(id)).filter((a): a is MetaMarketAd => a !== undefined);
              return (
                // Clé par index : deux angles peuvent porter le même libellé (sortie du modèle)
                <li key={`${i}-${angle.label}`} className="rounded-ds-md bg-ds-section-tint p-4 inset-ring inset-ring-ds-section-line/70">
                  <p className="text-base font-semibold text-ds-section-ink">{angle.label}</p>
                  <p className="mt-1 text-ds-body text-ds-ink-700">{angle.description}</p>
                  {refs.length > 0 ? (
                    <p className="mt-2 text-ds-meta text-ds-ink-700">
                      Exemples :{" "}
                      {refs.map((ad, i) => (
                        <span key={ad.id}>
                          {i > 0 ? ", " : ""}
                          <a href={ad.libraryUrl} target="_blank" rel="noopener noreferrer" className={TEXT_LINK_ON_TINT}>
                            {ad.pageName}
                            <span className="sr-only"> (nouvel onglet)</span>
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

      <div className="mt-6 grid grid-cols-1 gap-x-6 gap-y-6 sm:grid-cols-2">
        <TextList icon={MessageSquareQuote} title="Accroches relevées" items={insights.hooks} quoted />
        <TextList icon={Tag} title="Offres observées" items={insights.offers} />
      </div>

      <dl className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Stat icon={Shapes} label="Formats" value={insights.formats} />
        <Stat icon={CalendarRange} label="Saisonnalité" value={insights.seasonality} />
      </dl>

      {insights.gaps.length > 0 ? (
        <div className="mt-6 rounded-ds-md bg-ds-section-tint p-4 inset-ring inset-ring-ds-section-line/70 sm:p-5">
          <h3 className="flex items-center gap-2 text-base font-semibold text-ds-section-ink">
            <Lightbulb size={18} aria-hidden className="shrink-0 text-ds-section-accent" />
            Ce que personne ne fait encore
          </h3>
          <Bullets items={insights.gaps} className="text-ds-ink-700" dot="bg-ds-section-accent" />
        </div>
      ) : null}

      {insights.warnings.length > 0 ? (
        <div className="mt-4 rounded-ds-md bg-ds-warning-100 p-4 sm:p-5">
          <h3 className="flex items-center gap-2 text-base font-semibold text-ds-warning-900">
            <Ban size={18} aria-hidden className="shrink-0 text-ds-warning-700" />À ne pas copier
          </h3>
          <Bullets items={insights.warnings} className="text-ds-warning-900" dot="bg-ds-warning-700" />
        </div>
      ) : null}
    </Card>
  );
}

function SectionTitle({ icon, children }: { icon: LucideIcon; children: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <IconBadge icon={icon} tone="soft" size="sm" />
      <h3 className="font-ds-display text-lg/7 font-bold text-ds-ink-900">{children}</h3>
    </div>
  );
}

function Bullets({ items, className, dot }: { items: string[]; className: string; dot: string }) {
  return (
    <ul className={`mt-2 space-y-1.5 text-ds-body ${className}`}>
      {items.map((item, i) => (
        <li key={`${i}-${item}`} className="flex items-start gap-2.5">
          <span aria-hidden className={`mt-2.5 size-1.5 shrink-0 rounded-full ${dot}`} />
          {item}
        </li>
      ))}
    </ul>
  );
}

function Stat({ icon: StatIcon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="rounded-ds-md bg-ds-ink-50 px-4 py-3 inset-ring inset-ring-ds-ink-200">
      <dt className="flex items-center gap-2 text-ds-meta font-semibold text-ds-ink-600">
        <StatIcon size={16} aria-hidden className="shrink-0 text-ds-section-accent" />
        {label}
      </dt>
      <dd className="mt-1 text-ds-body text-ds-ink-800">{value}</dd>
    </div>
  );
}

function TextList({ icon, title, items, quoted = false }: { icon: LucideIcon; title: string; items: string[]; quoted?: boolean }) {
  if (items.length === 0) return null;
  return (
    <div>
      <SectionTitle icon={icon}>{title}</SectionTitle>
      <ul className="mt-3 divide-y divide-ds-ink-200 rounded-ds-md bg-ds-ink-50 inset-ring inset-ring-ds-ink-200">
        {items.map((text, i) => (
          <li key={`${i}-${text}`} className="px-4 py-2.5 text-ds-body text-ds-ink-900">
            {quoted ? `« ${text} »` : text}
          </li>
        ))}
      </ul>
    </div>
  );
}
