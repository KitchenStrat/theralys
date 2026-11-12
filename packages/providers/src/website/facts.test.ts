import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EMPTY_EXTERNAL_FACTS, type ExternalSiteFacts } from "@theralys/shared";
import { loadDocument } from "./extract";
import { cleanEmail, collectPageFacts, detectCms, detectTags, displayPhone, mergeSiteFacts, normalizeColor, openingHoursLabels, postalAddressLine, readJsonLd, socialProfileOf, type PageFacts } from "./facts";
import { timed } from "./test-timing";

const fixture = (name: string): string => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const SITE = "https://www.mon-cabinet.fr/";
const pageFacts = (html: string, url = SITE): PageFacts => collectPageFacts(loadDocument(html), html, url);
const siteFacts = (html: string, url = SITE): ExternalSiteFacts => mergeSiteFacts([pageFacts(html, url)]);
const jsonLd = (data: unknown): string => `<script type="application/ld+json">${JSON.stringify(data)}</script>`;

describe("faits d'une page d'accueil de type WordPress", () => {
  const html = fixture("wordpress-home.html");
  const facts = mergeSiteFacts([pageFacts(html, "https://www.atelier-serenite-nantes.fr/")], "Atelier Sérénité – Hélène Roux, sophrologue à Nantes");

  it("nom, description et langue : l'établissement des données structurées donne le nom", () => {
    // Les entités HTML laissées dans le JSON-LD sont décodées
    expect(facts.name).toBe("Atelier Sérénité & Sophrologie");
    expect(facts.description).toMatch(/^Hélène Roux, sophrologue certifiée à Nantes/);
    expect(facts.language).toBe("fr-FR");
  });

  it("coordonnées : téléphone à la française, courriel en minuscules, adresse sur une ligne — une seule fois chacune", () => {
    expect(facts.phones).toEqual(["02 61 91 23 45"]);
    expect(facts.emails).toEqual(["bonjour@atelier-serenite-nantes.fr"]);
    expect(facts.address).toBe("7 rue Crébillon, 44000 Nantes");
  });

  it("horaires en français, jours consécutifs regroupés, horaires saisonniers ignorés", () => {
    expect(facts.hours).toEqual([
      { label: "Lundi et mardi", value: "9h – 12h30, 14h – 19h" },
      { label: "Jeudi et vendredi", value: "9h – 12h30, 14h – 19h" },
      { label: "Samedi", value: "9h – 13h" },
    ]);
  });

  it("lien de rendez-vous : plateforme reconnue, paramètres de suivi retirés, cité une seule fois", () => {
    expect(facts.bookingLinks).toEqual([{ url: "https://www.resalib.fr/praticien/12345-helene-roux", platform: "resalib" }]);
  });

  it("réseaux sociaux : pages de profil seulement — ni bouton de partage, ni vidéo", () => {
    expect(facts.social).toEqual({
      instagram: "https://www.instagram.com/atelier.serenite.nantes",
      linkedin: "https://www.linkedin.com/in/helene-roux-sophrologue",
      facebook: "https://www.facebook.com/ateliersereniteNantes",
    });
  });

  it("balises repérées dans le code : Analytics, Tag Manager, Ads, Pixel Meta, bandeau de consentement, code de mesure du studio", () => {
    expect(facts.tags).toEqual({ googleAnalyticsId: "G-7QK2XW9LMP", googleTagManagerId: "GTM-K7WLP2X", googleAdsId: "AW-11223344556", metaPixelId: "1029384756102938", consentBanner: true, measureSnippet: true });
  });

  it("outil de création, logo et couleur du site", () => {
    expect(facts.cms).toBe("wordpress");
    expect(facts.logoUrl).toBe("https://www.atelier-serenite-nantes.fr/wp-content/uploads/2024/03/logo-atelier-serenite.png");
    expect(facts.themeColor).toBe("#3a7d6b");
  });

  it("l'auteur d'un avis n'est jamais pris pour le praticien", () => {
    const { entities } = readJsonLd(loadDocument(html), "https://www.atelier-serenite-nantes.fr/");
    expect(entities.map((entity) => entity.name)).toEqual(["Atelier Sérénité & Sophrologie", "Hélène Roux"]);
    expect(JSON.stringify(facts)).not.toContain("Margaux");
  });
});

describe("faits d'une page de constructeur de site", () => {
  const facts = siteFacts(fixture("builder-home.html"), "https://www.jardins-de-maelle.fr/");

  it("établissement, coordonnées et horaires écrits en texte (« Mo-We 09:00-18:30 »)", () => {
    expect(facts.name).toBe("Les Jardins de Maëlle");
    expect(facts.phones).toEqual(["04 65 71 03 21"]);
    expect(facts.emails).toEqual(["contact@jardins-de-maelle.fr"]);
    expect(facts.address).toBe("3 chemin des Sources, 74000 Annecy");
    expect(facts.hours).toEqual([
      { label: "Lundi au mercredi", value: "9h – 18h30" },
      { label: "Vendredi", value: "9h – 12h, 14h – 17h" },
    ]);
  });

  it("agenda intégré et action de réservation : un seul lien de rendez-vous ; l'agenda du site lui-même n'en est pas un", () => {
    expect(facts.bookingLinks).toEqual([{ url: "https://calendly.com/maelle-bonnet/bilan", platform: "calendly" }]);
  });

  it("profil Facebook sans nom (profile.php?id=…), chaîne YouTube ; une page de découverte TikTok n'est pas un profil", () => {
    expect(facts.social).toEqual({ facebook: "https://www.facebook.com/profile.php?id=100064815237944", youtube: "https://www.youtube.com/@jardinsdemaelle" });
  });

  it("identifiant Analytics trouvé dans la configuration, bandeau de consentement, outil, logo, couleur du thème clair", () => {
    expect(facts.tags).toEqual({ googleAnalyticsId: "G-M4ELL3B0NN", consentBanner: true });
    expect(facts.cms).toBe("wix");
    expect(facts.logoUrl).toBe("https://static.wixstatic.com/media/a1b2c3_logo~mv2.png");
    expect(facts.themeColor).toBe("#5e8c6a");
  });
});

