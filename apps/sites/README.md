# @theralys/sites — sites publics des praticiens

Rendu multi-tenant des sites clients (ex. `demo.harmony-web.fr`) : chaque
requête est résolue vers un site par son domaine, puis rendue depuis les
sections stockées en base.

## Structure

- `app/[site]/` — pages du site praticien (accueil, pages de spécialité,
  blog) rendues depuis le modèle de sections de `@theralys/shared`.
- `components/sections.tsx` — renderer des sections ; les paragraphes
  utilisent `whitespace-pre-line` et le composant `Rich` convertit les
  marqueurs `**gras**` en `<strong>`.
- `app/api/track/route.ts` — analytics first-party sans cookie : si le
  visiteur n'a pas consenti, un id anonyme journalier est dérivé par
  sha256(secret : jour : IP : user-agent : siteId) — non corrélable d'un
  jour à l'autre ; les user-agents de robots sont ignorés.

## Développement local

```bash
pnpm --filter @theralys/sites dev   # http://localhost:3000 (depuis la racine)
```

Nécessite Postgres seedé — voir `apps/studio/README.md` pour la mise en
route complète de la stack locale.

## Déploiement

Projet Vercel `harmony-sites`, auto-déployé à chaque push sur `main`
(turbo-ignore). Fonctions en région `cdg1` (Paris), au plus près des
visiteurs et praticiens français.
