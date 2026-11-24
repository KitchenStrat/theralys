# Theralys

SaaS de création et de gestion de sites internet pour les praticiens en médecines douces
(ostéopathes, sophrologues, masseurs bien-être, hypnothérapeutes, naturopathes…), développé
par Kitchen Strategy.

**État actuel : les 4 phases du cahier des charges sont livrées** — générateur de
démos, template de site public, back office client (« studio »), multi-tenant
production (conversion démo → client, domaines OVH, facturation Stripe, avis
Google synchronisés) et back office admin complet (vue d'ensemble, clients avec
impersonation, pipeline de leads).

## Architecture

Monorepo pnpm + Turborepo, TypeScript strict, Next.js App Router.

```
apps/
  sites/      Rendu multi-tenant des sites publics (démos + clients) — port 3000
  admin/      Back office agence (onglet Démos, auth admin)          — port 3001
  studio/     Back office client (dashboard, blog, éditeur de site)  — port 3002
packages/
  db/         Schéma PostgreSQL (Drizzle ORM), formules & gating, migrations
  ai/         Génération de contenu (Anthropic claude-opus-5 + mode mock),
              articles avec « voix » du client, images (fal.ai FLUX.1 + mock),
              garde-fous « marketing éthique »
  jobs/       Moteur éditorial + ticks planifiés (rédaction J-7, publication
              auto, syncs Google, e-mails hebdomadaire et mensuel) + seed
  analytics/  Tracking maison (consentement CNIL, agrégation des stats)
  providers/  Facturation (Stripe Billing), registrar (OVH), hébergement
              (Vercel Domains) — chacun avec mock par défaut sans clé
  ui/         Design system Theralys (admin/studio)
  shared/     Types de contenu (sections), slugs, preview tokens, chiffrement
```

