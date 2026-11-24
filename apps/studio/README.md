# @theralys/studio — espace client (app.harmony-web.fr)

Back-office des praticiens : statistiques de visite, publications du blog,
fiche Google, Google Ads, Meta Ads, académie et éditeur de site (WYSIWYG).

## Structure

- `app/(app)/` — pages avec la barre latérale : Accueil, Blog SEO (`/publications`),
  Réseaux sociaux, Fiche Google, Google Ads, Meta Ads, Académie, Compte. L'éditeur
  n'apparaît pas dans la navigation : on y accède depuis la carte « Votre
  site » de l'Accueil. L'ancienne route `/mots-cles` redirige vers
  `/google-ads` ; la carte « Visibilité Google » (Search Console,
  `google-visibility-card.tsx`) vit en tête de l'onglet Visibilité de Fiche
  Google.
- `app/(editor)/editor/` — éditeur plein écran du site (voir « Éditeur de
  site » ci-dessous ; `section-fields.tsx` contient le champ Paragraphe
  WYSIWYG : gras réel via Ctrl+B, lignes ✅, sérialisé vers le format
  `**gras**` stocké).
- `app/login/` — authentification par session (cookie signé, `lib/auth.ts`).
- `middleware.ts` — protège toutes les routes hors login.

## Éditeur de site

`app/(editor)/editor/` : l'aperçu est le vrai site public dans une iframe
(jeton signé `?apercu=`, cf. `apps/sites/middleware.ts`) ; chaque section y est
cliquable (pont postMessage `hy:hello` / `hy:ready` / `hy:select` / `hy:focus` /
`hy:theme`, `apps/sites/components/editor-bridge.tsx`). Trois panneaux :

- **Pages** (`pages-panel.tsx`, helpers purs dans `lib/editor/page-groups.ts`) :
  accueil (toujours en ligne), pages de spécialité (statut Activé/Désactivé,
  compteur, menu ⋯ : Modifier le titre sans changer l'URL, Référencement,
  Changer de spécialité = régénération IA, Supprimer), « Ajouter une page »
  (sujet libre, génération IA asynchrone via `after()` : la page existe tout de
  suite, désactivée et sans section, état dans `theme.generatingMotifs` ; le
  site public ne sert jamais une page sans section ; une génération de plus de
  10 min est considérée en échec, relance ou suppression proposées), page
  introuvable personnalisable (`theme.notFound`) et pages légales générées
  (`@theralys/shared` `legal-pages.ts`, aperçu seulement). Plafond de pages :
  `canAddMotifPage` recompté sous verrou de la ligne `sites`.
- **Contenu** (`section-fields.tsx`) : formulaires par section avec
  interrupteur « Visible sur cette page » (`hidden`, section conservée mais
  non rendue), compteurs de caractères (`SECTION_LIMITS`), réordonnancement
  ↑↓ des listes (`lib/editor/move-item.ts`), sélecteur d'icônes avec recherche
  (`searchSectionIcons`), horaires, note Google. Une section héritée de
  l'accueil (avis, contact d'une page de spécialité) renvoie vers l'accueil.
- **Style** : inchangé (teinte, intensité, polices, coins, ambiance).

