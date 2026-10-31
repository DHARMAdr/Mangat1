/* =====================================================================
   MangaFlow - edge-slider.js   (OPTIONAL add-on file, round 18: the TOP / END slider)
   ---------------------------------------------------------------------
   WHY it exists:
     The round "Top" key and the round "End" key were replaced (on request) by ONE small vertical slider, built like the chapter slider.
       - drag the round knob UP   and let go = jump to the TOP of the page
       - drag the round knob DOWN and let go = jump to the END of the page (the end of everything that is loaded)
     ROUND 19: 30% shorter (76 px, was 108 px). ROUND 20: it stands at the BOTTOM of the LEFT edge; the reload wheel is at the top left under the title bar, the chapter slider (same 76 px) stays at the bottom right.
     It works in reading mode AND on a normal website page (but not on the start page, where there is nothing long to scroll).
   WHY a separate file: exactly like chapter-slider.js and reload-wheel.js. If this file is linked in index.html the slider can appear;
     if the file is missing (or the <script> line is deleted) the Top / End keys simply stay. Nothing else depends on it.
   HOW it works (four steps):
     1. It builds its own HTML (a groove and a knob) and its own CSS, and adds them to the page.
     2. app.js decides if it is visible: Settings > Search & extras > "Top / End slider". When it is on, app.js adds the class "has-edge"
        to <body> and style.css hides the two keys. When it is off, the class "no-edge" hides this slider and the keys come back.
     3. The knob moves on the Y axis ONLY, is limited to +-MAX px and springs back to the middle when you let go.
     4. When you let go and the knob was pulled at least TRIGGER px, it sends ONE browser event:
            window.dispatchEvent(new CustomEvent('mf-edge-jump', { detail: { where: 'top' | 'end' } }))
        app.js listens and scrolls (it knows if you are reading or on a normal page). This file knows nothing about scrolling.
   KEYBOARD: focus the knob, then ArrowUp = top, ArrowDown = end (Home / End keys of the keyboard work everywhere anyway).
   HOW to flip the direction: set UP_IS_TOP to false.
   HOW to IMPROVE it: make MAX / TRIGGER settings, vibrate on phones (navigator.vibrate), show the page position as a small number
     next to the knob, or let a long pull scroll continuously.
   ===================================================================== */
