"use strict";
/* /api/me — the logged-in student's own data (Bearer token required).
   GET: { user, attempts } — profile + full quiz history, restored on login
        from any device.
   PUT: update name / profile photo. Body: { name?, photo? } where photo is
        a small data:image/png|jpeg URL (max 500 KB). */
const lib = require("./_lib");

module.exports = async (req, res) => {
  const kv = lib.kvConfig();
  if (!kv.configured) {
    return lib.send(res, 503, { error: "সার্ভার স্টোরেজ এখনো চালু হয়নি।", storage: "unconfigured" });
  }
  const userId = lib.verifyToken(lib.tokenFromReq(req));
  if (!userId) return lib.send(res, 401, { error: "লগইন সেশন শেষ হয়েছে — আবার লগইন করো।" });
  const user = await lib.getUserById(userId);
  if (!user) return lib.send(res, 401, { error: "অ্যাকাউন্ট পাওয়া যায়নি — আবার লগইন করো।" });

  if (req.method === "GET") {
    const attempts = await lib.getAttempts(userId);
    return lib.send(res, 200, { ok: true, user: lib.publicUser(user), attempts });
  }

  if (req.method === "PUT") {
    let body;
    try {
      body = await lib.readJson(req);
    } catch (e) {
      return lib.send(res, 400, { error: "ভুল ডেটা পাঠানো হয়েছে।" });
    }
    if (typeof body.name === "string") {
      const name = body.name.trim();
      if (name.length < 2) return lib.send(res, 400, { error: "তোমার পুরো নামটা লেখো।" });
      user.name = name;
    }
    if (body.photo !== undefined) {
      const photo = String(body.photo || "");
      if (photo && (!/^data:image\/(png|jpeg|jpg);base64,/.test(photo) || photo.length > lib.MAX_PHOTO_CHARS)) {
        return lib.send(res, 400, { error: "ছবিটা বেশি বড় — ছোট ছবি দাও।" });
      }
      user.photo = photo || null;
    }
    await lib.saveUser(user);
    return lib.send(res, 200, { ok: true, user: lib.publicUser(user) });
  }

  return lib.send(res, 405, { error: "Method not allowed" });
};
