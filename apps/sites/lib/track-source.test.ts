import { describe, expect, it } from "vitest";
import { isOwnHost, ownHostsFor, resolveTrackSource } from "./track-source";

const OWN = ["demo.harmony-web.fr", "claire-sophrologie.fr"];

describe("resolveTrackSource", () => {
  it("première page : src du lien de bio, puis hôte du referrer, referrer vide = accès direct", () => {
    expect(resolveTrackSource({ type: "pageview", referrer: "", src: "ig" }, OWN)).toBe("instagram");
    expect(resolveTrackSource({ type: "pageview", referrer: "https://l.instagram.com/?u=x" }, OWN)).toBe("instagram");
    expect(resolveTrackSource({ type: "pageview", referrer: "https://www.google.fr/" }, OWN)).toBe("google");
    expect(resolveTrackSource({ type: "pageview", referrer: "" }, OWN)).toBe("direct");
    expect(resolveTrackSource({ type: "pageview", referrer: "https://annuaire.exemple.fr/p" }, OWN)).toBe("other");
  });

  it("referrer d'une application Android : réseau de l'application, jamais « le site lui-même »", () => {
    expect(resolveTrackSource({ type: "pageview", referrer: "android-app://com.instagram.android" }, OWN)).toBe("instagram");
    expect(resolveTrackSource({ type: "pageview", referrer: "android-app://com.facebook.orca/" }, OWN)).toBe("facebook");
    expect(resolveTrackSource({ type: "pageview", referrer: "android-app://com.linkedin.android" }, OWN)).toBe("linkedin");
    expect(resolveTrackSource({ type: "pageview", referrer: "android-app://com.google.android.gm" }, OWN)).toBe("google");
    expect(resolveTrackSource({ type: "pageview", referrer: "android-app://com.autre.app" }, OWN)).toBe("other");
    expect(isOwnHost("android-app://com.instagram.android", OWN)).toBe(false);
  });

  it("pages suivantes (sans referrer ni src) et clics RDV : non renseigné", () => {
    expect(resolveTrackSource({ type: "pageview" }, OWN)).toBeNull();
    expect(resolveTrackSource({ type: "rdv_click", referrer: "https://l.instagram.com/", src: "ig" }, OWN)).toBeNull();
  });

  it("referrer sur le site lui-même : navigation interne → null, pas « autres sites »", () => {
    expect(resolveTrackSource({ type: "pageview", referrer: "https://demo.harmony-web.fr/claire/motifs" }, OWN)).toBeNull();
    expect(resolveTrackSource({ type: "pageview", referrer: "https://Claire-Sophrologie.fr/" }, OWN)).toBeNull();
    // Le src du lien de bio l'emporte même avec un referrer interne
    expect(resolveTrackSource({ type: "pageview", referrer: "https://claire-sophrologie.fr/", src: "fb" }, OWN)).toBe("facebook");
  });
});

describe("isOwnHost", () => {
  it("compare les hôtes sans port ni casse, tolère un referrer invalide", () => {
    expect(isOwnHost("http://localhost:3000/claire", ["localhost"])).toBe(true);
    expect(isOwnHost("https://www.demo.harmony-web.fr/", ["demo.harmony-web.fr"])).toBe(false);
    expect(isOwnHost("pas une url", ["demo.harmony-web.fr"])).toBe(false);
    expect(isOwnHost(undefined, ["demo.harmony-web.fr"])).toBe(false);
    expect(isOwnHost("https://x.fr/", [""])).toBe(false);
  });
});

describe("ownHostsFor", () => {
  it("hôte de la requête (sans port), domaine du site, SITES_BASE_URL et DEMO_HOST, dédoublonnés", () => {
    const hosts = ownHostsFor(
      "localhost:3000",
      { domain: "Claire-Sophrologie.fr" },
      { SITES_BASE_URL: "https://demo.harmony-web.fr/", DEMO_HOST: "harmony-sites.vercel.app" },
    );
    expect(hosts).toEqual(["localhost", "claire-sophrologie.fr", "demo.harmony-web.fr", "harmony-sites.vercel.app"]);
    expect(ownHostsFor(null, { domain: null }, { SITES_BASE_URL: "nope" })).toEqual([]);
  });
});
