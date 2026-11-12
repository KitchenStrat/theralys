"use client";

// PAGE TEMPORAIRE (contrôle visuel du lot « reseaux-sociaux ») — états qu'on ne peut pas provoquer
// sans écrire en base. À SUPPRIMER avant de rendre la main. Données fictives, aucun appel.
import { use } from "react";
import { Hourglass, Lock } from "lucide-react";
import { LinkButton, PageHeader, Stagger } from "@/components/ds";
import type { SocialCalendarItem, SocialMonthState } from "@/lib/social/data";
import SocialError from "../error";
import { MonthCard } from "../month-card";
import { RequestBar } from "../request-bar";
import { SectionUnavailable } from "../section-unavailable";
import { BioLinkCard } from "../share-cards";
import { SocialPostModal } from "../social-post-modal";

const item: SocialCalendarItem = {
  id: "00000000-0000-4000-8000-00000000abcd",
  date: "2026-11-18",
  topic: "Nouvel article : mieux dormir quand les journées raccourcissent",
  format: "static",
  source: "calendar",
  status: "ready",
  template: "affirmation",
  pillar: "nouvel_article",
  accentColor: "#6b5bd2",
  slideCount: 1,
  caption: "Un nouvel article vient de paraître sur le blog.\n\nPour prendre rendez-vous, le lien est dans ma bio.",
  hashtags: ["#sophrologie", "#sommeil", "#albi"],
  altText: "Visuel annonçant un nouvel article du blog.",
  note: "Le sujet a été légèrement reformulé pour respecter les règles de communication des praticiens.",
  slides: [{ role: "cover", title: "Nouvel article", body: "", hasImage: false }],
  sourceRefs: [
    { kind: "article", id: "article:1", label: "Article « Mieux dormir quand les journées raccourcissent »", href: "https://example.org/article" },
    { kind: "request", id: "request", label: "Votre demande" },
  ],
  downloadedAt: null,
  publishedAt: null,
  sizes: ["square", "portrait"],
};

const items: SocialCalendarItem[] = [
  { ...item, id: "00000000-0000-4000-8000-000000000001", date: "2026-11-16", topic: "Spécialité : Confiance en soi", pillar: "specialite", note: undefined },
  { ...item, id: "00000000-0000-4000-8000-000000000002", date: "2026-11-19", topic: "Un exercice simple à faire chez soi", format: "carousel", slideCount: 7, pillar: "conseil", downloadedAt: "2026-11-10T09:00:00.000Z" },
  { ...item, id: "00000000-0000-4000-8000-000000000003", date: "2026-11-23", topic: "Une question que l'on me pose souvent ?", format: "story", source: "request", pillar: "idee_recue", status: "published", publishedAt: "2026-11-11T09:00:00.000Z" },
];

const state: SocialMonthState = {
  slots: [{ date: "2026-11-25", kind: "cadence" }, { date: "2026-11-26", kind: "cadence" }, { date: "2026-11-30", kind: "cadence" }],
  freeSlots: [{ date: "2026-11-25", kind: "cadence" }, { date: "2026-11-30", kind: "cadence" }],
  calendarCount: 2,
  requestCount: 1,
  published: 1,
  downloaded: 1,
  toDownload: 1,
};

export default function TemporaryStatesPage({ searchParams }: { searchParams: Promise<{ etat?: string }> }) {
  const { etat = "quota" } = use(searchParams);
  if (etat === "erreur") return <SocialError error={new Error("aperçu")} reset={() => {}} />;
  if (etat === "formule") {
    return (
      <SectionUnavailable
        icon={Lock}
        title="Les contenus réseaux sociaux ne sont pas inclus dans votre formule"
        action={
          <LinkButton href="/compte" variant="secondary">
            Voir ma formule
          </LinkButton>
        }
      >
        Passez à la formule <strong className="font-semibold text-ds-ink-900">Scale</strong> pour recevoir chaque
        mois vos contenus réseaux sociaux prêts à poster — visuels dans vos couleurs, carrousels, stories et
        légendes — préparés à partir de votre site, en plus du blog SEO, des outils de mots-clés et de
        l&apos;Académie.
      </SectionUnavailable>
    );
  }
  if (etat === "activation") {
    return (
      <SectionUnavailable icon={Hourglass} title="Cette section est en cours d'activation, revenez dans quelques minutes.">
        Vos contenus prêts à poster seront préparés à partir de votre site dès l&apos;activation.
      </SectionUnavailable>
    );
  }
  return (
    <>
      <Stagger className="space-y-6">
        <PageHeader section="reseaux-sociaux" title="États de contrôle (page temporaire)" purpose={`État affiché : ${etat}`} />
        <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <MonthCard
            monthParam="2026-11"
            view={etat === "fin" ? "ending" : "complete"}
            state={etat === "fin" ? { ...state, calendarCount: 0, freeSlots: [], slots: [] } : state}
            items={etat === "fin" ? items.slice(2) : items}
            nextMonthParam="2026-12"
            siteName="Cabinet d'exemple"
            todayIso="2026-11-19"
            isCurrent
            celebrate={false}
            onSelect={() => {}}
          />
          <RequestBar
            swatches={[
              { label: "Couleur principale", hex: "#6b5bd2" },
              { label: "Foncée", hex: "#4a3c8c" },
              { label: "Claire", hex: "#f5f3ff" },
            ]}
            usage={etat === "quota" ? { used: 20, remaining: 0, resetsOn: "2026-12-01" } : { used: 18, remaining: 2, resetsOn: "2026-12-01" }}
            dates={{ default: "2026-11-25", min: "2026-11-13", max: "2027-03-12" }}
            monthParam="2026-11"
            todayIso="2026-11-12"
            onCreated={() => {}}
          />
        </div>
        <BioLinkCard siteLink={{ url: "https://www.cabinet-exemple.fr", sourceParam: false }} />
      </Stagger>
      <SocialPostModal
        item={etat === "fenetre" ? item : etat === "fenetre-publie" ? { ...item, pillar: "specialite", note: undefined, status: "published", publishedAt: "2026-11-11T09:00:00.000Z" } : null}
        todayIso="2026-11-12"
        siteLink={{ url: "https://www.cabinet-exemple.fr", sourceParam: false }}
        bioLine="Pour prendre rendez-vous, le lien est dans ma bio."
        regenRemaining={etat === "fenetre" ? 3 : 0}
        defaultTone="chaleureux"
        onClose={() => {}}
        onBack={etat === "fenetre" ? () => {} : undefined}
      />
    </>
  );
}
