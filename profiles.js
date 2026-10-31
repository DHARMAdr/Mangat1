/* =====================================================================
   MangaFlow - profiles.js   (round 14, OPTIONAL add-on: ONE file, ONE <script> line in index.html; replaces the round-13 file)
   ---------------------------------------------------------------------
   WHY it exists:
     A small profile icon on the home page. A person creates a profile (user name + a 6-digit code) and signs in. From then on
       * what they read and download is written to THEIR history,
       * their bookmarks, "continue reading" list and recent pages belong to THEM (another profile never sees them),
       * an error report can be sent to the admin with one tap (or automatically, if they switch that on).
     An ADMIN profile can open every profile: status, history, bookmarks and the bug reports.
   HOW it works:
     * app.js only sends browser events:  "mf-activity" (read / download), "mf-store" (a personal list changed), "mf-bug" (an error
       report was shown). This file listens. No profiles.js = no tracking, nothing else changes.
     * app.js keeps the personal lists under  mf_u:<name>:books / reads / recent / progress  while a profile is signed in. After a sign-in or
       sign-out this file reloads the page once, so app.js starts with the right lists.
     * TWO MODES, chosen by one setting (profile window > Server):
         LOCAL (default, no setup): profiles live in this browser only (localStorage). The admin sees only the profiles on this device.
         CLOUD (optional): paste the address of your accounts Worker (accounts-worker.js, uses a free Cloudflare D1 database). Then profiles,
           history, bookmarks and bug reports are kept on the server, follow you to every device, and the admin (set in the Worker variables
           ADMIN_USER / ADMIN_CODE) sees ALL profiles. The Server tab lists the setup steps and has a "Copy Worker code" button.
     * The code is never stored as typed: a salted SHA-256 fingerprint is stored (browser) or sent over https to the Worker.
     * The sign-up form says openly that history is saved and that the admin can see it.
   HONEST LIMITS:
     * A 6-digit code is weak (a million possibilities). Local mode locks a name for 10 minutes after 5 wrong tries, the Worker for 15.
       Anyone who controls a device can also read its browser storage, so LOCAL mode is a convenience, not a vault.
     * In LOCAL mode the first profile named  admin  becomes the admin of that browser (first come, first served). Use the Worker for a
       real admin.
     * It tracks only what MangaFlow itself reports (chapters scrolled into, downloads started). It cannot see anything outside the app.
     * Cloud sync is "last writer wins": if you change bookmarks on two devices at the same moment, the later save wins.
   IMPROVE: avatars, e-mail recovery, a daily activity chart for the admin, merging bookmarks from two devices, a share button.
   ===================================================================== */
