# @theralys/sites — sites publics des praticiens

Rendu multi-tenant des sites clients (ex. `demo.harmony-web.fr`) : chaque
requête est résolue vers un site par son domaine, puis rendue depuis les
sections stockées en base.

## Structure

- `app/[site]/` — pages du site praticien (accueil, pages de spécialité,
  blog) rendues depuis le modèle de sections de `@theralys/shared` ;
  `[legal]/` sert les pages Mentions légales / Confidentialité / Cookies
  générées (`buildLegalPage`), `not-found.tsx` la page introuvable
  thématisée et personnalisable (`theme.notFound`, clé du site lue dans
  l'en-tête `x-hy-site` posé par le middleware), `[...rest]/` renvoie toute
  URL profonde inconnue vers cette 404.
- `components/sections.tsx` — renderer des sections ; les paragraphes
  utilisent `whitespace-pre-line` et le composant `Rich` convertit les
  marqueurs `**gras**` en `<strong>`. Les sections `hidden` ne sont pas
  rendues (barre « Section masquée » dans l'aperçu de l'éditeur seulement) ;
  chaque section porte `data-hy-section` (index dans `page.sections`),
  `data-hy-shared` (section héritée de l'accueil) et `data-hy-label` pour
  l'éditeur du studio (`editor-bridge.tsx`, rendu uniquement dans l'aperçu
  authentifié). Icônes des encarts : `SECTION_ICON_SVG` partagé.
- `components/site-header.tsx` + `mobile-nav.tsx` — ancres limitées aux
  sections de l'accueil existantes et visibles (`lib/nav.ts`), menu mobile ;
  `site-footer.tsx` — cabinets, téléphone, liens (spécialités, blog, pages
  légales), réseaux sociaux (`theme.social`), texte et informations
  complémentaires (`theme.footer`), « Gérer les cookies ».
- `middleware.ts` — purge puis pose les en-têtes `x-hy-preview` (aperçu de
  l'éditeur, jeton signé) et `x-hy-site` : jamais de confiance aux valeurs
  entrantes.
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
