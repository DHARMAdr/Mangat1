/* =====================================================================
   MangaFlow - reload-wheel.js   (OPTIONAL add-on file, round 11)
   ---------------------------------------------------------------------
   WHY it exists:
     A little ship's steering wheel on the LEFT side while you read. ROUND 20 PLACE (the one in use now): the TOP LEFT, right under the title bar, in the same row as
     the download pill on the right (style.css ROUND 20 block, `body.reading #mfWheel { top: var(--col-top) }`). Earlier rounds had it in the middle of the left edge (round 11) and above
     the Top key at the bottom (rounds 12-18); those places are gone. Turn it with a finger (or the mouse):
        - half a turn to the RIGHT (clockwise, 180 degrees)       = reload THIS chapter
        - half a turn to the LEFT  (anti-clockwise, 180 degrees)  = reload ALL chapters that are open
     Let go and the wheel springs back. It is a SEPARATE file like chapter-slider.js: link it and it appears, remove the
     <script> line and nothing else changes (the old round reload keys were removed in round 12; the wheel is now the only reload control, besides the Troubleshoot buttons).
   HOW it works:
     1. It draws the wheel as one SVG picture (rim, 8 spokes, 8 handles, hub) plus a thin ring that fills while you turn.
     2. On touch/mouse down it remembers the angle of the finger around the wheel's centre (Math.atan2).
     3. On every move it adds the CHANGE of that angle to `turn` (so it also works for more than a half circle and never
        jumps when the finger crosses the 180 degree line). The picture is rotated by `turn`.
     4. When you let go and |turn| >= TRIGGER degrees it sends ONE event:
            window.dispatchEvent(new CustomEvent('mf-reload', { detail: { scope: 'current' | 'all' } }))
        app.js listens and reloads. This file knows nothing else about app.js.
   KEYBOARD: focus the wheel, then Enter = this chapter, Shift+Enter = all chapters (or Right / Left arrow).
   HOW to IMPROVE it: add a click sound or vibration, make TRIGGER a setting, spin the wheel a full turn while the reload runs.
   ===================================================================== */
