# Le carnet de l'EVG de Valentin

Objectifs et décisions du projet : voir [PROJECT.md](PROJECT.md).

Stack : Next.js 16 (App Router, TypeScript), Tailwind v4, Drizzle ORM, Postgres (Neon en ligne, PGlite en local).

## Les adresses

| Adresse | Pour qui |
| --- | --- |
| `/` | Accueil de l'app : questionnaire à faire ou à reprendre, tendances anonymes du questionnaire, aperçu de l'orga |
| `/qui-es-tu` | Identification unique (prénom + « tu fais partie du week-end ? ») ; `?suite=/chemin` pour y revenir ensuite |
| `/bienvenue` | Juste après l'inscription : « Répondre au questionnaire » ou « Passer » |
| `/questionnaire` | Questionnaire « profil de Val » (lien déjà envoyé : sans prénom, identification d'abord puis retour ici ; le brouillon du navigateur est retrouvé) |
| `/resultats` | Tendances anonymes du questionnaire (à partir de 3 réponses envoyées) |
| `/orga`, `/orga/sur-place` | Votes, propositions, commentaires ; carnet sur place |
| `/idees` | Idées de villes et d'événements : 👍 multiples, commentaires, propositions. `/idees/<id>` : détail d'une ville |
| `/admin` | Espace organisateurs (mot de passe `ADMIN_PASSWORD`) |
| `/admin/idees` | Gestion des idées : retenir, masquer, modifier, supprimer |
| `/admin/idees/recherche` | Synthèse Markdown du questionnaire (`/admin/idees/recherche/synthese`) et prompt de recherche approfondie à copier |
| `/admin/idees/import` | Import du JSON de la recherche (format : [docs/import-idees.md](docs/import-idees.md)) |

L'app n'a pas de code d'accès : ne jamais envoyer le lien à quelqu'un qui pourrait le montrer à Valentin.
Anciennes adresses conservées : `/orga/qui-es-tu` → `/qui-es-tu`, `/orga/bienvenue` → `/bienvenue`, `/rejoindre/...` → `/`.

Navigation commune des pages membres : `src/components/app-nav.tsx` (`<AppNav />`, composant serveur à placer en haut de page ;
barre d'onglets en bas sur mobile, en-tête sur desktop, lien « Admin » pour un organisateur connecté).

## Développement local

Prérequis : Node.js 22 ou plus récent.

```powershell
npm install
```

```powershell
npm run dev
```

Puis ouvrir http://localhost:3000. Sans `.env.local`, tout fonctionne avec des valeurs de dev :

- base PGlite (Postgres embarqué) dans `.data/pglite`, migrations appliquées automatiquement au démarrage ;
- mot de passe admin : `organisateur-local` ;
- accueil (identification au premier passage) : http://localhost:3000/

Pour personnaliser, copier `.env.example` en `.env.local`.

Autres commandes : `npm test` (vitest, base PGlite en mémoire), `npm run typecheck`, `npm run lint`.

## Modifier le schéma de la base

1. Modifier `src/db/schema/*.ts`.
2. Générer la migration : `npm run db:generate`, puis commiter le dossier `drizzle/`.
3. En local et dans les tests, les migrations s'appliquent toutes seules au démarrage. Au déploiement, Vercel les applique (`vercel-build` lance `drizzle-kit migrate` avant `next build`).

Pour repartir d'une base locale vide : arrêter le serveur et supprimer le dossier `.data/`.

## Déploiement : Vercel + Neon

1. **GitHub** : créer un dépôt **privé** vide (sans README), puis depuis ce dossier :
   `git remote add origin https://github.com/<toi>/carnet-evg.git` et `git push -u origin main`.
2. **Vercel** : *Add New → Project*, importer le dépôt. Preset Next.js détecté, ne rien changer aux commandes
   (Vercel lance `vercel-build` : migrations puis build). Ne pas déployer tout de suite si on te le propose sans variables :
   un premier échec n'est pas grave, on relance après l'étape 4.
3. **Base Neon** : dans le projet Vercel, *Storage → Create Database → Neon* (plan gratuit), région **Frankfurt (eu-central-1)**,
   connectée aux environnements Production et Preview. Vercel ajoute `DATABASE_URL` tout seul.
   Les fonctions tournent aussi à Francfort (`vercel.json` → `fra1`), à côté de la base.
4. **Variables d'environnement** (*Settings → Environment Variables*, cocher Production et Preview) :
   - `SESSION_SECRET` : secret aléatoire (commande ci-dessous) ;
   - `ADMIN_PASSWORD` : mot de passe des organisateurs, à transmettre aux co-orgas
     (pour le changer : `scripts/changer-mdp-admin.ps1`, puis redéployer).
5. **Déployer** : *Deployments → Redeploy* (ou un `git push`). Le premier build crée les tables dans Neon.
6. **Vérifier** : ouvrir `https://<projet>.vercel.app/admin`, se connecter, puis ouvrir `/` dans une fenêtre privée pour tester l'inscription et le questionnaire.
7. **Partager** : l'adresse du site (`/`) aux participants et aux proches de Val (le lien `/questionnaire` déjà envoyé reste valable), jamais à Valentin.

Ensuite, chaque `git push` sur `main` redéploie automatiquement (avec migrations).

Pour générer `SESSION_SECRET` :

```powershell
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
```

## Ancienne version

`legacy/` contient la version vanilla JS (Netlify Functions + Blobs), gardée comme référence pendant le rework. À supprimer une fois la nouvelle version validée, ainsi que le site Netlify associé.
