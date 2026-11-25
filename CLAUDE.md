# CLAUDE.md

Lire **[PROJECT.md](PROJECT.md)** en premier : objectifs du projet (questionnaire « profil de Val » +
organisation de l'EVG), rôles, contraintes et choix techniques décidés. [README.md](README.md) : dev local et déploiement.

@AGENTS.md

- Langue du projet, de l'interface et des échanges : **français**.
- Valentin ne doit jamais pouvoir accéder au site avant le départ : toute fonctionnalité doit le respecter.
- Le niveau de connaissance des répondants (pondération) n'est visible que des admins.
- Stack : Next.js 16 + TypeScript, Tailwind v4, Drizzle, Postgres Neon (prod) / PGlite (local, tests), Vercel.
  `cacheComponents` est désactivé.
- Organisation du code :
  - `src/db/` : client (`getDb`, `createTestDb`) et schéma par module (`schema/questionnaire.ts`, `schema/orga.ts`).
  - `src/lib/session.ts` : sessions admin (mot de passe partagé) et membre (lien secret + prénom).
  - `src/lib/<module>/` : logique métier testable (fonctions prenant `db`), tests vitest à côté.
  - `src/components/ui.tsx` : composants d'interface partagés.
  - `src/app/admin/(protege)/` : pages admin protégées par le layout ; chaque server action revérifie quand même la session.
- Après une modification du schéma : `npm run db:generate` et commiter `drizzle/`.
- Vérifications : `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.
- `legacy/` : ancienne version vanilla JS, référence seulement.
- Mettre à jour PROJECT.md quand une décision structurante change.
