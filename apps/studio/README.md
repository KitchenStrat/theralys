# @theralys/studio — espace client (app.harmony-web.fr)

Back-office des praticiens : statistiques de visite, publications du blog,
fiche Google, Google Ads, Meta Ads, académie et éditeur de site (WYSIWYG).

## Structure

- `app/(app)/` — pages avec la barre latérale : Accueil, Publications,
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
- **Marché** (`market-tab.tsx`) : `marketScopeNote`, compteurs « repérées /
  conservées » des zones explorées (jusqu'à `scopeUsed`), segments « Autour
  de vous » (ville + département) / « Votre région » / « Autres zones et
  France » (`META_MARKET_SCOPE_LABELS`) selon la zone retenue, cartes
  d'annonces (annonceur, texte avec « voir plus », titre
  de lien, signal fort / moyen / faible, durée de diffusion, portée
  européenne, plateformes, âges et genre, zones, lien public vers la
  bibliothèque — jamais d'image des confrères), synthèse IA (angles avec
  annonces de référence, accroches, offres, saisonnalité, ce que personne ne
  fait, avertissements).
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