Les entités de la phase 4 (leads, vue d'ensemble) existent déjà dans le schéma.

## Démarrage

Prérequis : Node ≥ 22, pnpm ≥ 10, PostgreSQL 16 (ou Docker).

```bash
pnpm install
cp .env.example .env            # adapter DATABASE_URL et AUTH_SECRET
docker compose up -d db         # ou un PostgreSQL local
pnpm db:migrate                 # applique les migrations (packages/db/drizzle)
pnpm db:seed                    # compte admin + démo « Sophrologue à Albi »
pnpm dev                        # lance sites (3000) + admin (3001)
```

Puis :

- **Admin** : http://localhost:3001 — `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`
  de votre `.env` (valeurs de développement dans `.env.example`, email par défaut
  `contact@kitchenstrategy.fr`).
- **Studio client** : http://localhost:3002 — `SEED_CLIENT_EMAIL` /
  `SEED_CLIENT_PASSWORD` de votre `.env` (email par défaut `claire@demo-theralys.fr`).
- **Démo seedée** : http://localhost:3000/claire-dupont-sophrologue-albi

Les mots de passe de développement de `.env.example` ne sont acceptés que sur une
base locale (`localhost`, `127.0.0.1`, `::1`, `*.local`, `*.localhost` ou nom
d'hôte sans point). Sur toute autre base, à la création des comptes ou si un
compte déjà seedé garde un mot de passe par défaut, le seed exige
`SEED_ADMIN_PASSWORD` et `SEED_CLIENT_PASSWORD` sur la ligne de commande (un
`.env` est ignoré), refuse les valeurs par défaut et remplace celles encore en
place (`packages/jobs/src/seed-guard.ts`).

Les jobs planifiés s'exécutent avec `pnpm --filter @theralys/jobs tick [groupe]` — en
production, le cron Vercel appelle `/api/jobs/tick?task=<groupe>` une fois par jour pour
chaque groupe, à des heures décalées (`apps/admin/vercel.json`) : chaque groupe a son
propre budget de temps, une rédaction longue ne prive plus les tâches Google de leur
passage. Sans `?task=`, tout s'exécute en un passage (lancement à la main). État porté par
Postgres, tâches idempotentes ; une tâche en erreur ne bloque pas les suivantes et fait
répondre 500 à la route (visible dans les journaux Vercel).

| Groupe (heure UTC) | Tâche | Rôle |
|---|---|---|
| `emails` (6 h 00) | `weekly-content-digests` | du lundi au mercredi (Europe/Paris) : e-mail « Vos contenus de la semaine » (réseaux sociaux + fiche Google) — un seul envoi par site et par semaine, rattrapé mardi ou mercredi si lundi a échoué |
| | `month-reminders` | du 25 au 28 : e-mail « Préparez votre mois » si le mois suivant n'a aucun contenu sur un canal accessible |
| `publication` (7 h 05) | `publish-articles` | publie les articles planifiés le jour prévu |
| | `editorial-calendar` | complète le calendrier de sujets du blog (horizon 6 semaines) — clients et démos en cours |
| `redaction` (7 h 20, 13 h 20, 19 h 20) | `generate-articles` | rédige les articles J-7 (Claude ou mock) + image, cinq à la fois, pour les sites **clients** non archivés ; un sujet en échec n'arrête pas les autres |
| `google` (7 h 40) | `sync-google` | stats Search Console **simulées, démonstrations seulement** tant que la connexion réelle n'est pas ouverte |
| | `sync-google-reviews` | avis des fiches reliées (Places API), une fois par semaine et par site client |
| | `sync-google-profiles` | fiche Google du studio : instantané + audit tous les 30 jours |
| | `collect-google-reviews` | tâches d'avis DataForSEO terminées → avis, audit, analyse IA |
| `google-scans` (8 h 00) | `scheduled-google-scans` | relevés de visibilité planifiés (14 jours), lot proportionnel au parc |
| `sites-clients` (8 h 20) | `refresh-external-sites` | relit les sites des clients connectés dont la dernière lecture a 30 jours (hors quota du praticien) ; solde les lectures interrompues |

Démos expirées et clients archivés ne reçoivent plus rien (ni sujets, ni articles, ni
avis, ni relevés). Deux passages simultanés ne rédigent pas deux fois le même sujet :
l'article et son sujet sont écrits ensemble, sous verrou.

Les deux ticks d'e-mail passent par `packages/providers/src/mail` (Resend avec
`RESEND_API_KEY` + `MAIL_FROM`, sinon mock) et sont idempotents par
`notification_log` (site, type, période). Tests de fumée en mode mock :
`pnpm --filter @theralys/jobs exec tsx scripts/google-smoke.mts` (fiche Google)
et `pnpm --filter @theralys/jobs exec tsx scripts/notifications-smoke.mts`
(e-mails générés, idempotence, nettoyage de ses lignes).

### Brancher la vraie clé Anthropic

Le code est prêt : la génération bascule sur l&apos;API dès qu&apos;une clé est présente.

1. Créer la clé sur [console.anthropic.com](https://console.anthropic.com) → *API Keys*
   (prévoir une limite de dépense ; ordre de grandeur : ~0,03 €/article,
   ~0,30 €/démo, soit &lt; 10 €/an par client Scale).
2. La renseigner dans `.env` (local) **et** dans les variables du projet Vercel
   `admin` (jobs du blog) et `apps/admin`/`apps/sites` si la génération y tourne :
   `ANTHROPIC_API_KEY=sk-ant-…` — et laisser `AI_MOCK` **vide**.
3. Vérifier dans l&apos;admin → Vue d&apos;ensemble : le badge « Jobs IA » doit passer de
   « Rédaction : mode mock » à « Rédaction : API Anthropic (claude-opus-5) ».
4. Créer une démo de test : le contenu est généré par Claude, validé par zod et
   passé aux garde-fous marketing éthique (retry automatique en cas d&apos;écart,
   statut « Erreur » relançable sinon).

La clé n&apos;est jamais commitée (`.env` est ignoré par git) ; seule la variable
d&apos;environnement compte.

### Mode mock (aucune clé API requise)

Toutes les APIs externes ont un mode mock pour développer sans clé :

- **IA rédaction** : sans `ANTHROPIC_API_KEY` (ou avec `AI_MOCK=1`), le pipeline génère un
  contenu français crédible et déterministe à partir d'un catalogue de spécialités par métier.
  Avec une clé, chaque étape appelle Claude (`ANTHROPIC_MODEL`, défaut `claude-opus-5`)
  avec validation zod + retry.
- **IA images** : provider retenu **fal.ai** (FLUX.1 schnell, ~0,0024 $/image d'article,
  vs 0,003 $ chez Replicate ; ≈ 50 $/an pour 100 clients Scale). Sans `FAL_API_KEY`,
  illustrations SVG déterministes.
- **Google (Search Console + fiche)** : sans `GOOGLE_CLIENT_ID`, la connexion depuis le
  studio crée une connexion mock et des statistiques réalistes (décalées de 2-3 jours).
- **Fiche Google (recherche, avis)** : sans `GOOGLE_PLACES_API_KEY`, la recherche d'établissement
  et les avis sont factices ; avec la clé, Places API (New) fournit la fiche et ses 5 avis.
- **Fiche Google (section du studio, Scale)** : sans `DATAFORSEO_LOGIN` / `DATAFORSEO_PASSWORD`
  (ou avec `DATAFORSEO_MOCK=1`), audit, carte de visibilité et avis complets sont simulés de
  façon déterministe ; avec les identifiants, DataForSEO fournit les données publiques Google
  Maps (≤ 5 $ par site et par mois, plafond vérifié avant chaque appel).
- **Site du client (« Mon site »)** : avec `EXTERNAL_SITE_MOCK=1`, la lecture d'un site est
  simulée sans aucun accès réseau (site fictif cohérent avec l'adresse saisie ; les hôtes
  `demo-bloque…`, `demo-robots…`, `demo-vide…`, `demo-injoignable…` et `demo-lent…` rejouent
  chaque échec). Sans cette variable, le lecteur réel est utilisé — il ne demande aucune clé.

## Site du client (« Mon site »)

Un praticien qui a déjà son site le connecte depuis le studio : ses outils (réseaux
sociaux, fiche Google, Google Ads, Meta Ads, liens et statistiques) s'appuient alors sur
ce site, et non plus sur le site inclus dans la formule.

- **Lecture** (`packages/providers/src/website`) : à l'adresse donnée, notre lecteur lit au
  plus 12 pages publiques. Il s'identifie (`HarmonyBot`, présenté sur la page publique
  `/robot` du site vitrine), respecte `robots.txt`, n'exécute aucun script et ne contourne
  aucune protection : un site qui le refuse est signalé comme tel, et le praticien peut
  coller le texte de ses pages à la place. Garde-fous : adresses internes refusées à
  chaque saut (redirections comprises), tailles, durées et complexité des pages bornées.
- **Profil** (`packages/ai/src/external-site.ts`) : le texte lu est résumé en un profil
  (présentation, spécialités avec leur page, infos pratiques, contact, rendez-vous, réseaux)
  que le praticien relit et corrige rubrique par rubrique ; ses corrections survivent aux
  relectures. Rien de ce qui n'est pas dans les pages lues n'est gardé (titres, chiffres et
  coordonnées sont recoupés avec le texte).
- **Référence des outils** : l'interrupteur vit dans `sites.theme.externalSite`
  (`{ url, active, keepHostedIndexed? }`), le contenu dans la table `external_sites`
  (migration `0009_external_sites`). `publicSiteUrl(site)` donne l'adresse de référence ;
  le profil est converti en pages pour les générateurs (`externalBriefPages`). Tant que le
  site du client est la référence, le site hébergé reste en ligne mais sort des moteurs de
  recherche (`noindex`, plan de site vide), sauf si le praticien choisit de le garder
  visible. Les articles du blog restent rédigés et publiés sur le site hébergé, avec un
  bouton « Copier l'article » pour les reprendre ailleurs.
- **Statistiques** : une balise à coller sur le site du client (`GET/POST /api/m` de
  `apps/sites`) compte visites, provenance et clics vers la prise de rendez-vous ou le
  téléphone — sans cookie, sans identifiant, sans aucun paramètre d'adresse (donc aucun
  identifiant de campagne), avec refus possible par l'ancre `#mesure-off`. Les lignes
  portent `analytics_events.origin = 'external'`. Aucune visite n'y est rattachée à une
  annonce : sur ce site, le suivi publicitaire se règle dans le compte publicitaire du
  praticien, et le studio dit seulement ce que la lecture a repéré dans le code des pages.