describe("données structurées", () => {
  it("types d'établissement : LocalBusiness et sous-types, MedicalBusiness, types multiples, adresses de vocabulaire", () => {
    for (const type of ["LocalBusiness", "MedicalBusiness", "HealthAndBeautyBusiness", "ProfessionalService", "MedicalClinic", "Physician", "DaySpa", "BeautySalon", ["Thing", "LocalBusiness"], "https://schema.org/LocalBusiness", "schema:MedicalBusiness"]) {
      expect(siteFacts(jsonLd({ "@type": type, name: "Cabinet du Parc", telephone: "0465710001" })).phones, JSON.stringify(type)).toEqual(["04 65 71 00 01"]);
    }
  });

  it("sous-type inconnu : reconnu comme établissement s'il porte une adresse et un téléphone", () => {
    const known = siteFacts(jsonLd({ "@type": "Osteopathic", name: "Cabinet d'ostéopathie", telephone: "04 65 71 00 02", address: { streetAddress: "1 place du Marché", postalCode: "69001", addressLocality: "Lyon" } }));
    expect(known).toMatchObject({ name: "Cabinet d'ostéopathie", phones: ["04 65 71 00 02"], address: "1 place du Marché, 69001 Lyon" });
    expect(siteFacts(jsonLd({ "@type": "Osteopathic", name: "Sans coordonnées" })).name).toBeUndefined();
  });

  it("contenus et pages (article, produit, avis, fil d'Ariane) : jamais pris pour le praticien", () => {
    for (const type of ["Article", "BlogPosting", "Product", "Review", "BreadcrumbList", "FAQPage", "WebPage", "Service", "Event", "ImageObject"]) {
      const facts = siteFacts(jsonLd({ "@type": type, name: "Titre d'un contenu", telephone: "04 65 71 00 03", author: { "@type": "Person", name: "Un auteur", telephone: "04 65 71 00 04" } }));
      expect([facts.name, facts.phones], type).toEqual([undefined, []]);
    }
  });

  it("entité rangée sous une page, un service ou un graphe : trouvée", () => {
    const nested = { "@context": "https://schema.org", "@type": "WebPage", name: "Accueil", mainEntity: { "@type": "LocalBusiness", name: "Cabinet imbriqué", telephone: "04 65 71 00 05" } };
    expect(siteFacts(jsonLd(nested)).name).toBe("Cabinet imbriqué");
    const service = [{ "@type": "Service", name: "Séance", provider: { "@type": "LocalBusiness", name: "Cabinet prestataire" } }];
    expect(siteFacts(jsonLd(service)).name).toBe("Cabinet prestataire");
    const graph = { "@graph": [{ "@type": "WebSite", name: "Nom du site" }, { "@type": "Organization", name: "Organisation", contactPoint: [{ "@type": "ContactPoint", telephone: "+33 4 65 71 00 06", email: "Accueil@Mon-Cabinet.fr" }] }] };
    expect(siteFacts(jsonLd(graph))).toMatchObject({ name: "Organisation", phones: ["04 65 71 00 06"], emails: ["accueil@mon-cabinet.fr"] });
  });

  it("ordre de confiance du nom : établissement, organisation, og:site_name, WebSite, personne, titre de l'accueil", () => {
    const business = { "@type": "LocalBusiness", name: "Établissement" };
    const organization = { "@type": "Organization", name: "Organisation" };
    const website = { "@type": "WebSite", name: "Site" };
    const person = { "@type": "Person", name: "Claire Praticienne" };
    const og = `<meta property="og:site_name" content="Nom Open Graph">`;
    const name = (html: string): string | undefined => mergeSiteFacts([pageFacts(html)], "Titre de l'accueil").name;
    expect(name(jsonLd([person, website, organization, business]) + og)).toBe("Établissement");
    expect(name(jsonLd([person, website, organization]) + og)).toBe("Organisation");
    expect(name(jsonLd([person, website]) + og)).toBe("Nom Open Graph");
    expect(name(jsonLd([person, website]))).toBe("Site");
    expect(name(jsonLd([person]))).toBe("Claire Praticienne");
    expect(name("<p>rien</p>")).toBe("Titre de l'accueil");
    expect(mergeSiteFacts([pageFacts("<p>rien</p>")]).name).toBeUndefined();
  });

  it("JSON invalide, bloc commenté, bloc démesuré, valeurs inattendues : ignorés sans erreur", () => {
    const html = `<script type="application/ld+json">{ pas du json</script>
      <script type="application/ld+json"><!--\n{"@type":"LocalBusiness","name":"Bloc commenté"}\n--></script>
      <script type="application/ld+json">${JSON.stringify({ "@type": "LocalBusiness", name: "x".repeat(250_000) })}</script>
      ${jsonLd({ "@type": "LocalBusiness", name: { "@value": "objet" }, telephone: 465710007, email: 12, address: 42, openingHours: { a: 1 }, sameAs: [1, null, "pas une adresse"], logo: { url: 3 } })}
      ${jsonLd("une chaîne")}${jsonLd(null)}${jsonLd([[[[[[{ "@type": "LocalBusiness", name: "Trop profond" }]]]]]])}`;
    const facts = siteFacts(html);
    expect(facts).toMatchObject({ name: "Bloc commenté", phones: [], emails: [], hours: [], social: {} });
    expect(facts).not.toHaveProperty("address");
    expect(facts).not.toHaveProperty("logoUrl");
  });

  it("un texte des données structurées ne garde ni balise ni entité", () => {
    const facts = siteFacts(jsonLd({ "@type": "LocalBusiness", name: "Cabinet <b>Zen</b> &amp; Vous", description: "Massages &#8211; détente<br>au cabinet<img src=x onerror=alert(1)>" }));
    expect(facts.name).toBe("Cabinet Zen & Vous");
    expect(facts.description).toBe("Massages – détente au cabinet");
  });

  it("un bloc que la page referme trop tôt (« </script> » dans une valeur) est illisible : ignoré, comme dans un navigateur", () => {
    const facts = siteFacts(jsonLd({ "@type": "LocalBusiness", name: "Cabinet", description: "avant</script><p>après" }));
    expect(facts.name).toBeUndefined();
  });

  it("postalAddressLine : rue, code postal et ville ; pays ajouté seulement hors de France", () => {
    expect(postalAddressLine({ streetAddress: "12 rue Tronchet", postalCode: "69006", addressLocality: "Lyon", addressCountry: "FR" })).toBe("12 rue Tronchet, 69006 Lyon");
    expect(postalAddressLine({ streetAddress: "Rue du Marché 4", postalCode: "1204", addressLocality: "Genève", addressCountry: { "@type": "Country", name: "Suisse" } })).toBe("Rue du Marché 4, 1204 Genève, Suisse");
    expect(postalAddressLine({ postalCode: "75011", addressLocality: "Paris" })).toBe("75011 Paris");
    expect(postalAddressLine("  12 rue Tronchet,\n69006 Lyon ")).toBe("12 rue Tronchet, 69006 Lyon");
    expect(postalAddressLine([{ streetAddress: "1 quai Est", addressLocality: "Brest" }, { addressLocality: "Autre" }])).toBe("1 quai Est, Brest");
    // Une rue seule, un pays seul ou rien : pas une adresse
    expect(postalAddressLine({ streetAddress: "12 rue Tronchet" })).toBeUndefined();
    expect(postalAddressLine({ addressCountry: "FR" })).toBeUndefined();
    expect(postalAddressLine(undefined)).toBeUndefined();
    expect(postalAddressLine(42)).toBeUndefined();
    expect(postalAddressLine({ streetAddress: "x".repeat(300), postalCode: "69006", addressLocality: "Lyon" })!.length).toBeLessThanOrEqual(160);
  });
});

