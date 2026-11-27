# Carnet de l'EVG de Valentin — objectifs et décisions

Document de référence du projet. À lire avant toute modification importante.

## Contexte

Enterrement de vie de garçon (EVG) de **Valentin** (« Val »), prévu en **mai 2027**.
L'organisateur principal est le propriétaire du repo, épaulé par 1 ou 2 co-organisateurs.

**Règle d'or : Valentin ne doit avoir accès à rien avant le départ.** Ni au questionnaire, ni à l'orga.
Un accès filtré « infos pratiques » pourra éventuellement lui être donné une fois sur place (sans les surprises).

## Objectif 1 — Questionnaire « profil de Val »

Questionnaire envoyé aux **proches de Valentin** pour dresser son profil et orienter l'EVG :
ambiances, activités, limites, destination, surprises, souvenirs, envies.

- Public **plus large que les participants** : famille, compagne, amis qui ne viennent pas.
  Accès par un lien ouvert, chaque répondant indique son prénom/pseudo (pas de liste nominative).
- Ton bienveillant : on cherche ce qui lui ferait plaisir et ce qu'il faut éviter, pas à le piéger.
- Espace organisateur : analyse des réponses (distributions, convergences), réponses individuelles,
  exclusion/suppression, exports, édition versionnée du questionnaire.
- **Pondération par niveau de connaissance (visible uniquement par les admins)** : chaque répondant reçoit
  un niveau attribué par un organisateur — *le connaît à peine*, *le connaît bien*, *le connaît très bien* —
  et son avis pèse en conséquence dans les analyses (poids 1 / 2 / 3 ; non classé = poids 2, signalé « à classer »).
  Les répondants ne voient jamais ce niveau, ni même son existence.
- État : version vanilla JS fonctionnelle (21 questions dans `public/questions.js`), **pas encore envoyée**,
  aucune donnée à migrer.

## Objectif 2 — Organisation de l'EVG

Plateforme collaborative pour le groupe de participants. Deux grandes phases.

### Phase A — Préparation (avant le départ)

Décisions successives, chacune avec propositions, **votes** et **commentaires** :

1. **Destination** — propositions de villes/lieux, votes, discussion.
2. **Logement** — une fois la destination validée : hôtels / Airbnb, comparaison de prix (total et par personne), liens.
3. **Activités** — propositions, votes, créneaux.
4. **Transport** — liens vers les billets (avion, train), horaires, qui a réservé quoi.

Modèle générique visé : un *sujet de décision* (ouvert → clos → option retenue) contenant des *options*
(titre, description, lien, prix, photos), des votes et des commentaires. Les sujets se débloquent par étapes
(le logement dépend de la destination retenue). Les organisateurs créent/clôturent les sujets et valident ;
tout le monde peut proposer, voter et commenter.

Ce que voient les membres : un sujet en *brouillon* leur est invisible ; un sujet dont la dépendance n'est pas
décidée apparaît « à venir » (verrouillé) ; un sujet *clos* est visible mais les votes sont figés.
Les dates limites sont comparées à l'heure de Paris (`ORGA_TIMEZONE` dans `src/lib/orga/rules.ts`).

### Page Idées — en amont de l'orga (décidé le 2026-11-27)

Avant d'ouvrir les sujets Destination / Activités, une page **Idées** (`/idees`, mêmes accès que `/orga`) rassemble
des villes et, pour chacune, des événements/activités de mai 2027 qui collent au profil de Val.

- **Alimentation par import JSON (admin)** : les orgas téléchargent une synthèse Markdown du questionnaire
  (`/admin/idees/recherche` : pourcentages pondérés et bruts, commentaires anonymisés, limites, critères), la donnent
  avec le prompt fourni à un outil de recherche approfondie (IA), puis importent le JSON renvoyé (`/admin/idees/import`,
  format dans `docs/import-idees.md`). L'import est idempotent : ville = nom + pays normalisés, événement = ville + nom ;
  un réimport met à jour sans dupliquer ni toucher aux votes/commentaires.
- **Votes multiples** : un 👍 par personne et par ville / par événement, on peut soutenir autant d'idées qu'on veut.
  Les prénoms des votants sont visibles.
- **Tout le monde peut proposer** une ville ou un événement (marqué « proposé par X ») et commenter.
- Les orgas peuvent masquer, modifier, supprimer, et **retenir** une ville (affichée en tête avec un badge).
  Le branchement d'une ville retenue vers les sujets Destination / Activités viendra plus tard.
- La synthèse Markdown contient la pondération : réservée aux admins, ne pas la partager avec le groupe.

### Phase B — Sur place

Vue « carnet de voyage » simple, pensée mobile, qui ne montre **que ce qui a été retenu** :
adresse du logement, planning, activités avec adresses, horaires d'ouverture/fermeture, billets, contacts utiles.

### Plus tard (non prioritaire)

- Budget et dépenses partagées (budget par personne, qui a payé quoi / qui doit quoi).
- Photos et souvenirs du week-end.

La date (mai 2027) est déjà connue : pas de sondage de dates prévu.

## Accès et rôles

- **Participants** : lien `/orga` partagé dans le groupe, sans code d'accès (décidé le 2026-11-26 : Valentin n'aura pas le lien). Au premier passage, chacun **entre son prénom**
  (il s'ajoute à la liste ; un prénom déjà pris est refusé avec renvoi vers la liste). Sinon, bouton
  « J'ai déjà renseigné mon prénom » → choix dans la liste. Le prénom est mémorisé (cookie signé + localStorage) :
  au retour, la personne est reconnue automatiquement. Les admins peuvent aussi ajouter/renommer/retirer des prénoms.
  Pas de mot de passe individuel.
- **Organisateurs** (moi + co-orgas) : accès admin protégé (gestion des sujets, clôture des votes,
  validation, gestion du questionnaire).
- **Répondants au questionnaire** : lien `/questionnaire`, ouvert, sans liste.
- **Valentin** : aucun accès (voir règle d'or).
- Le site ne doit pas être indexé (noindex).

## Choix techniques (décidés le 2026-11-25)

Rework complet prévu de la version vanilla JS actuelle vers :

- **Next.js (App Router) + TypeScript + React**
- **Déploiement : Vercel** (remplace Netlify)
- **Base de données : Postgres sur Neon** (offre gratuite : se met en veille mais se réveille seule à la première
  requête — pas de relance manuelle comme Supabase). ORM **Drizzle**.
- Mobile-first : la plupart des utilisateurs viendront depuis le lien WhatsApp sur téléphone.

L'ancienne version (Netlify Functions + Netlify Blobs, variante Cloudflare D1 « Sites », SQLite local) sert de
référence fonctionnelle pour le questionnaire et le dashboard, puis sera supprimée.
