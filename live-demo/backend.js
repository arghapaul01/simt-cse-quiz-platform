"use strict";
/* SIMT CSE Quiz Platform — server sync layer (free Vercel backend).
   Loaded after the main page script. It talks to /api/* (Vercel serverless
   functions + Upstash Redis) and makes accounts, photos and quiz history
   survive logout and work from any device.
   - If the server storage is not connected yet (/api/health says
     "unconfigured"), nothing changes: the page keeps working exactly as
     before from this browser's localStorage.
   - When the server IS live: sign-up/login go through the server, every
     save syncs the current user + their attempts, and login restores them.
   This file only uses the page's own globals (DB, sessionUserId, view,
   authMode, authError, authDraft, render, renderAuth, saveDB, saveSession,
   me) — it does not change the design or the question bank. */
(function () {
  var TOKEN_KEY = "simt-quiz-server-token-v1";
  var server = { ready: false, enabled: false, syncTimer: null, adminLoaded: false };
  window.__simtServer = server;

  function token() {
    try { return localStorage.getItem(TOKEN_KEY) || ""; } catch (e) { return ""; }
  }
  function api(path, opts) {
    opts = opts || {};
    var headers = { "Content-Type": "application/json" };
    var tok = token();
    if (tok) headers.Authorization = "Bearer " + tok;
    return fetch(path, {
      method: opts.method || "GET",
      headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      keepalive: !!opts.keepalive,
    });
  }
  function readJson(r) {
    return r.json().then(function (d) { return { status: r.status, d: d }; });
  }

  /* ---------- session restore: push local data first, then pull server data ---------- */
  function restoreSession() {
    var tok = token();
    if (!tok) return;
    var u = null;
    try { u = me(); } catch (e) { u = null; }
    var localAttempts = [];
    try {
      localAttempts = u ? DB.attempts.filter(function (a) { return a.userId === u.id; }) : [];
    } catch (e) { localAttempts = []; }
    var push = u
      ? api("/api/sync", { method: "POST", body: { user: { name: u.name, photo: u.photo }, attempts: localAttempts } }).catch(function () {})
      : Promise.resolve();
    push.then(function () { return api("/api/me"); })
      .then(readJson)
      .then(function (x) {
        if (x.status === 401 || !x.d.ok) { try { localStorage.removeItem(TOKEN_KEY); } catch (e) {} return; }
        applyServerUser(x.d.user, tok, { skipTokenSave: true });
        var srvAttempts = Array.isArray(x.d.attempts) ? x.d.attempts : [];
        DB.attempts = DB.attempts.filter(function (a) { return a.userId !== x.d.user.id; }).concat(srvAttempts);
        try { saveDB(); } catch (e) {}
        render();
        if (x.d.user.isAdmin) loadAdmin();
      })
      .catch(function () { /* server unreachable — keep local data */ });
  }

  /* Merge a server user into the local DB (keeps the local password hash so
     offline login still works) and make it the current session. */
  function applyServerUser(srvUser, tok, opts) {
    opts = opts || {};
    if (!opts.skipTokenSave && tok) {
      try { localStorage.setItem(TOKEN_KEY, tok); } catch (e) {}
    }
    var local = DB.users.find(function (u) { return u.email === srvUser.email; });
    if (local) {
      local.name = srvUser.name;
      local.studentId = srvUser.studentId;
      local.isAdmin = srvUser.isAdmin;
      local.photo = srvUser.photo;
      local.lastLoginAt = srvUser.lastLoginAt;
      // Keep the browser-side hash so the same email+password still logs
      // in from localStorage if the server is ever unreachable.
      if (opts.localPasswordHash) local.passwordHash = opts.localPasswordHash;
    } else {
      DB.users.push({
        id: srvUser.id, name: srvUser.name, studentId: srvUser.studentId, email: srvUser.email,
        passwordHash: opts.localPasswordHash || "", isAdmin: srvUser.isAdmin, photo: srvUser.photo,
        createdAt: srvUser.createdAt, lastLoginAt: srvUser.lastLoginAt,
      });
    }
    // Never let a later local sign-up reuse a server id.
    if (DB.nextUserId <= srvUser.id) DB.nextUserId = srvUser.id + 1;
    sessionUserId = srvUser.id;
    try { saveSession(); } catch (e) {}
    view = srvUser.isAdmin ? "admin" : "home";
    try { saveDB(); } catch (e) {}
    render();
    if (srvUser.isAdmin) loadAdmin();
    else queueSync();
  }

  /* ---------- sign-up / login through the server (called from submitAuth) ---------- */
  function fail(msg) {
    authError = msg;
    renderAuth();
    return true;
  }
  function handleAuth(fd, mode) {
    if (!server.enabled) return false; // server off: local path runs as before
    var email = String(fd.get("email") || "").trim().toLowerCase();
    var password = String(fd.get("password") || "");
    if (mode === "signup") {
      var name = String(fd.get("name") || "").trim();
      var studentId = String(fd.get("studentId") || "").trim().toUpperCase();
      if (name.length < 2) return fail("তোমার পুরো নামটা লেখো।");
      if (!/^CSE-\d{7}$/.test(studentId)) return fail("Student ID সঠিক ফরম্যাটে দাও: CSE-2324001 — CSE- দিয়ে শুরু করে মোট ৭টি সংখ্যা।");
      if (!email.includes("@")) return fail("সঠিক ইমেইল ঠিকানা দাও।");
      if (password.length < 4) return fail("পাসওয়ার্ড অন্তত ৪ অক্ষরের হতে হবে।");
      authDraft = { name: "", studentId: "", email: "", password: "" };
      api("/api/auth", { method: "POST", body: { action: "signup", name: name, studentId: studentId, email: email, password: password } })
        .then(readJson)
        .then(function (x) {
          if (!x.d.ok) return fail(x.d.error || "সাইন আপ হয়নি, আবার চেষ্টা করো।");
          applyServerUser(x.d.user, x.d.token, { localPasswordHash: hashPassword(password) });
        })
        .catch(function () { fail("সার্ভারে যোগাযোগ হচ্ছে না — নেট চেক করে আবার চেষ্টা করো।"); });
      return true;
    }
    if (!email.includes("@")) return fail("সঠিক ইমেইল ঠিকানা দাও।");
    if (password.length < 4) return fail("পাসওয়ার্ড অন্তত ৪ অক্ষরের হতে হবে।");
    authDraft = { name: "", studentId: "", email: "", password: "" };
    api("/api/auth", { method: "POST", body: { action: "login", email: email, password: password } })
      .then(readJson)
      .then(function (x) {
        if (!x.d.ok) return fail(x.d.error || "লগইন হয়নি, আবার চেষ্টা করো।");
        if (mode === "admin" && !x.d.user.isAdmin) {
          return fail("এই অ্যাকাউন্টে অ্যাডমিন অ্যাক্সেস নেই। শুধুমাত্র অ্যাডমিনের নিজের অ্যাকাউন্ট দিয়েই Admin Dashboard খোলা যাবে।");
        }
        applyServerUser(x.d.user, x.d.token, { localPasswordHash: hashPassword(password) });
      })
      .catch(function () { fail("সার্ভারে যোগাযোগ হচ্ছে না — নেট চেক করে আবার চেষ্টা করো।"); });
    return true;
  }
  server.handleAuth = handleAuth;

  /* ---------- sync current user + attempts to the server ---------- */
  function downscalePhoto(dataUrl) {
    if (!dataUrl || dataUrl.length < 60000) return Promise.resolve(dataUrl);
    return new Promise(function (resolve) {
      try {
        var img = new Image();
        img.onload = function () {
          try {
            var max = 256;
            var scale = Math.min(1, max / Math.max(img.width, img.height));
            var c = document.createElement("canvas");
            c.width = Math.max(1, Math.round(img.width * scale));
            c.height = Math.max(1, Math.round(img.height * scale));
            c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
            resolve(c.toDataURL("image/jpeg", 0.82));
          } catch (e) { resolve(dataUrl); }
        };
        img.onerror = function () { resolve(dataUrl); };
        img.src = dataUrl;
      } catch (e) { resolve(dataUrl); }
    });
  }
  function syncNow(opts) {
    opts = opts || {};
    if (!server.enabled) return Promise.resolve();
    var tok = token();
    var u = null;
    try { u = me(); } catch (e) { u = null; }
    if (!tok || !u) return Promise.resolve();
    var attempts = [];
    try { attempts = DB.attempts.filter(function (a) { return a.userId === u.id; }); } catch (e) {}
    var send = function (photo) {
      return api("/api/sync", {
        method: "POST",
        body: { user: { name: u.name, photo: photo }, attempts: attempts },
        keepalive: !!opts.keepalive,
      })
        .then(readJson)
        .then(function (x) {
          if (x.status === 401) { try { localStorage.removeItem(TOKEN_KEY); } catch (e) {} }
        })
        .catch(function () {});
    };
    if (opts.keepalive) return send(u.photo); // page is closing: no time to resize
    return downscalePhoto(u.photo).then(send);
  }
  function queueSync() {
    if (!server.enabled || !token()) return;
    clearTimeout(server.syncTimer);
    server.syncTimer = setTimeout(function () { syncNow(); }, 800);
  }
  server.queueSync = queueSync;

  /* ---------- admin overview: all students + their history ---------- */
  function loadAdmin() {
    if (server.adminLoaded || !server.enabled || !token()) return;
    api("/api/admin/overview")
      .then(readJson)
      .then(function (x) {
        if (!x.d.ok) return;
        server.adminLoaded = true;
        x.d.users.forEach(function (su) {
          var local = DB.users.find(function (u) { return u.email === su.email; });
          if (local) {
            local.name = su.name; local.studentId = su.studentId; local.isAdmin = su.isAdmin;
            local.photo = su.photo; local.lastLoginAt = su.lastLoginAt;
            if (DB.nextUserId <= su.id) DB.nextUserId = su.id + 1;
          } else {
            DB.users.push({
              id: su.id, name: su.name, studentId: su.studentId, email: su.email,
              passwordHash: "", isAdmin: su.isAdmin, photo: su.photo,
              createdAt: su.createdAt, lastLoginAt: su.lastLoginAt,
            });
          }
          DB.attempts = DB.attempts.filter(function (a) { return a.userId !== su.id; })
            .concat(Array.isArray(su.attempts) ? su.attempts : []);
        });
        try { saveDB(); } catch (e) {}
        if (view === "admin") render();
      })
      .catch(function () {});
  }

  /* ---------- logout + page-hide: sync first, then clear the token ---------- */
  var appEl = document.getElementById("app");
  if (appEl) {
    appEl.addEventListener("click", function (e) {
      if (e.target && e.target.closest && e.target.closest("#hdr-logout")) {
        if (server.enabled) syncNow({ keepalive: true });
        try { localStorage.removeItem(TOKEN_KEY); } catch (err) {}
        server.adminLoaded = false;
      }
    }, true);
  }
  window.addEventListener("pagehide", function () { syncNow({ keepalive: true }); });
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) syncNow({ keepalive: true });
  });

  /* ---------- start: ask the server if storage is live ---------- */
  fetch("/api/health")
    .then(function (r) { return r.json(); })
    .then(function (h) {
      server.ready = true;
      server.enabled = !!(h && h.storage && h.storage !== "unconfigured");
      if (server.enabled) restoreSession();
    })
    .catch(function () { server.ready = true; server.enabled = false; });
})();