describe("openingHoursLabels", () => {
  const spec = (dayOfWeek: unknown, opens: string, closes: string): Record<string, unknown> => ({ "@type": "OpeningHoursSpecification", dayOfWeek, opens, closes });

  it("jours consécutifs aux mêmes horaires : « Lundi au vendredi », deux jours : « et », jour seul", () => {
    expect(openingHoursLabels([spec(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], "09:00", "19:00"), spec("Saturday", "09:00", "12:30")], undefined)).toEqual([
      { label: "Lundi au vendredi", value: "9h – 19h" },
      { label: "Samedi", value: "9h – 12h30" },
    ]);
    expect(openingHoursLabels([spec(["Saturday", "Sunday"], "10:00:00", "18:00:00")], undefined)).toEqual([{ label: "Samedi et dimanche", value: "10h – 18h" }]);
  });

  it("plusieurs plages dans la journée, triées ; mêmes horaires non consécutifs : lignes séparées", () => {
    expect(openingHoursLabels([spec("Monday", "14:00", "18:00"), spec("Monday", "09:00", "12:00"), spec("Wednesday", "09:00", "12:00"), spec("Wednesday", "14:00", "18:00")], undefined)).toEqual([
      { label: "Lundi", value: "9h – 12h, 14h – 18h" },
      { label: "Mercredi", value: "9h – 12h, 14h – 18h" },
    ]);
  });

  it("toute la semaine aux mêmes horaires : « Tous les jours » ; ouvert en continu ; fermé", () => {
    const week = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    expect(openingHoursLabels([spec(week, "08:00", "20:00")], undefined)).toEqual([{ label: "Tous les jours", value: "8h – 20h" }]);
    expect(openingHoursLabels([spec("Monday", "00:00", "23:59"), spec("Sunday", "00:00", "00:00")], undefined)).toEqual([
      { label: "Lundi", value: "24h/24" },
      { label: "Dimanche", value: "Fermé" },
    ]);
  });

  it("écritures des jours : nom anglais, adresse de vocabulaire, abréviation ; valeurs inconnues ignorées", () => {
    expect(openingHoursLabels([spec("http://schema.org/Tuesday", "9:00", "17:00"), spec("https://schema.org/Wednesday", "09:00", "17:00"), spec("Th", "09:00", "17:00"), spec("PublicHolidays", "09:00", "17:00"), spec("Mardi", "09:00", "17:00")], undefined)).toEqual([
      { label: "Mardi au jeudi", value: "9h – 17h" },
    ]);
  });

  it("propriété openingHours en texte : intervalles, listes, plusieurs plages, plusieurs valeurs", () => {
    expect(openingHoursLabels(undefined, ["Mo-Fr 09:00-19:00", "Sa 09:00-12:30"])).toEqual([
      { label: "Lundi au vendredi", value: "9h – 19h" },
      { label: "Samedi", value: "9h – 12h30" },
    ]);
    expect(openingHoursLabels(undefined, "Mo,We,Fr 09:00-12:00 14:00-18:00; Sa-Mo 20:00-22:00")).toEqual([
      { label: "Lundi", value: "9h – 12h, 14h – 18h, 20h – 22h" },
      { label: "Mercredi", value: "9h – 12h, 14h – 18h" },
      { label: "Vendredi", value: "9h – 12h, 14h – 18h" },
      { label: "Samedi et dimanche", value: "20h – 22h" },
    ]);
  });

  it("rien d'exploitable : aucune ligne ; jamais plus de sept lignes, libellés et valeurs courts", () => {
    expect(openingHoursLabels(undefined, undefined)).toEqual([]);
    expect(openingHoursLabels([spec("Monday", "matin", "soir"), { dayOfWeek: "Monday" }, "texte", null], ["sur rendez-vous", 12])).toEqual([]);
    const busy = openingHoursLabels(
      ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((day, index) => spec(day, `0${index + 1}:00`, "20:00")),
      undefined,
    );
    expect(busy).toHaveLength(7);
    for (const line of busy) {
      expect(line.label.length).toBeLessThanOrEqual(30);
      expect(line.value.length).toBeLessThanOrEqual(40);
    }
  });
});

