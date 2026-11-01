/* =====================================================================
   MangaFlow - translate.js   (OPTIONAL add-on file, ROUND 32: "Translate pages", works like Google Lens)
   ---------------------------------------------------------------------
   WHY it exists:
     The owner wanted a button in reading mode that translates the words that are PRINTED INSIDE the manga pictures (speech bubbles, captions)
     into another language, and shows the new words right on top of the old ones, like Google Lens does. The language you want is chosen in
     Settings > Translate (or in the small panel of this button). Everything that already worked (slider, wheel, keys, downloads, search)
     is untouched: this is a SEPARATE file. Link it in index.html and the button appears; remove the <script> line and it is gone.
   HOW it works (six steps, for every page picture that comes near the screen while the button is ON):
     1. READ THE PICTURE (OCR). A picture is only pixels, so a "text reader" (Tesseract, a free open program that runs inside your browser as
        a small WebAssembly file) looks for letters and gives back every line of text with its position. The files of that reader live in
        the folder  ocr/  next to index.html (the reader, and one language file per language that is printed on the pages).
     2. GROUP THE LINES. The reader returns single lines. Lines that stand close together belong to one speech bubble, so groupLines()
        joins them (right-to-left columns for vertical Japanese, top-to-bottom rows for everything else).
     3. TRANSLATE. The text of each bubble goes to a translation service: the browser's own translator (Chrome, on your device), or Google,
        or MyMemory (both are web services that need internet). The first one that answers wins (setting "Translation service").
     4. COVER AND WRITE. For each bubble a box is drawn exactly over the old words. Its colour is copied from the bubble (white bubble =
        white box), and the new text is made as big as fits in the box. The boxes are plain HTML, laid over the picture: the picture itself is
        never changed, so the PDF download still has the ORIGINAL pages.
     5. TAP A BOX to peek at the original words for 3 seconds. Tap the round Translate button again to switch everything off (the work is kept,
        switching on again is instant).
     6. When the language in Settings changes, only the needed part is repeated (a new "translate into" language does NOT read the pictures again).
   HOW it talks to app.js (the same way as chapter-slider.js and the wheel: only browser events, no shared variables):
        app.js -> this file   'mf-settings'      detail = the whole settings object (sent at start and after every change)
        this file -> app.js   'mf-settings-set'  detail = { trTo: 'hi' }  (the small panel changes a setting; app.js saves it)
        this file -> app.js   'mf-translate-problem'  detail = { title, details }  (app.js shows its big error box with a copyable report)
   WHAT YOU MUST PUT ON YOUR SITE (see MANGAFLOW.md section 0b): the folder  ocr/  (it is in the zip). Without it the button shows
     "text reader files are missing" and nothing else breaks.
   HONEST LIMITS: OCR is good on clean, printed letters and weaker on fancy hand-lettering, sound effects and very small text. Vertical
     Japanese works, but a reading mistake in step 1 becomes a wrong translation in step 3. Free translation services can be slow, limited
     per day, or stop working; that is why three of them are tried in turn.
   HOW to IMPROVE it (ideas, easiest first): show the original text in the tapped box; a "re-read this page" key; remember translated
     pages in IndexedDB so a reopened chapter is instant; add chi_sim_vert and more languages (download <lang>.traineddata.gz into ocr/lang/
     and add it to OCR_LANGS); use the phone's TextDetector API when it exists; draw the new text with a comic font.
   ===================================================================== */
