/* MangaFlow - boot.js (ROUND 29, extended in ROUND 30)
   WHY: the owner saw the START PAGE flash for a second when a page was refreshed (or the browser was closed and reopened) and only then the page they were on came back.
        Cause: the start screen is plain HTML, so the browser paints it as soon as it has the file, while the big app.js (about 540 KB) is still loading; only after app.js has
        run does it read the part after "#" of the address ("#r=" chapter, "#p=" website page, "#q=" search) and reopen that. The same gap showed the wrong colours (white before dark).
   HOW: this file is tiny and sits in the <head>, BEFORE the page is painted, so it runs first and does four things:
        1. it reads the saved theme and accent colour (localStorage "mf_settings") and puts them on <html>, so dark mode is dark from the first paint;
        2. when the address asks for a reopen ("#r=", "#p=", "#q=" or "?url=" / "?q="), it adds the class "mf-resuming" to <html>. style.css then shows the cover
           #resume ("Reopening where you were...") on top of everything. app.js removes the class (endResume) as soon as the right page is really on the screen,
           or when it gave up (the page could not be loaded) - so the person is never stuck behind the cover.
        3. (round 30) if the cover is still there after 12 seconds it shows a sentence ("taking longer than usual") and a button "Open the start page", so a slow site can never keep
           the person waiting without a way out. The 12 seconds can be changed with the hidden setting resumeSlowMs (the tests use 1.5 s).
        4. (round 30) it COUNTS how often this tab loaded the page in the last minute (sessionStorage "mf_boots"). Five loads in a minute = a reload loop: it sets window.MF_LOOP (app.js
           then opens an error report with the numbers and the reasons) and switches AUTOMATIC reloads off for ten minutes. The one door for an automatic reload is window.MF_RELOAD(why):
           it writes the reason down (sessionStorage "mf_why") and reloads, unless a loop was seen - then it returns false and does nothing.
   WHY the loop guard: on 2026-10-30 the owner reported "the site keeps reloading and reloading after I reopen the browser, and I get no report". The reload came from profiles.js (a
        cloud list that never became equal to the local one); nothing counted it and nothing told the person. Now any loop, from any cause, is stopped (when MangaFlow's own code is the
        cause) and always reported (when the browser is the cause).
   SAFETY: if app.js never arrives (offline, blocked) a timer removes the cover class after 30 s anyway. Every step is inside try/catch: this file must never stop the page.
   WHY NOT in app.js: a script at the end of the body can run after the first paint; a script in the head cannot. WHY NOT inline in index.html: the page security
        policy (script-src 'self') forbids inline scripts, so it is a separate file.
   IMPROVE: also remember the scroll position and paint a grey copy of the last page as the cover; show the loop numbers on the cover itself when app.js is very slow. */
(function () {
  'use strict';
  var root = document.documentElement, now = Date.now(), settings = null;
  // 1. colours from the saved settings (same key and shape as app.js: store.set('settings', ...) writes JSON under "mf_settings")
  try {
    settings = JSON.parse(localStorage.getItem('mf_settings') || 'null');
    if (settings && (settings.theme === 'dark' || settings.theme === 'light')) root.setAttribute('data-theme', settings.theme);
    if (settings && /^#[0-9a-f]{6}$/i.test(settings.accent || '')) root.style.setProperty('--accent', settings.accent);        // only a plain #rrggbb value, like app.js
  } catch (e) { /* storage blocked or broken JSON: app.js will apply the settings a moment later */ }
  // 2. the cover while a reopen is on the way, and 3. the way out when it takes long
  try {
    if (/^#[rpq]=./.test(location.hash) || /[?&](url|q)=./.test(location.search)) {
      root.classList.add('mf-resuming');
      setTimeout(function () { root.classList.remove('mf-resuming'); }, 30000);                          // never longer than 30 s, whatever happens
      var slowMs = 12000;                                                                                 // how long the cover may stand alone before it offers a way out
      if (settings && Number(settings.resumeSlowMs) >= 500 && Number(settings.resumeSlowMs) <= 25000) slowMs = Number(settings.resumeSlowMs);
      setTimeout(function () {
        var box = document.getElementById('resumeSlow');
        if (box && root.classList.contains('mf-resuming')) box.hidden = false;
      }, slowMs);
      // the button is made by index.html, which is not parsed yet when this file runs, so ONE click listener on the whole document waits for it (no inline handler: the page policy forbids them)
      document.addEventListener('click', function (e) {
        var t = e.target; if (!t || t.id !== 'resumeHome') return;
        try { location.replace(location.pathname); } catch (err) { location.href = location.pathname; }     // the same page WITHOUT "#..." / "?...": the start page
      });
    }
  } catch (e) { /* ignore */ }
  // 4. the reload-loop guard
  var boots = [];
  try {
    boots = JSON.parse(sessionStorage.getItem('mf_boots') || '[]').filter(function (t) { return now - t < 60000; });
    boots.push(now);
    sessionStorage.setItem('mf_boots', JSON.stringify(boots.slice(-12)));
  } catch (e) { /* no sessionStorage (private mode): the guard is simply off */ }
  var why = []; try { why = JSON.parse(sessionStorage.getItem('mf_why') || '[]'); } catch (e) { why = []; }
  if (boots.length >= 5) {
    window.MF_LOOP = { loads: boots.length, seconds: Math.round((now - boots[0]) / 1000), why: why.slice(-8) };
    try { sessionStorage.setItem('mf_noreload', String(now)); } catch (e) { /* ignore */ }
  }
  // the ONE door for an automatic reload (profiles.js and app.js use it). Returns true when it reloads, false when it refuses.
  window.MF_RELOAD = function (reason) {
    try {
      why.push(String(reason || '?').slice(0, 80) + ' @' + new Date().toLocaleTimeString());
      sessionStorage.setItem('mf_why', JSON.stringify(why.slice(-8)));
      var blocked = Number(sessionStorage.getItem('mf_noreload') || 0);
      if (blocked && Date.now() - blocked < 600000) return false;                                         // a loop was seen in the last 10 minutes: no automatic reloads
    } catch (e) { /* storage blocked: reload anyway, once */ }
    location.reload();
    return true;
  };
})();