describe("téléphones et courriels", () => {
  it("displayPhone : numéro français écrit par paires, quelle que soit l'écriture d'origine", () => {
    for (const raw of ["+33472000000", "+33 4 72 00 00 00", "0033472000000", "04.72.00.00.00", "04 72 00 00 00", "04%2072%2000%2000%2000", "+33 (0)4 72 00 00 00", "0472000000"]) expect(displayPhone(raw), raw).toBe("04 72 00 00 00");
    expect(displayPhone("+33639980011")).toBe("06 39 98 00 11");
  });

  it("displayPhone : numéro étranger gardé tel qu'affiché ; ce qui n'est pas un numéro : refusé", () => {
    expect(displayPhone("+41 22 555 01 23")).toBe("+41 22 555 01 23");
    expect(displayPhone("+32 2 555 12 34")).toBe("+32 2 555 12 34");
    expect(displayPhone("3620")).toBeUndefined();
    expect(displayPhone("appelez-moi")).toBeUndefined();
    expect(displayPhone("")).toBeUndefined();
    expect(displayPhone("1".repeat(30))).toBeUndefined();
  });

  it("liens tel: — toutes les écritures d'un même numéro n'en font qu'un ; classés par nombre de pages", () => {
    const home = pageFacts(`<a href="tel:+33465710021">04 65 71 00 21</a><a href="TEL:04.65.71.00.21">Appeler</a><a href="tel://0465710022">Autre</a>`);
    const contact = pageFacts(`<a href="tel:0465710022">04 65 71 00 22</a>`, `${SITE}contact`);
    const about = pageFacts(`<a href="tel:+33 4 65 71 00 22">Tél.</a><a href="tel:">vide</a><a href="tel:abc">illisible</a>`, `${SITE}a-propos`);
    expect(home.phones).toEqual(["04 65 71 00 21", "04 65 71 00 21", "04 65 71 00 22"]);
    expect(mergeSiteFacts([home, contact, about]).phones).toEqual(["04 65 71 00 22", "04 65 71 00 21"]);
  });

  it("au plus trois téléphones et trois courriels ; ceux des données structurées d'abord", () => {
    const html = `${jsonLd({ "@type": "LocalBusiness", name: "Cabinet", telephone: "04 65 71 00 31", email: "cabinet@mon-cabinet.fr" })}
      ${[32, 33, 34, 35].map((n) => `<a href="tel:04657100${n}">t</a><a href="mailto:contact${n}@mon-cabinet.fr">m</a>`).join("")}`;
    const facts = siteFacts(html);
    expect(facts.phones).toEqual(["04 65 71 00 31", "04 65 71 00 32", "04 65 71 00 33"]);
    expect(facts.emails).toEqual(["cabinet@mon-cabinet.fr", "contact32@mon-cabinet.fr", "contact33@mon-cabinet.fr"]);
  });

  it("cleanEmail : préfixe mailto, objet du message, encodage et casse retirés ; adresse invalide refusée", () => {
    expect(cleanEmail("mailto:Contact@Mon-Cabinet.fr?subject=Bonjour&body=x")).toBe("contact@mon-cabinet.fr");
    expect(cleanEmail("MAILTO:%20contact@mon-cabinet.fr")).toBe("contact@mon-cabinet.fr");
    expect(cleanEmail("contact@mon-cabinet.fr, autre@mon-cabinet.fr")).toBe("contact@mon-cabinet.fr");
    for (const bad of ["mailto:", "contact@", "@mon-cabinet.fr", "contact at mon-cabinet.fr", "contact@localhost", `${"a".repeat(120)}@mon-cabinet.fr`, 42, null, undefined]) expect(cleanEmail(bad), String(bad)).toBeUndefined();
  });

  it("une adresse volontairement protégée contre la collecte n'est pas décodée", () => {
    const facts = siteFacts(`<a href="/cdn-cgi/l/email-protection#b1d2ded9c5d0d2c5f1dcdedf9cd2d0d3d8dfd4c59fd7c3"><span class="__cf_email__" data-cfemail="b1d2ded9c5d0d2c5f1dcdedf9cd2d0d3d8dfd4c59fd7c3">[email&#160;protected]</span></a>`);
    expect(facts.emails).toEqual([]);
  });
});

