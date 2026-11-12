import {
  BOOKING_PLATFORM_HOSTS,
  EXTERNAL_MEASURE_OPTOUT,
  EXTERNAL_MEASURE_PATH,
  bareHost,
  externalHosts,
  isExternalMeasureKey,
} from "@theralys/shared";

/**
 * Code de mesure collé par le praticien sur son propre site (`GET /api/m?k=…`,
 * cf. « Code de mesure » dans `@theralys/shared` external-site.ts).
 *
 * Le script est écrit pour rester une simple mesure d'audience, dispensée de
 * consentement par la CNIL : ni cookie ni identifiant, aucun paramètre
 * d'adresse (donc aucun identifiant de campagne), le site d'où vient le
 * visiteur réduit à son hôte, et le refus du visiteur respecté. Tout ce qui
 * ferait sortir de ce cadre est interdit ici, et vérifié par les tests.
 *
 * Fonctions pures : le script est généré à partir de valeurs déjà chargées,
 * la route ne fait que les réunir.
 */

/** Durée de cache du script d'un site connu (secondes) : une heure, le temps qu'un changement de lien de rendez-vous se propage. */
export const MEASURE_SCRIPT_MAX_AGE_S = 3600;

/** Durée de cache du script inerte (secondes) : courte, pour qu'une clé tout juste activée soit vite servie. */
export const MEASURE_INERT_MAX_AGE_S = 300;

/** Script servi pour une clé invalide, inconnue ou d'un site archivé : il ne fait rien. La clé demandée n'y est jamais reprise. */
export const INERT_MEASURE_SCRIPT = "/* Mesure d'audience inactive. */\n";

/** Les seules valeurs propres à un site que le script embarque. */
export type MeasureScriptInput = {
  /** Clé publique du site (`external_sites.measure_key`) */
  key: string;
  /** Adresse absolue de réception des visites (même hôte et même chemin que le script) */
  endpoint: string;
  /** Hôtes dont un lien vaut un clic de rendez-vous (cf. `measureBookingHosts`) */
  bookingHosts: readonly string[];
};

// Caractères à ne jamais laisser tels quels dans du JavaScript servi : chevrons et esperluette (une balise
// </script> si le code est un jour recopié dans une page) et séparateurs de ligne Unicode, écrits par leurs codes
const UNSAFE_IN_SCRIPT = new RegExp(`[<>&${String.fromCharCode(0x2028, 0x2029)}]`, "g");