- **Limites** : 6 lectures par mois lancées par le praticien, relecture automatique tous
  les 30 jours (`refresh-external-sites`). Une relecture qui échoue, ou qui rendrait un
  profil inexploitable, ne remplace jamais la précédente.

## Interface du studio (design system)

Toute l'interface du praticien (connexion, accueil, sections, fenêtres) repose sur un
design system propre au studio, « un ciel vivant » : une famille de bleus voisins, un
dégradé par section, un seul accent chaud.

- **Où** : composants dans `apps/studio/components/ds` (import unique `@/components/ds`),
  jetons `ds-` et utilitaires dans `apps/studio/app/globals.css`, mode d'emploi dans
  `apps/studio/components/ds/README.md`. La page `/apercu-design` du studio montre chaque
  composant et les écrans modèles ; elle n'existe qu'en développement (404 en production).
- **Structure d'un écran** : la coquille (`AppShell`, navigation latérale et barre basse
  sur téléphone) est montée dans `app/(app)/layout.tsx` ; chaque page commence par un
  `PageHeader` à la couleur de sa section et pose une seule cascade d'entrée (`Stagger`).
- **Mise en route de l'accueil** (`apps/studio/lib/accueil.ts`) : les étapes proposées et
  leur état se lisent sur le compte lui-même — une page enregistrée depuis l'éditeur, un
  lien de prise de rendez-vous, la fiche Google reliée, les paramètres du blog et des
  réseaux sociaux enregistrés, une première visite mesurée quand le site du praticien est
  la référence. Rien n'est coché à la main : l'étape disparaît de ce qu'il reste à faire
  dès que l'action est faite, et la liste n'est plus affichée une fois tout terminé.
- **Règles tenues** : texte en AA partout, cibles de 44 px au doigt, un seul `h1` par
  écran, aucun débordement de 320 à 1440 px, icônes Lucide à la place des émojis. Le
  mouvement est en CSS (`transform` et `opacity`), sous `prefers-reduced-motion:
  no-preference` ; rien ne tourne en boucle hors indicateurs de chargement.
- **Composants hérités** : les `Button`, `Input`, `Modal`… de `packages/ui`, partagés
  avec le back-office, prennent les couleurs du design system là où la coquille est
  montée (`.ds-app`) ou sur une page qui porte `.ds-scope` — sans effet sur le back-office.

## Ce que couvre la Phase 4

- **Vue d'ensemble** (accueil de l&apos;admin) : MRR (actifs + impayés, au tarif de
  la période souscrite, réparti par formule), nombre de sites clients/démos,
  **coût réel des API** sur la période choisie (ce mois-ci, mois dernier, 30 jours,
  7 jours, aujourd&apos;hui) avec marge brute et coût par site client, évolution
  quotidienne, ventilation par fournisseur, par fonctionnalité et par site,
  **santé** (générations échouées avec lien de relance, articles en retard,
  dernières erreurs des API) et **soldes et échéances** (crédits ScrapeCreators,
  jeton Meta, franchise gratuite Google Places).