describe("liens de rendez-vous", () => {
  const booking = (html: string): ExternalSiteFacts["bookingLinks"] => siteFacts(html).bookingLinks;

  it("plateformes connues reconnues à leur hôte, quel que soit le texte du lien", () => {
    expect(booking(`<a href="https://www.doctolib.fr/osteopathe/lyon/camille-durand">Doctolib</a><a href="https://calendly.com/camille/seance"><img alt="agenda" src="x.png"></a><a href="http://www.resalib.fr/praticien/1-camille#avis">ici</a>`)).toEqual([
      { url: "https://www.doctolib.fr/osteopathe/lyon/camille-durand", platform: "doctolib" },
      { url: "https://calendly.com/camille/seance", platform: "calendly" },
      { url: "https://www.resalib.fr/praticien/1-camille", platform: "resalib" },
    ]);
  });

  it("autre site : retenu seulement si le lien parle de rendez-vous (texte, intitulé accessible ou image)", () => {
    expect(
      booking(
        `<a href="https://agenda.autre-outil.fr/camille">Prendre rendez-vous</a><a href="https://reservation.outil-b.fr/x" aria-label="Réserver une séance"><i class="icone"></i></a>
         <a href="https://outil-c.fr/y"><img src="b.png" alt="Prise de RDV en ligne"></a><a href="https://www.partenaire.fr/">Notre partenaire</a><a href="https://www.google.com/maps?q=cabinet">Plan d'accès</a>`,
      ),
    ).toEqual([
      { url: "https://agenda.autre-outil.fr/camille", platform: null },
      { url: "https://reservation.outil-b.fr/x", platform: null },
      { url: "https://outil-c.fr/y", platform: null },
    ]);
  });

  it("jamais un lien du site lui-même, un lien tel:, un réseau social ou une adresse à identifiants", () => {
    expect(booking(`<a href="/prendre-rendez-vous">Prendre rendez-vous</a><a href="https://mon-cabinet.fr/rdv">RDV</a><a href="tel:0465710041">Prendre rendez-vous par téléphone</a><a href="https://www.instagram.com/mon.cabinet">Réserver sur Instagram</a><a href="https://u:p@agenda.outil.fr/">Réserver</a>`)).toEqual([]);
  });

  it("plateformes connues d'abord, puis les autres ; cinq liens au plus ; un même agenda cité avec d'autres paramètres ne compte qu'une fois", () => {
    const links = booking(
      `<a href="https://agenda.autre-outil.fr/camille">Réserver</a><a href="https://www.doctolib.fr/sophrologue/nantes/camille?utm_source=site">Doctolib</a><a href="https://www.doctolib.fr/sophrologue/nantes/camille/?pid=practice-1">Doctolib</a>
       ${[1, 2, 3, 4, 5].map((n) => `<a href="https://outil-${n}.fr/rdv">Prendre RDV</a>`).join("")}`,
    );
    expect(links).toHaveLength(5);
    expect(links[0]).toEqual({ url: "https://www.doctolib.fr/sophrologue/nantes/camille", platform: "doctolib" });
    expect(links[1]).toEqual({ url: "https://agenda.autre-outil.fr/camille", platform: null });
  });

  it("le lien présent sur le plus de pages passe devant", () => {
    const home = pageFacts(`<a href="https://calendly.com/camille/decouverte">Calendly</a><a href="https://www.doctolib.fr/sophrologue/nantes/camille">Doctolib</a>`);
    const contact = pageFacts(`<a href="https://www.doctolib.fr/sophrologue/nantes/camille">Doctolib</a>`, `${SITE}contact`);
    expect(mergeSiteFacts([home, contact]).bookingLinks.map((link) => link.platform)).toEqual(["doctolib", "calendly"]);
  });
});

describe("réseaux sociaux", () => {
  it("socialProfileOf : pages de profil des cinq réseaux, paramètres et barre finale retirés", () => {
    expect(socialProfileOf("https://www.instagram.com/mon.cabinet/?hl=fr")).toEqual({ network: "instagram", url: "https://www.instagram.com/mon.cabinet" });
    expect(socialProfileOf("http://facebook.com/MonCabinet")).toEqual({ network: "facebook", url: "https://facebook.com/MonCabinet" });
    expect(socialProfileOf("https://fr-fr.facebook.com/MonCabinet/")).toEqual({ network: "facebook", url: "https://fr-fr.facebook.com/MonCabinet" });
    expect(socialProfileOf("https://www.facebook.com/profile.php?id=100012345678901&ref=x")).toEqual({ network: "facebook", url: "https://www.facebook.com/profile.php?id=100012345678901" });
    expect(socialProfileOf("https://www.linkedin.com/in/camille-durand/")).toEqual({ network: "linkedin", url: "https://www.linkedin.com/in/camille-durand" });
    expect(socialProfileOf("https://www.linkedin.com/company/mon-cabinet")).toEqual({ network: "linkedin", url: "https://www.linkedin.com/company/mon-cabinet" });
    expect(socialProfileOf("https://www.tiktok.com/@mon.cabinet")).toEqual({ network: "tiktok", url: "https://www.tiktok.com/@mon.cabinet" });
    expect(socialProfileOf("https://www.youtube.com/channel/UC1234567890abcdefghijkl")).toEqual({ network: "youtube", url: "https://www.youtube.com/channel/UC1234567890abcdefghijkl" });
  });

  it("socialProfileOf : boutons de partage, contenus, pages d'accueil et autres sites refusés", () => {
    const refused = [
      "https://www.facebook.com/sharer/sharer.php?u=https://mon-cabinet.fr",
      "https://www.facebook.com/share.php?u=x",
      "https://www.facebook.com/dialog/share?app_id=1",
      "https://www.facebook.com/plugins/like.php",
      "https://www.facebook.com/tr?id=123",
      "https://www.facebook.com/profile.php",
      "https://www.facebook.com/profile.php?id=abc",
      "https://www.facebook.com/",
      "https://www.instagram.com/",
      "https://www.instagram.com/p/Cxyz123/",
      "https://www.instagram.com/reel/Cxyz123/",
      "https://www.instagram.com/explore/tags/sophrologie/",
      "https://www.linkedin.com/shareArticle?mini=true&url=x",
      "https://www.linkedin.com/sharing/share-offsite/?url=x",
      "https://www.linkedin.com/feed/",
      "https://www.tiktok.com/discover/sophrologie",
      "https://www.tiktok.com/",
      "https://www.youtube.com/watch?v=abcdefghijk",
      "https://www.youtube.com/embed/abcdefghijk",
      "https://youtu.be/abcdefghijk",
      "https://twitter.com/intent/tweet?text=x",
      "https://www.pinterest.fr/moncabinet",
      "https://instagram.com.faux-site.fr/mon.cabinet",
      "ftp://www.instagram.com/mon.cabinet",
      "pas une adresse",
    ];
    for (const url of refused) expect(socialProfileOf(url), url).toBeNull();
  });

  it("un profil par réseau : celui des données structurées, sinon celui cité sur le plus de pages", () => {
    const home = pageFacts(`${jsonLd({ "@type": "LocalBusiness", name: "Cabinet", sameAs: ["https://www.instagram.com/cabinet.officiel"] })}<a href="https://www.instagram.com/autre.compte">Instagram</a><a href="https://www.facebook.com/partenaire">Un partenaire</a><a href="https://www.facebook.com/moncabinet">Facebook</a>`);
    const about = pageFacts(`<a href="https://www.facebook.com/MonCabinet/">Facebook</a>`, `${SITE}a-propos`);
    expect(mergeSiteFacts([home, about]).social).toEqual({ instagram: "https://www.instagram.com/cabinet.officiel", facebook: "https://www.facebook.com/moncabinet" });
  });
});

