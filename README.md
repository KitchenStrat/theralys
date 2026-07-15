# Theralys

SaaS de création et de gestion de sites internet pour les praticiens en médecines douces
(ostéopathes, sophrologues, masseurs bien-être, hypnothérapeutes, naturopathes…), développé
par Kitchen Strategy.

**État actuel : Phase 1 livrée** — générateur de démos + template de site public.
Le cahier des charges complet vit dans le prompt de production (phases 1 → 4).

## Architecture

Monorepo pnpm + Turborepo, TypeScript strict, Next.js App Router.

```
apps/
  sites/      Rendu multi-tenant des sites publics (démos + clients) — port 3000
  admin/      Back office agence (onglet Démos, auth admin)          — port 3001
packages/
  db/         Schéma PostgreSQL (Drizzle ORM), formules & gating, seed
  ai/         Pipelines de génération (Anthropic claude-sonnet-5 + mode mock),
              garde-fous « marketing éthique »
  analytics/  Tracking maison (consentement CNIL, agrégation des stats)
  ui/         Design system Theralys (admin/studio)
  shared/     Types de contenu (sections), slugs, preview tokens, dates
```

Le back office client (`apps/studio`) arrive en Phase 2 ; les entités de données des
phases 2-4 (abonnements, domaines, connexions Google, leads…) existent déjà dans le schéma.

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
- **Démo seedée** : http://localhost:3000/claire-dupont-sophrologue-albi

### Mode mock (aucune clé API requise)

Toutes les APIs externes ont un mode mock pour développer sans clé :

- **IA rédaction** : sans `ANTHROPIC_API_KEY` (ou avec `AI_MOCK=1`), le pipeline génère un
  contenu français crédible et déterministe à partir d'un catalogue de spécialités par métier.
  Avec une clé, chaque étape appelle Claude (`ANTHROPIC_MODEL`, défaut `claude-sonnet-5`)
  avec validation zod + retry.
- **Fiche Google** : la recherche du formulaire de démo renvoie des résultats factices
  (l'API Places réelle se branchera derrière `PlacesProvider`).

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
