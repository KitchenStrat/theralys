import { afterEach, describe, expect, it, vi } from "vitest";
import { BILLING_PERIODS, PLAN_COMPLETE, PLAN_SCALE, PLAN_SITE, periodTotal, planPrice, savedAmount } from "@theralys/db/plans";
import { LANDING_TEXT_MAX, landingTextFromHtml, landingUrl, loadLandingText, resetLandingCache } from "./landing";
import {
  EMPTY_KNOWLEDGE_FILTERS,
  FALLBACK_CATEGORY,
  KNOWLEDGE_CATEGORIES,
  categoryLabel,
  closest,
  hasKnowledgeFilters,
  isKnowledgeCategory,
  knowledgeHref,
  parseKnowledgeFilters,
  questionKey,
  questionTerms,
  relevance,
} from "./model";
import { productFacts } from "./product";

describe("rubriques de la base", () => {
  it("identifiants uniques, la dernière reçoit ce qui ne va nulle part ailleurs", () => {
    const ids = KNOWLEDGE_CATEGORIES.map((category) => category.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[ids.length - 1]).toBe(FALLBACK_CATEGORY);
    expect(isKnowledgeCategory("tarifs")).toBe(true);
    expect(isKnowledgeCategory("inventée")).toBe(false);
    expect(categoryLabel("tarifs")).toBe("Tarifs et engagement");
    expect(categoryLabel("inventée")).toBe("Autres sujets");
  });
});

describe("retrouver une question déjà posée", () => {
  it("la même question, à la casse, aux accents et à la ponctuation près, a la même clé", () => {
    expect(questionKey("Y a-t-il un engagement ?")).toBe("y a t il un engagement");
    expect(questionKey("  y a t'il un ENGAGEMENT  ")).toBe("y a t il un engagement");
    expect(questionKey("C'est trop cher !")).toBe(questionKey("c’est trop cher"));
    expect(questionKey("Le cœur du métier")).toBe("le coeur du metier");
    expect(questionKey("???")).toBe("");
    expect(questionKey("mot ".repeat(200)).length).toBeLessThanOrEqual(300);
  });

  it("mots porteurs : sans mots creux, ramenés à leur début", () => {
    expect(questionTerms("J'ai déjà un site, pourquoi changer ?")).toEqual(["site", "change"]);
    expect(questionTerms("Mes sites")).toEqual(["sites"]);
    expect(questionTerms("Et vous ?")).toEqual([]);
  });

  it("proximité : part des mots de la question retrouvés", () => {
    const terms = questionTerms("Quel est le prix de la formule Site ?");
    expect(relevance(terms, "Le prix de la formule Site en annuel")).toBe(1);
    expect(relevance(terms, "Le prix de Scale")).toBeCloseTo(1 / 3);
    expect(relevance(terms, "Instagram")).toBe(0);
    expect(relevance([], "n'importe quoi")).toBe(0);
  });

  it("fiches les plus proches d'abord ; à égalité, l'ordre d'arrivée ; en dessous du seuil, écartées", () => {
    const items = ["Instagram et Facebook", "Le prix est-il négociable ?", "Combien coûte la formule Site ?", "Le prix de la formule Site en annuel"];
    expect(closest("Quel est le prix de la formule Site ?", items, (item) => item, 3)).toEqual([items[3], items[2], items[1]]);
    expect(closest("Quel est le prix de la formule Site ?", items, (item) => item, 10, 0.34)).toEqual([items[3], items[2]]);
    expect(closest("Et vous ?", items, (item) => item, 2)).toEqual([items[0], items[1]]);
  });
});

describe("filtres de la page", () => {
  it("lus dans l'adresse, valeurs inconnues écartées", () => {
    expect(parseKnowledgeFilters({})).toEqual(EMPTY_KNOWLEDGE_FILTERS);
    expect(parseKnowledgeFilters({ q: "  prix  ", rubrique: "tarifs", type: "objection", etat: "review", moi: "1", tri: "recent" })).toEqual({ q: "prix", category: "tarifs", kind: "objection", status: "review", mine: true, sort: "recent" });
    expect(parseKnowledgeFilters({ rubrique: "x", type: "y", etat: "z", moi: "oui", tri: "w", q: ["a", "b"] })).toEqual({ ...EMPTY_KNOWLEDGE_FILTERS, q: "a" });
    expect(parseKnowledgeFilters({ q: "x".repeat(500) }).q).toHaveLength(80);
  });

  it("adresse d'un jeu de filtres : seul ce qui s'écarte du défaut y figure", () => {
    expect(knowledgeHref(EMPTY_KNOWLEDGE_FILTERS)).toBe("/crm/questions");
    const filters = { q: "nom de domaine", category: "site", kind: "question", status: "", mine: true, sort: "recent" } as const;
    expect(knowledgeHref(filters)).toBe("/crm/questions?q=nom+de+domaine&rubrique=site&type=question&moi=1&tri=recent");
    expect(parseKnowledgeFilters(Object.fromEntries(new URLSearchParams(knowledgeHref(filters).split("?")[1])))).toEqual(filters);
    expect(hasKnowledgeFilters(EMPTY_KNOWLEDGE_FILTERS)).toBe(false);
    expect(hasKnowledgeFilters({ ...EMPTY_KNOWLEDGE_FILTERS, sort: "recent" })).toBe(false);
    expect(hasKnowledgeFilters({ ...EMPTY_KNOWLEDGE_FILTERS, mine: true })).toBe(true);
  });
});

