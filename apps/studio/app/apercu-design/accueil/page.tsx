import { ArrowRight, CalendarCheck, CalendarDays, Check, ChevronRight, Eye, Globe, HandHeart, Star, Users } from "lucide-react";
import {
  Card,
  CardHeader,
  GreetingBand,
  GreetingChip,
  IconBadge,
  InteractiveCard,
  KpiTile,
  LinkButton,
  NextStepCard,
  SECTIONS,
  SectionBadge,
  SetupChecklist,
  Stagger,
  StatusPill,
  type SectionKey,
} from "@/components/ds";
import { PreviewNav } from "../_components/preview-nav";
import { VisitsCard } from "../_components/visits-card";
import { assertPreviewAllowed, PREVIEW_HREFS } from "../_lib/guard";
import {
  CHECKLIST,
  DONE_THIS_WEEK,
  SAMPLE_USER,
  TRENDS,
  UPCOMING,
  VISITS_30,
  VISITS_7,
  VISITS_7_TOTAL,
  VISITS_PREV_7_TOTAL,
} from "../_lib/sample";

export const metadata = { title: "Aperçu — Accueil" };

const SHORTCUTS: { section: SectionKey; label: string; detail: string }[] = [
  { section: "mon-site", label: "Modifier mon site", detail: "Textes, photos, horaires, tarifs" },
  { section: "publications", label: "Relire mes articles", detail: "1 article vous attend" },
  { section: "reseaux-sociaux", label: "Demander un contenu", detail: "Une actualité à annoncer ?" },
  { section: "fiche-google", label: "Répondre aux avis", detail: "3 réponses prêtes à copier" },
];

