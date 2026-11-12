import { ArrowRight, CalendarDays, Newspaper } from "lucide-react";
import { Card, CardHeader, EmptyState, LinkButton, StatusPill } from "@/components/ds";
import type { CalendarItem } from "@/lib/data";

const dayOf = (iso: string) => String(Number(iso.slice(8, 10)));
const monthOf = (iso: string) =>
  new Intl.DateTimeFormat("fr-FR", { month: "short", timeZone: "UTC" }).format(new Date(`${iso.slice(0, 10)}T00:00:00Z`));

/** Statut d'un contenu à venir : une icône et un mot (« Brouillon », « Programmé », « Planifié »). */
function UpcomingStatus({ status }: { status: CalendarItem["status"] }) {
  if (status === "draft") return <StatusPill status="brouillon" />;
  if (status === "scheduled") return <StatusPill status="planifie">Programmé</StatusPill>;
  if (status === "planned") return <StatusPill status="planifie" />;
  return null;
}

/**
 * « Prochaines publications » : les trois prochains contenus du calendrier
 * éditorial, et le chemin vers l'agenda complet. Vide, la carte dit pourquoi
 * et où le calendrier se remplit.
 */
export function UpcomingCard({ items }: { items: readonly CalendarItem[] }) {
  if (items.length === 0) {
    return (
      <Card section="publications">
        <CardHeader icon={CalendarDays} title="Prochaines publications" />
        <EmptyState
          icon={CalendarDays}
          title="Rien de planifié pour l'instant"
          action={
            <LinkButton href="/publications" variant="secondary" iconRight={<ArrowRight size={18} aria-hidden />}>
              Ouvrir Publications
            </LinkButton>
          }
        >
          Le calendrier se remplit depuis la section Publications. Vos prochains articles apparaîtront ici, avec leur date de parution.
        </EmptyState>
      </Card>
    );
  }

  return (
    <Card section="publications">
      <CardHeader icon={CalendarDays} title="Prochaines publications" description="Les prochains contenus de votre calendrier." />
      <ul className="mt-5 divide-y divide-ds-ink-200">
        {items.map((item) => (
          <li key={`${item.date}-${item.title}`} className="flex items-center gap-4 py-3.5 first:pt-0 last:pb-0">
            <time
              dateTime={item.date}
              className="grid size-14 shrink-0 place-items-center rounded-ds-md bg-ds-section-tint-2 text-center leading-none text-ds-section-ink"
            >
              <span>
                <span className="block text-xl font-bold ds-tnum">{dayOf(item.date)}</span>
                <span className="mt-1 block text-xs font-medium">{monthOf(item.date)}</span>
              </span>
            </time>
            <span className="min-w-0 flex-1">
              <span className="block text-base font-semibold text-ds-ink-900">{item.title}</span>
              <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <span className="inline-flex items-center gap-1.5 text-ds-meta font-medium text-ds-section-accent">
                  <Newspaper size={14} aria-hidden />
                  Article de blog
                </span>
                <UpcomingStatus status={item.status} />
              </span>
            </span>
          </li>
        ))}
      </ul>
      {/* En pied de carte : dans la colonne étroite de l'accueil, une action d'en-tête passerait à la ligne sous le titre */}
      <p className="mt-4 border-t border-ds-ink-200 pt-3">
        <LinkButton href="/publications" variant="quiet" size="sm" className="-ml-2" iconRight={<ArrowRight size={16} aria-hidden />}>
          Tout l&apos;agenda
        </LinkButton>
      </p>
    </Card>
  );
}
