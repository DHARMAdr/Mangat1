/* =====================================================================
   MangaFlow - autoscroll.js   (OPTIONAL add-on file, round 74)
   ---------------------------------------------------------------------
   WHY it exists:
     The owner wanted a play button that reads "by itself": press it once and the chapters scroll down a little, wait a few seconds, scroll a
     little again ... until the end of the last chapter. It is a SEPARATE file (like chapter-slider.js and reload-wheel.js): link it and the button
     appears, remove the <script> line (or this file) and nothing else changes.
   WHERE: the left edge in reading mode, directly UNDER the reload wheel (style.css is not needed: this file brings its own CSS).
   HOW it works (4 short steps):
     1. It draws one round button with a play triangle. Click = start, click again = pause (the picture changes to two bars).
     2. A timer (setTimeout, one after the other, never two at once) calls step() every N seconds (Settings: "Auto scroll: every N s", default 3).
     3. step() does exactly what one TAP on the page does in MangaFlow: window.scrollBy(0, 85 % of the screen height), smoothly.
        - If you touched / scrolled / pressed a key in the last 1.5 s it waits for the next round (you are reading something else).
        - If the browser tab is hidden it waits (no scrolling in the background).
        - At the bottom of the page it does NOT stop at once: new chapters are still being loaded. It stops only when app.js says there are no more
          chapters (window.MangaFlowReaderInfo().atEnd) and nothing is loading. Without that helper it stops after 4 rounds at the bottom.
     4. While it runs it asks the browser to keep the screen awake (Screen Wake Lock) when Settings > "keep the screen on" is ticked.
   TALKS TO app.js ONLY through:   window.MangaFlowAutoCfg = {show, secs, awake}  +  the event 'mf-auto-config'  +  window.MangaFlowReaderInfo().
   KEYBOARD: Tab to the button, Enter / Space = start / pause. Esc stops it.
   HOW to IMPROVE it: a speed slider in pixels per second (smooth continuous scroll), a "stop at next chapter" choice, a countdown ring around the button,
     remember the running state after a reload.
   ===================================================================== */
