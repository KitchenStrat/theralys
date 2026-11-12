"use client";

import { Badge, Button, Card } from "@theralys/ui";
import type { MetaAdsCreativeSet, MetaAdsPlan, MetaAdsVideoPlan } from "@theralys/shared";
import { formatDayFr } from "@/lib/calendar";
import { metaLandingPages, type MetaLanding } from "@/lib/meta-ads/clipboard";
import { CopyButton } from "./copy-button";
import type { MetaTab } from "./tabs";

const eur = (value: number, digits = 0) => `${value.toLocaleString("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits })} €`;

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
      <Card className="p-8 text-center text-ink-500">
        <p className="font-medium text-ink-700">{analysisReady ? "Le plan de campagne n'a pas encore été généré." : "Votre plan de campagne apparaîtra ici."}</p>
        <p className="mt-1 text-sm">
          {analysisReady
            ? `Générez les annonces depuis l'onglet Annonces (le plan de campagne est produit avec elles ; ${regenRemaining} génération${regenRemaining > 1 ? "s" : ""} restante${regenRemaining > 1 ? "s" : ""} ce mois-ci).`
            : "Lancez l'analyse depuis l'onglet Diagnostic : objectif (conversions mesurées par le Pixel), zone et âges, placements, ensembles de publicités avec leurs créas, budget et plan de test sur 14 jours, jalons à 7, 30 et 60 jours."}
        </p>
        <div className="mt-5">
          <Button variant="secondary" onClick={() => onSelectTab(analysisReady ? "annonces" : "diagnostic")}>
            {analysisReady ? "Aller aux annonces" : "Aller au diagnostic"}
          </Button>
        </div>
      </Card>
    );
  }

  const nameOf = (id: string) => creatives?.creatives.find((c) => c.id === id)?.name ?? videoPlan?.videos.find((v) => v.id === id)?.title ?? id;
  const kindOf = (id: string): "créa" | "vidéo" => (videoPlan?.videos.some((v) => v.id === id) ? "vidéo" : "créa");
  const pixelOutdated = plan.objective.type === "traffic" && hasPixel;
  // Pages d'atterrissage des créas sur le site de l'analyse, dédoublonnées, avec le suffixe que dit le plan (aucune si l'adresse n'est plus connue)
  const landingPages = metaLandingPages(landing, creatives?.creatives ?? []);
  const linkClass = "font-medium text-primary-700 underline";

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h2 className="text-xl font-semibold">Objectif</h2>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge tone={plan.objective.type === "conversions_site" ? "success" : "warning"}>
            {plan.objective.type === "conversions_site" ? "Conversions sur le site (Pixel)" : "Trafic — en attendant le Pixel"}
          </Badge>
          <span className="text-sm text-ink-700">Événement : <span className="font-medium text-ink-900">{EVENT_LABELS[plan.objective.pixelEvent]}</span></span>
        </div>
        <p className="mt-3 text-sm text-ink-700">{plan.objective.rationale}</p>
        {plan.objective.type === "traffic" ? (
          // La régénération recalcule le diagnostic avec le Pixel enregistré entre-temps : le plan passe en Conversions sans nouvelle analyse
          <p className="mt-3 rounded-xl bg-warning-100 px-4 py-2 text-sm text-ink-900">
            {pixelOutdated ? (
              <>
                {externalSite ? "Le Pixel a été repéré sur votre site :" : "Votre Pixel est désormais renseigné :"}{" "}
                <button type="button" onClick={() => onSelectTab("annonces")} className={linkClass}>
                  régénérez les annonces →
                </button>{" "}
                le plan passera en objectif Conversions.
              </>
            ) : externalSite ? (
              // Site du client : rien à enregistrer dans le studio, le Pixel se pose sur ce site puis se constate à sa lecture
              <>
                Installez le Pixel sur votre site (pas-à-pas dans{" "}
                <button type="button" onClick={() => onSelectTab("parametrage")} className={linkClass}>
                  Paramétrage &amp; suivi →
                </button>
                ), relancez la lecture de votre site depuis « Mon site », puis régénérez les annonces : le plan passera en objectif Conversions.
              </>
            ) : (
              <>
                Enregistrez votre Pixel dans{" "}
                <button type="button" onClick={() => onSelectTab("parametrage")} className={linkClass}>
                  Paramétrage &amp; suivi →
                </button>
                , puis régénérez les annonces : le plan passera en objectif Conversions.
              </>
            )}
          </p>
        ) : null}
        <p className="mt-2 text-xs text-ink-500">
          Plan préparé le {formatDayFr(plan.generatedAt, "day")}
          {plan.generator === "mock" ? " · mode démonstration" : ""}.
        </p>
      </Card>

      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">Campagne</h2>
            <p className="mt-1 text-sm text-ink-500">Les réglages à reporter dans le Gestionnaire de publicités Meta.</p>
          </div>
          <CopyButton text={plan.campaign.name} label="Copier le nom" />
        </div>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Nom de la campagne" value={plan.campaign.name} />
          <Field label="Zone" value={`${plan.campaign.geo.city} + ${plan.campaign.geo.radiusKm} km`} hint={plan.campaign.geo.note} />
          <Field label="Âges et genre" value={`${plan.campaign.ages.min} – ${plan.campaign.ages.max} ans · tous`} />
          <Field label="Placements" value={plan.campaign.placements} />
          <Field label="Langue" value="Français" />
          <Field label="Calendrier de diffusion" value={plan.campaign.schedule} />
        </dl>
      </Card>

      <Card className="p-6">
        <h2 className="text-xl font-semibold">Ensembles de publicités</h2>
        <p className="mt-1 text-sm text-ink-500">Une audience par ensemble, avec les annonces qui lui sont associées.</p>
        <ul className="mt-4 grid gap-4 md:grid-cols-2" aria-label="Ensembles de publicités">
          {plan.adSets.map((set, i) => (
            <li key={`${i}-${set.name}`} className="rounded-2xl border border-cream-200 bg-cream-50 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={set.audience === "retargeting" ? "info" : "primary"}>{AUDIENCE_LABELS[set.audience]}</Badge>
                <h3 className="font-semibold text-ink-900">{set.name}</h3>
              </div>
              <p className="mt-2 text-sm text-ink-700">{set.details}</p>
              {set.creativeIds.length > 0 ? (
                <ul className="mt-3 flex flex-wrap gap-1.5" aria-label={`Annonces de l'ensemble ${set.name}`}>
                  {set.creativeIds.map((id) => (
                    <li key={id}>
                      <Badge tone="neutral">
                        {kindOf(id) === "vidéo" ? "▶ " : ""}
                        {nameOf(id)}
                      </Badge>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      </Card>

      {landingPages.length > 0 ? (
        <Card className="p-6">
          <h2 className="text-xl font-semibold">Pages d&apos;atterrissage</h2>
          {landing.suffix === "" ? (
            // Aucun suffixe dans le plan (site du client) : la mesure installée sur ce site ne lit aucun paramètre d'adresse
            <p className="mt-1 text-sm text-ink-500">
              L&apos;URL à coller dans chaque annonce est l&apos;adresse de la page sur votre site, telle quelle, sans rien y ajouter : Harmony ne rattache
              pas les visites de votre site à vos annonces (voir l&apos;onglet Paramétrage et suivi).
            </p>
          ) : (
            <p className="mt-1 text-sm text-ink-500">
              L&apos;URL à coller dans chaque annonce porte le suffixe <code className="rounded bg-cream-100 px-1 text-ink-900">{landing.suffix}</code> : c&apos;est
              lui qui permet à votre site de reconnaître les visites venues de Meta et de compter les rendez-vous et appels qui en découlent (bloc
              Résultats de l&apos;onglet Paramétrage et suivi). Les boutons Copier l&apos;ajoutent déjà.
            </p>
          )}
          <ul className="mt-4 space-y-2" aria-label="Pages d'atterrissage">
            {landingPages.map((page) => (
              <li key={page.url} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-cream-50 p-3">
                <div className="min-w-0">
                  <p className="break-all font-mono text-sm text-ink-900">{page.url.replace(/^https?:\/\//, "")}</p>
                  <p className="text-xs text-ink-500">{page.creativeNames.join(", ")}</p>
                </div>
                <CopyButton text={page.url} label="Copier l'URL" variant="ghost" />
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card className="p-6">
        <h2 className="text-xl font-semibold">Budget et plan de test</h2>
        <dl className="mt-4 grid grid-cols-2 gap-3">
          <Field label="Budget quotidien" value={eur(plan.budget.dailyEur)} hint="au niveau de la campagne (budget Advantage+)" />
          <Field label="Par mois" value={eur(plan.budget.monthlyEur)} hint="Meta peut dépenser jusqu'au double un jour donné, mais respecte la moyenne" />
        </dl>
        <p className="mt-4 rounded-xl bg-cream-100 px-4 py-3 text-sm text-ink-700">{plan.budget.testPlan}</p>
      </Card>

      <Card className="p-6">
        <h2 className="text-xl font-semibold">Jalons</h2>
        <p className="mt-1 text-sm text-ink-500">Ce qu&apos;il faut faire et mesurer, étape par étape.</p>
        <ol className="mt-4 grid gap-4 sm:grid-cols-3" aria-label="Jalons">
          {plan.milestones.map((m, i) => (
            <li key={`${i}-${m.horizon}`} className="rounded-2xl border border-cream-200 bg-cream-50 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="primary">{m.horizon}</Badge>
                <h3 className="font-semibold text-ink-900">{m.title}</h3>
              </div>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-700">
                {m.actions.map((a, j) => (
                  <li key={`${j}-${a}`}>{a}</li>
                ))}
              </ul>
              {m.kpis.length > 0 ? (
                <p className="mt-2 text-xs text-ink-500">
                  <span className="font-medium text-ink-700">Indicateurs : </span>
                  {m.kpis.join(" · ")}
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      </Card>

      {plan.tips.length > 0 ? (
        <Card className="p-6">
          <h2 className="text-xl font-semibold">Conseils</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-ink-700">
            {plan.tips.map((t, i) => (
              <li key={`${i}-${t}`}>{t}</li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

function Field({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl bg-cream-50 p-3">
      <dt className="text-xs text-ink-500">{label}</dt>
      <dd className="text-sm font-medium text-ink-900">{value}</dd>
      {hint ? <dd className="mt-1 text-[11px] text-ink-500">{hint}</dd> : null}
    </div>
  );
}
