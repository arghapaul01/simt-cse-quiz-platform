"use strict";
/* /api/live — server-backed Live Group Quiz rooms (free Vercel + Upstash Redis).
   All actions require a Bearer login token. Room state lives in Redis, so
   players on different phones can join the same room by its 6-digit code —
   no room state lives in any one browser.
   - MAX 50 players per room, including the host, enforced server-side.
     The 51st join is rejected with a Bengali "room full" error.
   - Join is allowed only while the room is in the lobby; starting is
     host-only; everyone in the room answers the same questions (the
     questionIds the host drew from the shared 313-question bank).
   - Answers are stored compactly per player: [selectedIndex, correct, timeMs]
     per question index (null = unanswered). Correctness is computed on the
     server from the selectedIndex + correctIndex the client sends, never
     from a client-supplied "correct" flag.
   - Player name / Student ID / photo ride inside the room record (photo
     only when <= 32 KB) so the live leaderboard can show them without an
     extra lookup per player. If a room would grow past ~850 KB (many big
     photos), photos are dropped from the room before saving — the game
     never depends on them.
   - Rooms expire after 7 days. When a room finishes, a compact live-event
     record is saved per player (GET ?action=mine) so quiz history shows
     the live event on any device.
   - Polling: clients GET ?action=room every ~2 seconds; the server
     advances the room (question deadline / total time) before answering,
     so every device sees joins, start, questions and the leaderboard
     together. */
const lib = require("./_lib");

const MAX_PLAYERS = 50;
const LIVE_SECONDS = 20; // per question, mirrors the client
const TOTAL_SECONDS_PER_QUESTION = 30; // 15 min for 30, 25 min for 50
const ROOM_TTL_SECONDS = 7 * 24 * 60 * 60;
const MAX_EVENTS_PER_USER = 50;
const MAX_PHOTO_IN_ROOM = 32 * 1024; // chars of data URL
const MAX_ROOM_JSON = 850 * 1024;
const FULL_MSG = "রুম ভরে গেছে — এক রুমে সর্বোচ্চ ৫০ জন।";

function roomKey(id) { return "room:" + id; }
function roomCodeKey(code) { return "room:code:" + code; }
function roomPlayersKey(id) { return "room:" + id + ":players"; }
function eventsKey(userId) { return "liveevents:" + userId; }

async function loadRoom(id) {
  const raw = await lib.kvGet(roomKey(id));
  return raw ? JSON.parse(raw) : null;
}
async function saveRoom(room) {
  let json = JSON.stringify(room);
  if (json.length > MAX_ROOM_JSON) {
    // Too many big photos: drop photos (gameplay never depends on them).
    Object.values(room.players || {}).forEach((p) => { p.photo = null; });
    json = JSON.stringify(room);
  }
  await lib.kvPipeline([
    ["SET", roomKey(room.id), json],
    ["EXPIRE", roomKey(room.id), String(ROOM_TTL_SECONDS)],
    ["SET", roomCodeKey(room.code), String(room.id)],
    ["EXPIRE", roomCodeKey(room.code), String(ROOM_TTL_SECONDS)],
    ["EXPIRE", roomPlayersKey(room.id), String(ROOM_TTL_SECONDS)],
  ]);
}
function playerCount(room) { return Object.keys(room.players || {}).length; }
function publicRoom(room) {
  const r = { ...room };
  r.playerCount = playerCount(room);
  return r;
}
function newPlayer(user) {
  return {
    userId: user.id,
    name: user.name,
    studentId: user.studentId,
    email: user.email,
    photo: user.photo && user.photo.length <= MAX_PHOTO_IN_ROOM ? user.photo : null,
    answers: [],
    correct: 0,
    wrong: 0,
    totalTimeMs: 0,
  };
}
function sortedPlayers(room) {
  return Object.values(room.players || {}).sort(
    (a, b) => b.correct - a.correct || a.totalTimeMs - b.totalTimeMs
  );
}
function fillUnanswered(room, idx) {
  Object.values(room.players || {}).forEach((p) => {
    if (!p.answers[idx]) {
      p.answers[idx] = [-1, 0, LIVE_SECONDS * 1000];
      p.wrong += 1;
      p.totalTimeMs += LIVE_SECONDS * 1000;
    }
  });
}
function fillRemaining(room) {
  for (let i = room.currentIndex; i < room.questionIds.length; i++) fillUnanswered(room, i);
}
function finishRoom(room) {
  if (!room || room.status === "finished") return;
  fillRemaining(room);
  room.status = "finished";
  room.deadlineAt = null;
}
/* Save one finished-room record per player, once, so history shows the
   live event on any device (the stub is room-shaped, so the client's
   myLiveEvents / finished-room rendering works unchanged). */
