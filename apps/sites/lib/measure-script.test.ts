import vm from "node:vm";
import { BOOKING_PLATFORM_HOSTS, EXTERNAL_MEASURE_OPTOUT, EXTERNAL_MEASURE_PATH, parseExternalMeasure } from "@theralys/shared";
import { describe, expect, it } from "vitest";
import {
  INERT_MEASURE_SCRIPT,
  MEASURE_INERT_MAX_AGE_S,
  MEASURE_SCRIPT_MAX_AGE_S,
  measureBookingHosts,
  measureEndpoint,
  measureScript,
} from "./measure-script";

const KEY = "abcdefghijklmnopqrstuvwx";
const ENDPOINT = "https://demo.harmony-web.fr/api/m";
const SITE_URL = "https://www.mon-cabinet.fr";
const HOSTS = measureBookingHosts("https://rdv.mon-agenda.example/cabinet", SITE_URL);
const SCRIPT = measureScript({ key: KEY, endpoint: ENDPOINT, bookingHosts: HOSTS });

// ─── Navigateur simulé ───────────────────────────────────────────────────────
// Le script est exécuté tel qu'il est servi, dans un contexte isolé où chaque objet du navigateur est remplacé
// par un double : ce qui part (sendBeacon, fetch), ce qui est écrit (localStorage) et tout accès à ce que le
// script n'a pas le droit de lire (paramètres d'adresse, cookies, sessionStorage, empreinte) y sont relevés.

type Listener = (event: unknown) => void;
type Sent = { via: "beacon" | "fetch"; url: unknown; body: unknown; init?: unknown };

type BrowserOptions = {
  path?: string;
  hash?: string;
  hostname?: string;
  referrer?: string;
  /** Type de navigation (`navigate`, `reload`, `back_forward`) ; `null` : le navigateur ne le donne pas */
  navigationType?: string | null;
  storage?: Record<string, string>;
  storageThrows?: boolean;
  gpc?: boolean;
  doNotTrack?: string | null;
  webdriver?: boolean;
  prerendering?: boolean;
  hidden?: boolean;
  beacon?: "ok" | "refused" | "throws" | "missing";
  fetch?: "ok" | "rejects" | "missing";
  navigationApi?: boolean;
};

