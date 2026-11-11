# @theralys/admin — back office agence

Outil interne : gestion des prospects, génération des sites, suivi des
clients et des publications.

## Structure

- `app/(dashboard)/` — écrans internes derrière l'authentification. La vue
  d'ensemble (`page.tsx`) et « API & coûts » (`couts/`) pilotent l'activité
  et les coûts réels de toutes les API, lus dans le registre `api_usage`
  (`lib/api-usage.ts`, migration 0008).
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