async function recordLiveEvents(room) {
  if (room.eventsRecorded) return;
  room.eventsRecorded = true;
  const sorted = sortedPlayers(room);
  for (const p of sorted) {
    const stub = {
      serverId: room.id,
      code: room.code,
      hostId: room.hostId,
      category: room.category,
      status: "finished",
      questionIds: room.questionIds,
      totalSeconds: room.totalSeconds,
      startedAt: room.startedAt,
      createdAt: room.createdAt,
      attendees: playerCount(room),
      rank: sorted.findIndex((x) => x.userId === p.userId) + 1,
      players: { [p.userId]: p },
    };
    const key = eventsKey(p.userId);
    const raw = await lib.kvGet(key);
    let list = raw ? JSON.parse(raw) : [];
    list = list.filter((e) => e.serverId !== room.id);
    list.push(stub);
    list = list.slice(-MAX_EVENTS_PER_USER);
    await lib.kvPipeline([
      ["SET", key, JSON.stringify(list)],
      ["EXPIRE", key, String(ROOM_TTL_SECONDS)],
    ]);
  }
}
/* Advance a running room to "now": total time over -> finish; per-question
   deadline passed -> mark the question unanswered for everyone and move
   on. Returns true when anything changed. */
function advanceRoom(room, now) {
  if (!room || room.status !== "running") return false;
  const totalMs = (room.totalSeconds || room.questionIds.length * TOTAL_SECONDS_PER_QUESTION) * 1000;
  if (room.startedAt && now - room.startedAt >= totalMs) {
    finishRoom(room);
    return true;
  }
  let changed = false;
  while (room.status === "running" && room.deadlineAt && now > room.deadlineAt) {
    fillUnanswered(room, room.currentIndex);
    const next = room.currentIndex + 1;
    if (next >= room.questionIds.length) {
      finishRoom(room);
    } else {
      room.currentIndex = next;
      room.deadlineAt = now + LIVE_SECONDS * 1000;
    }
    changed = true;
  }
  return changed;
}
async function maybeRecordEvents(room) {
  if (room.status === "finished" && !room.eventsRecorded) await recordLiveEvents(room);
}
async function authUser(req) {
  const userId = lib.verifyToken(lib.tokenFromReq(req));
  if (!userId) return null;
  return lib.getUserById(userId);
}
function isInt01(v) { return Number.isInteger(v) && v >= 0 && v <= 3; }

