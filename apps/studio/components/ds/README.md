# Design system du studio (« ds »)

Le socle du nouveau studio : jetons, composants, coquille. Il est livré en **lancement masqué** : tout est nouveau et préfixé `ds-`, aucune page existante ne l'utilise encore, et rien de ce qui existe n'a changé d'aspect.

- Jetons et CSS : `app/globals.css`, à partir du bandeau « DESIGN SYSTEM DU STUDIO ».
- Composants : ce dossier. Un seul import : `import { … } from "@/components/ds"`.
- Démonstration, hors production (404 en production) : `/apercu-design` (fondations et composants), `/apercu-design/accueil` (futur Accueil), `/apercu-design/section/<clé>` (page de section type, pour les huit autres sections).

La direction : **un ciel vivant**. Une famille de bleus voisins, du turquoise au violet, un dégradé par section, un seul accent chaud. Lisible d'abord (corps en 16 px, AA partout), du relief sans verre dépoli, un mouvement bref qui répond à un geste.

```tsx
import { Plus } from "lucide-react";
import { Button, Card, CardHeader, PageHeader, Stagger } from "@/components/ds";

export default function PublicationsPage() {
  return (
    <Stagger className="space-y-6">
      <PageHeader section="publications" action={<Button icon={<Plus size={18} aria-hidden />}>Proposer un sujet</Button>} />
      <Card>
        <CardHeader title="Novembre : 4 articles prévus" description="Un article par semaine, écrit pour vous." />
      </Card>
    </Stagger>
  );
}
```

## 1. Jetons

Tous sont des variables de thème Tailwind v4 : `--color-ds-brand-600` donne `bg-ds-brand-600`, `text-ds-brand-600`, `border-ds-brand-600`…

| Famille | Utilitaires | Quand s'en servir |
|---|---|---|
| Marque | `ds-brand-{50…950}` | `500` (`#0E97DD`) est le bleu de marque : pictogrammes, grands titres, graphiques, **jamais** sous du texte blanc courant. `600` et plus foncé : aplats sous texte blanc. `700` : liens. `800` : libellé des boutons `secondary` et `quiet`. `100` + `900` : badge. `950` : encre sur un fond vif clair. |
| Bleus voisins | `ds-teal`, `ds-cyan`, `ds-blue`, `ds-indigo`, `ds-violet` · `{50,100,200,300,500,600,700,900}` | Illustrations et cas hors section. Dans une page, préférer les jetons de la section courante. |
| Encre | `ds-ink-{25…900}` | `900` texte · `800` libellés · `700` navigation, texte sur teinte · `600` texte secondaire (le plus clair admis sur une teinte ou un bandeau) · `500` intertitres **sur blanc seulement** (4,7:1) · `450` bordure de champ (3:1) · `300`, `200` filets · `100` fond neutre · `50` fond de page. |
| Statuts | `ds-success`, `ds-warning`, `ds-danger` | Badge : fond `100`, texte `900`. Texte sur blanc : `700`. Aplat sous blanc : `success-600`, `danger-600`. `warning-500` ne porte que de l'encre foncée. |
| Soleil | `ds-sun-{100,200,400,600,700,900}` | Le seul accent chaud : une réussite, « Nouveau », la durée d'une étape. Jamais un statut. |
| Section courante | `bg-ds-section-tint`, `bg-ds-section-tint-2`, `border-ds-section-line`, `text-ds-section-ink`, `text-ds-section-accent`, `bg-ds-section-from`, `bg-ds-section-to` | Suivent l'identité posée par `data-ds-section` (voir § 2). `tint` : fond doux ; `tint-2` : fond plus marqué (badge, piste de jauge) ; `ink` : texte foncé assorti ; `accent` : texte ou trait coloré (≥ 4,5:1 sur blanc et sur les deux teintes). |
| Dégradés | `bg-ds-section-gradient` · `bg-ds-section-gradient-deep` · `bg-ds-section-soft` · `bg-ds-brand-gradient` · `text-ds-gradient` · `ds-border-gradient` | Vif : pastilles d'icône, pastille de la barre basse. Profond : le seul dégradé qui reçoit du texte blanc courant. Doux : bandeau d'en-tête, état vide teinté. Marque : bouton principal, quelle que soit la section. `ds-border-gradient` : une seule carte par écran (la « prochaine étape »). |
| Graphiques | `ds-chart-1…4`, `ds-chart-muted` | Séries multiples, dans cet ordre fixe. Une série seule prend `ds-section-accent`. |
| Typographie | `font-ds-display` (Figtree) · `text-ds-meta` 13 px · `text-ds-body` 15 px · `text-base` 16 px · `text-ds-title` 28 px · `text-ds-kpi` 34 px · `ds-tnum` | Figtree pour les titres, Inter pour le reste. Corps en 16 px ; 15 px pour le secondaire, les boutons, la navigation ; 13 px pour badges et mentions, rien en dessous de 12 px. `ds-tnum` (chiffres tabulaires) seulement sur des nombres alignés ou qui changent en place — pas sur une phrase : Inter élargit aussi la ponctuation. |
| Rayons | `rounded-ds-sm` 12 · `rounded-ds-md` 16 · `rounded-ds-card` 20 · `rounded-ds-band` 28 | Champs et entrées de navigation · tuiles et pastilles · cartes · bandeaux. |
| Ombres | `shadow-ds-card` · `shadow-ds-pop` · `shadow-ds-bar` · `shadow-ds-glow` · `shadow-ds-brand-glow` | Repos · flottant (survol, feuille) · barre basse · halo d'une pastille en dégradé · halo du bouton principal. |
| Durées | `duration-ds-press` 100 · `-fast` 150 · `-base` 200 · `-move` 240 · `-enter` 280 · `-slow` 400 ms | Pression · survol · fondu · indicateur qui glisse · entrée d'un bloc · grande surface (rare). |
| Courbes | `ease-ds-out` · `ease-ds-enter` · `ease-ds-move` · `ease-ds-exit` · `ease-ds-spring` | Entrées et survols · surface qui arrive · déplacement · sortie · léger rebond d'une réussite. |
| Focus | `ds-focus` · `ds-focus-inverse` · `ds-focus-inset` | Anneau 2 px bleu décalé de 2 px · le même en blanc sur fond foncé · à l'intérieur, pour un élément dans une zone qui défile. |
| Mouvement | `ds-rise` · `ds-fade-in` · `ds-pop` · `ds-press` · `ds-lift` · `ds-spin` | Entrée d'un bloc · fondu · apparition à rebond · pression · carte cliquable qui se soulève · indicateur de chargement. |

