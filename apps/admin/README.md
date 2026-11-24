# @theralys/admin — back office agence

Outil interne : gestion des prospects, génération des sites, suivi des
clients et des publications.

## Structure

- `app/(dashboard)/` — écrans internes derrière l'authentification. La vue
  d'ensemble (`page.tsx`) et « API & coûts » (`couts/`) pilotent l'activité
  et les coûts réels de toutes les API, lus dans le registre `api_usage`
  (`lib/api-usage.ts`, migration 0008).
- `app/(dashboard)/crm/` et `lib/crm/` — le CRM, ouvert à l'admin (tout) et
  aux commerciaux (leurs propres prospects : la portée est dans chaque
  requête, `lib/crm/scope.ts`). `app/(dashboard)/equipe/` — comptes et
  activité des commerciaux, admin seulement. `app/invitation/` — page publique
  où un commercial choisit son mot de passe. Détail dans le README racine.
- `app/(dashboard)/crm/questions/` et `lib/crm/knowledge/` — l'assistant du
  CRM et la base commune de questions et d'objections : `ask.ts` (une
  question, de bout en bout), `product.ts` et `landing.ts` (ce que l'assistant
  sait), `store.ts` (la base), `model.ts` (rubriques, états, filtres). Tests
  sur une vraie base : `lib/crm/knowledge/ask.db.test.ts` (ignorés sans
  `ADMIN_TEST_DATABASE_URL`).
- `app/(dashboard)/avis/` et `lib/feedback.ts` — « Avis clients » : ce que
  les praticiens disent du produit depuis leur espace client (« Donner mon
  avis », toutes formules), à lire puis à marquer lu ou pris en compte. Admin
  seulement ; table `product_feedback` (migration 0016).
- `lib/auth.ts` — `requireAdmin` (admin seulement, le défaut de toute page ou
  action) et `requireStaff` (admin ou commercial actif, pour le CRM).
- `app/api/` — dont `api/jobs/tick`, déclenché chaque jour à 6h UTC par le
  cron Vercel (`vercel.json`).

## Développement local

```bash
pnpm --filter @theralys/admin dev   # http://localhost:3001 (depuis la racine)
```

Nécessite Postgres seedé — voir `apps/studio/README.md` pour la mise en
route complète de la stack locale.

## Déploiement

Projet Vercel `harmony-admin`, auto-déployé à chaque push sur `main`
(turbo-ignore). Fonctions en région `cdg1` (Paris).