describe("faits du produit donnés à l'assistant", () => {
  const facts = productFacts();
  const euros = (value: number) => `${value.toLocaleString("fr-FR").replace(/[\u00a0\u202f]/g, " ")} €`;

  it("chaque prix de chaque choix, sur chaque durée, vient de la définition du produit", () => {
    for (const plan of [PLAN_SITE, PLAN_SCALE, PLAN_COMPLETE]) {
      for (const period of BILLING_PERIODS) {
        expect(facts, `${plan} ${period}`).toContain(`${euros(planPrice(plan, period) ?? -1)} par mois`);
        if (period !== "monthly") expect(facts, `${plan} ${period}`).toContain(`soit ${euros(periodTotal(plan, period) ?? -1)} réglés`);
      }
    }
  });

  it("économies et engagement : mois offerts, euros sur la durée d'engagement, 12 mois au moins, 3 ans pour la formule 3 ans", () => {
    expect(facts).toContain(`- Annuel : 4 mois offerts (−33 % par rapport au mensuel), soit sur 12 mois : Site ${euros(savedAmount(PLAN_SITE, "annual"))}, Scale ${euros(savedAmount(PLAN_SCALE, "annual"))}, Site + Scale ${euros(savedAmount(PLAN_COMPLETE, "annual"))}.`);
    expect(facts).toContain("- 3 ans : 18 mois offerts (−50 % par rapport au mensuel), soit sur 3 ans :");
    expect(facts).not.toContain("Mensuel : 0 mois");
    expect(facts).toContain("- 12 mois minimum, quelle que soit la durée de facturation.");
    expect(facts).toContain("- 3 ans : engagement de 3 ans.");
  });

  it("contenu des formules : ce que la vitrine annonce, rien de plus — et aucune espace insécable (texte brut pour le modèle)", () => {
    expect(facts).toContain("6 pages de spécialités");
    expect(facts).toContain("4 articles par semaine, soit 208 par an");
    expect(facts).toContain("Google Ads et Meta Ads : diagnostic, plan d'action et contenus (le budget publicitaire n'est pas compris)");
    expect(facts).toContain("Elle ne comprend pas le site");
    // Le suivi des mots-clés du site n'est pas encore ouvert aux clients : il n'est pas annoncé
    expect(facts.toLowerCase()).not.toContain("search console");
    expect(/[\u00a0\u202f]/.test(facts)).toBe(false);
  });
});

const PAGE = `<!doctype html><html><head><title>Harmony</title><style>.a{color:red}</style></head><body>
<header><a href="#tarifs">Tarifs</a></header>
<main id="contenu">
  <div><h1>Tout le digital de votre cabinet, enfin <span>réuni</span></h1><p>Harmony s&#x27;occupe de votre pr&eacute;sence en ligne&nbsp;: site, blog &amp; fiche Google.</p>
  <div class="marquee"><span>Google</span> <span>Instagram</span> <span>Google</span> <span>Instagram</span> <span>Google</span> <span>Instagram</span></div></div>
  <section id="outils" class="x"><h2>Sept outils. <strong>Un seul espace</strong> .</h2><svg><path d="M0 0"/><text>dessin</text></svg><ul><li>Blog SEO</li><li>Fiche Google</li></ul><script>window.x = "<p>code</p>"</script></section>
  <section class="y" id="temoignages"><h2>Ils en parlent</h2><p>Claire, sophrologue : « Mon agenda est plein. »</p></section>
  <section id="faq"><h2>Questions fréquentes</h2><button>Y a-t-il un engagement ?</button><div inert><p>Oui, de <strong>12 mois minimum</strong> .</p></div><p>Blog SEO</p></section>
  <section id="demo"><h2>Demandez votre démo</h2><label>Votre nom</label><input name="name"/></section>
</main><footer><p>Mentions légales</p></footer></body></html>`;

