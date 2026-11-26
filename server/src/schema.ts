import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  email: text("email").notNull(),
  studentId: text("student_id").notNull().default(""),
  passwordHash: text("password_hash").notNull(),
  isAdmin: integer("is_admin").notNull().default(0),
  photoBlobKey: text("photo_blob_key"),
  lastLoginAt: integer("last_login_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const questions = sqliteTable("questions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  category: text("category").notNull(),
  topic: text("topic").notNull().default(""),
  stage: text("stage").notNull().default("current"), // past | current | upcoming
  difficulty: text("difficulty").notNull().default("Medium"), // Easy | Medium | Hard
  question: text("question").notNull(),
  options: text("options").notNull(), // JSON array of 4 strings
  correctIndex: integer("correct_index").notNull(),
  explanation: text("explanation").notNull().default(""),
});

export const attempts = sqliteTable("attempts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  category: text("category").notNull(),
  score: integer("score").notNull(),
  total: integer("total").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Live Group Quiz: a host creates a room with a code, everyone joins and
// answers the SAME questions at the SAME time; the leaderboard updates live.
export const liveRooms = sqliteTable("live_rooms", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: text("code").notNull(),
  hostUserId: integer("host_user_id").notNull(),
  category: text("category").notNull(),
  status: text("status").notNull().default("lobby"), // lobby | running | finished
  questionIds: text("question_ids").notNull().default("[]"), // JSON array of question ids
  currentIndex: integer("current_index").notNull().default(0),
  questionStartedAt: integer("question_started_at"), // epoch ms
  deadlineAt: integer("deadline_at"), // epoch ms
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const livePlayers = sqliteTable("live_players", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  roomId: integer("room_id").notNull(),
  userId: integer("user_id").notNull(),
  name: text("name").notNull(),
  studentId: text("student_id").notNull().default(""),
  correct: integer("correct").notNull().default(0),
  wrong: integer("wrong").notNull().default(0),
  totalTimeMs: integer("total_time_ms").notNull().default(0),
  finishedAt: integer("finished_at"), // epoch ms
  joinedAt: integer("joined_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const liveAnswers = sqliteTable("live_answers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  roomId: integer("room_id").notNull(),
  userId: integer("user_id").notNull(),
  questionIndex: integer("question_index").notNull(),
  questionId: integer("question_id").notNull(),
  selectedIndex: integer("selected_index").notNull(), // -1 = no answer in time
  correct: integer("correct").notNull().default(0),
  timeMs: integer("time_ms").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Key-value site settings the admin can edit from the dashboard without
// code: "categories" (JSON array) and "contact" (JSON object). Absent rows
// fall back to the built-in defaults in code.
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

// Per-question answers saved with each attempt, so the admin dashboard can
// show exactly which questions a student got wrong (and every student can
// trust that only the admin sees this detail).
export const attemptAnswers = sqliteTable("attempt_answers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  attemptId: integer("attempt_id").notNull(),
  userId: integer("user_id").notNull(),
  question: text("question").notNull(),
  topic: text("topic").notNull().default(""),
  selectedIndex: integer("selected_index").notNull(), // -1 = timed out
  correctIndex: integer("correct_index").notNull(),
  selectedText: text("selected_text").notNull().default(""),
  correctText: text("correct_text").notNull().default(""),
  explanation: text("explanation").notNull().default(""),
  correct: integer("correct").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});