function fakeBrowser(options: BrowserOptions = {}) {
  const sent: Sent[] = [];
  const forbidden: string[] = [];
  const storageWrites: string[] = [];
  const storage = new Map<string, string>(Object.entries(options.storage ?? {}));
  const listeners = new Map<string, { listener: Listener; options: unknown }[]>();
  const timers: { callback: () => void; delay: unknown }[] = [];

  const listen = (target: string) => (type: string, listener: Listener, listenerOptions?: unknown) => {
    const name = `${target}:${type}`;
    listeners.set(name, [...(listeners.get(name) ?? []), { listener, options: listenerOptions }]);
  };
  // Propriétés interdites : tout accès est relevé
  const trap = <T extends object>(target: T, name: string, properties: string[]): T => {
    for (const property of properties) {
      Object.defineProperty(target, property, {
        configurable: true,
        get() {
          forbidden.push(`${name}.${property}`);
          return undefined;
        },
        set() {
          forbidden.push(`${name}.${property} =`);
        },
      });
    }
    return target;
  };

  const location = trap(
    { pathname: options.path ?? "/", hash: options.hash ?? "", hostname: options.hostname ?? "www.mon-cabinet.fr" },
    "location",
    ["search", "href", "searchParams", "origin", "host"],
  );
  const document = trap(
    {
      referrer: options.referrer ?? "",
      prerendering: options.prerendering ?? false,
      hidden: options.hidden ?? false,
      addEventListener: listen("document"),
    },
    "document",
    ["cookie", "URL", "documentURI", "baseURI", "title", "body", "createElement", "querySelectorAll"],
  );
  const navigator = trap(
    {
      globalPrivacyControl: options.gpc,
      doNotTrack: options.doNotTrack === undefined ? null : options.doNotTrack,
      webdriver: options.webdriver ?? false,
      ...(options.beacon === "missing"
        ? {}
        : {
            sendBeacon(url: unknown, body: unknown) {
              if (options.beacon === "throws") throw new Error("sendBeacon indisponible");
              if (options.beacon === "refused") return false;
              sent.push({ via: "beacon", url, body });
              return true;
            },
          }),
    },
    "navigator",
    ["userAgent", "userAgentData", "language", "languages", "platform", "plugins", "hardwareConcurrency", "deviceMemory", "cookieEnabled"],
  );
  const storageAccess = <T>(action: () => T): T => {
    if (options.storageThrows) throw new Error("stockage refusé");
    return action();
  };
  const localStorage = {
    getItem: (name: string) => storageAccess(() => storage.get(name) ?? null),
    setItem: (name: string, value: unknown) =>
      storageAccess(() => {
        storageWrites.push(name);
        storage.set(name, String(value));
      }),
    removeItem: (name: string) =>
      storageAccess(() => {
        storageWrites.push(name);
        storage.delete(name);
      }),
  };
  const fetchDouble = (url: unknown, init?: { body?: unknown }) => {
    sent.push({ via: "fetch", url, body: init?.body, init });
    return options.fetch === "rejects" ? Promise.reject(new Error("réseau coupé")) : Promise.resolve({});
  };
  const window = trap(
    {
      addEventListener: listen("window"),
      ...(options.navigationApi === false ? {} : { navigation: { addEventListener: listen("navigation") } }),
    } as Record<string, unknown>,
    "window",
    ["sessionStorage", "history", "screen", "indexedDB", "XMLHttpRequest", "fetch", "name", "opener"],
  );
  const navigationType = options.navigationType === undefined ? "navigate" : options.navigationType;
  const sandbox = trap(
    {
      window,
      document,
      navigator,
      location,
      localStorage,
      performance: { getEntriesByType: (type: string) => (type === "navigation" && navigationType !== null ? [{ type: navigationType }] : []) },
      ...(options.fetch === "missing" ? {} : { fetch: fetchDouble }),
      setInterval: (callback: () => void, delay: unknown) => {
        timers.push({ callback, delay });
        return timers.length;
      },
      URL,
    } as Record<string, unknown>,
    "global",
    ["sessionStorage", "history", "screen", "indexedDB", "XMLHttpRequest", "caches", "Image"],
  );
  const context = vm.createContext(sandbox);

  return {
    sent,
    forbidden,
    storage,
    storageWrites,
    listeners,
    timers,
    location,
    document,
    window,
    sandbox,
    fetchDouble,
    run: (script: string = SCRIPT) => {
      vm.runInContext(script, context);
    },
    fire: (target: "window" | "document" | "navigation", type: string, event: unknown = {}) => {
      for (const entry of listeners.get(`${target}:${type}`) ?? []) entry.listener(event);
    },
    /** Un battement de la vérification périodique du chemin */
    tick: () => {
      for (const timer of timers) timer.callback();
    },
    /** Visites envoyées, décodées */
    events: () => sent.map((item) => JSON.parse(String(item.body)) as Record<string, unknown>),
  };
}

/** Clic sur un élément situé dans un lien (ou hors de tout lien si `anchor` est `null`). */
const clickOn = (anchor: Record<string, unknown> | null, button = 0) => ({
  button,
  target: { closest: (selector: string) => (selector === "a" ? anchor : null) },
});
const link = (hostname: string) => ({ hostname, protocol: "https:" });
const TEL = { hostname: "", protocol: "tel:" };

// ─── Texte du script ─────────────────────────────────────────────────────────