(() => {                                                   // WHY: an IIFE keeps every variable private
  'use strict';
  if (window.MangaFlowWheel) return;                       // WHY: never build two wheels
  document.body.classList.add('has-wheel');                // ROUND 12: tells style.css to make room for the Top key beside the wheel

  const TRIGGER = 150;                                     // degrees you must turn before letting go counts (a bit under 180: fingers are not exact)
  const MAXTURN = 210;                                     // the picture never turns further than this (a little more than the trigger)
  const RING = 2 * Math.PI * 47;                           // length of the progress ring (radius 47 in the SVG)

  const css = `
  body{--mfw:64px;}                                                              /* size of the wheel; style.css uses it to make room for the Top key */
  #mfWheel{--mfkey:40px;position:fixed;left:max(4px,calc(12px + var(--mfkey)/2 - var(--mfw)/2));bottom:calc(14px + var(--safe-b,0px) + var(--mfkey) + 5px + 10px);z-index:29;   /* round 14: sits right ABOVE the Top key, centred over it */
   display:none;width:var(--mfw);height:var(--mfw);
    touch-action:none;user-select:none;-webkit-user-select:none;transition:opacity .25s;border-radius:50%;
    background:radial-gradient(circle at 50% 40%,#1c1f33,#080a11 72%);box-shadow:0 6px 16px rgba(0,0,0,.4),inset 0 0 12px rgba(120,100,255,.25);}
  body[data-side="left"] #mfWheel{left:auto;right:max(4px,calc(12px + var(--mfkey)/2 - var(--mfw)/2));}    /* buttons on the left: the wheel goes to the other corner */
  body.reading #mfWheel{display:block;}                    /* only visible in reading mode */
  body.scrolling #mfWheel{opacity:0;pointer-events:none;}  /* hides while you scroll down, returns on scroll up (like the keys) */
  #mfWheel{box-shadow:0 0 14px rgba(37,168,255,.35),0 0 0 1px rgba(127,246,255,.25),inset 0 0 14px rgba(120,100,255,.3);}   /* round 13: neon glow */
  #mfWheel .mf-core{filter:drop-shadow(0 0 3px #7ff6ff);animation:mfpulse 2.2s ease-in-out infinite;}
  @keyframes mfpulse{50%{opacity:.35}}
  @media (prefers-reduced-motion:reduce){#mfWheel .mf-core{animation:none}}
  #mfWheel svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible;}
  #mfWheel .mf-spin{transition:transform 420ms cubic-bezier(.2,1.3,.3,1);cursor:grab;}   /* the spring-back when you let go */
  #mfWheel.drag .mf-spin{transition:none;cursor:grabbing;}
  #mfWheel .mf-arc{fill:none;stroke:#25a8ff;stroke-width:3;stroke-linecap:round;transform:rotate(-90deg);transform-origin:50% 50%;
    stroke-dasharray:0 ${RING};transition:stroke .15s;}    /* the ring that fills while you turn */
  #mfWheel.ccw .mf-arc{stroke:#e040fb;transform:rotate(-90deg) scale(1,-1);}   /* anti-clockwise: other colour and other direction */
  #mfWheel.armed .mf-arc{stroke-width:4.5;filter:drop-shadow(0 0 4px currentColor);}
  #mfWheel:focus-visible{outline:3px solid #fff;outline-offset:3px;}
  #mfWheel .mf-tip{position:absolute;left:0;bottom:100%;margin-bottom:8px;padding:3px 10px;border-radius:999px;background:#111;color:#fff;
    font:600 12px system-ui,sans-serif;white-space:nowrap;opacity:0;transition:opacity .15s;pointer-events:none;}
  body[data-side="left"] #mfWheel .mf-tip{left:auto;right:0;}
  #mfWheel.show .mf-tip{opacity:1;}
  #mfWheel .mf-cap{position:absolute;left:0;right:0;bottom:3px;text-align:center;font:700 8px/1 system-ui,sans-serif;letter-spacing:.1em;color:#9aa;pointer-events:none;}
  @media (max-width:520px){body{--mfw:56px;}#mfWheel{--mfkey:38px;left:max(4px,calc(8px + var(--mfkey)/2 - var(--mfw)/2));}body[data-side="left"] #mfWheel{left:auto;right:max(4px,calc(8px + var(--mfkey)/2 - var(--mfw)/2));}}
  @media (max-width:370px){body{--mfw:50px;}#mfWheel{--mfkey:34px;}}
  @media (max-height:430px){body{--mfw:50px;}}   /* phone turned sideways */
  @media (prefers-reduced-motion:reduce){#mfWheel .mf-spin{transition-duration:1ms;}}
  `;
  const style = document.createElement('style'); style.id = 'mfWheelCss'; style.textContent = css; document.head.appendChild(style);

  /* the picture: viewBox 100 x 100, centre (50,50). Handles stick out of the rim like on a real ship's wheel. */
  let spokes = '', handles = '';
  for (let k = 0; k < 8; k++) {                            // 8 spokes and 8 handles, 45 degrees apart
    const a = k * Math.PI / 4, c = Math.cos(a), s = Math.sin(a);
    // WHY: draw the eight spokes of the wheel. HOW: each spoke is a line from near the centre, placed with sine and cosine.
    // IMPROVE: change the number of spokes.
    spokes += '<line x1="' + (50 + 9 * c).toFixed(1) + '" y1="' + (50 + 9 * s).toFixed(1) + '" x2="' + (50 + 38 * c).toFixed(1) + '" y2="' + (50 + 38 * s).toFixed(1) + '"/>';
    handles += '<circle cx="' + (50 + 43 * c).toFixed(1) + '" cy="' + (50 + 43 * s).toFixed(1) + '" r="4.2"/>';
  }
  const box = document.createElement('div');
  box.id = 'mfWheel'; box.tabIndex = 0; box.setAttribute('role', 'button');
  box.setAttribute('aria-label', 'Reload wheel. Turn right for this chapter, turn left for all chapters. Enter reloads this chapter, Shift+Enter all.');
  box.innerHTML =
    '<svg viewBox="0 0 100 100" aria-hidden="true"><defs><linearGradient id="mfwg" x1="0" y1="0" x2="1" y2="1">' +
    '<stop offset="0" stop-color="#25a8ff"/><stop offset=".5" stop-color="#5741ff"/><stop offset="1" stop-color="#bb20ff"/></linearGradient></defs>' +
    '<g class="mf-spin" style="transform-origin:50px 50px">' +
      '<circle cx="50" cy="50" r="46" fill="none" stroke="#25a8ff" stroke-opacity=".55" stroke-width="2.2" stroke-dasharray="1 3.9"/>' +      // round 13: digital tick ring (turns with the wheel)
      '<circle cx="50" cy="50" r="38" fill="none" stroke="url(#mfwg)" stroke-width="4"/>' +
      '<circle cx="50" cy="50" r="31" fill="none" stroke="#e040fb" stroke-opacity=".5" stroke-width="1" stroke-dasharray="10 6"/>' +
      '<g stroke="#9fe8ff" stroke-width="2" stroke-linecap="round">' + spokes + '</g>' +
      '<g fill="url(#mfwg)" stroke="#a9a2ff" stroke-width="1">' + handles + '</g>' +
      '<circle cx="50" cy="50" r="10" fill="#080a11" stroke="url(#mfwg)" stroke-width="2.5"/><circle cx="50" cy="50" r="3.2" fill="#7ff6ff" class="mf-core"/>' +
    '</g><circle class="mf-arc" cx="50" cy="50" r="47"/>' +
    '<path d="M50 -1 L46 -9 L54 -9 Z" fill="#fff" opacity=".85"/></svg>' +            // the little fixed pointer on top: shows how far you turned
    '<span class="mf-tip" aria-live="polite"></span>';   // round 13: the RELOAD caption was removed
  document.body.appendChild(box);
  const spin = box.querySelector('.mf-spin'), arc = box.querySelector('.mf-arc'), tip = box.querySelector('.mf-tip');

  /* ---- behaviour ---- */
  let dragging = false, pid = null, last = 0, turn = 0;    // last = angle of the finger at the previous move (radians); turn = total turn so far (degrees)
  const angleOf = e => { const r = box.getBoundingClientRect(); return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)); };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function paint() {                                       // show the current turn: rotate the picture, fill the ring, set the words
    // WHY: spin the wheel by the turn amount. HOW: sets a CSS rotation that the stylesheet animates. IMPROVE: use the Web
    // Animations API.
    spin.style.transform = 'rotate(' + turn + 'deg)';
    const f = clamp(Math.abs(turn) / TRIGGER, 0, 1);       // 0..1 = how close to the trigger
    arc.style.strokeDasharray = (f * RING) + ' ' + RING;
    box.classList.toggle('ccw', turn < 0);
    box.classList.toggle('armed', Math.abs(turn) >= TRIGGER);
    box.classList.toggle('show', Math.abs(turn) > 20);
    tip.textContent = Math.abs(turn) >= TRIGGER ? (turn > 0 ? 'Let go: reload this chapter' : 'Let go: reload ALL chapters') : (turn > 0 ? 'Reload this chapter' : 'Reload all chapters') + ' · ' + Math.round(Math.abs(turn)) + '°';
  }
  function send(scope) { window.dispatchEvent(new CustomEvent('mf-reload', { detail: { scope } })); if (navigator.vibrate) try { navigator.vibrate(25); } catch { /* not allowed: fine */ } }

  // WHY: a press on the wheel starts a reload. HOW: the pointerdown event works for mouse, touch and pen. IMPROVE: add a
  // long press for 'reload all'.
  box.addEventListener('pointerdown', e => {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    dragging = true; pid = e.pointerId; last = angleOf(e); turn = 0;
    box.classList.add('drag'); box.setPointerCapture(pid); paint();
  });
  box.addEventListener('pointermove', e => {
    if (!dragging || e.pointerId !== pid) return;
    const a = angleOf(e);
    let d = a - last; if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI;   // the SHORT way round: no jump at the 180 degree line
    last = a; turn = clamp(turn + d * 180 / Math.PI, -MAXTURN, MAXTURN); paint();
  });
  function release() {
    if (!dragging) return;
    dragging = false; pid = null; box.classList.remove('drag');
    const scope = turn >= TRIGGER ? 'current' : turn <= -TRIGGER ? 'all' : null;   // right = this chapter, left = all
    turn = 0; paint(); box.classList.remove('show', 'armed');                       // the CSS transition springs the wheel back
    if (scope) send(scope);
  }
  box.addEventListener('pointerup', release);
  box.addEventListener('pointercancel', release);
  box.addEventListener('lostpointercapture', release);
  box.addEventListener('keydown', e => {                   // keyboard: Enter / Right = this chapter, Shift+Enter / Left = all
    const all = (e.key === 'Enter' && e.shiftKey) || e.key === 'ArrowLeft';
    if (e.key !== 'Enter' && e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault(); e.stopPropagation();
    turn = all ? -TRIGGER : TRIGGER; paint(); setTimeout(() => { turn = 0; paint(); box.classList.remove('show', 'armed'); }, 300);
    send(all ? 'all' : 'current');
  });
  paint(); box.classList.remove('show', 'armed');

  window.MangaFlowWheel = { version: 1, el: box };         // WHY: other code can check that the add-on is present
})();
