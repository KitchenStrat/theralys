"use client";

import { useState } from "react";
import { clsx } from "clsx";
import type { GoogleProfileData } from "@/lib/google/data";
import type { SocialSwatch } from "@/lib/social/render/theme";
import { AuditTab } from "./audit-tab";
import { LinkCard } from "./link-card";
import { PostsTab } from "./posts-tab";
import { ProfileCard } from "./profile-card";
import { ReviewsTab } from "./reviews-tab";
import { GOOGLE_TABS, tabHref, type GoogleTab } from "./tabs";
import { VisibilityTab } from "./visibility-tab";

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

  function select(next: GoogleTab) {
    setTab(next);
    // L'URL reflète l'onglet (rechargement, partage) sans re-rendu serveur
    window.history.replaceState(null, "", tabHref(next, next === "posts" ? monthParam : undefined));
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold">Fiche Google</h1>
          <p className="mt-1 text-sm text-ink-500">
            Audit, visibilité locale, avis et posts de votre fiche d&apos;établissement — Harmony
            prépare, vous publiez sur Google.
          </p>
        </div>
      </div>

      <div className="mt-6">
        {data.linked ? (
          <ProfileCard linked={data.linked} latestAudit={data.latestAudit} notice={linkNotice} />
        ) : (
          <LinkCard siteName={siteName} onLinked={setLinkNotice} />
        )}
      </div>

      <nav aria-label="Sections de la fiche Google" className="mt-8 -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ul className="flex gap-1 border-b border-cream-200">
          {GOOGLE_TABS.map((t) => {
            const active = t.id === tab;
            return (
              <li key={t.id}>
                <a
                  href={tabHref(t.id, t.id === "posts" ? monthParam : undefined)}
                  aria-current={active ? "page" : undefined}
                  onClick={(e) => {
                    e.preventDefault();
                    select(t.id);
                  }}
                  className={clsx(
                    "-mb-px inline-block whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors",
                    active
                      ? "border-primary-500 text-primary-700"
                      : "border-transparent text-ink-500 hover:border-cream-300 hover:text-ink-900",
                  )}
                >
                  {t.label}
                  {t.id === "avis" && data.reviewsSummary.unanalyzed > 0 ? (
                    <span className="ml-1.5 rounded-full bg-primary-100 px-1.5 text-[11px] text-primary-700">
                      {data.reviewsSummary.unanalyzed}
                      <span className="sr-only"> avis à analyser</span>
                    </span>
                  ) : null}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>

      <section className="mt-6" aria-label={GOOGLE_TABS.find((t) => t.id === tab)?.label}>
        {tab === "audit" ? (
          <AuditTab linked={Boolean(data.linked)} latestAudit={data.latestAudit} history={data.history} />
        ) : null}
        {tab === "visibilite" ? (
          <VisibilityTab
            linked={Boolean(data.linked)}
            keywords={data.keywords}
            scanUsage={data.scanUsage}
            budget={data.budget}
            own={{
              name: data.latestAudit?.snapshot.title ?? data.linked?.name ?? siteName,
              rating: data.latestAudit?.snapshot.rating ?? data.linked?.rating ?? null,
              votes: data.latestAudit?.snapshot.votes ?? data.linked?.reviewCount ?? null,
              photos: data.latestAudit?.snapshot.totalPhotos ?? null,
            }}
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
      </section>
    </div>
  );
}