(() => {
  'use strict';
  if (window.MangaFlowProfiles) return;                         // WHY: never build the add-on twice
  // ROUND 19 - THE BUILT-IN SERVER. WHY: every visitor must use the owner's accounts server WITHOUT typing or seeing its address (the owner asked that only the
  //   admin can see / change it). HOW: the address is built in here; cloudUrl() uses it unless the admin saved another address on his own device
  //   (localStorage 'mf_acct_url'). The Server tab (address box, setup steps) is drawn ONLY while an admin is signed in, or on a browser where an admin
  //   signed in before ('mf_admin_dev'), so the admin can still repair a broken address. HONEST LIMIT: this is a static website, so anybody who
  //   reads this file's source can find the address. It is not a secret; what protects the data is the sign-in (tokens) and ALLOWED_ORIGINS in the Worker.
  // IMPROVE: let the admin store the address in the Worker itself so ALL devices follow a change.
  const ACCOUNTS_URL = 'https://mangaflow-accounts.dharmaraj-p2013.workers.dev';
  const KEEP = 500;                                             // WHY: history items kept per profile in this browser
  const VERSION = 3;                                            // WHY: lets other code check which version is linked (3 = round 19)
  const LISTS = ['books', 'reads', 'recent', 'progress'];       // WHY: the personal lists app.js keeps per profile (same names as app.js NS_KEYS)

  /* ---- 1. tiny helpers --------------------------------------------------------------------------------------------------- */
  // WHY: localStorage can throw (private windows), so every read / write is wrapped. HOW: JSON in and out. IMPROVE: none needed.
  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage full or blocked: ignore */ } },
    del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } }
  };
  // WHY: a short name for querySelector. HOW: $('#id') returns the first match inside r (default: the whole page).
  // IMPROVE: none needed.
  const $ = (s, r = document) => r.querySelector(s);
  // WHY: text from outside must never become HTML. HOW: replace the five special characters. IMPROVE: use textContent everywhere.
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // WHY: same rules as the Worker, so a wrong name is refused before it is sent. HOW: 3-20 letters, digits, dot, dash, underscore.
  const cleanName = s => { s = String(s || '').trim().toLowerCase(); return /^[a-z0-9._-]{3,20}$/.test(s) ? s : ''; };
  const cleanCode = s => (/^\d{6}$/.test(String(s || '')) ? String(s) : '');   // WHY: the code must be exactly 6 digits
  const hex = u8 => [...u8].map(b => b.toString(16).padStart(2, '0')).join('');  // WHY: bytes -> readable text
  const rnd = n => hex(crypto.getRandomValues(new Uint8Array(n)));               // WHY: random salts for local fingerprints
  // WHY: the fingerprint of a code. HOW: SHA-256 (built into the browser, needs https or localhost). IMPROVE: PBKDF2 with many rounds.
  async function sha(text) {
    if (!(window.crypto && crypto.subtle)) throw new Error('This browser needs https (or localhost) for profiles.');
    return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))));
  }
  // WHY: "5 min ago" style times. HOW: picks the largest unit. IMPROVE: translate.
  const ago = t => { const s = Math.max(0, (Date.now() - t) / 1000); return s < 60 ? 'just now' : s < 3600 ? Math.floor(s / 60) + ' min ago' : s < 86400 ? Math.floor(s / 3600) + ' h ago' : Math.floor(s / 86400) + ' d ago'; };
  const fmt = t => t ? new Date(t).toLocaleString() : '-';       // WHY: full date and time for the details line
  // WHY: each profile gets its own colour. HOW: a number made from the name picks two hues. IMPROVE: let people choose.
  const hue = name => { let h = 0; for (const c of String(name)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
  const avatar = (name, big) => '<span class="mfp-av' + (big ? ' big' : '') + '" style="--h:' + hue(name) + '">' + (name ? esc(name[0].toUpperCase()) : '&#128100;') + '</span>';
  const safeHttp = u => /^https?:\/\//i.test(String(u || ''));    // WHY: only real web addresses get an "Open" button (never javascript:)

  /* ---- 2. state ---------------------------------------------------------------------------------------------------------- */
  const cloudUrl = () => String(LS.get('mf_acct_url', '') || ACCOUNTS_URL || '').replace(/\/+$/, '');   // the Worker address, or ''
  let session = LS.get('mf_session', null);                     // { user, role: 'user'|'admin', cloud: true|false, token? } or null
  let pending = [];                                             // history items waiting to be sent to the Worker
  let flushTimer = 0;                                           // WHY: sends items in batches, not one by one (the free plan has a daily write limit)
  let stateTimer = 0;                                           // WHY: bookmarks are copied to the cloud after a short quiet time, not on every tap
  let lastKey = '';                                             // WHY: do not log the same chapter twice in a row
  let lastBug = null;                                           // the newest error report app.js showed (for the "Send to admin" button)
  let lastAutoBug = 0;                                          // WHY: automatic sending is limited to one report per 30 seconds
  let view = { tab: 'in', sel: '', filter: '', kind: 'all', msg: '', ok: false, cache: null };   // what the window currently shows

  /* ---- 3. personal lists (bookmarks etc.) of one profile, kept in this browser -------------------------------------------------- */
  const listKey = (u, k) => 'mf_u:' + u + ':' + k;              // the same key app.js uses
  // WHY: read all four lists of a profile as ONE object (this is what is copied to the cloud). IMPROVE: none needed.
  const readLists = u => { const o = {}; LISTS.forEach(k => { const v = LS.get(listKey(u, k), null); if (v != null) o[k] = v; }); return o; };
  // WHY: write the lists back. HOW: one key per list. Returns true when something really changed (so we know a reload is needed).
  function writeLists(u, o) {
    let changed = false;
    LISTS.forEach(k => { if (o && o[k] != null) { const a = JSON.stringify(o[k]); if (a !== JSON.stringify(LS.get(listKey(u, k), null))) { LS.set(listKey(u, k), o[k]); changed = true; } } });
    // WHY: tells the caller whether anything changed, so the page is reloaded only when needed. HOW: 'changed' was set to
    // true inside the loop above.
    return changed;
  }
  // WHY: when a NEW profile is created, the bookmarks of the guest session (before signing in) are copied in, so nothing seems lost.
  function importGuest(u) {
    if (Object.keys(readLists(u)).length) return;
    const o = {}; LISTS.forEach(k => { const v = LS.get('mf_' + k, null); if (v != null) o[k] = v; });
    // WHY: copy the guest lists into the new profile. HOW: writeLists saves each list under the profile's own key. IMPROVE:
    // ask the person first.
    writeLists(u, o);
  }

  /* ---- 3b. ROUND 19: GUEST ACTIVITY + MERGING (so signing in later loses nothing) ------------------------------------------------------------ */
  // WHY: the owner reads first and signs in later, and wants that reading to appear in the profile. HOW: while nobody is signed in, every "read" / "download"
  // event is kept in a small guest list (max 200). At sign-in the list is sent to the profile and emptied. mergeLists() combines two copies of the personal lists
  // (union, newest first) instead of letting one copy overwrite the other. IMPROVE: show the guest items as "not yet saved" in the window.
  const GUEST = 'mf_guest_acts';
  const guestItems = () => LS.get(GUEST, []);
  // ROUND 30: reads are one row per MANGA (app.js saveRead replaces the row with the same id), so the key is the id; the old key (the chapter address) kept an old row for every chapter ever
  // read on the other device, and the two copies never became equal (the cause of the endless reloading, see section 6 below).
  const keyOf = { books: x => x && x.url, reads: x => x && (x.id || x.chapterUrl), recent: x => x && (x.url || x.link || x.u) };
  // ROUND 30: the limits app.js keeps (addRecent keeps 20 pages, saveRead keeps 30 manga). WHY: a merged list longer than the app's own limit is cut by the app at its next save, then the cloud
  // gives the cut rows back, the copies differ again and the page reloaded - for ever. HOW: the merge keeps the same numbers. IMPROVE: let app.js tell profiles.js its limits in an event.
  const CAP = { recent: 20, reads: 30 };
  function mergeLists(a, b) {                                   // a = one copy, b = another; returns the combined lists
    const out = {};
    LISTS.forEach(k => {
      const x = a && a[k], y = b && b[k];
      if (Array.isArray(x) || Array.isArray(y)) {
        // ROUND 30: when both copies hold the same thing (same key) the NEWER one (bigger "at") wins; lists whose rows all carry a time are put newest first, so a row that was added
        // on another device is not cut off by the limit; then the app's own limit is applied. The same two copies always give the same answer, so they agree after one merge.
        const best = new Map(), order = [], kf = keyOf[k] || (v => JSON.stringify(v));
        (x || []).concat(y || []).forEach(it => {
          const id = kf(it) || JSON.stringify(it), old = best.get(id);
          if (!old) { best.set(id, it); order.push(id); } else if (((it && it.at) || 0) > ((old && old.at) || 0)) best.set(id, it);
        });
        const res = order.map(id => best.get(id));
        if (res.length && res.every(it => it && typeof it.at === 'number')) res.sort((p, q) => q.at - p.at);          // newest first (the sort keeps the order of equal times)
        out[k] = res.slice(0, CAP[k] || 300);
      } else if ((x && typeof x === 'object') || (y && typeof y === 'object')) out[k] = Object.assign({}, y || {}, x || {});   // progress: object of chapter -> position
      else if (x != null || y != null) out[k] = x != null ? x : y;
    });
    return out;
  }
  // WHY: after sign-in: guest reading history -> profile. HOW: becomes "pending" items (sent by flush); the guest lists are merged into the profile's lists.
  function adoptGuest(u) {
    const g = guestItems(); if (g.length) { pending = g.concat(pending).slice(-300); LS.del(GUEST); }
    const guestLists = {}; LISTS.forEach(k => { const v = LS.get('mf_' + k, null); if (v != null) guestLists[k] = v; });
    if (Object.keys(guestLists).length) writeLists(u, mergeLists(readLists(u), guestLists));
  }

  /* ---- 4. LOCAL mode: a tiny "server" inside localStorage ----------------------------------------------------------------- */
  const db = () => LS.get('mf_profiles', { users: {} });         // all local profiles { users: { name: {salt, hash, ...} } }
  const saveDb = d => LS.set('mf_profiles', d);
  const actsOf = u => LS.get('mf_act_' + u, []);                  // history list of one local profile
  // WHY: everything the window needs in local mode, shaped like the Cloud object below, so the rest of the file does not
  // care about the mode. HOW: each function reads or writes localStorage. IMPROVE: move to IndexedDB for big histories.
  const Local = {
    async register(user, code) {
      user = cleanName(user); code = cleanCode(code);
      if (!user) throw new Error('The name needs 3-20 letters, digits, dot, dash or underscore.');
      if (!code) throw new Error('The code must be exactly 6 digits.');
      const d = db(); if (d.users[user]) throw new Error('That name is already taken on this device.');
      const salt = rnd(8), role = (user === 'admin' && !Object.values(d.users).some(x => x.role === 'admin')) ? 'admin' : 'user';
      d.users[user] = { salt, hash: await sha(salt + ':' + user + ':' + code), created: Date.now(), last: Date.now(), role, fails: 0, until: 0 };
      saveDb(d); return { user, role };
    },
    async login(user, code) {
      user = cleanName(user); code = cleanCode(code);
      const d = db(), r = d.users[user];
      if (r && r.until > Date.now()) throw new Error('Too many wrong codes. Wait ' + Math.ceil((r.until - Date.now()) / 60000) + ' minutes.');
      if (!r || !code || (await sha(r.salt + ':' + user + ':' + code)) !== r.hash) {
        if (r) { r.fails = (r.fails || 0) + 1; if (r.fails >= 5) { r.until = Date.now() + 600000; r.fails = 0; } saveDb(d); }
        throw new Error('Wrong name or code.');
      }
      r.fails = 0; r.until = 0; r.last = Date.now(); saveDb(d); return { user, role: r.role || 'user' };
    },
    async items(u) { return actsOf(u); },
    async add(u, items) { const l = actsOf(u).concat(items).slice(-KEEP); LS.set('mf_act_' + u, l); const d = db(); if (d.users[u]) { d.users[u].last = Date.now(); saveDb(d); } },
    async users() {
      const d = db();
      return Object.keys(d.users).filter(u => d.users[u].role !== 'admin').map(u => {
        const a = actsOf(u), bugs = LS.get('mf_bugs_local', []).filter(b => b.user === u).length;
        return { user: u, created: d.users[u].created, last: d.users[u].last, reads: a.filter(x => x.type === 'read').length, downloads: a.filter(x => x.type === 'download').length, bugs, bookmarks: (readLists(u).books || []).length };
      });
    },
    async userData(u) { return { items: actsOf(u), state: readLists(u), bugs: LS.get('mf_bugs_local', []).filter(b => b.user === u).reverse() }; },
    async clear(u) { LS.del('mf_act_' + u); },
    async remove(u) { const d = db(); delete d.users[u]; saveDb(d); LS.del('mf_act_' + u); LISTS.forEach(k => LS.del(listKey(u, k))); LS.set('mf_bugs_local', LS.get('mf_bugs_local', []).filter(b => b.user !== u)); },
    async reset(u, code) { code = cleanCode(code); const d = db(); if (!code || !d.users[u]) throw new Error('Need a 6-digit code and an existing profile.'); d.users[u].salt = rnd(8); d.users[u].hash = await sha(d.users[u].salt + ':' + u + ':' + code); d.users[u].until = 0; saveDb(d); },
    async sendBug(b) { const l = LS.get('mf_bugs_local', []); l.push({ id: Date.now(), user: session.user, t: Date.now(), title: b.title, report: b.report, page: b.page }); LS.set('mf_bugs_local', l.slice(-100)); },
    async bugs() { return LS.get('mf_bugs_local', []).slice().reverse(); },
    async delBug(id) { LS.set('mf_bugs_local', LS.get('mf_bugs_local', []).filter(b => b.id !== id)); }
  };

  /* ---- 5. CLOUD mode: the same calls, sent to accounts-worker.js ------------------------------------------------------------- */
  // WHY: one function for every Worker call. HOW: POST JSON; a non-200 answer becomes an Error with the Worker's message. IMPROVE: retry once.
  async function post(path, body, keepalive) {
    const url = cloudUrl(); if (!url) throw new Error('No accounts server address is set.');
    let res; try { res = await fetch(url + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), keepalive: !!keepalive, credentials: 'omit', referrerPolicy: 'no-referrer' }); }
    // WHY: a network failure gives no useful message by itself. HOW: catch it and throw a clear sentence instead. IMPROVE:
    // show the address that failed.
    catch { throw new Error('Could not reach the accounts server (check the address and your connection).'); }
    let data = {}; try { data = await res.json(); } catch { /* not JSON */ }
    if (!res.ok) throw new Error(data.error || ('Server answered HTTP ' + res.status));
    return data;
  }
  const tok = () => ({ token: session && session.token });       // the sign-in token that goes with every call
  const Cloud = {
    register: (user, code) => post('/register', { user, code }),
    login: (user, code) => post('/login', { user, code }),
    items: async () => (await post('/me', tok())).items || [],
    add: (u, items, keepalive) => post('/act', { ...tok(), items }, keepalive),
    users: async () => (await post('/admin/users', tok())).users || [],
    userData: async u => post('/admin/user', { ...tok(), u }),
    clear: () => post('/clear-me', tok()),
    remove: u => (session.role === 'admin' && u !== session.user) ? post('/admin/delete', { ...tok(), u }) : post('/delete-me', tok()),
    reset: (u, code) => post('/admin/reset', { ...tok(), u, code }),
    logout: () => post('/logout', tok()),
    sendBug: b => post('/bug', { ...tok(), title: b.title, report: b.report, page: b.page }),
    bugs: async () => (await post('/admin/bugs', tok())).bugs || [],
    delBug: id => post('/admin/bug-delete', { ...tok(), id })
  };
  // ROUND 20 - VISIBLE SYNC STATUS. WHY: saving failed silently (an old Worker, a network error, a refused token) so the admin could not tell why nothing arrived. HOW: every
  // send records the result in localStorage 'mf_sync' { t, ok, err, sent }; Settings > Profile and the profile window show it ("saved 2 min ago" or the exact error).
  // IMPROVE: a small dot on the profile chip (green / red).
  const syncInfo = () => LS.get('mf_sync', { t: 0, ok: null, err: '', sent: 0 });
  function setSync(ok, err, sent) { const o = syncInfo(); LS.set('mf_sync', { t: Date.now(), ok, err: ok ? '' : String(err || 'failed').slice(0, 160), sent: (o.sent || 0) + (sent || 0) }); }
  const API = () => (session && session.cloud ? Cloud : Local);   // WHY: the rest of the file does not care which mode is used

  /* ---- 6. keeping bookmarks etc. in step with the cloud --------------------------------------------------------------------------- */
  const atKey = () => 'mf_stateat_' + (session ? session.user : '');   // when this browser last agreed with the cloud
  // WHY: copy this profile's lists to the cloud. HOW: one small JSON; remember the server time. A failure is silent (tried again next change).
  async function pushState(strict) {
    clearTimeout(stateTimer); stateTimer = 0;
    if (!session || !session.cloud) return false;
    // WHY: send the lists to the cloud. HOW: POST the lists as one JSON text, then remember the server time so a later pull
    // can compare. A failure returns false and is retried on the next change.
    try { const r = await post('/state/put', { ...tok(), json: JSON.stringify(readLists(session.user)) }); LS.set(atKey(), r.updated || Date.now()); setSync(true, '', 0); return true; }
    catch (e) { setSync(false, 'bookmarks: ' + e.message); if (strict) throw e; return false; }
  }
  // WHY: after sign-in, take the cloud copy if it is newer than ours, otherwise send ours. Returns true when local lists changed.
  async function pullState() {
    if (!session || !session.cloud) return false;
    try {
      // WHY: ask the cloud what it holds. HOW: 'r.updated' is the time of the last cloud save; 'mine' is when this browser
      // last agreed with it. IMPROVE: merge both lists instead of picking one.
      // ROUND 19: MERGE the cloud copy and this browser's copy (union) instead of "newest wins", then save the merged result in both places.
      // WHY: reading on two devices, or reading before signing in, must never lose the other side. HOW: mergeLists() above. IMPROVE: per-item time stamps.
      const r = await post('/state/get', tok());
      let cloudLists = {}; try { cloudLists = r.json ? JSON.parse(r.json) : {}; } catch { /* broken: ignore */ }
      const merged = mergeLists(readLists(session.user), cloudLists), changed = writeLists(session.user, merged);
      if (JSON.stringify(merged) !== JSON.stringify(cloudLists) && Object.keys(merged).length) await pushState();
      else LS.set(atKey(), r.updated || Date.now());
      return changed;
    } catch { /* offline: the local lists keep working */ }
    return false;
  }
  // WHY: app.js says "a list changed". HOW: wait 6 seconds of quiet, then push. Admins keep no cloud lists.
  // ROUND 19: the admin's own bookmarks / reading are saved too (before, the admin was skipped: that was the "my data is not saved" bug).
  window.addEventListener('mf-store', () => { if (session && session.cloud) { clearTimeout(stateTimer); stateTimer = setTimeout(pushState, 3000); } });   // round 20: 3 s

  /* ---- 7. recording what a signed-in person does ------------------------------------------------------------------------------ */
  // WHY: send the waiting items to the Worker. HOW: one request for the whole batch; if it fails the items stay in the list for the next try.
  async function flush(keepalive, strict) {
    clearTimeout(flushTimer); flushTimer = 0;
    if (!session || !session.cloud || !pending.length) return;
    // WHY: take up to 100 waiting items out of the queue (the Worker accepts at most 100 per call). HOW: splice removes them
    // from 'pending'; a failed send puts them back.
    const batch = pending.splice(0, 100);
    try {
      const r = await Cloud.add(session.user, batch, keepalive);
      // ROUND 20: an OLD accounts Worker answers { skipped: ... } for the admin and saves nothing. Say so clearly instead of pretending it worked.
      if (r && r.skipped) throw new Error('the accounts server is the OLD version (it does not save the admin). Redeploy accounts-worker.js in Cloudflare.');
      setSync(true, '', batch.length);
    } catch (e) { pending = batch.concat(pending).slice(0, 300); setSync(false, 'history: ' + e.message); if (strict) throw e; }   // keep them for later (max 300)
  }
  // WHY: the app tells us what happened. HOW: build one item, skip a repeat, store it (local) or queue it (cloud). Admins are not tracked.
  window.addEventListener('mf-activity', e => {
    if (!e.detail) return;                                      // ROUND 19: the admin is tracked too; nobody signed in = kept in the guest list (see 3b)
    const d = e.detail, key = d.type + '|' + (d.url || d.title);
    if (d.type === 'read' && key === lastKey) return;           // same chapter again (scrolling back and forth)
    // WHY: remember the newest item so the same chapter is not logged twice in a row. HOW: lastKey is compared at the top of
    // this function.
    lastKey = key;
    const item = { t: Date.now(), type: d.type, title: String(d.title || '').slice(0, 120), chapter: String(d.chapter || '').slice(0, 80), url: String(d.url || '').slice(0, 400), host: String(d.host || '').slice(0, 80) };
    if (!session) { LS.set(GUEST, guestItems().concat(item).slice(-200)); return; }
    if (session.cloud) { pending.push(item); if (!flushTimer) flushTimer = setTimeout(() => flush(false), 8000); }   // round 20: 8 s (was 20 s, 45 s before round 19)
    else Local.add(session.user, [item]);
  });
  // WHY: when the person leaves the page the waiting batch must go out now. HOW: keepalive lets the request finish after the page hides.
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') { flush(true); if (stateTimer) pushState(); } });
  window.addEventListener('pagehide', () => { flush(true); if (stateTimer) pushState(); });

  /* ---- 8. bug reports: "Send to admin" ----------------------------------------------------------------------------------------- */
  // WHY: send one report to the admin. HOW: Worker /bug (cloud) or a local list (this device). The report text comes from app.js.
  async function sendBug(b) { await API().sendBug({ title: String(b.title || '').slice(0, 160), report: String(b.report || '').slice(0, 8000), page: String(b.page || '').slice(0, 300) }); }
  // WHY: app.js announces every error report. HOW: remember it, show the "Send to admin" button in the error pop-up, and (only if the
  // person switched it on) send it at once, at most one per 30 seconds. IMPROVE: group identical reports.
  window.addEventListener('mf-bug', e => {
    lastBug = e.detail || null; if (!lastBug) return;
    const row = $('#errbox .row'); let b = $('#mfSendBug');
    // WHY: add the Send-to-admin button only once. HOW: build it, give it a click handler, and insert it before the Copy
    // button. IMPROVE: show it only when the report is new.
    if (row && !b) {
      b = document.createElement('button'); b.id = 'mfSendBug'; b.type = 'button'; b.textContent = '✉ Send to admin'; b.title = 'Sends this report to the admin of the site (needs a profile)';
      b.addEventListener('click', async () => { b.disabled = true; try { await sendBug(lastBug); b.textContent = '✓ Sent'; } catch (err) { b.textContent = 'Not sent: ' + err.message.slice(0, 40); b.disabled = false; } });
      row.insertBefore(b, $('#errCopy'));
    }
    if (b) { b.hidden = !session; b.disabled = false; b.textContent = '✉ Send to admin'; }
    if (session && LS.get('mf_autobug', false) && Date.now() - lastAutoBug > 30000) { lastAutoBug = Date.now(); sendBug(lastBug).then(() => { if (b) b.textContent = '✓ Sent automatically'; }).catch(() => { /* the button stays for a manual try */ }); }
  });

  /* ---- 9. the look (CSS kept inside this file) ---------------------------------------------------------------------------------- */
  const css = `
  #mfProfChip{position:absolute;top:12px;right:12px;z-index:5;display:flex;align-items:center;gap:8px;padding:4px 12px 4px 4px;border-radius:999px;cursor:pointer;
    font:600 .82rem system-ui,sans-serif;color:#e8ecff;background:linear-gradient(135deg,#12142a,#1d1840);border:1px solid rgba(127,246,255,.35);
    box-shadow:0 0 14px rgba(37,168,255,.25),inset 0 0 10px rgba(120,100,255,.2);min-height:36px;}
  #mfProfChip:hover{border-color:#7ff6ff;box-shadow:0 0 18px rgba(37,168,255,.5);}
  #mfProfChip:focus-visible{outline:3px solid #fff;outline-offset:2px;}
  .mfp-av{display:inline-grid;place-items:center;width:28px;height:28px;border-radius:50%;font:700 .85rem system-ui,sans-serif;color:#fff;
    background:linear-gradient(135deg,hsl(var(--h,220) 85% 55%),hsl(calc(var(--h,220) + 60) 85% 45%));box-shadow:0 0 8px hsl(var(--h,220) 90% 55% / .6);}
  .mfp-av.big{width:52px;height:52px;font-size:1.4rem;}
  #mfProf{width:min(96vw,580px);max-height:92dvh;padding:0;border:1px solid rgba(127,246,255,.35);border-radius:18px;color:#e8ecff;overflow:auto;
    background:radial-gradient(circle at 20% 0%,#1d1a45,#0a0c1c 60%);box-shadow:0 0 40px rgba(60,80,255,.35);}
  #mfProf::backdrop{background:rgba(2,4,14,.7);}
  #mfProf .mfp-in{padding:16px;display:flex;flex-direction:column;gap:12px;}
  #mfProf h3{margin:0;font:700 1.05rem system-ui,sans-serif;letter-spacing:.02em;}
  #mfProf .mfp-top{display:flex;align-items:center;gap:12px;}
  #mfProf .mfp-top .grow{flex:1;min-width:0;} #mfProf .mfp-name{font:700 1.1rem system-ui,sans-serif;overflow:hidden;text-overflow:ellipsis;}
  #mfProf .mfp-badge{display:inline-block;padding:1px 9px;border-radius:999px;font:700 .68rem system-ui,sans-serif;letter-spacing:.06em;margin-right:6px;background:#25a8ff33;border:1px solid #25a8ff;}
  #mfProf .mfp-badge.admin{background:#e040fb33;border-color:#e040fb;} #mfProf .mfp-badge.mode{background:#ffffff14;border-color:#ffffff40;}
  #mfProf .mfp-tabs{display:flex;gap:6px;flex-wrap:wrap;}
  #mfProf .mfp-tabs button{flex:1;min-width:84px;min-height:40px;border-radius:10px;border:1px solid #ffffff30;background:#ffffff0d;color:#cfd6ff;font:600 .85rem system-ui,sans-serif;cursor:pointer;}
  #mfProf .mfp-tabs button.on{background:linear-gradient(135deg,#25a8ff55,#bb20ff55);border-color:#7ff6ff;color:#fff;box-shadow:0 0 12px rgba(37,168,255,.4);}
  #mfProf label{display:block;font:600 .78rem system-ui,sans-serif;color:#9fb0ff;margin:2px 0 4px;letter-spacing:.04em;text-transform:uppercase;}
  #mfProf input[type=text],#mfProf input[type=password],#mfProf input[type=search],#mfProf input[type=url]{width:100%;box-sizing:border-box;min-height:44px;padding:8px 12px;border-radius:10px;
    border:1px solid #ffffff3a;background:#05060f;color:#fff;font:500 16px ui-monospace,Consolas,monospace;}
  #mfProf input:focus{outline:2px solid #7ff6ff;border-color:transparent;}
  #mfProf .mfp-code{letter-spacing:.5em;text-align:center;font-size:20px;}
  #mfProf .mfp-btn{min-height:44px;padding:8px 16px;border-radius:12px;border:1px solid #7ff6ff88;cursor:pointer;color:#fff;font:700 .9rem system-ui,sans-serif;
    background:linear-gradient(135deg,#25a8ff,#7a3cff 55%,#c020ff);box-shadow:0 0 14px rgba(80,90,255,.5);}
  #mfProf .mfp-btn.ghost{background:#ffffff10;border-color:#ffffff40;box-shadow:none;} #mfProf .mfp-btn.red{background:#c92a2a55;border-color:#ff6b6b;box-shadow:none;}
  #mfProf .mfp-btn.small{min-height:34px;padding:4px 12px;font-size:.8rem;}
  #mfProf .mfp-row{display:flex;gap:8px;flex-wrap:wrap;} #mfProf .mfp-row>*{flex:1;}
  #mfProf .mfp-note{font:500 .78rem/1.45 system-ui,sans-serif;color:#aab4e8;margin:0;}
  #mfProf .mfp-msg{padding:8px 12px;border-radius:10px;font:600 .85rem system-ui,sans-serif;background:#c92a2a33;border:1px solid #ff6b6b;}
  #mfProf .mfp-msg.ok{background:#2f9e4433;border-color:#51cf66;}
  #mfProf .mfp-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(104px,1fr));gap:8px;}
  #mfProf .mfp-stat{padding:10px;border-radius:12px;background:#ffffff0d;border:1px solid #ffffff22;text-align:center;}
  #mfProf .mfp-stat b{display:block;font:700 1.35rem ui-monospace,Consolas,monospace;color:#7ff6ff;text-shadow:0 0 10px #25a8ff;}
  #mfProf .mfp-stat span{font:600 .68rem system-ui,sans-serif;color:#9fb0ff;letter-spacing:.06em;text-transform:uppercase;}
  #mfProf ul.mfp-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px;max-height:42dvh;overflow:auto;}
  #mfProf .mfp-it{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:10px;background:#ffffff0b;border:1px solid #ffffff1c;}
  #mfProf .mfp-it .ico{font-size:1.1rem;} #mfProf .mfp-it .txt{flex:1;min-width:0;} #mfProf .mfp-it .t{font:600 .88rem system-ui,sans-serif;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  #mfProf .mfp-it .s{font:500 .72rem system-ui,sans-serif;color:#9fb0ff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  #mfProf .mfp-user{cursor:pointer;} #mfProf .mfp-user:hover,#mfProf .mfp-user.sel{border-color:#7ff6ff;background:#25a8ff1a;}
  #mfProf .mfp-empty{padding:18px;text-align:center;color:#9fb0ff;font:500 .85rem system-ui,sans-serif;}
  #mfProf ol.mfp-steps{margin:0;padding-left:20px;display:flex;flex-direction:column;gap:6px;font:500 .8rem/1.45 system-ui,sans-serif;color:#cfd6ff;}
  #mfProf ol.mfp-steps code{background:#ffffff14;padding:0 5px;border-radius:5px;font:600 .78rem ui-monospace,Consolas,monospace;}
  #mfProf .mfp-sw{display:flex;align-items:center;gap:8px;font:600 .85rem system-ui,sans-serif;}
  #mfProf .mfp-sw input{width:22px;height:22px;}
  #mfProf pre.mfp-bug{margin:6px 0 0;max-height:180px;overflow:auto;white-space:pre-wrap;word-break:break-word;font:500 .72rem/1.4 ui-monospace,Consolas,monospace;background:#05060f;border:1px solid #ffffff22;border-radius:8px;padding:8px;}
  #mfSendBug{min-height:40px;}
  @media (max-width:520px){#mfProf .mfp-in{padding:12px;}#mfProfChip{top:8px;right:8px;}}
  `;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);


  /* ---- 10. the window --------------------------------------------------------------------------------------------------------------- */
  const dlg = document.createElement('dialog'); dlg.id = 'mfProf'; dlg.setAttribute('aria-label', 'Profile'); document.body.appendChild(dlg);
  const icon = { read: '&#128214;', download: '&#11015;&#65039;' };   // little pictures for the history rows
  const setMsg = (m, ok) => { view.msg = m || ''; view.ok = !!ok; };   // the coloured message line at the top of the window

  // WHY: one list of history items, used for "my history" and for the admin looking at one profile. HOW: filter text + kind buttons.
  function listHtml(items, canOpen) {
    const q = view.filter.toLowerCase();
    const rows = items.slice().reverse().filter(x => (view.kind === 'all' || x.type === view.kind) && (!q || (x.title + ' ' + x.chapter + ' ' + x.host).toLowerCase().includes(q)));
    // WHY: the history list with its search box and the three filter buttons. HOW: builds an HTML text; every outside value
    // goes through esc() first. IMPROVE: paginate long lists.
    return '<div class="mfp-row"><input type="search" id="mfpFilter" placeholder="Search the history…" value="' + esc(view.filter) + '" aria-label="Search the history">' +
      '<span class="mfp-tabs" style="flex:0 0 auto">' + ['all', 'read', 'download'].map(k => '<button data-act="kind" data-v="' + k + '" class="' + (view.kind === k ? 'on' : '') + '" style="min-width:64px">' + k + '</button>').join('') + '</span></div>' +
      (rows.length ? '<ul class="mfp-list">' + rows.slice(0, 200).map(x => '<li class="mfp-it"><span class="ico">' + (icon[x.type] || '&#8226;') + '</span><span class="txt"><div class="t">' + esc(x.title || x.url) + (x.chapter ? ' · ' + esc(x.chapter) : '') + '</div><div class="s">' + esc(x.host || '') + ' · ' + ago(x.t) + ' · ' + esc(fmt(x.t)) + '</div></span>' +
        (canOpen && x.type === 'read' && safeHttp(x.url) ? '<button class="mfp-btn small ghost" data-act="open" data-url="' + esc(x.url) + '">Open</button>' : '') + '</li>').join('') + '</ul>' : '<div class="mfp-empty">Nothing here yet.</div>');
  }
  // WHY: the three big numbers above a history list. HOW: counts from the items.
  const stats = items => '<div class="mfp-stats"><div class="mfp-stat"><b>' + items.filter(x => x.type === 'read').length + '</b><span>chapters read</span></div><div class="mfp-stat"><b>' + items.filter(x => x.type === 'download').length + '</b><span>downloads</span></div><div class="mfp-stat"><b>' + new Set(items.map(x => x.title)).size + '</b><span>manga</span></div></div>';
  // WHY: bookmarks + "continue reading" of one profile (from its saved lists). canOpen=false for the admin's read-only view.
  function marksHtml(state, canOpen) {
    const books = (state && state.books) || [], reads = (state && state.reads) || [];
    const row = (t, s, url, ico) => '<li class="mfp-it"><span class="ico">' + ico + '</span><span class="txt"><div class="t">' + esc(t) + '</div><div class="s">' + esc(s) + '</div></span>' + (canOpen && safeHttp(url) ? '<button class="mfp-btn small ghost" data-act="openpage" data-url="' + esc(url) + '">Open</button>' : '') + '</li>';
    // WHY: the bookmark and continue-reading lists. HOW: row() builds one line; esc() protects against HTML in titles; the
    // Open button only appears for real web addresses.
    return '<h3>&#11088; Bookmarks (' + books.length + ')</h3>' + (books.length ? '<ul class="mfp-list">' + books.slice(0, 100).map(b => row(b.title || b.url, b.url, b.url, '&#11088;')).join('') + '</ul>' : '<div class="mfp-empty">No bookmarks yet.</div>') +
      '<h3>&#128214; Continue reading (' + reads.length + ')</h3>' + (reads.length ? '<ul class="mfp-list">' + reads.slice(0, 50).map(r => row(r.title || r.chapterUrl, [r.host, r.chapterLabel].filter(Boolean).join(' · '), r.chapterUrl, '&#128214;')).join('') + '</ul>' : '<div class="mfp-empty">Nothing yet.</div>');
  }
  // WHY: bug reports as a list (admin: all, or one profile's). Each report opens as text; the admin can delete it.
  function bugsHtml(bugs, canDel) {
    return bugs.length ? '<ul class="mfp-list">' + bugs.map(b => '<li class="mfp-it" style="align-items:flex-start"><span class="ico">&#128027;</span><span class="txt" style="white-space:normal"><div class="t" style="white-space:normal">' + esc(b.title || 'Report') + (b.user ? ' · ' + esc(b.user) : '') + '</div><div class="s">' + esc(fmt(b.t)) + ' · ' + ago(b.t) + '</div><details><summary class="s" style="cursor:pointer">show report</summary><pre class="mfp-bug">' + esc(b.report) + '</pre></details></span>' + (canDel ? '<button class="mfp-btn small red" data-act="delbug" data-id="' + esc(b.id) + '">Delete</button>' : '') + '</li>').join('') + '</ul>' : '<div class="mfp-empty">No bug reports.</div>';
  }

  // WHY: draws the whole window for the current state. HOW: builds HTML text from `session` and `view`, then wires nothing (clicks are handled once, by delegation below).
  async function render() {
    const cloud = !!cloudUrl(), msg = view.msg ? '<div class="mfp-msg' + (view.ok ? ' ok' : '') + '" role="status">' + esc(view.msg) + '</div>' : '';
    let h = '<div class="mfp-in">';
    // WHY: two screens: not signed in (sign in / create / server) and signed in (tabs by role). HOW: this branch draws the
    // first one. IMPROVE: split render() into small functions.
    if (!session) {
      const create = view.tab === 'create';
      h += '<div class="mfp-top">' + avatar('', true) + '<div class="grow"><h3>MangaFlow profile</h3><p class="mfp-note">Sign in to keep your own reading history and bookmarks.</p></div></div>' +
        '<div class="mfp-tabs"><button data-act="tab" data-v="in" class="' + (view.tab === 'in' ? 'on' : '') + '">Sign in</button><button data-act="tab" data-v="create" class="' + (create ? 'on' : '') + '">Create profile</button>' + (adminDev() ? '<button data-act="tab" data-v="server" class="' + (view.tab === 'server' ? 'on' : '') + '">Server</button>' : '') + '</div>' + msg;
      if (view.tab === 'server' && adminDev()) h += serverHtml();
      else h += '<form data-act="go" autocomplete="off" novalidate><label for="mfpUser">Username</label><input type="text" id="mfpUser" name="mfpuser" maxlength="20" autocapitalize="none" spellcheck="false" placeholder="3-20 letters or digits">' +
        '<label for="mfpCode">6-digit code</label><input type="password" id="mfpCode" class="mfp-code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" placeholder="••••••" autocomplete="off">' +
        (create ? '<p class="mfp-note">By creating a profile you agree that MangaFlow saves your <b>history</b> (manga names, chapters, download events, times) and your <b>bookmarks</b> in it, and that the <b>admin of this site can see them</b>. ' + (cloud ? 'They are stored on the accounts server.' : 'Without a server they stay in this browser only.') + ' The bookmarks you have now are copied into the new profile.</p>' : '') +
        '<p></p><button class="mfp-btn" type="submit" style="width:100%">' + (create ? 'Create profile and agree' : 'Sign in') + '</button></form>' +
        '<p class="mfp-note">Mode: <b>' + (cloud ? 'cloud (works on all your devices)' : 'this device only') + '</b>.</p>';
    } else {
      const admin = session.role === 'admin';
      // ROUND 19: the admin now has his OWN history + bookmarks tabs too (they are saved like anybody's); the Server tab exists ONLY for the admin.
      const tabs = (admin ? [['admin', 'All profiles'], ['me', 'My history'], ['marks', 'Bookmarks'], ['bugs', 'Reports'], ['server', 'Server']] : [['me', 'My history'], ['marks', 'Bookmarks']]);
      if (!tabs.some(t => t[0] === view.tab)) view.tab = tabs[0][0];
      h += '<div class="mfp-top">' + avatar(session.user, true) + '<div class="grow"><div class="mfp-name">' + esc(session.user) + '</div><span class="mfp-badge' + (admin ? ' admin' : '') + '">' + (admin ? 'ADMIN' : 'PROFILE') + '</span><span class="mfp-badge mode">' + (session.cloud ? 'CLOUD' : 'THIS DEVICE') + '</span></div><button class="mfp-btn ghost small" data-act="out">Sign out</button></div>' +
        '<div class="mfp-tabs">' + tabs.map(t => '<button data-act="tab" data-v="' + t[0] + '" class="' + (view.tab === t[0] ? 'on' : '') + '">' + t[1] + '</button>').join('') + '</div>' + msg;
      if (view.tab === 'server' && admin) h += serverHtml();
      else if (view.tab === 'me') {
        let items = []; try { items = await API().items(session.user); } catch (e) { h += '<div class="mfp-msg">' + esc(e.message) + '</div>'; }
        items = items.concat(session.cloud ? pending : []);
        view.cache = items;
        const si = syncInfo();
        h += '<p class="mfp-note">Sync: <b>' + (si.ok === null ? 'nothing sent yet' : si.ok ? 'saved on the server ' + ago(si.t) + ' (' + si.sent + ' items sent in total)' : 'FAILED ' + ago(si.t) + ': ' + esc(si.err)) + '</b>' + (pending.length ? ' · ' + pending.length + ' waiting' : '') + '</p>' + stats(items) + listHtml(items, true) +
          '<label class="mfp-sw"><input type="checkbox" id="mfpAuto"' + (LS.get('mf_autobug', false) ? ' checked' : '') + '> Send error reports to the admin automatically</label>' +
          '<div class="mfp-row">' + (session.cloud ? '<button class="mfp-btn small" data-act="syncnow">&#8635; Sync now</button>' : '') + '<button class="mfp-btn ghost small" data-act="export">Export (JSON)</button><button class="mfp-btn ghost small" data-act="clear">Clear my history</button>' + (admin ? '' : '<button class="mfp-btn red small" data-act="del" data-u="' + esc(session.user) + '">Delete profile</button>') + '</div>';
      } else if (view.tab === 'marks') {
        h += marksHtml(readLists(session.user), true) + '<p class="mfp-note">These lists belong to <b>' + esc(session.user) + '</b> only. ' + (session.cloud ? 'They are copied to the server, so they follow you to other devices.' : 'They stay in this browser.') + '</p>' +
          (session.cloud ? '<div class="mfp-row"><button class="mfp-btn ghost small" data-act="syncnow">Sync now</button></div>' : '');
        h += '';
      } else if (view.tab === 'bugs' && admin) {
        let bugs = []; try { bugs = await API().bugs(); } catch (e) { h += '<div class="mfp-msg">' + esc(e.message) + '</div>'; }
        h += '<h3>&#128027; Bug reports (' + bugs.length + ')</h3>' + bugsHtml(bugs, true);
      } else if (view.tab === 'admin' && admin) {
        let users = []; try { users = await API().users(); } catch (e) { h += '<div class="mfp-msg">' + esc(e.message) + '</div>'; }
        const day = Date.now() - 86400000, total = users.reduce((n, u) => n + u.reads, 0);
        h += (session.cloud ? '' : '<p class="mfp-note">Local admin: you see only the profiles created in <b>this browser</b>. For every device, set up the accounts server (Server tab).</p>') +
          '<div class="mfp-stats"><div class="mfp-stat"><b>' + users.length + '</b><span>profiles</span></div><div class="mfp-stat"><b>' + users.filter(u => u.last > day).length + '</b><span>active 24 h</span></div><div class="mfp-stat"><b>' + total + '</b><span>chapters read</span></div></div>' +
          (users.length ? '<ul class="mfp-list">' + users.sort((a, b) => b.last - a.last).map(u => '<li class="mfp-it mfp-user' + (view.sel === u.user ? ' sel' : '') + '" data-act="sel" data-u="' + esc(u.user) + '">' + avatar(u.user) + '<span class="txt"><div class="t">' + esc(u.user) + (u.last > day ? ' · online today' : '') + '</div><div class="s">' + u.reads + ' read · ' + u.downloads + ' downloads · ' + (u.bookmarks || 0) + ' bookmarks · ' + (u.bugs || 0) + ' bugs · last ' + ago(u.last) + '</div></span></li>').join('') + '</ul>' : '<div class="mfp-empty">No profiles yet.</div>');
        if (view.sel && users.some(u => u.user === view.sel)) {
          let d = { items: [], state: {}, bugs: [] }; try { d = await API().userData(view.sel); } catch (e) { h += '<div class="mfp-msg">' + esc(e.message) + '</div>'; }
          view.cache = d.items || [];
          h += '<h3>' + esc(view.sel) + '</h3>' + stats(d.items || []) + listHtml(d.items || [], false) + marksHtml(d.state || {}, false) + '<h3>&#128027; Bug reports (' + (d.bugs || []).length + ')</h3>' + bugsHtml(d.bugs || [], false) +
            '<div class="mfp-row"><button class="mfp-btn ghost small" data-act="export">Export (JSON)</button><button class="mfp-btn ghost small" data-act="reset" data-u="' + esc(view.sel) + '">Reset code</button><button class="mfp-btn red small" data-act="del" data-u="' + esc(view.sel) + '">Delete profile</button></div>';
        } else h += '<p class="mfp-note">Tap a profile to see its history, bookmarks and bug reports.</p>';
        h += '<div class="mfp-row"><button class="mfp-btn ghost small" data-act="exportall">Export all profiles (JSON)</button></div>';
      }
    }
    dlg.innerHTML = h + '<div class="mfp-row"><button class="mfp-btn ghost" data-act="close">Close</button></div></div>';
    refreshChip();
  }
  // WHY: the "Server" tab: the address box AND the step-by-step setup list, so linking the cloud needs no other document.
  function serverHtml() {
    const synced = session && session.cloud ? LS.get(atKey(), 0) : 0;
    return '<label for="mfpUrl">Accounts server address (optional)</label><input type="url" id="mfpUrl" placeholder="https://mangaflow-accounts.YOURNAME.workers.dev" value="' + esc(cloudUrl()) + '" spellcheck="false">' +
      // WHY: the address box buttons. HOW: Save stores the Worker address, Test calls /ping to check it. IMPROVE: test
      // automatically after Save.
      '<div class="mfp-row"><button class="mfp-btn small" data-act="saveurl">Save</button><button class="mfp-btn ghost small" data-act="testurl">Test</button></div>' +
      '<p class="mfp-note">Status: <b>' + (cloudUrl() ? 'server address set' + (synced ? ' · last sync ' + ago(synced) : '') : 'not linked (profiles stay in this browser)') + '</b>. Changing the address signs you out.</p>' +
      '<h3>Link your own cloud (about 6 minutes, free)</h3><ol class="mfp-steps">' +
      '<li>Cloudflare dashboard &gt; <b>Storage &amp; databases &gt; D1 SQL database &gt; Create</b>. Name it <code>mangaflow</code>.</li>' +
      '<li><b>Workers &amp; Pages &gt; Create &gt; Worker</b>. Name it <code>mangaflow-accounts</code>, press Deploy, then <b>Edit code</b>, delete the sample and paste the code (button below). Deploy.</li>' +
      '<li>Worker &gt; <b>Settings &gt; Bindings &gt; Add &gt; D1 database</b>. Variable name exactly <code>DB</code>, pick <code>mangaflow</code>.</li>' +
      '<li>Worker &gt; <b>Settings &gt; Variables and Secrets</b>: <code>ADMIN_USER</code> (your admin name), <code>ADMIN_CODE</code> (6 digits, type Secret), optional <code>ALLOWED_ORIGINS</code> (your github.io address) and <code>PEPPER</code> (secret). Deploy again.</li>' +
      '<li>Copy the Worker address (ends with <code>.workers.dev</code>), paste it above, press <b>Save</b>, then <b>Test</b>.</li>' +
      '<li>Sign in with ADMIN_USER and ADMIN_CODE. You will see <b>All profiles</b> and <b>Bug reports</b>.</li></ol>' +
      '<div class="mfp-row"><button class="mfp-btn ghost small" data-act="copyworker">Copy Worker code</button></div>';
  }

  /* ---- 11. clicks (one listener for the whole window) -------------------------------------------------------------------------------- */
  // WHY: sign in or create. HOW: call the right API, remember the session, then (cloud) merge the lists and reload so app.js picks the profile's lists.
  async function signIn(user, code, create) {
    const useCloud = !!cloudUrl(), api = useCloud ? Cloud : Local;
    const r = await (create ? api.register(user, code) : api.login(user, code));
    // WHY: remember who is signed in and how (cloud or local). HOW: stored in localStorage as mf_session; app.js reads the
    // name from it at start. IMPROVE: store only a token.
    session = { user: r.user || cleanName(user), role: r.role || 'user', cloud: useCloud, token: r.token || '' };
    LS.set('mf_session', session); lastKey = ''; view.tab = session.role === 'admin' ? 'admin' : 'me'; view.sel = '';
    if (session.role === 'admin') LS.set('mf_admin_dev', true);   // round 19: this browser may show the Server tab on the sign-in screen from now on
    // ROUND 19: reading done BEFORE signing in is adopted by the profile (history list + bookmarks), then everything is pushed to the cloud, then the page reloads.
    adoptGuest(session.user);
    if (session.cloud) { try { await pullState(); await flush(false); await pushState(); } catch { /* offline: the next change syncs */ } }
    location.reload();                                          // WHY: app.js reads the profile name once at start
  }
  // WHY: save a JSON file. HOW: a temporary link with a Blob. IMPROVE: none needed.
  function download(name, data) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }

  dlg.addEventListener('submit', async e => {
    // WHY: stop the browser's own form submit (it would reload the page). HOW: ignore submits that are not our sign-in form.
    e.preventDefault(); if (!e.target.matches('[data-act=go]')) return;
    try { await signIn($('#mfpUser').value, $('#mfpCode').value, view.tab === 'create'); } catch (err) { setMsg(err.message); }
    render();
  });
  dlg.addEventListener('input', e => { if (e.target.id === 'mfpFilter') { view.filter = e.target.value; const pos = e.target.selectionStart; render().then(() => { const f = $('#mfpFilter'); if (f) { f.focus(); f.setSelectionRange(pos, pos); } }); } });
  dlg.addEventListener('change', e => { if (e.target.id === 'mfpAuto') LS.set('mf_autobug', e.target.checked); });   // the automatic-bug switch
  dlg.addEventListener('click', async e => {
    const b = e.target.closest('[data-act]'); if (!b || b.tagName === 'FORM') return;
    const act = b.dataset.act, u = b.dataset.u;
    try {
      if (act === 'close') { dlg.close(); return; }
      else if (act === 'tab') { view.tab = b.dataset.v; setMsg(''); }
      else if (act === 'kind') view.kind = b.dataset.v;
      else if (act === 'sel') view.sel = u;
      else if (act === 'open') { location.hash = '#r=' + encodeURIComponent(b.dataset.url); location.reload(); return; }
      else if (act === 'openpage') { location.href = location.pathname + '?url=' + encodeURIComponent(b.dataset.url); return; }
      else if (act === 'out') { await flush(false); await pushState(); try { if (session.cloud) await Cloud.logout(); } catch { /* the token expires anyway */ } session = null; LS.del('mf_session'); location.reload(); return; }
      else if (act === 'export') download('mangaflow-history-' + (view.sel || session.user) + '.json', view.cache || []);
      else if (act === 'exportall') { const all = {}; for (const x of await API().users()) all[x.user] = await API().userData(x.user); download('mangaflow-all-profiles.json', all); }
      else if (act === 'clear') { if (confirm('Delete all of your history?')) { await API().clear(session.user); pending = []; setMsg('History cleared.', true); } }
      else if (act === 'del') { if (confirm('Delete the profile "' + u + '" and its history? This cannot be undone.')) { await API().remove(u); if (u === session.user) { session = null; LS.del('mf_session'); location.reload(); return; } view.sel = ''; setMsg('Profile deleted.', true); } }
      else if (act === 'reset') { const c = prompt('New 6-digit code for "' + u + '":'); if (c !== null) { await API().reset(u, c); setMsg('Code changed for ' + u + '.', true); } }
      else if (act === 'delbug') { await API().delBug(+b.dataset.id || b.dataset.id); setMsg('Report deleted.', true); }
      else if (act === 'syncnow') { const ch = await syncAll(); setMsg('Synced: history and bookmarks are saved on the server.', true); if (ch) { location.reload(); return; } }
      else if (act === 'copyworker') {
        let code = ''; try { const r = await fetch('accounts-worker.js', { cache: 'no-store' }); if (!r.ok) throw 0; code = await r.text(); } catch { throw new Error('accounts-worker.js is not next to index.html on this site. Upload it to GitHub, then try again.'); }
        await navigator.clipboard.writeText(code); setMsg('Worker code copied. Paste it in step 2.', true);
      }
      else if (act === 'saveurl' && !adminDev()) { throw new Error('Only the admin can change the server.'); }
      else if (act === 'saveurl') { const v = ($('#mfpUrl').value || '').trim().replace(/\/+$/, ''); if (v && !/^https:\/\//i.test(v)) throw new Error('The address must start with https://'); if (v) LS.set('mf_acct_url', v); else LS.del('mf_acct_url'); if (session) { session = null; LS.del('mf_session'); } setMsg(v ? 'Server saved. Please sign in again.' : 'Server removed: profiles stay in this browser.', true); view.tab = 'in'; }
      else if (act === 'testurl') { const v = ($('#mfpUrl').value || '').trim().replace(/\/+$/, ''); const old = LS.get('mf_acct_url', ''); LS.set('mf_acct_url', v); try { const r = await post('/ping', {}); setMsg('Server answered: ' + (r.admin ? 'ready, admin is set.' : 'ready, but ADMIN_USER / ADMIN_CODE are not set.'), true); } catch (err) { setMsg(err.message); } if (old) LS.set('mf_acct_url', old); else LS.del('mf_acct_url'); }
    } catch (err) { setMsg(err.message); }
    render();
  });

  /* ---- 11b. ROUND 19: helpers used by the window AND by Settings (Profile & sync) ------------------------------------------------------------ */
  // WHY: is this an admin's browser? HOW: an admin is signed in now, or signed in here before (flag set in signIn). Only then the Server tab is drawn.
  function adminDev() { return !!((session && session.role === 'admin') || LS.get('mf_admin_dev', false)); }
  // WHY: ONE button / call that makes everything agree: send waiting history, merge + push bookmarks, pull the cloud copy. Returns true when the lists changed
  // (the caller reloads so app.js shows them). Used by "Sync now" and by Settings > Profile & sync.
  async function syncAll() {
    if (!session) throw new Error('Sign in first (profile icon), then your reading so far is saved to your profile.');
    if (!session.cloud) return false;
    adoptGuest(session.user);
    // ROUND 20: strict = real errors are thrown (and shown) instead of being swallowed; the server version is checked first.
    // ROUND 22: an old server (version < 3) is refused ONLY for the admin (the old one silently skips the admin). Everybody else can still sync with it. The message now says exactly what to do.
    let v = 0; try { v = (await post('/ping', {})).version || 0; } catch (e) { setSync(false, e.message); throw e; }
    LS.set('mf_srv_ver', v);
    if (v < 3 && session.role === 'admin') {
      const m = 'Your accounts server answers with version ' + v + ' (needs 4). The new accounts-worker.js is NOT running yet. Cloudflare > Workers & Pages > your accounts Worker > Edit code > select ALL > paste the new file > Deploy. Then check the address ' + 'of the Worker with /ping at the end in a browser tab: it must show "version":4.';
      setSync(false, m); throw new Error(m);
    }
    await flush(false, true); const ch = await pullState(); await pushState(true); return ch;
  }
  // WHY: the Troubleshoot tab sends its full report to the server (the admin reads it under Reports). Works signed in; others need to sign in first.
  async function sendReportToServer(title, report, page) {
    const b = { title: String(title || '').slice(0, 160), report: String(report || '').slice(0, 8000), page: String(page || '').slice(0, 300) };
    if (session && session.cloud) { await sendBug(b); return; }
    await post('/report', b);                                  // not signed in: the anonymous, rate-limited route (see accounts-worker.js)
  }

  /* ---- 12. the icon on the home page ------------------------------------------------------------------------------------------------- */
  const chip = document.createElement('button'); chip.id = 'mfProfChip'; chip.type = 'button';
  chip.addEventListener('click', () => { setMsg(''); render().then(() => { if (!dlg.open) dlg.showModal(); }); });
  // WHY: keep the icon text in step with the sign-in state. HOW: avatar + name, or "Sign in".
  function refreshChip() { chip.innerHTML = avatar(session ? session.user : '') + '<span>' + (session ? esc(session.user) + (session.role === 'admin' ? ' ★' : '') : 'Sign in') + '</span>'; chip.setAttribute('aria-label', session ? 'Profile: ' + session.user : 'Sign in or create a profile'); }
  // WHY: the icon belongs inside the big card of the start page. HOW: put it into .hero (made position:relative); try again until the page has it.
  function place() {
    const hero = $('#start .hero'); if (!hero) return false;
    if (getComputedStyle(hero).position === 'static') hero.style.position = 'relative';
    // WHY: put the profile icon inside the big start card. HOW: append the button, refresh its text, report success so the
    // retry loop stops.
    hero.appendChild(chip); refreshChip(); return true;
  }
  if (!place()) { const mo = new MutationObserver(() => { if (place()) mo.disconnect(); }); mo.observe(document.body, { childList: true, subtree: true }); setTimeout(() => mo.disconnect(), 10000); }
  refreshChip();
  // ROUND 30 - THE ENDLESS RELOADING. WHY: this line used to reload the page whenever the cloud copy of the lists differed from this browser's copy. After closing and reopening the browser
  //   the two copies could differ every time (the app keeps 20 recent pages, the merge kept 300; one reading row per manga against one per chapter), so the page reloaded, differed again and
  //   reloaded again for ever - "the site is reloading and reloading" with no error. HOW: (1) the merge above is now stable (same keys and limits as the app, newest wins); (2) a change from the
  //   cloud no longer reloads anything: app.js listens for "mf-lists-changed", reads the lists again and redraws the start page (window.MF_LISTS_LIVE says that it does); (3) an old app.js without
  //   that door falls back to a reload through MF_RELOAD (boot.js), which refuses to reload when a reload loop was seen. IMPROVE: show a small "synced" mark when the cloud brought something new.
  if (session && session.cloud) pullState().then(ch => {
    if (!ch) return;
    if (window.MF_LISTS_LIVE) { try { window.dispatchEvent(new CustomEvent('mf-lists-changed')); } catch { /* the lists are saved anyway: they show at the next visit */ } }
    else if (window.MF_RELOAD) window.MF_RELOAD('cloud lists changed');
    else location.reload();
  });

  // ROUND 19: more doors for app.js / Settings: sync(), role(), sendReport(). The window can now be opened from Settings in reading mode too (open()).
  window.MangaFlowProfiles = { version: VERSION, open: () => { setMsg(''); return render().then(() => { if (!dlg.open) dlg.showModal(); }); }, user: () => (session ? session.user : null),
    role: () => (session ? session.role : null), sync: syncAll, syncInfo, serverVersion: () => LS.get('mf_srv_ver', 0), sendReport: sendReportToServer, guestCount: () => guestItems().length };   // WHY: other code can check that the add-on is present
})();
