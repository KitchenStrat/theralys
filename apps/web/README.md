# @theralys/web — site vitrine (www.harmony-web.fr)

Page de vente de Harmony : la solution digitale tout-en-un des thérapeutes
(site internet, blog SEO, fiche Google, réseaux sociaux, Google Ads, Meta Ads,
statistiques).

## Deux règles

1. **Les formules viennent du produit.** Deux formules, Site et Scale, à prendre
   seules ou ensemble. Le contenu des formules, leur prix par
   mois sur chaque durée de facturation (mensuel, trimestriel, annuel, 3 ans),
   la somme réglée à chaque échéance, les mois d'économies et l'engagement de
   12 mois minimum sont lus dans `@theralys/db` (`PLANS`, `planPrice`,
   `periodTotal`, `savedMonths`) : la vitrine, le studio et la facturation ne
   peuvent pas se contredire. Changer un tarif = changer `prices` dans
   `packages/db/src/plans.ts`, rien d'autre.
2. **Rien n'est inventé.** Chaque phrase décrit un comportement réel du studio,
   les captures sont de vrais écrans (compte de démonstration), et la page ne
   porte aucun chiffre de clientèle.

## Témoignages

La section « Nos praticiens témoignent » (`components/testimonials.tsx` : une
citation à la une, deux rangées d'avis qui défilent) est sur la page, entre
« Déjà un site ? » et le bandeau. Ses contenus sont pour l'instant
**provisoires** (textes et portraits d'illustration) : tant que `PROVISIONAL`
est vrai, la section l'indique sous son titre, pour qu'un visiteur ne les
prenne pas pour des avis de clients.

Le jour où les vrais retours sont là (prénom, métier, ville, texte, accord de
la personne) : remplacer `FEATURED` et `REVIEWS`, puis passer `PROVISIONAL` à
`false`. La mention disparaît, rien d'autre ne change.

## Structure

- `components/landing.tsx` — la page (rendue par `app/page.tsx`), dans
  l'ordre : `hero`, `logos`, `solution`
  (schéma « tout au même endroit »), `tour` (visite guidée des sept outils),
  `control` (« Vous gardez la main »), `method` (frise et semaine type),
  `own-site` (« Déjà un site ? »), `testimonials`, `band`, `pricing`, `roi-calculator`
  (simulateur de rentabilité), `faq`, `demo-form`.
- `components/billing-period.tsx` — la durée de facturation et les formules
  cochées dans les tarifs (l'une, l'autre ou les deux, jamais aucune),
  partagées avec le simulateur : celui-ci calcule sur le prix de ce choix.
- `components/pricing.tsx` — une carte par formule, à cocher, puis le bandeau
  « Votre sélection » qui additionne : prix par mois, somme réglée à
  l'échéance, mois d'économies.
- `app/robot/page.tsx` — page publique du lecteur de sites (HarmonyBot).
- `components/tools.ts` — **les outils**, source unique du haut de page, du
  schéma et de la visite guidée : nom, promesse, trois faits, ce que l'outil
  laisse au praticien, couleurs (celles de la section dans le studio) et
  captures. Ajouter un outil au studio = l'ajouter ici. Les formules ne sont
  dites qu'à un endroit : la section des tarifs.
- `components/frames.tsx` — cadres des captures (navigateur, téléphone) et
  `Capture` (`next/image` : largeur adaptée, AVIF ou WebP, aperçu flou).
- `components/typo.ts` — `fr()` : espaces insécables de la typographie
  française, posées à l'affichage.
- `app/globals.css` — jetons de couleur et tout le vocabulaire d'animation
  (halos, faisceaux du schéma, barre de la visite, frise, marquee…). Le bloc
  `prefers-reduced-motion` de fin de fichier éteint tout ce qui bouge.
- `assets/captures/` — captures d'écran du studio, en WebP.
- `assets/temoignages/` — portraits d'illustration de la section des
  témoignages (provisoires).
- `public/logos/` — logos des plateformes du bandeau.

## Captures d'écran

Les images de `assets/captures/` sont prises sur le studio local, compte de
démonstration, en mode production :

- ordinateur : fenêtre de 1280 × 800, densité 2 (fichiers `accueil`, `site`,
  `blog`, `reseaux`, `fiche-google`, `google-ads`, `meta-ads`,
  `site-existant`) ;
- téléphone : 390 × 844, densité 2 (fichiers `m-*` ; `m-site-public` est le
  site du praticien lui-même, pas le studio) ;
- morceaux d'écran : `detail-*` (une carte du studio) et `visuel-*` (un visuel
  généré pour les réseaux sociaux).

Le site de démonstration des captures est réglé comme celui d'un vrai
praticien : thème chaud (`terracotta`) et vraies photographies de banque
d'images, servies par le CDN de Pexels comme le fait le produit (licence
libre, usage commercial sans attribution) :

