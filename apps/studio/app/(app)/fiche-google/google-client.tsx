"use client";

import { forwardRef, useState, type MouseEvent } from "react";
import { clsx } from "clsx";
import { ClipboardCheck, MapPinned, Megaphone, Star, type LucideIcon, type LucideProps } from "lucide-react";
import { Badge, PageHeader, SECTIONS, Stagger, TabPanel, Tabs, type TabItem } from "@/components/ds";
import type { GoogleProfileData } from "@/lib/google/data";
import type { SocialSwatch } from "@/lib/social/render/theme";
import { AuditTab } from "./audit-tab";
import { LinkCard } from "./link-card";
import { PostsTab } from "./posts-tab";
import { ProfileCard } from "./profile-card";
import { ReviewsTab } from "./reviews-tab";
import { focusLinkSearch } from "./shared";
import { GOOGLE_TABS, isGoogleTab, tabHref, type GoogleTab } from "./tabs";
import { VisibilityTab } from "./visibility-tab";

/** Préfixe des identifiants d'onglets et de panneaux (`fiche-google-tab-audit`, `fiche-google-panel-audit`…). */
const ID_BASE = "fiche-google";

/** Pictogramme d'onglet affiché à partir de 640 px : en dessous, les quatre libellés tiennent sur une ligne. */
function fromSmallScreens(Icon: LucideIcon): LucideIcon {
  const Wrapped = forwardRef<SVGSVGElement, Omit<LucideProps, "ref">>(function TabIcon(props, ref) {
    return <Icon ref={ref} {...props} className={clsx(props.className, "max-sm:hidden")} />;
  });
  return Wrapped;
}

const TAB_ICONS: Record<GoogleTab, LucideIcon> = {
  audit: fromSmallScreens(ClipboardCheck),
  visibilite: fromSmallScreens(MapPinned),
  avis: fromSmallScreens(Star),
  posts: fromSmallScreens(Megaphone),
};

export function GoogleClient({
  initialTab,
  siteName,
  data,
  calendar,
  todayIso,
  requestDates,
  swatches,
}: {
  initialTab: GoogleTab;
  siteName: string;
  data: GoogleProfileData;
  calendar: { year: number; month: number };
  /** Jour civil Europe/Paris */
  todayIso: string;
  requestDates: { default: string; min: string; max: string };
  swatches: SocialSwatch[];
}) {
  const [tab, setTab] = useState<GoogleTab>(initialTab);
  /** Message de la liaison de fiche, affiché sur la carte de la fiche une fois reliée */
  const [linkNotice, setLinkNotice] = useState<string | null>(null);
  const monthParam = `${calendar.year}-${String(calendar.month).padStart(2, "0")}`;
  const linked = Boolean(data.linked);

  function select(next: GoogleTab) {
    setTab(next);
    // L'URL reflète l'onglet (rechargement, partage) sans re-rendu serveur
    window.history.replaceState(null, "", tabHref(next, next === "posts" ? monthParam : undefined));
  }

  /**
   * Les onglets sont de vrais liens `?onglet=` (ouverture dans un nouvel onglet,
   * copie de l'adresse, navigation sans script). Un clic simple — ou les flèches
   * du clavier, qui cliquent l'onglet — bascule ici, côté client : intercepté en
   * phase de capture, le lien ne déclenche alors aucune navigation.
   */
  function onTabClickCapture(event: MouseEvent<HTMLDivElement>) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = (event.target as Element).closest<HTMLAnchorElement>('a[role="tab"]');
    const id = link?.id.slice(`${ID_BASE}-tab-`.length);
    if (!isGoogleTab(id)) return;
    event.preventDefault();
    select(id);
  }

  const tabs: TabItem<GoogleTab>[] = GOOGLE_TABS.map((t) => ({
    id: t.id,
    label: t.label,
    icon: TAB_ICONS[t.id],
    href: tabHref(t.id, t.id === "posts" ? monthParam : undefined),
    badge:
      t.id === "avis" && data.reviewsSummary.unanalyzed > 0 ? (
        <Badge tone="section" className="px-2 py-0.5">
          {data.reviewsSummary.unanalyzed}
          <span className="sr-only"> avis à analyser</span>
        </Badge>
      ) : undefined,
  }));

  return (
    <Stagger className="space-y-6" data-ds-section="fiche-google">
      <PageHeader
        section="fiche-google"
        purpose={`${SECTIONS["fiche-google"].purpose} Harmony prépare, vous publiez sur Google.`}
      />

      {data.linked ? (
        <ProfileCard linked={data.linked} latestAudit={data.latestAudit} notice={linkNotice} />
      ) : (
        <LinkCard siteName={siteName} onLinked={setLinkNotice} />
      )}

      <div className="space-y-6">
        <div onClickCapture={onTabClickCapture}>
          <Tabs
            idBase={ID_BASE}
            label="Sections de la fiche Google"
            tabs={tabs}
            value={tab}
            onChange={select}
            className="max-sm:gap-0"
          />
        </div>

        <TabPanel key={tab} idBase={ID_BASE} tab={tab}>
          {tab === "audit" ? (
            <AuditTab linked={linked} latestAudit={data.latestAudit} history={data.history} onLinkRequest={focusLinkSearch} />
          ) : null}
          {tab === "visibilite" ? (
            <VisibilityTab
              linked={linked}
              keywords={data.keywords}
              scanUsage={data.scanUsage}
              budget={data.budget}
              own={{
                name: data.latestAudit?.snapshot.title ?? data.linked?.name ?? siteName,
                rating: data.latestAudit?.snapshot.rating ?? data.linked?.rating ?? null,
                votes: data.latestAudit?.snapshot.votes ?? data.linked?.reviewCount ?? null,
                photos: data.latestAudit?.snapshot.totalPhotos ?? null,
              }}
              searchVisibility={data.searchVisibility}
              onLinkRequest={focusLinkSearch}
            />
          ) : null}
          {tab === "avis" ? (
            <ReviewsTab
              reviews={data.reviews}
              totalCount={data.reviewsTotal}
              summary={data.reviewsSummary}
              replyRemaining={data.replyRemaining}
              replyTone={data.replyTone}
              placeId={data.linked?.placeId ?? null}
              onLinkRequest={focusLinkSearch}
            />
          ) : null}
          {tab === "posts" ? (
            <PostsTab
              year={calendar.year}
              month={calendar.month}
              items={data.posts.items}
              state={data.posts.state}
              usage={data.postUsage}
              swatches={swatches}
              siteName={siteName}
              todayIso={todayIso}
              requestDates={requestDates}
              regenRemaining={data.regenRemaining}
            />
          ) : null}
        </TabPanel>
      </div>
    </Stagger>
  );
}
