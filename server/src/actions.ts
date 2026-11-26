import { defineAction, z, type ActionsModule, type Ctx } from "@hatch/space-sdk";
import { asc, desc, eq } from "drizzle-orm";
import * as schema from "./schema";
import { CATEGORIES, QUESTION_BANK } from "./questions-data";

// Arrow-function helpers (course stack style).
// Demo-grade password obfuscation (FNV-1a + djb2 mix) — a production
// deployment would swap this for bcrypt on the Node server.
const hashPassword = (password: string): string => {
  const input = `simt-quiz::${password}::v1`;
  let h1 = 0x811c9dc5;
  let h2 = 5381;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = (Math.imul(h2, 33) ^ c) >>> 0;
  }
  return `${h1.toString(16).padStart(8, "0")}${h2.toString(16).padStart(8, "0")}`;
};

// The platform admin is Argha Paul, and ONLY his own Gmail account gets
// the admin role: arghapaulnillarghapaul@gmail.com (confirmed by him).
// He logs in with that Gmail + his own password — no shared admin
// password exists anywhere. Every other account is a normal student.
const ADMIN_EMAIL = "arghapaulnillarghapaul@gmail.com";
const isAdminEmail = (email: string): boolean =>
  email.trim().toLowerCase() === ADMIN_EMAIL;

const toPublicUser = (row: typeof schema.users.$inferSelect) => ({
  id: row.id,
  name: row.name,
  email: row.email,
  studentId: row.studentId,
  isAdmin: row.isAdmin === 1,
});

// Guard for admin-only actions: the caller's own account must carry the
// admin role in the database. Students can never pass this check.
const requireAdmin = async (ctx: Ctx, userId: number) => {
  const db = ctx.db<typeof schema>();
  const rows = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  const row = rows[0];
  if (!row || row.isAdmin !== 1) throw new Error("শুধুমাত্র অ্যাডমিন এই তথ্য দেখতে পারে।");
  return row;
};

/* ---------- Editable site settings (admin-managed, with defaults) ---------- */
type CategoryMeta = { name: string; tagline: string; emoji: string; stageLabel: string };
type ContactInfo = { address: string; phone1: string; phone2: string; email: string; website: string };

const DEFAULT_CONTACT: ContactInfo = {
  address: "M/3, Section-14, Mirpur, Dhaka-1216",
  phone1: "01961 614 776",
  phone2: "01936 005 818",
  email: "simt.dhaka@gmail.com",
  website: "simt.ac.bd",
};

const getSettingJson = async (ctx: Ctx, key: string): Promise<unknown> => {
  const db = ctx.db<typeof schema>();
  const rows = await db.select().from(schema.settings).where(eq(schema.settings.key, key)).limit(1);
  const row = rows[0];
  if (!row) return null;
  try { return JSON.parse(row.value); } catch { return null; }
};

const loadCategories = async (ctx: Ctx): Promise<CategoryMeta[]> => {
  const v = await getSettingJson(ctx, "categories");
  return Array.isArray(v) && v.length > 0 ? (v as CategoryMeta[]) : CATEGORIES;
};

const loadContact = async (ctx: Ctx): Promise<ContactInfo> => {
  const v = await getSettingJson(ctx, "contact");
  if (v && typeof v === "object") return { ...DEFAULT_CONTACT, ...(v as Partial<ContactInfo>) };
  return DEFAULT_CONTACT;
};

const saveSetting = async (ctx: Ctx, key: string, value: unknown): Promise<void> => {
  const db = ctx.db<typeof schema>();
  const text = JSON.stringify(value);
  const existing = await db.select().from(schema.settings).where(eq(schema.settings.key, key)).limit(1);
  if (existing.length > 0) await db.update(schema.settings).set({ value: text }).where(eq(schema.settings.key, key));
  else await db.insert(schema.settings).values({ key, value: text });
};

/* ---------- Live Group Quiz helpers ---------- */
const LIVE_SECONDS = 20;
const LIVE_QUESTION_COUNT = 10;

const loadUser = async (ctx: Ctx, userId: number) => {
  const db = ctx.db<typeof schema>();
  const rows = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  const row = rows[0];
  if (!row) throw new Error("অ্যাকাউন্ট পাওয়া যায়নি।");
  return row;
};

type LiveRoomRow = typeof schema.liveRooms.$inferSelect;

const loadRoom = async (ctx: Ctx, roomId: number): Promise<LiveRoomRow> => {
  const db = ctx.db<typeof schema>();
  const rows = await db.select().from(schema.liveRooms).where(eq(schema.liveRooms.id, roomId)).limit(1);
  const row = rows[0];
  if (!row) throw new Error("রুম পাওয়া যায়নি।");
  return row;
};

// Live rooms advance on wall-clock time: whenever anyone polls after the
// deadline, the room moves to the next question (or finishes). If the room
// sat idle for more than a full question, the clock restarts fresh instead
// of burning through the whole quiz.
const advanceRoomIfNeeded = async (ctx: Ctx, room: LiveRoomRow): Promise<LiveRoomRow> => {
  const db = ctx.db<typeof schema>();
  let r = room;
  const now = Date.now();
  while (r.status === "running" && r.deadlineAt !== null && now > r.deadlineAt) {
    const total = (JSON.parse(r.questionIds) as number[]).length;
    const next = r.currentIndex + 1;
    if (next >= total) {
      await db.update(schema.liveRooms).set({ status: "finished", deadlineAt: null })
        .where(eq(schema.liveRooms.id, r.id));
      r = { ...r, status: "finished", deadlineAt: null };
    } else if (r.deadlineAt + LIVE_SECONDS * 1000 < now) {
      await db.update(schema.liveRooms).set({
        currentIndex: next, questionStartedAt: now, deadlineAt: now + LIVE_SECONDS * 1000,
      }).where(eq(schema.liveRooms.id, r.id));
      r = { ...r, currentIndex: next, questionStartedAt: now, deadlineAt: now + LIVE_SECONDS * 1000 };
    } else {
      const started = r.deadlineAt;
      await db.update(schema.liveRooms).set({
        currentIndex: next, questionStartedAt: started, deadlineAt: started + LIVE_SECONDS * 1000,
      }).where(eq(schema.liveRooms.id, r.id));
      r = { ...r, currentIndex: next, questionStartedAt: started, deadlineAt: started + LIVE_SECONDS * 1000 };
    }
  }
  return r;
};

