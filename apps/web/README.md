# @theralys/web — site vitrine (www.harmony-web.fr)

Landing page marketing de Harmony : offre, tarifs, simulateur de revenus,
témoignages, FAQ.

## Structure

- `app/page.tsx` — page unique assemblant les sections (`components/`).
- `components/` — sections et briques animées : `hero`, `pricing`,
  `roi-calculator` (simulateur), `temoignages`, `faq`, `logos` (bandeau
  défilant), `brand.tsx` (mot « Harmony » stylisé, `brandify()`), etc.
- `app/globals.css` — tout le vocabulaire d'animations (shimmer-sweep,
  card-comet, glow-ring, grid-wave…), avec couverture
  `prefers-reduced-motion` en fin de fichier.
- `public/avatars/`, `public/logos/` — photos clients et logos plateformes
  (déjà compressés, ~240 Ko au total).

## Développement local

```bash
pnpm --filter @theralys/web dev   # http://localhost:3003 (depuis la racine)
```

Pas de base de données requise : le site est entièrement statique.

## Déploiement

Projet Vercel `harmony-web`, auto-déployé à chaque push sur `main`
(turbo-ignore). L'apex `harmony-web.fr` redirige en 308 vers
`www.harmony-web.fr` — toujours tester le www. Pages statiques servies
par le CDN ; fonctions en région `cdg1` (Paris).
