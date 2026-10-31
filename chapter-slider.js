/* =====================================================================
   MangaFlow - chapter-slider.js   (OPTIONAL add-on file, round 11: now VERTICAL)
   ---------------------------------------------------------------------
   WHY it exists:
     A small UP / DOWN slider (76 px tall since round 20, was 108 px / 120 px) that floats in the bottom of the RIGHT corner, just above the "End" key, while you read.
     Drag the round knob DOWN = NEXT chapter, drag it UP = PREVIOUS chapter (one chapter per drag).
     (Round 10 had a sideways slider. Round 11 turned it 90 degrees and moved it. Same behaviour, new direction and place.)
     It is a SEPARATE file on purpose: if this file is linked in index.html the slider appears; if the file is missing
     (or the <script> line is deleted) the reader works exactly as before. Nothing else depends on it.
   HOW it works (four steps):
     1. It builds its own HTML (a groove, two tiny labels and a knob) and its own CSS, and adds them to the page.
        It is only visible while the body has the class "reading" (app.js sets that class in reading mode).
     2. It adds the class "has-slider" to <body>. style.css uses that class to hide the old up / down arrow keys (the slider
        replaces them) and to move the download button to the left of the End key. No slider file = the arrow keys stay.
     3. The knob moves on the Y axis ONLY, is clamped to +-MAX px and springs back to the middle when you let go.
     4. When you let go and the knob was pulled at least TRIGGER px it sends ONE browser event:
            window.dispatchEvent(new CustomEvent('mf-chapter-step', { detail: { dir: +1 or -1 } }))
        app.js listens for it and moves one chapter. This file knows nothing else about app.js.
   HOW to flip the direction: set DOWN_IS_NEXT to false.
   HOW to IMPROVE it:
     - make MAX / TRIGGER settings, add a vibration on phones (navigator.vibrate), let the person drag the whole slider to
       another height, or add a second slider for "top / end".
   ===================================================================== */
