"use strict";
/* /api/admin — admin-only (Bearer token, admin email required).
   GET: { totalUsers, totalAttempts, users: [{ ...publicUser, attempts }] }
   so the Admin Dashboard shows how many students signed up and each
   student's full quiz history. Password hashes are never sent.
   POST { action: "reset-password", userId, newPassword }: the admin sets
   a new temporary password for a locked-out student. The student's
   CURRENT password is never shown and cannot be recovered — passwords
   are stored only as one-way scrypt hashes. The new password itself is
   never returned or stored in plaintext; the admin typed it and tells
   it to the student directly.
   POST { action: "delete-user", userId }: admin only — permanently
   deletes that student's account and all their quiz attempts from the
   server (user:email, user:id, attempts, users:ids). The admin's own
   account cannot be deleted this way. Deletion cannot be undone.
   POST { action: "delete-room", roomId }: admin only — deletes a live
   room (room record, code lookup, players set) before its 7-day expiry.
   The lastroomset:* keys are left alone: the next room must still draw
   a set different from the previous room's set. */
const lib = require("./_lib");

module.exports = async (req, res) => {
  if (req.method !== "GET" && req.method !== "POST") return lib.send(res, 405, { error: "Method not allowed" });
  const kv = lib.kvConfig();
  if (!kv.configured) {
    return lib.send(res, 503, { error: "সার্ভার স্টোরেজ এখনো চালু হয়নি।", storage: "unconfigured" });
  }
  const userId = lib.verifyToken(lib.tokenFromReq(req));
  if (!userId) return lib.send(res, 401, { error: "লগইন সেশন শেষ হয়েছে — আবার লগইন করো।" });
  const me = await lib.getUserById(userId);
  if (!me || !lib.isAdminEmail(me.email)) {
    return lib.send(res, 403, { error: "এই অ্যাকাউন্টে অ্যাডমিন অ্যাক্সেস নেই।" });
  }

  if (req.method === "POST") {
    let body;
    try { body = await lib.readJson(req); } catch (e) { return lib.send(res, 400, { error: "ভুল ডেটা পাঠানো হয়েছে।" }); }
    const action = body.action;
    if (action !== "reset-password" && action !== "delete-user" && action !== "delete-room") {
      return lib.send(res, 400, { error: "অজানা অ্যাকশন।" });
    }
    // 10 admin writes per 10 minutes (separate windows for resets vs deletes).
    const limitKey = (action === "reset-password" ? "rl:admin-reset:" : "rl:admin-delete:") + userId;
    let allowed = true;
    try { allowed = await lib.rateLimit(limitKey, 10, 600); } catch (e) { allowed = true; }
    if (!allowed) return lib.send(res, 429, { error: "অনেকবার চেষ্টা করা হয়েছে — ১০ মিনিট পর আবার চেষ্টা করো।" });

    if (action === "reset-password") {
      const targetId = Number(body.userId);
      const newPassword = String(body.newPassword || "").trim();
      if (!targetId || !newPassword) return lib.send(res, 400, { error: "শিক্ষার্থী আর নতুন পাসওয়ার্ড দুটোই দরকার।" });
      const target = await lib.getUserById(targetId);
      if (!target) return lib.send(res, 404, { error: "শিক্ষার্থী পাওয়া যায়নি।" });
      target.passwordHash = lib.hashPassword(newPassword);
      await lib.saveUser(target);
      return lib.send(res, 200, { ok: true, user: lib.publicUser(target) });
    }

    if (action === "delete-user") {
      const targetId = Number(body.userId);
      if (!targetId) return lib.send(res, 400, { error: "শিক্ষার্থী বাছাই করো।" });
      if (targetId === userId) return lib.send(res, 400, { error: "নিজের অ্যাডমিন অ্যাকাউন্ট ডিলিট করা যাবে না।" });
      const target = await lib.getUserById(targetId);
      if (!target) return lib.send(res, 404, { error: "শিক্ষার্থী পাওয়া যায়নি।" });
      const emailKey = "user:email:" + String(target.email || "").toLowerCase();
      await lib.kvPipeline([["DEL", emailKey, "user:id:" + targetId, "attempts:" + targetId]]);
      const ids = await lib.listUserIds();
      await lib.kvSet("users:ids", JSON.stringify(ids.filter((x) => x !== targetId)));
      return lib.send(res, 200, { ok: true, deleted: lib.publicUser(target) });
    }

    // delete-room
    const roomId = Number(body.roomId);
    if (!roomId) return lib.send(res, 400, { error: "রুম বাছাই করো।" });
    const roomRaw = await lib.kvGet("room:" + roomId);
    if (!roomRaw) return lib.send(res, 404, { error: "রুম পাওয়া যায়নি।" });
    let roomCode = null;
    try { roomCode = JSON.parse(roomRaw).code; } catch (e) {}
    const roomKeys = ["room:" + roomId, "room:" + roomId + ":players"];
    if (roomCode) roomKeys.push("room:code:" + roomCode);
    await lib.kvPipeline([["DEL"].concat(roomKeys)]);
    return lib.send(res, 200, { ok: true, deleted: { id: roomId, code: roomCode } });
  }

  const ids = await lib.listUserIds();
  const users = [];
  let totalAttempts = 0;
  for (let i = 0; i < ids.length; i += 25) {
    const batch = ids.slice(i, i + 25);
    const emailRows = await lib.kvPipeline(batch.map((id) => ["GET", "user:id:" + id]));
    const userRows = await lib.kvPipeline(
      emailRows.map((email) => ["GET", email ? "user:email:" + email : "user:email:__none__"])
    );
    const attRows = await lib.kvPipeline(batch.map((id) => ["GET", "attempts:" + id]));
    batch.forEach((id, j) => {
      const u = userRows[j] ? JSON.parse(userRows[j]) : null;
      if (!u) return;
      const atts = attRows[j] ? JSON.parse(attRows[j]) : [];
      totalAttempts += atts.length;
      users.push({ ...lib.publicUser(u), attempts: atts });
    });
  }
  users.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  return lib.send(res, 200, { ok: true, totalUsers: users.length, totalAttempts, users });
};
