/* =====================================================================
   MangaFlow - accounts-worker.js   (round 14: now uses a Cloudflare D1 database; replaces the round-13 KV version)
   ---------------------------------------------------------------------
   WHY it exists:
     profiles.js (the profile icon on the home page) works WITHOUT any server (profiles then live in one browser). With THIS Worker
     your data lives in the cloud instead, so:
       * every profile has its OWN history, bookmarks, "continue reading" list and recent pages, on every device;
       * the ADMIN (you) can open every profile: status (last seen, counts), history, bookmarks;
       * error reports ("bug reports") that signed-in people send are stored here so the admin can read them.
     A normal profile can only ever read its own data. Only the admin name and code you set in the Worker variables can read all.
   HOW to link it (about 6 minutes, nothing to code - the tables are created by the Worker itself on its first call):
     1. Cloudflare dashboard > Storage & databases > D1 SQL database > Create database. Name it  mangaflow  (any name works).
     2. Workers & Pages > Create > Create Worker. Name it  mangaflow-accounts . Press Deploy, then Edit code, delete the sample code,
        paste THIS whole file, press Deploy.
     3. That Worker > Settings > Bindings > Add > D1 database. Variable name must be exactly   DB   . Pick the database from step 1. Save.
     4. That Worker > Settings > Variables and Secrets > Add:
            ADMIN_USER = the admin name you want (3-20 letters or digits, for example  dharma)       type: Text
            ADMIN_CODE = your 6-digit admin code                                                       type: Secret
            ALLOWED_ORIGINS = https://YOURNAME.github.io   (optional but recommended; comma separated) type: Text
            PEPPER = any long random text (optional, one more secret mixed into the stored code fingerprints)   type: Secret
        Deploy again after adding variables.
     5. Open the Worker address (https://mangaflow-accounts.YOURNAME.workers.dev/ping with a POST is needed, so just copy the address)
        and paste it into MangaFlow: home page > profile icon > Server > paste > Save > Test (it must say "ready, admin is set").
     6. Sign in with ADMIN_USER and ADMIN_CODE. You now see the tabs  All profiles  and  Bug reports .
   WHAT is stored (nothing else): user names, a salted SHA-256 fingerprint of each code (never the code), created / last-seen times, the
     last 1000 history items per profile (kind, manga title, chapter, address, time), one small JSON "state" per profile (bookmarks,
     continue-reading list, recent pages) and the bug reports people chose to send (the report text, max 8000 characters).
   LIMITS (free plan): D1 gives about 100 000 writes and 5 000 000 reads a day and 5 GB - plenty for a private site. History is sent in
     batches (profiles.js sends them about 8 seconds after the first new row, and when the page is hidden), not item by item.
   SAFETY (honest): a 6-digit code has only a million possibilities, so protection is: 5 wrong tries lock the name for 15 minutes, the
     optional PEPPER, and ALLOWED_ORIGINS. Do not reuse a code you use anywhere important.
   IMPROVE: PBKDF2 hashing on the paid plan (more CPU time), e-mail recovery, daily clean-up with a Cron Trigger, per-day activity charts.
   ===================================================================== */

// WHY: how much history one profile may keep. HOW: older rows are deleted after each insert. IMPROVE: make it a variable.
const MAX_ACTS = 1000;
// WHY: how many bug reports are kept in total. HOW: the oldest are deleted first. IMPROVE: delete reports older than 90 days.
const MAX_BUGS = 300;
// WHY: wrong-code protection. HOW: after FAIL_LIMIT wrong tries a name is locked for FAIL_SECONDS. IMPROVE: also lock per IP address.
const FAIL_LIMIT = 5, FAIL_SECONDS = 900;
// WHY: how long a sign-in lasts (30 days). HOW: stored as an expiry time in the tokens table.
const TOKEN_SECONDS = 30 * 24 * 3600;
// WHY: the biggest "state" JSON (bookmarks, reading lists) accepted per profile, in characters. IMPROVE: compress it.
const MAX_STATE = 150000;

