import { describe, expect, it } from "vitest";
import type { Site } from "@theralys/db";
import type { GooglePostContent, SiteTheme } from "@theralys/shared";
import { computeGoogleMonthState, loadDeliveredGoogleContent, loadGooglePostDelivery, type GoogleMonthPostLite } from "./posts";

// Novembre 2026 vu depuis le 23 octobre : 4 mardis (3, 10, 17, 24)
const base = { year: 2026, month: 11, now: new Date("2026-10-23T12:00:00Z") };
const TUESDAYS = ["2026-11-03", "2026-11-10", "2026-11-17", "2026-11-24"];

function post(date: string, extra: Partial<GoogleMonthPostLite> = {}): GoogleMonthPostLite {
  return { scheduledFor: date, source: "calendar", status: "ready", ...extra };
}

describe("computeGoogleMonthState", () => {
  it("un créneau par mardi, tous à pourvoir sur un mois vierge", () => {
    const state = computeGoogleMonthState({ ...base, posts: [] });
    expect(state.slots.map((s) => s.date)).toEqual(TUESDAYS);
    expect(state.slots.every((s) => s.kind === "cadence")).toBe(true);
    expect(state.freeSlots).toHaveLength(4);
    expect(state.calendarCount).toBe(0);
    expect(state.toPublish).toBe(0);
  });

  it("mois en cours : seuls les mardis à venir sont des créneaux", () => {
    const state = computeGoogleMonthState({ year: 2026, month: 11, now: new Date("2026-11-10T12:00:00Z"), posts: [] });
    expect(state.slots.map((s) => s.date)).toEqual(["2026-11-17", "2026-11-24"]);
  });

  it("mois préparé : compteurs par statut, aucun créneau libre", () => {
    const posts = TUESDAYS.map((d, i) => post(d, i === 0 ? { status: "published" } : {}));
    const state = computeGoogleMonthState({ ...base, posts });
    expect(state.freeSlots).toEqual([]);
    expect(state.calendarCount).toBe(4);
    expect(state.published).toBe(1);
    expect(state.toPublish).toBe(3);
  });

  it("déplacer ou archiver un post ne libère pas de créneau", () => {
    const moved = [post("2026-11-04"), ...TUESDAYS.slice(1).map((d) => post(d))];
    expect(computeGoogleMonthState({ ...base, posts: moved }).freeSlots).toEqual([]);
    const archived = TUESDAYS.map((d, i) => post(d, i < 2 ? { status: "archived" } : {}));
    const state = computeGoogleMonthState({ ...base, posts: archived });
    expect(state.freeSlots).toEqual([]);
    expect(state.calendarCount).toBe(2);
  });

  it("plan partiel : les premiers créneaux non occupés, à hauteur des manquants", () => {
    const posts = [post(TUESDAYS[0]!), post(TUESDAYS[2]!)];
    const state = computeGoogleMonthState({ ...base, posts });
    expect(state.freeSlots.map((s) => s.date)).toEqual(["2026-11-10", "2026-11-24"]);
  });

  it("les posts sur mesure n'occupent pas de créneau et sont comptés à part", () => {
    const posts = [...TUESDAYS.map((d) => post(d)), post("2026-11-03", { source: "request" })];
    const state = computeGoogleMonthState({ ...base, posts });
    expect(state.freeSlots).toEqual([]);
    expect(state.requestCount).toBe(1);
    expect(state.toPublish).toBe(5);
  });

  it("mois passé : aucun créneau", () => {
    const state = computeGoogleMonthState({ year: 2026, month: 9, now: base.now, posts: [] });
    expect(state.slots).toEqual([]);
  });
});

