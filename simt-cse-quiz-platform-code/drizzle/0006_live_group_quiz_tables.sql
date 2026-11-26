CREATE TABLE live_rooms (
  id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  code text NOT NULL,
  host_user_id integer NOT NULL,
  category text NOT NULL,
  status text DEFAULT 'lobby' NOT NULL,
  question_ids text DEFAULT '[]' NOT NULL,
  current_index integer DEFAULT 0 NOT NULL,
  question_started_at integer,
  deadline_at integer,
  created_at integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE live_players (
  id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  room_id integer NOT NULL,
  user_id integer NOT NULL,
  name text NOT NULL,
  student_id text DEFAULT '' NOT NULL,
  correct integer DEFAULT 0 NOT NULL,
  wrong integer DEFAULT 0 NOT NULL,
  total_time_ms integer DEFAULT 0 NOT NULL,
  finished_at integer,
  joined_at integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE live_answers (
  id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  room_id integer NOT NULL,
  user_id integer NOT NULL,
  question_index integer NOT NULL,
  question_id integer NOT NULL,
  selected_index integer NOT NULL,
  correct integer DEFAULT 0 NOT NULL,
  time_ms integer DEFAULT 0 NOT NULL,
  created_at integer NOT NULL
);