(() => {                                                   // WHY: an IIFE keeps every name private (no clash with app.js)
  'use strict';                                            // WHY: strict mode turns silent mistakes into real errors
  if (window.MangaFlowTranslate) return;                   // WHY: if the file is loaded twice, build only one button

  /* ---------------------------------------------------------------
     1. THE LISTS AND LIMITS  (everything you may want to change is here)
     --------------------------------------------------------------- */
  // WHY: the languages you can translate INTO. HOW: code (used by the services) -> name shown in the lists. IMPROVE: add any language the services know.
  const LANG_TO = [
    ['en', 'English'], ['hi', 'Hindi (हिन्दी)'], ['ta', 'Tamil (தமிழ்)'], ['te', 'Telugu (తెలుగు)'], ['ml', 'Malayalam (മലയാളം)'], ['kn', 'Kannada (ಕನ್ನಡ)'],
    ['bn', 'Bengali (বাংলা)'], ['mr', 'Marathi (मराठी)'], ['gu', 'Gujarati (ગુજરાતી)'], ['pa', 'Punjabi (ਪੰਜਾਬੀ)'], ['ur', 'Urdu (اردو)'],
    ['es', 'Spanish'], ['fr', 'French'], ['de', 'German'], ['pt', 'Portuguese'], ['it', 'Italian'], ['ru', 'Russian'], ['id', 'Indonesian'],
    ['ms', 'Malay'], ['vi', 'Vietnamese'], ['th', 'Thai'], ['tr', 'Turkish'], ['ar', 'Arabic (العربية)'], ['pl', 'Polish'], ['nl', 'Dutch'],
    ['tl', 'Filipino'], ['ja', 'Japanese (日本語)'], ['ko', 'Korean (한국어)'], ['zh-CN', 'Chinese, simplified (简体)'], ['zh-TW', 'Chinese, traditional (繁體)']
  ];
  // WHY: the languages that are PRINTED in the pages (what the text reader must know). HOW: value -> { name, passes } where passes are the Tesseract language
  //   files tried one after the other (Japanese needs two: horizontal and vertical writing are two different language files), and tr = the code of the
  //   translation services. The files must exist in  ocr/lang/<name>.traineddata.gz . IMPROVE: add chi_sim_vert for vertical Chinese.
  const OCR_LANGS = {
    auto:    { name: 'Detect by itself (slower on the first page)' },
    jpn:     { name: 'Japanese (vertical and horizontal)', passes: ['jpn_vert', 'jpn'], tr: 'ja', min: 75 },
    // WHY min:35 for Korean: Naver webtoon text is clean but Tesseract scores Korean lower than Latin/Japanese; 50 misses real bubbles.
    kor:     { name: 'Korean',                              passes: ['kor'],            tr: 'ko', min: 35 },
    chi_sim: { name: 'Chinese, simplified',                 passes: ['chi_sim'],        tr: 'zh-CN', min: 50 },
    chi_tra: { name: 'Chinese, traditional',                passes: ['chi_tra'],        tr: 'zh-TW', min: 50 },
    eng:     { name: 'English',                             passes: ['eng'],            tr: 'en', min: 50 }
  };
  const RTL = ['ar', 'ur', 'he', 'fa'];                    // WHY: these languages are written from right to left: the box must know it
  const OCR_DIR = 'ocr/';                                  // WHY: where the reader files live (next to index.html). IMPROVE: make it a setting.
  const MAX_W = 1400;                                      // WHY: pictures wider than this are made smaller BEFORE reading (faster, and letters stay big enough)
  const TILE_H = 2000;                                     // WHY: a very tall picture (webtoon strip) is read in slices this tall (in OCR pixels), cut where the picture is quiet
  const MAX_AREA = 14e6;                                   // WHY: phones cannot make a drawing board bigger than about 16 million pixels
  const PAGE_LIMIT_MS = 120000;                            // WHY: one page may take two minutes at most; then it is marked as failed (the next page goes on)
  const MIN_PAGE = 160;                                    // WHY: pictures smaller than this (in pixels) are icons or spacers, not pages

  /* ---------------------------------------------------------------
     2. THE SETTINGS  (the truth lives in app.js; this is a copy that 'mf-settings' keeps fresh)
     --------------------------------------------------------------- */
  const cfg = { show: true, to: 'en', from: 'auto', engine: 'auto', auto: false, proxies: [] };
  // WHY: copy the values that matter out of the settings object. HOW: checks every value so a broken saved value can not stop the add-on.
  function readCfg(s) {
    if (!s || typeof s !== 'object') return;
    cfg.show = s.showTranslate !== false;
    cfg.to = LANG_TO.some(l => l[0] === s.trTo) ? s.trTo : 'en';
    cfg.from = OCR_LANGS[s.trFrom] ? s.trFrom : 'auto';
    cfg.engine = ['auto', 'chrome', 'google', 'mymemory'].includes(s.trEngine) ? s.trEngine : 'auto';
    cfg.auto = !!s.trAuto;
    cfg.proxies = Array.isArray(s.proxies) ? s.proxies.filter(p => typeof p === 'string' && /^https:\/\//.test(p)) : [];
  }
  try { readCfg(JSON.parse(localStorage.getItem('mf_settings') || 'null')); } catch { /* storage blocked: defaults are fine */ }
  const setSetting = patch => window.dispatchEvent(new CustomEvent('mf-settings-set', { detail: patch }));   // WHY: ask app.js to save a setting

  /* ---------------------------------------------------------------
     3. THE CSS  (inside this file, like the other add-ons)
     --------------------------------------------------------------- */
  const css = `
  #mfTr{--mfedge:12px;position:fixed;display:none;z-index:29;left:max(0px,var(--mfedge));top:50%;width:44px;height:44px;margin-top:-22px;border-radius:50%;
    min-width:0;min-height:0;padding:0;border:2px solid #a9a2ff;cursor:pointer;color:#fff;font:800 15px/1 system-ui,sans-serif;letter-spacing:-.02em;
    background:radial-gradient(circle at 32% 25%,rgba(255,255,255,.35),transparent 20%),linear-gradient(135deg,#25a8ff 0%,#5741ff 45%,#bb20ff 100%);
    box-shadow:0 0 16px rgba(112,41,255,.55),0 6px 14px rgba(0,0,0,.5);transition:opacity .25s,box-shadow .2s,transform .15s;-webkit-tap-highlight-color:transparent;}
  body[data-side="left"] #mfTr{left:auto;right:max(0px,var(--mfedge));}                  /* buttons on the left: this one goes to the other edge */
  body.reading #mfTr{display:block;}                                                     /* only in reading mode */
  body.no-translate #mfTr,body.no-translate #mfTrBar,body.no-translate #mfTrPanel{display:none!important;}   /* Settings > Translate > button switched off */
  body.scrolling #mfTr{opacity:0;pointer-events:none;}                                   /* hides while you scroll down, like the keys */
  #mfTr:active{transform:scale(.93);} #mfTr:focus-visible{outline:3px solid #fff;outline-offset:2px;}
  #mfTr:not(.on){filter:saturate(.35) brightness(.8);}                                   /* grey = off, colourful = on */
  #mfTr.on{box-shadow:0 0 0 3px rgba(127,246,255,.45),0 0 22px rgba(37,168,255,.8),0 6px 14px rgba(0,0,0,.5);}
  #mfTr.busy::after{content:"";position:absolute;inset:-6px;border-radius:50%;border:3px solid transparent;border-top-color:#7ff6ff;animation:mftrspin .9s linear infinite;}
  @keyframes mftrspin{to{transform:rotate(360deg)}}
  /* WHY darker bg + stronger text: the bar was too transparent to read in bright manga backgrounds. */
  #mfTrBar{position:fixed;display:none;z-index:28;left:50%;transform:translateX(-50%);bottom:calc(14px + var(--safe-b,0px));max-width:calc(100vw - 120px);box-sizing:border-box;
    align-items:center;gap:6px;padding:5px 6px 5px 12px;border-radius:999px;background:#1a1a2eee;color:#e8e8f0;font:600 12px/1.3 system-ui,sans-serif;backdrop-filter:blur(8px);border:1px solid #44445a;transition:opacity .25s;}
  body.reading.mf-tr-on #mfTrBar{display:flex;}
  body.scrolling #mfTrBar{opacity:0;pointer-events:none;}
  #mfTrBar.err{background:#a3191ad9;}
  #mfTrBar span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;}
  #mfTrBar button{min-width:0;min-height:0;height:28px;padding:0 10px;border-radius:999px;border:1px solid #fff5;background:#fff2;color:#fff;font:600 12px system-ui,sans-serif;cursor:pointer;}
  #mfTrBar button[hidden]{display:none;}
  /* WHY hardcoded colours: in reading mode --bg/--fg are the reader's own dark vars, making the panel invisible (dark on dark).
     HOW: use explicit light-panel colours that work in all modes. IMPROVE: add a @media prefers-color-scheme dark version. */
  #mfTrPanel{position:fixed;display:none;z-index:31;left:50%;transform:translateX(-50%);bottom:calc(58px + var(--safe-b,0px));width:min(320px,calc(100vw - 24px));box-sizing:border-box;
    padding:12px;border-radius:14px;background:#1e1e2e;color:#e8e8f0;border:1px solid #44445a;box-shadow:0 10px 30px rgba(0,0,0,.6);font:14px/1.4 system-ui,sans-serif;}
  #mfTrPanel.open{display:block;}
  #mfTrPanel label{display:block;margin:0 0 8px;font-weight:600;font-size:12px;color:#b0b0cc;}
  #mfTrPanel select{display:block;width:100%;margin-top:3px;min-height:38px;font-size:15px;background:#2a2a3e;color:#e8e8f0;border:1px solid #55557a;border-radius:8px;padding:0 8px;}
  #mfTrPanel .row{display:flex;gap:8px;margin-top:4px;}
  #mfTrPanel .row button{flex:1;min-height:38px;border-radius:10px;background:#3a3a55;color:#e8e8f0;border:1px solid #55557a;cursor:pointer;font:600 14px system-ui,sans-serif;}
  .chapter{position:relative;}                                                           /* WHY: the boxes are placed inside the chapter box */
  .mf-tr-layer{display:none;position:absolute;z-index:3;pointer-events:none;container-type:inline-size;overflow:hidden;}
  body.mf-tr-on .mf-tr-layer{display:block;}
  .mf-tr-b{position:absolute;box-sizing:border-box;display:flex;align-items:center;justify-content:center;text-align:center;overflow:hidden;pointer-events:auto;cursor:pointer;
    border-radius:.6cqw;padding:.3cqw;font-family:system-ui,"Noto Sans","Noto Sans Devanagari","Noto Sans Tamil","Noto Sans Telugu","Noto Sans Malayalam","Noto Sans Kannada","Noto Sans Bengali","Segoe UI",sans-serif;
    font-weight:700;line-height:1.12;transition:opacity .2s;-webkit-tap-highlight-color:transparent;}
  .mf-tr-b>span{display:block;max-width:100%;overflow-wrap:anywhere;}
  .mf-tr-b.peek{opacity:0;}                                                              /* tapped: the original shows through for a moment */
  @media (max-width:520px){#mfTr{--mfedge:8px;width:42px;height:42px;margin-top:-21px;}}
  @media (prefers-reduced-motion:reduce){#mfTr.busy::after{animation:none}}
  `;
  const style = document.createElement('style'); style.id = 'mfTranslateCss'; style.textContent = css; document.head.appendChild(style);

  /* ---------------------------------------------------------------
     4. THE HTML: the round button, the little status bar and the panel
     --------------------------------------------------------------- */
  const btn = document.createElement('button');
  btn.id = 'mfTr'; btn.type = 'button'; btn.textContent = '文A';
  btn.title = 'Translate the words in the pictures (Lens style)'; btn.setAttribute('aria-pressed', 'false');
  btn.setAttribute('aria-label', 'Translate the pages. Press to switch on or off.');
  const bar = document.createElement('div'); bar.id = 'mfTrBar'; bar.setAttribute('role', 'status'); bar.setAttribute('aria-live', 'polite');
  bar.innerHTML = '<span id="mfTrMsg"></span><button type="button" id="mfTrRetry" hidden>Retry</button><button type="button" id="mfTrDet" hidden>Details</button><button type="button" id="mfTrCfg" aria-label="Translate settings" title="Language and service">&#9881;</button>';
  const panel = document.createElement('div'); panel.id = 'mfTrPanel'; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Translate settings');
  panel.innerHTML = '<label>Translate into<select id="mfTrTo"></select></label><label>Language written on the pages<select id="mfTrFrom"></select></label>' +
    '<label>Translation service<select id="mfTrEng"><option value="auto">Automatic (best one that works)</option><option value="chrome">Chrome on-device translator</option><option value="google">Google</option><option value="mymemory">MyMemory</option></select></label>' +
    '<div class="row"><button type="button" id="mfTrAgain">Translate again</button><button type="button" id="mfTrClose">Close</button></div>';
  document.body.append(btn, bar, panel);
  const $msg = bar.querySelector('#mfTrMsg'), $retry = bar.querySelector('#mfTrRetry'), $det = bar.querySelector('#mfTrDet');
  const $to = panel.querySelector('#mfTrTo'), $from = panel.querySelector('#mfTrFrom'), $eng = panel.querySelector('#mfTrEng');
  // WHY: fill the language lists (also the ones in Settings, whose empty <select> tags are in index.html). HOW: one option per language.
  function fillLists() {
    const to = LANG_TO.map(l => '<option value="' + l[0] + '">' + l[1] + '</option>').join('');
    const from = Object.keys(OCR_LANGS).map(k => '<option value="' + k + '">' + OCR_LANGS[k].name + '</option>').join('');
    ['#mfTrTo', '#setTrTo'].forEach(s => { const e = document.querySelector(s); if (e) e.innerHTML = to; });
    ['#mfTrFrom', '#setTrFrom'].forEach(s => { const e = document.querySelector(s); if (e) e.innerHTML = from; });
  }
  fillLists();
  // WHY: show the current settings in the panel. HOW: copy cfg into the three lists.
  function syncPanel() { $to.value = cfg.to; $from.value = cfg.from; $eng.value = cfg.engine; }
  syncPanel();

  /* ---------------------------------------------------------------
     5. SMALL HELPERS
     --------------------------------------------------------------- */
  const pad2 = n => String(n).padStart(2, '0');
  const logLines = [];                                     // WHY: a diary for the Troubleshoot report. HOW: the latest 60 lines.
  function note(t) { logLines.push(pad2(new Date().getHours()) + ':' + pad2(new Date().getMinutes()) + ':' + pad2(new Date().getSeconds()) + ' ' + t); if (logLines.length > 60) logLines.shift(); }
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const withTimeout = (p, ms, what) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(what + ' took longer than ' + Math.round(ms / 1000) + ' s')), ms))]);
  const CJK = /[぀-ヿ㐀-鿿豈-﫿＀-￯　-〿]/;     // kana, kanji / hanzi and full-width signs
  const HANGUL = /[가-힯ᄀ-ᇿ]/;
  const KANA = /[぀-ヿ]/;
  const HAN = /[㐀-鿿豈-﫿]/;
  const LATIN = /[A-Za-z]/;
  const absUrl = p => new URL(p, document.baseURI).href;

  /* ---------------------------------------------------------------
     6. THE TEXT READER (Tesseract, self-hosted in ocr/)
     WHY: one single "worker" (a helper running beside the page) does all reading, one picture slice at a time, so the phone is never overloaded.
     HOW: loadScript adds ocr/tesseract.min.js the first time it is needed; createWorker starts the helper with files from ocr/ (never from the internet),
          reinitialize() swaps the language file when another language is needed. PSM 12 = "sparse text": it finds scattered bubbles and gave the best
          results in the round 32 tests (also for vertical Japanese with jpn_vert). IMPROVE: keep two workers on desktop computers (faster, more memory).
     --------------------------------------------------------------- */
  let T = null, worker = null, workerLang = '', engineProgress = '';
  function loadScript(src) {
    return new Promise((ok, bad) => {
      const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => bad(new Error('Could not load ' + src + ' (is the folder "ocr" next to index.html?)'));
      document.head.appendChild(s);
    });
  }
  const onLog = m => {                                     // WHY: tell the person what the reader is busy with (the first start downloads about 10 MB, once)
    if (m && m.status && /loading|initializ/.test(m.status)) { engineProgress = m.status.replace('loading ', '').replace('language traineddata', 'language file') + (m.progress ? ' ' + Math.round(m.progress * 100) + '%' : ''); setStatus('Preparing the text reader: ' + engineProgress); }
  };
  async function getWorker(lang) {
    if (!T) { await loadScript(OCR_DIR + 'tesseract.min.jsck and refresh() below does the work.
  $to.onchange = () => setSetting({ trTo: $to.value }); $from.onchange = () => setSetting({ trFrom: $from.value }); $eng.onchange = () => setSetting({ trEngine: $eng.value });
  panel.querySelector('#mfTrAgain').onclick = () => { panel.classList.remove('open'); redo(true); };
  function redo(all) {                                     // forget the finished pages of this session and do them again (all = also read the pictures again)
    problem = null; queue.clear();
    pages.forEach((s, i) => { if (s.layer) { s.layer.remove(); s.layer = null; } if (all) { s.ocr = null; s.key = null; } s.tr = null; s.state = 'new'; });
    done = 0; if (on) setOn(true);
  }
  let lastOcr = cfg.from, lastTr = trKey();
  window.addEventListener('mf-settings', e => {
    readCfg(e.detail); fillLists(); syncPanel(); document.body.classList.toggle('no-translate', !cfg.show);
    if (!cfg.show && on) setOn(false);
    if (cfg.from !== lastOcr) { lastOcr = cfg.from; autoLang = ''; redo(true); } else if (trKey() !== lastTr) { lastTr = trKey(); redo(false); }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && panel.classList.contains('open')) { panel.classList.remove('open'); e.stopPropagation(); } }, true);
  new MutationObserver(() => { if (!document.body.classList.contains('reading') && on) { /* leaving reading mode: the queue stops by itself (pump checks) */ } else if (on) pump(); }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  document.body.classList.toggle('no-translate', !cfg.show);

  /* ---------------------------------------------------------------
     14. SETTINGS > TRANSLATE > "Test translate"  and the report for Troubleshoot
     --------------------------------------------------------------- */
  const FILES = ['tesseract.min.js', 'worker.min.js', 'core/tesseract-core-simd-lstm.wasm.js', 'core/tesseract-core-lstm.wasm.js'].concat(['eng', 'jpn', 'jpn_vert', 'kor', 'chi_sim', 'chi_tra'].map(l => 'lang/' + l + '.traineddata.gz'));
  async function selfTest() {
    const out = document.getElementById('trTestOut'); if (!out) return; out.hidden = false; out.textContent = 'Checking…';
    const lines = [];
    for (const f of FILES) { let ok = false; try { const r = await fetch(OCR_DIR + f, { method: 'HEAD', cache: 'no-store' }); ok = r.ok; } catch { /* offline */ } lines.push((ok ? '✓ ' : '✗ MISSING ') + OCR_DIR + f); out.textContent = lines.join('\n'); }
    const t0 = performance.now(); const from = 'ja';
    try { const t = await translateOne('こんにちは、元気ですか？', from, cfg.to === 'ja' ? 'en' : cfg.to); lines.push('', '✓ Translation works (' + lastEngine + ', ' + Math.round(performance.now() - t0) + ' ms): ' + t); }
    catch (e) { lines.push('', '✗ ' + e.message); }
    lines.push('Browser translator: ' + ('Translator' in self ? 'available in this browser' : 'not available (normal; Google / MyMemory are used)'));
    out.textContent = lines.join('\n');
  }
  document.addEventListener('click', e => { if (e.target && e.target.id === 'setTrTest') selfTest(); });
  function report() {
    return ['Translate add-on (round 32)', 'button on: ' + on + ' | into: ' + cfg.to + ' | pages written in: ' + cfg.from + (autoLang ? ' (detected ' + autoLang + ')' : '') + ' | service setting: ' + cfg.engine + ' | last service used: ' + (lastEngine || '-'),
      'pages: ' + pages.size + ' known, ' + done + ' done, ' + queue.size + ' waiting | service answers: ' + (JSON.stringify(usedBy)) + ' | reader started: ' + !!worker + ' (' + (workerLang || '-') + ') | built-in translator: ' + ('Translator' in self),
      '--- diary ---'].concat(logLines.slice(-25)).join('\n');
  }

  window.MangaFlowTranslate = { version: 1, el: btn, report, info: () => ({ on, done, queue: queue.size, cfg: { ...cfg, proxies: cfg.proxies.length }, autoLang }), langs: { LANG_TO, OCR_LANGS },
    // used by the tests: run the pure parts without a browser page
    _test: { groupLines, dedupe, usable, tidy, guessLang } };
  scan();
  if (cfg.auto) { const t = setInterval(() => { if (document.body.classList.contains('reading')) { clearInterval(t); setOn(true); } }, 800); setTimeout(() => clearInterval(t), 20000); }   // "start translating as soon as I open reading mode"
})();
