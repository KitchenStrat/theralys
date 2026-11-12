import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { anonymousVisitorId, BOT_UA, isBotUserAgent } from "./visitor";

const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const SITE = "b6bed027-6656-4734-926f-501605751fdc";
const NOW = new Date("2026-11-12T10:00:00Z");

const visitor = (init: Record<string, string>) => new Headers(init);

describe("isBotUserAgent", () => {
  it("règle inchangée de /api/track, au caractère près", () => {
    expect(BOT_UA.source).toBe("bot|crawl|spider|slurp|lighthouse|headless|prerender|vercel-screenshot|monitor");
    expect(BOT_UA.flags).toBe("i");
  });

  it("écarte crawlers, aperçus et sondes, garde les navigateurs", () => {
    for (const ua of [
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      "Mozilla/5.0 (compatible; bingbot/2.0)",
      "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php) crawler",
      "Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/131.0.0.0",
      "Chrome-Lighthouse",
      "vercel-screenshot/1.0",
      "UptimeRobot/2.0",
      "Screaming Frog SEO Spider/20.0",
      "Mozilla/5.0 (compatible; Yahoo! Slurp)",
      "Prerender (+https://github.com/prerender/prerender)",
      "Site24x7 Monitor",
    ]) {
      expect(isBotUserAgent(ua), ua).toBe(true);
    }
    expect(isBotUserAgent(CHROME)).toBe(false);
    expect(isBotUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 Version/18.1 Mobile/15E148 Safari/604.1")).toBe(false);
    // Sans User-Agent : compté, comme le fait /api/track
    expect(isBotUserAgent("")).toBe(false);
    expect(isBotUserAgent(null)).toBe(false);
    expect(isBotUserAgent(undefined)).toBe(false);
  });
});

describe("anonymousVisitorId", () => {
  it("recette inchangée de /api/track : sha256(sel:jour:IP:navigateur:périmètre), 32 caractères préfixés « anon- »", () => {
    const headers = visitor({ "x-forwarded-for": "203.0.113.7, 10.0.0.1", "user-agent": CHROME });
    const expected = createHash("sha256").update(`sel:2026-11-12:203.0.113.7:${CHROME}:${SITE}`).digest("hex").slice(0, 32);
    expect(anonymousVisitorId(headers, SITE, { now: NOW, salt: "sel" })).toBe(`anon-${expected}`);
    expect(anonymousVisitorId(headers, SITE, { now: NOW, salt: "sel" })).toMatch(/^anon-[0-9a-f]{32}$/);
  });

  it("change chaque jour, d'un site à l'autre, d'un visiteur à l'autre et selon le sel", () => {
    const headers = visitor({ "x-forwarded-for": "203.0.113.7", "user-agent": CHROME });
    const base = anonymousVisitorId(headers, SITE, { now: NOW, salt: "sel" });
    // Même jour, même visiteur, même site : même identifiant (c'est ce qui compte les visiteurs)
    expect(anonymousVisitorId(headers, SITE, { now: new Date("2026-11-12T23:59:59Z"), salt: "sel" })).toBe(base);
    expect(anonymousVisitorId(headers, SITE, { now: new Date("2026-11-13T00:00:01Z"), salt: "sel" })).not.toBe(base);
    expect(anonymousVisitorId(headers, `${SITE}:external`, { now: NOW, salt: "sel" })).not.toBe(base);
    expect(anonymousVisitorId(visitor({ "x-forwarded-for": "203.0.113.8", "user-agent": CHROME }), SITE, { now: NOW, salt: "sel" })).not.toBe(base);
    expect(anonymousVisitorId(visitor({ "x-forwarded-for": "203.0.113.7", "user-agent": "Autre" }), SITE, { now: NOW, salt: "sel" })).not.toBe(base);
    expect(anonymousVisitorId(headers, SITE, { now: NOW, salt: "autre sel" })).not.toBe(base);
  });

  it("IP : première adresse de x-forwarded-for, sinon x-real-ip, sinon 0.0.0.0", () => {
    const digest = (ip: string) => `anon-${createHash("sha256").update(`sel:2026-11-12:${ip}::${SITE}`).digest("hex").slice(0, 32)}`;
    expect(anonymousVisitorId(visitor({ "x-forwarded-for": " 198.51.100.4 , 10.0.0.1" }), SITE, { now: NOW, salt: "sel" })).toBe(digest("198.51.100.4"));
    expect(anonymousVisitorId(visitor({ "x-real-ip": "198.51.100.5" }), SITE, { now: NOW, salt: "sel" })).toBe(digest("198.51.100.5"));
    expect(anonymousVisitorId(visitor({}), SITE, { now: NOW, salt: "sel" })).toBe(digest("0.0.0.0"));
  });
});
