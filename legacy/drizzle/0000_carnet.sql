CREATE TABLE IF NOT EXISTS invitations (
  slot INTEGER PRIMARY KEY CHECK (slot BETWEEN 1 AND 4),
  token TEXT NOT NULL UNIQUE,
  draft TEXT,
  revision INTEGER NOT NULL DEFAULT 0,
  submitted_at TEXT
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS organizer (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