describe("texte de la page publique", () => {
  it("le texte de la page, section par section, sans scripts, styles ni dessins", () => {
    expect(landingTextFromHtml(PAGE).split("\n")).toEqual([
      "Tout le digital de votre cabinet, enfin réuni",
      "Harmony s'occupe de votre présence en ligne : site, blog & fiche Google.",
      "Google Instagram",
      "Sept outils. Un seul espace.",
      "Blog SEO",
      "Fiche Google",
      "Questions fréquentes",
      "Y a-t-il un engagement ?",
      "Oui, de 12 mois minimum.",
    ]);
  });

  it("ni témoignages (des illustrations), ni formulaire, ni en-tête ou pied de page", () => {
    const text = landingTextFromHtml(PAGE);
    for (const absent of ["Claire", "agenda", "Ils en parlent", "Votre nom", "Demandez votre démo", "Mentions légales", "Tarifs", "dessin", "code"]) expect(text, absent).not.toContain(absent);
  });

  it("une ligne déjà lue n'est pas reprise ; le texte est borné", () => {
    expect(landingTextFromHtml(PAGE).match(/Blog SEO/g)).toHaveLength(1);
    const long = `<main>${Array.from({ length: 5_000 }, (_, i) => `<p>Phrase numéro ${i} de la page.</p>`).join("")}</main>`;
    expect(landingTextFromHtml(long).length).toBeLessThanOrEqual(LANDING_TEXT_MAX);
  });

  it("page sans balise main : tout le document est lu", () => {
    expect(landingTextFromHtml("<div><p>Bonjour</p><p>le monde</p></div>")).toBe("Bonjour\nle monde");
  });
});

describe("lecture de la page publique", () => {
  const html = `<main><h1>Harmony</h1>${Array.from({ length: 30 }, (_, i) => `<p>Argument numéro ${i} de la page de présentation.</p>`).join("")}</main>`;
  const response = (body: string, status = 200) => new Response(body, { status, headers: { "content-type": "text/html" } });

  afterEach(() => {
    resetLandingCache();
    vi.restoreAllMocks();
  });

  it("adresse : celle de WEB_BASE_URL si elle est bien formée, sinon la production", () => {
    expect(landingUrl({} as NodeJS.ProcessEnv)).toBe("https://www.harmony-web.fr");
    expect(landingUrl({ WEB_BASE_URL: "http://localhost:3013/" } as unknown as NodeJS.ProcessEnv)).toBe("http://localhost:3013");
    expect(landingUrl({ WEB_BASE_URL: "pas une adresse" } as unknown as NodeJS.ProcessEnv)).toBe("https://www.harmony-web.fr");
  });

  it("lue une fois, gardée une heure, relue ensuite", async () => {
    let at = 1_000_000;
    const fetcher = vi.fn(async () => response(html));
    const deps = { fetch: fetcher as unknown as typeof fetch, now: () => at };
    const text = await loadLandingText({} as NodeJS.ProcessEnv, deps);
    expect(text).toContain("Argument numéro 29");
    expect(fetcher).toHaveBeenCalledWith("https://www.harmony-web.fr", expect.objectContaining({ cache: "no-store" }));
    at += 59 * 60 * 1000;
    await loadLandingText({} as NodeJS.ProcessEnv, deps);
    expect(fetcher).toHaveBeenCalledTimes(1);
    at += 2 * 60 * 1000;
    await loadLandingText({} as NodeJS.ProcessEnv, deps);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("page injoignable, en erreur ou vide : le dernier texte lu sert encore ; sans lui, rien — et l'assistant répond sans elle", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    let at = 0;
    const failing = { fetch: (async () => { throw new Error("réseau"); }) as unknown as typeof fetch, now: () => at };
    expect(await loadLandingText({} as NodeJS.ProcessEnv, failing)).toBe("");
    expect(await loadLandingText({} as NodeJS.ProcessEnv, { fetch: (async () => response("erreur", 503)) as unknown as typeof fetch, now: () => at })).toBe("");
    expect(await loadLandingText({} as NodeJS.ProcessEnv, { fetch: (async () => response("<main></main>")) as unknown as typeof fetch, now: () => at })).toBe("");
    const good = await loadLandingText({} as NodeJS.ProcessEnv, { fetch: (async () => response(html)) as unknown as typeof fetch, now: () => at });
    at += 2 * 60 * 60 * 1000;
    expect(await loadLandingText({} as NodeJS.ProcessEnv, failing)).toBe(good);
  });
});
