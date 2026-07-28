# Déployer Harmony sur Vercel — guide pas à pas

Cible : 3 projets Vercel (sites publics, admin, studio) + une base PostgreSQL
managée (Neon). Durée totale : ~45 minutes. Aucune ligne de commande n'est
nécessaire, sauf pour les migrations (étape 2.3).

> **Plan Vercel** : le plan **Pro (20 $/mois)** est nécessaire en production —
> la génération IA d'une démo dure ~4-5 min (fonctions jusqu'à 300 s, configuré
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

## Étape 1 — Décider de la branche de production (2 min)

Le code vit sur la branche `claude/phase-1-startup-bkubgy`. Deux options :

- **Option simple** : fusionner cette branche dans `main` (recommandé —
  demandez à Claude « fusionne sur main » ou faites-le depuis GitHub :
  la page du dépôt propose « Compare & pull request » → « Merge »).
- **Option sans fusion** : dans chaque projet Vercel (étape 3), Settings → Git
  → **Production Branch** → saisir `claude/phase-1-startup-bkubgy`.

## Étape 2 — Créer la base de données (10 min)

1. Sur Neon : **New project** → nom `theralys`, région **AWS Europe (Frankfurt)**
   (au plus près des clients français), version Postgres 16+ → Create.
2. Sur le tableau de bord du projet, encart **Connection string** :
   sélectionnez **Pooled connection**, cochez « Show password », copiez l'URL
   (`postgresql://…@…-pooler…neon.tech/neondb?sslmode=require`).
   → C'est votre `DATABASE_URL` de production. Gardez-la de côté.
3. **Appliquer le schéma + créer le compte admin** — depuis un terminal sur
   votre machine (ou demandez à Claude de le faire en lui donnant l'URL) :

   ```bash
   git clone https://github.com/KitchenStrat/theralys.git && cd theralys
   git checkout claude/phase-1-startup-bkubgy   # (ou main après fusion)
   pnpm install
   DATABASE_URL="<URL Neon>" pnpm db:migrate
   DATABASE_URL="<URL Neon>" \
     SEED_ADMIN_EMAIL="contact@kitchenstrategy.fr" \
     SEED_ADMIN_PASSWORD="<votre vrai mot de passe admin>" \
     AI_MOCK=1 pnpm db:seed
   ```

   Le seed crée votre compte admin + un jeu de données d'exemple (démo
   « Claire Dupont », compte client de test, leads) bien pratique pour valider
   le déploiement — tout est supprimable ensuite.

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
| `ANTHROPIC_MODEL` | `claude-opus-4-8` (recommandé pour la qualité rédactionnelle ; défaut : `claude-sonnet-5`) |
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
   « Rédaction : API Anthropic (claude-sonnet-5) ».
2. Onglet **Démos** → la démo d'exemple est là → œil 👁 : elle s'ouvre sur
   `harmony-sites.vercel.app`.
3. Créez une démo de test réelle (~4 min, ~0,35 €) pour valider la génération
   en production.
4. `https://harmony-studio.vercel.app` → connexion avec le compte client seedé.

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
| Domaines clients OVH | `OVH_APP_KEY`, `OVH_APP_SECRET`, `OVH_CONSUMER_KEY` + `VERCEL_TOKEN`, `VERCEL_SITES_PROJECT_ID` (rattachement auto des domaines clients au projet sites) | studio |

Après chaque ajout de variable : **Redeploy**.

## Dépannage rapide

| Symptôme | Cause probable |
|---|---|
| Build échoue « Cannot find module @theralys/… » | Root Directory mal réglé (doit être `apps/<nom>`) |
| Badge « mode mock » malgré la clé | Variable absente de l'environnement **Production**, ou pas de redéploiement après ajout |
| Démo bloquée « En préparation » puis « Erreur … timeout » | Plan Hobby (60 s max) — passer Pro, ou tester en mock |
| Connexion admin/studio en boucle | `AUTH_SECRET` différent entre projets |
| Sites clients 404 sur leur domaine | Domaine non ajouté au projet **harmony-sites** |