(() => {                                                   // WHY: an IIFE keeps every variable private (no clashes with app.js)
  'use strict';                                            // WHY: strict mode turns silent mistakes into real errors
  if (window.MangaFlowEdge) return;                        // WHY: if the file is loaded twice, build only one slider

  const MAX = 26;                                          // WHY: furthest the knob may move from the middle (px). HOW: used in clamp()
  const TRIGGER = 17;                                      // WHY: how far you must pull before letting go counts (no accidents)
  const LOCK = 4;                                          // WHY: tiny finger wobbles below this many px are ignored
  const UP_IS_TOP = true;                                  // WHY: up = the top of the page. Set false to flip.

  /* ---- 1. the CSS (kept inside this file so the slider really is one file) ---- */
  const css = `
  #mfEdge{--mfkey:40px;--mfedge:12px;position:fixed;display:none;z-index:29;width:40px;height:76px;touch-action:none;   /* ROUND 19: 76 px = 30% shorter than 108 px */
    user-select:none;-webkit-user-select:none;transition:opacity .25s;
    left:max(0px,calc(var(--mfedge) + var(--mfkey)/2 - 20px));                        /* ROUND 20: bottom of the LEFT edge (the reload wheel moved to the top left) */
    bottom:calc(14px + var(--safe-b,0px));}
  body[data-side="left"] #mfEdge{left:auto;right:max(0px,calc(var(--mfedge) + var(--mfkey)/2 - 20px));}   /* buttons on the left: mirror it to the right */
  body.has-edge #mfEdge{display:block;}                    /* app.js adds has-edge only when the setting is on */
  body.scrolling #mfEdge{opacity:0;pointer-events:none;}   /* hides while you scroll down (like the keys) and returns on scroll up */
  body:not(.reading):has(#start:not([hidden])) #mfEdge{display:none;}   /* the start page has nothing long to scroll */
  #mfEdge .mf-track{position:absolute;top:0;bottom:0;left:50%;width:8px;margin-left:-4px;border-radius:999px;border:1.5px solid #777d9e;box-sizing:border-box;
    background:linear-gradient(90deg,#151722,#080a11 65%,#171927);
    box-shadow:inset 2px 0 5px rgba(0,0,0,.9),0 0 8px rgba(80,90,255,.25);}
  #mfEdge .mf-knob{position:absolute;left:calc(50% - 11px);top:calc(50% - 11px);box-sizing:border-box;width:22px;height:22px;min-width:0;min-height:0;margin:0;padding:0;
    border-radius:50%;border:2px solid #a9a2ff;cursor:grab;z-index:2;font-size:0;line-height:0;
    background:radial-gradient(circle at 32% 25%,rgba(255,255,255,.45),transparent 18%),
      radial-gradient(circle at 72% 72%,#6200ff 0%,#3b20ff 38%,transparent 72%),
      linear-gradient(135deg,#25a8ff 0%,#5741ff 42%,#bb20ff 100%);
    box-shadow:inset 0 0 10px rgba(255,255,255,.2),0 0 0 3px rgba(96,61,255,.16),0 0 18px rgba(112,41,255,.7),0 6px 16px rgba(0,0,0,.6);
    transform:translateY(0);-webkit-tap-highlight-color:transparent;transition:transform 340ms cubic-bezier(.16,1.4,.32,1),box-shadow 160ms;}   /* the spring comes from this transition */
  #mfEdge .mf-knob.drag{transition:none;cursor:grabbing;}  /* while dragging the knob must follow the finger at once */
  #mfEdge .mf-knob:focus-visible{outline:3px solid #fff;outline-offset:2px;}
  #mfEdge .mf-tip{position:absolute;left:100%;top:50%;transform:translateY(-50%);margin-left:8px;padding:3px 10px;border-radius:999px;
    background:#111;color:#fff;font:600 12px system-ui,sans-serif;white-space:nowrap;opacity:0;transition:opacity .15s;pointer-events:none;}   /* "Top of the page" bubble */
  body[data-side="left"] #mfEdge .mf-tip{left:auto;right:100%;margin:0 8px 0 0;}
  #mfEdge.armed .mf-tip{opacity:1;}                        /* shown once the knob is pulled far enough */
  @media (max-width:520px){#mfEdge{--mfkey:38px;--mfedge:8px;}}
  @media (max-width:370px){#mfEdge{--mfkey:34px;}}
  @media (prefers-reduced-motion:reduce){#mfEdge .mf-knob{transition-duration:1ms;}}
  `;
  const style = document.createElement('style');           // HOW: a <style> tag added to <head>. (The page's CSP allows inline styles.)
  style.id = 'mfEdgeCss'; style.textContent = css; document.head.appendChild(style);

  /* ---- 2. the HTML ---- */
  const box = document.createElement('div');               // the whole widget
  box.id = 'mfEdge'; box.setAttribute('role', 'group');
  box.setAttribute('aria-label', 'Top and End slider: drag up to jump to the top of the page, drag down to jump to the end');
  box.innerHTML = '<div class="mf-track" aria-hidden="true"></div>' +
    '<span class="mf-tip" aria-live="polite"></span>' +
    '<button class="mf-knob" type="button" aria-label="Top and End slider knob. Drag up for the top of the page, down for the end. Up and Down arrow keys also work."></button>';
  document.body.appendChild(box);
  const knob = box.querySelector('.mf-knob'), tip = box.querySelector('.mf-tip');   // the two parts we move / change

  /* ---- 3. the behaviour ---- */
  let dragging = false, pid = null, y0 = 0, off = 0;       // dragging = is a finger/mouse holding the knob; y0 = where it started; off = current offset
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)); // keep a number between a and b
  const place = px => { knob.style.transform = 'translateY(' + px + 'px)'; };   // move the knob up / down by px
  const whereOf = px => ((px < 0) === UP_IS_TOP ? 'top' : 'end');               // which jump does this pull mean?
  const label = w => (w === 'top' ? 'Top of the page' : 'End of the page');     // text of the bubble

  function jump(where) {                                   // WHY: one single place that tells the app "scroll there"
    window.dispatchEvent(new CustomEvent('mf-edge-jump', { detail: { where } }));   // HOW: a normal DOM event any script can hear
  }

  knob.addEventListener('pointerdown', e => {              // finger or mouse pressed on the knob
    if (e.button !== undefined && e.button !== 0) return;  // only the main mouse button
    e.preventDefault();                                    // WHY: stop the page from scrolling or selecting text while the knob is dragged
    dragging = true; pid = e.pointerId; y0 = e.clientY; off = 0;
    knob.classList.add('drag');                            // no spring while dragging
    knob.setPointerCapture(pid);                           // HOW: keep getting move events even if the finger leaves the knob
  });
  knob.addEventListener('pointermove', e => {              // the finger moved
    if (!dragging || e.pointerId !== pid) return;          // ignore moves that belong to another finger or when no drag is running
    const dy = e.clientY - y0;
    off = Math.abs(dy) < LOCK ? 0 : clamp(dy, -MAX, MAX);  // Y axis only: sideways movement is simply never used
    place(off);
    const armed = Math.abs(off) >= TRIGGER;                // pulled far enough to count?
    box.classList.toggle('armed', armed);
    if (armed) tip.textContent = label(whereOf(off));      // show what will happen
  });
  function release() {                                     // finger lifted (or the browser cancelled the drag)
    if (!dragging) return;                                 // nothing to finish when no drag was started
    dragging = false; pid = null;
    knob.classList.remove('drag');
    const where = Math.abs(off) >= TRIGGER ? whereOf(off) : null;   // which way, or null = not far enough
    off = 0; place(0);                                     // the CSS transition springs the knob back to the middle
    box.classList.remove('armed');
    if (where) jump(where);                                // exactly ONE jump per drag
  }
  knob.addEventListener('pointerup', release);
  knob.addEventListener('pointercancel', release);
  knob.addEventListener('lostpointercapture', release);

  knob.addEventListener('keydown', e => {                  // keyboard users: focus the knob, then Up / Down arrow
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault(); e.stopPropagation();               // stop app.js from ALSO reacting to the same key
    const where = whereOf(e.key === 'ArrowDown' ? 1 : -1);
    place((e.key === 'ArrowDown' ? 1 : -1) * MAX * 0.7);   // small visible nudge ...
    setTimeout(() => place(0), 140);                       // ... then back to the middle
    jump(where);
  });

  window.MangaFlowEdge = { version: 1, el: box };          // WHY: lets app.js (and MANGAFLOW.md) check that the add-on is present
})();
