ALTER TABLE users ADD COLUMN is_admin integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE users ADD COLUMN last_login_at integer;
--> statement-breakpoint
CREATE TABLE attempt_answers (
  id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  attempt_id integer NOT NULL,
  user_id integer NOT NULL,
  question text NOT NULL,
  topic text DEFAULT '' NOT NULL,
  selected_index integer NOT NULL,
  correct_index integer NOT NULL,
  selected_text text DEFAULT '' NOT NULL,
  correct_text text DEFAULT '' NOT NULL,
  explanation text DEFAULT '' NOT NULL,
  correct integer DEFAULT 0 NOT NULL,
  created_at integer NOT NULL
);