(() => {                                                   // WHY: an IIFE keeps every variable private
  'use strict';
  if (window.MangaFlowAutoScroll) return;                  // WHY: never build two buttons

  const cfg = () => Object.assign({ show: true, secs: 3, awake: true }, window.MangaFlowAutoCfg || {});   // WHY: safe defaults when app.js has not set anything yet
  const clampSecs = v => Math.min(60, Math.max(1, Math.round(+v) || 3));                                  // 1 .. 60 seconds, a wrong value becomes 3
  const reduce = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;      // people who dislike animation get a plain jump

  const css = `
  #mfAuto{position:fixed;display:none;z-index:31;left:max(8px,env(safe-area-inset-left));top:calc(var(--col-top,124px) + var(--mfw,64px) + 12px);
    width:44px;height:44px;padding:0;border-radius:50%;border:1px solid rgba(127,246,255,.35);cursor:pointer;color:#7ff6ff;
    background:radial-gradient(circle at 50% 40%,#1c1f33,#080a11 72%);box-shadow:0 0 12px rgba(37,168,255,.3),0 4px 12px rgba(0,0,0,.4);
    transition:top .25s,opacity .25s,box-shadow .2s;-webkit-tap-highlight-color:transparent;touch-action:manipulation;}
  body.reading #mfAuto{display:block;}                       /* only in reading mode */
  body.no-auto #mfAuto{display:none!important;pointer-events:none!important;}   /* Settings: Auto-scroll button switched off */
  body.fs-small #mfAuto{display:none!important;}
  #mfAuto svg{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;}
  #mfAuto .mf-play{display:block;} #mfAuto .mf-pause{display:none;}
  #mfAuto.on .mf-play{display:none;} #mfAuto.on .mf-pause{display:block;}
  #mfAuto.on{color:#fff;box-shadow:0 0 16px rgba(224,64,251,.55),0 0 0 2px rgba(224,64,251,.55);}
  #mfAuto:focus-visible{outline:3px solid #fff;outline-offset:3px;}
  #mfAuto .mf-tip{position:absolute;left:0;top:100%;margin-top:8px;padding:3px 10px;border-radius:999px;background:#111;color:#fff;
    font:600 12px system-ui,sans-serif;white-space:nowrap;opacity:0;transition:opacity .15s;pointer-events:none;}
  #mfAuto.show .mf-tip{opacity:1;}
  @media (max-width:520px){#mfAuto{width:40px;height:40px;top:calc(var(--col-top,124px) + var(--mfw,56px) + 10px);}}
  @media (max-height:430px){#mfAuto{width:38px;height:38px;}}
  `;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  const btn = document.createElement('button');            // the one button
  btn.id = 'mfAuto'; btn.type = 'button'; btn.setAttribute('aria-label', 'Auto scroll: start or pause'); btn.setAttribute('aria-pressed', 'false');
  btn.innerHTML =
    '<svg viewBox="0 0 44 44" aria-hidden="true">' +
      '<path class="mf-play" d="M17 13.5v17l14-8.5z" fill="currentColor"/>' +
      '<g class="mf-pause" fill="currentColor"><rect x="15" y="14" width="5" height="16" rx="1.5"/><rect x="24" y="14" width="5" height="16" rx="1.5"/></g>' +
    '</svg><span class="mf-tip" role="status"></span>';
  document.body.appendChild(btn);
  const tip = btn.querySelector('.mf-tip');

  let on = false, timer = 0, lastUser = 0, atBottomRounds = 0, lock = null, tipTimer = 0;

  function say(text, ms) {                                 // WHY: a tiny message next to the button (this file cannot call app.js's toast)
    tip.textContent = text; btn.classList.add('show'); clearTimeout(tipTimer);
    tipTimer = setTimeout(() => btn.classList.remove('show'), ms || 2200);
  }
  function reading() { return document.body.classList.contains('reading') && !document.body.classList.contains('no-auto') && cfg().show !== false; }

  /* ---------- keep the screen awake while running (Screen Wake Lock) ---------- */
  async function wake(want) {
    try {
      if (!want) { if (lock) { await lock.release(); lock = null; } return; }
      if (cfg().awake === false || !('wakeLock' in navigator) || lock || document.hidden) return;
      lock = await navigator.wakeLock.request('screen');
      lock.addEventListener('release', () => { lock = null; });
    } catch { /* not allowed (battery saver, old browser): scrolling still works */ }
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && on) wake(true); });   // the browser drops the lock when the tab hides: ask again

  /* ---------- the scroll step ---------- */
  function atBottom() { return window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 8; }
  function step() {
    timer = 0;
    if (!on) return;
    if (!reading()) { stop(); return; }                    // left reading mode / switched off in Settings
    if (document.hidden || Date.now() - lastUser < 1500) { schedule(); return; }   // tab hidden or you are touching the page: try again next round
    if (atBottom()) {
      // at the bottom: either the next chapters are still arriving, or this is really the end
      let info = null; try { info = window.MangaFlowReaderInfo && window.MangaFlowReaderInfo(); } catch { /* none */ }
      atBottomRounds++;
      if ((info && info.atEnd && !info.busy && atBottomRounds >= 2) || (!info && atBottomRounds >= 4)) { stop('End of the chapters'); return; }
    } else {
      atBottomRounds = 0;
      window.scrollBy({ top: Math.round(window.innerHeight * 0.85), behavior: reduce() ? 'auto' : 'smooth' });   // = one tap of the page (app.js uses 85 %)
    }
    schedule();
  }
  function schedule() { clearTimeout(timer); timer = setTimeout(step, clampSecs(cfg().secs) * 1000); }

  function start() {
    if (on || !reading()) return;
    on = true; atBottomRounds = 0; lastUser = 0;
    btn.classList.add('on'); btn.setAttribute('aria-pressed', 'true');
    say('Auto scroll on · every ' + clampSecs(cfg().secs) + ' s', 2200);
    wake(true);
    clearTimeout(timer); timer = setTimeout(step, 400);    // the first little scroll comes almost at once, then every N seconds
  }
  function stop(msg) {
    const was = on;
    on = false; clearTimeout(timer); timer = 0;
    btn.classList.remove('on'); btn.setAttribute('aria-pressed', 'false');
    wake(false);
    if (was && msg) say(msg, 3000); else if (was) say('Auto scroll paused', 1600);
  }

  btn.addEventListener('click', () => { if (on) stop(); else start(); });
  // your own touch / wheel / keys: a short pause so the page does not jump away while you read something
  ['touchstart', 'touchmove', 'wheel', 'keydown', 'pointerdown'].forEach(ev => window.addEventListener(ev, e => { if (e.target !== btn && !btn.contains(e.target)) lastUser = Date.now(); }, { passive: true }));
  window.addEventListener('keydown', e => { if (e.key === 'Escape' && on) stop(); });
  window.addEventListener('mf-auto-config', () => { if (on && !reading()) stop(); });          // the setting was switched off while running
  // leaving reading mode (Home, another manga) stops it
  new MutationObserver(() => { if (on && !reading()) stop(); }).observe(document.body, { attributes: true, attributeFilter: ['class'] });

  window.MangaFlowAutoScroll = { start, stop, running: () => on };    // marker (app.js looks it up) and a tiny public handle
})();
