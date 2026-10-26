# Déployer Harmony sur Vercel — guide pas à pas

Cible : 3 projets Vercel (sites publics, admin, studio) + une base PostgreSQL
managée (Neon). Durée totale : ~45 minutes. Aucune ligne de commande n'est
nécessaire, sauf pour les migrations (étape 2.3, puis la section « Mettre à
jour le schéma en production » à chaque nouvelle migration).

> **Plan Vercel** : le plan **Pro (20 $/mois)** est nécessaire en production —
> la génération IA d'une démo dure ~4-5 min (fonctions jusqu'à 800 s — plan Pro avec Fluid compute, configuré
> dans le code) et le cron des jobs doit tourner **toutes les heures** (le plan
> gratuit Hobby limite les fonctions à 60 s et les crons à 1/jour). Vous pouvez
> faire tous les tests en Hobby avec le mode mock, puis passer Pro au moment de
> brancher la clé Anthropic.

---

## Étape 0 — Préparer les comptes (5 min)

1. **Vercel** : [vercel.com/signup](https://vercel.com/signup) → « Continue with
   GitHub » avec le compte qui a accès à `KitchenStrat/theralys`.
2. Autorisez l'application **Vercel** sur GitHub quand c'est demandé
   (Install → sélectionnez le dépôt `KitchenStrat/theralys`).
3. **Neon** (base de données) : [neon.tech](https://neon.tech) → « Sign up with
   GitHub ».

## Étape 1 — La branche de production : `main` (1 min)

Le code de production vit sur la branche `main` (branche par défaut du dépôt) :
Vercel la prend automatiquement comme **Production Branch**, rien à régler.
Les évolutions se préparent sur des branches de travail (`claude/…`) fusionnées
dans `main` par pull request GitHub (« Compare & pull request » → « Merge ») —
c'est le push sur `main` qui déclenche les déploiements. Avant de fusionner une
branche qui contient une migration, lisez « Mettre à jour le schéma en
production » plus bas.

## Étape 2 — Créer la base de données (10 min)

1. Sur Neon : **New project** → nom `theralys`, région **AWS Europe (Frankfurt)**
   (au plus près des clients français), version Postgres 16+ → Create.
2. Sur le tableau de bord du projet, encart **Connection string** :
   sélectionnez **Pooled connection**, cochez « Show password », copiez l'URL
   (`postgresql://…@…-pooler…neon.tech/neondb?sslmode=require`).
   → C'est votre `DATABASE_URL` de production. Gardez-la de côté.
3. **Appliquer le schéma + créer les comptes admin et client** — depuis un terminal sur
   votre machine (ou demandez à Claude de le faire en lui donnant l'URL) :

   ```bash
   git clone https://github.com/KitchenStrat/theralys.git && cd theralys
   git checkout main
   pnpm install
   DATABASE_URL="<URL Neon directe>" pnpm db:migrate   # URL sans « -pooler », voir plus bas
   DATABASE_URL="<URL Neon>" \
     SEED_ADMIN_EMAIL="contact@kitchenstrategy.fr" \
     SEED_ADMIN_PASSWORD="<votre vrai mot de passe admin>" \
     SEED_CLIENT_PASSWORD="<mot de passe du compte client de test>" \
     AI_MOCK=1 pnpm db:seed
   ```

   Le seed crée votre compte admin + un jeu de données d'exemple (démo
   « Claire Dupont », compte client de test, leads) bien pratique pour valider
   le déploiement — tout est supprimable ensuite. Le compte client de test est
   `claire@demo-theralys.fr` (valeur par défaut de `SEED_CLIENT_EMAIL`) avec le
   `SEED_CLIENT_PASSWORD` choisi ici. Hors base locale, les deux mots de passe
   se passent sur la ligne de commande (un fichier `.env` est ignoré) à la
   création des comptes : le seed refuse les valeurs par défaut de
   `.env.example` (ce dépôt est public, elles sont connues de tous) et, si un
   compte déjà seedé les utilise encore, le remplace par la valeur fournie.
   Un refus n'écrit rien ; relancer le seed sur une base déjà seedée
   correctement ne demande aucune variable. Passez-les aussi si vous atteignez
   Neon par un tunnel sur `localhost` (non détecté comme base distante).

4. Notez aussi dès maintenant deux secrets à générer
   (`openssl rand -base64 32`, ou 2 longues phrases aléatoires) :
   - `AUTH_SECRET` — **le même** pour les 3 projets (sessions + preview tokens
     + impersonation sont signés avec) ;
   - `CRON_SECRET` — pour le cron des jobs (projet admin uniquement).

## Étape 3 — Créer les 3 projets Vercel (15 min)

Pour chacun des trois, sur [vercel.com/new](https://vercel.com/new) :
**Import** `KitchenStrat/theralys` → puis, avant de cliquer Deploy :

| Réglage | Projet 1 | Projet 2 | Projet 3 |
|---|---|---|---|
| **Project Name** | `harmony-sites` | `harmony-admin` | `harmony-studio` |
| **Root Directory** (Edit) | `apps/sites` | `apps/admin` | `apps/studio` |
| Framework | Next.js (auto) | Next.js (auto) | Next.js (auto) |

Vercel détecte seul pnpm + Turborepo ; ne touchez pas aux commandes de build.

**Environment Variables** (dans l'écran d'import, section du même nom —
cochez Production **et** Preview) :

Communes aux **3 projets** :

| Nom | Valeur |
|---|---|
| `DATABASE_URL` | l'URL Neon *pooled* |
| `AUTH_SECRET` | votre secret unique (identique partout !) |
| `SITES_BASE_URL` | `https://harmony-sites.vercel.app` pour commencer (voir étape 5) |

En plus, sur **harmony-admin** :

| Nom | Valeur |
|---|---|
| `ANTHROPIC_API_KEY` | votre clé `sk-ant-…` |
| `ANTHROPIC_MODEL` | `claude-opus-5` (défaut ; repli automatique sur `claude-opus-4-8` si une requête est déclinée par les garde-fous) |
| `ANTHROPIC_EFFORT` | Profondeur de réflexion du modèle : `low` / `medium` / `high` (défaut) / `xhigh` / `max` — plus c'est haut, plus c'est lent et coûteux |
| `CRON_SECRET` | votre second secret |
| `STUDIO_BASE_URL` | `https://harmony-studio.vercel.app` pour commencer |

En plus, sur **harmony-studio** :

| Nom | Valeur |
|---|---|
| `ANTHROPIC_API_KEY` | la même clé (régénérations depuis l'espace client) |
| `ANTHROPIC_MODEL` | la même valeur que sur admin |

⚠️ Ne définissez `AI_MOCK` nulle part (il forcerait le mode mock).
Les intégrations non configurées (fal.ai, Google, Stripe, OVH) restent en mock
automatiquement — vous les activerez plus tard en ajoutant leurs clés.

Cliquez **Deploy** pour chaque projet (2-3 min de build chacun).

## Étape 4 — Premières vérifications (5 min)

1. `https://harmony-admin.vercel.app` → connexion avec votre email/mot de
   passe admin → **Vue d'ensemble** : badge vert
   « Rédaction : API Anthropic (claude-opus-5) ».
2. Onglet **Démos** → la démo d'exemple est là → œil 👁 : elle s'ouvre sur
   `harmony-sites.vercel.app`.
3. Créez une démo de test réelle (~4 min, ~0,35 €) pour valider la génération
   en production.
4. `https://harmony-studio.vercel.app` → connexion avec le compte client seedé
   (`claire@demo-theralys.fr` et le `SEED_CLIENT_PASSWORD` choisi à l'étape 2.3).

## Étape 5 — Brancher vos domaines (10 min)

Dans chaque projet : **Settings → Domains → Add** :

| Projet | Domaine |
|---|---|
| harmony-sites | `demo.harmony-web.fr` |
| harmony-admin | `admin.harmony-web.fr` |
| harmony-studio | `app.harmony-web.fr` |

Vercel affiche l'enregistrement DNS à créer : chez votre registrar (là où est
géré `harmony-web.fr`), ajoutez pour chacun un **CNAME** vers
`cname.vercel-dns.com.` (TTL par défaut). Propagation : de quelques minutes à
1 h ; le SSL est automatique.

Puis **mettez à jour les variables** (Settings → Environment Variables de
chaque projet concerné) et **redéployez** (Deployments → ⋯ → Redeploy) :

- `SITES_BASE_URL` = `https://demo.harmony-web.fr` (sur les 3 projets) ;
- `STUDIO_BASE_URL` = `https://app.harmony-web.fr` (sur admin) ;
- sur **harmony-sites**, ajoutez aussi `DEMO_HOST` = `harmony-sites.vercel.app`
  pour que les anciens liens de démo `.vercel.app` déjà envoyés restent valides.

## Étape 6 — Le cron des jobs (déjà câblé, à vérifier)

`apps/admin/vercel.json` déclare le cron sur `/api/jobs/tick`
(calendrier éditorial, rédaction J-7, publication auto, syncs Google).
Vercel envoie automatiquement `Authorization: Bearer <CRON_SECRET>`.

Cadence : **quotidienne à 6h UTC** (compatible plan Hobby — les articles étant
rédigés 7 jours à l'avance, c'est suffisant). Une fois en Pro, vous pouvez
passer à l'horaire en changeant `"schedule"` en `"0 * * * *"` dans ce fichier.

Vérification : projet admin → onglet **Cron Jobs** → « Run » → le log doit
répondre `{"ok":true,…}`.

## Étape 7 — Plus tard, quand vous activerez chaque intégration

| Intégration | Variables à ajouter | Où |
|---|---|---|
| Images fal.ai | `FAL_API_KEY` ([fal.ai/dashboard](https://fal.ai/dashboard)) | admin + studio |
| Photos téléversées (éditeur) | `BLOB_READ_WRITE_TOKEN` — projet **harmony-studio** → onglet Storage → Create Database → **Blob** (la variable est créée automatiquement) | studio |
| E-mails d'invitation client | `RESEND_API_KEY` ([resend.com](https://resend.com), gratuit jusqu'à 100 e-mails/jour) + `MAIL_FROM` (ex. `Harmony <bonjour@harmony-web.fr>`, domaine à vérifier chez Resend). Sans clé : le lien d'invitation s'affiche dans l'admin, à envoyer soi-même. | admin |
| Stripe | `STRIPE_SECRET_KEY`, puis webhook `https://admin.harmony-web.fr/api/stripe/webhook` (événements `customer.subscription.*`, `invoice.payment_failed`) → `STRIPE_WEBHOOK_SECRET` | admin |
| Google (GSC + fiche) | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `TOKEN_ENCRYPTION_KEY` | studio + admin |
| Avis Google réels (Places API New) | `GOOGLE_PLACES_API_KEY` (Google Cloud, « Places API (New) » activée) | studio + admin |
| Fiche Google (section du studio) | `DATAFORSEO_LOGIN` + `DATAFORSEO_PASSWORD` ([app.dataforseo.com](https://app.dataforseo.com) → API Access ; prépayé, ≈ 0,10 $ par relevé de visibilité, plafond 5 $ par site et par mois). Sans identifiants : données simulées. | studio + admin |
| Domaines clients OVH | `OVH_APP_KEY`, `OVH_APP_SECRET`, `OVH_CONSUMER_KEY` + `VERCEL_TOKEN`, `VERCEL_SITES_PROJECT_ID` (rattachement auto des domaines clients au projet sites) | studio |

Après chaque ajout de variable : **Redeploy**.

## Mettre à jour le schéma en production (à chaque migration)

Les trois projets se redéploient à chaque push sur `main`, mais **personne
n'applique les migrations à votre place** : ni Vercel, ni la CI. Une migration
(`packages/db/drizzle/00NN_*.sql`, générée par `pnpm db:generate` et commitée
avec son journal `meta/_journal.json`) s'applique à la main, depuis un poste.

**Ordre à respecter : 1. migration, 2. déploiement.** Pour une branche qui
ajoute une migration : appliquez-la sur Neon depuis cette branche (elle contient
le SQL), vérifiez, puis fusionnez dans `main`. Les migrations sont additives et
rejouables : le code déjà en production continue de fonctionner avec le schéma
étendu. Si le déploiement devait malgré tout précéder la migration, la page
**Réseaux sociaux** du studio affiche « Cette section est en cours d'activation,
revenez dans quelques minutes. » (pas d'erreur) tant que `0001_social_posts`
n'est pas appliquée ; sans `0002_social_settings`, la section fonctionne avec
les réglages par défaut et l'enregistrement du « Paramétrage » répond « L'option
Paramétrage est en cours d'activation ». Appliquez-les alors sans attendre.

1. **Point de restauration** — sur Neon, projet `theralys` → **Branches** →
   **Create branch** depuis la branche de production : copie instantanée du
   schéma et des données, à restaurer en cas de problème (le point-in-time
   recovery, s'il est activé, joue le même rôle). Les migrations ne suppriment
   rien, mais le réflexe reste bon.
2. **Appliquer** — depuis un poste à jour de `main` (ou de la branche qui porte
   la migration), avec l'URL de connexion **directe** de Neon : encart
   Connection string, case **Pooled connection décochée** (l'hôte ne contient
   pas `-pooler`) — le DDL s'exécute dans une transaction, qu'on ne fait pas
   transiter par le pooler :

   ```bash
   git checkout main && git pull && pnpm install
   DATABASE_URL="<URL Neon directe>" pnpm db:migrate
   # → « ✔ Migrations appliquées »
   ```

3. **Vérifier** — dans l'éditeur SQL de Neon (ou `psql "<URL Neon directe>"`) :

   ```sql
   select id, created_at from drizzle.__drizzle_migrations order by id;
   -- 3 lignes : 1784128836899 (0000_soft_scrambler), 1792775462436 (0001_social_posts),
   --            1792937442640 (0002_social_settings)
   select count(*) from social_posts;
   -- 0 juste après la migration : la table existe, les contenus arrivent avec les praticiens
   select count(*) from social_settings;
   -- 0 aussi : une ligne apparaît quand un praticien enregistre son « Paramétrage »
   ```

   Une ligne par entrée du journal (`created_at` = champ `when` de
   `packages/db/drizzle/meta/_journal.json`). Fusionnez/déployez ensuite, puis
   ouvrez `https://app.harmony-web.fr/reseaux-sociaux` : le calendrier s'affiche.

**Base poussée sans journal** (`drizzle-kit push` autrefois : table
`drizzle.__drizzle_migrations` absente ou vide, cas d'une base où des colonnes
ont été poussées à la main) : rien de particulier à faire. La migration `0000`
est rejouable — chaque instruction est gardée par `IF NOT EXISTS` ou
`DO $$ … EXCEPTION WHEN duplicate_object` — donc `pnpm db:migrate` passe sur les
objets existants sans les toucher, applique ce qui manque (`0001`, `0002`) et
inscrit les trois lignes du journal. Relancer `pnpm db:migrate` est toujours sans effet
(no-op). Ne lancez jamais `drizzle-kit push` contre la base de production : elle
a un journal, les évolutions passent par `pnpm db:generate` → relecture du SQL
(gardes conservées) → commit → `pnpm db:migrate`.

## Dépannage rapide

| Symptôme | Cause probable |
|---|---|
| Build échoue « Cannot find module @theralys/… » | Root Directory mal réglé (doit être `apps/<nom>`) |
| Badge « mode mock » malgré la clé | Variable absente de l'environnement **Production**, ou pas de redéploiement après ajout |
| Démo bloquée « En préparation » puis « Erreur … timeout » | Plan Hobby (60 s max) — passer Pro, ou tester en mock |
| Connexion admin/studio en boucle | `AUTH_SECRET` différent entre projets |
| `pnpm db:seed` s'arrête sur « SEED_…_PASSWORD manquante / égale à un mot de passe par défaut » | Base distante : passer `SEED_ADMIN_PASSWORD` et `SEED_CLIENT_PASSWORD` sur la ligne de commande comme à l'étape 2.3 (rien n'a été écrit, relancez la commande complète) |
| Page Réseaux sociaux « Cette section est en cours d'activation » | Migration `0001_social_posts` non appliquée sur Neon → section « Mettre à jour le schéma en production » |
| Paramétrage des réseaux sociaux « L'option Paramétrage est en cours d'activation » | Migration `0002_social_settings` non appliquée sur Neon → même section |
| Sites clients 404 sur leur domaine | Domaine non ajouté au projet **harmony-sites** |
