# @theralys/web — site vitrine (www.harmony-web.fr)

Page de vente de Harmony : la solution digitale tout-en-un des thérapeutes
(site internet, blog SEO, fiche Google, réseaux sociaux, Google Ads, Meta Ads,
statistiques).

## Deux règles

1. **Les formules viennent du produit.** Prix et contenu des formules sont lus
   dans `@theralys/db` (`PLANS`) : la vitrine et le studio ne peuvent pas se
   contredire.
2. **Rien n'est inventé.** Chaque phrase décrit un comportement réel du studio,
   les captures sont de vrais écrans (compte de démonstration), et la page ne
   porte ni témoignage ni chiffre de clientèle tant que de vrais retours ne
   sont pas disponibles. Une section « témoignages » se rajoute le jour où il y
   en a : prénom, métier, ville, et l'accord de la personne.

## Structure

- `app/page.tsx` — page unique, dans l'ordre : `hero`, `logos`, `solution`
  (schéma « tout au même endroit »), `tour` (visite guidée des sept outils),
  `control` (« Vous gardez la main »), `method` (frise et semaine type),
  `own-site` (« Déjà un site ? »), `band`, `pricing`, `roi-calculator`
  (simulateur de rentabilité), `faq`, `demo-form`.
- `app/robot/page.tsx` — page publique du lecteur de sites (HarmonyBot).
- `components/tools.ts` — **les outils**, source unique du haut de page, du
  schéma et de la visite guidée : nom, promesse, trois faits, ce que l'outil
  laisse au praticien, formule, couleurs (celles de la section dans le studio)
  et captures. Ajouter un outil au studio = l'ajouter ici.
- `components/frames.tsx` — cadres des captures (navigateur, téléphone) et
  `Capture` (`next/image` : largeur adaptée, AVIF ou WebP, aperçu flou).
- `components/typo.ts` — `fr()` : espaces insécables de la typographie
  française, posées à l'affichage.
- `app/globals.css` — jetons de couleur et tout le vocabulaire d'animation
  (halos, faisceaux du schéma, barre de la visite, frise, marquee…). Le bloc
  `prefers-reduced-motion` de fin de fichier éteint tout ce qui bouge.
- `assets/captures/` — captures d'écran du studio, en WebP.
- `public/logos/` — logos des plateformes du bandeau.

## Captures d'écran

Les images de `assets/captures/` sont prises sur le studio local, compte de
démonstration, en mode production :

- ordinateur : fenêtre de 1280 × 800, densité 2 (fichiers `accueil`, `site`,
  `blog`, `reseaux`, `fiche-google`, `google-ads`, `meta-ads`,
  `site-existant`) ;
- téléphone : 390 × 844, densité 2 (fichiers `m-*`) ;
- morceaux d'écran : `detail-*` (une carte du studio) et `visuel-*` (un visuel
  généré pour les réseaux sociaux).

Après une évolution visible du studio, reprendre les captures concernées aux
mêmes dimensions, puis les convertir en WebP (qualité 88) sous le même nom :
la page n'a pas à changer.

## Accessibilité

Contraste AA, cibles tactiles de 44 px, un seul `h1`, lien d'évitement,
onglets de la visite pilotables au clavier (flèches, Début, Fin), visite
guidée qui attend au survol et au focus, s'arrête dès qu'on choisit un outil
et ne défile pas en mouvement réduit.

## Développement local

```bash
pnpm --filter @theralys/web dev   # http://localhost:3003 (depuis la racine)
```

La page est statique. Seul le formulaire de démo écrit en base (`leads`) : il
lui faut `DATABASE_URL`.

## Déploiement

Projet Vercel `harmony-web`, auto-déployé à chaque push sur `main`
(turbo-ignore). L'apex `harmony-web.fr` redirige en 308 vers
`www.harmony-web.fr` — toujours tester le www. Pages statiques servies
par le CDN ; fonctions en région `cdg1` (Paris).