/** Composition : le futur Accueil du studio, avec des données d'exemple. */
export default function HomePreviewPage() {
  assertPreviewAllowed();
  const more = VISITS_7_TOTAL - VISITS_PREV_7_TOTAL;
  const deltaPct = Math.round((more / VISITS_PREV_7_TOTAL) * 100);

  return (
    <>
      <PreviewNav current="accueil" />
      <Stagger className="space-y-6">
        <GreetingBand
          eyebrow="Jeudi 12 novembre"
          title={`Bonjour ${SAMPLE_USER.firstName}`}
          footer={
            <>
              <GreetingChip icon={Globe}>Votre site est en ligne</GreetingChip>
              <GreetingChip icon={CalendarDays}>3 publications prévues cette semaine</GreetingChip>
            </>
          }
          aside={
            <NextStepCard
              section="publications"
              title="Relire l'article du 13 novembre"
              duration="2 min"
              action={
                <LinkButton href={PREVIEW_HREFS.publications ?? "/"} iconRight={<ArrowRight size={18} aria-hidden />}>
                  Relire l'article
                </LinkButton>
              }
              secondary={
                <LinkButton href={PREVIEW_HREFS.publications ?? "/"} variant="quiet">
                  Plus tard
                </LinkButton>
              }
            >
              « Sommeil léger et réveils nocturnes » est prêt. Un coup d'œil, et il sera publié vendredi.
            </NextStepCard>
          }
        >
          Cette semaine, <strong className="font-bold">{VISITS_7_TOTAL} personnes</strong> ont visité votre site, {more} de
          plus que la semaine dernière.
        </GreetingBand>

        <section aria-labelledby="chiffres">
          <h2 id="chiffres" className="sr-only">
            Vos chiffres clés
          </h2>
          <Stagger className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            <KpiTile
              section="mon-site"
              icon={Users}
              label="Visiteurs du site"
              caption="7 derniers jours"
              value={VISITS_7_TOTAL}
              delta={{ value: deltaPct, label: "en une semaine" }}
              trend={TRENDS.visits}
              trendLabel="Visiteurs des 14 derniers jours, en hausse"
            />
            <KpiTile
              section="accueil"
              icon={CalendarCheck}
              label="Demandes de rendez-vous"
              caption="7 derniers jours"
              value={18}
              delta={{ value: 20, label: "en une semaine" }}
              trend={TRENDS.appointments}
              trendLabel="Demandes de rendez-vous des 14 derniers jours, en hausse"
            />
            <KpiTile
              section="fiche-google"
              icon={Star}
              label="Avis sur votre fiche"
              caption="Note : 4,9 sur 5"
              value={34}
              delta={{ value: 2, unit: "", label: "ce mois-ci" }}
              trend={TRENDS.reviews}
              trendLabel="Nombre d'avis sur 14 semaines, en hausse"
            />
            <KpiTile
              section="reseaux-sociaux"
              icon={Eye}
              label="Vues de vos publications"
              caption="30 derniers jours"
              value={4812}
              delta={{ value: -6, label: "en un mois" }}
              trend={TRENDS.reach}
              trendLabel="Vues de vos publications sur 14 semaines"
            />
          </Stagger>
        </section>

        {/* Deux piles indépendantes : mesure et agenda à gauche, mise en route et travail accompli à droite */}
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
          <div className="space-y-6 max-lg:order-last">
            <VisitsCard week={VISITS_7} month={VISITS_30} />
            <Card section="publications">
              <CardHeader
                icon={CalendarDays}
                title="Prochaines publications"
                description="Ce qui part cette semaine et la suivante"
                action={
                  <LinkButton
                    href={PREVIEW_HREFS.publications ?? "/"}
                    variant="quiet"
                    size="sm"
                    iconRight={<ArrowRight size={16} aria-hidden />}
                  >
                    Tout l'agenda
                  </LinkButton>
                }
              />
              <ul className="mt-5 divide-y divide-ds-ink-200">
                {UPCOMING.map((item) => {
                  const Icon = SECTIONS[item.section].icon;
                  return (
                    <li key={item.id} data-ds-section={item.section} className="flex items-center gap-4 py-3.5 first:pt-0 last:pb-0">
                      <span className="grid size-14 shrink-0 place-items-center rounded-ds-md bg-ds-section-tint-2 text-ds-section-ink">
                        <span className="text-center leading-none">
                          <span className="block text-xl font-bold ds-tnum">{item.day}</span>
                          <span className="mt-1 block text-xs font-medium">{item.month}</span>
                        </span>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-base font-semibold text-ds-ink-900">{item.title}</span>
                        <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                          <span className="inline-flex items-center gap-1.5 text-ds-meta font-medium text-ds-section-accent">
                            <Icon size={14} aria-hidden />
                            {item.kind}
                          </span>
                          <StatusPill status={item.status}>{item.statusLabel}</StatusPill>
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </Card>
          </div>
          <div className="space-y-6">
            <SetupChecklist steps={CHECKLIST} section="accueil" />
            <Card variant="tinted" section="accueil">
              <div className="flex items-start gap-3.5">
                <IconBadge icon={HandHeart} size="md" />
                <div className="min-w-0">
                  <h2 className="font-ds-display text-lg/7 font-bold text-ds-section-ink sm:text-xl/7">
                    Cette semaine, nous avons fait pour vous
                  </h2>
                  <ul className="mt-2.5 space-y-2">
                    {DONE_THIS_WEEK.map((line) => (
                      <li key={line} className="flex items-start gap-2.5 text-base text-ds-ink-900">
                        <span aria-hidden className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-ds-success-600 text-white">
                          <Check size={12} strokeWidth={3.5} />
                        </span>
                        {line}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </Card>
          </div>
        </div>

        <section aria-labelledby="raccourcis">
          <h2 id="raccourcis" className="sr-only">
            Raccourcis
          </h2>
          <Stagger as="ul" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {SHORTCUTS.map((shortcut) => (
              <li key={shortcut.section}>
                <InteractiveCard href={PREVIEW_HREFS[shortcut.section] ?? "/"} section={shortcut.section} padding="sm" className="h-full justify-center">
                  <span className="flex items-center gap-3">
                    <SectionBadge section={shortcut.section} size="md" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-base font-semibold text-ds-ink-900">{shortcut.label}</span>
                      <span className="block text-ds-meta text-ds-ink-600">{shortcut.detail}</span>
                    </span>
                    <ChevronRight size={18} aria-hidden className="shrink-0 text-ds-ink-400" />
                  </span>
                </InteractiveCard>
              </li>
            ))}
          </Stagger>
        </section>
      </Stagger>
    </>
  );
}
