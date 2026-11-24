# @theralys/web — site vitrine (www.harmony-web.fr)

Page de vente de Harmony : la solution digitale tout-en-un des thérapeutes
(site internet, blog SEO, fiche Google, réseaux sociaux, Google Ads, Meta Ads,
statistiques).

## Deux règles

1. **Les formules viennent du produit.** Deux formules, Site et Scale, à prendre
   seules ou ensemble. Le contenu des formules, leur prix par
   mois sur chaque durée de facturation (mensuel, trimestriel, annuel, 3 ans),
   la somme réglée à chaque échéance, les économies (mois offerts, euros,
   pourcentage) et l'engagement de 12 mois minimum sont lus dans
   `@theralys/db` (`PLANS`, `planPrice`, `periodTotal`, `savedMonths`,
   `savedAmount`, `savedPercent`) : la vitrine, le studio et la facturation ne
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

## Typographie et ton

Passe de design menée avec le skill `frontend-design` d'Anthropic
(`anthropics/skills`) : des choix propres au sujet — des praticiens du soin,
pas des informaticiens — plutôt que les réflexes d'une page générée.

- **Deux familles, deux rôles**, les mêmes que dans l'espace client.
  **Fraunces**, un serif aux formes rondes (axe `SOFT` au maximum, une seule
  graisse), porte la voix : titres, citations (`.font-display`). **Figtree**
  porte tout le reste : texte, petits titres, boutons et chiffres
  (`.font-title` pour les petits titres ; ses chiffres savent s'aligner,
  ceux de Fraunces non). **Comfortaa** ne sert qu'au logo.
- **Le mot-marque est un logo**, pas un mot du texte : en-tête, pied de page
  et sphères seulement. Dans une phrase ou un titre, « Harmony » s'écrit comme
  le reste.
- **Pas de surtitre** au-dessus des titres de section, pas d'expression mise
  en couleur dans un titre, pas de flèche décorative au bout d'un bouton :
  le titre dit de quoi il s'agit, le bouton dit ce qu'il fait.
- **Des phrases plutôt que des points médians** : « Thomas D., ostéopathe à
  Bordeaux », « Frais de création et formation offerts. Engagement de 12 mois
  minimum. »
- **Une seule pièce spectaculaire**, le haut de page (vidéo et anneau des
  outils) ; le reste de la page reste calme.

## Structure

- `components/landing.tsx` — la page (rendue par `app/page.tsx`), dans
  l'ordre : `hero`, `logos`, `solution`
  (schéma « tout au même endroit »), `tour` (visite guidée des sept outils),
  `control` (« Vous gardez la main »), `method` (frise et semaine type),
  `own-site` (« Déjà un site ? »), `testimonials`, `band`, `pricing`, `roi-calculator`
  (simulateur de rentabilité), `faq`, `demo-form`.
- **Demander une démo** — tout bouton « démo » de la page est un lien vers
  `#demo` : `components/demo-dialog.tsx` l'intercepte et ouvre le formulaire
  dans une fenêtre (`<dialog>` natif), sans faire défiler jusqu'au bas de
  page. Sans JavaScript, le même lien mène au formulaire du bas
  (`demo-form.tsx`), qui reste en place. Le formulaire tient en quatre champs
  (nom et téléphone obligatoires, métier, ville) ; la demande partie, il
  propose des précisions facultatives (e-mail, site actuel, un mot sur la
  pratique) qui complètent la même demande (`app/actions.ts` :
  `requestDemo`, puis `completeDemoRequest`). Relectures partagées et testées
  dans `packages/shared/src/demo-request.ts`.
- `components/section-cta.tsx` — l'appel à l'action de fin de section : une
  phrase et le bouton de démo, à la fin de `solution`, `tour`, `control`,
  `method` et `own-site`. Sur téléphone, il n'y a jamais plus de quatre écrans
  sans bouton de démo dans le contenu.