- **API & coûts** (`/couts`) : le détail — filtres par fournisseur, fonctionnalité,
  site et statut, fiche de chaque fournisseur (tarif, volume, erreurs), coût par
  modèle Claude et coût moyen d&apos;un appel par fonctionnalité, coût et marge par
  site, journal paginé de tous les appels.
- **Registre des appels API** (`api_usage`, migration 0008) : chaque appel à une API
  externe (Anthropic, fal.ai, Pexels, Google Places, DataForSEO, bibliothèque
  publicitaire Meta, ScrapeCreators, API Découpage administratif, Resend, OVH,
  Vercel) y inscrit une ligne — fournisseur, opération, fonctionnalité, site,
  modèle, tokens ou volume, durée, statut et coût en dollars : coût réel quand le
  fournisseur le renvoie (DataForSEO, prix du domaine OVH), au barème public sinon
  (`packages/shared/src/api-usage.ts`). L&apos;inscription ne fait jamais échouer
  l&apos;appel mesuré, n&apos;enregistre ni destinataire ni secret, et les modes de
  démonstration (mock) n&apos;inscrivent rien. Google Places est inscrit au prix
  catalogue : la franchise mensuelle gratuite est déduite à l&apos;affichage. Les
  abonnements fixes (Vercel, Neon, Stripe, Resend) ne sont pas suivis.
- **Onglet Clients enrichi** : statut d&apos;abonnement, domaine, **santé du blog**
  (à jour / en retard selon la cadence de la formule, dernier article publié,
  premier article planifié) et **impersonation** : « Studio » ouvre le back
  office du client dans sa session via un jeton signé de 2 minutes — bannière
  « Mode support » et session courte (1 h) côté studio.
- **Onglet CRM** (remplace Leads) : tout le cycle de vente, de la liste de
  prospects à la signature.
  - **Import** de listes en CSV/TSV (séparateur et encodage détectés), Excel
    `.xlsx`, JSON, vCard `.vcf` ou par copier-coller depuis un tableur. Les
    colonnes sont reconnues puis vérifiables une à une ; e-mails, téléphones
    et codes postaux sont normalisés ; les doublons (e-mail, téléphone, nom +
    ville) sont ignorés, complétés ou créés, au choix. L&apos;ancien format `.xls`
    n&apos;est pas lu (à réenregistrer en `.xlsx` ou CSV).
  - **Filtres** combinables et partageables par l&apos;URL : étape, provenance,
    métier, ville, département, étiquette, liste importée, moyen de contact,
    prochaine tâche, date d&apos;ajout, dernier contact, formule envisagée,
    opposition au démarchage. Recherche libre, tri, **export CSV** du résultat,
    actions groupées (étape, étiquette, opposition, suppression).
  - **Pipeline**, vue d&apos;ouverture du CRM, sur le modèle de Pipedrive : une
    colonne par étape en cours (À contacter → Contacté → Intéressé → Démo
    envoyée → Rendez-vous → Proposition) avec sa valeur et son nombre
    d&apos;affaires. Une carte se glisse d&apos;une colonne à l&apos;autre ; pendant le
    geste, deux zones « Perdu » (avec motif) et « Gagné » apparaissent en bas
    de l&apos;écran. Chaque carte signale sa prochaine tâche (en retard, du jour,
    prévue, aucune), ouvre la fiche au clic, et « + » ajoute une affaire
    directement dans une colonne. La vue Liste reste à un clic.
  - **Identité visuelle** : chaque étape a sa couleur et son icône
    (`apps/admin/lib/crm/stage-style.ts`), les mêmes dans le pipeline, la
    liste, la fiche et la corbeille. L&apos;ordre des six teintes alterne froid et
    chaud pour que deux étapes voisines restent distinctes en vision
    daltonienne ; « Client » et « Perdu » gardent le vert et le rouge d&apos;état.
    Les mouvements (cartes en cascade, carte qui se pose, zones qui montent,
    chiffres qui roulent, confettis d&apos;une affaire gagnée) sont en CSS
    (`.crm-*` dans `apps/admin/app/globals.css`) et s&apos;effacent quand le
    système demande un mouvement réduit.
  - **Corbeille** : supprimer une carte (zone « Supprimer » pendant le
    glisser, menu de la carte, fiche, actions groupées, suppression d&apos;une
    liste importée) ne l&apos;efface pas. La fiche quitte le pipeline, la liste,
    les compteurs et les exports, et se retrouve dans **CRM → Corbeille** avec
    son historique : elle s&apos;y restaure à son étape d&apos;origine ou s&apos;y efface
    pour de bon (une fiche, une sélection, ou toute la corbeille). Aucune
    colonne en plus : l&apos;étape d&apos;une fiche supprimée est préfixée par `trash:`.
  - **Fiche prospect** : coordonnées, étape, formule et durée envisagées (valeur
    mensuelle), notes, **historique** (appels, e-mails, rendez-vous, notes,
    changements d&apos;étape) et **tâches de relance** datées.
  - Lié au reste : les demandes de la vitrine et les démos arrivent dans le
    CRM, « Créer sa démo » préremplit la démo depuis la fiche, et la conversion
    en client passe le prospect à « Client ».
  - Trois tables (`crm_contacts`, `crm_activities`, `crm_imports`), migration
    `0011_crm`. Tant qu&apos;elle n&apos;est pas appliquée, l&apos;onglet affiche un bandeau
    et l&apos;ancienne liste des leads.