Paramètres (modale) : Identité, Logo, Aperçu du lien, Icône du navigateur,
Rendez-vous & téléphone, Fiche Google, Cabinets, Tracking, **Informations
légales** (`theme.legal`, alimente les pages légales), **Réseaux sociaux** et
**Texte du pied de page** (`theme.social`, `theme.footer`). L'URL reflète
l'état (`?page=<id>`, `?section=<type>`, `?surface=settings&tab=<id>`).
Aperçu Ordinateur (rendu 1280 px réduit à l'échelle) / Tablette / Mobile ;
garde `beforeunload` sur les modifications non publiées. Toutes les écritures
du JSONB `sites.theme` passent par `updateSiteTheme` (transaction + `SELECT …
FOR UPDATE`) pour ne jamais s'écraser entre elles (réglages, fin de
génération asynchrone, activation d'une page).

## Réseaux sociaux

Section `app/(app)/reseaux-sociaux/` : contenus Instagram/Facebook/LinkedIn
prêts à poster, préparés à partir du site (Harmony ne publie pas à la place
du praticien). Réservée à la formule Scale (`hasSocialMedia`), démos
comprises.

- **Paramétrage** (bouton de la carte « Vos contenus du mois »,
  `social-settings-modal.tsx`, table `social_settings`) : voix (mêmes contrôles
  que les Paramètres du blog, `voice-fields.tsx`, réglages indépendants),
  consignes libres au générateur (≤ 1 500 caractères, vérifiées par
  `checkEthicalCompliance` + `checkSocialCompliance` à l'enregistrement, puis
  injectées dans les prompts comme une donnée, bloc `<consignes>`) et jours de
  publication. Sans ligne enregistrée : voix du blog, mardi/vendredi
  (`lib/social/settings.ts`). Les contenus déjà préparés ne changent pas : un
  mois préparé garde les jours de sa préparation (`planDays` dans le contenu).
- **Calendrier** : 2 contenus par semaine (mardi et vendredi par défaut, jours
  choisis dans le Paramétrage) + jusqu'à 2 annonces « Nouvel article » le
  lendemain d'une parution — décalée au premier jour libre dans les 3 jours
  suivants si ce lendemain est un jour de publication, sinon maintenue
  (`socialSlotsForMonth`, `@theralys/shared`). « Préparer mon mois de
  contenus » = 1 appel IA pour les créneaux à pourvoir (`planSocialMonth`) :
  transaction courte sous `pg_try_advisory_xact_lock` par site et mois (lecture
  des créneaux), appel IA **hors** transaction, puis seconde transaction sous le
  même verrou qui n'insère que les créneaux encore libres. Les « manquants »
  valent créneaux − contenus du calendrier créés pour le mois (archivés
  inclus) : déplacer ou retirer un contenu ne relance jamais de génération.
  Horizon : un mois ne se prépare que dans les 120 jours (`SOCIAL_HORIZON_DAYS`).
- **Sur mesure** : 20 demandes par site et mois civil UTC
  (`SOCIAL_REQUESTS_PER_MONTH`, comptées sur `source = 'request'`, archivage
  compris) ; le sujet passe par `checkEthicalCompliance` avant tout appel ; le
  quota est vérifié avant l'appel IA (message immédiat) et recompté sous
  `pg_advisory_xact_lock(site:social-request)` juste avant l'insertion
  (garantie). Une demande identique (sujet, format, date, couleur) dans la
  minute renvoie le contenu déjà créé.
- **Données** : table `social_posts` (`content` = `SocialPostContent`,
  `assets` = rendus mis en cache) ; lecture dans `lib/social/data.ts` (une
  seule requête par page, `computeSocialMonthState` pure), brief de site dans
  `lib/social/brief.ts` (`buildSocialBrief`, articles des créneaux « nouvel
  article » inclus d'office), accès par site dans `lib/social/post-access.ts`.
  Tant que la migration `0001_social_posts` n'est pas appliquée, la page
  affiche « Cette section est en cours d'activation » au lieu d'une erreur
  (`isMissingSchemaError`) ; `error.tsx` couvre le reste du segment.
- **Dates** : bornes de mois et créneaux en UTC ; « aujourd'hui », les bornes
  des formulaires et « Publié le / Téléchargé le » suivent le jour civil
  Europe/Paris (`parisDay`, `formatDayFr` dans `lib/calendar.ts`).
- **Tests** : `pnpm --filter @theralys/studio exec vitest run --config lib/vitest.config.ts`
  (helpers calendrier, état du mois, brief) et
  `… --config lib/social/render/vitest.config.ts` (rendu des visuels).
- **Visuels** : rendus à la demande par `/api/social/[postId]/render`
  (aperçu 540 px) et `/api/social/[postId]/download` (JPG, ZIP, PDF, légende)
  — satori + sharp, polices OFL dans `assets/fonts/`, cache mémoire puis
  Vercel Blob si `BLOB_READ_WRITE_TOKEN` est renseigné (`lib/social/render/`).
- **Variables** : `AI_MOCK=1` pour un générateur déterministe sans clé ;
  `BLOB_READ_WRITE_TOKEN` (optionnel) pour persister les rendus ;
  `DATAFORSEO_LOGIN` / `DATAFORSEO_PASSWORD` (section Fiche Google, sinon
  données simulées, `DATAFORSEO_MOCK=1` pour forcer le mock).

### « Votre avis » (toutes formules)

Chaque praticien peut nous dire ce qui améliorerait Harmony, quelle que soit
sa formule : « Donner mon avis » dans le menu (barre latérale, feuille « Plus »
du téléphone) et un bandeau en bas de l'accueil ouvrent la même fenêtre
(`components/avis`). Il y choisit la nature de son avis (une idée, un problème,
un manque, ce qui lui plaît), l'outil concerné — présélectionné d'après la page
en cours —, écrit quelques phrases (20 caractères au moins : la question posée
l'invite à raconter une situation), et peut donner une note sur 5.

- Enregistré dans `product_feedback` (migration 0016) par
  `app/(app)/_avis/actions.ts` ; dix avis par cabinet et par jour.
- Rien n'est proposé tant que la table n'existe pas (`lib/feedback.ts`,
  vérifiée au plus une fois par minute). L'équipe en mode support voit
  l'espace comme le praticien, en aperçu : l'envoi y est désactivé (un avis ne
  s'écrit pas à sa place).
- Lu dans l'admin, onglet « Avis clients ».

### Photos des visuels

- **Origine choisie par le praticien** (Paramétrage, première étape : « Les
  photos générées viennent d'où ? ») : IA, banque d'images, ou mixte (l'une
  puis l'autre, d'un contenu au suivant). Le choix est enregistré dans
  `social_visual_settings` (migration 0015) ; sans ligne, banque d'images.
- **Quand** : après la rédaction, à la préparation d'un mois, à une demande
  sur mesure et à une régénération (`lib/social/photos.ts` →
  `sourceSocialPhotos`, `packages/ai/src/social-photos.ts`). Chaque visuel
  qui porte une photo en reçoit une choisie pour son sujet. Ne sont jamais
  remplacées : la photo envoyée par le praticien et la couverture de l'article
  qu'un contenu annonce. Sans résultat (ou sans clé pour l'origine choisie),
  le visuel garde la photo du site — jamais une illustration factice.
- **Sa propre photo** : dans la fenêtre d'un contenu, « Mettre ma photo »
  l'envoie (`/api/upload`) et la pose en fond (`setSocialPostPhoto`). Une
  carte de couleur ou de texte devient alors un « photo-titre » et se
  souvient de son modèle (`content.plainTemplate`) pour le retrouver si la
  photo est retirée ; elle reste en place quand le contenu est régénéré.
  L'origine de chaque photo est notée sur la diapositive
  (`slides[0].imageOrigin` : `site`, `stock`, `ai`, `upload`) et dite dans la
  fenêtre.
- **Demande sur mesure** : le champ « Sur quel sujet ? Quelles
  instructions ? » accepte jusqu'à 400 caractères (sujet et consignes).

## Fiche Google

Section `app/(app)/fiche-google/` (formule Scale, `hasGoogleProfile`, démos
comprises) : audit de la fiche d'établissement, carte de visibilité par
mot-clé, avis avec réponses proposées et posts Google — en lecture seule
(fournisseur DataForSEO côté `@theralys/jobs`), le praticien publie lui-même
(copier, télécharger, lien direct vers Google). Onglets `?onglet=audit|visibilite|avis|posts`
(`tabs.ts`), calendrier des posts `?mois=YYYY-MM`.

- **Liaison** (`link-card.tsx`) : recherche `searchGoogle` → `linkGoogleProfile`
  (= `connectGooglePlace` puis `syncGoogleProfile(force)`). Fiche reliée
  (`profile-card.tsx`) : « Actualiser » = synchronisation forcée, au plus une
  fois par 24 h (refus explicite, `refreshGoogleProfile`).
- **Audit** (`audit-tab.tsx`) : anneau SVG maison du score, contrôles,
  plan d'action trié par impact, historique des scores (`google_profile_audits`),
  benchmark des concurrents du podium quand un relevé existe.
- **Visibilité** (`visibility-tab.tsx`) : ≤ 3 mots-clés actifs
  (`lib/google/keywords.ts` : minuscules, espaces simples, 3-60 caractères,
  réactivation d'un mot-clé retiré, quota sous verrou consultatif), « Relever
  ma visibilité » → `runGoogleScan(manual)` (10 relevés manuels par mois hors
  erreurs, `lib/google/scans.ts`, et budget `googleBudget`), carte Leaflet +
  tuiles OpenStreetMap (`visibility-map.tsx`, import dynamique `ssr: false`
  — ne jamais l'importer statiquement : Leaflet lit `window`), pastilles
  colorées par `rankTone` (`tones.ts`), résumé et tableau des concurrents.
- **Avis** (`reviews-tab.tsx`) : synthèse pure (`lib/google/reviews.ts` :
  répartition, taux de réponse, thèmes), filtres, réponse proposée modifiable
  (≤ 600) à copier, lien « Répondre sur Google » (liste blanche d'hôtes
  Google, repli `search.google.com/local/reviews?placeid=`), « Analyser les
  nouveaux avis » → `analyzeGoogleReviews`.
- **Posts Google** (`posts-tab.tsx`, `google-post-modal.tsx`, table
  `google_posts`) : un créneau par mardi (`GOOGLE_POST_DAY`,
  `lib/google/posts.ts` `computeGoogleMonthState`), « Préparer mes posts du
  mois » → `createGooglePostGenerator().planMonth` (mêmes verrous et garde que
  `planSocialMonth`), 10 posts sur mesure par mois, visuel 4:3 rendu par le
  moteur social (`lib/google/render.ts` : adaptateur `table: "google"` du
  cache `lib/social/render/cache.ts`, routes `/api/google-posts/[postId]/render`
  et `/download?kind=image|text|all`).
- **Fixtures locales** : `pnpm --filter @theralys/studio fixtures:google`
  (`scripts/google-fixtures.mts`, site de démo seulement, idempotent) insère
  audits, mots-clés, relevés, analyses d'avis et posts en mock.
- **Tests** : `lib/google/*.test.ts` (config `lib/vitest.config.ts`).

## Google Ads

Section `app/(app)/google-ads/` (formule Scale, `hasGoogleAds`, démos
comprises ; repli « en cours d'activation » tant que la migration 0005 n'est
pas appliquée) : « Google Ads est-il pertinent pour vous ? ». Harmony ne pilote
pas de compte Google Ads : l'analyse, les mots-clés et le plan sont préparés,
le praticien paramètre lui-même sa campagne. Onglets
`?onglet=diagnostic|mots-cles|plan|parametrage` (`tabs.ts`).

- **Diagnostic** (`diagnostic-tab.tsx`) : « Lancer l'analyse » →
  `launchAdsAnalysis` → `runGoogleAdsAnalysis` de `@theralys/jobs` (idées de
  mots-clés DataForSEO, prévision, `diagnoseGoogleAds`, plan IA ; 2 analyses
  par mois, ≈ 0,18 $ réservés sur le budget `googleBudget`), verdict avec
  jauge, demande, budget conseillé et check-list des points de préparation
  (bloquants d'abord, liens vers Fiche Google, l'éditeur ou l'onglet
  Paramétrage).
- **Mots-clés** (`keywords-tab.tsx`) : groupes par intention (volume, CPC €,
  concurrence, correspondance, badges « cœur » et « suivi »), négatifs,
  boutons Copier au format Google Ads (`lib/google-ads/clipboard.ts` :
  `"expression"`, `[exact]`, une ligne par mot-clé).
- **Plan d'action** (`plan-tab.tsx`) : campagne, groupes avec mots-clés et
  annonces responsives (aperçu type Google, compteurs de caractères, Copier),
  extensions, jalons, conseils ; « Instructions & régénérer »
  (`plan-regenerate-modal.tsx`, `regenerateAdsPlan`, 5 par mois,
  `instructionsRefusal`).
- **Paramétrage & suivi** (`setup-tab.tsx`, `tutorial.ts`) : tuto en
  accordéon (11 étapes, boutons Copier reprenant le plan), formulaire « Suivi
  des conversions » (`saveAdsTracking` : identifiant AW-… et libellés rdv /
  call / email dans `site.theme.tracking`, validation
  `lib/google-ads/tracking.ts`, avertissement si le bandeau cookies du site
  est désactivé), bloc Résultats sur 30 jours (`getAdsResults` dans
  `lib/google-ads/data.ts` → `summarizeAdsResults` de `@theralys/analytics` :
  visites, clics RDV et appels de source `google_ads`).
- **Données** : `lib/google-ads/data.ts` (`getGoogleAdsData` ; une analyse
  `running` plus ancienne que `GOOGLE_ADS_ANALYSIS_STALE_MINUTES` de
  `@theralys/jobs` est affichée comme interrompue), `lib/google-ads/keywords.ts`
  (exemple de requête « sans ville »).
- **Tests** : `lib/google-ads/*.test.ts` (config `lib/vitest.config.ts`).

## Meta Ads

Section `app/(app)/meta-ads/` (formule Scale, `hasMetaAds`, démos comprises ;
repli « en cours d'activation » tant que la migration 0006 n'est pas
appliquée) : « Meta Ads est-il pertinent pour vous ? ». Harmony ne pilote pas
de compte publicitaire Meta : la veille, le diagnostic, les annonces, le plan
vidéo et le plan de campagne sont préparés, le praticien diffuse lui-même
depuis son compte. Onglets
`?onglet=diagnostic|marche|annonces|plan|parametrage` (`tabs.ts`).

- **Diagnostic** (`diagnostic-tab.tsx`) : « Lancer l'analyse » →
  `launchMetaAnalysis` → `runMetaAdsAnalysis` de `@theralys/jobs` (veille de
  la bibliothèque publicitaire Meta, `diagnoseMetaAds`, créas + plan vidéo +
  plan ; 2 analyses par mois, kind `meta_analysis` de `google_usage`), verdict
  avec jauge, affinité du métier, budget (visites et contacts attendus,
  mesurés par le Pixel, repères `META_ADS_BENCHMARKS`), lecture de la veille
  et check-list (Pixel bloquant, liens vers Paramétrage, l'éditeur ou Fiche
  Google). Analyse sans veille (`market = null`,
  `lib/meta-ads/market-status.ts`, aussi dans l'onglet Marché et le message
  de fin d'analyse) : « en attente d'activation du jeton Meta » quand
  `provider = none` sur un site client, « indisponible dans cet
  environnement » sur une démo, sinon le message d'échec du service
  (`error`) ; rafraîchissement toutes les 10 s pendant une analyse lancée
  ailleurs.
- **Marché** (`market-tab.tsx` et `market-*.tsx`) : trois vues. « Annonces » :
  galerie de cartes (visuel, format, tendance, rang, annonceur, diffusion,
  date de lancement, plateformes, note sur 10) avec recherche, filtres
  (format, actives, nouveautés, zone), tri et fiche détaillée (image, vidéo,
  carrousel, textes, ciblage, lien public) — logique pure dans
  `packages/shared/src/meta-library.ts` (`filterGalleryAds`, `galleryCounts`).
  « Ma bibliothèque » : exemples gardés. « Synthèse » : lecture IA de la
  veille (angles, accroches, offres, saisonnalité, opportunités,
  avertissements). En tête : `marketScopeNote`, compteurs par zone, annonces
  écartées d'office (`market.filtered`).
  - **Pertinence** : `metaAdRelevance` (`packages/shared/src/meta-relevance.ts`)
    écarte d'office le commerce (produits, applications, assurances), la
    formation et les services vendus aux praticiens, le hors-sujet ; une
    veille enregistrée avant le filtre est filtrée à l'affichage
    (`withRelevanceFilter` de `lib/meta-ads/data.ts`).
  - **Sélection et plancher** : `selectMarketAds` garde au plus 60 annonces,
    3 par page Facebook ; quand ce plafond laisserait la veille sous
    `META_MARKET_MIN_ADS` (30) alors que le relevé compte d'autres annonces
    pertinentes, il est relevé d'un cran à la fois — jamais avec une annonce
    que le filtre a écartée. Le plancher ne crée pas d'annonces : un marché
    qui en compte moins de 30 pertinentes les montre toutes.
  - **Veille seule** : une veille enregistrée avec d'anciennes règles
    (`market.selection` absent) et devenue maigre (`marketNeedsRefresh`) est
    rattrapée d'office à l'ouverture de la section (`use-market-refresh.ts` →
    `POST /api/meta-ads/market/refresh` → `refreshMetaMarket` de
    `@theralys/jobs`) : nouvelle collecte, sélection, visuels, synthèse et
    diagnostic recalculé, sans toucher aux annonces ni aux plans et sans
    décompter d'analyse. Une tentative par 24 h (`market.refreshAttemptedAt`),
    réussie ou non ; l'ancienne veille est gardée si la collecte échoue ou
    rend moins d'annonces.
  - **Visuels** : l'API officielle ne renvoie que les textes ; images, vidéos
    et carrousels viennent de ScrapeCreators (`SCRAPECREATORS_API_KEY`,
    `@theralys/providers/meta/media`), mis en cache dans `meta_ad_media`,
    l'image principale copiée sur Vercel Blob (`lib/meta-ads/media-store.ts`,
    `meta-media/<annonce>/…`). Lecture d'une vidéo :
    `GET /api/meta-ads/media/[adId]/video?i=…` (redirection vers la copie
    durable ou le lien d'origine, rafraîchi s'il a expiré). « Afficher les
    visuels » (`loadMarketVisuals`) complète une veille antérieure. Usage
    `google_usage` kind `meta_media`, plafonné par site et par mois.
  - **Bibliothèque personnelle** (`meta_ads_library`, migration 0007 ; repli
    sans garder ni supprimer tant qu'elle n'est pas appliquée) : « Garder
    comme exemple » (`keepMarketAds`) fige l'annonce, son analyse et ses
    visuels (vidéos copiées dans `meta-library/<site>/<annonce>/…`) ;
    « Supprimer » (`dismissMarketAds`) retire l'annonce de la veille pour de
    bon ; `restoreMarketAds` annule l'un et l'autre. Les exemples gardés
    passent en tête de l'échantillon transmis à l'IA à l'analyse suivante.
- **Annonces** (`creatives-tab.tsx`, `video-plan.tsx`) : cartes de créas
  (aperçu rendu par le moteur des posts sociaux, URL versionnée par
  `generatedAt` via `lib/meta-ads/urls.ts` pour recharger le visuel après une
  régénération, sélecteur carré / portrait / story, textes avec compteurs et
  boutons Copier, Télécharger le visuel ou le kit ZIP : 3 JPEG +
  `textes.txt`), conseils, plan vidéo (3 vidéos : angle, objectif, durée,
  accroche, frise seconde par seconde, plans, à dire / à ne pas dire, bouton,
  texte à coller ; matériel et montage) ; « Instructions & régénérer »
  (`regenerate-modal.tsx`, `regenerateMetaAds`, 5 par mois, kind
  `meta_regen`, `instructionsRefusal`) régénère créas + vidéo + plan (les
  rendus Blob, à chemins déterministes, sont réécrits en place) ; bandeau
  « Régénérer » quand le plan de campagne manque alors que les créas sont là.
  Les URL de pages d'atterrissage copiées ou affichées portent le suffixe
  `?src=meta` (`landingUrl` de `lib/meta-ads/clipboard.ts`) : c'est lui qui
  rattache les visites aux annonces Meta.
- **Plan et ciblage** (`plan-tab.tsx`) : objectif (conversions mesurées par le
  Pixel, repli trafic tant qu'il manque : « enregistrez le Pixel puis
  régénérez les annonces »), campagne (zone, âges, placements, calendrier),
  ensembles de publicités avec leurs créas, pages d'atterrissage avec le
  suffixe `?src=meta`, budget et plan de test, jalons J+7 / J+30 / J+60,
  conseils.
- **Paramétrage et suivi** (`setup-tab.tsx`, `tutorial.ts`) : tuto en
  accordéon (10 étapes, interface Meta 2025-2026, boutons Copier contextuels),
  formulaire « Pixel Meta » (`saveMetaTracking` : `metaPixelId` dans
  `site.theme.tracking`, validation `lib/meta-ads/tracking.ts`, avertissement
  si le bandeau cookies est désactivé, champ resynchronisé sur la valeur
  enregistrée), bloc Résultats sur 30 jours (`getMetaResults` →
  `summarizeAdsResults(events, "meta_ads")` de `@theralys/analytics` :
  visites, clics RDV, appels mesurés grâce au suffixe `?src=meta`).
- **Rendu des créas** : `lib/meta-ads/render.ts` (`metaCreativeToSocialContent`
  : une diapositive, accroche = titre, ligne secondaire = texte, photo du
  site ; `renderableMetaCreative`, table `meta` du cache
  `lib/social/render/cache.ts` avec slot `size:0:full:<créa>` et chemins Blob
  `meta/<siteId>/<analysisId>/…`), routes
  `app/api/meta-ads/[analysisId]/creatives/[creativeId]/render?size=…&preview=1&v=…`
  (`v` ignoré) et `/download?size=…` ou `?kit=1` (accès : session, formule,
  analyse aboutie du site).
- **Données** : `lib/meta-ads/data.ts` (`getMetaAdsData` ; une analyse
  `running` plus ancienne que `META_ADS_ANALYSIS_STALE_MINUTES` est affichée
  comme interrompue), `lib/meta-ads/access.ts`, `lib/meta-ads/photos.ts`
  (photo d'une créa : `photoUrl` posée par le service, sinon le catalogue de
  `loadGoogleBrief`).
- **Tests** : `lib/meta-ads/*.test.ts` (config `lib/vitest.config.ts`).

## Visite guidée

Le parcours de prise en main du studio : une visite d'accueil à la première
connexion, puis une mini-visite par espace à sa première ouverture.

- **Logique pure** : `lib/visite/engine.ts` (étapes jouables, placement de la
  carte, lancement automatique, clés de l'état « déjà vu ») et
  `lib/visite/tours.ts` (les textes). Tests : `lib/visite/engine.test.ts`.
- **Écran** : `components/visite/` — `TourProvider` (monté dans
  `app/(app)/layout.tsx` et `app/(editor)/layout.tsx`), `TourOverlay` (voile,
  découpe autour de l'élément montré, carte), `TourLauncher` (bouton « Visite
  guidée » + proposition à la première ouverture).
- **Ajouter une étape** : poser `data-tour="<repère>"` sur l'élément à montrer,
  puis l'étape dans `tours.ts` (`target`, `title`, `body`). Une étape dont la
  cible n'est pas à l'écran est passée — formule qui n'ouvre pas l'espace,
  carte absente de cet état de la page. `target` accepte plusieurs repères par
  ordre de préférence : une entrée de la barre latérale sur ordinateur, à
  défaut le bouton « Plus » de la barre basse sur téléphone (`fallbackNote`
  ajoute alors une précision).
- **Ajouter une visite à une page** : un identifiant dans `TOUR_IDS`, sa
  définition dans `TOURS`, puis `tour="<identifiant>"` sur le `PageHeader` de
  la page (bouton de relance et proposition automatique).

Règles :

- La visite d'accueil passe d'abord : elle s'ouvre par une fenêtre de
  bienvenue (« Faire le tour » / « Plus tard »). « Plus tard » la repropose à
  la session suivante, une fois ; au deuxième refus, plus aucune visite ne se
  propose d'elle-même. La mini-visite d'un espace attend que la visite
  d'accueil ait été vue.
- Une visite ne se propose jamais par-dessus une fenêtre (les paramètres
  ouverts par `#parametres`), pendant une autre visite, dans une iframe, ni à
  l'équipe en mode support — qui peut toujours la lancer à la main, sans que
  rien ne soit noté.
- Toutes restent relançables : bouton « Visite guidée » de l'en-tête de chaque
  page, entrée « Visite guidée » du menu (barre latérale, feuille « Plus ») pour
  la visite d'accueil, ou l'adresse `/?visite=accueil`. Dans l'éditeur, le
  bouton n'apparaît qu'à partir de 640 px.
- État « déjà vu » : une ligne `tour:<identifiant>` par site dans la table
  `onboarding_tasks` (aucune migration ; ces clés n'entrent dans aucune liste
  existante), doublée d'un repli dans le navigateur
  (`localStorage`, `hy:visite:vues:<site>`) si l'écriture échoue. État
  illisible : rien ne se propose.
- Accessibilité : la carte est une boîte de dialogue (focus retenu puis rendu,
  Échap ferme, flèches gauche et droite, chaque étape annoncée) ; la page n'est
  pas cliquable pendant la visite. La découpe change de place sans transition :
  seul le contenu de la carte arrive en fondu.

## Compte, connexion et sécurité

- **Session** (`lib/auth.ts`, `lib/session-cookie.ts`) : jeton signé en cookie `httpOnly`, sous
  préfixe `__Host-` en production. Il porte l'empreinte du mot de passe (`pv`) ; `getSession()`
  relit le compte en base à chaque requête — compte supprimé, déplacé ou mot de passe changé, la
  session cesse aussitôt. Fermer une session pose le cookie vide avec ses attributs (`Secure`
  compris) : un `delete()` nu est refusé par les navigateurs pour ce préfixe.
- **Connexion** (`app/login`) : essais limités par compte et par adresse (`hitRateLimit`), adresse
  insensible à la casse, même temps de réponse qu'un compte existe ou non.
- **Mot de passe** : changement dans « Mon compte » (`compte/password-card.tsx` — l'actuel est
  redemandé, les autres appareils sont déconnectés) ; « Mot de passe oublié »
  (`app/mot-de-passe-oublie`, e-mail avec un lien d'une heure à usage unique — demande
  `RESEND_API_KEY` et `MAIL_FROM` sur ce projet, sinon la page renvoie vers Harmony) ; les liens
  d'invitation et de réinitialisation passent par `lib/password-links.ts` et ne servent qu'une fois.
- **Abonnement terminé** (site archivé) : `getSession()` ne rend plus de session — pages, actions
  et routes sont fermées — et le praticien arrive sur `app/abonnement-termine`. Une session de
  l'équipe (« agence ») garde l'accès.
- **Entrée de l'équipe** (`app/impersonate`) : lien signé de 2 minutes, à usage unique, inscrit dans
  `impersonations` (`lib/impersonation-log.ts`).
- **Éditeur** : chaque section enregistrée passe par `lib/editor/section-input.ts` (champs connus,
  types, plafonds ; images en `https://`, chemin du site ou photo embarquée) ; les générations
  payantes (pages de spécialité, images) ont un plafond par site sur 30 jours.
- **Téléversement** (`app/api/upload`) : même origine, quota quotidien par site, format lu dans les
  premiers octets du fichier (`lib/upload/sniff.ts`).
- **Nom de domaine** (`compte/actions.ts`) : la commande, payée par Harmony, demande un site client
  en formule Site, un abonnement actif, une extension courante au tarif du forfait ; un seul nom par
  site, réservé sous verrou avant la commande.
- **Search Console** : le suivi simulé n'existe que pour les démonstrations
  (`lib/google/search-console.ts`) ; un site client voit « Bientôt disponible », jamais de chiffres
  inventés.

## Développement local

Depuis la **racine** du monorepo (pnpm ne trouve pas les workspaces ailleurs) :

```bash
service postgresql start                  # Postgres local (peut s'arrêter entre deux sessions)
cp .env.example .env                      # DATABASE_URL + AUTH_SECRET
pnpm db:migrate                           # applique packages/db/drizzle (rejouable, même sur une base déjà poussée)
pnpm db:seed
pnpm --filter @theralys/studio dev        # http://localhost:3002
```

Compte client seedé : `SEED_CLIENT_EMAIL` / `SEED_CLIENT_PASSWORD` de votre `.env`
(valeurs de développement dans `.env.example`) ; compte admin sur
http://localhost:3001 : `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`. Hors base
locale, le seed exige des mots de passe explicites sur la ligne de commande,
refuse les deux valeurs par défaut de `.env.example` et remplace celles qu'un
compte déjà seedé utiliserait encore (`packages/jobs/src/seed-guard.ts`).

## Déploiement

Projet Vercel `harmony-studio`, auto-déployé à chaque push sur `main`
(turbo-ignore : le build ne tourne que si `apps/studio` ou un de ses
packages `@theralys/*` change). Domaine de production : `app.harmony-web.fr`.
Compte Vercel en plan Pro ; fonctions en région `cdg1` (Paris), réglée
dans Settings → Functions de chaque projet.