module.exports = async (req, res) => {
  const kv = lib.kvConfig();
  if (!kv.configured) {
    return lib.send(res, 503, { error: "সার্ভার স্টোরেজ এখনো চালু হয়নি।", storage: "unconfigured" });
  }
  const user = await authUser(req);
  if (!user) return lib.send(res, 401, { error: "লগইন সেশন শেষ হয়েছে — আবার লগইন করো।" });

  // ---------- GET: room state (poll) / my live events ----------
  if (req.method === "GET") {
    const u = new URL(req.url, "http://localhost");
    const action = u.searchParams.get("action");
    if (action === "mine") {
      const raw = await lib.kvGet(eventsKey(user.id));
      return lib.send(res, 200, { ok: true, events: raw ? JSON.parse(raw) : [] });
    }
    if (action === "room") {
      const roomId = Number(u.searchParams.get("roomId"));
      if (!roomId) return lib.send(res, 400, { error: "রুম আইডি দাও।" });
      let allowed = true;
      try { allowed = await lib.rateLimit("rl:livepoll:" + user.id, 120, 60); } catch (e) { allowed = true; }
      if (!allowed) return lib.send(res, 429, { error: "অনেকবার চেষ্টা করা হয়েছে — একটু পর আবার চেষ্টা করো।" });
      const room = await loadRoom(roomId);
      if (!room) return lib.send(res, 404, { error: "রুম পাওয়া যায়নি।" });
      if (!room.players[user.id]) {
        return lib.send(res, 403, { error: "তুমি এই রুমের খেলোয়াড় নও।" });
      }
      const changed = advanceRoom(room, Date.now());
      if (changed) {
        await maybeRecordEvents(room);
        await saveRoom(room);
      }
      return lib.send(res, 200, { ok: true, room: publicRoom(room) });
    }
    return lib.send(res, 400, { error: "অজানা অ্যাকশন।" });
  }

  // ---------- POST: create / join / start / answer / finish ----------
  if (req.method !== "POST") return lib.send(res, 405, { error: "Method not allowed" });
  let body;
  try {
    body = await lib.readJson(req);
  } catch (e) {
    return lib.send(res, 400, { error: "ভুল ডেটা পাঠানো হয়েছে।" });
  }
  const action = body.action;

  // Writes are rate-limited per IP (a whole classroom can share one IP).
  let allowed = true;
  try { allowed = await lib.rateLimit("rl:live:" + lib.clientIp(req), 120, 60); } catch (e) { allowed = true; }
  if (!allowed) return lib.send(res, 429, { error: "অনেকবার চেষ্টা করা হয়েছে — একটু পর আবার চেষ্টা করো।" });

  if (action === "create") {
    const category = String(body.category || "").trim();
    const questionCount = Number(body.questionCount);
    const questionIds = Array.isArray(body.questionIds) ? body.questionIds : [];
    if (!category || category.length > 60) return lib.send(res, 400, { error: "ক্যাটাগরি ঠিক করে দাও।" });
    if (questionCount !== 30 && questionCount !== 50) {
      return lib.send(res, 400, { error: "প্রশ্ন সংখ্যা ৩০ বা ৫০ হতে হবে।" });
    }
    if (
      questionIds.length !== questionCount ||
      questionIds.some((q) => !Number.isInteger(q) || q <= 0) ||
      new Set(questionIds).size !== questionIds.length
    ) {
      return lib.send(res, 400, { error: "প্রশ্নের তালিকাটা ঠিক নেই — আবার চেষ্টা করো।" });
    }
    let code = "";
    for (let tries = 0; tries < 8; tries++) {
      const c = String(100000 + Math.floor(Math.random() * 900000));
      const clash = await lib.kvGet(roomCodeKey(c));
      if (!clash) { code = c; break; }
    }
    if (!code) return lib.send(res, 400, { error: "রুম কোড তৈরি হয়নি, আবার চেষ্টা করো।" });
    const id = await lib.kvIncr("seq:room");
    const now = new Date().toISOString();
    const room = {
      id,
      code,
      hostId: user.id,
      category,
      questionCount,
      questionIds,
      status: "lobby",
      currentIndex: 0,
      deadlineAt: null,
      totalSeconds: questionCount * TOTAL_SECONDS_PER_QUESTION,
      startedAt: null,
      createdAt: now,
      eventsRecorded: false,
      players: {},
    };
    room.players[user.id] = newPlayer(user);
    await lib.kvPipeline([["SADD", roomPlayersKey(id), String(user.id)]]);
    await saveRoom(room);
    return lib.send(res, 200, { ok: true, room: publicRoom(room) });
  }

  if (action === "join") {
    const code = String(body.code || "").trim();
    if (!/^\d{6}$/.test(code)) return lib.send(res, 400, { error: "৬ সংখ্যার রুম কোডটা দাও।" });
    const id = await lib.kvGet(roomCodeKey(code));
    if (!id) return lib.send(res, 404, { error: "এই কোডে কোনো রুম পাওয়া যায়নি। কোডটা আবার চেক করো।" });
    const room = await loadRoom(Number(id));
    if (!room) return lib.send(res, 404, { error: "এই কোডে কোনো রুম পাওয়া যায়নি। কোডটা আবার চেক করো।" });
    if (room.status === "finished") {
      return lib.send(res, 400, { error: "এই রুমের খেলা শেষ হয়ে গেছে। নতুন রুমে জয়েন করো।" });
    }
    if (room.status === "running") {
      return lib.send(res, 400, { error: "এই রুমের খেলা ইতিমধ্যে শুরু হয়ে গেছে — এখন আর জয়েন করা যাবে না।" });
    }
    if (room.players[user.id]) return lib.send(res, 200, { ok: true, room: publicRoom(room) });
    // Atomic-ish cap: SADD + SCARD in one pipeline; if the count passes
    // 50, remove the player again and reject. (Two joins landing in the
    // exact same instant could both slip through — see BACKEND-SETUP.md.)
    const [, count] = await lib.kvPipeline([
      ["SADD", roomPlayersKey(room.id), String(user.id)],
      ["SCARD", roomPlayersKey(room.id)],
    ]);
    if (Number(count) > MAX_PLAYERS) {
      await lib.kvPipeline([["SREM", roomPlayersKey(room.id), String(user.id)]]);
      return lib.send(res, 409, { error: FULL_MSG });
    }
    room.players[user.id] = newPlayer(user);
    await saveRoom(room);
    return lib.send(res, 200, { ok: true, room: publicRoom(room) });
  }

  if (action === "start" || action === "finish" || action === "answer") {
    const roomId = Number(body.roomId);
    if (!roomId) return lib.send(res, 400, { error: "রুম আইডি দাও।" });
    const room = await loadRoom(roomId);
    if (!room) return lib.send(res, 404, { error: "রুম পাওয়া যায়নি।" });
    if (!room.players[user.id]) {
      return lib.send(res, 403, { error: "তুমি এই রুমের খেলোয়াড় নও।" });
    }
    const now = Date.now();

    if (action === "start") {
      if (room.hostId !== user.id) {
        return lib.send(res, 403, { error: "শুধু হোস্টই খেলা শুরু করতে পারবে।" });
      }
      if (room.status === "running") return lib.send(res, 200, { ok: true, room: publicRoom(room) });
      if (room.status !== "lobby") {
        return lib.send(res, 400, { error: "এই রুমের খেলা শেষ হয়ে গেছে।" });
      }
      room.status = "running";
      room.currentIndex = 0;
      room.deadlineAt = now + LIVE_SECONDS * 1000;
      room.totalSeconds = room.questionIds.length * TOTAL_SECONDS_PER_QUESTION;
      room.startedAt = now;
      await saveRoom(room);
      return lib.send(res, 200, { ok: true, room: publicRoom(room) });
    }

    if (action === "finish") {
      const totalMs = (room.totalSeconds || room.questionIds.length * TOTAL_SECONDS_PER_QUESTION) * 1000;
      const timeUp = room.startedAt && now - room.startedAt >= totalMs;
      if (room.hostId !== user.id && !timeUp) {
        return lib.send(res, 403, { error: "শুধু হোস্টই খেলা শেষ করতে পারবে।" });
      }
      if (room.status !== "running") return lib.send(res, 200, { ok: true, room: publicRoom(room) });
      finishRoom(room);
      await maybeRecordEvents(room);
      await saveRoom(room);
      return lib.send(res, 200, { ok: true, room: publicRoom(room) });
    }

    // answer
    if (room.status !== "running") {
      return lib.send(res, 400, { error: "এই রুমের খেলা এখন চলছে না।" });
    }
    const changed = advanceRoom(room, now);
    if (changed) {
      await maybeRecordEvents(room);
      await saveRoom(room);
      if (room.status !== "running") return lib.send(res, 200, { ok: true, room: publicRoom(room), stale: true });
    }
    const index = Number(body.index);
    const selectedIndex = Number(body.selectedIndex);
    const correctIndex = Number(body.correctIndex);
    if (index !== room.currentIndex || !isInt01(selectedIndex) || !isInt01(correctIndex)) {
      return lib.send(res, 200, { ok: true, room: publicRoom(room), stale: true });
    }
    const p = room.players[user.id];
    if (p.answers[index]) return lib.send(res, 200, { ok: true, room: publicRoom(room) });
    const elapsed = Math.max(
      0,
      Math.min(LIVE_SECONDS * 1000, LIVE_SECONDS * 1000 - (room.deadlineAt - now))
    );
    const correct = selectedIndex === correctIndex ? 1 : 0;
    p.answers[index] = [selectedIndex, correct, elapsed];
    if (correct) p.correct += 1; else p.wrong += 1;
    p.totalTimeMs += elapsed;
    await saveRoom(room);
    return lib.send(res, 200, { ok: true, room: publicRoom(room) });
  }

  return lib.send(res, 400, { error: "অজানা অ্যাকশন।" });
};