/** Valeur → littéral JavaScript : JSON, puis échappement des caractères qui pourraient fermer une balise ou une ligne. */
function jsLiteral(value: unknown): string {
  return JSON.stringify(value).replace(UNSAFE_IN_SCRIPT, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

/**
 * Script de mesure d'un site : texte JavaScript autonome (aucune dépendance,
 * navigateurs à jour), enveloppé dans une fonction immédiate et protégé pour
 * ne jamais lever d'erreur dans la page qui l'accueille. Clé invalide →
 * script inerte.
 *
 * Ce qu'il envoie, et rien d'autre : une page vue par page (`t: "p"`), un clic
 * vers une plateforme de rendez-vous (`t: "r"`), un clic sur un lien `tel:`
 * (`t: "c"`), chacun avec la clé et le chemin de la page.
 */
export function measureScript(input: MeasureScriptInput): string {
  if (!isExternalMeasureKey(input.key)) return INERT_MEASURE_SCRIPT;
  const key = jsLiteral(input.key);
  const endpoint = jsLiteral(input.endpoint);
  const hosts = jsLiteral([...input.bookingHosts]);
  const storageKey = jsLiteral(EXTERNAL_MEASURE_OPTOUT.storageKey);
  const hashOff = jsLiteral(EXTERNAL_MEASURE_OPTOUT.off);
  const hashOn = jsLiteral(EXTERNAL_MEASURE_OPTOUT.on);

  return [
    "/* Mesure d'audience sans cookie ni suivi publicitaire. */",
    "(()=>{try{",
    `const w=window,d=document,n=navigator,l=location,K=${key},U=${endpoint},B=${hosts},S=${storageKey};`,
    // Une seule exécution par page, même si la balise est collée deux fois ou réinjectée à chaque navigation (Wix)
    "if(w.__mesure)return;",
    "w.__mesure=1;",
    // Chemin de la dernière page comptée
    "let last;",
    // Refus du visiteur : seule valeur jamais écrite dans le navigateur, posée par l'ancre « off », levée par « on »
    `const opt=()=>{try{l.hash==${hashOff}?localStorage.setItem(S,"1"):l.hash==${hashOn}&&localStorage.removeItem(S)}catch{}},`,
    // Rien ne part : refus enregistré, signal Global Privacy Control ou Do Not Track, navigateur piloté, page en pré-rendu
    'off=()=>{try{if(localStorage.getItem(S))return 1}catch{}return n.globalPrivacyControl||n.doNotTrack=="1"||n.webdriver||d.prerendering},',
    // Envoi : sendBeacon (texte brut, donc sans requête préalable), sinon fetch sans identifiants ni lecture de la réponse.
    // Le chemin seul : jamais location.search, donc aucun paramètre de campagne
    'send=(t,r)=>{try{if(off())return;const b=JSON.stringify({k:K,t,p:l.pathname,r});try{if(n.sendBeacon(U,b))return}catch{}fetch(U,{method:"POST",body:b,keepalive:true,credentials:"omit",mode:"no-cors"}).catch(()=>{})}catch{}},',
    // Navigation dans un site monopage : une page vue quand le chemin change, sans provenance
    'page=()=>{l.pathname!=last&&(last=l.pathname,send("p"))},',
    // Première page vue : hôte du site d'où vient le visiteur, « direct » sans site d'origine, rien pour la
    // navigation interne, un rechargement ou un retour arrière (la provenance n'est comptée qu'une fois)
    'first=()=>{let h="",t,r;try{h=new URL(d.referrer).hostname}catch{}try{t=performance.getEntriesByType("navigation")[0].type}catch{}if(t!="reload"&&t!="back_forward"){if(!h)r="direct";else if(h!=l.hostname)r=h}last=l.pathname;send("p",r)},',
    // Clics : lien vers une plateforme de rendez-vous, lien tel: — rien d'autre n'est relevé
    'click=e=>{try{if(e.button>1)return;const a=e.target.closest("a");if(!a)return;const h=a.hostname||"";a.protocol=="tel:"?send("c"):B.some(b=>h==b||h.endsWith("."+b))&&send("r")}catch{}};',
    "opt();",
    // Page en pré-rendu : la page vue attend que le visiteur l'affiche vraiment
    'd.prerendering?d.addEventListener("prerenderingchange",first,{once:true}):first();',
    'w.addEventListener("hashchange",opt);',
    // Changements de page sans rechargement : API Navigation, retour arrière, puis simple comparaison du chemin
    // tant que la page est visible — jamais de remplacement de fetch, de history.pushState ou d'un prototype,
    // que certains constructeurs de sites verrouillent
    'w.navigation&&w.navigation.addEventListener("currententrychange",page);',
    'w.addEventListener("popstate",page);',
    // Page ressortie du cache du navigateur (retour arrière) : le script ne se relance pas, la page est recomptée ici
    'w.addEventListener("pageshow",e=>{e&&e.persisted&&send("p")});',
    "setInterval(()=>{d.hidden||page()},1e3);",
    // Phase de capture : le clic est vu même si un gestionnaire du site l'arrête ; auxclick = clic du milieu
    'd.addEventListener("click",click,true);',
    'd.addEventListener("auxclick",click,true)',
    "}catch{}})();",
    "",
  ].join("\n");
}

// Forme d'un nom d'hôte public : lettres, chiffres, tirets et points — tout autre hôte est écarté du script
const HOST_SHAPE = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/;

/** Hôte (sans « www. ») d'un lien de rendez-vous web ; `null` pour un `tel:`, une adresse invalide ou un hôte inattendu. */
function bookingHostOf(bookingUrl: string | null | undefined): string | null {
  if (!bookingUrl) return null;
  let parsed: URL;
  try {
    parsed = new URL(bookingUrl.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  const host = bareHost(parsed.hostname);
  return host.includes(".") && HOST_SHAPE.test(host) ? host : null;
}

/**
 * Hôtes dont un lien compte comme un clic de rendez-vous sur le site du
 * client : les plateformes connues, plus l'hôte du lien de rendez-vous du
 * praticien (`sites.booking_url`) quand c'est une adresse web.
 *
 * Deux cas écartés : un hôte déjà couvert par une plateforme, et un lien de
 * rendez-vous qui mène au site du client lui-même (`siteUrl`) — tous ses
 * liens internes seraient sinon comptés comme des rendez-vous.
 */
export function measureBookingHosts(bookingUrl: string | null | undefined, siteUrl: string): string[] {
  const hosts = [...BOOKING_PLATFORM_HOSTS];
  const own = bookingHostOf(bookingUrl);
  if (own && !externalHosts(siteUrl).includes(own) && !hosts.some((host) => own === host || own.endsWith(`.${host}`))) {
    hosts.push(own);
  }
  return hosts;
}

/**
 * Adresse de réception des visites : même hôte et même chemin que le script,
 * pour que le site du client n'ait qu'un hôte à autoriser. Derrière un proxy
 * qui termine le TLS, la requête arrive en http : `forwardedProto` rétablit
 * alors https (jamais l'inverse), sans quoi le navigateur bloquerait l'envoi
 * depuis une page https.
 */
export function measureEndpoint(requestUrl: { protocol: string; host: string }, forwardedProto?: string | null): string {
  const secure = requestUrl.protocol === "https:" || forwardedProto?.split(",")[0]?.trim().toLowerCase() === "https";
  return `${secure ? "https" : "http"}://${requestUrl.host}${EXTERNAL_MEASURE_PATH}`;
}
