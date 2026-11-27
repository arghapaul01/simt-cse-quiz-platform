"use strict";
/* POST /api/sync — push the browser's local user + quiz attempts to the
   server (Bearer token required). Called after every save in the page, so a
   finished quiz, a new photo or a name change reaches the server within
   seconds and survives logout or a device change.
   Body: { user: { name?, photo? }, attempts: [...] }
   The server never accepts password, email or id from the client — only the
   name/photo of the already-logged-in user. Attempts merge by id+date, so
   two devices never overwrite each other. */
const lib = require("./_lib");

module.exports = async (req, res) => {
  if (req.method !== "POST") return lib.send(res, 405, { error: "Method not allowed" });
  const kv = lib.kvConfig();
  if (!kv.configured) {
    return lib.send(res, 503, { error: "সার্ভার স্টোরেজ এখনো চালু হয়নি।", storage: "unconfigured" });
  }
  const userId = lib.verifyToken(lib.tokenFromReq(req));
  if (!userId) return lib.send(res, 401, { error: "লগইন সেশন শেষ হয়েছে — আবার লগইন করো।" });
  let body;
  try {
    body = await lib.readJson(req);
  } catch (e) {
    return lib.send(res, 400, { error: "ভুল ডেটা পাঠানো হয়েছে।" });
  }
  const user = await lib.getUserById(userId);
  if (!user) return lib.send(res, 401, { error: "অ্যাকাউন্ট পাওয়া যায়নি — আবার লগইন করো।" });

  if (body.user && typeof body.user === "object") {
    if (typeof body.user.name === "string" && body.user.name.trim().length >= 2) {
      user.name = body.user.name.trim();
    }
    if (body.user.photo !== undefined) {
      const photo = String(body.user.photo || "");
      if (photo && /^data:image\/(png|jpeg|jpg);base64,/.test(photo) && photo.length <= lib.MAX_PHOTO_CHARS) {
        user.photo = photo;
      } else if (!photo) {
        user.photo = null;
      }
      // An oversized/invalid photo is ignored; the rest still syncs.
    }
  }
  await lib.saveUser(user);

  let attempts = await lib.getAttempts(userId);
  if (Array.isArray(body.attempts)) {
    const mine = body.attempts.filter((a) => a && a.userId === userId);
    attempts = lib.mergeAttempts(attempts, mine);
    await lib.saveAttempts(userId, attempts);
  }
  return lib.send(res, 200, { ok: true, user: lib.publicUser(user), attemptsCount: attempts.length });
};
