"use strict";
/* GET /api/health — tells the frontend whether server storage is live.
   Never fails: when no database is connected yet it reports
   storage:"unconfigured" and the page keeps working from the browser. */
const lib = require("./_lib");

module.exports = async (req, res) => {
  const kv = lib.kvConfig();
  lib.send(res, 200, {
    ok: true,
    storage: kv.configured ? "upstash-redis" : "unconfigured",
    serverTime: new Date().toISOString(),
  });
};
