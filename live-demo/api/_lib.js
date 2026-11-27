"use strict";
/* SIMT CSE Quiz Platform — shared server helpers.
   Storage: Upstash Redis through its REST API. Vercel's Marketplace
   integration injects UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN into
   the project automatically (old Vercel KV vars KV_REST_API_URL /
   KV_REST_API_TOKEN also work). No npm dependencies: plain Node.js only,
   so these functions deploy with no build step.
   Security: passwords are stored only as scrypt hashes with a per-user salt
   (never plaintext); login sessions are HMAC-signed tokens. */
const crypto = require("crypto");

const ADMIN_EMAIL = "arghapaulnillarghapaul@gmail.com";
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const MAX_ATTEMPTS_PER_USER = 1000;
const MAX_PHOTO_CHARS = 500 * 1024; // 500 KB data URL

function kvConfig() {
  const url = (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "").replace(/\/$/, "");
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "";
  return { url, token, configured: Boolean(url && token) };
}

function authSecret() {
  return process.env.AUTH_SECRET || process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "";
}

/* --- Minimal Upstash REST client (pipeline only, so values never travel in a URL) --- */
async function kvPipeline(commands) {
  const { url, token } = kvConfig();
  const r = await fetch(url + "/pipeline", {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify(commands),
  });
  if (!r.ok) throw new Error("kv http " + r.status);
  const data = await r.json();
  return data.map((d) => (d && "result" in d ? d.result : null));
}
async function kvGet(key) {
  const [v] = await kvPipeline([["GET", key]]);
  return v == null ? null : v;
}
async function kvSet(key, value) {
  await kvPipeline([["SET", key, value]]);
}
async function kvIncr(key) {
  const [v] = await kvPipeline([["INCR", key]]);
  return Number(v);
}

/* --- Passwords: scrypt with a per-user salt. Never store plaintext. --- */
function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(pw, salt, 64).toString("hex");
  return "scrypt:" + salt + ":" + hash;
}
function verifyPassword(pw, stored) {
  try {
    const parts = String(stored || "").split(":");
    if (parts.length !== 3 || parts[0] !== "scrypt") return false;
    const hash = crypto.scryptSync(pw, parts[1], 64);
    return crypto.timingSafeEqual(hash, Buffer.from(parts[2], "hex"));
  } catch (e) {
    return false;
  }
}

/* --- Login tokens: HMAC-signed "userId.expiry.signature", 30 days. --- */
function b64u(s) {
  return Buffer.from(s).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function unb64u(s) {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}
function signToken(userId) {
  const exp = Date.now() + TOKEN_TTL_MS;
  const payload = userId + "." + exp;
  const sig = crypto.createHmac("sha256", authSecret()).update(payload).digest("hex");
  return b64u(payload) + "." + sig;
}
function verifyToken(tok) {
  try {
    const parts = String(tok || "").split(".");
    if (parts.length !== 2) return null;
    const payload = unb64u(parts[0]);
    const fields = payload.split(".");
    const userId = Number(fields[0]);
    const exp = Number(fields[1]);
    if (!userId || !exp || Date.now() > exp) return null;
    const expect = crypto.createHmac("sha256", authSecret()).update(payload).digest("hex");
    if (!crypto.timingSafeEqual(Buffer.from(parts[1]), Buffer.from(expect))) return null;
    return userId;
  } catch (e) {
    return null;
  }
}
function tokenFromReq(req) {
  const h = (req.headers && (req.headers.authorization || req.headers.Authorization)) || "";
  const m = /^Bearer\s+(.+)$/.exec(h);
  return m ? m[1] : null;
}

/* --- HTTP helpers --- */
function send(res, status, obj) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(obj));
}
async function readJson(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  return JSON.parse(raw);
}
function clientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (fwd) return String(fwd).split(",")[0].trim();
  return (req.socket && req.socket.remoteAddress) || "unknown";
}

/* --- Validation (mirrors the client rules in index.html) --- */
function validEmail(e) {
  return typeof e === "string" && e.includes("@") && e.length <= 120;
}
function validStudentId(s) {
  return typeof s === "string" && /^CSE-\d{7}$/.test(s);
}
function isAdminEmail(email) {
  return String(email || "").trim().toLowerCase() === ADMIN_EMAIL;
}

/* --- Simple rate limit: max calls per key per window (seconds). --- */
async function rateLimit(key, max, windowSec) {
  const [count] = await kvPipeline([["INCR", key]]);
  if (count === 1) await kvPipeline([["EXPIRE", key, String(windowSec)]]);
  return count <= max;
}

/* --- User + attempt store --- */
function userKeyByEmail(email) {
  return "user:email:" + email.toLowerCase();
}
function userKeyById(id) {
  return "user:id:" + id;
}
function attemptsKey(userId) {
  return "attempts:" + userId;
}
function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    name: u.name,
    studentId: u.studentId,
    email: u.email,
    isAdmin: !!u.isAdmin,
    photo: u.photo || null,
    createdAt: u.createdAt,
    lastLoginAt: u.lastLoginAt,
  };
}
async function getUserByEmail(email) {
  const raw = await kvGet(userKeyByEmail(email));
  return raw ? JSON.parse(raw) : null;
}
async function getUserById(id) {
  const email = await kvGet(userKeyById(id));
  if (!email) return null;
  return getUserByEmail(email);
}
async function saveUser(u) {
  await kvSet(userKeyByEmail(u.email), JSON.stringify(u));
  await kvSet(userKeyById(u.id), u.email);
}
async function listUserIds() {
  const raw = await kvGet("users:ids");
  return raw ? JSON.parse(raw) : [];
}
async function addUserId(id) {
  const ids = await listUserIds();
  if (!ids.includes(id)) {
    ids.push(id);
    await kvSet("users:ids", JSON.stringify(ids));
  }
}
function attemptKey(a) {
  return a.id + ":" + (a.createdAt || "");
}
function mergeAttempts(existing, incoming) {
  const seen = new Set(existing.map(attemptKey));
  const merged = existing.slice();
  for (const a of incoming || []) {
    if (a && typeof a === "object" && !seen.has(attemptKey(a))) {
      seen.add(attemptKey(a));
      merged.push(a);
    }
  }
  merged.sort((x, y) => String(x.createdAt || "").localeCompare(String(y.createdAt || "")));
  return merged.slice(-MAX_ATTEMPTS_PER_USER);
}
async function getAttempts(userId) {
  const raw = await kvGet(attemptsKey(userId));
  return raw ? JSON.parse(raw) : [];
}
async function saveAttempts(userId, list) {
  await kvSet(attemptsKey(userId), JSON.stringify(list));
}

module.exports = {
  ADMIN_EMAIL,
  TOKEN_TTL_MS,
  MAX_PHOTO_CHARS,
  kvConfig,
  kvGet,
  kvSet,
  kvIncr,
  kvPipeline,
  hashPassword,
  verifyPassword,
  signToken,
  verifyToken,
  tokenFromReq,
  send,
  readJson,
  clientIp,
  validEmail,
  validStudentId,
  isAdminEmail,
  rateLimit,
  publicUser,
  getUserByEmail,
  getUserById,
  saveUser,
  listUserIds,
  addUserId,
  mergeAttempts,
  getAttempts,
  saveAttempts,
};
