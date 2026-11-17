import { clsx } from "clsx";
import { Globe, Megaphone, MousePointerClick, Navigation, Search, Share2, Waypoints, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { ANALYTICS_SOURCE_LABELS, type AnalyticsSource } from "@theralys/shared";
import { Card, IconBadge, NBSP, ProgressBar, formatNumber, type SectionKey } from "@/components/ds";

export type SourceRow = { source: AnalyticsSource; count: number; share: number };

export type SourcesSummary = { total: number; unit: "visitors" | "views"; rows: SourceRow[] };

/**
 * Précision affichée à côté du libellé d'une source : Instagram arrive par le
 * lien de bio suivi (`?src=ig`) ou par l'application (referrer `android-app://`).
 */
const SOURCE_DETAIL: Partial<Record<AnalyticsSource, string>> = { instagram: "lien de bio ou application" };

function sourceLabel(source: AnalyticsSource): string {
  const detail = SOURCE_DETAIL[source];
  return detail ? `${ANALYTICS_SOURCE_LABELS[source]} (${detail})` : ANALYTICS_SOURCE_LABELS[source];
}

/**
 * Chaque provenance prend l'icône et la couleur de la section du studio qui la
 * nourrit : les réseaux en Aurore, Google en Rivage, la publicité en Cobalt et
 * en Iris. La couleur situe ; le libellé, la part et le nombre disent tout.
 */
const SOURCE_LOOK: Record<AnalyticsSource, { icon: LucideIcon; section: SectionKey }> = {
  instagram: { icon: Share2, section: "reseaux-sociaux" },
  facebook: { icon: Share2, section: "reseaux-sociaux" },
  linkedin: { icon: Share2, section: "reseaux-sociaux" },
  google: { icon: Search, section: "fiche-google" },
  google_ads: { icon: MousePointerClick, section: "google-ads" },
  meta_ads: { icon: Megaphone, section: "meta-ads" },
  direct: { icon: Navigation, section: "accueil" },
  other: { icon: Globe, section: "compte" },
};

/** Les provenances esquissées tant que rien n'est mesuré : celles que le praticien verra arriver en premier. */
const PREVIEW_SOURCES: AnalyticsSource[] = ["google", "instagram", "facebook", "direct"];

/**
 * « Provenance des visites » : une ligne par source mesurée, sa part en % et
 * une jauge. État vide pédagogique : la mesure commence avec le lien de bio
 * (section Réseaux sociaux, « Votre lien de bio ») et les sites d'origine des visiteurs.
 * Sur grand écran, il esquisse aussi les provenances suivies, à la place des futures lignes.
 */
export function SourcesCard({
  sources,
  caption,
  socialAccess,
  wide = false,
  className,
}: {
  sources: SourcesSummary;
  /** Période, après le total : « sur 7 jours » */
  caption: string;
  /** Le site a accès à la section Réseaux sociaux (lien de bio disponible) */
  socialAccess: boolean;
  /** La carte occupe toute la largeur de l'accueil : ses lignes se rangent en colonnes */
  wide?: boolean;
  /** Placement dans la grille de l'accueil */
  className?: string;
}) {
  const unit = sources.unit === "visitors" ? (["visiteur", "visiteurs"] as const) : (["vue", "vues"] as const);
  const count = (value: number) => `${formatNumber(value)}${NBSP}${value > 1 ? unit[1] : unit[0]}`;

  return (
    // En colonne : étirée à la hauteur de sa voisine dans la grille de l'accueil, la carte donne ce surplus à son contenu
    // (les lignes s'espacent, l'état vide occupe la place) au lieu de laisser un blanc sous lui
    <Card as="section" section="mon-site" aria-labelledby="sources-title" className={clsx("flex flex-col", className)}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-[1_1_15rem] items-start gap-3.5">
          <IconBadge icon={Waypoints} tone="soft" size="md" />
          <div className="min-w-0">
            <h2 id="sources-title" className="font-ds-display text-lg/7 font-bold text-ds-ink-900 sm:text-xl/7">
              Provenance des visites
            </h2>
            <p className="mt-0.5 text-ds-body text-ds-ink-600">Par où vos visiteurs arrivent sur votre site.</p>
          </div>
        </div>
        {sources.total > 0 ? (
          <p className="rounded-full bg-ds-section-tint-2 px-3 py-1 text-ds-meta font-medium text-ds-section-ink">
            {count(sources.total)} {caption}
          </p>
        ) : null}
      </div>

      {sources.rows.length > 0 ? (
        <ul className={clsx("mt-5 flex flex-1 flex-col justify-between gap-4", wide && "xl:grid xl:grid-cols-2 xl:content-start xl:gap-x-10 xl:gap-y-5")}>
          {sources.rows.map((row) => {
            const look = SOURCE_LOOK[row.source];
            return (
              <li key={row.source} data-ds-section={look.section} className="flex items-center gap-3.5">
                <IconBadge icon={look.icon} tone="soft" size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                    <span className="text-base font-medium text-ds-ink-900">{sourceLabel(row.source)}</span>
                    <span className="whitespace-nowrap">
                      <span className="text-base font-semibold text-ds-ink-900 ds-tnum">
                        {row.share}
                        {NBSP}%
                      </span>
                      <span className="ml-1.5 text-ds-meta text-ds-ink-600">({count(row.count)})</span>
                    </span>
                  </div>
                  <ProgressBar className="mt-1.5" size="sm" value={row.share} max={100} ariaLabel={`${sourceLabel(row.source)} : ${row.share} %`} />
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="mt-5 flex flex-1 flex-col gap-5">
          {/* L'esquisse est décorative : le paragraphe dit la même chose aux lecteurs d'écran, et elle ne s'affiche que là où la carte est étirée */}
          <ul
            aria-hidden
            className={clsx("hidden flex-1 flex-col justify-between gap-4 xl:flex", wide && "xl:grid xl:grid-cols-4 xl:gap-x-8")}
          >
            {PREVIEW_SOURCES.map((source) => {
              const look = SOURCE_LOOK[source];
              return (
                <li key={source} data-ds-section={look.section} className="flex items-center gap-3.5">
                  <IconBadge icon={look.icon} tone="soft" size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className={clsx("flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5", wide && "xl:flex-col xl:flex-nowrap")}>
                      <span className="text-base font-medium text-ds-ink-800">{ANALYTICS_SOURCE_LABELS[source]}</span>
                      <span className="text-ds-meta whitespace-nowrap text-ds-ink-600">en attente</span>
                    </div>
                    <span className="mt-1.5 block h-1.5 rounded-full bg-ds-ink-200/70" />
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="rounded-ds-md bg-ds-section-tint px-4 py-3.5 text-ds-body text-ds-ink-700 ring-1 ring-ds-section-line/70">
            <p>
              Aucune provenance mesurée pour l&apos;instant&nbsp;: elle apparaît dès les prochaines visites (Instagram, Facebook, Google, accès
              direct…).
            </p>
            {socialAccess ? (
              <p className="mt-1.5">
                Pour savoir ce que vos réseaux vous apportent, mettez dans Instagram et Facebook le lien de bio que nous vous avons
                préparé&nbsp;:{" "}
                <Link href="/reseaux-sociaux" className="rounded font-semibold text-ds-brand-800 underline underline-offset-2 ds-focus">
                  Votre lien de bio, dans Réseaux sociaux
                </Link>
                .
              </p>
            ) : null}
          </div>
        </div>
      )}
    </Card>
  );
}