// WHY: the table definitions. HOW: run once per Worker start with CREATE TABLE IF NOT EXISTS, so you never have to use the SQL console.
const SCHEMA = [
  'CREATE TABLE IF NOT EXISTS users (name TEXT PRIMARY KEY, salt TEXT NOT NULL, hash TEXT NOT NULL, created INTEGER, last INTEGER)',
  'CREATE TABLE IF NOT EXISTS acts (id INTEGER PRIMARY KEY AUTOINCREMENT, user TEXT NOT NULL, t INTEGER, type TEXT, title TEXT, chapter TEXT, url TEXT, host TEXT)',
  // WHY: makes reading one profile's history fast. HOW: an index on (user, id) lets SQL jump straight to a profile's rows.
  // IMPROVE: none needed.
  'CREATE INDEX IF NOT EXISTS acts_user ON acts (user, id)',
  'CREATE TABLE IF NOT EXISTS state (user TEXT PRIMARY KEY, json TEXT, updated INTEGER)',
  'CREATE TABLE IF NOT EXISTS bugs (id INTEGER PRIMARY KEY AUTOINCREMENT, user TEXT, t INTEGER, title TEXT, report TEXT, page TEXT)',
  'CREATE TABLE IF NOT EXISTS tokens (token TEXT PRIMARY KEY, user TEXT, role TEXT, exp INTEGER)',
  'CREATE TABLE IF NOT EXISTS fails (name TEXT PRIMARY KEY, n INTEGER, until INTEGER)'
];
let ready = null;                                   // WHY: remember that the tables exist (one promise per Worker start)

