# Le carnet de l’EVG de Valentin

Le questionnaire public est à la racine du site. Toutes les personnes utilisent la même adresse et indiquent leur prénom ou pseudonyme. Le brouillon s’enregistre et peut être repris sur le même navigateur. Après envoi, **Répondre pour une autre personne** démarre une participation indépendante depuis le même appareil.

## Espace organisateur

Le tableau de bord est à l’adresse **/admin**. Il s’actualise toutes les 15 secondes et donne accès à la recherche, aux filtres, aux réponses individuelles, à l’exclusion réversible, à la suppression et aux exports. Les exports contiennent les questionnaires terminés et indiquent lesquels ont été exclus. L’avis privé de l’organisateur reste facultatif dans les analyses et les exports.

Chaque pourcentage est calculé sur les personnes ayant répondu à la question, y compris par un commentaire seul. Les choix multiples peuvent donner un total supérieur à 100 %. Les réponses en brouillon et celles exclues n’entrent pas dans les distributions. Les signaux de convergence sont des pistes à confirmer.

Dans **Modifier le questionnaire**, l’organisateur peut ajouter, modifier, masquer ou déplacer des questions, puis publier. Les questions à choix acceptent plusieurs réponses. Une question sans choix devient un champ libre facultatif. Les brouillons et les réponses restent associés à la version qu’ils ont utilisée. Les analyses regroupent les questions identiques à travers les versions et affichent séparément celles dont le contenu a changé.

## Développement local

Avec Node.js 24 ou une version ultérieure, lancer **npm start** depuis ce dossier. Le tableau de bord est à l’adresse http://127.0.0.1:4187/admin. Le terminal affiche les identifiants. EVG_PORT permet de choisir un autre port. Par défaut, les données persistent dans **.evg-data/carnet.sqlite**. **npm test** exécute les tests avec une base SQLite temporaire.

## Déploiement sur Netlify

Les Netlify Functions protègent le dashboard et stockent les réponses dans le store Netlify Blobs du site. Aucune base PostgreSQL n’est provisionnée. Les données sont partagées entre les déploiements de ce projet Netlify. Les données locales SQLite et celles de l’ancien hébergement ne sont pas transférées automatiquement.

1. Exécuter **npm install** dans ce dossier.
2. Si le dossier n’est pas encore lié au projet, se connecter avec **npx netlify-cli@latest login**, puis exécuter **npx netlify-cli@latest link** ou **npx netlify-cli@latest sites:create**.
3. Dans les variables d’environnement du projet Netlify, créer **ADMIN_PASSWORD** comme secret disponible aux Functions en production. Choisir un mot de passe unique d’au moins 20 caractères. L’identifiant est **organisateur**. La variable **EVG_PUBLIC_ORIGIN** est facultative. Si elle est configurée, utiliser l’origine HTTPS de production exacte, sans barre finale.
4. Exécuter **npx netlify-cli@latest deploy --prod**. La configuration lance **npm run build:netlify**. Partager l’URL de production affichée et ajouter **/admin** pour ouvrir le tableau de bord.


## Hébergement Sites

- **npm run build** produit le Worker dans **dist/server/index.js**. Le manifeste demande la base D1 et les migrations sont dans **drizzle/**.
- Le site doit autoriser les visites publiques. **SITE_ORIGIN** contient son origine HTTPS exacte sans barre finale. **ADMIN_EMAIL** est un secret contenant l’adresse du compte ChatGPT autorisé.
- L’organisateur ouvre **/admin** et se connecte avec ce compte.

## Autre hébergement

Un serveur avec Node.js 24 peut héberger la version SQLite derrière un proxy HTTPS sur la même machine. Configurer **EVG_PUBLIC_ORIGIN** avec l’origine HTTPS sans barre finale, **EVG_LOCAL_PASSWORD** avec un mot de passe d’au moins 20 caractères et **EVG_DB_PATH** avec un fichier sur un volume persistant dont le dossier parent existe. Lancer **npm start** comme service et diriger le proxy vers **127.0.0.1:4187**. Le nom d’utilisateur est **organisateur**.
