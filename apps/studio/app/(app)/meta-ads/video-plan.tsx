"use client";

import { Ban, Camera, Captions, Check, Clapperboard, Clock, MessageCircle, Scissors, Smartphone, Video, X, type LucideIcon } from "lucide-react";
import { AiBadge, Badge, Card, CardHeader, IconBadge } from "@/components/ds";
import { META_ADS_ANGLES, META_VIDEO, type MetaAdsVideoPlan, type MetaVideoBrief } from "@theralys/shared";
import { ctaLabel, formatMetaLines, metaVideoScriptTxt } from "@/lib/meta-ads/clipboard";
import { CopyButton } from "./copy-button";
import { MetaLine, StepNumber } from "./parts";

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
      <Card variant="tinted">
        <CardHeader
          icon={Clapperboard}
          title={<span id="meta-video-plan">Plan vidéo</span>}
          description={
            <>
              {plan.videos.length} vidéo{plan.videos.length > 1 ? "s" : ""} verticale{plan.videos.length > 1 ? "s" : ""} ({META_VIDEO.format}, {META_VIDEO.minSeconds} à{" "}
              {META_VIDEO.maxSeconds} secondes) à tourner avec votre téléphone et à monter vous-même : sur Meta, une vraie vidéo de vous et du cabinet
              bat n&apos;importe quel visuel. Chaque fiche donne le script seconde par seconde, les plans à tourner et le texte à coller.
            </>
          }
        />
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
          <AiBadge />
          <MetaLine>
            Préparé le {new Date(plan.generatedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
            {plan.generator === "mock" ? " · mode démonstration" : ""}.
          </MetaLine>
        </div>
      </Card>

      {plan.videos.map((video, index) => (
        <VideoCard key={video.id} video={video} index={index} />
      ))}

      <Card>
        <div className="grid grid-cols-1 gap-x-8 gap-y-6 md:grid-cols-2">
          <TipList icon={Smartphone} title="Matériel et réglages" items={plan.equipment} />
          <TipList icon={Scissors} title="Conseils de montage" items={plan.editingTips} />
        </div>
      </Card>
    </section>
  );
}