describe("balises, outil de création, couleur", () => {
  const tags = (html: string) => detectTags(loadDocument(html), html);

  it("Google Analytics 4 : adresse du script, appel de configuration ou réglage d'extension", () => {
    expect(tags(`<script async src="https://www.googletagmanager.com/gtag/js?id=G-AB12CD34EF"></script>`).googleAnalyticsId).toBe("G-AB12CD34EF");
    expect(tags(`<script>gtag("config", "G-ZZ99YY88XX");</script>`).googleAnalyticsId).toBe("G-ZZ99YY88XX");
    expect(tags(`<script>var settings = {'measurementID':'G-QRSTUVWXYZ'};</script>`).googleAnalyticsId).toBe("G-QRSTUVWXYZ");
    // Ni une classe CSS ni un mot en capitales ne sont pris pour un identifiant
    expect(tags(`<div class="G-RECAPTCHA g-recaptcha">G-FORCE</div><p>"G-CODE"</p>`).googleAnalyticsId).toBeUndefined();
  });

  it("Tag Manager, Google Ads et Pixel Meta (appel fbq ou image de suivi)", () => {
    expect(tags(`<iframe src="https://www.googletagmanager.com/ns.html?id=GTM-AB12CD3"></iframe>`).googleTagManagerId).toBe("GTM-AB12CD3");
    expect(tags(`<script>gtag('event','conversion',{'send_to':'AW-987654321/AbC-D_efG'});</script>`).googleAdsId).toBe("AW-987654321");
    expect(tags(`<script>fbq("init","123456789012345");</script>`).metaPixelId).toBe("123456789012345");
    expect(tags(`<noscript><img src="https://www.facebook.com/tr?ev=PageView&amp;id=998877665544332&amp;noscript=1"></noscript>`).metaPixelId).toBe("998877665544332");
    expect(tags(`<p>Référence AW-12 et GTM-x, pixel 123</p>`)).toEqual({});
  });

  it("bandeau de consentement : script d'un outil connu (adresse ou code en ligne)", () => {
    for (const html of [
      `<script src="https://cdn.jsdelivr.net/gh/AmauriC/tarteaucitron.js@1/tarteaucitron.min.js"></script>`,
      `<script src="https://static.axept.io/sdk.js" async></script>`,
      `<script src="https://cdn.cookielaw.org/scripttemplates/otSDKStub.js"></script>`,
      `<script id="Cookiebot" src="https://consent.cookiebot.com/uc.js"></script>`,
      `<script src="/wp-content/plugins/cookie-law-info/public/js/cookie-law-info-public.js"></script>`,
      `<script>window.didomiConfig = {};</script>`,
    ]) {
      expect(tags(html).consentBanner, html).toBe(true);
    }
    expect(tags(`<script src="/js/menu.js"></script><p>Nous parlons de cookies et de tarteaucitron dans cet article.</p>`).consentBanner).toBeUndefined();
  });

  it("code de mesure du studio : un script dont l'adresse contient le chemin de mesure et sa clé", () => {
    expect(tags(`<script async src="https://sites.exemple.fr/api/m?k=abcdefghijklmnopqrstuvwx"></script>`).measureSnippet).toBe(true);
    expect(tags(`<script src="/api/m?k=abc"></script>`).measureSnippet).toBe(true);
    // Le chemin seul, un autre script ou une simple mention dans le texte ne suffisent pas
    expect(tags(`<script src="https://sites.exemple.fr/api/m"></script><script src="/api/map?k=1"></script><p>/api/m?k=abc</p><a href="/api/m?k=abc">lien</a>`).measureSnippet).toBeUndefined();
  });

  it("outil de création : balise generator d'abord, sinon hôtes de fichiers connus", () => {
    const cms = (html: string, url = SITE) => detectCms(loadDocument(html), html, url);
    expect(cms(`<meta name="generator" content="WordPress 6.8">`)).toBe("wordpress");
    expect(cms(`<meta name="generator" content="Site Kit by Google 1.140"><meta name="GENERATOR" content="WordPress 6.8">`)).toBe("wordpress");
    expect(cms(`<meta name="generator" content="Wix.com Website Builder">`)).toBe("wix");
    expect(cms(`<meta name="generator" content="Webflow">`)).toBe("webflow");
    expect(cms(`<meta name="generator" content="Jimdo Creator">`)).toBe("jimdo");
    expect(cms(`<link rel="stylesheet" href="/wp-content/themes/x/style.css">`)).toBe("wordpress");
    expect(cms(`<img src="https://static.wixstatic.com/media/a.png">`)).toBe("wix");
    expect(cms(`<!-- This is Squarespace. --><script src="https://static1.squarespace.com/static/x.js"></script>`)).toBe("squarespace");
    expect(cms(`<script src="https://assets.jimstatic.com/web.js"></script>`)).toBe("jimdo");
    expect(cms(`<link href="https://primary.jwwb.nl/public/x.css" rel="stylesheet">`)).toBe("webador");
    expect(cms(`<html data-wf-site="64f0c0ffee"><img src="https://cdn.prod.website-files.com/x.png">`)).toBe("webflow");
    expect(cms(`<script src="https://cdn.shopify.com/s/files/theme.js"></script>`)).toBe("shopify");
    expect(cms(`<p>Bonjour</p>`, "https://sites.google.com/view/mon-cabinet")).toBe("google_sites");
    expect(cms(`<script src="https://www.gstatic.com/_/atari/_/js/k=atari.vw.fr.js"></script>`)).toBe("google_sites");
    // La balise generator l'emporte sur un fichier venu d'ailleurs ; site fait main : rien
    expect(cms(`<meta name="generator" content="Webflow"><img src="https://static.wixstatic.com/media/a.png">`)).toBe("webflow");
    expect(cms(`<p>Un site écrit à la main.</p>`)).toBeUndefined();
  });

  it("couleur du thème : normalisée en #rrggbb, variante claire préférée, valeur illisible ignorée", () => {
    expect(normalizeColor("#3A7D6B")).toBe("#3a7d6b");
    expect(normalizeColor("#abc")).toBe("#aabbcc");
    expect(normalizeColor("#3a7d6bcc")).toBe("#3a7d6b");
    expect(normalizeColor("rgb(58, 125, 107)")).toBe("#3a7d6b");
    expect(normalizeColor("rgba(58,125,107,0.5)")).toBe("#3a7d6b");
    expect(normalizeColor("rgb(58 125 107 / 80%)")).toBe("#3a7d6b");
    for (const bad of [undefined, "", "vert", "#12", "#gggggg", "rgb(300, 0, 0)", "var(--couleur)", "hsl(120, 50%, 50%)"]) expect(normalizeColor(bad), String(bad)).toBeUndefined();
    expect(siteFacts(`<meta name="theme-color" content="#000" media="(prefers-color-scheme: dark)"><meta name="theme-color" content="#ffffff">`).themeColor).toBe("#ffffff");
    expect(siteFacts(`<meta name="theme-color" content="var(--x)">`)).not.toHaveProperty("themeColor");
  });
});

