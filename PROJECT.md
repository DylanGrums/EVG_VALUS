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

- **Participants** : lien partagé dans le groupe, sans code d'accès (décidé le 2026-11-26 : Valentin n'aura pas le lien). Au premier passage, chacun **entre son prénom**
  (il s'ajoute à la liste ; un prénom déjà pris est refusé avec renvoi vers la liste). Sinon, bouton
  « J'ai déjà renseigné mon prénom » → choix dans la liste. Le prénom est mémorisé (cookie signé + localStorage) :
  au retour, la personne est reconnue automatiquement. Les admins peuvent aussi ajouter/renommer/retirer des prénoms.
  Pas de mot de passe individuel.
- **Organisateurs** (moi + co-orgas) : accès admin protégé (gestion des sujets, clôture des votes,
  validation, gestion du questionnaire).
- **Répondants au questionnaire** : depuis le 2026-11-27, ils s'identifient comme tout le monde (voir ci-dessous).
- **Valentin** : aucun accès (voir règle d'or).
- Le site ne doit pas être indexé (noindex).

## Un seul prénom pour toute l'app (décidé le 2026-11-27)

Le questionnaire a déjà été envoyé et des réponses réelles sont en base : tout est additif (migration `0001_identite`).

- **Identification unique** (`/qui-es-tu`, cookie signé `evg_member` + localStorage) : le prénom sert au questionnaire, à l'orga,
  aux idées et aux résultats. À l'inscription : « Tu fais partie du week-end ? » → oui = participant, non = **proche**
  (famille, copine…). `participants.attending` ; seuls les participants qui viennent comptent dans le prix par personne et
  le décompte « x / y ont voté ». Les proches voient tout comme les participants. Les admins changent le statut (/admin/participants).
- **Parcours** : `/` = accueil (sans prénom → identification). Après l'inscription : « Répondre au questionnaire » / « Passer »
  (`/bienvenue`). Questionnaire envoyé → retour automatique à l'accueil. L'ancien lien `/questionnaire` passe par
  l'identification puis revient au questionnaire.
- **Questionnaire ↔ prénom** : `questionnaire_participations.participant_id` (nullable). Un membre identifié répond sous
  son prénom de la liste (imposé côté serveur, non ressaisi) et sa participation lui est rattachée. Le jeton de reprise du
  navigateur (cookie httpOnly) non rattaché est rattaché automatiquement au membre : un brouillon toujours, une réponse déjà
  envoyée seulement si le prénom correspond (garde-fou pour un téléphone partagé). Un jeton rattaché à quelqu'un d'autre est
  ignoré. Un membre qui a déjà envoyé ne peut pas renvoyer un second questionnaire. Un brouillon n'est jamais repris via le
  prénom seul (sinon choisir le prénom d'un autre exposerait ses réponses). Les admins lient/délient une réponse à la main
  (fiche réponse) et peuvent supprimer une réponse depuis la liste (doublons).
- **Tendances publiques** (`/resultats` et accueil, `src/lib/questionnaire/public-view.ts`) : agrégats anonymes et **non
  pondérés** (nombre de réponses, top choix par question, consensus, désaccords, « non » et limites). Jamais de prénom,
  de commentaire libre, de vue par répondant ni de niveau de connaissance. Rien sous 3 réponses envoyées ; brouillons,
  exclues et supprimées hors compte. Promesse au répondant : « Seul l'organisateur peut lire tes réponses ; le groupe ne
  voit que des tendances anonymes ». Pondération, filtres et détail par répondant restent dans l'admin.
- **Navigation** commune aux pages membres (`src/components/app-nav.tsx`) : Accueil, Résultats, Orga, Idées, Sur place,
  puce du prénom (changer), lien Admin pour un organisateur connecté ; l'admin a un lien « ← L'app ».

## Choix techniques (décidés le 2026-11-25)

Rework complet prévu de la version vanilla JS actuelle vers :

- **Next.js (App Router) + TypeScript + React**
- **Déploiement : Vercel** (remplace Netlify)
- **Base de données : Postgres sur Neon** (offre gratuite : se met en veille mais se réveille seule à la première
  requête — pas de relance manuelle comme Supabase). ORM **Drizzle**.
- Mobile-first : la plupart des utilisateurs viendront depuis le lien WhatsApp sur téléphone.

L'ancienne version (Netlify Functions + Netlify Blobs, variante Cloudflare D1 « Sites », SQLite local) sert de
référence fonctionnelle pour le questionnaire et le dashboard, puis sera supprimée.
