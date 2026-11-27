"use strict";
/* GET /api/leaderboard — public leaderboard feed (no login needed).
   Returns every registered student with quiz aggregates only:
   { ok, users: [{ id, name, studentId, photo, attempts, totalCorrect,
   totalQuestions, bestPercent }] }. No emails, no answers, no password
   data. The page merges this into the leaderboard so every browser shows
   every player's CURRENT profile photo (the single source of truth for
   leaderboard photos) and the Admin Dashboard totals can be checked
   against the same records. Counts are computed live from the stored
   user/attempt records on every call — nothing is hardcoded or cached. */
const lib = require("./_lib");

module.exports = async (req, res) => {
  if (req.method !== "GET") return lib.send(res, 405, { error: "Method not allowed" });
  const kv = lib.kvConfig();
  if (!kv.configured) {
    return lib.send(res, 503, { error: "সার্ভার স্টোরেজ এখনো চালু হয়নি।", storage: "unconfigured" });
  }
  const ids = await lib.listUserIds();
  const users = [];
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
      let totalCorrect = 0;
      let totalQuestions = 0;
      let bestPercent = 0;
      atts.forEach((a) => {
        totalCorrect += a.score || 0;
        totalQuestions += a.total || 0;
        if (a.total) bestPercent = Math.max(bestPercent, Math.round((a.score / a.total) * 100));
      });
      users.push({
        id: u.id,
        name: u.name,
        studentId: u.studentId,
        photo: u.photo || null,
        attempts: atts.length,
        totalCorrect,
        totalQuestions,
        bestPercent,
      });
    });
  }
  users.sort((a, b) => b.totalCorrect - a.totalCorrect || b.bestPercent - a.bestPercent);
  return lib.send(res, 200, { ok: true, users });
};