describe("pages piégées", () => {
  it("données structurées démesurées : listes, entités et blocs lus en nombre borné", () => {
    const business = { "@type": "LocalBusiness", name: "Cabinet", telephone: Array.from({ length: 2_000 }, (_, i) => `04 72 00 ${String(i % 100).padStart(2, "0")} ${String(Math.floor(i / 100)).padStart(2, "0")}`), sameAs: Array.from({ length: 2_000 }, (_, i) => `https://www.instagram.com/compte${i}/`) };
    const crowd = { "@graph": Array.from({ length: 200 }, (_, i) => ({ "@type": "Person", name: `Personne ${i}` })) };
    const html = `${jsonLd(business)}${jsonLd(crowd).repeat(100)}`;
    const { value, ms } = timed(() => {
      const page = pageFacts(html);
      return { page, site: mergeSiteFacts([page]) };
    });
    expect(value.page.entities).toHaveLength(20);
    expect(value.page.entities[0]!.phones).toHaveLength(50);
    expect(value.page.entities[0]!.links).toHaveLength(50);
    expect(value.site.phones).toHaveLength(3);
    expect(value.site.social).toEqual({ instagram: "https://www.instagram.com/compte0" });
    expect(ms).toBeLessThan(3_000);
  });

  it("valeurs démesurées dans les données structurées : ignorées ou bornées, sans attente", () => {
    const long = "x".repeat(10_000);
    const html = jsonLd({ "@type": "LocalBusiness", name: `Cabinet ${long}`, description: `<p>${"mot ".repeat(5_000)}</p>`, telephone: long, email: `${long}@a.fr`, sameAs: [`https://www.instagram.com/${long}`], openingHours: [`Mo ${" ".repeat(10_000)}9:00-12:00`, `${"Mo,".repeat(5_000)}Tu 9:00-12:00`], address: { streetAddress: long, postalCode: "69006", addressLocality: "Lyon" } });
    expect(html.length).toBeLessThan(200_000);
    const { value, ms } = timed(() => siteFacts(html));
    expect(value.name!.length).toBeLessThanOrEqual(120);
    expect(value.description!.length).toBeLessThanOrEqual(320);
    expect(value.phones).toEqual([]);
    expect(value.emails).toEqual([]);
    expect(value.social).toEqual({});
    expect(value.address!.length).toBeLessThanOrEqual(160);
    // Une ligne d'horaires de plusieurs milliers de caractères n'en est pas une
    expect(value.hours).toEqual([]);
    expect(ms).toBeLessThan(3_000);
  });

  it("valeurs fabriquées pour faire hésiter la lecture (heure, horaires, couleur) : écartées sans attente", () => {
    // Longues suites d'espaces terminées par un caractère qui fait échouer la lecture : examinées par une expression
    // régulière, elles occupaient le processus plus de dix secondes chacune, au-delà de toute échéance
    const spaces = " ".repeat(150_000);
    const { value, ms } = timed(() => ({
      color: normalizeColor(`rgb(1${spaces}x`),
      colorTwice: normalizeColor(`rgb(1${" ".repeat(20_000)}2${" ".repeat(20_000)}x`),
      opens: openingHoursLabels([{ dayOfWeek: "Monday", opens: `1${spaces}x`, closes: "18:00" }], undefined),
      closes: openingHoursLabels([{ dayOfWeek: "Monday", opens: "09:00", closes: `18${spaces}h${spaces}x` }], undefined),
      hours: openingHoursLabels(undefined, `mo${spaces}\r`),
      days: openingHoursLabels(undefined, `mo${" ,".repeat(60_000)} 9:00-12:00`),
      page: siteFacts(`<meta name="theme-color" content="rgb(1${spaces}x">${jsonLd({ "@type": "LocalBusiness", name: "Cabinet", openingHours: `mo${" ".repeat(100_000)}\r`, openingHoursSpecification: [{ dayOfWeek: "Monday", opens: `1${" ".repeat(50_000)}x`, closes: "18:00" }] })}`),
    }));
    expect(value.color).toBeUndefined();
    expect(value.colorTwice).toBeUndefined();
    expect(value.opens).toEqual([]);
    expect(value.closes).toEqual([]);
    expect(value.hours).toEqual([]);
    expect(value.days).toEqual([]);
    expect(value.page.name).toBe("Cabinet");
    expect(value.page.hours).toEqual([]);
    expect(value.page).not.toHaveProperty("themeColor");
    expect(ms).toBeLessThan(1_000);
  });

  it("heures, horaires et couleur ordinaires entourés d'espaces : toujours lus", () => {
    expect(openingHoursLabels([{ dayOfWeek: "Monday", opens: "  09:00 ", closes: " 18 h " }], undefined)).toEqual([{ label: "Lundi", value: "9h – 18h" }]);
    expect(openingHoursLabels(undefined, "  Mo - Fr   09:00 - 12:30  ")).toEqual([{ label: "Lundi au vendredi", value: "9h – 12h30" }]);
    expect(normalizeColor("  RGB( 58 , 125 , 107 )  ")).toBe("#3a7d6b");
  });

  it("bloc JSON-LD de plus de 200 000 caractères : ignoré ; au-delà de cinquante blocs : ignorés", () => {
    const big = jsonLd({ "@type": "LocalBusiness", name: "Trop gros", description: "x".repeat(200_000) });
    expect(readJsonLd(loadDocument(big), SITE).entities).toEqual([]);
    const blocks = `${jsonLd({ "@type": "WebPage" }).repeat(50)}${jsonLd({ "@type": "LocalBusiness", name: "Cinquante et unième" })}`;
    expect(readJsonLd(loadDocument(blocks), SITE).entities).toEqual([]);
    expect(readJsonLd(loadDocument(blocks.replace(jsonLd({ "@type": "WebPage" }), "")), SITE).entities).toHaveLength(1);
  });

  it("des dizaines de milliers de liens : examinés en nombre borné, les coordonnées du début de page sont relevées", () => {
    const head = `<a href="tel:+33472000000">Appeler</a><a href="mailto:contact@mon-cabinet.fr">Écrire</a><a href="https://www.doctolib.fr/osteopathe/lyon/test">Prendre rendez-vous</a>`;
    const flood = `<a href="https://www.instagram.com/p/abc/">Publication</a><a href="tel:+33400000000">x</a><a href="https://calendly.com/x/y">rdv</a>`.repeat(20_000);
    const late = `<a href="mailto:tard@mon-cabinet.fr">Trop tard</a>`;
    const { value, ms } = timed(() => pageFacts(`${head}${flood}${late}`));
    expect(value.phones.length).toBeLessThanOrEqual(50);
    expect(value.phones[0]).toBe("04 72 00 00 00");
    expect(value.emails).toEqual(["contact@mon-cabinet.fr"]);
    expect(value.bookingLinks.length).toBeLessThanOrEqual(50);
    expect(value.bookingLinks[0]).toEqual({ url: "https://www.doctolib.fr/osteopathe/lyon/test", platform: "doctolib" });
    expect(ms).toBeLessThan(5_000);
  });

  it("adresses démesurées, cadres sans nombre, scripts en ligne sans fin : ignorés ou bornés", () => {
    const html = `<a href="tel:${"0".repeat(5_000)}">x</a><a href="https://www.doctolib.fr/${"a".repeat(5_000)}">Prendre rendez-vous</a><a href="https://www.doctolib.fr/osteopathe/lyon/test" aria-label="${"mot ".repeat(50_000)}"></a>${`<iframe src="https://calendly.com/cabinet/seance"></iframe>`.repeat(5_000)}<script>${"var a = 1; ".repeat(200_000)}tarteaucitron.init()</script>`;
    const { value, ms } = timed(() => pageFacts(html));
    expect(value.phones).toEqual([]);
    expect(value.bookingLinks.map((link) => link.platform)).toEqual(["doctolib", ...Array.from({ length: 49 }, () => "calendly")]);
    // Le bandeau de consentement n'est cherché qu'au début d'un script en ligne
    expect(value.tags.consentBanner).toBeUndefined();
    expect(ms).toBeLessThan(5_000);
  });
});

