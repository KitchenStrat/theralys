"use client";

import {
  CalendarDays,
  FileText,
  Images,
  LayoutGrid,
  ListChecks,
  MessageCircle,
  Plus,
  Settings,
  Sparkles,
  Video,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import {
  AiBadge,
  Badge,
  Button,
  Card,
  CardHeader,
  CardSkeleton,
  EmptyState,
  InteractiveCard,
  ProgressBar,
  SECTIONS,
  StatusPill,
  TabPanel,
  Tabs,
  type SectionKey,
} from "@/components/ds";
import type { SectionSample } from "../_lib/sample";
import { GenerationDemo } from "./generation-demo";

const TAB_ICONS: LucideIcon[] = [LayoutGrid, CalendarDays, Sparkles, Settings];
const FORMAT_ICONS: Record<string, LucideIcon> = {
  Carrousel: Images,
  Visuel: Images,
  "Vidéo courte": Video,
  Avis: MessageCircle,
  Action: ListChecks,
};

/** Corps d'une page de section type : onglets, résumé, cartes, génération en cours, état vide. */
export function SectionBody({ section, sample }: { section: SectionKey; sample: SectionSample }) {
  const tabs = sample.tabs.map((label, index) => ({
    id: `t${index}`,
    label,
    icon: section === "reseaux-sociaux" ? TAB_ICONS[index] : undefined,
    badge:
      index === 0 ? (
        <Badge tone="section" className="px-2 py-0.5">
          {sample.cards.length}
        </Badge>
      ) : undefined,
  }));
  const [tab, setTab] = useState("t0");
  const idBase = `section-${section}`;

  return (
    <div data-ds-section={section} className="space-y-6">
      <Tabs idBase={idBase} label={`Vues de la section ${SECTIONS[section].label}`} tabs={tabs} value={tab} onChange={setTab} />

      {tab === "t0" ? (
        <TabPanel idBase={idBase} tab="t0">
          <div className="space-y-6">
            <Card variant="tinted">
              <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
                <div className="min-w-0 flex-1 basis-80">
                  <h2 className="font-ds-display text-xl/7 font-bold text-ds-section-ink">{sample.summaryTitle}</h2>
                  <p className="mt-1 text-base text-ds-ink-700">{sample.summaryText}</p>
                </div>
                <AiBadge>Préparé par l'IA, relu par vous</AiBadge>
              </div>
              <ProgressBar
                className="mt-5"
                value={sample.summaryProgress.value}
                max={sample.summaryProgress.max}
                label="Avancement"
                valueText={sample.summaryProgress.text}
              />
            </Card>

            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {sample.cards.map((card) => {
                const Icon = FORMAT_ICONS[card.format] ?? FileText;
                return (
                  <li key={card.title}>
                    <InteractiveCard padding="none" className="h-full">
                      {/* Emplacement du visuel : teinte de la section, jamais une image d'exemple */}
                      <span className="relative grid h-32 place-items-center overflow-hidden rounded-t-ds-card bg-ds-section-soft">
                        <span aria-hidden className="ds-band-art" />
                        <span className="relative grid size-14 place-items-center rounded-ds-md bg-white text-ds-section-accent shadow-ds-card">
                          <Icon size={26} aria-hidden />
                        </span>
                        <span className="absolute top-3 left-3 rounded-full bg-white px-2.5 py-1 text-ds-meta font-medium text-ds-section-ink shadow-sm">
                          {card.format}
                        </span>
                      </span>
                      <span className="block p-4 sm:p-5">
                        <span className="block text-base font-semibold text-ds-ink-900">{card.title}</span>
                        <span className="mt-1 block text-ds-meta text-ds-ink-600">{card.meta}</span>
                        <StatusPill status={card.status} className="mt-3">
                          {card.statusLabel}
                        </StatusPill>
                      </span>
                    </InteractiveCard>
                  </li>
                );
              })}
            </ul>

            <div className="grid items-start gap-6 md:grid-cols-2">
              <Card>
                <GenerationDemo
                  title={sample.generationTitle}
                  steps={sample.generationSteps}
                  detail={sample.generationDetail}
                  doneMessage="C'est prêt : vous pouvez relire le résultat."
                />
              </Card>
              <Card padding="none">
                <EmptyState
                  icon={Sparkles}
                  title={sample.emptyTitle}
                  action={
                    <Button icon={<Plus size={18} aria-hidden />}>{sample.emptyAction}</Button>
                  }
                  secondary={<Button variant="quiet">Voir un exemple</Button>}
                >
                  {sample.emptyText}
                </EmptyState>
              </Card>
            </div>
          </div>
        </TabPanel>
      ) : (
        <TabPanel key={tab} idBase={idBase} tab={tab}>
          <Card>
            <CardHeader
              title={sample.tabs[Number(tab.slice(1))] ?? "Vue"}
              description="Dans l'aperçu, seul le premier onglet est détaillé. Voici l'état de chargement d'une vue : des squelettes à la forme du contenu."
            />
          </Card>
          <div className="mt-6 grid gap-6 md:grid-cols-2" role="status">
            <span className="sr-only">Chargement…</span>
            <CardSkeleton lines={4} />
            <CardSkeleton lines={4} />
          </div>
        </TabPanel>
      )}
    </div>
  );
}
