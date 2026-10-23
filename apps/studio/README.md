# @theralys/studio — espace client (app.harmony-web.fr)

Back-office des praticiens : statistiques de visite, publications du blog,
mots-clés Google, académie et éditeur de site (WYSIWYG).

## Structure

- `app/(app)/` — pages avec la barre latérale : Accueil, Publications,
  Réseaux sociaux, Mots-clés, Académie, Compte. L'éditeur n'apparaît pas dans
  la navigation : on y accède depuis la carte « Votre site » de l'Accueil.
- `app/(editor)/editor/` — éditeur plein écran des sections du site
  (`section-fields.tsx` contient le champ Paragraphe WYSIWYG : gras réel via
  Ctrl+B, lignes ✅, sérialisé vers le format `**gras**` stocké).
- `app/login/` — authentification par session (cookie signé, `lib/auth.ts`).
- `middleware.ts` — protège toutes les routes hors login.

## Réseaux sociaux

Section `app/(app)/reseaux-sociaux/` : contenus Instagram/Facebook/LinkedIn
prêts à poster, préparés à partir du site (Harmony ne publie pas à la place
du praticien). Incluse dans toutes les formules (`hasSocialMedia`), démos
comprises.

- **Calendrier** : 2 contenus par semaine (mardi, vendredi) + jusqu'à 2
  annonces « Nouvel article » le lendemain d'une parution
  (`socialSlotsForMonth`, `@theralys/shared`). « Préparer mon mois de
  contenus » = 1 appel IA pour les créneaux libres (`planSocialMonth`, verrou
  `pg_advisory_xact_lock` par site et mois) ; si le modèle n'a pas rempli tous
  les créneaux, la carte propose « Compléter le mois ».
- **Sur mesure** : 20 demandes par site et mois civil UTC
  (`SOCIAL_REQUESTS_PER_MONTH`, comptées sur `source = 'request'`, archivage
  compris) ; le sujet passe par `checkEthicalCompliance` avant tout appel.
- **Données** : table `social_posts` (`content` = `SocialPostContent`,
  `assets` = rendus mis en cache) ; lecture dans `lib/social/data.ts`, brief
  de site dans `lib/social/brief.ts` (`buildSocialBrief`), accès par site dans
  `lib/social/post-access.ts`.
- **Visuels** : rendus à la demande par `/api/social/[postId]/render`
  (aperçu 540 px) et `/api/social/[postId]/download` (JPG, ZIP, PDF, légende)
  — satori + sharp, polices OFL dans `assets/fonts/`, cache mémoire puis
  Vercel Blob si `BLOB_READ_WRITE_TOKEN` est renseigné (`lib/social/render/`).
- **Variables** : `AI_MOCK=1` pour un générateur déterministe sans clé ;
  `BLOB_READ_WRITE_TOKEN` (optionnel) pour persister les rendus.

## Développement local

Depuis la **racine** du monorepo (pnpm ne trouve pas les workspaces ailleurs) :

```bash
service postgresql start                  # Postgres local (peut s'arrêter entre deux sessions)
cp .env.example .env                      # DATABASE_URL + AUTH_SECRET
cd packages/db && DATABASE_URL=postgresql://postgres:postgres@localhost:5432/theralys \
  pnpm exec drizzle-kit push --force      # le dossier drizzle/ est en retard sur le schéma
cd ../.. && pnpm db:seed
pnpm --filter @theralys/studio dev        # http://localhost:3002
```

Compte de démonstration seedé : `claire@demo-theralys.fr` / `client-demo`.

## Déploiement

Projet Vercel `harmony-studio`, auto-déployé à chaque push sur `main`
(turbo-ignore : le build ne tourne que si `apps/studio` ou un de ses
packages `@theralys/*` change). Domaine de production : `app.harmony-web.fr`.
Compte Vercel en plan Pro ; fonctions en région `cdg1` (Paris), réglée
dans Settings → Functions de chaque projet.
