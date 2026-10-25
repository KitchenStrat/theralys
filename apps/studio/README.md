# @theralys/studio — espace client (app.harmony-web.fr)

Back-office des praticiens : statistiques de visite, publications du blog,
mots-clés Google, académie et éditeur de site (WYSIWYG).

## Structure

- `app/(app)/` — pages avec la barre latérale : Accueil, Publications,
  Réseaux sociaux, Mots-clés, Académie, Compte. L'éditeur n'apparaît pas dans
  la navigation : on y accède depuis la carte « Votre site » de l'Accueil.
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
  `BLOB_READ_WRITE_TOKEN` (optionnel) pour persister les rendus.

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