describe("mergeSiteFacts", () => {
  it("aucune page, ou pages sans rien : les faits vides du contrat", () => {
    expect(mergeSiteFacts([])).toEqual(EMPTY_EXTERNAL_FACTS);
    expect(siteFacts("<p>Bonjour</p>")).toEqual(EMPTY_EXTERNAL_FACTS);
  });

  it("la page d'accueil donne la description, la langue et l'outil ; les autres pages complètent ce qui manque", () => {
    const home = pageFacts(`<html lang="fr"><meta name="description" content="Description de l'accueil"><meta name="generator" content="WordPress 6.8">`);
    const contact = pageFacts(
      `<html lang="en"><meta name="description" content="Description du contact"><meta name="theme-color" content="#112233"><script>gtag('config','G-CONTACT123');</script>${jsonLd({ "@type": "LocalBusiness", name: "Cabinet", address: "1 rue Haute, 35000 Rennes" })}`,
      `${SITE}contact`,
    );
    expect(mergeSiteFacts([home, contact])).toEqual({
      name: "Cabinet",
      description: "Description de l'accueil",
      language: "fr",
      phones: [],
      emails: [],
      address: "1 rue Haute, 35000 Rennes",
      hours: [],
      bookingLinks: [],
      social: {},
      tags: { googleAnalyticsId: "G-CONTACT123" },
      cms: "wordpress",
      themeColor: "#112233",
    });
  });
});