describe("measureScript — texte servi", () => {
  // Le commentaire d'en-tête (« sans cookie… ») n'est pas du code
  const code = SCRIPT.replace(/\/\*[\s\S]*?\*\//g, "");

  it("embarque la clé, l'adresse de réception, les hôtes de rendez-vous et les constantes du refus", () => {
    expect(SCRIPT).toContain(`K="${KEY}"`);
    expect(SCRIPT).toContain(`U="${ENDPOINT}"`);
    for (const host of [...BOOKING_PLATFORM_HOSTS, "rdv.mon-agenda.example"]) expect(SCRIPT).toContain(`"${host}"`);
    expect(SCRIPT).toContain(`S="${EXTERNAL_MEASURE_OPTOUT.storageKey}"`);
    expect(SCRIPT).toContain(`"${EXTERNAL_MEASURE_OPTOUT.off}"`);
    expect(SCRIPT).toContain(`"${EXTERNAL_MEASURE_OPTOUT.on}"`);
  });

  it("fonction immédiate, protégée d'un bout à l'autre, JavaScript valide", () => {
    expect(SCRIPT).toMatch(/^\/\*[^*]*\*\/\n\(\(\)=>\{try\{\n[\s\S]*\n\}catch\{\}\}\)\(\);\n$/);
    expect(() => new vm.Script(SCRIPT)).not.toThrow();
  });

  it("reste petit : moins de 2,5 Ko avant compression, en ASCII", () => {
    expect(Buffer.byteLength(SCRIPT, "utf8")).toBeLessThan(2500);
    expect(SCRIPT).toMatch(/^[\x20-\x7e\n]*$/);
    // Même avec une adresse de réception et un hôte de rendez-vous très longs
    const long = measureScript({
      key: KEY,
      endpoint: `https://${"sous-domaine.".repeat(6)}harmony-web.fr/api/m`,
      bookingHosts: measureBookingHosts(`https://${"rendez-vous.".repeat(5)}exemple.fr/`, SITE_URL),
    });
    expect(Buffer.byteLength(long, "utf8")).toBeLessThan(2500);
  });

  it("ne contient rien de ce qui ferait sortir de la simple mesure d'audience", () => {
    for (const banned of [
      "cookie",
      "sessionStorage",
      "indexedDB",
      ".search",
      "searchParams",
      ".href",
      "utm",
      "gclid",
      "fbclid",
      "userAgent",
      "screen",
      "language",
      "canvas",
      "XMLHttpRequest",
      "pushState",
      "replaceState",
      "prototype",
      "eval",
      "document.write",
      "innerHTML",
    ]) {
      expect(code, banned).not.toContain(banned);
    }
    // Seule écriture dans le navigateur : le refus du visiteur
    expect(code.match(/localStorage\.\w+/g)).toEqual(["localStorage.setItem", "localStorage.removeItem", "localStorage.getItem"]);
    // L'envoi prévu : sendBeacon en texte brut, sinon fetch sans identifiants ni lecture de la réponse
    expect(code).toContain("n.sendBeacon(U,b)");
    expect(code).toContain('fetch(U,{method:"POST",body:b,keepalive:true,credentials:"omit",mode:"no-cors"})');
    expect(code).not.toContain("headers");
  });

  it("clé invalide : script inerte, qui ne reprend rien de la demande", () => {
    for (const key of ["", "abc", "ABCDEFGHIJKLMNOPQRSTUVWX", `${KEY}x`, 'x";alert(1);//aaaaaaaaaaaaa', "</script><script>alert(1)"]) {
      const script = measureScript({ key, endpoint: ENDPOINT, bookingHosts: HOSTS });
      expect(script).toBe(INERT_MEASURE_SCRIPT);
    }
    expect(INERT_MEASURE_SCRIPT).toMatch(/^\/\*[^*]*\*\/\n$/);
    const browser = fakeBrowser();
    browser.run(INERT_MEASURE_SCRIPT);
    expect(browser.sent).toEqual([]);
    expect(browser.listeners.size).toBe(0);
  });

  it("durées de cache : une heure pour un site connu, courte pour le script inerte", () => {
    expect(MEASURE_SCRIPT_MAX_AGE_S).toBe(3600);
    expect(MEASURE_INERT_MAX_AGE_S).toBeGreaterThan(0);
    expect(MEASURE_INERT_MAX_AGE_S).toBeLessThanOrEqual(600);
  });
});

describe("measureScript — échappement des valeurs embarquées", () => {
  const hostile = {
    // Séparateur de ligne Unicode écrit par son code : jamais tel quel dans un fichier source
    endpoint: `https://exemple.fr/api/m?a="+alert(1)+"&b=</script><script>alert(2)</script>${String.fromCharCode(0x2028)}alert(3)\\`,
    hosts: ['"];alert(4);//', "</script><img src=x onerror=alert(5)>", "a\nb", "normal.fr"],
  };
  const script = measureScript({ key: KEY, endpoint: hostile.endpoint, bookingHosts: hostile.hosts });

  it("aucun caractère capable de fermer une balise ou une ligne ne passe tel quel", () => {
    // Aucun chevron ouvrant dans tout le script : ni </script>, ni <!--, même recopié dans une page
    expect(script).not.toContain("<");
    expect(SCRIPT).not.toContain("<");
    // La ligne des valeurs embarquées ne porte ni chevron ni esperluette
    const constants = script.split("\n")[2] ?? "";
    expect(constants.startsWith("const w=window,")).toBe(true);
    expect(constants).not.toMatch(/[<>&]/);
    expect(script).not.toContain(String.fromCharCode(0x2028));
    expect(script).not.toContain(String.fromCharCode(0x2029));
    expect(script.split("\n")).toHaveLength(SCRIPT.split("\n").length);
    expect(() => new vm.Script(script)).not.toThrow();
  });

  it("les valeurs restent des données : rien n'est exécuté, et elles arrivent intactes", () => {
    const alerts: unknown[] = [];
    const browser = fakeBrowser({ beacon: "refused" });
    browser.sandbox.alert = (value: unknown) => alerts.push(value);
    browser.run(script);
    expect(alerts).toEqual([]);
    // L'adresse de réception est celle fournie, au caractère près
    expect(browser.sent).toHaveLength(1);
    expect(browser.sent[0]?.url).toBe(hostile.endpoint);
    // Les hôtes aussi : seul l'hôte « normal.fr » peut correspondre à un lien
    browser.fire("document", "click", clickOn(link("www.normal.fr")));
    browser.fire("document", "click", clickOn(link("b")));
    expect(browser.events().map((event) => event.t)).toEqual(["p", "r"]);
    expect(alerts).toEqual([]);
  });
});

// ─── Comportement dans le navigateur ─────────────────────────────────────────

describe("script de mesure — première page vue", () => {
  it("visiteur venu d'un autre site : l'hôte de ce site, jamais son adresse ni ses paramètres", () => {
    const browser = fakeBrowser({ path: "/sophrologie/stress", referrer: "https://www.google.com/search?q=sophrologue+albi&gclid=abc" });
    browser.run();
    expect(browser.sent).toHaveLength(1);
    expect(browser.sent[0]).toEqual({ via: "beacon", url: ENDPOINT, body: `{"k":"${KEY}","t":"p","p":"/sophrologie/stress","r":"www.google.com"}` });
    // Corps en chaîne : le navigateur l'envoie en text/plain, sans requête préalable
    expect(typeof browser.sent[0]?.body).toBe("string");
  });

  it("sans site d'origine : accès direct", () => {
    const browser = fakeBrowser({ path: "/", referrer: "" });
    browser.run();
    expect(browser.events()).toEqual([{ k: KEY, t: "p", p: "/", r: "direct" }]);
  });

  it("navigation interne : pas de provenance", () => {
    const browser = fakeBrowser({ path: "/contact", referrer: "https://www.mon-cabinet.fr/tarifs?utm_source=x" });
    browser.run();
    expect(browser.events()).toEqual([{ k: KEY, t: "p", p: "/contact" }]);
  });

  it("rechargement et retour arrière : pas de provenance, même venu d'un autre site ou sans site d'origine", () => {
    for (const navigationType of ["reload", "back_forward"]) {
      for (const referrer of ["https://www.google.com/", "", "https://www.mon-cabinet.fr/"]) {
        const browser = fakeBrowser({ path: "/tarifs", referrer, navigationType });
        browser.run();
        expect(browser.events(), `${navigationType} ${referrer}`).toEqual([{ k: KEY, t: "p", p: "/tarifs" }]);
      }
    }
  });

  it("navigateur qui ne donne pas le type de navigation : traité comme une arrivée normale", () => {
    const direct = fakeBrowser({ referrer: "", navigationType: null });
    direct.run();
    expect(direct.events()).toEqual([{ k: KEY, t: "p", p: "/", r: "direct" }]);
    const broken = fakeBrowser({ referrer: "https://l.instagram.com/?u=x" });
    broken.sandbox.performance = undefined;
    broken.run();
    expect(broken.events()).toEqual([{ k: KEY, t: "p", p: "/", r: "l.instagram.com" }]);
  });

  it("site d'origine illisible : accès direct, sans erreur", () => {
    const browser = fakeBrowser({ referrer: "pas une adresse" });
    expect(() => browser.run()).not.toThrow();
    expect(browser.events()).toEqual([{ k: KEY, t: "p", p: "/", r: "direct" }]);
  });

  it("application Android : le nom du paquet tient lieu d'hôte", () => {
    const browser = fakeBrowser({ referrer: "android-app://com.instagram.android/" });
    browser.run();
    expect(browser.events()).toEqual([{ k: KEY, t: "p", p: "/", r: "com.instagram.android" }]);
  });

  it("tout ce qui part respecte le contrat de réception", () => {
    const browser = fakeBrowser({ path: "/a", referrer: "https://www.Google.fr/" });
    browser.run();
    browser.fire("document", "click", clickOn(TEL));
    browser.fire("document", "click", clickOn(link("www.doctolib.fr")));
    expect(browser.sent).toHaveLength(3);
    expect(browser.sent.map((item) => parseExternalMeasure(String(item.body)))).toEqual([
      { k: KEY, t: "p", p: "/a", r: "www.google.fr" },
      { k: KEY, t: "c", p: "/a" },
      { k: KEY, t: "r", p: "/a" },
    ]);
  });

  it("balise collée deux fois ou réinjectée : une seule exécution", () => {
    const browser = fakeBrowser({ referrer: "https://www.google.com/" });
    browser.run();
    browser.run();
    expect(browser.sent).toHaveLength(1);
    expect(browser.timers).toHaveLength(1);
    expect(browser.listeners.get("document:click")).toHaveLength(1);
  });
});

describe("script de mesure — refus du visiteur et signaux de confidentialité", () => {
  const { off, on, storageKey } = EXTERNAL_MEASURE_OPTOUT;

  /** Une visite complète : chargement, changement de page, clics. */
  const fullVisit = (browser: ReturnType<typeof fakeBrowser>) => {
    browser.run();
    browser.location.pathname = "/autre";
    browser.fire("navigation", "currententrychange");
    browser.fire("window", "popstate");
    browser.tick();
    browser.fire("window", "pageshow", { persisted: true });
    browser.fire("document", "click", clickOn(link("www.doctolib.fr")));
    browser.fire("document", "auxclick", clickOn(TEL, 1));
  };

  it("page ouverte avec l'ancre « off » : le refus est enregistré, rien ne part", () => {
    const browser = fakeBrowser({ hash: off });
    fullVisit(browser);
    expect(browser.storage.get(storageKey)).toBe("1");
    expect(browser.sent).toEqual([]);
  });

  it("refus enregistré : rien ne part aux visites suivantes, et rien d'autre n'est écrit", () => {
    const browser = fakeBrowser({ storage: { [storageKey]: "1" } });
    fullVisit(browser);
    expect(browser.sent).toEqual([]);
    expect(browser.storageWrites).toEqual([]);
  });

  it("page ouverte avec l'ancre « on » : le refus est levé, la mesure reprend", () => {
    const browser = fakeBrowser({ hash: on, storage: { [storageKey]: "1" }, referrer: "" });
    browser.run();
    expect(browser.storage.has(storageKey)).toBe(false);
    expect(browser.events()).toEqual([{ k: KEY, t: "p", p: "/", r: "direct" }]);
  });

  it("lien de refus cliqué sur la page déjà ouverte (changement d'ancre) : pris en compte aussitôt", () => {
    const browser = fakeBrowser();
    browser.run();
    expect(browser.sent).toHaveLength(1);
    browser.location.hash = off;
    browser.fire("window", "hashchange");
    expect(browser.storage.get(storageKey)).toBe("1");
    browser.fire("document", "click", clickOn(TEL));
    expect(browser.sent).toHaveLength(1);
    browser.location.hash = on;
    browser.fire("window", "hashchange");
    browser.fire("document", "click", clickOn(TEL));
    expect(browser.sent).toHaveLength(2);
  });

  it("une autre ancre n'écrit rien", () => {
    const browser = fakeBrowser({ hash: "#contact" });
    browser.run();
    browser.location.hash = "#mesure-offf";
    browser.fire("window", "hashchange");
    expect(browser.storageWrites).toEqual([]);
    expect(browser.sent).toHaveLength(1);
  });

  it("seule clé jamais écrite : celle du refus", () => {
    const browser = fakeBrowser({ hash: off });
    fullVisit(browser);
    browser.location.hash = on;
    browser.fire("window", "hashchange");
    expect(new Set(browser.storageWrites)).toEqual(new Set([storageKey]));
  });

  it("Global Privacy Control, Do Not Track, navigateur piloté : rien ne part", () => {
    for (const options of [{ gpc: true }, { doNotTrack: "1" }, { webdriver: true }] satisfies BrowserOptions[]) {
      const browser = fakeBrowser(options);
      fullVisit(browser);
      expect(browser.sent, JSON.stringify(options)).toEqual([]);
    }
    // Do Not Track non activé : la mesure a lieu
    for (const doNotTrack of ["0", "unspecified", null]) {
      const browser = fakeBrowser({ doNotTrack, gpc: false });
      browser.run();
      expect(browser.sent, String(doNotTrack)).toHaveLength(1);
    }
  });

  it("stockage du navigateur refusé : la mesure a lieu, sans erreur", () => {
    const browser = fakeBrowser({ storageThrows: true, hash: off });
    expect(() => fullVisit(browser)).not.toThrow();
    expect(browser.sent.length).toBeGreaterThan(0);
  });

  it("page en pré-rendu : rien ne part avant que le visiteur l'affiche", () => {
    const browser = fakeBrowser({ prerendering: true, referrer: "https://www.google.com/", path: "/tarifs" });
    browser.run();
    // Même si la page change de chemin pendant le pré-rendu
    browser.fire("navigation", "currententrychange");
    browser.tick();
    expect(browser.sent).toEqual([]);
    expect(browser.listeners.get("document:prerenderingchange")?.[0]?.options).toEqual({ once: true });
    browser.document.prerendering = false;
    browser.fire("document", "prerenderingchange");
    expect(browser.events()).toEqual([{ k: KEY, t: "p", p: "/tarifs", r: "www.google.com" }]);
  });
});

describe("script de mesure — sites monopages", () => {
  it("API Navigation : une page vue par changement de chemin, sans provenance, jamais en double", () => {
    const browser = fakeBrowser({ path: "/", referrer: "https://www.google.com/" });
    browser.run();
    browser.location.pathname = "/tarifs";
    browser.fire("navigation", "currententrychange");
    browser.fire("navigation", "currententrychange");
    browser.fire("window", "popstate");
    browser.tick();
    expect(browser.events()).toEqual([
      { k: KEY, t: "p", p: "/", r: "www.google.com" },
      { k: KEY, t: "p", p: "/tarifs" },
    ]);
    // Retour à l'accueil puis de nouveau les tarifs : chaque page affichée compte
    browser.location.pathname = "/";
    browser.fire("window", "popstate");
    browser.location.pathname = "/tarifs";
    browser.fire("navigation", "currententrychange");
    expect(browser.events().map((event) => event.p)).toEqual(["/", "/tarifs", "/", "/tarifs"]);
  });

  it("changement d'ancre ou de paramètres sans changement de chemin : rien", () => {
    const browser = fakeBrowser({ path: "/tarifs" });
    browser.run();
    browser.location.hash = "#seance";
    browser.fire("navigation", "currententrychange");
    browser.fire("window", "hashchange");
    browser.fire("window", "popstate");
    browser.tick();
    expect(browser.sent).toHaveLength(1);
  });

  it("navigateur sans API Navigation : le chemin est comparé tant que la page est visible", () => {
    const browser = fakeBrowser({ navigationApi: false, path: "/" });
    expect(() => browser.run()).not.toThrow();
    expect(browser.listeners.has("navigation:currententrychange")).toBe(false);
    expect(browser.timers).toHaveLength(1);
    expect(browser.timers[0]?.delay).toBe(1000);
    browser.tick();
    expect(browser.sent).toHaveLength(1);
    browser.location.pathname = "/contact";
    browser.document.hidden = true;
    browser.tick();
    expect(browser.sent).toHaveLength(1);
    browser.document.hidden = false;
    browser.tick();
    browser.tick();
    expect(browser.events()).toEqual([
      { k: KEY, t: "p", p: "/", r: "direct" },
      { k: KEY, t: "p", p: "/contact" },
    ]);
  });

  it("page ressortie du cache du navigateur : recomptée, sans provenance", () => {
    const browser = fakeBrowser({ path: "/tarifs", referrer: "https://www.google.com/" });
    browser.run();
    browser.fire("window", "pageshow", { persisted: false });
    expect(browser.sent).toHaveLength(1);
    browser.fire("window", "pageshow", { persisted: true });
    expect(browser.events()).toEqual([
      { k: KEY, t: "p", p: "/tarifs", r: "www.google.com" },
      { k: KEY, t: "p", p: "/tarifs" },
    ]);
  });
});

describe("script de mesure — clics", () => {
  const visit = () => {
    const browser = fakeBrowser({ path: "/contact" });
    browser.run();
    browser.sent.length = 0;
    return browser;
  };

  it("écoute click et auxclick sur le document, en phase de capture", () => {
    const browser = visit();
    expect(browser.listeners.get("document:click")).toHaveLength(1);
    expect(browser.listeners.get("document:click")?.[0]?.options).toBe(true);
    expect(browser.listeners.get("document:auxclick")?.[0]?.options).toBe(true);
  });

  it("lien vers une plateforme de rendez-vous ou vers le lien de rendez-vous du praticien : clic de rendez-vous", () => {
    const browser = visit();
    for (const host of ["doctolib.fr", "www.doctolib.fr", "calendly.com", "cabinet.simplybook.it", "rdv.mon-agenda.example", "x.rdv.mon-agenda.example"]) {
      browser.fire("document", "click", clickOn(link(host)));
    }
    expect(browser.events()).toEqual(Array.from({ length: 6 }, () => ({ k: KEY, t: "r", p: "/contact" })));
  });

  it("lien tel: : clic d'appel, sans le numéro", () => {
    const browser = visit();
    browser.fire("document", "click", clickOn(TEL));
    expect(browser.sent.map((item) => item.body)).toEqual([`{"k":"${KEY}","t":"c","p":"/contact"}`]);
  });

  it("rien d'autre n'est relevé", () => {
    const browser = visit();
    const others: unknown[] = [
      clickOn(link("www.mon-cabinet.fr")),
      clickOn(link("www.instagram.com")),
      // Hôte qui se termine comme une plateforme sans en être un sous-domaine
      clickOn(link("fauxdoctolib.fr")),
      clickOn(link("doctolib.fr.exemple.com")),
      clickOn({ hostname: "", protocol: "mailto:" }),
      // Lien sans adresse, lien SVG (ni hôte ni protocole)
      clickOn({ hostname: "", protocol: ":" }),
      clickOn({}),
      // Clic hors de tout lien
      clickOn(null),
    ];
    for (const event of others) browser.fire("document", "click", event);
    expect(browser.sent).toEqual([]);
  });

  it("clic du milieu compté, clic droit et boutons latéraux ignorés", () => {
    const browser = visit();
    browser.fire("document", "auxclick", clickOn(link("www.doctolib.fr"), 1));
    browser.fire("document", "auxclick", clickOn(link("www.doctolib.fr"), 2));
    browser.fire("document", "auxclick", clickOn(TEL, 3));
    expect(browser.events()).toEqual([{ k: KEY, t: "r", p: "/contact" }]);
  });

  it("cible inattendue (document, événement vide) : aucune erreur dans la page", () => {
    const browser = visit();
    expect(() => {
      browser.fire("document", "click", { button: 0, target: {} });
      browser.fire("document", "click", { button: 0, target: null });
      browser.fire("document", "click", {});
      browser.fire("document", "click", null);
      browser.fire("window", "pageshow", null);
    }).not.toThrow();
    expect(browser.sent).toEqual([]);
  });
});

describe("script de mesure — envoi", () => {
  it("sendBeacon refuse, échoue ou manque : repli sur fetch, sans identifiants ni lecture de la réponse", () => {
    for (const beacon of ["refused", "throws", "missing"] as const) {
      const browser = fakeBrowser({ beacon, path: "/tarifs", referrer: "" });
      expect(() => browser.run(), beacon).not.toThrow();
      expect(browser.sent, beacon).toEqual([
        {
          via: "fetch",
          url: ENDPOINT,
          body: `{"k":"${KEY}","t":"p","p":"/tarifs","r":"direct"}`,
          init: { method: "POST", body: `{"k":"${KEY}","t":"p","p":"/tarifs","r":"direct"}`, keepalive: true, credentials: "omit", mode: "no-cors" },
        },
      ]);
    }
  });

  it("sendBeacon accepte : pas de second envoi", () => {
    const browser = fakeBrowser();
    browser.run();
    expect(browser.sent.map((item) => item.via)).toEqual(["beacon"]);
  });

  it("réseau coupé ou fetch absent : rien ne remonte dans la page", async () => {
    const rejected = fakeBrowser({ beacon: "refused", fetch: "rejects" });
    expect(() => rejected.run()).not.toThrow();
    rejected.fire("document", "click", clickOn(TEL));
    // Laisse aux promesses rejetées le temps de se manifester : une promesse non traitée ferait échouer le test
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(rejected.sent).toHaveLength(2);

    const none = fakeBrowser({ beacon: "missing", fetch: "missing" });
    expect(() => {
      none.run();
      none.fire("document", "click", clickOn(TEL));
      none.tick();
    }).not.toThrow();
    expect(none.sent).toEqual([]);
  });

  it("ne remplace ni fetch ni aucune fonction de la page", () => {
    const browser = fakeBrowser();
    browser.run();
    expect(browser.sandbox.fetch).toBe(browser.fetchDouble);
    expect(browser.sandbox.URL).toBe(URL);
    expect(Object.keys(browser.window).sort()).toEqual(["__mesure", "addEventListener", "navigation"]);
  });
});

describe("script de mesure — ce qu'il ne lit jamais", () => {
  it("ni paramètres d'adresse, ni cookie, ni sessionStorage, ni empreinte du navigateur", () => {
    const browser = fakeBrowser({ path: "/tarifs", referrer: "https://www.google.com/search?q=x&gclid=abc" });
    browser.run();
    browser.location.pathname = "/contact";
    browser.fire("navigation", "currententrychange");
    browser.fire("window", "popstate");
    browser.fire("window", "hashchange");
    browser.fire("window", "pageshow", { persisted: true });
    browser.tick();
    browser.fire("document", "click", clickOn(link("www.doctolib.fr")));
    browser.fire("document", "auxclick", clickOn(TEL, 1));
    expect(browser.sent).toHaveLength(5);
    expect(browser.forbidden).toEqual([]);
    // Chaque envoi : clé, type, chemin et, pour la première page, l'hôte d'origine — rien de plus
    for (const event of browser.events()) {
      expect(Object.keys(event).filter((name) => !["k", "t", "p", "r"].includes(name))).toEqual([]);
      expect(JSON.stringify(event)).not.toMatch(/gclid|search|\?/);
    }
    expect(browser.storageWrites).toEqual([]);
  });
});

describe("script de mesure — page hôte inattendue", () => {
  it("objets du navigateur absents ou incomplets : aucune erreur", () => {
    for (const sandbox of [{}, { window: {}, document: {}, navigator: {}, location: {} }, { window: null, document: null, navigator: null, location: null }]) {
      expect(() => vm.runInContext(SCRIPT, vm.createContext(sandbox))).not.toThrow();
    }
  });
});

// ─── Valeurs réunies par la route ────────────────────────────────────────────

describe("measureBookingHosts", () => {
  it("les plateformes connues, puis l'hôte du lien de rendez-vous du praticien, sans « www. »", () => {
    expect(measureBookingHosts(null, SITE_URL)).toEqual([...BOOKING_PLATFORM_HOSTS]);
    expect(measureBookingHosts("https://www.mon-agenda.example/cabinet-dupont?ref=site", SITE_URL)).toEqual([...BOOKING_PLATFORM_HOSTS, "mon-agenda.example"]);
    expect(measureBookingHosts("http://Rdv.Mon-Agenda.Example:8080/", SITE_URL)).toEqual([...BOOKING_PLATFORM_HOSTS, "rdv.mon-agenda.example"]);
  });

  it("lien déjà couvert par une plateforme : pas de doublon", () => {
    expect(measureBookingHosts("https://calendly.com/demo-theralys", SITE_URL)).toEqual([...BOOKING_PLATFORM_HOSTS]);
    expect(measureBookingHosts("https://www.doctolib.fr/sophrologue/albi/claire-dupont", SITE_URL)).toEqual([...BOOKING_PLATFORM_HOSTS]);
    expect(measureBookingHosts("https://cabinet-dupont.simplybook.it/v2/", SITE_URL)).toEqual([...BOOKING_PLATFORM_HOSTS]);
  });

  it("lien de rendez-vous sur le site du client lui-même : écarté, ses liens internes ne sont pas des rendez-vous", () => {
    expect(measureBookingHosts("https://www.mon-cabinet.fr/prendre-rendez-vous", SITE_URL)).toEqual([...BOOKING_PLATFORM_HOSTS]);
    expect(measureBookingHosts("https://mon-cabinet.fr/rdv", "https://www.mon-cabinet.fr/cabinet")).toEqual([...BOOKING_PLATFORM_HOSTS]);
    // Un sous-domaine consacré à la réservation reste reconnu
    expect(measureBookingHosts("https://rdv.mon-cabinet.fr/", SITE_URL)).toEqual([...BOOKING_PLATFORM_HOSTS, "rdv.mon-cabinet.fr"]);
  });

  it("numéro de téléphone, adresse invalide, hôte inattendu : ignorés", () => {
    for (const bookingUrl of ["tel:+33612345678", "mailto:claire@exemple.fr", "pas une adresse", "", "   ", "https://localhost/rdv", "https://[::1]/rdv", 'https://a"b.exemple.fr/', "javascript:alert(1)"]) {
      expect(measureBookingHosts(bookingUrl, SITE_URL), bookingUrl).toEqual([...BOOKING_PLATFORM_HOSTS]);
    }
    expect(measureBookingHosts(undefined, "adresse illisible")).toEqual([...BOOKING_PLATFORM_HOSTS]);
  });
});

describe("measureEndpoint", () => {
  it("même hôte (port compris) et même chemin que le script", () => {
    expect(measureEndpoint(new URL("https://demo.harmony-web.fr/api/m?k=abc"))).toBe(`https://demo.harmony-web.fr${EXTERNAL_MEASURE_PATH}`);
    expect(measureEndpoint(new URL("http://localhost:3037/api/m?k=abc"), null)).toBe("http://localhost:3037/api/m");
  });

  it("derrière un proxy qui termine le TLS : https rétabli, jamais l'inverse", () => {
    expect(measureEndpoint(new URL("http://demo.harmony-web.fr/api/m"), "https")).toBe("https://demo.harmony-web.fr/api/m");
    expect(measureEndpoint(new URL("http://demo.harmony-web.fr/api/m"), "HTTPS, http")).toBe("https://demo.harmony-web.fr/api/m");
    expect(measureEndpoint(new URL("https://demo.harmony-web.fr/api/m"), "http")).toBe("https://demo.harmony-web.fr/api/m");
    expect(measureEndpoint(new URL("http://localhost:3037/api/m"), "http")).toBe("http://localhost:3037/api/m");
    expect(measureEndpoint(new URL("http://localhost:3037/api/m"), "wss")).toBe("http://localhost:3037/api/m");
  });
});