function TipList({ icon, title, items }: { icon: LucideIcon; title: string; items: string[] }) {
  return (
    <div>
      <div className="flex items-center gap-3">
        <IconBadge icon={icon} tone="soft" size="sm" />
        <h3 className="font-ds-display text-lg/7 font-bold text-ds-ink-900">{title}</h3>
      </div>
      <ul className="mt-3 space-y-2 text-ds-body text-ds-ink-700">
        {items.map((item, i) => (
          <li key={`${i}-${item}`} className="flex items-start gap-3">
            <span aria-hidden className="mt-2.5 size-1.5 shrink-0 rounded-full bg-ds-section-accent" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function VideoCard({ video, index }: { video: MetaVideoBrief; index: number }) {
  const beats = [...video.beats].sort((a, b) => a.at - b.at);
  return (
    <Card as="article">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 flex-[1_1_18rem] items-start gap-3.5">
          <IconBadge icon={Video} size="md" />
          <div className="min-w-0">
            <h3 className="font-ds-display text-lg/7 font-bold text-ds-ink-900 sm:text-xl/7">
              <span className="block text-ds-meta font-semibold text-ds-section-accent">Vidéo {index + 1}.</span>
              {video.title}
            </h3>
            <p className="mt-2 flex flex-wrap items-center gap-2 text-ds-body text-ds-ink-600">
              <Badge tone="section">{angleLabel(video.angle)}</Badge>
              <Badge tone="sun" icon={Clock}>
                {video.durationSeconds} s · {video.format}
              </Badge>
              <span>
                Bouton : <span className="font-semibold text-ds-ink-800">{ctaLabel(video.cta)}</span>
              </span>
            </p>
          </div>
        </div>
        <CopyButton text={metaVideoScriptTxt(video)} label="Copier le script" />
      </div>
      <p className="mt-3 text-base text-ds-ink-700">
        <span className="font-semibold text-ds-ink-900">Objectif : </span>
        {video.goal}
      </p>

      <div className="mt-5 rounded-ds-md bg-ds-section-tint p-4 inset-ring inset-ring-ds-section-line/70 sm:p-5">
        <p className="text-ds-meta font-semibold tracking-wide text-ds-section-accent uppercase">Accroche — les 3 premières secondes</p>
        <p className="mt-1.5 font-ds-display text-xl/7 font-bold text-ds-section-ink text-balance">« {video.hook} »</p>
      </div>

      <h4 className="mt-6 text-base font-semibold text-ds-ink-900">Temps forts, seconde par seconde</h4>
      {/* Une étape par temps fort : le numéro, la seconde, ce qui se dit, puis ce qui s'affiche et le plan à tourner */}
      <ol className="mt-3" aria-label={`Temps forts — ${video.title}`}>
        {beats.map((beat, i) => (
          <li key={`${i}-${beat.at}`} className="relative flex gap-4 pb-5 last:pb-0">
            {i < beats.length - 1 ? <span aria-hidden className="absolute top-9 bottom-0 left-[1.0625rem] w-0.5 rounded-full bg-ds-section-line" /> : null}
            <StepNumber>{i + 1}</StepNumber>
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="text-ds-meta font-bold text-ds-section-accent ds-tnum">{beat.at} s</p>
              <p className="text-base text-ds-ink-900">{beat.say}</p>
              <p className="mt-1.5 flex items-start gap-2 text-ds-meta text-ds-ink-600">
                <Captions size={15} aria-hidden className="mt-0.5 shrink-0 text-ds-section-accent" />
                <span>
                  <span className="font-semibold text-ds-ink-700">À l&apos;écran :</span> {beat.onScreen}
                </span>
              </p>
              <p className="mt-1 flex items-start gap-2 text-ds-meta text-ds-ink-600">
                <Camera size={15} aria-hidden className="mt-0.5 shrink-0 text-ds-section-accent" />
                <span>
                  <span className="font-semibold text-ds-ink-700">Plan :</span> {beat.shot}
                </span>
              </p>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <List title="Plans à tourner" items={video.shotList} />
        <List title="À dire" items={video.doSay} tone="ok" />
        <List title="À ne pas dire" items={video.dontSay} tone="warn" />
      </div>

      <div className="mt-5 rounded-ds-md bg-ds-ink-50 px-4 py-3 inset-ring inset-ring-ds-ink-200">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-ds-meta font-semibold text-ds-ink-700">Texte à coller avec la vidéo</p>
          <CopyButton text={video.caption} label="Copier" variant="quiet" className="-mr-2" />
        </div>
        <p className="mt-1 text-base whitespace-pre-line text-ds-ink-900">{video.caption}</p>
      </div>
    </Card>
  );
}

const LIST_TONES = {
  plain: { box: "bg-ds-ink-50 inset-ring inset-ring-ds-ink-200", title: "text-ds-ink-900", text: "text-ds-ink-700", icon: Camera, mark: null, markClass: "bg-ds-ink-450" },
  ok: { box: "bg-ds-success-100", title: "text-ds-success-900", text: "text-ds-success-900", icon: MessageCircle, mark: Check, markClass: "text-ds-success-700" },
  warn: { box: "bg-ds-warning-100", title: "text-ds-warning-900", text: "text-ds-warning-900", icon: Ban, mark: X, markClass: "text-ds-warning-700" },
} as const;

function List({ title, items, tone }: { title: string; items: string[]; tone?: "ok" | "warn" }) {
  if (items.length === 0) return null;
  const style = LIST_TONES[tone ?? "plain"];
  const TitleIcon = style.icon;
  const Mark = style.mark;
  return (
    <div className={`rounded-ds-md p-4 ${style.box}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className={`flex items-center gap-2 text-base font-semibold ${style.title}`}>
          <TitleIcon size={18} aria-hidden className="shrink-0" />
          {title}
        </h4>
        {tone === undefined ? <CopyButton text={formatMetaLines(items)} label="Copier" variant="quiet" className="-my-1 -mr-2" /> : null}
      </div>
      <ul className={`mt-2 space-y-1.5 text-ds-body ${style.text}`}>
        {items.map((item, i) => (
          <li key={`${i}-${item}`} className="flex items-start gap-2">
            {Mark ? (
              <Mark size={16} strokeWidth={2.5} aria-hidden className={`mt-1 shrink-0 ${style.markClass}`} />
            ) : (
              <span aria-hidden className={`mt-2.5 ml-1 size-1.5 shrink-0 rounded-full ${style.markClass}`} />
            )}
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
