# Theralys

SaaS de création et de gestion de sites internet pour les praticiens en médecines douces
(ostéopathes, sophrologues, masseurs bien-être, hypnothérapeutes, naturopathes…), développé
par Kitchen Strategy.

**État actuel : Phases 1, 2 et 3 livrées** — générateur de démos, template de site
public, back office client (« studio »), et multi-tenant production : conversion
démo → client, domaines custom (OVH), facturation Stripe, avis Google synchronisés.
Le cahier des charges complet vit dans le prompt de production (phases 1 → 4).

## Architecture

Monorepo pnpm + Turborepo, TypeScript strict, Next.js App Router.

```
apps/
  sites/      Rendu multi-tenant des sites publics (démos + clients) — port 3000
  admin/      Back office agence (onglet Démos, auth admin)          — port 3001
  studio/     Back office client (dashboard, blog, éditeur de site)  — port 3002
packages/
  db/         Schéma PostgreSQL (Drizzle ORM), formules & gating, migrations
  ai/         Génération de contenu (Anthropic claude-sonnet-5 + mode mock),
              articles avec « voix » du client, images (fal.ai FLUX.1 + mock),
              garde-fous « marketing éthique »
  jobs/       Moteur éditorial + ticks planifiés (rédaction J-7, publication
              auto, sync Search Console) + seed
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

- **Admin** : http://localhost:3001 — identifiants du seed
  (`SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`, par défaut `contact@kitchenstrategy.fr`).
- **Studio client** : http://localhost:3002 — compte seedé
  (`SEED_CLIENT_EMAIL` / `SEED_CLIENT_PASSWORD`, par défaut `claire@demo-theralys.fr`).
- **Démo seedée** : http://localhost:3000/claire-dupont-sophrologue-albi

Les jobs planifiés (calendrier éditorial, rédaction J-7, publication auto, sync
Search Console) s'exécutent avec `pnpm --filter @theralys/jobs tick` — en production,
un cron horaire appelle ce point d'entrée (état porté par Postgres, ticks idempotents).

### Mode mock (aucune clé API requise)

Toutes les APIs externes ont un mode mock pour développer sans clé :

- **IA rédaction** : sans `ANTHROPIC_API_KEY` (ou avec `AI_MOCK=1`), le pipeline génère un
  contenu français crédible et déterministe à partir d'un catalogue de spécialités par métier.
  Avec une clé, chaque étape appelle Claude (`ANTHROPIC_MODEL`, défaut `claude-sonnet-5`)
  avec validation zod + retry.
- **IA images** : provider retenu **fal.ai** (FLUX.1 schnell, ~0,0024 $/image d'article,
  vs 0,003 $ chez Replicate ; ≈ 50 $/an pour 100 clients Scale). Sans `FAL_API_KEY`,
  illustrations SVG déterministes.
- **Google (Search Console + fiche)** : sans `GOOGLE_CLIENT_ID`, la connexion depuis le
  studio crée une connexion mock et des statistiques réalistes (décalées de 2-3 jours).
- **Fiche Google** : la recherche du formulaire de démo renvoie des résultats factices
  (l'API Places réelle se branchera derrière `PlacesProvider`).

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
- **Stripe Billing** : abonnements par formule (mensuel / engagement annuel),
  webhook (`/api/stripe/webhook` sur l&apos;admin) — impayé → `past_due` (bandeau
  studio), annulation → `canceled` + site archivé, réactivation → site republié ;
  portail de facturation client. **Le gating suit l&apos;abonnement** : la formule en
  base est synchronisée depuis Stripe.
- **Gating au rendu public** : seules les pages de motifs de la formule sont
  servies et maillées (Boost = 3, Scale = 6) ; les pages excédentaires restent en
  base et se réactivent en cas d&apos;upgrade.
- **Sync des avis Google** : tick périodique (upsert par identifiant source,
  jamais de doublon), affichés sur le site public.
- **Jobs en production** : cron Vercel horaire → `GET /api/jobs/tick` (admin),
  protégé par `CRON_SECRET`.

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
- **Publications** : calendrier mensuel (Publié vert plein · Brouillon vert
  pointillé · Planifié bleu pointillé · Retiré jaune, badge IA, légende),
  modale d'article (statut daté, spécialité, temps de lecture, image, « Voir sur
  le site » avec preview token, « Modifier l'article »), édition complète
  (texte markdown, image régénérable par IA ou remplaçable, replanifier /
  publier maintenant / refuser / retirer), **Paramètres du blog** (publication
  Automatique/Manuelle ; voix : Nous/Je/On, Féminin/Masculin, Vous/Tu, 5 tons —
  appliqués aux futurs articles).
- **Moteur éditorial** : sujets générés depuis les pages de spécialités + la
  ville (maillage SEO local, sans doublon), cadence 2/sem (Boost) ou 4/sem
  (Scale) ; tick J-7 : rédaction (Claude/mock, voix du client) + image IA →
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
- **Gating par formule** en base : Starter (0 page secondaire), Boost (3, blog 2/sem),
  Scale (6, blog 4/sem) — testé.

## Commandes

```bash
pnpm dev / build / lint / typecheck / test   # via Turborepo, tout le monorepo
pnpm db:generate                             # génère une migration après édition du schéma
pnpm db:migrate / db:seed
```

Le seed est idempotent. La CI (GitHub Actions) exécute lint + typecheck + tests + build.

## Notes d'implémentation

- **Multi-tenant** : les démos sont servies par chemin (`SITES_BASE_URL/<slug>`) ; le
  middleware de `apps/sites` réécrit déjà les requêtes des domaines custom vers le même
  arbre de routes (résolution par domaine, prête pour la Phase 3).
- **Job de génération** : exécuté en arrière-plan dans le process admin (`after()` de
  Next). Le passage à une file durable (Inngest / pg-boss) est prévu au kickoff de la
  Phase 2 avec les jobs planifiés du blog (J-7, publication auto).
- **Auth admin** : sessions JWT (cookie httpOnly), mots de passe scrypt. Les onglets
  Clients/Leads sont des placeholders jusqu'à la Phase 4.