(() => {                                                   // WHY: an IIFE keeps every variable private (no clashes with app.js)
  'use strict';                                            // WHY: strict mode turns silent mistakes into real errors
  if (window.MangaFlowSlider) return;                      // WHY: if the file is loaded twice, build only one slider

  const MAX = 26;                                          // WHY: furthest the knob may move from the middle (px). HOW: used in clamp()
  const TRIGGER = 17;                                      // WHY: how far you must pull before letting go counts as a step (no accidents)
  const LOCK = 4;                                          // WHY: tiny finger wobbles below this many px are ignored
  const DOWN_IS_NEXT = true;                               // WHY: reading goes downwards, so pulling DOWN means "next". Set false to flip.

  /* ---- 1. the CSS (kept inside this file so the slider really is one file) ---- */
  const css = `
  #mfSlider{--mfkey:40px;--mfedge:12px;position:fixed;display:none;z-index:29;width:40px;height:76px;touch-action:none;   /* ROUND 20: same size as the Top / End slider (76 px; was 108, and 120 before round 18) */
    user-select:none;-webkit-user-select:none;transition:opacity .25s;
    right:max(0px,calc(var(--mfedge) + var(--mfkey)/2 - 20px));                      /* centred over the End key */
    bottom:calc(14px + var(--safe-b,0px) + var(--mfkey) + 5px + 12px);}              /* just above the End key (key + its 3D edge + a gap) */
  body[data-side="left"] #mfSlider{right:auto;left:max(0px,calc(var(--mfedge) + var(--mfkey)/2 - 20px));}   /* Settings: buttons on the left */
  body.reading #mfSlider{display:block;}                   /* only visible in reading mode */
  body.scrolling #mfSlider{opacity:0;pointer-events:none;} /* hides while you scroll down (like the keys) and returns on scroll up */
  #mfSlider .mf-track{position:absolute;top:0;bottom:0;left:50%;width:8px;margin-left:-4px;border-radius:999px;border:1.5px solid #777d9e;box-sizing:border-box;
    background:linear-gradient(90deg,#151722,#080a11 65%,#171927);
    box-shadow:inset 2px 0 5px rgba(0,0,0,.9),0 0 8px rgba(80,90,255,.25);}   /* the thin dark groove, exactly in the middle of the widget (round 14) */
  #mfSlider .mf-knob{position:absolute;left:calc(50% - 11px);top:calc(50% - 11px);box-sizing:border-box;width:22px;height:22px;min-width:0;min-height:0;margin:0;padding:0;border-radius:50%;font-size:0;line-height:0;   /* round 18: centred by exact arithmetic (50% minus half the knob) */
    border:2px solid #a9a2ff;cursor:grab;z-index:2;
    background:radial-gradient(circle at 32% 25%,rgba(255,255,255,.45),transparent 18%),
      radial-gradient(circle at 72% 72%,#6200ff 0%,#3b20ff 38%,transparent 72%),
      linear-gradient(135deg,#25a8ff 0%,#5741ff 42%,#bb20ff 100%);
    box-shadow:inset 0 0 10px rgba(255,255,255,.2),0 0 0 3px rgba(96,61,255,.16),0 0 18px rgba(112,41,255,.7),0 6px 16px rgba(0,0,0,.6);
    transform:translateY(0);-webkit-tap-highlight-color:transparent;transition:transform 340ms cubic-bezier(.16,1.4,.32,1),box-shadow 160ms;} /* the spring comes from this transition */
  /* ROUND 14: the knob was off the line because the global button rule gives every button a 44 px minimum size; min-width/min-height 0 above fixes it. */
  #mfSlider .mf-knob.drag{transition:none;cursor:grabbing;}  /* while dragging the knob must follow the finger at once */
  #mfSlider .mf-knob:focus-visible{outline:3px solid #fff;outline-offset:2px;} /* visible focus for keyboard users */
  #mfSlider .mf-tip{position:absolute;right:100%;top:50%;transform:translateY(-50%);margin-right:8px;padding:3px 10px;border-radius:999px;
    background:#111;color:#fff;font:600 12px system-ui,sans-serif;white-space:nowrap;opacity:0;transition:opacity .15s;pointer-events:none;} /* "Next chapter" bubble */
  body[data-side="left"] #mfSlider .mf-tip{right:auto;left:100%;margin:0 0 0 8px;}
  #mfSlider.armed .mf-tip{opacity:1;}                      /* shown once the knob is pulled far enough */
  @media (max-width:520px){#mfSlider{--mfkey:38px;--mfedge:8px;}}   /* same sizes as the keys (style.css) so it stays above the End key */
  @media (max-width:370px){#mfSlider{--mfkey:34px;}}
  @media (prefers-reduced-motion:reduce){#mfSlider .mf-knob{transition-duration:1ms;}} /* respect "reduce motion" */
  `;
  const style = document.createElement('style');           // HOW: a <style> tag added to <head>. (The page's CSP allows inline styles.)
  style.id = 'mfSliderCss'; style.textContent = css; document.head.appendChild(style);

  /* ---- 2. the HTML ---- */
  const box = document.createElement('div');               // the whole widget
  box.id = 'mfSlider'; box.setAttribute('role', 'group');
  box.setAttribute('aria-label', 'Chapter slider: drag down for the next chapter, up for the previous one');
  box.innerHTML = '<div class="mf-track" aria-hidden="true"></div>' +
    '<span class="mf-tip" aria-live="polite"></span>' +
    '<button class="mf-knob" type="button" aria-label="Chapter slider knob. Drag down for the next chapter, up for the previous one. Up and Down arrow keys also work."></button>';
  document.body.appendChild(box);
  document.body.classList.add('has-slider');               // WHY: tells style.css to hide the old arrow keys (see header comment)
  const knob = box.querySelector('.mf-knob'), tip = box.querySelector('.mf-tip');   // the two parts we move / change

  /* ---- 3. the behaviour ---- */
  let dragging = false, pid = null, y0 = 0, off = 0;       // dragging = is a finger/mouse holding the knob; y0 = where it started; off = current offset
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)); // keep a number between a and b
  const place = px => { knob.style.transform = 'translateY(' + px + 'px)'; };   // move the knob up / down by px
  const dirOf = px => (px > 0) === DOWN_IS_NEXT ? 1 : -1;  // which chapter step does this pull mean? (+1 next, -1 previous)

  function step(dir) {                                     // WHY: one single place that tells the app "go one chapter"
    window.dispatchEvent(new CustomEvent('mf-chapter-step', { detail: { dir } }));   // HOW: a normal DOM event any script can hear
  }
  const label = dir => dir > 0 ? 'Next chapter' : 'Previous chapter';   // text of the bubble

  knob.addEventListener('pointerdown', e => {              // finger or mouse pressed on the knob
    if (e.button !== undefined && e.button !== 0) return;  // only the main mouse button
    // WHY: stop the page from scrolling or selecting text while the knob is dragged. HOW: preventDefault cancels the
    // browser's default action.
    e.preventDefault();
    dragging = true; pid = e.pointerId; y0 = e.clientY; off = 0;
    knob.classList.add('drag');                            // no spring while dragging
    knob.setPointerCapture(pid);                           // HOW: keep getting move events even if the finger leaves the knob
  });
  knob.addEventListener('pointermove', e => {              // the finger moved
    // WHY: ignore moves that belong to another finger or when no drag is running. HOW: compare the pointer id saved at the
    // start.
    if (!dragging || e.pointerId !== pid) return;
    const dy = e.clientY - y0;
    off = Math.abs(dy) < LOCK ? 0 : clamp(dy, -MAX, MAX);  // Y axis only: sideways movement is simply never used
    place(off);
    const armed = Math.abs(off) >= TRIGGER;                // pulled far enough to count?
    box.classList.toggle('armed', armed);
    if (armed) tip.textContent = label(dirOf(off));        // show what will happen
  });
  function release() {                                     // finger lifted (or the browser cancelled the drag)
    // WHY: nothing to finish when no drag was started. HOW: early return.
    if (!dragging) return;
    dragging = false; pid = null;
    knob.classList.remove('drag');
    const dir = Math.abs(off) >= TRIGGER ? dirOf(off) : 0; // which way, or 0 = not far enough
    off = 0; place(0);                                     // the CSS transition springs the knob back to the middle
    box.classList.remove('armed');
    if (dir) step(dir);                                    // exactly ONE chapter per drag
  }
  knob.addEventListener('pointerup', release);
  knob.addEventListener('pointercancel', release);
  knob.addEventListener('lostpointercapture', release);

  knob.addEventListener('keydown', e => {                  // keyboard users: focus the knob, then Up / Down arrow
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault(); e.stopPropagation();               // stop app.js from ALSO reacting to the same key
    const dir = dirOf(e.key === 'ArrowDown' ? 1 : -1);
    place((e.key === 'ArrowDown' ? 1 : -1) * MAX * 0.7);   // small visible nudge ...
    setTimeout(() => place(0), 140);                       // ... then back to the middle
    step(dir);
  });

  window.MangaFlowSlider = { version: 2, axis: 'y', el: box };   // WHY: lets other code (and MANGAFLOW.md) check that the add-on is present
})();
