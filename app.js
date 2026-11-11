/* =====================================================================
   MangaFlow Reader - app.js
   Every section has:  WHY (why it exists)  |  HOW (how it works)  |  IMPROVE (how to make it better later)
   Plain English on purpose: this file is also a lesson for beginners.

   HOW THE WHOLE THING WORKS
   1. You type a URL. Browsers forbid reading other sites directly (CORS), so we ask a small
      "CORS proxy" to fetch the page's HTML for us.
   2. We show that HTML in a sandboxed iframe and intercept link clicks (a mini browser).
   3. "Reading mode" scans the page for chapter links and chapter images, then loads chapters one
      after another into a single endless scroll.
   4. At the end of the page, "Download" builds ONE PDF of every loaded chapter (pdfmaker.js).

   WHAT IS NEW IN THIS VERSION (round 2)
   - Series pages now show their chapter list (the site fills it with JavaScript, we fetch it ourselves)
     and "Read first chapter" works. Links are made safe BEFORE the page finishes loading.
   - Reading mode hides its buttons when you scroll DOWN and shows them only when you scroll UP.
   - Settings has an editable list of CORS proxies. Free ones are added automatically.
   - Arrow buttons are drawn like a keyboard's arrow cluster.
   - History remembers the exact chapter; "Continue reading" reopens it.
   - PDF download of everything loaded in reading mode.
   - Phones get a floating search bar.

   WHAT IS NEW IN ROUND 8
   - Reader keys: ONE row of round 3D buttons (reload chapter, reload all, previous, next, END). End key works too.
   - The manga title hides on scroll down like the other buttons; a search / link bar was added to reading mode.
   - A pasted manga link (or a click on a chapter) opens straight in reading mode.
   - The download dock sits above the keys, starts minimised while you read, and never stops when minimised.
   - Wider picture detection (pictures hidden in scripts, srcset), picture retry through your proxy, polite
     request speed, and BIG error pop-ups with a copyable report for every problem or blocked attack.
   ===================================================================== */
// WHY: wraps the whole file in a function that runs at once, so our variables stay private and do not leak into the
// page. HOW: '(() => { ... })()' defines and calls an arrow function. IMPROVE: split the file into modules
// (import/export) so it is easier to read.
(() => {
  // WHY: turns on strict mode so silly mistakes (like using an undeclared variable) throw errors instead of hiding. HOW:
  // the browser reads this special string at the top of the function. IMPROVE: modules are strict by default, so this goes
  // away if you switch.
  'use strict';

  /* ---------------------------------------------------------------
     0. SECURITY BASICS  (round 7)
     WHY: this is a browser-only site, so the protections are the ones a browser can do by itself:
          1. Anti-clickjacking: if another website shows MangaFlow inside its own frame (to trick clicks),
             we blank the page and open ourselves normally. (A header on your host is stronger, see _headers.)
          2. safeWebUrl(): only http(s) addresses are ever opened or fetched. javascript:, data:, file: ... are refused.
          3. Pages from other sites are cleaned (renderFrame) and shown in a frame WITHOUT scripts.
          4. A Content-Security-Policy in index.html stops any script that is not ours.
          5. Everything shown from the outside is written with textContent (never as HTML), so a manga title like
             "<img onerror=...>" is just text.
     IMPROVE: add a "report a problem" link, and use Subresource Integrity if you ever load a library from a CDN. */
  // WHY: stops clickjacking, where another site shows MangaFlow inside its own frame to trick clicks. HOW: window.top is
  // the outermost page. If it is not this window, we are inside a frame, so we erase the page. IMPROVE: also send a
  // frame-blocking header from your host.
  if (window.top !== window.self) {
    document.documentElement.innerHTML = '';
    // WHY: after blanking, try to open MangaFlow as the real top page. HOW: sets the top window address to ours inside
    // try/catch, because a sandboxed frame may refuse. IMPROVE: show a short message with a link instead of a blank page.
    try { window.top.location = window.self.location.href; } catch { /* a sandboxed frame may not navigate: stay blank */ }
    // WHY: stop the rest of the script from running inside a hostile frame. HOW: 'return' leaves the wrapper function early.
    // IMPROVE: none needed.
    return;
  }
  // WHY: one safe gate for every address we open or fetch, so javascript: or file: links are refused. HOW: new URL()
  // parses the text, we accept only http/https and return the clean address, otherwise null. IMPROVE: also block local
  // network addresses.
  const safeWebUrl = u => { try { const x = new URL(u); return (x.protocol === 'http:' || x.protocol === 'https:') ? x.href : null; } catch { return null; } };

  /* ---------------------------------------------------------------
     1. SMALL HELPERS
     WHY: $ / $$ shorten document.querySelector; `store` wraps localStorage in try/catch because
          it throws in private mode or when full.
     HOW: every saved value gets the prefix "mf_" so we never clash with other sites' data.
     IMPROVE: move to IndexedDB if you store lots of data (offline chapters). */
  // WHY: a short name for document.querySelector so the code is less long. HOW: finds the first element matching a CSS
  // selector, inside root r (default: the whole page). IMPROVE: none needed.
  const $ = (s, r = document) => r.querySelector(s);
  // WHY: same idea as $ but returns ALL matches as a real array, so forEach/map work. HOW: querySelectorAll gives a
  // NodeList, Array.from converts it. IMPROVE: none needed.
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  // ROUND 29a - THE REOPEN COVER (see boot.js). It lives up here with the helpers because startReading() also calls it, and a const is only usable after its line has run. WHY: after a refresh or a reopened browser the start screen used to flash before the page came back. boot.js puts the class
  //   "mf-resuming" on <html> before the first paint (style.css then shows #resume over everything); endResume() takes it away again. HOW: it is called when the reopen has finished
  //   OR failed (try / finally below), so the person is never stuck behind the cover; boot.js also removes it after 30 s by itself. It is safe to call twice. IMPROVE: fade it out.
  const endResume = () => { try { document.documentElement.classList.remove('mf-resuming'); } catch { /* nothing to do */ } };
  // WHY: safe wrapper around localStorage (the browser's small saved-data box). HOW: an object with get and set functions.
  // Both use try/catch because storage can throw in private mode or when full. IMPROVE: use IndexedDB for large data.
  // ROUND 14 (per-profile data): the four personal lists below get a "u:<user>:" prefix while a profile is signed in, so each profile
  // sees ONLY its own bookmarks / history. profiles.js saves the sign-in under mf_session and reloads the page after sign-in / sign-out,
  // so reading it once at start is enough. No profile signed in = the old plain keys (nothing is lost, "guest" data stays as it was).
  const NS_KEYS = ['recent', 'books', 'reads', 'progress'];
  // WHY: find the signed-in profile name. HOW: parse the small JSON that profiles.js stored; any problem means "nobody signed in".
  // IMPROVE: read it from a shared helper if more add-ons need it.
  const nsPrefix = (() => { try { const s = JSON.parse(localStorage.getItem('mf_session') || 'null'); return s && /^[a-z0-9._-]{3,20}$/.test(s.user || '') ? 'u:' + s.user + ':' : ''; } catch { return ''; } })();
  const store = {
    // WHY: read a saved value or give back a default d. HOW: adds the 'mf_' prefix (and the profile prefix for personal lists), reads the
    // text and turns it into data with JSON.parse. Any error returns d. IMPROVE: warn the user if the data is broken.
    get(k, d) { try { const v = localStorage.getItem('mf_' + (NS_KEYS.includes(k) ? nsPrefix : '') + k); return v ? JSON.parse(v) : d; } catch { return d; } },
    // WHY: save a value so it is still there next visit. HOW: turns the value into text with JSON.stringify and stores it
    // under 'mf_' + prefix + name; then tells profiles.js (event "mf-store") so it can copy the lists to the cloud. Errors are ignored on
    // purpose. IMPROVE: tell the user when saving fails.
    set(k, v) {
      try { localStorage.setItem('mf_' + (NS_KEYS.includes(k) ? nsPrefix : '') + k, JSON.stringify(v)); } catch { /* ignore */ }
      if (NS_KEYS.includes(k)) { try { window.dispatchEvent(new CustomEvent('mf-store', { detail: { key: k } })); } catch { /* never break saving */ } }
    }
  };

  /* A proxy address pasted without "?url={url}" (e.g. https://NAME.workers.dev/) is completed
     automatically. WHY: without {url} the proxy never learns which page to fetch, so every request
     failed with "Failed to fetch". */
  // WHY: users paste proxy addresses without the {url} placeholder, and then every request failed. This repairs the
  // address. HOW: trims spaces, keeps it if it already has {url}, adds {url} after a trailing 'url=', or adds
  // '/?url={url}'. IMPROVE: test the proxy once.
  function fixProxy(p) {
    p = (p || '').trim();
    if (!p || p.includes('{url}')) return p;
    // WHY: a pasted proxy address may already end in ?url= . HOW: then only {url} is added; otherwise '/?url={url}' is
    // appended. IMPROVE: also accept ?u= styles.
    if (/[?&]url=$/i.test(p)) return p + '{url}';
    return p.includes('?') ? p + '&url={url}' : p.replace(/\/+$/, '') + '/?url={url}';   // round 43: a pasted address that already has ?key=... is no longer mangled
  }
  // Short readable name of a proxy, e.g. "api.allorigins.win/raw". Used in lists and error messages.
  // WHY: a short readable proxy name for lists and error messages. HOW: swaps {url} for a dummy 'x' so new URL() works,
  // then joins the host name with the path. If parsing fails, return the raw text. IMPROVE: cut very long names.
  const proxyName = tpl => {
    try { const u = new URL(tpl.replace('{url}', 'x')); return u.hostname + (u.pathname.length > 1 ? u.pathname : ''); }
    catch { return tpl; }
  };
  // "example text" that people paste by mistake from the guide. We refuse to save it.
  // WHY: the guide contains example addresses like 'your-worker'. If someone pastes one by mistake it can never work. HOW:
  // a regular expression tests for those example words, ignoring capital letters. IMPROVE: show a message when one is
  // refused.
  const isExample = p => /your-worker|YOURNAME|\/\/NAME\.workers/.test(p || '')   // round 43: was case-insensitive + unanchored, so a real worker called username/mangaflow-name.workers.dev was silently deleted;

  /* ---------------------------------------------------------------
     2. SETTINGS + THEME
     WHY: Remember the user's theme, width, button side and proxy list between visits.
     HOW: `settings` starts with defaults, then saved values are copied over it.
          The proxy list is filled with the free defaults the FIRST time the site is opened
          (or when upgrading from the old one-proxy setting). After that the list is the user's own:
          removing a default does not bring it back, and "Reset to defaults" restores it.
     IMPROVE: add font/zoom, "auto-start reading mode" and image-quality options. */
  // WHY: the free proxies used when the user has none of their own. HOW: a list of address templates; {url} is replaced by
  // the page address later. IMPROVE: let users reorder them or load the list from a file you can update.
  const DEFAULT_PROXIES = [
    // NOTE: free public proxies come and go (corsproxy.io now needs a paid key, thingproxy is gone).
    // Treat these as a best-effort fallback only; your own proxy (worker.js) is the reliable route.
    // They can only do simple GET requests (no POST), see proxyList() below.
    'https://api.allorigins.win/raw?url={url}',
    'https://api.codetabs.com/v1/proxy/?quest={url}'
  ];
  // WHY: builds the settings object: defaults first, then the saved values copied on top. HOW: Object.assign(defaults,
  // saved) lets saved values win. Each default is explained in its own line comment. IMPROVE: validate saved values (for
  // example a sensible width).
  const settings = Object.assign({
    proxies: null, width: 820, side: 'right', theme: 'light', arrowKeys: true, tapScroll: true,
    autoRead: true,       // round 8: a pasted manga link opens straight in reading mode
    ver: 0,               // round 8: settings version (used for one-time upgrades below)
    pdfMode: 'balanced',  // round 11: PDF picture quality = 'original' | 'balanced' (default) | 'small' | 'tiny' (see PDF_PROFILES in section 12)
    showSlider: true,     // round 13: show the vertical chapter slider (chapter-slider.js). false = hidden and disabled
    showWheel: true,      // round 13: show the reload wheel (reload-wheel.js). false = hidden and disabled
    accent: '#e8590c',    // round 14: the highlight colour (buttons, progress bar). Chosen by the swatches in Settings > Reading
    searchManga: true,    // round 15: typed words are searched as "<words> manga" (true) or as they are (false = search everything)
    engineStrict: false,   // round 19: true = never fall back to another engine when the chosen one fails
    searchEngine: 'google', // round 18: 'google' (YOUR Google Programmable Search, the default) | 'auto' | 'bing' | 'mojeek' | 'yahoo' | 'duckduckgo' | 'brave' (the chosen free engine is tried first, the others are the fallback)
    keepAwake: false,     // round 14: keep the screen on while MangaFlow is open (Screen Wake Lock; only some browsers)
    googleKey: '',   // round 24: removed — Google closed the Custom Search JSON API to new projects. If you have an older project with access, paste your key here. Otherwise use the Programmable Search box below (no key needed).
    googleCx: 'c0d44f55eddb847e4', // round 18: the ID (cx) of the owner's Google Programmable Search Engine. Change it in Settings > Search & extras
    googleManga: false,   // round 18: add the word "manga" to Google searches (off: the engine you built already knows which sites to search)
    goStraight: false,    // round 18: open the search straight after a paste (one tap / one Ctrl+V)
    showFs: true,         // round 18: show the full-screen buttons
    showEdge: true,       // round 18: show the Top / End slider (edge-slider.js); on = the Top and End keys are hidden, off = the keys come back
    autoFree: 0,          // round 7: clear chapters more than N behind you (0 = off)
    noHistory: false,     // round 7: do not save reading history
    wipeOnClose: false,   // round 7: erase history + cache when the tab closes
    preloadAhead: 9,      // round 29d: the keeper keeps this many chapters AFTER the one you read loaded and ready in the background (0 = off)
    resumeSlowMs: 12000,  // round 30 (hidden): how long "Reopening where you were..." may stand alone before boot.js offers "Open the start page" and (after twice that time) app.js writes a report. Tests set it small.
    showTranslate: true,  // round 32: show the Translate button (translate.js). false = hidden (the Settings tab stays so it can be switched on again)
    trTo: 'en',           // round 32: the language the pages are translated INTO (a code from LANG_TO in translate.js: en, hi, ta, ...)
    trFrom: 'auto',       // round 32: the language WRITTEN in the pages ('auto' | 'jpn' | 'kor' | 'chi_sim' | 'chi_tra' | 'eng'); it tells the text reader which language file to use
    trEngine: 'auto',     // round 32: translation service: 'auto' | 'chrome' | 'google' | 'mymemory'
    trAuto: false,        // round 32: start translating by itself when reading mode opens
    healBaseMs: 4000      // round 29d: first waiting time (ms) of the keeper before it retries a failed picture / chapter; it doubles each time up to 90 s. Tests set it small.
  // WHY: saved choices win over the defaults above. HOW: store.get returns the saved object (or {}), Object.assign copies
  // it on top.
  }, store.get('settings', {}));
  // ROUND 8 one-time upgrade: the reader keys now live in the LEFT corner. Older saved settings said "right", so
  // switch once (you can still change it back in Settings, and it is not forced again).
  // WHY: one-time upgrade for people who saved settings in an older version. HOW: if the saved version number is below 8,
  // set side to 'left' and bump the version so it does not run again. IMPROVE: replace this chain of ifs with a list of
  // numbered migration functions.
  if (settings.ver < 8) { settings.side = 'left'; settings.ver = 8; }
  // WHY: another one-time upgrade: from version 9 the keys live in the right corner again. HOW: same pattern, check
  // version, change the value, raise the version. IMPROVE: same migration-list idea.
  if (settings.ver < 9) { settings.side = 'right'; settings.ver = 9; }
  // WHY: one-time upgrade that set PDF quality to 'small' because the lossless mode made huge files. HOW: version check,
  // set pdfMode, bump version. It is replaced again by the next line. IMPROVE: remove old steps that the later step
  // overrides.
  if (settings.ver < 10) { settings.pdfMode = 'small'; settings.ver = 10; }       // round 10: lossless made 1 GB for 15 chapters          // round 9: the keys live in the RIGHT corner
  // ROUND 19 - THE BUILT-IN PROXY. WHY: the free public proxies (allorigins, codetabs) time out most of the time, so a visitor without his own Worker could not load
  //   anything; only the owner's own proxy worked. HOW: the owner's Cloudflare Worker is now part of EVERY visitor's list (added once by the migration below).
  //   It counts as "own" proxy everywhere (it is not in DEFAULT_PROXIES): Referer is sent, 15 s limit, used for fonts and pictures. Anyone can still add or
  //   remove proxies in Settings; "Reset" keeps it. IMPROVE: let the admin change it from the accounts server so all visitors follow.
  const BUILTIN_PROXY = 'https://mangaflow-proxy.dharmaraj-p2013.workers.dev/?url={url}';
  // round 11: the old 'small' (JPEG 92%) and 'lossless' (raw pixels) made huge files. Everybody starts on 'balanced' once; the choice is kept afterwards.
  // WHY: the old PDF modes made huge files, so everybody restarts on 'balanced' once. HOW: if version is below 11, set
  // pdfMode to 'balanced' and raise the version. IMPROVE: tell the user the default changed.
  if (settings.ver < 11) { settings.pdfMode = 'balanced'; settings.ver = 11; }
  // ROUND 18: Google becomes the default search once (the owner asked for it). It can be changed back in the engine drop-down.
  // WHY: people with older saved settings had 'auto'. HOW: version check, set the engine, bump the version. IMPROVE: none needed.
  if (settings.ver < 12) { settings.searchEngine = 'google'; settings.ver = 12; }

  // WHY: make sure settings.proxies is a real list, filling it the first time or when upgrading from the old one-proxy
  // setting. HOW: if it is not an array, start empty, add the old proxy (if it is real) and then the free defaults.
  // IMPROVE: let the user choose whether to add free proxies.
  if (!Array.isArray(settings.proxies)) {
    settings.proxies = [];
    const old = fixProxy(settings.proxy);                 // the single proxy saved by the older version
    if (old && !isExample(old)) settings.proxies.push(old);   // keep the user's own proxy, first in the list
    DEFAULT_PROXIES.forEach(p => settings.proxies.push(p));   // then add the free ones automatically
  }
  // WHY: the old single 'proxy' field is no longer used, so remove it. HOW: 'delete' removes a property from an object.
  // IMPROVE: none needed.
  delete settings.proxy;                                  // old single-proxy field is retired
  // WHY: clean the list: fix every address, drop empty or example ones, and remove duplicates. HOW: map(fixProxy) repairs,
  // filter keeps good ones, new Set removes repeats, Array.from makes a list again. IMPROVE: also check that each one is a
  // valid web address.
  settings.proxies = Array.from(new Set(settings.proxies.map(fixProxy).filter(p => p && !isExample(p))));
  // ROUND 19: one-time upgrade: put the built-in proxy FIRST for everybody (a person who removes it later keeps it removed because ver is raised).
  if (settings.ver < 13) { if (!settings.proxies.includes(BUILTIN_PROXY)) settings.proxies.unshift(BUILTIN_PROXY); settings.ver = 13; }
  // ROUND 38 — SECURITY: keepAwake must NEVER persist across page loads/refreshes/tab reopen.
  // WHY: keeping the screen awake drains battery and is a privacy risk (screen stays on after the reader walks away).
  //   The user asked for it to auto-OFF every time the page loads. HOW: after loading all saved settings, unconditionally
  //   reset keepAwake to false. The user must manually switch it ON each time they want it. The setting is NOT saved
  //   when keepAwake changes — only the other settings are saved. IMPROVE: show a small toast "Screen-awake was reset".
  settings.keepAwake = false;

  // ROUND 14: keep the screen awake while reading (optional). WHY: phones dim and lock during long reading. HOW: the Screen Wake Lock API
  // gives a "lock" object; we ask for it when the switch is on and the page is visible, and let go when either changes. A browser
  // without the API simply does nothing. IMPROVE: only hold the lock while reading mode is open.
  let wakeLock = null, wakeBusy = false;
  async function syncWake() {
    try {
      // WHY: ask the browser to keep the screen on. HOW: wakeLock.request('screen') returns a lock object we remember; no
      // support means nothing happens.
      if (settings.keepAwake && !document.hidden && 'wakeLock' in navigator) {
        // ROUND 43: syncWake runs from many events at once (switch + click + timer). Without this guard two locks were requested and the first was lost, so switching OFF left the screen on.
        if (!wakeLock && !wakeBusy) {
          wakeBusy = true;
          try { const l = await navigator.wakeLock.request('screen'); if (settings.keepAwake && !document.hidden) { wakeLock = l; l.addEventListener('release', () => { if (wakeLock === l) wakeLock = null; }); } else { await l.release(); } }
          finally { wakeBusy = false; }
        }
      }
      else if (wakeLock) { await wakeLock.release(); wakeLock = null; }
    } catch { wakeLock = null; /* refused (battery saver, not allowed): ignore */ }
  }
  // WHY: 'visibilitychange' fires when the tab is hidden/shown; 'pageshow' fires when navigating back (bfcache restore); 'focus' catches
  //   a window that was minimised and brought back. All three events can put the page back into view without a 'visibilitychange', so all
  //   three must try to re-acquire the lock. Without pageshow/focus the screen could go dark even when keepAwake is ON. ROUND 38.
  document.addEventListener('visibilitychange', syncWake);
  window.addEventListener('pageshow', syncWake);
  window.addEventListener('focus', syncWake);
  // ROUND 41 FIX — "Keep screen awake" would stop working partway through a session even though the switch was
  // still ON. WHY: a phone's own battery-saving software (several Android makers — Xiaomi, Oppo, Vivo, and others
  // — are the most aggressive about this) can quietly take the Wake Lock away from a background web page's JS
  // engine without the browser ever firing a 'visibilitychange'/'pageshow'/'focus' event for it — those three only
  // cover the cases the BROWSER itself reports, not every case the PHONE's OS can force. When that happens,
  // `wakeLock` silently becomes null (the 'release' listener in syncWake still runs) and nothing asks for it again
  // until one of those three events happens to fire, which on a phone sitting untouched on a desk might be never.
  // HOW: two safety nets, both calling the same syncWake() used everywhere else (so they fully respect the ON/OFF
  // switch and do nothing at all when it's OFF): (1) a 15-second timer that simply tries again if no lock is
  // currently held; (2) re-trying on the next tap/scroll, since a few browsers only allow asking for a NEW wake
  // lock from inside a fresh user action, not from a timer alone. Both are harmless no-ops whenever a lock is
  // already held, thanks to the `if (!wakeLock)` check already inside syncWake().
  // IMPROVE: if a specific phone still turns its screen off, that phone's own battery/app-optimisation setting for
  // this browser likely needs to be turned off by hand in the phone's Settings app — no website's code can
  // override that part of the operating system.
  setInterval(syncWake, 15000);
  document.addEventListener('touchstart', syncWake, { passive: true });
  document.addEventListener('click', syncWake, { passive: true });
  // WHY: puts the current settings onto the page and saves them. HOW: sets theme and button side as data attributes (CSS
  // reads them), sets the width as a CSS variable - -w, and updates the browser theme colour meta tag. IMPROVE: call it
  // only when something changed.
  /* ROUND 13: SHOW / HIDE THE ADD-ONS.  WHY: the slider and the wheel are optional extras; some people want a cleaner screen.
     HOW: body.no-slider / body.no-wheel hide the element and make it unusable (style.css). body.has-slider / body.has-wheel are the
          "extra is active" marks that move the other keys; they are only set while the add-on file is linked AND the setting is on,
          so with the slider off the old up/down chapter keys come back by themselves.
     IMPROVE: let the add-ons call a register() function instead of being looked up by name. */
  function applyAddons() {
    const b = document.body, sl = !!window.MangaFlowSlider && settings.showSlider !== false, wh = !!window.MangaFlowWheel && settings.showWheel !== false;
    b.classList.toggle('no-slider', settings.showSlider === false); b.classList.toggle('no-wheel', settings.showWheel === false);
    // WHY: CSS shows or hides the add-ons by these body classes. HOW: classList.toggle(name, true/false) adds or removes the
    // class.
    b.classList.toggle('has-slider', sl); b.classList.toggle('has-wheel', wh);
    // ROUND 18: the Top / End slider (edge-slider.js) replaces the Top and End keys while it is linked AND switched on; the full-screen
    // buttons follow their own switch. WHY classes: style.css does all the hiding, so switching off brings the old keys back at once.
    b.classList.toggle('has-edge', !!window.MangaFlowEdge && settings.showEdge !== false); b.classList.toggle('no-edge', settings.showEdge === false);
    b.classList.toggle('no-fs', settings.showFs === false); b.classList.toggle('fs-unsupported', !fsSupported());
    // ROUND 32: the Translate add-on (translate.js). no-translate = the button is switched off in Settings; no-tr-file = the file is not linked, so its Settings tab is hidden too.
    b.classList.toggle('no-translate', settings.showTranslate === false); b.classList.toggle('no-tr-file', !window.MangaFlowTranslate);
  }
  window.addEventListener('load', () => applyAddons());     // add-on files run after this file: fix the marks once everything is loaded
  // WHY: one place that applies every setting to the page. HOW: sets theme, width, side, add-ons, accent colour and
  // keep-awake, then saves them. IMPROVE: save only what changed.
  function applySettings() {
    document.documentElement.dataset.theme = settings.theme;
    document.documentElement.style.setProperty('--w', settings.width + 'px');
    document.body.dataset.side = settings.side;
    applyAddons();                                           // round 13: slider / wheel on or off
    // ROUND 14: the accent colour. WHY: a "pro" touch people asked for. HOW: only a plain #rrggbb value is accepted (nothing else can
    // reach the CSS), then the CSS variable --accent is changed, so every button follows. IMPROVE: also tint the dark theme.
    document.documentElement.style.setProperty('--accent', /^#[0-9a-f]{6}$/i.test(settings.accent || '') ? settings.accent : '#e8590c');
    syncWake();                                              // round 14: keep-awake on or off
    // WHY: phone browsers colour their top bar from this meta tag, so it should match the theme. HOW: finds the tag and sets
    // white or black. The 'if' skips it when the tag is missing. IMPROVE: read the real colour from CSS.
    const meta = $('meta[name="theme-color"]');
    if (meta) meta.content = settings.theme === 'dark' ? '#000000' : '#ffffff';
    // WHY: remember the choices for next visit. HOW: store.set saves the whole settings object as text. IMPROVE: save only
    // changed values.
    // ROUND 41 FIX — this used to save `settings` exactly as it was in memory, which meant that the moment the
    // "Keep screen awake" switch was turned ON, the very next call to applySettings() (it calls itself, see
    // syncWake() above) wrote `keepAwake:true` straight into localStorage — exactly what round 38's comment above
    // (search "SECURITY: keepAwake must NEVER persist") says should never happen. HOW: save a COPY of settings with
    // keepAwake forced back to false, so the live, in-memory `settings.keepAwake` (which syncWake() actually reads)
    // is untouched and the switch keeps working normally for the rest of this visit, but the version written to
    // disk always comes back OFF next time the page loads, same as round 38 intended.
    store.set('settings', Object.assign({}, settings, { keepAwake: false }));
    // ROUND 32: tell the add-ons that listen (translate.js) what the settings are now. WHY an event: the add-on does not share variables with this file. HOW: a copy of the object travels in detail.
    try { window.dispatchEvent(new CustomEvent('mf-settings', { detail: Object.assign({}, settings) })); } catch { /* an add-on must never stop the settings from saving */ }
  }
  // WHY: lets the user flip between light and dark mode. HOW: if the theme is 'dark' make it 'light', otherwise 'dark',
  // then applySettings() shows and saves it. IMPROVE: follow the device's dark mode setting at first.
  function toggleTheme() {                       // pure white  <->  pure black
    settings.theme = settings.theme === 'dark' ? 'light' : 'dark';
    applySettings();
  }

  /* ---------------------------------------------------------------
     3. FETCHING PAGES THROUGH A CORS PROXY
     WHY: Without a proxy the browser blocks the request. We ask ALL proxies at the same time and the
          first good answer wins, with a timeout so a dead proxy cannot freeze the app.
          `{url}` is replaced by the encoded page address.
     HOW: proxyList() builds the list. A local proxy at <this address>/proxy?url={url} is added automatically when
          the page itself is served from localhost (the test server in test/server.js does this; the old optional
          start-manga.bat helper did too, but it is NOT part of the uploaded files any more). POST requests (used for chapter lists) only go to proxies that
          are NOT in the free default list, because free public proxies cannot POST.
     IMPROVE: remember which proxy succeeded last and ask it first; retry with back-off. */
  // WHY: a memory of pages already fetched so going back or re-reading is instant and kinder to the proxies. HOW: a Map =
  // a list of key/value pairs, here address to HTML text. IMPROVE: expire old items by time and not only by count.
  const cache = new Map();                       // url -> html (so going back / re-reading is instant)

  // WHY: decides which proxies to ask. HOW: if the site runs on localhost, add the local launcher first. POST requests
  // skip the free default proxies because they cannot POST; GET uses all proxies. IMPROVE: put the last working proxy
  // first.
  // ROUND 19: PROXY HEALTH. WHY: a dead free proxy made every search wait 10 s per engine ("timed out after 10s" x5 engines = nearly a minute). HOW: askProxy
  // records success / failure per FREE proxy; two failures in a row put it to sleep for 5 minutes (it is skipped while another proxy exists). A success wakes it at
  // once. Your own proxies are never put to sleep. IMPROVE: show the sleeping ones in Settings > Proxies.
  const proxyHealth = new Map();                           // address -> { fails, until }
  const proxyAsleep = tpl => { const h = proxyHealth.get(tpl); return !!(h && h.until > Date.now()); };
  function proxyNote(tpl, ok) {
    if (!DEFAULT_PROXIES.includes(tpl)) return;
    const h = proxyHealth.get(tpl) || { fails: 0, until: 0 };
    if (ok) { h.fails = 0; h.until = 0; } else { h.fails++; if (h.fails >= 2) h.until = Date.now() + 300000; }
    proxyHealth.set(tpl, h);
  }
  function proxyList(forPost) {
    const local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? [location.origin + '/proxy?url={url}'] : [];
    if (forPost) return [...local, ...settings.proxies.filter(p => !DEFAULT_PROXIES.includes(p))];
    // WHY: our own proxies first, then the ones the user added. HOW: spread both lists into one new array; sleeping free proxies are left out while others remain.
    const all = [...local, ...settings.proxies], awake = all.filter(p => !proxyAsleep(p));
    return awake.length ? awake : all;
  }

  /* ROUND 29e - HUMAN CHECK ("Just a moment...", "Verify you are human").
     WHY: many sites sit behind Cloudflare. When it doubts a visitor it shows a page that only a PERSON can pass (a tick box or a puzzle). Our helper (proxy) can never pass it, and the
          person was left with a red pop-up. HOW: HUMAN_RE finds the words / script names of such a page; HUMAN_MSG is the one sentence every layer uses (isHumanCheck() tests for it);
          humanHosts remembers which sites asked (host -> { url, opened }) so the rest of the chapters of that site wait quietly instead of asking again and again.
     HONEST LIMIT: the "I am human" proof is saved in the cookies of the browser that solved it, and the helper runs somewhere else, so passing the check in a tab can not always let the helper
          in. It works when the site relaxes the check after a person passed it (very common), otherwise the person reads that chapter on the site itself. MangaFlow never solves or skips a check.
     IMPROVE: let the person paste the cookie of their own browser into Settings for ONE site (the Worker would send it along) - only with the site's permission. */
  const HUMAN_RE = /Just a moment\.\.\.|cf-browser-verification|challenge-platform|cf_chl_|cf-chl-|verify you are human|checking your browser before|enable javascript and cookies to continue|cf-turnstile|g-recaptcha|h-captcha|hcaptcha/i;
  const HUMAN_MSG = 'the site asks to verify you are human (bot check)';
  const isHumanCheck = m => /verify you are human/i.test(m || '');
  const humanHosts = new Map();                            // host -> { url, opened }: sites that asked for the check right now
  let verifyWait = null;                                   // the page-opening that is waiting for the check: { host, url, retry, opened }

  /* Ask ONE proxy. Returns the HTML or throws an Error whose message says what went wrong
     (HTTP code, timeout, blocked page). */
  // WHY: asks ONE proxy for a page and says clearly why it failed. HOW: builds the full address, fetches it with a 15
  // second timer, and checks the reply is a real page and not an empty or bot-check page. IMPROVE: make the timeout a
  // setting.
  async function askProxy(tpl, url, opt = {}) {
    const host = proxyName(tpl);
    // WHY: lets us cancel a slow request. HOW: AbortController gives a signal to fetch; calling abort() stops it. IMPROVE:
    // none needed.
    const ctrl = new AbortController();
    // WHY: a dead proxy must not freeze the app. HOW: after 15000 ms (15 s) the timer calls abort(). It is cleared in
    // 'finally' when done. IMPROVE: shorter timeout for the first try.
    // ROUND 18: the free proxies get 10 s (they were the "timed out after 15s" lines), your own proxy keeps 15 s. WHY: a dead free proxy delayed every search.
    const limit = DEFAULT_PROXIES.includes(tpl) ? 10000 : 15000;
    const timer = setTimeout(() => ctrl.abort(), limit);
    try {
      // WHY: put the page address into the proxy template. HOW: encodeURIComponent makes the address safe to place inside
      // another address. IMPROVE: none needed.
      let full = tpl.replace('{url}', encodeURIComponent(url));
      // POST requests are made by the proxy (browser -> proxy stays a plain GET, so no CORS preflight).
      // WHY: some chapter lists need a POST request. HOW: the browser still sends a plain GET to our proxy and the extra
      // method=POST and body parameters tell the proxy to POST for us. IMPROVE: use real POST when your proxy supports CORS.
      if (opt.post) full += (full.includes('?') ? '&' : '?') + 'method=POST&body=' + encodeURIComponent(opt.body || '');
      // WHY: do the actual web request. HOW: fetch() asks the address and waits; the signal lets abort() cancel it. IMPROVE:
      // send extra headers if a site needs them.
      const res = await fetch(full, { signal: ctrl.signal });
      // WHY: bad answers (404, 500 ...) must count as failures. HOW: res.ok is false for codes outside 200-299, so we throw an
      // Error with the code. IMPROVE: retry on 5xx codes.
      // ROUND 29e - "verify you are human". WHY: a site behind Cloudflare answers the proxy with HTTP 403 / 429 / 503 and a page that says "Just a moment..."; the old code only kept the number, so
      //   the person saw a red "blocked" pop-up and no way forward. HOW: for those three codes the body is read (small, in try/catch) and tested with HUMAN_RE; a match throws HUMAN_MSG, which the
      //   screens recognise (isHumanCheck) and answer with the VERIFY box. Other refusals keep the old plain "HTTP code" text. We only READ the page: nothing is solved or skipped (rule 4).
      //   IMPROVE: also look at the X-MangaFlow-Upstream header when the Worker adds a "cf-mitigated" hint.
      if (!res.ok) {
        let body = ''; if (/^(403|429|503)$/.test(String(res.status))) { try { body = (await res.text()).slice(0, 60000); } catch { /* unreadable body: the plain code is enough */ } }
        if (body && HUMAN_RE.test(body)) throw new Error(HUMAN_MSG.replace(')', ', HTTP ' + res.status + ')'));
        throw new Error('HTTP ' + res.status);
      }
      // WHY: get the page as text. HOW: res.text() reads the whole body. IMPROVE: stop reading very big pages early.
      const text = await res.text();
      // WHY: some proxies return an empty or error text with a 200 code. HOW: too short, or no HTML-looking tag, counts as
      // 'empty reply'. IMPROVE: also check the content type.
      if (text.length < 200 || !/<html|<body|<!doctype|<div|<a\s/i.test(text)) throw new Error('empty reply');
      proxyNote(tpl, true);                                // round 19: this proxy works (wakes it if it was asleep)
      // Cloudflare / bot-check pages come back "200 OK" but contain no manga, so treat them as failures.
      // WHY: Cloudflare and bot-check pages come back as 200 OK but hold no manga, so they must count as failures. HOW: look
      // for known check phrases, unless the page also has real pictures. IMPROVE: add more known phrases.
      // ROUND 29e: a "Just a moment..." page now says so plainly (HUMAN_MSG) so the screens can offer the human way; the "Attention Required" page (a plain block, nothing to solve) keeps the old text.
      if (/Just a moment\.\.\.|cf-browser-verification|Attention Required! \| Cloudflare|challenge-platform/i.test(text) && !/<img[^>]+\.(jpe?g|png|webp)/i.test(text))
        throw new Error(/Attention Required! \| Cloudflare/i.test(text) && !HUMAN_RE.test(text) ? 'blocked by bot check' : HUMAN_MSG);
      return text;
    // WHY: turn every failure into one clear message that names the proxy. HOW: catch gets the error; a timeout says 'timed
    // out after 15s', otherwise the original message is used. IMPROVE: keep the original error for debugging.
    } catch (e) {
      if (e.name === 'AbortError' || /Failed to fetch|NetworkError|HTTP 5\d\d|HTTP 40[34]/.test(e.message)) proxyNote(tpl, false);   // round 19: count failures of FREE proxies
      throw new Error(host + ': ' + (e.name === 'AbortError' ? 'timed out after ' + (limit / 1000) + 's' : e.message));
    // WHY: always stop the timer, whether we succeeded or failed. HOW: 'finally' runs in both cases. IMPROVE: none needed.
    } finally { clearTimeout(timer); }
  }

  // WHY: the main way to get a page's HTML: cached, polite, and tries all proxies at once. HOW: makes a cache key, checks
  // the cache, finds proxies, waits for a polite ticket, then Promise.any takes the first proxy that succeeds. IMPROVE:
  // remember which proxy wins.
  // ROUND 31 - ONE MORE TRY FOR A "404" WITH THE OTHER SPELLING OF THE ADDRESS. WHY: the owner's arenascan.com chapters worked before and then answered "HTTP 404" through the proxy. Many WordPress
  //   sites answer one spelling of an address with the page and the other with "404": ".../some-title-chapter-1/" works, ".../some-title-chapter-1" (no final slash) does not, or the other
  //   way round, depending on the site's rewrite rules and cache. A person (or a link, or a search result) can give either spelling. HOW: fetchHTML below first asks the address as given;
  //   ONLY when every helper says "the site itself: 404 / gone" it asks ONE more time with the final slash added or removed (slashVariant). If that works the page is used (and cached under the
  //   original address); if not, the ORIGINAL answer is reported, so a really missing page still says "not found" - only one more request per helper, never a loop.
  //   Not done for POST requests, addresses with a file ending (.php, .jpg ...), or the front page. IMPROVE: also try the "www." spelling and a search of the site by the title in the address.
  function slashVariant(url) {
    try {
      const u = new URL(url); const last = u.pathname.split('/').filter(Boolean).pop() || '';
      if (!last || /\.[a-z0-9]{2,5}$/i.test(last)) return '';                    // the front page, or an address that ends in a file name: leave it alone
      u.pathname = u.pathname.endsWith('/') ? u.pathname.replace(/\/+$/, '') : u.pathname + '/';
      return u.toString();
    } catch { return ''; }
  }
  async function fetchHTML(url, opt = {}) {
    try { return await fetchHTMLOnce(url, opt); }
    catch (e) {
      if (opt.post || opt.noVariant || !/NOT FOUND: the site itself/.test(e.message)) throw e;
      const alt = slashVariant(url); if (!alt) throw e;
      try { const text = await fetchHTMLOnce(alt, { ...opt, noVariant: true }); cache.set(url, text); return text; }   // worked with the other spelling: use it for the original address too
      catch { throw e; }                                                                                              // no luck: report the ORIGINAL answer (the real reason)
    }
  }
  async function fetchHTMLOnce(url, opt = {}) {
    // WHY: POST requests must not share a cache entry with GET of the same address. HOW: for POST the key also includes the
    // body text. IMPROVE: none needed.
    const key = opt.post ? 'POST ' + url + ' ' + (opt.body || '') : url;
    // WHY: skip the network if we already have this page. HOW: Map.has checks the key, Map.get returns the saved text.
    // IMPROVE: expire old entries.
    if (cache.has(key)) return cache.get(key);
    // WHY: get the proxies to try. HOW: !!opt.post turns the value into true or false for proxyList. IMPROVE: none needed.
    const list = proxyList(!!opt.post);
    // WHY: fail early with a helpful message if there is no proxy at all. HOW: throws different text for POST and for normal
    // requests. IMPROVE: open the Settings window automatically.
    if (!list.length) throw new Error(opt.post
      ? 'this needs your own proxy (Settings > Proxies, see worker.js)'
      : 'no proxy is set. Open Settings and add one, or press "Reset to defaults".');
    // WHY: one key per website so the politeness limit counts each site separately. HOW: 'p:' plus the host name. IMPROVE:
    // none needed.
    const gateKey = 'p:' + hostOf(url);
    // WHY: be polite: at most 4 page requests at a time per site with small gaps. HOW: gate() waits until a ticket is free
    // and gives back a release function. IMPROVE: make the numbers a setting.
    const release = await gate(gateKey, 4, 150);        // round 8: polite - a few page requests at a time per site
    // WHY: make sure the ticket is always released. HOW: try/catch/finally; 'finally' at the end calls release() even after
    // errors. IMPROVE: none needed.
    try {
      // WHY: asking all proxies together is faster than one by one. HOW: map starts askProxy for each proxy; Promise.any
      // returns the first success and only fails if all fail. IMPROVE: stop the slower requests once one wins.
      const text = await Promise.any(list.map(tpl => askProxy(tpl, url, opt)));
      // WHY: stop the cache from growing forever. HOW: if over 40 items, delete the oldest (a Map remembers insertion order,
      // so keys().next() is the oldest). IMPROVE: smarter least-recently-used removal.
      if (cache.size > 40) cache.delete(cache.keys().next().value);   // keep memory small
      // WHY: remember this page for next time. HOW: Map.set stores the text under the key. IMPROVE: none needed.
      cache.set(key, text);
      return text;
    // WHY: every proxy failed, so build one helpful error. HOW: an AggregateError holds a list in .errors; we join all the
    // messages with ' | '. IMPROVE: show which proxy was closest to working.
    } catch (agg) {
      const why = (agg.errors || [agg]).map(e => e.message).join(' | ');
      // WHY: the best advice depends on how the app was opened. HOW: if opened as a local file, say to use the web address instead;
      // otherwise suggest an own proxy. ROUND 28: the old text told people to run start-manga.bat, a helper file that is NOT part of the files you
      // upload, so the tip now names only things you really have (your own Cloudflare proxy, worker.js). IMPROVE: link straight to the Settings window.
      const tip = location.protocol === 'file:'
        ? '. Tip: you opened this as a file. Open MangaFlow through its web address (your GitHub Pages address) and add your own proxy in Settings > Proxies (worker.js).'
        : '. Tip: add your own proxy in Settings > Proxies (worker.js, free on Cloudflare) or open the page in your normal browser (see MANGAFLOW.md).';
      // WHY: if the site says 'too many requests', all further requests to it should wait. HOW: tests the message for HTTP
      // 429/503 and calls coolDown for 8 seconds. IMPROVE: wait longer after repeated refusals.
      if (/HTTP 429|HTTP 503/.test(why)) coolDown(gateKey, 8000);   // the site said "too many requests": everybody waits
      // ROUND 30: a helper got HTTP 404 / 410 and none of the others said anything else = the SITE says the page does not exist (a link to a removed manga, a guessed address). WHY: the old text told people to add their own proxy, which
      // cannot help (the owner's arenascan.com report). HOW: the message gets the marker "NOT FOUND: the site itself ..." which explain() turns into a plain title; no proxy tip. IMPROVE: offer the site's search.
      //   "Every" helper is too strict: a helper that could not be reached ("Failed to fetch", "timed out") says nothing about the page, so those answers are allowed next to the 404.
      if ((agg.errors || [agg]).some(e => /HTTP 404|HTTP 410/.test(e.message)) && (agg.errors || [agg]).every(e => /HTTP 404|HTTP 410|Failed to fetch|NetworkError|timed out/.test(e.message))) throw new Error('no proxy could load it — ' + why + ' | NOT FOUND: the site itself answers that this page does not exist.');
      // ROUND 29e: when the site asked for the human check, "add your own proxy" is the wrong advice (the check is the problem, not the proxy), so the tip is left out.
      if ((agg.errors || [agg]).some(e => isHumanCheck(e.message))) throw new Error('no proxy could load it — ' + why);
      // WHY: tell the caller that loading failed, with the reasons. HOW: throws a new Error with the joined messages and the
      // tip. IMPROVE: use a custom error type.
      throw new Error('no proxy could load it — ' + why + tip);
    } finally { release(); }
  }

  /* Parse HTML into a document and work out its <base href>.
     WHY: DOMParser builds a DOM we can query (links, images) without running the site's scripts. */
  // WHY: turn page text into a document we can search for links and images, without running the site's scripts. HOW:
  // fetchHTML, then DOMParser builds a DOM and we read its <base href> to resolve relative links. IMPROVE: cache the
  // parsed document too.
  // ROUND 27 (bug B2): fetchDoc used to accept only the address, so POST forms (round 24) were silently sent as GET. Now an optional second value
  // ({ post: true, body: 'a=1&b=2' }) is passed on to fetchHTML, which already knows how to POST through the proxy.
  async function fetchDoc(url, opt) {
    const html = await fetchHTML(url, opt);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    // WHY: relative picture links need a base address. HOW: start with the page address; a <base href> tag may replace it
    // just below.
    let base = url;
    const b = doc.querySelector('base[href]');
    if (b) { try { base = new URL(b.getAttribute('href'), url).href; } catch { /* keep url */ } }
    // WHY: give the caller the parsed page and the address that relative links must use. HOW: an object with doc and base.
    return { doc, base };
  }

  /* ---------------------------------------------------------------
     4. URL HELPERS
     WHY: absUrl turns "/ch/12" into a full address; normalizeInput decides if the user typed a
          URL or a search; unwrap removes DuckDuckGo's redirect wrapper from search results.
     IMPROVE: let users pick a search engine; handle sites that need a "Referer" or cookies. */
  // WHY: turns a relative address like '/ch/12' into a full one. HOW: new URL(u, base) joins them; returns null if it is
  // not valid. IMPROVE: none needed.
  const absUrl = (u, base) => { try { return new URL(u, base).href; } catch { return null; } };
  // WHY: check if two addresses mean the same page. HOW: drops the #part and a final slash from both, then compares the
  // text. IMPROVE: also ignore http vs https and capital letters in the host.
  const sameUrl = (a, b) => a.split('#')[0].replace(/\/$/, '') === b.split('#')[0].replace(/\/$/, '');
  // WHY: get just the site name, for politeness limits and history rows. HOW: new URL(u).hostname with 'www.' cut off;
  // empty text if invalid. IMPROVE: none needed.
  const hostOf = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
  // "example.com/manga/title" - short text for the search pill and history lines.
  // WHY: a short readable address like 'example.com/manga/title' for the search pill and history. HOW: host without www
  // plus the path when it is longer than '/'. IMPROVE: shorten very long paths.
  const shortUrl = u => { try { const x = new URL(u); return x.hostname.replace(/^www\./, '') + (x.pathname.length > 1 ? x.pathname : ''); } catch { return u; } };

  // WHY: decide whether the user typed an address or a search. HOW: trim spaces; empty gives null; starts with http gives
  // the text as is; looks like example.com/path gets https:// added; anything else becomes a DuckDuckGo search with
  // 'manga' added. IMPROVE: let users pick a search engine.
  function normalizeInput(s) {
    s = (s || '').trim();
    if (!s) return null;
    if (/^https?:\/\//i.test(s)) return s;
    if (/^[\w-]+(\.[\w-]+)+(:\d{2,5})?([\/?#]\S*)?$/.test(s)) return 'https://' + s;          // looks like example.com, example.com:8080/path (round 15: also port and ?query)
    // ROUND 16: typed words become a search on the chosen engine (first of the fallback list).
    return searchCandidates(s)[0];
  }

  /* ---------------------------------------------------------------
     4b. SEARCH ENGINES   (ROUND 16)
     WHY: DuckDuckGo's plain page sometimes answers a cloud proxy with a CAPTCHA ("are you a robot?"). MangaFlow must NEVER try
          to solve or get around a CAPTCHA (that would be unfair to the site and could break its rules). Instead it politely
          moves on to another FREE search engine, so searching still works like a normal search box.
     HOW: ENGINES lists free engines that have a simple page without JavaScript. searchCandidates() puts the engine you chose
          first and the others after it. navigate() tries them one by one and stops at the first real result page.
          Google is NOT in the list: Google blocks proxies and its rules forbid automatic searching, so Google is never fetched
          through a proxy. (Round 16 opened google.com in a new tab; since rounds 18-28b Google answers INSIDE MangaFlow through
          YOUR Programmable Search panel or, with a key, the Google API - see section 18 and googleSearch.)
     IMPROVE: add more engines (for example a SearXNG address of your own) by adding one line to ENGINES. */
  const ENGINES = {
    bing:       { name: 'Bing',       url: q => 'https://www.bing.com/search?q=' + q + '&setlang=en&cc=US' },
    mojeek:     { name: 'Mojeek',     url: q => 'https://www.mojeek.com/search?q=' + q + '&lb=en' },
    yahoo:      { name: 'Yahoo',      url: q => 'https://search.yahoo.com/search?p=' + q + '&ei=UTF-8&fl=1&vl=lang_en&vc=us' },   // round 19: English results (vl / vc)
    duckduckgo: { name: 'DuckDuckGo', url: q => 'https://html.duckduckgo.com/html/?q=' + q + '&kl=us-en' },
    brave:      { name: 'Brave',      url: q => 'https://search.brave.com/search?q=' + q + '&source=web&country=us&ui_lang=en-US' }   // round 19: Brave chose the language from the server's country; these ask for English / US
  };
  // WHY: the order used when you pick "Auto" and when the first engine fails. HOW: a plain list of ENGINES keys.
  // ROUND 17: Yahoo added (plain server-made pages) and the engines that failed most for cloud proxies moved to the end.
  const ENGINE_ORDER = ['bing', 'mojeek', 'yahoo', 'duckduckgo', 'brave'];
  // WHY: know if a typed text is a search (not an address). HOW: same two tests as normalizeInput; returns the words to search
  // (with ' manga' added when the Manga switch is on) or '' when it is an address. IMPROVE: none needed.
  // ROUND 17: extra spaces inside the words are squeezed and a very long text is cut at 300 letters (engines refuse huge addresses).
  function searchQuery(s) {
    s = (s || '').replace(/\s+/g, ' ').trim().slice(0, 300);
    if (!s || /^https?:\/\//i.test(s) || /^[\w-]+(\.[\w-]+)+(:\d{2,5})?([\/?#]\S*)?$/.test(s)) return '';
    // WHY: give back the words to search. HOW: add ' manga' unless the Everything switch is on. IMPROVE: let the person set
    // their own extra word.
    return s + (settings.searchManga === false ? '' : ' manga');
  }
  // WHY: the list of search addresses to try, best first. HOW: the chosen engine (settings.searchEngine) goes first, then the
  // rest of ENGINE_ORDER. Each item is { key, name, url }. IMPROVE: remember which engine worked last.
  function searchCandidates(words) {
    const q = encodeURIComponent(searchQuery(words) || words);
    const first = ENGINES[settings.searchEngine] ? settings.searchEngine : null;   // 'auto' or unknown = the default order
    // WHY: the chosen engine must be tried first. HOW: put it at the front and keep the others after it in their normal
    // order. IMPROVE: remember the last engine that worked.
    const keys = first ? [first].concat(ENGINE_ORDER.filter(k => k !== first)) : ENGINE_ORDER.slice();
    // WHY: each engine needs its own address. HOW: map every key to {key, name, url} with the encoded words. IMPROVE: add a
    // language option.
    const list = keys.map(k => ({ key: k, name: ENGINES[k].name, url: ENGINES[k].url(q) }));
    // The array of plain addresses is what normalizeInput needs; the objects stay available as .info
    const urls = list.map(c => c.url); urls.info = list; return urls;
  }
  // WHY: is this address a search-engine page? HOW: compare the host name with the known engine hosts. IMPROVE: none needed.
  const SEARCH_HOST = /(^|\.)(bing\.com|mojeek\.com|duckduckgo\.com|search\.brave\.com|brave\.com|yahoo\.com|google\.[a-z.]+)$/;
  const isSearchHost = u => { try { return SEARCH_HOST.test(new URL(u).hostname); } catch { return false; } };
  // WHY: tell a "prove you are human" page from a real result page. HOW: look for typical CAPTCHA words in the page text or
  // an anomaly / challenge form. Returns '' when fine, else a short reason. We only DETECT here; nothing tries to answer the
  // CAPTCHA. IMPROVE: add the words of more languages.
  function searchProblem(doc) {
    const text = ((doc.body && doc.body.textContent) || '').slice(0, 6000);
    if (/captcha|unusual traffic|are you (a )?(human|robot)|verify you are|not a robot|anomaly|select all (the )?(squares|images)|complete the (challenge|puzzle)|bots use duckduckgo/i.test(text) || doc.querySelector('form[action*="anomaly"],.anomaly-modal__modal,#challenge-form,[class*="captcha" i]')) return 'asked for a CAPTCHA';
    // WHY: nothing suspicious found. HOW: an empty text means this is a real page. IMPROVE: none needed.
    return '';
  }

  /* ---------------------------------------------------------------
     4c. OWN RESULTS PAGE   (ROUND 17)
     WHY: the engines' own pages need their scripts and style sheets, so inside the mini browser they looked broken, showed the
          wrong part of the page, or filled the screen with adverts. A clean list made by MangaFlow always fits the screen.
     HOW: parseResults() reads the result links (title, address, short text) out of the engine page with a rule per engine and a
          general fallback; resultsPage() builds a small page of cards from them (nothing from the engine's page is run).
          "Original page" under the list still opens the engine's own page. Only the title and the first words of the text are
          taken; the real page opens when you tap a card.
     IMPROVE: add more rules when an engine changes its page (the fallback keeps working meanwhile). */
  // WHY: escape text so a title can never become code. HOW: replace the five special letters. IMPROVE: none needed.
  const escHtml = t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // WHY: short one-line text. HOW: squeeze spaces and cut with '…' at n letters. IMPROVE: cut at a word end.
  const clipText = (t, n) => { t = (t || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
  // WHY: where the results are on each engine's page. HOW: item = one result box, link = its title link, snip = its text.
  const RESULT_RULES = [
    { host: /bing\.com$/,       item: 'li.b_algo',                                           link: 'h2 a',                    snip: '.b_caption p, .b_lineclamp2, p' },
    { host: /mojeek\.com$/,     item: 'ul.results-standard > li, li.r',                      link: 'a.title, h2 a',           snip: 'p.s, p' },
    // WHY: DuckDuckGo result boxes use these names. HOW: item = result box, link = title link, snip = text. IMPROVE: update
    // when the page changes.
    { host: /duckduckgo\.com$/, item: '.result, .web-result',                                link: 'a.result__a',             snip: '.result__snippet' },
    // WHY: Brave result boxes use these names. HOW: same three selectors as the other lines. IMPROVE: Brave builds much of
    // its page by script, so the fallback may be needed.
    { host: /brave\.com$/,      item: '.snippet[data-type="web"], #results .snippet',         link: 'a[href^="http"]',         snip: '.snippet-description, .content, .description' },
    // WHY: Yahoo result boxes use these names. HOW: same three selectors as the other lines. IMPROVE: update when the page
    // changes.
    { host: /yahoo\.com$/,      item: 'div.algo, li div.dd.algo, .algo-sr',                  link: 'h3 a, a',                 snip: '.compText p, p' }
  ];
  // WHY: turn an engine page into a plain list [{ title, url, snip }]. HOW: use the engine rule first; when it finds fewer than 3
  // results use ANY link with a long enough text (the fallback). Adverts, engine-internal links and repeats are skipped.
  function parseResults(doc, url, base) {
    let host = ''; try { host = new URL(url).hostname; } catch { /* no host */ }
    const out = [], seen = new Set();
    // WHY: one small helper that adds a result if it is good. HOW: add(a, snipEl) gets the link and the text box. IMPROVE:
    // none needed.
    const add = (a, snipEl) => {
      // WHY: read the link address as written in the page. HOW: getAttribute gives the text, empty if missing. IMPROVE: none
      // needed.
      const raw = a.getAttribute('href') || '';
      // WHY: skip links that are not websites (page jumps, javascript:, mail, phone). HOW: a pattern test, then return.
      // IMPROVE: none needed.
      if (!raw || raw.startsWith('#') || /^(javascript|mailto|tel):/i.test(raw)) return;
      // WHY: make a full address from a relative one. HOW: absUrl joins it with the page address; skip if invalid. IMPROVE:
      // none needed.
      const abs = absUrl(raw, base || url); if (!abs) return;
      // WHY: open the real site, not the engine's redirect address. HOW: unwrap() reads the real address out of it. IMPROVE:
      // none needed.
      const real = unwrap(abs);
      if (!/^https?:/i.test(real) || isSearchHost(real) || /\/aclick|\/y\.js|[?&]ad_(domain|provider)=|\/ads?\//i.test(real)) return;
      // WHY: show each site only once. HOW: a Set remembers the address without its # part. IMPROVE: also treat www and
      // non-www as the same.
      const key = real.replace(/#.*$/, ''); if (seen.has(key)) return;
      // WHY: a result needs a readable title. HOW: take the link text cut to 140 letters; skip if shorter than 3. IMPROVE: use
      // the page title if the text is empty.
      const title = clipText(a.textContent, 140); if (title.length < 3) return;
      // WHY: keep the result. HOW: push title, real address and a short text (the title is removed from the text). IMPROVE:
      // none needed.
      seen.add(key); out.push({ title, url: real, snip: clipText(snipEl && snipEl !== a ? snipEl.textContent.replace(title, '') : '', 320) });
    };
    // WHY: pick the rule for this engine. HOW: find the first rule whose host pattern matches. IMPROVE: none needed.
    const rule = RESULT_RULES.find(r => r.host.test(host));
    // WHY: read the results with the engine's own rule. HOW: for each result box find the title link and the text, then
    // add(). IMPROVE: none needed.
    if (rule) doc.querySelectorAll(rule.item).forEach(it => { const a = it.querySelector(rule.link); if (a) add(a, it.querySelector(rule.snip)); });
    // WHY: fallback when the rule found fewer than 3 results (the engine changed its page). HOW: look at every link on the
    // page. IMPROVE: none needed.
    if (out.length < 3) doc.querySelectorAll('a[href]').forEach(a => {
      // WHY: stop at 40 results and skip short link texts such as menu words. HOW: two simple checks, then return. IMPROVE:
      // make 12 a setting.
      if (out.length >= 40 || (a.textContent || '').trim().length < 12) return;
      // WHY: the text under a link is in its box. HOW: closest() finds the nearest list item, article or div and add() uses
      // it. IMPROVE: none needed.
      const box = a.closest('li, article, .result, div'); add(a, box);
    });
    // WHY: never show more than 40 cards. HOW: slice keeps the first 40. IMPROVE: add a next-page button.
    return out.slice(0, 40);
  }
  // WHY: the address of the typed words on an engine page (to show and to link to the other engines). HOW: read the q or p parameter.
  function queryOf(url) { try { const x = new URL(url); return x.searchParams.get('q') || x.searchParams.get('p') || ''; } catch { return ''; } }
  // WHY: build the clean results page. HOW: one small HTML text with its own style (phone first), the cards, the engine chips and
  // a short note; then DOMParser makes a document of it. via = engine name, engineUrl = the engine's own address, items = results,
  // log = lines about engines that failed (shown small at the bottom when nothing was found). IMPROVE: next-page button.
  function resultsPage(q, via, engineUrl, items, log, note) {
    const dark = settings.theme === 'dark', enc = encodeURIComponent(q);
    const chip = (href, label, on) => '<a class="chip' + (on ? ' on' : '') + '" href="' + escHtml(href) + '">' + escHtml(label) + '</a>';
    // ROUND 28b: the Google chip no longer carries the "↗" (= opens another tab): since round 28b a google.com/search address is searched INSIDE MangaFlow with or without an API key.
    const chips = Object.keys(ENGINES).map(k => chip(ENGINES[k].url(enc), ENGINES[k].name, ENGINES[k].name === via)).join('') + chip('https://www.google.com/search?q=' + enc, 'Google', false);
    // WHY: one card per result. HOW: show host + path under the title (cut to 70 letters). IMPROVE: show a small site icon.
    const cards = items.map(r => { let u = ''; try { const x = new URL(r.url); u = x.hostname.replace(/^www\./, '') + (x.pathname.length > 1 ? x.pathname : ''); } catch { u = r.url; }
      // WHY: the card is a link. HOW: every piece of text goes through escHtml so it cannot become code. IMPROVE: none needed.
      return '<a class="card" href="' + escHtml(r.url) + '"><b>' + escHtml(r.title) + '</b><i>' + escHtml(clipText(u, 70)) + '</i>' + (r.snip ? '<p>' + escHtml(r.snip) + '</p>' : '') + '</a>'; }).join('');
    // WHY: a friendly box when there is nothing to show. HOW: the text depends on whether engines failed or just found
    // nothing. IMPROVE: none needed.
    const empty = '<div class="none"><b>No results to show.</b><p>' + (log && log.length ? 'The free search engines did not answer from here (they sometimes refuse cloud proxies). Try another engine below, open Google in a new tab, or try again in a minute.' : 'This engine found nothing for these words. Try other words or another engine below.') + '</p></div>';
    // WHY: the style of the list: light or dark like the app. HOW: one text of CSS rules, colours chosen from
    // settings.theme. IMPROVE: move the CSS to style.css.
    const css = 'html,body{margin:0;padding:0}body{font:16px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:' + (dark ? '#14151a' : '#f4f5f8') + ';color:' + (dark ? '#e8e8ee' : '#1b1d24') + '}' +
      // WHY: keep everything inside the screen. HOW: box-sizing, max width 760 px, and 150 px free space at the bottom for the
      // floating buttons. IMPROVE: none needed.
      'main{box-sizing:border-box;max-width:760px;margin:0 auto;padding:14px 12px 150px}h1{font-size:1.05rem;margin:2px 0 4px;overflow-wrap:anywhere}.via{font-size:.8rem;opacity:.7;margin:0 0 10px}' +
      // WHY: the engine buttons (chips). HOW: wrapping row of round buttons; .on marks the engine in use. IMPROVE: none
      // needed.
      '.chips{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 12px}.chip{padding:6px 12px;border-radius:999px;border:1px solid ' + (dark ? '#3a3d4a' : '#cfd3de') + ';font-size:.82rem;text-decoration:none;color:inherit;background:' + (dark ? '#1d1f27' : '#fff') + '}.chip.on{background:#e8590c;border-color:#e8590c;color:#fff}' +
      // WHY: the result cards. HOW: rounded boxes with a border, text that wraps long words. IMPROVE: none needed.
      '.card{display:block;box-sizing:border-box;padding:12px 14px;margin:0 0 10px;border-radius:14px;background:' + (dark ? '#1d1f27' : '#fff') + ';border:1px solid ' + (dark ? '#2c2f3b' : '#e2e5ee') + ';text-decoration:none;color:inherit;overflow-wrap:anywhere}' +
      // WHY: card text styles. HOW: blue title, green address, grey-ish text. IMPROVE: none needed.
      '.card b{display:block;font-size:1rem;color:' + (dark ? '#8ab4ff' : '#1a56c4') + '}.card i{display:block;font-style:normal;font-size:.78rem;color:' + (dark ? '#7fd49a' : '#1b7a3d') + ';margin:2px 0 4px}.card p{margin:0;font-size:.88rem;opacity:.85}' +
      // WHY: the empty-state box and the small footer. HOW: plain padding and smaller text. IMPROVE: none needed.
      '.none{padding:18px;border-radius:14px;background:' + (dark ? '#1d1f27' : '#fff') + ';margin:0 0 12px}.none p{margin:6px 0 0;opacity:.8}.foot{font-size:.78rem;opacity:.7;margin-top:14px;overflow-wrap:anywhere}.foot a{color:inherit}' +
      // ROUND 28: the yellow note ("Google found nothing ... because your engine only searches the sites you listed"). WHY: the person must see WHY the free engines answered. HOW: a soft yellow box.
      '.gnote{padding:12px 14px;border-radius:14px;margin:0 0 12px;background:' + (dark ? '#2a2417' : '#fff7e0') + ';border:1px solid ' + (dark ? '#5a4a1c' : '#f0d58a') + '}.gnote p{margin:6px 0 0;font-size:.88rem;opacity:.9}';
    // WHY: the whole page as one text. HOW: doctype, phone viewport, the style and the start of the body. IMPROVE: none
    // needed.
    const html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + escHtml(q) + ' - search</title><style>' + css + '</style></head><body><main>' +
      // WHY: title, the 'via' line and the engine buttons. HOW: values are escaped; cards or the empty box follow. IMPROVE:
      // none needed.
      '<h1>' + escHtml(q) + '</h1><p class="via">' + (items.length ? items.length + ' results via ' + escHtml(via) : 'Search') + '</p><div class="chips">' + chips + '</div>' +
      (note ? '<div class="gnote"><b>Google found nothing for these words.</b><p>' + escHtml(note) + '</p></div>' : '') + (items.length ? cards : empty) +
      // WHY: a way to see the engine's own page and the reasons when engines failed. HOW: a link ending in #mf-raw and a
      // collapsed details box. IMPROVE: none needed.
      '<p class="foot">' + (engineUrl ? '<a href="' + escHtml(engineUrl) + '#mf-raw">Show the original ' + escHtml(via) + ' page</a>' : '') + (log && log.length ? '<details><summary>Details (for a bug report)</summary>' + escHtml(log.join(' | ')) + '</details>' : '') + '</p></main></body></html>';
    // WHY: make a real document from the text. HOW: DOMParser parses it without running anything. IMPROVE: none needed.
    return new DOMParser().parseFromString(html, 'text/html');
  }

  // WHY: search engines wrap result links in their own redirect address and we want the real site. HOW: DuckDuckGo keeps it in the
  // 'uddg' parameter; Bing in 'u' (a1 + base64url); Yahoo after 'RU=' in the path; Google in 'q' of /url. Anything else is returned unchanged.
  // IMPROVE: add other engines when you add them to ENGINES.
  function unwrap(u) {
    try {
      const x = new URL(u);
      // WHY: DuckDuckGo wraps links as /l/?uddg=. HOW: test the host and the path start. IMPROVE: none needed.
      if (/duckduckgo\.com$/.test(x.hostname) && x.pathname.startsWith('/l/')) {
        // WHY: the real address is in the 'uddg' parameter. HOW: read it and return it when present. IMPROVE: none needed.
        const t = x.searchParams.get('uddg'); if (t) return t;
      }
      // ROUND 16: Bing wraps result links as bing.com/ck/a?...&u=a1<base64url address>. HOW: cut the leading 'a1', turn the
      // base64url letters back into normal base64, decode with atob; keep it only if it is a real http(s) address.
      if (/(^|\.)bing\.com$/.test(x.hostname) && x.pathname.startsWith('/ck/')) {
        const b = (x.searchParams.get('u') || '').replace(/^a1/, '').replace(/-/g, '+').replace(/_/g, '/');
        if (b) { const t = atob(b + '==='.slice((b.length + 3) % 4)); if (/^https?:\/\//i.test(t)) return t; }
      }
      // ROUND 17: Yahoo wraps links as r.search.yahoo.com/.../RU=<encoded address>/RK=... and Google as google.com/url?q=<address>.
      if (/(^|\.)yahoo\.com$/.test(x.hostname)) { const m = x.pathname.match(/\/RU=([^/]+)/); if (m) { const t = decodeURIComponent(m[1]); if (/^https?:\/\//i.test(t)) return t; } }
      if (/(^|\.)google\.[a-z.]+$/.test(x.hostname) && x.pathname === '/url') { const t = x.searchParams.get('q') || x.searchParams.get('url'); if (t && /^https?:\/\//i.test(t)) return t; }
    } catch { /* not an address or bad encoding: keep it as it is */ }
    // WHY: not a search-engine redirect, so use the address as it is. HOW: return it unchanged.
    return u;
  }

  /* ---------------------------------------------------------------
     5. ERRORS (BIG POP-UP), TOAST, BUSY, LOADING BAR   (rewritten in round 8)
     WHY: slow proxies feel broken without feedback, and a problem that is only a tiny red line is easy to miss.
          Round 8 turns every problem into a BIG pop-up in the middle of the screen (a modal <dialog>) with
            1. a title and the problem in one plain sentence,
            2. a hint that says what you can do,
            3. a full report you can copy and send to Claude (page address, proxies, what was happening, browser).
     HOW: showError(message, { title, hint, details }) builds the pop-up. explain(message) picks the title and hint
          by looking for key words (bot check, 403, "no images" ...). The same message is not shown again for
          8 seconds, so one broken site cannot bury you in pop-ups. If a pop-up is already open, new problems are
          added to its report instead of opening another one.
          The error handlers at the very bottom of this file (section 16) send EVERY unexpected crash here too.
     IMPROVE: add a "Retry" button that repeats the action that failed, and a "download report" button. */
  // WHY: remembers when each error text was last shown so one broken site cannot flood the screen with pop-ups. HOW: a Map
  // of message to time in milliseconds. IMPROVE: count repeats and show 'happened 5 times'.
  const errSeen = new Map();                      // message -> time it was last shown (to stop pop-up floods)
  // WHY: keeps the last 20 reports so Settings can list recent problems. HOW: a plain array; old items are removed from
  // the front. IMPROVE: save it so it survives reload.
  const errLog = [];                              // round 11: the last 20 reports, shown in Settings > Troubleshoot ("Recent problems")

  // WHY: turns a technical message into a friendly title and a hint on what to do. HOW: checks the message against key
  // words (regular expressions) in a fixed order and returns the first matching { title, hint }. IMPROVE: move the texts
  // into a table to keep this short.
  function explain(msg) {
    const m = msg || '';
    // WHY: bot checks, blocks and rate limits need their own explanation. HOW: the test looks for words like cloudflare or
    // HTTP 403/429/503, ignoring capitals. The next lines return the pop-up title and hint. IMPROVE: add a
    // retry-in-N-minutes timer.
    // ROUND 29e: the site asks the person to prove they are human. WHY: that is a step the person can take, not a "blocked" dead end. HOW: isHumanCheck() finds the sentence HUMAN_MSG.
    if (isHumanCheck(m))
      return { title: '\u{1F9D1} The site wants you to prove you are human',
        hint: 'The site shows a check ("Just a moment...", "Verify you are human") that only a person can pass. Open the page on the site, pass the check there, then come back and try again. MangaFlow never solves or skips such a check. If the page still asks after you passed it, the site also refuses helpers like MangaFlow\'s proxy: read that page on the site itself.' };
    if (/bot check|cloudflare|just a moment|HTTP 40[13]|HTTP 429|HTTP 503|did not let MangaFlow in|slowing down/i.test(m))
      return { title: '\u{1F6AB} The site is blocking MangaFlow',
        hint: (/workers\.dev[^|]*HTTP 40[13]/i.test(m) ? 'Your own proxy was refused with HTTP 403: the site blocks cloud addresses (Cloudflare Workers and free proxies). On a phone nothing inside MangaFlow can change that; sites that load their pictures with scripts (for example comix.to) are not supported. ' : '') + 'This site uses bot protection or limits how fast pages can be read. MangaFlow already reads politely (only a few requests at a time, with small pauses) and it does NOT try to get around protection checks. What you can do: wait a few minutes and press Retry, add your own proxy in Settings > Proxies (worker.js), or open the chapter in your normal browser (your own home connection is trusted more than a cloud proxy).' };
    // WHY: locked chapters (login or coins) need a clear honest message. HOW: matches the words LOCKED or 'login, coins' and
    // returns a title and hint. IMPROVE: show which part of the page looked locked.
    // ROUND 30: the site answered a chapter address with the manga's main page. Placed BEFORE the locked rule because its text also says "locked".
    // ROUND 30: the site itself says "404 / gone". Placed before the network rule, whose text ("no proxy could load it") this message also contains.
    if (/NOT FOUND: the site itself/.test(m))
      return { title: '\u{1F50D} The page was not found (HTTP 404)',
        hint: 'The site itself answered that this address does not exist (every helper got the same answer, so it is not a proxy problem). The link may be old or wrong, or the site moved the manga. Search for the manga by name on the start page, or open the site\'s own page for it. Some sites also answer 404 to helpers they do not trust; if the page opens in your normal browser, tell Claude with the report below.' };
    if (/MAIN PAGE \(series page\)/.test(m))
      return { title: '\u{1F4C4} The site sent the main page, not the chapter',
        hint: 'The address of the chapter answered with the manga\'s main page. Usually the chapter is locked, removed or needs a login on that site, and the site sends you back to the main page. MangaFlow does not show the main page\'s pictures as a chapter and does not log in for you. Open the chapter on the site itself; the report below says what the page contained.' };
    if (/LOCKED|login, coins/i.test(m))
      return { title: '\u{1F512} This chapter looks locked',
        hint: 'The page asks for a login, coins or a premium account before it shows the pictures. MangaFlow cannot log in for you and does not bypass that. If you own access, read this chapter on the site itself. Chapters that are free still work. The report below shows what the page contained.' };
    // ROUND 28: only part of a chapter could be found. WHY: a plain explanation instead of "something went wrong". HOW: matches the message of partialNote().
    if (/^Only \d+ of \d+ pictures/i.test(m))
      return { title: '\u{1F5BC} Only part of the chapter was found',
        hint: 'The page lists more pictures than it gives addresses for. Most sites fill the missing addresses in with their own JavaScript, which MangaFlow never runs (a safety rule). If the report says the encrypted-chapter marker is true, the site hides its pictures on purpose and MangaFlow does not break that. Use Open on the site, or copy this report to Claude with the address.' };
    // WHY: when a page has no chapters or pictures the user needs to know why. HOW: matches the 'no images' style messages
    // and returns the title and hint. IMPROVE: add a button that copies the report.
    if (/no chapters or chapter images|no images found|no pictures found/i.test(m))
      return { title: '\u{1F5BC} No chapters or pictures found',
        hint: 'The page loaded, but this site builds its chapters or pictures with JavaScript (or hides them), so MangaFlow could not see them. Copy the report below and send it to Claude together with the address of the site: it can be added as a special rule. The report already says what was (and was not) found on the page.' };
    // WHY: network failures get one friendly explanation. HOW: matches proxy and fetch failure words, then returns the title
    // and hint. IMPROVE: add a button to open Settings.
    if (/no proxy could load|no proxy is set|failed to fetch|networkerror|timed out|empty reply/i.test(m))
      return { title: '\u{1F310} Could not reach the page',
        hint: 'No proxy could fetch the page. Free public proxies are slow and often blocked. Add your own free Cloudflare proxy (worker.js) in Settings > Proxies, or press "Test all" there to see which proxy still works. Then try again.' };
    // WHY: making a big PDF can run out of memory, and the fix is different. HOW: matches memory-related words and returns
    // advice to download fewer chapters or use smaller pictures. IMPROVE: auto-lower the quality.
    if (/allocation|out of memory|quota|array buffer|memory/i.test(m))
      return { title: '\u{1F4BE} Not enough memory',
        hint: 'The device ran out of memory while making the PDF. Download fewer chapters per file (choose "a new file every 25 chapters" in the download window), or pick the "Small" or "Tiny" picture quality in the download window.' };
    // WHY: PDF problems get their own help text. HOW: matches pdf/download words and returns the title and hint. IMPROVE:
    // list the failed chapters directly in the hint.
    if (/pdf|download|could not be downloaded|pages? (are|is) missing/i.test(m))
      return { title: '⬇ Download problem',
        hint: 'The PDF could not be finished completely. The list below says which chapters or pages failed. You can press Retry (start the download again) for just those chapters. Reading mode is not affected.' };
    // WHY: explains security blocks from the browser. HOW: matches 'browser blocked' or 'security' and returns the title and
    // hint. IMPROVE: say which rule blocked it.
    if (/browser blocked|security/i.test(m))
      return { title: '\u{1F6E1} Security protection triggered',
        hint: 'MangaFlow only runs its own code. Something tried to load or run code that is not allowed and the browser stopped it. That is the protection working. If you do not use a browser add-on that does this, close the page and send this report to Claude.' };
    // WHY: the fallback when no rule matched. HOW: returns a general title and a hint to copy the report. IMPROVE: add more
    // specific rules over time.
    return { title: '⚠ Something went wrong',
      hint: 'Copy the report below and send it to Claude. It lists what happened and where.' };
  }

  // WHY: the single place every problem goes through to show a big pop-up with a copyable report. HOW: makes the message
  // text, skips repeats within 8 seconds, builds the report, stores it and shows the dialog. IMPROVE: add a Retry button.
  function showError(msg, extra = {}) {
    // WHY: make sure we always have a text, even if something odd was passed in. HOW: String() converts any value to text;
    // empty becomes 'Unknown problem'. IMPROVE: none needed.
    msg = String(msg || 'Unknown problem');
    const now = Date.now();
    // WHY: stop pop-up floods. HOW: if the same text was shown less than 8000 ms ago, return without doing anything.
    // IMPROVE: none needed.
    if (errSeen.get(msg) && now - errSeen.get(msg) < 8000) return;      // same problem again very soon: ignore
    errSeen.set(msg, now);
    // WHY: keep the memory of shown messages small. HOW: over 60 items, delete the oldest key. IMPROVE: none needed.
    if (errSeen.size > 60) errSeen.delete(errSeen.keys().next().value);
    // WHY: get the friendly title and hint for this message. HOW: calls explain(). IMPROVE: none needed.
    const ex = explain(msg);
    // WHY: put the running download jobs in the report. HOW: 'typeof jobs' check avoids a crash if the variable is not
    // defined yet; map builds a text for each job. IMPROVE: show less detail for old jobs.
    const openJobs = typeof jobs !== 'undefined' ? jobs.map(j => '#' + j.id + ' ' + j.status + ' ' + (j.pct || 0) + '% "' + (j.text || '') + '"').join(' | ') : '';
    // WHY: the report is what the user copies and sends to get help. HOW: an array of text lines joined with new lines:
    // time, problem, page, reading state, downloads, proxies, browser, extra details. IMPROVE: hide private parts of
    // addresses.
    const report = [
      'MangaFlow error report (build round 60)',
      'Time: ' + new Date().toString(),
      // WHY: the lines of the error report the person can copy. HOW: each line is 'Label: value'; they are joined with new
      // lines at the end.
      'Problem: ' + msg,
      'App page: ' + location.href,
      'Manga page open: ' + (typeof cur !== 'undefined' && cur ? cur.url : '-'),
      // WHY: say what the person was reading when the error happened. HOW: title and chapter number, or 'not reading'; typeof
      // checks avoid a crash when the reader was never opened.
      'Reading: ' + (typeof R !== 'undefined' && R.chapters && R.chapters.length ? R.title + ' | chapter ' + (R.cur + 1) + ' of ' + R.chapters.length : 'not reading'),
      'Downloads: ' + (openJobs || 'none'),
      'Proxies: ' + (settings.proxies.length ? settings.proxies.map(proxyName).join(', ') : 'NONE'),
      'Browser: ' + navigator.userAgent,
      extra.details ? '\nDetails:\n' + extra.details : ''
    ].join('\n');
    // WHY: lets Settings show recent problems. HOW: push the new report and drop the oldest when there are more than 20.
    // IMPROVE: save to storage.
    errLog.push({ at: Date.now(), msg, report }); if (errLog.length > 20) errLog.shift();   // round 11: remembered for the troubleshooter
    // ROUND 14: tell profiles.js (if linked) about the report, so a signed-in person can send it to the admin with one tap.
    try { window.dispatchEvent(new CustomEvent('mf-bug', { detail: { title: extra.title || ex.title, report, page: location.href } })); } catch { /* never break error display */ }
    // WHY: the pop-up dialog element on the page. HOW: $ finds it by id. IMPROVE: none needed.
    const box = $('#errbox');
    // WHY: if the pop-up is already open, add the new problem into it instead of opening a second one. HOW: box.open is true
    // when shown; append to the report text box and stop. IMPROVE: show a counter badge.
    if (box.open) { $('#errText').value += '\n\n----- another problem -----\n' + report; return; }   // already on screen: add to it
    // WHY: fill the pop-up with text and show it. HOW: textContent (never HTML) sets title, summary (cut at 320 characters)
    // and hint; the report goes into a text area. Then showModal opens it, with a fallback attribute. IMPROVE: focus the
    // Copy button.
    $('#errTitle').textContent = extra.title || ex.title;
    $('#errSummary').textContent = msg.length > 320 ? msg.slice(0, 320) + '…' : msg;
    $('#errHint').textContent = extra.hint || ex.hint;
    // WHY: show the report in the pop-up. HOW: set the text area value, then open the dialog (with a fallback if showModal
    // is missing).
    $('#errText').value = report;
    try { box.showModal(); } catch { box.setAttribute('open', ''); }
  }
  // WHY: remembers the timer so a new toast can cancel the old one. HOW: a variable holding the setTimeout id. IMPROVE:
  // none needed.
  let toastTimer;
  // WHY: shows a small message at the bottom, or the big pop-up for errors. HOW: if isErr is true, call showError.
  // Otherwise show the text and hide it again after 3200 ms. IMPROVE: allow a queue of toasts.
  function toast(msg, isErr, extra) {
    if (isErr) { showError(msg, extra); return; }
    const t = $('#toast');
    // WHY: show a short message at the bottom. HOW: set the text and the 'show' class (CSS fades it in); a timer removes it
    // again.
    t.textContent = msg; t.className = 'show';
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.className = ''; }, 3200);
  }
  // WHY: shows or hides a 'working...' note while something loads. HOW: no message hides the element; a message shows it
  // with that text. IMPROVE: add a spinning icon.
  function setBusy(msg) {
    const b = $('#busy');
    if (!msg) { b.hidden = true; return; }
    // WHY: a small banner for the person. HOW: unhide it and set its text.
    b.hidden = false; b.textContent = msg;
    clearTimeout(setBusy.t); setBusy.t = setTimeout(() => { b.hidden = true; }, 120000);   // ROUND 57: a working note never stays longer than 2 minutes
  }
  // WHY: the thin loading bar at the top of the page. HOW: classList.toggle adds the 'on' class when on is true, removes
  // it when false. IMPROVE: show real progress.
  const setLoading = on => $('#loadbar').classList.toggle('on', on);

  /* A site that says "no" (403 / 429 / bot check) gets ONE pop-up per minute, not one per chapter. */
  // WHY: remembers when each site was last reported as blocking us. HOW: a Map of host name to time. IMPROVE: none needed.
  const blockedSeen = new Map();
  // WHY: a site that blocks us gets only ONE pop-up per minute, not one per chapter. HOW: if this host was reported less
  // than 60000 ms ago return; otherwise remember the time and call showError. IMPROVE: make the minute a setting.
  function reportBlocked(url, msg) {
    const h = hostOf(url), now = Date.now();
    if (now - (blockedSeen.get(h) || 0) < 60000) return;
    // WHY: remember when this blocked site was last reported, so the same message is not shown again and again. HOW: a Map
    // host -> time.
    blockedSeen.set(h, now);
    showError('The site ' + h + ' did not let MangaFlow in: ' + msg);
  }

  /* ROUND 29e - the human-check helpers (see the long comment at HUMAN_RE). Three places use them: navigate() (a page you open), fillChapter() (chapters while reading) and
     startReading() (the chapter list). All of them end here: ONE way for the person to pass the check, ONE way back. */
  // WHY: close the verify dialog and forget the waiting page. HOW: close() with a fallback for old browsers. IMPROVE: none needed.
  function closeVerify() { const b = $('#verifyBox'); try { b.close(); } catch { b.removeAttribute('open'); } verifyWait = null; }
  // WHY: a page you opened asked for the check: tell the person what to do. HOW: remember what to run again (retry), fill the text, open the dialog. IMPROVE: remember several waiting pages.
  function humanCheckBox(url, retry) {
    const host = hostOf(url);
    verifyWait = { host, url, retry, opened: false };
    $('#vfText').textContent = host + ' wants to be sure you are a person before it shows this page. That check can only be done by you, on the site itself.';
    const box = $('#verifyBox');
    if (!box.open) { try { box.showModal(); } catch { box.setAttribute('open', ''); } }
  }
  // WHY: the person must pass the check on the real site. HOW: open it in a NEW tab (noopener = the site gets no handle on MangaFlow) and mark "opened", so coming back retries. IMPROVE: none needed.
  function openHumanSite(url, rec) {
    rec.opened = true;
    try { window.open(url, '_blank', 'noopener,noreferrer'); } catch { /* a blocked pop-up: the toast below still tells what to do */ }
    toast('Pass the check on the site, then come back here. MangaFlow tries again by itself. (No tab? Allow pop-ups for this page.)');
  }
  // WHY: a chapter box that waits for the check (reading mode). HOW: a message plus the same two buttons as the dialog; the host is remembered in humanHosts so the other chapters wait quietly.
  // IMPROVE: show only the first box in full and make the others one line.
  function verifyNote(sec, i, ch) {
    const host = hostOf(ch.url);
    const rec = humanHosts.get(host) || { url: ch.url, opened: false }; rec.at = Date.now(); humanHosts.set(host, rec);
    const box = document.createElement('div'); box.className = 'ch-msg ch-verify';
    box.append(labelFor(i) + ' is waiting: ' + host + ' wants you to prove you are human. Open the site, pass the check there, then come back: MangaFlow loads the waiting chapters again by itself. (MangaFlow never solves or skips the check.)');
    const row = document.createElement('div'); row.className = 'row';
    const open = document.createElement('button'); open.type = 'button'; open.className = 'vf-open'; open.textContent = '\u{1F517} Open the site';
    open.onclick = () => openHumanSite(ch.url, rec);
    const retry = document.createElement('button'); retry.type = 'button'; retry.className = 'vf-retry primary'; retry.textContent = 'I did it \u2013 try again';
    retry.onclick = () => humanRetryHost(host);
    row.append(open, retry); box.appendChild(row);
    return box;
  }
  // WHY: load every waiting chapter of one site again. HOW: forget the flag, then load the nearest chapter FIRST on its own; if the site still asks, stop there (one request, no hammering);
  // if it let us in, the rest load three at a time. IMPROVE: none needed.
  async function humanRetryHost(host) {
    humanHosts.delete(host);
    if (!R || !R.chapters || !R.chapters.length) return;
    const gen = R.gen;
    const waiting = $$('#stream .chapter').filter(x => x.dataset.verify === '1' && R.chapters[+x.dataset.index] && hostOf(R.chapters[+x.dataset.index].url) === host)
      .sort((a, b) => Math.abs(a.dataset.index - R.cur) - Math.abs(b.dataset.index - R.cur));
    if (!waiting.length) return;
    const one = x => { const i = +x.dataset.index; cache.delete(R.chapters[i].url); return fillChapter(x, i, gen).catch(() => {}); };
    await one(waiting[0]);
    if (humanHosts.has(host) || gen !== R.gen) return;                  // still checked: that was the only request
    let k = 1;
    const run = async () => { while (k < waiting.length && gen === R.gen && !humanHosts.has(host)) { const x = waiting[k++]; if (x.isConnected) await one(x); } };
    await Promise.all([run(), run(), run()]);
  }
  // WHY: the person comes back from the site tab: try again without pressing anything. HOW: when the tab is visible again, every site / page marked "opened" is retried once (0.6 s later, so the
  // browser has settled). The mark is cleared first, so two events (visibilitychange + focus) retry only once and a person who comes back WITHOUT passing the check does not loop. IMPROVE: none needed.
  function humanReturn() {
    if (document.visibilityState === 'hidden') return;
    const hosts = [...humanHosts.entries()].filter(([, r]) => r.opened), w = verifyWait && verifyWait.opened ? verifyWait : null;
    if (!hosts.length && !w) return;
    hosts.forEach(([, r]) => { r.opened = false; }); if (w) w.opened = false;
    setTimeout(() => {
      if (w && verifyWait === w) { const again = w.retry; closeVerify(); if (again) again(); }
      hosts.forEach(([h]) => humanRetryHost(h));
    }, 600);
  }
  document.addEventListener('visibilitychange', humanReturn); window.addEventListener('focus', humanReturn);
  $('#vfOpen').onclick = () => { if (verifyWait) openHumanSite(verifyWait.url, verifyWait); };
  $('#vfRetry').onclick = () => { const w = verifyWait; closeVerify(); if (w && w.retry) w.retry(); };
  $('#vfClose').onclick = closeVerify;

  /* Everything we know about a page that gave no chapters/pictures. It goes into the error report so the problem
     can be fixed for that site afterwards. */
  // WHY: collect facts about a page that gave no chapters or pictures, so the problem can be fixed later. HOW: builds
  // lines of text: counts of images and scripts, hints of JavaScript apps, bot-check words and the first text. IMPROVE:
  // add a copy button for just this part.
  function diagnose(doc, base) {
    // WHY: keep the page's full HTML text for searching. HOW: outerHTML of the root element, or an empty text if missing.
    // IMPROVE: none needed.
    const html = (doc.documentElement && doc.documentElement.outerHTML || '');
    // WHY: the visible text without extra spaces, used for length and keyword checks. HOW: body textContent, whitespace
    // squeezed to single spaces, trimmed. IMPROVE: none needed.
    const text = ((doc.body && doc.body.textContent) || '').replace(/\s+/g, ' ').trim();
    // ROUND 28. WHY: the words that say "locked / removed / loading" must be looked for in the page's OWN text, not in the menu, the comment box or a "recommended manga" block (that gave a
    // false LOCKED message on mgread.io). HOW: mainText() cuts those parts away first. The picture facts come from scanPictures(), the same function the reader uses.
    const main = mainText(doc), sc = scanPictures(doc, base), pl = pagerLinks(doc, base, base);
    // WHY: show which attributes hide picture addresses (data-original-src, data-page-src ...): it tells at once how a new site stores its pictures. HOW: count the attribute names that
    // are not the usual ones.
    const usual = /^(?:src|data-src|data-lazy-src|data-original|data-url|data-lazy|srcset)$/, attrs = {};
    doc.querySelectorAll('img').forEach(im => { const a = imgAddressInfo(im, base).attr; if (a && !usual.test(a)) attrs[a] = (attrs[a] || 0) + 1; });
    const boxName = sc.box ? sc.box.tagName.toLowerCase() + (sc.box.id ? '#' + sc.box.id : '') + (typeof sc.box.className === 'string' && sc.box.className.trim() ? '.' + sc.box.className.trim().split(/\s+/).join('.') : '') : '-';
    // WHY: the lines of the report. HOW: an array of text lines, joined with new lines on the last line. Each line shows one
    // fact. IMPROVE: group the lines under headings.
    return [
      'page title: ' + (doc.title || '-'),
      '<img> tags: ' + doc.querySelectorAll('img').length,
      // ROUND 28: what the reader really sees in the page.
      'reading box: ' + boxName + ' (' + sc.how + ')',
      'pictures with an address: ' + sc.list.length + ' | empty placeholders: ' + sc.holders,
      'pictures whose address sits in an unusual attribute: ' + (Object.keys(attrs).map(k => k + ' x' + attrs[k]).join(', ') || '-'),
      'encrypted-chapter marker (InitMangaEncryptedChapter): ' + sealedPage(doc),
      'chapter-list pages linked from this page: ' + (pl.length ? pl.map(l => l.n).join(', ') : '-'),
      // WHY: facts about the page for the 'why did this site fail' report. HOW: each line counts or tests something in the
      // loaded HTML. IMPROVE: add more clues when a new kind of site appears.
      '<script> tags: ' + doc.querySelectorAll('script').length,
      'picture addresses found inside scripts: ' + fromScripts(doc, base).length,
      'looks like a JavaScript app (React / Next / Vue): ' + !!doc.querySelector('#__next, #root, #app, #__nuxt, [data-reactroot]'),
      // WHY: tells how much real text the page has (a nearly empty page is usually built by JavaScript). HOW: the length of
      // the visible text.
      'visible text length: ' + text.length,
      'Next.js data present (__NEXT_DATA__): ' + !!doc.querySelector('script#__NEXT_DATA__'),
      'ts_reader (MangaStream theme) present: ' + /ts_reader/.test(html),
      'og:image / twitter:image: ' + (metaImageSamples(doc, base).join(' , ') || '-'),
      'first <img> addresses: ' + (Array.from(doc.querySelectorAll('img')).slice(0, 6).map(i => i.getAttribute('src') || i.getAttribute('data-src') || '?').join(' , ') || '-'),
      'script files: ' + (Array.from(doc.querySelectorAll('script[src]')).slice(0, 6).map(x => x.getAttribute('src')).join(' , ') || '-'),
      'page says "loading": ' + /loading chapter|loading\.\.\./i.test(main) + ' | says "not available": ' + /not available|removed|deleted/i.test(main),
      'lock / login words found: ' + LOCK_RE.test(main),
      'prev/next links found: ' + JSON.stringify(findNavLinks(doc, base, base)),
      'api hints inside scripts: ' + (Array.from(new Set((html.match(/\/api\/[a-z0-9_\/-]{3,40}/gi) || []))).slice(0, 5).join(', ') || '-'),
      'bot-check words found: ' + /just a moment|cf-browser-verification|challenge-platform|captcha/i.test(html.slice(0, 40000)),
      'first 300 characters of text: ' + text.slice(0, 300)
    ].join('\n');
  }

  /* ---------------------------------------------------------------
     5b. POLITE REQUESTS (round 8)
     WHY: a site notices a reader that asks for 50 pictures in the same second. Reading like a person (a few requests
          at a time, small pauses) is kinder to the site and much less likely to get you blocked.
     HOW: gate(key, max, gap) hands out a "ticket". Only `max` tickets per key (one key per website) can be open at
          once and two tickets are at least `gap` ms apart (plus a random extra, so it does not look like a clock).
          When a site answers 429 / 503 ("too many requests") coolDown() makes everybody wait first.
     LIMIT: this makes blocks LESS likely, it cannot promise they never happen. We never try to break bot checks.
     IMPROVE: make the numbers settings; slow down automatically after each refusal. */
  // WHY: remembers the politeness state of every site. HOW: a Map of key to { active, last, cool }. IMPROVE: delete old
  // keys.
  const gates = new Map();
  // WHY: hands out a ticket so we never ask one site too fast. HOW: waits in a loop until fewer than max tickets are open,
  // the cool-down is over and gap ms have passed, then returns a function that gives the ticket back. IMPROVE: use a queue
  // instead of checking every 40 ms.
  async function gate(key, max, gap, job) {
    let g = gates.get(key);
    // WHY: first time a site is seen, create its state. HOW: active = open tickets, last = time of the last ticket, cool =
    // no requests before this time. IMPROVE: none needed.
    if (!g) { g = { active: 0, last: 0, cool: 0 }; gates.set(key, g); }
    // WHY: keep checking until a ticket can be given. HOW: 'for (;;)' is a loop that never ends by itself; it exits by
    // return or throw. IMPROVE: none needed.
    const w0 = Date.now();                                          // ROUND 12: when we started waiting
    for (;;) {
      // WHY: a cancelled download should stop waiting. HOW: if the job has a cancel flag, throw an error. IMPROVE: none
      // needed.
      if (job && job.cancel) throw new Error('cancelled');
      const now = Date.now();
      // WHY: the three rules for giving a ticket. HOW: fewer than max open, cool-down passed, and enough time since the last
      // one. If all are true we take a ticket. IMPROVE: none needed.
      // ROUND 12: after 25 s of waiting we stop being polite and go (a huge "retry-after" or a lost ticket used to freeze a job for minutes).
      const waited = now - w0 > 25000;
      if ((g.active < max || waited) && (now >= g.cool || waited) && now - g.last >= gap) {
        // WHY: the random extra makes our timing look less like a robot. HOW: counts one more open ticket and sets last to now
        // plus a random part of the gap. IMPROVE: none needed.
        g.active++; g.last = now + Math.random() * gap;              // random extra delay = not a perfect clock
        // WHY: guard so the ticket cannot be given back twice. HOW: a flag 'done' that turns true on the first release. IMPROVE:
        // none needed.
        let done = false;
        return () => { if (!done) { done = true; g.active--; } };
      }
      // WHY: wait a short time before checking again, so we do not use the whole CPU. HOW: a Promise that resolves after 40
      // ms; await pauses here. IMPROVE: wake up exactly when a ticket frees.
      await new Promise(r => setTimeout(r, 40));
    }
  }
  // WHY: makes everyone wait for a site after it said 'too many requests'. HOW: sets the key's 'cool' time to now plus ms,
  // keeping the later of the old and new times. IMPROVE: grow the delay after repeated refusals.
  const coolDown = (key, ms) => { const g = gates.get(key); if (g) g.cool = Math.max(g.cool, Date.now() + Math.min(ms, 20000)); };   // ROUND 12: never longer than 20 s

  /* ---------------------------------------------------------------
     6. HISTORY: RECENT PAGES, CONTINUE READING, BOOKMARKS (start page)
     WHY: lets users return to a manga quickly without retyping the address, and (new) go back to
          the EXACT chapter they were reading.
     HOW: three saved lists.
          recent = pages you opened          { url, title, host, at }
          reads  = manga you were reading    { id, title, host, seriesUrl, chapterUrl, chapterLabel, at }
          books  = your bookmarks            { url, title }
          `at` is a time in milliseconds; timeAgo() turns it into "3 h ago".
     IMPROVE: sync to a cloud database so history follows the user between devices; store the scroll
              position inside the chapter too. */
  // WHY: the list of recently opened pages. HOW: loaded from storage, or an empty list. 'let' because it is replaced
  // later. IMPROVE: sync to the cloud.
  // ROUND 43: wipeOnClose, done safely (see the pagehide note in the Security section): erase once per new tab session, never on reload.
  try { if (settings.wipeOnClose && !sessionStorage.getItem('mf_alive')) { store.set('recent', []); store.set('books', []); store.set('reads', []); store.set('progress', {}); store.set('clips', []); } sessionStorage.setItem('mf_alive', '1'); } catch { /* storage blocked */ }
  // ROUND 43: stored lists must be arrays of objects; a damaged value ({} or null entries) used to crash the start page.
  const listOf = k => { const v = store.get(k, []); return Array.isArray(v) ? v.filter(x => x && typeof x === 'object') : []; };
  let recent = listOf('recent');
  // WHY: the list of bookmarks. HOW: loaded from storage, or empty. IMPROVE: allow folders.
  let books = listOf('books');
  // WHY: the list of manga being read, with the exact chapter. HOW: loaded from storage, or empty. IMPROVE: store the
  // scroll position too.
  let reads = listOf('reads');

  // WHY: show friendly times like '3 h ago'. HOW: take the difference to now in seconds and pick minutes, hours or days.
  // No time gives empty text. IMPROVE: use weeks and months for old items.
  function timeAgo(t) {
    if (!t) return '';
    const s = Math.max(0, (Date.now() - t) / 1000);
    // WHY: friendly time text. HOW: pick seconds, minutes, hours or days by size.
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + ' min ago';
    if (s < 86400) return Math.floor(s / 3600) + ' h ago';
    // WHY: the biggest unit, days. HOW: seconds divided by 86400, rounded down.
    return Math.floor(s / 86400) + ' d ago';
  }
  // WHY: add a page to the Recent list. HOW: skips if history is off, puts the new item first, removes the same address if
  // it was there, keeps only 20 and saves. IMPROVE: also store a small cover picture.
  function addRecent(url, title) {
    if (settings.noHistory) return;                   // privacy option (Settings > Security)
    // WHY: raised from 20 to 500 — users want ALL history visible in the profile tab (cloud stores everything). ROUND 38.
    recent = [{ url, title: (title || url).slice(0, 80), host: hostOf(url), at: Date.now() }, ...recent.filter(r => r.url !== url)].slice(0, 500);
    // WHY: save the Recent list. HOW: store.set writes it (under the profile's own key if someone is signed in).
    store.set('recent', recent);
  }
  // WHY: remember what manga and chapter the user was reading. HOW: new info first, removes the old entry with the same
  // id, keeps 30, then saves. IMPROVE: save the scroll position too.
  function saveRead(info) {              // newest first, one entry per manga (same id replaces the old one)
    if (settings.noHistory) return;
    // WHY: raised from 30 to 500 — keep all manga the user ever read, not just the last 30. ROUND 38.
    reads = [info, ...reads.filter(r => r.id !== info.id)].slice(0, 500);
    // WHY: save the Continue reading list. HOW: same as above.
    store.set('reads', reads);
  }

  // One history row = bold title + small grey line. WHY: more information than just the page name.
  // WHY: builds one clickable history row (coloured letter, bold title, small grey line). HOW: creates a button element
  // and fills it with spans, using textContent for safety. IMPROVE: show a cover picture instead of a letter.
  // WHY: onDelete (optional 5th arg) — when given, a small × button is added at the right of the row so the person can
  //   remove that one history entry without clearing everything. HOW: a separate <button> that calls onDelete() and stops
  //   the click from bubbling (so it does not also trigger the row's own onclick). IMPROVE: animate the row out.
  function item(title, sub, onclick, tip, onDelete) {
    const b = document.createElement('button');
    b.className = 'item'; b.title = tip || '';
    // ROUND 10: a coloured letter tile (colour made from the title, so a manga always has the same colour) + the two text lines.
    // WHY: a letter tile in place of a cover picture. HOW: first letter of the title, in capitals; '?' if there is no title.
    // IMPROVE: use the site's icon.
    const av = document.createElement('span'); av.className = 'av'; av.textContent = (String(title || '?').trim()[0] || '?').toUpperCase();
    // WHY: the same title always gets the same colour. HOW: loops over the letters and mixes their codes into a number from
    // 0 to 359, which is a colour hue. IMPROVE: none needed.
    let hue = 0; for (const ch of String(title || '')) hue = (hue * 31 + ch.charCodeAt(0)) % 360;
    // WHY: paint the tile with that colour. HOW: sets CSS background as hsl(hue, saturation, lightness). IMPROVE: none needed.
    av.style.background = 'hsl(' + hue + ',55%,45%)';
    // WHY: the two text lines next to the tile. HOW: creates a wrapper, then a title span and a sub span; textContent keeps
    // them safe from HTML. IMPROVE: none needed.
    const tx = document.createElement('span'); tx.className = 'tx';
    const t = document.createElement('span'); t.className = 't'; t.textContent = title;
    const s = document.createElement('span'); s.className = 's'; s.textContent = sub;
    // WHY: put the pieces together and make the row clickable. HOW: append adds the children, and onclick is the function
    // given by the caller. IMPROVE: use addEventListener.
    tx.append(t, s); b.append(av, tx); b.onclick = onclick;
    // ROUND 34: delete button on each history row.
    // WHY: lets the person remove one entry without clearing all history. HOW: a small × button added at the right of the row.
    //   stopPropagation makes sure clicking × does NOT also trigger the row's main onclick (opening the manga). IMPROVE: add a
    //   short fade-out animation before the row disappears.
    if (onDelete) {
      const del = document.createElement('button');
      del.type = 'button'; del.className = 'item-del'; del.textContent = '×';
      del.title = 'Remove from history'; del.setAttribute('aria-label', 'Remove from history');
      del.onclick = e => { e.stopPropagation(); onDelete(); };
      b.append(del);
    }
    return b;
  }
  /* STATUS CHIPS on the start page (round 10): one glance tells which proxy route you have and whether the slider add-on is linked.
     WHY: most "cannot load" problems are proxy problems. HOW: reads settings + location only, changes nothing. */
  // WHY: little status chips on the start page showing the proxy route and slider state. HOW: clears the chip box and adds
  // buttons based on settings and location; it only reads and changes nothing else. IMPROVE: add a chip that tests the
  // proxy.
  function renderStatus() {
    const box = $('#statusChips'); if (!box) return;
    box.innerHTML = '';
    // WHY: work out which proxy route is in use. HOW: 'local' = running on localhost, 'own' = at least one proxy that is not
    // a free default. IMPROVE: none needed.
    const local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname), own = settings.proxies.some(p => !DEFAULT_PROXIES.includes(p));
    // WHY: a helper that makes one chip button. HOW: creates a button with text, adds a click function if given, and appends
    // it to the box. IMPROVE: none needed.
    const chip = (text, fn) => { const x = document.createElement('button'); x.type = 'button'; x.className = 'chip2'; x.textContent = text; if (fn) x.onclick = fn; box.appendChild(x); };
    // WHY: the first chip tells the quality of the route. HOW: picks green for local or own proxy, orange for free only;
    // click opens Settings. IMPROVE: none needed.
    chip(local ? '\u{1F7E2} Local launcher (best)' : own ? '\u{1F7E2} Your own proxy' : '\u{1F7E0} Free proxies only (slow, often blocked)', () => openSettings(false));
    // WHY: shows if the chapter slider add-on is loaded. HOW: checks window.MangaFlowSlider; no click action (null).
    // IMPROVE: none needed.
    chip(window.MangaFlowSlider ? '\u2194 Chapter slider on' : '\u2194 Chapter slider off', null);
    // WHY: a quick way to open Settings. HOW: the click calls openSettings. IMPROVE: none needed.
    chip('\u2699 Settings', () => openSettings(false));
  }
  // WHY: draws the whole start page lists: reading, recent and bookmarks. HOW: calls renderStatus, then a helper fills
  // each list with items or an empty note. IMPROVE: render only the list that changed.
  function renderStart() {
    renderStatus();
    // WHY: one helper to fill a list element. HOW: clears it, shows a grey note if the array is empty, else builds one row
    // per item with make(). IMPROVE: none needed.
    const fill = (arr, el, empty, make) => {
      el.innerHTML = '';
      if (!arr.length) { el.innerHTML = '<span class="muted small">' + empty + '</span>'; return; }
      // WHY: draw one row for each item. HOW: make(it) builds the element, appendChild puts it in the list.
      arr.forEach(it => el.appendChild(make(it)));
    };
    // WHY: the 'continue reading' list. HOW: each row shows title and host, chapter and time; clicking reopens that chapter.
    //   ROUND 34: each row now has a × delete button. HOW: the onDelete callback splices the entry out of reads[], saves and redraws.
    // IMPROVE: show a progress bar.
    fill(reads, $('#readList'), 'Nothing yet. Read a manga and it will appear here.',
      r => item(r.title, [r.host, r.chapterLabel, timeAgo(r.at)].filter(Boolean).join(' · '), () => continueReading(r), r.chapterUrl,
        () => { reads = reads.filter(x => x.id !== r.id); store.set('reads', reads); renderStart(); }));
    // WHY: the recent pages list. HOW: each row opens that address with navigate().
    //   ROUND 34: each row now has a × delete button. HOW: the onDelete callback filters out the entry by URL, saves and redraws.
    fill(recent, $('#recentList'), 'Nothing yet.',
      r => item(r.title || r.url, [r.host || hostOf(r.url), timeAgo(r.at)].filter(Boolean).join(' · '), () => navigate(r.url), r.url,
        () => { recent = recent.filter(x => x.url !== r.url); store.set('recent', recent); renderStart(); }));
    // WHY: the bookmark list. HOW: each row shows title and host; click opens it. The empty text explains how to add one.
    // IMPROVE: allow reordering.
    fill(books, $('#bookList'), 'Tap the star in the address bar to bookmark a page.',
      b => item(b.title || b.url, hostOf(b.url), () => navigate(b.url), b.url));
  }
  // WHY: add or remove a bookmark for the page now open. HOW: finds the bookmark by address; splice removes it, otherwise
  // unshift adds it first. Then it saves and redraws. IMPROVE: show a toast saying what happened.
  function toggleBookmark() {
    if (!cur) return;
    const i = books.findIndex(b => b.url === cur.url);
    // WHY: toggle a bookmark. HOW: if it exists remove it (splice), otherwise add it first (unshift); then save and redraw
    // the start page.
    if (i >= 0) books.splice(i, 1); else books.unshift({ url: cur.url, title: (cur.doc.title || cur.url).slice(0, 80) });
    store.set('books', books); updateNav(); renderStart();
  }
  // Open the saved chapter page, then start reading mode straight away.
  // WHY: lets the user continue a manga at the exact chapter. HOW: opens the saved chapter page, and if it loaded the
  // right page, starts reading mode. IMPROVE: scroll to the saved position.
  async function continueReading(r) {
    await navigate(r.chapterUrl);
    if (cur && sameUrl(cur.url, r.chapterUrl)) startReading();
  }

  /* ---------------------------------------------------------------
     7. MINI BROWSER (address bar, back/forward, iframe)
     WHY: shows the other website so the user can search/open a manga and choose a chapter.
          We sanitise the HTML (remove scripts, inline handlers) before putting it in the iframe.
     IMPROVE: many modern sites render content with JavaScript and will look empty here. A
              server-side headless browser (Puppeteer) behind your proxy would fix that. */
  // WHY: the iframe that shows the other website. HOW: finds the element by id. IMPROVE: none needed.
  const frame = $('#frame');
  // WHY: holds everything about the page now shown. HOW: starts as null (nothing open) and is replaced after each load.
  // IMPROVE: none needed.
  let cur = null;                  // { url, base, doc, chapters, listHtml, token } - the page currently shown
  // WHY: our own back and forward list. HOW: hist is the list of pages and hi is the position in it; -1 means empty.
  // IMPROVE: limit its length.
  // ROUND 53: navMax = newest browser-history step we created. WHY: after Back, the Forward button stayed greyed out (it only looked at our old page list), so Forward could never be tapped. HOW: each pushState stores its step number (mfi); popstate reads it back so updateNav knows if a newer step exists.
  let navMax = 0;
  let hist = [], hi = -1;          // our own back/forward stack
  // WHY: a counter that gives each render a unique number so we can recognise the right document. HOW: goes up by one on
  // every render. IMPROVE: none needed.
  let renderCount = 0;             // gives every render a unique "token" so we can recognise the right document

  // WHY: lazy-load sites keep the real picture address in data-* attributes, so we must copy it into src. HOW: loops over
  // every image and uses the first attribute found, copies srcset, and hides the referrer so hotlink checks pass. IMPROVE:
  // add more attribute names.
  function fixLazy(d) {            // lazy-load sites keep the real image in data-* attributes
    // WHY: the attribute names that lazy-load sites commonly use. HOW: a list of text names tried in order. IMPROVE: add new
    // names found in reports.
    const attrs = ['data-src', 'data-lazy-src', 'data-original', 'data-url', 'data-lazy'];
    // WHY: process every picture on the page. HOW: querySelectorAll finds all img tags; forEach runs the function for each.
    // IMPROVE: none needed.
    d.querySelectorAll('img').forEach(img => {
      // WHY: put the real address into src. HOW: tries each attribute name; the first non-empty one is copied to src and the
      // loop stops (break). IMPROVE: none needed.
      for (const a of attrs) { const v = img.getAttribute(a); if (v) { img.setAttribute('src', v); break; } }
      // ROUND 50 (comizy.io chapters looked empty on Page 2): the five names above are only a few of the ways sites hide a picture address (data-page-src, data-original-src,
      //   a site-made name like data-cmz, a loading.gif or tiny data: drawing left in src, a srcset only...). Reading mode (Page 3) already knows them all through
      //   imgAddressInfo(), which is why reading mode found the chapter while Page 2 showed blanks. HOW: when src is still missing or only a placeholder, ask the SAME
      //   function and copy what it finds into src. IMPROVE: keep one shared list so the two pages can never disagree again.
      try {
        const cs = (img.getAttribute('src') || '').trim();
        if (!cs || cs.startsWith('data:') || BAD_IMG.test(cs) || PLACEHOLDER_SRC.test(cs)) { const info = imgAddressInfo(img, location.href); if (info.raw && info.attr !== 'src') img.setAttribute('src', info.raw); }
      } catch { /* leave this picture as it is */ }
      // WHY: some sites give several sizes in data-srcset. HOW: copies it to srcset when present. IMPROVE: none needed.
      const ss = img.getAttribute('data-srcset'); if (ss) img.setAttribute('srcset', ss);
      // WHY: some sites refuse pictures when they see our address as the referrer. HOW: no-referrer tells the browser not to
      // send it. IMPROVE: none needed.
      img.setAttribute('referrerpolicy', 'no-referrer');
    });
  }

  /* LINKS MADE SAFE BEFORE THE PAGE LOADS  (fixes "manhuatop.org refused to connect")
     WHY: the iframe only fires its "load" event after EVERY picture on the page has finished. Before
          that, our click handler did not exist yet, so a quick click on "Read first chapter" made the
          iframe open the real website inside itself. Real sites forbid that, so Chrome showed
          "refused to connect".
     HOW: every link gets its real address stored in a data-mf-href attribute and its href is changed to
          "#mf". A click then can never leave the page, even if our handler is not attached yet.
          Forms get action="about:blank" for the same reason. Calling this twice is harmless.
     IMPROVE: show the real address in a tooltip (title attribute) on desktop. */
  // WHY: stop any click from leaving our app. HOW: moves each link's real address to data-mf-href and sets href to '#mf';
  // forms get action about:blank. Safe to call twice. IMPROVE: show the real address in a tooltip.
  // ROUND 22 - LINKS THAT OPEN OUR SITE. WHY: Ctrl+click, middle click, "open in a new tab / window" and "duplicate" used the link's real address, so the ORIGINAL site opened and
  //   MangaFlow was left. HOW: every link in a shown page now has, as its real href, an address of THIS site (appLink): the site's own page with ?url=<real address> (or ?q=<words> for
  //   a search-engine address, so it opens as our own search results). A plain click is still caught by onFrameClick and handled inside the page (nothing reloads); the new-tab ways
  //   follow the href, so a new MangaFlow tab opens and loads the link by itself. The frame's sandbox allows pop-ups (still NO scripts) so the browser may open that tab.
  // IMPROVE: add a small "open in new tab" button on result cards for people who do not know the Ctrl+click way.
  function appLink(real) {
    const here = location.origin + location.pathname;
    try { if (isSearchHost(real)) { const w = queryOf(real); if (w) return here + '?q=' + encodeURIComponent(w.replace(/ manga$/i, '')); } } catch { /* use the address form */ }
    return here + '?url=' + encodeURIComponent(real);
  }
  function neutralizeLinks(d, base) {
    // WHY: handle every link that has an address. HOW: querySelectorAll('a[href]') finds them; forEach runs the steps for
    // each. IMPROVE: none needed.
    d.querySelectorAll('a[href]').forEach(a => {
      // WHY: if a link was already handled (or set by shortcuts), only make sure it is neutral. HOW: dataset.mfHref is the
      // data-mf-href attribute; reset href and remove target, then return. IMPROVE: none needed.
      if (a.dataset.mfHref) { a.setAttribute('href', appLink(a.dataset.mfHref)); a.removeAttribute('target'); return; }   // already done / set by shortcuts (round 22: href = our own address)
      // WHY: read the link's current address. HOW: getAttribute gives the text; empty text if none. IMPROVE: none needed.
      const href = a.getAttribute('href') || '';
      // WHY: in-page anchors (#something) should still scroll. HOW: skip links that are empty or start with '#'. IMPROVE: none
      // needed.
      if (!href || href.startsWith('#')) return;                       // in-page anchor: let it scroll
      // WHY: javascript:, mailto: and tel: links must never run. HOW: tested by a regular expression, then href becomes '#mf'.
      // IMPROVE: none needed.
      if (/^(javascript|mailto|tel):/i.test(href)) { a.setAttribute('href', '#mf'); return; }
      // WHY: make a full address from a relative one. HOW: absUrl joins it with the page base; skip the link if invalid.
      // IMPROVE: none needed.
      const u = absUrl(href, base); if (!u) return;
      // WHY: store the real address safely for our click handler. HOW: unwrap removes DuckDuckGo wrapping and the result goes
      // into data-mf-href. IMPROVE: run safeWebUrl on it.
      a.dataset.mfHref = unwrap(u);
      // WHY: make the link harmless. HOW: href becomes '#mf' and target is removed so it cannot open a new window. IMPROVE:
      // none needed.
      a.setAttribute('href', appLink(a.dataset.mfHref)); a.removeAttribute('target');   // round 22: was '#mf'
    });
    // WHY: forms could also send the iframe away. HOW: for each form, remember the real action in data-mf-action, point
    // action to about:blank, remove target. IMPROVE: none needed.
    d.querySelectorAll('form').forEach(f => {
      // WHY: do not process the same form twice. HOW: 'mfAction' in f.dataset is true if already set; then return. IMPROVE:
      // none needed.
      if ('mfAction' in f.dataset) return;
      f.dataset.mfAction = f.getAttribute('action') || '';
      f.setAttribute('action', 'about:blank'); f.removeAttribute('target');
    });
  }

  /* SERIES PAGE: put the chapter list back
     WHY: on sites built with the WordPress "Madara" theme (manhuatop.org and many more) the chapter list
          is empty in the downloaded HTML. The site's own JavaScript fills it in later, but scripts are
          removed in our iframe, so the list never appeared.
     HOW: enhanceSeriesPage() asks the site for the list (ajaxChapterList) and keeps the answer in
          `page.chapters` (clean list) and `page.listHtml` (the site's own list markup).
          injectChapters() puts that markup into the site's list box so it looks like the real site.
          If the page has no such box, a simple list is added instead.
     IMPROVE: add a "newest first / oldest first" switch to the fallback list. */
  // WHY: puts the chapter list into the copy of the site page shown in the frame. HOW: d is the page copy (a document),
  // page holds the chapters found. IMPROVE: split the fallback panel and the holder code into two small functions.
  function injectChapters(d, page) {
    // WHY: short name for the chapter array. HOW: the next line stops early if there is nothing useful to show. IMPROVE: log
    // a small note when the list is empty to help debugging.
    const list = page.chapters;
    if (!list || !list.length || !page.listHtml) return;             // nothing to add, or the page already had its own list
    // WHY: the function can run twice, so this stops the list being added two times. HOW: data-mf-done is a marker attribute
    // we add after we finish. IMPROVE: use one named constant for the marker.
    if (d.querySelector('[data-mf-done]')) return;                    // already added (this function can run twice)

    // WHY: many sites have a ready box for the chapter list. HOW: look it up by its id; if found, fill it so the page looks
    // like the real site. IMPROVE: also try other common box ids.
    const holder = d.querySelector('#manga-chapters-holder');
    if (holder) {
      // WHY: build the site's list markup off-screen first. HOW: make a temporary div and load the saved HTML text into it.
      // IMPROVE: use DOMParser for safer parsing of untrusted text.
      const tmp = d.createElement('div');
      tmp.innerHTML = page.listHtml;
      // WHY: safety, the HTML came from another site and could contain code. HOW: remove script, iframe, object, embed and
      // style tags from the temp div. IMPROVE: use a proper allow-list sanitizer.
      tmp.querySelectorAll('script,iframe,object,embed,style').forEach(n => n.remove());       // never trust other sites' code
      // WHY: safety, inline handlers like onclick could run code. HOW: loop over every element and remove each attribute whose
      // name starts with 'on'. IMPROVE: also remove javascript: links here.
      tmp.querySelectorAll('*').forEach(el => Array.from(el.attributes).forEach(a => { if (/^on/i.test(a.name)) el.removeAttribute(a.name); }));
      // WHY: choose where the list goes. HOW: use the inner .page-content-listing box if there is one, else the holder itself.
      // IMPROVE: none needed, it is simple.
      const target = holder.querySelector('.page-content-listing') || holder;
      // WHY: remove old or empty content first. HOW: set innerHTML to an empty string, then move the temp children in one by
      // one. IMPROVE: use replaceChildren() which does both in one call.
      target.innerHTML = '';
      while (tmp.firstChild) target.appendChild(tmp.firstChild);
      // WHY: the holder may be hidden on the original page, so make it visible. HOW: remove the hidden attribute and clear any
      // inline display style. IMPROVE: none.
      holder.removeAttribute('hidden'); holder.style.display = '';
      // WHY: mark the page as done so the check near the top works. HOW: dataset.mfDone writes the attribute data-mf-done.
      // Then return ends the function.
      holder.dataset.mfDone = '1';
      return;
    }
    // WHY: pages with no chapter box still need a list. HOW: build a simple panel (section) made of our own elements.
    // IMPROVE: add a search box inside the panel.
    // Fallback panel for pages without a chapter box.
    const box = d.createElement('section');
    // WHY: give the panel an id for the CSS rules and mark it done. HOW: set id and the data-mf-done marker on the same
    // line.
    box.id = 'mf-chapters'; box.dataset.mfDone = '1';
    // WHY: the panel needs its own look inside the frame. HOW: create a style element and fill its text with CSS rules built
    // from small strings joined by +. IMPROVE: a template string would be easier to read.
    const css = d.createElement('style');
    css.textContent = '#mf-chapters{max-width:900px;margin:16px auto;padding:12px 16px;font:15px system-ui,sans-serif;border:1px solid #8884;border-radius:10px}' +
      '#mf-chapters h2{margin:0 0 8px;font-size:1.1rem}#mf-chapters ul{list-style:none;margin:0;padding:0;max-height:60vh;overflow:auto}' +
      // WHY: the style rules for the saved-copy page, kept as one text so the saved file needs no other file. IMPROVE: move to
      // a template.
      '#mf-chapters li{border-top:1px solid #8883}#mf-chapters a{display:block;padding:10px 4px;color:inherit;text-decoration:none}';
    // WHY: a heading that shows how many chapters were found. HOW: create an h2 and set its text with the list length.
    // IMPROVE: none.
    const h = d.createElement('h2'); h.textContent = 'Chapters (' + list.length + ')';
    // WHY: the list element that will hold one line per chapter. HOW: create an empty ul now, fill it in the loop below.
    const ul = d.createElement('ul');
    // WHY: real sites show the newest chapter first. HOW: slice() makes a copy so reverse() does not change the original
    // sorted list; forEach builds one row per chapter. IMPROVE: add a sort switch.
    list.slice().reverse().forEach(c => {                              // newest first, like the real sites
      // WHY: each chapter needs a list item with a link. HOW: create an li and an a element on one line.
      const li = d.createElement('li'), a = d.createElement('a');
      // WHY: show a short readable name. HOW: use the chapter title if it exists and is under 80 letters, otherwise 'Chapter'
      // plus the number. IMPROVE: clean extra words from long titles.
      a.textContent = c.title && c.title.length < 80 ? c.title : 'Chapter ' + fmtNum(c.num);
      // WHY: clicks must be caught by our code, not by the browser. HOW: href is '#mf' (a dummy) and the real address is kept
      // in data-mf-href. IMPROVE: none.
      a.setAttribute('href', '#mf'); a.dataset.mfHref = c.url;
      // WHY: attach the row to the list. HOW: put the link in the li, and the li in the ul.
      li.appendChild(a); ul.appendChild(li);
    });
    // WHY: put all the parts in the panel. HOW: append adds style, heading and list in this order.
    box.append(css, h, ul);
    // WHY: find a good place on the page for the panel. HOW: try common main-area elements, first match wins. IMPROVE: add
    // more selectors for other site themes.
    const host = d.querySelector('main, #content, .site-content, .container');
    // WHY: always show the panel somewhere. HOW: add it inside the found area, else at the very top of the body.
    if (host) host.appendChild(box); else d.body.insertBefore(box, d.body.firstChild);
  }

  /* "Read first chapter" / "Read last chapter" buttons.
     WHY: on the real site these links are filled in by JavaScript, so in our copy they point nowhere.
     HOW: find links by their words or class and point them at the first / last chapter of the list. */
  // WHY: fix the 'Read first / Read last' buttons that point nowhere in our copy. HOW: d is the page copy, list is the
  // chapter array. Stop if the list is empty. IMPROVE: also handle 'Next chapter' buttons.
  function fixShortcuts(d, list) {
    if (!list || !list.length) return;
    // WHY: remember the two chapters the buttons need. HOW: the list is sorted so index 0 is the first and the last index is
    // the latest.
    const first = list[0], last = list[list.length - 1];             // the list is sorted: chapter 1 first
    // WHY: check every link on the page. HOW: for each link, read its visible words and its id and class names together.
    d.querySelectorAll('a').forEach(a => {
      // WHY: get clean text of the link. HOW: replace repeated spaces and line breaks with one space, then trim the ends.
      const txt = (a.textContent || '').replace(/\s+/g, ' ').trim();
      // WHY: some buttons are recognized by class or id instead of words. HOW: join id and class into one string; className
      // can be a non-string on SVG elements so it is checked.
      const idc = (a.id || '') + ' ' + (typeof a.className === 'string' ? a.className : '');
      // WHY: holds the chapter this link should open, if any. HOW: starts as null (nothing).
      let target = null;
      // WHY: detect a 'read first' button. HOW: a regular expression (a text pattern) tests words and class names, ignoring
      // capital letters. If it matches, use the first chapter. IMPROVE: support other languages.
      if (/read\s*first|first\s*chapter|start\s*reading|btn-read-first/i.test(txt + ' ' + idc)) target = first;
      // WHY: detect a 'read last / latest' button. HOW: the same kind of pattern test, then use the last chapter.
      else if (/read\s*last|last\s*chapter|latest\s*chapter|newest\s*chapter|btn-read-last/i.test(txt + ' ' + idc)) target = last;
      // WHY: store the real address on the link. HOW: data-mf-href is read later by the click handler. IMPROVE: none.
      if (target) a.dataset.mfHref = target.url;                       // neutralizeLinks() turns href into "#mf"
    });
  }

  // WHY: builds the cleaned page and shows it in the iframe (the mini browser window). HOW: doc is the fetched page and
  // base is its address. IMPROVE: split cleaning, patching and showing into three functions.
  // ROUND 18: the style text used above. WHY a constant: it is easy to find and extend. HOW each line works: "!important" so it beats the site's own rules.
  const MF_NOJS_CSS =
    // 1) menus that open on click: hidden until a script adds "show" / "open". (Bootstrap dropdowns, theme switchers, WordPress sub-menus)
    '.dropdown-menu:not(.show),.sub-menu:not(.open):not(.show),ul.children:not(.open),.theme-dropdown:not(.show),.dropdown-content:not(.show){display:none!important}' +
    // 2) windows / pop-ups / cookie bars that a script would open or close
    '.modal:not(.show),.modal-backdrop,.popup:not(.show),.mfp-hide,.hidden-popup,[aria-hidden="true"].modal,#cookie-notice,.cookie-notice,.cookie-bar,.gdpr-banner{display:none!important}' +
    // 3) closed accordions / collapses which hold chapter lists: open them so the chapters can be read
    '.collapse:not(.show){display:block!important;height:auto!important;visibility:visible!important}' +
    '.listing-chapters_wrap,.listing-chapters_wrap ul,.version-chap,.page-content-listing,.chapter-list,.chapters,.eplister,.clstyle,#chapterlist,.wp-manga-chapter{max-height:none!important;height:auto!important;overflow:visible!important}' +
    '.listing-chapters_wrap .more-chapters,.listing-chapters_wrap .chapter-readmore{display:none!important}' +    // the "show more" button does nothing without scripts
    // 4) images that wait for a script to fade in
    'img[data-src],img.lazyload,img.lazy,img.lazyloaded{opacity:1!important;visibility:visible!important}' +
    // 5) tabs: show every tab body (a script would show one at a time) ONLY for the chapter tab area, not everywhere
    '.tab-content>.tab-pane{display:block!important;opacity:1!important}' +
    // 6) a page set to hide its body while "loading"
    'html.js body,body.loading,body.is-loading,body.no-js-hidden{opacity:1!important;visibility:visible!important}' +
    // ROUND 39 — more "a script would have shown/hidden this" patterns, added after the owner reported that many
    // buttons and shortcuts on other manga sites could not be seen or used while browsing them inside MangaFlow.
    // 7) a few more JS-framework "wait for JavaScript to reveal me" markers (Alpine.js, Vue, generic "js-" prefixed
    // helper classes). WHY: these sites show NOTHING at all for the element until their own script runs; since we
    // never run it (a safety rule — see the CSP a few lines below), such elements must be forced visible by hand,
    // same idea as rule 6 above but with more class/attribute names.
    // NOTE: deliberately does NOT touch ".fade" alone — Bootstrap uses that same class on modals/alerts/carousels,
    // which rule 2 above correctly keeps hidden until JS adds ".show"; a generic ".fade" rule here would have
    // fought that and un-hidden things that are supposed to stay closed (popups, modal backdrops).
    '[x-cloak],.js-hidden:not(.js-visible),.invisible.js-show{opacity:1!important;visibility:visible!important;display:revert!important}' +
    // 8) PAGINATION / "load more" controls that normally fetch the next batch of pages with a script. We cannot run
    // that script, but many of these are still plain <a href="page/2/"> links underneath — keep them visible and
    // clickable instead of letting a wrapper's "display:none until scrolled into view" rule hide them.
    '.pagination,.page-numbers,.nav-links,.wp-pagenavi{display:flex!important;visibility:visible!important;opacity:1!important}' +
    // 9) ICON-ONLY buttons/links (an <i> or <span> with an icon-font class and NO visible text) are often how a
    // site's menu, filter chips or social-share row are built. If the icon font itself failed to load — blocked,
    // slow, or simply not reachable since MangaFlow strips <script> (some icon fonts are loaded by a tiny inline
    // script) — the glyph never appears, so the whole button looks like empty, unusable blank space, even though
    // the link underneath it still works fine. A faint dashed outline makes that empty clickable area visible so
    // it can still be tapped for "the same purpose as the original site", without changing anything for a site
    // where the icon DOES render (the outline is subtle and sits behind/around a real glyph without covering it).
    // IMPROVE: detect common icon-font unicode ranges and draw a plain geometric fallback shape instead of a box.
    '.fa:empty,.fas:empty,.far:empty,.fab:empty,.icon:empty,[class*="icon-"]:empty,.material-icons:empty{min-width:1.1em;min-height:1.1em;display:inline-block;outline:1px dashed currentColor;outline-offset:1px;opacity:.55;border-radius:3px}';
  // ROUND 59: gives the chapter's real pictures to a page that shows spinners / empty slots / too few pictures. Used when the page is first shown AND by the troubleshooter
  //   (repair on the page that is already on screen). Returns how many slots were filled and how many pictures were added. IMPROVE: keep the slot's original size.
  function placePictures(d, base, extraPics) {
    let filled = 0, added = 0;
    if (!extraPics || !extraPics.length) return { filled, added };
    try {
      const imgs = Array.from(d.querySelectorAll('img')), have = new Set(imgs.map(i => absUrl((i.getAttribute('src') || '').trim(), base)).filter(Boolean));
      const free = extraPics.filter(u => !have.has(u));
      imgs.filter(i => { const cs = (i.getAttribute('src') || '').trim(); return (!cs || cs.startsWith('data:') || BAD_IMG.test(cs) || PLACEHOLDER_SRC.test(cs)) && (isHolder(i) || PLACEHOLDER_SRC.test(cs)); }).forEach((i, k) => { if (free[k]) { filled++; i.setAttribute('src', free[k]); i.removeAttribute('srcset'); i.setAttribute('referrerpolicy', 'no-referrer'); } });
      // ROUND 59: pictures the scripts list but the page has no slot for are ADDED after the last real picture (same box), so the whole chapter shows on Page 2
      if (extraPics.length >= 3) {
        // WHY (owner report 2026-11-11): the added pages landed AFTER the sidebar thumbnails, so chapter pages were split by "popular manga" pictures. HOW: walk the finder's list IN ORDER; a picture the page
        //   already has becomes the marker, a missing one is inserted right after the previous marker (or right before the first marker when it comes first). IMPROVE: none needed.
        const byUrl = new Map(); Array.from(d.querySelectorAll('img')).forEach(i => { const u = absUrl((i.getAttribute('src') || '').trim(), base); if (u && !byUrl.has(u)) byUrl.set(u, i); });
        const firstKnown = extraPics.map(u => byUrl.get(u)).find(Boolean);
        if (firstKnown && firstKnown.parentNode) {
          let prev = null; const pending = [];
          const make = u => { const n = d.createElement('img'); n.setAttribute('src', u); n.setAttribute('referrerpolicy', 'no-referrer'); n.setAttribute('data-mf-added', '1'); added++; n.style.cssText = 'display:block;max-width:100%;margin:0 auto'; return n; };
          extraPics.forEach(u => {
            const have = byUrl.get(u);
            if (have) { if (pending.length && !prev) pending.forEach(p => have.parentNode.insertBefore(make(p), have)); pending.length = 0; prev = have; }
            else if (prev) { const n = make(u); prev.parentNode.insertBefore(n, prev.nextSibling); prev = n; }
            else pending.push(u);
          });
        }
      }
      return { filled: filled, added: added };
    } catch { return { filled, added }; }
  }
  function renderFrame(doc, base, extraPics) {
    // WHY: never change the original saved page. HOW: cloneNode(true) makes a deep copy that we can edit freely.
    const d = doc.cloneNode(true);
    // ROUND 15 (pages that looked "not loaded"): fix three common tricks BEFORE the cleaning below deletes their clues.
    // 1) "async CSS": <link rel=stylesheet media=print onload="this.media='all'"> only turns on when a script runs. We never run scripts,
    //    so the page stayed unstyled. HOW: when the (still present) onload text mentions media, switch the link to media=all now.
    d.querySelectorAll('link[rel~="stylesheet"][onload]').forEach(l => { if (/media/i.test(l.getAttribute('onload') || '')) l.setAttribute('media', 'all'); });
    // 2) <link rel=preload as=style onload="this.rel='stylesheet'"> is the same trick: make it a normal stylesheet link.
    d.querySelectorAll('link[rel~="preload"][as="style"][href]').forEach(l => { l.setAttribute('rel', 'stylesheet'); l.removeAttribute('as'); });
    // 3) <noscript><link rel=stylesheet ...></noscript> is the site's own "no JavaScript" fallback, which is exactly our case.
    //    HOW: move its stylesheet links / style tags out in front of it (the noscript itself is removed by the cleaning).
    d.querySelectorAll('noscript').forEach(n => { n.querySelectorAll('link[rel~="stylesheet"],style').forEach(x => n.parentNode && n.parentNode.insertBefore(x, n)); });
    // CLEANING (security): remove everything that could run code, load plug-ins, or redirect the frame.
    // WHY: security, remove anything that can run code or move the frame away. HOW: one big selector list picks those
    // elements and removes each one. IMPROVE: use an allow-list instead of a block-list.
    d.querySelectorAll('script,iframe,frame,frameset,object,embed,applet,noscript,base,meta[http-equiv],link[rel~="import"],link[rel~="prefetch"],link[rel~="preload"],link[rel~="modulepreload"]').forEach(n => n.remove());
    // WHY: also clean attributes on every element. HOW: loop over all elements, then over a copy of their attributes (a
    // copy, because we remove some while looping).
    d.querySelectorAll('*').forEach(el => {
      for (const a of Array.from(el.attributes)) {
        // WHY: prepare name and value for checking. HOW: lower-case the name; for the value, strip control characters and spaces
        // then lower-case, so tricks like 'java script:' are caught.
        const n = a.name.toLowerCase(), v = a.value.replace(/[\u0000-\u0020]+/g, '').toLowerCase();
        // WHY: remove event attributes such as onclick. HOW: any attribute name that starts with 'on' is removed.
        if (n.startsWith('on')) el.removeAttribute(a.name);                                   // onclick="..." etc.
        // WHY: stop dangerous links. HOW: for address-like attributes (href, src, action...), remove them if the value starts
        // with javascript:, vbscript: or data:text/html. IMPROVE: none, but test with more tricks.
        else if (/^(href|src|action|formaction|xlink:href|data|poster|srcset)$/.test(n) && /^(javascript|vbscript|data:text\/html)/.test(v)) el.removeAttribute(a.name);
      }
    });
    // WHY: lazy-loaded pictures would stay empty without help. HOW: fixLazy copies real picture addresses into src. IMPROVE:
    // none.
    fixLazy(d);
    // ROUND 50: pictures that have NO address anywhere in the page (their address is built by the site's script, like comizy.io pages 4 and up) get the addresses that reading mode's
    //   detector found in the page's scripts (extraPics, computed by the caller before scripts were removed). They are given out in page order to the empty slots only.
    //   IMPROVE: also keep the slot's original size so the page does not jump when the picture arrives.
    if (extraPics && extraPics.length) placePictures(d, base, extraPics);
    // WHY: if the chapter list is already known (for example after a reload), add it right now. HOW: only runs when cur has
    // a non-empty chapters list.
    if (cur && cur.chapters && cur.chapters.length) { injectChapters(d, cur); fixShortcuts(d, cur.chapters); }   // known already (e.g. page reload)
    // WHY: clicks on links must be handled by MangaFlow, not leave the app. HOW: neutralizeLinks changes the hrefs and keeps
    // the real address in data attributes.
    neutralizeLinks(d, base);
    // WHY: we need a head element to put meta tags in. HOW: use the existing head, or create one and insert it before body.
    const head = d.head || d.documentElement.insertBefore(d.createElement('head'), d.body);
    // WHY: relative links and images need the original site address to work. HOW: a base element holds that address.
    const b = d.createElement('base'); b.href = base;                    // makes relative links/images work
    // WHY: a second safety lock. HOW: a Content-Security-Policy meta tag tells the frame to block scripts, plug-ins and form
    // posts. IMPROVE: also add img-src rules if you want to limit pictures.
    const sec = d.createElement('meta'); sec.httpEquiv = 'Content-Security-Policy';           // second lock inside the frame: no scripts, plug-ins or form posts
    sec.content = "script-src 'none'; object-src 'none'; form-action 'none'";
    // WHY: do not tell other sites where the visitor came from. HOW: a referrer meta tag with no-referrer.
    const m = d.createElement('meta'); m.name = 'referrer'; m.content = 'no-referrer';
    // WHY: each render gets a unique number so we know which page is on screen. HOW: renderCount goes up by 1 and is turned
    // into text.
    const token = String(++renderCount);                                 // marker so hookFrame() knows when THIS document exists
    // WHY: put the number in the page itself. HOW: a meta tag named mf-token holds it, and hookFrame looks for it later.
    const tk = d.createElement('meta'); tk.name = 'mf-token'; tk.content = token;
    // WHY: add our four tags at the top of head. HOW: prepend puts each in front, so the final order is base, security,
    // referrer, token.
    head.prepend(tk); head.prepend(m); head.prepend(sec); head.prepend(b);
    // ROUND 15: a small "rescue" style sheet put LAST in the head. WHY: many sites start with the page hidden (opacity 0, a loading
    // curtain) and let a script reveal it; our frame runs no scripts, so the visitor saw a blank or black page. HOW: force the page
    // visible and hide common "loader" curtains. It never hides anything that was visible. IMPROVE: list more curtain names.
    const rescue = d.createElement('style'); rescue.setAttribute('data-mf', 'rescue');
    rescue.textContent = 'html,body{opacity:1!important;visibility:visible!important}body{overflow:auto!important;height:auto!important}' +
      '#preloader,.preloader,#page-loader,.page-loader,#loader-wrapper,.loader-wrapper,.pace,.pace-active,.loading-overlay,.site-loader{display:none!important}';
    // WHY: put the rescue style last so it wins over the site's own rules. HOW: appendChild adds it at the end of head.
    head.appendChild(rescue);
    // ROUND 18 - PAGES SHOWN WITHOUT THEIR SCRIPTS. WHY: a site's own script normally opens/closes menus, tabs and chapter lists. We run no scripts (safety),
    //   so everything a script would have hidden stays visible ("theme dropdown code showing") and every list that a script would have opened stays
    //   shut ("chapters not showing"). HOW: one more style sheet (MF_NOJS_CSS below) hides closed menus/modals/popups and opens collapsed chapter lists.
    //   It is put after the rescue style, uses class names common to WordPress manga themes and Bootstrap, and never touches the page's main content.
    // IMPROVE: add more theme class names here when a new site shows junk (the troubleshoot report lists the site).
    const nojs = d.createElement('style'); nojs.setAttribute('data-mf', 'nojs'); nojs.textContent = MF_NOJS_CSS; head.appendChild(nojs);
    // WHY: remember which render is current. HOW: store the token on cur if cur exists.
    if (cur) cur.token = token;
    // WHY: actually show the page. HOW: srcdoc sets the iframe content from an HTML text. IMPROVE: use a sandbox attribute
    // on the iframe too.
    frame.srcdoc = '<!doctype html>' + d.documentElement.outerHTML;
    // WHY: start waiting for the frame so we can attach handlers. HOW: hookFrame is below.
    hookFrame(token);
    // ROUND 15: after the page is on screen, check that its styles and icon fonts really loaded and repair what did not (see repairStyles).
    hidePageNote(); repairStyles(token, base).catch(() => { /* repairing is a bonus: never break the page */ });
  }

  /* ---------------------------------------------------------------
     7b. MAKING OTHER SITES LOOK COMPLETE (round 15)
     WHY: people open normal sites in the mini browser (not only manga). Some looked broken: unstyled, black boxes instead of icons.
          Reasons found: (a) a style sheet was refused when fetched directly (hotlink / Referer rules, mixed http), (b) an icon font
          needs a CORS permission its host does not give, (c) the site hides the page until a script shows it (we run no scripts, on
          purpose, for your safety).
     HOW: 2.5 s after the page is shown we look at the live frame. Style sheets that did not load are fetched through your proxy and put
          into the page as <style> text (url(...) made absolute; font files sent through the proxy, which adds the CORS permission). If a
          font failed, all sheets are repaired that way. Then pageHealth() decides whether to show the "may look incomplete" notice with a
          copyable report. Scripts of other sites still never run.
     LIMITS: pages built entirely by JavaScript (React, Vue ...) stay mostly empty: that is reported honestly, not hidden.
     IMPROVE: also route background images, inline SVG sprites and @font-face "local()" fallbacks. */
  // WHY: a pause that can be awaited. HOW: a promise that finishes after ms milliseconds.
  const wait = ms => new Promise(r => setTimeout(r, ms));
  // WHY: the live document inside the frame, but only if it is still THIS page. HOW: compare our token meta tag; null means "the person moved on".
  function liveDoc(token) {
    const d = frame.contentDocument, t = d && d.querySelector('meta[name="mf-token"]');
    return t && t.content === token && cur && cur.token === token ? d : null;
  }
  // WHY: a proxy address for ONE file (used for fonts). HOW: prefer your own proxy / the local launcher, else the first one in the list.
  function proxyUrlFor(url) {
    const l = proxyList(false), p = l.find(x => !DEFAULT_PROXIES.includes(x)) || l[0];
    return p ? p.replace('{url}', encodeURIComponent(url)) : url;
  }
  const rawCache = new Map();                    // address -> text of a style sheet already fetched (so a reload is instant)
  // WHY: fetch a text file (a style sheet) through the proxies. HOW: ask every proxy at once, first good answer wins, 12 s limit, at most
  // 900 000 characters, an HTML answer (error / bot page) counts as a failure. IMPROVE: remember the fastest proxy.
  async function fetchRaw(url) {
    if (rawCache.has(url)) return rawCache.get(url);
    const list = proxyList(false); if (!list.length) throw new Error('no proxy');
    // WHY: one attempt through ONE proxy. HOW: an async arrow function; Promise.any below runs it for every proxy at the
    // same time.
    const one = async tpl => {
      const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), 12000);
      try {
        const res = await fetch(tpl.replace('{url}', encodeURIComponent(url)), { signal: ctrl.signal });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const t = await res.text();
        if (!t || /^\s*<(!doctype|html)/i.test(t)) throw new Error('not a style sheet');
        return t.slice(0, 900000);
      } finally { clearTimeout(timer); }
    };
    const t = await Promise.any(list.map(one));
    rawCache.set(url, t); if (rawCache.size > 60) rawCache.delete(rawCache.keys().next().value);
    return t;
  }
  // WHY: make a style sheet self-contained. HOW: (1) pull in @import files (one level), (2) turn every url(...) into a full address, font files
  // go through the proxy when viaProxy is true, (3) drop the old IE "expression(" trick. IMPROVE: handle @import inside @import.
  async function packCss(css, cssUrl, viaProxy, depth = 0) {
    let head = '';
    if (depth < 1) {
      // WHY: find @import lines (a style sheet that loads other style sheets). HOW: a regular expression collects their
      // addresses and removes the lines; they are fetched below, one level deep, at most 4.
      const imports = []; css = css.replace(/@import\s+(?:url\(\s*)?['"]?([^'")\s;]+)['"]?\s*\)?[^;]*;/gi, (m, u) => { imports.push(u); return ''; });
      for (const u of imports.slice(0, 4)) { const a = absUrl(u, cssUrl); if (a && /^https?:/i.test(a)) { try { head += await packCss(await fetchRaw(a), a, viaProxy, depth + 1) + '\n'; } catch { /* a missing import is not fatal */ } } }
    }
    // WHY: relative addresses inside a style sheet (fonts, backgrounds) must become full addresses because the sheet now
    // lives inside the page. HOW: a regular expression finds every url(...); data: and # links are left alone.
    css = css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (m, q, u) => {
      if (/^(data:|#|about:|blob:)/i.test(u.trim())) return m;                       // inline data and fragments stay as they are
      const a = absUrl(u.trim(), cssUrl); if (!a || !/^https?:/i.test(a)) return m;     // only web addresses
      // WHY: fonts need the proxy's CORS permission, pictures do not. HOW: only font files are sent through the proxy, and
      // only when viaProxy is true.
      return 'url("' + (viaProxy && /\.(woff2?|ttf|otf|eot)(\?|#|$)/i.test(a) ? proxyUrlFor(a) : a) + '")';
    });
    return head + css.replace(/expression\s*\(/gi, 'x(');
  }
  const noteBar = () => $('#pageNote');
  // WHY: hide the "may look incomplete" notice (new page, or dismissed). HOW: set hidden.
  function hidePageNote() { const n = noteBar(); if (n) n.hidden = true; }
  // WHY: the main repair routine, see the big comment above. HOW: wait, look for sheets without a .sheet object (= failed), look for fonts in the
  // 'error' state, repair, check again, then call pageHealth. Every step re-checks that the person is still on this page (liveDoc).
  async function repairStyles(token, base) {
    await wait(2500);
    let fd = liveDoc(token); if (!fd) return;
    // WHY: a small score card for this page, used by the notice and the report. HOW: counters plus a list of notes.
    const stat = { sheets: 0, failed: 0, repaired: 0, stillFailed: 0, fontsBad: false, notes: [] };
    const fontBad = d => { try { return Array.from(d.fonts).some(f => f.status === 'error'); } catch { return false; } };
    const links = Array.from(fd.querySelectorAll('link[rel~="stylesheet"][href]')).filter(l => !/^print$/i.test(l.getAttribute('media') || ''));
    stat.sheets = links.length;
    // WHY: how do we know a sheet really loaded? HOW (found by testing in round 15): the browser gives NO sign when a sheet is refused or blocked: the
    // link still has a .sheet, and reading its rules throws the same SecurityError as for a sheet that loaded fine from another site. Only a
    // sheet whose rules we can read AND that has rules is surely good. Every other sheet is fetched again through the proxy (at most 8 per page, kept
    // in rawCache so a revisit costs nothing). IMPROVE: use the 'securitypolicyviolation' event to find the blocked ones exactly.
    const sheetBad = l => { if (!l.sheet) return true; try { return l.sheet.cssRules.length === 0; } catch { return true; } };
    const failed = links.filter(sheetBad);
    stat.failed = failed.length;
    const redo = failed;                              // sheets that are not surely good (see above)
    // WHY: repair at most 8 sheets so a huge page cannot flood the proxy. HOW: slice keeps the first 8.
    for (const l of redo.slice(0, 8)) {
      try {
        // ROUND 18: font files go THROUGH the proxy at once (viaProxy = true). WHY: the proxy adds the CORS permission fonts need, and the old
        // "try without, then redo" cost 4+ seconds and sometimes never fixed the icons (the manhuatop report). Pictures stay direct.
        const href = l.href, css = await packCss(await fetchRaw(href), href, true);
        fd = liveDoc(token); if (!fd) return;                                   // the person left while we were fetching
        const st = fd.createElement('style'); st.setAttribute('data-mf', 'repaired'); st.setAttribute('data-from', href);
        const media = l.getAttribute('media'); st.textContent = media && !/^(all|screen)$/i.test(media) ? '@media ' + media + '{' + css + '}' : css;
        l.replaceWith(st); stat.repaired++;
      } catch (e) { stat.stillFailed++; stat.notes.push('style sheet ' + l.href + ' : ' + (e && e.message ? e.message : 'failed')); }
    }
    await wait(1800);
    fd = liveDoc(token); if (!fd) return;
    // ROUND 15: fonts still failing? Then rebuild every repaired sheet with its font files sent THROUGH the proxy (it adds the CORS permission fonts need).
    if (fontBad(fd)) {
      for (const st of Array.from(fd.querySelectorAll('style[data-mf="repaired"]'))) {
        try { const href = st.getAttribute('data-from'), css = await packCss(await fetchRaw(href), href, true); if (!liveDoc(token)) return; st.textContent = css; stat.notes.push('fonts re-sent through the proxy for ' + href); } catch { /* keep the first version */ }
      }
      // WHY: give the fonts time to load, then make sure the person is still on this page. HOW: wait, then liveDoc(token)
      // returns null if they left.
      await wait(1800); fd = liveDoc(token); if (!fd) return;
    }
    // ROUND 54: only warn about fonts when it matters. WHY: nyxscans lists many text fonts (Arabic and others) and one of them failing made the notice say "icons may look like empty boxes" even though the page looked fine.
    // HOW: name the failed fonts in the report; warn only if an ICON-style font failed (name has icon / awesome / symbol / glyph / material / fa) or more than half of all fonts failed.
    // IMPROVE: also check that an icon glyph really drew.
    try {
      const all = Array.from(fd.fonts), bad = all.filter(f => f.status === 'error');
      if (bad.length) stat.notes.push('fonts that failed (' + bad.length + ' of ' + all.length + '): ' + bad.map(f => String(f.family).replace(/["']/g, '')).slice(0, 12).join(', '));
      stat.fontsBad = bad.some(f => /icon|awesome|symbol|glyph|material|(^|[^a-z])fa([^a-z]|$)/i.test(f.family)) || (all.length > 0 && bad.length * 2 > all.length);
    } catch { stat.fontsBad = false; }
    pageHealth(fd, stat, base);
  }
  // WHY: judge the finished page honestly and, if something is wrong, show a slim notice with a Report button (a copyable bug report).
  // HOW: collect "issues"; none = nothing shown. IMPROVE: also compare the page with a screenshot.
  function pageHealth(fd, stat, base) {
    if (cur && cur.isSearch) return;   // round 17: our own results list is always complete, no notice
    const text = ((fd.body && fd.body.innerText) || '').trim(), scripts = cur && cur.doc ? cur.doc.querySelectorAll('script').length : 0;
    const issues = [];
    // WHY: describe the first problem in plain words. HOW: pushes a sentence into the issues list; the notice shows
    // issues[0] and the report shows all.
    if (stat.stillFailed) issues.push(stat.stillFailed + ' style sheet(s) could not be loaded, so the page may look plain.');
    if (stat.fontsBad) issues.push('An icon / text font could not be loaded, so icons may look like empty boxes.');
    if (text.length < 200 && scripts > 2) issues.push('This page is built by JavaScript. MangaFlow does not run other sites\' scripts (safety), so it can look empty.');
    if (!issues.length) return;
    const report = ['MangaFlow page report (round 15)', 'Time: ' + new Date().toString(), 'Page: ' + (cur ? cur.url : '-'), 'Base: ' + base,
      'Style sheets: ' + stat.sheets + ' | not loaded at first: ' + stat.failed + ' | repaired through the proxy: ' + stat.repaired + ' | still failed: ' + stat.stillFailed,
      'Font problem after repair: ' + stat.fontsBad, 'Scripts on the page (not run): ' + scripts, 'Visible text length: ' + text.length,
      'Proxies: ' + (settings.proxies.length ? settings.proxies.map(proxyName).join(', ') : 'NONE'), 'Browser: ' + navigator.userAgent,
      issues.map(i => '- ' + i).join('\n'), stat.notes.join('\n'), 'First 300 characters of text: ' + text.slice(0, 300)].join('\n');
    const n = noteBar(); if (!n) return;
    $('#pageNoteText').textContent = '\u26A0 This page may look incomplete: ' + issues[0];
    n.dataset.report = report; n.dataset.title = 'Page looks incomplete'; n.hidden = false;
  }

  /* Connect our click / form handlers to the iframe document AS SOON AS it exists.
     WHY: waiting for the iframe "load" event is too late on slow pages (see neutralizeLinks).
     HOW: check every 50 ms for our token meta tag; stop after about 5 seconds. The "load" event below is a backup. */
  // WHY: attach our handlers as soon as the frame document exists. HOW: a timer runs every 50 ms and looks for our token;
  // tries counts attempts, about 5 seconds in total.
  function hookFrame(token) {
    let tries = 0;
    // WHY: repeated check. HOW: setInterval runs the function every 50 ms; the id t is kept so we can stop it.
    const t = setInterval(() => {
      // WHY: read the document inside the iframe. HOW: contentDocument may be empty at first.
      const d = frame.contentDocument;
      // WHY: find our marker. HOW: only search when the document and its head exist.
      const mark = d && d.head && d.querySelector('meta[name="mf-token"]');
      // WHY: when the marker matches the token the right page is ready. HOW: stop the timer and hook the document; otherwise
      // count tries and stop after 100.
      if (mark && mark.content === token) { clearInterval(t); hookDoc(d); }
      else if (++tries > 100) clearInterval(t);
    }, 50);
  }
  // WHY: connect click, submit and warning handlers to the frame page. HOW: d is the frame document; stop if missing or
  // already done. IMPROVE: none.
  function hookDoc(d) {
    if (!d || d.mfHooked) return;
    // WHY: avoid attaching handlers twice. HOW: set a flag on the document object itself.
    d.mfHooked = true;                                                   // never attach twice to the same document
    d.addEventListener('pointerdown', () => { if (cur) cur.touched = true; }, true);   // ROUND 59: any touch on the page = the person is using it
    // WHY: catch all link clicks in the frame. HOW: the true at the end means capture mode, so our code runs before the
    // page's own code.
    d.addEventListener('click', onFrameClick, true);
    // WHY: middle click would open a new tab and escape the app. HOW: if the click is on a link, preventDefault cancels it.
    d.addEventListener('auxclick', e => { if (e.target.closest && e.target.closest('a')) e.preventDefault(); }, true);   // middle click
    // ROUND 25: image loading - images that fail to load are retried through the proxy
    // WHY: some sites block cross-origin image requests. HOW: when an image fails, try loading it through the proxy.
    d.addEventListener('error', e => { if (e.target.tagName === 'IMG') retryFrameImg(e.target); }, true);
    // ROUND 51: pictures that ALREADY failed before this listener existed (a hotlink-blocked picture fails within milliseconds, the listener is attached later) were never retried,
    //   which left whole chapters blank. HOW: sweep the document now, again when the frame finishes loading, and once more after 3 seconds.
    sweepFrameImgs(d); setTimeout(() => sweepFrameImgs(d), 3000);
    // WHY: catch form submits such as search boxes. HOW: capture mode again.
    d.addEventListener('submit', onFrameSubmit, true);
    // WHY: tell the person when the page tried to run a blocked script. HOW: the browser sends a securitypolicyviolation
    // event. IMPROVE: show it less often.
    d.addEventListener('securitypolicyviolation', onSecurityViolation);   // round 8: a script of the page was stopped -> tell the person
    // ROUND 44 (Page 2 scroll-hide): watch this page's scrolling so the header and floating buttons hide when the
    // person scrolls down and come back when they scroll up — the same feel as reading mode (Page 3).
    p2ScrollHook(d);
    // WHY: add chapter list and shortcuts if data is already known. HOW: applyLive is below.
    applyLive(d);
  }
  // ROUND 51 — retry ONE broken picture of the site view through the proxy, with the page address as Referer (see the long note where the 'error' listener is attached).
  function retryFrameImg(img) {
    if (!img || !img.src || /^(data:|blob:)/.test(img.src) || img.dataset.mfRetried) return;
    // ROUND 51 (comizy.io chapters stayed blank on Page 2): the old retry used the FIRST proxy in the list (often a public one that cannot send a Referer) and no Referer at all,
    //   but picture hosts like cmzcdn.org only answer when the request says it comes from the chapter page. Reading mode (Page 3) uses YOUR OWN proxy plus &ref=<page address>;
    //   Page 2 now does the same. HOW: own = first proxy that is not a built-in default (falls back to the first one); ref = the page's address. IMPROVE: also try the other proxies one by one.
    const orig = img.src, own = (proxyList(false).find(p => !DEFAULT_PROXIES.includes(p))) || (settings.proxies && settings.proxies[0]) || '';
    const proxyUrl = own.replace('{url}', encodeURIComponent(orig)) + (cur && cur.url && own.includes('workers.dev') ? '&ref=' + encodeURIComponent(cur.url) : '');
    if (own && proxyUrl !== orig) { img.dataset.mfOrig = orig; img.src = proxyUrl; img.dataset.mfRetried = '1'; }
  }
  // WHY: find pictures that failed earlier. HOW: complete + naturalWidth 0 means "tried and failed". IMPROVE: stagger the retries on huge pages.
  function sweepFrameImgs(d) { try { Array.from(d.images || []).forEach(i => { if (i.complete && !i.naturalWidth && i.getAttribute('src')) retryFrameImg(i); }); } catch { /* ignore */ } }
  // ROUND 44 — PAGE 2 SCROLL-HIDE (header + floating buttons).
  // WHY: on Page 2 (an outside site shown in MangaFlow's mini-browser) the header and the round buttons always covered
  //   the page. Earlier rounds (41/42) wrongly wrote that this is impossible; it is not: the page lives in a same-origin
  //   srcdoc <iframe> (sandbox has allow-same-origin), so OUR script can listen to ITS window's 'scroll' event even
  //   though the page's own scripts are blocked.
  // HOW: a passive scroll listener on the frame's window. It adds up small movements (14px dead zone, so a tiny finger
  //   wobble does nothing). Down far enough -> add class "mf-hide" on the header and "p2-hide" on <body> (CSS fades the
  //   floating buttons); up far enough or near the top (<40px) -> remove both. After every change we ignore scroll events
  //   for 450ms: hiding the header makes the frame taller, which at the very bottom of a page can clamp the scroll
  //   position and fake an "up" scroll, which would show the header again and loop forever (flicker).
  // IMPROVE: make the 14px dead zone a setting; also react to the wheel/touch events if a page has its own inner scroller.
  const p2 = { lastY: 0, up: 0, down: 0, lockUntil: 0 };
  function p2Set(hide) {
    const nav = document.querySelector('.navbar');
    if (nav) nav.classList.toggle('mf-hide', hide);
    document.body.classList.toggle('p2-hide', hide);
    p2.up = p2.down = 0; p2.lockUntil = performance.now() + 450;
  }
  function p2Reset() { p2.lastY = 0; p2.up = p2.down = 0; p2.lockUntil = 0; document.body.classList.remove('p2-hide'); }
  function p2ScrollHook(d) {
    const w = d && d.defaultView; if (!w) return;
    p2Reset();
    const getY = () => w.pageYOffset || (d.scrollingElement ? d.scrollingElement.scrollTop : 0) || 0;
    w.addEventListener('scroll', () => {
      if (frame.hidden || !reader.hidden) return;                    // only while Page 2 is the thing on screen
      const y = getY();
      if (performance.now() < p2.lockUntil) { p2.lastY = y; return; }
      const dy = y - p2.lastY; p2.lastY = y;
      const hidden = document.body.classList.contains('p2-hide');
      if (y < 40) { if (hidden) p2Set(false); p2.up = p2.down = 0; return; }
      if (dy < 0) { p2.up -= dy; p2.down = 0; if (hidden && p2.up > 14) p2Set(false); }
      else if (dy > 0) { p2.down += dy; p2.up = 0; if (!hidden && p2.down > 14) p2Set(true); }
    }, { passive: true });
  }
  // WHY: backup in case the timer missed. HOW: the iframe load event calls hookDoc, which ignores repeats.
  frame.addEventListener('load', () => { hookDoc(frame.contentDocument); try { sweepFrameImgs(frame.contentDocument); } catch { /* ignore */ } });  // backup (+ round 51: retry pictures that failed before we were listening)

  // Put the chapter list / shortcuts into the document that is on screen right now.
  // WHY: add chapters, shortcuts and link changes to the page that is on screen now. HOW: stop if no chapters are known
  // yet. IMPROVE: none.
  function applyLive(d) {
    if (!cur) return;
    // ROUND 56: the button bridge needs no chapter list, so it runs first (only when the frame shows the page we think it shows).
    { const m0 = d.querySelector('meta[name="mf-token"]'); if (m0 && m0.content === cur.token) { markNavControls(d); updateP2Bar(); } }
    if (!cur.chapters || !cur.chapters.length) return;
    // WHY: be sure the frame shows the page we think it shows. HOW: read its token meta tag and compare with cur.token; if
    // different, do nothing.
    const mark = d.querySelector('meta[name="mf-token"]');
    if (!mark || mark.content !== cur.token) return;                     // the frame shows another page: ignore
    // WHY: do the three patching steps on the live document. HOW: add the list, fix the buttons, then turn links into safe
    // ones.
    injectChapters(d, cur); fixShortcuts(d, cur.chapters); neutralizeLinks(d, cur.base);
  }


  /* ===========================================================================================================
     ROUND 56 - BUTTON BRIDGE  (the site's own "Next / Previous / Chapters" buttons work on Page 2 again)
     WHY: nyxscans.com (and many modern sites built with React / Next.js) draw their chapter bar with SCRIPT-driven buttons: <button> tags with no address inside them. MangaFlow never runs a site's scripts
          (the CSP and the sandbox block them - that is what keeps you safe), so those buttons did nothing on Page 2.
     HOW (3 parts):
       1. READ THE MEANING: classifyControl() looks at the clicked thing and its parents (label, title, picture alt, small words, id/class names, symbols such as > and <) and decides: NEXT, PREVIOUS or CHAPTER LIST.
          It works in many languages (English, Spanish, French, Portuguese, Indonesian, Turkish, German, Italian, Arabic, Chinese, Japanese, Korean).
       2. DO THE JOB OURSELVES: navTargets() finds the real addresses from the page's own links, the chapter list we already detected, or - as the last guess - the same address with the chapter number +1 / -1.
          Next / Previous then open that address in Page 2; Chapter list opens our own small chapter picker (a plain <dialog>, so it needs no script from the site).
          A control that carries an address in a data attribute (data-href, data-url, ...) is simply opened.
       3. MAKE THEM REACHABLE: markNavControls() un-hides recognised buttons that the site keeps transparent until its script runs, and if the page has NO recognisable chapter buttons at all, a tiny icon bar
          (previous / list / next) is shown instead (updateP2Bar), so changing chapters always works.
     IMPROVE: learn new words from the person (a "teach this button" mode); remember which button words worked on which site. */
  const NAV_STRONG = {
    next: /(^|[^a-z])(next|forward|siguiente|suivant|pr[oó]ximo|proximo|selanjutnya|berikutnya|sonraki|weiter|avanti|nächste)([^a-z]|$)|التالي|下一|次の|次へ|다음/i,
    prev: /(^|[^a-z])(prev|previous|anterior|pr[eé]c[eé]dent|sebelumnya|[oö]nceki|zur[uü]ck|precedente|vorherige)([^a-z]|$)|السابق|上一|前の|前へ|이전/i,
    list: /(chapter\s*list|chapters?|episodes?|all\s*chapters|table of contents|cap[ií]tulos|chapitres|daftar\s*chapter|b[oö]l[uü]mler|kapitel|capitoli)|الفصول|章节|章節|目录|目次|챕터|목록|화\s*목록/i
  };
  const NAV_SYMBOL = { next: /^[\s]*[›»▶►➡→>⏩⟩❯]+[\s]*$/, prev: /^[\s]*[‹«◀◄⬅←<⏪⟨❮]+[\s]*$/ };
  const NAV_WEAK = {
    next: /(^|[^a-z])(next|nxt|forward)([^a-z]|$)/i,
    prev: /(^|[^a-z])(prev|previous|prv|back-chapter)([^a-z]|$)/i,
    list: /(chapter[-_ ]?(list|select|menu|dropdown|picker)|chapters?[-_ ]?(btn|button|toggle|drawer)|episode[-_ ]?list|toc)/i
  };
  // ROUND 58: a "dead" link = an <a> whose address does nothing without the site's script ("#", "#/", "#/next/", "javascript:void(0)"). arenascan's Prev / Next are exactly these ("#/prev/", "#/next/"),
  // so the normal link code could not open anything and the frame even tried to leave the page. They are treated like script buttons: their WORDS (and the address text) say next / previous.
  function isDeadAnchor(el) {
    if (!el || el.tagName !== 'A') return false;
    const h = (el.getAttribute('data-mf-href') || el.getAttribute('href') || '').trim();
    return h === '' || /^#/.test(h) || /^javascript:/i.test(h);
  }
  function isButtonLike(el) {
    if (!el || el.nodeType !== 1) return false;
    if (isDeadAnchor(el)) return true;
    const t = el.tagName;
    if (/^(BUTTON|SUMMARY)$/.test(t) || el.hasAttribute('onclick') || el.hasAttribute('tabindex')) return true;
    const role = (el.getAttribute('role') || '').toLowerCase(); if (role === 'button' || role === 'link' || role === 'menuitem' || role === 'tab') return true;
    try { return el.ownerDocument.defaultView.getComputedStyle(el).cursor === 'pointer'; } catch { return false; }
  }
  // WHY: collect the "words" of one control. HOW: label-type attributes first (strong), id/class names second (weak).
  function controlClues(el) {
    const g = n => el.getAttribute(n) || '';
    let svgTitle = ''; try { const t = el.querySelector('svg title'); svgTitle = t ? t.textContent : ''; } catch { /* ignore */ }
    let alt = ''; try { const i = el.querySelector('img[alt]'); alt = i ? i.getAttribute('alt') : ''; } catch { /* ignore */ }
    const text = (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60);
    const hrefWords = isDeadAnchor(el) ? (el.getAttribute('data-mf-href') || el.getAttribute('href') || '').replace(/[#/_-]+/g, ' ') : '';   // ROUND 58: "#/next/" -> "next"
    const strong = [hrefWords, g('aria-label'), g('title'), g('alt'), g('data-title'), g('data-tooltip'), g('name'), g('value'), alt, svgTitle, text].join(' | ');
    const weak = [el.id, typeof el.className === 'string' ? el.className : g('class'), g('data-testid'), g('data-action'), g('aria-controls')].join(' ');
    return { strong, weak, text };
  }
  // WHY: decide what a control means. HOW: symbols alone (> or <) -> next / prev; strong words next; weak names only for button-like things.
  function classifyControl(el) {
    const c = controlClues(el);
    if (NAV_SYMBOL.next.test(c.text)) return 'next';
    if (NAV_SYMBOL.prev.test(c.text)) return 'prev';
    const n = NAV_STRONG.next.test(c.strong), p = NAV_STRONG.prev.test(c.strong), l = NAV_STRONG.list.test(c.strong);
    if (n && !p) return 'next'; if (p && !n) return 'prev';
    if (!n && !p && l && c.text.length <= 40) return 'list';
    if (isButtonLike(el)) {
      const wn = NAV_WEAK.next.test(c.weak), wp = NAV_WEAK.prev.test(c.weak), wl = NAV_WEAK.list.test(c.weak);
      if (wn && !wp) return 'next'; if (wp && !wn) return 'prev'; if (wl && !wn && !wp) return 'list';
    }
    return null;
  }
  // WHY: is the page on screen a chapter page? HOW: a chapter number in the address, or the 3-picture rule.
  function onChapterPage() {
    try { return !!cur && !cur.isSearch && (chapterNumInUrl(cur.url) != null || looksLikeChapter(cur.doc, cur.base, cur.url)); } catch { return false; }
  }
  // WHY: the real places "next", "previous" and "list" lead to. HOW: the page's own links -> the detected list -> same address with the number +1 / -1 (last guess).
  function navTargets() {
    const out = { prev: null, next: null, idx: -1, guessed: false };
    if (!cur) return out;
    let nl = {}; try { nl = findNavLinks(cur.doc, cur.base, cur.url) || {}; } catch { /* ignore */ }
    out.prev = nl.prev || null; out.next = nl.next || null;
    const L = cur.chapters || [], i = L.findIndex(c => sameUrl(c.url, cur.url));
    if (i >= 0) { out.idx = i; if (!out.prev && L[i - 1]) out.prev = L[i - 1].url; if (!out.next && L[i + 1]) out.next = L[i + 1].url; }
    if (!out.prev || !out.next) {
      const n = chapterNumInUrl(cur.url), mk = chapterUrlMaker(cur.url);
      if (n != null && Number.isInteger(n) && mk) {
        if (!out.next) { out.next = mk(n + 1); out.guessed = true; }
        if (!out.prev && n > 0) { out.prev = mk(n - 1); out.guessed = true; }
      }
    }
    return out;
  }
  function openNavTarget(kind) {
    const t = navTargets();
    if (kind === 'list') return openChapterPicker();
    const u = t[kind];
    if (!u) { toast('There is no ' + (kind === 'next' ? 'next' : 'previous') + ' chapter on this site.'); return; }
    navigate(u, true, { chapterStep: true });
  }
  // WHY: our own chapter picker (the site's list button cannot run its script). HOW: a <dialog> in MangaFlow itself; the list comes from cur.chapters, or is loaded from the series page first.
  async function openChapterPicker() {
    let dlg = document.getElementById('mfChapPick');
    if (!dlg) {
      dlg = document.createElement('dialog'); dlg.id = 'mfChapPick';
      dlg.innerHTML = '<h3>Chapters</h3><input id="mfChapFind" type="search" placeholder="Find a chapter number…" aria-label="Find a chapter"><ul id="mfChapUl"></ul><div class="row"><button id="mfChapClose">Close</button></div>';
      document.body.appendChild(dlg);
      dlg.querySelector('#mfChapClose').onclick = () => dlg.close();
      dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
    }
    const ul = dlg.querySelector('#mfChapUl'), find = dlg.querySelector('#mfChapFind'); ul.innerHTML = '<li class="muted">Loading the chapter list…</li>'; find.value = '';
    if (!dlg.open) dlg.showModal();
    let L = cur && cur.chapters && cur.chapters.length ? cur.chapters : null;
    if (!L && cur) { try { const r = await loadSeriesList(cur.doc, cur.base, cur.url); if (r && r.chapters && r.chapters.length) { L = r.chapters; cur.chapters = L; } } catch { /* shown below */ } }
    if (!L) { ul.innerHTML = '<li class="muted">The chapter list could not be found on this site. Use Reading mode (the book button) instead.</li>'; return; }
    const draw = q => {
      ul.innerHTML = ''; const want = String(q || '').trim().toLowerCase();
      L.forEach(c => {
        const label = 'Chapter ' + fmtNum(c.num) + (c.title && !/^chapter\s*[\d.]+$/i.test(c.title) ? ' - ' + c.title : '');
        if (want && !label.toLowerCase().includes(want)) return;
        const li = document.createElement('li'), b = document.createElement('button');
        b.textContent = label; if (sameUrl(c.url, cur.url)) { b.className = 'now'; b.setAttribute('aria-current', 'true'); }
        b.onclick = () => { dlg.close(); navigate(c.url, true, { chapterStep: true }); };
        li.appendChild(b); ul.appendChild(li);
      });
      if (!ul.children.length) ul.innerHTML = '<li class="muted">No chapter matches.</li>';
      const now = ul.querySelector('.now'); if (now) now.scrollIntoView({ block: 'center' });
    };
    draw(''); find.oninput = () => draw(find.value);
  }
  // WHY: the click hook. HOW: called first from onFrameClick; true = handled (the site's own dead handler must not run).
  function bridgeClick(e) {
    if (!cur || cur.isSearch) return false;
    let el = e.target && e.target.nodeType === 1 ? e.target : (e.target && e.target.parentElement);
    for (let hop = 0; el && hop < 6 && el.tagName !== 'BODY' && el.tagName !== 'HTML'; hop++, el = el.parentElement) {
      // a control that simply carries an address in a data attribute
      const du = el.getAttribute && (el.getAttribute('data-href') || el.getAttribute('data-url') || el.getAttribute('data-link') || el.getAttribute('data-target-url'));
      if (du && !el.closest('a[href]') && !/^(javascript|data|blob|mailto|tel):/i.test(du)) { const u = absUrl(du, cur.base); if (u) { e.preventDefault(); e.stopPropagation(); navigate(unwrap(u)); return true; } }
      if (el.closest && el.closest('a[href]') && !isDeadAnchor(el.closest('a[href]'))) return false;   // a real link: the normal code handles it (ROUND 58: dead links are handled here)
      if (!onChapterPage()) return false;
      const kind = classifyControl(el);
      if (kind) { e.preventDefault(); e.stopPropagation(); openNavTarget(kind); return true; }
    }
    return false;
  }
  // WHY: some sites keep the bar invisible (opacity 0 / hidden) until their script runs. HOW: for recognised controls, force them visible. Returns how many recognised controls the page has.
  function markNavControls(d) {
    let n = 0;
    try {
      const w = d.defaultView;
      d.querySelectorAll('button,[role=button],[onclick],[tabindex],summary,div,span,a[href^="#"],a[href^="javascript:"]').forEach(el => {
        if (el.dataset && el.dataset.mfNav) { n++; return; }
        if (!isButtonLike(el)) return;
        if (el.querySelector && el.querySelector('button,[role=button]')) return;     // only the innermost control
        const kind = classifyControl(el); if (!kind) return;
        el.dataset.mfNav = kind; n++;
        for (let p = el, k = 0; p && k < 5 && p !== d.body; p = p.parentElement, k++) {
          const cs = w.getComputedStyle(p);
          if (cs.opacity === '0' || cs.visibility === 'hidden') { p.style.setProperty('opacity', '1', 'important'); p.style.setProperty('visibility', 'visible', 'important'); }
          if (cs.pointerEvents === 'none') p.style.setProperty('pointer-events', 'auto', 'important');
        }
      });
    } catch { /* never break the page */ }
    return n;
  }
  // WHY: the tiny fallback bar. HOW: shown only on a chapter page that has no recognisable chapter buttons of its own.
  function updateP2Bar() {
    const bar = document.getElementById('p2NavBar'); if (!bar) return;
    let show = false;
    try {
      if (cur && !cur.isSearch && !frame.hidden && reader.hidden && onChapterPage()) {
        const found = (frame.contentDocument && frame.contentDocument.querySelectorAll('[data-mf-nav]').length) || 0;
        show = found === 0;
      }
    } catch { show = false; }
    bar.hidden = !show;
  }
  // WHY: runs when the person clicks inside the frame. HOW: e is the click event; find the nearest link above the clicked
  // thing; stop if none. IMPROVE: none.
  function onFrameClick(e) {
    if (cur) cur.touched = true;       // ROUND 59: the person is using the site -> background detection backs off
    if (bridgeClick(e)) return;               // ROUND 56: the site's own Next / Previous / Chapters buttons (see the button bridge above)
    // ROUND 25: Allow all site interactions (buttons, dropdowns, forms) to work. Only intercept link navigation.
    // WHY: preventing all clicks broke site features like filters, buttons, dropdowns. HOW: only preventDefault on actual link clicks.
    const a = e.target.closest && e.target.closest('a');
    if (!a || !cur) {
      // No link clicked - let the site's own click handlers run (buttons, dropdowns, etc.)
      return;
    }
    // From here on, we have a link click to intercept
    // ROUND 22: Ctrl / Cmd / Shift click and the middle button must follow the link's href (now OUR address, see appLink) so a NEW MangaFlow tab opens. Only a plain click is handled here.
    if ((e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1) && a.dataset.mfHref) return;
    // WHY: read the real address if we saved one. HOW: data-mf-href first, then the normal href.
    const mf = a.dataset.mfHref;
    const href = a.getAttribute('href') || '';
    // WHY: plain '#' links should just scroll the page. HOW: if there is no saved address and the href is empty or starts
    // with #, return without cancelling.
    if (!mf && (!href || href.startsWith('#'))) return;                  // in-page anchor: let it scroll
    // WHY: stop the browser from leaving the app. HOW: preventDefault cancels the normal click action.
    e.preventDefault();
    // WHY: a chapter link should start reading at once. HOW: if the saved address is a chapter of this manga, call readFrom.
    if (mf && isChapterLinkOfCurrent(mf)) return readFrom(mf);            // round 8: a chapter link starts reading at once
    // WHY: other saved addresses just open as a page. HOW: navigate loads it in the mini browser.
    if (mf) return navigate(mf, true, { user: !!(cur && cur.isSearch) });   // round 17: a link picked from the results list may open straight in reading mode
    // WHY: safety, never follow odd link types. HOW: a pattern tests the start of the href and returns if it matches.
    if (/^(javascript|mailto|tel|data|vbscript|file|blob):/i.test(href.trim())) return;     // never follow these
    // WHY: normal links. HOW: make the full address from the base, unwrap removes any proxy wrapper, then navigate. IMPROVE:
    // none.
    const u = absUrl(href, cur.base); if (u) navigate(unwrap(u));
  }
  // WHY: handle form submits (like a search box) inside the frame. HOW: stop the real submit first.
  function onFrameSubmit(e) {
    e.preventDefault();
    // WHY: get the form that was sent. HOW: e.target is the form; stop if missing.
    const f = e.target; if (!f || !cur) return;
    // WHY: work out the form method (GET or POST). HOW: read the method attribute (default is GET).
    const method = (f.getAttribute('method') || 'get').toLowerCase();
    // WHY: work out where the form goes. HOW: try the saved action, the form action or the current address; the try/catch
    // ignores bad addresses.
    // ROUND 27 (bug B3): neutralizeLinks saves the real action in data-mf-action and sets action="about:blank". A form with NO action saved '' - which is falsy -
    // so the code fell through to the "about:blank" and opened a blank page. Now the saved value is used when it exists, and an empty one means "this same page".
    const savedAction = 'mfAction' in f.dataset ? f.dataset.mfAction : f.getAttribute('action');
    let u; try { u = new URL(savedAction || cur.url, cur.base); } catch { return; }
    // ROUND 24: POST forms are now supported by sending them through the proxy. WHY: many search and filter forms use POST.
    // HOW: build the request body from form fields and pass it to fetchDoc with the post option.
    if (method === 'post') {
      const fd = new FormData(f);
      const body = new URLSearchParams(fd).toString();     // convert form data to URL-encoded body
      navigate(u.href, true, { post: body });             // navigate will call fetchDoc with opt.post
      return;
    }
    // WHY: for GET forms add what the person typed to the address. HOW: for each form field that is text, set it as a query parameter.
    // ROUND 27 (bug B4): set() kept only the LAST value of a repeated name (genre=a & genre=b became genre=b). Now the old query is cleared first and
    // every field is appended, so repeated names stay. The button that was pressed (e.submitter) is included like a real browser does.
    const names = new Set(); new FormData(f).forEach((v, k) => names.add(k)); names.forEach(k => u.searchParams.delete(k));
    new FormData(f, e.submitter || undefined).forEach((v, k) => { if (typeof v === 'string') u.searchParams.append(k, v); });
    // WHY: open the result. HOW: navigate with the finished address.
    navigate(u.href);
  }

  // Address bar text lives in three places: the wide input, the phone popup input and the phone pill.
  // WHY: the address appears in three places and must stay the same. HOW: set the wide input, the phone popup input and
  // the phone pill text; empty means show a hint. IMPROVE: loop over a list of ids.
  function setAddress(url) {
    url = String(url || '').replace(/^mf-google:/, '');                    // round 22: the Google-API pseudo address shows as the words that were searched
    // WHY: update the two inputs and the reader input. HOW: $ is a short helper for querySelector.
    $('#addr').value = url; $('#addr2').value = url; $('#rdAddr').value = url;
    $('#pillText').textContent = url ? shortUrl(url) : 'Search or paste a link';
    // ROUND 9b: boxes filled by code send no "input" event, so show/hide their clear (x) buttons here.
    // WHY: the small clear (x) buttons need to show or hide. HOW: for each button, find the input named in data-for and hide
    // the button when the box is empty.
    $$('.clearx').forEach(b => { b.hidden = !$('#' + b.dataset.for).value; });
  }

  /* OPENING A PAGE  (round 8: can go straight into reading mode)
     WHY: before, pasting the address of a manga's main page only showed the site's page; you had to press
          "Reading mode" or edit the link to ".../chapter-1". Now a link you PASTE or TYPE (opts.user) is checked
          after it loads: if it is a manga page (chapter pictures, or a chapter list of its own) reading mode
          starts by itself, from the chapter you stopped at last time (history) or from chapter 1.
     HOW: navigate() loads and shows the page, then starts enhanceSeriesPage() (fetches hidden chapter lists).
          tryAutoRead() waits for that, decides "is this a manga?" and calls startReading({ quiet: true }).
          quiet = no error pop-up when it does not work out (the page simply stays open for you to choose).
          The site's front page, search results and pages with no chapters are never auto-read.
          Turn it off in Settings ("Open a manga link straight in reading mode").
     RETURNS: true when the page was loaded (so the reader bar can go back to reading when it was not). */
  // WHY: the main function that opens any address. HOW: it is async (can wait for the network). input is text, push says
  // add to history, opts.user means typed by the person. Returns true if it loaded. IMPROVE: split into smaller steps.
  // ROUND 18 - "the search shows something else" fix. WHY: every search or page load used to run to the end even when you had already started
  // another one, so a slow OLD answer could arrive last and replace the NEW result (you searched for A and saw B). HOW: each call gets a
  // number (mySeq); after every wait the call checks "am I still the newest?" (stale()) and quietly stops when it is not. IMPROVE: abort
  // the old network request too, not only ignore its answer.
  let navSeq = 0;
  async function navigate(input, push = true, opts = {}) {
    const mySeq = ++navSeq, stale = () => mySeq !== navSeq;
    googleNote = '';                                  // round 28: a note about a Google search that found nothing belongs to that search only
    // ROUND 23 - "I chose Google but after the search another engine answered / Google sends me to google.com". WHY: (1) the chosen engine was only kept when it worked; (2) the "Google" buttons
    //   and chips opened google.com in a new tab. HOW: opts.engine = 'google' forces Google for THIS search; a google.com/search?q=words address (button, chip, link) is turned into the same
    //   in-app Google search instead of leaving the site. The engine you chose is never changed by a fallback (the select keeps showing your choice).
    // ROUND 28b - WHY: this conversion only ran when an API key existed (gKeyOn()). Since round 24 nobody has a key by default, so a pasted google.com/search address (and the "Google" chip
    //   under a results list) still opened a NEW TAB. HOW: the key is no longer asked here. With a key the words go to the Google API list; without one they go to the key-less Google
    //   search panel (googleSearch below); if Google cannot answer, the free engines take over - all of that already happens further down. IMPROVE: none needed.
    { const gx = /^https?:\/\/(www\.)?google\.[a-z.]+\/search\?([^#]*)/i.exec(String(input || '')); if (gx) { const w = new URLSearchParams(gx[2]).get('q'); if (w) { navSeq--; return navigate(w, push, { ...opts, engine: 'google' }); } } }
    const eng0 = opts.engine || settings.searchEngine;
    // ROUND 18: a Google search in the back / forward list is stored as  mf-google:<words>  (see googleSearch in section 18).
    const gm = /^mf-google:([\s\S]*)$/.exec(String(input || ''));
    if (gm) { if (gKeyOn()) { navSeq--; return navigate(gm[1], push, { ...opts, engine: 'google' }); } return googleSearch(gm[1], push, mySeq); }   // round 22: with an API key the words go through the normal path (Google API list)
    // WHY: make a safe address from what the person typed. HOW: normalizeInput fixes it up, safeWebUrl allows only http and
    // https.
    let url = safeWebUrl(normalizeInput(input));
    // ROUND 17: "#mf-raw" at the end = show the engine's own page instead of the clean results list.
    const wantRaw = !!url && /#mf-raw$/.test(url); if (wantRaw) url = url.replace(/#mf-raw$/, '');
    // ROUND 17: Google cannot be read through a proxy (it blocks that), so a Google address opens in a NEW TAB where it works normally.
    // ROUND 28b: this now only meets Google addresses that are NOT a search with words (google.com itself, google.com/maps, ...): a google.com/search?q=words address was already
    //   turned into the in-app Google search at the top of this function. IMPROVE: none needed.
    if (url) { try { if (/^(www\.)?google\.[a-z.]+$/.test(new URL(url).hostname)) { window.open(url, '_blank', 'noopener'); toast('Google opens in a new tab'); setLoading(false); return false; } } catch { /* not an address */ } }
    // ROUND 16: when words were typed (not an address) keep the full engine list so a CAPTCHA page can fall back to the next one.
    const engines = searchQuery(input) ? searchCandidates(input).info : null;
    // ROUND 18: with "Google" chosen, typed words are searched by YOUR Google Programmable Search inside MangaFlow (no proxy needed).
    // If Google cannot start (blocked, offline, wrong ID) googleSearch says false and the free engines below take over as before.
    if (engines && eng0 === 'google' && !gKeyOn()) { const g = await googleSearch(input, push, mySeq); if (g || stale()) return g; }
    // WHY: refuse bad addresses politely. HOW: if empty after checks, show a message when the person typed something, and
    // return false.
    if (!url) { if ((input || '').trim()) toast('Only http:// and https:// addresses can be opened'); setLoading(false); return false; }
    // WHY: show the address and a loading state. HOW: setAddress fills the boxes, setLoading shows the spinner.
    setAddress(url); setLoading(true);
    // WHY: remember if loading worked. HOW: ok starts false and becomes true at the end.
    let ok = false;
    // WHY: show a helpful wait message and details if it takes long. HOW: watch starts a 60 second watcher and returns a
    // function to stop it. IMPROVE: none.
    const stopNav = watch('Opening the page', 60000, () => 'Address: ' + url + '\nProxies: ' + settings.proxies.map(proxyName).join(', '));   // round 11
    // WHY: network work can fail, so wrap it. HOW: try runs the steps; the catch block below handles errors.
    try {
      // WHY: download the page. HOW: fetchDoc tries the proxies and gives back the parsed doc and its base address; await
      // waits for it.
      let doc, base, isSearch = false;
      if (!engines) {
        // ROUND 28c - AN ENGINE ADDRESS THAT CANNOT BE LOADED. WHY: the owner tapped the "Yahoo" chip under a results list, Yahoo refused every proxy (Worker: HTTP 502, public proxies: timeout)
        //   and the only answer was a red error pop-up - no way to pick another engine. A typed search already ends on a friendly page (reasons + the other engines as buttons); an engine
        //   address opened by a chip, a link or the back button now does the same. HOW: only for a real search address (an engine host AND words to search, not "#mf-raw") and only when at
        //   least one proxy exists (with none the old Settings guidance stays). The page shows the reason in "Details" and the chips of every engine. IMPROVE: also try the next engine by
        //   itself when the person did not choose this one on purpose.
        try {
          ({ doc, base } = await fetchDoc(url, opts.post != null ? { post: true, body: opts.post } : undefined));   // round 27: forward POST forms
        } catch (e) {
          if (stale()) return false;
          if (wantRaw || !isSearchHost(url) || !queryOf(url) || !settings.proxies.length) throw e;
          const engName = (Object.values(ENGINES).find(x => hostOf(x.url('x')) === hostOf(url)) || { name: hostOf(url) }).name;
          doc = resultsPage(queryOf(url), engName, '', [], [engName + ': ' + clipText(String(e.message || 'failed').replace(/^.*?(no proxy could load it)\b.*$/is, '$1').replace(/^[^:]*: /, ''), 80)]);
          base = location.href; isSearch = true;
          toast(engName + ' did not answer from here - pick another engine below.');
        }
        if (stale()) return false;                    // round 18: a newer search / page was started meanwhile
        // ROUND 17: an engine address opened by a link, the back button or a chip: show the clean results list (unless "#mf-raw" asked for the original).
        if (!isSearch && !wantRaw && isSearchHost(url)) {
          const items = parseResults(doc, url, base);
          if (items.length >= 3 || (items.length && !searchProblem(doc))) { doc = resultsPage(queryOf(url), (Object.values(ENGINES).find(e => hostOf(e.url('x')) === hostOf(url)) || { name: hostOf(url) }).name, url, items); isSearch = true; }
        }
      // WHY: the typed words case (a search). HOW: the loop below tries engine after engine. IMPROVE: none needed.
      } else {
        // ROUND 16: try each search engine in turn. We never solve or bypass a CAPTCHA: a page that asks for one (or has no
        // results) is simply skipped and the next free engine is tried.
        // ROUND 17: a good page is shown as MangaFlow's own clean results list. If EVERY engine fails the person still gets a page
        // (with the reasons, the other engines as buttons and Google) instead of a red error pop-up.
        const log = [], q = searchQuery(input);
        let lastErr = null;
        // ROUND 22 - GOOGLE THROUGH ITS SEARCH API (needs the owner's free API key in Settings > Search & extras). WHY: Google's drawn search element sometimes shows its own pop-up
        //   with "no match found". The API returns plain data, so the results are drawn by MangaFlow as its own clean list in its own search bar, like every other engine, with no
        //   Google pop-up. HOW: googleApi(words) -> items -> resultsPage. If it fails (quota, key, no sites in the engine) the reason goes into the log and the free engines answer.
        if (eng0 === 'google' && gKeyOn()) {
          setAddress(searchQuery(input) || input);
          try {
            const items = await googleApi(searchQuery(input) || input);
            if (stale()) return false;
            if (items.length) { doc = resultsPage(q, 'Google', '', items); base = location.href; url = 'mf-google:' + (input || '').trim(); isSearch = true; }
            else { lastErr = new Error('Google gave no results for this search (check the engine\'s sites / "Search the entire web" in the Google control panel)'); log.push('Google: no results'); toast('Google gave no results - trying the free engines…'); }
          } catch (e) { if (stale()) return false; lastErr = e; log.push('Google: ' + clipText(e.message, 80));
            // ROUND 23b: the key is refused (API not enabled / closed for new projects) -> use the Programmable Search box instead (needs no key) before any free engine.
            if (googleApiDead) { toast('Google API not available - using the Google search box'); const g2 = await googleSearch(input, push, mySeq); if (g2 || stale()) return g2; } toast('Google: ' + clipText(e.message, 80) + ' - trying the free engines…'); }
        }
        for (let i = 0; i < engines.length && !doc; i++) {                // (skipped when Google's API already gave the page)
          // WHY: the engine being tried now. HOW: take it from the list by position. IMPROVE: none needed.
          const eng = engines[i];
          // WHY: a network failure must not stop the other engines. HOW: try/catch around one engine. IMPROVE: none needed.
          try {
            // WHY: download the engine's page through the proxies. HOW: fetchDoc gives the parsed page and its base address.
            // IMPROVE: none needed.
            const r = await fetchDoc(eng.url);
            if (stale()) return false;                    // round 18: a newer search was started meanwhile
            // WHY: read the results from it. HOW: parseResults with this engine's rule. IMPROVE: none needed.
            const items = parseResults(r.doc, eng.url, r.base);
            // WHY: decide if the page is usable. HOW: 3 or more results = fine; otherwise a CAPTCHA words check, then 'no results'.
            // IMPROVE: none needed.
            const why = items.length >= 3 ? '' : (searchProblem(r.doc) || (items.length ? '' : 'gave no results'));
            // WHY: success: show our own clean list. HOW: build it with resultsPage, remember address and base, stop the loop.
            // IMPROVE: none needed.
            if (!why) { doc = resultsPage(q, eng.name, eng.url, items, undefined, googleNote); base = r.base; url = eng.url; isSearch = true; break; }
            // WHY: remember why this engine was skipped. HOW: an Error whose text names the engine and the reason. IMPROVE: none
            // needed.
            lastErr = new Error(eng.name + ' ' + why);
          // WHY: the engine could not be reached. HOW: keep the error and go on with the next engine. IMPROVE: none needed.
          } catch (e) { lastErr = e; }
          // ROUND 19: "Only use the engine I chose" (Settings > Search & extras). WHY: the owner picked Brave and then saw another engine's results because the silent
          // fall-back moved on. HOW: with the switch on, a failure of the CHOSEN engine ends the loop and the friendly page shows the reason and the other engines as buttons.
          if (settings.engineStrict && i === 0 && ENGINES[settings.searchEngine]) { log.push(eng.name + ': ' + clipText(String(lastErr && lastErr.message || 'failed'), 60)); break; }
          log.push(eng.name + ': ' + clipText(String(lastErr.message || 'failed').replace(/^.*?(no proxy could load it)\b.*$/is, '$1').replace(/^[^:]*: /, ''), 60));   // short reason per engine (full detail is in the toast / console)
          // WHY: tell the person what is happening. HOW: a short toast naming the next engine and the address bar follows.
          // IMPROVE: none needed.
          if (i < engines.length - 1) { toast(clipText((lastErr.message || eng.name + ' failed').replace(/^.*?: /, ''), 60) + ' - trying ' + engines[i + 1].name + '…'); setAddress(engines[i + 1].url); }
        }
        // WHY: no engine gave a page. HOW: the next lines decide between an error (no proxy at all) and the friendly page.
        // IMPROVE: none needed.
        if (!doc) {
          // nothing worked: with no proxy at all keep the old guidance (error + Settings), otherwise show the friendly page
          if (!settings.proxies.length) throw lastErr || new Error('search failed');
          url = engines[0].url; base = url; doc = resultsPage(q, engines[0].name, '', [], log, googleNote); isSearch = true;
          toast('No search engine answered. Try another engine below.');
        }
        // WHY: show the address that was really used. HOW: setAddress fills the address boxes. IMPROVE: none needed.
        setAddress(url);
      }
      // WHY: store the state of the current page in one object. HOW: cur holds url, base, doc, and empty slots for chapters
      // and token.
      if (stale()) return false;                      // round 18: do not replace a newer page with this old answer
      cur = { url, base, doc, chapters: null, listHtml: '', token: '', isSearch };
      // ROUND 50: a page with several empty picture slots (script-built chapter) borrows the reader's picture finder, but only for that case and never longer than 6 seconds.
      let extra = null;
      try {
        const allImgs = Array.from(doc.querySelectorAll('img'));
        const empties = allImgs.filter(i => (!imgAddress(i, base) || PLACEHOLDER_SRC.test(i.getAttribute('src') || '')) && (isHolder(i) || PLACEHOLDER_SRC.test(i.getAttribute('src') || ''))).length;
        const realCount = allImgs.filter(i => { const u = imgAddress(i, base); return u && !PLACEHOLDER_SRC.test(u) && !BAD_IMG.test(u); }).length;
        // ROUND 59: also when the page shows FEWER pictures than its own scripts list (a reader that only writes the first few into the page)
        let scriptMore = false;
        if (!isSearch && empties < 2) { const js0 = fromScripts(doc, base); scriptMore = js0.length >= 3 && js0.length >= realCount + 3; }
        if ((empties >= 2 || scriptMore) && !isSearch) {
          // 1) the quick way: a list of picture addresses written inside the page's own scripts (the page's scripts are only READ as text, never run)
          const js = fromScripts(doc, base);
          if (js.length >= 3) extra = js;
          // 2) otherwise the full chapter finder (it can also use the page text and numbered neighbours), limited to 6 seconds
          else { const f = await Promise.race([chapterPictures(doc, base, url), new Promise(r => setTimeout(() => r(null), 6000))]); if (f && f.list && f.list.length >= 3) extra = f.list; }
        }
      } catch { /* show the page without them */ }
      if (stale()) return false;
      // WHY: show the page. HOW: renderFrame cleans it and puts it in the iframe.
      renderFrame(doc, base, extra);
      // WHY: swap the start screen for the page. HOW: hide the start screen and show the frame.
      $('#start').hidden = true; frame.hidden = false;
      // ROUND 18: the Google panel is not needed any more, and the address bar remembers THIS page so a refresh returns here (not to the start page).
      // ROUND 39: this navigate() call's OWN `push` argument decides whether this is a real new Back/Forward step
      // (a person opening a page / following a link) or a passive re-render (goHist stepping through our OWN
      // history, or resumeFromHash restoring a saved page) — those must never push a SECOND entry on top.
      hideGview(); rememberView(isSearch && engines ? 'q' : 'p', isSearch && engines ? String(input).trim() : url, push);
      // WHY: keep back/forward history. HOW: when push is true, cut off forward entries, add the url, move the pointer hi to
      // the end.
      if (push) { hist = hist.slice(0, hi + 1); hist.push(url); hi = hist.length - 1; }
      // WHY: save in the recent list and redraw the start screen. HOW: addRecent stores url and title.
      if (!isSearch) addRecent(url, doc.title);   // round 17: search lists are not saved as visited manga
      renderStart();
      // WHY: keep a fixed reference to this page, since cur may change later. HOW: const page = cur.
      const page = cur;
      // WHY: fetch hidden chapter lists without freezing the screen. HOW: store the running promise in page.enhancing so
      // others can wait for it.
      page.enhancing = isSearch ? Promise.resolve() : enhanceSeriesPage(page).finally(() => { page.enhancingDone = true; });        // runs in the background, adds the chapter list when ready (round 17: not for our own results list)
      // WHY: mark success. HOW: ok = true.
      ok = true;
      // WHY: if the person typed this link, maybe jump into reading mode. HOW: tryAutoRead runs in the background (no await).
      if (opts.user) tryAutoRead(page);                // not awaited: the page is already on screen
    // WHY: handle load errors. HOW: the catch gets the error e.
    } catch (e) {
      // WHY: tell the person what went wrong. HOW: showError shows the message plus details like address and proxies. IMPROVE:
      // add a real Retry button.
      if (stale()) return false;                      // round 18: an old, replaced request must not open an error pop-up
      // ROUND 29e: a check for humans gets the VERIFY box (with the way to pass it and the automatic retry), everything else the red pop-up as before.
      if (isHumanCheck(e.message)) humanCheckBox(url, () => navigate(input, push, opts));
      else showError('Could not load the page: ' + e.message, { details: 'Address: ' + url + '\nProxies: ' + settings.proxies.map(proxyName).join(', ') + '\nPress Retry by opening the link again, or see MANGAFLOW.md section 11.' });
      // WHY: with no proxy at all, failure is certain, so open Settings once per visit to point the user at the fix.
      // WHY: with no proxy the load will always fail, so guide the user to Settings. HOW: open Settings after 0.9 seconds,
      // only once (navigate.hinted flag).
      if (!settings.proxies.length && !navigate.hinted) { navigate.hinted = true; setTimeout(() => $('#btnSettings').click(), 900); }
    }
    // WHY: always clean up. HOW: finally runs on success or failure: stop the watcher, hide loading, refresh buttons.
    finally { stopNav(); if (!stale()) setLoading(false); updateNav(); }   // round 18: only the newest call may switch the loading bar off
    // WHY: tell the caller if it worked. HOW: return the ok flag.
    return ok;
  }

  // WHY: decide if a freshly opened page is a manga and start reading mode automatically. HOW: needs the setting on and a
  // page. IMPROVE: let the person choose a delay.
  async function tryAutoRead(page) {
    if (!settings.autoRead || !page) return;
    try {
      // WHY: need the hostname and path to judge the page. HOW: parse the address with URL.
      const u = new URL(page.url);
      // WHY: search result pages are not manga. HOW: skip DuckDuckGo hostnames.
      if (isSearchHost(page.url)) return;                                 // search results are not a manga (round 16: every search engine, not only DuckDuckGo)
      // WHY: a front page lists many manga. HOW: if the path is empty after removing slashes, skip.
      if (u.pathname.replace(/\/+$/, '') === '') return;                  // the site's front page lists many manga
      // WHY: tell the person we are working. HOW: setBusy shows a message.
      setBusy('Looking for chapters…');
      // WHY: wait for the hidden chapter lists first. HOW: await the stored promise.
      // ROUND 57: wait at most 20 seconds. WHY: on sites with a long split chapter list (arenascan) the banner "Looking for chapters…" stayed for minutes and looked like loading that never ends.
      //   HOW: race the background reader against a 20 s timer; the reader itself keeps working and reading mode waits for it only when it needs the list. IMPROVE: show the page number it is on.
      await Promise.race([page.enhancing, new Promise(r => setTimeout(r, 20000))]);
      // WHY: the person may have left. HOW: if cur is no longer this page, stop.
      if (cur !== page) return;                                           // the person went somewhere else
      // WHY: is this a chapter page? HOW: ok is true if 3 or more pictures are found, or the address has a chapter number and
      // a numbered preview picture exists. IMPROVE: make the 3 a setting.
      // ROUND 28: looksLikeChapter() holds the three rules in one place: 3 or more pictures, OR empty picture slots the site fills in later, OR (round 10) a chapter number plus a
      // numbered preview picture.
      let ok = looksLikeChapter(page.doc, page.base, page.url);
      // WHY: if not a chapter page, maybe a series page. HOW: use the known chapters or detect them from the page.
      if (!ok) {
        // WHY: get a chapter list. HOW: take page.chapters or detect, then keep only this series with pickSeries.
        const list = page.chapters || pickSeries(detectChapters(page.doc, page.base), page.url, false);
        // WHY: decide if it is a real series page. HOW: need 2 or more chapters that belong to this address.
        ok = list.length >= 2 && belongsToPage(list, page.url);           // a manga page with its own chapter list
      }
      // WHY: clear the busy message. HOW: empty text.
      setBusy('');
      // WHY: start reading. HOW: only if ok and still on this page; quiet means no error pop-up.
      // ROUND 59: if the person already tapped something on the page, the quiet detection must not pull them into reading mode (it used to "take over" the site).
      if (ok && cur === page && !page.touched) await startReading({ quiet: true });
    // WHY: any failure just leaves the page open. HOW: empty catch on purpose.
    } catch { /* staying on the page is always fine */ }
    // WHY: always remove the busy text. HOW: finally runs every time.
    finally { setBusy(''); }
  }

  /* Click on a chapter link of a manga page -> read from that chapter at once (no extra step).
     WHY: a click used to open only the chapter's website page inside the mini browser.
     HOW: readFrom() opens the chapter page, then starts reading mode from it. */
  // WHY: open a chapter and start reading at once. HOW: navigate first, and if it worked and the url matches, start
  // reading mode. IMPROVE: show a loading message between the two steps.
  async function readFrom(url) {
    // WHY: load the chapter page. HOW: push into history and mark it as not typed by the person.
    const ok = await navigate(url, true, { user: false });
    // WHY: begin reading only if the right page loaded. HOW: sameUrl compares addresses.
    if (ok && cur && sameUrl(cur.url, url)) startReading({ quiet: false });
  }
  // WHY: decide if a clicked link is a chapter of the current manga. HOW: returns true or false using several checks.
  // IMPROVE: add comments for each check.
  function isChapterLinkOfCurrent(u) {
    // WHY: do nothing when the feature is off. HOW: false if no page or autoRead is off.
    if (!cur || !settings.autoRead) return false;
    // WHY: a known chapter is the quickest yes. HOW: check the list with some().
    if (cur.chapters && cur.chapters.some(c => sameUrl(c.url, u))) return true;
    // WHY: on a chapter page, links should work normally. HOW: if 3 or more pictures exist, return false.
    if (looksLikeChapter(cur.doc, cur.base, cur.url)) return false;       // already a chapter page: normal navigation
    // WHY: last guess from the address. HOW: the link must have a chapter number and belong to this page; try/catch returns
    // false on bad input.
    try {
      return numFrom(decodeURIComponent(new URL(u).pathname)) != null && belongsToPage([{ url: u }], cur.url);
    } catch { return false; }
  }

  // WHY: back and forward buttons. HOW: d is -1 or 1; compute the new index, stop if outside, then reopen without adding
  // history.
  function goHist(d) { const n = hi + d; if (n < 0 || n >= hist.length) return; hi = n; navigate(hist[hi], false); }
  // WHY: go back to the start screen. HOW: hide the frame, show start, forget the current page, clear the address and
  // refresh.
  // ROUND 39: push:true — pressing Home is a deliberate navigation step too, same as opening a page, so Back can
  // return to whatever chapter/page you were on before you pressed it.
  function goHome() { navSeq++; setLoading(false); frame.hidden = true; hideGview(); $('#start').hidden = false; cur = null; lastView = null; rememberView(null, null, true); setAddress(''); renderStart(); updateNav(); }   // round 18: also closes the Google panel and forgets the address-bar memory
  // WHY: keep toolbar buttons correct. HOW: set each button state from history position and the current page.
  function updateNav() {
    // ROUND 41: whenever we navigate anywhere (open a site, go home, start reading...), make sure the header is
    // visible again. WHY: the scroll-based hide further down (navHideInit) only reacts to #viewport's OWN scroll
    // events, which stop firing the moment you leave the start/search page (the iframe or the reader takes over
    // instead) — without this, if the header happened to be hidden right when you tapped a search result, it
    // could still look hidden on the page you land on, with no more scroll events left on #viewport to reveal
    // it again. updateNav() already runs after every navigation, so this is a cheap, reliable place for the reset.
    const navEl = document.querySelector('.navbar'); if (navEl) navEl.classList.remove('mf-hide'); document.body.classList.remove('p2-hide');   // ROUND 44: also un-hide Page 2's floating buttons
    // WHY: nothing to go back to at the first page. HOW: disabled is true when hi is 0 or less.
    $('#btnBack').disabled = hi <= 0;
    // WHY: nothing ahead at the last page. HOW: compare hi to the last index.
    $('#btnFwd').disabled = ((history.state && history.state.mfi) || 0) >= navMax;   // ROUND 53: native-history aware
    // WHY: the floating read button only makes sense with an open page. HOW: hide it when cur is empty.
    $('#fabRead').hidden = !cur || !!cur.isSearch;   // round 17: a results list has nothing to read, so no Reading-mode button
    // WHY: show if this page is bookmarked. HOW: a filled star if any bookmark has the same url, else an empty star.
    $('#btnStar').textContent = cur && books.some(b => b.url === cur.url) ? '★' : '☆';
    updateP2Bar();                                  // ROUND 56: the small chapter bar follows the page on screen
    // ROUND 39: the "Open on <site>" button (below the header) only makes sense while an actual external manga
    // site's page is on screen — not on the start page, and not on a search-results list (there is no single
    // "original page" for a list of results to open). HOW: same condition already used for #fabRead above, so the
    // two buttons always agree on whether a real external page is open.
    const origBtn = $('#btnOrigSite');
    if (origBtn) { origBtn.hidden = !cur || !!cur.isSearch; if (!origBtn.hidden) origBtn.title = 'Open this page on ' + hostOf(cur.url); }
  }

  /* ---------------------------------------------------------------
     8. CHAPTER + IMAGE DETECTION (the "guessing" part)
     WHY: every manga site has different HTML. We use common-sense rules:
          - chapter links contain "chapter 12", "ch.12", "episode 3"... in the text or the URL
          - chapter images are the biggest group of <img> sharing one container
     IMPROVE: this is the part most likely to need tweaks per site. Add a table of site-specific
              rules (CSS selectors per hostname), plus support for "c012" style URLs, and for sites
              that hide image URLs inside JSON/JavaScript (needs a headless-browser proxy). */
  // WHY: one pattern to find chapter numbers like 'chapter 12' or 'ch.12.5'. HOW: a regular expression (a text pattern)
  // with word checks around it; group 1 is the number. IMPROVE: add other words like 'vol' or other languages.
  const CH_RE = /(?<![a-z])(?:chapter|chap|ch|episode|ep)(?![a-z])[\s._\-#:/]*(\d+(?:[._-]\d+)?)/i;
  // WHY: get a chapter number from text or an address. HOW: run the pattern; if it matches, turn the number into a float,
  // changing - or _ into a dot.
  // ROUND 39 FIX — "some mangas in other sites were not detectable, named in different points/numbers".
  // WHY (root cause): some site themes build their chapter address as "chapter-1.199375" — the real chapter
  //   number (1) followed by a DOT and the site's own internal database ID (199375), which has nothing to do
  //   with the chapter number at all (rawkuma.net does exactly this). The old code treated ANY "number.number"
  //   it found as ONE fractional chapter number, so "chapter-1.199375" was read as chapter "1.199375" — a
  //   meaningless value that threw off anything comparing or sorting chapters by number.
  // HOW (the fix): a genuine fractional/half chapter (an extra chapter numbered "12.5", "7.1") almost always has
  //   a SHORT fractional part — one or two digits. A site's internal ID glued on after a dot is typically much
  //   longer (3 or more digits, often 5-6, since it is a database row number). So: keep the fractional part only
  //   when it has 1-2 digits; a longer one is dropped and only the whole-number part in front of the dot is used
  //   as the chapter number. This never changes a normal "chapter 12.5" site, and fixes sites that glue on an ID.
  function cleanChapterNum(whole, frac) {
    if (!frac) return parseFloat(whole);
    return frac.length <= 2 ? parseFloat(whole + '.' + frac) : parseFloat(whole);
  }
  function numFrom(s) {
    const m = CH_RE.exec(s || '');
    if (m) { const p = m[1].split(/[._-]/); return cleanChapterNum(p[0], p[1] || ''); }
    // WHY: some addresses end with /c012. HOW: a second pattern checks the end of the text.
    const c = /\/c(\d{1,4})(?:[._](\d+))?\/?$/i.exec(s || '');          // round 8: addresses ending in /c012
    // WHY: return the number or null. HOW: the same short-fraction-vs-ID rule as above; null means not found.
    return c ? cleanChapterNum(c[1], c[2] || '') : null;
  }
  // ROUND 28: a link whose "address" is only plain words. WHY: the Init Manga theme (mgread.io) puts a read-aloud bar on every chapter with links such as <a href="Previous sentence">.
  // Turned into an address that became ".../chapter-1/Previous%20sentence" and looked like a chapter, so the report showed it as the previous / next chapter. HOW: two or more plain
  // words with spaces and nothing else. A real address has a slash, a dot, a colon or no space. IMPROVE: none needed.
  const isWordHref = raw => /^[A-Za-z]+(?: [A-Za-z]+)+$/.test(String(raw || '').trim());
  // WHY: turn a number into text for display. HOW: String(n) in both cases. IMPROVE: both branches are the same, so it can
  // be simplified to String(n).
  const fmtNum = n => (Number.isInteger(n) ? String(n) : String(n));
  // "Chapter 5", "Chapter: 1-eng-li" ... = nothing more than the number, so no extra title line is needed.
  // WHY: detect titles that are only 'Chapter 5', so no extra title is shown. HOW: a long pattern tests the whole text;
  // returns true or false. IMPROVE: add comments inside the pattern.
  const isPlainTitle = t => /^(?:chapter|chap|ch|episode|ep)(?![a-z])[\s:._#-]*\d+(?:[.-]\d+)?(?:[-_][a-z]{1,4}){0,3}$/i.test((t || '').trim());

  /* Which series does a chapter URL belong to?
     WHY: pages also contain chapter links of OTHER manga (sidebars, "new manga", "you may also like").
          Mixing them in produced a wrong, short chapter list. The key is the part of the address before
          the chapter number: /manhua/nightwatcher/chapter-5/ -> "/manhua/nightwatcher";
          /reader/en/some-title-chapter-5-eng/ -> "/reader/en/some-title".
     IMPROVE: per-site rules (roadmap 1) would be even more exact. */
  // WHY: find which manga a chapter address belongs to. HOW: take the path, split into folder and last part, and check the
  // last part for a chapter word. Returns text or null.
  function seriesKey(u) {
    // WHY: read the path part of the address. HOW: decode it; try/catch returns null on a bad address.
    let p; try { p = decodeURIComponent(new URL(u).pathname); } catch { return null; }
    // WHY: ignore a trailing slash. HOW: remove slashes from the end.
    p = p.replace(/\/+$/, '');
    // WHY: split the path. HOW: i is the last slash; dir is everything before the last part, last is the final part.
    const i = p.lastIndexOf('/'), dir = p.slice(0, i + 1), last = p.slice(i + 1);
    // WHY: case /manga/name/chapter-5. HOW: if the last part starts with a chapter word, the key is the folder.
    if (/^(?:chapter|chap|ch|episode|ep)(?![a-z])[\s._\-#:]*\d/i.test(last)) return dir.replace(/\/$/, '') || '/';
    // WHY: case /some-title-chapter-5. HOW: look for a chapter word inside the last part after a separator.
    const m = /[-_.](?:chapter|chap|ch|episode|ep)(?![a-z])[-_.\s#:]*\d/i.exec(last);
    // WHY: build the key. HOW: folder plus the part before the match.
    if (m) return dir + last.slice(0, m.index);
    // WHY: no pattern fits. HOW: return null.
    return null;
  }
  /* Keep only the chapters of the manga being read. `url` = the chapter page (asChapter) or the series page. */
  // WHY: keep only chapters of the manga being read. HOW: group links by seriesKey, then choose the right group. IMPROVE:
  // add a short comment for each branch.
  function pickSeries(list, url, asChapter) {
    // WHY: collect links by series. HOW: a Map is a list of key/value pairs; here key is the series key, value is an array
    // of chapters.
    const groups = new Map();
    // WHY: fill the groups. HOW: for each chapter, find its key (or empty), make the group if missing, then add the chapter.
    list.forEach(c => { const k = seriesKey(c.url) || ''; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(c); });
    // WHY: only one group means nothing to choose. HOW: check it is not another manga if we are on a chapter page, then
    // return the list.
    if (groups.size <= 1) {
      // Only ONE group of links. If we are reading a chapter and that group belongs to another manga
      // (for example a "latest updates" sidebar), it is not our list.
      // WHY: on a chapter page, check the group is ours. HOW: compare this page's key with the group's key; if different
      // return an empty list.
      if (asChapter) {
        // WHY: get both keys. HOW: k is our key; g is the first key of the map (or empty).
        const k = seriesKey(url), g = groups.size ? groups.keys().next().value : '';
        // WHY: a different manga means wrong list. HOW: return an empty list.
        if (k != null && g !== '' && g !== k) return [];
      }
      // WHY: nothing to filter. HOW: return the list unchanged.
      return list;
    }
    // WHY: holds the chosen group. HOW: starts as null.
    let pick = null;
    // WHY: chapter page mode. HOW: use the group with our own key if it exists.
    if (asChapter) {
      // WHY: pick our own group. HOW: look up k in groups.
      const k = seriesKey(url); if (k != null && groups.has(k)) pick = groups.get(k);
    // WHY: series page mode. HOW: choose by the slug (last part of the address).
    } else {
      // WHY: get the slug in lower case. HOW: decode the path, drop the trailing slash, take the last part; try/catch leaves
      // it empty.
      let slug = ''; try { slug = decodeURIComponent(new URL(url).pathname).replace(/\/+$/, '').split('/').pop().toLowerCase(); } catch { /* none */ }
      // WHY: choose the group whose key contains the slug. HOW: loop over groups, prefer the bigger group on ties.
      groups.forEach((g, k) => { if (slug && k.toLowerCase().includes(slug) && (!pick || g.length > pick.length)) pick = g; });
    }
    // WHY: nothing matched. HOW: fall back to the biggest group.
    if (!pick) {                                                         // fall back to the biggest group
      // WHY: find the largest group. HOW: loop and keep the longest array.
      let best = []; groups.forEach(g => { if (g.length > best.length) best = g; });
      // WHY: avoid tiny lists on series pages. HOW: accept it for chapter pages, or if it has 3 or more links.
      // ROUND 37: on a chapter page, if the url's seriesKey is null (meaning its URL has no chapter-number pattern),
      //   we still check the fallback group: if its key does NOT start with any sub-path of the current URL,
      //   it is almost certainly a "recommended manga" sidebar (different manga entirely).
      //   HOW: compare the best group's key against the current URL's path prefix. If they share no sub-path, return empty
      //   so analyze() moves on to loadSeriesList() which fetches the REAL list from the series page.
      //   IMPROVE: remember per hostname which path prefixes are sidebar links so the check can skip them faster.
      if (asChapter && best.length > 0) {
        let curPath = ''; try { curPath = new URL(url).pathname.replace(/\/+$/, ''); } catch { /* leave empty */ }
        const bestKey = best[0] ? (seriesKey(best[0].url) || '') : '';
        // WHY: check that the best group's series key is a sub-path of the current page's path.
        //   If the current chapter is at /manga/baby-raising-devil/chapter-44/ (seriesKey = /manga/baby-raising-devil)
        //   but the "best" group has key /manga/the-10th-class-lout/ — they share no path prefix: reject it.
        //   Only accept when the key appears in the current URL path, OR the current path appears in the key.
        const keysRelated = bestKey && curPath && (curPath.startsWith(bestKey) || bestKey.startsWith(curPath.replace(/\/[^/]+$/, '')));
        if (!keysRelated) { /* best group is from a different manga — don't use it */ }
        else pick = best;
      } else if (asChapter || best.length >= 3) pick = best;
    }
    // WHY: always return a list. HOW: the pick or an empty array.
    return pick || [];
  }

  /* Does this chapter list really belong to THIS series page?
     WHY: a series page often shows chapter links of OTHER manga (sidebar "latest updates") but none of its own,
          because its own list is filled in by JavaScript. Without this check those foreign links were taken as
          "the list", the real list was never fetched, and "Read first chapter" opened a different manga.
     HOW: the last part of the series address (the "slug", e.g. "a-bad-example-of-a-perfect-curse") must appear
          in at least one chapter address. Sites that use numbers instead of names fail this test; for them we
          simply ask the site for its list and fall back to nothing. */
  // WHY: check the chapter list is really for this series page. HOW: see the slug check below. IMPROVE: sites with
  // number-only addresses fail this test, add another check for them.
  function belongsToPage(list, url) {
    // WHY: a list taken from a chapter box is trusted. HOW: if any item has the box flag, return true.
    if (list.some(c => c.box)) return true;                              // round 8: list found inside a chapter-list box
    // WHY: the slug is the last part of the page address. HOW: starts empty and is filled next.
    let slug = '';
    // WHY: read the slug in lower case. HOW: take the path's last part; if the address is bad return true (do not block).
    try { slug = new URL(url).pathname.replace(/\/+$/, '').split('/').pop().toLowerCase(); } catch { return true; }
    // WHY: no slug means we cannot check. HOW: return true.
    if (!slug) return true;
    // WHY: the real test. HOW: true if any chapter address contains the slug.
    return list.some(c => c.url.toLowerCase().includes(slug));
  }

  // WHY: find chapter links on a page. HOW: collects links and select options with chapter numbers, sorted. IMPROVE: add
  // per-site rules.
  function detectChapters(doc, base) {
    // WHY: only same-site links count. HOW: origin is the site part of the address.
    const origin = new URL(base).origin;
    // WHY: avoid duplicates. HOW: a Map keyed by address.
    const found = new Map();
    // WHY: helper that checks one link and stores it. HOW: add(href, text) runs the checks below.
    const add = (href, text) => {
      // WHY: skip links that are not pages. HOW: skip empty, # and javascript/mailto/tel links.
      if (!href || href.startsWith('#') || /^(javascript|mailto|tel):/i.test(href) || isWordHref(href)) return;
      // WHY: make a full address. HOW: absUrl joins with the base; skip if it fails.
      const u = absUrl(href, base); if (!u) return;
      // WHY: parse for checks. HOW: new URL; try/catch skips bad ones.
      let p; try { p = new URL(u); } catch { return; }
      // WHY: ignore other websites. HOW: compare origins.
      if (p.origin !== origin) return;
      // WHY: clean the link text. HOW: collapse spaces and trim.
      text = (text || '').replace(/\s+/g, ' ').trim();
      // WHY: find the chapter number, first in the address, then in the text. HOW: numFrom returns null if none.
      let num = numFrom(safeDecode(p.pathname));   // round 43: a stray % in a link no longer throws
      if (num == null) num = numFrom(text);
      // WHY: no number means not a chapter. HOW: skip.
      if (num == null) return;
      // WHY: a key without the # part so duplicates match. HOW: split at # and keep the first part.
      const key = u.split('#')[0];
      // WHY: see if already stored. HOW: get from the Map.
      const old = found.get(key);
      // WHY: save new chapter. HOW: store url, a title of up to 120 letters, and the number.
      if (!old) found.set(key, { url: key, title: text.slice(0, 120), num });
      // WHY: improve a stored title that has no digits. HOW: replace it by the new text if that has digits.
      else if (!/\d/.test(old.title) && /\d/.test(text)) old.title = text.slice(0, 120);
    };
    // a.dataset.mfHref = the real address of a link that neutralizeLinks() already changed to "#mf"
    // WHY: scan all links. HOW: use the saved real address if present, else the href; the text is the link text.
    doc.querySelectorAll('a[href]').forEach(a => add(a.dataset.mfHref || a.getAttribute('href'), a.textContent));
    // WHY: also read dropdown lists of chapters. HOW: each option value is treated like a link.
    doc.querySelectorAll('select option[value]').forEach(o => add(o.getAttribute('value'), o.textContent));
    // WHY: sorted chapter list. HOW: turn the Map values into an array and sort by number, small first.
    const list = Array.from(found.values()).sort((a, b) => a.num - b.num);   // chapter 1 first
    // WHY: few results means numbers may be missing. HOW: try detectChaptersLoose and use it if it finds 3 or more.
    if (list.length < 2) { const loose = detectChaptersLoose(doc, base); if (loose.length >= 3) return loose; }   // round 8
    // WHY: give back the list. HOW: return list.
    return list;
  }

  // WHY: find a manga title. HOW: try the h1, the og:title meta tag and the page title. IMPROVE: add more sources.
  function detectTitle(doc, base) {
    // WHY: clean one candidate title. HOW: clean collapses spaces, trims, and removes the chapter part at the end, then
    // keeps text before a separator like |.
    const clean = t => (t || '').replace(/\s+/g, ' ').trim()
      .replace(/\s*[-–—|:]?\s*(?:chapter|chap|ch|episode|ep)(?![a-z])[\s._\-#:]*\d.*$/i, '')
      .split(/\s[|–—-]\s/)[0].trim();
    // WHY: list of possible titles. HOW: each one is cleaned; empty ones are skipped later.
    const cands = [
      clean($('h1', doc) && $('h1', doc).textContent),
      clean($('meta[property="og:title"]', doc) && $('meta[property="og:title"]', doc).content),
      // WHY: the page title, cleaned of site name noise. HOW: clean() trims and shortens it.
      clean(doc.title)
    ];
    // WHY: pick the first non-empty title. HOW: find(Boolean) skips empty ones; fall back to the site name.
    return cands.find(Boolean) || new URL(base).hostname;
  }

  /* PICTURE DETECTION (round 8: much wider)
     WHY: the first version only looked at <img src>. Many scanlation sites (for example the "MangaStream" and
          "Next.js" kinds) put the chapter pictures in a JavaScript list inside the page, or in srcset, or in a
          lazy-load attribute we did not know. The reader then showed EMPTY pages for them.
     HOW: three steps, the first that finds 3 or more pictures wins.
          1. <img> tags: src, lazy-load attributes (data-src ...), and the best entry of srcset / <picture>.
             The biggest group of pictures that share one container is "the reader".
          2. Pictures hidden in <script> text (fromScripts): a list such as  "images":["https://.../01.jpg", ...]
             is read straight from the script text. Nothing from the site is ever RUN, we only read the text.
          3. If there is no such list, every picture address in the scripts is grouped by folder and the biggest
             folder with numbered file names (01.jpg, 02.jpg ...) is taken.
     IMPROVE: per-site rules (a table of CSS selectors / script patterns by hostname) for the hardest sites. */
  // WHY: skip pictures that are not manga pages (logos, ads, icons, small thumbs). HOW: a pattern on the address. IMPROVE:
  // add more words as you meet new sites.
  const BAD_IMG = /logo|banner|avatar|icon|sprite|\bads?[-_/.]|advert|loading|gravatar|emoji|placeholder|button|badge|thumb-?small|[-_]\d{2,3}x\d{2,3}\.(?:jpe?g|png|webp)/i;
  // ROUND 59 (arenascan chapter pages showed only a spinning "loading" picture on Page 2, owner reports 2026-11-10/11): many reader themes put a placeholder drawing (readerarea.svg,
  //   blank.gif, spinner, loader...) in every picture slot and let a script swap in the real page later. Our frame runs no scripts, so the spinner stayed for ever ("keeps loading")
  //   and, because the slot HAD an address, the "empty slot" rule never fired. HOW: this test recognises such placeholder addresses so they count as EMPTY. IMPROVE: add more names.
  const PLACEHOLDER_SRC = /readerarea|(?:^|[\/_.-])(?:blank|spacer|pixel|transparent|dummy|lazy(?:load)?|placeholder|loader|loading|spinner|preload)[\w.-]*\.(?:svg|gif|png|webp|jpe?g)(?:[?#]|$)|\b1x1\b/i;
  // WHY: tell if an address is a picture. HOW: pattern for common picture endings.
  const IMG_EXT = /\.(?:jpe?g|png|webp|avif|gif)(?:[?#]|$)/i;
  // WHY: srcset lists pictures by size. HOW: split by comma, take each address, return the last (biggest).
  // srcset = "a.jpg 400w, b.jpg 800w"  ->  the last (biggest) address.
  // WHY: srcsetBest function. HOW: parts are the addresses; return the last one or empty text.
  const srcsetBest = s => {
    const parts = (s || '').split(',').map(x => x.trim().split(/\s+/)[0]).filter(Boolean);
    return parts.length ? parts[parts.length - 1] : '';
  };

  // WHY: find pictures hidden in script text. HOW: only reads text, never runs it. Returns an array of addresses. IMPROVE:
  // add a size limit for very big pages.
  function fromScripts(doc, base) {
    // WHY: collect useful script texts. HOW: an empty array.
    const texts = [];
    // WHY: check every script. HOW: keep text of a sensible size that mentions a picture ending.
    doc.querySelectorAll('script').forEach(s => {
      const t = s.textContent || '';
      if (t.length > 40 && t.length < 4000000 && /\.(?:jpe?g|png|webp|avif|gif)/i.test(t)) texts.push(t);
    });
    // WHY: no useful scripts. HOW: return an empty list.
    if (!texts.length) return [];
    // JSON inside scripts writes "/" as "\/" or "\u002F": turn that back into a normal address.
    // WHY: JSON writes / in escaped forms. HOW: replace the escapes with normal characters.
    const unesc = t => t.replace(/\\u002F/gi, '/').replace(/\\u0026/gi, '&').replace(/\\\//g, '/');
    // WHY: check one address. HOW: make it full, then accept only if it is a picture and not a bad one, else null.
    const okUrl = u => { const a = absUrl(u, base); return a && IMG_EXT.test(a) && !BAD_IMG.test(a) ? a : null; };
    // 1) a list made only of text items, most of them picture addresses
    // WHY: step 1, look for a list of quoted text items. HOW: best holds the biggest good list.
    let best = [];
    // WHY: check each script. HOW: unescape it, then use a pattern to find lists like [a,b,c] of quoted text.
    for (const raw of texts) {
      const t = unesc(raw);
      // WHY: pattern for a list of text items. HOW: a global regular expression, so exec can go on finding the next match.
      const re = /\[\s*(?:"[^"\\]*"|'[^'\\]*')(?:\s*,\s*(?:"[^"\\]*"|'[^'\\]*'))+\s*,?\s*\]/g;
      let m;
      // WHY: walk every found list. HOW: while exec returns a match.
      while ((m = re.exec(t))) {
        // WHY: get the items. HOW: match all quoted pieces and cut off the quotes.
        const items = m[0].match(/"[^"\\]*"|'[^'\\]*'/g).map(x => x.slice(1, -1));
        // WHY: keep real pictures. HOW: map okUrl then drop nulls.
        const good = items.map(okUrl).filter(Boolean);
        // WHY: accept only good lists. HOW: at least 3 pictures, at least 80 percent of the items, and the biggest so far.
        if (good.length >= 3 && good.length >= items.length * 0.8 && good.length > best.length) best = good;
      }
    }
    // WHY: step 1 worked. HOW: remove duplicates with a Set and return.
    if (best.length >= 3) return Array.from(new Set(best));
    // 2) every picture address in the scripts; keep the biggest folder with numbered file names
    // WHY: step 2, every picture address in scripts. HOW: all collects them.
    const all = [];
    // WHY: scan each script again. HOW: unescape and apply an address pattern.
    for (const raw of texts) {
      const t = unesc(raw);
      // WHY: pattern for picture addresses in text. HOW: starts with http or //, ends with a picture ending and optional
      // query.
      const re = /(?:https?:)?\/\/[^"'\s<>\\)]+?\.(?:jpe?g|png|webp|avif|gif)(?:\?[^"'\s<>\\)]*)?/gi;
      let m;
      // WHY: collect good ones. HOW: okUrl check then push.
      while ((m = re.exec(t))) { const a = okUrl(m[0]); if (a) all.push(a); }
    }
    // WHY: group by folder. HOW: a Map; the key is the address without the file name.
    const groups = new Map();
    // WHY: each unique picture goes in its group. HOW: replace the file name with nothing to get the folder.
    Array.from(new Set(all)).forEach(u => {
      const k = u.replace(/[^/]*$/, '');
      if (!groups.has(k)) groups.set(k, []);
      // WHY: group addresses by their key (for example the folder). HOW: groups is a Map key -> list; push adds this address.
      groups.get(k).push(u);
    });
    // WHY: choose the best folder. HOW: top holds the winner.
    let top = [];
    // WHY: numbered file names like 01.jpg show chapter pages. HOW: keep files with digits; take the biggest group with 5 or
    // more.
    groups.forEach(g => {
      const numbered = g.filter(u => /\d/.test(u.split('/').pop()));
      if (numbered.length >= 5 && numbered.length > top.length) top = numbered;
    });
    // WHY: return the result. HOW: top, maybe empty.
    return top;
  }

  // HISTORY. ROUND 26: reader-box detection for WordPress "MangaReader"-style themes (.reading-content, .reader ...). ROUND 27 (bug B1): round 26 had its own BAD_IMG with the loose word
  //   "ads?", which also matches "upl-OADS" in /wp-content/uploads/, so the pictures of WordPress sites were thrown away, and a picture inside two nested reader boxes was added twice.
  //   Both fixes now live in readerSlots() below (the shared BAD_IMG, and a Set that counts every picture once).
  /* ROUND 28 - PICTURES THAT HAVE NO ADDRESS YET ("empty page slots"): mgread.io and every site built with the "Init Manga" theme
     WHY: the owner opened https://mgread.io/manga/childhood-friend-of-the-zenith/chapter-1/ and saw ONLY page 1 of the chapter. The page lists 7 or more <img> tags for the chapter,
          but only the FIRST one has a real address. The others are empty grey boxes (a tiny drawing "data:image/svg+xml", 800 wide and about 15500 tall) that the site's own
          JavaScript fills in later. MangaFlow never runs the scripts of other sites (a safety rule), so it only saw one picture. Worse: the page also has a "recommended manga" block
          of cover pictures inside links, and the old rule "this is only a list of manga" threw ALL pictures away, so the page was not even seen as a chapter (and the error then said
          LOCKED because of the words in the menu and the comment box).
     HOW: four small helpers, used by scanPictures():
          imgAddress()   reads the real address of ONE <img>: the lazy-load attributes we know first, then ANY other attribute whose value looks like a picture address
                         (themes invent names such as data-page-src or data-original-src), then src, then srcset. A "data:" address is never a real picture.
          isHolder()     an <img> that has NO address but is clearly a page slot: a tall empty drawing, "Image 3" in its alt text, or loading=lazy and empty.
          readerSlots()  walks the known reader boxes (READER_BOX), skipping side blocks (menus, "recommended", comments), collects the real addresses AND counts the empty slots.
          scanPictures() decides between the reader box and the older general rules, and returns { list, holders } so the reader can say "7 pages expected, 1 address known"
                         and then try to complete the list (chapterPictures, further down).
     IMPROVE: let the owner add reader-box names in Settings; also read pictures that are CSS background images. */
  // WHY: the places where sites put the pages of ONE chapter. HOW: a CSS selector text; each name is known from real sites. IMPROVE: add a name when you meet a new theme.
  // ROUND 37: added #chapter-container (arenascan / mangareader theme), .entry-content (WordPress default), .manga-reading-area, .page-break (common WP manga selectors).
  const READER_BOX = '.reading-content, .reader, #manga-page, .page-content, .chapter-content, .comic-page, [class*="reader"], [id*="reader"], #chapter-content, [id*="chapter-content"], .image-based, #chapter-container, .manga-reading-area, .page-break, .entry-content';
  // WHY: pictures in these blocks are NEVER the pages of the chapter (they are menus, "recommended manga" covers, comment avatars). HOW: img.closest(SIDE_BOX) is checked in readerSlots.
  const SIDE_BOX = 'aside, nav, footer, header, [class*="sidebar" i], [class*="widget" i], [class*="recommend" i], [class*="related" i], [class*="popular" i], [class*="comment" i]';
  // WHY: tell if a text is the address of a picture. HOW: no spaces, not a data:/javascript: address, and it ends with a picture ending (a ?query after it is fine).
  // IMPROVE: also accept addresses without an ending when the attribute name says "image".
  function looksLikeImgUrl(v) {
    v = String(v || '').trim();
    // WHY: spaces mean a sentence or a srcset list, not ONE address. HOW: test for any space character.
    if (v.length < 5 || v.length > 1500 || /^(?:data|javascript|blob):/i.test(v) || /\s/.test(v)) return false;
    // WHY: standard case — a URL ending with a known image extension.
    if (IMG_EXT.test(v)) return true;
    // ROUND 37: also accept URLs that look like image CDN paths without a file extension.
    // WHY: some sites (mangareader theme, arenascan CDN) serve images from paths like
    //   "https://cdn.example.com/uploads/manga/chapter-1/1" with no .jpg/.webp extension.
    //   These are still real image addresses — the server sends the right content-type.
    // HOW: accept any http(s) URL that is at least 12 chars long and has a path with 2+ segments,
    //   as long as the last path segment looks like a numbered page (digits only, or digits+alpha).
    // IMPROVE: per-site whitelist would be more precise and would never accidentally accept a non-image URL.
    if (/^https?:\/\//.test(v)) {
      try {
        const p = new URL(v).pathname;
        const last = p.split('/').filter(Boolean).pop() || '';
        // last segment is pure digits (page number) or digits+extension already caught above
        if (/^\d{1,5}$/.test(last)) return true;
      } catch { /* bad URL, fall through */ }
    }
    return false;
  }
  // WHY: find the real address of ONE <img>, and tell WHICH attribute held it (the report shows this, it helps to fix new sites). HOW: see the long comment above.
  // Returns { url, attr } - url is '' when the picture has no address (an empty slot).
  function imgAddressInfo(img, base) {
    // ROUND 37: added 'data-page-src' (arenascan / mangareader theme) and 'data-original-src' (another WP manga theme).
    // WHY: sites using the mangareader theme store image addresses in data-page-src instead of data-src.
    //   Adding them here means they are tried FIRST (highest priority), before the fallback scan.
    //   IMPROVE: load this list from a small per-site config so new themes can be added without code changes.
    const KNOWN = ['data-src', 'data-lazy-src', 'data-original', 'data-url', 'data-lazy', 'data-page-src', 'data-original-src', 'src'];
    // 1) the attributes we already know. A "data:" address (a tiny built-in drawing) is skipped on purpose.
    let attr = KNOWN.find(a => { const v = img.getAttribute(a); return v && v.trim() && !v.trim().startsWith('data:'); }) || '';
    let raw = attr ? img.getAttribute(attr).trim() : '';
    // 2) nothing, or only a "loading.gif" kind of picture: look at EVERY other attribute for a value that looks like a picture address.
    if (!raw || BAD_IMG.test(raw)) {
      for (const at of Array.from(img.attributes)) {
        if (KNOWN.includes(at.name) || /^(?:srcset|data-srcset|sizes|alt|title|class|id|style)$/i.test(at.name)) continue;
        if (looksLikeImgUrl(at.value)) { raw = at.value.trim(); attr = at.name; break; }
      }
    }
    // 3) still nothing: srcset (also inside <picture>), the last = biggest entry.
    if (!raw) {
      const pic = img.parentElement && img.parentElement.tagName === 'PICTURE' ? img.parentElement.querySelector('source[srcset],source[data-srcset]') : null;
      raw = srcsetBest(img.getAttribute('data-srcset') || img.getAttribute('srcset') || (pic && (pic.getAttribute('srcset') || pic.getAttribute('data-srcset'))) || '');
      if (raw) attr = 'srcset';
    }
    return { url: raw ? (absUrl(raw.trim(), base) || '') : '', attr, raw: raw ? raw.trim() : '' };   // ROUND 50: raw = the address exactly as written (fixLazy needs it)
  }
  // WHY: the short form that most code needs. HOW: only the address.
  const imgAddress = (img, base) => imgAddressInfo(img, base).url;
  // WHY: an <img> without an address can still be the room of a page. HOW: three signs: (1) a big size written on the tag or INSIDE the empty drawing (the page is 800 wide and
  // thousands of pixels tall), (2) the alt text says "Image 3" / "Page 3", (3) loading=lazy and nothing in src. Tiny pictures (icons) never count. IMPROVE: add more signs.
  const isHolderOrPage = i => { const w = parseInt(i.getAttribute('width') || '0', 10); return !(w && w < 150) && !BAD_IMG.test(i.getAttribute('src') || ''); };   // ROUND 59: a normal-sized picture
  function isHolder(img) {
    const w = parseInt(img.getAttribute('width') || '0', 10), h = parseInt(img.getAttribute('height') || '0', 10);
    if ((w && w < 150) || (h && h < 150)) return false;                    // tiny = an icon, not a page
    const src = (img.getAttribute('src') || '').trim();
    let sw = 0, sh = 0;                                                    // the size written INSIDE a "data:image/svg+xml" drawing
    if (/^data:image\/svg\+xml/i.test(src)) {
      try {
        const svg = /;base64,/i.test(src) ? atob(src.split(',')[1] || '') : decodeURIComponent(src.slice(src.indexOf(',') + 1));
        sw = +(/\bwidth\s*=\s*["']?(\d+)/i.exec(svg) || [])[1] || 0; sh = +(/\bheight\s*=\s*["']?(\d+)/i.exec(svg) || [])[1] || 0;
      } catch { /* a broken drawing: ignore it */ }
    }
    if (w >= 300 || h >= 300 || sw >= 300 || sh >= 300) return true;      // a big empty box = the room of one page
    if (/\b(?:page|image|img|pg)\s*[-#:.]?\s*\d+/i.test(img.getAttribute('alt') || '')) return true;   // alt "Chapter 1 - Image 3"
    return img.getAttribute('loading') === 'lazy' && (!src || /^data:/i.test(src));
  }
  // WHY: collect the pictures of the chapter inside the known reader boxes. HOW: for every box, every <img> that is not in a side block: a real address goes to `entries`, an empty
  // slot adds one to `holders`. `counted` stops a picture from being counted twice when boxes sit inside each other (.reader > .reading-content). `box` = the box with most pictures
  // (only used in the report). Three safety rules, each learned from how real pages are built:
  //   (1) a side block only counts when it sits INSIDE the reader box: many themes put a class like "has-sidebar" on <body> or on a wrapper around everything, and that must not hide the pages;
  //   (2) a grid of pictures that are all links to DIFFERENT pages ("recommended manga" covers) is thrown away (4 or more linked pictures, 60% or more of the links different);
  //   (3) an empty slot inside a link is not counted (a chapter's own page slots are not links to other pages);
  //   (4) an empty slot whose parent also holds a <noscript> is not counted: the real picture is written again inside the <noscript> (a page would then be counted twice).
  // IMPROVE: look at the box that is closest to the middle of the page first.
  function readerSlots(doc, base) {
    const seen = new Set(), counted = new Set(), entries = [];
    let holders = 0, box = null, boxN = 0;
    const linkOf = img => { const a = img.closest && img.closest('a[href]'); return a ? (a.getAttribute('href') || '').split('#')[0] : ''; };
    doc.querySelectorAll(READER_BOX).forEach(container => {
      let n = 0;
      container.querySelectorAll('img').forEach(img => {
        if (counted.has(img)) return;
        counted.add(img);
        const side = img.closest && img.closest(SIDE_BOX);
        if (side && side !== container && container.contains(side)) return;   // rule (1): menus, "recommended manga", comments inside the box are never the pages
        const u = imgAddress(img, base);
        if (u) {
          // WHY: logos, banners and ads are not pages; the same address twice is one page. HOW: BAD_IMG, svg ending and the Set.
          if (!BAD_IMG.test(u) && !/\.svg(\?|$)/i.test(u) && !seen.has(u)) { seen.add(u); entries.push({ u, link: linkOf(img) }); n++; }
          return;
        }
        if (!linkOf(img) && !(img.parentElement && img.parentElement.querySelector('noscript')) && isHolder(img)) { holders++; n++; }   // rules (3) and (4)
      });
      if (n > boxN) { box = container; boxN = n; }
    });
    // rule (2): a grid of covers
    const linked = entries.filter(e => e.link);
    const covers = linked.length >= 4 && new Set(linked.map(e => e.link)).size >= Math.max(4, Math.ceil(linked.length * 0.6));
    return { list: entries.filter(e => !(covers && e.link)).map(e => e.u), holders, box };
  }
  // WHY: the older "look at the whole page" rules, kept as they were in round 27 (they work for many sites), only the address reading is now imgAddress(). HOW: every <img> with
  // an address becomes a candidate; a page of covers inside links is "a list of manga" (no pictures); otherwise the biggest group inside one container wins; the scripts are the last
  // place to look. IMPROVE: per-site rules.
  function generalPictures(doc, base) {
    // WHY: candidate pictures. HOW: an array of objects with the img element and its address.
    const cands = [];
    // WHY: look at every img tag. HOW: querySelectorAll then forEach.
    doc.querySelectorAll('img').forEach(img => {
      // WHY: read the address from the known and the unknown attributes. HOW: imgAddress; skip svg and bad pictures.
      const u = imgAddress(img, base); if (!u || /\.svg(\?|$)/i.test(u) || BAD_IMG.test(u)) return;
      // WHY: read size hints. HOW: parse width and height numbers, 0 if missing.
      const w = parseInt(img.getAttribute('width') || '0', 10), h = parseInt(img.getAttribute('height') || '0', 10);
      // WHY: tiny images are decoration. HOW: skip if under 150 pixels.
      if ((w && w < 150) || (h && h < 150)) return;                      // tiny = decoration
      // WHY: keep this picture. HOW: push the object.
      cands.push({ img, url: u });
    });
    // ROUND 19 - NOT A CHAPTER: A LIST OF MANGA. WHY: the owner opened https://www.manhwafan.com/home (a home page full of cover pictures) and MangaFlow tried to
    //   "read" the covers as a chapter ("chapter 3 of 3", "several pictures are not loading"). HOW: in a real chapter the pictures are the page itself; in a list
    //   every picture is a small link to a DIFFERENT manga. So when 4 or more pictures sit inside links and at least 60% of those links are different from each
    //   other, the page is a list and no pictures are returned (the caller then treats it as a normal website page). IMPROVE: also look at the picture folder
    //   names (/thumb/, /cover/) and at the picture shape (covers are tall and small).
    //   ROUND 28: this rule now only runs here, AFTER readerSlots() had its chance, so a chapter page that also shows "recommended manga" covers is no longer thrown away.
    if (cands.length >= 4) {
      const hrefs = cands.map(c => { const a = c.img.closest && c.img.closest('a[href]'); return a ? (a.getAttribute('href') || '').split('#')[0] : ''; }).filter(Boolean);
      const distinct = new Set(hrefs).size;
      if (hrefs.length >= 4 && hrefs.length >= cands.length * 0.7 && distinct >= Math.max(4, Math.ceil(hrefs.length * 0.6))) return [];
    }
    // WHY: default result is all candidates. HOW: dom is an array of urls.
    let dom = cands.map(c => c.url);
    // WHY: with 2 or more, find the reader box. HOW: count how many pictures sit in each parent.
    if (cands.length >= 2) {
      // Count how many candidates each ancestor contains; the winner is the reader container.
      // WHY: counts per element. HOW: a Map from element to number.
      const counts = new Map();
      // WHY: count up to 6 levels of parents for each picture. HOW: loop on parentElement.
      cands.forEach(c => {
        let el = c.img.parentElement;
        for (let i = 0; i < 6 && el; i++, el = el.parentElement) counts.set(el, (counts.get(el) || 0) + 1);
      });
      // WHY: the element with most pictures is the reader. HOW: best and bestN; on a tie prefer the one inside the other.
      let best = null, bestN = 0;
      counts.forEach((n, el) => { if (n > bestN || (n === bestN && best && best.contains(el))) { best = el; bestN = n; } });
      // WHY: keep only pictures inside the winner. HOW: filter with contains.
      const picked = best ? cands.filter(c => best.contains(c.img)) : cands;
      // WHY: remove duplicates, keep order. HOW: Set of urls.
      dom = Array.from(new Set(picked.map(c => c.url)));                 // remove duplicates, keep order
    }
    // WHY: enough pictures found. HOW: return them.
    if (dom.length >= 3) return dom;
    // WHY: reader empty, try scripts. HOW: call fromScripts.
    const sc = fromScripts(doc, base);                                    // empty reader? look inside the scripts
    // WHY: choose the better list. HOW: scripts win if 3 or more and bigger than dom.
    return sc.length >= 3 && sc.length > dom.length ? sc : dom;
  }
  // WHY: the ONE place that answers "which pictures does this page show?". HOW: first the reader boxes (they know about empty slots); the older whole-page rules only when the boxes
  // are not convincing. Returns { list: [addresses], holders: number of empty slots, box: the reader element or null, how: 'reader' | 'page' | 'none' }.
  // IMPROVE: let a per-site rule override this.
  function scanPictures(doc, base) {
    const rs = readerSlots(doc, base);
    // WHY: a box with 3 or more real pictures is trusted as-is — no need to look further.
    if (rs.list.length >= 3) return { list: rs.list, holders: rs.holders, box: rs.box, how: 'reader' };
    // ROUND 39 FIX — "no images found" on sites whose reader box is ALL empty lazy-load slots (weloma.net and
    //   similar sites using a generic "lazyload.js" library: every page <img> starts as a tiny placeholder GIF or a
    //   captcha/loading image, and the real addresses are never written as a normal attribute at all).
    // WHY (root cause): the line below used to return IMMEDIATELY whenever there were 2+ holders, even when
    //   rs.list.length was ZERO — so generalPictures()'s fromScripts() fallback (which reads a JSON list of the
    //   real picture addresses straight out of a <script> tag, WITHOUT running any of the site's own code) was
    //   never even tried. The diagnostic tool shows this data IS there ("picture addresses found inside scripts:
    //   111" for weloma.net) — scanPictures() just never looked.
    // HOW: when the reader box itself found FEW real addresses (under 3) even though it saw holders, also try
    //   fromScripts() here and use whichever source found more complete pictures, before deciding "nothing found".
    //   This never changes behaviour for a page that already had 3+ real addresses (handled above), so sites that
    //   worked before are untouched.
    if (rs.holders >= 2 && rs.list.length + rs.holders >= 3) {
      if (rs.list.length < 3) {
        const sc = fromScripts(doc, base);
        if (sc.length > rs.list.length) return { list: sc, holders: Math.max(0, rs.holders - sc.length), box: rs.box, how: 'reader' };
      }
      return { list: rs.list, holders: rs.holders, box: rs.box, how: 'reader' };
    }
    const g = generalPictures(doc, base);
    if (g.length >= 3) return { list: g, holders: 0, box: null, how: 'page' };
    // WHY: a short chapter (1 or 2 pictures) inside a reader box. HOW: give those back, like the older code did through the general rules.
    if (rs.list.length) return { list: rs.list, holders: rs.holders, box: rs.box, how: 'reader' };
    return { list: g, holders: 0, box: null, how: g.length ? 'page' : 'none' };
  }
  // WHY: one question asked in several places: "is this page a CHAPTER (a page of pictures)?". HOW: yes when it has 3 or more pictures, or empty page slots that the site fills in later,
  // or (round 10) a chapter number in the address plus a numbered preview picture (001.webp). IMPROVE: also look at the "Next chapter" button.
  function looksLikeChapter(doc, base, url) {
    const sc = scanPictures(doc, base);
    if (sc.list.length >= 3) return true;
    if (sc.holders >= 2 && sc.list.length + sc.holders >= 3) return true;
    if (chapterNumOf(url) != null && metaImageSamples(doc, base).some(u => NUM_IMG.test(u))) return true;
    // ROUND 54: a SHORT chapter (1 or 2 pictures, for example one long stitched picture) is still a chapter. WHY: nyxscans chapter-0 had only ONE real picture, so the 3-picture rule said
    // "not a chapter" and the reader showed "No chapters or chapter images found". HOW: the address has a chapter number, the page has at least 1 real picture, AND it has a Previous/Next chapter link.
    // The Previous/Next link keeps ordinary pages that only show one photo from being treated as chapters. IMPROVE: also accept a page whose only big picture sits in a reader box.
    if (chapterNumOf(url) != null && sc.list.length >= 1) {
      const nav = findNavLinks(doc, base, url);
      if (nav && (nav.prev || nav.next)) return true;
    }
    return false;
  }

  /* CHAPTER LIST WITHOUT NUMBERS IN THE LINKS (round 8)
     WHY: detectChapters() needs "chapter 12" in the link or its text. Some sites use links like /read/48213 and a
          list whose text is only "12" or a date. Their list is still easy to see: it sits inside a box whose
          class or id says chapter / episode / eplister.
     HOW: take the links inside such boxes, keep the biggest group of links that share one folder (that is the
          manga's own list, a sidebar of "latest updates" has different folders), find a number in the text or the
          address, and sort. When no link has a number at all, the list is numbered from the page order
          (sites list the newest chapter first, so the last one is chapter 1).
     IMPROVE: read "next chapter" links to order lists that have no numbers. */
  // WHY: find chapter lists without numbers in links. HOW: looks inside boxes named chapter/episode, takes the biggest
  // group of links sharing a folder, numbers them. IMPROVE: use next-chapter links to order them.
  function detectChaptersLoose(doc, base) {
    // WHY: only same-site links. HOW: origin from base; return empty on error.
    let origin; try { origin = new URL(base).origin; } catch { return []; }
    // WHY: skip menu and tag links. HOW: a pattern of words like genre, login, about.
    const SKIP = /\/(?:genres?|tags?|authors?|artists?|categor(?:y|ies)|page|search|bookmarks?|login|register|user|forum|contact|about|privacy|dmca|terms)(?:\/|$|\?)/i;
    // WHY: find the likely list boxes. HOW: a CSS selector for ids or classes with these words.
    const boxes = doc.querySelectorAll('[id*="chapter" i],[class*="chapter" i],[class*="eplister"],[id*="episode" i],[class*="episode" i]');
    // WHY: avoid duplicates. HOW: a Map by address.
    const seen = new Map();
    // WHY: helper to take one link. HOW: take(a) checks and stores it.
    const take = a => {
      // WHY: use the real address if saved. HOW: prefer data-mf-href.
      const href = a.dataset && a.dataset.mfHref ? a.dataset.mfHref : a.getAttribute('href');
      // WHY: skip non-pages. HOW: empty, # or javascript/mailto/tel.
      if (!href || href.startsWith('#') || /^(javascript|mailto|tel):/i.test(href) || isWordHref(href)) return;
      // WHY: full address. HOW: absUrl; skip if empty.
      const u = absUrl(href, base); if (!u) return;
      // WHY: parse. HOW: new URL, skip on error.
      let p; try { p = new URL(u); } catch { return; }
      // WHY: skip other sites, short paths and menu links. HOW: compare origin, length, SKIP pattern.
      if (p.origin !== origin || p.pathname.length < 2 || SKIP.test(p.pathname)) return;
      // WHY: remove # part. HOW: split and keep the first part.
      const key = u.split('#')[0];
      // WHY: save new link. HOW: store url and clean title up to 120 letters.
      if (!seen.has(key)) seen.set(key, { url: key, title: (a.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120) });
    };
    // WHY: go through the boxes. HOW: skip body and html, which are too wide.
    boxes.forEach(b => {
      if (b === doc.body || b === doc.documentElement) return;
      // WHY: collect links. HOW: if the box is a link, take it; else take all links inside.
      if (b.tagName === 'A') take(b); else b.querySelectorAll('a[href]').forEach(take);
    });
    // WHY: all collected links. HOW: Array from the Map values.
    const all = Array.from(seen.values());
    // WHY: too few links is not a list. HOW: return empty.
    if (all.length < 3) return [];
    // biggest group sharing one folder
    // WHY: the real list shares a folder. HOW: group by the address without the last part.
    const groups = new Map();
    // WHY: fill groups. HOW: a Map by folder.
    all.forEach(c => { const k = c.url.replace(/[^/]*\/?$/, ''); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(c); });
    // WHY: pick the biggest group. HOW: loop and keep the longest.
    let g = []; groups.forEach(x => { if (x.length > g.length) g = x; });
    // WHY: tiny group is unreliable. HOW: return empty.
    if (g.length < 3) return [];
    // WHY: find the first number in text. HOW: a pattern that returns a float or null.
    const firstNum = s => { const m = /(\d+(?:\.\d+)?)/.exec(s || ''); return m ? parseFloat(m[1]) : null; };
    // WHY: give each link a number. HOW: loop over the group.
    g.forEach(c => {
      // WHY: number starts unknown. HOW: null.
      let num = null;
      // WHY: try the address first. HOW: numFrom of the decoded path; try/catch ignores errors.
      try { num = numFrom(decodeURIComponent(new URL(c.url).pathname)); } catch { /* none */ }
      // WHY: then the title. HOW: numFrom on the title if still null.
      if (num == null) num = numFrom(c.title);
      // WHY: then any number in the title. HOW: firstNum.
      if (num == null) num = firstNum(c.title);
      // WHY: then the last piece of the address. HOW: firstNum on it.
      if (num == null) num = firstNum(c.url.split('/').filter(Boolean).pop());
      // WHY: save the number and mark it as found in a box. HOW: set num and box.
      c.num = num; c.box = true;
    });
    // WHY: see how many got numbers. HOW: filter the non-null.
    const withNum = g.filter(c => c.num != null);
    // WHY: if most have numbers, use them. HOW: at least 3 and 60 percent; sort small first.
    if (withNum.length >= Math.max(3, g.length * 0.6)) return withNum.sort((a, b) => a.num - b.num);
    // WHY: no numbers, use page order. HOW: first is newest so it gets the biggest number.
    g.forEach((c, i) => { c.num = g.length - i; });                      // page order, newest first
    // WHY: return sorted. HOW: sort by number, chapter 1 first.
    return g.sort((a, b) => a.num - b.num);
  }

  /* ---------------------------------------------------------------
     8b. FINDING THE FULL CHAPTER LIST FROM A CHAPTER PAGE  (round 9)
     WHY: when you paste the address of ONE chapter (for example chapter 5), the page may not contain the other chapters:
          on the "MangaStream / ts_reader" kind of site (Thunder Scans and many more) the chapter dropdown is empty in the
          page and the Prev / Next buttons are placeholders ("#/prev/") that the site's own JavaScript fills in later.
          Before, MangaFlow then knew only chapter 5 (and sometimes the next one), so chapters 1 to 4 were unreachable.
     HOW: analyze() now tries these ways, in this order, and uses the first that gives a real list:
            1. the chapter links that are on the page itself,
            2. findParentLink(): a link whose address is the start of this chapter's address (/manga/name/ for /manga/name/chapter-5/),
            3. findSeriesLink(): a link to the manga's own page found by NAME (the last part of the address equals the manga's
               slug) or by words like "All chapters", also read from the page's JSON-LD breadcrumb,
            4. guessSeriesUrls(): typical addresses such as /comics/NAME/ , /manga/NAME/ , /series/NAME/ ,
            5. synthesizeChapters(): last resort, chapters 1..N are built from the number in the address
               (chapter-5 -> chapter-4 ... chapter-1). A guessed chapter that does not exist is removed again by fillChapter().
          Next and previous chapters are also read from the "prevUrl" / "nextUrl" values that the site writes inside a script
          (findNavLinks), because those are the real addresses behind the empty buttons.
     WHERE: used by analyze(), fillChapter() and goChapter(). Reading UPWARDS (loading earlier chapters above) is loadPrev() in section 9.
     IMPROVE: remember the series address per site so step 3 and 4 are skipped next time; add per-site rules. */
  // WHY: undo JSON slash escapes in script text. HOW: replace the escapes with normal characters. IMPROVE: reuse this in
  // fromScripts which has a copy of it.
  const unescapeJs = t => t.replace(/\\u002F/gi, '/').replace(/\\u0026/gi, '&').replace(/\\\//g, '/');   // JSON writes "/" as "\/"
  // WHY: get a chapter number from an address. HOW: decode the path and call numFrom; null on error.
  // ROUND 43: decodeURIComponent throws URIError on a lone % (e.g. /sale-50%-off). This never throws: it returns the text unchanged instead.
  const safeDecode = t => { try { return decodeURIComponent(t); } catch { return String(t); } };
  const chapterNumOf = u => { try { return numFrom(decodeURIComponent(new URL(u).pathname)); } catch { return null; } };
  // WHY: one string of class, id and rel for a link, to search by words. HOW: join them with spaces.
  const attrCls = a => (typeof a.className === 'string' ? a.className : '') + ' ' + (a.id || '') + ' ' + (a.getAttribute('rel') || '');

  /* Previous / next chapter addresses of a chapter page. Returns { prev, next } (each an address or null).
     A usable address is on the same site, is not "#...", and is not the page itself. */
  // WHY: find the previous and next chapter addresses. HOW: reads the page and returns an object with prev and next.
  // IMPROVE: add more site types.
  function findNavLinks(doc, base, curUrl) {
    // WHY: need the current address. HOW: parse it; return nulls on error.
    let cu; try { cu = new URL(curUrl); } catch { return { prev: null, next: null }; }
    // WHY: the result object. HOW: both start as null.
    const out = { prev: null, next: null };
    // WHY: check one possible address. HOW: usable(raw) cleans the text and returns null for placeholders like # or
    // javascript:.
    const usable = raw => {
      raw = String(raw || '').trim();
      if (!raw || raw.startsWith('#') || /^(javascript|mailto|tel|data):/i.test(raw) || isWordHref(raw)) return null;   // placeholders like "#/prev/" and texts like "Previous sentence" (round 28)
      // WHY: Turn a found link into a full web address and drop it if it is empty. HOW: absUrl() makes a relative link
      // absolute; a falsy result returns null (no link). IMPROVE: log why a link was dropped to ease debugging.
      const u = absUrl(raw, base); if (!u) return null;
      // WHY: A bad address would crash the code. HOW: new URL() throws on bad text, so try/catch turns that into null.
      // IMPROVE: write one small safeUrl() helper, since this pattern repeats a lot.
      let p; try { p = new URL(u); } catch { return null; }
      if (p.origin !== cu.origin) return null;                          // never leave the site
      // WHY: The part after # is only a jump inside the page, not a different page. HOW: split at '#' and keep the first part.
      const clean = u.split('#')[0];
      return sameUrl(clean, curUrl) ? null : clean;                     // a link to the page itself is no use
    };
    // WHY: A small helper to save a prev/next address only once. HOW: if out[k] is still empty, store the cleaned link, so
    // the first good one wins. IMPROVE: prefer links from scripts over weak ones by giving scores.
    const set = (k, raw) => { if (!out[k]) out[k] = usable(raw); };      // the first good one wins
    // 1) the real addresses written inside a script:  "prevUrl":"https://..."  "nextUrl":"https://..."
    // WHY: Many sites hide the real prev/next addresses inside script text. HOW: loop over every script tag in the page.
    // Skip tiny, huge or unrelated scripts, then decode the text with unescapeJs. IMPROVE: parse JSON blocks properly
    // instead of only using regex.
    doc.querySelectorAll('script').forEach(s => {
      const t = s.textContent || '';
      if (t.length < 20 || t.length > 4000000 || !/prev|next/i.test(t)) return;
      // WHY: pictures inside scripts have escaped characters. HOW: unescapeJs turns \u002F and similar into real characters.
      const txt = unescapeJs(t);
      // WHY: Find a previous-chapter address written like 'prevUrl':'https://...'. HOW: a regular expression (a text pattern)
      // matches known key names, then captures the value between quotes into pm[1].
      const pm = /["'](?:prevUrl|prev_url|previousUrl|prevChapter|prev_chapter|prevLink|prev)["']\s*:\s*["']([^"']*)["']/i.exec(txt);
      // WHY: Same as above but for the next chapter. HOW: another pattern with next-style key names; nm[1] holds the address.
      // IMPROVE: add more key names as new sites are met.
      const nm = /["'](?:nextUrl|next_url|nextChapter|next_chapter|nextLink|next)["']\s*:\s*["']([^"']*)["']/i.exec(txt);
      // WHY: Save what the patterns found. HOW: if a match exists, call set() with the captured address; set() cleans and
      // checks it.
      if (pm) set('prev', pm[1]);
      if (nm) set('next', nm[1]);
    });
    // 2) <link rel="prev"> and <link rel="next"> in the head
    // WHY: Some pages state the previous chapter in a <link rel='prev'> tag in the head, which is a clean source. HOW:
    // select those tags and pass their href to set().
    doc.querySelectorAll('link[rel~="prev"],link[rel~="previous"]').forEach(l => set('prev', l.getAttribute('href')));
    // WHY: Same for the next chapter. HOW: select <link rel='next'> tags and set() each href.
    doc.querySelectorAll('link[rel~="next"]').forEach(l => set('next', l.getAttribute('href')));
    // 3) normal links: by rel / class / id, or by their words ("Prev", "Previous", "Next")
    // WHY: Last way to find prev/next: look at normal visible links. HOW: go through every <a> that has an href.
    doc.querySelectorAll('a[href]').forEach(a => {
      // WHY: Get the link words and its CSS class names to judge what the link is. HOW: collapse spaces in the text; attrCls()
      // returns the class/id text. IMPROVE: also read the aria-label.
      const txt = (a.textContent || '').replace(/\s+/g, ' ').trim(), cls = attrCls(a);
      // WHY: Some pages show '#' and keep the real address in a data attribute (mfHref, added by this app). HOW: use it when
      // present, else the normal href.
      const href = a.dataset && a.dataset.mfHref ? a.dataset.mfHref : a.getAttribute('href');
      // WHY: Detect a 'previous' link. HOW: either the class name says prev/previous, or the text starts with Prev/Previous
      // (maybe after an arrow). If so, set('prev', href).
      if (/(^|[\s_-])(prev|previous)([\s_-]|$)/i.test(cls) || /^\s*(?:[«‹←<]\s*)?(prev|previous)\b/i.test(txt)) set('prev', href);
      // WHY: Detect a 'next' link. HOW: the class says next, or the text starts with Next, or ends with 'next chapter' and an
      // arrow. Then set('next', href).
      if (/(^|[\s_-])next([\s_-]|$)/i.test(cls) || /^\s*next\b/i.test(txt) || /\bnext\s*(?:chapter|ch)?\s*[»›→>]?\s*$/i.test(txt)) set('next', href);
    });
    // WHY: Give the caller the result. HOW: out holds the prev and next addresses, or null for those not found.
    return out;
  }

  /* The manga's name part of a chapter address ("slug").
     /i-picked-up-a-grimoire-chapter-1/  ->  i-picked-up-a-grimoire        /manga/solo/chapter-5/  ->  solo */
  // WHY: Get the manga's name part from a chapter address, to compare chapters of the same manga. HOW: use seriesKey()
  // first and take its last part in lower case, trimming trailing dashes or dots.
  function slugOf(url) {
    const k = seriesKey(url);
    if (k) return (k.split('/').filter(Boolean).pop() || '').toLowerCase().replace(/[-_.\s]+$/, '');
    // WHY: Fallback when seriesKey gives nothing. HOW: split the path; use the second-to-last piece (the folder above the
    // chapter), or the first piece if there is only one. IMPROVE: reuse one shared path-splitting helper.
    try { const p = decodeURIComponent(new URL(url).pathname).split('/').filter(Boolean); return (p.length > 1 ? p[p.length - 2] : p[0] || '').toLowerCase(); }
    // WHY: Bad addresses must not crash. HOW: catch the error and return an empty name.
    catch { return ''; }
  }

  // Words in an address that mean "this is not a manga page" (menus, lists of genres, login ...).
  // WHY: Menu and system pages (login, genres, feed ...) must never be taken as a manga page. HOW: a regular expression
  // (text pattern) matching those words between slashes. IMPROVE: add more words when new sites show new menu names.
  const NOT_SERIES = /\/(?:genres?|tags?|authors?|artists?|categor(?:y|ies)|page|search|bookmarks?|login|register|user|forum|contact|about|privacy|dmca|terms|wp-[a-z]+|feed|comments?)(?:\/|$|-|\?)/i;

  /* A link to the manga's own page, found by its NAME or by words. Returns an address or null.
     SCORE: the last part of the address equals the slug = 10, contains it = 6, link text like "All chapters" = 3,
     a class like "allc" / "breadcrumb" = 2. A score under 5 is too weak, so a menu link such as "Series" is not taken. */
  // WHY: Find the link to the manga's own page from a chapter page, so the full chapter list can be read. HOW: score every
  // link on the page and keep the best one. IMPROVE: make the score numbers settings.
  function findSeriesLink(doc, base, url) {
    // WHY: Need the site name (origin) to stay on the same site. HOW: parse the address; bad address returns null.
    let cu; try { cu = new URL(url); } catch { return null; }
    // WHY: The manga name is the main clue for matching links. HOW: slugOf() extracts it.
    const slug = slugOf(url);
    // WHY: Remember the best link seen so far and its score. HOW: start with nothing and score 0.
    let best = null, bestScore = 0;
    // WHY: One small judge function that scores each link. HOW: it receives the raw link, the link text and its class names.
    const consider = (raw, text, cls) => {
      // WHY: Make the link absolute and drop empty ones. HOW: absUrl(); return if nothing came back.
      const u = absUrl(raw, base); if (!u) return;
      // WHY: Skip bad addresses safely. HOW: try to build a URL object; on error leave the function.
      let p; try { p = new URL(u); } catch { return; }
      // WHY: Never follow links to other websites. HOW: compare the origin (site part) with the current one.
      if (p.origin !== cu.origin) return;
      // WHY: Work with a clean path without the trailing slash. HOW: decodeURIComponent turns %20 style codes into letters;
      // errors leave the function.
      let path; try { path = decodeURIComponent(p.pathname).replace(/\/+$/, ''); } catch { return; }
      // WHY: Reject links that are clearly not the manga page. HOW: skip very short paths, the same page, menu words, or paths
      // with a chapter number.
      if (path.length < 2 || sameUrl(u, url) || NOT_SERIES.test(path + '/') || numFrom(path) != null) return;   // chapter-like addresses are not the series
      // WHY: The last part of the path is where the manga name usually sits. HOW: split by '/' and take the last piece in
      // lower case.
      const last = path.split('/').pop().toLowerCase();
      // WHY: Start the score for this link. HOW: add points below as clues match.
      let score = 0;
      // WHY: The best clue is an exact name match. HOW: if the last part equals the slug, add 10; otherwise the next line
      // checks for partial matches.
      if (slug && last === slug) score += 10;
      // WHY: A partial name match is a weaker clue. HOW: for names of 4+ letters, if one contains the other, add 6.
      else if (slug && last.length >= 4 && (last.includes(slug) || slug.includes(last))) score += 6;
      // WHY: Words like 'All chapters' or 'Back to series' point to the manga page. HOW: a pattern tests the link text;
      // matching adds 3.
      if (/all\s*chapters?|chapter\s*list|manga\s*(?:info|page|detail)|series\s*page|back to (?:series|manga|info)/i.test(text)) score += 3;
      // WHY: Class names such as breadcrumb or allc also hint at the series link. HOW: pattern test on the class text;
      // matching adds 2.
      if (/\b(?:allc|breadcrumb|series|manga-info|info|back)\b/i.test(cls)) score += 2;
      // WHY: Keep only the winner. HOW: when this score beats the best so far, store the address (without '#') and the score.
      if (score > bestScore) { best = u.split('#')[0]; bestScore = score; }
    };
    // WHY: Check every normal link on the page. HOW: loop over all <a href> elements.
    doc.querySelectorAll('a[href]').forEach(a => {
      // WHY: Use the hidden real address if the page stores one, else the href. HOW: dataset.mfHref or getAttribute.
      const raw = a.dataset && a.dataset.mfHref ? a.dataset.mfHref : a.getAttribute('href');
      // WHY: Empty links and page-jump links (#) are useless. HOW: return early for them.
      if (!raw || raw.startsWith('#')) return;
      // WHY: Send the link to the judge. HOW: pass the address, the cleaned link text, and class names of the link plus its
      // parent for extra clues.
      consider(raw, (a.textContent || '').replace(/\s+/g, ' ').trim(), attrCls(a) + ' ' + (a.parentElement ? attrCls(a.parentElement) : ''));
    });
    // WHY: Many pages put breadcrumb data (a trail of pages) inside JSON-LD scripts, which names the series page. HOW: find
    // those scripts.
    doc.querySelectorAll('script[type="application/ld+json"]').forEach(s => {          // breadcrumb data lists the series address too
      // WHY: Pull every web address out of that data. HOW: a pattern matches http(s) text; each match is judged with no text
      // or class. IMPROVE: parse the JSON and read the breadcrumb list items directly.
      (unescapeJs(s.textContent || '').match(/https?:\/\/[^"'\s,\\]+/g) || []).forEach(raw => consider(raw, '', ''));
    });
    // WHY: Reject weak guesses such as a menu link called 'Series'. HOW: only return the best link if its score is at least
    // 5, else null.
    return bestScore >= 5 ? best : null;
  }

  // Typical addresses of a manga page, built from the name part of the chapter address.
  // WHY: Make guesses for the manga page address when nothing was found. HOW: use the site origin plus common folder names
  // plus the slug.
  function guessSeriesUrls(url) {
    // WHY: Bad address returns an empty list instead of crashing. HOW: try/catch around new URL().
    let u; try { u = new URL(url); } catch { return []; }
    // WHY: A guess needs a real manga name. HOW: get the slug; if missing or under 3 letters, return no guesses.
    const slug = slugOf(url); if (!slug || slug.length < 3) return [];
    // WHY: Typical folders where sites keep a manga's page. HOW: a plain list of strings. IMPROVE: let the user add folders
    // in Settings.
    const dirs = ['/comics/', '/manga/', '/series/', '/comic/', '/manhwa/', '/manhua/', '/webtoon/', '/title/', '/'];
    // WHY: Build the final guesses. HOW: join origin, folder, slug; Set removes duplicates; then drop the current page
    // itself.
    return Array.from(new Set(dirs.map(d => u.origin + d + slug + '/'))).filter(g => !sameUrl(g, url));
  }

  /* ROUND 28 - A CHAPTER LIST THAT IS SPLIT INTO PAGES ("1 2 3 … 5")
     WHY: mgread.io (112 chapters) shows 24 chapters per page; the other chapters live at .../chapter/page/2/, /3/ ... MangaFlow only read the FIRST page, so a chapter page gave the
          owner a list of 2 chapters, and a series page gave only the newest 24.
     HOW: pagerLinks() finds the page-number links of the series page: links under the same series folder that end in /page/N/ or have ?page=N. morePages() downloads the
          other pages (3 at the same time, at most 40 pages and about 40 seconds), reads the chapters of each with the same rule as page 1 (the `accept` function), and joins
          everything into one list without repeats, sorted by chapter number. A page that cannot be loaded is reported in `missed`, so the person is told.
     IMPROVE: remember the page template per site so the next visit asks for the pages directly; also follow "Next page" buttons when the numbers are not shown. */
  // WHY: one pattern for both page-number styles. HOW: group 1 = the number in /page/3/, group 2 = the number in ?page=3 (or paged / pg / p).
  const PAGER_RE = /\/page\/(\d{1,3})\/?$|[?&](?:page|paged|pg|p)=(\d{1,3})(?:&|$)/i;
  // WHY: find the page-number links of a list. HOW: every link on the same site, under the SERIES folder (the address without its /page/N ending), whose address matches PAGER_RE.
  // A front page has no series folder (dir is too short) so its "latest updates" pages are never taken. Returns [{ n, url }] sorted by n. IMPROVE: also read rel="next".
  function pagerLinks(doc, base, pageUrl) {
    let pu; try { pu = new URL(pageUrl); } catch { return []; }
    const dir = pu.pathname.replace(/\/page\/\d+\/?$/i, '').replace(/\/+$/, '');
    if (dir.length < 2) return [];
    const out = new Map();
    doc.querySelectorAll('a[href]').forEach(a => {
      const raw = a.dataset && a.dataset.mfHref ? a.dataset.mfHref : a.getAttribute('href');
      if (!raw || /^(?:#|javascript:|mailto:|tel:)/i.test(raw)) return;
      const u = absUrl(raw, base); if (!u) return;
      let p; try { p = new URL(u); } catch { return; }
      if (p.origin !== pu.origin || !(p.pathname.replace(/\/+$/, '') + '/').startsWith(dir + '/')) return;
      const m = PAGER_RE.exec(p.pathname + p.search); if (!m) return;
      const n = parseInt(m[1] || m[2], 10);
      if (n >= 1 && n <= 400) out.set(n, u.split('#')[0]);
    });
    return Array.from(out, ([n, url]) => ({ n, url })).sort((a, b) => a.n - b.n);
  }
  // WHY: read ALL pages of a split chapter list. HOW: see the comment above. `firstList` = the chapters already read from this page, `accept(rawList)` = keeps only the chapters of
  // THIS manga, `progress(n, max)` = an optional function that shows a status text. Returns { chapters, missed } (missed = page numbers that could not be loaded).
  async function morePages(doc, base, pageUrl, firstList, accept, progress) {
    const none = { chapters: firstList, missed: [] };
    const links = pagerLinks(doc, base, pageUrl);
    if (!links.length) return none;
    let pu; try { pu = new URL(pageUrl); } catch { return none; }
    const cm = PAGER_RE.exec(pu.pathname + pu.search), curN = cm ? parseInt(cm[1] || cm[2], 10) : 1;
    // WHY: raised from 40 to 200 so sites like arenascan (chapters 1-190 spread across many pages) load completely.
    //   The old cap of 40 cut off the first 150+ chapters on paginated lists. ROUND 38: 200 pages × ~20 chapters each = 4 000 chapters max.
    //   IMPROVE: detect the real max from the pager links and remove the hard cap entirely.
    const maxN = Math.min(links[links.length - 1].n, 200), example = links[links.length - 1].url;
    // WHY: the numbers shown in a pager can skip ("1 2 3 … 5"). HOW: the address of page n is the example link with its number replaced.
    const addr = n => (links.find(l => l.n === n) || {}).url || example.replace(/(\/page\/)\d+/i, '$1' + n).replace(/([?&](?:page|paged|pg|p)=)\d+/i, '$1' + n);
    const todo = []; for (let n = 1; n <= maxN; n++) if (n !== curN) todo.push(n);
    const all = new Map(); (firstList || []).forEach(c => all.set(c.url, c));
    const missed = [], t0 = Date.now();
    for (let i = 0; i < todo.length; i += 3) {
      // WHY: raised from 40s to 90s — 200 pages at 3 at a time = 67 batches; slow sites need the extra time. ROUND 38.
      if (Date.now() - t0 > 90000) { missed.push(...todo.slice(i)); break; }          // never wait for ever on a slow site
      if (progress) progress(todo[i], maxN);
      await Promise.all(todo.slice(i, i + 3).map(async n => {
        try { const p = await fetchDoc(addr(n)); accept(detectChapters(p.doc, p.base)).forEach(c => { if (!all.has(c.url)) all.set(c.url, c); }); }
        catch { missed.push(n); }
      }));
    }
    return { chapters: Array.from(all.values()).sort((a, b) => a.num - b.num), missed: missed.sort((a, b) => a - b) };
  }

  /* Try to get the full chapter list of the manga that a chapter page belongs to. Returns
     { chapters, parent, title } or null. Each attempt fetches one page and accepts it only when it holds 2+ chapters
     of THIS manga. At most 6 guessed addresses and about 25 seconds are spent on guessing. */
  // WHY: Try hard to get the full chapter list for the manga the current chapter belongs to. HOW: tries several ways in
  // order and returns the first that works. IMPROVE: run guesses in parallel to be faster.
  async function loadSeriesList(doc, base, url) {
    // WHY: Do not load the same address twice. HOW: a Set (a list with no repeats) starts with the current page.
    const tried = new Set([url]);
    // WHY: One try for one candidate address. HOW: an async function (can wait for the network).
    const attempt = async cand => {
      // WHY: Skip empty or already used candidates. HOW: return null early.
      if (!cand || tried.has(cand)) return null;
      // WHY: Mark this candidate as used. HOW: add it to the tried Set.
      tried.add(cand);
      // WHY: Network and parsing can fail; one failure must not stop the other ways. HOW: try/catch around the fetch.
      try {
        // WHY: Download the candidate page. HOW: fetchDoc returns the parsed page (doc) and its base address.
        const p = await fetchDoc(cand);
        // WHY: Find chapter links on that page. HOW: detectChapters collects links; pickSeries keeps those of this manga.
        let c = pickSeries(detectChapters(p.doc, p.base), url, true);
        if (c.length && !belongsToPage(c, cand)) c = [];                // only links of other manga there
        // WHY: If the page has too few chapters, it may fill the list with JavaScript. HOW: ask the site's ajax list endpoint
        // instead.
        if (c.length < 2) c = (await ajaxChapterList(p.doc, p.base, cand, url, true)).chapters;
        // WHY: Accept the page only if it has 2 or more chapters. HOW: return the list, the parent address and the title.
        // ROUND 28: the series page may show its chapters in PAGES ("1 2 3 … 5", 24 each on mgread.io). morePages() reads the other pages and joins the lists; `missed` names pages that
        // could not be loaded, so analyze() can tell the person.
        if (c.length >= 2) {
          const more = await morePages(p.doc, p.base, cand, c, l => { const x = pickSeries(l, url, true); return x.length && !belongsToPage(x, cand) ? [] : x; },
            (n, max) => setBusy('Loading the chapter list (page ' + n + ' of ' + max + ')…'));
          return { chapters: more.chapters, parent: cand, title: detectTitle(p.doc, p.base), missed: more.missed };
        }
      } catch { /* try the next way */ }
      // WHY: This candidate failed. HOW: return null so the next way is tried.
      return null;
    };
    // WHY: Way 2: a shorter address that starts the same way is often the series page. HOW: findParentLink gives the
    // candidate; attempt() tests it.
    let r = await attempt(findParentLink(doc, base, url));              // way 2: a shorter address that starts the same way
    // WHY: Way 3, only if way 2 failed. HOW: show a message to the user, then try the link found by name or words.
    if (!r) { setBusy('Looking for the manga page…'); r = await attempt(findSeriesLink(doc, base, url)); }   // way 3: by name / words
    if (!r) {                                                           // way 4: typical addresses
      // WHY: Time limit for guessing. HOW: remember the start time in milliseconds.
      const t0 = Date.now();
      // WHY: Way 4: try typical addresses, at most 6. HOW: loop over the first 6 guesses.
      for (const g of guessSeriesUrls(url).slice(0, 6)) {
        // WHY: Stop waiting too long on slow sites. HOW: break after 25000 ms (25 seconds).
        if (Date.now() - t0 > 25000) break;
        // WHY: Tell the user what is happening. HOW: setBusy shows the status text.
        setBusy('Looking for the chapter list…');
        // WHY: Test the guess. HOW: stop the loop as soon as one works.
        r = await attempt(g); if (r) break;
      }
    }
    // ROUND 59: the working note must never stay on after the search for the list is over.
    setBusy('');
    // WHY: Give the result back. HOW: r is the list info or null if all ways failed.
    return r;
  }

  /* LAST RESORT: build chapters 1..N from the number in this chapter's address (round 9).
     chapter-5 -> chapter-4, chapter-3 ... chapter-1. These are guesses (flag guess: true). If one does not exist the site
     answers "not found" and fillChapter() quietly removes that box again. The real previous address from the page (nav.prev)
     replaces the guess for chapter N-1 when the page has one. Returns a list or null. */
  // WHY: Last resort when no list was found: make chapters 1..N from the number in the address. HOW: see the comment
  // above; nav may hold the real previous address. IMPROVE: warn the user that these are guesses.
  function synthesizeChapters(url, nav) {
    // WHY: Bad addresses return null. HOW: try/catch around new URL().
    let u; try { u = new URL(url); } catch { return null; }
    // WHY: Find the chapter number in the path. HOW: CH_RE is a pattern for 'chapter-5' style text; no match returns null.
    const m = CH_RE.exec(u.pathname); if (!m) return null;
    // WHY: Turn the found number text into a number. HOW: replace '_' or '-' with '.' (so 5-5 becomes 5.5) and parseFloat.
    const curNum = parseFloat(m[1].replace(/[_-]/, '.'));
    // WHY: Only whole numbers from 2 to 2000 make sense for guessing. HOW: otherwise return null.
    if (!Number.isInteger(curNum) || curNum < 2 || curNum > 2000) return null;
    // WHY: Remember where the number sits in the path and how many digits it has (for 005 style). HOW: at = start position;
    // width = digit count.
    const at = m.index + m[0].length - m[1].length, width = m[1].length;
    // WHY: Build the address of chapter n. HOW: replace the number part in the path and keep zero padding if the original
    // had it; add the query part back.
    const make = n => u.origin + u.pathname.slice(0, at) + (m[1].startsWith('0') ? String(n).padStart(width, '0') : String(n)) + u.pathname.slice(at + width) + u.search;
    // WHY: Collect the chapter list. HOW: start with an empty array.
    const list = [];
    // WHY: Make one entry per chapter 1..current. HOW: the current one uses the real address; others are generated and
    // flagged guess so they can be removed if missing.
    for (let n = 1; n <= curNum; n++) list.push({ url: n === curNum ? url.split('#')[0] : make(n), title: '', num: n, guess: n !== curNum });
    // WHY: A real previous address is better than a guess. HOW: replace the second-to-last entry with nav.prev and mark it
    // not a guess.
    if (nav && nav.prev && list.length >= 2) list[list.length - 2] = { url: nav.prev, title: '', num: curNum - 1, guess: false };
    return list;
  }

  /* PICTURES THAT THE PAGE DOES NOT LIST (round 10, roliascan.com and similar)
     WHY: some readers fill the pictures in with JavaScript after the page loads, so the downloaded page has none. But the page's
          preview picture (og:image) is usually page 1 of the chapter, e.g. ".../storage/chapters/<code>/001.webp". The other pages
          sit next to it with the next numbers (002, 003 ...).
     HOW: take such a sample address, ask for 001, 002, 003 ... in small groups and stop at the first number that does not exist.
          Each test loads the picture in an <img> (no referer); if the host refuses that, your own proxy is tried with the chapter
          address as referer. Only used when the normal detection found NOTHING, and only up to 300 pages.
     LIMITS: only works when the pages really are numbered next to the preview picture. If it finds nothing the error report says so.
     IMPROVE: remember the pattern per site, and read the page count from the page text ("1 / 24") to stop sooner. */
  // WHY: Recognise picture addresses ending in a number, like 001.webp. HOW: a pattern splits the address into prefix,
  // digits, extension and query. IMPROVE: allow names like page-001.
  const NUM_IMG = /^(.*\/)(\d{1,4})(\.(?:jpe?g|png|webp|avif|gif))(\?.*)?$/i;
  // WHY: Get sample pictures from the page's preview tags (og:image etc). HOW: look at meta and link tags and collect
  // their addresses without repeats.
  function metaImageSamples(doc, base) {
    // WHY: Result list. HOW: starts empty.
    const out = [];
    // WHY: These tags often hold page 1 of the chapter. HOW: select all matching tags and loop over them.
    doc.querySelectorAll('meta[property="og:image"],meta[name="twitter:image"],meta[property="og:image:secure_url"],link[rel="image_src"]').forEach(m => {
      // WHY: Make the address absolute and store it once. HOW: absUrl, then push if new.
      const u = absUrl(m.getAttribute('content') || m.getAttribute('href') || '', base); if (u && !out.includes(u)) out.push(u);
    });
    // WHY: Return all sample addresses. HOW: the out array.
    return out;
  }
  // WHY: Check if a picture address really gives a picture. HOW: first try an <img> tag, then your own proxy. IMPROVE: use
  // a HEAD request to save data.
  const picTrace = [];                  // ROUND 46: a short diary of every step tried to find a chapter's pictures; printed in the error report
  function imgExists(src, ref) {                                       // does this picture address answer with a real picture?
    // WHY: Test by loading the picture like a browser would. HOW: wrap an Image load in a Promise (a value that arrives
    // later).
    const viaTag = () => new Promise(res => {
      // WHY: Create the test image and a flag so we answer only once. HOW: new Image(); done is false.
      const im = new Image(); let done = false;
      // WHY: One exit that answers only once. HOW: the first call sets done and resolves with true or false.
      const end = ok => { if (!done) { done = true; res(ok); } };
      // WHY: Do not send a referer and judge the result. HOW: success if it loads and is wider than 20 pixels (not a tiny
      // placeholder); error means false.
      im.referrerPolicy = 'no-referrer'; im.onload = () => end(im.naturalWidth > 20); im.onerror = () => end(false);
      // WHY: Do not wait forever. HOW: after 9 seconds answer false; then set src, which starts the loading.
      setTimeout(() => end(false), 9000); im.src = src;
    });
    // WHY: Second way, through your own proxy, which can send a referer. HOW: an async function.
    const viaProxy = async () => {
      // WHY: Only a user-owned proxy helps here. HOW: take the first proxy that is not a built-in default; none means false.
      const own = proxyList(false).find(p => !DEFAULT_PROXIES.includes(p)); if (!own) return false;
      // WHY: Network can fail. HOW: try/catch.
      try {
        // WHY: Ask the proxy for the picture. HOW: put the encoded picture address into the proxy template and add &ref= with
        // the chapter address.
        const r = await fetch(own.replace('{url}', encodeURIComponent(src)) + (ref ? '&ref=' + encodeURIComponent(ref) : ''), { referrerPolicy: 'no-referrer', credentials: 'omit' });
        // WHY: A bad status means no picture. HOW: return false.
        if (!r.ok) { imgExists.why = 'HTTP ' + r.status; return false; }   // ROUND 46: remembered for the error report
        // WHY: Tiny answers are error pages. HOW: the picture counts only if the data is over 1500 bytes.
        const bl = await r.blob(); if (bl.size <= 1500) imgExists.why = 'tiny answer (' + bl.size + ' bytes, ' + (r.headers.get('content-type') || '?') + ')'; return bl.size > 1500;
      } catch (e) { imgExists.why = 'failed: ' + (e && e.message); return false; }
    };
    // WHY: Run the two ways in order. HOW: use the tag test, and only if it failed try the proxy.
    return viaTag().then(ok => ok || viaProxy());
  }
  // WHY: Find all pages of a chapter by guessing numbered addresses next to the sample. HOW: see the long comment above.
  // IMPROVE: cache the result per site.
  async function probeNumbered(doc, base, ref) {
    // WHY: Try each sample picture from the page. HOW: loop over them.
    for (const sample of metaImageSamples(doc, base)) {
      // WHY: Only numbered pictures work. HOW: match the pattern; skip if no match.
      const m = NUM_IMG.exec(sample); if (!m) continue;
      // WHY: Keep the parts of the address. HOW: pre = start, digits = number text, ext = file type, q = query; width keeps
      // zero padding.
      const pre = m[1], digits = m[2], ext = m[3], q = m[4] || '', width = digits.length;
      // WHY: Build the address for page n. HOW: pad the number with zeros to the same width.
      const make = n => pre + String(n).padStart(width, '0') + ext + q;
      // WHY: Check the idea first. HOW: if neither page 1 nor the sample exists, the numbering does not hold; go to the next
      // sample.
      // ROUND 45 FIX (roliascan.com, report 2026-11-09): the site's preview picture is page "0002", and page "0001" may not exist
      //   (or may be refused). The old loop always began at 1 and stopped at the first missing number, so it found NOTHING and the
      //   page was wrongly called LOCKED. HOW NOW: ask for the sample and for the numbers 0 and 1 together; the run starts at the
      //   LOWEST number that answers (0, 1 or the sample's own number), so "0002, 0003, 0004 ..." works too. IMPROVE: remember
      //   the start number per site.
      const firstN = parseInt(digits, 10);
      const [has0, has1, hasS] = await Promise.all([imgExists(make(0), ref), imgExists(make(1), ref), imgExists(sample, ref)]);
      picTrace.push('numbered pictures: sample ' + sample + ' -> number 0: ' + has0 + ', number 1: ' + has1 + ', the sample itself: ' + hasS + (imgExists.why ? ' | last proxy answer: ' + imgExists.why : ''));
      if (!has0 && !has1 && !hasS) continue;   // the pattern does not hold
      const startN = has0 ? 0 : has1 ? 1 : firstN;
      // WHY: Result list of found pages. HOW: starts empty.
      const list = [];
      // WHY: Test pages in groups of 6 up to 300, which is faster than one by one. HOW: n jumps by 6.
      for (let n = startN; n <= 300; n += 6) {
        // WHY: Make the numbers of this group. HOW: fill an array with n to n+5.
        const group = []; for (let k = n; k < n + 6; k++) group.push(k);
        // WHY: Test the 6 pages at the same time. HOW: Promise.all waits for all answers.
        const res = await Promise.all(group.map(k => imgExists(make(k), ref)));
        // WHY: Stop at the first missing page. HOW: flag stop is set when a page is missing.
        let stop = false;
        for (let i = 0; i < group.length; i++) { if (res[i]) list.push(make(group[i])); else { stop = true; break; } }
        if (stop) break;
      }
      // WHY: Need at least 2 pages to trust the result. HOW: return the list if long enough.
      if (list.length >= 2) return list;
    }
    // WHY: Nothing found. HOW: return an empty list.
    return [];
  }

  /* ROUND 28 - COMPLETING A CHAPTER WHOSE PAGE LISTS PICTURES WITHOUT ADDRESSES
     WHY: scanPictures() can say "7 page slots, but only 1 address". The reader should still show the WHOLE chapter when that is honestly possible, and say plainly when it is not.
     HOW: chapterPictures() asks, in this order, and keeps the first answer that fills every slot:
          1. the page text again (pageTextPictures): the other addresses are often written somewhere an <img> tag does not show (a script, a hidden data block, <noscript>). Only
             addresses in the SAME folder as the first picture count, so a banner or a cover can never slip in.
          2. the scripts (fromScripts, round 8).
          3. numbering (inferNumbered): the first picture is called 1.webp, so the others are 2.webp ... N.webp, where N is the number of slots on the page. Picture 2 and the LAST
             picture are asked for first; only when both really exist is the whole list trusted. Never more pictures than the page has slots.
          When the page carries the theme's own "encrypted chapter" marker (sealedPage) step 3 is NOT used: that is the site hiding its pictures ON PURPOSE, and MangaFlow does not
          guess around it. What the page plainly gives is shown, with a clear note and a button that opens the site.
     IMPROVE: remember per site which step worked; show "page 3 missing" boxes in the right places instead of one note. */
  // WHY: the Init Manga theme can seal a chapter's pictures behind its own script; the page then contains the name "InitMangaEncryptedChapter" inside a script written in the page.
  // That is the site saying "do not copy these addresses". HOW: look for the name in the scripts that are inside the page (not in files). IMPROVE: add the markers of other themes.
  const sealedPage = doc => Array.from(doc.querySelectorAll('script:not([src])')).some(s => /InitMangaEncryptedChapter/.test(s.textContent || ''));
  // WHY: read picture addresses that are written somewhere in the page text. HOW: unescape the whole page, find every picture address, keep those in the SAME folder as the sample
  // picture, put them in page order when their names are numbers. IMPROVE: also read addresses written without the https: start.
  function pageTextPictures(doc, base, sample) {
    const folder = String(sample || '').replace(/[^/]*$/, '');
    if (folder.length < 12) return [];                                     // a folder this short would match half the web
    const html = unescapeJs((doc.documentElement && doc.documentElement.outerHTML) || '');
    const re = /(?:https?:)?\/\/[^"'\s<>\\)]+?\.(?:jpe?g|png|webp|avif|gif)(?:\?[^"'\s<>\\)]*)?/gi;
    const out = []; let m;
    while ((m = re.exec(html))) { const a = absUrl(m[0], base); if (a && a.startsWith(folder) && !BAD_IMG.test(a) && !out.includes(a)) out.push(a); }
    // WHY: pages must be in reading order. HOW: when every file name is a number (01.jpg, 02.jpg), sort by that number.
    if (out.length > 1 && out.every(u => NUM_IMG.test(u))) out.sort((a, b) => +NUM_IMG.exec(a)[2] - +NUM_IMG.exec(b)[2]);
    return out;
  }
  // WHY: find how many pictures in a row really exist. HOW: ask for from..to in groups of 6 at the same time and stop at the first missing one; returns the addresses that exist.
  // IMPROVE: use HEAD requests to save data.
  async function existsRun(make, from, to, ref) {
    const out = [];
    for (let n = from; n <= to; n += 6) {
      const group = []; for (let k = n; k < n + 6 && k <= to; k++) group.push(k);
      const res = await Promise.all(group.map(k => imgExists(make(k), ref)));
      let stop = false;
      for (let i = 0; i < group.length; i++) { if (res[i]) out.push(make(group[i])); else { stop = true; break; } }
      if (stop) break;
    }
    return out;
  }
  // WHY: work out the other addresses of a chapter from the first one (1.webp -> 2.webp ... N.webp). HOW: see the comment above. Returns the list, or [] when the idea does not hold.
  // IMPROVE: also understand names such as page-01 or img_001.
  async function inferNumbered(sample, total, ref) {
    const m = NUM_IMG.exec(sample);
    if (!m || total < 2 || total > 400) return [];
    const pre = m[1], digits = m[2], ext = m[3], q = m[4] || '', width = digits.length, first = parseInt(digits, 10), last = first + total - 1;
    // WHY: the same number of digits as the first picture (001 stays 001). HOW: padStart.
    const make = n => pre + String(n).padStart(width, '0') + ext + q;
    // WHY: only trust the idea when it is proven. HOW: the 2nd picture and the LAST picture must really answer with a picture (two quick checks at the same time).
    const [second, final] = await Promise.all([imgExists(make(first + 1), ref), imgExists(make(last), ref)]);
    if (!second) return [];
    const out = [sample];
    if (final) { for (let n = first + 1; n <= last; n++) out.push(make(n)); return out; }
    // WHY: the last one is missing (the slot count may include things that are not pages). HOW: take them one after the other until the first missing one.
    out.push(make(first + 1));
    return out.concat(await existsRun(make, first + 2, last - 1, ref));
  }
  // WHY: the one function the reader and the PDF download call to get the pictures of a chapter. HOW: see the comment above. Returns
  // { list, total, partial, sealed, how, scan } - total = how many pictures the page promises, partial = list.length < total. IMPROVE: cache the answer per chapter.
  async function chapterPictures(doc, base, ref) {
    const sc = scanPictures(doc, base), sealed = sealedPage(doc);
    // ROUND 30 - "RANDOM IMAGES OF THE MAIN PAGE" (owner report, 2026-10-30, mgread.io). WHY: when the page has no reading box, scanPictures falls back to ALL the pictures of the page (how 'page').
    //   On a chapter that is behind a login wall, or on a page that is really the manga's MAIN PAGE (the site sends it instead of a locked or removed chapter), those pictures are covers, promos
    //   and the logo - and they were shown as if they were the chapter. HOW: for how 'page' only, wrongPage() decides whether this is such a page; if so no pictures are returned and the
    //   caller shows the honest message (locked / main page instead). A real chapter with a reading box (how 'reader') is never touched. IMPROVE: look at the picture shapes too (pages are tall).
    if (sc.how === 'page') { const wrong = wrongPage(doc, base, ref, sc.list); if (wrong) return { list: [], total: 0, partial: false, sealed, how: 'rejected: ' + wrong, scan: sc, rejected: wrong }; }
    let list = sc.list.slice(), how = sc.how;
    const total = list.length + sc.holders;
    // WHY: nothing at all in the page. HOW: the numbered-preview way of round 10 (pictures next to the og:image picture).
    if (!list.length) {
      picTrace.length = 0;
      const p = await probeNumbered(doc, base, ref);
      if (p.length) return { list: p, total: p.length, partial: false, sealed, how: 'numbered preview picture', scan: sc };
      // ROUND 46: last resort for script-built readers (roliascan.com): read the site's own chapter script and ask the picture API it uses.
      const a = await apiPictures(doc, base, ref);
      return { list: a, total: a.length, partial: false, sealed, how: a.length ? 'the site\'s own picture API' : 'none', scan: sc };
    }
    // WHY: every slot has its address, or (round 28) one single odd empty slot sits among 5 or more real pictures (an ad box, a spacer): not worth a warning. HOW: nothing more to do.
    if (!sc.holders || (sc.holders === 1 && list.length >= 5)) return { list, total, partial: false, sealed, how, scan: sc };
    // 1) the page text and 2) the scripts. A list is taken only when it is longer AND it contains the first picture (or is complete), so unrelated pictures never join.
    const text = pageTextPictures(doc, base, list[0]), js = fromScripts(doc, base);
    [[text, 'the page text'], [js, 'the scripts']].forEach(([c, name]) => { if (c.length > list.length && (c.includes(list[0]) || c.length >= total)) { list = c; how = name; } });
    // 3) numbering, never for a sealed page
    if (list.length < total && !sealed) { const inf = await inferNumbered(list[0], total, ref); if (inf.length > list.length) { list = inf; how = 'numbered pictures (2nd and last picture checked)'; } }
    return { list, total, partial: list.length < total, sealed, how, scan: sc };
  }
  // ROUND 30. WHY: decide whether a page that gave pictures only through the page-wide fallback is NOT the chapter. HOW: two honest signs, nothing guessed:
  //   'series' - the page's own canonical address (<link rel="canonical"> or og:url) is a PARENT folder of the chapter address and has no chapter number: the site sent the manga's main page;
  //   'wall'   - the chapter's own text (menus, side blocks and comments are cut away by mainText) says log in / locked / coins / premium (LOCK_RE) and there are only a few pictures (10 or fewer):
  //              they are the promo pictures around the wall. A page with a reading box never gets here (how 'reader'). Returns 'series', 'wall' or ''. IMPROVE: add a sign for the blurred-picture walls.
  function wrongPage(doc, base, ref, list) {
    // ROUND 39 FIX — rawkuma.net (and similar sites) were wrongly rejected as "the site sent the main page instead
    //   of the chapter" even though the page clearly WAS the chapter (its own <title> said "Chapter 1", it had 22
    //   real pictures, and it even linked to "Chapter 2" as the next chapter).
    // WHY (root cause): the 'series' check below only looked at the canonical/og:url tag. Some chapter-reader
    //   pages (JS-driven sites, or ones with buggy SEO tags) point their canonical/og:url at the SERIES page even
    //   though the page itself is a real, individual chapter — tricking the old check into thinking the site had
    //   redirected to the series page. HOW: before trusting the canonical/og:url guess, look for a genuine
    //   "next chapter" or "previous chapter" link (findNavLinks — already used elsewhere to build the chapter
    //   list) that points to a DIFFERENT chapter number than the one we asked for. A manga's main/series page
    //   never links to "chapter 2" as ITS next chapter — only a real chapter page does — so finding one is solid
    //   proof this is not the wrong page, and overrides the canonical-tag guess. IMPROVE: also check the page's
    //   own JSON-LD "@type":"ComicStory" block, when present, the same way.
    let hasChapterNav = false;
    try {
      const nav = findNavLinks(doc, base, ref), myNum = chapterNumOf(ref);
      hasChapterNav = [nav.prev, nav.next].some(u => { if (!u) return false; const n = chapterNumOf(u); return n != null && (myNum == null || n !== myNum); });
    } catch { /* an odd address: ignore, the other signs still apply */ }
    if (!hasChapterNav) try {
      const link = doc.querySelector('link[rel="canonical"][href]') || doc.querySelector('meta[property="og:url"][content]');
      const c = link && (link.getAttribute('href') || link.getAttribute('content'));
      if (c) {
        const cp = new URL(c, base).pathname.replace(/\/+$/, ''), rp = new URL(ref).pathname.replace(/\/+$/, '');
        if (chapterNumOf(ref) != null && cp.length > 1 && cp !== rp && rp.startsWith(cp + '/') && !CH_RE.test(cp)) return 'series';
      }
    } catch { /* an odd address: the other sign decides */ }
    if (!hasChapterNav && list.length <= 10 && LOCK_RE.test(mainText(doc))) return 'wall';
    return '';
  }
  // WHY: tell the reader plainly when only part of a chapter could be found. HOW: a box (class ch-msg) with one sentence and three buttons: Retry, Open on the site (the chapter's own
  // page in a new tab), Details (the report to copy). IMPROVE: show which pages are missing.
  function partialNote(found, doc, base, ch, i, sec) {
    const box = document.createElement('div'); box.className = 'ch-msg ch-partial';
    const have = found.list.length, head = 'Only ' + have + ' of ' + found.total + ' pictures of ' + labelFor(i) + ' could be found';
    box.append(head + '. ' + (found.sealed
      ? 'This site hides the other pictures on purpose (its page is "encrypted"). MangaFlow does not break that, so read the rest on the site.'
      : 'The site gives the address of only the first picture(s) in its page; the others are filled in by the site\'s own scripts, which MangaFlow never runs.'));
    const row = document.createElement('div'); row.className = 'row';
    const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = 'Retry';
    retry.onclick = () => { cache.delete(ch.url); fillChapter(sec, i, R.gen); };
    const open = document.createElement('a'); open.href = ch.url; open.target = '_blank'; open.rel = 'noopener noreferrer'; open.textContent = 'Open on the site';
    const dt = document.createElement('button'); dt.type = 'button'; dt.textContent = 'Details';
    dt.onclick = () => showError(head, { details: [
      'Chapter address: ' + ch.url,
      'Pictures with an address: ' + have + ' | the page promises: ' + found.total,
      'How the list was made: ' + found.how,
      'Encrypted-chapter marker (InitMangaEncryptedChapter): ' + found.sealed,
      'Tried: the page text, the scripts' + (found.sealed ? '' : ', numbered pictures next to the first one (picture 2 and the last picture must exist)') + '.',
      '', diagnose(doc, base)].join('\n') });
    row.append(retry, open, dt); box.appendChild(row);
    return box;
  }

  /* "No pictures on this chapter page": say WHY as exactly as we can. A page that talks about a login / coins / premium is
     probably LOCKED (MangaFlow cannot log in). The error carries a report of what the page contained (err.details).
     ROUND 28 (false "LOCKED" message). WHY: the old test looked at ALL the text of the page, so a menu entry, a comment box ("You must log in to post a comment", "This comment has been removed")
       or a "recommended manga" block was enough to say LOCKED on a page that was only built in an unusual way. HOW: mainText() first cuts away menus, headers, footers, side blocks and
       comment boxes, and the LOCKED words are searched only in what is left (the chapter's own text). IMPROVE: look at the reading box only. */
  // WHY: the text a person reads as THE PAGE. HOW: copy the body, delete the parts that are not the page from the copy (the real page is never touched), read the text.
  function mainText(doc) {
    if (!doc.body) return '';
    const copy = doc.body.cloneNode(true);
    // WHY the 60% rule: a wrapper such as <div class="has-sidebar"> around the WHOLE page matches the words below; removing it would empty the text and hide a real "locked" notice.
    // HOW: an element that holds more than 60% of all the text is kept (only its smaller parts are cut).
    const whole = (copy.textContent || '').length;
    copy.querySelectorAll('header, nav, footer, aside, script, style, noscript, [id*="comment" i], [class*="comment" i], [class*="menu" i], [class*="sidebar" i], [class*="widget" i], [class*="recommend" i], [class*="related" i]').forEach(n => { if ((n.textContent || '').length <= whole * 0.6 || /^(?:SCRIPT|STYLE|NOSCRIPT)$/.test(n.tagName)) n.remove(); });
    return (copy.textContent || '').replace(/\s+/g, ' ').trim();
  }
  // WHY: Words that show a chapter is locked or removed. HOW: one big regular expression (text pattern), case-insensitive.
  // IMPROVE: keep the phrases in a readable list.
  const LOCK_RE = /(?:please\s+)?log\s*in\s+to\s+(?:read|unlock|view|continue)|unlock\s+(?:this\s+)?chapter|(?:chapter|content)\s+is\s+locked|premium\s+(?:only|chapter|members?)|members?\s+only|(?:coins?|points?)\s+(?:required|needed)|sign\s*in\s+to\s+read|not\s+available\s+anymore|has\s+been\s+removed/i;
  // WHY: Make a helpful error when no pictures exist. HOW: read the MAIN text of the page and choose a message. IMPROVE: translate
  // messages.
  /* ROUND 46 — SCRIPT-BUILT READERS: ASK THE SITE'S OWN PICTURE API (roliascan.com and similar)
     WHY: some readers (the page only says "Loading chapter...") get their picture list from a small JSON address that their own script calls after the page opens.
          MangaFlow never runs the site's scripts, so the list never arrived, and guessing 0001.webp, 0002.webp ... next to the preview picture is not always possible
          (the picture host may refuse strangers or number the files differently). Reading the SAME public JSON the site's script reads is not breaking anything: it is the
          address the page itself uses for every visitor.
     HOW: 1) numbers that look like ids in the chapter address (".../ch57-361460/" -> 361460) and in the preview picture folder ("manhwa_361395_57" -> 361395);
          2) the site's own script files (same host, not analytics) are downloaded through the proxy and searched for quoted addresses that start with /api/, /ajax/, /wp-json/
             (and fetch("...") calls); an address ending in "/" or "=" or containing {id} / ${...} / :id gets the id put in;
          3) plus a short list of very common shapes (/api/chapters/<id>, /api/chapter/<id>, /api/reader/<id>, /ajax/chapter/<id> ...);
          4) every candidate is fetched (at most 30, one after the other); an answer that is JSON (or text) holding 2 or more picture addresses wins. Relative addresses are made full.
          Every step is written into picTrace, which noImagesError() puts in the error report ("Steps tried"), so a failure says exactly what each address answered.
     LIMITS: needs the answers to be public (no cookie, no token). If the site wants a login the candidates answer 401/403 and the report shows it.
     IMPROVE: remember the working address per site; also read data-* ids from the page; send the chapter address as Referer through the own proxy. */
  async function apiPictures(doc, base, ref) {
    const out = [];
    let host = ''; try { host = new URL(ref).hostname.replace(/^www\./, ''); } catch { return out; }
    const origin = new URL(ref).origin;
    // 1) ids
    const ids = []; const addId = v => { if (v && !ids.includes(v)) ids.push(v); };
    try { (decodeURIComponent(new URL(ref).pathname).match(/\d{4,}/g) || []).reverse().forEach(addId); } catch { /* no ids */ }
    metaImageSamples(doc, base).forEach(u => (u.match(/(?:^|[/_-])(\d{4,})(?=[/_-])/g) || []).forEach(x => addId(x.replace(/\D/g, ''))));
    picTrace.push('picture API: ids found in the address / preview picture: ' + (ids.join(', ') || 'none'));
    if (!ids.length) return out;
    // 2) the site's own scripts
    const scripts = Array.from(doc.querySelectorAll('script[src]')).map(x => absUrl(x.getAttribute('src'), base)).filter(u => u && (() => { try { const h = new URL(u).hostname.replace(/^www\./, ''); return h === host || h.endsWith('.' + host); } catch { return false; } })() && !/google|gtag|analytics|jquery|adsbygoogle/i.test(u));
    scripts.sort((a, b) => (/chapter|read|app|main/i.test(b) ? 1 : 0) - (/chapter|read|app|main/i.test(a) ? 1 : 0));
    const found = [];
    for (const su of scripts.slice(0, 4)) {
      try {
        const js = await fetchRaw(su);
        const re = /["'`]((?:\/|https?:\/\/[^"'`\s]+?\/)(?:api|ajax|wp-json|content\/api)[^"'`\s]{1,140})["'`]/gi; let m, n = 0;
        while ((m = re.exec(js)) && n < 12) { if (!found.includes(m[1])) { found.push(m[1]); n++; } }
        const re2 = /fetch\(\s*["'`]([^"'`]{3,160})["'`]/g; while ((m = re2.exec(js)) && n < 20) { if (!found.includes(m[1]) && /^(?:\/|https?:)/.test(m[1])) { found.push(m[1]); n++; } }
        picTrace.push('picture API: read script ' + su.split('/').pop().slice(0, 40) + ' (' + js.length + ' chars) -> ' + n + ' address(es) that look like an API');
      } catch (e) { picTrace.push('picture API: could not read script ' + su.split('/').pop().slice(0, 40) + ' (' + ((e && e.errors && e.errors[0] && e.errors[0].message) || (e && e.message) || 'error') + ')'); }
    }
    // 3) candidates
    const cands = [];
    const put = u => { const a = absUrl(u, origin + '/'); if (a && /^https?:/i.test(a) && !cands.includes(a)) cands.push(a); };
    found.forEach(f => ids.slice(0, 2).forEach(id => {
      let u = f.replace(/\$\{[^}]*\}|\{\{?[^}]*\}?\}|:id\b|\[id\]/gi, id);
      if (u === f) { if (/[/=]$/.test(u)) u += id; else if (/\?[^=]*$/.test(u)) return; else if (!/\d{4,}/.test(u) && /chapter|page|image|reader/i.test(u)) u += (u.includes('?') ? '&id=' : '/') + id; else return; }
      put(u);
    }));
    ids.slice(0, 2).forEach(id => ['/api/chapters/' + id, '/api/chapter/' + id, '/api/reader/' + id, '/api/chapters/' + id + '/pages', '/api/chapter/' + id + '/pages', '/ajax/chapter/' + id, '/api/chapter?id=' + id].forEach(put));
    picTrace.push('picture API: ' + cands.length + ' address(es) to try');
    // 4) try them
    const picsIn = (x, acc) => {
      if (typeof x === 'string') { const a = absUrl(x.replace(/\\\//g, '/'), origin + '/'); if (a && IMG_EXT.test(a) && !BAD_IMG.test(a) && !acc.includes(a)) acc.push(a); }
      else if (Array.isArray(x)) x.forEach(v => picsIn(v, acc));
      else if (x && typeof x === 'object') Object.keys(x).forEach(k => picsIn(x[k], acc));
      return acc;
    };
    for (const c of cands.slice(0, 30)) {
      try {
        const txt = await fetchRaw(c);
        let pics = [];
        try { pics = picsIn(JSON.parse(txt), []); } catch { /* not JSON: look in the text */ }
        if (pics.length < 2) { const mm = unescapeJs(txt).match(/(?:https?:)?\/\/[^"'\s<>\\)]+?\.(?:jpe?g|png|webp|avif|gif)(?:\?[^"'\s<>\\)]*)?/gi) || []; pics = mm.map(u => absUrl(u, origin + '/')).filter(u => u && !BAD_IMG.test(u)).filter((u, i, a) => a.indexOf(u) === i); }
        picTrace.push('picture API: ' + c.replace(origin, '').slice(0, 90) + ' -> ' + txt.length + ' chars, ' + pics.length + ' picture address(es)');
        if (pics.length >= 2) {
          if (pics.every(u => NUM_IMG.test(u))) pics.sort((a, b) => +NUM_IMG.exec(a)[2] - +NUM_IMG.exec(b)[2]);
          return pics;
        }
      } catch (e) { picTrace.push('picture API: ' + c.replace(origin, '').slice(0, 90) + ' -> ' + ((e && e.errors && e.errors[0] && e.errors[0].message) || (e && e.message) || 'failed')); }
    }
    return out;
  }
  // ROUND 45 (arenascan.com, report 2026-11-09). WHY: some sites (WordPress) answer an unknown or old chapter address with ANOTHER series' page
  //   (the nearest guess). MangaFlow then read the wrong page's menu (8 chapters of a different manga) and said "no images found".
  //   HOW: compare the page's own canonical/og:url with the address we asked for. If the last folder name differs and neither address
  //   contains the other, the site sent a different page. Returns the canonical address, or '' when all is fine. IMPROVE: also compare titles.
  function sentOtherPage(doc, base, ref) {
    try {
      const l = doc.querySelector('link[rel="canonical"][href]') || doc.querySelector('meta[property="og:url"][content]');
      const c = l && (l.getAttribute('href') || l.getAttribute('content')); if (!c) return '';
      const cp = new URL(c, base).pathname.replace(/\/+$/, ''), rp = new URL(ref).pathname.replace(/\/+$/, '');
      if (cp.length < 2 || cp === rp || cp.startsWith(rp + '/') || rp.startsWith(cp + '/')) return '';
      return cp.split('/').pop() !== rp.split('/').pop() ? new URL(c, base).href : '';
    } catch { return ''; }
  }
  function noImagesError(doc, base, kind, ref) {
    // ROUND 45: tell the truth when the site answered with a different page.
    const other = ref ? sentOtherPage(doc, base, ref) : '';
    if (other) { const e = new Error('The site answered with a DIFFERENT page (' + other + ') instead of this chapter address, so there was nothing to read. The chapter address may be old or wrong — open the manga page and choose the chapter again, or press Retry.'); e.details = 'Asked for: ' + ref + '\nGot (canonical): ' + other + '\n\n' + diagnose(doc, base); return e; }
    // WHY: Get the text that belongs to the page itself (round 28: not the menus and comments). HOW: mainText.
    const text = mainText(doc);
    // ROUND 30: the site sent the manga's MAIN PAGE instead of the chapter (see wrongPage). HOW: its own sentence; the report (details) still says what the page contained.
    if (kind === 'series') { const e = new Error('The site sent the manga\'s MAIN PAGE (series page) instead of this chapter, so there is nothing to show. The chapter may be locked, removed or need a login. MangaFlow does not show the main page\'s pictures as a chapter.'); e.details = diagnose(doc, base); return e; }
    // WHY: Create the error with the right message. HOW: if the text matches LOCK_RE, say locked or removed; else the plain
    // message.
    // ROUND 45 (roliascan.com): the page's own HIDDEN placeholder text ("Loading chapter... This content is not available anymore") and its log-in pop-up matched the
    //   lock words although the chapter was open to everyone. HOW: when the page has real previous/next chapter links and the text has NO log-in / coins / premium words (only the
    //   "not available anymore" placeholder), the honest answer is "the site's own script fills in the pictures", not LOCKED. IMPROVE: read the placeholder's visibility.
    let navOk = false; try { const nv = findNavLinks(doc, base, ref || base); navOk = !!(nv.prev || nv.next); } catch {}
    const hardLock = /log\s*in\s+to\s+(?:read|unlock|view|continue)|unlock\s+(?:this\s+)?chapter|(?:chapter|content)\s+is\s+locked|premium|members?\s+only|coins?\s+(?:required|needed)|sign\s*in\s+to\s+read/i.test(text);
    if (navOk && !hardLock && LOCK_RE.test(text)) {
      const e2 = new Error('This site fills in its pictures with its own script (the page only says "Loading chapter…"), and MangaFlow could not find them next to the preview picture. It may be a temporary site problem — press Retry, or use "Open on the site".');
      e2.details = diagnose(doc, base) + (picTrace.length ? '\n\nSteps tried to find the pictures (round 46):\n' + picTrace.join('\n') : ''); return e2;
    }
    const err = new Error(LOCK_RE.test(text)
      ? 'This chapter may be LOCKED or REMOVED (the page asks for a login / coins / premium, or says it is not available any more). MangaFlow cannot log in for you.'
      : 'no images found on this chapter page');
    // WHY: Attach a report of what the page held, for the user to send. HOW: diagnose() builds it and it is stored on
    // err.details.
    err.details = diagnose(doc, base) + (picTrace.length ? '\n\nSteps tried to find the pictures (round 46):\n' + picTrace.join('\n') : '');
    // WHY: Return the error so the caller can throw it. HOW: return err.
    return err;
  }


  /* If we are on a chapter page without a chapter list, look for the series page (a shorter URL
     path) and read the list from there. */
  // WHY: Find a link to a parent page whose address is a shorter start of the chapter address. HOW: compare paths link by
  // link.
  function findParentLink(doc, base, url) {
    // WHY: Get the current path without the final slash. HOW: new URL and replace.
    const cu = new URL(url); const cp = cu.pathname.replace(/\/$/, '');
    // WHY: Remember the longest matching parent. HOW: best and bestLen.
    let best = null, bestLen = 0;
    // WHY: Look at every link on the page. HOW: loop over a[href].
    doc.querySelectorAll('a[href]').forEach(a => {
      // WHY: Make the link absolute (use the hidden real address if present). HOW: absUrl; skip if empty.
      const u = absUrl(a.dataset.mfHref || a.getAttribute('href'), base); if (!u) return;
      // WHY: Skip bad addresses. HOW: try/catch around new URL().
      let p; try { p = new URL(u); } catch { return; }
      // WHY: Stay on the same site. HOW: compare origins.
      if (p.origin !== cu.origin) return;
      // WHY: Compare paths fairly. HOW: remove the trailing slash.
      const pp = p.pathname.replace(/\/$/, '');
      // WHY: A parent path is shorter, is a start of the chapter path, is not a chapter itself, and the longest one is best.
      // HOW: one combined check; then store it.
      if (pp.length > 1 && pp.length < cp.length && cp.startsWith(pp + '/') && !CH_RE.test(pp) && pp.length > bestLen) { best = u; bestLen = pp.length; }
    });
    // WHY: Return the best parent link or null. HOW: best.
    return best;
  }

  /* Many sites (WordPress "Madara" theme, e.g. manhuatop.org) leave the chapter list EMPTY in the page
     and fill it with JavaScript afterwards. We ask for that list directly (through your proxy, which makes
     the POST request). Returns { chapters: [], html: '' } when the site does not work that way.
     `html` is the site's own list markup, so the series page can show it exactly like the real site.
     HOW: first try SERIES-URL/ajax/chapters/ (POST, then plain GET as a fallback), then WordPress admin-ajax.php.
     IMPROVE: other themes use other endpoints; add them here or as per-site rules. */
  // WHY: Get chapter lists that the site fills in with JavaScript (Madara theme) by asking the site directly. HOW: see the
  // comment above. IMPROVE: add other sites' endpoints.
  async function ajaxChapterList(doc, base, pageUrl, keyUrl, asChapter) {
    // WHY: Work out the series address with a trailing slash. HOW: origin plus the path with exactly one trailing slash.
    const u = new URL(pageUrl), series = u.origin + u.pathname.replace(/\/?$/, '/');
    // WHY: List of requests to try. HOW: the first is series/ajax/chapters/ with no body.
    const tries = [{ url: series + 'ajax/chapters/', body: '' }];
    // WHY: Madara pages hold the manga id in a holder tag. HOW: query that element.
    const holder = doc.querySelector('#manga-chapters-holder[data-id]');
    // WHY: Another place for the id is the shortlink tag. HOW: query it.
    const short = doc.querySelector('link[rel="shortlink"]');
    // WHY: Get the manga id. HOW: from the data-id attribute, or the number after p= in the shortlink.
    const id = (holder && holder.getAttribute('data-id')) || (short && (/[?&]p=(\d+)/.exec(short.getAttribute('href') || '') || [])[1]);
    // WHY: Add the WordPress admin-ajax way if an id exists. HOW: a POST to admin-ajax.php with action and manga id.
    if (id) tries.push({ url: u.origin + '/wp-admin/admin-ajax.php', body: 'action=manga_get_chapters&manga=' + id });
    // WHY: Go through each request way. HOW: outer loop over tries.
    for (const t of tries) {
      // WHY: The first way tries POST then plain GET; others only POST. HOW: inner loop over true/false.
      for (const post of (t.body === '' ? [true, false] : [true])) {
        // WHY: Network can fail. HOW: try/catch so the next way is tried.
        try {
          // WHY: Download the list markup. HOW: fetchHTML with POST options or none.
          const html = await fetchHTML(t.url, post ? { post: true, body: t.body } : {});
          // WHY: Read chapters from the returned markup. HOW: DOMParser turns text into a page, then detectChapters and pickSeries
          // pick this manga's chapters.
          const c = pickSeries(detectChapters(new DOMParser().parseFromString(html, 'text/html'), series), keyUrl, asChapter);
          // WHY: Accept a real list. HOW: with 2+ chapters return them and the raw html.
          if (c.length >= 2) return { chapters: c, html };
        } catch { /* try the next way */ }
      }
    }
    // WHY: Nothing worked. HOW: return an empty list and empty html.
    return { chapters: [], html: '' };
  }

  /* Runs in the background after a page is shown. If it is a series page, find its chapter list and
     show it inside the page. WHY: so the person sees the chapters like on the real site. */
  // WHY: Make a series page show its chapter list when the site loads it by script. HOW: runs in the background after the
  // page is shown. IMPROVE: show a small loading hint.
  async function enhanceSeriesPage(page) {
    // WHY: Do not break the page if anything fails. HOW: whole body in try/catch (see the end).
    try {
      // WHY: Chapter pages are not series pages. HOW: 3 or more pictures means a chapter, so stop.
      if (looksLikeChapter(page.doc, page.base, page.url)) return;      // a chapter page, not a series page (round 28: also a page with empty picture slots)
      // WHY: First read the chapters straight from the page. HOW: detect then keep those of this manga.
      const own = pickSeries(detectChapters(page.doc, page.base), page.url, false);
      // WHY: Start with what we have. HOW: list and html variables.
      let list = own, html = '';
      // WHY: If the list is missing or from other manga, ask the site directly. HOW: check size and belongsToPage.
      if (own.length < 2 || !belongsToPage(own, page.url)) {            // no list, or only links of other manga
        // WHY: Try the ajax way. HOW: call ajaxChapterList and wait for it.
        const r = await ajaxChapterList(page.doc, page.base, page.url, page.url, false);
        // WHY: Use the ajax result when good. HOW: replace list and html.
        if (r.chapters.length >= 2) { list = r.chapters; html = r.html; }
        else if (!belongsToPage(own, page.url)) list = [];              // never use another manga's chapters
      }
      // ROUND 28: the list may continue on more pages ("1 2 3 … 5"). WHY: mgread.io shows 24 chapters per page, so the first page alone gave 24 of 112. HOW: morePages() reads the other
      // pages with the same rule as page 1 and joins them; page numbers that failed are named in `missed`.
      let missed = [];
      if (list.length >= 2) {
        const more = await morePages(page.doc, page.base, page.url, list, l => { const x = pickSeries(l, page.url, false); return x.length && !belongsToPage(x, page.url) ? [] : x; });
        list = more.chapters; missed = more.missed;
      }
      // WHY: The user may have moved on during the wait. HOW: compare the current page with this one; stop if different.
      if (cur !== page) return;                                         // the person already went somewhere else
      // WHY: Handle still no list. HOW: if under 2 chapters, show a hint if the site uses a script holder, then stop.
      if (list.length < 2) {
        if (page.doc.querySelector('#manga-chapters-holder'))
          toast('This site fills its chapter list with JavaScript. Add your own proxy in Settings > Proxies (worker.js) so MangaFlow can load it.');
        // WHY: nothing more to do on this branch. HOW: leave the function early.
        return;
      }
      // WHY: Save the chapters on the page object and show them. HOW: set page.chapters and listHtml, then applyLive draws
      // them in the frame.
      page.chapters = list; page.listHtml = html;
      applyLive(frame.contentDocument);
      if (missed.length) toast('Chapter-list page ' + missed.join(', ') + ' could not be loaded, so a few chapters may be missing.');
    // WHY: Failure here is harmless. HOW: ignore the error.
    } catch { /* the page still works without the extra list */ }
  }

  /* Follow the page's own "Next" link. WHY: if the full chapter list could not be found, reading mode
     still continues chapter after chapter (each chapter page links to the next one). */
  /* NEXT / PREVIOUS CHAPTER ADDRESS (round 9: one function for both directions)
     WHY: the old code only looked for "next". Many themes (Thunder Scans) keep real addresses inside a script and
          put "#" in the visible buttons, so the first choice is now findNavLinks(). The old loop over <a> stays as a fallback.
     HOW: dir = +1 (next) or -1 (previous). The number in the address must go the right way and the address must belong
          to the same manga (seriesKey), otherwise a "next" button that points to another series is ignored.
     IMPROVE: use the chapter list order instead of numbers for sites that number chapters strangely. */
  // WHY: Find the next (dir 1) or previous (dir -1) chapter address. HOW: first findNavLinks, then a fallback search over
  // links. IMPROVE: use list order for odd numbering.
  function findStep(doc, base, curUrl, dir) {
    // WHY: Variables for the current address and number. HOW: set below.
    let cu, curNum;
    // WHY: Get the current chapter number. HOW: parse the path; error returns null.
    try { cu = new URL(curUrl); curNum = numFrom(decodeURIComponent(cu.pathname)); } catch { return null; }
    // WHY: Cannot step without a number. HOW: return null.
    if (curNum == null) return null;
    // WHY: Remember the manga identity. HOW: seriesKey of the current address.
    const key = seriesKey(curUrl);
    // WHY: Check a candidate is a good step. HOW: its number must be higher (next) or lower (prev) than now, and the manga
    // must match; returns an object or null.
    const ok = u => { const n = chapterNumOf(u); return n != null && (dir > 0 ? n > curNum : n < curNum) && (key == null || seriesKey(u) === key) ? { url: u.split('#')[0], title: '', num: n } : null; };
    // WHY: Try the best source first. HOW: findNavLinks gives prev and next; test the right one with ok().
    const nav = findNavLinks(doc, base, curUrl), good = ok(dir > 0 ? nav.next || '' : nav.prev || '');
    // WHY: A good result needs no fallback. HOW: return it.
    if (good) return good;
    // WHY: Fallback patterns depend on direction. HOW: pick the text pattern, the class word and the rel selector for next
    // or prev.
    const re = dir > 0 ? /^\s*next\b/i : /^\s*(?:[«‹←<]\s*)?(prev|previous)\b/i, word = dir > 0 ? /next/i : /prev/i, rel = dir > 0 ? '[rel~="next"]' : '[rel~="prev"]';
    // WHY: Find link candidates. HOW: filter links by rel, text or class.
    const cands = $$('a[href]', doc).filter(a => a.matches(rel) || re.test(a.textContent) || word.test(a.className));
    // WHY: Test each candidate. HOW: loop.
    for (const a of cands) {
      // WHY: Make the address absolute. HOW: absUrl; skip empty.
      const u = absUrl(a.getAttribute('href') || '', base); if (!u) continue;
      // WHY: Skip bad addresses. HOW: try/catch.
      let p; try { p = new URL(u); } catch { continue; }
      // WHY: Stay on the same site. HOW: compare origins.
      if (p.origin !== cu.origin) continue;
      // WHY: Return the first good one. HOW: ok(u) result.
      const r = ok(u); if (r) return r;
    }
    // WHY: Nothing found. HOW: return null.
    return null;
  }
  // WHY: Short names for the common cases. HOW: arrow functions that call findStep with direction 1.
  const findNextLink = (doc, base, curUrl) => findStep(doc, base, curUrl, 1);
  // WHY: Previous chapter helper. HOW: calls findStep with direction -1.
  const findPrevLink = (doc, base, curUrl) => findStep(doc, base, curUrl, -1);

  // WHY: Decide what the current page is and gather its chapters. HOW: returns title, chapters, start index and series
  // address. IMPROVE: split into smaller functions.
  async function analyze(page) {
    // WHY: Take the parts of the page object. HOW: destructuring pulls out url, doc and base.
    const { url, doc, base } = page;
    // ROUND 10: a page with no listed pictures is still a CHAPTER when its address has a chapter number and its preview picture is numbered (001.webp).
    // ROUND 28: ... or when the page shows empty picture slots that the site fills in later (mgread.io). WHY: three rules, one question. HOW: looksLikeChapter() asks all three:
    // 3 or more pictures, empty slots, or a chapter number plus a numbered preview picture.
    const isChapter = looksLikeChapter(doc, base, url);
    // WHY: Get the chapter list. HOW: detectChapters then pickSeries.
    let chapters = pickSeries(detectChapters(doc, base), url, isChapter);
    // WHY: Ignore lists of other manga on a series page. HOW: clear if belongsToPage fails.
    if (!isChapter && chapters.length && !belongsToPage(chapters, url)) chapters = [];         // links of other manga: ignore
    // WHY: Use a list fetched earlier. HOW: if still under 2 chapters, take page.chapters.
    // ROUND 28: the background reader (enhanceSeriesPage) also reads the OTHER pages of a split list ("1 2 3 … 5"). WHY: the page itself only holds the first 24 of 112 chapters.
    // HOW: wait for it (it never fails, it ends quietly), then take the LONGER of the two lists.
    if (!isChapter && page.enhancing) await page.enhancing;
    if (!isChapter && page.chapters && page.chapters.length >= 2 && page.chapters.length > chapters.length) chapters = page.chapters;   // already fetched for the series page
    // WHY: Get the manga title. HOW: detectTitle reads it from the page.
    let title = detectTitle(doc, base);
    // WHY: History needs the series address. HOW: the page itself for a series page, null for a chapter.
    let seriesUrl = isChapter ? null : url;                              // remembered in history
    // ROUND 9: a chapter page whose list is missing OR has no earlier chapters (so you could only read forwards).
    // Ways to find the list, in order: shorter address -> link by name/words -> typical addresses (/comics/name/ ...)
    // -> last resort: build chapters 1..N from the number in the address (guessed, removed again if they do not exist).
    // WHY: Real prev/next addresses help later. HOW: only for chapter pages.
    const nav = isChapter ? findNavLinks(doc, base, url) : null;
    // WHY: Current chapter number. HOW: from the address, only for chapters.
    const curNum0 = isChapter ? chapterNumOf(url) : null;
    // WHY: Count chapters older than this one. HOW: a function that filters by number.
    const earlier = c => curNum0 == null ? 0 : c.filter(x => x.num != null && x.num < curNum0).length;
    // WHY: Detect a list that lacks earlier chapters. HOW: chapter 3 or later but fewer than 3 earlier ones in the list.
    // IMPROVE: make the 3 a named setting.
    const incomplete = isChapter && curNum0 != null && curNum0 >= 3 && earlier(chapters) < Math.min(curNum0 - 1, 3);
    // ROUND 28: a chapter page that only lists a few chapters (usually just its Previous and Next buttons) is not the whole list either. WHY: on mgread.io chapter 1 and 2 showed
    // 2 chapters. HOW: fewer than 4 chapters = also look for the series page. loadSeriesList only replaces the list when its own list is better. IMPROVE: make the 4 a setting.
    const small = isChapter && chapters.length < 4;
    // WHY: If the list is missing or incomplete, search for a better one. HOW: enter this block.
    if (isChapter && (chapters.length < 2 || incomplete || small)) {
      // WHY: Run the four ways. HOW: loadSeriesList; a failure becomes null.
      const r = await loadSeriesList(doc, base, url).catch(() => null);
      if (r && r.missed && r.missed.length) toast('Chapter-list page ' + r.missed.join(', ') + ' could not be loaded, so a few chapters may be missing.');   // round 28
      // WHY: Use the new list only if it is better. HOW: more chapters, or more earlier ones.
      if (r && (r.chapters.length > chapters.length || earlier(r.chapters) > earlier(chapters))) {
        // WHY: Switch to the new list. HOW: take chapters, title and parent address.
        chapters = r.chapters; title = r.title || title; seriesUrl = r.parent;
      }
      // WHY: Reset the status text. HOW: setBusy.
      setBusy('Detecting chapters…');
    }
    // WHY: Last resort. HOW: if still under 2 chapters, build guessed ones with synthesizeChapters.
    if (isChapter && chapters.length < 2) { const syn = synthesizeChapters(url, nav); if (syn) chapters = syn; }
    // ROUND 33: Second last resort — for sites like Kuaikan that use IDs (not sequential numbers) in their URLs.
    //   synthesizeChapters only works when the URL contains a chapter number like "chapter-5"; for ID-based URLs (e.g.
    //   kuaikan.com/comic-next/800337) it returns null. But findNavLinks() already found the prev/next links correctly.
    //   HOW: if we still only have 1 chapter but nav has a prev or next link, build a minimal [prev, current, next] list from
    //        those links so the reader can continue. Numbers are set by position, not by a chapter number from the URL.
    //   IMPROVE: fetch the prev/next pages to get their real titles.
    if (isChapter && chapters.length < 2 && nav && (nav.prev || nav.next)) {
      const navList = [];
      if (nav.prev) navList.push({ url: nav.prev, title: 'Previous chapter', num: 1, guess: true });
      navList.push({ url, title: doc.title.slice(0, 120) || 'Current chapter', num: nav.prev ? 2 : 1 });
      if (nav.next) navList.push({ url: nav.next, title: 'Next chapter', num: nav.prev ? 3 : 2, guess: true });
      if (navList.length > chapters.length) chapters = navList;
    }
    // WHY: Chapter pages finish here. HOW: find the current chapter in the list.
    if (isChapter) {
      // WHY: Locate the current chapter. HOW: findIndex by same address.
      let i = chapters.findIndex(c => sameUrl(c.url, url));
      // WHY: Add the current chapter if missing. HOW: -1 means not found.
      if (i < 0) {                                                       // current page missing from list: add it
        // WHY: Work out its number. HOW: from the path or the page title.
        const n = numFrom(safeDecode(new URL(url).pathname)) ?? numFrom(doc.title);
        // WHY: Add it to the list. HOW: push an object with address, short title and number.
        chapters.push({ url, title: doc.title.slice(0, 120), num: n == null ? chapters.length + 1 : n });
        // WHY: Keep order right. HOW: sort by number.
        chapters.sort((a, b) => a.num - b.num);
        // WHY: Find the new position. HOW: findIndex again.
        i = chapters.findIndex(c => c.url === url);
      }
      // WHY: Give the result for a chapter page. HOW: object with title, chapters, start and series address.
      return { title, chapters, start: i, seriesUrl };
    }
    // WHY: Series page with no list in the page. HOW: ask the site's ajax list.
    if (chapters.length < 2) chapters = (await ajaxChapterList(doc, base, url, url, false)).chapters;
    // WHY: Nothing to read. HOW: if no chapters, build an error.
    if (!chapters.length) {
      // WHY: Tell the user what to open. HOW: create the Error.
      const err = new Error('No chapters or chapter images found on this page. Open a manga series page or a chapter page.');
      err.details = diagnose(doc, base);                                  // round 8: what the page contained (goes into the report)
      // WHY: Stop here with the error. HOW: throw it; the caller shows it.
      throw err;
    }
    // Resume where you stopped: the history remembers the chapter ADDRESS (not a position number), so it still
    // works when new chapters are added to the list later.
    // WHY: Resume where the user stopped. HOW: look in the history for this site and title.
    const hit = reads.find(r => r.id === new URL(base).origin + '|' + title);
    // WHY: Find that chapter in the list. HOW: match by address; -1 if not found.
    const j = hit ? chapters.findIndex(c => sameUrl(c.url, hit.chapterUrl)) : -1;
    // WHY: Choose the start position. HOW: use j if above 0, else the first chapter.
    const start = j > 0 ? j : 0;
    // WHY: Tell the user. HOW: show a toast (small message) when resuming.
    if (start > 0) toast('Resuming from chapter ' + fmtNum(chapters[start].num));
    // WHY: Return the series result. HOW: title, chapters, start, seriesUrl.
    return { title, chapters, start, seriesUrl };
  }

  /* ---------------------------------------------------------------
     9. READING MODE - state + infinite chapter streaming
     WHY: R holds everything about the current reading session. `gen` is a counter that lets us
          ignore results of a chapter that finished loading after the user already jumped elsewhere.
          An IntersectionObserver watches an invisible marker at the bottom: when it nears the
          screen we load the next chapter, so scrolling never ends until all chapters are done.
     ROUND 6: chapters now load in BATCHES of BATCH (10) at the same time. When reading starts, chapter 1..10
          are all asked for together (the 10 boxes appear at once and each fills as soon as its page arrives).
          When you get close to the last chapter of the batch (updateCurrent) the next 10 start loading, so you
          never wait. The pictures themselves stay lazy (they load when you scroll near them) to save data.
     IMPROVE: also load PREVIOUS chapters when scrolling up (needs scroll-position correction),
              make BATCH a setting, remove far-away chapters from the page to save memory on phones. */
  // WHERE: used by loadNext() (first batch + next batches) and reloadSections() below.
  // WHY: How many chapters load at once. HOW: a constant, 10. IMPROVE: make it a setting.
  const BATCH = 10;                  // how many chapters are requested at the same time
  // WHY: Find the key page parts once. HOW: $ is a short helper for querySelector.
  const reader = $('#reader'), stream = $('#stream'), sentinel = $('#sentinel');
  // WHY: R is the reading state: chapters, position, loading flags. HOW: gen is a counter to ignore old results. IMPROVE:
  // keep it in a small class.
  let R = { gen: 0, title: '', chapters: [], first: 0, next: 0, cur: 0, loading: false, paused: false, seriesUrl: null, batchP: null };

  // WHY: Load more chapters when the end marker nears the screen. HOW: IntersectionObserver watches the sentinel with
  // 1500px extra margin.
  const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) loadNext(); }, { rootMargin: '1500px' });

  // WHY: A name for chapter i. HOW: uses its number or index plus 1.
  const labelFor = i => {
    const c = R.chapters[i];
    return 'Chapter ' + (c && c.num != null ? fmtNum(c.num) : i + 1);
  };
  // WHY: Find the page box of chapter i. HOW: query by data-index.
  const secFor = i => stream.querySelector('.chapter[data-index="' + i + '"]');

  /* START READING MODE (round 8: returns true/false, quiet mode, "reading" class)
     WHY: the dock, the keys and the CSS need to know that we are in reading mode: body.reading is added here and
          removed in leaveReader(). `quiet` is used by the automatic start (no pop-up if it cannot start).
     HOW: analyze() works out the chapters, then the first batch of chapters is loaded (loadNext). */
  // WHY: Start reading mode. HOW: finds chapters, switches the screen, loads the first batch. Returns true or false.

  /* CHAPTER AUDIT (round 55) - nyxscans.com showed chapter 0, 1 and then 22..40: chapters 2 to 21 were missing from the site's own list, and the reader simply jumped from 1 to 22 without a word.
     WHY: a list with holes is wrong, and the person must be told. HOW (3 steps):
       1. fillChapterGaps(): read the chapter number from each address (".../chapter-22"), find every whole number missing between the first and the last, and add a GUESSED chapter for each one
          (same address pattern, other number). Numbers before the first one are only added when the first number is small (0 to 5), so chapters 1,2,3 are never forgotten.
       2. verifyChapterList(): ask the site for each guessed address (3 at a time). A page with pictures stays in the list; a 404 / no pictures = the site itself does not have that chapter,
          so it is removed and written into the audit.
       3. auditReport(): one pop-up with the report that names the missing numbers and WHY (not on the site / site page without pictures / could not be checked). 30 seconds later the same
          check looks at the chapter boxes: a chapter that is in the list but did not show its pictures is reported as "not detected in reading mode".
     IMPROVE: also look for chapters AFTER the newest one in the list (try last+1, last+2). */
  function chapterNumInUrl(url) {
    try { const m = CH_RE.exec(decodeURIComponent(new URL(url).pathname)); return m ? parseFloat(m[1].replace(/[_-]/, '.')) : null; } catch { return null; }
  }
  // WHY: build "same address with another number". HOW: like synthesizeChapters: replace the digits in the path and keep zero padding.
  function chapterUrlMaker(url) {
    let u; try { u = new URL(url); } catch { return null; }
    const m = CH_RE.exec(u.pathname); if (!m) return null;
    const at = m.index + m[0].length - m[1].length, width = m[1].length, pad = m[1].startsWith('0') && width > 1;
    return n => u.origin + u.pathname.slice(0, at) + (pad ? String(n).padStart(width, '0') : String(n)) + u.pathname.slice(at + width) + u.search;
  }
  function fillChapterGaps(chapters, startIdx) {
    const audit = { expected: 0, listed: chapters.length, gaps: [], dead: [], unsure: [], notDetected: [], verified: 0, done: false };
    try {
      const nums = chapters.map(c => chapterNumInUrl(c.url));
      const known = nums.filter(n => n != null);
      if (chapters.length < 2 || known.length < Math.max(2, chapters.length * 0.6)) { audit.skipped = 'chapter numbers cannot be read from the addresses'; auditHold = audit; return chapters; }
      const whole = new Set(known.filter(n => Number.isInteger(n)));
      const lo = Math.min(...known), hi = Math.max(...known);
      const from = lo <= 5 ? (whole.has(0) || lo === 0 ? 0 : 1) : Math.ceil(lo);
      const missing = [];
      for (let n = from; n <= Math.floor(hi) && missing.length < 800; n++) if (!whole.has(n)) missing.push(n);
      audit.expected = Math.floor(hi) - from + 1; audit.gaps = missing.slice();
      if (missing.length) {
        const out = chapters.slice();
        missing.forEach(n => {
          // pattern from the listed chapter whose number is closest
          let best = -1, bd = 1e9; nums.forEach((x, i) => { if (x != null && Math.abs(x - n) < bd) { bd = Math.abs(x - n); best = i; } });
          const mk = best >= 0 ? chapterUrlMaker(chapters[best].url) : null; if (!mk) return;
          out.push({ url: mk(n), title: '', num: n, guess: true, gap: true });
        });
        out.sort((x, y) => (x.num - y.num) || 0);
        chapters = out;
      }
    } catch (e) { audit.skipped = 'check failed: ' + (e && e.message); }
    auditHold = audit; return chapters;
  }
  let auditHold = null;
  const auditShown = new Set();
  async function verifyChapterList(gen) {
    const A = auditHold; if (!A) return; R.audit = A;
    const gaps = R.chapters.filter(c => c.gap);
    let k = 0;
    const one = async () => {
      while (k < gaps.length) {
        const c = gaps[k++]; if (R.gen !== gen) return;
        try {
          const { doc, base } = await fetchDoc(c.url);
          // ROUND 57: a page that ANSWERS (HTTP 200) is kept even when no picture can be seen in its HTML. WHY: sites such as arenascan write the pictures with a script, so the old rule
          //   ("no picture = chapter missing") wrongly threw real chapters out and the reader jumped from chapter 1 to chapter 20. HOW: only an honest "not found" removes a chapter:
          //   HTTP 404/410 (below) or a page whose title says 404 / not found and that does not mention this chapter number.
          const sc = scanPictures(doc, base);
          const ttl = ((doc.title || '') + ' ' + ((doc.querySelector('h1') || {}).textContent || '')).toLowerCase();
          const says404 = /\b404\b|not found|page (does ?n.t|does not) exist|no longer available/.test(ttl) && !new RegExp('(^|[^0-9])' + c.num + '([^0-9]|$)').test(ttl);
          if (says404 && sc.list.length < 1) { c.dead = true; A.dead.push(c.num + ' (the site shows its "not found" page)'); }
          else { c.verified = true; A.verified++; }
        } catch (e) {
          const msg = String((e && e.message) || e);
          if (/HTTP 404|HTTP 410|NOT FOUND/i.test(msg)) { c.dead = true; A.dead.push(c.num + ' (not on the site: ' + (msg.match(/HTTP 4\d\d/) || ['not found'])[0] + ')'); }
          else A.unsure.push(c.num + ' (' + msg.slice(0, 60) + ')');
        }
      }
    };
    await Promise.all([one(), one(), one()]);
    if (R.gen !== gen) return;
    // take dead chapters off the screen and out of the menu
    R.chapters.forEach((c, i) => { if (c.dead) { const sec = stream.querySelector('.chapter[data-index="' + i + '"]'); if (sec) removeSection(sec); } });
    buildChapterMenu(); updateDlBar();
    const byNum = (x, y) => parseFloat(x) - parseFloat(y); A.dead.sort(byNum); A.unsure.sort(byNum);
    A.done = true;
    auditReport(gen, false);
    setTimeout(() => { if (R.gen === gen) auditReport(gen, true); }, 30000);
  }
  function auditReport(gen, late) {
    const A = R.audit; if (!A || R.gen !== gen) return;
    if (late) {
      A.notDetected = [];
      $$('.chapter', stream).forEach(x => {
        const i = +x.dataset.index, c = R.chapters[i]; if (!c || c.dead) return;
        const pics = x.querySelectorAll('img.page').length;
        if (!pics && !x.dataset.verify && (x.dataset.failed === '1' || x.querySelector('.ch-msg')) ) A.notDetected.push(fmtNum(c.num));
      });
    }
    const problems = A.dead.length + A.unsure.length + A.notDetected.length;
    if (!problems && !A.skipped) return;
    const key = (R.seriesUrl || R.title) + '|' + A.dead.join() + '|' + A.unsure.join() + '|' + A.notDetected.join();
    if (auditShown.has(key)) return; auditShown.add(key);
    if (A.skipped && !problems) return;      // nothing wrong was found; the note is only for the diagnostic report
    const lines = [
      'Chapter check for "' + R.title + '"',
      'Chapters in the site\'s own list: ' + A.listed + ' | expected from the numbers: ' + A.expected,
      'Missing from the site\'s list and added by guessing: ' + (A.gaps.length ? A.gaps.join(', ') : 'none'),
      'Found on the site after checking: ' + A.verified,
      'NOT on the original site (so the site itself lacks them): ' + (A.dead.length ? A.dead.join(', ') : 'none'),
      'Could not be checked (network or block, will be tried again when reached): ' + (A.unsure.length ? A.unsure.join(', ') : 'none'),
      'In the list but NOT shown in reading mode: ' + (A.notDetected.length ? A.notDetected.join(', ') : 'none')
    ];
    const head = A.notDetected.length ? 'Some chapters were found on the site but could not be shown in reading mode: ' + A.notDetected.slice(0, 8).join(', ')
      : A.dead.length ? 'The site is missing ' + A.dead.length + ' chapter(s): ' + A.dead.slice(0, 8).map(x => x.split(' ')[0]).join(', ') + (A.dead.length > 8 ? ' …' : '')
      : 'Some chapters could not be checked: ' + A.unsure.slice(0, 8).map(x => x.split(' ')[0]).join(', ');
    showError(head, { title: '📚 Chapter check: ' + (A.notDetected.length ? 'not shown in reading mode' : A.dead.length ? 'missing on the site' : 'could not verify'), details: lines.join('\n'), hint: 'Open the original site and look at the chapter list. If the chapter is there, press Retry on its box or send this report.' });
  }
  // ROUND 57: what the site view (Page 2) knows about the chapter list - for the diagnostic report when "no chapter shows".
  function pageListText() {
    if (!cur) return 'no page open';
    const L = cur.chapters || [];
    let nums = ''; try { const n = L.map(c => chapterNumInUrl(c.url)).filter(x => x != null); if (n.length) nums = ', numbers ' + Math.min(...n) + ' to ' + Math.max(...n) + ' (' + new Set(n).size + ' different)'; } catch { /* ignore */ }
    const busy = (document.getElementById('busy') || {}).hidden === false ? ', banner: "' + document.getElementById('busy').textContent + '"' : '';
    return 'list ' + L.length + ' chapters' + nums + ', background reader ' + (cur.enhancingDone ? 'finished' : 'still working') + busy;
  }
  function chapterAuditText() {
    const A = R && R.audit; if (!A) return 'no audit yet';
    return 'listed ' + A.listed + ', expected ' + A.expected + ', gaps ' + (A.gaps.length || 0) + ', verified ' + A.verified + ', not on site [' + A.dead.join('; ') + '], unchecked [' + A.unsure.join('; ') + '], not shown [' + A.notDetected.join(', ') + ']' + (A.skipped ? ', skipped: ' + A.skipped : '') + (A.done ? '' : ' (still checking)');
  }

  async function startReading(opts = {}) {
    // WHY: Need a page first. HOW: if none is open, show a message and stop.
    if (!cur) { toast('Open a manga page first'); return false; }
    // WHY: Avoid starting twice. HOW: stop when the busy box is visible, unless quiet.
    if (!$('#busy').hidden && !opts.quiet) return false;                  // already starting
    // ROUND 39: reset the history-save throttle (see updateCurrent) so the FIRST position of this freshly opened
    // manga always saves right away, instead of possibly being skipped because its chapter index happens to match
    // whatever was last saved for a previous manga.
    lastSavedIdx = -1; lastSavedAt = 0;
    // WHY: Show progress. HOW: setBusy.
    setBusy('Detecting chapters…');
    // WHY: Result holder. HOW: info is filled by analyze().
    let info;
    // WHY: Work out the chapters. HOW: wait for analyze(cur).
    try { info = await analyze(cur); }
    // WHY: Handle failure. HOW: catch the error.
    catch (e) {
      // WHY: Clear the busy box. HOW: setBusy with empty text.
      setBusy('');
      // WHY: Automatic start stays quiet. HOW: only a small toast when quiet.
      if (isHumanCheck(e.message)) humanCheckBox(cur.url, () => startReading(opts));   // round 29e: the chapter list is behind the human check
      else if (opts.quiet) toast('Could not start reading automatically. Pick a chapter, or press "Reading mode".');
      // WHY: Otherwise show the big error. HOW: showError with message, hint and details.
      else showError(e.message, { hint: e.hint, details: e.details });
      return false;
    }
    // WHY: clear the 'busy' sign. HOW: setBusy('') removes the message.
    setBusy('');
    // ROUND 27 (bug B6): the download-size estimate (estCache.all) was remembered for the whole visit, so after opening a DIFFERENT manga the download window still
    // showed the sizes of the previous one. HOW: forget it every time a new reading session starts (it is measured again, once, when the download window opens).
    Object.keys(estCache).forEach(k => delete estCache[k]);
    // WHY: Start a fresh reading session. HOW: new state object; gen goes up by 1 so old loads are ignored.
    humanHosts.clear();                                                  // round 29e: a new reading session starts with a clean slate (no site is "waiting for the check" yet)
    { const keepU = info.chapters[info.start] && info.chapters[info.start].url;
      info.chapters = fillChapterGaps(info.chapters, info.start);   // ROUND 55: add chapters the site's own list skipped (see fillChapterGaps)
      if (keepU) { const k = info.chapters.findIndex(c => c.url === keepU); if (k >= 0) info.start = k; } }
    R = { gen: R.gen + 1, title: info.title, chapters: info.chapters, first: info.start, next: info.start, cur: info.start, loading: false, paused: false, seriesUrl: info.seriesUrl };
    // WHY: Fill the chapter menu. HOW: buildChapterMenu().
    buildChapterMenu();
    // WHY: Clear old content. HOW: empty the stream, hide the end message, update the download bar.
    stream.innerHTML = ''; $('#theEnd').hidden = true; updateDlBar();
    // WHY: Switch screens. HOW: hide the browser, show the reader, add class reading, sync the dock.
    $('#browser').hidden = true; reader.hidden = false; document.body.classList.add('reading'); syncDock();
    endResume();                                                         // round 29a: reading mode is on the screen now, so the "Reopening..." cover can go (not after the whole batch has loaded)
    // WHY: Show title and chapter name. HOW: set text of header elements.
    $('#rTitle').textContent = R.title; $('#rSub').textContent = labelFor(R.cur);
    // WHY: Show the address. HOW: set the input value.
    $('#rdAddr').value = cur.url;
    // WHY: Start at the top. HOW: scroll to 0, reset lastY, show the UI.
    window.scrollTo(0, 0); lastY = 0; showUi();
    // ROUND 39: push:true — starting reading mode is a real navigation step (Back should return to the page you
    // were on before). lastSavedIdx/lastSavedAt are set here too so the scroll-driven save (updateCurrent) does not
    // immediately push a SECOND, redundant entry for this same chapter a moment later.
    rememberChapter(R.cur, true); lastSavedIdx = R.cur; lastSavedAt = Date.now();
    updatePrevBar();                                                     // round 9: show the "earlier chapters" area
    // WHY: Watch the end marker. HOW: reconnect the observer.
    io.disconnect(); io.observe(sentinel);
    // WHY: Show the one-time tip. HOW: call readingTip().
    readingTip();
    // ROUND 55: check the added chapters and the whole list in the background; any problem is reported by itself.
    const auditGen = R.gen; verifyChapterList(auditGen);
    // WHY: Load the first batch. HOW: wait for loadNext().
    await loadNext();
    // WHY: Tell the caller it worked. HOW: return true.
    return true;
  }

  /* A one-time hint about the optional slider and wheel (round 11). WHY: new controls are easy to miss. Shown once per browser. */
  // WHY: Show a tip about extra controls once. HOW: stop if those controls do not exist.
  function readingTip() {
    if (!window.MangaFlowSlider && !window.MangaFlowWheel) return;
    // WHY: Remember the tip was shown. HOW: use localStorage (browser memory); try/catch in case it is blocked.
    try { if (localStorage.getItem('mf_tip11')) return; localStorage.setItem('mf_tip11', '1'); } catch { /* shown every time if storage is blocked: harmless */ }
    // WHY: Teach the controls. HOW: show a toast message.
    toast('Tip: drag the slider on the right up or down to change chapter. Turn the wheel on the left to reload (right = this chapter, left = all).');
  }

  /* Load the next batch of chapters (up to BATCH) at the same time.
     HOW: 1) make the empty chapter boxes in order (so the order on the page is always right),
          2) fill all of them in parallel, 3) when every box is done, check the sentinel again.
     Returns a promise, so callers (for example the "next chapter" key) can wait for the batch. */
  // WHY: Load the next batch of chapters. HOW: see the comment above. Returns a Promise.
  function loadNext() {
    // WHY: Do nothing when not reading or paused. HOW: return a done Promise.
    if (reader.hidden || R.paused) return Promise.resolve();
    // WHY: Do not run two batches. HOW: return the running one.
    if (R.loading) return R.batchP;                                  // a batch is already running: share it
    // WHY: No more chapters. HOW: show the end message.
    if (R.next >= R.chapters.length) { $('#theEnd').hidden = false; return Promise.resolve(); }
    // WHY: Work out this batch. HOW: copy gen; from is the start, to is the end (max BATCH).
    const gen = R.gen, from = R.next, to = Math.min(R.chapters.length, from + BATCH);
    // WHY: Mark as taken and busy. HOW: move R.next, set loading.
    R.next = to; R.loading = true;
    // WHY: Store the running batch. HOW: an async function that runs at once.
    R.batchP = (async () => {
      // WHY: Make sure loading is reset. HOW: try with finally below.
      try {
        // WHY: Hold the new boxes. HOW: empty array.
        const secs = [];
        // WHY: Create boxes in order. HOW: makeSection for each index.
        for (let i = from; i < to; i++) secs.push(makeSection(i));
        // WHY: Fill all boxes at the same time. HOW: Promise.all waits for all.
        await Promise.all(secs.map(sec => fillChapter(sec, +sec.dataset.index, gen)));
      } finally {
        // WHY: Only reset if the session is still the same. HOW: compare gen.
        if (gen === R.gen) {
          R.loading = false;
          io.disconnect(); io.observe(sentinel);          // re-check: sentinel may still be near the screen
        }
      }
    })();
    // WHY: hand back the loading promise so callers can wait for the same batch. HOW: R.batchP is the running batch.
    return R.batchP;
  }

  /* Build the empty box of one chapter: header (manga name, number, title). The pages come later (fillChapter). */
  // WHY: Make the empty box of a chapter. HOW: see the comment above.
  function makeSection(i, detached) {                // detached = do not add to the page yet (loadPrev inserts it above)
    // WHY: Get the chapter data. HOW: from R.chapters.
    const ch = R.chapters[i];
    // WHY: The box element. HOW: create a section.
    const sec = document.createElement('section');
    // WHY: Mark the box. HOW: class, index and address are saved on it.
    sec.className = 'chapter'; sec.dataset.index = i; sec.dataset.url = ch.url;

    // WHY: Header holder. HOW: a div with class ch-head.
    const head = document.createElement('div'); head.className = 'ch-head';
    // WHY: Show the manga name. HOW: a div filled with R.title.
    const m = document.createElement('div'); m.className = 'ch-manga'; m.textContent = R.title;
    // WHY: Show the chapter number. HOW: a div with labelFor.
    const n = document.createElement('div'); n.className = 'ch-num'; n.textContent = labelFor(i);
    // WHY: Put both into the header. HOW: head.append.
    head.append(m, n);
    // WHY: Compare the title with the label. HOW: lower case label.
    const label = labelFor(i).toLowerCase();
    // WHY: Show a title only if it adds info. HOW: it must differ from the label and not be plain.
    if (ch.title && ch.title.toLowerCase().replace(/\s+/g, ' ') !== label && !isPlainTitle(ch.title)) {
      // WHY: Make the title element. HOW: create, fill, add.
      const t = document.createElement('div'); t.className = 'ch-title'; t.textContent = ch.title; head.appendChild(t);
    }
    // WHY: Add the header to the box. HOW: appendChild.
    sec.appendChild(head);
    // WHY: Show the box unless detached. HOW: append to the stream.
    if (!detached) stream.appendChild(sec);
    // WHY: Give back the box. HOW: return sec.
    return sec;
  }

  // WHY: Download one chapter and show its pictures. HOW: see steps below. IMPROVE: split into smaller helpers.
  async function fillChapter(sec, i, gen) {
    // ROUND 43: two fills of the same box (reload pressed while still loading, or the keeper) used to BOTH add the pictures = every page twice. Only the newest call may touch the box.
    const tok = sec._fillTok = {}; sec._fillStart = Date.now();   // ROUND 52: the keeper uses _fillStart to spot a box that has been "loading" for too long
    // WHY: Get the chapter data. HOW: from R.chapters.
    const ch = R.chapters[i];
    // WHY: Clear old messages and pictures, free memory. HOW: remove old nodes and revoke blob addresses.
    $$('.ch-msg,.ch-end,img.page,.page-fail', sec).forEach(n => { if (n._blob) URL.revokeObjectURL(n._blob); n.remove(); });
    delete sec.dataset.failed; delete sec.dataset.verify;   // round 29d: not failed (yet): the keeper only retries boxes that carry this flag (round 29e: and not "waiting for the check" either)
    // WHY: Show a loading message. HOW: create a div.
    const wait = document.createElement('div'); wait.className = 'ch-msg';
    // WHY: Show a spinner and text. HOW: set innerHTML.
    wait.innerHTML = '<div class="spinner"></div>Loading ' + labelFor(i) + '…';
    // WHY: Put it in the box. HOW: appendChild.
    sec.appendChild(wait);
    // WHY: Warn when loading takes too long. HOW: watch() with a 75 second limit and a detail report; returns a stop
    // function.
    const stopWatch = watch('Loading ' + labelFor(i), 75000, () => 'Chapter address: ' + ch.url + '\nChapters in the list: ' + R.chapters.length + '\nProxies: ' + settings.proxies.map(proxyName).join(', '));   // round 11: tell me when it takes too long
    // WHY: Network can fail. HOW: try/catch/finally.
    try {
      // ROUND 29e. WHY: when this site asked for the human check a moment ago, asking again for every chapter would only hammer it. HOW: within 20 s of the last "check" answer the chapter
      //   waits at once without a request (humanRetryHost starts it again when the person is back). After 20 s one chapter is allowed to ask again. IMPROVE: make the 20 s a setting.
      { const hr = humanHosts.get(hostOf(ch.url)); if (hr && Date.now() - (hr.at || 0) < 20000) throw new Error(HUMAN_MSG); }
      // WHY: Download the chapter page. HOW: fetchDoc gives doc and base.
      const { doc, base } = await fetchDoc(ch.url);
      // WHY: Stop if the user moved on. HOW: compare gen.
      if (gen !== R.gen || sec._fillTok !== tok) return;                      // user jumped elsewhere meanwhile
      // WHY: Find the pictures. HOW: chapterPictures (round 28) reads the page, counts the empty picture slots and completes the list when that is honestly possible (the page text, the
      // scripts, numbered pictures next to the first one; never for a page the site has sealed on purpose). Round 10's numbered-preview way is inside it.
      const found = await chapterPictures(doc, base, ch.url);
      // WHY: the checks above can take several seconds (they ask for pictures). HOW: stop if the person jumped elsewhere meanwhile.
      if (gen !== R.gen || sec._fillTok !== tok) return;
      const imgs = found.list;
      // WHY: Explain the failure. HOW: throw noImagesError.
      if (!imgs.length) {
        // ROUND 45: when the site sent ANOTHER series' page, ask once more with a harmless cache-buster (a stale/wrong cached answer is the usual cause) before giving up.
        if (sentOtherPage(doc, base, ch.url)) {
          try {
            const again = await fetchDoc(ch.url + (ch.url.includes('?') ? '&' : '?') + 'mf=' + Date.now());
            if (gen !== R.gen || sec._fillTok !== tok) return;
            if (!sentOtherPage(again.doc, again.base, ch.url)) { const f2 = await chapterPictures(again.doc, again.base, ch.url); if (f2.list.length) { Object.assign(found, f2); imgs.push(...f2.list); } }
          } catch { /* the first answer stays */ }
        }
        if (!imgs.length) throw noImagesError(doc, base, found.rejected, ch.url);   // says WHY (locked / removed / script-built / main page / wrong page instead) and carries a report
      }   // says WHY (locked / removed / script-built / main page instead; round 30) and carries a report
      // WHY: PDF download needs them. HOW: store on the box.
      sec._imgs = imgs;                               // remembered for the PDF download (original picture addresses)
      // List incomplete? The page's "Next" link adds the following chapter (only ever to the end of the list).
      // WHY: Extend an incomplete list. HOW: find the next link and the last chapter.
      const nx = findNextLink(doc, base, ch.url), last = R.chapters[R.chapters.length - 1];
      // WHY: Add only a truly newer chapter. HOW: number higher and not in list.
      if (nx && last && nx.num > last.num && !R.chapters.some(c => sameUrl(c.url, nx.url))) {
        // WHY: Add it and refresh. HOW: push, rebuild menu, hide the end message.
        R.chapters.push(nx); buildChapterMenu(); $('#theEnd').hidden = true;
      }
      // WHY: Remove the loading message. HOW: remove().
      wait.remove();
      // WHY: Add pictures in one step, which is faster. HOW: a document fragment.
      const frag = document.createDocumentFragment();
      // WHY: Create each picture. HOW: makeImg per address.
      imgs.forEach((src, k) => frag.appendChild(makeImg(src, k, ch.url)));
      // WHY: Show all at once. HOW: append the fragment.
      sec.appendChild(frag);
      // ROUND 28: tell the person plainly when only part of the chapter could be found (with Retry, Open on the site and Details buttons).
      if (found.partial) sec.appendChild(partialNote(found, doc, base, ch, i, sec));
      // WHY: Add an end marker. HOW: a div ch-end.
      const end = document.createElement('div'); end.className = 'ch-end';
      // WHY: Tell the end of a chapter. HOW: set text.
      end.textContent = 'End of ' + labelFor(i) + (i + 1 < R.chapters.length ? ' · next chapter follows' : '');
      // WHY: The last chapter explains itself. HOW: call addNoNextButton.
      if (i + 1 >= R.chapters.length) addNoNextButton(end, doc, base, ch, i);   // round 11: the last chapter explains itself and offers a report
      // WHY: Show the end marker. HOW: append.
      sec.appendChild(end);
      // WHY: Refresh the download bar. HOW: updateDlBar.
      updateDlBar();
    // WHY: Handle errors. HOW: catch.
    } catch (e) {
      // WHY: Ignore old sessions. HOW: compare gen.
      if (gen !== R.gen || sec._fillTok !== tok) return;
      // ROUND 29e: the site wants the person to pass a human check. WHY: this is NOT a failure the keeper may retry (that would hammer the site); the person is the one who can fix it.
      //   HOW: the box gets data-verify (the keeper skips it), the loading line goes, and a box with "Open the site" / "I did it - try again" takes its place. No red pop-up. IMPROVE: none needed.
      if (isHumanCheck(e.message)) { sec.dataset.verify = '1'; wait.remove(); sec.appendChild(verifyNote(sec, i, ch)); return; }
      // ROUND 29d: mark the box as failed so the keeper loads it again by itself (with growing waits); a chapter the person skipped or that was removed is not retried.
      // ROUND 30: ... but only when trying again can help. WHY: a chapter that is locked, removed, answered with the main page or has no pictures (those errors carry a report in e.details) gives the same
      //   answer every time; the keeper would ask the site again and again for ever. HOW: such errors are "permanent": no failed flag, no "keeps trying" line, an "Open on the site" link instead.
      const permanent = !!e.details || /HTTP 404|HTTP 410|LOCKED|MAIN PAGE/i.test(e.message);
      if (!permanent) sec.dataset.failed = '1';
      // WHY: Reuse the message box for errors. HOW: set class.
      wait.className = 'ch-msg';
      // WHY: Clear the spinner. HOW: empty html.
      wait.innerHTML = '';
      // WHY: Show the error text. HOW: append text.
      wait.append('Could not load ' + labelFor(i) + ': ' + e.message);
      // WHY: Blocked sites get one pop-up. HOW: match status codes then reportBlocked.
      if (/bot check|HTTP 40[13]|HTTP 429|HTTP 503/i.test(e.message)) reportBlocked(ch.url, e.message);   // round 8: one big pop-up per site
      // ROUND 9: a chapter we only GUESSED (chapter-3 from chapter-5) that does not exist is not an error: drop it quietly.
      // WHY: A guessed chapter missing is normal. HOW: if guess and not found.
      if (ch.guess && /HTTP 404|HTTP 410|no images found|not found/i.test(e.message)) {
        // WHY: Remove it quietly. HOW: mark dead, remove, rebuild menu and bar.
        ch.dead = true; removeSection(sec); buildChapterMenu(); updateDlBar();
        // WHY: Tell once. HOW: flag and toast.
        if (!R.deadToast) { R.deadToast = true; toast('Some earlier chapters do not exist on this site and were skipped'); }
        // WHY: Stop. HOW: return.
        return;
      }
      // ROUND 9: the first "no pictures" problem of a site gets the big pop-up (with the report), the rest stay small.
      // ROUND 10: EVERY kind of chapter failure gets the big pop-up with a report (once per site and kind, so a bad site cannot flood you).
      // WHY: Show a big pop-up once per site and error. HOW: skip blocks, check noImgSeen set.
      if (!/bot check|HTTP 40[13]|HTTP 429|HTTP 503/i.test(e.message) && !noImgSeen.has(hostOf(ch.url) + '|' + e.message.slice(0, 40))) {
        // WHY: Remember it. HOW: add key to the set.
        noImgSeen.add(hostOf(ch.url) + '|' + e.message.slice(0, 40));
        // WHY: Show a report. HOW: showError with details.
        showError('Could not load ' + labelFor(i) + ': ' + e.message, { details: (e.details || '') + '\nChapter address: ' + ch.url + '\nChapters in the list: ' + R.chapters.length });
      }
      // WHY: Buttons row. HOW: a div.
      const row = document.createElement('div'); row.className = 'row';
      // WHY: Retry button. HOW: create.
      const retry = document.createElement('button'); retry.textContent = 'Retry';
      // WHY: Skip button. HOW: create.
      const skip = document.createElement('button'); skip.textContent = 'Skip';
      // Other chapters of the batch keep loading, so a failure no longer stops everything (round 6).
      // WHY: Retry loads again. HOW: delete from cache, call fillChapter.
      retry.onclick = () => { cache.delete(ch.url); fillChapter(sec, i, R.gen); };
      // WHY: Skip removes the box. HOW: remove and update bar.
      skip.onclick = () => { sec.remove(); updateDlBar(); };
      // WHY: Add buttons. HOW: append.
      row.append(retry, skip);
      // WHY: Details button if a report exists. HOW: create, show on click.
      if (e.details) { const dt = document.createElement('button'); dt.textContent = 'Details'; dt.onclick = () => showError(e.message, { details: e.details }); row.append(dt); }
      // WHY: Show the row. HOW: append.
      wait.appendChild(row);
      // ROUND 29d: say that nobody has to press Retry. HOW: one small line under the buttons. IMPROVE: show a countdown.
      const keepNote = document.createElement('p'); keepNote.className = 'muted small';
      if (permanent) {                                              // round 30: nothing to wait for - say so and offer the site itself
        keepNote.textContent = 'Trying again will not change this. If you can read the chapter on the site, open it there.';
        const site = document.createElement('a'); site.href = ch.url; site.target = '_blank'; site.rel = 'noopener noreferrer'; site.textContent = 'Open on the site'; row.appendChild(site);
      } else keepNote.textContent = 'MangaFlow keeps trying again by itself in the background.';
      wait.appendChild(keepNote);
    // WHY: Stop the timer. HOW: finally.
    } finally { stopWatch(); if (sec._fillTok === tok) sec._fillStart = 0; }
  }

  /* Image element (round 8: more ways to load, and a visible Retry).
     WHY: lazy loading saves data; no-referrer avoids hotlink blocks. Some picture hosts only answer when the
          request looks like it comes from the manga site (they check the "Referer"). The browser cannot send that
          itself, but YOUR proxy (worker.js) can: it gets &ref=<chapter address>.
     HOW: when the picture fails to load, these are tried in order, each only after the one before failed:
            1. your own / local proxy, with the chapter address as referer (the answer becomes a blob: address),
            2. the public image proxy images.weserv.nl.
          If all fail, the picture is replaced by a clear box: "Page N could not be loaded" with Retry and
          "Open picture" (the plain link) - never an empty grey space.
     IMPROVE: show which step worked, and remember hosts that always need the proxy so the first try is skipped. */
  // WHY: Create one picture. HOW: see the comment above; src is the address, k the page index, ref the chapter address.
  function makeImg(src, k, ref) {
    // WHY: The element. HOW: create img.
    const img = document.createElement('img');
    // WHY: Style and text for blind users. HOW: class and alt.
    img.className = 'page'; img.alt = 'Page ' + (k + 1);
    img._done = false; img._failed = false; img._healN = 0;     // round 29d: the keeper reads these flags (see the KEEPER block below)
    // WHY: Save data and avoid blocks. HOW: lazy, async decoding, no referrer.
    img.loading = 'lazy'; img.decoding = 'async'; img.referrerPolicy = 'no-referrer';
    // WHY: Find your own proxy. HOW: first non-default one.
    const own = proxyList(false).find(p => !DEFAULT_PROXIES.includes(p));
    // WHY: Fallback list. HOW: array of try functions.
    const attempts = [];
    // WHY: Some picture hosts block direct loading, so if the user has their own proxy we add it as a fallback try. HOW: It
    // builds the proxy address, fetches the picture as a blob (file-like data), rejects tiny answers, then shows it via a
    // temporary blob address. IMPROVE: Revoke the old blob in one shared helper.
    if (own) attempts.push(async () => {
      const full = own.replace('{url}', encodeURIComponent(src)) + (ref ? '&ref=' + encodeURIComponent(ref) : '');
      const res = await fetch(full, { referrerPolicy: 'no-referrer', credentials: 'omit' });
      // WHY: treat any non-200 answer as a failure so the retry logic runs. HOW: throw an Error with the status number.
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const blob = await res.blob();
      if (blob.size < 200) throw new Error('not a picture');
      // WHY: free the memory of a picture that was loaded as a blob. HOW: revokeObjectURL tells the browser it may delete it.
      if (img._blob) URL.revokeObjectURL(img._blob);
      img._blob = URL.createObjectURL(blob); img.src = img._blob;
    });
    // WHY: Last-resort fallback for a picture that will not load. HOW: Adds one more try that points the image at the free
    // images.weserv.nl proxy. IMPROVE: Make the list of fallback services editable in Settings.
    attempts.push(async () => { img.src = 'https://images.weserv.nl/?url=' + encodeURIComponent(src.replace(/^https?:\/\//, '')); });
    // WHY: Counts how many fallback tries were used so far. HOW: n is the index of the next try in the attempts list; fail
    // shows the error box once all tries are used. IMPROVE: Give the counter a clearer name like attemptIndex.
    let n = 0;
    // WHY: Runs when every way of loading a picture has failed, so the reader sees a clear problem box instead of an empty
    // gap. HOW: First it reports the failure, then it builds a box with text and buttons. IMPROVE: Move this box-building
    // into its own function.
    // ROUND 29d: the SAME reload is used by the Retry button and by the keeper. WHY: one way to start again, so the two can never differ. HOW: remove the red box, forget the used tries (n = 0),
    //   show the picture again and ask for it with ?r=<time> so the browser does not answer from its cache of the failure. IMPROVE: none needed.
    img._reload = () => {
      if (img._box) { img._box.remove(); img._box = null; }
      n = 0; img._failed = false; img._healing = true; img.hidden = false; img.loading = 'eager'; img._eagerAt = Date.now();
      img.src = src + (src.includes('?') ? '&' : '?') + 'r=' + Date.now();
    };
    const fail = () => {
      // ROUND 29d: a picture that failed is NOT reported at once any more: the keeper tries again by itself (4 s, 8 s, 16 s ... up to 90 s). Only a picture that failed again after
      // two such retries counts for the "Several pictures are not loading" report (noteFail, round 11), so a short internet hiccup never opens a pop-up.
      img._failed = true; img._failedAt = Date.now(); img._healing = false; img._healAt = img._failedAt + healWait(img._healN);
      if (img._healN === 2) noteFail(src, k, ref);
      const box = document.createElement('div'); box.className = 'page-fail'; img._box = box;
      // WHY: tell the reader a picture is missing. HOW: append a plain message into the chapter box.
      box.append('Page ' + (k + 1) + ' could not be loaded. MangaFlow keeps trying by itself.');
      // WHY: A row to hold the three action buttons. HOW: Creates a div with class row, then a Retry button. Clicking Retry
      // removes the box, resets the counter and loads the picture again with r=time added so the browser skips its cache.
      // IMPROVE: Retry through the proxies too.
      const row = document.createElement('div'); row.className = 'row';
      const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = 'Retry';
      retry.onclick = () => { img._healN = 0; img._reload(); };                // round 29d: shared with the keeper
      // WHY: Lets the user open the broken picture in a new tab. HOW: Makes a link to the picture address; noopener noreferrer
      // stops the new tab from controlling this page. IMPROVE: Add a copy-link button.
      const a = document.createElement('a'); a.href = src; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = 'Open picture';
      // WHY: Gives the user technical info to report a problem. HOW: The Details button opens an error dialog with the picture
      // address, chapter address and what was tried. IMPROVE: Add a copy button for the details text.
      const dt = document.createElement('button'); dt.type = 'button'; dt.textContent = 'Details';
      dt.onclick = () => showError('Page ' + (k + 1) + ' could not be loaded', { details: 'Picture address: ' + src + '\nChapter address: ' + (ref || '-') + '\nTried: the picture directly, your own proxy with the chapter as referer (if you have one), images.weserv.nl.' });
      // WHY: Finish the box and show it. HOW: Puts the buttons in the row and the row in the box, hides the broken image and
      // puts the box right after it. IMPROVE: Keep the image hidden with a CSS class instead of the hidden flag.
      row.append(retry, a, dt); box.appendChild(row);
      img.hidden = true; img.after(box);
    };
    // WHY: When a picture finishes loading, remove the grey placeholder look and keep the page steady. HOW: Remember the
    // height, add class loaded, and in browsers without scroll anchoring scroll by the height change if the picture is above
    // the screen. IMPROVE: Reserve the height using the picture width and height.
    img.onload = () => {
      img._done = true; img._failed = false; img._healing = false;                // round 29d: the keeper sees this picture is fine now
      const h0 = img.offsetHeight;                                           // height with the grey placeholder
      img.classList.add('loaded');
      if (!ANCHOR_OK && img.getBoundingClientRect().bottom <= 0) window.scrollBy(0, img.offsetHeight - h0);   // keep the view still
    };
    // WHY: Picture errors should walk through the fallback tries before giving up. HOW: If no tries are left, show the fail
    // box; otherwise run the next try, and if that try throws an error, call onerror again for the next one. IMPROVE: Add a
    // small delay between tries.
    img.onerror = async () => {
      if (n >= attempts.length) return fail();
      const step = attempts[n++];
      // WHY: if the step itself throws, handle it like a failed picture. HOW: call the image's own error handler.
      try { await step(); } catch { img.onerror(); }
    };
    // WHY: Starts the real loading. HOW: Setting img.src makes the browser fetch the direct address first; returns the image
    // element to the caller. IMPROVE: Add loading=lazy to save data on far pictures.
    img.src = src;
    return img;
  }

  /* ---------------------------------------------------------------
     9b. THE KEEPER  (round 29d) - keeps the next chapters ready and heals failed pictures / chapters by itself
     WHY: the owner: "when the internet fluctuates some pages do not load and I have to refresh or press Retry. I want the missing pages (of the chapter I read, the 2nd, the 4th ...)
          to keep loading in the background by themselves, and the next nine chapters to be preloaded."
     HOW: ONE small timer (every 1.5 s, only while you are in reading mode, the tab is visible and the device is online) looks at the chapters on the page and does at most this:
          A. KEEP READY - the chapter boxes are loaded up to (the chapter you read + preloadAhead); loadNext() makes the boxes, fillChapter() fills them.
          B. HEAL CHAPTERS - a box that failed (data-failed="1", set by fillChapter) is loaded again, ONE at a time, nearest to you first. Waiting time before each new try:
             healBaseMs (4 s), 8 s, 16 s ... up to 90 s (+-15 % so many boxes do not retry at the same second). It never stops while the box is on the page.
          C. HEAL PICTURES - a picture that ran out of ways to load (img._failed, the red "Page N could not be loaded" box) is reloaded with img._reload(), at most 3 at a time,
             nearest first, with the same growing waits; a picture that is "loading" for more than 45 s (a stalled connection never sends an error) is reloaded too.
          D. PRELOAD PICTURES - pictures are lazy (the browser loads them near the screen). The keeper switches the pictures of the chapters in the window (you .. you + preloadAhead)
             to eager, nearest first, at most 4 loading at the same time (3 on a phone-sized screen), so the next chapters are really in the cache when you get there.
          The keeper also wakes up at once when the internet comes back ("online") or the tab becomes visible again (it forgets the waiting times).
     LIMITS: it keeps the data use in mind: with the browser's "data saver" it keeps only 1 chapter ready, with a device that reports 2 GB memory or less only 3. Setting preloadAhead = 0 (Settings >
          Reading > "Keep the next chapters ready") switches D and A off, healing (B, C) always stays on. It never works around a site's protection: a chapter that says "verify you are human"
          (round 29e) is not retried until the person has verified. It does nothing in the start page or the mini browser.
     IMPROVE: show a small "N pictures still loading" indicator; learn which picture hosts need the proxy first; pause while a PDF download is running on a very slow line. */
  // WHY: the waiting time before try number n. HOW: base * 2^n, never more than 90 s, with a little randomness. IMPROVE: none needed.
  function healBase() { const b = +settings.healBaseMs; return b >= 100 ? b : 4000; }
  function healWait(n) { return Math.min(90000, healBase() * Math.pow(2, Math.min(n || 0, 5))) * (0.85 + Math.random() * 0.3); }
  // WHY: how many chapters to keep ready. HOW: the setting, lowered for data saver / small devices; 0 = off. IMPROVE: use the measured speed too.
  function keeperAhead() {
    let n = settings.preloadAhead; n = (typeof n === 'number' && n >= 0) ? Math.min(Math.floor(n), 15) : 9;
    try { const c = navigator.connection; if (c && c.saveData) n = Math.min(n, 1); if (navigator.deviceMemory && navigator.deviceMemory <= 2) n = Math.min(n, 3); } catch { /* the browser does not tell: keep the setting */ }
    return n;
  }
  const keeper = { healedPics: 0, healedCh: 0, busyCh: 0, last: '' };
  // WHY: the keeper only works while reading, in a visible tab, with a network. HOW: four plain checks. IMPROVE: none needed.
  const keeperOn = () => document.body.classList.contains('reading') && !reader.hidden && !document.hidden && navigator.onLine !== false && !R.paused;
  function keeperTick() {
    try {
      if (!keeperOn()) return;
      const now = Date.now(), cur = R.cur, ahead = keeperAhead(), small = window.innerWidth <= 700;
      const secs = $$('.chapter', stream), dist = sec => Math.abs((+sec.dataset.index) - cur);
      // A. keep the chapter boxes ready up to cur + ahead (loadNext makes 10 boxes at a time and shares a running batch)
      if (ahead > 0 && !R.loading && R.next < R.chapters.length && R.next - 1 < cur + ahead) loadNext();
      // B. heal one failed chapter box (the nearest whose waiting time is over)
      if (keeper.busyCh < 1) {
        const bad = secs.filter(x => x.dataset.failed === '1' && !x.dataset.verify && now >= (x._healAt || 0)).sort((a, b) => dist(a) - dist(b))[0];
        const ch = bad && R.chapters[+bad.dataset.index];
        if (bad && ch) {
          bad._healN = (bad._healN || 0) + 1; bad._healAt = now + healWait(bad._healN); keeper.busyCh++; cache.delete(ch.url);
          fillChapter(bad, +bad.dataset.index, R.gen).catch(() => {}).finally(() => { keeper.busyCh--; if (bad.isConnected && bad.dataset.failed !== '1') keeper.healedCh++; });
        }
      }
      // ROUND 52 — CHAPTER BOXES THAT ARE NEITHER LOADED NOR FAILED (reported: "chapters 4 and 5 are missing until I reload from the site").
      // WHY: the keeper above only healed boxes that carry data-failed. A box that ended up EMPTY (a fill that was replaced and never restarted, a message that was wiped) or STUCK on its
      //   spinner (an answer that never came, over 100 s) carried no flag, so nobody ever retried it; only a manual reload helped. HOW: an empty box seen empty for 20 s, or a spinner older
      //   than 100 s, is flagged data-failed; step B then refills it like any failed chapter (growing waits; fillChapter's token makes sure only the newest fill touches the box).
      //   IMPROVE: show the reason in the box ("waiting for the site").
      secs.forEach(x => {
        if (x.dataset.failed === '1' || x.dataset.verify) { x._emptyAt = 0; return; }
        const hasPics = x.querySelector('img.page, .page-fail'), hasMsg = x.querySelector('.ch-msg');
        if (x._fillStart && now - x._fillStart > 100000) { x.dataset.failed = '1'; x._healAt = 0; x._emptyAt = 0; return; }
        if (!x._fillStart && !hasPics && !hasMsg) { if (!x._emptyAt) x._emptyAt = now; else if (now - x._emptyAt > 20000) { x.dataset.failed = '1'; x._healAt = 0; x._emptyAt = 0; } } else x._emptyAt = 0;
      });
      const imgs = secs.flatMap(x => $$('img.page', x));
      // C. heal pictures: failed ones whose waiting time is over (3 at a time), and stalled ones (loading for more than 45 s)
      let busy = imgs.filter(i => i._healing).length;
      imgs.filter(i => i._failed && now >= (i._healAt || 0)).sort((a, b) => dist(a.closest('.chapter')) - dist(b.closest('.chapter'))).forEach(i => { if (busy >= 3 || !i._reload) return; i._healN++; busy++; keeper.healedPics++; i._reload(); });
      imgs.filter(i => i._eagerAt && !i._done && !i._failed && !i._healing && now - i._eagerAt > 45000).forEach(i => { if (busy >= 3 || !i._reload) return; i._healN++; busy++; i._reload(); });
      // D. preload: switch the lazy pictures of the window to eager, nearest first, a few at a time
      if (ahead > 0) {
        let pending = imgs.filter(i => i._eagerAt && !i._done && !i._failed).length; const limit = small ? 3 : 4;
        secs.filter(x => { const k = +x.dataset.index; return k >= cur && k <= cur + ahead; }).sort((a, b) => a.dataset.index - b.dataset.index).forEach(x => {
          $$('img.page', x).forEach(i => { if (pending >= limit || i.loading !== 'lazy' || i._done || i._failed || i._healing) return; i.loading = 'eager'; i._eagerAt = now; pending++; });
        });
      }
      keeper.last = 'ahead ' + ahead + ', pictures retried ' + keeper.healedPics + ', chapters healed ' + keeper.healedCh + ', waiting pictures ' + imgs.filter(i => i._failed).length + ', waiting chapters ' + secs.filter(x => x.dataset.failed === '1').length;
    } catch { /* the keeper must never break reading */ }
  }
  // WHY: after the internet returns or the tab comes back, do not wait for the old (long) waiting times. HOW: forget them and run a tick now. IMPROVE: none needed.
  function keeperPoke() { try { $$('#stream img.page').forEach(i => { if (i._failed) i._healAt = 0; }); $$('#stream .chapter').forEach(x => { x._healAt = 0; }); } catch { /* ignore */ } keeperTick(); }
  setInterval(keeperTick, 1500);
  window.addEventListener('online', keeperPoke);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) keeperPoke(); });

  /* ---------------------------------------------------------------
     10. CHAPTER NAVIGATION (dropdown list, prev/next, home/end)
     WHY: goChapter scrolls to a chapter that is already loaded, loads it if it is the next one,
          or restarts the stream from it (jumpTo) when it is far away.
     HOW: markInput() tells the scroll code "this scrolling was on purpose" (see section 11).
     IMPROVE: when jumping far, keep earlier chapters collapsed above so scrolling up still works. */
  // WHY: Builds the list of chapters shown in the dropdown menu. HOW: Clears the list, then for each chapter that is not
  // dead it makes a li with a button showing its label and short title; clicking closes the menu and jumps to it. IMPROVE:
  // Build with a document fragment for speed on huge lists.
  function buildChapterMenu() {
    const ul = $('#chapterList'); ul.innerHTML = '';
    R.chapters.forEach((c, i) => {
      if (c.dead) return;                                                // a guessed chapter that does not exist
      // WHY: build one chapter menu row. HOW: create a list item and a button with createElement (safe against HTML in
      // titles).
      const li = document.createElement('li'), b = document.createElement('button');
      b.textContent = labelFor(i) + (c.title && c.title.length < 60 && !isPlainTitle(c.title) ? ' — ' + c.title : '');
      b.dataset.index = i;
      // WHY: a click on a chapter in the menu opens it. HOW: close the menu, then jump (or load) that chapter.
      b.onclick = () => { closeMenu(); jumpOrGo(i); };
      li.appendChild(b); ul.appendChild(li);
    });
  }
  // WHY: Opens or closes the chapter menu. HOW: Flips the hidden flag; when it opens it marks the current chapter and
  // scrolls the list to centre it. IMPROVE: Close the menu when the user taps outside it.
  function toggleMenu() {
    const m = $('#chapterMenu'); m.hidden = !m.hidden;
    if (!m.hidden) { markCurrent(); const c = $('#chapterList button.current'); if (c) c.scrollIntoView({ block: 'center' }); }
  }
  // WHY: A short helper to close the chapter menu. HOW: An arrow function that sets hidden to true. IMPROVE: Also return
  // focus to the menu button for keyboard users.
  const closeMenu = () => { $('#chapterMenu').hidden = true; };
  // WHY: Highlights which chapter you are reading in the menu. HOW: For every menu button, adds class current only if its
  // index equals R.cur (the current chapter). IMPROVE: Also set aria-current for screen readers.
  function markCurrent() { $$('#chapterList button').forEach(b => b.classList.toggle('current', +b.dataset.index === R.cur)); }

  // WHY lastInput = 0: a jump with the chapter keys is a big scroll that is NOT the person "reading downwards",
  // so it must not hide the keys / title bar (otherwise you could not press the key a second time).
  // WHY: Used when the wanted chapter is far away, so we start the stream again from it. HOW: Holds the UI keys visible,
  // bumps R.gen (a version number that cancels old loads), resets the state, empties the page, scrolls to top and loads.
  // IMPROVE: Keep a few chapters above for scrolling up.
  async function jumpTo(i) {                         // restart the stream at chapter i
    holdUiFor(2500);
    R.gen++; R.first = i; R.next = i; R.cur = i; R.loading = false; R.paused = false;
    // WHY: start from a clean reading area. HOW: empty the stream, hide the end banner and refresh the bars.
    stream.innerHTML = ''; $('#theEnd').hidden = true; updateDlBar(); updatePrevBar();
    window.scrollTo(0, 0); lastY = 0;
    await loadNext();
  }
  // WHY: Scrolls to chapter i, loading it first if needed. HOW: Shows a toast at the ends, then looks for the chapter box
  // (secFor); if it is just above it loads it, if it is next it waits for loadNext, and if it still is missing it calls
  // jumpTo. IMPROVE: Smooth-scroll the move.
  async function goChapter(i) {
    if (i < 0) return toast('This is the first chapter');
    if (i >= R.chapters.length) return toast('No more chapters');
    // WHY: keep the controls visible for a moment after a jump. HOW: holdUiFor(ms) blocks auto-hide.
    holdUiFor(2500);
    let s = secFor(i);
    if (!s && i < R.first && R.first - i <= 2 * BATCH_PREV) { loadPrev(R.first - i); s = secFor(i); }   // round 9: an earlier chapter, added above
    if (!s && i >= R.next) { await loadNext(); s = secFor(i); }     // wait for the running batch, then scroll
    // WHY: if that chapter is not loaded yet, load it. HOW: jumpTo() fetches it and scrolls there.
    if (!s) return jumpTo(i);
    s.scrollIntoView({ block: 'start' });
  }
  // WHY: Chooses the cheap way (scroll) or the big way (restart) to reach a chapter. HOW: If the box exists, or is the
  // next one, or is a few chapters above, it uses goChapter; else jumpTo. IMPROVE: Give the distance limit a named
  // constant.
  const jumpOrGo = i => (secFor(i) || i === R.next || (i < R.first && R.first - i <= 2 * BATCH_PREV)) ? goChapter(i) : jumpTo(i);

  /* END (round 8): jump to the very bottom of everything that is loaded.
     WHY: with hundreds of chapters, dragging the scrollbar is slow. Pressing the round "end" key, or the real End key
          on the keyboard, goes straight to the bottom (the download bar). The bottom is near the loader, so the next
          10 chapters begin loading by themselves and the page grows below you.
     HOW: scroll to the full page height. lastInput = 0 (for the on-screen key AND the real End key), so the keys do
          not hide themselves and you can press again, or press Download, at once. */
  // WHY: Lets the user reach the bottom of the loaded chapters quickly. HOW: Keeps the keys visible, then scrolls to the
  // full page height, which also triggers loading of more chapters. IMPROVE: Jump to the true last chapter on short
  // series.
  function goEnd() {
    holdUiFor(2500);                        // a jump is not "reading downwards": keep the keys visible (also for the real End key)
    window.scrollTo({ top: document.documentElement.scrollHeight });
  }

  /* ---------------------------------------------------------------
     9b. READING UPWARDS: EARLIER CHAPTERS  (round 9)
     WHY: when you open the link of chapter 5, reading starts at chapter 5. Before, chapters 1 to 4 could not be reached by
          scrolling up (the page only ever grew downwards), so you could only go forward.
     HOW: R.first is the number of the first chapter that is on the page. loadPrev() builds the boxes of the chapters
          before it (5 at a time), puts them ABOVE the first one (stream.insertBefore) and then scrolls by exactly the
          height that was added, so the picture you are looking at does not move. They start loading at once.
          It is triggered by: scrolling up near the top, the mouse wheel / a finger drag / the Up, PageUp and Home keys at
          the very top (the page cannot scroll there, so no scroll event comes), the "Load earlier chapters" button, and
          the up round key / Left arrow when the chapter before the first one is wanted (goChapter).
     LIMITS: a browser without "scroll anchoring" (old Safari) is helped by keepView() and makeImg(), which scroll by hand when a
             box ABOVE the screen changes height.
     IMPROVE: also remove far-away chapters at the bottom when many earlier ones are loaded (see Free memory). */
  // WHY: One shared number for how many earlier chapters load at a time. HOW: A constant used by loadPrev and the jump
  // logic. IMPROVE: Make it a user setting.
  const BATCH_PREV = 5;                                               // how many earlier chapters one load adds
  // WHY: Some browsers keep your view still when content above changes (scroll anchoring); this checks that. HOW:
  // CSS.supports asks the browser; if that fails we say false. IMPROVE: Test it once in a real layout instead of by name.
  const ANCHOR_OK = (() => { try { return CSS.supports('overflow-anchor', 'auto'); } catch { return false; } })();   // browser keeps the view still itself?
  // WHY: Remember which sites already showed the no pictures found message so it appears only once. HOW: A Set is a list
  // of unique values. IMPROVE: Save it in session storage.
  const noImgSeen = new Set();                                        // sites that already got the "no pictures found" pop-up

  // Text above the stream: is there anything earlier, and which chapter would come next.
  // WHY: Updates the text above the chapters about earlier chapters. HOW: R.first is the first loaded chapter; if it is
  // above 0 the Load earlier button is enabled and the text names the chapter before it, else it says this is the first
  // chapter. IMPROVE: Show how many earlier chapters remain.
  function updatePrevBar() {
    const has = R.first > 0;
    $('#btnPrevLoad').disabled = !has;                                // CSS hides a disabled button, the text stays
    // WHY: tell the reader how many chapters are above. HOW: builds the text from the first loaded chapter number.
    $('#prevInfo').textContent = has ? labelFor(R.first - 1) + ' and earlier are above · scroll up or tap the button'
      : (R.chapters.length ? '— This is the first chapter —' : '');
  }

  // Remove one chapter box (a guessed chapter that does not exist) without moving the page when it is above the screen.
  // WHY: Removes a chapter box that does not exist without the page jumping. HOW: If the box is above the screen in a
  // browser without anchoring, it measures its height, removes it, then scrolls back by that height. IMPROVE: Fade the box
  // out first.
  function removeSection(sec) {
    const above = !ANCHOR_OK && sec.getBoundingClientRect().bottom <= 0, h = sec.offsetHeight;
    sec.remove();
    // WHY: keep the picture the reader is looking at in place when content is added above. HOW: scrollBy moves the page by
    // the added height.
    if (above) window.scrollBy(0, -h);
  }

  /* Load up to `count` earlier chapters ABOVE the first one. The boxes are created at once (so callers can scroll to them
     right away); the returned promise finishes when their pages have been fetched. */
  // WHY: Adds earlier chapters above the first one so the reader can scroll upwards. HOW: Works out the range, sets
  // R.first at once so it cannot load twice, builds boxes into a fragment, inserts them before the top chapter, fixes the
  // scroll position, then fills them. IMPROVE: Show a loading spinner at the top.
  function loadPrev(count = BATCH_PREV) {
    if (reader.hidden || R.first <= 0) return Promise.resolve();
    const gen = R.gen, to = R.first, from = Math.max(0, to - Math.max(1, count));
    R.first = from;                                                   // set at once: a second trigger cannot load the same chapters twice
    const anchor = stream.querySelector('.chapter');                  // the chapter that is at the top right now
    // WHY: remember where a reference element is before content changes. HOW: read its top position now; compare after.
    const before = anchor ? anchor.getBoundingClientRect().top : 0;
    const frag = document.createDocumentFragment(), secs = [];
    for (let i = from; i < to; i++) { const s = makeSection(i, true); frag.appendChild(s); secs.push(s); }
    stream.insertBefore(frag, anchor);                                // earlier chapters go ABOVE the first one
    // Keep the page where it was. (Measured after the insert: if the browser already corrected the scroll itself this is ~0.)
    if (anchor) window.scrollBy(0, anchor.getBoundingClientRect().top - before);
    updatePrevBar();
    return Promise.all(secs.map(s => fillChapter(s, +s.dataset.index, gen)));
  }

  // Next / previous chapter that really exists (guessed chapters that turned out missing are skipped).
  // WHY: A tiny check that a chapter exists and is not marked dead. HOW: Looks it up in R.chapters and tests the dead
  // flag. IMPROVE: Return a real true or false value.
  const alive = i => R.chapters[i] && !R.chapters[i].dead;
  // WHY: Moves one chapter forward or back (dir is 1 or -1) and skips missing guessed chapters. HOW: Steps i in that
  // direction while the chapter is not alive, then calls goChapter. IMPROVE: Toast when no chapter is left in that
  // direction.
  function stepChapter(dir) {
    let i = R.cur + dir;
    while (i >= 0 && i < R.chapters.length && !alive(i)) i += dir;
    // WHY: continue to the chosen chapter. HOW: goChapter loads and scrolls to it.
    return goChapter(i);
  }

  /* RELOAD BUTTONS (round 6)
     WHY: a chapter can load half-broken (slow proxy, missing pictures). Instead of leaving reading mode,
          "reload" fetches the chapter again; "reload all" does the same for every open chapter.
     HOW: the chapter's saved page is dropped from the cache, the pictures are removed and fillChapter()
          builds them again. The box keeps its old height meanwhile (min-height), so the page does not jump.
     IMPROVE: reload only the pictures that failed, and show a count of how many were repaired. */
  // WHY: Fetches chapters again when they loaded half broken. HOW: Spins the button, keeps each box height so nothing
  // jumps, deletes cached pages, then refills the chapters BATCH at a time; finally resets the heights and button.
  // IMPROVE: Retry only the failed pictures.
  async function reloadSections(secs, btn) {
    if (!secs.length) return;
    if (btn) btn.classList.add('spin');
    // WHY: ignore late results of an older load. HOW: the generation number is compared again after every await.
    const gen = R.gen;
    secs.forEach(sec => { if (sec._cleared) { sec._cleared = false; $$('.ch-cleared', sec).forEach(n => { clearIO.unobserve(n); n.remove(); }); } sec.style.minHeight = sec.offsetHeight + 'px'; cache.delete(sec.dataset.url); });
    try {
      for (let k = 0; k < secs.length; k += BATCH)                      // up to BATCH chapters at the same time
        // WHY: load the next group of chapters at the same time. HOW: Promise.all waits for all of them; BATCH says how many.
        await Promise.all(secs.slice(k, k + BATCH).map(sec => fillChapter(sec, +sec.dataset.index, gen)));
    } finally {
      secs.forEach(sec => { sec.style.minHeight = ''; });
      if (btn) btn.classList.remove('spin');
      updateDlBar();
    }
  }
  // WHY: Handler for the reload one chapter button. HOW: Finds the box of the current chapter, shows a toast and reloads
  // just that box. IMPROVE: Do nothing quietly if no chapter is open.
  const reloadCurrent = () => { const sec = secFor(R.cur); if (sec) { toast('Reloading ' + labelFor(R.cur) + '…'); reloadSections([sec], null); } };
  /* ---------------------------------------------------------------
     10b. FREE MEMORY / CLEAR CHAPTER CACHE  (round 7)
     WHY: with 30-50 chapters open, thousands of big pictures sit in memory and the page gets slow and jumpy.
          Clearing a range of chapters throws their pictures away but keeps the empty box (same height), so
          your scroll position does not jump.
     HOW: freeSection() removes the pictures and puts a small notice in the box. The picture ADDRESSES stay in
          sec._imgs, so (1) when the box comes near the screen again restoreSection() rebuilds the pictures by
          itself (observer clearIO), and (2) a PDF download still knows the chapter.
          The chapter you are reading is never cleared. Optional automatic mode: settings.autoFree.
     WHERE: buttons live in the Settings dialog (index.html #memBox) and are wired in section 15;
            the reader bar has a gear button and the chapter menu a "Free memory" entry that open that dialog.
     IMPROVE: also drop far-away chapters that were never visited, show how many MB were freed. */
  // WHY: Watches the cleared-chapter notices so a chapter returns when you scroll near it. HOW: An IntersectionObserver
  // calls restoreSection when a notice comes within 1200px of the screen. IMPROVE: Make the distance depend on screen
  // height.
  const clearIO = new IntersectionObserver(es => {
    es.forEach(e => { if (e.isIntersecting) restoreSection(e.target.closest('.chapter')); });
  }, { rootMargin: '1200px' });

  // WHY: Frees memory by throwing away a chapter's pictures but keeping its place. HOW: Skips the chapter you read, keeps
  // the height, removes images (and their blob addresses), clears the cache, and adds a notice with a Load now button.
  // IMPROVE: Return how many pictures were freed.
  function freeSection(sec) {
    if (!sec || sec._cleared || !sec._imgs || +sec.dataset.index === R.cur) return false;
    sec.style.minHeight = sec.offsetHeight + 'px';                    // keep the height: no scroll jump
    // WHY: free memory of a chapter that is far away. HOW: remove its pictures and messages but keep the box so the scroll
    // position stays right.
    $$('img.page,.ch-end,.ch-msg,.page-fail', sec).forEach(n => { if (n.tagName === 'IMG') { n.removeAttribute('src'); if (n._blob) URL.revokeObjectURL(n._blob); } n.remove(); });
    cache.delete(sec.dataset.url);
    const ph = document.createElement('div'); ph.className = 'ch-cleared';
    // WHY: tell the person a far-away chapter was emptied to save memory. HOW: a placeholder text that says it comes back
    // when they scroll there.
    ph.append(labelFor(+sec.dataset.index) + ' was cleared to save memory. It comes back when you scroll here. ');
    const b = document.createElement('button'); b.textContent = 'Load now'; b.onclick = () => restoreSection(sec);
    ph.appendChild(b); sec.appendChild(ph);
    sec._cleared = true; clearIO.observe(ph);
    return true;
  }
  // WHY: Brings a cleared chapter back. HOW: Removes the notice, rebuilds every picture from the saved addresses in
  // sec._imgs, and adds the End of chapter line. IMPROVE: Rebuild only the pictures that are near the screen.
  function restoreSection(sec) {
    if (!sec || !sec._cleared) return;
    sec._cleared = false;
    // WHY: forget cleared-chapter markers. HOW: stop observing them, then remove them.
    $$('.ch-cleared', sec).forEach(n => { clearIO.unobserve(n); n.remove(); });
    const i = +sec.dataset.index, frag = document.createDocumentFragment();
    sec._imgs.forEach((src, k) => frag.appendChild(makeImg(src, k, sec.dataset.url)));
    // WHY: add the built pieces to the page in one go. HOW: a document fragment is appended once, which is faster than many
    // small additions.
    sec.appendChild(frag);
    const end = document.createElement('div'); end.className = 'ch-end';
    end.textContent = 'End of ' + labelFor(i) + (i + 1 < R.chapters.length ? ' · next chapter follows' : '');
    sec.appendChild(end);                                              // min-height stays, so nothing jumps
  }
  // WHY: Frees all chapters between index a and b. HOW: Loops over chapter boxes, frees those in range and counts how many
  // were freed. IMPROVE: Skip the chapters on screen.
  function clearRange(a, b) {
    let n = 0;
    $$('.chapter', stream).forEach(sec => { const i = +sec.dataset.index; if (i >= a && i <= b && freeSection(sec)) n++; });
    // WHY: return how many items were handled. HOW: n was counted above.
    return n;
  }
  // WHY: Updates the memory text in Settings. HOW: Counts open and cleared chapters, writes the message, and disables the
  // buttons when reading mode is closed (except the auto box). IMPROVE: Show an estimate of megabytes used.
  function memInfo() {
    const secs = $$('.chapter', stream), open = secs.filter(x => x._imgs && !x._cleared).length;
    $('#memInfo').textContent = reader.hidden
      // WHY: tell the person why the button does nothing yet. HOW: a text shown as the button's hint.
      ? 'Open reading mode first. This clears chapters you have opened there.'
      : open + ' chapter' + (open === 1 ? '' : 's') + ' in memory · ' + secs.filter(x => x._cleared).length + ' cleared';
    $$('#memBox button, #memBox select').forEach(el => { if (el.id !== 'memAuto') el.disabled = reader.hidden; });
  }
  // WHY: Fills the From and To drop-downs in the memory settings. HOW: For both selects, clears them and adds an option
  // per chapter, then preselects from the first open chapter up to the one before the current. IMPROVE: Only list chapters
  // that are open.
  function fillMemSelects() {
    [$('#memFrom'), $('#memTo')].forEach(sel => {
      sel.innerHTML = '';
      // WHY: fill the chapter drop-down. HOW: one <option> per chapter, value = its index.
      R.chapters.forEach((c, i) => { const o = document.createElement('option'); o.value = i; o.textContent = labelFor(i); sel.appendChild(o); });
    });
    const open = $$('.chapter', stream).map(x => +x.dataset.index);
    // WHY: preset the 'free memory' range to the chapters that are open. HOW: smallest and largest open chapter numbers go
    // into the two selects.
    if (open.length) { $('#memFrom').value = Math.min(...open); $('#memTo').value = Math.max(R.cur - 1, Math.min(...open)); }
  }
  // WHY: Optional automatic memory saving. HOW: If the setting is on, frees every chapter more than that many chapters
  // behind the current one. Called on scrolling. IMPROVE: Run it only when the current chapter changes.
  function autoFree() {                                                // called while scrolling (updateCurrent)
    if (!settings.autoFree) return;
    $$('.chapter', stream).forEach(sec => { if (+sec.dataset.index < R.cur - settings.autoFree) freeSection(sec); });
  }

  // WHY: Handler for the reload all button. HOW: Collects all chapter boxes, shows a toast with the count, and reloads
  // them. IMPROVE: Ask for a confirm when there are many chapters.
  const reloadEvery = () => { const secs = $$('.chapter', stream); toast('Reloading ' + secs.length + ' chapter' + (secs.length === 1 ? '' : 's') + '…'); reloadSections(secs, null); };

  /* ---------------------------------------------------------------
     11. SCROLL TRACKING + AUTO-HIDING UI  (changed in round 2)
     WHY: the title bar and the arrow keys cover the art, so they hide while you read downwards.
          NEW RULE: they come back ONLY when you scroll UP (mouse wheel up, finger drag down, Up / PageUp / Home key,
          scrollbar drag up) or when you reach the very top. They no longer come back by themselves after a pause.
     HOW: on every scroll event we compare the new position with the last one.
          Down more than 14 px in a row  -> hide.   Up more than 14 px in a row -> show.
          The 14 px "dead zone" stops tiny finger wobbles from flickering the buttons.
          lastInput remembers when the PERSON last used wheel / touch / keyboard / scrollbar. Scroll events that
          happen long after that (pictures loading and moving the page) are ignored, so they cannot hide or show
          the buttons by accident.
     WHERE: onScroll() runs on every scroll event; showUi/hideUi toggle body.scrolling, which style.css uses to fade .ui-hide items
            (title bar buttons and the #side key block). goChapter/jumpTo set lastInput = 0 so key jumps do not hide the keys.
     IMPROVE: make the 14 px and 1.5 s numbers settings; add a small "show buttons" handle at the screen edge. */
  // WHY: Variables the scroll code needs to remember between events. HOW: lastY is the last scroll position; upAcc and
  // downAcc add up small moves; lastInput is the time of the last real user input; holdUi blocks hiding for a moment;
  // saveTimer and ticking limit work. IMPROVE: Group them in one object.
  let lastY = 0, upAcc = 0, downAcc = 0, lastInput = 0, holdUi = 0, saveTimer, ticking = false;
  // ROUND 39 — PERFORMANCE FIX: remembers the chapter + time of the last history save so updateCurrent() (below) can
  // skip re-saving when nothing really changed. See the full explanation where these are used.
  let lastSavedIdx = -1, lastSavedAt = 0;
  // ROUND 8 fix: holdUi = "a deliberate jump (chapter key, End) happened a moment ago, do not hide the keys".
  // WHY: with the REAL keyboard keys our handler runs first and the generic "person is scrolling" marker (markInput)
  // runs second, so lastInput = 0 was overwritten and the jump hid the keys. holdUi is not touched by markInput.
  // WHY: Marks a deliberate jump so the keys stay visible for a while. HOW: Clears lastInput and sets holdUi to a time in
  // the future. IMPROVE: Name the 2500 ms in one constant.
  const holdUiFor = ms => { lastInput = 0; holdUi = Date.now() + ms; };
  // WHY: Remembers that the person just used wheel, touch or keyboard. HOW: Stores the current time in lastInput. IMPROVE:
  // Use performance.now for steady timing.
  const markInput = () => { lastInput = Date.now(); };
  // WHY: Shows the title bar and keys. HOW: Removes class scrolling from body (CSS fades items when it is present) and
  // resets the counters. IMPROVE: Use a transition so it feels smoother.
  function showUi() { document.body.classList.remove('scrolling'); upAcc = downAcc = 0; }
  // WHY: Hides the bar and keys so they do not cover the art. HOW: Adds class scrolling to body and resets the counters.
  // IMPROVE: Keep the keys when the user is idle for a moment.
  function hideUi() { document.body.classList.add('scrolling'); upAcc = downAcc = 0; }

  // WHY: Runs on every scroll to decide whether to hide the UI, load earlier chapters or update progress. HOW: Computes dy
  // (change in position); up near the top loads earlier chapters; real user scrolls beyond 14px show or hide the UI;
  // updateCurrent runs once per frame. IMPROVE: Use a passive listener.
  function onScroll() {
    if (reader.hidden) return;
    const y = window.scrollY, dy = y - lastY; lastY = y;
    if (dy < 0 && y < 700 && R.first > 0 && Date.now() - lastInput < 1500) loadPrev();   // round 9: scrolled up near the top -> earlier chapters
    // ROUND 41 FIX — scrolling UP to reach the header/buttons could un-hide them for barely a second
    // before they hid again, making them hard to actually use.
    // WHY: the old code required BOTH directions (showing on scroll-up AND hiding on scroll-down) to
    // happen within 1.5s of markInput() — which only runs from an explicit tap-to-scroll (see tapScroll()
    // above). If the person scrolled by dragging their finger instead of tapping, or simply paused for
    // over 1.5s, that "recent tap" window closed — and while it was closed, scrolling up could no longer
    // bring the bar back AT ALL. It would then only reappear once a fresh tap happened to land inside that
    // same 1.5s window as the up-scroll, which felt random and often looked like "it hides again almost
    // immediately" from the person's side.
    // HOW: showing the UI is always a safe thing to do (it never interrupts anything), so scrolling up no
    // longer needs that "recent tap" gate at all — it works every time, from a tap OR a drag. Hiding is the
    // one that still needs the gate (so an automatic/background scroll, like the picture-preloader jumping
    // the page, never sneaks in a hide on its own). A short holdUi window right after a show additionally
    // blocks any hide for the next 900ms, so a little scroll jitter right after the bar reappears cannot
    // immediately hide it again.
    if (y < 40) showUi();   // ROUND 53: at the very top the bar is ALWAYS visible, even inside the short hold after a key jump (it used to stay hidden for 2.5 s)
    if (Date.now() > holdUi) {
      if (y < 40) showUi();                              // at the very top the bar is always visible
      // WHY: show the controls when the person scrolls up a little, hide them when scrolling down. HOW: upAcc / downAcc add up
      // the movement; past 14 px the controls appear.
      else if (dy < 0) { upAcc -= dy; downAcc = 0; if (upAcc > 14) { showUi(); holdUi = Date.now() + 900; } }
      else if (dy > 0) { downAcc += dy; upAcc = 0; if (downAcc > 14 && Date.now() - lastInput < 1500) hideUi(); }
    }
    // WHY: do the scroll work at most once per screen refresh. HOW: requestAnimationFrame runs it before the next paint;
    // 'ticking' blocks duplicates.
    if (!ticking) { ticking = true; requestAnimationFrame(() => { updateCurrent(); ticking = false; }); }
  }
  // WHY: Works out which chapter is on screen and updates the progress bar. HOW: Picks the last chapter box whose top is
  // above 40 percent of the screen, updates the label and menu, loads more near the end, auto frees, sets the bar width
  // and saves history after a pause. IMPROVE: Use an observer.
  function updateCurrent() {
    const secs = $$('.chapter', stream); if (!secs.length) return;
    const mid = window.innerHeight * 0.4;
    // WHY: find the chapter that is on screen. HOW: start with the first section and look for the one that covers the middle
    // of the screen.
    let s = secs[0];
    for (const x of secs) { if (x.getBoundingClientRect().top <= mid) s = x; else break; }
    const idx = +s.dataset.index;
    // WHY: the chapter on screen changed. HOW: remember it, update the title line and the current mark in the menu.
    if (idx !== R.cur) { R.cur = idx; $('#rSub').textContent = labelFor(idx); markCurrent(); }
    // Close to the end of what is loaded (2 chapters left)? Start the next batch now, so you never wait.
    if (!R.loading && R.next < R.chapters.length && idx >= R.next - 2) loadNext();
    autoFree();
    const r = s.getBoundingClientRect();
    // WHY: how far through the chapter the middle of the screen is. HOW: distance from the top divided by the height, kept
    // between 0 and 1.
    const pct = Math.max(0, Math.min(1, (mid - r.top) / Math.max(1, r.height)));
    $('#progress i').style.width = (pct * 100).toFixed(1) + '%';
    clearTimeout(saveTimer);
    // ROUND 39 — PERFORMANCE FIX: "the site has gotten slow since the updates".
    // WHY (root cause): this function runs on every scroll frame while reading. Until now, EVERY time scrolling paused
    //   for 600ms it called rememberChapter(idx) — even when idx (the chapter on screen) had not changed at all, i.e.
    //   on every short pause while just reading down a page. rememberChapter() writes the chapter into the address bar
    //   AND calls saveRead(), which JSON.stringify()s and re-saves the WHOLE history array to localStorage, then fires
    //   an 'mf-activity' event that profiles.js may push to the cloud. Round 38 raised the history size kept from
    //   20/30 entries up to 500 (so "My History" can show everything) — so this already-frequent save went from
    //   cheap (small array) to a real, repeated cost (large array) on a very hot path, which is what made normal
    //   reading feel slower. HOW: only actually save when the chapter really changed, or at most once every 20
    //   seconds while staying on the same chapter (so "Continue reading"'s timestamp still stays roughly fresh even
    //   if someone reads one long chapter for a while without switching). IMPROVE: move the save itself onto
    //   requestIdleCallback if the browser supports it.
    saveTimer = setTimeout(() => {
      if (idx !== lastSavedIdx || Date.now() - lastSavedAt > 20000) {
        // ROUND 39: push a real Back/Forward step only when the CHAPTER actually changed (changed===true) — the
        // periodic 20s keep-alive save (changed===false) must never add its own history entry, or Back would have
        // to be pressed many times just to leave a chapter you spent a while reading.
        const changed = idx !== lastSavedIdx;
        lastSavedIdx = idx; lastSavedAt = Date.now(); rememberChapter(idx, changed);
      }
    }, 600);
  }
  // Save "this manga, this chapter, now" in the history (used by Continue reading).
  // WHY: Saves where you are so Continue reading and page refresh work. HOW: Writes the chapter link into the page address
  // after #r= unless history is off, then saves an entry (id, title, host, chapter, time) with saveRead. IMPROVE: Also
  // save the scroll position.
  /* ROUND 13: ACTIVITY EVENTS.  WHY: the optional profile add-on (profiles.js) records what a signed-in person reads and downloads.
     HOW: the app only SENDS a browser event 'mf-activity' with {type, title, chapter, url, host}; it does not know who listens.
          With no profiles.js nothing happens. The event is skipped when "do not save history" is on in Settings > Security.
     IMPROVE: add 'open' events for pages opened in the mini browser. */
  function announce(d) { if (settings.noHistory) return; try { window.dispatchEvent(new CustomEvent('mf-activity', { detail: d })); } catch { /* never break reading because of logging */ } }
  function rememberChapter(idx, push) {
    const ch = R.chapters[idx]; if (!ch) return;
    // ROUND 9b: write the chapter into the address of THIS page (#r=<chapter link>). WHY: a refresh used to drop you on the
    // start page. Now start-up reads it back (see resumeFromHash). The same address, opened on another device, also resumes
    // at this chapter (the reading list itself cannot travel between devices: it lives only in each browser).
    // ROUND 39: `push` (true only when the chapter actually changed, or when reading mode just started — never for
    //   the plain "still on the same chapter" keep-alive save) adds a real Back/Forward step. See rememberView above
    //   for the full explanation.
    // ROUND 46: the address is written ONLY while reading mode is really on screen (a late timer after Home must never put #r= back), and an old ?url= is never kept.
    if (!settings.noHistory && !reader.hidden) {
      const hash = '#r=' + encodeURIComponent(ch.url), full = location.pathname + cleanSearch() + hash;
      const changed = full !== (location.pathname + cleanSearch() + location.hash);
      try { if (push && !suppressPush && changed) history.pushState({ mfi: ++navMax }, '', full); else history.replaceState(history.state, '', full); } catch { /* address bar not writable: fine */ }
    }
    saveRead({
      id: new URL(R.chapters[0].url).origin + '|' + R.title,
      // WHY: what is saved so 'Continue reading' can reopen this chapter. HOW: an object with title, host, series address and
      // chapter details.
      title: R.title, host: hostOf(ch.url), seriesUrl: R.seriesUrl,
      chapterUrl: ch.url, chapterLabel: labelFor(idx), at: Date.now()
    });
    announce({ type: 'read', title: R.title, chapter: labelFor(idx), url: ch.url, host: hostOf(ch.url) });   // round 13: profiles.js may log it
  }

  /* Leave reading mode (without opening any page). Used by exitReading() and the reader's search bar. */
  // WHY: Leaves reading mode and returns to the start page. HOW: Stops the loader observer, closes the menu, removes #r=
  // from the address, shows the browser area, resets the body and scroll, and redraws the start screen. IMPROVE: Free the
  // chapter pictures too.
  function leaveReader() {
    io.disconnect(); closeMenu();
    // ROUND 39 FIX — "refresh on the home page reopens the last chapter" bug.
    // WHY (root cause): while scrolling a chapter, onScroll() debounces rememberChapter() with a 600ms setTimeout (saveTimer),
    //   which writes '#r=<chapter>' into the address bar. If the person left reading mode (tapped Home, pressed Escape, etc.)
    //   WITHIN that 600ms window, the pending timer was never cancelled — it still fired half a second later and silently
    //   wrote '#r=...' back into the address bar even though the screen was already showing the home page. The address bar
    //   then looked like a normal home-page visit, but a refresh at that moment read the stale '#r=' and reopened the old
    //   chapter, which looked like "the site randomly reopens my last manga". HOW: cancel the pending timer the moment
    //   reading mode is left, before rememberView() below gets a chance to write the clean (chapter-free) address.
    clearTimeout(saveTimer);
    rememberView(lastView && lastView.k, lastView && lastView.v);   // round 18: forget #r=, but keep #p= / #q= so a refresh returns to the page / search behind the reader
    // WHY: go back to the browsing page. HOW: hide the reader and show the browser area.
    reader.hidden = true; $('#browser').hidden = false;
    document.body.classList.remove('reading'); syncDock();
    showUi();
    // WHY: jump to the very top. HOW: scrollTo(0, 0).
    window.scrollTo(0, 0);
    renderStart();
  }
  /* Exit reading mode and open the website page of the chapter you were on. */
  // WHY: Exit reading and open the website page of the chapter you were on. HOW: Remembers the chapter, leaves the reader,
  // and navigates to its address if that is not already the page. IMPROVE: Ask before leaving.
  function exitReading() {
    const ch = R.chapters[R.cur];
    leaveReader();
    // WHY: open the chapter that was being read. HOW: only if the page is not already that chapter.
    if (ch && (!cur || !sameUrl(cur.url, ch.url))) navigate(ch.url);
  }

  /* SEARCH / LINK BAR INSIDE READING MODE (round 8)
     WHY: you can paste another manga link (or type a name) without leaving reading mode first.
     HOW: reading mode is closed, the link is opened with navigate(..., { user: true }) so a manga link starts reading
          by itself (see tryAutoRead). Words are searched. If the new page cannot be loaded, you are put back exactly
          where you were reading. */
  // WHY: Lets the user paste a link or search while in reading mode. HOW: Trims the text, remembers the scroll position,
  // leaves the reader and navigates; if it failed and a chapter was open, it puts reading mode back exactly as before.
  // IMPROVE: Keep the old reader open until the new page works.
  async function readerGo(v) {
    v = (v || '').trim(); if (!v) return;
    const y = window.scrollY, hadReader = R.chapters.length > 0;
    // WHY: leave reading mode. HOW: leaveReader() stops observers and shows the start page.
    leaveReader();
    const ok = await navigate(v, true, { user: true });
    if (!ok && hadReader) {
      // WHY: switch from the mini browser to reading mode. HOW: hide the browser, show the reader, add the 'reading' class to
      // the page body.
      $('#browser').hidden = true; reader.hidden = false; document.body.classList.add('reading'); syncDock();
      io.observe(sentinel); window.scrollTo(0, y); showUi();
    }
  }

  /* Tap the chapter to scroll.
     WHY: lets you read with one thumb: tap the page = scroll down about one screen; tap the top
          fifth of the screen = scroll back up. Skips buttons, links, failed-image retry taps and
          text selection so those still work. Can be switched off in Settings.
     IMPROVE: add a left/right tap-zone layout, or make the scroll distance a setting. */
  // WHY: Tap to scroll for one-handed reading. HOW: Ignores taps on buttons, links, unloaded pictures and text selection;
  // the top fifth of the screen scrolls up, elsewhere scrolls down about 85 percent of the screen smoothly. IMPROVE: Add
  // left and right tap zones.
  function tapScroll(e) {
    const t = e.target;
    if (t.closest('button, a')) return;
    if (t.matches && t.matches('img.page') && !t.classList.contains('loaded')) return;   // failed image: tap retries it
    if (window.getSelection && String(window.getSelection())) return;                   // user is selecting text
    // WHY: tap near the top scrolls up, elsewhere down. HOW: compare the tap height with 20% of the window height.
    const up = e.clientY < window.innerHeight * 0.2;
    markInput();
    window.scrollBy({ top: (up ? -1 : 1) * window.innerHeight * 0.85, behavior: 'smooth' });
  }

  /* ---------------------------------------------------------------
     12. PDF DOWNLOAD (the "Download all chapters" button)
     WHY: read offline. One PDF with every chapter that is loaded in reading mode, in reading order.
          ROUND 6: each chapter is ONE long page (a "long strip"), exactly like the reading mode:
          a title block at the top (manga name, chapter number, chapter title), all pictures stacked, and an
          "End of Chapter N" block at the bottom, in the same white/black theme. The file is named after the manga.
     HOW:
       1. Each page picture is downloaded as BYTES (fetchBytes). Browsers only allow that when the picture
          host sends a CORS permission, so we try: direct -> your proxies -> images.weserv.nl (last resort).
          The route that worked is remembered per website to make the next pages faster.
       2. addPageImage() puts the bytes in the PDF. JPEG and simple PNG are copied untouched (best quality,
          smallest size). WebP/GIF/other formats are decoded by the browser and stored losslessly
          (or as JPEG 98% if you chose "smaller files" in Settings).
       3. addTextPage() draws the title block and the "End of Chapter N" block with a canvas, so every language works.
       4. A picture that cannot be downloaded is NEVER skipped silently: a placeholder block says which page
          is missing, and the final message lists them.
       5. pdfmaker.js stacks everything of one chapter on one tall page. The picture data is never changed, so
          quality is the same as the source files (see pdfmaker.js for the page-size rules).
     WHERE: started by #btnDl (end of reading mode) and #btnDlMenu (chapter menu) -> range dialog (12b) -> download manager (12c);
            markup in index.html (#dlBar, #rangeDlg, #dock), styles in style.css, PDF writer = pdfmaker.js.
     IMPROVE: write to disk while downloading (File System Access API), resume after a failure, and let
              the person pick a chapter range. Very large PDFs (hundreds of MB) can run out of memory on phones. */
  /* ROUND 11: PICTURE QUALITY CHOICES (shown in the download window and in Settings; each shows its estimated size).
     WHY: "Smaller files" (JPEG 92%) still made 30 MB per chapter, because the browser stores 92%+ JPEGs with full colour detail
          (no chroma subsampling) - about twice the size of 82% with no visible difference on manga. One choice was not enough.
     HOW: q = JPEG quality for pictures that must be re-encoded; maxW = widest picture allowed (0 = keep the size);
          jpeg / png = what to do with a JPEG / PNG that arrives: 'keep' copies the bytes untouched (no quality change at all),
          'smaller' re-encodes it but ONLY uses the result when it really is smaller than the original.
          WebP / GIF / AVIF can not live inside a PDF, so they are always converted (to JPEG at quality q).
     IMPROVE: grey-scale JPEG for black-and-white pages (3x smaller again), a custom quality slider. */
  // WHY: The four quality choices for PDF pictures. HOW: Each has JPEG quality q, a max width maxW (0 means keep size),
  // what to do with JPEG and PNG (keep or smaller), and a name. IMPROVE: Add a greyscale option for black and white pages.
  const PDF_PROFILES = {
    original: { q: 0.92, maxW: 0,    jpeg: 'keep',    png: 'keep',    name: 'Original' },
    balanced: { q: 0.82, maxW: 0,    jpeg: 'keep',    png: 'smaller', name: 'Balanced' },
    // WHY: the Small PDF quality. HOW: q = jpeg quality, maxW = widest picture in pixels. IMPROVE: add a custom quality.
    small:    { q: 0.72, maxW: 1100, jpeg: 'smaller', png: 'smaller', name: 'Small' },
    tiny:     { q: 0.60, maxW: 800,  jpeg: 'smaller', png: 'smaller', name: 'Tiny' }
  };
  // WHY: A simple list of the profile names for checks and menus. HOW: Object.keys returns original, balanced, small,
  // tiny. IMPROVE: Build the quality menu from this list.
  const PDF_MODES = Object.keys(PDF_PROFILES);
  // WHY: The text shown to the user for each quality choice. HOW: An object that maps a profile name to its label.
  // IMPROVE: Compute the size estimates here too.
  const PDF_LABEL = {
    original: 'Original: pictures exactly as the site sent them (biggest)',
    balanced: 'Balanced: looks the same, about half the size (recommended)',
    // WHY: the label shown in the download window for Small. HOW: plain text.
    small: 'Small: slightly softer, pictures at most 1100 px wide',
    tiny: 'Tiny: for phones with little space, at most 800 px wide'
  };
  // WHY: Big pictures are cut into strips so phone canvases do not run out of memory. HOW: A constant strip height of 2000
  // pixels. IMPROVE: Pick the height by device memory.
  const SLICE = 2000;               // pictures that need the browser decoder are cut into strips of this height

  // WHY: Detect the real picture type from the first bytes, because file names can lie. HOW: Compares known starting byte
  // patterns (magic numbers) for jpeg, png, webp, gif and avif and returns the name, or null. IMPROVE: Add BMP support.
  function sniff(b) {               // what kind of picture is this? (look at the first bytes, not the file name)
    if (b.length > 3 && b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return 'jpeg';
    if (b.length > 7 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) return 'png';
    // WHY: detect a WebP picture by its first bytes ('RIFF'). HOW: compare the first four bytes with the letters R I F F and
    // check the length.
    if (b.length > 11 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'webp';
    if (b.length > 5 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'gif';
    if (b.length > 11 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) return 'avif';
    // WHY: nothing found. HOW: return null so the caller tries the next idea.
    return null;
  }

  // WHY: Remember which download route worked for each website so the next pictures are faster. HOW: A Map is a list of
  // key/value pairs; key is the host and value is the route name. IMPROVE: Save it in session storage.
  const routeMemory = new Map();    // website -> name of the route that worked last time
  /* ROUND 11: ROUTE HEALTH.  WHY: a route that keeps failing (for example "direct" on a site without CORS, or a proxy that is blocked)
         was tried again for EVERY picture, twice, with a 30 s timeout. 200 pictures x many seconds = the slow downloads you saw.
     HOW: routeStats counts ok / fail / time per route (shown in reports). routeBreaker remembers "this route failed 3 times in a row
          for this website": it is skipped for 60 s, then tried once again. A success clears the mark.
     IMPROVE: keep the marks in sessionStorage so a reload does not forget them; show the stats in Settings. */
  // WHY: Track route health. HOW: routeStats counts successes, failures and time per route; routeBreaker marks routes that
  // failed repeatedly for a site. IMPROVE: Show these in Settings.
  const routeStats = new Map(), routeBreaker = new Map();
  // WHY: Settings for the circuit breaker. HOW: After 3 failures in a row a route is skipped for 60000 ms (60 seconds).
  // IMPROVE: Make these user settings.
  const BREAK_AFTER = 3, BREAK_FOR = 60000;
  // ROUND 12: SELF-TUNING SPEED.  WHY: on a weak phone network, 6 pictures at once made 1 in 3 requests fail ("Failed to fetch").
  // HOW: hostLimit = how many pictures per website may be fetched at once (starts at 6). A failure on the route that normally works
  // lowers it by 1 (minimum 2); 6 successes in a row raise it again (maximum 6). hostRun counts those successes. IMPROVE: show it in Settings.
  const hostLimit = new Map(), hostRun = new Map();
  const limitOf = h => hostLimit.get(h) || 6;
  // WHY: hard time limit for any promise. HOW: whichever finishes first wins; the timer rejects. IMPROVE: use AbortSignal.timeout.
  const withLimit = (p, ms, msg) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error(msg)), ms))]);
  // WHY: Get or create the stats record of a route. HOW: Looks it up in the Map; if it is missing, it makes {ok, fail, ms}
  // and stores it. IMPROVE: Use the ?? operator for shorter code.
  const statOf = n => { let x = routeStats.get(n); if (!x) { x = { ok: 0, fail: 0, ms: 0 }; routeStats.set(n, x); } return x; };
  // WHY: Makes a readable text of route results for error reports. HOW: Turns the Map into lines like name ok 3/fail 1 avg
  // 200ms joined by dots, or says no requests yet. IMPROVE: Sort by most used.
  function routeStatText() {
    return routeStats.size ? [...routeStats].map(([n, x]) => n + ' ok ' + x.ok + '/fail ' + x.fail + (x.ok ? ' avg ' + Math.round(x.ms / x.ok) + 'ms' : '')).join(' · ') : 'no picture requests yet';
  }
  // ROUND 51 — WHY: when a chapter looked empty on Page 2 the report said nothing about it (reading mode worked, so "none" problems). HOW: counts the pictures in the site view:
  //   total, loaded, still empty (no address), retried through the proxy and the first failing address (host only). IMPROVE: show it in a small overlay too.
  // ROUND 52 — ONE LINE PER CHAPTER BOX FOR THE REPORT. WHY: "chapters 4 and 5 are missing" could not be told apart from "site refused" or "list incomplete" because the report only
  //   had totals. HOW: for each box: number, state (pictures N / loading Ns / failed / needs human check / EMPTY), so one copied report shows exactly what the reader holds.
  //   IMPROVE: add the proxy that answered and the time it took.
  function chapterHealthText() {
    try {
      if (reader.hidden) return 'not reading';
      const secs = $$('.chapter', stream); if (!secs.length) return 'no chapter boxes';
      const now = Date.now();
      const rows = secs.map(x => {
        const i = +x.dataset.index, n = x.querySelectorAll('img.page').length, bad = x.querySelectorAll('img.page').length && Array.from(x.querySelectorAll('img.page')).filter(m => m._failed).length;
        const st = x.dataset.verify ? 'human check' : x.dataset.failed === '1' ? 'FAILED (keeper retries)' : x._fillStart ? 'loading ' + Math.round((now - x._fillStart) / 1000) + 's' : n ? n + ' pictures' + (bad ? ', ' + bad + ' failed' : '') : x.querySelector('.ch-msg') ? 'message shown' : 'EMPTY';
        return (R.chapters[i] ? labelFor(i) : '#' + i) + ': ' + st;
      });
      return 'list ' + R.chapters.length + ' chapters, boxes ' + secs.length + ' | ' + rows.join(' | ');
    } catch (e) { return 'unknown (' + (e && e.message) + ')'; }
  }
  function pageViewPicText() {
    try {
      if (frame.hidden || !frame.contentDocument) return 'not on a site page';
      const im = Array.from(frame.contentDocument.images || []); if (!im.length) return 'no pictures on this page';
      const ok = im.filter(i => i.complete && i.naturalWidth > 20).length, noAddr = im.filter(i => !(i.getAttribute('src') || '').trim()).length, retried = im.filter(i => i.dataset.mfRetried).length;
      const bad = im.find(i => (i.getAttribute('src') || '').trim() && i.complete && !i.naturalWidth), host = bad ? (() => { try { return new URL(bad.dataset.mfOrig || bad.src).hostname; } catch { return '?'; } })() : '-';
      return im.length + ' pictures, ' + ok + ' loaded, ' + noAddr + ' without address, ' + retried + ' retried through the proxy, first failing host: ' + host;
    } catch (e) { return 'unknown (' + (e && e.message) + ')'; }
  }
  /* The ways to get a picture's bytes. Your own proxy gets &ref=<chapter address> so picture hosts that check the
     "Referer" accept the request (round 8). Free public proxies do not get it (they would ignore or mishandle it). */
  // WHY: Builds the list of ways to download a picture. HOW: First direct, then each proxy (own proxies also get the
  // chapter address as &ref= for referer checks), and last images.weserv.nl; each route has a name and a make function to
  // build the address. IMPROVE: Let the user reorder the routes.
  function byteRoutes(ref) {
    const routes = [{ name: 'direct', make: u => u }];
    proxyList(false).forEach(tpl => routes.push({
      // WHY: show the proxy by a friendly name in reports. HOW: proxyName() shortens its address.
      name: proxyName(tpl),
      make: u => tpl.replace('{url}', encodeURIComponent(u)) + (ref && !DEFAULT_PROXIES.includes(tpl) ? '&ref=' + encodeURIComponent(ref) : '')
    }));
    // ROUND 18: a second way through YOUR OWN proxy. WHY: some picture hosts accept only a Referer that is the site's front address (not the chapter
    // address) - the report showed "HTTP 404" on every route for such a site. HOW: same proxy, but &ref= is the site root. It is tried after the first
    // way fails, and a route that keeps failing is skipped for a while (route health), so it costs nothing when the first way works. IMPROVE: learn per site.
    if (ref) { let root = ''; try { root = new URL(ref).origin + '/'; } catch { /* no root */ } if (root && root !== ref) proxyList(false).filter(tpl => !DEFAULT_PROXIES.includes(tpl)).forEach(tpl => routes.push({ name: proxyName(tpl) + ' (site-root referer)', make: u => tpl.replace('{url}', encodeURIComponent(u)) + '&ref=' + encodeURIComponent(root) })); }
    routes.push({ name: 'images.weserv.nl', make: u => 'https://images.weserv.nl/?q=100&url=' + encodeURIComponent(u) });
    // WHY: give back the list of routes to try. HOW: the array built above.
    return routes;
  }
  /* Download one picture as bytes. `job` = the download job (its .cancel flag stops us), `ref` = chapter address.
     POLITE (round 8): a ticket from gate() is needed for every try. ROUND 11: 6 pictures per website at once (was 4), 20 s per try (was 30),
     at most 70 s per picture in total, unhealthy routes are skipped (see ROUTE HEALTH). A "429 / 503" answer makes everybody wait (coolDown)
     and is NOT counted against the route. */
  // WHY: Downloads one picture as raw bytes for the PDF. HOW: Puts the last good route first, loops twice through usable
  // routes, waits for a gate ticket, fetches with a 20 s timeout, handles 429/503 by cooling down, checks the bytes are a
  // picture, and records success or failure. IMPROVE: Run routes in parallel.
  async function fetchBytes(url, job, ref) {
    const host = hostOf(url), t0 = Date.now(), DEADLINE = 70000;
    let routes = byteRoutes(ref);
    // WHY: reuse the route that worked for this site before. HOW: routeMemory maps host -> best route.
    const good = routeMemory.get(host);
    if (good) routes = [...routes.filter(r => r.name === good), ...routes.filter(r => r.name !== good)];
    const errors = [];
    // WHY: A second round gives slow sites another chance. HOW: Round 0 and 1; routes under a failure break are skipped
    // unless all are marked bad. IMPROVE: Use growing waits between rounds.
    for (let round = 0; round < 2; round++) {              // go through the usable routes twice before giving up
      const now = Date.now();
      let usable = routes.filter(r => { const b = routeBreaker.get(host + '|' + r.name); return !b || b.until <= now; });
      if (!usable.length) usable = routes;                 // everything is marked bad: try them all anyway
      // WHY: Try each usable route one by one. HOW: Stops when cancelled or after 70 seconds total, then waits for a ticket so
      // one site is not flooded. IMPROVE: Report which route is being tried to the UI.
      for (const r of usable) {
        if (job && job.cancel) throw new Error('cancelled');
        if (Date.now() - t0 > DEADLINE) { errors.push('gave up after 70 s'); throw new Error(errors.slice(-4).join(' | ')); }
        // WHY: limit how many requests run at once per site and route. HOW: gate() waits for a free slot (max 25 s) and returns
        // a release function.
        const key = host + '|' + r.name, release = await gate('i:' + host, limitOf(host), 40, job);
        // WHY: Every try needs a time limit and stats. HOW: An AbortController cancels the fetch after 20 seconds; t1 is the
        // start time and st is this route's stats. IMPROVE: Use AbortSignal.timeout.
        const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), 20000), t1 = Date.now(), st = statOf(r.name);
        // WHY: Do the real network request safely. HOW: Fetches without referrer or cookies; on 429 or 503 it makes all requests
        // wait (coolDown) and moves to the next route; other errors throw; good bytes are checked with sniff and returned after
        // saving stats. IMPROVE: Respect the retry-after date format.
        try {
          const res = await fetch(r.make(url), { signal: ctrl.signal, referrerPolicy: 'no-referrer', credentials: 'omit' });
          if (res.status === 429 || res.status === 503) {
            // WHY: obey 'slow down' answers. HOW: read the retry-after header (default 5 s) and pause that route with coolDown.
            coolDown('i:' + host, (+res.headers.get('retry-after') || 5) * 1000);
            errors.push(r.name + ': HTTP ' + res.status + ' (slowing down)'); continue;
          }
          // WHY: a bad answer is a failure. HOW: throw with the status code so the retry logic runs.
          if (!res.ok) throw new Error('HTTP ' + res.status);
          const bytes = new Uint8Array(await res.arrayBuffer());
          if (bytes.length < 200 || !sniff(bytes)) throw new Error('not a picture');   // error pages are not pictures
          routeMemory.set(host, r.name); routeBreaker.delete(key); st.ok++; st.ms += Date.now() - t1;
          const run = (hostRun.get(host) || 0) + 1; hostRun.set(host, run);                       // ROUND 12: speed up again after 6 good ones
          if (run >= 6) { hostRun.set(host, 0); hostLimit.set(host, Math.min(6, limitOf(host) + 1)); }
          return bytes;
        // WHY: Record a failed try. HOW: Counts the failure, saves the error text, and if the route failed 3 times in a row for
        // this site it is blocked for 60 seconds. finally always clears the timer and releases the ticket. IMPROVE: Reset the
        // fail counter after a pause.
        } catch (e) {
          st.fail++; errors.push(r.name + ': ' + (e.name === 'AbortError' ? 'timeout' : e.message));
          const b = routeBreaker.get(key) || { fails: 0, until: 0, strikes: 0 }; b.fails++;
          // ROUND 12: a route that was blocked before is blocked again after ONE more failure, for twice as long (60 s, 120 s ... 10 min).
          if (b.fails >= BREAK_AFTER || b.strikes) { b.strikes++; b.fails = 0; b.until = Date.now() + Math.min(600000, BREAK_FOR * 2 ** (b.strikes - 1)); }
          routeBreaker.set(key, b);
          // ROUND 12: the route that normally works failed -> fewer pictures at once (the network is struggling).
          if (routeMemory.get(host) === r.name) { hostRun.set(host, 0); hostLimit.set(host, Math.max(2, limitOf(host) - 1)); }
        } finally { clearTimeout(timer); release(); }
      }
      // WHY: Give the server a short rest between rounds. HOW: Waits 1200 ms with a promise timer after the first round.
      // IMPROVE: Wait longer after a 429.
      if (round === 0) await new Promise(r => setTimeout(r, 1200));   // short breath before the second round
    }
    // WHY: All tries failed, so tell the caller. HOW: Throws an error with the last 4 messages joined together. IMPROVE:
    // Include the picture address.
    throw new Error(errors.slice(-4).join(' | '));
  }

  // WHY: The PDF wants RGB but canvas gives RGBA. HOW: Makes a new array of 3 bytes per pixel and copies R, G and B,
  // dropping alpha (see-through) bytes. IMPROVE: Use a faster typed array method.
  const toRgb = rgba => {           // canvas gives 4 bytes per pixel (R,G,B,A); the PDF wants 3 (R,G,B)
    const out = new Uint8Array((rgba.length / 4) * 3);
    for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) { out[j] = rgba[i]; out[j + 1] = rgba[i + 1]; out[j + 2] = rgba[i + 2]; }
    // WHY: give the result back. HOW: 'out' was filled above.
    return out;
  };

  // ROUND 38: TRANSLATED PDF OVERLAY
  // WHY: When a chapter has been translated, the PDF download should include the translated text on top of each page
  //   image (not the original text). HOW: translate.js stores translated bubble data on each <img> element's _mfTr
  //   property (set by window.MangaFlowTranslate.getPageData). If translation data is found for the page, we decode
  //   the image on a canvas, draw the translated text boxes on top (white/black fill + text, same as the on-screen
  //   overlay), then save the composited canvas as a JPEG for the PDF.
  //   This only runs when ALL of the following are true:
  //     1. The translate add-on (translate.js) is loaded (window.MangaFlowTranslate exists)
  //     2. The image element is passed and has translation data
  //     3. The image has been fully translated (state = 'done')
  //   IMPROVE: use the exact same font + fit algorithm as translate.js for pixel-perfect matching.
  async function addPageImageWithTranslation(pdf, bytes, mode, imgEl) {
    // WHY: check if the translate add-on is active and has data for this image. HOW: MangaFlowTranslate.getPageData(img)
    //   returns { bubbles, texts } or null. If no translation data, fall back to normal rendering.
    const tr = imgEl && window.MangaFlowTranslate && window.MangaFlowTranslate.getPageData && window.MangaFlowTranslate.getPageData(imgEl);
    if (!tr || !tr.bubbles || !tr.texts || !tr.bubbles.length) {
      // WHY: no translation for this page — use the standard (original image) path.
      return addPageImage(pdf, bytes, mode);
    }
    // WHY: decode the image to a canvas so we can draw the translation overlay on top. HOW: createImageBitmap reads the bytes.
    const bmp = await createImageBitmap(new Blob([bytes]));
    try {
      const iw = bmp.width, ih = bmp.height;
      const c = document.createElement('canvas'); c.width = iw; c.height = ih;
      const g = c.getContext('2d');
      // WHY: draw the original page image as the background. HOW: drawImage copies the full bitmap at full size.
      g.drawImage(bmp, 0, 0, iw, ih);
      // WHY: draw each translated text bubble over the original text. HOW: each bubble has normalised coordinates (0–1)
      //   and background colour. We scale them to pixel coordinates, fill the background, then draw the text.
      tr.bubbles.forEach((bb, i) => {
        const t = tr.texts[i]; if (!t) return;
        // WHY: clamp coordinates to 0–1 (Tesseract can return values slightly outside). HOW: Math.max/min.
        const x0 = Math.max(0, Math.min(1, bb.x0)), y0 = Math.max(0, Math.min(1, bb.y0));
        const x1 = Math.max(0, Math.min(1, bb.x1)), y1 = Math.max(0, Math.min(1, bb.y1));
        let bx = x0 * iw, by = y0 * ih, bw = (x1 - x0) * iw, bh = (y1 - y0) * ih;
        if (bw <= 0 || bh <= 0) return;
        // ROUND 38: same vertical-bubble expansion logic as translate.js render():
        // WHY: vertical-source (tall-narrow) bubbles need horizontal space for the translated text.
        //   Expand width to match the old height, shrink height to match the old width, centre on the original position.
        const isVert = bh > bw * 1.5;
        if (isVert) {
          const cx = bx + bw / 2, cy = by + bh / 2;
          const nw = Math.min(bh, iw * 0.9), nh = Math.max(bw * 0.8, iw * 0.06);
          bx = Math.max(0, Math.min(iw - nw, cx - nw / 2));
          by = Math.max(0, Math.min(ih - nh, cy - nh / 2));
          bw = nw; bh = nh;
        }
        // WHY: fill the background of the bubble so the original text is hidden. HOW: use the detected background colour.
        const lum = (bb.bg[0] * .3 + bb.bg[1] * .59 + bb.bg[2] * .11);
        g.fillStyle = 'rgb(' + bb.bg.join(',') + ')';
        g.fillRect(bx, by, bw, bh);
        // WHY: draw the translated text. HOW: auto-size the font to fit the box width; wrap long text.
        g.fillStyle = lum > 140 ? '#111' : '#fff';
        g.textAlign = 'center'; g.textBaseline = 'middle';
        // WHY: pick a font size that fits the box. HOW: start at 1/4 of box height; shrink until text fits in width; min 8px.
        let fs = Math.max(8, Math.round(bh / 3));
        g.font = fs + 'px system-ui, Arial, sans-serif';
        while (fs > 8 && g.measureText(t).width > bw * 0.92) { fs -= 1; g.font = fs + 'px system-ui, Arial, sans-serif'; }
        g.fillText(t, bx + bw / 2, by + bh / 2, bw);
      });
      // WHY: encode the composited page (image + text) as JPEG for the PDF. HOW: toBlob with JPEG quality from the profile.
      const P = PDF_PROFILES[mode || settings.pdfMode] || PDF_PROFILES.balanced;
      const blob = await new Promise(res => c.toBlob(res, 'image/jpeg', P.q || 0.85));
      if (!blob) throw new Error('canvas toBlob failed');
      const u8 = new Uint8Array(await blob.arrayBuffer());
      return pdf.addJpeg(u8);
    } finally { if (bmp.close) bmp.close(); }
  }

  // WHY: Puts one picture into the PDF with the chosen quality. HOW: Gets the profile, finds the picture type, and tries
  // to copy JPEG or PNG bytes untouched when allowed; otherwise it decodes with createImageBitmap. IMPROVE: Return a clear
  // error for unknown formats.
  async function addPageImage(pdf, bytes, mode) {          // mode: one of PDF_MODES (default = the setting)
    const P = PDF_PROFILES[mode || settings.pdfMode] || PDF_PROFILES.balanced;
    const kind = sniff(bytes);
    // WHY: choose what to do with a picture for this quality. HOW: keep the original JPEG/PNG bytes, or 'convert' them
    // through a canvas.
    const want = kind === 'jpeg' ? P.jpeg : kind === 'png' ? P.png : 'convert';
    const keepOriginal = () => (kind === 'jpeg' ? pdf.addJpeg(bytes) : pdf.addPng(bytes));
    if (want === 'keep') { try { return await keepOriginal(); } catch { /* unusual file: let the browser decode it below */ } }
    // WHY: decode the picture so a canvas can resize it. HOW: createImageBitmap reads the bytes (fast, off the main thread).
    const bmp = await createImageBitmap(new Blob([bytes]));
    try {
      // WHY: Re-encode the picture in strips so memory stays low. HOW: Reads width and height, works out a shrink scale (never
      // enlarges), picks the new width, and makes one canvas that is reused. IMPROVE: Use OffscreenCanvas.
      const w = bmp.width, h = bmp.height;
      const scale = P.maxW && w > P.maxW ? P.maxW / w : 1;       // only ever SHRINK, never enlarge
      const dw = Math.max(1, Math.round(w * scale));
      // WHY: a canvas is the drawing area used to resize and re-encode pictures. HOW: create one in memory (not shown).
      const c = document.createElement('canvas');
      const parts = []; let total = 0;
      // WHY: Cut the tall picture into strips. HOW: For each 2000px strip it sizes the canvas, fills it white, draws that part
      // of the picture, converts it to a JPEG blob with the profile quality, and stores the bytes. A short pause keeps the
      // page smooth. IMPROVE: Reuse the blob step in a helper.
      for (let y = 0; y < h; y += SLICE) {                       // strips keep canvases small enough for phones
        const sh = Math.min(SLICE, h - y), dh = Math.max(1, Math.round(sh * scale));
        c.width = dw; c.height = dh;
        // WHY: the canvas drawing tool. HOW: getContext('2d') returns it.
        const g = c.getContext('2d');
        g.fillStyle = '#fff'; g.fillRect(0, 0, dw, dh);          // transparent areas become white
        g.imageSmoothingQuality = 'high';
        // WHY: draw one slice of the picture onto the canvas. HOW: drawImage copies from the source rectangle to the target
        // rectangle.
        g.drawImage(bmp, 0, y, w, sh, 0, 0, dw, dh);
        const blob = await new Promise(res => c.toBlob(res, 'image/jpeg', P.q));
        if (!blob) throw new Error('the browser could not make a JPEG');
        const u8 = new Uint8Array(await blob.arrayBuffer());
        parts.push(u8); total += u8.length;
        await sleep0();                                          // give the page a breath so reading stays smooth
      }
      // A JPEG / PNG that was already smaller than our new version keeps its original bytes (never make a file bigger).
      // WHY: Never make a file bigger than the original. HOW: If nothing was resized and the new strips are not at least 3
      // percent smaller, use the original bytes. IMPROVE: Make the 0.97 limit a named constant.
      if (scale === 1 && (kind === 'jpeg' || kind === 'png') && total >= bytes.length * 0.97) {
        try { return await keepOriginal(); } catch { /* fall through to the new version */ }
      }
      // WHY: Add the new JPEG strips to the PDF. HOW: Adds each strip, sums the page counts, and returns the pages with the
      // final width and height. finally frees the bitmap memory. IMPROVE: Add strips in parallel.
      let pages = 0;
      for (const u8 of parts) pages += (await pdf.addJpeg(u8)).pages;
      return { pages, width: dw, height: Math.round(h * scale) };
    // WHY: free the decoded picture's memory. HOW: bitmap.close() always runs (finally), also after an error.
    } finally { if (bmp.close) bmp.close(); }
  }

  // A block with text only, drawn on a canvas, then added to the strip.
  // `lines` = [{ text, size (fraction of width), y (fraction of height), bold, muted }]
  // `edge` = 'top' or 'bottom': which side gets the thin divider line (like the borders in reading mode).
  // `front` = true puts the block at the very top of the strip (used for the chapter title block).
  // WHY: Draws a text-only block (title or end of chapter) so any language works. HOW: Makes a canvas of the given size,
  // gets a 2D context, fills it black or white by the theme, and centres the text. IMPROVE: Support right-to-left
  // languages.
  async function addTextPage(pdf, w, h, lines, edge, front, dark) {   // dark = theme chosen when the download started
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true });
    // WHY: paint the background before the picture (transparent areas). HOW: black in dark theme, white otherwise.
    g.fillStyle = dark ? '#000' : '#fff'; g.fillRect(0, 0, w, h);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    // WHY: draws each line of text onto the canvas for a title/end page. HOW: forEach runs the function once per line object
    // L. IMPROVE: use a plain for...of loop, it is easier to read and to debug.
    lines.forEach(L => {
      // WHY: font size must scale with the page width so text looks the same on any page size. HOW: width times the fraction
      // L.size, rounded to a whole number. Then font is a small helper that sets g.font (bold or normal). IMPROVE: keep font
      // names in one constant.
      let size = Math.round(w * L.size);
      const font = () => { g.font = (L.bold ? '700 ' : '400 ') + size + 'px system-ui, "Segoe UI", Roboto, Arial, sans-serif'; };
      // WHY: apply the font once so measureText below measures with the right size. HOW: calls the helper defined above.
      // IMPROVE: none needed.
      font();
      // WHY: a long title must not run off the page. HOW: while the text is wider than 92 percent of the width, make the size
      // 2 smaller and set the font again (never below 12). IMPROVE: wrap long titles onto two lines instead of shrinking.
      while (g.measureText(L.text).width > w * 0.92 && size > 12) { size -= 2; font(); }   // shrink long titles to fit
      // WHY: text colour depends on the theme and on whether the line is a quiet (muted) one. HOW: nested ternary = short
      // if/else chain, picks grey or strong colour for dark or light. IMPROVE: store colours in a named object.
      g.fillStyle = L.muted ? (dark ? '#9a9a9a' : '#666') : (dark ? '#eee' : '#111');
      // WHY: actually paints the text. HOW: fillText draws centered at half the width; the y position is the page height times
      // L.y (a fraction from 0 to 1). IMPROVE: allow left-aligned text too.
      g.fillText(L.text, w / 2, Math.round(h * L.y));
    });
    // WHY: prepares the colour of a thin divider line. HOW: sets the fill colour for the next fillRect call, dark or light
    // grey. IMPROVE: reuse one theme colour table.
    g.fillStyle = dark ? '#333' : '#ddd';
    // WHY: draws a 2-pixel line at the top or bottom edge so chapters are visibly separated. HOW: only runs if edge is
    // given; y is 0 for top or height minus 2 for bottom. IMPROVE: make the line thickness a setting.
    if (edge) g.fillRect(0, edge === 'top' ? 0 : h - 2, w, 2);
    // WHY: puts the finished canvas picture into the PDF. HOW: getImageData reads the pixels, toRgb turns them into plain
    // RGB bytes, pdf.addRaw stores them. The result is returned to the caller. IMPROVE: encode as JPEG to make the PDF
    // smaller.
    return pdf.addRaw(w, h, toRgb(g.getImageData(0, 0, w, h).data), !!front);
  }

  // WHY: a file name must not contain characters that Windows or phones refuse. HOW: replaces bad characters and control
  // codes with a space, squeezes repeated spaces, trims, cuts to 120 characters, falls back to 'manga' if empty. IMPROVE:
  // also avoid reserved names like CON.
  const fileSafe = t => (t || 'manga').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'manga';

  // WHY: updates the small download bar under the reader so you know how much is loaded. HOW: finds chapter sections that
  // already have images (_imgs), adds up their pages, shows or hides the bar, and writes the text. IMPROVE: show total
  // size too.
  function updateDlBar() {
    const secs = $$('.chapter', stream).filter(s => s._imgs);
    const pages = secs.reduce((n, s) => n + s._imgs.length, 0);
    // WHY: show the download bar only when there are chapters. HOW: hidden = no sections.
    $('#dlBar').hidden = !secs.length;
    $('#dlInfo').textContent = secs.length + ' chapter' + (secs.length === 1 ? '' : 's') + ' · ' + pages + ' pages loaded · ' + R.chapters.length + ' in the list';
  }

  /* ---------------------------------------------------------------
     12b. DOWNLOAD RANGE DIALOG  (round 7)
     WHY: a manga can have 100s of chapters. The person picks WHICH ones (1-50, 51-100, the rest...) and may split
          the result into several smaller files. Chapters that are not open in reading mode are fetched by the
          download itself, so any chapter of the list can be chosen.
     HOW: two drop-downs (from / to), quick buttons made from the chapter count, and a "split" choice.
          "Make PDF" builds a job description (a plain snapshot) and hands it to queueDownload().
     WHERE: dialog markup = index.html #rangeDlg; styles = style.css "RANGE DIALOG"; opened by #btnDl and #btnDlMenu.
     IMPROVE: show an estimated file size, remember the last range, add "only chapters I have not downloaded". */
  // WHY: grab the three form controls of the range dialog once so later code can reuse them. HOW: $ is a short helper for
  // querySelector (find one element by CSS id). IMPROVE: none needed.
  const rgFrom = $('#rgFrom'), rgTo = $('#rgTo'), rgSplit = $('#rgSplit');
  // WHY: gives the chapter number to show on buttons. HOW: if the chapter has a real num it is formatted by fmtNum, else
  // the position + 1 is used. IMPROVE: show the chapter title if there is no number.
  const chapNo = i => (R.chapters[i] && R.chapters[i].num != null) ? fmtNum(R.chapters[i].num) : String(i + 1);
  // WHY: one function the quick buttons use to set a from/to range. HOW: sets both drop-downs, removes the auto split
  // option, resets split to 0 (one file), then refreshes the info text and the size estimate. IMPROVE: split it into
  // smaller steps.
  function setRange(a, b) { rgFrom.value = a; rgTo.value = b; const o = $('#rgAuto'); if (o) o.remove(); rgSplit.value = '0'; rangeInfo(); scheduleEstimate(); }
  // WHY: the person may pick from and to in the wrong order. HOW: reads both as numbers (the + sign converts text to a
  // number) and swaps them if a is bigger. Returns them as a pair. IMPROVE: show a warning when swapped.
  function rangeValues() {
    let a = +rgFrom.value, b = +rgTo.value;
    if (a > b) [a, b] = [b, a];
    // WHY: return the chosen range. HOW: the two end numbers as a pair.
    return [a, b];
  }
  // WHY: shows a summary line like '12 chapters, 2 files' in the dialog. HOW: counts chapters in range, works out how many
  // files if split every per chapters (Math.ceil rounds up), counts how many of them are already open. IMPROVE: add the
  // page count.
  function rangeInfo() {
    const [a, b] = rangeValues(), n = b - a + 1, per = +rgSplit.value;
    const files = per > 0 ? Math.ceil(n / per) : 1;
    // WHY: count chapters already loaded in the chosen range. HOW: filter the chapter boxes that have pictures and whose
    // index is inside a..b.
    const loaded = $$('.chapter', stream).filter(s => s._imgs && +s.dataset.index >= a && +s.dataset.index <= b).length;
    // WHY: writes the summary into the dialog. HOW: joins labels and counts, adding an 's' only when the number is not 1.
    // IMPROVE: use a small plural helper function.
    $('#rgInfo').textContent = labelFor(a) + ' to ' + labelFor(b) + ' · ' + n + ' chapter' + (n === 1 ? '' : 's') +
      ' · ' + files + ' file' + (files === 1 ? '' : 's') + ' · ' + loaded + ' already open in reading mode';
  }
  // WHY: opens the download window. HOW: first checks that pdfmaker.js loaded and that a chapter list exists, and shows a
  // toast (small message) if not. IMPROVE: disable the download button instead of showing a message afterwards.
  function openRangeDialog() {
    if (!window.MangaPDFLib) return toast('pdfmaker.js did not load. Keep it in the same folder as app.js.', true);
    const n = R.chapters.length;
    // WHY: no chapter list means nothing to choose. HOW: toast and stop.
    if (!n) return toast('No chapter list yet');
    // WHY: both drop-downs (from and to) need the same list of chapters. HOW: clears each select, then adds one option
    // element per chapter with its index as value and its label as text. IMPROVE: for 1000+ chapters use a lighter list to
    // stay fast.
    [rgFrom, rgTo].forEach(sel => {
      sel.innerHTML = '';
      R.chapters.forEach((c, i) => { const o = document.createElement('option'); o.value = i; o.textContent = labelFor(i); sel.appendChild(o); });
    });
    // Quick buttons: blocks of 50 chapters, then the special ones.
    // WHY: prepares the area for quick range buttons. HOW: empties the box, then defines chip() which makes a button that
    // calls setRange(a, b) when clicked. IMPROVE: add keyboard hints.
    const box = $('#rgChips'); box.innerHTML = '';
    const chip = (text, a, b) => {
      const x = document.createElement('button'); x.type = 'button'; x.className = 'chip'; x.textContent = text;
      // WHY: a quick button sets the range. HOW: onclick calls setRange(a, b); the button is added to the box.
      x.onclick = () => setRange(a, b); box.appendChild(x);
    };
    // WHY: finds which chapters are already open in reading mode, so a quick button for them can be offered. HOW: filters
    // chapter sections that have images and maps them to their index numbers. IMPROVE: none needed.
    const loaded = $$('.chapter', stream).filter(s => s._imgs).map(s => +s.dataset.index);
    // WHY: the most common choices come first. HOW: 'All' covers chapter 0 to the last; 'Open now' covers smallest to
    // largest open index; 'Current to end' starts at the chapter being read. IMPROVE: add 'Last 10 chapters'.
    chip('All ' + n, 0, n - 1);
    if (loaded.length) chip('Open now (' + loaded.length + ')', Math.min(...loaded), Math.max(...loaded));
    chip('Current → end', Math.min(R.cur, n - 1), n - 1);
    // WHY: for big manga, blocks of 50 chapters are easier to pick. HOW: loop jumps by 50, the end is the smaller of last
    // chapter or start+49, chip() adds one button per block. IMPROVE: let the person choose the block size.
    for (let a = 0; a < n; a += 50) { const b = Math.min(n - 1, a + 49); chip(chapNo(a) + '–' + chapNo(b), a, b); }
    // WHY: pick a sensible starting range. HOW: if some chapters are open, use them; otherwise the first 50 chapters.
    // IMPROVE: remember the last range used.
    if (loaded.length) setRange(Math.min(...loaded), Math.max(...loaded)); else setRange(0, Math.min(n - 1, 49));
    // WHY: shows the quality that is saved in settings. HOW: sets the quality drop-down value. IMPROVE: none needed.
    $('#rgMode').value = settings.pdfMode;
    // WHY: shows the dialog on screen. HOW: showModal is the built-in dialog method that also blocks the page behind it.
    // Then the size estimate is started. IMPROVE: focus the first control for keyboard users.
    $('#rangeDlg').showModal();
    scheduleEstimate();
  }
  /* ESTIMATED FILE SIZE BEFORE YOU PRESS "Make PDF" (round 10)
     WHY: 15 chapters once became 1 GB. You should see the size first and be warned when it is too big for the device.
     HOW: a few sample pages (first / one third / two thirds / last) of an open chapter are downloaded and put into a throw-away PDF in the
          CHOSEN quality; the size per page x the number of pages in the range = the estimate. Pages of chapters that are not open yet are
          counted with the average of the open ones. The number is an ESTIMATE (usually within +-25%).
          Above 400 MB the dialog suggests (and selects) several smaller files, because one huge file can run out of memory.
     IMPROVE: read the real size with HEAD requests, cache samples per site, show the time it will take. */
  // WHY: a place to remember measured samples so the estimate is not repeated. HOW: a plain object used as a cache.
  // IMPROVE: clear it when a different manga opens.
  const estCache = {};
  // WHY: variables for the estimate timer, a counter that tells old estimates from new ones (estToken), and the last
  // result. HOW: let allows later changes. IMPROVE: group them in one object.
  let estTimer = 0, estToken = 0, lastEstimate = null;
  /* ROUND 11: one set of sample pages is downloaded ONCE and encoded in EVERY quality, so the window can show the size of all four
     choices side by side (the drop-down text changes to "Balanced ... about 210 MB"). */
  // WHY: measures how big a page becomes in each quality, using a few sample pages. HOW: returns the cached result if it
  // exists; otherwise picks sample images from an open chapter (or fetches the first chapter of the range). async = it can
  // wait for downloads. IMPROVE: show progress.
  async function measureAll() {
    if (estCache.all) return estCache.all;
    // WHY: the download helpers expect a job object with a cancel flag; this is a fake one that never cancels. HOW: a plain
    // object. IMPROVE: allow cancelling the estimate.
    const fake = { cancel: false };
    // WHY: sample pages must come from chapters already open. HOW: finds chapter sections that have a non-empty image list.
    // IMPROVE: none needed.
    const secs = $$('.chapter', stream).filter(s => s._imgs && s._imgs.length);
    // WHY: variables for the image addresses, the referer address and the average pages per chapter. HOW: filled in by the
    // if/else below. IMPROVE: give them clearer names.
    let urls, ref, pages;
    // WHY: use an open chapter when there is one (no extra download). HOW: takes the first open chapter's images and its
    // url; pages = average page count of open chapters. IMPROVE: use a median to avoid skew.
    if (secs.length) { urls = secs[0]._imgs; ref = secs[0].dataset.url; pages = secs.reduce((n, s) => n + s._imgs.length, 0) / secs.length; }
    // WHY: no chapter is open, so fetch the picture list of the first chapter in the range. HOW: chapterImages downloads and
    // reads the chapter page. IMPROVE: show an error if the list is empty.
    else { const it = { url: R.chapters[rangeValues()[0]].url }; urls = await chapterImages(it, fake); ref = it.url; pages = urls.length; }
    // WHY: choose 4 spread-out sample pages (first, one third, two thirds, last). HOW: forEach adds each index only if it is
    // valid and not already in the picks list. IMPROVE: pick more samples for long chapters.
    // ROUND 18: six evenly spaced pages from the MIDDLE of the chapter (first and last pages are often covers / credits and skew the average).
    const n = urls.length, picks = []; for (let i = 0; i < 6; i++) { const k = Math.min(n - 1, Math.floor((i + 0.5) * n / 6)); if (k >= 0 && !picks.includes(k)) picks.push(k); }
    // WHY: a list to hold the downloaded sample pictures. HOW: empty array filled by the loop below. IMPROVE: none needed.
    const samples = [];
    // WHY: download each sample picture. HOW: try/catch means a failed download is ignored instead of stopping everything.
    // IMPROVE: log which sample failed.
    for (const k of picks) { try { samples.push(await fetchBytes(urls[k], fake, ref)); } catch { /* a sample that fails is skipped */ } }
    // WHY: without any sample no estimate is possible. HOW: throws an error, which estimate() shows to the person. IMPROVE:
    // suggest checking the connection.
    if (!samples.length) throw new Error('no sample picture could be downloaded');
    // WHY: will hold average bytes per page for each quality mode. HOW: an object keyed by mode name. IMPROVE: none needed.
    const per = {};
    // WHY: measure every quality choice with the same samples. HOW: for each mode, each sample is put into a throw-away PDF
    // and the growth of the PDF size is added up. IMPROVE: run the modes in parallel.
    for (const mode of PDF_MODES) {
      let bytes = 0, got = 0;
      for (const b of samples) {
        // WHY: the next block may fail on odd pages. HOW: try / catch keeps the dialog working.
        try {
          // WHY: builds a small temporary PDF so we can see how big a page gets. HOW: creates the PDF and a strip (one long page)
          // and remembers the starting size in base0. IMPROVE: reuse one PDF object.
          const pdf = new MangaPDFLib.MangaPDF({ title: 'sample' }), strip = pdf.strip({ bg: [255, 255, 255] }), base0 = pdf.size;
          // WHY: encodes the sample image in this mode. HOW: addPageImage adds the picture to the strip, strip.end closes it.
          // IMPROVE: none needed.
          await addPageImage(strip, b, mode); strip.end();
          // WHY: collect the real size. HOW: the new PDF size minus the start size = bytes for this page; got counts successes.
          // IMPROVE: none needed.
          bytes += pdf.size - base0; got++;
        } catch { /* skipped */ }
      }
      // WHY: average bytes per page for this mode. HOW: total bytes divided by the number of good samples, or 0 if none
      // worked. IMPROVE: none needed.
      per[mode] = got ? bytes / got : 0;
    }
    // WHY: store and return the result so next time it is instant. HOW: assignment inside return saves into the cache and
    // gives it back; includes the average original picture size. IMPROVE: split into two lines for clarity.
    return (estCache.all = { per, pages, sampled: samples.length, avgSource: samples.reduce((a, b) => a + b.length, 0) / samples.length });
  }
  // WHY: calculates and shows the estimated size of the whole range. HOW: token estToken tells later whether the answer is
  // still wanted; reads the range and chosen mode; clears the box and shows a waiting text. IMPROVE: show a spinner.
  async function estimate() {
    const tok = ++estToken, box = $('#rgSize'), [a, b] = rangeValues(), n = b - a + 1, mode = $('#rgMode').value;
    box.dataset.level = ''; box.textContent = 'Estimating the file size…';
    // WHY: the measuring can fail, so it is wrapped to show a friendly message. HOW: waits for measureAll, then stops if the
    // person changed the range meanwhile (token differs). IMPROVE: cancel the old work instead of ignoring it.
    try {
      const m = await measureAll();
      if (tok !== estToken) return;                                   // the person changed the range meanwhile
      // WHY: count the pages in the range. HOW: for open chapters use the real page count, others use the average. secFor
      // finds the chapter section. IMPROVE: none needed.
      let pages = 0; for (let i = a; i <= b; i++) { const s = secFor(i); pages += s && s._imgs ? s._imgs.length : m.pages; }
      // WHY: compute the size of each quality. HOW: MB = bytes in a megabyte; total = bytes per page times pages times 1.02 (2
      // percent extra for PDF overhead). IMPROVE: tune the extra from real downloads.
      const MB = 1048576, totals = {};
      PDF_MODES.forEach(k => { totals[k] = m.per[k] * pages * 1.02; });
      // WHY: show the size next to each quality name in the drop-down. HOW: loops over the options and rewrites their text.
      // IMPROVE: none needed.
      Array.from($('#rgMode').options).forEach(o => { o.textContent = PDF_LABEL[o.value] + (totals[o.value] ? ' · about ' + fmtSize(totals[o.value]) : ''); });
      // WHY: the number for the quality that is selected now. HOW: saves it in lastEstimate so the job can compare estimate
      // and real size later. IMPROVE: none needed.
      const total = totals[mode];
      lastEstimate = { mode, bytes: total };
      // WHY: show the estimate. HOW: writes the text, then adds a small element with the details (chapters, pages, sample
      // count, accuracy note). IMPROVE: show the time needed as well.
      box.textContent = 'Estimated size: about ' + fmtSize(total);
      const sm = document.createElement('small');
      sm.textContent = n + ' chapters · about ' + Math.round(pages) + ' pages · from ' + m.sampled + ' sample pages in ' + PDF_PROFILES[mode].name + ' quality. The real size can differ by about a quarter.';
      // WHY: add the size line to the dialog. HOW: appendChild puts the small text element in.
      box.appendChild(sm);
      // WHY: colour the box by danger level. HOW: sets data-level to huge (over 700 MB), big (over 300 MB) or empty; CSS reads
      // it. IMPROVE: use limits that depend on the device.
      box.dataset.level = total > 700 * MB ? 'huge' : total > 300 * MB ? 'big' : '';
      // WHY: the person may save space with a smaller quality. HOW: if the total is over 300 MB and the mode is not the
      // smallest, finds the next mode in the list and adds a tip text. IMPROVE: choose it automatically.
      if (total > 300 * MB && mode !== 'tiny') {                         // point to a smaller choice
        const next = PDF_MODES[PDF_MODES.indexOf(mode) + 1];
        sm.textContent += ' Tip: "' + PDF_PROFILES[next].name + '" would be about ' + fmtSize(totals[next]) + '.';
      }
      // WHY: one huge file can run out of memory. HOW: if over 400 MB and no split chosen, works out chapters per file so each
      // file is about 300 MB. IMPROVE: base it on free memory.
      if (total > 400 * MB && +rgSplit.value === 0 && n > 1) {         // suggest smaller files
        const per = Math.max(1, Math.floor(n / Math.ceil(total / (300 * MB))));
        // WHY: offer the split as a new choice in the drop-down. HOW: reuses the option with id rgAuto or creates it, sets its
        // value and text, selects it and refreshes the info text. IMPROVE: none needed.
        let o = $('#rgAuto'); if (!o) { o = document.createElement('option'); o.id = 'rgAuto'; rgSplit.appendChild(o); }
        o.value = per; o.textContent = 'a new file every ' + per + ' chapters (recommended, about ' + fmtSize(total * per / n) + ' each)';
        rgSplit.value = String(per); rangeInfo();
        // WHY: warn about big downloads. HOW: add a sentence saying files are split to save memory.
        sm.textContent += ' Big: split into several files so the device does not run out of memory.';
      }
    // WHY: if measuring failed, say so, but tell the person the download still works. HOW: only shows it if this is still
    // the latest estimate. IMPROVE: add a retry button.
    } catch (e) { if (tok === estToken) { box.textContent = 'Could not estimate the size (' + e.message + '). The download itself still works.'; } }
  }
  // WHY: stops many estimates when the person clicks quickly. HOW: debounce = cancel the old timer and wait 350 ms before
  // running. IMPROVE: none needed.
  const scheduleEstimate = () => { clearTimeout(estTimer); estTimer = setTimeout(estimate, 350); };

  // WHY: when from or to changes, the split and estimate must update. HOW: removes the auto option, resets split if its
  // option is gone, then refreshes info and estimate. IMPROVE: split this long line into steps.
  rgFrom.onchange = rgTo.onchange = () => { const o = $('#rgAuto'); if (o) o.remove(); if ($('#rgSplit').value && !$('#rgSplit').querySelector('option[value="' + rgSplit.value + '"]')) rgSplit.value = '0'; rangeInfo(); scheduleEstimate(); };
  // WHY: update the info line when the split changes. HOW: onchange runs rangeInfo. IMPROVE: none needed.
  rgSplit.onchange = rangeInfo;
  // WHY: remember the chosen quality and show its size. HOW: saves it in settings, applySettings stores it, estimate runs
  // at once because all sizes are measured. IMPROVE: none needed.
  $('#rgMode').onchange = e => { settings.pdfMode = e.target.value; applySettings(); estimate(); };   // round 11: all sizes are already measured, so it answers at once
  // WHY: the Make PDF button. HOW: builds a list of chapter numbers from to, then one item per chapter with its label,
  // url, title and any images already loaded (slice copies the list). IMPROVE: validate that the range is not empty.
  $('#rgGo').onclick = () => {
    const [a, b] = rangeValues(), per = +rgSplit.value;
    const idx = []; for (let i = a; i <= b; i++) idx.push(i);
    // WHY: describe each chosen chapter for the job. HOW: map turns an index into an object with its label and address.
    const items = idx.map(i => {
      const sec = secFor(i), c = R.chapters[i];
      return { idx: i, label: labelFor(i), no: chapNo(i), url: c.url, ctitle: c.title, hasNext: i + 1 < R.chapters.length, imgs: sec && sec._imgs ? sec._imgs.slice() : null };
    });
    // WHY: split the items into files. HOW: steps through the items by the chunk size (per, or all if 0) and pushes each
    // slice into parts. IMPROVE: write it as a small helper function.
    const parts = []; for (let k = 0; k < items.length; k += (per > 0 ? per : items.length)) parts.push(items.slice(k, k + (per > 0 ? per : items.length)));
    // WHY: a whole-manga single file gets a simpler file name. HOW: true if the range is the first to last chapter and there
    // is only one part. IMPROVE: none needed.
    const whole = a === 0 && b === R.chapters.length - 1 && parts.length === 1;
    // WHY: the dialog is done, so close it. HOW: close() hides the dialog, then the download job is queued with title,
    // parts, theme, mode and estimate. IMPROVE: show a message that the job started.
    $('#rangeDlg').close();
    queueDownload({ title: R.title, parts, whole, dark: settings.theme === 'dark', mode: $('#rgMode').value, est: lastEstimate && lastEstimate.mode === $('#rgMode').value ? lastEstimate.bytes : 0 });   // round 11: the chosen quality travels with the job
  };
  // WHY: the Cancel button. HOW: closes the dialog. IMPROVE: none needed.
  $('#rgCancel').onclick = () => $('#rangeDlg').close();

  /* ---------------------------------------------------------------
     12c. DOWNLOAD MANAGER + FLOATING DOCK  (round 7)
     WHY: downloading 50+ chapters takes minutes. It must NOT block reading, so:
          - a job works only from a SNAPSHOT (chapter addresses, labels, theme) and never reads the reading-mode
            state again, so you can scroll, jump, change chapters, even leave reading mode meanwhile;
          - it yields to the browser between pictures (sleep0) so scrolling stays smooth;
          - the progress is shown in a floating "dock" in the bottom corner that can be minimised to a small pill.
     HOW: jobs[] is the list. queueDownload() adds one, runQueue() runs them one after another (one at a time keeps
          memory and proxy use low). runJob() builds one PDF per "part" (a part = the chapters of one file).
          buildPart() fetches missing chapter pages, then every picture, in reading order, into one long strip per chapter.
          The dock shows: title, status line, progress bar and the size of the PDF as it grows.
     WHERE: dock markup = index.html #dock; styles = style.css "DOWNLOAD DOCK".
     IMPROVE: pause / resume, a max-size limit per file, and save straight to disk (File System Access API). */
  // WHY: holds all download jobs in order. HOW: a plain array. IMPROVE: save jobs to storage so they survive a reload.
  const jobs = [];
  // WHY: jobSeq gives each job a unique id; queueRunning stops two queues running at once. HOW: simple variables. IMPROVE:
  // none needed.
  let jobSeq = 0, queueRunning = false;
  /* DOWNLOAD DIARY + REPORT (round 10)
     WHY: a download once stopped after 2 of 10 chapters with no message. Now every step is written to a short diary (job.log), a watchdog
          notices when nothing has happened for 90 seconds, and ANY failure opens the big pop-up with this report to send to Claude.
     HOW: jlog() adds a line with the seconds since the start; jobReport() = the job's facts + the last 45 diary lines + memory use. */
  // WHY: write one line in the job diary with the seconds since the start. HOW: pushes the text, and removes the oldest
  // line when there are more than 200. IMPROVE: also save the diary to a file.
  const jlog = (job, msg) => { job.log.push('+' + Math.round((Date.now() - job.t0) / 1000) + 's ' + msg); if (job.log.length > 200) job.log.shift(); };
  // WHY: builds the report the person can copy and send for help. HOW: reads memory use if the browser gives it, then
  // joins facts (status, chapters, size, speed, routes, failures) and the last 45 diary lines with new lines. IMPROVE: add
  // the browser name.
  function jobReport(job) {
    const mem = performance && performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) + ' MB used of ' + Math.round(performance.memory.jsHeapSizeLimit / 1048576) + ' MB' : 'not reported by this browser';
    return ['Download job #' + job.id + ' · status: ' + job.status + (job.stalled ? ' (STALLED)' : ''),
      // WHY: a progress line for the job log. HOW: the manga name and how many chapters are finished.
      'Manga: ' + job.spec.title + ' · chapters done: ' + job.doneCh + ' of ' + job.total,
      'Now: ' + job.text, 'PDF size so far: ' + fmtSize(job.bytes) + ' · picture quality: ' + (job.spec.mode || settings.pdfMode) + (job.spec.est ? ' · estimated total was ' + fmtSize(job.spec.est) : ''),
      'Speed: ' + job.pageN + ' pages in ' + Math.round((Date.now() - job.t0) / 1000) + ' s' + (job.pageN ? ' (' + (job.pageN * 60000 / Math.max(1, Date.now() - job.t0)).toFixed(1) + ' pages/min)' : ''),
      // WHY: show which routes worked in the job report. HOW: routeStatText() lists ok and failed counts per route.
      'Routes: ' + routeStatText(),
      'Failed pages/chapters: ' + job.failed.length + ' · pictures added OK: ' + (job.okTotal || 0), 'Browser memory (JS heap): ' + mem, '--- diary (latest last) ---']
      .concat(job.log.slice(-45), job.failed.length ? ['--- failed ---'].concat(job.failed.slice(0, 40)) : []).join('\n');
  }
  // WHY: gives the browser a moment to draw and scroll. HOW: waits 0 ms inside a promise, which lets other tasks run
  // first. IMPROVE: none needed.
  const sleep0 = () => new Promise(r => setTimeout(r, 0));
  // WHY: a wait that can be stopped. HOW: loops in 250 ms steps until the time is over and throws 'cancelled' if the job
  // was cancelled. IMPROVE: use an abort signal.
  const waitFor = async (job, ms) => { const end = Date.now() + ms; while (Date.now() < end) { if (job.cancel) throw new Error('cancelled'); await new Promise(r => setTimeout(r, 250)); } };   // a wait you can cancel
  // WHY: shows bytes in a friendly unit. HOW: nested ternary picks GB, MB or KB and rounds. IMPROVE: none needed.
  const fmtSize = b => b >= 1073741824 ? (b / 1073741824).toFixed(2) + ' GB' : b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';
  // WHY: the floating download panel element, found once. HOW: $ is querySelector. IMPROVE: none needed.
  const dock = $('#dock');

  // WHY: adds a new download job to the list. HOW: counts all chapters in all parts and creates a job object that stores
  // status, progress, files, failures, diary and timers. IMPROVE: use a class for jobs.
  function queueDownload(spec) {
    const total = spec.parts.reduce((n, p) => n + p.length, 0);
    const job = { id: ++jobSeq, spec, status: 'queued', cancel: false, total, doneCh: 0, frac: 0, bytes: 0, text: 'Waiting in the queue…', files: [], failed: [], el: null, log: [], pageN: 0, deadRun: 0, t0: Date.now(), tick: Date.now(), stalled: false };
    // WHY: store the job so the dock can show it. HOW: push adds to the end. IMPROVE: none needed.
    jobs.push(job);
    // ROUND 8: while you READ the dock starts minimised (a small round button above the keys) so nothing covers the
    // page. Outside reading mode it opens so you can see the progress.
    // WHY: while reading, keep the dock small so it does not cover the page. HOW: if the reader is hidden the dock opens,
    // else it shrinks and a toast explains. IMPROVE: let the person choose.
    if (reader.hidden) dock.classList.remove('min'); else { dock.classList.add('min'); toast('Download started. Keep reading: the round button above the keys shows the progress.'); }
    // WHY: show the new job and start working. HOW: renderDock draws the list, runQueue starts the jobs, and the job is
    // returned. IMPROVE: none needed.
    renderDock();
    runQueue();
    return job;
  }
  // WHY: runs jobs one at a time to save memory. HOW: returns at once if already running; the for loop finds the next
  // queued job and awaits it; finally resets the flag even after an error. IMPROVE: allow 2 jobs at once on strong
  // devices.
  async function runQueue() {
    if (queueRunning) return;
    queueRunning = true;
    // WHY: run queued jobs one after another. HOW: take the first 'queued' job and wait for it; repeat until none is left.
    try { for (let j; (j = jobs.find(x => x.status === 'queued'));) await runJob(j); }
    finally { queueRunning = false; }
  }
  // WHY: runs one job from start to end. HOW: sets the status to running and shows it. IMPROVE: split into setup, build
  // and finish functions.
  async function runJob(job) {
    job.status = 'running'; job.text = 'Starting…'; paintJob(job); jlog(job, 'job started');
    announce({ type: 'download', title: job.spec.title, chapter: job.total + ' chapter' + (job.total === 1 ? '' : 's') + ' · ' + (job.spec.mode || settings.pdfMode), url: (job.spec.parts[0] && job.spec.parts[0][0] && job.spec.parts[0][0].url) || '', host: '' });   // round 13
    // WATCHDOG: no progress for 90 s -> one pop-up with the report (the download keeps trying; you can Cancel it).
    // WHY: a watchdog that notices a stuck download. HOW: every 5 seconds it checks time since the last progress; after 90 s
    // it marks the job stalled, logs and shows an error with the report. Below 90 s it clears the stalled flag. IMPROVE: let
    // the person set the time.
    const dog = setInterval(() => {
      const idle = Date.now() - job.tick;
      if (job.status === 'running' && idle > 90000 && !job.stalled) {
        // WHY: a job that does nothing for 90 s is marked stalled and logged. HOW: flags the job and writes the reason to its
        // log.
        job.stalled = true; jlog(job, 'STALL: nothing happened for 90 s');
        showError('The download looks stuck', { title: '\u23F3 Download not moving', hint: 'Nothing has progressed for 90 seconds. The site or proxy may be slow or have blocked you, or the device is short of memory. It keeps trying; press Cancel in the download list to stop it. Copy the report and send it to Claude.', details: jobReport(job) });
      } else if (idle < 90000) job.stalled = false;
    // WHY: check again in 5 seconds. HOW: the timer value is the last argument of setTimeout.
    }, 5000);
    // WHY: build the PDF files. HOW: for each part, buildPart makes the file, it is stored in job.files and saved to the
    // device. IMPROVE: let the person choose a folder.
    try {
      for (let p = 0; p < job.spec.parts.length; p++) {
        const f = await buildPart(job, job.spec.parts[p], p);
        // ROUND 18: a PDF without a single picture is useless (and its small size would "not match" the estimate). Say so instead of saving it.
        if (!f.ok) throw Object.assign(new Error('not one picture could be downloaded, so no PDF was saved'), { fatal: true });
        // WHY: keep finished files and save each to the device. HOW: push to the job's list, then saveFile starts the browser
        // download.
        job.files.push(f); saveFile(f);
      }
      // WHY: mark success. HOW: sets status done, progress to 100 percent, all chapters done. IMPROVE: none needed.
      job.status = 'done'; job.frac = 1; job.doneCh = job.total;
      // WHY: total size of all files. HOW: reduce adds up each file size. IMPROVE: reuse this size at line 2305.
      const size = job.files.reduce((n, f) => n + f.size, 0);
      // WHY: compare the estimate and the real size, to improve estimates later. HOW: writes a diary line if there was an
      // estimate. IMPROVE: use the variable size above instead of adding again.
      if (job.spec.est) jlog(job, 'estimated ' + fmtSize(job.spec.est) + ', real ' + fmtSize(job.files.reduce((n, f) => n + f.size, 0)));
      // WHY: final status text. HOW: warns if pages are missing, otherwise shows a check mark, then adds file count and size.
      // IMPROVE: none needed.
      job.text = (job.failed.length ? '⚠ Saved, but ' + job.failed.length + ' page(s)/chapter(s) are missing (marked inside the PDF). ' : '✓ Saved. ') +
        job.files.length + ' file' + (job.files.length === 1 ? '' : 's') + ' · ' + fmtSize(size) + (job.spec.est ? ' (estimate was ' + fmtSize(job.spec.est) + (job.failed.length ? '; the file is smaller when pages are missing' : '') + ')' : '');   // round 18: estimate next to the real size
      // WHY: show the final size in the dock. HOW: stores it in job.bytes. IMPROVE: none needed.
      job.bytes = size;
      // WHY: tell the person when the dock is small. HOW: if the dock is minimised a toast lists the file names. IMPROVE: add
      // a button to open the file.
      if (dock.classList.contains('min')) toast('PDF ready: ' + job.files.map(f => f.name).join(', '));
      // WHY: record the end in the diary. HOW: writes the number of failures. Then, if some failed, an error window with a
      // hint and the report is shown. IMPROVE: offer a retry for only the failed pages.
      jlog(job, 'job finished, ' + job.failed.length + ' failed');
      if (job.failed.length) showError(job.failed.length + ' page(s)/chapter(s) could not be downloaded and are marked inside the PDF', { title: '\u26A0 PDF saved with missing pages', hint: 'Everything else is in the PDF. Missing pages usually mean the picture host refuses outside readers (hotlink protection) or the site slowed you down. Use your own proxy (worker.js sends the right referer), wait a few minutes, then download those chapters again.', details: jobReport(job) });
    // WHY: handle cancel and real errors. HOW: sets status to cancelled or error and a matching text, logs it, and shows the
    // error window only for real errors. IMPROVE: keep partial files when possible.
    } catch (e) {
      job.status = e.message === 'cancelled' ? 'cancelled' : 'error';
      job.text = e.message === 'cancelled' ? 'Cancelled' : 'Failed: ' + e.message;
      // WHY: record why a job stopped. HOW: write the error message in the job log.
      jlog(job, 'STOPPED: ' + e.message);
      if (job.status === 'error') showError('PDF download failed: ' + e.message, { title: '\u26A0 PDF download stopped', hint: 'If the message says the pictures cannot be downloaded: the picture host refuses the download (hotlink protection, expired addresses or blocked proxies). 1) Settings > Troubleshoot > Test proxies. 2) Upload the NEW worker.js (round 18) to your Cloudflare Worker: it tries other Referer values. 3) Copy the report and send it to Claude with MANGAFLOW.md.', details: jobReport(job) + '\n--- error ---\n' + (e.stack || e.message) });
    // WHY: always stop the watchdog, whatever happened. HOW: finally runs after try and catch; clearInterval stops the
    // timer. IMPROVE: none needed.
    } finally { clearInterval(dog); }
    // WHY: let the big PDF object be freed from memory. HOW: sets it to null. Then the dock is redrawn. IMPROVE: none
    // needed.
    job.pdf = null;
    renderDock();
  }

  // WHY: gets the picture addresses of one chapter. HOW: uses the list already known if there is one; otherwise tries
  // twice to fetch the page and read the images. IMPROVE: wait a little between tries.
  async function chapterImages(it, job, fresh) {       // picture addresses of a chapter (from reading mode, or fetched now). fresh = ignore what is saved and read the page again (round 18)
    if (!fresh && it.imgs && it.imgs.length) return it.imgs;
    if (fresh) { cache.delete(it.url); cache.delete(it.url.split('#')[0]); }   // ROUND 18: picture addresses can expire (signed links); a saved copy of the chapter page would give the same dead ones
    let last;
    // WHY: try twice to read a chapter's pictures. HOW: a loop of two attempts; the first success returns.
    for (let t = 0; t < 2; t++) {
      if (job.cancel) throw new Error('cancelled');
      try {
        // WHY: download the chapter page. HOW: fetchDoc returns the page document and its base address. Then chapterPictures reads
        // picture links; if none, probeNumbered guesses numbered picture names. Returns the first list that works. IMPROVE: log
        // which method worked.
        const { doc, base } = await fetchDoc(it.url);
        // ROUND 28: the same completion as the reader (chapterPictures): empty picture slots, page text, scripts, numbered pictures (never for a sealed page).
        const found = await chapterPictures(doc, base, it.url), imgs = found.list;
        if (found.partial) jlog(job, 'Chapter ' + (it.label || it.no || '?') + ': only ' + imgs.length + ' of ' + found.total + ' pictures could be found' + (found.sealed ? ' (the site hides the rest on purpose)' : ''));
        // WHY: stop as soon as pictures were found. HOW: return them.
        if (imgs.length) return imgs;
        // WHY: remember why this try failed. HOW: stores an error in last. The catch below stores thrown errors; after two tries
        // the last error is thrown. IMPROVE: none needed.
        last = found.rejected ? noImagesError(doc, base, found.rejected, it.url) : new Error('no pictures found');   // round 30: say WHY when the page was a login wall or the main page
      } catch (e) { last = e; }
    }
    // WHY: both tries failed. HOW: throw the last error so the caller reports it.
    throw last;
  }

  // WHY: builds one PDF file from a group of chapters. HOW: takes the job settings, creates a new PDF object, keeps it on
  // the job, and picks a white or black background by theme. IMPROVE: break into smaller functions.
  async function buildPart(job, items, partNo) {
    const spec = job.spec, dark = spec.dark;
    const pdf = new MangaPDFLib.MangaPDF({ title: spec.title });
    // WHY: remember the PDF being built on the job. HOW: so Stop can finish or drop it.
    job.pdf = pdf;
    const bg = dark ? [0, 0, 0] : [255, 255, 255];
    // WHY: download several pictures ahead to be faster. HOW: AHEAD = 8 pictures at the same time, but they are added to the
    // PDF in order. mode = the quality. nextList stores the next chapter's picture list. IMPROVE: tune AHEAD by speed.
    const AHEAD = 6;                                         // round 12: 6 ahead (round 11 had 8, round 10 had 3); the self-tuning limit lowers the real parallel count when the network struggles
    const mode = spec.mode || settings.pdfMode;              // the quality chosen when the download started
    const nextList = {};                                     // chapter number -> promise of its picture list (fetched while the chapter before it downloads)
    // WHY: counts chapters that crashed in a row. HOW: a number, reset after each success. IMPROVE: none needed.
    let crashes = 0, okPages = 0;                            // round 18: okPages = pictures really put into this PDF
    // ROUND 10: one chapter that crashes unexpectedly no longer ends the whole download: it is marked missing and the next one goes on.
    // Three crashes in a row stop the job (something is badly wrong, e.g. memory) and the report pop-up appears.
    // WHY: processes one chapter. HOW: checks for cancel, writes the diary, shows the status, adds a bookmark with the
    // chapter label and starts a new strip (one long PDF page). IMPROVE: none needed.
    const doChapter = async n => {
      const it = items[n], label = it.label;
      if (job.cancel) throw new Error('cancelled');
      // WHY: log the start of each chapter. HOW: jlog adds a time-stamped line to the job log.
      jlog(job, 'start ' + label);
      job.text = label + ' · getting the chapter page…'; job.bytes = pdf.size; paintJob(job);
      pdf.bookmark(label);
      // WHY: start the PDF for one chapter as one tall page. HOW: pdfmaker.js strip(); bg is the background colour.
      const strip = pdf.strip({ bg });
      // WHY: will hold the picture addresses. HOW: tries the list prefetched in nextList first, else fetches it now. IMPROVE:
      // none needed.
      let urls = null;
      try {
        const pre = nextList[n], got = pre ? await pre : null;          // round 11: the list may already be fetched
        // WHY: use the picture list found earlier, or look it up now. HOW: 'got' is the cached list.
        urls = got && got.u ? got.u : await chapterImages(it, job);
      }
      // WHY: if the list cannot be fetched, the chapter is marked as missing and the job goes on. HOW: rethrows cancel,
      // records the failure, draws a text page saying so, closes the strip and returns. IMPROVE: retry later.
      catch (e) {
        if (e.message === 'cancelled') throw e;
        job.failed.push(label + ': ' + e.message);
        // WHY: a title page for the chapter in the PDF. HOW: addTextPage draws text lines on a small page.
        await addTextPage(strip, 800, 320, [{ text: label, size: 0.05, y: 0.4, bold: true }, { text: 'This chapter could not be loaded', size: 0.03, y: 0.62, muted: true }], null, false, dark);
        jlog(job, label + ' chapter page failed: ' + e.message);
        strip.end(); job.doneCh++; return;
      }
      // WHY: prefetch the next chapter's list while this one downloads. HOW: starts the promise and turns its result into an
      // object with u (list) or e (error) so it never throws. IMPROVE: none needed.
      if (n + 1 < items.length && !nextList[n + 1]) nextList[n + 1] = chapterImages(items[n + 1], job).then(u => ({ u }), e => ({ e }));   // round 11
      // WHY: pics holds the pending downloads by page number. HOW: a Map = list of key/value pairs. start(k) begins
      // downloading page k if not started; the next line starts the first 8. IMPROVE: none needed.
      const pics = new Map();
      const start = k => { if (k < urls.length && !pics.has(k)) pics.set(k, fetchBytes(urls[k], job, it.url).then(b => ({ b }), e => ({ e }))); };
      // ROUND 18 - PROBE THE CHAPTER FIRST. WHY: when every route fails (picture host blocks downloads, addresses expired) the old code still walked through all pages,
      //   waited 4 s + 12 s per page for retries, and then saved a PDF made only of "could not be downloaded" blocks (1 MB instead of the 242 MB estimate).
      // HOW: page 1 is downloaded alone first. If it fails, the chapter page is read AGAIN without the saved copy (fresh addresses) and page 1 is tried once more.
      //   Still failing = the chapter is marked missing in ONE step (seconds, not minutes). Two such chapters in a row stop the job with a clear report
      //   (fatal) instead of producing an empty file. If page 1 works its bytes are reused (nothing is downloaded twice).
      // IMPROVE: probe a middle page too, and offer "retry only the missing chapters".
      if (urls.length) {
        const probe = async list => { try { return { b: await fetchBytes(list[0], job, it.url) }; } catch (e) { if (e.message === 'cancelled') throw e; return { e }; } };
        job.text = label + ' · testing the pictures…'; paintJob(job);
        let first = await probe(urls);
        if (first.e) {
          jlog(job, label + ': first picture failed (' + clipText(first.e.message, 120) + ') - reading the chapter page again');
          try { const again = await chapterImages({ url: it.url }, job, true); if (again && again.length) { urls = again; first = await probe(urls); } } catch (e2) { if (e2.message === 'cancelled') throw e2; }
        }
        if (first.e) {
          job.deadChapters = (job.deadChapters || 0) + 1;
          job.failed.push(label + ': none of the pictures can be downloaded (' + clipText(first.e.message, 200) + ')');
          await addTextPage(strip, 800, 360, [{ text: label, size: 0.05, y: 0.38, bold: true }, { text: 'The pictures of this chapter could not be downloaded', size: 0.028, y: 0.62, muted: true }], null, false, dark);
          strip.end(); job.doneCh++; job.frac = 0; jlog(job, label + ' skipped: every route failed for its pictures');
          if (job.deadChapters >= 2) throw Object.assign(new Error('the pictures of 2 chapters in a row cannot be downloaded: ' + clipText(first.e.message, 260)), { fatal: true });
          return;
        }
        job.deadChapters = 0; pics.set(0, Promise.resolve(first));
      }
      for (let k = 0; k < Math.min(AHEAD, urls.length); k++) start(k);
      // WHY: add every page in order. HOW: loop checks cancel, updates the progress, and waits for page k or a 150 second
      // timeout (Promise.race = first one to finish wins). Then it removes it and starts the page 8 ahead. IMPROVE: none
      // needed.
      for (let k = 0; k < urls.length; k++) {
        if (job.cancel) throw new Error('cancelled');
        job.frac = k / urls.length;
        // WHY: update the progress text. HOW: label, page number and chapter count are joined into one line.
        job.text = label + ' · page ' + (k + 1) + ' of ' + urls.length + ' · chapter ' + (job.doneCh + 1) + ' of ' + job.total;
        job.bytes = pdf.size; paintJob(job);
        let r = await Promise.race([pics.get(k), new Promise(res => setTimeout(() => res({ e: new Error('the picture took longer than 150 s') }), 150000))]);   // round 10: never wait forever
        // WHY: free the finished picture and fetch one further ahead. HOW: delete it from the map, then start the picture AHEAD
        // places later.
        pics.delete(k); start(k + AHEAD);
        // ROUND 11: a picture that failed gets up to 2 more tries after a pause (4 s, 12 s) before a "missing" block is written.
        // If the last 5 pages in a row failed even after that, the host is down: no more waiting (deadRun).
        // WHY: retry failed pictures. HOW: up to 2 more tries after waiting 4 s then 12 s, but not if the last 5 pages in a row
        // failed (the host is down). IMPROVE: use growing waits on every try.
        for (let t = 0; t < 2 && r.e && r.e.message !== 'cancelled' && job.deadRun < 5; t++) {
          jlog(job, label + ' p' + (k + 1) + ' retry ' + (t + 1) + ' after: ' + String(r.e.message).slice(0, 90));
          job.text = label + ' · page ' + (k + 1) + ' of ' + urls.length + ' · trying again…'; paintJob(job);
          // WHY: pause while the person has paused, or between retries. HOW: waitFor(job, ms) sleeps but wakes early on Stop.
          await waitFor(job, t ? 12000 : 4000);
          r = await withLimit(fetchBytes(urls[k], job, it.url), 100000, 'retry took longer than 100 s').then(b => ({ b }), e => ({ e }));   // ROUND 12: hard limit
        }
        // WHY: track how healthy the host is. HOW: deadRun goes up on a failure and back to 0 on success; pageN counts pages.
        // Then err keeps the error message. IMPROVE: none needed.
        job.deadRun = r.e ? job.deadRun + 1 : 0; job.pageN++;
        let err = r.e && r.e.message;
        // WHY: put the picture in the PDF. HOW: addPageImage encodes it; a decode error becomes the message.
        // ROUND 38: when translate.js has already translated this page, use addPageImageWithTranslation so the
        //   translated text appears in the downloaded PDF. HOW: find the <img> element that is showing this URL
        //   (currentSrc or src match), then pass it to addPageImageWithTranslation. If not found or not translated,
        //   falls back to the normal addPageImage path. IMPROVE: pre-translate all pages before the download starts.
        if (r.b) {
          try {
            // WHY: find the page <img> in the DOM to retrieve its translate.js data. HOW: match by currentSrc or src.
            const pageImgEl = document.querySelector('#stream img.page[src="' + CSS.escape(urls[k]) + '"]') ||
              [...document.querySelectorAll('#stream img.page')].find(i => (i.currentSrc || i.src) === urls[k]);
            await addPageImageWithTranslation(strip, r.b, mode, pageImgEl || null);
          }
          catch (e) { err = 'could not decode the picture (' + e.message + ')'; }
        }
        if (r.b && !err) { okPages++; job.okTotal = (job.okTotal || 0) + 1; }    // round 18
        // WHY: never skip a failed page silently. HOW: cancel is rethrown; otherwise it is logged and a text page 'could not be
        // downloaded' is added so page numbers stay right. IMPROVE: none needed.
        if (err) {                                           // never skip silently
          if (err === 'cancelled') throw new Error('cancelled');
          job.failed.push(label + ', page ' + (k + 1) + ': ' + err); jlog(job, label + ' p' + (k + 1) + ' failed: ' + err);
          // WHY: a page that says a picture is missing. HOW: addTextPage draws the message at a sensible width.
          await addTextPage(strip, Math.max(400, Math.min(strip.maxWidth || 800, 4000)), 320, [
            { text: label + ' · page ' + (k + 1), size: 0.045, y: 0.40, bold: true },
            { text: 'This page could not be downloaded', size: 0.03, y: 0.62, muted: true }], null, false, dark);
        }
        // WHY: lets the browser draw and scroll between pages so the app does not freeze. HOW: awaits sleep0. IMPROVE: none
        // needed.
        await sleep0();                                      // let the browser scroll / draw: reading stays smooth
      }
      // Title block (top) and "End of" block (bottom), like in reading mode.
      // WHY: at the end of the chapter, add title and end blocks like in reading mode. HOW: width follows the strip but stays
      // between 400 and 4000; head holds the manga name and chapter label lines. IMPROVE: none needed.
      const w = Math.max(400, Math.min(strip.maxWidth || 800, 4000));
      const head = [
        { text: spec.title.toUpperCase(), size: 0.022, y: 0.24, muted: true },
        // WHY: the second text line of that page. HOW: part of the list given to addTextPage.
        { text: label, size: 0.058, y: 0.52, bold: true }];
      // WHY: add the chapter title only if it is useful. HOW: skip when it equals the label, is plain, or is 90+ characters
      // long. IMPROVE: none needed.
      if (it.ctitle && it.ctitle.toLowerCase().replace(/\s+/g, ' ') !== label.toLowerCase() && !isPlainTitle(it.ctitle) && it.ctitle.length < 90)
        head.push({ text: it.ctitle, size: 0.03, y: 0.80, muted: true });
      // WHY: draw the title page and the End of block. HOW: addTextPage makes a canvas picture and adds it to the strip; the
      // end text says whether a next chapter follows. Then the strip closes and progress counts one more chapter. IMPROVE:
      // none needed.
      await addTextPage(strip, w, Math.round(w * 0.27), head, 'bottom', true, dark);
      await addTextPage(strip, w, Math.round(w * 0.15), [
        { text: 'End of ' + label + (it.hasNext ? ' · next chapter follows' : ''), size: 0.028, y: 0.5, muted: true }], 'top', false, dark);
      // WHY: finish the PDF strip. HOW: end() writes the closing part of the file.
      strip.end();
      job.doneCh++; job.frac = 0;
      jlog(job, 'finished ' + label + ' · pdf ' + fmtSize(pdf.size));
    };
    // WHY: runs all chapters. HOW: each chapter is tried; success resets the crash count. IMPROVE: none needed.
    for (let n = 0; n < items.length; n++) {
      try { await doChapter(n); crashes = 0; }
      // WHY: one broken chapter must not stop all. HOW: cancel is rethrown; otherwise it is recorded and logged; after 3
      // crashes in a row the whole job stops. IMPROVE: none needed.
      catch (e) {
        if (e.message === 'cancelled' || e.fatal) throw e;      // round 18: a fatal error (pictures unreachable) stops the job at once
        crashes++; job.failed.push(items[n].label + ': unexpected error: ' + e.message);
        // WHY: one chapter crashed; log it and go on. HOW: write the chapter label, message and a short stack to the log.
        jlog(job, 'CRASH in ' + items[n].label + ': ' + e.message + (e.stack ? ' @ ' + String(e.stack).split('\n')[1] : ''));
        if (crashes >= 3) throw new Error('3 chapters in a row failed unexpectedly (last: ' + e.message + ')');
        job.doneCh++; job.frac = 0;
      }
    }
    // WHY: finish the PDF file. HOW: shows 'Saving', pdf.finish makes a blob (file in memory), builds a name from the title
    // and chapter range, returns name, blob, size and a temporary url. IMPROVE: none needed.
    job.text = 'Saving the file…'; job.bytes = pdf.size; paintJob(job);
    const blob = pdf.finish();
    const range = items.length === 1 ? items[0].label : 'Chapters ' + items[0].no + '-' + items[items.length - 1].no;
    // WHY: a safe file name. HOW: title (and the range when not the whole manga) + .pdf; fileSafe removes forbidden
    // characters.
    const name = fileSafe(spec.title) + (spec.whole ? '' : ' - ' + range) + '.pdf';
    return { name, blob, size: blob.size, ok: okPages, url: URL.createObjectURL(blob) };
  }
  // WHY: gives the file to the person. HOW: makes a hidden link with the download name, clicks it, removes it. IMPROVE:
  // use the File System Access API to save to a folder.
  function saveFile(f) {
    const a = document.createElement('a'); a.href = f.url; a.download = f.name;
    document.body.appendChild(a); a.click(); a.remove();
  }

  /* ---- the dock (floating list) ---- */
  // WHY: builds one row in the dock for a job. HOW: creates a list item with a title, size, progress bar, text and button
  // area. The title is set with textContent (safe) and includes the chapter range. IMPROVE: none needed.
  function jobEl(job) {
    const li = document.createElement('li'); li.className = 'dl-job';
    li.innerHTML = '<div class="dj-top"><b class="dj-title"></b><span class="dj-size"></span></div>' +
      // WHY: the HTML of one job row (progress bar, text, buttons). HOW: a template text; values are added with textContent
      // later.
      '<div class="dl-bar"><i></i></div><div class="dj-text small muted"></div><div class="dj-btns"></div>';
    $('.dj-title', li).textContent = job.spec.title + (job.spec.whole ? '' : ' (' + job.spec.parts[0][0].no + ' – ' + job.spec.parts[job.spec.parts.length - 1].slice(-1)[0].no + ')');
    job.el = li; return li;
  }
  // WHY: updates a job row. HOW: records the time for the watchdog, works out percent (max 99 until done), sets the bar
  // width, text, size and status, then refreshes the round button. IMPROVE: none needed.
  function paintJob(job) {
    job.tick = Date.now();                              // round 10: the watchdog reads this ("something happened just now")
    if (!job.el) return;
    // WHY: the percentage shown. HOW: 100 when done, otherwise chapters done plus the fraction of this chapter, capped at
    // 99.
    const pct = job.status === 'done' ? 100 : Math.min(99, Math.round((job.doneCh + job.frac) / Math.max(1, job.total) * 100));
    job.pct = pct;
    $('.dl-bar i', job.el).style.width = pct + '%';
    // WHY: show the job's latest text. HOW: textContent (never HTML).
    $('.dj-text', job.el).textContent = job.text;
    $('.dj-size', job.el).textContent = job.status === 'queued' ? 'queued' : fmtSize(job.bytes) + (job.status === 'running' ? ' so far' : '');
    job.el.dataset.status = job.status;
    paintPill();
  }
  // WHY: updates the small round button. HOW: finds running or queued jobs, sets the progress circle, label, count and the
  // busy, done or err style. IMPROVE: none needed.
  function paintPill() {
    const active = jobs.filter(j => j.status === 'running' || j.status === 'queued');
    const run = jobs.find(j => j.status === 'running');
    // WHY: the small round download button. HOW: found by its id.
    const pill = $('#dockIcon');
    pill.style.setProperty('--p', run ? run.pct : (jobs.length && !active.length ? 100 : 0));
    $('#dockLabel').textContent = run ? run.pct + '% · ' + fmtSize(run.bytes) : active.length ? 'queued' : jobs.some(j => j.status === 'done') ? 'PDF ready' : 'Downloads';
    // WHY: the small number on the download button. HOW: how many jobs are active, or nothing.
    $('#dockCount').textContent = active.length ? active.length : '';
    pill.classList.toggle('busy', !!active.length);
    pill.classList.toggle('done', !active.length && jobs.some(j => j.status === 'done'));      // round 8: green when a PDF is ready
    pill.classList.toggle('err', !active.length && !jobs.some(j => j.status === 'done') && jobs.some(j => j.status === 'error'));
  }
  // WHY: shows the dock when there are jobs or when reading. HOW: hidden is true only when no jobs and not in reader.
  // IMPROVE: none needed.
  const syncDock = () => { dock.hidden = !jobs.length && reader.hidden; };   // round 10: visible whenever you are reading (idle = a small round button)
  // WHY: redraws the whole job list. HOW: adds rows for new jobs, then rebuilds each job's buttons (Cancel, Save, X) and
  // paints it. IMPROVE: only update what changed.
  function renderDock() {
    syncDock();
    const ul = $('#dockList');
    // WHY: add rows for new jobs. HOW: a job without an element gets one, placed at the top.
    jobs.forEach(j => { if (!j.el) ul.prepend(jobEl(j)); });
    jobs.forEach(j => {
      const btns = $('.dj-btns', j.el); btns.innerHTML = '';
      // WHY: a helper that adds one button to the proxy menu. HOW: creates a button element and sets its type and text.
      const add = (text, fn) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = text; b.onclick = fn; btns.appendChild(b); };
      if (j.status === 'running' || j.status === 'queued') add('Cancel', () => { j.cancel = true; if (j.status === 'queued') { j.status = 'cancelled'; j.text = 'Cancelled'; } renderDock(); });
      if (j.status === 'done') j.files.forEach(f => add('Save ' + (j.files.length > 1 ? f.name.replace(/^.* - /, '') : 'again'), () => saveFile(f)));
      if (j.status !== 'running' && j.status !== 'queued') add('✕', () => { j.files.forEach(f => URL.revokeObjectURL(f.url)); j.el.remove(); jobs.splice(jobs.indexOf(j), 1); renderDock(); });
      paintJob(j);
    });
    syncDock();
    paintPill();
  }
  // WHY: the round button does two things. HOW: with no jobs it opens the range dialog; otherwise it toggles minimised.
  // IMPROVE: none needed.
  $('#dockIcon').onclick = () => { if (!jobs.length) { openRangeDialog(); return; } dock.classList.toggle('min'); };   // idle button = open the download window
  // WHY: the minimise button of the dock. HOW: adds the 'min' class. IMPROVE: none needed.
  $('#dockMin').onclick = () => dock.classList.add('min');
  // Closing the tab while a PDF is being made would lose it: ask first.
  // WHY: closing the tab while making a PDF would lose it. HOW: if a job is running or queued, the browser shows a leave
  // warning. IMPROVE: none needed.
  window.addEventListener('beforeunload', e => { if (jobs.some(j => j.status === 'running' || j.status === 'queued')) { e.preventDefault(); e.returnValue = ''; } });

  /* ---------------------------------------------------------------
     13. SEARCH BAR FOR SMALL SCREENS (floating bar)
     WHY: on a phone the long address bar was squeezed next to six buttons and showed almost nothing.
          On narrow screens (CSS media query, 760px) the wide input is hidden and a "pill" takes the full row.
          Tapping the pill opens a floating bar with a big input, a Paste button and a Go button.
     HOW: both inputs call the same navigate(). The popup closes on Go, on Esc, or when you tap outside.
     IMPROVE: show suggestions (history) under the input; add a "search engine" switch. */
  // WHY: opens the floating search bar on phones. HOW: unhides the popup and shade, fills the input with the current
  // address, focuses and selects it. IMPROVE: none needed.
  function openSearch() {
    $('#searchPop').hidden = false; $('#popShade').hidden = false;
    const i = $('#addr2'); i.value = cur ? cur.url : ''; i.focus(); i.select();
  }
  // WHY: closes the floating search bar. HOW: hides the popup and the shade. IMPROVE: none needed.
  function closeSearch() { $('#searchPop').hidden = true; $('#popShade').hidden = true; }

  /* ---------------------------------------------------------------
     14. EVENT WIRING
     WHY: one place that connects every button/key to the functions above.
     IMPROVE: add touch gestures (swipe from edge = prev/next chapter) and a keyboard help
              overlay (press "?"). */
  // WHY: the address bar Enter key. HOW: stops the page reload, calls navigate with the text, then removes focus. IMPROVE:
  // none needed.
  $('#addrForm').addEventListener('submit', e => { e.preventDefault(); navigate($('#addr').value, true, { user: true }); $('#addr').blur(); });
  // WHY: the address form inside the reader. HOW: stops reload, calls readerGo with the text and drops focus. IMPROVE:
  // none needed.
  $('#rdForm').addEventListener('submit', e => { e.preventDefault(); readerGo($('#rdAddr').value); $('#rdAddr').blur(); });
  // WHY: the small pill on phones opens the search popup. HOW: sets onclick to openSearch. IMPROVE: none needed.
  $('#addrPill').onclick = openSearch;
  // WHY: tapping outside closes the popup. HOW: the dark shade calls closeSearch. IMPROVE: none needed.
  $('#popShade').onclick = closeSearch;
  // WHY: Go in the popup. HOW: reads the text, closes the popup, then navigates. IMPROVE: none needed.
  $('#popForm').addEventListener('submit', e => { e.preventDefault(); const v = $('#addr2').value; closeSearch(); navigate(v, true, { user: true }); });
  // WHY: paste button for phones. HOW: reads the clipboard; if the browser refuses, a toast shows how to paste by hand.
  // IMPROVE: none needed.
  // ROUND 17: the popup's paste button and clipboard arrow use the same helpers as the start page (pasteInto / openClip, defined in the start-page part below).
  $('#btnPaste').onclick = () => pasteInto($('#addr2'));
  $('#popClip').onclick = () => openClip($('#popClip'), $('#addr2'));
  // ROUND 39: back and forward buttons now call the browser's OWN history.back()/forward() instead of the old
  // goHist() (our separate, page-only stack). WHY: the owner asked for these two buttons to behave EXACTLY like
  // the browser's/device's own Back and Forward — stepping through chapters and pages the same way, not just pages.
  // Since every real navigation (pages, searches, chapters, Home) now also calls history.pushState (see
  // rememberView/rememberChapter above), the browser's native history already has the full, correct list to step
  // through; history.back()/forward() moving it fires 'popstate' (handled above), which puts the right screen back
  // up. HOW: none needed beyond this swap.
  $('#btnBack').onclick = () => history.back();
  $('#btnFwd').onclick = () => history.forward();
  // WHY: reload button. HOW: removes the cached copy then loads the page again. IMPROVE: none needed.
  $('#btnReload').onclick = () => { if (cur) { cache.delete(cur.url); navigate(cur.url, false); } };
  // WHY: home and star buttons. HOW: each button calls one function. IMPROVE: none needed.
  $('#btnHome').onclick = goHome;
  $('#btnStar').onclick = toggleBookmark;
  // WHY: theme buttons (dark/light). HOW: both call toggleTheme. IMPROVE: none needed.
  $('#btnThemeB').onclick = toggleTheme;
  $('#btnTheme').onclick = toggleTheme;
  // WHY: reader buttons. HOW: the read button starts reading; exit leaves reading mode; chapters button opens the menu
  // (stopPropagation keeps the document click from closing it at once). IMPROVE: none needed.
  $('#fabRead').onclick = () => startReading();
  $('#p2Prev').onclick = () => openNavTarget('prev'); $('#p2List').onclick = () => openNavTarget('list'); $('#p2Next').onclick = () => openNavTarget('next');   // ROUND 56
  $('#btnExit').onclick = exitReading;
  $('#btnChapters').onclick = e => { e.stopPropagation(); toggleMenu(); };
  // WHY: previous/next chapter and reload buttons. HOW: each calls its function. IMPROVE: none needed.
  $('#btnPrev').onclick = () => stepChapter(-1);
  $('#btnNext').onclick = () => stepChapter(1);
  // ROUND 12: the reload keys are gone; reloadCurrent / reloadEvery are called by the reload wheel (event mf-reload) and by the Troubleshoot buttons.
  // WHY: jump to end or top. HOW: End goes to the end; top marks the input as a person's action and scrolls to the top.
  // IMPROVE: none needed.
  $('#btnEnd').onclick = () => goEnd();
  $('#btnTopEnd').onclick = () => { markInput(); window.scrollTo({ top: 0 }); };
  // WHY: download buttons. HOW: both open the range dialog; the menu one closes the menu first. IMPROVE: none needed.
  $('#btnDl').onclick = openRangeDialog;
  $('#btnDlMenu').onclick = () => { closeMenu(); openRangeDialog(); };

  // Any sign that the PERSON is scrolling (not the page moving by itself) - see section 11.
  // WHY: tell the app that the PERSON is scrolling. HOW: for each event name, listens and calls markInput; passive true
  // promises not to block scrolling. IMPROVE: none needed.
  ['wheel', 'touchstart', 'touchmove', 'mousedown', 'pointerdown', 'keydown'].forEach(ev =>
    window.addEventListener(ev, markInput, { passive: true }));
  // WHY: react to scrolling. HOW: calls onScroll with a passive listener. IMPROVE: none needed.
  window.addEventListener('scroll', onScroll, { passive: true });

  // ROUND 41 FEATURE — hide the header while scrolling DOWN through MangaFlow's OWN start/search page, show it
  // again on scrolling UP, the same idea reading mode's own header already uses (see onScroll/showUi/hideUi
  // above), requested so the header does not take up screen space while scrolling a long list of search results.
  // WHY this can only work here, and NOT while browsing another manga site inside the iframe: this works by
  // listening for scroll events on #viewport, which is OUR OWN element — it fires normally for OUR OWN content
  // (the start page, search results, your reading lists). A site opened in the iframe instead scrolls INSIDE
  // that iframe's own separate document, which MangaFlow cannot read (a different, "cross-origin" website) and
  // whose own JavaScript is completely blocked by that page's Content-Security-Policy (script-src 'none' — a
  // deliberate security rule put there since round 8, see the renderFrame() comments far above) — so there is no
  // event, from either side, that could ever tell MangaFlow "the person just scrolled inside that other site".
  // That is a hard technical wall of the proxy design, not a bug, and is why this feature is scoped to our own
  // page only.
  // HOW: a small, self-contained copy of the up/down-accumulator idea the reading-mode header already uses, but
  // ROUND 44 NOTE: the next lines were first written believing the iframe (Page 2) scroll cannot be observed. That was wrong;
  //   Page 2 is handled by p2ScrollHook() next to hookDoc(). This block is for Page 1 (our own start page) only.
  // simpler — there is no "ignore the app's own scroll jumps" concern here (the start page never auto-scrolls
  // the way a reading chapter can), so every scroll is reacted to directly, no extra gating needed. See the
  // ".navbar" / ".navbar.mf-hide" rule in style.css for how the header actually animates away; updateNav() above
  // always clears this the moment you navigate anywhere, so it can never get stuck hidden on a different screen.
  (function navHideInit() {
    const nav = document.querySelector('.navbar'), vp = $('#viewport');
    if (!nav || !vp) return;
    let lastY = 0, upAcc = 0, downAcc = 0;
    vp.addEventListener('scroll', () => {
      if (!frame.hidden || !reader.hidden) { nav.classList.remove('mf-hide'); return; }   // only our own start/search page, never the iframe or reading mode
      const y = vp.scrollTop, dy = y - lastY; lastY = y;
      if (y < 40) { nav.classList.remove('mf-hide'); upAcc = downAcc = 0; return; }       // always visible near the very top
      if (dy < 0) { upAcc -= dy; downAcc = 0; if (upAcc > 14) nav.classList.remove('mf-hide'); }
      else if (dy > 0) { downAcc += dy; upAcc = 0; if (downAcc > 14) nav.classList.add('mf-hide'); }
    }, { passive: true });
  })();

  // WHY: handles taps on the page in reading mode. HOW: ignores clicks outside the reader, closes the chapter menu on
  // outside taps, and runs tapScroll when the stream is tapped and the option is on. IMPROVE: none needed.
  document.addEventListener('click', e => {
    if (reader.hidden) return;
    const menuWasOpen = !$('#chapterMenu').hidden;
    // WHY: close the chapter menu on an outside click. HOW: if the click was not inside the menu, closeMenu().
    if (!e.target.closest('#chapterMenu')) closeMenu();
    // Tap the page = scroll (option in Settings). The buttons are NOT shown again by a tap any more:
    // they return only when you scroll up (section 11).
    if (e.target.closest('#stream') && settings.tapScroll && !menuWasOpen) tapScroll(e);
  });

  /* KEYBOARD (round 8: End and Home keys added)
     WHY: the on-screen round keys have real-keyboard twins. When you press the real key the round key
          "presses down" too, so you can see it worked.
          Left / Right arrow = previous / next chapter, End = end of everything that is loaded, Home = top.
     HOW: keys are ignored while a dialog is open or while you type in a box (so the search bar in the reader works). */
  /* ROUND 9: asking for earlier chapters when the page cannot scroll any further up (a scroll event never comes then):
     wheel up, or a finger drag downwards, while at the very top; plus the "Load earlier chapters" button. */
  // WHY: load earlier chapters when already at the top. HOW: wheel up near the top while reading calls loadPrev. IMPROVE:
  // none needed.
  window.addEventListener('wheel', e => { if (!reader.hidden && e.deltaY < 0 && window.scrollY < 40) loadPrev(); }, { passive: true });
  // WHY: remember where a touch started. HOW: touchY0 is null until a touch begins; the next listener saves the first
  // finger y position. IMPROVE: none needed.
  let touchY0 = null;
  window.addEventListener('touchstart', e => {
    touchY0 = e.touches[0].clientY;
    // ROUND 41 FIX — see the long comment inside onScroll() above: hiding the header still requires a
    // "recent deliberate action" (markInput), which used to only come from an explicit tap-to-scroll.
    // Someone who reads by dragging their finger across the page (instead of tapping) never triggered
    // that, so for them the header could never hide at all while reading. A touch starting is just as
    // deliberate an action as a tap, so it marks input here too — this only affects HIDING (showing no
    // longer needs this gate at all, fixed above), and only while actually reading.
    if (!reader.hidden) markInput();
  }, { passive: true });
  // WHY: finger drag down at the top asks for earlier chapters. HOW: if the finger moved over 30 px down, resets touchY0
  // and calls loadPrev. IMPROVE: none needed.
  window.addEventListener('touchmove', e => { if (!reader.hidden && touchY0 != null && window.scrollY < 40 && e.touches[0].clientY - touchY0 > 30) { touchY0 = null; loadPrev(); } }, { passive: true });
  // WHY: Load earlier chapters button. HOW: holdUiFor keeps the keys visible for 1.5 s, then loadPrev runs. IMPROVE: none
  // needed.
  $('#btnPrevLoad').onclick = () => { holdUiFor(1500); loadPrev(); };
  // ROUND 10: the round "top" key (and the Home key) scroll smoothly to the top of everything that is loaded. holdUiFor keeps the keys visible.
  // WHY: The 'top' button should jump to the page start. HOW: holdUiFor(2500) keeps the toolbars visible for 2.5 seconds,
  // then scrollTo moves up smoothly. IMPROVE: use one shared helper for all scroll buttons.
  // ROUND 13: the Top key jumps at once (a smooth scroll over many long chapters stopped half way while pictures were still loading).
  // It then asks again on the next two frames, because lazy pictures can move the page, and loads earlier chapters if there are any.
  const goTop = () => { markInput(); holdUiFor(2500); window.scrollTo(0, 0); requestAnimationFrame(() => { window.scrollTo(0, 0); requestAnimationFrame(() => window.scrollTo(0, 0)); }); if (R.first > 0 && typeof loadPrev === 'function') loadPrev(); };
  $('#btnTop').onclick = goTop;
  // ROUND 10: the OPTIONAL chapter-slider.js add-on sends this event (dir = +1 next, -1 previous). Without the file nothing ever sends it.
  // WHY: Lets the optional slider add-on change chapter without app.js knowing about it. HOW: listens for a custom event;
  // ignores it if not reading or a dialog is open; dir > 0 means next, otherwise previous. IMPROVE: check that stepChapter
  // exists.
  window.addEventListener('mf-chapter-step', e => {
    if (reader.hidden || document.querySelector('dialog[open]')) return;
    holdUiFor(2500); stepChapter(e.detail && e.detail.dir > 0 ? 1 : -1);
  });
  // ROUND 11: the OPTIONAL reload-wheel.js add-on sends this event (scope 'current' = clockwise turn, 'all' = anti-clockwise turn).
  // WHY: Lets the optional reload-wheel add-on ask for a reload. HOW: same guards as above; scope 'all' reloads every open
  // chapter, anything else reloads only the current one. IMPROVE: share the guard check in one small function.
  window.addEventListener('mf-reload', e => {
    if (reader.hidden || document.querySelector('dialog[open]')) return;
    holdUiFor(2500);
    // WHY: the wheel asks for a reload. HOW: scope 'all' reloads every chapter, otherwise only the current one.
    if (e.detail && e.detail.scope === 'all') reloadEvery(); else reloadCurrent();
  });
  // WHY: Maps keyboard keys to the on-screen buttons they act like, so the button can flash when the key is pressed. HOW:
  // a plain object, key name (lowercase) -> CSS selector. IMPROVE: add more keys in the same table.
  const keyCaps = { arrowleft: '#btnPrev', arrowright: '#btnNext', end: '#btnEnd', home: '#btnTop' };
  // WHY: Shows a short 'pressed' look on a button when its key is used, so you see feedback. HOW: finds the button, adds
  // the class 'pressed', and removes it after 160 ms with setTimeout. IMPROVE: use a CSS animation instead of a timer.
  const pressCap = sel => { const cap = $(sel); if (cap) { cap.classList.add('pressed'); setTimeout(() => cap.classList.remove('pressed'), 160); } };
  // WHY: One place that handles all keyboard shortcuts. HOW: listens for keydown on the whole page. Escape closes the
  // search pop-up first and stops there. IMPROVE: split into small functions per key to make it easier to read.
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !$('#searchPop').hidden) { closeSearch(); return; }
    // ROUND 18: F11 does the same as the full-screen button (when the browser lets the page catch the key; otherwise the browser's own F11 works and body.fs follows it).
    if (e.key === 'F11' && settings.showFs !== false && fsSupported()) { e.preventDefault(); toggleFs(); return; }
    // Keys do nothing while a dialog (settings, download range, error) is open or while you type in a box.
    // WHY: Shortcuts must not fire while you type or while a dialog is open. HOW: returns early if not reading, a dialog is
    // open, or the focused element is an input, select or textarea (regex test on the tag name). IMPROVE: also ignore
    // contenteditable elements.
    if (reader.hidden || document.querySelector('dialog[open]') || /input|select|textarea/i.test(e.target.tagName)) return;
    // WHY: Prepare values used by the key checks below. HOW: k is the key in lowercase; plain is true only when no Alt,
    // Ctrl, Meta or Shift is held, so browser shortcuts like Ctrl+Home still work. IMPROVE: name them isPlainKey for
    // clarity.
    const k = e.key.toLowerCase();
    const plain = !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey;
    // WHY: The main shortcut list. HOW: an if / else-if chain; Escape closes the chapter menu if open, otherwise leaves
    // reading mode. IMPROVE: replace the chain with an object that maps keys to functions.
    // ROUND 53: Esc while the page is in browser full screen only LEAVES full screen (it used to also close reading mode and leave the screen stuck in full-screen styling).
    if (k === 'escape') { if (!$('#chapterMenu').hidden) closeMenu(); else if (fsApiEl()) { leaveFs(); setTimeout(syncFs, 150); } else exitReading(); }
    // WHY: Keyboard shortcut for chapters. HOW: n goes to the next chapter, p to the previous one (stepChapter(1) or -1).
    // IMPROVE: show the shortcuts in a help pop-up.
    else if (k === 'n') stepChapter(1);
    else if (k === 'p') stepChapter(-1);
    // WHY: Quick shortcuts for theme and chapter menu. HOW: t switches light/dark theme, c opens or closes the chapter menu.
    // IMPROVE: list them in the Settings dialog.
    else if (k === 't') toggleTheme();
    else if (k === 'c') toggleMenu();
    // WHY: End key should jump to the bottom of loaded chapters. HOW: only with no modifier keys; preventDefault stops the
    // browser's own scroll, pressCap flashes the button, goEnd scrolls down. IMPROVE: same pattern as Home, could share
    // code.
    else if (k === 'end' && plain) { e.preventDefault(); pressCap('#btnEnd'); goEnd(); }          // End = bottom of the loaded chapters
    // WHY: Home key jumps to the top. HOW: stops the browser default, flashes the button, scrolls to y=0, and if earlier
    // chapters exist (R.first > 0) loads the previous one. IMPROVE: wait for the scroll to finish before loading.
    else if (k === 'home' && plain) { e.preventDefault(); pressCap('#btnTop'); window.scrollTo({ top: 0 }); if (R.first > 0) loadPrev(); }
    // WHY: At the very top, the page cannot scroll, so no scroll event would load the previous chapter. HOW: Arrow Up or
    // Page Up while scrollY < 40 calls loadPrev() directly. IMPROVE: use an IntersectionObserver on the top edge.
    else if ((k === 'arrowup' || k === 'pageup') && plain && window.scrollY < 40) loadPrev();      // round 9: the page cannot scroll up, so no scroll event comes
    // WHY: Optional left/right arrow chapter navigation, turned on or off in Settings. HOW: if settings.arrowKeys is true
    // and no modifier is held, block the default, flash the matching button, then go next (right) or previous (left).
    // IMPROVE: allow remapping the keys.
    else if (settings.arrowKeys && (k === 'arrowright' || k === 'arrowleft') && plain) {
      e.preventDefault();                                                            // right arrow = next chapter, left arrow = previous
      pressCap(keyCaps[k]);
      // WHY: arrow keys change chapter. HOW: right = +1, left = -1.
      stepChapter(k === 'arrowright' ? 1 : -1);
    }
  });

  /* CLICK OUTSIDE = CLOSE (round 11)
     WHY: you had to hunt for the Close button of every floating window (settings, download window, report, troubleshooter).
     HOW: a dialog covers the screen with a dark backdrop; a click on the backdrop reports the dialog itself as the target and
          the position is outside its box. The press must START and END outside, so selecting text and letting go outside does not close it.
          The download dock (the floating list) goes back to its small round button when you press anywhere outside it.
     IMPROVE: animate the closing; keep the dock open when a job just failed. */
  // WHY: Make every dialog close when you click on the dark area outside it. HOW: loops over all dialog elements. downOut
  // remembers if the press started outside; outside() compares mouse position with the dialog box size. IMPROVE: add a
  // closing animation.
  $$('dialog').forEach(d => {
    let downOut = false;
    const outside = e => { const r = d.getBoundingClientRect(); return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom; };
    // WHY: Remember where the press started so selecting text and releasing outside does not close the dialog. HOW:
    // pointerdown stores true only if the target is the dialog itself (the backdrop) and the point is outside the box; click
    // then closes it. IMPROVE: handle touch drags too.
    d.addEventListener('pointerdown', e => { downOut = e.target === d && outside(e); });
    d.addEventListener('click', e => { if (downOut && e.target === d && outside(e)) d.close(); downOut = false; });
  });
  // WHY: The floating download dock should shrink back to its round button when you press elsewhere. HOW: a capturing
  // pointerdown listener on the document; it ignores presses inside the dock or a dialog, or when the dock is hidden or
  // already small. IMPROVE: keep it open if a job failed.
  document.addEventListener('pointerdown', e => {
    if (dock.hidden || dock.classList.contains('min') || e.target.closest('#dock') || e.target.closest('dialog')) return;
    dock.classList.add('min');
  // WHY: 'true' makes this listener run first (capture phase). HOW: addEventListener's third argument.
  }, true);

  // The big error pop-up: Close, and Copy report (so the full text can be pasted to Claude).
  // WHY: Buttons of the big error pop-up. HOW: Close just closes the dialog element. IMPROVE: return focus to the element
  // you were using before.
  $('#errClose').onclick = () => $('#errbox').close();
  // WHY: Lets you go from an error report straight to the troubleshooter. HOW: closes the error box, then opens Settings
  // on the 'fix' tab. IMPROVE: pass the error text to the troubleshooter.
  $('#errFix').onclick = () => { $('#errbox').close(); openSettings(false, 'fix'); };   // round 11: from a report straight to the troubleshooter
  // WHY: Copy the full error report so it can be pasted to Claude. HOW: tries the modern clipboard API; if that is
  // blocked, selects the text and uses the old execCommand copy; then shows a toast. IMPROVE: tell the user when both ways
  // fail.
  $('#errCopy').onclick = async () => {
    const t = $('#errText');
    try { await navigator.clipboard.writeText(t.value); }
    catch { t.focus(); t.select(); try { document.execCommand('copy'); } catch { /* user can copy by hand */ } }
    // WHY: confirm the copy. HOW: toast.
    toast('Report copied');
  };

  /* ---------------------------------------------------------------
     15. SETTINGS DIALOG + PROXY LIST
     WHY: the person can see which proxies are used, remove any (also the free ones), add their own
          (for example a Cloudflare Worker), test them, or go back to the free defaults.
     HOW: settings.proxies is the saved list. renderProxyList() draws it; every button edits the list,
          calls applySettings() (saves) and draws again.
     IMPROVE: drag to re-order, a "test on every start" option, and per-site proxy choice. */
  // WHY: Keep a handle to the Settings dialog used by many functions below. HOW: $ is a short helper for querySelector.
  // IMPROVE: none needed.
  const dlg = $('#settings');
  // WHY: Draws the list of proxies (helper servers that fetch pages for you) in Settings. HOW: empties the list, shows a
  // hint if there are none, otherwise makes one li per proxy. IMPROVE: use a small render helper to build rows.
  function renderProxyList() {
    const ul = $('#proxyList'); ul.innerHTML = '';
    if (!settings.proxies.length) { ul.innerHTML = '<li class="muted small">No proxy. Add one below or press "Reset to defaults".</li>'; return; }
    // WHY: Build one row per proxy. HOW: forEach gives the proxy p and its index i; creates li, a name span with the full
    // address as tooltip, and a state label ('free' for defaults, 'yours' for added ones). IMPROVE: show saved speed results
    // here.
    settings.proxies.forEach((p, i) => {
      const li = document.createElement('li');
      const name = document.createElement('span'); name.className = 'pname'; name.textContent = proxyName(p); name.title = p;
      // WHY: a small status text on each proxy row. HOW: span with classes for the look.
      const state = document.createElement('span'); state.className = 'pstate small muted';
      state.textContent = DEFAULT_PROXIES.includes(p) ? 'free · pages only' : 'yours';
      // WHY: A button to remove a proxy. HOW: creates a button with an accessible label; on click it cuts item i from
      // settings.proxies (splice), saves with applySettings and redraws. Then the row parts are added to the list. IMPROVE:
      // ask before removing your own proxy.
      const rm = document.createElement('button'); rm.type = 'button'; rm.textContent = '✕'; rm.title = 'Remove this proxy';
      rm.setAttribute('aria-label', 'Remove ' + proxyName(p));
      rm.onclick = () => { settings.proxies.splice(i, 1); applySettings(); renderProxyList(); };
      // WHY: assemble the row. HOW: append name, state and remove button, then add to the list.
      li.append(name, state, rm); ul.appendChild(li);
    });
  }
  // WHY: Adds a proxy address that the person typed. HOW: fixProxy cleans the text; the checks below stop with a toast
  // message on the first problem. IMPROVE: test the proxy before saving it.
  function addProxy() {
    const p = fixProxy($('#proxyNew').value);
    if (!p) return;
    // WHY: Basic input check. HOW: the address must begin with http:// or https://, otherwise show a toast and stop (return
    // toast(...) leaves the function). IMPROVE: show the error next to the input box.
    if (!/^https?:\/\//i.test(p)) return toast('The address must start with https://');
    // SECURITY: a proxy sees every address you read, so only encrypted (https) proxies are accepted,
    // plus http://localhost for the local launcher. It must also contain {url} (fixProxy adds it when missing).
    // WHY: Safety. A proxy sees every address you read. HOW: accept only https, or http on localhost / 127.0.0.1 for the
    // local launcher. IMPROVE: warn about public proxies you do not control.
    if (!/^https:\/\//i.test(p) && !/^http:\/\/(localhost|127\.0\.0\.1)(:|\/)/i.test(p)) return toast('For your safety only https:// proxies are accepted (or http://localhost).');
    // WHY: The proxy needs a place to put the target address. HOW: checks the text contains the {url} marker, then rejects
    // example text (isExample) and duplicates (includes). IMPROVE: explain with a sample address.
    if (!p.includes('{url}')) return toast('The proxy address must contain {url}');
    if (isExample(p)) return toast('That is only example text. Paste the real address of YOUR proxy.');
    if (settings.proxies.includes(p)) return toast('That proxy is already in the list');
    // WHY: Your own proxy should be tried first. HOW: unshift puts it at the start of the list; then clears the input, saves
    // and redraws the list. IMPROVE: let the user drag to reorder.
    settings.proxies.unshift(p);                       // the person's own proxy goes first
    $('#proxyNew').value = ''; applySettings(); renderProxyList();
  }
  // WHY: Lets the person see which proxies work and how fast. HOW: finds the list rows, then tests every proxy at the same
  // time (Promise.all) by asking for example.com and showing the milliseconds or the error. IMPROVE: limit the test time.
  async function testProxies() {
    const rows = $$('#proxyList li');
    await Promise.all(settings.proxies.map(async (p, i) => {
      // WHY: show the result of the proxy test on its row. HOW: find the row's status element and set its text.
      const badge = rows[i] && rows[i].querySelector('.pstate'); if (badge) badge.textContent = 'testing…';
      const t0 = performance.now();
      try { await askProxy(p, 'https://example.com/'); if (badge) badge.textContent = '✓ ' + Math.round(performance.now() - t0) + ' ms'; }
      // WHY: show the failure on the proxy row. HOW: the message without the proxy name in front.
      catch (e) { if (badge) badge.textContent = '✗ ' + e.message.replace(/^[^:]*: /, ''); }
    }));
  }
  // WHY: Opens Settings with the current values shown. HOW: copies saved settings into the form controls (slider, selects,
  // checkboxes), redraws the proxy list, fills memory info, then showModal opens it. toMemory or tab picks the tab.
  // IMPROVE: loop over a table of controls.
  function openSettings(toMemory, tab) {
    $('#setWidth').value = settings.width; $('#setWidthVal').textContent = settings.width;
    $('#setSide').value = settings.side; $('#setPdf').value = settings.pdfMode;
    $('#setAhead').value = [0, 3, 5, 9].includes(+settings.preloadAhead) ? String(+settings.preloadAhead) : '9';   // round 29d
    // WHY: tick the boxes for the current settings. HOW: checked = the saved value (default on).
    $('#setSlider').checked = settings.showSlider !== false; $('#setWheel').checked = settings.showWheel !== false;
    $('#setAwake').checked = !!settings.keepAwake; $$('#accentRow [data-c]').forEach(b => b.classList.toggle('on', b.dataset.c.toLowerCase() === String(settings.accent).toLowerCase()));   // round 14
    $('#setArrows').checked = settings.arrowKeys; $('#setTap').checked = settings.tapScroll; $('#setAutoRead').checked = settings.autoRead;
    // ROUND 18: the "Search & extras" card.
    $('#setFs').checked = settings.showFs !== false; $('#setEdge').checked = settings.showEdge !== false; $('#setCx').value = settings.googleCx || '';
    $('#setGoStraight').checked = !!settings.goStraight; $('#setGoogleManga').checked = !!settings.googleManga; $('#setStrict').checked = !!settings.engineStrict;
    $('#setGKey').value = settings.googleKey || '';
    // ROUND 32: the Translate tab. The language lists are filled by translate.js; their value is set here.
    $('#setTrShow').checked = settings.showTranslate !== false; $('#setTrTo').value = settings.trTo; $('#setTrFrom').value = settings.trFrom; $('#setTrEngine').value = settings.trEngine; $('#setTrAuto').checked = !!settings.trAuto;
    refreshProfInfo();                                   // ROUND 19: the Profile tab
    // WHY: fill the Memory and Security controls with the saved values. HOW: copy each setting into its control.
    $('#memAuto').value = String(settings.autoFree); $('#setNoHist').checked = settings.noHistory; $('#setWipe').checked = settings.wipeOnClose;
    $('#secList').innerHTML = '';
    renderProxyList();
    if (!reader.hidden) fillMemSelects();
    memInfo();
    dlg.showModal();
    fitSettings();
    if (toMemory) showTab('memory'); else if (tab) showTab(tab);
  }
  /* SETTINGS THAT FIT THE SCREEN (round 9)
     WHY: you should never scroll inside Settings. On a big screen all four cards sit side by side in a grid. When the
          window is too small for that (a phone, a short window) the cards become TABS: one card at a time, same options.
     HOW: remove the "tabs" class, measure: if the dialog is taller than the window, add "tabs" back. Runs when the dialog
          opens and when the window size or phone orientation changes.
     IMPROVE: remember the last tab you used, and use a ResizeObserver instead of the window events. */
  // WHY: Remember which settings tab is shown. HOW: setTab holds the name; showTab marks the matching tab button and card
  // as active, and refits if the grid layout is used. IMPROVE: save it in localStorage.
  let setTab = 'proxy';
  function showTab(name) {
    setTab = name;
    // WHY: highlight the chosen tab. HOW: toggle the 'active' class on the button whose name matches.
    $$('#setTabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    $$('.set-card').forEach(c => c.classList.toggle('active', c.dataset.tab === name));
    if (dlg.open && !dlg.classList.contains('tabs')) fitSettings();
  }
  // WHY: Make Settings fit without inner scrolling. HOW: switch to the grid, and if the dialog is taller than its box,
  // switch to tabs; then mark the active tab and card again. IMPROVE: use ResizeObserver.
  function fitSettings() {
    if (!dlg.open) return;
    dlg.classList.remove('tabs');                                       // try the grid first
    // WHY: on small screens use tabs. HOW: if the content is taller than the dialog, add the 'tabs' class.
    if (dlg.scrollHeight > dlg.clientHeight + 2) dlg.classList.add('tabs');
    $$('#setTabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === setTab));
    $$('.set-card').forEach(c => c.classList.toggle('active', c.dataset.tab === setTab));
  }
  // WHY: Make the tab buttons work and keep layout correct. HOW: sets each tab button type to button and click to showTab;
  // resize and orientation events re-run fitSettings (200 ms delay for phones). IMPROVE: debounce the resize handler.
  $$('#setTabs button').forEach(b => { b.type = 'button'; b.onclick = () => showTab(b.dataset.tab); });
  window.addEventListener('resize', fitSettings);
  window.addEventListener('orientationchange', () => setTimeout(fitSettings, 200));
  // WHY: Buttons that open Settings from the start page, the reader and the free-memory menu. HOW: assign onclick
  // handlers; the last one closes the chapter menu and opens the Memory tab. IMPROVE: use addEventListener to allow many
  // handlers.
  $('#btnSettings').onclick = () => openSettings(false);
  $('#btnSettingsR').onclick = () => openSettings(false);
  $('#btnFreeMenu').onclick = () => { closeMenu(); openSettings(true); };
  // WHY: Free memory for a chapter range typed in Settings. HOW: reads from and to numbers (swaps them if reversed),
  // clearRange returns how many were cleared, shows a toast with correct plural, updates memory info. IMPROVE: confirm
  // before clearing.
  $('#memRange').onclick = () => {
    let a = +$('#memFrom').value, b = +$('#memTo').value; if (a > b) [a, b] = [b, a];
    const n = clearRange(a, b); toast(n ? n + ' chapter' + (n === 1 ? '' : 's') + ' cleared' : 'Nothing to clear in that range'); memInfo();
  };
  // WHY: One click clears all chapters before the one you are reading. HOW: clearRange(0, R.cur - 1), then a toast and
  // memInfo refresh. IMPROVE: keep the previous chapter for fast going back.
  $('#memBefore').onclick = () => { const n = clearRange(0, R.cur - 1); toast(n ? n + ' chapter' + (n === 1 ? '' : 's') + ' cleared' : 'Nothing to clear before this chapter'); memInfo(); };
  // WHY: Settings controls that save as soon as they change. HOW: each onchange copies the new value into settings and
  // calls applySettings (save and apply). The memory one also runs autoFree and refreshes the info. IMPROVE: one shared
  // function for all of these.
  $('#memAuto').onchange = e => { settings.autoFree = +e.target.value; applySettings(); autoFree(); memInfo(); };
  $('#setNoHist').onchange = e => { settings.noHistory = e.target.checked; applySettings(); };
  $('#setWipe').onchange = e => { settings.wipeOnClose = e.target.checked; applySettings(); };
  // WHY: Proxy list buttons. HOW: Add calls addProxy; pressing Enter in the box also adds it (preventDefault stops form
  // submit); Test runs testProxies. IMPROVE: disable Add while the box is empty.
  $('#proxyAdd').onclick = addProxy;
  $('#proxyNew').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addProxy(); } });
  $('#proxyTest').onclick = testProxies;
  // WHY: Go back to the free default proxies if things are broken. HOW: asks for confirmation, then copies DEFAULT_PROXIES
  // (slice = copy), saves and redraws. IMPROVE: keep the user's own proxies optionally.
  $('#proxyReset').onclick = () => {
    // ROUND 18: YOUR OWN proxy (the Cloudflare Worker) is kept. WHY: the second bug report had lost it after a reset, so only the free proxies were left
    // and every page failed. HOW: put the user's own entries (those not in DEFAULT_PROXIES) first, then the free defaults. IMPROVE: a "remove my proxies too" button.
    if (!confirm('Put the free default proxies back? Your own proxy (Cloudflare Worker) stays in the list.')) return;
    const mine = (settings.proxies || []).filter(p => !DEFAULT_PROXIES.includes(p));
    if (!mine.includes(BUILTIN_PROXY)) mine.unshift(BUILTIN_PROXY);            // round 19: the built-in proxy always comes back with a reset
    settings.proxies = mine.concat(DEFAULT_PROXIES.filter(p => !mine.includes(p))); applySettings(); renderProxyList();
  };
  // WHY: Live reading width control. HOW: oninput fires while dragging the slider; updates settings, the number label, and
  // saves/applies. IMPROVE: debounce saving.
  $('#setWidth').oninput = e => { settings.width = +e.target.value; $('#setWidthVal').textContent = settings.width; applySettings(); };
  // WHY: Same pattern for other reading options. HOW: side, PDF quality mode, arrow keys, tap scroll and auto read each
  // write into settings and call applySettings. IMPROVE: generate these from a list.
  $('#setSide').onchange = e => { settings.side = e.target.value; applySettings(); };
  $('#setAhead').onchange = e => { settings.preloadAhead = +e.target.value; applySettings(); toast(settings.preloadAhead ? 'Keeping the next ' + settings.preloadAhead + ' chapters ready' : 'Next chapters are no longer loaded in advance'); };   // round 29d
  $('#setPdf').onchange = e => { settings.pdfMode = e.target.value; applySettings(); };
  $('#setSlider').onchange = e => { settings.showSlider = e.target.checked; applySettings(); };   // round 13
  $('#setWheel').onchange = e => { settings.showWheel = e.target.checked; applySettings(); };      // round 13
  // ROUND 32: the Translate tab. Each control saves at once; applySettings() then sends 'mf-settings' so translate.js repeats only the work that the change needs.
  $('#setTrShow').onchange = e => { settings.showTranslate = e.target.checked; applySettings(); };
  $('#setTrTo').onchange = e => { settings.trTo = e.target.value; applySettings(); };
  $('#setTrFrom').onchange = e => { settings.trFrom = e.target.value; applySettings(); };
  $('#setTrEngine').onchange = e => { settings.trEngine = e.target.value; applySettings(); };
  $('#setTrAuto').onchange = e => { settings.trAuto = e.target.checked; applySettings(); };
  // ROUND 32: the small panel of the Translate button changes a setting by sending this event. Only the five translate keys are accepted (an add-on can not change anything else).
  window.addEventListener('mf-settings-set', e => {
    const d = e.detail || {}, ok = ['trTo', 'trFrom', 'trEngine', 'trAuto', 'showTranslate'];
    let changed = false; Object.keys(d).forEach(k => { if (ok.includes(k) && settings[k] !== d[k]) { settings[k] = d[k]; changed = true; } });
    if (changed) applySettings();
  });
  // ROUND 32: translate.js asks for the big error box (with a report that can be copied) when it can not do its work.
  window.addEventListener('mf-translate-problem', e => { const d = e.detail || {}; showError(d.title || 'Translate problem', { details: d.details || '' }); });
  $('#setAwake').onchange = e => { settings.keepAwake = e.target.checked; applySettings(); };      // round 14: keep the screen on
  // ROUND 14: accent colour swatches. HOW: one click listener on the row; the swatch carries its colour in data-c.
  $('#accentRow').onclick = e => { const b = e.target.closest('[data-c]'); if (!b) return; settings.accent = b.dataset.c; $$('#accentRow [data-c]').forEach(x => x.classList.toggle('on', x === b)); applySettings(); };
  $('#setArrows').onchange = e => { settings.arrowKeys = e.target.checked; applySettings(); };
  $('#setTap').onchange = e => { settings.tapScroll = e.target.checked; applySettings(); };
  // WHY: save the 'open links in reading mode' choice. HOW: copy the checkbox into settings, then applySettings.
  $('#setAutoRead').onchange = e => { settings.autoRead = e.target.checked; applySettings(); };
  // ROUND 18: the "Search & extras" switches. Each one just copies the checkbox into settings and calls applySettings (which toggles the body classes).
  $('#setFs').onchange = e => { settings.showFs = e.target.checked; applySettings(); if (!e.target.checked && fsApiEl()) leaveFs(); };
  $('#setGKey').onchange = e => { googleApiDead = false; const v = e.target.value.trim(); if (v && !/^[\w-]{20,80}$/.test(v)) { toast('That does not look like a Google API key'); e.target.value = settings.googleKey || ''; return; } settings.googleKey = v; applySettings(); toast(v ? 'Google API key saved. Google searches now show MangaFlow\'s own result list.' : 'Google API key removed'); };
  $('#setStrict').onchange = e => { settings.engineStrict = e.target.checked; applySettings(); };
  $('#setEdge').onchange = e => { settings.showEdge = e.target.checked; applySettings(); };
  $('#setGoStraight').onchange = e => { settings.goStraight = e.target.checked; applySettings(); };
  $('#setGoogleManga').onchange = e => { settings.googleManga = e.target.checked; applySettings(); };
  // The Google ID: only letters, digits and a few symbols are accepted. Google reads the ID when its script loads, so a new ID needs a page reload.
  $('#setCx').onchange = e => {
    const v = e.target.value.trim();
    if (v && !/^[\w:.-]{6,80}$/.test(v)) { toast('That does not look like a Google search ID (it is the cx= value)'); e.target.value = settings.googleCx || ''; return; }
    settings.googleCx = v || 'c0d44f55eddb847e4'; applySettings(); e.target.value = settings.googleCx; cseP = null;
    toast('Google ID saved. Reload the page (F5) to use it.');
  };
  // SECURITY / PRIVACY: optional erase when the tab is closed.
  // WHY: Privacy option that erases traces when the tab closes. HOW: on pagehide, if wipeOnClose is on, overwrite saved
  // recent, books, reads with empty lists and progress with an empty object. IMPROVE: also clear the cache.
  // ROUND 43: pagehide ALSO fires on every refresh / reload (Fix automatically, Reset, profile sync...), so "erase when I close the tab" wiped bookmarks on F5.
  //   NOW: sessionStorage survives a reload but not a closed tab, so the erase runs at the first start-up of a NEW tab session (see wipeIfNewSession before the lists load).
  /* "Check my setup": a quick, honest list of what is safe and what is not.
     WHY: so the owner can see the protections at a glance. It only reads settings, it changes nothing. */
  // WHY: The 'Check my setup' button gives a plain safety list. HOW: clears the list; row() adds a line with a tick,
  // warning or info sign; local is true on localhost. IMPROVE: add colors to the rows.
  $('#secCheck').onclick = () => {
    const ul = $('#secList'); ul.innerHTML = '';
    const row = (ok, text) => { const li = document.createElement('li'); li.textContent = (ok === true ? '✅ ' : ok === false ? '⚠️ ' : 'ℹ️ ') + text; ul.appendChild(li); };
    // WHY: detect a local test address. HOW: the host name is localhost or 127.0.0.1.
    const local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
    // WHY: Checks that the site uses encrypted https. HOW: ok if https or localhost; the message changes with the case. Next
    // lines check the Content-Security-Policy meta tag (rules that block foreign scripts). IMPROVE: also check for secure
    // cookies.
    row(location.protocol === 'https:' || local, location.protocol === 'https:' ? 'This site uses https (encrypted).' : local ? 'Running on your own computer (localhost).' : 'This site is not using https. Use an https address.');
    const csp = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
    row(!!csp, csp ? 'Content-Security-Policy is active: only this site\'s own scripts can run.' : 'No Content-Security-Policy found in index.html.');
    // WHY: Tells the owner that scripts from manga sites never run. HOW: always shows a green row (it is a fixed fact of the
    // design). Then counts free public proxies versus own ones. IMPROVE: verify this really instead of assuming.
    row(true, 'Scripts of manga sites never run: pages are cleaned and shown in a script-free frame.');
    const free = settings.proxies.filter(p => DEFAULT_PROXIES.includes(p)).length, own = settings.proxies.length - free;
    // WHY: Warn that free proxies can see your addresses. HOW: free is the count of default proxies in your list, own is the
    // rest; rows show plural-correct messages. IMPROVE: link to the proxy guide.
    row(free === 0, free ? free + ' free public prox' + (free === 1 ? 'y' : 'ies') + ' in the list: their owners can see every address you open. Prefer your own proxy.' : 'No free public proxy is used.');
    row(own > 0 || local, own ? own + ' own prox' + (own === 1 ? 'y' : 'ies') + ' set.' : local ? 'The local launcher is your proxy.' : 'You have no own proxy yet (see MANGAFLOW.md, Cloudflare Worker with ALLOWED set to your site).');
    // WHY: Tells where history is kept. HOW: shows whether history saving is off, or saved only in this browser. IMPROVE:
    // add a button to delete it right there.
    row(!settings.noHistory, settings.noHistory ? 'History saving is OFF.' : 'History is saved in this browser only (nothing is sent anywhere).');
  };
  // WHY: Button to wipe all saved reading data. HOW: empties the in-memory lists and cache, overwrites the stored copies,
  // redraws the start page and shows a toast. IMPROVE: ask for confirmation first.
  $('#btnClear').onclick = () => {
    recent = []; books = []; reads = []; cache.clear();
    store.set('recent', []); store.set('books', []); store.set('reads', []); store.set('progress', {});
    // WHY: after clearing, redraw and tell the person. HOW: renderStart + toast.
    renderStart(); toast('Cleared');
  };

  /* ---------------------------------------------------------------
     16. START-UP + SAFETY NETS (round 8)
     WHY: nothing should fail silently. These handlers send every unexpected crash and every blocked attack to the
          big error pop-up (section 5), so a problem is never just a line in a hidden console.
     HOW: 1. "error" and "unhandledrejection" catch crashes and forgotten failures of async code.
          2. "securitypolicyviolation" fires when the browser's Content-Security-Policy STOPS something (for example a
             script that is not ours). That is the protection working, and you are told about it. Only script, plug-in,
             frame and form blocks are reported (style / picture blocks would only be noise). Browser add-ons are
             ignored, and at most 3 such pop-ups are shown per visit.
     IMPROVE: add a small "problems log" page that lists everything caught, and a "send report" button. */
  // WHY: Some browser errors are harmless noise. HOW: quietError is true if the message matches known harmless texts like
  // ResizeObserver or AbortError. IMPROVE: grow the list when new noise appears.
  const quietError = m => /ResizeObserver|Script error|cancelled|AbortError|The user aborted/i.test(m || '');
  // WHY: Catch crashes so they show in the big error pop-up. HOW: listens for the global error event, skips quiet ones,
  // then calls showError with the message and stack. IMPROVE: add a count to avoid spam.
  window.addEventListener('error', e => {
    if (quietError(e.message)) return;
    showError('Unexpected error: ' + (e.message || 'unknown'), { details: (e.error && e.error.stack) || (e.filename + ':' + e.lineno) });
  });
  // WHY: Catch async failures nobody handled. HOW: unhandledrejection gives e.reason; takes its message (or text form),
  // skips quiet ones and shows the error with its stack. IMPROVE: dedupe repeated reports.
  window.addEventListener('unhandledrejection', e => {
    const r = e.reason, m = (r && r.message) || String(r);
    if (quietError(m)) return;
    // WHY: report an error nobody caught. HOW: showError with the stack as details.
    showError('Unexpected error: ' + m, { details: (r && r.stack) || '' });
  });
  // WHY: Limit security pop-ups. HOW: secShown counts how many were shown; onSecurityViolation only reports script,
  // object, worker, child, frame, form-action and base blocks, and ignores browser extensions. IMPROVE: log the rest
  // quietly.
  let secShown = 0;
  const cspSeen = (window.__mfCspSeen = window.__mfCspSeen || new Set());      // round 23: declared here (before first use); section 18 reads the same set
  function onSecurityViolation(e) {
    if (!/^(script|object|worker|child|frame|form-action|base)/i.test(e.effectiveDirective || '')) return;
    // WHY: a security rule (CSP) blocked something. HOW: read which address and file it was.
    const blocked = e.blockedURI || '', src = e.sourceFile || '';
    if (/^(chrome|moz|safari|edge)-extension/i.test(blocked + ' ' + src)) return;       // browser add-ons are not our business
    // ROUND 28d - INLINE EVENT HANDLERS OF OTHER SITES' PAGES (script-src-attr). WHY: kingofshojo.com and many other sites put onload= / onclick= attributes in their HTML. MangaFlow never runs
    //   other sites' scripts (rule 1), so the browser blocking them is exactly what we want. Chrome 156 reports it while DOMParser reads the page (fetchDoc), on MangaFlow's OWN document
    //   ("script-src-attr -> inline", From: app.js, the DOMParser line), so the test of the next rule (an event that comes from inside the page frame) does not recognise it, and the
    //   person got a red pop-up on every chapter. HOW: this directive is only about attributes; MangaFlow's own index.html has none (check R28-21 C), so it can never be our own mistake:
    //   count it quietly (the second listener in section 18 already puts it into cspSeen, which the bug report shows) and return. IMPROVE: show the count as its own line in the report.
    if (/^script-src-attr/i.test(e.effectiveDirective || '')) return;
    // ROUND 23: a SCRIPT of someone else's page being blocked inside the page frame is exactly what we want (pages never run scripts here), so it is NOT an error. The reports about
    // cdn.search.brave.com/... .js were this. They are only counted quietly (cspSeen, shown by "Test Google search" and in the bug report). Blocks of OUR OWN page are still reported.
    if (e.target && e.target !== document && e.target.ownerDocument && e.target.ownerDocument !== document && /^script/i.test(e.effectiveDirective || '')) { try { cspSeen.add('frame ' + e.effectiveDirective + ' ' + new URL(e.blockedURI).host); } catch { /* ignore */ } return; }
    if (/^script/i.test(e.effectiveDirective || '') && /cdn\.|static\.|\/_app\/|\/serp\//i.test(blocked) && !/google|gstatic|googlesyndication|googleadservices|doubleclick|syndicatedsearch/i.test(blocked)) { try { cspSeen.add('page script ' + new URL(blocked).host); } catch { /* ignore */ } return; }
    // WHY: Stop showing pop-ups after 3 per visit. HOW: ++secShown > 3 returns; otherwise showError tells which rule stopped
    // what, with details. IMPROVE: reset the count after some time.
    if (++secShown > 3) return;
    showError('The browser blocked something: ' + e.effectiveDirective + ' → ' + (blocked || 'inline code'),
      { details: 'Rule that stopped it: ' + e.violatedDirective + '\nBlocked address: ' + (blocked || 'inline') + '\nFrom: ' + (src || 'this page') + ' line ' + (e.lineNumber || '?') });
  }
  // WHY: Connects the handler to the browser's security event. HOW: addEventListener on document. IMPROVE: none needed.
  document.addEventListener('securitypolicyviolation', onSecurityViolation);

  /* ---------------------------------------------------------------
     17. REPORTS, WATCHERS AND THE TROUBLESHOOTER  (round 11)
     WHY: you asked that EVERY problem is visible and copyable (a page that does not load, a stuck download, no next chapter),
          and for a place in Settings that checks and repairs things by itself, with ready-made questions for Claude.
     HOW: 1. watch(label, ms, details) = a timer; if the job is not finished after `ms` it shows a report. Call the returned
             function when the job ends.  2. noteFail() counts pictures that did not load per chapter and reports at 3.
          3. addNoNextButton() puts a "report" button on the last chapter. 4. selfCheck() lists what works; FIX.* are the repair
             buttons; autoFix() runs the safe ones in order. 5. diagnostic() makes the full text that goes into the Claude questions.
          Texts of the guide live in troubleshoot-data.js (window.MF_FIX).
     LIMIT: a repair can only reset MangaFlow itself. It can not unblock a site, fix a dead proxy or log in for you.
     IMPROVE: run selfCheck() by itself after 3 problems in a row, save the last results, test one chosen site on demand. */
  // WHY: Report jobs that take too long. HOW: starts a timer; if it ends, shows an error with a hint and details. Returns
  // a function that cancels the timer when the job ends. IMPROVE: let the caller change the time.
  function watch(label, ms, details) {
    const t = setTimeout(() => showError(label + ' is taking very long', { title: '⏳ Taking too long',
      hint: 'Nothing finished after ' + Math.round(ms / 1000) + ' seconds. The site or the proxies are slow or blocked, or the connection dropped. It keeps trying. Press the round reload key, or open Settings > Troubleshoot > Fix automatically. Copy the report to send it to Claude.',
      // WHY: delay the error pop-up a little so related errors can be grouped. HOW: details() is called when the timer fires.
      details: details() }), ms);
    return () => clearTimeout(t);
  }
  // WHY: Count failed pictures per chapter. HOW: a Map = list of key/value pairs, chapter address -> failures. noteFail
  // adds 1, keeps only 80 entries by removing the oldest, and at exactly 3 failures shows a report. IMPROVE: reset the
  // count after success.
  const picFails = new Map();                                          // chapter address -> how many pictures failed
  function noteFail(src, k, ref) {
    const key = ref || 'unknown chapter', c = (picFails.get(key) || 0) + 1; picFails.set(key, c);
    // WHY: keep the failure memory small. HOW: over 80 entries the oldest is deleted.
    if (picFails.size > 80) picFails.delete(picFails.keys().next().value);
    if (c === 3) showError('Several pictures of ' + key + ' are not loading', { title: '\u{1F5BC} Pictures are not loading',
      hint: 'Three pictures of this chapter failed. Usually the picture host refuses outside readers or the proxies are blocked. Try "Fix automatically" in Settings > Troubleshoot, or use your own proxy (worker.js sends the right referer).',
      // WHY: details for the picture-failed report. HOW: the picture address, page number and chapter address as text lines.
      details: 'Latest picture address: ' + src + '\nPage number: ' + (k + 1) + '\nChapter address: ' + (ref || '-') + '\nRoutes: ' + routeStatText() });
  }
  // WHY: Build the text for the 'no next chapter' report. HOW: collects lines in an array (chapter, list size, series
  // page, links found on the page, last 3 chapters) and joins them with new lines; try/catch protects from errors.
  // IMPROVE: add the page title.
  function noNextDetails(doc, base, ch, i) {
    const out = ['Chapter: ' + labelFor(i) + ' · ' + ch.url, 'Chapters in the list: ' + R.chapters.length + ' (this is number ' + (i + 1) + ')', 'Series page: ' + (R.seriesUrl || 'not found')];
    try { const nav = findNavLinks(doc, base, ch.url); out.push('Previous link on the page: ' + (nav.prev ? nav.prev.url || nav.prev : 'none'), 'Next link on the page: ' + (nav.next ? nav.next.url || nav.next : 'none')); } catch (e) { out.push('Nav links could not be read: ' + e.message); }
    try { const nx = findNextLink(doc, base, ch.url); out.push('Next chapter guess: ' + (nx ? nx.url : 'none')); } catch { /* ignore */ }
    // WHY: report the end of the chapter list. HOW: the last three chapter labels.
    out.push('Last 3 chapters of the list: ' + R.chapters.slice(-3).map(c => (c.num != null ? c.num : '?') + ' ' + c.url).join(' | '));
    return out.join('\n');
  }
  // WHY: Show the 'no next chapter' report once per site, not again and again. HOW: a Set remembers hosts already shown;
  // forced=true (button click) ignores it. IMPROVE: expire the memory after some time.
  const noNextShown = new Set();
  function showNoNext(doc, base, ch, i, forced) {
    const key = hostOf(ch.url);
    // WHY: show the 'no next chapter' notice once per chapter unless forced. HOW: a Set remembers shown keys.
    if (!forced) { if (noNextShown.has(key)) return; noNextShown.add(key); }
    showError('No next chapter was found after ' + labelFor(i), { title: '\u{1F50E} No next chapter found',
      hint: 'If this really is the newest chapter, nothing is wrong. If the site has more, the next link is probably built by the site\'s script or the chapter list is incomplete. Copy the report and send it to Claude with the link of the manga.',
      // WHY: details for the no-next-chapter report. HOW: noNextDetails builds the text.
      details: noNextDetails(doc, base, ch, i) });
  }
  // WHY: Add a report button at the end of the last chapter. HOW: adds text and a button that opens the report; if only
  // one chapter was found it shows the report at once since that is probably a detection problem. IMPROVE: translate the
  // texts.
  function addNoNextButton(end, doc, base, ch, i) {
    end.append(' · no next chapter found ');
    const b = document.createElement('button'); b.type = 'button'; b.className = 'ch-report'; b.textContent = 'Chapter missing? Send a report';
    // WHY: let the person ask again. HOW: the button calls showNoNext with forced = true.
    b.onclick = () => showNoNext(doc, base, ch, i, true);
    end.appendChild(b);
    if (R.chapters.length === 1) showNoNext(doc, base, ch, i, false);  // only ONE chapter found: almost surely a detection problem, say so at once
  }
  // WHY: Tell the person about connection changes. HOW: the browser fires offline and online events; each shows a toast.
  // IMPROVE: pause downloads while offline.
  window.addEventListener('offline', () => toast('You are offline. Reading and downloads continue when the connection returns.'));
  window.addEventListener('online', () => toast('Back online'));

  /* ----- the troubleshooter ----- */
  // WHY: Troubleshooter texts live in an optional file. HOW: returns window.MF_FIX or an empty fallback so the code never
  // breaks. copyText copies text to the clipboard with an old-style fallback and a toast. IMPROVE: report if both ways
  // fail.
  const FIXDATA = () => window.MF_FIX || { SYMPTOMS: [], PROMPTS: [] };
  const copyText = async text => {
    try { await navigator.clipboard.writeText(text); }
    catch { const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); } catch { /* the person can copy by hand */ } t.remove(); }
    // WHY: confirm the copy. HOW: toast.
    toast('Copied');
  };
  // WHY: Show memory use in reports. HOW: uses performance.memory (Chrome only) and converts bytes to MB, else says not
  // reported. IMPROVE: show a percentage.
  const heapText = () => performance && performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) + ' MB of ' + Math.round(performance.memory.jsHeapSizeLimit / 1048576) + ' MB' : 'not reported by this browser';
  // WHY: Test every proxy at once for the troubleshooter. HOW: for each proxy, time a request to example.com and push a
  // result object (ok with ms, or error text) into out. IMPROVE: add a timeout.
  async function pingProxies() {
    const out = [];
    await Promise.all(settings.proxies.map(async p => {
      // WHY: time the proxy test. HOW: performance.now() before the request.
      const t0 = performance.now();
      try { await askProxy(p, 'https://example.com/'); out.push({ p, ok: true, ms: Math.round(performance.now() - t0) }); }
      catch (e) { out.push({ p, ok: false, err: String(e.message).replace(/^[^:]*: /, '') }); }
    // WHY: close the list of handlers. HOW: the final bracket ends the forEach call.
    }));
    return out;
  }
  // WHY: A table of repair actions. HOW: each entry has a label (button text) and an async run function that returns one
  // line telling what happened. First two reload the current or all chapters. IMPROVE: add undo for risky ones.
  const FIX = {                                                         // every repair button: returns one line that says what happened
    reloadChapter: { label: 'Reload this chapter', run: async () => { if (reader.hidden) return 'Open reading mode first.'; reloadCurrent(); return 'Reloading the chapter you are on.'; } },
    reloadAll: { label: 'Reload all open chapters', run: async () => { if (reader.hidden) return 'Open reading mode first.'; reloadEvery(); return 'Reloading every open chapter.'; } },
    // WHY: Reset everything that may hold bad state. HOW: clears page cache, size estimates, route memory, breaker, stats,
    // gates and failure counters. IMPROVE: list what was cleared in the message.
    clearCaches: { label: 'Reset caches and routes', run: async () => {
      cache.clear(); Object.keys(estCache).forEach(k => delete estCache[k]); routeMemory.clear(); routeBreaker.clear(); hostLimit.clear(); hostRun.clear(); routeStats.clear(); gates.clear(); picFails.clear(); noImgSeen.clear();
      return 'Page cache, picture routes, request limits and size estimates were reset.'; } },
    // WHY: Retry broken pictures in one go. HOW: finds the first button of each failed picture box and clicks it. IMPROVE:
    // add a delay between retries.
    // ROUND 59: repair the site view (Page 2) on its own: placeholders, missing pictures, endless loading, empty chapter list.
    siteView: { label: 'Repair this site page', run: async () => (await siteViewRepair()).lines.join(' ') },
    retryPictures: { label: 'Retry failed pictures', run: async () => {
      const btns = $$('.page-fail .row button:first-child'); btns.forEach(b => b.click());
      return btns.length ? 'Retrying ' + btns.length + ' picture' + (btns.length === 1 ? '' : 's') + '.' : 'No failed pictures on the page.'; } },
    // WHY: Free memory while reading. HOW: clears chapters older than 3 before the current one (clearRange) and reports how
    // many. cancelStuck below marks running jobs with no progress for 60 seconds as cancelled. IMPROVE: make the 3 a
    // setting.
    freeMemory: { label: 'Free memory', run: async () => {
      if (reader.hidden) return 'Open reading mode first.';
      const n = clearRange(0, Math.max(0, R.cur - 3)); return n ? n + ' old chapter' + (n === 1 ? '' : 's') + ' cleared from memory.' : 'Nothing old to clear.'; } },
    // WHY: Stop downloads that hang. HOW: picks running jobs that are stalled or silent for 60000 ms, sets cancel=true and
    // redraws the dock. IMPROVE: restart them automatically.
    cancelStuck: { label: 'Cancel stuck downloads', run: async () => {
      const st = jobs.filter(j => j.status === 'running' && (j.stalled || Date.now() - j.tick > 60000));
      st.forEach(j => { j.cancel = true; }); renderDock();
      // WHY: tell how many stuck downloads were cancelled. HOW: build the sentence from the count.
      return st.length ? 'Cancelled ' + st.length + ' stuck download' + (st.length === 1 ? '' : 's') + '. Start it again: caches were reset so it will be faster.' : 'No stuck download found.'; } },
    // WHY: A safe fix for PDF problems. HOW: sets PDF mode to small, saves and updates the select box. testProxies reports
    // how many proxies answered and which failed. IMPROVE: pick the best quality automatically.
    safePdf: { label: 'Use Small picture quality', run: async () => { settings.pdfMode = 'small'; applySettings(); $('#setPdf').value = 'small'; return 'PDF picture quality is now "Small". You can change it in Settings > Reading.'; } },
    testProxies: { label: 'Test proxies', run: async () => {
      const r = await pingProxies(), good = r.filter(x => x.ok);
      // WHY: summarise the proxy test. HOW: how many answered and which was fastest.
      return good.length + ' of ' + r.length + ' proxies answered' + (good.length ? ' (fastest ' + Math.min(...good.map(x => x.ms)) + ' ms)' : '') + (r.length - good.length ? '. Failing: ' + r.filter(x => !x.ok).map(x => proxyName(x.p) + ' (' + x.err + ')').join('; ') : '') + '.'; } },
    // WHY: Shortcuts to other screens. HOW: openProxies shows the proxy tab; openDownload closes dialogs and opens the
    // download range window if chapters exist. IMPROVE: keep the Settings dialog open.
    openProxies: { label: 'Open proxy list', run: async () => { showTab('proxy'); return 'The proxy list is on the first tab of Settings.'; } },
    openDownload: { label: 'Open the download window', run: async () => { if (!R.chapters.length) return 'Open a manga in reading mode first.'; $('#settings').close(); $('#fixDlg').close(); openRangeDialog(); return ''; } },
    // ROUND 24: additional auto-fixes for common problems
    // ROUND 27 (bug B5): these three fixes changed the saved settings but left the on-screen controls showing the OLD value, so it looked as if nothing happened.
    // Now each one also updates the control (engine drop-down, API key box, proxy list). The buttons are also listed in troubleshoot-data.js now (they were unreachable).
    resetEngine: { label: 'Reset search engine to Auto', run: async () => { settings.searchEngine = 'auto'; googleApiDead = false; applySettings(); { const sel = $('#engineSel'); if (sel) sel.value = 'auto'; } return 'Search engine reset to Auto. The next search will try to find the best engine for you.'; } },
    clearApiKey: { label: 'Clear Google API key', run: async () => { settings.googleKey = ''; googleApiDead = false; applySettings(); { const k = $('#setGKey'); if (k) k.value = ''; } return 'Google API key was cleared. The search box will work without it.'; } },
    resetProxies: { label: 'Reset proxies to defaults', run: async () => {
      // same rule as the Settings "Reset" button: your own proxy and the built-in Worker are KEPT, the free ones are added back (it used to drop the built-in Worker, so every page failed)
      const mine = (settings.proxies || []).filter(p => !DEFAULT_PROXIES.includes(p)); if (!mine.includes(BUILTIN_PROXY)) mine.unshift(BUILTIN_PROXY);
      settings.proxies = mine.concat(DEFAULT_PROXIES.filter(p => !mine.includes(p))); applySettings(); try { renderProxyList(); } catch { /* settings window not built yet */ } return 'Proxies were reset to the defaults. If you added your own proxy, add it again in Settings > Proxies.'; } },
    reloadPage: { label: 'Reload this page', run: async () => { if (cur) location.reload(); return 'Reloading the page.'; } }
  };
  // WHY: Make a health report. HOW: rows is a list of results; row(ok, text) adds one. First checks online state,
  // pdfmaker.js, compression support, WebP conversion and storage access. IMPROVE: group rows by topic.
  /* ROUND 59 - THE SITE-VIEW DOCTOR (Page 2). WHY: the owner's arenascan chapter showed spinners / nothing on Page 2 while reading mode (Page 3) worked, and the old
          troubleshooter could not see it (it only counted pictures that "loaded" - a spinner picture loads fine). HOW: siteViewScan() LOOKS at the page on screen and compares it with
          what the reader's own finder knows (fromScripts / scanPictures / chapterPictures). It lists named problems (codes P2-...). siteViewRepair() fixes what can be fixed:
          fills placeholder slots, adds missing pictures, retries failed ones through the proxies, switches off a loading bar/banner that never ends, asks for the chapter list again.
          siteViewFull() is the long report that is used when something could not be fixed. IMPROVE: add a code for every new site problem that is reported. */
  async function siteViewScan(deep) {
    const r = { on: false, problems: [], counts: {}, finder: {}, notes: [], pics: [] };
    try {
      if (frame.hidden || !cur || cur.isSearch) return r;
      const d = frame.contentDocument; if (!d) { r.problems.push({ code: 'P2-NODOC', text: 'The site view cannot be read (the page frame has no document).', fix: false }); r.on = true; return r; }
      r.on = true;
      const base = cur.base || cur.url, im = Array.from(d.images || []);
      const kind = i => { const s = (i.getAttribute('src') || '').trim(); if (!s) return 'noaddr'; if (PLACEHOLDER_SRC.test(s)) return 'placeholder'; if (/^data:/i.test(s)) return 'datadrawing'; if (i.complete && !i.naturalWidth) return 'failed'; if (!i.complete) return 'pending'; return i.naturalWidth > 20 ? 'ok' : 'tiny'; };
      const c = r.counts; c.total = im.length; im.forEach(i => { const k = kind(i); c[k] = (c[k] || 0) + 1; });
      // what the reading pipeline knows about the SAME page (page scripts are only read as text)
      let js = [], sc = { list: [], how: '-' }, best = [];
      try { js = fromScripts(cur.doc, base); } catch { /* none */ }
      try { sc = scanPictures(cur.doc, base); } catch { /* none */ }
      best = js.length >= sc.list.length ? js : sc.list;
      if (deep && cur.doc) { try { const f = await Promise.race([chapterPictures(cur.doc, base, cur.url), new Promise(x => setTimeout(() => x(null), 8000))]); if (f && f.list && f.list.length > best.length) best = f.list; r.finder.how = f && f.how; } catch (e) { r.notes.push('chapterPictures failed: ' + (e && e.message)); } }
      r.finder.scripts = js.length; r.finder.reader = sc.list.length; r.finder.readerHow = sc.how; r.finder.best = best.length; r.pics = best;
      const shown = (c.ok || 0) + (c.pending || 0);
      if ((c.placeholder || 0) + (c.noaddr || 0) > 0 && best.length >= 1) r.problems.push({ code: 'P2-PLACEHOLDER', text: ((c.placeholder || 0) + (c.noaddr || 0)) + ' picture slot(s) only show a placeholder/spinner or are empty, but the reader finder knows ' + best.length + ' real picture(s).', fix: true });
      else if ((c.placeholder || 0) > 0) r.problems.push({ code: 'P2-PLACEHOLDER-NOSRC', text: (c.placeholder) + ' placeholder slot(s) and the finder found no real pictures.', fix: false });
      if (best.length >= 3 && best.length >= shown + 3 && !((c.placeholder || 0) + (c.noaddr || 0) > 0 && shown + (c.placeholder || 0) + (c.noaddr || 0) >= best.length)) r.problems.push({ code: 'P2-MISSING', text: 'The page shows ' + shown + ' real picture(s) but the reader finder knows ' + best.length + '. Some pages of the chapter are missing here.', fix: true });
      if ((c.failed || 0) > 0) r.problems.push({ code: 'P2-FAILED', text: (c.failed) + ' picture(s) failed to load (blocked or slow host).', fix: true });
      // loading signs that never end
      const barOn = $('#loadbar').classList.contains('on'), busyOn = !$('#busy').hidden;
      const idle = cur.enhancingDone || !cur.enhancing;
      c.loadbar = barOn; c.busy = busyOn; c.idle = !!idle;
      if ((barOn || busyOn) && idle && !jobs.some(j => j.status === 'running') && reader.hidden) r.problems.push({ code: 'P2-STUCK-LOADING', text: 'A loading bar / "working" note is on although the page and its background work are finished.', fix: true });
      // chapter page without a list
      let isCh = false; try { isCh = looksLikeChapter(cur.doc, base, cur.url); } catch { /* unknown */ }
      c.isChapter = isCh; c.listLen = cur.chapters ? cur.chapters.length : 0;
      c.needList = !!(isCh && !c.listLen && idle);      // a chapter page normally has no list until it is asked for (the picker / reading mode load it on demand), so this is only a note here
      // links that go nowhere
      const dead = Array.from(d.querySelectorAll('a')).filter(a => { try { return isDeadAnchor(a); } catch { return false; } }).length; c.deadLinks = dead;
      // things on the page that need scripts (they can never work in the frame)
      c.scriptsRemoved = !d.querySelector('script'); c.csp = Array.from(cspSeen).join(', ') || 'none';
    } catch (e) { r.problems.push({ code: 'P2-SCAN-ERROR', text: 'The site-view scan itself failed: ' + (e && e.message), fix: false }); }
    SVD.last = r; return r;
  }
  const SVD = { last: null, fixed: [], failed: [] };
  async function siteViewRepair() {
    const out = [], r0 = await siteViewScan(true);
    if (!r0.on) return { lines: ['Site view: nothing to repair (no site page is open).'], left: [], scan: r0 };
    if (!r0.problems.length && !r0.counts.needList) return { lines: ['Site view: everything looks right (' + (r0.counts.ok || 0) + ' pictures loaded, finder knows ' + r0.finder.best + ').'], left: [], scan: r0 };
    const d = frame.contentDocument, base = cur.base || cur.url, codes = r0.problems.map(p => p.code);
    if (codes.some(x => x === 'P2-PLACEHOLDER' || x === 'P2-MISSING')) {
      const res = placePictures(d, base, r0.pics);
      out.push('Site view: filled ' + res.filled + ' empty slot(s) and added ' + res.added + ' missing picture(s) from the reader finder.');
    }
    if (codes.includes('P2-FAILED')) { try { sweepFrameImgs(d); out.push('Site view: retried the failed pictures through the proxies.'); } catch { /* ignore */ } }
    if (codes.includes('P2-STUCK-LOADING')) { setLoading(false); setBusy(''); out.push('Site view: switched off a loading bar that never ended.'); }
    let listFail = false;
    if (r0.counts.needList) {
      try {
        const lr = await Promise.race([loadSeriesList(cur.doc, base, cur.url), new Promise(x => setTimeout(() => x(null), 20000))]);
        if (lr && lr.chapters && lr.chapters.length >= 2) { cur.chapters = lr.chapters; try { applyLive(frame.contentDocument); } catch { /* the list is kept anyway */ } out.push('Site view: loaded the chapter list from the series page (' + lr.chapters.length + ' chapters).'); }
        else { listFail = true; out.push('Site view: the chapter list could not be found on the series page.'); }
      } catch (e) { listFail = true; out.push('Site view: the chapter list could not be fetched (' + (e && e.message) + ').'); }
    }
    if (codes.includes('P2-STUCK-LOADING')) { setLoading(false); setBusy(''); }       // the list loading above may switch the note on again: switch it off once more
    await new Promise(x => setTimeout(x, 2500));            // give the new pictures a moment to load, then look again
    const r1 = await siteViewScan(false), left = r1.problems.filter(p => !(p.code === 'P2-FAILED' && (r1.counts.failed || 0) === 0));
    if (listFail) left.push({ code: 'P2-NOLIST', text: 'Chapter page without a findable chapter list.', fix: false });
    out.push(left.length ? 'Site view: ' + left.length + ' problem(s) remain: ' + left.map(p => p.code).join(', ') : 'Site view: all problems repaired.');
    SVD.fixed = r0.problems.filter(p => !left.some(l => l.code === p.code)).map(p => p.code); SVD.failed = left.map(p => p.code);
    return { lines: out, left, scan: r1 };
  }
  // WHY: the "everything we know" report for a problem that could not be repaired. HOW: scan data, every picture (kind, address attribute, address, size), the page's own head (CSP, base), a script count,
  //   proxy answers, the problem log. It is plain text so it can be pasted into any AI. IMPROVE: add a screenshot hint.
  async function siteViewFull() {
    const r = SVD.last || await siteViewScan(true), L = [];
    L.push('=== SITE VIEW (Page 2) DETAIL ===', 'Page: ' + (cur ? cur.url : '-'), 'Scan: ' + JSON.stringify(r.counts), 'Reader finder: ' + JSON.stringify(r.finder));
    L.push('Problems found: ' + (r.problems.map(p => p.code + ' - ' + p.text).join(' | ') || 'none'), 'Repaired: ' + (SVD.fixed.join(', ') || 'none') + ' · Not repaired: ' + (SVD.failed.join(', ') || 'none'));
    try {
      const d = frame.contentDocument;
      if (d) {
        L.push('Frame title: ' + d.title, 'Frame text length: ' + (d.body ? d.body.innerText.length : 0), 'Frame head meta: ' + Array.from(d.querySelectorAll('meta')).map(m => (m.httpEquiv || m.name || m.getAttribute('property') || '') + '=' + (m.content || '').slice(0, 60)).join(' ; '));
        L.push('First 40 pictures (state | attribute used | address as written | natural size):');
        Array.from(d.images).slice(0, 40).forEach((i, k) => { const inf = imgAddressInfo(i, cur.base || cur.url); L.push('  ' + (k + 1) + '. ' + (i.complete ? (i.naturalWidth ? 'loaded' : 'FAILED') : 'pending') + ' | ' + (inf.attr || 'none') + ' | ' + (i.getAttribute('src') || '').slice(0, 110) + ' | ' + i.naturalWidth + 'x' + i.naturalHeight + (i.dataset.mfAdded ? ' (added by MangaFlow)' : '')); });
        const cls = {}; d.querySelectorAll('[class]').forEach(e => { String(e.className).split(/\s+/).forEach(n => { if (/load|spin|lazy|reader|chapter|page/i.test(n)) cls[n] = (cls[n] || 0) + 1; }); });
        L.push('Useful class names on the page (name x count): ' + Object.entries(cls).slice(0, 30).map(e => e[0] + 'x' + e[1]).join(', '));
      }
      if (cur && cur.doc) {
        const sc = Array.from(cur.doc.querySelectorAll('script')); L.push('Original page scripts: ' + sc.length + ' (' + sc.filter(s => !s.src).length + ' inline, ' + sc.filter(s => s.src).length + ' external). Picture words inside inline scripts: ' + sc.filter(s => /images?["']?\s*:|\.webp|\.jpe?g/i.test(s.textContent || '')).length);
      }
    } catch (e) { L.push('(detail failed: ' + (e && e.message) + ')'); }
    L.push('Chapter list on site view: ' + pageListText(), 'Chapter audit: ' + chapterAuditText(), 'CSP blocks seen: ' + (Array.from(cspSeen).join(', ') || 'none'));
    L.push('Address hash: ' + location.hash.slice(0, 160), 'Screen: ' + innerWidth + 'x' + innerHeight + ' dpr ' + devicePixelRatio);
    return L.join('\n');
  }
  async function selfCheck() {
    const rows = [], row = (ok, text) => rows.push({ ok, text });
    row(navigator.onLine, navigator.onLine ? 'The device says it is online.' : 'The device says it is OFFLINE. Check Wi-Fi / mobile data.');
    // WHY: check that pdfmaker.js loaded. HOW: window.MangaPDFLib exists only if the file ran.
    row(!!window.MangaPDFLib, window.MangaPDFLib ? 'pdfmaker.js is loaded.' : 'pdfmaker.js did not load: keep it next to app.js.');
    row(typeof CompressionStream !== 'undefined', typeof CompressionStream !== 'undefined' ? 'PDF compression is supported.' : 'This browser can not compress PDF text blocks: use a newer browser.');
    row(typeof createImageBitmap === 'function', typeof createImageBitmap === 'function' ? 'WebP pictures can be converted for the PDF.' : 'This browser can not convert WebP pictures: PDFs may miss pages.');
    let st = false; try { localStorage.setItem('mf_t', '1'); localStorage.removeItem('mf_t'); st = true; } catch { /* blocked */ }
    // WHY: tell whether saving works. HOW: st is true when the storage test succeeded.
    row(st, st ? 'Saving settings and history works.' : 'The browser blocks saving (private mode?). History and resume will not work.');
    // WHY: Show which optional add-ons loaded. HOW: checks the window flags, then pings proxies and adds one row each (and
    // an error if none worked). IMPROVE: show the file names.
    row(null, 'Add-ons: slider ' + (window.MangaFlowSlider ? 'linked' : 'not linked') + ', reload wheel ' + (window.MangaFlowWheel ? 'linked' : 'not linked') + ', translate ' + (window.MangaFlowTranslate ? 'linked' : 'not linked') + ', guide texts ' + (window.MF_FIX ? 'linked' : 'not linked') + '. (They are optional.)');
    const pr = await pingProxies(), good = pr.filter(x => x.ok);
    pr.forEach(x => row(x.ok, proxyName(x.p) + ': ' + (x.ok ? 'answers in ' + x.ms + ' ms' : 'FAILED (' + x.err + ')')));
    // WHY: no working proxy is the most common problem. HOW: say so and suggest your own Cloudflare Worker.
    if (!good.length) row(false, 'No proxy answered. Add your own Cloudflare Worker (worker.js) in Settings > Proxies, or try again in a few minutes.');
    // WHY: Reader-only checks. HOW: counts failed pictures and chapters still showing a message, shows the current chapter,
    // then the downloads, routes and memory lines. IMPROVE: add a score at the top.
    if (!reader.hidden) {
      const bad = $$('.page-fail').length, msgs = $$('.chapter .ch-msg').length;
      row(bad === 0, bad ? bad + ' picture(s) failed to load on this page.' : 'All pictures on the page loaded.');
      // WHY: count chapter boxes that still show a message. HOW: the number is shown in the check row.
      row(msgs === 0, msgs ? msgs + ' chapter box(es) still show a message (loading or error).' : 'No chapter box shows an error.');
      row(null, 'Reading: ' + R.title + ', chapter ' + (R.cur + 1) + ' of ' + R.chapters.length + ', ' + $$('.chapter', stream).length + ' open.');
    }
    // WHY: one check row per download job. HOW: a job that failed or stalled is marked red.
    jobs.forEach(j => row(j.status === 'error' || j.stalled ? false : null, 'Download #' + j.id + ': ' + j.status + (j.stalled ? ' (STALLED)' : '') + ' · ' + (j.text || '')));
    row(null, 'Picture routes: ' + routeStatText());
    row(null, 'Site view pictures (round 51): ' + pageViewPicText());
    // ROUND 59: the site-view doctor - named problems with their codes (a green tick means "nothing found")
    try { const sv = await siteViewScan(true); if (sv.on) { if (!sv.problems.length) row(true, 'Site view looks right: ' + (sv.counts.ok || 0) + ' pictures shown, reader finder knows ' + sv.finder.best + '.'); sv.problems.forEach(p => row(false, '[' + p.code + '] ' + p.text + (p.fix ? ' — "Fix automatically" can repair this.' : ' — needs a report.'))); } } catch (e) { row(false, 'Site view check failed: ' + (e && e.message)); }
    row(null, 'Chapter boxes (round 52): ' + chapterHealthText());
    row(null, 'Chapter audit (round 55): ' + chapterAuditText());
    row(null, 'Site view chapter list (round 57): ' + pageListText());
    row(null, 'Memory: ' + heapText() + ' · PDF picture quality: ' + settings.pdfMode);
    return rows;
  }
  // WHY: Draw result rows in a list. HOW: clears the ul and makes an li per row with ✅, ⚠️ or ℹ️ before the text;
  // textContent is safe from HTML injection. IMPROVE: add colors.
  function paintRows(rows, ul) {
    ul.innerHTML = '';
    rows.forEach(r => { const li = document.createElement('li'); li.textContent = (r.ok === true ? '✅ ' : r.ok === false ? '⚠️ ' : 'ℹ️ ') + r.text; ul.appendChild(li); });
  }
  // WHY: One button that runs the safe repairs in order. HOW: log collects lines and say() adds one and repaints; runs
  // clearCaches, testProxies, then (if reading) retryPictures, reload of chapter boxes with messages, and free memory if
  // heap is over 60%. IMPROVE: show a progress bar.
  async function autoFix() {
    const log = [], say = t => { log.push({ ok: true, text: t }); paintRows(log, $('#fixList')); };
    paintRows([{ ok: null, text: 'Working…' }], $('#fixList'));
    // WHY: run the 'clear caches' fix and show what it did. HOW: say() prints the text.
    say(await FIX.clearCaches.run());
    const pr = await FIX.testProxies.run(); say(pr);
    if (!reader.hidden) {
      // WHY: run the 'retry pictures' fix and show what it did. HOW: say() prints the result text.
      say(await FIX.retryPictures.run());
      const bad = $$('.chapter', stream).filter(sec => sec.querySelector('.ch-msg'));
      if (bad.length) { say('Reloading ' + bad.length + ' chapter box' + (bad.length === 1 ? '' : 'es') + ' that showed a message.'); reloadSections(bad); }
      if (performance && performance.memory && performance.memory.usedJSHeapSize > performance.memory.jsHeapSizeLimit * 0.6) say(await FIX.freeMemory.run());
    }
    // ROUND 59: the site-view doctor. WHY: find and repair the problems that only show on Page 2 (spinners, missing pictures, never-ending loading, empty chapter list).
    let svLeft = [];
    try { const sv = await siteViewRepair(); sv.lines.forEach(say); svLeft = sv.left; } catch (e) { say('Site view repair failed: ' + (e && e.message)); }
    // WHY: Finish the auto repair. HOW: cancels stuck downloads and mentions it only if something was found, then prints the
    // final hint. IMPROVE: offer to copy the report automatically.
    const cs = await FIX.cancelStuck.run(); if (!/No stuck/.test(cs)) say(cs);
    if (svLeft.length || errLog.length && Date.now() - errLog[errLog.length - 1].at < 120000) {
      // ROUND 59: something could not be fixed -> build the COMPLETE report now (everything gathered), show it in the box and try to copy it.
      log.push({ ok: false, text: 'Not everything could be repaired' + (svLeft.length ? ' (' + svLeft.map(p => p.code).join(', ') + ')' : '') + '. A complete error report was made for you (below) - paste it to Claude or any AI, or use "Send report to server".' });
      paintRows(log, $('#fixList'));
      const txt = diagnostic(await siteViewFull()), box = $('#fixReport'); if (box) { box.value = txt; box.hidden = false; }
      try { await copyText(txt); } catch { /* the person can copy it from the box */ }
    } else { const box = $('#fixReport'); if (box) { box.value = ''; box.hidden = true; } say('Done. Nothing is left that the checks can see. If it still fails, press "Copy full report".'); }
  }
  // WHY: Build the big report that is pasted into Claude questions. HOW: joins lines with time, page, browser, current
  // manga, settings, add-ons, routes, memory, downloads, last 4 problems and the latest download report. IMPROVE: hide
  // private addresses.
  function diagnostic(extra) {
    // ROUND 21: the report now says which build it is, how Google search went last time and how the profile sync went, so a bug report shows the cause at once.
    const PF = window.MangaFlowProfiles, si = PF && PF.syncInfo ? PF.syncInfo() : null;
    return ['MangaFlow diagnostic (build round 60)', 'Time: ' + new Date().toString(), 'App page: ' + location.href, 'Browser: ' + navigator.userAgent,
      'Manga page open: ' + (cur ? cur.url : '-'),
      // WHY: the reading state in the copy-for-Claude text. HOW: title, chapter number and total.
      'Reading: ' + (R.chapters && R.chapters.length ? R.title + ' | chapter ' + (R.cur + 1) + ' of ' + R.chapters.length : 'not reading'),
      'Proxies: ' + (settings.proxies.map(proxyName).join(', ') || 'NONE'),
      'Settings: quality ' + settings.pdfMode + ', width ' + settings.width + ', side ' + settings.side + ', autoRead ' + settings.autoRead + ', autoFree ' + settings.autoFree,
      // WHY: tell Claude which add-ons are linked. HOW: true or false for the slider and the wheel.
      'Add-ons: slider ' + !!window.MangaFlowSlider + ', wheel ' + !!window.MangaFlowWheel + ', edge ' + !!window.MangaFlowEdge + ', translate ' + !!window.MangaFlowTranslate + ', profiles ' + !!PF,
      window.MangaFlowTranslate ? window.MangaFlowTranslate.report() : 'Translate add-on: not linked',
      'Keeper (round 29d): ' + (keeper.last || 'not run yet') + ', setting ' + settings.preloadAhead + ', base wait ' + healBase() + ' ms',
      // ROUND 29e: which sites asked for the "verify you are human" check (empty = none). WHY: it tells at once whether a "chapters do not load" report is a check page. HOW: the keys of humanHosts.
      'Human check (round 29e): ' + (humanHosts.size ? [...humanHosts.keys()].join(', ') + ' waiting' : 'no site waiting'),
      'Search engine: ' + settings.searchEngine + ' (strict ' + !!settings.engineStrict + '), Google ID ' + (settings.googleCx || 'none') + ', last Google result: ' + (googleLast || 'no Google search yet') + ', blocked by page rules: ' + (Array.from(cspSeen).join(', ') || 'nothing'),
      'Profile: ' + (PF && PF.user() ? PF.user() + ' (' + PF.role() + ')' : 'not signed in') + ', sync: ' + (si && si.ok !== null ? (si.ok ? 'OK ' : 'FAILED ' + si.err + ' ') + new Date(si.t).toLocaleTimeString() : 'nothing sent yet'),
      'Picture routes: ' + routeStatText(), 'Site view pictures (round 51): ' + pageViewPicText(), 'Chapter boxes (round 52): ' + chapterHealthText(), 'Chapter audit (round 55): ' + chapterAuditText(), 'Site view chapter list (round 57): ' + pageListText(), 'Memory: ' + heapText(),
      'Downloads: ' + (jobs.map(j => '#' + j.id + ' ' + j.status + ' ' + (j.pct || 0) + '% ' + (j.text || '')).join(' | ') || 'none'),
      extra || '',
      '--- last problems (newest last) ---', errLog.slice(-4).map(e => e.report).join('\n\n=====\n') || 'none',
      jobs.length ? '--- latest download ---\n' + jobReport(jobs[jobs.length - 1]) : ''].join('\n');
  }
  // WHY: Fill the troubleshooter guide. HOW: reads the symptom list; if empty it shows a message. For each symptom it
  // builds a details box with title, reason and its repair buttons from FIX; each button disables itself while running and
  // toasts the result. IMPROVE: add search.
  function renderGuide() {
    const D = FIXDATA(), box = $('#fixGuide');
    box.innerHTML = '';
    // WHY: the guide needs troubleshoot-data.js. HOW: if it is missing, say so instead of showing nothing.
    if (!D.SYMPTOMS.length) { box.textContent = 'troubleshoot-data.js is not linked, so the guide is empty. The checks and the repair button still work.'; }
    D.SYMPTOMS.forEach(sy => {
      const d = document.createElement('details'), sm = document.createElement('summary'); sm.textContent = sy.title; d.appendChild(sm);
      // WHY: show the reason for each symptom. HOW: a paragraph made with textContent.
      const p = document.createElement('p'); p.className = 'small'; p.textContent = sy.why; d.appendChild(p);
      const row = document.createElement('div'); row.className = 'inline';
      (sy.fix || []).forEach(name => { const f = FIX[name]; if (!f) return; const b = document.createElement('button'); b.type = 'button'; b.textContent = f.label;
        b.onclick = async () => { b.disabled = true; const t = await f.run(); b.disabled = false; if (t) toast(t); }; row.appendChild(b); });
      // WHY: Add a question button for Claude. HOW: finds the prompt matching the symptom, and the button copies its text with
      // {{REPORT}} replaced by the diagnostic. Then the whole list of prompts is drawn the same way. IMPROVE: preview before
      // copy.
      const pr = D.PROMPTS.find(x => x.id === sy.ask);
      if (pr) { const b = document.createElement('button'); b.type = 'button'; b.className = 'primary'; b.textContent = 'Copy question for Claude'; b.onclick = () => copyText(pr.text.replace('{{REPORT}}', diagnostic())); row.appendChild(b); }
      d.appendChild(row); box.appendChild(d);
    });
    // WHY: empty the list of ready-made questions before filling it. HOW: innerHTML = ''.
    const pl = $('#fixPrompts'); pl.innerHTML = '';
    D.PROMPTS.forEach(pr => {
      const li = document.createElement('li'), t = document.createElement('b'); t.textContent = pr.title; li.appendChild(t);
      // WHY: show a ready-made question for Claude with the report inside. HOW: the {{REPORT}} marker is replaced by the real
      // report text.
      const pre = document.createElement('pre'); pre.textContent = pr.text.replace('{{REPORT}}', '[the diagnostic report is added here when you press Copy]'); li.appendChild(pre);
      const b = document.createElement('button'); b.type = 'button'; b.className = 'primary'; b.textContent = 'Copy with my report'; b.onclick = () => copyText(pr.text.replace('{{REPORT}}', diagnostic())); li.appendChild(b);
      pl.appendChild(li);
    });
    // WHY: Show recent problems. HOW: shows a hint if the log is empty, otherwise lists newest first with time, 110
    // characters of the message and a Copy button for the full report. IMPROVE: add a clear-log button.
    const rl = $('#fixRecent'); rl.innerHTML = '';
    if (!errLog.length) rl.innerHTML = '<li class="muted small">No problems since this page was opened.</li>';
    errLog.slice().reverse().forEach(e => {
      // WHY: one line per recent problem. HOW: a list item with the time and the message.
      const li = document.createElement('li'); li.textContent = new Date(e.at).toLocaleTimeString() + ' · ' + e.msg.slice(0, 110) + ' ';
      const b = document.createElement('button'); b.type = 'button'; b.textContent = 'Copy'; b.onclick = () => copyText(e.report); li.appendChild(b); rl.appendChild(li);
    });
  }
  // WHY: Wire the troubleshooter buttons. HOW: Auto fix and Check disable the button while running (try/finally re-enables
  // it); Copy copies the report; Open draws the guide and shows the dialog. IMPROVE: show a spinner.
  $('#fixAuto').onclick = async e => { e.target.disabled = true; try { await autoFix(); } finally { e.target.disabled = false; } };
  $('#fixCheck').onclick = async e => { e.target.disabled = true; paintRows([{ ok: null, text: 'Checking…' }], $('#fixList')); try { paintRows(await selfCheck(), $('#fixList')); } finally { e.target.disabled = false; } };
  $('#fixCopy').onclick = async () => copyText(diagnostic(await siteViewFull()));   // round 59: includes the site-view detail
  // ROUND 19: send the full diagnostic to the accounts server (profiles.js does the sending; it works signed in or not, with a limit of 3 per 10 minutes when not).
  // WHY: the owner wants every report on the server so the pages can be fixed from it. HOW: MangaFlowProfiles.sendReport(title, report, page).
  $('#fixSend').onclick = async () => {
    const P = window.MangaFlowProfiles; if (!P || !P.sendReport) { toast('The profile add-on (profiles.js) is not loaded'); return; }
    try { await P.sendReport('Troubleshoot report', diagnostic(await siteViewFull()), cur && cur.url || location.href); toast('Report sent to the server. Thank you!'); }
    catch (e) { toast('Not sent: ' + clipText(e.message, 90)); }
  };
  // ROUND 19 (this code sits inside section 17; the Settings window has no section of its own): the Profile tab of Settings. WHY: reach the profile / sync from reading mode and from any page. HOW: buttons call the profiles.js doors.
  function refreshProfInfo() {
    const P = window.MangaFlowProfiles, el = $('#profInfo'); if (!el) return;
    if (!P) { el.textContent = 'The profile add-on (profiles.js) is not loaded.'; $('#profOpen').disabled = $('#profSync').disabled = true; return; }
    const u = P.user(), g = P.guestCount ? P.guestCount() : 0;
    const si = P.syncInfo ? P.syncInfo() : null, st = si && si.ok !== null ? (si.ok ? ' Last save: OK.' : ' <b style="color:#c92a2a">Last save FAILED: ' + escHtml(si.err) + '</b>') : '';
    el.innerHTML = u ? 'Signed in as <b>' + escHtml(u) + '</b>' + (P.role() === 'admin' ? ' (admin)' : '') + '. Your reading is saved to the server.' + st : 'You are not signed in. ' + (g ? g + ' item(s) of reading are waiting and will be added to your profile when you sign in.' : 'Sign in to keep your history and bookmarks on every device.');
  }
  $('#profOpen').onclick = () => { const P = window.MangaFlowProfiles; if (!P) return; dlg.close(); P.open(); };
  $('#profSync').onclick = async () => {
    const P = window.MangaFlowProfiles; if (!P) return;
    try { toast('Syncing…'); const ch = await P.sync(); toast('Synced'); refreshProfInfo(); if (ch) location.reload(); } catch (e) { toast(clipText(e.message, 100)); }
  };
  // WHY: open the guide. HOW: draw it, then showModal.
  $('#fixOpen').onclick = () => { renderGuide(); $('#fixDlg').showModal(); };
  // WHY: Close and reset the troubleshooter. HOW: Close closes its dialog; Reset asks to confirm, empties saved settings
  // and reloads the page (history and bookmarks stay). IMPROVE: offer a backup first.
  $('#fixClose').onclick = () => $('#fixDlg').close();
  $('#fixReset').onclick = () => { if (!confirm('Reset ALL MangaFlow settings to the defaults? History and bookmarks stay.')) return; store.set('settings', {}); location.reload(); };


  /* ---------------------------------------------------------------
     18. ROUND 18: GOOGLE SEARCH, FULL SCREEN, TOP / END JUMPS, "REMEMBER MY PAGE"
     WHY: (1) the owner built a Google Programmable Search Engine (cx in settings.googleCx) and wants it as the DEFAULT search, working like a normal
              search; (2) a full-screen button like F11; (3) the Top / End slider needs somebody to scroll; (4) a refresh on a normal website page used
              to drop you on the start page.
     HOW: everything new lives in this one section so the older sections stay as they were (an earlier update once changed things nobody asked for).
          It sits BEFORE the start-up code on purpose: start-up may already call navigate(), which calls the functions below.
     IMPROVE: when stable, split this section into its own file (like pdfmaker.js).
     --------------------------------------------------------------- */

  /* ---- 18a. the address bar remembers the page (#p=) or the search (#q=) so a refresh returns to it ------------------------------------------------ */
  // WHY: lastView = what a refresh should reopen { k: 'p' | 'q', v: address or words }. HOW: rememberView writes it into the part after # of the page address
  // with history.replaceState (no new history entry, no reload). #r= (the chapter being read) is written by rememberChapter and wins while reading.
  // IMPROVE: store the scroll position too.
  let lastView = null;
  // ROUND 39 — REAL BACK / FORWARD BUTTON SUPPORT.
  // WHY: the owner reported that pressing the browser's (or the phone's) own Back button, or the device's back
  //   gesture, closed reading mode completely and dropped you straight out to the site's home page or even out of
  //   the site entirely — with no way to use Forward to get back. ROOT CAUSE: every navigation inside MangaFlow
  //   (opening a manga page, switching chapters, going Home) only ever called history.REPLACEState — which edits
  //   the CURRENT browser-history entry in place instead of adding a new one. With replaceState only, a whole
  //   reading session (however many pages or chapters you opened) is still just ONE history entry, so Back has
  //   nothing of ours to step back through — it jumps straight to whatever was open before MangaFlow, which looks
  //   like "it closes completely".
  // HOW (the fix, in short): rememberView() and rememberChapter() (below) now take an extra `push` argument. When
  //   true, and the address is actually about to change, history.PUSHState is used instead — adding a real new
  //   entry, exactly like clicking a link on a normal website. Now: opening a manga page, pressing "Reading mode",
  //   switching chapters, and pressing Home each add one step; Back/Forward (the browser's own buttons, the
  //   device's back gesture, AND the new on-screen header buttons added below) walk through them one at a time,
  //   using the browser's OWN history stack — so once MangaFlow's own steps run out, Back correctly leaves the
  //   site (whatever was open before), exactly like any other website. A 'popstate' listener (further down) re-
  //   opens whichever page/chapter/search the browser just stepped to. `suppressPush` stops that restore itself
  //   from pushing ANOTHER entry (which would otherwise fight with Back/Forward and break the stack).
  // IMPROVE: also remember and restore the exact scroll position, not just which chapter/page.
  let suppressPush = false;
  // ROUND 46 — THE "?url=" THAT NEVER LEAVES (the real reason a refresh on the home page jumped back into reading mode, and why the address
  //   did not look clean after pressing Home).
  // WHY: a link like https://dharmadr.github.io/Mangat0/?url=https://site/chapter-2 opens that page once. But every later address write
  //   (rememberView / rememberChapter / goHome) copied location.search, so "?url=..." stayed in the address for ever. On the next refresh
  //   start-up saw "?url=" first, opened THAT page again as a user action (which jumps into reading mode) and even ignored the #r= / #p=
  //   memory. HOW: cleanSearch() returns the current "?..." part WITHOUT the url and q values (other values, if any, are kept). Every
  //   address write now uses it, so after the first page opens the address is only  /Mangat0/#r=...  (reading), /Mangat0/#p=... (a site page)
  //   or just /Mangat0/ (home). IMPROVE: if more MangaFlow-only query values are added later, list them here.
  function cleanSearch() {
    try { const sp = new URLSearchParams(location.search); sp.delete('url'); sp.delete('q'); const t = sp.toString(); return t ? '?' + t : ''; } catch { return ''; }
  }
  function rememberView(kind, value, push) {
    if (kind && value) lastView = { k: kind, v: value };
    if (settings.noHistory) return;                       // "Do not save my reading history" also means: no address-bar memory
    const hash = (kind && value ? '#' + kind + '=' + encodeURIComponent(value) : '');
    const full = location.pathname + cleanSearch() + hash;
    const changed = full !== (location.pathname + cleanSearch() + location.hash);   // ROUND 46: a leftover ?url= is stripped with replaceState, never pushed
    try {
      if (push && !suppressPush && changed) history.pushState({ mfi: ++navMax }, '', full);
      else history.replaceState(history.state, '', full);
    } catch { /* address bar not writable: fine */ }
  }

  /* ---- 18b. GOOGLE PROGRAMMABLE SEARCH ------------------------------------------------------------------------------------------------------------------ */
  // WHY: Google draws the search box and the results itself (inside #gvBox). HOW: loadCse() adds <script src="https://cse.google.com/cse.js?cx=ID"> once,
  // with parsetags:'explicit' so WE decide where it is drawn; its callback renders a 'search' element named 'mfcse'. runCse(words) calls execute(words).
  // The page's Content-Security-Policy (index.html and _headers) lists the three Google hosts this needs.
  // IMPROVE: show Google's "search only these sites" refinements as chips of our own.
  // ROUND 21 - GOOGLE SELF-TEST. WHY: "Google search is not working" has had a different cause every time (a blocked script, a blocked frame, a wrong ID, an engine with no sites).
  //   Guessing wastes rounds. HOW: every time the browser blocks something for the page, the host is remembered (cspSeen). googleDiag() loads the Google script, draws the
  //   results element, runs a test search and prints ONE plain sentence per step plus the blocked hosts, so the exact cause is visible (and can be copied to Claude).
  // IMPROVE: show the same list automatically when a Google search comes back empty.
  let googleLast = '';                                   // round 21: the outcome of the last Google search, for the bug report
  // ROUND 28 - GOOGLE "NO RESULTS". WHY: the owner still saw "no match found" and an empty Google panel. Two causes, both real: (1) Google's own "No Results" note is drawn inside a box that has the
  //   SAME classes as a real result (gsc-webResult gsc-result), so the round-21 check "is there a result box?" said YES; (2) a Google engine made after 20 January 2026 can only search the
  //   sites listed in its control panel ("Sites to search", at most 50 sites; Google's own announcement of 20 Jan 2026 and its help page say new engines cannot search the whole web), so
  //   a title that is not on those sites honestly finds nothing. HOW: hasGoogleResults() below looks for a real result LINK (a title link with an address) and ignores the "No Results"
  //   box; googleNote carries the plain-English reason to the results page of the free engines, which answer instead. IMPROVE: when Google changes its page, change only
  //   hasGoogleResults().
  let googleNote = '';
  const GOOGLE_NOTE = 'A Google search engine made after January 2026 can only search the sites listed in its control panel ("Sites to search", at most 50 sites), not the whole web, so a title that is not on those sites finds nothing. The results below come from the free search engines instead. To get Google results, add your manga sites in the Google control panel (Settings > Search & extras > "Copy my sites for Google" makes the list).';
  // WHY: tell real Google results from Google's "No Results" box. HOW: a real result has a title link with an address; the "No Results" box has the class gs-no-results-result and no title link.
  // If Google changes its class names, any result box that holds a link and does not start with "No Results" still counts. IMPROVE: also count image results.
  function hasGoogleResults(box) {
    if (!box) return false;
    if (box.querySelector('a.gs-title[href], .gs-title a[href]')) return true;
    if (box.querySelector('.gs-no-results-result')) return false;
    return Array.from(box.querySelectorAll('.gsc-webResult, .gs-webResult')).some(r => !/^\s*no results\b/i.test(r.textContent || '') && !!r.querySelector('a[href]'));
  }
  document.addEventListener('securitypolicyviolation', e => { try { cspSeen.add(e.effectiveDirective + ' ' + new URL(e.blockedURI).host); } catch { if (e.blockedURI) cspSeen.add(e.effectiveDirective + ' ' + e.blockedURI); } });
  async function googleDiag() {
    const out = [], cx = String(settings.googleCx || '').trim();
    out.push('ID: ' + (/^[\w:.-]{6,80}$/.test(cx) ? cx : 'MISSING or invalid (Settings > Search & extras)'));
    out.push('Page address: ' + location.origin + ' (the Google engine must allow this site; add it in the Google control panel if it asks)');
    cspSeen.clear();
    if (settings.googleKey) {
      try { const it = await googleApi('manga'); out.push('Google API test search "manga": ' + (it.length ? it.length + ' results (the API works; MangaFlow shows them in its own list)' : 'answered, but with NO results: the engine has no sites / "Search the entire web" is off')); }
      catch (e) { out.push('Google API test search: FAILED - ' + e.message); }
    } else out.push('Google API key: not set (the drawn Google element is used; set a key in Settings > Search & extras for MangaFlow\'s own list)');
    try { await loadCse(); out.push('Google script: loaded and the results element was drawn'); }
    catch (e) { out.push('Google script: FAILED - ' + e.message); }
    let got = null;
    if (!out.some(l => /FAILED/.test(l))) {
      try { got = await runCse('manga'); out.push('Test search "manga": ' + (got ? 'results were drawn (Google works)' : 'Google answered NOTHING (the engine has no sites, or none of its listed sites has this word / it is not public / asks for something we block). A Google engine made after January 2026 only searches the sites listed in its control panel (up to 50).')); }
      catch (e) { out.push('Test search: FAILED - ' + e.message); }
    }
    await wait(1500);
    out.push(cspSeen.size ? 'Blocked by the page security rules (add these hosts to script-src / frame-src in index.html AND _headers): ' + Array.from(cspSeen).join(', ') : 'Nothing was blocked by the page security rules');
    return out.join('\n');
  }
  // ROUND 22: the Google Programmable Search JSON API. Free: 100 searches a day. Returns [{title, url, snip}] or throws an Error whose text says what to fix.
  // ROUND 24: migration from round 23 (key was always baked in). When a saved key exists (from visiting before round 24), keep it; if the old default key was saved, clear it.
  // ROUND 43: getItem is now INSIDE the try (blocked storage threw here and stopped the whole start-up), and the old key is also cleared in memory (it was written straight back by the next applySettings()).
  try {
    const raw = localStorage.getItem('mf_settings');
    if (raw) { const s = JSON.parse(raw); if (s.googleKey === 'AIzaSyC-cqQ06mqJyhQ89x3UAqF5in6PKSF9Sds') { s.googleKey = ''; localStorage.setItem('mf_settings', JSON.stringify(s)); } }
    if (settings.googleKey === 'AIzaSyC-cqQ06mqJyhQ89x3UAqF5in6PKSF9Sds') settings.googleKey = '';
  } catch { /* ignore */ }
  // ROUND 23b: gKeyOn() = a key exists AND Google has not refused it for access reasons (then the key-less Programmable Search box is used). Resets when the key is edited.
  let googleApiDead = false;
  function gKeyOn() { return !!settings.googleKey && !googleApiDead; }
  async function googleApi(words) {
    const key = String(settings.googleKey || '').trim(), cx = String(settings.googleCx || '').trim();
    if (!key) throw new Error('no Google API key');
    const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), 12000);
    try {
      const r = await fetch('https://www.googleapis.com/customsearch/v1?key=' + encodeURIComponent(key) + '&cx=' + encodeURIComponent(cx) + '&q=' + encodeURIComponent(words) + '&num=10&hl=en', { signal: ctrl.signal });
      let j = {}; try { j = await r.json(); } catch { /* not JSON */ }
      if (!r.ok) {
        const m = (j.error && j.error.message) || ('HTTP ' + r.status);
        if (r.status === 403 && /does not have the access|has not been used|is disabled|not enabled|accessNotConfigured/i.test(m)) googleApiDead = true;     // 23b: stop trying the API
        throw new Error(r.status === 429 ? 'the free Google limit (100 searches a day) is used up' : r.status === 403 ? 'Google refused the key: ' + clipText(m, 90) + ' (enable the Custom Search API, and allow this site in the key\'s referrer list)' : r.status === 400 ? 'Google says: ' + clipText(m, 90) + ' (check the search ID / key)' : m);
      }
      return (j.items || []).map(it => ({ title: it.title || it.link, url: it.link, snip: it.snippet || '' })).filter(it => /^https?:/i.test(it.url));
    } catch (e) { throw new Error(e.name === 'AbortError' ? 'Google did not answer in 12 s' : e.message); }
    finally { clearTimeout(timer); }
  }
  let cseP = null;                                       // the loading promise (so the script is added only once)
  function loadCse() {
    const cx = String(settings.googleCx || '').trim();
    if (!/^[\w:.-]{6,80}$/.test(cx)) return Promise.reject(new Error('the Google search ID is missing or invalid (Settings > Search & extras)'));
    if (cseP) return cseP;
    cseP = new Promise((resolve, reject) => {
      let done = false;
      const fail = m => { if (!done) { done = true; cseP = null; reject(new Error(m)); } };
      // WHY: the settings object Google reads before it starts. HOW: parsetags 'explicit' = do not search the page for gcse tags; callback runs when ready;
      // searchCallbacks tell us when a search starts and when its results are drawn (to show or clear the status line).
      window.__gcse = {
        parsetags: 'explicit',
        searchCallbacks: { web: {
          starting: () => { $('#gvStatus').textContent = 'Searching…'; return ''; },
          rendered: () => { clearTimeout(runCse.t); $('#gvStatus').textContent = ''; if (runCse.done) runCse.done(true); }
        } },
        callback: () => {
          try {
            // WHY: draw one search element (box + results) in #gvBox. HOW: google.search.cse.element.render. linkTarget _blank is the safe fallback: if our
            // click catcher below ever misses a link, it opens in a new tab instead of replacing MangaFlow.
            // ROUND 19: tag 'searchresults-only' = Google draws ONLY the results list (no box of its own, no pop-up window). WHY: with tag 'search' the layout chosen in the
            // Google control panel ("Overlay") decided, and it opened a pop-up with its own search bar - the owner wants the normal search bar of THIS site to be used.
            // HOW: our address / search bar calls execute(words) below; the results are drawn inside #gvBox. IMPROVE: none needed.
            google.search.cse.element.render({ div: 'gvBox', tag: 'searchresults-only', gname: 'mfcse', attributes: { enableHistory: false, linkTarget: '_blank', autoSearchOnLoad: false, enableAutoComplete: false } });
            if (!done) { done = true; resolve(); }
          } catch (e) { fail('Google search could not draw itself (' + e.message + ')'); }
        }
      };
      const sc = document.createElement('script');
      sc.async = true; sc.src = 'https://cse.google.com/cse.js?cx=' + encodeURIComponent(cx);
      sc.onerror = () => fail('the Google script was blocked or you are offline');
      document.head.appendChild(sc);
      setTimeout(() => fail('Google did not answer in 10 seconds'), 10000);
    });
    return cseP;
  }
  // WHY: start one search in the drawn element. HOW: getElement('mfcse').execute(words). A watcher tells the person if nothing appears for 12 s.
  // ROUND 19: runCse now RETURNS a promise: true = results were drawn, false = nothing drawn within 9 s or Google said "no results". WHY: the owner saw empty panels
  // and a jump to google.com; now an empty answer is detected and the caller switches to the free engines at once (never a blank page). HOW: the 'rendered'
  // callback (see loadCse) calls runCse.done(true); a timer calls it with false. IMPROVE: show Google's refinement tabs.
  function runCse(words) {
    const el = google.search.cse.element.getElement('mfcse');
    if (!el) throw new Error('the Google search element is missing');
    return new Promise(res => {
      clearTimeout(runCse.t);
      const box = $('#gvBox'); if (box) box.querySelectorAll('.gsc-results-wrapper-nooverlay,.gsc-wrapper').forEach(n => n.remove && 0);
      runCse.done = ok => { runCse.done = null; clearTimeout(runCse.t); const b = $('#gvBox'); res(ok && hasGoogleResults(b)); };   // round 28: a real result LINK, not only a result-looking box
      runCse.t = setTimeout(() => { if (runCse.done) runCse.done(false); }, 9000);
      try { el.execute(words); } catch (e) { if (runCse.done) runCse.done(false); }
    });
  }
  function hideGview() { const gv = $('#gview'); if (gv) gv.hidden = true; }
  // WHY: show the Google panel instead of the start page / site frame. HOW: unhide it, hide the others, write the words in the bar.
  function showGview(words) {
    const gv = $('#gview'); gv.hidden = false; gv.scrollTop = 0;
    $('#start').hidden = true; frame.hidden = true;
    $('#gvQuery').textContent = '“' + words + '”'; $('#gvQuery').title = words; $('#gvStatus').textContent = 'Asking Google…';
  }
  // WHY: the search itself. HOW: show the panel, wait for the script, run the words. Returns true when Google took the search; false when it could not start
  // (the caller then uses the free engines). seq = the number of the navigate() call, to drop an old answer (see navSeq).
  async function googleSearch(input, push, seq) {
    const words = String(input || '').replace(/\s+/g, ' ').trim().slice(0, 300);
    if (!words) return false;
    setAddress(words); setLoading(true);
    try {
      showGview(words);
      await loadCse();
      if (seq !== navSeq) return false;                   // a newer search was started while Google loaded
      const got = await runCse(words + (settings.googleManga ? ' manga' : ''));
      if (seq !== navSeq) return false;
      // ROUND 19: Google answered with nothing (wrong ID, engine without sites, blocked) -> do NOT leave an empty panel: use the free engines (returns false).
      googleLast = got ? 'results drawn' : 'EMPTY (no results within 9 s)';
      if (!got) { hideGview(); googleNote = GOOGLE_NOTE; toast('Google gave no results - showing the free engines instead'); return false; }   // round 28: the results page then says WHY
    } catch (e) {
      googleLast = 'FAILED: ' + e.message;
      if (seq === navSeq) { hideGview(); toast('Google search could not start (' + clipText(e.message, 80) + ') - using the free engines'); }
      return false;
    } finally { if (seq === navSeq) setLoading(false); }
    cur = null; $('#fabRead').hidden = true;              // nothing to read on a results panel
    if (push) { hist = hist.slice(0, hi + 1); hist.push('mf-google:' + words); hi = hist.length - 1; }
    rememberView('q', words, push);   // ROUND 39: same push flag as the hist[] update just above, so both stay in sync
    updateNav();
    return true;
  }
  // ROUND 25: dark mode - results panel should be light for readability in both themes
  // WHY: Google results are white-text-on-dark in dark mode, hard to read. HOW: force gview to light theme.
  const styleR25 = document.createElement('style');
  styleR25.textContent = '#gview, #gvBox, #gvBox * { color-scheme: light; } #gvBox { background: white; color: black; } .gsc-webResult { background: white; } .gsc-result-info { color: #1a73e8; }';
  document.head.appendChild(styleR25);

  // WHY: a tap on a Google result must open it INSIDE MangaFlow (reading mode for manga pages), like a pasted link. HOW: one capture-phase click listener on
  // the panel; only real result links count (not page numbers or Google's own links); Google's click-tracking address is unwrapped to the real one;
  // Ctrl / Shift / middle click keep the browser's new-tab behaviour. IMPROVE: add an "open in new tab" button on each result.
  // ROUND 22: Google's own result links get OUR address too (set just before the person can use them), so Ctrl+click / middle click / "open in new tab" open MangaFlow, not the original site.
  ['pointerdown', 'mouseover', 'focusin', 'contextmenu', 'touchstart'].forEach(ev => $('#gvBox').addEventListener(ev, e => {
    const a = e.target.closest && e.target.closest('a[href]'); if (!a || !a.closest('.gsc-webResult, .gs-webResult') || a.dataset.mfReal) return;
    const real = unwrap(a.getAttribute('data-ctorig') || a.href); if (!/^https?:/i.test(real) || isSearchHost(real)) return;
    a.dataset.mfReal = real; a.href = appLink(real); a.removeAttribute('data-ctorig'); a.removeAttribute('data-cturl');
  }, true));
  $('#gvBox').addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('a[href]');
    if (!a || e.button || e.ctrlKey || e.metaKey || e.shiftKey || !a.closest('.gsc-webResult, .gs-webResult')) return;
    const real = a.dataset.mfReal || unwrap(a.getAttribute('data-ctorig') || a.href);
    if (!/^https?:/i.test(real) || isSearchHost(real)) return;
    e.preventDefault(); e.stopPropagation();
    navigate(real, true, { user: true });
  }, true);
  $('#gvClose').onclick = () => goHome();
  /* ROUND 28 - "COPY MY SITES FOR GOOGLE"
     WHY: a Google engine can only search the sites listed in its control panel (see GOOGLE_NOTE). Typing 20 manga sites by hand is slow, and the best list is the sites the person really uses.
     HOW: mySitesForGoogle() reads the hosts of the Recent list, the bookmarks, the reading history and the open page, drops search engines, this app's own address and hosting sites, puts the
          most used first, keeps at most 50 (Google's limit) and writes each as  host/*  (the form Google's "Sites to search" accepts). The button shows the list under it and copies it.
     IMPROVE: let the person untick sites before copying; open the Google control panel in one tap. */
  const SKIP_HOST = /(^|\.)(google\.[a-z.]+|googleapis\.com|gstatic\.com|workers\.dev|github\.io|pages\.dev|netlify\.app|localhost)$/i;
  function mySitesForGoogle() {
    const hosts = new Map(), self = hostOf(location.href);
    const add = u => {
      const h = hostOf(u || '');
      if (!h || !/\./.test(h) || h === self || /^\d+\.\d+\.\d+\.\d+$/.test(h) || SKIP_HOST.test(h) || isSearchHost('https://' + h + '/')) return;
      hosts.set(h, (hosts.get(h) || 0) + 1);
    };
    recent.forEach(r => add(r.url)); books.forEach(b => add(b.url)); reads.forEach(r => { add(r.seriesUrl); add(r.chapterUrl); });
    if (cur && cur.url && !cur.isSearch) add(cur.url);
    return Array.from(hosts).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 50).map(x => x[0] + '/*');
  }
  $('#setGSites').onclick = async () => {
    const o = $('#gTestOut'); o.hidden = false;
    const list = mySitesForGoogle();
    if (!list.length) { o.textContent = 'No sites yet: open a few manga sites in MangaFlow first, then press this button again.'; return; }
    const txt = list.join('\n');
    o.textContent = 'Sites for Google ("Sites to search", at most 50):\n' + txt + '\n\nAdd them in your Google search engine control panel (Sites to search > Add), then search again.';
    try { await navigator.clipboard.writeText(txt); toast(list.length + ' sites copied'); } catch { /* copy is a bonus: the list is shown above */ }
  };
  // the Settings button: runs the test, shows the text under it and copies it so it can be pasted to Claude
  $('#setGTest').onclick = async () => {
    const o = $('#gTestOut'); o.hidden = false; o.textContent = 'Testing Google…';
    try { const txt = await googleDiag(); o.textContent = txt; try { await navigator.clipboard.writeText('MangaFlow Google test\n' + txt); toast('Result copied'); } catch { /* copy is a bonus */ } }
    catch (e) { o.textContent = 'Test failed: ' + e.message; }
  };
  $('#gvTab').onclick = () => { const w = ($('#gvQuery').title || '').trim(); window.open(w ? 'https://www.google.com/search?q=' + encodeURIComponent(w) : 'https://www.google.com/', '_blank', 'noopener'); };

  /* ---- 18c. FULL SCREEN (like the F11 key) ------------------------------------------------------------------------------------------------------------ */
  // WHY: a bigger reading area. HOW: the browser's Fullscreen API on the whole page (title / address bars of MangaFlow stay); body.fs hides the floating helpers
  // (wheel, sliders, keys, download pill) by CSS and shows #fsExit. Esc leaves it (the browser does that by itself), so does the Exit button and F11.
  // F11 pressed in the browser itself is detected too (display-mode: fullscreen, or the window filling the screen).
  // IMPROVE: remember "start in full screen"; hide the title bar while scrolling down (it already slides away in reading mode).
  const fsRoot = document.documentElement;
  function fsSupported() { return !!(fsRoot.requestFullscreen || fsRoot.webkitRequestFullscreen); }
  function fsApiEl() { return document.fullscreenElement || document.webkitFullscreenElement || null; }
  function isFs() {
    if (fsApiEl()) return true;
    // WHY only this: F11 (browser full screen) makes the media query display-mode:fullscreen true in Chrome, Edge and Firefox. A "window as big as the screen"
    // test was tried and removed: kiosk windows and installed apps are screen-sized without being full screen, so body.fs wrongly hid the buttons.
    try { return matchMedia('(display-mode: fullscreen)').matches; } catch { return false; }
  }
  async function enterFs() {
    try { await (fsRoot.requestFullscreen || fsRoot.webkitRequestFullscreen).call(fsRoot, { navigationUI: 'hide' }); }
    catch { toast('The browser did not allow full screen'); }
  }
  async function leaveFs() {
    try { if (fsApiEl()) await (document.exitFullscreen || document.webkitExitFullscreen).call(document); else toast('Press F11 to leave full screen'); }
    catch { /* already left */ }
  }
  function toggleFs() { if (settings.showFs === false || !fsSupported()) return; if (isFs()) leaveFs(); else enterFs(); }
  // ROUND 29c - FULL SCREEN IS DIFFERENT ON A PHONE AND ON A COMPUTER. WHY: the owner: on a phone / small tablet full screen must hide ALL buttons except the exit button (the whole
  //   screen is for the pictures); on a computer every button should stay. Until round 28 every size hid the helper buttons and kept only the title bar.
  // HOW: isSmallScreen() decides once per change: a narrow window (700 px or less) OR a touch screen (pointer: coarse) up to 1100 px wide (phones, small iPads, tablets). syncFs() puts the
  //   extra class "fs-small" on <body> while in full screen on such a screen; style.css hides everything except the exit icon only for body.fs.fs-small. It runs again on every resize /
  //   rotation, so turning the phone or changing the window size switches the behaviour. IMPROVE: a setting "full screen on computers also hides the buttons" for people who want it.
  const SMALL_SCREEN = '(max-width: 700px), (pointer: coarse) and (max-width: 1100px)';
  function isSmallScreen() { try { return matchMedia(SMALL_SCREEN).matches; } catch { return window.innerWidth <= 700; } }
  let fsIdle = 0;
  function syncFs() {
    const on = isFs();
    document.body.classList.toggle('fs', on);
    document.body.classList.toggle('fs-small', on && isSmallScreen());        // round 29c: phone / small tablet = hide all buttons but the exit icon
    const ex = $('#fsExit'); ex.hidden = !on; ex.classList.remove('idle');
    clearTimeout(fsIdle); if (on) fsIdle = setTimeout(() => ex.classList.add('idle'), 3000);   // the exit button fades after 3 s; any movement brings it back
    $('#btnFsMenu').innerHTML = on ? '&#10005; Exit full screen' : '&#9974; Full screen'; $('#btnFsDl').innerHTML = on ? '&#10005; Exit full screen' : '&#9974; Full screen';
    $('#fsRead').title = on ? 'Leave full screen (Esc)' : 'Full screen (Esc leaves it)'; $('#btnFsNav').title = on ? 'Leave full screen (Esc)' : 'Full screen (Esc leaves it)';
  }
  ['btnFsNav', 'btnFsMenu', 'btnFsDl', 'fsRead'].forEach(id => { $('#' + id).onclick = () => { closeMenu(); toggleFs(); }; });
  $('#fsExit').onclick = leaveFs;
  ['fullscreenchange', 'webkitfullscreenchange'].forEach(ev => document.addEventListener(ev, syncFs));
  let fsResize = 0; window.addEventListener('resize', () => { clearTimeout(fsResize); fsResize = setTimeout(syncFs, 120); });
  ['pointermove', 'pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, () => { if (document.body.classList.contains('fs')) { const ex = $('#fsExit'); ex.classList.remove('idle'); clearTimeout(fsIdle); fsIdle = setTimeout(() => ex.classList.add('idle'), 3000); } }, { passive: true }));
  syncFs();

  /* ---- 18d. TOP / END SLIDER: scroll where the person pulled -------------------------------------------------------------------------------------------- */
  // WHY: edge-slider.js only sends 'mf-edge-jump' {where:'top'|'end'}; it does not know what is on screen. HOW: in reading mode the same functions as the Top and
  // End keys are used (so earlier chapters still load at the top); on the Google panel its own scroll box is moved; on a website page the frame's page is scrolled.
  // IMPROVE: when the frame is cross-origin the scroll needs the proxy copy; today pages are copied into the frame, so it works.
  window.addEventListener('mf-edge-jump', e => {
    const where = e.detail && e.detail.where, top = where === 'top';
    if (document.body.classList.contains('reading')) { (top ? $('#btnTop') : $('#btnEnd')).click(); return; }
    const gv = $('#gview');
    if (!gv.hidden) { gv.scrollTo({ top: top ? 0 : gv.scrollHeight, behavior: 'smooth' }); return; }
    if (!frame.hidden) { try { const w = frame.contentWindow, d = frame.contentDocument; w.scrollTo({ top: top ? 0 : Math.max(d.documentElement.scrollHeight, d.body ? d.body.scrollHeight : 0), behavior: 'smooth' }); } catch { /* frame not readable: ignore */ } return; }
    window.scrollTo({ top: top ? 0 : document.documentElement.scrollHeight, behavior: 'smooth' });
  });

  // WHY: Start-up: apply saved settings, draw the start page and the navigation buttons. HOW: three function calls in
  // order. IMPROVE: show a loading state.
  applySettings();
  renderStart();
  updateNav();
  // WHY: Support links like ?url=... that open a manga directly. HOW: URLSearchParams reads the url value; if present
  // navigate opens it as a user action. IMPROVE: validate the address first.
  // ROUND 46: a saved place in the address (#r= / #p= / #q=) is where the person WAS when they refreshed, so it wins over ?url= / ?q= (those only come from a shared link and are
  //   used once). Then ?url= / ?q= are removed from the address at once (replaceState, no new history entry) so a later refresh or Home can never open them again.
  const hasSaved = /^#[rpq]=./.test(location.hash);
  const qs = hasSaved ? null : new URLSearchParams(location.search).get('url');
  const qq = hasSaved ? null : new URLSearchParams(location.search).get('q');
  try { if (/[?&](url|q)=/.test(location.search)) history.replaceState(null, '', location.pathname + cleanSearch() + location.hash); } catch { /* address bar not writable: fine */ }                 // ROUND 22: a new tab opened from a search link: ?q=<words> = run it in OUR search
  if (qs) navigate(qs, true, { user: true }).then(endResume, endResume); else if (qq) navigate(qq, true, { user: false }).then(endResume, endResume);   // round 29a: the cover goes away when this is done (or failed)
  /* RESUME AFTER A REFRESH (round 9b): the address ends in #r=<chapter link> while you read. Open that chapter in reading mode again.
     If it cannot be loaded (offline, proxy down) the start page stays and the broken #r= is removed, so you are never stuck. */
  // WHY: After a page refresh, return to the chapter you were reading. HOW: reads the #r= part of the address, decodes it,
  // navigates and starts reading; if it fails the bad hash is removed. IMPROVE: show progress while resuming.
  async function resumeFromHash(fromPop) {
    // ROUND 43: qs/qq are read ONCE at start-up. popstate used to be blocked by them, so after opening ?url=... or ?q=... the browser Back/Forward did nothing. fromPop skips that start-up-only check.
    const m = /^#([rpq])=(.+)$/.exec(location.hash); if (!m || (!fromPop && (qs || qq))) { if (!qs && !qq) endResume(); return; }
    let url; try { url = decodeURIComponent(m[2]); } catch { endResume(); return; }
    // ROUND 30 - THE REOPEN THAT NEVER ENDS. WHY: when the saved page is slow (a slow proxy, a site that does not answer) the cover stood there and the person only saw "reloading" with no word
    //   and no report. HOW: boot.js already offers "Open the start page" after resumeSlowMs (12 s); here, after TWICE that time, the cover is removed (the start page shows, the load goes on in
    //   the background) and the usual big report opens: what was being reopened, which step it was in, the proxies. step says where we are. IMPROVE: let the report offer "Open the start page".
    let step = 'starting';
    const slowMs = +settings.resumeSlowMs >= 500 ? +settings.resumeSlowMs : 12000;
    const dog = setTimeout(() => {
      endResume();
      showError('Reopening your saved page is taking very long', { title: '\u23F3 Taking too long',
        hint: 'The page you were on has not come back after ' + Math.round(slowMs * 2 / 1000) + ' seconds. The site or the proxies are slow or blocked. The start page is shown now; MangaFlow keeps trying in the background. You can open the page again from "Recent" or paste its address again. Copy the report below if it keeps happening.',
        details: 'Saved place: ' + url + '\nKind: ' + (m[1] === 'r' ? 'chapter (reading mode)' : m[1] === 'q' ? 'search' : 'website page') + '\nStep: ' + step + '\nProxies: ' + settings.proxies.map(proxyName).join(', ') + '\nOnline: ' + navigator.onLine + '\nSignal: the cover was shown for ' + Math.round(slowMs * 2 / 1000) + ' s' });
    }, slowMs * 2);
    // ROUND 29a: everything below is inside try / finally so the cover ALWAYS goes away, even when the page cannot be loaded or something unexpected is thrown.
    try {
    // ROUND 18: #p=<page address> = the normal website page you were on, #q=<words> = your search. Open it again WITHOUT jumping into reading mode.
    // WHY: before, only a chapter (#r=) came back after a refresh; the normal site fell back to the start page. HOW: navigate() with user:false
    // (so tryAutoRead does not run); if it fails the memory is erased so you are never stuck. IMPROVE: also restore the scroll position.
    if (m[1] !== 'r') {
      toast(m[1] === 'q' ? 'Reopening your search…' : 'Reopening your page…');
      step = 'opening the page';
      const back = await navigate(url, true, { user: false });
      if (!back) rememberView(null);
      return;
    }
    // WHY: tell the person the chapter is being reopened. HOW: toast.
    toast('Resuming your chapter…');
    step = 'opening the chapter page';
    const ok = await navigate(url, true, { user: false });
    step = 'starting reading mode (chapter list and first pictures)';
    if (ok && cur && sameUrl(cur.url, url)) { if (!(await startReading({ quiet: true }))) toast('Could not resume reading. Press "Reading mode".'); }
    else { try { history.replaceState(null, '', location.pathname + cleanSearch()); } catch { /* ignore */ } }
    } finally { clearTimeout(dog); endResume(); }                // round 29a (round 30: the slow-reopen timer is stopped too)
  }
  // ROUND 30 - LISTS FROM THE CLOUD WITHOUT A RELOAD. WHY: when a signed-in profile finds newer lists in the cloud, profiles.js used to reload the whole page; that reload could repeat for ever (see
  //   profiles.js, "THE ENDLESS RELOADING"). HOW: profiles.js now only sends the event "mf-lists-changed"; here the three lists are read again from storage and the start page is drawn again.
  //   window.MF_LISTS_LIVE tells profiles.js that this door exists. IMPROVE: also refresh the bookmark star of the open page.
  window.MF_LISTS_LIVE = true;
  window.addEventListener('mf-lists-changed', () => { recent = store.get('recent', []); books = store.get('books', []); reads = store.get('reads', []); renderStart(); });
  // ROUND 30 - A RELOAD LOOP IS ALWAYS REPORTED. WHY: the owner got only "the site keeps reloading" and no report. HOW: boot.js counts the loads of this tab (5 in a minute = a loop, window.MF_LOOP) and
  //   stops automatic reloads; here the report opens once per 5 minutes with the numbers, the reasons written by MF_RELOAD, the profile and the last sync result. IMPROVE: send it to the admin.
  if (window.MF_LOOP) {
    let shown = 0; try { shown = +sessionStorage.getItem('mf_loop_shown') || 0; sessionStorage.setItem('mf_loop_shown', String(Date.now())); } catch { /* no storage: show it */ }
    if (Date.now() - shown > 300000) {
      let sy = {}; try { sy = JSON.parse(localStorage.getItem('mf_sync') || '{}'); } catch { /* ignore */ }
      let who = '-'; try { const ss = JSON.parse(localStorage.getItem('mf_session') || 'null'); if (ss) who = ss.user + ' (' + ss.role + ', ' + (ss.cloud ? 'cloud' : 'local') + ')'; } catch { /* ignore */ }
      setTimeout(() => showError('The page was loaded ' + window.MF_LOOP.loads + ' times in ' + window.MF_LOOP.seconds + ' seconds', { title: '\u{1F501} The page keeps reloading',
        hint: 'MangaFlow stopped its own automatic reloads for now. If the reasons below say "none written", the loads were probably your own refreshes or sign-in attempts (a successful sign-in reloads the page once) and nothing is wrong with the page itself. If it keeps happening on its own, copy the report and send it to Claude. Closing the tab and opening MangaFlow again usually ends it.',
        details: 'Loads of this tab in the last minute: ' + window.MF_LOOP.loads + ' (over ' + window.MF_LOOP.seconds + ' s)\nAutomatic reload reasons (newest last): ' + (window.MF_LOOP.why.length ? window.MF_LOOP.why.join(' | ') : 'none written (the browser or another script reloaded)') +
          '\nAddress: ' + location.href + '\nProfile: ' + who + ' | last sync: ' + (sy.t ? new Date(sy.t).toString() : 'never') + ' ok=' + sy.ok + ' ' + (sy.err || '') }), 1200);
    }
  }
  // WHY: Run the resume check on start. HOW: calls the async function without waiting. IMPROVE: catch errors from it.
  resumeFromHash();
  // ROUND 39 — THE OTHER HALF OF REAL BACK/FORWARD SUPPORT: what happens when the browser (or the device's back
  //   gesture, or the header's Back/Forward buttons, now wired to history.back()/forward() — see btnBack/btnFwd
  //   below) actually moves to a different entry. The 'popstate' event fires AFTER the address bar has already
  //   changed; this listener's only job is to make the SCREEN match whatever the address bar now says.
  // WHY suppressPush: without it, restoring a page here would call the same navigate()/rememberChapter() functions
  //   used for normal browsing, which would see "the address changed" and push YET ANOTHER entry — turning one
  //   Back press into a Back-then-forward-again loop. Setting suppressPush during the restore (and only clearing
  //   it once the restore's own async work has finished) stops that.
  // IMPROVE: keep the exact scroll position per chapter, not just which chapter is open.
  window.addEventListener('popstate', () => {
    setTimeout(() => { try { updateNav(); } catch { /* ignore */ } }, 0);   // ROUND 53: refresh Back/Forward greying after every native step
    const h = location.hash;
    suppressPush = true;
    const release = () => { suppressPush = false; };
    try {
      if (!/^#[rpq]=./.test(h)) {
        // the browser stepped to a plain (Home) entry, or to the very first entry MangaFlow ever wrote
        if (document.body.classList.contains('reading')) leaveReader();
        goHome();
        release();
        return;
      }
      resumeFromHash(true).then(release, release);
    } catch { release(); }
  });
  // START PAGE SEARCH CARD (round 10): same behaviour as the address bar (a link opens in reading mode, words search).
  // WHY: Make the big search card on the start page work. HOW: on submit, stops the page reload and opens the trimmed text
  // if not empty. The paste button reads the clipboard and fires an input event so other code reacts; on failure it shows
  // a toast. IMPROVE: auto-submit after paste.
  // ROUND 15: the buttons of the "page may look incomplete" notice. Report = the big pop-up with a copyable report; Open original = the real
  // site in a new browser tab (where its own scripts run); X = dismiss.
  $('#pageNoteReport').onclick = () => { const n = noteBar(); showError(($('#pageNoteText').textContent || 'Page looks incomplete').replace(/^\u26A0\s*/, ''), { title: n.dataset.title || 'Page looks incomplete', hint: 'Copy the report and send it to Claude together with MANGAFLOW.md. "Open original" shows the real site in a new tab.', details: n.dataset.report || '' }); };
  $('#pageNoteOpen').onclick = () => { if (cur && cur.url) window.open(cur.url, '_blank', 'noopener,noreferrer'); };
  // ROUND 39 — "Open on <site>" button. WHY: the owner asked for a quick way to jump from a manga site shown
  // inside MangaFlow (the mini-browser) straight to that SAME page on the real site, in a new tab — useful when a
  // button or script on the original page does not work through the proxy (see the round-39 notes on this in
  // MANGAFLOW.md). HOW: identical to the existing #pageNoteOpen handler just above (new tab, no referrer sent back
  // to MangaFlow); its own visibility is kept in sync with #fabRead inside updateNav().
  $('#btnOrigSite').onclick = () => { if (cur && cur.url) window.open(cur.url, '_blank', 'noopener,noreferrer'); };
  $('#pageNoteX').onclick = hidePageNote;
  // ROUND 15: the Manga / Everything switch under the start-page search box. HOW: two buttons with data-scope; the choice is saved in settings.searchManga.
  $$('#scopeSwitch [data-scope]').forEach(b => { b.onclick = () => { settings.searchManga = b.dataset.scope === 'manga'; syncScope(); applySettings(); }; });
  // ROUND 16: engine drop-down + Google button. WHY: choose which engine is tried first (the free engines are only a back-up when Google cannot answer). HOW: the select
  // value is saved in settings.searchEngine. (Round 16 made the Google button open google.com in a new tab; round 28b replaced that: see the button below.)
  const engineSel = $('#engineSel');
  // ROUND 18: 'google' is the first choice and is not in ENGINES (it is not fetched through a proxy; it uses your Google Programmable Search panel).
  if (engineSel) { engineSel.value = (settings.searchEngine === 'google' || ENGINES[settings.searchEngine]) ? settings.searchEngine : 'auto'; engineSel.onchange = () => { settings.searchEngine = engineSel.value; applySettings(); toast('Search engine: ' + (engineSel.value === 'google' ? 'Google (your search)' : ENGINES[engineSel.value] ? ENGINES[engineSel.value].name : 'Auto')); }; }
  // ROUND 28b - WHY: the button says "Search these words with Google inside MangaFlow", but without an API key (the default since round 24) it opened google.com in a NEW TAB;
  //   only people with a key stayed inside the site. HOW: whenever something is typed, the words go through navigate() with engine 'google'. With a key they use the Google API list,
  //   without one the key-less Google search panel (googleSearch); if Google cannot answer, the free engines take over. The ONLY time the button leaves the site is an EMPTY box:
  //   there are no words to search, so google.com is opened in a new tab (noopener = the new tab cannot reach this page). IMPROVE: when the box is empty, focus the box and
  //   toast "Type the words first" instead of leaving.
  const googleBtn = $('#googleBtn');
  if (googleBtn) googleBtn.onclick = () => {
    const w = ($('#addrHero').value || '').trim();
    if (w) { navigate(w, true, { user: false, engine: 'google' }); return; }
    window.open('https://www.google.com/', '_blank', 'noopener');
  };
  function syncScope() { $$('#scopeSwitch [data-scope]').forEach(b => { const on = (b.dataset.scope === 'manga') === (settings.searchManga !== false); b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); }); }
  syncScope();
  // ROUND 15: the live "HUD" strip on the start page (online light, proxies, cached pages, reading list, clock). HOW: redrawn every second, but
  // only while the start page is visible, so it costs nothing while reading.
  function drawHud() {
    const h = $('#hud'); if (!h || $('#start').hidden) return;
    const t = new Date(), two = n => String(n).padStart(2, '0');
    // WHY: draw the status strip. HOW: a text with a green or red light, the word ONLINE or OFFLINE, counters and the clock.
    h.innerHTML = '<span class="led ' + (navigator.onLine ? 'ok' : 'bad') + '"></span><b>' + (navigator.onLine ? 'ONLINE' : 'OFFLINE') + '</b>' +
      '<i>PROXIES ' + settings.proxies.length + '</i><i>CACHED ' + cache.size + '</i><i>READING ' + reads.length + '</i><i>MARKS ' + books.length + '</i><em>' + two(t.getHours()) + ':' + two(t.getMinutes()) + ':' + two(t.getSeconds()) + '</em>';
  }
  drawHud(); setInterval(drawHud, 1000);
  $('#heroForm').addEventListener('submit', e => { e.preventDefault(); const v = $('#addrHero').value.trim(); if (v) navigate(v, true, { user: true }); });
  // ROUND 17: PASTE BUTTON + CLIPBOARD LIST.
  // WHY: the paste button must put whatever you copied into the box with ONE tap, and the little arrow beside it must work like a
  //      clipboard: a list of the things you copied or pasted lately, to pick from again.
  // HOW: pasteInto() reads the clipboard (a browser may ask permission once), fills the box, remembers the text (clipAdd) and, if the
  //      box was a link, leaves it for you to press Read / Go. When the browser refuses, the box stays selected and a toast explains
  //      the long-press way (round 29b: the list is NO LONGER opened by a refused paste; only the arrow opens it). The list (max 12) is saved on this device only (mf_clips), is erased by "Do not save history" /
  //      "erase when the tab closes", and has a "Clear list" row. It also learns from copy / paste events inside MangaFlow.
  // IMPROVE: pin favourite links; a "paste and go" option.
  const CLIP_MAX = 12;
  const clipList = () => { const l = store.get('clips', []); return Array.isArray(l) ? l.filter(x => typeof x === 'string') : []; };
  // WHY: remember a text. HOW: trim, skip empty or very long (2000+) text and when history is off, put it first, drop repeats, keep 12.
  function clipAdd(t) { t = (t || '').trim(); if (!t || t.length > 2000 || settings.noHistory) return; store.set('clips', [t].concat(clipList().filter(x => x !== t)).slice(0, CLIP_MAX)); }
  // WHY: show a text in a box as if typed. HOW: set value, fire 'input' so the clear (x) button and other code react, focus the box.
  function fillBox(inp, t) { inp.value = t; inp.dispatchEvent(new Event('input')); inp.focus(); }
  // ROUND 18: ONE-TAP PASTE.
  // WHY: the paste button asked "twice": first the button, then a small "Paste" bubble. That bubble is NOT ours: Firefox (and Safari) show it by themselves
  //      every time a page reads the clipboard, and no page code can switch it off (it protects your clipboard). Chrome / Edge ask only once and remember.
  //      What we CAN do: (1) never start a second request while the first is open (a double tap used to cause a second bubble), (2) focus the box first,
  //      (3) offer the always-silent way: Ctrl+V / long-press > Paste in the box, and with "Open the search straight after Paste" (Settings > Search & extras)
  //      that single Ctrl+V pastes AND opens, (4) after a refused paste keep the box selected so Ctrl+V works at once.
  // HOW: pasting = true while a request is open; submitBox() presses Go / Read for the box.
  // IMPROVE: pin favourite links; a "paste and go" long-press on the button.
  let pasting = false;
  // WHY: press the Go / Read button of the form that owns this box. HOW: requestSubmit fires the normal submit handlers (so all checks run).
  function submitBox(inp) { const f = inp && inp.form; if (!f || !inp.value.trim()) return; try { f.requestSubmit(); } catch { f.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true })); } }
  async function pasteInto(inp) {
    if (pasting) return;                                   // a request is already open (the browser's own Paste bubble): do not start another
    pasting = true;
    try { inp.focus({ preventScroll: true }); } catch { /* ignore */ }
    try {
      const t = ((await navigator.clipboard.readText()) || '').trim();
      if (!t) { toast('The clipboard is empty - copy a link or words first'); return; }
      clipAdd(t); fillBox(inp, t);
      if (settings.goStraight) submitBox(inp);             // "open straight after paste" is on: press Go / Read for the person
    // ROUND 29b - A REFUSED PASTE NO LONGER OPENS THE LIST. WHY: reading the clipboard can be refused (the browser's own "Allow clipboard" question was dismissed or answered Block, an
    //   old browser, an http page). Round 17 then opened the clipboard list, so the owner saw "the Paste button shows the list instead of pasting". The list belongs to the little arrow
    //   ONLY. HOW: keep the box focused and selected (Ctrl+V / long-press > Paste then works at once), ask the browser whether the clipboard permission is "denied" (navigator.permissions,
    //   may not exist) and say in plain words what to do. IMPROVE: show a small "Paste" button inside the toast.
    } catch {
      try { inp.focus(); inp.select(); } catch { /* ignore */ }
      let denied = false;
      try { const st = await navigator.permissions.query({ name: 'clipboard-read' }); denied = st.state === 'denied'; } catch { /* this browser cannot tell: use the general message */ }
      toast(denied
        ? 'Clipboard access is blocked for this site. Tap the lock icon next to the address > Permissions > Clipboard > Allow. Until then: long-press the box > Paste.'
        : 'Your browser did not share the clipboard. Long-press the box and choose Paste (or press Ctrl+V). When it asks to allow clipboard access, tap Allow once.');
    } finally { pasting = false; }
  }
  // WHY: Ctrl+V / right-click Paste / long-press Paste inside the boxes never shows any bubble. HOW: with "Open the search straight after Paste" on, a paste
  // event presses Go / Read after the text is in the box. IMPROVE: none needed.
  ['addr', 'addrHero', 'addr2', 'rdAddr'].forEach(id => { const i = $('#' + id); if (i) i.addEventListener('paste', () => { if (settings.goStraight) setTimeout(() => { clipAdd(i.value); submitBox(i); }, 0); }); });
  // WHY: the drop-down list. HOW: one shared #clipPop; openClip(button, input) fills it and puts it under the button (inside the
  // screen); a tap on a row fills that input; x removes one row; "Clear list" removes all; a tap outside or Escape closes it.
  const clipPop = $('#clipPop');
  function closeClip() { if (clipPop) clipPop.hidden = true; }
  function openClip(btn, inp) {
    // WHY: nothing to do when the list element is missing. HOW: return early. IMPROVE: none needed.
    if (!clipPop) return;
    // WHY: the saved texts. HOW: clipList reads them (newest first). IMPROVE: none needed.
    const list = clipList();
    // WHY: start from an empty list every time. HOW: clear the old rows. IMPROVE: none needed.
    clipPop.innerHTML = '';
    // WHY: a small helper that makes one button. HOW: create a button, set its class, text and click action. IMPROVE: none
    // needed.
    const mk = (cls, text, fn) => { const b = document.createElement('button'); b.type = 'button'; b.className = cls; b.textContent = text; b.onclick = fn; return b; };
    // WHY: the first row pastes the clipboard again. HOW: close the list, then call pasteInto. IMPROVE: none needed.
    clipPop.appendChild(mk('clip-now', '\u{1F4CB} Paste what I copied last', () => { closeClip(); pasteInto(inp); }));
    // WHY: tell the person why the list is empty. HOW: show a short hint text instead of rows. IMPROVE: none needed.
    if (!list.length) { const e = document.createElement('div'); e.className = 'clip-empty'; e.textContent = 'Nothing saved yet. Things you paste or copy here appear in this list.'; clipPop.appendChild(e); }
    // WHY: one row for every saved text. HOW: forEach over the list. IMPROVE: none needed.
    list.forEach(t => {
      // WHY: a row holds the text button and the small x. HOW: a div with class clip-row. IMPROVE: none needed.
      const row = document.createElement('div'); row.className = 'clip-row';
      // WHY: tapping the text fills the box. HOW: long texts are cut to 90 letters for display; the click fills the full text.
      // IMPROVE: none needed.
      row.appendChild(mk('clip-item', t.length > 90 ? t.slice(0, 89) + '…' : t, () => { closeClip(); fillBox(inp, t); }));
      // WHY: show the full text when the person holds or hovers. HOW: set the title attribute. IMPROVE: none needed.
      row.lastChild.title = t;
      // WHY: remove one text. HOW: save the list without it, then draw the list again. IMPROVE: none needed.
      row.appendChild(mk('clip-del', '✕', e => { e.stopPropagation(); store.set('clips', clipList().filter(x => x !== t)); openClip(btn, inp); }));
      // WHY: put the row on screen. HOW: appendChild. IMPROVE: none needed.
      clipPop.appendChild(row);
    });
    // WHY: a way to erase everything. HOW: the last row saves an empty list and closes the list. IMPROVE: ask before
    // erasing.
    if (list.length) clipPop.appendChild(mk('clip-clear', 'Clear list', () => { store.set('clips', []); closeClip(); toast('Clipboard list cleared'); }));
    // WHY: show the list. HOW: remove the hidden flag. IMPROVE: none needed.
    clipPop.hidden = false;
    // place it: under the button, never outside the screen (fixed position, so scrolling the page does not matter)
    const r = btn.getBoundingClientRect(), w = Math.min(340, window.innerWidth - 16);
    clipPop.style.width = w + 'px';
    clipPop.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w)) + 'px';
    // WHY: place the list under the arrow and keep it inside the screen. HOW: top = button bottom + 6 px, but not lower than
    // the window allows. IMPROVE: open upwards when there is no room.
    clipPop.style.top = Math.min(window.innerHeight - 80, r.bottom + 6) + 'px';
  }
  // WHY: close the list when the person taps anywhere else. HOW: pointerdown outside the list and the arrow closes it.
  // IMPROVE: none needed.
  document.addEventListener('pointerdown', e => { if (clipPop && !clipPop.hidden && !clipPop.contains(e.target) && !e.target.closest('.clipdd')) closeClip(); });
  // WHY: the Escape key closes the list. HOW: keydown listener. IMPROVE: none needed.
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeClip(); });
  // learn from copy / paste inside MangaFlow (only the text the person selected or pasted)
  const secretBox = el => !!(el && el.closest && el.closest('input[type=password], #setGKey, #setCx, #proxyNew, dialog:not(#searchPop)'));   // round 43: never remember keys / passwords / settings text
  document.addEventListener('copy', () => { try { if (secretBox(document.activeElement)) return; clipAdd(String(document.getSelection() || '')); } catch { /* ignore */ } });
  document.addEventListener('paste', e => { try { if (secretBox(e.target)) return; clipAdd(e.clipboardData && e.clipboardData.getData('text')); } catch { /* ignore */ } });
  $('#heroPaste').onclick = () => pasteInto($('#addrHero'));
  // WHY: the arrow beside the start-page paste button. HOW: opens the list for the start-page box. IMPROVE: none needed.
  $('#heroClip').onclick = () => openClip($('#heroClip'), $('#addrHero'));
  // WHY: Show the download dock state at start. HOW: syncDock() decides if the dock should be visible. IMPROVE: none
  // needed.
  syncDock();
  // The (x) buttons inside the search boxes: show only when there is text; clear + focus on tap.
  // WHY: Make the clear (x) buttons in search boxes work. HOW: for each button, finds its input via data-for; sync hides
  // the button when empty; tapping clears, syncs and focuses. IMPROVE: use CSS :placeholder-shown.
  // ROUND 18: THE CLEAR (x) BUTTON - rebuilt so it cannot be broken by later changes.
  // WHY it failed before: round 17 stopped the touch start / pointer down of the x to keep the keyboard open. On touch screens (and some touch laptops) that
  //   cancels the click that should follow, so the x did nothing; each later style or script change then made it look "fixed" or "broken" again.
  // HOW now: (1) ONE listener on the whole document (capture phase) handles a click on ANY .clearx, so it works for boxes that are drawn later and
  //   cannot be switched off by another handler; (2) only a MOUSE press is stopped from stealing the focus (mousedown), touch and pen are left alone;
  //   (3) clearing = empty the box, send a real 'input' event (so every other part reacts), refresh all x buttons, put the cursor back; (4) setAddress(),
  //   typing and focus also refresh the x buttons through syncClear().
  // IMPROVE: let Escape clear the focused box; show the x also while the box is empty but has a suggestion.
  const syncClear = () => $$('.clearx').forEach(b => { const i = $('#' + b.dataset.for); b.hidden = !(i && i.value); });
  $$('.clearx').forEach(b => { const i = $('#' + b.dataset.for); if (i) ['input', 'focus', 'change'].forEach(ev => i.addEventListener(ev, syncClear)); });
  document.addEventListener('mousedown', e => { const b = e.target.closest && e.target.closest('.clearx'); if (b) e.preventDefault(); }, true);   // mouse only: the box keeps the focus
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('.clearx'); if (!b) return;
    e.preventDefault(); e.stopPropagation();
    const inp = $('#' + b.dataset.for); if (!inp) return;
    inp.value = ''; inp.dispatchEvent(new Event('input', { bubbles: true })); syncClear();
    try { inp.focus({ preventScroll: true }); } catch { /* ignore */ }
  }, true);
  syncClear();
  // WHY: The home button in the reader. HOW: leaves reading mode, then goes to the start page. IMPROVE: ask before leaving
  // during downloads.
  $('#btnHomeR').onclick = () => { leaveReader(); goHome(); };
})();