/* ---------- Live history (shared by user History and Admin detail) ---------- */
const liveEventShape = z.object({
  roomId: z.number(), code: z.string(), category: z.string(), date: z.string(), status: z.string(),
  totalQuestions: z.number(), attendees: z.number(), marks: z.number(),
  correct: z.number(), wrong: z.number(), rank: z.number(),
});
type LiveEvent = z.infer<typeof liveEventShape>;

const liveHistoryFor = async (ctx: Ctx, userId: number): Promise<LiveEvent[]> => {
  const db = ctx.db<typeof schema>();
  const myRows = await db.select().from(schema.livePlayers).where(eq(schema.livePlayers.userId, userId));
  const events: LiveEvent[] = [];
  for (const me of myRows) {
    const rooms = await db.select().from(schema.liveRooms).where(eq(schema.liveRooms.id, me.roomId)).limit(1);
    const room = rooms[0];
    if (!room) continue;
    const total = (JSON.parse(room.questionIds) as number[]).length;
    const players = await db.select().from(schema.livePlayers).where(eq(schema.livePlayers.roomId, room.id));
    const sorted = [...players].sort((a, b) => b.correct - a.correct || a.totalTimeMs - b.totalTimeMs);
    const rank = sorted.findIndex((p) => p.userId === userId) + 1;
    events.push({
      roomId: room.id, code: room.code, category: room.category,
      date: room.createdAt.toISOString(), status: room.status,
      totalQuestions: total, attendees: players.length,
      marks: me.correct, correct: me.correct,
      wrong: room.status === "finished" ? Math.max(0, total - me.correct) : me.wrong,
      rank: rank > 0 ? rank : players.length,
    });
  }
  return events.sort((a, b) => b.roomId - a.roomId);
};

const questionInput = z.object({
  category: z.string().trim().min(1).max(60),
  topic: z.string().trim().max(120).default(""),
  stage: z.enum(["past", "current", "upcoming"]).default("current"),
  difficulty: z.enum(["Easy", "Medium", "Hard"]).default("Medium"),
  question: z.string().trim().min(5).max(600),
  options: z.array(z.string().trim().min(1).max(300)).length(4),
  correctIndex: z.number().int().min(0).max(3),
  explanation: z.string().trim().max(1200).default(""),
});

const shuffle = <T,>(arr: T[]): T[] => {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = copy[i] as T;
    copy[i] = copy[j] as T;
    copy[j] = tmp;
  }
  return copy;
};

const userShape = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string(),
  studentId: z.string(),
  isAdmin: z.boolean(),
});