- **Commerciaux et onglet Équipe** : le propriétaire crée des comptes pour ses
  commerciaux et pilote leur activité depuis l&apos;admin.
  - **Rôle `sales`** (troisième valeur de `user_role`). Refus par défaut : tout
    ce qui exige l&apos;admin (`requireAdmin`) reste fermé aux commerciaux ; seul le
    CRM leur est ouvert (`requireStaff`). Le garde d&apos;entrée (`middleware.ts`,
    règles dans `lib/staff.ts`) ne laisse passer un jeton de commercial que
    sur `/crm` et ses fiches ; chaque page et chaque action revérifie, et relit
    le compte en base : un compte désactivé perd l&apos;accès à sa page suivante,
    sans attendre l&apos;expiration du jeton. Le studio (espace client) refuse ces
    comptes.
  - **Ce que voit un commercial** : uniquement les prospects dont il est le
    propriétaire (`crm_contacts.owner_id`) — pipeline, liste, compteurs, fiche.
    La borne est écrite une fois (`lib/crm/scope.ts`) et portée par chaque
    requête SQL, lecture comme écriture ; la fiche d&apos;un autre est
    « introuvable ». Il crée des fiches (elles lui appartiennent), les
    modifie, les fait avancer, les étiquette, tient leur historique et leurs
    tâches. Il ne supprime rien, n&apos;importe ni n&apos;exporte, ne voit ni la
    corbeille ni les listes, n&apos;attribue aucune fiche et ne crée pas de démo.
    Un doublon chez un collègue bloque la création sans rien révéler de la
    fiche.
  - **Invitation** : l&apos;admin crée le compte (nom, e-mail) et reçoit un lien à
    transmettre lui-même (aucun e-mail n&apos;est envoyé). Le lien est signé avec
    `AUTH_SECRET`, vaut 7 jours et ne sert qu&apos;une fois : il porte l&apos;empreinte
    de l&apos;état du mot de passe, et « Nouveau lien » périme les précédents (ainsi
    que l&apos;ancien mot de passe et les sessions ouvertes). Le jeton voyage dans
    le fragment de l&apos;adresse (`/invitation#jeton=…`) : il n&apos;apparaît dans aucun
    journal de requêtes.
  - **Ce que l&apos;admin gagne dans le CRM** : colonne et filtre « Commercial »
    (un commercial, « Non attribué »), attribution sur la fiche, à la création,
    en action groupée et à l&apos;import d&apos;une liste ; l&apos;auteur de chaque ligne
    d&apos;historique (`crm_activities.author_id`, admin compris).
  - **Onglet Équipe** (`/equipe`, admin seulement) : état de chaque compte
    (invitation en attente, actif, désactivé), dernière connexion, prospects
    en cours, gagnés du mois et leur valeur mensuelle, activité des 7 et 30
    derniers jours par type, tâches en retard ; nouveau lien d&apos;invitation,
    désactivation, réattribution de tous ses prospects. La fiche d&apos;un
    commercial (`/equipe/[id]`) détaille ses prospects par étape et le fil de
    ses dernières activités, avec un lien vers le CRM filtré.
  - Migration `0012_crm_sales` : valeur `sales`, table `crm_reps` (rien n&apos;est
    ajouté à `users`), `crm_contacts.owner_id`, `crm_activities.author_id`.
    Déployé avant elle, le code ne casse rien : la connexion et le reste de
    l&apos;admin fonctionnent, le CRM et l&apos;onglet Équipe affichent un bandeau
    d&apos;activation, et la création d&apos;une démo comme la conversion en client
    continuent d&apos;écrire dans l&apos;historique du CRM, sans auteur.

- **Assistant et base de questions du CRM** (`/crm/questions`, admin et
  commerciaux) : un encart « Une question ou une objection sur Harmony ? »,
  posé dans le CRM et en tête de la base, où l'on écrit la question comme le
  praticien l'a dite. L'assistant rend une fiche — la question reformulée, sa
  rubrique, ce qu'on peut dire au téléphone, les faits à l'appui — qui rejoint
  la base commune.
  - **Ce qu'il sait, et rien d'autre** : la définition du produit
    (`lib/crm/knowledge/product.ts`, écrite depuis `@theralys/db` : formules,
    prix, économies, engagement), le texte de la page publique, relu au plus
    une fois par heure (`landing.ts` ; les témoignages d'illustration et le
    formulaire en sont écartés) et les fiches validées par l'admin, qui font
    foi. Ce que ces sources ne disent pas n'est pas inventé : la fiche part
    « À vérifier ».
  - **Une base qui ne se remplit pas de doublons** : une question déjà posée
    dans les mêmes mots (casse, accents et ponctuation mis à part) rend sa
    fiche sans appel au modèle ; une question que l'assistant reconnaît
    rejoint la fiche existante. Chaque question posée est inscrite au journal
    (`crm_knowledge_asks`) : « Mes questions », nombre de fois posée, et pour
    l'admin les questions de chacun sur 30 jours.
  - **Qui fait quoi** : tout le monde lit toute la base, pose des questions et
    peut demander une vérification ; l'admin corrige, valide, écrit ses
    propres fiches et supprime. Une fiche validée n'est jamais remplacée par
    l'assistant.
  - Appel au modèle : `packages/ai/src/sales-assistant.ts` (effort « medium »,
    sans les règles de marketing éthique des textes publics), 40 questions
    nouvelles par heure et par personne, coûts inscrits sous « Assistant
    commercial ». Migration `0014_crm_knowledge` ; déployé avant elle, le code
    n'affiche ni l'encart ni la base, et ne casse rien.