- **Estimation par e-mail** — à la fin du simulateur, « Recevoir mon
  estimation par e-mail » envoie les hypothèses et le calcul à l'adresse
  saisie (`emailEstimate`), puis inscrit une demande « simulateur » dans le
  CRM. Le calcul est refait côté serveur (`packages/db/src/estimate.ts`, que
  la page partage) ; l'e-mail ne contient aucun texte saisi par le visiteur.
  Deux envois par adresse et par jour, cinq par connexion et par heure. Le
  bloc n'apparaît que si `RESEND_API_KEY` est définie sur ce projet au moment
  de la construction : la page ne promet pas un e-mail qui ne partirait pas.
- `components/billing-period.tsx` — la durée de facturation et les formules
  cochées dans les tarifs (l'une, l'autre ou les deux, jamais aucune),
  partagées avec le simulateur : celui-ci calcule sur le prix de ce choix.
- `components/pricing.tsx` — le sélecteur de durée (chaque durée annonce ses
  mois offerts ; le curseur glisse de l'une à l'autre), une carte par formule,
  à cocher (prix du mensuel barré, prix de la durée, économie en euros et en
  pourcentage sur l'engagement, somme réglée à l'échéance, puis ce qu'elle
  comprend), et le bandeau « Votre sélection » qui additionne.
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

## Blog et pages par métier

Des pages de contenu, pour être trouvé sur Google par les praticiens qui
cherchent un site ou des conseils. Elles sont calmes (aucune animation au
défilement), tout leur texte est dans le code de la page, et chaque bouton
« démo » y ouvre la même fenêtre que sur l'accueil.

| Adresse | Page | Fichier |
| --- | --- | --- |
| `/blog` | thématiques, article à la une, tous les articles, guides par métier | `app/blog/page.tsx` |
| `/blog/categorie/<thématique>` | les articles d'une thématique | `app/blog/categorie/[slug]/page.tsx` |
| `/blog/<article>` | un article : sommaire, sections, questions fréquentes, articles liés | `app/blog/[slug]/page.tsx` |
| `/creation-site-internet` | l'entrée vers les pages par métier | `app/creation-site-internet/page.tsx` |
| `/creation-site-internet-<métier>` | une page par métier | `app/[slug]/page.tsx` |

- **Les contenus sont des données** : `content/blog.ts` (thématiques, format
  d'un article), `content/articles/` (les articles, inscrits dans `ARTICLES`
  de `index.ts` — le premier est « à la une ») et `content/professions.ts`
  (une fiche par métier ; `featured` la place dans la colonne « Par métier »
  du pied de page). Ajouter un article ou un métier, c'est ajouter une entrée :
  la page, les listes, le pied de page et le plan du site suivent.
- **Écriture** : `**gras**` et liens internes `[libellé](/adresse)` dans les
  textes. Mêmes règles que le reste de la vitrine — rien d'inventé, aucun
  résultat promis — et la prudence sur le cadre de chaque métier (en cas de
  doute, renvoyer vers l'ordre, la fédération ou l'école).
- **L'offre vient du produit** : prix, nombre de pages et d'articles des pages
  par métier sont lus dans `@theralys/db/plans` (`components/pages/offer.tsx`),
  comme la grille des tarifs.
- **Référencement** : chaque page porte son titre, sa description, son adresse
  canonique (en `www`) et ses données structurées (`lib/site.ts`) ;
  `app/sitemap.ts` et `app/robots.ts` annoncent toutes les pages. Le pied de
  page, le même partout, recense tous les métiers et toutes les thématiques.
