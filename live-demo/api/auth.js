"use strict";
/* POST /api/auth — sign-up and login.
   Body: { action: "signup" | "login", name?, studentId?, email, password }
   Passwords are stored only as scrypt hashes (see _lib.js), never plaintext.
   Returns { ok, token, user } on success, { error } in Bangla on failure. */
const lib = require("./_lib");

module.exports = async (req, res) => {
  if (req.method !== "POST") return lib.send(res, 405, { error: "Method not allowed" });
  const kv = lib.kvConfig();
  if (!kv.configured) {
    return lib.send(res, 503, {
      error: "সার্ভার স্টোরেজ এখনো চালু হয়নি — অ্যাডমিনকে ডেটাবেস চালু করতে হবে।",
      storage: "unconfigured",
    });
  }
  let body;
  try {
    body = await lib.readJson(req);
  } catch (e) {
    return lib.send(res, 400, { error: "ভুল ডেটা পাঠানো হয়েছে।" });
  }
  const action = body.action;
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");

  // 20 auth tries per IP per 10 minutes (brute-force protection).
  let allowed = true;
  try {
    allowed = await lib.rateLimit("rl:auth:" + lib.clientIp(req), 20, 600);
  } catch (e) {
    allowed = true; // if the limit check itself fails, don't block login
  }
  if (!allowed) {
    return lib.send(res, 429, { error: "অনেকবার চেষ্টা করা হয়েছে — ১০ মিনিট পর আবার চেষ্টা করো।" });
  }

  if (action === "signup") {
    const name = String(body.name || "").trim();
    const studentId = String(body.studentId || "").trim().toUpperCase();
    if (!name) return lib.send(res, 400, { error: "তোমার নামটা লেখো।" });
    // Any Student ID is accepted — any department (CSE, EEE, ...),
    // any length. CSE-2324001 is only the placeholder example on the form.
    if (!studentId) return lib.send(res, 400, { error: "Student ID লেখো।" });
    if (!email) return lib.send(res, 400, { error: "ইমেইল ঠিকানা লেখো।" });
    if (!password) return lib.send(res, 400, { error: "পাসওয়ার্ড লেখো।" });
    const existing = await lib.getUserByEmail(email);
    if (existing) return lib.send(res, 409, { error: "এই ইমেইল দিয়ে আগেই অ্যাকাউন্ট আছে — Login করো।" });
    const id = await lib.kvIncr("seq:user");
    const now = new Date().toISOString();
    const user = {
      id,
      name,
      email,
      studentId,
      passwordHash: lib.hashPassword(password),
      isAdmin: lib.isAdminEmail(email),
      photo: null,
      createdAt: now,
      lastLoginAt: now,
    };
    await lib.saveUser(user);
    await lib.addUserId(id);
    return lib.send(res, 200, { ok: true, token: lib.signToken(id), user: lib.publicUser(user) });
  }

  if (action === "login") {
    if (!email) return lib.send(res, 400, { error: "ইমেইল ঠিকানা লেখো।" });
    if (!password) return lib.send(res, 400, { error: "পাসওয়ার্ড লেখো।" });
    const user = await lib.getUserByEmail(email);
    if (!user || !lib.verifyPassword(password, user.passwordHash)) {
      return lib.send(res, 401, { error: "ইমেইল বা পাসওয়ার্ড মিলছে না। আবার চেষ্টা করো।" });
    }
    user.isAdmin = lib.isAdminEmail(user.email);
    user.lastLoginAt = new Date().toISOString();
    await lib.saveUser(user);
    return lib.send(res, 200, { ok: true, token: lib.signToken(user.id), user: lib.publicUser(user) });
  }

  return lib.send(res, 400, { error: "অজানা অ্যাকশন।" });
};