## Ce que couvre la Phase 3

- **Conversion démo → site client** (admin, activation manuelle) : depuis la page
  d&apos;édition d&apos;une démo « Prête à vérifier » — choix de la formule et de la
  période, création du compte client (identifiants affichés une seule fois),
  abonnement Stripe démarré (lien de paiement en mode réel, actif direct en mock),
  site publié sans expiration. L&apos;onglet **Clients** liste les sites clients
  (formule, statut d&apos;abonnement, domaine).
- **Domaines custom** : le client cherche et achète son domaine depuis
  « Mon compte » (prix par TLD, commande OVH, DNS pointés vers Vercel,
  rattachement au projet + SSL automatique). Le middleware multi-tenant sert le
  site sur son domaine dès le rattachement ; robots.txt passe en `Allow` avec
  sitemap.
- **Stripe Billing** : abonnements par formule et par durée (mensuel, trimestriel,
  annuel, 3 ans — réglés d'avance à chaque échéance, engagement 12 mois minimum),
  webhook (`/api/stripe/webhook` sur l&apos;admin) — impayé → `past_due` (bandeau
  studio), annulation → `canceled` + site archivé, réactivation → site republié ;
  portail de facturation client. **Le gating suit l&apos;abonnement** : la formule en
  base est synchronisée depuis Stripe.
- **Gating au rendu public** : le site hébergé fait partie de la formule Site —
  sans elle (formule Scale seule), rien n&apos;est servi à l&apos;adresse du site ;
  avec elle, 6 pages de motifs sont servies et maillées (les pages excédentaires
  restent en base).
- **Sync des avis Google** : tick périodique (upsert par identifiant source,
  jamais de doublon, jamais d&apos;avis factices sur un site client), affichés
  sur le site public.
- **Fiche Google (studio, Scale + démos)** : lecture seule via DataForSEO
  (fiche, avis complets avec réponses, grille de positions Maps 7×7), repli
  Places API pour la fiche ; audit déterministe, analyse des avis et posts par
  l&apos;IA ; budget vérifié avant chaque appel facturé (≤ 5 $ par site et par mois).
- **Jobs en production** : cron Vercel quotidien → `GET /api/jobs/tick` (admin),
  protégé par `CRON_SECRET`.
- **Suivi des réseaux sociaux** : e-mail hebdomadaire des contenus prêts
  (lundi) et rappel « Préparez votre mois » (le 25) ; provenance des visites
  (Instagram, Facebook, LinkedIn, Google, accès direct, autres sites) mesurée
  par le referrer et le lien de bio tracé (`?src=ig`), affichée sur l'accueil
  du studio.

### Déploiement (Vercel — décision kickoff Phase 3)

Trois projets Vercel pointant sur ce monorepo (Root Directory : `apps/sites`,
`apps/admin`, `apps/studio` ; build command par défaut, pnpm détecté) :

1. **sites** : domaine wildcard de démos (`demo.theralys-web.fr`) + les domaines
   custom des clients (rattachés automatiquement via l&apos;API par `VERCEL_TOKEN`
   / `VERCEL_SITES_PROJECT_ID`).
2. **admin** : `admin.theralys-web.fr` — porte le cron des jobs
   (`vercel.json`) et le webhook Stripe (à déclarer dans le dashboard Stripe).
3. **studio** : `app.theralys-web.fr`.

Base de données : PostgreSQL managé (Neon/Supabase — sauvegardes automatiques ;
activer le point-in-time recovery). Variables : voir `.env.example` — toutes les
intégrations tombent en mock si la clé correspondante est absente, ce qui permet
un environnement de préproduction sans aucun compte externe.

## Ce que couvre la Phase 2

- **Studio client** (http://localhost:3002) : connexion par email/mot de passe
  (rôle `client`, rattaché à son site).
- **Accueil** : « Bonjour {prénom} », périodes 7j/30j/6m, cartes Visiteurs et
  Clics RDV avec variation vs période précédente et courbe journalière (tracking
  maison réel) ; tâches d'onboarding (visite guidée + 4 tâches, barre de
  progression) ; **Visibilité Google** (formules Boost/Scale) : connexion OAuth
  de la propriété, total mensuel vs mois précédent à durée égale, chips des
  requêtes principales + « +N non détaillées » ; cartes Consulteo/BoostTonCab et
  parrainage.
- **Blog SEO** (section `/publications`) : calendrier mensuel (Publié vert plein · Brouillon vert
  pointillé · Planifié bleu pointillé · Retiré jaune, badge IA, légende),
  modale d'article (statut daté, spécialité, temps de lecture, image, « Voir sur
  le site » avec preview token, « Modifier l'article »), édition complète
  (texte markdown, image régénérable par IA ou remplaçable, replanifier /
  publier maintenant / refuser / retirer), **Paramètres du blog** (publication
  Automatique/Manuelle ; voix : Nous/Je/On, Féminin/Masculin, Vous/Tu, 5 tons —
  appliqués aux futurs articles).
- **Moteur éditorial** : sujets générés depuis les pages de spécialités + la
  ville (maillage SEO local, sans doublon), cadence 4/sem avec la formule
  Site (pas de blog sans elle) ; tick J-7 : rédaction (Claude/mock, voix du client) + image IA →
  brouillon ou planifié selon le réglage ; tick de publication automatique ;
  tick de sync Search Console. Cron + état Postgres (ticks idempotents),
  migration vers une file durable prévue si besoin.
- **Éditer site** : barre supérieure (← Retour, sélecteur de page, Tutoriel,
  Style, Paramètres, Voir mon site), prévisualisation fidèle (iframe du vrai
  site), édition structurée des textes et images de chaque section, panneau
  Style (5 palettes + 3 jeux de polices), panneau Paramètres (nom, lien RDV,
  ville). Enregistrer = publier (le site public est rendu depuis la base).

## Ce que couvre la Phase 1

- **Template public thémable** (un seul template, variations par site : palette, polices,
  textes) : accueil complet (hero + badge local + note Google, spécialités, à propos, avis,
  déroulement, FAQ, contact), pages `/motifs/[slug]`, blog avec prévisualisation des
  brouillons par token JWT signé (`?preview_token=`).
- **SEO** : meta/OG par page, données structurées LocalBusiness, sitemap.xml par site,
  robots.txt par hôte, démos en `noindex`.
- **Tracking maison conforme CNIL** : bandeau de consentement (« Accepter » / « Continuer
  sans accepter »), cookie visiteur posé uniquement après consentement (13 mois max),
  clics RDV comptés sans identifiant, événements en base (`analytics_events`).
- **Back office admin — onglet Démos** : liste (recherche nom/métier/ville, statuts,
  4 pastilles d'avancement, validité du lien, pagination 25), création (fiche Google
  optionnelle, praticien, genre pour les accords, motifs libres, validité configurable),
  duplication, édition + régénération. Pipeline asynchrone avec statuts visibles
  (En préparation → Prête à vérifier, erreurs relançables).
- **Marketing éthique** : liste de formulations interdites (promesses de guérison,
  vocabulaire médical, pathologies, promesses de résultat) appliquée à tout contenu
  généré — mock comme API — avec tests.
- **Gating par formule** en base — testé (voir « L&apos;offre : deux formules »).

## L&apos;offre : deux formules, à prendre seules ou ensemble

Source unique : `packages/db/src/plans.ts` (prix, droits, libellés) — la vitrine,
l&apos;admin, le studio, la facturation et les tâches planifiées la lisent toutes.

| | Formule **Site** | Formule **Scale** | Les deux |
|---|---|---|---|
| Mensuel | 59 € | 89 € | 148 € |
| Trimestriel (par mois) | 49 € | 74 € | 123 € |
| Annuel (par mois) | 39 € | 59 € | 98 € |
| 3 ans (par mois) | 29 € | 44 € | 73 € |

- Règle de prix, à l&apos;euro inférieur : 10 mois réglés sur 12 en trimestriel, 8
  sur 12 en annuel, 18 sur 36 sur 3 ans (`pricesFromMonthly`). Les deux formules
  ensemble = la somme des deux prix, sans remise. Changer un tarif = changer le
  prix mensuel de la formule dans `FORMULA_DEFINITIONS`.
- **Site** : site hébergé (éditeur, hébergement, nom de domaine), 6 pages de
  spécialités, blog (4 articles par semaine), suivi des mots-clés.
- **Scale** : fiche Google, réseaux sociaux, Google Ads, Meta Ads, Académie —
  **sans le site**. Les outils s&apos;appuient sur le site Harmony si le client a
  aussi la formule Site, sinon sur son propre site, qu&apos;il connecte dans
  « Mon site » (première étape de sa mise en route).
- Toujours inclus : avis Google synchronisés et statistiques.
- **Ce qui est enregistré** : l&apos;enum Postgres `plan` garde ses trois valeurs
  historiques, avec un nouveau sens — `starter` = Site seule, `boost` = Scale
  seule, `scale` = les deux (aucune migration). Le code ne les nomme jamais :
  il passe par `PLAN_SITE` / `PLAN_SCALE` / `PLAN_COMPLETE`, `planFormulas`,
  `hasFormula`, `planFromFormulas` et les droits (`hasSite`, `hasBlog`,
  `hasSocialMedia`…). Les démos présentent toujours l&apos;offre complète.
- **Admin** : la conversion d&apos;une démo coche une ou deux formules ; l&apos;onglet
  Clients permet d&apos;en ajouter ou d&apos;en retirer une ensuite (les droits suivent
  aussitôt ; le montant d&apos;un abonnement Stripe en cours se modifie dans Stripe).
  Les comptes créés avant le découpage sont alignés sur les deux formules à
  l&apos;ouverture de l&apos;admin (`apps/admin/lib/formulas.ts`).

## Commandes

```bash
pnpm dev / build / lint / typecheck / test   # via Turborepo, tout le monorepo
pnpm db:generate                             # génère une migration après édition du schéma
pnpm db:migrate / db:seed
```

Le seed est idempotent. La CI (GitHub Actions) exécute lint + typecheck + tests + build.

### Migrations

Le dossier `packages/db/drizzle/` est **à jour du schéma** (`packages/db/src/schema.ts`) :
`0000_soft_scrambler` (schéma initial), `0001_social_posts` (réseaux sociaux + les
colonnes autrefois poussées à la main), `0002_social_settings` (option « Paramétrage »
des réseaux sociaux), … jusqu'à `0012_crm_sales` (comptes des commerciaux),
`0013_security_scale` (compteurs de tentatives, journal des accès support, index) et
`0014_crm_knowledge` (base de questions et d'objections de l'équipe commerciale) et
`0015_social_visuals` (origine des photos des visuels des réseaux sociaux). Les migrations s'appliquent avec **`pnpm db:migrate`**,
en local comme en production (procédure dans `DEPLOY.md`, section « Mettre à jour le schéma
en production »), qui tient le journal `drizzle.__drizzle_migrations`. Elles sont rejouables
(`IF NOT EXISTS`, `DO $$ … duplicate_object`) : `pnpm db:migrate` passe aussi sur une base
créée autrefois par `drizzle-kit push` sans journal, et un second lancement est un no-op
(`packages/db/src/migrations.test.ts` verrouille ces gardes). Après une modification du
schéma : `pnpm db:generate`, relire le SQL produit et le garder rejouable de la même façon,
commiter `drizzle/`, puis `pnpm db:migrate` — ne pas utiliser `drizzle-kit push` sur une base
partagée.

## Notes d'implémentation

- **Multi-tenant** : les démos sont servies par chemin (`SITES_BASE_URL/<slug>`) ; le
  middleware de `apps/sites` réécrit déjà les requêtes des domaines custom vers le même
  arbre de routes (résolution par domaine, prête pour la Phase 3).
- **Job de génération** : exécuté en arrière-plan dans le process admin (`after()` de
  Next). Le passage à une file durable (Inngest / pg-boss) est prévu au kickoff de la
  Phase 2 avec les jobs planifiés du blog (J-7, publication auto).
- **Authentification** (admin et studio) : sessions JWT en cookie `httpOnly`, sous préfixe
  `__Host-` en production (`lib/session-cookie.ts` de chaque app ; l'ancien nom reste lu pour
  les jetons émis avant la bascule). Le jeton porte l'empreinte du mot de passe (`pv`) et
  chaque page ou action relit le compte en base : compte supprimé, désactivé ou mot de passe
  changé, la session cesse à la requête suivante. Mots de passe scrypt, calculés hors du fil
  principal ; même temps de réponse qu'un compte existe ou non. Effacer le cookie protégé se
  fait par une pose vide avec ses attributs (`Secure` compris) — un `delete()` nu est refusé
  par les navigateurs.
- **Limitation des tentatives** : `hitRateLimit` (`packages/db/src/rate-limit.ts`) compte par
  clé dans la table `rate_limits` (migration `0013`), ou en mémoire par instance tant qu'elle
  n'existe pas. Clés hachées (ni e-mail ni IP en clair). Sert aux connexions, aux liens de mot
  de passe, à la demande de démo, aux téléversements, aux recherches de domaine et aux
  générations payantes de l'éditeur. La mesure d'audience, elle, compte en mémoire seulement
  (pas d'écriture en base par page vue).
- **Entrée de l'équipe dans l'espace d'un client** : lien signé de 2 minutes, à usage unique
  (`jti`), inscrit dans `impersonations` (qui, quel site, quand).
- **Contenu saisi par un praticien** : jamais de HTML libre. Les sections enregistrées par
  l'éditeur passent par un schéma strict (`apps/studio/lib/editor/section-input.ts`) ; les
  données structurées des sites sont sérialisées par `serializeJsonLd` (aucun `<` brut dans une
  balise `<script>`) ; le pont de l'éditeur n'écoute que l'origine du studio, signée dans le
  jeton d'aperçu.
- **En-têtes** : `frame-ancestors 'none'` sur l'admin et le studio (aucun encadrement par une
  autre page), `nosniff` et `Referrer-Policy` partout (`next.config.ts` de chaque app).
- **Paiement** : le webhook Stripe exige la signature en production ; la formule d'un client
  ne vient jamais d'un événement (elle se règle dans l'admin).
