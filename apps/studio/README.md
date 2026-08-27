# @theralys/studio — espace client (app.harmony-web.fr)

Back-office des praticiens : statistiques de visite, publications du blog,
mots-clés Google, académie et éditeur de site (WYSIWYG).

## Structure

- `app/(app)/` — pages avec la barre latérale : Accueil, Publications,
  Mots-clés, Académie, Compte. L'éditeur n'apparaît pas dans la navigation :
  on y accède depuis la carte « Votre site » de l'Accueil.
- `app/(editor)/editor/` — éditeur plein écran des sections du site
  (`section-fields.tsx` contient le champ Paragraphe WYSIWYG : gras réel via
  Ctrl+B, lignes ✅, sérialisé vers le format `**gras**` stocké).
- `app/login/` — authentification par session (cookie signé, `lib/auth.ts`).
- `middleware.ts` — protège toutes les routes hors login.

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