export const Actions = {
  ensureSeed: defineAction({
    description: "Seeds the CSE question bank once if the questions table is empty.",
    request: z.object({}),
    response: z.object({ questionCount: z.number(), categories: z.number() }),
    handler: async (ctx): Promise<{ questionCount: number; categories: number }> => {
      const db = ctx.db<typeof schema>();
      // Idempotent top-up: inserts only bank questions whose text is not in
      // the table yet, so a growing bank reaches existing installs without
      // ever rewriting or duplicating rows (admin edits are preserved).
      const existing = await db.select({ question: schema.questions.question }).from(schema.questions);
      const have = new Set(existing.map((r) => r.question));
      for (const q of QUESTION_BANK) {
        if (have.has(q.question)) continue;
        await db.insert(schema.questions).values({
          category: q.category,
          topic: q.topic,
          stage: q.stage,
          difficulty: q.difficulty,
          question: q.question,
          options: JSON.stringify(q.options),
          correctIndex: q.correctIndex,
          explanation: q.explanation,
        });
      }
      const all = await db.select({ id: schema.questions.id }).from(schema.questions);
      return { questionCount: all.length, categories: CATEGORIES.length };
    },
  }),

  signup: defineAction({
    description: "Creates an individual student account with name, email, student ID and password.",
    request: z.object({
      name: z.string().trim().min(2).max(60),
      email: z.string().trim().email().max(120),
      studentId: z.string().trim().regex(
        /^CSE-\d{7}$/,
        "Student ID-র ফরম্যাট হতে হবে CSE-2324001 — CSE- দিয়ে শুরু, তারপর ৭টি সংখ্যা।",
      ),
      password: z.string().min(4).max(72),
    }),
    response: z.object({ user: userShape }),
    handler: async (ctx, args) => {
      const db = ctx.db<typeof schema>();
      const email = args.email.toLowerCase();
      const existing = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
      if (existing.length > 0) throw new Error("এই ইমেইল দিয়ে আগেই অ্যাকাউন্ট আছে — Login করো।");
      const inserted = await db
        .insert(schema.users)
        .values({
          name: args.name, email, studentId: args.studentId, passwordHash: hashPassword(args.password),
          isAdmin: isAdminEmail(email) ? 1 : 0, lastLoginAt: new Date(),
        })
        .returning();
      const row = inserted[0];
      if (!row) throw new Error("Account তৈরি হয়নি, আবার চেষ্টা করো।");
      ctx.invalidateQueries();
      return { user: toPublicUser(row) };
    },
  }),

  login: defineAction({
    description: "Logs a student in with email and password.",
    request: z.object({
      email: z.string().trim().email().max(120),
      password: z.string().min(1).max(72),
    }),
    response: z.object({ user: userShape }),
    handler: async (ctx, args) => {
      const db = ctx.db<typeof schema>();
      const rows = await db.select().from(schema.users).where(eq(schema.users.email, args.email.toLowerCase())).limit(1);
      const row = rows[0];
      if (!row || row.passwordHash !== hashPassword(args.password)) {
        throw new Error("ইমেইল বা পাসওয়ার্ড মিলছে না। আবার চেষ্টা করো।");
      }
      // Record the login time. The admin role belongs only to the admin's
      // own Gmail account; it is (re)granted on that account at login and
      // removed from any other account that somehow carried it.
      const grantedAdmin = isAdminEmail(row.email) ? 1 : 0;
      const now = new Date();
      await db.update(schema.users)
        .set({ lastLoginAt: now, isAdmin: grantedAdmin })
        .where(eq(schema.users.id, row.id));
      return { user: toPublicUser({ ...row, isAdmin: grantedAdmin, lastLoginAt: now }) };
    },
  }),

  getCategories: defineAction({
    description: "Lists quiz categories with question counts and metadata.",
    request: z.object({}),
    response: z.object({
      categories: z.array(z.object({
        name: z.string(), tagline: z.string(), emoji: z.string(), stageLabel: z.string(), count: z.number(),
      })),
    }),
    handler: async (ctx) => {
      const db = ctx.db<typeof schema>();
      const rows = await db.select({ category: schema.questions.category }).from(schema.questions);
      const counts = new Map<string, number>();
      rows.forEach((r) => counts.set(r.category, (counts.get(r.category) ?? 0) + 1));
      const cats = await loadCategories(ctx);
      return {
        categories: cats.map((c) => ({ ...c, count: counts.get(c.name) ?? 0 })),
      };
    },
  }),

  startQuiz: defineAction({
    description: "Returns a fresh randomised set of questions for a category (or a mixed quiz), without answer keys. Questions this student has already attempted are held back until the bank is exhausted, so every attempt — and every student — gets a different set and order.",
    request: z.object({
      category: z.string().min(1).max(60),
      count: z.number().int().min(3).max(60).default(10),
      userId: z.number().int().optional(),
    }),
    response: z.object({
      questions: z.array(z.object({
        id: z.number(), category: z.string(), topic: z.string(), stage: z.string(), difficulty: z.string(),
        question: z.string(), options: z.array(z.string()),
      })),
    }),
    handler: async (ctx, args) => {
      const db = ctx.db<typeof schema>();
      const rows = args.category === "Mixed Quiz"
        ? await db.select().from(schema.questions)
        : await db.select().from(schema.questions).where(eq(schema.questions.category, args.category));
      // Questions this student has already answered (tracked per attempt).
      let seen = new Set<string>();
      if (args.userId) {
        const answered = await db.select({ question: schema.attemptAnswers.question })
          .from(schema.attemptAnswers)
          .where(eq(schema.attemptAnswers.userId, args.userId));
        seen = new Set(answered.map((a) => a.question));
      }
      // Balanced difficulty mix in every draw: ~40% Easy, ~40% Medium,
      // ~20% Hard — and inside each level, questions this student has not
      // attempted yet come first, so sets keep changing attempt after attempt.
      const fresh = rows.filter((r) => !seen.has(r.question));
      const used = rows.filter((r) => seen.has(r.question));
      const queues: Record<"Easy" | "Medium" | "Hard", typeof rows> = {
        Easy: [...shuffle(fresh.filter((r) => r.difficulty === "Easy")), ...shuffle(used.filter((r) => r.difficulty === "Easy"))],
        Medium: [...shuffle(fresh.filter((r) => r.difficulty === "Medium")), ...shuffle(used.filter((r) => r.difficulty === "Medium"))],
        Hard: [...shuffle(fresh.filter((r) => r.difficulty === "Hard")), ...shuffle(used.filter((r) => r.difficulty === "Hard"))],
      };
      const wantEasy = Math.round(args.count * 0.4);
      const wantMedium = Math.round(args.count * 0.4);
      const want = { Easy: wantEasy, Medium: wantMedium, Hard: args.count - wantEasy - wantMedium };
      const picked: typeof rows = [];
      (["Easy", "Medium", "Hard"] as const).forEach((d) => {
        picked.push(...queues[d].slice(0, want[d]));
        queues[d] = queues[d].slice(want[d]);
      });
      if (picked.length < args.count) {
        const rest = shuffle([...queues.Easy, ...queues.Medium, ...queues.Hard]);
        picked.push(...rest.slice(0, args.count - picked.length));
      }
      return {
        questions: shuffle(picked).slice(0, args.count).map((r) => ({
          id: r.id, category: r.category, topic: r.topic, stage: r.stage, difficulty: r.difficulty,
          question: r.question,
          options: JSON.parse(r.options) as string[],
        })),
      };
    },
  }),

  checkAnswer: defineAction({
    description: "Checks one answer on the server and returns the correct index plus explanation.",
    request: z.object({ questionId: z.number().int(), selectedIndex: z.number().int().min(-1).max(3) }),
    response: z.object({ correct: z.boolean(), correctIndex: z.number(), explanation: z.string() }),
    handler: async (ctx, args) => {
      const db = ctx.db<typeof schema>();
      const rows = await db.select().from(schema.questions).where(eq(schema.questions.id, args.questionId)).limit(1);
      const row = rows[0];
      if (!row) throw new Error("Question পাওয়া যায়নি।");
      return { correct: row.correctIndex === args.selectedIndex, correctIndex: row.correctIndex, explanation: row.explanation };
    },
  }),

  submitAttempt: defineAction({
    description: "Saves a finished quiz attempt (score) plus its per-question answers for the logged-in student.",
    request: z.object({
      userId: z.number().int(),
      category: z.string().min(1).max(60),
      score: z.number().int().min(0).max(100),
      total: z.number().int().min(1).max(100),
      answers: z.array(z.object({
        question: z.string().max(600),
        topic: z.string().max(120),
        selectedIndex: z.number().int().min(-1).max(3),
        correctIndex: z.number().int().min(0).max(3),
        selectedText: z.string().max(300),
        correctText: z.string().max(300),
        explanation: z.string().max(1200),
        correct: z.boolean(),
      })).max(20).default([]),
    }),
    response: z.object({ id: z.number() }),
    handler: async (ctx, args) => {
      const db = ctx.db<typeof schema>();
      const inserted = await db.insert(schema.attempts).values({
        userId: args.userId, category: args.category, score: args.score, total: args.total,
      }).returning({ id: schema.attempts.id });
      const row = inserted[0];
      if (!row) throw new Error("Result সেভ হয়নি।");
      for (const a of args.answers) {
        await db.insert(schema.attemptAnswers).values({
          attemptId: row.id, userId: args.userId,
          question: a.question, topic: a.topic,
          selectedIndex: a.selectedIndex, correctIndex: a.correctIndex,
          selectedText: a.selectedText, correctText: a.correctText,
          explanation: a.explanation, correct: a.correct ? 1 : 0,
        });
      }
      ctx.invalidateQueries();
      return { id: row.id };
    },
  }),

  getMyLiveHistory: defineAction({
    description: "Returns the logged-in student's own Live Group Quiz history: every live event they joined, with date, attendance and their result (marks, correct, wrong, rank). Private to that student.",
    request: z.object({ userId: z.number().int() }),
    response: z.object({ events: z.array(liveEventShape) }),
    handler: async (ctx, args) => ({ events: await liveHistoryFor(ctx, args.userId) }),
  }),

  getAdminOverview: defineAction({
    description: "Admin only: platform totals and every registered student with registration date, last login, attempts, scores and rank.",
    request: z.object({ adminUserId: z.number().int() }),
    response: z.object({
      totals: z.object({ users: z.number(), attempts: z.number(), attendees: z.number(), totalCorrect: z.number() }),
      students: z.array(z.object({
        id: z.number(), name: z.string(), studentId: z.string(), email: z.string(), isAdmin: z.boolean(),
        registeredAt: z.string(), lastLoginAt: z.string().nullable(),
        attempts: z.number(), totalCorrect: z.number(), totalQuestions: z.number(),
        bestPercent: z.number(), rank: z.number().nullable(),
      })),
    }),
    handler: async (ctx, args) => {
      await requireAdmin(ctx, args.adminUserId);
      const db = ctx.db<typeof schema>();
      const allUsers = await db.select().from(schema.users).orderBy(asc(schema.users.id));
      const allAttempts = await db.select().from(schema.attempts);
      const byUser = new Map<number, { attempts: number; totalCorrect: number; totalQuestions: number; bestPercent: number }>();
      allAttempts.forEach((a) => {
        const cur = byUser.get(a.userId) ?? { attempts: 0, totalCorrect: 0, totalQuestions: 0, bestPercent: 0 };
        cur.attempts += 1;
        cur.totalCorrect += a.score;
        cur.totalQuestions += a.total;
        cur.bestPercent = Math.max(cur.bestPercent, Math.round((a.score / a.total) * 100));
        byUser.set(a.userId, cur);
      });
      const rankedIds = [...byUser.entries()]
        .sort((a, b) => b[1].totalCorrect - a[1].totalCorrect || b[1].bestPercent - a[1].bestPercent)
        .map(([uid]) => uid);
      const rankOf = new Map(rankedIds.map((uid, i) => [uid, i + 1]));
      return {
        totals: {
          users: allUsers.length,
          attempts: allAttempts.length,
          attendees: byUser.size,
          totalCorrect: allAttempts.reduce((s, a) => s + a.score, 0),
        },
        students: allUsers.map((u) => {
          const s = byUser.get(u.id);
          return {
            id: u.id, name: u.name, studentId: u.studentId, email: u.email, isAdmin: u.isAdmin === 1,
            registeredAt: u.createdAt.toISOString(),
            lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
            attempts: s?.attempts ?? 0,
            totalCorrect: s?.totalCorrect ?? 0,
            totalQuestions: s?.totalQuestions ?? 0,
            bestPercent: s?.bestPercent ?? 0,
            rank: rankOf.get(u.id) ?? null,
          };
        }),
      };
    },
  }),

  getAdminStudentDetail: defineAction({
    description: "Admin only: one student's quiz attempts with the wrong answers for each attempt.",
    request: z.object({ adminUserId: z.number().int(), studentUserId: z.number().int() }),
    response: z.object({
      student: z.object({
        id: z.number(), name: z.string(), studentId: z.string(), email: z.string(),
        registeredAt: z.string(), lastLoginAt: z.string().nullable(),
      }),
      attempts: z.array(z.object({
        id: z.number(), category: z.string(), score: z.number(), total: z.number(), created_at: z.string(),
        wrong: z.array(z.object({
          question: z.string(), topic: z.string(), selectedText: z.string(),
          correctText: z.string(), explanation: z.string(), timedOut: z.boolean(),
        })),
      })),
      liveEvents: z.array(liveEventShape),
    }),
    handler: async (ctx, args) => {
      await requireAdmin(ctx, args.adminUserId);
      const db = ctx.db<typeof schema>();
      const rows = await db.select().from(schema.users).where(eq(schema.users.id, args.studentUserId)).limit(1);
      const student = rows[0];
      if (!student) throw new Error("শিক্ষার্থী পাওয়া যায়নি।");
      const att = await db.select().from(schema.attempts)
        .where(eq(schema.attempts.userId, args.studentUserId))
        .orderBy(desc(schema.attempts.id)).limit(50);
      const answers = await db.select().from(schema.attemptAnswers)
        .where(eq(schema.attemptAnswers.userId, args.studentUserId));
      const wrongByAttempt = new Map<number, { question: string; topic: string; selectedText: string; correctText: string; explanation: string; timedOut: boolean }[]>();
      answers.forEach((a) => {
        if (a.correct === 1) return;
        const list = wrongByAttempt.get(a.attemptId) ?? [];
        list.push({
          question: a.question, topic: a.topic, selectedText: a.selectedText,
          correctText: a.correctText, explanation: a.explanation, timedOut: a.selectedIndex === -1,
        });
        wrongByAttempt.set(a.attemptId, list);
      });
      return {
        student: {
          id: student.id, name: student.name, studentId: student.studentId, email: student.email,
          registeredAt: student.createdAt.toISOString(),
          lastLoginAt: student.lastLoginAt ? student.lastLoginAt.toISOString() : null,
        },
        attempts: att.map((a) => ({
          id: a.id, category: a.category, score: a.score, total: a.total,
          created_at: a.createdAt.toISOString(),
          wrong: wrongByAttempt.get(a.id) ?? [],
        })),
        liveEvents: await liveHistoryFor(ctx, args.studentUserId),
      };
    },
  }),

  getMyStats: defineAction({
    description: "Returns the logged-in student's own attempts, totals and best scores (private to them).",
    request: z.object({ userId: z.number().int() }),
    response: z.object({
      attempts: z.array(z.object({
        id: z.number(), category: z.string(), score: z.number(), total: z.number(), created_at: z.string(),
      })),
      totalAttempts: z.number(), totalCorrect: z.number(), totalQuestions: z.number(), bestPercent: z.number(),
    }),
    handler: async (ctx, args) => {
      const db = ctx.db<typeof schema>();
      const rows = await db.select().from(schema.attempts)
        .where(eq(schema.attempts.userId, args.userId))
        .orderBy(desc(schema.attempts.id)).limit(50);
      const totalCorrect = rows.reduce((s, r) => s + r.score, 0);
      const totalQuestions = rows.reduce((s, r) => s + r.total, 0);
      const bestPercent = rows.length ? Math.max(...rows.map((r) => Math.round((r.score / r.total) * 100))) : 0;
      return {
        attempts: rows.map((r) => ({
          id: r.id, category: r.category, score: r.score, total: r.total,
          created_at: r.createdAt.toISOString(),
        })),
        totalAttempts: rows.length, totalCorrect, totalQuestions, bestPercent,
      };
    },
  }),

  getResultContext: defineAction({
    description: "Returns participation and ranking context for a finished quiz: how many students attempted this category, total attempts, and the student's rank.",
    request: z.object({ userId: z.number().int(), category: z.string().min(1).max(60) }),
    response: z.object({
      categoryParticipants: z.number(),
      categoryAttempts: z.number(),
      overallRank: z.number(),
      totalRankedStudents: z.number(),
    }),
    handler: async (ctx, args) => {
      const db = ctx.db<typeof schema>();
      const allAttempts = await db.select().from(schema.attempts);
      const catAttempts = allAttempts.filter((a) => a.category === args.category);
      const participants = new Set(catAttempts.map((a) => a.userId)).size;
      // Overall rank by total correct across all categories
      const totals = new Map<number, number>();
      allAttempts.forEach((a) => totals.set(a.userId, (totals.get(a.userId) ?? 0) + a.score));
      const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1]);
      const rankIdx = sorted.findIndex(([uid]) => uid === args.userId);
      return {
        categoryParticipants: participants,
        categoryAttempts: catAttempts.length,
        overallRank: rankIdx >= 0 ? rankIdx + 1 : sorted.length + 1,
        totalRankedStudents: sorted.length,
      };
    },
  }),

  getLeaderboard: defineAction({
    description: "Returns the department leaderboard: students ranked by total correct answers.",
    request: z.object({}),
    response: z.object({
      entries: z.array(z.object({
        userId: z.number(), name: z.string(), studentId: z.string(), photoUrl: z.string().nullable(),
        totalCorrect: z.number(), attempts: z.number(), bestPercent: z.number(),
      })),
    }),
    handler: async (ctx) => {
      const db = ctx.db<typeof schema>();
      const allUsers = await db.select().from(schema.users).orderBy(asc(schema.users.id));
      const allAttempts = await db.select().from(schema.attempts);
      const byUser = new Map<number, { totalCorrect: number; attempts: number; bestPercent: number }>();
      allAttempts.forEach((a) => {
        const cur = byUser.get(a.userId) ?? { totalCorrect: 0, attempts: 0, bestPercent: 0 };
        cur.totalCorrect += a.score;
        cur.attempts += 1;
        cur.bestPercent = Math.max(cur.bestPercent, Math.round((a.score / a.total) * 100));
        byUser.set(a.userId, cur);
      });
      const base = allUsers
        .filter((u) => byUser.has(u.id))
        .map((u) => ({
          userId: u.id, name: u.name, studentId: u.studentId, photoBlobKey: u.photoBlobKey,
          ...(byUser.get(u.id) as { totalCorrect: number; attempts: number; bestPercent: number }),
        }))
        .sort((a, b) => b.totalCorrect - a.totalCorrect || b.bestPercent - a.bestPercent)
        .slice(0, 20);
      const entries = await Promise.all(base.map(async (e) => ({
        userId: e.userId, name: e.name, studentId: e.studentId,
        photoUrl: e.photoBlobKey ? await ctx.blobs.getUrl(e.photoBlobKey) : null,
        totalCorrect: e.totalCorrect, attempts: e.attempts, bestPercent: e.bestPercent,
      })));
      return { entries };
    },
  }),
  getContactInfo: defineAction({
    description: "Returns the campus contact information shown in the site footer (admin-editable).",
    request: z.object({}),
    response: z.object({
      contact: z.object({
        address: z.string(), phone1: z.string(), phone2: z.string(), email: z.string(), website: z.string(),
      }),
    }),
    handler: async (ctx) => ({ contact: await loadContact(ctx) }),
  }),

  adminListQuestions: defineAction({
    description: "Admin only: lists every quiz question with options, correct answer and explanation for editing.",
    request: z.object({ adminUserId: z.number().int() }),
    response: z.object({
      questions: z.array(z.object({
        id: z.number(), category: z.string(), topic: z.string(), stage: z.string(), difficulty: z.string(),
        question: z.string(), options: z.array(z.string()), correctIndex: z.number(), explanation: z.string(),
      })),
    }),
    handler: async (ctx, args) => {
      await requireAdmin(ctx, args.adminUserId);
      const db = ctx.db<typeof schema>();
      const rows = await db.select().from(schema.questions).orderBy(asc(schema.questions.id));
      return {
        questions: rows.map((r) => ({
          id: r.id, category: r.category, topic: r.topic, stage: r.stage, difficulty: r.difficulty, question: r.question,
          options: JSON.parse(r.options) as string[], correctIndex: r.correctIndex, explanation: r.explanation,
        })),
      };
    },
  }),

  adminAddQuestion: defineAction({
    description: "Admin only: adds a new quiz question to the bank.",
    request: z.object({ adminUserId: z.number().int(), question: questionInput }),
    response: z.object({ id: z.number() }),
    handler: async (ctx, args) => {
      await requireAdmin(ctx, args.adminUserId);
      const db = ctx.db<typeof schema>();
      const q = args.question;
      const inserted = await db.insert(schema.questions).values({
        category: q.category, topic: q.topic, stage: q.stage, difficulty: q.difficulty, question: q.question,
        options: JSON.stringify(q.options), correctIndex: q.correctIndex, explanation: q.explanation,
      }).returning({ id: schema.questions.id });
      const row = inserted[0];
      if (!row) throw new Error("প্রশ্ন যোগ হয়নি।");
      ctx.invalidateQueries();
      return { id: row.id };
    },
  }),

  adminUpdateQuestion: defineAction({
    description: "Admin only: edits an existing quiz question.",
    request: z.object({ adminUserId: z.number().int(), id: z.number().int(), question: questionInput }),
    response: z.object({ ok: z.boolean() }),
    handler: async (ctx, args) => {
      await requireAdmin(ctx, args.adminUserId);
      const db = ctx.db<typeof schema>();
      const q = args.question;
      await db.update(schema.questions).set({
        category: q.category, topic: q.topic, stage: q.stage, difficulty: q.difficulty, question: q.question,
        options: JSON.stringify(q.options), correctIndex: q.correctIndex, explanation: q.explanation,
      }).where(eq(schema.questions.id, args.id));
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  adminDeleteQuestion: defineAction({
    description: "Admin only: deletes a quiz question from the bank.",
    request: z.object({ adminUserId: z.number().int(), id: z.number().int() }),
    response: z.object({ ok: z.boolean() }),
    handler: async (ctx, args) => {
      await requireAdmin(ctx, args.adminUserId);
      const db = ctx.db<typeof schema>();
      await db.delete(schema.questions).where(eq(schema.questions.id, args.id));
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  adminUpdateCategories: defineAction({
    description: "Admin only: replaces the quiz category list (name, tagline, emoji, label) shown on the home page.",
    request: z.object({
      adminUserId: z.number().int(),
      categories: z.array(z.object({
        name: z.string().trim().min(1).max(60),
        tagline: z.string().trim().max(140),
        emoji: z.string().trim().max(8),
        stageLabel: z.string().trim().max(30),
      })).min(1).max(12),
    }),
    response: z.object({ saved: z.number() }),
    handler: async (ctx, args) => {
      await requireAdmin(ctx, args.adminUserId);
      await saveSetting(ctx, "categories", args.categories);
      ctx.invalidateQueries();
      return { saved: args.categories.length };
    },
  }),

  adminUpdateContact: defineAction({
    description: "Admin only: updates the campus contact information shown in the site footer.",
    request: z.object({
      adminUserId: z.number().int(),
      contact: z.object({
        address: z.string().trim().min(3).max(200),
        phone1: z.string().trim().max(30),
        phone2: z.string().trim().max(30),
        email: z.string().trim().max(120),
        website: z.string().trim().max(120),
      }),
    }),
    response: z.object({ ok: z.boolean() }),
    handler: async (ctx, args) => {
      await requireAdmin(ctx, args.adminUserId);
      await saveSetting(ctx, "contact", args.contact);
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),
  setProfilePhoto: defineAction({
    description: "Saves the logged-in student's own profile photo (shown next to their name on leaderboards).",
    request: z.object({
      userId: z.number().int(),
      image: z.object({ dataBase64: z.string().min(10).max(8_000_000), mimeType: z.string().max(40) }),
    }),
    response: z.object({ photoUrl: z.string() }),
    handler: async (ctx, args) => {
      if (args.image.mimeType !== "image/jpeg" && args.image.mimeType !== "image/png") {
        throw new Error("শুধু JPG বা PNG ছবি দেওয়া যাবে।");
      }
      const db = ctx.db<typeof schema>();
      await loadUser(ctx, args.userId);
      const bytes = Buffer.from(args.image.dataBase64, "base64");
      const key = `avatars/user-${args.userId}-${Date.now()}`;
      await ctx.blobs.put(key, bytes, { contentType: args.image.mimeType });
      await db.update(schema.users).set({ photoBlobKey: key }).where(eq(schema.users.id, args.userId));
      ctx.invalidateQueries();
      return { photoUrl: await ctx.blobs.getUrl(key) };
    },
  }),

  getMyProfile: defineAction({
    description: "Returns the logged-in student's own profile photo URL (or null if none uploaded).",
    request: z.object({ userId: z.number().int() }),
    response: z.object({ photoUrl: z.string().nullable() }),
    handler: async (ctx, args) => {
      const me = await loadUser(ctx, args.userId);
      return { photoUrl: me.photoBlobKey ? await ctx.blobs.getUrl(me.photoBlobKey) : null };
    },
  }),

  /* ================= Live Group Quiz ================= */
  createLiveRoom: defineAction({
    description: "Creates a Live Group Quiz room with a join code; the creator is the host and first player.",
    request: z.object({
      userId: z.number().int(), category: z.string().min(1).max(60),
      questionCount: z.union([z.literal(30), z.literal(50)]).default(30),
    }),
    response: z.object({ roomId: z.number(), code: z.string() }),
    handler: async (ctx, args) => {
      const db = ctx.db<typeof schema>();
      const me = await loadUser(ctx, args.userId);
      const pool = args.category === "Mixed Quiz"
        ? await db.select().from(schema.questions)
        : await db.select().from(schema.questions).where(eq(schema.questions.category, args.category));
      if (pool.length < 3) throw new Error("এই ক্যাটাগরিতে যথেষ্ট প্রশ্ন নেই।");
      const ids = shuffle(pool).slice(0, args.questionCount).map((q) => q.id);
      let code = "";
      for (let tries = 0; tries < 8; tries++) {
        code = String(100000 + Math.floor(Math.random() * 900000));
        const clash = await db.select({ id: schema.liveRooms.id }).from(schema.liveRooms)
          .where(eq(schema.liveRooms.code, code));
        const active = clash.length > 0;
        if (!active) break;
        code = "";
      }
      if (!code) throw new Error("রুম কোড তৈরি হয়নি, আবার চেষ্টা করো।");
      const inserted = await db.insert(schema.liveRooms).values({
        code, hostUserId: me.id, category: args.category, status: "lobby",
        questionIds: JSON.stringify(ids),
      }).returning({ id: schema.liveRooms.id });
      const room = inserted[0];
      if (!room) throw new Error("রুম তৈরি হয়নি।");
      await db.insert(schema.livePlayers).values({
        roomId: room.id, userId: me.id, name: me.name, studentId: me.studentId,
      });
      ctx.invalidateQueries();
      return { roomId: room.id, code };
    },
  }),

  joinLiveRoom: defineAction({
    description: "Joins a Live Group Quiz room by its 6-digit code while it is in the lobby.",
    request: z.object({ userId: z.number().int(), code: z.string().trim().min(4).max(10) }),
    response: z.object({ roomId: z.number() }),
    handler: async (ctx, args) => {
      const db = ctx.db<typeof schema>();
      const me = await loadUser(ctx, args.userId);
      const rooms = await db.select().from(schema.liveRooms)
        .where(eq(schema.liveRooms.code, args.code)).orderBy(desc(schema.liveRooms.id)).limit(1);
      const room = rooms[0];
      if (!room || room.status !== "lobby") throw new Error("রুম পাওয়া যায়নি, অথবা খেলা ইতিমধ্যে শুরু হয়ে গেছে।");
      const existing = await db.select().from(schema.livePlayers)
        .where(eq(schema.livePlayers.roomId, room.id));
      if (!existing.some((p) => p.userId === me.id)) {
        await db.insert(schema.livePlayers).values({
          roomId: room.id, userId: me.id, name: me.name, studentId: me.studentId,
        });
      }
      ctx.invalidateQueries();
      return { roomId: room.id };
    },
  }),

  startLiveRoom: defineAction({
    description: "Host only: starts a Live Group Quiz room so all players get the first question together.",
    request: z.object({ userId: z.number().int(), roomId: z.number().int() }),
    response: z.object({ ok: z.boolean() }),
    handler: async (ctx, args) => {
      const db = ctx.db<typeof schema>();
      const rooms = await db.select().from(schema.liveRooms).where(eq(schema.liveRooms.id, args.roomId)).limit(1);
      const room = rooms[0];
      if (!room) throw new Error("রুম পাওয়া যায়নি।");
      if (room.hostUserId !== args.userId) throw new Error("শুধুমাত্র রুমের হোস্ট খেলা শুরু করতে পারে।");
      if (room.status !== "lobby") throw new Error("খেলা ইতিমধ্যে শুরু হয়ে গেছে।");
      const now = Date.now();
      await db.update(schema.liveRooms).set({
        status: "running", currentIndex: 0,
        questionStartedAt: now, deadlineAt: now + LIVE_SECONDS * 1000,
      }).where(eq(schema.liveRooms.id, room.id));
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  answerLive: defineAction({
    description: "Records a player's answer to the room's current live question and returns instant feedback.",
    request: z.object({
      userId: z.number().int(), roomId: z.number().int(),
      selectedIndex: z.number().int().min(0).max(3),
    }),
    response: z.object({ correct: z.boolean(), correctIndex: z.number() }),
    handler: async (ctx, args) => {
      const db = ctx.db<typeof schema>();
      const room = await advanceRoomIfNeeded(ctx, await loadRoom(ctx, args.roomId));
      if (room.status !== "running") throw new Error("খেলা এখন চলছে না।");
      const ids = JSON.parse(room.questionIds) as number[];
      const qid = ids[room.currentIndex];
      if (qid === undefined) throw new Error("প্রশ্ন পাওয়া যায়নি।");
      const qrows = await db.select().from(schema.questions).where(eq(schema.questions.id, qid)).limit(1);
      const q = qrows[0];
      if (!q) throw new Error("প্রশ্ন পাওয়া যায়নি।");
      const players = await db.select().from(schema.livePlayers).where(eq(schema.livePlayers.roomId, room.id));
      const me = players.find((p) => p.userId === args.userId);
      if (!me) throw new Error("তুমি এই রুমের খেলোয়াড় নও।");
      const prev = await db.select().from(schema.liveAnswers).where(eq(schema.liveAnswers.roomId, room.id));
      const already = prev.find((a) => a.userId === args.userId && a.questionIndex === room.currentIndex);
      if (already) return { correct: already.correct === 1, correctIndex: q.correctIndex };
      const now = Date.now();
      const timeMs = Math.max(0, Math.min(LIVE_SECONDS * 1000, now - (room.questionStartedAt ?? now)));
      const correct = args.selectedIndex === q.correctIndex;
      await db.insert(schema.liveAnswers).values({
        roomId: room.id, userId: args.userId, questionIndex: room.currentIndex,
        questionId: q.id, selectedIndex: args.selectedIndex, correct: correct ? 1 : 0, timeMs,
      });
      const isLast = room.currentIndex + 1 >= ids.length;
      await db.update(schema.livePlayers).set({
        correct: me.correct + (correct ? 1 : 0),
        wrong: me.wrong + (correct ? 0 : 1),
        totalTimeMs: me.totalTimeMs + timeMs,
        finishedAt: isLast ? now : me.finishedAt,
      }).where(eq(schema.livePlayers.id, me.id));
      ctx.invalidateQueries();
      return { correct, correctIndex: q.correctIndex };
    },
  }),

  getLiveState: defineAction({
    description: "Returns the live state of a group quiz room: status, current question, players and live leaderboard data.",
    request: z.object({ userId: z.number().int(), roomId: z.number().int() }),
    response: z.object({
      room: z.object({
        id: z.number(), code: z.string(), status: z.string(), category: z.string(),
        currentIndex: z.number(), totalQuestions: z.number(), deadlineAt: z.number().nullable(), isHost: z.boolean(),
      }),
      question: z.object({ question: z.string(), options: z.array(z.string()), topic: z.string() }).nullable(),
      players: z.array(z.object({
        userId: z.number(), name: z.string(), studentId: z.string(), photoUrl: z.string().nullable(),
        correct: z.number(), wrong: z.number(), answeredCurrent: z.boolean(),
        finished: z.boolean(), totalTimeMs: z.number(),
      })),
      mySelected: z.number().nullable(),
      myCorrectIndex: z.number().nullable(),
      myWrong: z.array(z.object({
        question: z.string(), selectedText: z.string(), correctText: z.string(), explanation: z.string(),
      })),
    }),
    handler: async (ctx, args) => {
      const db = ctx.db<typeof schema>();
      const room = await advanceRoomIfNeeded(ctx, await loadRoom(ctx, args.roomId));
      const ids = JSON.parse(room.questionIds) as number[];
      const total = ids.length;
      const players = await db.select().from(schema.livePlayers).where(eq(schema.livePlayers.roomId, room.id));
      const answers = await db.select().from(schema.liveAnswers).where(eq(schema.liveAnswers.roomId, room.id));
      const answeredNow = new Set(answers.filter((a) => a.questionIndex === room.currentIndex).map((a) => a.userId));
      const finished = room.status === "finished";

      let question: { question: string; options: string[]; topic: string } | null = null;
      let myCorrectIndex: number | null = null;
      const qid = ids[room.currentIndex];
      if (room.status === "running" && qid !== undefined) {
        const qrows = await db.select().from(schema.questions).where(eq(schema.questions.id, qid)).limit(1);
        const q = qrows[0];
        if (q) {
          question = { question: q.question, options: JSON.parse(q.options) as string[], topic: q.topic };
          const mine = answers.find((a) => a.userId === args.userId && a.questionIndex === room.currentIndex);
          if (mine) myCorrectIndex = q.correctIndex;
        }
      }
      const myAnswer = answers.find((a) => a.userId === args.userId && a.questionIndex === room.currentIndex);

      let myWrong: { question: string; selectedText: string; correctText: string; explanation: string }[] = [];
      if (finished) {
        const mineWrong = answers.filter((a) => a.userId === args.userId && a.correct === 0);
        for (const a of mineWrong) {
          const qrows = await db.select().from(schema.questions).where(eq(schema.questions.id, a.questionId)).limit(1);
          const q = qrows[0];
          if (!q) continue;
          const opts = JSON.parse(q.options) as string[];
          myWrong.push({
            question: q.question,
            selectedText: a.selectedIndex >= 0 ? (opts[a.selectedIndex] ?? "") : "",
            correctText: opts[q.correctIndex] ?? "",
            explanation: q.explanation,
          });
        }
      }

      const allUsers = await db.select().from(schema.users);
      const photoKeyOf = new Map(allUsers.map((u) => [u.id, u.photoBlobKey]));
      const playerList = await Promise.all(players
        .map(async (p) => ({
          userId: p.userId, name: p.name, studentId: p.studentId,
          photoUrl: photoKeyOf.get(p.userId) ? await ctx.blobs.getUrl(photoKeyOf.get(p.userId) as string) : null,
          correct: p.correct,
          wrong: finished ? Math.max(0, total - p.correct) : p.wrong,
          answeredCurrent: answeredNow.has(p.userId),
          finished: p.finishedAt !== null || finished,
          totalTimeMs: p.totalTimeMs,
        })));
      playerList.sort((a, b) => b.correct - a.correct || a.totalTimeMs - b.totalTimeMs);

      return {
        room: {
          id: room.id, code: room.code, status: room.status, category: room.category,
          currentIndex: room.currentIndex, totalQuestions: total,
          deadlineAt: room.deadlineAt ?? null, isHost: room.hostUserId === args.userId,
        },
        question,
        players: playerList,
        mySelected: myAnswer ? myAnswer.selectedIndex : null,
        myCorrectIndex,
        myWrong,
      };
    },
  }),
} satisfies ActionsModule;