## 2. Sections : un dégradé, une teinte, une icône

`data-ds-section="<clé>"` pose l'identité d'une section sur un élément et tout ce qu'il contient. `PageHeader` et `GreetingBand` le font pour la page (et, par `data-ds-ambient`, teintent les halos de toute la coquille) ; chaque composant accepte aussi une prop `section`. Le registre `sections.ts` porte libellés, adresses, icônes et phrases d'usage ; les couleurs vivent dans `globals.css` (la page d'aperçu vérifie que les deux concordent).

| Clé | Icône (lucide) | Dégradé | Vif — pictogrammes, texte ≥ 24 px | Profond — texte blanc courant | Teinte · encre · accent |
|---|---|---|---|---|---|
| `accueil` | `House` | Horizon | `#0E97DD → #2F6DD3` | `#0079B4 → #2454B3` | `#F1F8FF` · `#003967` · `#006BB9` |
| `mon-site` | `Globe` | Oasis | `#23A381 → #009298` | `#1B8367 → #006B72` | `#E9FCF7` · `#034239` · `#127A6B` |
| `publications` | `Newspaper` | Lagon | `#01A2B9 → #0A88CC` | `#017F95 → #09669A` | `#EDF9FF` · `#003E52` · `#027495` |
| `reseaux-sociaux` | `Share2` | Aurore | `#0E97DD → #6A73DD → #8F6CE0` | `#0079B4 → #575BCB → #7D51D2` | `#F4F6FF` · `#2C306A` · `#5458C8` |
| `fiche-google` | `MapPin` | Rivage | `#00A497 → #008EB3` | `#008479 → #006A8B` | `#E8FBFD` · `#004046` · `#007781` |
| `google-ads` | `MousePointerClick` | Cobalt | `#2D74D9 → #4B53C2` | `#1C55B2 → #363896` | `#F2F7FF` · `#19356B` · `#2E62C9` |
| `meta-ads` | `Megaphone` | Iris | `#6269DB → #7A4ECF` | `#4A4CBA → #5E31A9` | `#F6F6FF` · `#392C67` · `#6B50C2` |
| `academie` | `GraduationCap` | Glacier | `#3ACED6 → #46AFEC` (clair : encre dessus) | `#8CEBEA → #8ED4FF` (clair : encre dessus) | `#E9FAFF` · `#003F4B` · `#00768A` |
| `compte` | `UserRound` | Ardoise | `#52657A → #2D3E55` | `#425468 → #1E2F44` | `#F4F7FB` · `#1E2F41` · `#44576B` |

Le texte posé sur un dégradé se colore avec `text-ds-section-on` (vif) ou `text-ds-section-on-deep` (profond) : blanc partout, encre pour Glacier. Le bouton principal reste au bleu de marque dans toutes les sections : la couleur de section situe, elle ne commande pas.

## 3. Composants

Composants serveur sauf mention **client**. Tous acceptent `className` ; `section` change l'identité locale.

| Composant | Props | À savoir |
|---|---|---|
| `AppShell` | `sections`, `siteHref`, `logoutAction`, `userName?`, `badges?`, `supportName?`, `brand?`, `hrefs?` | La coquille : barre latérale groupée par objectif à partir de 1 024 px, barre du haut et barre basse (4 destinations + « Plus ») en dessous. `sections` vient de `allowedSections({ publications, social, google, googleAds, metaAds })`. `badges` : compteur ou « Nouveau » par section. `supportName` affiche le bandeau du mode support. |
| `PageHeader` | `section`, `title?`, `purpose?`, `action?`, `secondary?`, `children?`, `tone?: "soft" \| "vivid"`, `ambient?`, `as?` | L'en-tête commun : pastille, **le** `h1`, phrase d'usage, une action principale. Titre et phrase viennent du registre par défaut. `vivid` (dégradé profond) : une page par parcours, pas plus. |
| `GreetingBand`, `GreetingChip` | `title`, `eyebrow?`, `eyebrowIcon?`, `children?`, `footer?`, `aside?`, `section?` | Bandeau de l'Accueil, seul grand aplat en dégradé de l'écran. `aside` reçoit la `NextStepCard`. |
| `Button`, `LinkButton` | `variant?: "primary" \| "secondary" \| "quiet" \| "danger" \| "inverse"`, `size?: "sm" \| "md" \| "lg"`, `icon?`, `iconRight?`, `loading?` · lien : `href`, `external?` | Un seul `primary` par vue. `inverse` : sur un bandeau en dégradé. 44 px de haut (`sm` : 36 px, 44 px au doigt) ; un libellé trop long pour l'écran passe à la ligne au lieu de déborder. `loading` garde le libellé et bloque le double envoi. Comme le bouton partagé, il soumet le formulaire qui le contient : passer `type="button"` à un bouton d'appoint dans un formulaire. `ghost` est accepté comme synonyme de `quiet`. |
| `Card`, `CardHeader` | `as?`, `variant?: "plain" \| "tinted"`, `padding?: "none" \| "sm" \| "md" \| "lg"`, `section?` · en-tête : `title`, `description?`, `icon?`, `action?`, `as?` | Carte statique : elle ne bouge pas au survol. Marge `md` par défaut, sauf si `className` en porte déjà une (`p-6`…). |
| `InteractiveCard` | `href` (+ `external?`, `aria-label?`) ou props de bouton, `padding?`, `section?` | La seule carte qui se soulève : entièrement cliquable, anneau de focus sur toute la carte. |
| `IconBadge`, `SectionBadge` | `icon`, `tone?: "gradient" \| "soft"`, `size?: "sm" \| "md" \| "lg" \| "xl"`, `section?` | Pastille d'icône. `gradient` : repère fort ; `soft` : listes. `SectionBadge` prend l'icône du registre. |
| `Badge`, `AiBadge`, `StatusPill` | `tone?: "neutral" \| "brand" \| "section" \| "success" \| "warning" \| "danger" \| "sun"`, `icon?` · `status: "brouillon" \| "planifie" \| "a-relire" \| "en-cours" \| "publie" \| "echec"` | Un statut porte toujours une icône et un mot, jamais la couleur seule. `AiBadge` (étincelle) est la marque unique d'un contenu produit par l'IA. `primary` et `info` sont acceptés comme synonymes de `brand`. |
| `KpiTile` | `label`, `value`, `icon`, `format?`, `prefix?`, `suffix?`, `caption?`, `delta?: { value, unit?, label, goodWhen? }`, `trend?`, `trendLabel?`, `href?`, `section?` | Chiffre clé : pastille, libellé, valeur qui roule jusqu'à son nombre, variation signée avec sa période, mini-courbe. Sous 240 px de large elle se resserre d'elle-même. |
| `AnimatedNumber` | `value`, `format?`, `prefix?`, `suffix?`, `delay?` | Compteur en CSS, rendu serveur : chaque chiffre roule. Les lecteurs d'écran lisent la valeur finale. |
| `Sparkline` | `data`, `label`, `height?` | Mini-courbe d'une seule série, à l'accent de la section. `label` décrit la tendance. |
| `AreaChart` **client** | `data: { label, tick?, value }[]`, `unit: [singulier, pluriel]`, `label`, `height?` | Courbe en aire : survol, toucher ou flèches du clavier ; les valeurs existent aussi en tableau (« Voir les chiffres »). |
| `ProgressBar`, `ProgressRing` | `value`, `max?`, `label?` / `ariaLabel?`, `valueText?`, `hideValueText?`, `busy?`, `size?` · anneau : `label`, `size?`, `thickness?`, `children?` | Jauge au dégradé de la section. `valueText` dit la valeur en clair (« 3 étapes sur 5 »). |
| `SetupChecklist` | `steps: { id, label, description?, done, href?, actionLabel? }[]`, `title?`, `summary?`, `defaultOpen?` | Mise en route repliable avec anneau de progression ; seule l'étape en cours propose son action. |
| `NextStepCard` | `title`, `action`, `eyebrow?`, `children?`, `duration?`, `secondary?`, `icon?`, `section?`, `as?` | La « prochaine étape » : une par écran, avec sa durée et une seule action. |
| `EmptyState` | `icon`, `title`, `children`, `action?`, `secondary?`, `tone?: "plain" \| "tinted"`, `as?` | Dit pourquoi c'est vide, ce qui apparaîtra, et propose une action. Jamais pendant un chargement. |
| `Skeleton`, `SkeletonText`, `KpiTileSkeleton`, `CardSkeleton`, `PageSkeleton` | `lines?` · `tiles?`, `cards?` | `PageSkeleton` est prêt pour un `loading.tsx`. Le squelette reprend la forme du contenu attendu. |
| `Tabs`, `TabPanel` **client** | `tabs: { id, label, icon?, badge?, href? }[]`, `value`, `onChange?`, `label`, `idBase`, `variant?: "underline" \| "pill"` | Onglets de page (trait qui glisse) ou sélecteur à segments (pastille qui glisse). Flèches, Début, Fin. Avec `href`, ce sont des liens. |
| `StepProgress` | `title`, `steps: { label }[]`, `current`, `status?: "running" \| "done" \| "error"`, `estimate?`, `elapsed?`, `detail?`, `hint?`, `doneMessage?`, `errorMessage?`, `footer?` | Attente d'une génération longue : étapes nommées, durée annoncée, temps écoulé — pas de pourcentage inventé. |
| `GenerationProgress`, `useStepTimeline` **client** | `steps: { label, seconds, details? }[]`, `running`, `done?`, `failed?` + props de `StepProgress` | Fait avancer `StepProgress` d'après les durées typiques quand la tâche ne remonte pas son avancement ; s'arrête sur la dernière étape tant que `done` n'est pas vrai. |
| `InlineSuccess` | `children`, `detail?`, `size?: "sm" \| "md"` | Confirmation discrète : la coche surgit, une onde chaude passe une fois. Annoncée sans prendre le focus. |
| `Stagger`, `Reveal` | `as?` · `order?` | Entrée en cascade des enfants directs (racine de page, grille) · entrée d'un élément isolé. |
| `Spinner` | `label?` | Prend la couleur du texte ; taille par `className` (`size-4` par défaut). |
| Utilitaires | `SECTIONS`, `SECTION_ORDER`, `SECTION_GROUPS`, `allowedSections`, `sectionForPath`, `formatNumber`, `formatDelta`, `plural`, `formatElapsed`, `NBSP` | Registre et mise en forme française des nombres. |

## 4. Mouvement

1. On n'anime que `transform` et `opacity`. Une ombre, une largeur, une couleur de fond ne s'animent pas : l'ombre forte d'une carte est sur un pseudo-élément dont seule l'opacité change, une jauge est translatée, un anneau est découvert par des caches qui tournent, un graphique se révèle par deux translations opposées.
2. Tout mouvement est écrit sous `prefers-reduced-motion: no-preference`. Sans cette préférence il reste au plus un fondu de 200 ms : rien ne se déplace.
3. Une réponse à un geste dure 100 à 200 ms (pression 100, survol 150, bascule 200). Un indicateur glisse en 240 ms. Un bloc entre en 280 ms.
4. La cascade d'une page (`Stagger`) : 40 ms par rang, cinq rangs au plus, 480 ms au total. Ne pas emboîter deux cascades.
5. Rien ne tourne en boucle, sauf un indicateur de chargement (`Spinner`, reflet d'un squelette ou d'une jauge `busy`).
6. Aucune animation ne laisse de `transform` derrière elle (`animation-fill-mode: backwards`) — voir § 6.
7. Un seul moment de réussite par action (`InlineSuccess`, coche d'une étape). Pas de confettis.

Aucune bibliothèque d'animation : tout est en CSS, et le compteur est rendu côté serveur.

## 5. Accessibilité

- **Contraste** : texte courant ≥ 4,5:1, texte ≥ 24 px (ou ≥ 18,66 px gras), pictogrammes et bordures de champ ≥ 3:1. Du blanc de taille courante ne se pose que sur un dégradé profond, `brand-600` ou plus foncé — jamais sur un dégradé vif, jamais en blanc translucide (`text-white/80` échoue). Sur un bandeau doux : `ink-600` ou plus foncé, l'encre de section, `brand-800`.
- **Focus** : toujours visible, anneau de 2 px (`ds-focus`), jamais retiré. L'élément focalisé n'est pas masqué par les barres collantes (marges de défilement posées par la coquille).
- **Clavier** : tout s'atteint et s'actionne au clavier ; ordre de tabulation = ordre de lecture ; lien « Aller au contenu » en tête de coquille.
- **Cibles** : 44 × 44 px au moins au doigt (les contrôles de 36 px remontent à 44 px sur écran tactile).
- **Jamais la couleur seule** : un statut a son icône et son mot, une variation son signe, un onglet actif son trait et sa graisse.
- **Structure** : un seul `h1` par page (`PageHeader` ou `GreetingBand`), des niveaux de titre sans saut (`as`), `role="main"` unique fourni par la coquille.
- **Annonces** : une réussite et un changement d'étape passent par `role="status"`, une erreur par `role="alert"` ; le chronomètre n'est jamais annoncé.
- **Graphiques** : un nom accessible, les valeurs en tableau, un parcours au clavier.
- **Zoom et petits écrans** : aucun défilement horizontal de 320 à 1 440 px ; un libellé long passe à la ligne, il n'est pas coupé.

### Contrastes

Calculés (WCAG 2.x, après arrondi 8 bits ; pour un dégradé, le point le plus défavorable) :

| Paire | Contraste | Seuil |
|---|---:|---:|
| `ink-900` sur blanc · sur le fond de page | 17,80 · 16,99 | 4,5 |
| `ink-800` sur blanc | 14,53 | 4,5 |
| `ink-700` sur blanc | 10,26 | 4,5 |
| `ink-600` sur blanc · sur le fond de page · sur `tint-2` (pire section) | 7,50 · 7,16 · 6,45 | 4,5 |
| `ink-500` sur blanc (intertitres ; jamais sur teinte) | 4,72 | 4,5 |
| `ink-450`, bordure de champ, sur blanc | 3,34 | 3 |
| Lien `brand-700` sur blanc · sur le fond de page | 6,16 · 5,88 | 4,5 |
| Bouton `primary` : blanc sur le dégradé de marque | 4,78 | 4,5 |
| Boutons `secondary` et `quiet` : `brand-800` sur blanc · survolé · sur `tint-2` | 8,16 · 7,12 · 7,02 | 4,5 |
| Bouton `danger` : blanc sur `danger-600` | 5,41 | 4,5 |
| Bouton `inverse` : `brand-900` sur blanc | 10,52 | 4,5 |
| Anneau de focus `brand-600` sur blanc · fond de page · `tint-2` | 4,78 · 4,56 · 4,11 | 3 |
| Badges (fond 100, texte 900) : neutre · marque · réussite · attention · erreur · soleil · section | 9,35 · 9,18 · 10,35 · 9,63 · 10,27 · 9,69 · 10,01 | 4,5 |
| Dégradés profonds, blanc : Horizon · Oasis · Lagon · Aurore · Rivage · Cobalt · Iris · Ardoise | 4,78 · 4,68 · 4,70 · 4,77 · 4,59 · 7,01 · 6,92 · 7,78 | 4,5 |
| Glacier (clair), encre `brand-950` : profond · vif | 8,87 · 5,87 | 4,5 |
| Dégradés vifs, pictogramme blanc : Horizon · Oasis · Lagon · Aurore · Rivage · Cobalt · Iris · Ardoise | 3,24 · 3,17 · 3,05 · 3,23 · 3,11 · 4,55 · 4,60 · 6,00 | 3 |
| Encre de section sur `tint` · `tint-2` (pire section) | 10,71 · 10,01 | 4,5 |
| Accent de section sur blanc · `tint` · `tint-2` (pire section) | 5,22 · 4,91 · 4,59 | 4,5 |
| Bandeau profond, lumières turquoise et violette comprises : blanc | 4,58 | 4,5 |
| Pastille du bandeau d'accueil : blanc sur `brand-950` à 30 % | 6,41 | 4,5 |
| Réussite `success-900` sur blanc · erreur `danger-700` sur blanc | 11,79 · 7,20 | 4,5 |
| Coche blanche sur `success-600` (pictogramme) | 4,54 | 3 |
| Infobulle de graphique : blanc sur `ink-900` | 17,80 | 4,5 |
| Séries `chart-1…4`, `chart-muted` sur blanc | 4,78 · 4,12 · 5,19 · 3,45 · 3,34 | 3 |

Mesurés sur le rendu (chaque texte visible des pages d'aperçu contre les pixels peints dessous, à 390, 768, 1 024 et 1 440 px) : **__MESURE_TEXTES__**. Bandeaux à décor, au pixel le plus défavorable de toute la zone de contenu : **__MESURE_BANDEAUX__**.

## 6. Mise en page

- La barre latérale apparaît à `lg` (1 024 px). En dessous, la page occupe toute la largeur : `sm` et `md` servent aux grilles à deux colonnes, `xl` aux mises en page larges (à `lg`, la zone de contenu ne fait que 744 px).
- Aucun ancêtre du contenu ne doit garder un `transform`, un `filter`, un `backdrop-filter`, `contain` ou `container-type` : la `Modal` partagée n'a pas de portail et se positionnerait dans ce bloc au lieu de la fenêtre. C'est pourquoi les entrées s'effacent après coup, et pourquoi il n'y a ni verre dépoli ni requête de conteneur autour d'une page (seule `KpiTile` en porte une, sur elle-même).
- La zone de contenu est un `<div role="main">`, pas un `<main>` : la feuille partagée cible `main > * > *` et `main .shadow-card` par des règles hors couche (montée de 550 ms, soulèvement de toutes les cartes) qu'on ne pourrait pas surcharger.
- Pas de `background-attachment: fixed`, pas de grand flou : les halos de fond sont un calque fixe à part.

## 7. Plan de bascule

Deux choses sont **déjà en place et inactives**, parce qu'elles ne s'appliquent que sous `.ds-app` (la coquille) ou `.ds-scope` — voir le bloc 5 de `globals.css` :

- les jetons hérités de `packages/ui` y prennent des valeurs lisibles : `primary-500 → ds-brand-600` (et `600 → 700`, `700 → 800`, `800 → 900`, `900 → 950`, `400 → 500`), `ink-500 → ds-ink-600`, `ink-300 → ds-ink-450`, `success/warning/danger-500 → ds-…-700`, `info-500 → ds-blue-700`, les teintes `-100` assorties, `--radius-card → 20 px` ;
- les champs partagés y reçoivent un anneau de focus de 2 px, et tout élément focalisable sans style propre celui du design system.

Ni `packages/ui` ni le back-office ne changent : monter la coquille suffit à corriger les contrastes des composants partagés et des utilitaires des pages. Le bloc « Composants partagés, sous la coquille » de `/apercu-design` en est le témoin.

| Paire héritée, telle qu'employée par le studio | Aujourd'hui | Sous la coquille |
|---|---:|---:|
| Bouton `primary` : blanc sur `primary-500` | **3,24** | 4,78 |
| Texte secondaire `text-ink-500` (360 emplois) sur blanc · sur le fond de page | **4,21** · **3,94** | 7,50 · 7,02 |
| Lien `text-primary-600` (64 emplois) sur blanc · sur le fond de page | 4,59 · **4,30** | 6,16 · 5,77 |
| Badges `primary` · `success` · `info` · `warning` · `danger` | **3,93** · **3,00** · **3,01** · **1,79** · **3,95** | 5,27 · 5,91 · 6,06 · 5,33 · 5,98 |
| Textes `success-500` · `warning-500` · `info-500` sur blanc | **3,30** · **1,92** · **3,68** | 6,72 · 6,10 · 7,02 |
| Message d'erreur `text-danger-500` (72 emplois) sur blanc | 4,83 | 7,20 |
| Bordure de champ `ink-300` · bordure au focus `primary-400` (seuil 3:1) | **1,52** · **2,37** | 3,34 · 3,24 |

Ce qu'il reste à faire, dans l'ordre :

1. **Monter la coquille** — `app/(app)/layout.tsx` : garder `requireClient`, `getSite` et `logoutAction`, remplacer tout le balisage par

   ```tsx
   const demo = site.type === "demo";
   return (
     <AppShell
       sections={allowedSections({
         publications: demo || hasBlog(site.plan),
         social: demo || hasSocialMedia(site.plan),
         google: demo || hasGoogleProfile(site.plan),
         googleAds: demo || hasGoogleAds(site.plan),
         metaAds: demo || hasMetaAds(site.plan),
       })}
       siteHref={publicSiteUrl(site)}
       logoutAction={logoutAction}
       userName={session.name}
       supportName={session.impersonated ? session.name : undefined}
     >
       {children}
     </AppShell>
   );
   ```

   puis supprimer `app/(app)/studio-nav.tsx`. « Mon site » reste toujours présent, comme aujourd'hui. Le lien « Voir mon site » de la barre latérale garde `data-testid="view-site-link"` ; ceux du mobile n'en portent pas.
2. **Polices** — `app/layout.tsx`, dans l'adresse Google Fonts : `Inter:wght@400;500;600` devient `Inter:wght@400;500;600;700` et `Figtree:wght@600` devient `Figtree:wght@600;700;800`. Retirer ensuite le `<link>` de `app/apercu-design/layout.tsx`.
3. **Éléments fixes des pages** — `app/(app)/meta-ads/market-feedback.tsx` : ligne 42, `md:pl-[296px]` devient `lg:pl-[296px]` et `pb-5` devient `pb-24 lg:pb-5` ; ligne 102, `bottom-4` devient `bottom-24 lg:bottom-4` (au-dessus de la barre basse). La barre latérale apparaissant désormais à 1 024 px et non 768, vérifier chaque page entre ces deux largeurs.
4. **Aplats que la correspondance assombrit** — les jetons `-500` servent aussi de fonds décoratifs : `fiche-google/reviews-tab.tsx:116` (`bg-warning-500`, barres des avis) passe à `bg-ds-warning-500` ; les points d'état `bg-success-500` de `meta-ads/market-card.tsx:138`, `market-detail.tsx:120` et `market-toolbar.tsx:208` passent à `bg-ds-success-600`.
5. **Page par page** — remplacer le `<h1 className="text-4xl font-bold">` et son paragraphe d'introduction par `<PageHeader section="…" />` (19 emplois, fichiers `page.tsx`, `*-client.tsx` et `error.tsx` de chaque section ; `stats-panel.tsx` prend `GreetingBand`) ; envelopper la racine de la page dans `<Stagger className="space-y-6">` (la montée héritée ne s'applique plus sous `role="main"`) ; ajouter un `loading.tsx` qui rend `<PageSkeleton />` (il n'en existe aucun) ; échanger l'import de `Button`, `Card`, `Badge`, `Spinner` de `@theralys/ui` vers `@/components/ds` — mêmes props, mais un bouton `md` fait 44 px de haut (36 avant), un badge 13 px (12 avant) : à vérifier à l'œil. `Input`, `Label`, `Select`, `FieldHint`, `Segmented` et `Modal` restent ceux de `@theralys/ui`, restylés par la coquille.

Hors coquille : les pages `login` et `creer-mot-de-passe` prennent les mêmes couleurs en posant `ds-scope` sur leur élément racine ; l'éditeur `(editor)` garde sa propre mise en page.
