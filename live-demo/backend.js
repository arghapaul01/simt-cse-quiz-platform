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

  /* One quiz, one record: a quiz is identified by its local attempt id +
     creation time (the same key the server uses to merge in api/_lib.js).
     A local copy of a quiz the server already has, filed under another
     (stale) user id, is the same quiz — not a second student's quiz. */
  function attemptKey(a) { return a.id + "|" + (a.createdAt || ""); }

  /* Merge a server attempt list into the local DB. The server list is the
     source of truth for that user, and any stale local copy of one of its
     quizzes is dropped, so the leaderboard shows each student once.
     Local quizzes of this user that the server does not have yet (not
     synced) are kept, so a slow sync can never lose a finished quiz. */
  function mergeServerAttempts(srvUserId, srvAttempts) {
    var list = Array.isArray(srvAttempts) ? srvAttempts : [];
    var serverKeys = {};
    list.forEach(function (a) { if (a) serverKeys[attemptKey(a)] = true; });
    var others = [], mine = [];
    DB.attempts.forEach(function (a) {
      if (!a) return;
      if (a.userId === srvUserId) {
        if (!serverKeys[attemptKey(a)]) mine.push(a);
      } else if (!serverKeys[attemptKey(a)]) {
        others.push(a);
      }
    });
    DB.attempts = others.concat(mine, list);
  }

  /* Pull the logged-in user's history from the server and re-render, so
     home stats and history fill in right after login instead of staying
     empty until the next manual reload. */
  function pullServerData() {
    return api("/api/me")
      .then(readJson)
      .then(function (x) {
        if (x.status === 401 || !x.d.ok) { try { localStorage.removeItem(TOKEN_KEY); } catch (e) {} return; }
        mergeServerAttempts(x.d.user.id, x.d.attempts);
        try { saveDB(); } catch (e) {}
        render();
        if (x.d.user.isAdmin) loadAdmin();
      })
      .catch(function () { /* server unreachable — keep local data */ });
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
        applyServerUser(x.d.user, tok, { skipTokenSave: true, skipPull: true });
        mergeServerAttempts(x.d.user.id, x.d.attempts);
        try { saveDB(); } catch (e) {}
        render();
        if (x.d.user.isAdmin) loadAdmin();
      })
      .catch(function () { /* server unreachable — keep local data */ });
  }

  /* --- Server/local id collisions ---------------------------------------
     Local accounts get id = DB.nextUserId++ (starting at 1) and server
     accounts get id = seq:user (also starting at 1), so a server user
     merged into this browser's DB can share its numeric id with an older
     local account. `me()` uses Array.find, so the older record would shadow
     the real logged-in user everywhere (profile, history, leaderboard) —
     e.g. a stale local "Test User / CSE-2324001" record hiding the server
     "Test User / CSE-2324999" account. Keep every local id unique: move
     any record holding a server id out of the way before the merge. This
     also repairs a duplicate already saved in this browser's localStorage.
     ------------------------------------------------------------------- */
  function reassignLocalUserId(user, newId) {
    var oldId = user.id;
    if (oldId === newId) return;
    user.id = newId;
    DB.attempts.forEach(function (a) { if (a.userId === oldId) a.userId = newId; });
    DB.liveRooms.forEach(function (r) {
      if (r.hostId === oldId) r.hostId = newId;
      if (r.players && Object.prototype.hasOwnProperty.call(r.players, oldId)) {
        var p = r.players[oldId];
        delete r.players[oldId];
        p.userId = newId;
        r.players[newId] = p;
      }
    });
  }

  /* Make sure the local record for a server user ends up with the server
     id, and that no OTHER local record holds that id. Returns the local
     record for the server user, or null if there is none yet. */
  function ensureServerUserId(srvUser) {
    var local = DB.users.find(function (u) { return u.email === srvUser.email; });
    // Never let a later local sign-up reuse a server id.
    if (DB.nextUserId <= srvUser.id) DB.nextUserId = srvUser.id + 1;
    // A stale record holding this server id would shadow the real user in
    // me() lookups (Array.find returns the first match) — move it away.
    DB.users.slice().forEach(function (u) {
      if (u !== local && u.id === srvUser.id) reassignLocalUserId(u, DB.nextUserId++);
    });
    if (local && local.id !== srvUser.id) reassignLocalUserId(local, srvUser.id);
    return local;
  }

  /* Merge a server user into the local DB (keeps the local password hash so
     offline login still works) and make it the current session. */
  function applyServerUser(srvUser, tok, opts) {
    opts = opts || {};
    if (!opts.skipTokenSave && tok) {
      try { localStorage.setItem(TOKEN_KEY, tok); } catch (e) {}
    }
    var local = ensureServerUserId(srvUser);
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
    sessionUserId = srvUser.id;
    try { saveSession(); } catch (e) {}
    view = srvUser.isAdmin ? "admin" : "home";
    try { saveDB(); } catch (e) {}
    render();
    // Fetch the server history now: without this, stats/history stay empty
    // until the next page reload (restoreSession is the only other pull).
    if (!opts.skipPull) pullServerData();
    pullLiveEvents();
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
    api("/api/admin")
      .then(readJson)
      .then(function (x) {
        if (!x.d.ok) return;
        server.adminLoaded = true;
        x.d.users.forEach(function (su) {
          var local = ensureServerUserId(su);
          if (local) {
            local.name = su.name; local.studentId = su.studentId; local.isAdmin = su.isAdmin;
            local.photo = su.photo; local.lastLoginAt = su.lastLoginAt;
          } else {
            DB.users.push({
              id: su.id, name: su.name, studentId: su.studentId, email: su.email,
              passwordHash: "", isAdmin: su.isAdmin, photo: su.photo,
              createdAt: su.createdAt, lastLoginAt: su.lastLoginAt,
            });
          }
          mergeServerAttempts(su.id, su.attempts);
        });
        try { saveDB(); } catch (e) {}
        if (view === "admin") render();
      })
      .catch(function () {});
  }

  /* ---------- server-backed Live Group Quiz rooms ----------
     Rooms live in Redis (/api/live), so players on different phones can
     join the same room by code. The page keeps a local mirror of any
     server room in DB.liveRooms (id = SRV_ROOM_ID_OFFSET + server id),
     so the lobby, live leaderboard, history and wrong-answer explanations
     render exactly as they did for local rooms. When the server is off
     or unreachable, index.html falls back to local-only rooms. */
  var SRV_ROOM_ID_OFFSET = 1000000;
  var LIVE_POLL_MS = 2000;
  var lastLivePoll = 0;

  function mergeRoomUser(su) {
    if (!su || !su.id) return;
    if (!su.email) {
      var byId = DB.users.find(function (x) { return x.id === su.id; });
      if (byId) {
        byId.name = su.name; byId.studentId = su.studentId;
        if (su.photo) byId.photo = su.photo;
      } else {
        DB.users.push({ id: su.id, name: su.name, studentId: su.studentId, email: "", passwordHash: "", isAdmin: false, photo: su.photo || null, createdAt: new Date().toISOString(), lastLoginAt: null });
      }
      return;
    }
    var local = ensureServerUserId(su);
    if (local) {
      local.name = su.name; local.studentId = su.studentId;
      if (su.photo) local.photo = su.photo;
    } else {
      DB.users.push({ id: su.id, name: su.name, studentId: su.studentId, email: su.email, passwordHash: "", isAdmin: false, photo: su.photo || null, createdAt: new Date().toISOString(), lastLoginAt: null });
    }
  }

  /* Convert a server room into the local mirror shape (compact server
     answers [sel, correct, timeMs] become the {questionId, selectedIndex,
     correct, timeMs} objects the page renders) and store it in
     DB.liveRooms. Returns the local mirror id. */
  function mirrorServerRoom(srv) {
    if (!srv || !srv.id) return null;
    var localId = SRV_ROOM_ID_OFFSET + srv.id;
    var room = {
      id: localId, serverId: srv.id, code: srv.code, hostId: srv.hostId,
      category: srv.category, questionIds: (srv.questionIds || []).slice(),
      status: srv.status, currentIndex: srv.currentIndex,
      deadlineAt: srv.deadlineAt, totalSeconds: srv.totalSeconds,
      startedAt: srv.startedAt, createdAt: srv.createdAt,
      players: {},
    };
    if (srv.attendees) room.attendees = srv.attendees;
    if (srv.rank) room.rank = srv.rank;
    Object.keys(srv.players || {}).forEach(function (uid) {
      var sp = srv.players[uid];
      var answers = [];
      (sp.answers || []).forEach(function (a, idx) {
        if (a) answers[idx] = { questionId: srv.questionIds[idx], selectedIndex: a[0], correct: !!a[1], timeMs: a[2] };
      });
      room.players[sp.userId] = { userId: sp.userId, answers: answers, correct: sp.correct, wrong: sp.wrong, totalTimeMs: sp.totalTimeMs };
      mergeRoomUser({ id: sp.userId, name: sp.name, studentId: sp.studentId, email: sp.email || "", photo: sp.photo || null });
    });
    var i = DB.liveRooms.findIndex(function (r) { return r.id === localId; });
    if (i >= 0) DB.liveRooms[i] = room; else DB.liveRooms.push(room);
    try { saveDB(); } catch (e) {}
    return localId;
  }
  server.mirrorServerRoom = mirrorServerRoom;

  function liveCreate(category, qcount, questionIds) {
    return api("/api/live", { method: "POST", body: { action: "create", category: category, questionCount: qcount, questionIds: questionIds } }).then(readJson).then(function (x) { return x.d; });
  }
  function liveJoin(code) {
    return api("/api/live", { method: "POST", body: { action: "join", code: code } }).then(readJson).then(function (x) { return x.d; });
  }
  function liveStart(serverId) {
    return api("/api/live", { method: "POST", body: { action: "start", roomId: serverId } }).then(readJson).then(function (x) { return x.d; });
  }
  function liveAnswer(serverId, index, selectedIndex, correctIndex) {
    return api("/api/live", { method: "POST", body: { action: "answer", roomId: serverId, index: index, selectedIndex: selectedIndex, correctIndex: correctIndex } }).then(readJson).then(function (x) { return x.d; });
  }
  function liveFinish(serverId) {
    return api("/api/live", { method: "POST", body: { action: "finish", roomId: serverId } }).then(readJson).then(function (x) { return x.d; });
  }
  server.liveCreate = liveCreate;
  server.liveJoin = liveJoin;
  server.liveStart = liveStart;
  server.liveAnswer = liveAnswer;
  server.liveFinish = liveFinish;

  /* Poll the current server room (every LIVE_POLL_MS) while on the live
     view, so joins, start, questions and the leaderboard stay in sync
     across devices. */
  function liveTick() {
    if (!server.enabled || view !== "live" || !liveRoomId) return;
    var room = null;
    try { room = getRoom(); } catch (e) { room = null; }
    if (!room || !room.serverId) return;
    var now = Date.now();
    if (now - lastLivePoll < LIVE_POLL_MS) return;
    lastLivePoll = now;
    api("/api/live?action=room&roomId=" + room.serverId)
      .then(readJson)
      .then(function (x) { if (x.d && x.d.ok && x.d.room) mirrorServerRoom(x.d.room); })
      .catch(function () { /* unreachable — keep the last known state */ });
  }
  server.liveTick = liveTick;

  /* Pull finished live-event records from the server so history shows
     live games on any device, not just the one the game was played on. */
  function pullLiveEvents() {
    if (!server.enabled || !token()) return Promise.resolve();
    return api("/api/live?action=mine")
      .then(readJson)
      .then(function (x) {
        if (!x.d || !x.d.ok || !Array.isArray(x.d.events)) return;
        var changed = false;
        x.d.events.forEach(function (ev) {
          var localId = SRV_ROOM_ID_OFFSET + ev.serverId;
          if (DB.liveRooms.some(function (r) { return r.id === localId; })) return;
          mirrorServerRoom(ev);
          changed = true;
        });
        if (changed) { try { saveDB(); } catch (e) {} if (view !== "live") render(); }
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
