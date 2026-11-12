"use client";

import {
  CalendarClock,
  CalendarDays,
  CircleCheck,
  Flag,
  FlaskConical,
  Hourglass,
  Image as ImageIcon,
  Languages,
  LayoutGrid,
  Lightbulb,
  Link2,
  MapPin,
  Megaphone,
  Play,
  Tag,
  Target,
  TriangleAlert,
  UsersRound,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { AiBadge, Badge, Button, Card, CardHeader, EmptyState, KpiTile, NBSP } from "@/components/ds";
import type { MetaAdsCreativeSet, MetaAdsPlan, MetaAdsVideoPlan } from "@theralys/shared";
import { formatDayFr } from "@/lib/calendar";
import { metaLandingPages, type MetaLanding } from "@/lib/meta-ads/clipboard";
import { CopyButton } from "./copy-button";
import { MetaLine, Notice, StepNumber, TEXT_LINK_ON_TINT } from "./parts";
import type { MetaTab } from "./tabs";

const AUDIENCE_LABELS: Record<MetaAdsPlan["adSets"][number]["audience"], string> = {
  large: "Audience large (Advantage+)",
  interets: "Centres d'intérêt",
  retargeting: "Reciblage",
};

const EVENT_LABELS: Record<MetaAdsPlan["objective"]["pixelEvent"], string> = {
  Schedule: "Schedule — clic « Prendre rendez-vous »",
  Contact: "Contact — clic sur le téléphone ou l'e-mail",
  Lead: "Lead — formulaire de contact",
};

export function PlanTab({
  plan,
  creatives,
  videoPlan,
  analysisReady,
  hasPixel,
  regenRemaining,
  landing,
  externalSite,
  onSelectTab,
}: {
  plan: MetaAdsPlan | null;
  creatives: MetaAdsCreativeSet | null;
  videoPlan: MetaAdsVideoPlan | null;
  analysisReady: boolean;
  /**
   * Pixel en place aujourd'hui (peut différer de celui de l'analyse) :
   * renseigné dans le suivi du site Harmony, ou repéré à la dernière lecture
   * du site du client quand les outils s'appuient sur lui.
   */
  hasPixel: boolean;
  regenRemaining: number;
  /** Site de l'analyse et suffixe de son plan : adresses d'atterrissage des créas */
  landing: MetaLanding;
  /** Les outils s'appuient sur le site du client : le Pixel s'y installe directement, pas depuis le studio */
  externalSite: boolean;
  onSelectTab: (tab: MetaTab) => void;
}) {
  if (!plan) {
    return (
      <Card padding="none">
        <EmptyState
          as="h2"
          icon={Target}
          title={analysisReady ? "Le plan de campagne n'a pas encore été généré." : "Votre plan de campagne apparaîtra ici."}
          action={<Button onClick={() => onSelectTab(analysisReady ? "annonces" : "diagnostic")}>{analysisReady ? "Aller aux annonces" : "Aller au diagnostic"}</Button>}
        >
          {analysisReady
            ? `Générez les annonces depuis l'onglet Annonces (le plan de campagne est produit avec elles ; ${regenRemaining} génération${regenRemaining > 1 ? "s" : ""} restante${regenRemaining > 1 ? "s" : ""} ce mois-ci).`
            : "Lancez l'analyse depuis l'onglet Diagnostic : objectif (conversions mesurées par le Pixel), zone et âges, placements, ensembles de publicités avec leurs créas, budget et plan de test sur 14 jours, jalons à 7, 30 et 60 jours."}
        </EmptyState>
      </Card>
    );
  }

  const nameOf = (id: string) => creatives?.creatives.find((c) => c.id === id)?.name ?? videoPlan?.videos.find((v) => v.id === id)?.title ?? id;
  const kindOf = (id: string): "créa" | "vidéo" => (videoPlan?.videos.some((v) => v.id === id) ? "vidéo" : "créa");
  const pixelOutdated = plan.objective.type === "traffic" && hasPixel;
  // Pages d'atterrissage des créas sur le site de l'analyse, dédoublonnées, avec le suffixe que dit le plan (aucune si l'adresse n'est plus connue)
  const landingPages = metaLandingPages(landing, creatives?.creatives ?? []);
  const conversions = plan.objective.type === "conversions_site";

  return (
    <div className="space-y-6">
      <Card variant="tinted">
        <CardHeader icon={Target} title="Objectif" action={<AiBadge />} />
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
          <Badge tone={conversions ? "success" : "warning"} icon={conversions ? CircleCheck : Hourglass}>
            {conversions ? "Conversions sur le site (Pixel)" : "Trafic — en attendant le Pixel"}
          </Badge>
          <span className="text-ds-body text-ds-ink-700">
            Événement : <span className="font-semibold text-ds-ink-900">{EVENT_LABELS[plan.objective.pixelEvent]}</span>
          </span>
        </div>
        <p className="mt-3 text-base text-ds-ink-700">{plan.objective.rationale}</p>
        {plan.objective.type === "traffic" ? (
          // La régénération recalcule le diagnostic avec le Pixel enregistré entre-temps : le plan passe en Conversions sans nouvelle analyse
          <Notice tone="warning" icon={TriangleAlert} className="mt-4">
            {pixelOutdated ? (
              <>
                {externalSite ? "Le Pixel a été repéré sur votre site :" : "Votre Pixel est désormais renseigné :"}{" "}
                <button type="button" onClick={() => onSelectTab("annonces")} className={TEXT_LINK_ON_TINT}>
                  régénérez les annonces
                </button>{" "}
                le plan passera en objectif Conversions.
              </>
            ) : externalSite ? (
              // Site du client : rien à enregistrer dans le studio, le Pixel se pose sur ce site puis se constate à sa lecture
              <>
                Installez le Pixel sur votre site (pas-à-pas dans{" "}
                <button type="button" onClick={() => onSelectTab("parametrage")} className={TEXT_LINK_ON_TINT}>
                  Paramétrage et suivi
                </button>
                ), relancez la lecture de votre site depuis « Mon site », puis régénérez les annonces : le plan passera en objectif Conversions.
              </>
            ) : (
              <>
                Enregistrez votre Pixel dans{" "}
                <button type="button" onClick={() => onSelectTab("parametrage")} className={TEXT_LINK_ON_TINT}>
                  Paramétrage et suivi
                </button>
                , puis régénérez les annonces : le plan passera en objectif Conversions.
              </>
            )}
          </Notice>
        ) : null}
        <MetaLine className="mt-4">
          Plan préparé le {formatDayFr(plan.generatedAt, "day")}
          {plan.generator === "mock" ? " · mode démonstration" : ""}.
        </MetaLine>
      </Card>

      <Card>
        <CardHeader
          icon={Megaphone}
          title="Campagne"
          description="Les réglages à reporter dans le Gestionnaire de publicités Meta."
          action={<CopyButton text={plan.campaign.name} label="Copier le nom" />}
        />
        <dl className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field icon={Tag} label="Nom de la campagne" value={plan.campaign.name} />
          <Field icon={MapPin} label="Zone" value={`${plan.campaign.geo.city} + ${plan.campaign.geo.radiusKm} km`} hint={plan.campaign.geo.note} />
          <Field icon={UsersRound} label="Âges et genre" value={`${plan.campaign.ages.min} – ${plan.campaign.ages.max} ans · tous`} />
          <Field icon={LayoutGrid} label="Placements" value={plan.campaign.placements} />
          <Field icon={Languages} label="Langue" value="Français" />
          <Field icon={CalendarClock} label="Calendrier de diffusion" value={plan.campaign.schedule} />
        </dl>
      </Card>

      <Card>
        <CardHeader icon={UsersRound} title="Ensembles de publicités" description="Une audience par ensemble, avec les annonces qui lui sont associées." />
        <ul className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2" aria-label="Ensembles de publicités">
          {plan.adSets.map((set, i) => (
            <li key={`${i}-${set.name}`} className="rounded-ds-md bg-ds-section-tint p-4 inset-ring inset-ring-ds-section-line/70 sm:p-5">
              <Badge tone={set.audience === "retargeting" ? "brand" : "section"}>{AUDIENCE_LABELS[set.audience]}</Badge>
              <h3 className="mt-2 font-ds-display text-lg/7 font-bold text-ds-section-ink">{set.name}</h3>
              <p className="mt-1 text-ds-body text-ds-ink-700">{set.details}</p>
              {set.creativeIds.length > 0 ? (
                <ul className="mt-3 flex flex-wrap gap-1.5" aria-label={`Annonces de l'ensemble ${set.name}`}>
                  {set.creativeIds.map((id) => (
                    <li key={id} className="max-w-full">
                      <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-ds-meta font-medium text-ds-ink-700 inset-ring inset-ring-ds-section-line">
                        {kindOf(id) === "vidéo" ? (
                          <>
                            <Play size={12} aria-hidden className="shrink-0 fill-current text-ds-section-accent" />
                            <span className="sr-only">Vidéo : </span>
                          </>
                        ) : (
                          <ImageIcon size={13} aria-hidden className="shrink-0 text-ds-section-accent" />
                        )}
                        <span className="truncate">{nameOf(id)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      </Card>

      {landingPages.length > 0 ? (
        <Card>
          <CardHeader
            icon={Link2}
            title="Pages d'atterrissage"
            description={
              landing.suffix === "" ? (
                // Aucun suffixe dans le plan (site du client) : la mesure installée sur ce site ne lit aucun paramètre d'adresse
                <>
                  L&apos;URL à coller dans chaque annonce est l&apos;adresse de la page sur votre site, telle quelle, sans rien y ajouter : Harmony ne rattache
                  pas les visites de votre site à vos annonces (voir l&apos;onglet Paramétrage et suivi).
                </>
              ) : (
                <>
                  L&apos;URL à coller dans chaque annonce porte le suffixe{" "}
                  <code className="rounded-md bg-ds-section-tint-2 px-1.5 py-0.5 font-mono text-[0.875em] whitespace-nowrap text-ds-section-ink">{landing.suffix}</code> : c&apos;est lui
                  qui permet à votre site de reconnaître les visites venues de Meta et de compter les rendez-vous et appels qui en découlent (bloc Résultats de
                  l&apos;onglet Paramétrage et suivi). Les boutons Copier l&apos;ajoutent déjà.
                </>
              )
            }
          />
          <ul className="mt-5 space-y-2" aria-label="Pages d'atterrissage">
            {landingPages.map((page) => (
              <li key={page.url} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-ds-md bg-ds-ink-50 px-4 py-3 inset-ring inset-ring-ds-ink-200">
                <div className="min-w-0 flex-[1_1_16rem]">
                  <p className="font-mono text-ds-body wrap-anywhere text-ds-ink-900">{page.url.replace(/^https?:\/\//, "")}</p>
                  <p className="mt-0.5 text-ds-meta text-ds-ink-600">{page.creativeNames.join(", ")}</p>
                </div>
                <CopyButton text={page.url} label="Copier l'URL" />
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <section aria-labelledby="meta-plan-budget">
        <h2 id="meta-plan-budget" className="font-ds-display text-xl/7 font-bold text-ds-ink-900">
          Budget et plan de test
        </h2>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-4">
          <KpiTile icon={CalendarDays} label="Budget quotidien" caption="budget Advantage+" value={plan.budget.dailyEur} suffix={`${NBSP}€`} />
          <KpiTile icon={Wallet} label="Par mois" caption="en moyenne" value={plan.budget.monthlyEur} suffix={`${NBSP}€`} />
        </div>
        <Notice tone="section" icon={FlaskConical} className="mt-4">
          <p className="text-ds-ink-900">{plan.budget.testPlan}</p>
          <p className="mt-1">
            Le budget quotidien se règle au niveau de la campagne (budget Advantage+). Meta peut dépenser jusqu&apos;au double un jour donné, mais respecte la
            moyenne.
          </p>
        </Notice>
      </section>

      <Card>
        <CardHeader icon={Flag} title="Jalons" description="Ce qu'il faut faire et mesurer, étape par étape." />
        <ol className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-3" aria-label="Jalons">
          {plan.milestones.map((m, i) => (
            <li key={`${i}-${m.horizon}`} className="relative rounded-ds-md bg-ds-ink-50 p-4 inset-ring inset-ring-ds-ink-200 sm:p-5">
              <div className="flex items-center gap-3">
                <StepNumber>{i + 1}</StepNumber>
                <Badge tone="sun" icon={CalendarClock}>
                  {m.horizon}
                </Badge>
              </div>
              <h3 className="mt-3 font-ds-display text-lg/7 font-bold text-ds-ink-900 text-balance">{m.title}</h3>
              <ul className="mt-2 space-y-1.5 text-ds-body text-ds-ink-700">
                {m.actions.map((a, j) => (
                  <li key={`${j}-${a}`} className="flex items-start gap-2.5">
                    <span aria-hidden className="mt-2.5 size-1.5 shrink-0 rounded-full bg-ds-section-accent" />
                    {a}
                  </li>
                ))}
              </ul>
              {m.kpis.length > 0 ? (
                <p className="mt-3 border-t border-ds-ink-200 pt-3 text-ds-meta text-ds-ink-600">
                  <span className="font-semibold text-ds-ink-800">Indicateurs : </span>
                  {m.kpis.join(" · ")}
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      </Card>

      {plan.tips.length > 0 ? (
        <Card>
          <CardHeader icon={Lightbulb} title="Conseils" />
          <ul className="mt-4 space-y-2.5 text-base text-ds-ink-700">
            {plan.tips.map((t, i) => (
              <li key={`${i}-${t}`} className="flex items-start gap-3">
                <span aria-hidden className="mt-2.5 size-1.5 shrink-0 rounded-full bg-ds-section-accent" />
                {t}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

function Field({ icon: Icon, label, value, hint }: { icon: LucideIcon; label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-ds-md bg-ds-ink-50 px-4 py-3 inset-ring inset-ring-ds-ink-200">
      <dt className="flex items-center gap-2 text-ds-meta font-semibold text-ds-ink-600">
        <Icon size={16} aria-hidden className="shrink-0 text-ds-section-accent" />
        {label}
      </dt>
      <dd className="mt-1 text-base font-medium text-ds-ink-900">{value}</dd>
      {hint ? <dd className="mt-1 text-ds-meta text-ds-ink-600">{hint}</dd> : null}
    </div>
  );
}
