CREATE TABLE IF NOT EXISTS questionnaire_versions (
  version INTEGER PRIMARY KEY,
  definition TEXT NOT NULL,
  published_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS participations (
  id TEXT PRIMARY KEY,
  payload TEXT,
  revision INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  submitted_at TEXT,
  excluded INTEGER NOT NULL DEFAULT 0,
  deleted INTEGER NOT NULL DEFAULT 0
);