- `components/pages/` — le cadre commun (`shell.tsx` : en-tête, bandeau de
  titre, fil d'Ariane, cartes, questions), la mise en forme des textes
  (`prose.tsx`) et les sections (`sections.tsx`, `offer.tsx`).

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

La page s'appuie sur des images de **banques d'images** (Pexels, Mixkit et
Coverr : licences gratuites, usage commercial sans attribution obligatoire)
pour un rendu naturel : des praticiens au travail, la nature au calme.

| Emplacement | Fichier | Source |
| --- | --- | --- |
| Haut de page (vidéo) | `public/media/hero-1080.mp4`, `hero-720.mp4` | huit plans, cinq scènes : séance en cabinet (Pexels, vidéos 4098445 et 4098435), professeure de yoga au jardin (Coverr, « communication with a yoga teacher » et « brunette woman smiling »), massage du dos (Mixkit 4744), praticienne à son bureau (Mixkit 4957 et 4937), yoga seul au soleil (Mixkit 887) |
| Haut de page (image d'attente) | `assets/photos/hero-poster.jpg` | première image de la vidéo |
| « Vous gardez la main » | `assets/photos/cabinet.jpg` | Pexels, photo 16269026 |
| Bandeau avant les tarifs | `assets/photos/foret.jpg` | Pexels, photo 165812 |
| Demande de démo | `assets/photos/montagnes.jpg` | Pexels, photo 14871684 |

- **Vidéo** (`components/hero-video.tsx`) : huit plans enchaînés en fondu,
  23,8 s, en boucle sans coupure (la fin se fond dans le début), sans son.
  L'image d'attente s'affiche d'emblée, la vidéo se charge ensuite et la
  remplace en fondu : la page n'attend jamais la vidéo. 720p sur téléphone,
  1080p au-delà. Aucune vidéo en mouvement réduit ni en économie de données.
  Elle s'arrête hors de l'écran, et un bouton la met en pause.
  Le montage se refait avec `scripts/monter-video-hero.sh <sources> <sortie>`
  (ffmpeg ; la liste des plans — fichier, début, durée, cadence — est en tête
  du script, les sources en 1080p). Chaque plan est relu à 25 images par
  seconde, image pour image : aucune saccade. Les hautes lumières sont
  plafonnées (les murs clairs du cabinet) pour que le titre blanc reste
  lisible. Sur Mixkit, seules les vidéos sous « Free License » sont
  utilisables ici : celles marquées « Restricted License » sont réservées à
  l'usage personnel. Versions précédentes : forêt dans la brume et main dans
  les blés (Pexels 5841958 et 5098636) ; praticienne et patiente, puis un
  soin (Pexels 5793440 et 6629950).
- **Photos de fond** (`components/photo-backdrop.tsx`) : plein cadre sous un
  voile, immobiles. Le voile est réglé pour que le texte
  garde un contraste d'au moins 4,5:1 sur toute la photo (mesuré sur
  capture, bureau et téléphone).
- Pour changer un média : remplacer le fichier, garder son nom, et revérifier
  la lisibilité du texte posé dessus.

## Motion design

Les séquences sont jouées par **GSAP** (`gsap`, `@gsap/react`), en suivant les
skills officiels de GSAP (`greensock/gsap-skills`) : `useGSAP` avec nettoyage
automatique, ScrollTrigger pour tout ce qui est lié au défilement,
`gsap.matchMedia()` pour le mouvement réduit, uniquement `transform` et
`opacity`.

- `components/motion/gsap.ts` — le socle : modules enregistrés une seule fois
  (ScrollTrigger, ScrollToPlugin, DrawSVG, CustomEase), **une seule courbe**
  (« harmony », la même que les transitions CSS), trois durées.
- `components/motion/director.tsx` — le chef d'orchestre. Le balisage reste
  déclaratif, il met en mouvement ce que les composants marquent :
  - `[data-hero]` : **une seule séquence d'entrée** au chargement (titre mot à
    mot, texte, anneau des outils, boutons, capture de l'espace client), puis
    le message s'estompe à mesure qu'on défile vers la capture ;
  - `[data-reveal]` : fondu et courte montée à l'entrée dans l'écran, en
    cascade pour les blocs qui entrent ensemble (`ScrollTrigger.batch`) ;
  - `[data-reveal="kinetic"]` : titres dont les mots montent de derrière un
    masque (`components/kinetic.tsx`) ;
  - `[data-hub]` : les liaisons du schéma se tracent depuis Harmony, puis
    chaque outil se pose au bout de la sienne ;
  - `[data-week]` : la semaine type se remplit jour après jour ;
  - `a[href^="#"]` : défilement en douceur vers la section (ScrollToPlugin).
    Pas de `scroll-behavior: smooth` en CSS : il gêne ScrollTrigger.
- Liés au défilement (`scrub`) : la capture qui se redresse
  (`scroll-tilt.tsx`), le trait de la frise (`timeline.tsx`), la barre de
  lecture (`scroll-progress.tsx`).
- `count-to.tsx` : les prix filent vers leur nouvelle valeur ; `pricing.tsx` :
  la coche et le bandeau « Votre sélection » accusent réception d'un choix.
- `tool-orbit.tsx` — **l'anneau des outils** du haut de page, façon Saturne,
  seule scène dessinée image par image (`gsap.ticker`). Deux calques
  `<canvas>`, derrière et devant la sphère, portent les anneaux en bandes, les
  poussières (plus rapides près de la planète) et la traînée colorée de chaque
  outil ; la sphère et les pastilles restent du HTML, les pastilles sont de
  vrais liens vers la visite guidée. À l'entrée, la sphère se pose, les
  anneaux s'ouvrent et les outils rejoignent l'orbite en spirale. Ensuite le
  plan des anneaux s'incline sous le pointeur, l'orbite prend de l'élan quand
  on fait défiler la page, elle s'arrête en douceur au survol d'une pastille,
  et la planète répond d'une onde à la couleur de l'outil qui passe devant
  elle. Au clavier, la pastille qui reçoit le focus vient se placer devant.
  Rien n'est dessiné quand la scène est hors de l'écran ; en mouvement réduit
  elle est posée, immobile. Dimensions dans `globals.css` (`.saturn`).

Règles tenues (passe « unslop », d'après le skill de Damir Sokolovsky,
`heydamir/unslop`, CC BY 4.0) : le mouvement explique quelque chose ou n'existe
pas. Une seule entrée au chargement, aucun rebond, aucun survol qui soulève,
pas de halo, de reflet ni d'aimant. Restent en boucle, voulus : l'anneau des
outils — la pièce maîtresse du haut de page, la seule à porter traînées,
reflets et relief au pointeur —, les bandeaux qui défilent et la barre de la
visite guidée. Les blocs
pas encore entrés sont masqués par leur seule opacité : ils restent lus par
les lecteurs d'écran et trouvés par la recherche dans la page.

En `prefers-reduced-motion`, GSAP ne joue rien : tout est en place d'emblée.

## Accessibilité

Contraste AA, cibles tactiles de 44 px, un seul `h1`, lien d'évitement,
onglets de la visite pilotables au clavier (flèches, Début, Fin), visite
guidée qui attend au survol et au focus, s'arrête dès qu'on choisit un outil
et ne défile pas en mouvement réduit.

## Développement local

```bash
pnpm --filter @theralys/web dev   # http://localhost:3003 (depuis la racine)
```

La page est statique. La demande de démo et l'estimation par e-mail écrivent
en base (`leads`) : il leur faut `DATABASE_URL`. L'estimation par e-mail
demande en plus `RESEND_API_KEY` et `MAIL_FROM` (sans elles, le bloc n'est pas
affiché) ; `RESEND_API_URL` désigne un faux service d'envoi pour les essais
locaux.

## Déploiement

Projet Vercel `harmony-web`, auto-déployé à chaque push sur `main`
(turbo-ignore). L'apex `harmony-web.fr` redirige en 308 vers
`www.harmony-web.fr` — toujours tester le www. Pages statiques servies
par le CDN ; fonctions en région `cdg1` (Paris).
