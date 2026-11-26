DROP TABLE IF EXISTS entries;
--> statement-breakpoint
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  student_id TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,
  topic TEXT NOT NULL DEFAULT '',
  stage TEXT NOT NULL DEFAULT 'current',
  question TEXT NOT NULL,
  options TEXT NOT NULL,
  correct_index INTEGER NOT NULL,
  explanation TEXT NOT NULL DEFAULT ''
);
--> statement-breakpoint
CREATE TABLE attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  category TEXT NOT NULL,
  score INTEGER NOT NULL,
  total INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
