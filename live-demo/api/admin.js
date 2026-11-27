"use strict";
/* GET /api/admin/overview — admin-only (Bearer token, admin email required).
   Returns { totalUsers, totalAttempts, users: [{ ...publicUser, attempts }] }
   so the Admin Dashboard shows how many students signed up and each
   student's full quiz history. Password hashes are never sent. */
const lib = require("./_lib");

module.exports = async (req, res) => {
  if (req.method !== "GET") return lib.send(res, 405, { error: "Method not allowed" });
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