describe("bouton d'action remis au praticien : ce qui est lu pour le calculer", () => {
  const NOW = new Date("2026-11-12T10:00:00Z");
  const ONLINE = "3f2b8c1e-7a4d-4e5f-9b6a-1c2d3e4f5a6b";
  const SCHEDULED = "11111111-2222-4333-8444-555555555555";
  const BOOKING = "https://www.doctolib.fr/sophrologue/albi/claire-dupont";
  const OWN = "https://www.claire-dupont.fr";

  function site(theme: SiteTheme = { preset: "terracotta", fontPreset: "chaleureux" }): Site {
    return { id: "site-1", slug: "claire-dupont", domain: "claire-dupont.harmony-web.fr", bookingUrl: BOOKING, theme } as Site;
  }
  const HOSTED = "https://claire-dupont.harmony-web.fr";
  const withCta = (url: string | null, type: GooglePostContent["cta"]["type"] = "LEARN_MORE") => ({ status: "ready", content: { cta: { type, url } } });

  /** Lecture des articles remplacée : consigne ses appels, rend un article en ligne et un article planifié. */
  function reader() {
    const calls: { siteId: string; ids: string[] }[] = [];
    const read = async (siteId: string, ids: string[]) => {
      calls.push({ siteId, ids });
      return [
        { id: ONLINE, slug: "respirer-avant-un-entretien", status: "published", publishAt: new Date("2026-11-10T07:00:00Z") },
        { id: SCHEDULED, slug: "article-a-venir", status: "scheduled", publishAt: new Date("2026-11-20T07:00:00Z") },
      ].filter((article) => ids.includes(article.id));
    };
    return { calls, read };
  }

  it("aucun post ne cite un article par son chemin du studio : adresses du site, aucune lecture d'articles", async () => {
    const { calls, read } = reader();
    const delivery = await loadGooglePostDelivery(site(), [withCta(BOOKING, "BOOK"), withCta(HOSTED), withCta(`${HOSTED}/blog/un-article`), withCta(null, "NONE")], NOW, read);
    expect(calls).toEqual([]);
    expect(delivery).toEqual({ hostedUrl: HOSTED, referenceUrl: HOSTED, bookingUrl: BOOKING, onlineArticles: new Map() });
  });

  it("posts d'avant la correction : une seule lecture, pour ce site et ces articles ; seuls les articles en ligne sont gardés", async () => {
    const { calls, read } = reader();
    const posts = [withCta(`/publications/${ONLINE}`), withCta(`/publications/${ONLINE}`), withCta(`/publications/${SCHEDULED}`), withCta(BOOKING, "BOOK")];
    const delivery = await loadGooglePostDelivery(site(), posts, NOW, read);
    expect(calls).toEqual([{ siteId: "site-1", ids: [ONLINE, SCHEDULED] }]);
    expect(delivery.onlineArticles).toEqual(new Map([[ONLINE, "respirer-avant-un-entretien"]]));
  });

  it("site du client en référence : l'adresse de référence est la sienne, les articles restent sur le site hébergé", async () => {
    const own = site({ preset: "terracotta", fontPreset: "chaleureux", externalSite: { url: OWN, active: true } });
    const { read } = reader();
    const delivery = await loadGooglePostDelivery(own, [], NOW, read);
    expect(delivery).toMatchObject({ hostedUrl: HOSTED, referenceUrl: OWN, bookingUrl: BOOKING });

    const content = (cta: GooglePostContent["cta"]) => ({ cta }) as GooglePostContent;
    // Article en ligne → blog hébergé ; article pas encore en ligne → rendez-vous ; bouton « site » d'un post non publié → site du client
    expect((await loadDeliveredGoogleContent(own, { status: "ready", content: content({ type: "LEARN_MORE", url: `/publications/${ONLINE}` }) }, NOW, read)).cta).toEqual({
      type: "LEARN_MORE",
      url: `${HOSTED}/blog/respirer-avant-un-entretien`,
    });
    expect((await loadDeliveredGoogleContent(own, { status: "ready", content: content({ type: "LEARN_MORE", url: `/publications/${SCHEDULED}` }) }, NOW, read)).cta).toEqual({
      type: "BOOK",
      url: BOOKING,
    });
    expect((await loadDeliveredGoogleContent(own, { status: "ready", content: content({ type: "LEARN_MORE", url: HOSTED }) }, NOW, read)).cta.url).toBe(OWN);
    expect((await loadDeliveredGoogleContent(own, { status: "published", content: content({ type: "LEARN_MORE", url: HOSTED }) }, NOW, read)).cta.url).toBe(HOSTED);
  });
});