- photo d'accueil du site :
  <https://www.pexels.com/photo/woman-meditating-at-home-6802935/> ;
- couverture du carrousel (haut de page, écran « Réseaux sociaux ») et visuel
  de la première annonce (écran « Meta Ads »), au même cadrage :
  <https://www.pexels.com/photo/unrecognizable-female-meditating-on-grass-in-highlands-on-sunny-day-5694121/>.

Les visuels sont des rendus du studio (`/api/social/…/render` et son
équivalent Meta Ads) : ils prennent les couleurs du site, d'où leurs tons
chauds.

Après une évolution visible du studio, reprendre les captures concernées aux
mêmes dimensions, puis les convertir en WebP (qualité 88) sous le même nom :
la page n'a pas à changer.

## Photos et vidéo de fond

La page s'appuie sur des images de **banque d'images** (Pexels, licence
gratuite, usage commercial sans attribution obligatoire) pour un rendu
naturel : des praticiens au travail, un cabinet, la nature.

| Emplacement | Fichier | Source Pexels |
| --- | --- | --- |
| Haut de page (vidéo) | `public/media/hero-1080.mp4`, `hero-720.mp4` | vidéos 5793440 (praticienne et patiente, cabinet lumineux) et 6629950 (soin en lumière chaude) |
| Haut de page (image d'attente) | `assets/photos/hero-poster.jpg` | première image de la vidéo |
| « Vous gardez la main » | `assets/photos/cabinet.jpg` | photo 16269026 |
| Bandeau avant les tarifs | `assets/photos/foret.jpg` | photo 165812 |
| Demande de démo | `assets/photos/montagnes.jpg` | photo 14871684 |

- **Vidéo** (`components/hero-video.tsx`) : deux plans enchaînés en fondu,
  15,6 s, en boucle sans coupure (la fin se fond dans le début), sans son.
  L'image d'attente s'affiche d'emblée, la vidéo se charge ensuite et la
  remplace en fondu : la page n'attend jamais la vidéo. 720p sur téléphone,
  1080p au-delà. Aucune vidéo en mouvement réduit ni en économie de données.
  Elle s'arrête hors de l'écran, et un bouton la met en pause.
  Le montage se refait avec `scripts/monter-video-hero.sh <sources> <sortie>`
  (ffmpeg ; `a.mp4` et `b.mp4` sont les deux vidéos Pexels en 1080p).
- **Photos de fond** (`components/photo-backdrop.tsx`) : plein cadre sous un
  voile, avec une parallaxe très douce. Le voile est réglé pour que le texte
  garde un contraste d'au moins 4,5:1 sur toute la photo (mesuré sur
  capture, bureau et téléphone).
- Pour changer un média : remplacer le fichier, garder son nom, et revérifier
  la lisibilité du texte posé dessus.

## Motion design

Tout est écrit à la main, en CSS et en quelques lignes de React, sans
bibliothèque d'animation :

- **titres cinétiques** (`components/kinetic.tsx`, titre en
  `data-reveal="kinetic"`) : chaque mot monte de derrière un masque, l'un
  après l'autre ;
- **prix qui filent** (`components/count-to.tsx`) : au changement de durée, le
  prix et la somme par échéance rejoignent leur nouvelle valeur ;
- **icônes qui se dessinent** (classe `draw`, et `.bento-icon`) à l'apparition
  de leur bloc ;
- **boutons d'appel** (classe `cta`, attribut `data-magnetic`) : un reflet les
  traverse, la flèche avance, le curseur les attire de quelques pixels
  (`MagneticObserver`) ;
- **phrase qui s'illumine au défilement** (`components/scroll-words.tsx`) :
  animation liée au défilement, donc sans JavaScript ; un navigateur qui ne la
  connaît pas affiche la phrase entière. Sa section ne doit pas devenir un
  conteneur de défilement (`overflow-clip`, pas `overflow-hidden`) ;
- **visite guidée** : à chaque outil, les points arrivent en cascade et la
  capture se dévoile de haut en bas.

Chaque effet a son repli dans le bloc `prefers-reduced-motion` de
`app/globals.css` : tout est en place d'emblée, rien ne bouge.

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
