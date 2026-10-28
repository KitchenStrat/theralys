"use client";

import { Badge, Card } from "@theralys/ui";
import { META_ADS_ANGLES, META_VIDEO, type MetaAdsVideoPlan, type MetaVideoBrief } from "@theralys/shared";
import { ctaLabel, formatMetaLines, metaVideoScriptTxt } from "@/lib/meta-ads/clipboard";
import { CopyButton } from "./copy-button";

function angleLabel(angle: MetaVideoBrief["angle"]): string {
  return META_ADS_ANGLES.find((a) => a.id === angle)?.label ?? angle;
}

/**
 * Plan vidéo : trois vidéos courtes à tourner et monter soi-même (angle,
 * objectif, durée, accroche des 3 premières secondes, frise des temps forts
 * seconde par seconde, liste des plans, à dire / à ne pas dire, bouton, texte
 * à coller), puis matériel et conseils de montage.
 */
export function VideoPlanSection({ plan }: { plan: MetaAdsVideoPlan }) {
  return (
    <section aria-labelledby="meta-video-plan" className="space-y-6">
      <Card className="p-6">
        <h2 id="meta-video-plan" className="text-xl font-semibold">
          Plan vidéo
        </h2>
        <p className="mt-1 text-sm text-ink-700">
          {plan.videos.length} vidéo{plan.videos.length > 1 ? "s" : ""} verticale{plan.videos.length > 1 ? "s" : ""} ({META_VIDEO.format}, {META_VIDEO.minSeconds} à {META_VIDEO.maxSeconds} secondes) à tourner
          avec votre téléphone et à monter vous-même : sur Meta, une vraie vidéo de vous et du cabinet bat n&apos;importe quel visuel. Chaque
          fiche donne le script seconde par seconde, les plans à tourner et le texte à coller.
        </p>
        <p className="mt-2 text-xs text-ink-500">
          Préparé le {new Date(plan.generatedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
          {plan.generator === "mock" ? " · mode démonstration" : ""}.
        </p>
      </Card>

      {plan.videos.map((video, index) => (
        <VideoCard key={video.id} video={video} index={index} />
      ))}

      <Card className="p-6">
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <h3 className="text-base font-semibold text-ink-900">Matériel et réglages</h3>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-ink-700">
              {plan.equipment.map((e, i) => (
                <li key={`${i}-${e}`}>{e}</li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-base font-semibold text-ink-900">Conseils de montage</h3>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-ink-700">
              {plan.editingTips.map((t, i) => (
                <li key={`${i}-${t}`}>{t}</li>
              ))}
            </ul>
          </div>
        </div>
      </Card>
    </section>
  );
}

function VideoCard({ video, index }: { video: MetaVideoBrief; index: number }) {
  const beats = [...video.beats].sort((a, b) => a.at - b.at);
  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-ink-900">
            <span className="mr-2 text-ink-500">Vidéo {index + 1}.</span>
            {video.title}
          </h3>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-500">
            <Badge tone="info">{angleLabel(video.angle)}</Badge>
            <Badge tone="neutral">
              {video.durationSeconds} s · {video.format}
            </Badge>
            <span>Bouton : <span className="font-medium text-ink-700">{ctaLabel(video.cta)}</span></span>
          </p>
          <p className="mt-2 text-sm text-ink-700">
            <span className="font-medium text-ink-900">Objectif : </span>
            {video.goal}
          </p>
        </div>
        <CopyButton text={metaVideoScriptTxt(video)} label="Copier le script" />
      </div>

      <div className="mt-4 rounded-2xl bg-primary-50 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary-800">Accroche — les 3 premières secondes</p>
        <p className="mt-1 text-base font-medium text-ink-900">« {video.hook} »</p>
      </div>

      <h4 className="mt-5 text-sm font-semibold text-ink-900">Temps forts, seconde par seconde</h4>
      <ol className="mt-2 relative space-y-0 border-l-2 border-cream-200 pl-5" aria-label={`Temps forts — ${video.title}`}>
        {beats.map((beat, i) => (
          <li key={`${i}-${beat.at}`} className="relative py-2">
            <span aria-hidden className="absolute -left-[27px] top-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary-500 text-[10px] font-bold text-white">
              {i + 1}
            </span>
            <p className="text-xs font-semibold tabular-nums text-primary-700">{beat.at} s</p>
            <p className="text-sm text-ink-900">{beat.say}</p>
            <p className="text-xs text-ink-500">
              <span className="font-medium text-ink-700">À l&apos;écran :</span> {beat.onScreen} · <span className="font-medium text-ink-700">Plan :</span> {beat.shot}
            </p>
          </li>
        ))}
      </ol>

      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <List title="Plans à tourner" items={video.shotList} />
        <List title="À dire" items={video.doSay} tone="ok" />
        <List title="À ne pas dire" items={video.dontSay} tone="warn" />
      </div>

      <div className="mt-5 rounded-xl border border-cream-200 bg-cream-50 px-3 py-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold text-ink-900">Texte à coller avec la vidéo</p>
          <CopyButton text={video.caption} label="Copier" variant="ghost" />
        </div>
        <p className="mt-1 whitespace-pre-line text-sm text-ink-900">{video.caption}</p>
      </div>
    </Card>
  );
}

function List({ title, items, tone }: { title: string; items: string[]; tone?: "ok" | "warn" }) {
  if (items.length === 0) return null;
  return (
    <div className={tone === "warn" ? "rounded-2xl bg-warning-100 p-3" : tone === "ok" ? "rounded-2xl bg-success-100 p-3" : "rounded-2xl bg-cream-50 p-3"}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h5 className="text-sm font-semibold text-ink-900">{title}</h5>
        {tone === undefined ? <CopyButton text={formatMetaLines(items)} label="Copier" variant="ghost" /> : null}
      </div>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-ink-700">
        {items.map((item, i) => (
          <li key={`${i}-${item}`}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