// WHY: a small helper that answers with JSON and the CORS headers. HOW: builds a Response; cors is computed once per request.
const json = (data, status, cors) => new Response(JSON.stringify(data), { status: status || 200, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

// WHY: the fingerprint of a code. HOW: SHA-256 of "pepper:salt:user:code", written as hex text. IMPROVE: PBKDF2 (needs more CPU time).
async function fingerprint(env, salt, user, code) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode((env.PEPPER || '') + ':' + salt + ':' + user + ':' + code));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
// WHY: random text for salts and sign-in tokens. HOW: n random bytes written as hex. IMPROVE: none needed.
const random = (n = 16) => [...crypto.getRandomValues(new Uint8Array(n))].map(b => b.toString(16).padStart(2, '0')).join('');
// WHY: compare two texts without stopping at the first difference (harder to guess by timing). IMPROVE: none needed.
function same(a, b) { a = String(a); b = String(b); let d = a.length ^ b.length; for (let i = 0; i < Math.max(a.length, b.length); i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0); return d === 0; }
// WHY: only simple names are allowed. HOW: 3-20 letters, digits, dot, dash, underscore, lower-cased. IMPROVE: allow more languages.
const cleanName = s => { s = String(s || '').trim().toLowerCase(); return /^[a-z0-9._-]{3,20}$/.test(s) ? s : ''; };
// WHY: the code must be exactly 6 digits. IMPROVE: also refuse 000000 and 123456.
const cleanCode = s => (/^\d{6}$/.test(String(s || '')) ? String(s) : '');
const txt = (v, n) => String(v == null ? '' : v).slice(0, n);   // WHY: every outside text is cut to a fixed length before it is stored

// WHY: Cloudflare Workers expect one default export with a fetch function. HOW: the function below runs once for every
// request.
export default {
  // WHY: Cloudflare calls this for every request. HOW: env holds the D1 binding (DB) and the variables you set in the dashboard.
  async fetch(request, env) {
    // --- CORS: which web pages may talk to this Worker ---------------------------------
    const origin = request.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
    const cors = { 'Access-Control-Allow-Origin': allowed.length ? (allowed.includes(origin) ? origin : 'null') : '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Vary': 'Origin' };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });          // the browser's pre-check
    if (request.method === 'GET' && new URL(request.url).pathname.replace(/\/+$/, '') === '/ping') return json({ ok: true, version: 4, note: 'accounts-worker.js round 22 is running' }, 200, cors);
    // WHY: refuse web pages that are not yours. HOW: when ALLOWED_ORIGINS is set, any other Origin gets 403. IMPROVE: log
    // refused origins.
    if (allowed.length && !allowed.includes(origin)) return json({ error: 'this site is not allowed' }, 403, cors);
    // ROUND 22: opening  <worker address>/ping  in a browser tab (a GET) now shows the version, so you can SEE that the new file is deployed. Everything else still needs POST.
    if (request.method !== 'POST') return json({ error: 'POST only' }, 405, cors);
    if (!env.DB) return json({ error: 'The D1 binding named DB is missing (see step 3 at the top of accounts-worker.js).' }, 500, cors);

    // --- read the request ------------------------------------------------------------------
    let body = {}; try { body = await request.json(); } catch { return json({ error: 'bad request' }, 400, cors); }
    const path = new URL(request.url).pathname.replace(/\/+$/, '');
    const DB = env.DB, now = Date.now();
    // WHY: the admin name lives in the Worker variables, not in the database. HOW: cleaned the same way as user names so it
    // can be compared.
    const adminName = cleanName(env.ADMIN_USER);
    // WHY: make the tables on first use. HOW: one batch of CREATE TABLE IF NOT EXISTS; a failure is shown to the caller. IMPROVE: migrations.
    if (!ready) ready = DB.batch(SCHEMA.map(q => DB.prepare(q))).catch(e => { ready = null; throw e; });
    try { await ready; } catch (e) { return json({ error: 'Could not prepare the database: ' + (e && e.message) }, 500, cors); }

    // WHY: lets the app test the address. HOW: answers ok, and whether ADMIN_USER and ADMIN_CODE are set. IMPROVE: also
    // report the database size.
    if (path === '/ping') return json({ ok: true, admin: !!adminName && !!env.ADMIN_CODE, version: 4 }, 200, cors);

    // --- ROUND 19: a problem report from somebody who is NOT signed in (the Troubleshoot tab "Send to server"). ------------------------
    // WHY: the owner wants every report on the server so it can be used to fix pages, also from visitors without a profile. HOW: stored in the bugs table
    //   with user "guest"; at most 3 per 10 minutes per visitor address (counted in the fails table under the name "rpt:<ip>") so nobody can flood the database.
    // IMPROVE: group reports by website host and show the count to the admin.
    if (path === '/report') {
      const ip = 'rpt:' + txt(request.headers.get('CF-Connecting-IP') || origin || 'anon', 60);
      const f = await DB.prepare('SELECT n, until FROM fails WHERE name = ?').bind(ip).first();
      const n = f && f.until > now ? f.n : 0;
      if (n >= 3) return json({ error: 'Too many reports, try again in a few minutes.' }, 429, cors);
      await DB.prepare('INSERT OR REPLACE INTO fails (name, n, until) VALUES (?, ?, ?)').bind(ip, n + 1, f && f.until > now ? f.until : now + 600000).run();
      await DB.prepare('INSERT INTO bugs (user, t, title, report, page) VALUES (?, ?, ?, ?, ?)').bind('guest', now, txt(body.title, 160), txt(body.report, 8000), txt(body.page, 300)).run();
      await DB.prepare('DELETE FROM bugs WHERE id NOT IN (SELECT id FROM bugs ORDER BY id DESC LIMIT ?)').bind(MAX_BUGS).run();
      return json({ ok: true }, 200, cors);
    }

    // --- register a new profile ------------------------------------------------------------
    if (path === '/register') {
      const user = cleanName(body.user), code = cleanCode(body.code);
      if (!user) return json({ error: 'The name needs 3-20 letters, digits, dot, dash or underscore.' }, 400, cors);
      // WHY: refuse a bad code before touching the database. HOW: cleanCode returned '' for anything that is not exactly 6
      // digits.
      if (!code) return json({ error: 'The code must be exactly 6 digits.' }, 400, cors);
      if (user === adminName) return json({ error: 'That name is reserved.' }, 409, cors);
      if (await DB.prepare('SELECT name FROM users WHERE name = ?').bind(user).first()) return json({ error: 'That name is already taken.' }, 409, cors);
      const salt = random(8);
      await DB.prepare('INSERT INTO users (name, salt, hash, created, last) VALUES (?, ?, ?, ?, ?)').bind(user, salt, await fingerprint(env, salt, user, code), now, now).run();
      return json({ token: await newToken(DB, user, 'user', now), user, role: 'user' }, 200, cors);
    }

    // --- sign in -------------------------------------------------------------------------------
    if (path === '/login') {
      const user = cleanName(body.user), code = cleanCode(body.code);
      if (!user || !code) return json({ error: 'Name or code not valid.' }, 400, cors);
      // WHY: look up earlier wrong tries for this name. HOW: the fails table holds a count and a 'locked until' time. IMPROVE:
      // count per IP address too.
      const f = await DB.prepare('SELECT n, until FROM fails WHERE name = ?').bind(user).first();
      if (f && f.until > now && f.n >= FAIL_LIMIT) return json({ error: 'Too many wrong codes. Wait 15 minutes.' }, 429, cors);
      let role = null;
      if (adminName && user === adminName) { if (env.ADMIN_CODE && same(code, env.ADMIN_CODE)) role = 'admin'; }      // the admin lives in the variables, not in the table
      else {
        const rec = await DB.prepare('SELECT salt, hash FROM users WHERE name = ?').bind(user).first();
        if (rec && same(await fingerprint(env, rec.salt, user, code), rec.hash)) { role = 'user'; await DB.prepare('UPDATE users SET last = ? WHERE name = ?').bind(now, user).run(); }
      }
      if (!role) {
        const n = (f && f.until > now ? f.n : 0) + 1;
        await DB.prepare('INSERT OR REPLACE INTO fails (name, n, until) VALUES (?, ?, ?)').bind(user, n, now + FAIL_SECONDS * 1000).run();
        return json({ error: 'Wrong name or code.' }, 401, cors);
      }
      await DB.prepare('DELETE FROM fails WHERE name = ?').bind(user).run();
      // ROUND 20: the admin gets a normal row in the users table (random unusable fingerprint: the real login above never reads it) so the admin's own history,
      // bookmarks and "last seen" are listed and counted exactly like any other profile. WHY: before, the admin had no row, so "All profiles" never showed the admin.
      if (role === 'admin') await DB.prepare('INSERT OR IGNORE INTO users (name, salt, hash, created, last) VALUES (?, ?, ?, ?, ?)').bind(user, random(8), random(32), now, now).run();
      await DB.prepare('DELETE FROM tokens WHERE exp < ?').bind(now).run();                                         // tidy up old sign-ins
      return json({ token: await newToken(DB, user, role, now), user, role }, 200, cors);
    }

    // --- everything below needs a sign-in ------------------------------------------------------
    const me = body.token ? await DB.prepare('SELECT user, role FROM tokens WHERE token = ? AND exp > ?').bind(txt(body.token, 64), now).first() : null;
    if (!me) return json({ error: 'Please sign in again.' }, 401, cors);
    const admin = me.role === 'admin';

    // WHY: sign out. HOW: delete this token so it can never be used again.
    if (path === '/logout') { await DB.prepare('DELETE FROM tokens WHERE token = ?').bind(txt(body.token, 64)).run(); return json({ ok: true }, 200, cors); }

    // --- add history items (sent in batches by the app). ROUND 19: the admin's own reading is saved too (it was skipped before). ------
    if (path === '/act') {
      const items = (Array.isArray(body.items) ? body.items : []).slice(0, 100);
      // WHY: nothing to save. HOW: answer ok without touching the database.
      if (!items.length) return json({ ok: true }, 200, cors);
      await DB.batch(items.map(x => DB.prepare('INSERT INTO acts (user, t, type, title, chapter, url, host) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(me.user, +x.t || now, txt(x.type || 'read', 12), txt(x.title, 120), txt(x.chapter, 80), txt(x.url, 400), txt(x.host, 80))));
      await DB.prepare('DELETE FROM acts WHERE user = ? AND id NOT IN (SELECT id FROM acts WHERE user = ? ORDER BY id DESC LIMIT ?)').bind(me.user, me.user, MAX_ACTS).run();
      await DB.prepare('UPDATE users SET last = ? WHERE name = ?').bind(now, me.user).run();
      return json({ ok: true }, 200, cors);
    }

    // --- my own history and data -----------------------------------------------------------------
    if (path === '/me') {
      const rows = (await DB.prepare('SELECT t, type, title, chapter, url, host FROM acts WHERE user = ? ORDER BY id DESC LIMIT ?').bind(me.user, MAX_ACTS).all()).results.reverse();
      return json({ user: me.user, role: me.role, items: rows }, 200, cors);
    }
    // the profile's own "state": bookmarks, continue-reading list, recent pages (one small JSON text)
    if (path === '/state/get') { const s = await DB.prepare('SELECT json, updated FROM state WHERE user = ?').bind(me.user).first(); return json({ json: s ? s.json : '', updated: s ? s.updated : 0 }, 200, cors); }
    if (path === '/state/put') {
      const j = typeof body.json === 'string' ? body.json : JSON.stringify(body.json || {});
      // WHY: protect the database from huge uploads. HOW: refuse texts longer than MAX_STATE with status 413.
      if (j.length > MAX_STATE) return json({ error: 'The saved lists are too big.' }, 413, cors);
      await DB.prepare('INSERT OR REPLACE INTO state (user, json, updated) VALUES (?, ?, ?)').bind(me.user, j, now).run();
      return json({ ok: true, updated: now }, 200, cors);
    }
    // a bug report the person chose to send (any signed-in profile, also the admin)
    if (path === '/bug') {
      await DB.prepare('INSERT INTO bugs (user, t, title, report, page) VALUES (?, ?, ?, ?, ?)').bind(me.user, now, txt(body.title, 160), txt(body.report, 8000), txt(body.page, 300)).run();
      await DB.prepare('DELETE FROM bugs WHERE id NOT IN (SELECT id FROM bugs ORDER BY id DESC LIMIT ?)').bind(MAX_BUGS).run();
      // WHY: tell the app the bug report was stored. HOW: a plain ok answer. IMPROVE: return the report id.
      return json({ ok: true }, 200, cors);
    }
    if (path === '/clear-me') { await DB.prepare('DELETE FROM acts WHERE user = ?').bind(me.user).run(); return json({ ok: true }, 200, cors); }
    if (path === '/delete-me') {
      if (admin) return json({ error: 'The admin lives in the Worker variables.' }, 400, cors);
      await wipe(DB, me.user); await DB.prepare('DELETE FROM tokens WHERE user = ?').bind(me.user).run();
      return json({ ok: true }, 200, cors);
    }

    // --- ADMIN only ------------------------------------------------------------------------------
    if (path.startsWith('/admin/')) {
      if (!admin) return json({ error: 'Admin only.' }, 403, cors);
      if (path === '/admin/users') {
        // WHY: one query gives the admin list with counts per profile. HOW: sub-selects count reads, downloads and bugs; a LEFT
        // JOIN brings the saved lists so bookmarks can be counted. IMPROVE: keep counts in their own table for speed.
        const r = await DB.prepare(`SELECT u.name AS user, u.created, u.last,
            (SELECT COUNT(*) FROM acts a WHERE a.user = u.name AND a.type = 'read') AS reads,
            (SELECT COUNT(*) FROM acts a WHERE a.user = u.name AND a.type = 'download') AS downloads,
            (SELECT COUNT(*) FROM bugs b WHERE b.user = u.name) AS bugs, s.json AS state
          FROM users u LEFT JOIN state s ON s.user = u.name ORDER BY u.last DESC LIMIT 500`).all();
        return json({ users: r.results.map(u => { let marks = 0; try { marks = (JSON.parse(u.state || '{}').books || []).length; } catch { /* broken JSON: count 0 */ } return { user: u.user, created: u.created, last: u.last, reads: u.reads, downloads: u.downloads, bugs: u.bugs, bookmarks: marks }; }) }, 200, cors);
      }
      if (path === '/admin/bugs') return json({ bugs: (await DB.prepare('SELECT id, user, t, title, report, page FROM bugs ORDER BY id DESC LIMIT ?').bind(MAX_BUGS).all()).results }, 200, cors);
      if (path === '/admin/bug-delete') { await DB.prepare('DELETE FROM bugs WHERE id = ?').bind(+body.id || 0).run(); return json({ ok: true }, 200, cors); }
      const target = cleanName(body.u);
      if (!target) return json({ error: 'No such profile.' }, 400, cors);
      if (path === '/admin/user') {
        const items = (await DB.prepare('SELECT t, type, title, chapter, url, host FROM acts WHERE user = ? ORDER BY id DESC LIMIT ?').bind(target, MAX_ACTS).all()).results.reverse();
        const s = await DB.prepare('SELECT json FROM state WHERE user = ?').bind(target).first();
        let state = {}; try { state = JSON.parse((s && s.json) || '{}'); } catch { /* broken JSON: show nothing */ }
        const bugs = (await DB.prepare('SELECT id, t, title, report, page FROM bugs WHERE user = ? ORDER BY id DESC LIMIT 50').bind(target).all()).results;
        return json({ user: target, items, state, bugs }, 200, cors);
      }
      if (path === '/admin/delete') { await wipe(DB, target); return json({ ok: true }, 200, cors); }
      if (path === '/admin/reset') {
        const code = cleanCode(body.code), rec = await DB.prepare('SELECT name FROM users WHERE name = ?').bind(target).first();
        if (!code || !rec) return json({ error: 'Need a 6-digit code and an existing profile.' }, 400, cors);
        const salt = random(8);
        await DB.prepare('UPDATE users SET salt = ?, hash = ? WHERE name = ?').bind(salt, await fingerprint(env, salt, target, code), target).run();
        await DB.prepare('DELETE FROM fails WHERE name = ?').bind(target).run(); await DB.prepare('DELETE FROM tokens WHERE user = ?').bind(target).run();
        return json({ ok: true }, 200, cors);
      }
    }
    return json({ error: 'unknown route' }, 404, cors);
  }
};

// WHY: make and store a sign-in token. HOW: 24 random bytes as hex plus an expiry time. IMPROVE: none needed.
async function newToken(DB, user, role, now) {
  const token = random(24);
  await DB.prepare('INSERT INTO tokens (token, user, role, exp) VALUES (?, ?, ?, ?)').bind(token, user, role, now + TOKEN_SECONDS * 1000).run();
  // WHY: give the new token back to the caller. HOW: it was stored in the tokens table just above.
  return token;
}
// WHY: delete everything of one profile. HOW: one batch over the five tables. IMPROVE: keep bug reports if you want to read them later.
async function wipe(DB, user) {
  await DB.batch(['users WHERE name', 'acts WHERE user', 'state WHERE user', 'bugs WHERE user', 'fails WHERE name'].map(t => DB.prepare('DELETE FROM ' + t + ' = ?').bind(user)));
}
