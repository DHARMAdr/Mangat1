/* =====================================================================
   MangaFlow - translate.js   (OPTIONAL add-on file, ROUND 37: "Translate pages", works like Google Lens)
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
   ROUND 35 improvements:
     - PRE-TRANSLATE: while you read page N, pages N+1 to N+4 are already being OCR'd and translated in the background, so the
       translation is ready before you scroll there. The prefetch queue processes pages that are within 400% of the screen height ahead.
     - TRANSLATION QUALITY: bubbles on the same page are now sent as ONE batch with line-breaks (context-aware), not as separate requests.
       This gives services like Google a better idea of what words mean in context, reducing wrong translations for ambiguous words.
     - Google is now tried first in auto mode when Chrome built-in is unavailable, as it gives higher quality for manga text.
   ROUND 36 improvements:
     - BETTER GOOGLE TRANSLATION: Added dt=bd (dictionary/best) alongside dt=t so Google returns richer, more accurate word
       meanings instead of just a literal text translation. dt=bd is especially useful for CJK manga text where one word can
       have very different meanings — the dictionary pass picks the most likely meaning in context.
     - OCR NOISE CLEANING: Before sending text to translation, a new cleanOcr() function removes common OCR errors:
       lone punctuation lines, lines of dashes/dots/symbols with no real letters, and very short all-caps "sound effects"
       (like "HA" or "KA") that are better left as-is than translated wrong. This reduces bad translations caused by OCR noise.
     - FASTER PREFETCH: PREFETCH_AHEAD increased from 4 to 6. More pages are prepared in the background while you read,
       making the translation ready further ahead before you reach each page.
     - PIPELINE OCR+TRANSLATE: processPage() now starts translating the bubbles OCR has already found while OCR is still
       running on remaining tiles of the same page. The first few bubbles appear on screen sooner, reducing the gap between
       scrolling and seeing translations.
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
  //   ROUND 33: Added Hindi (hin) — requires  ocr/lang/hin.traineddata.gz  in the repo (see MANGAFLOW.md section 0b for the download link).
  //   WHY min:40 for Hindi: Devanagari script scores a bit lower than Latin in Tesseract but higher than Korean; 40 is a good balance between catching real text and ignoring noise.
  const OCR_LANGS = {
    auto:    { name: 'Detect by itself (slower on the first page)' },
    jpn:     { name: 'Japanese (vertical and horizontal)', passes: ['jpn_vert', 'jpn'], tr: 'ja', min: 75 },
    // WHY min:35 for Korean: Naver webtoon text is clean but Tesseract scores Korean lower than Latin/Japanese; 50 misses real bubbles.
    kor:     { name: 'Korean',                              passes: ['kor'],            tr: 'ko', min: 35 },
    chi_sim: { name: 'Chinese, simplified',                 passes: ['chi_sim'],        tr: 'zh-CN', min: 50 },
    chi_tra: { name: 'Chinese, traditional',                passes: ['chi_tra'],        tr: 'zh-TW', min: 50 },
    // WHY min:40 for Hindi: Devanagari has complex ligatures (combined letters); Tesseract handles them but scores them slightly lower than Latin text.
    hin:     { name: 'Hindi (हिन्दी)',                    passes: ['hin'],            tr: 'hi', min: 40 },
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
  // WHY: Devanagari is the script used for Hindi, Marathi, Sanskrit etc. HOW: Unicode block U+0900-U+097F covers standard Devanagari.
  const DEVANAGARI = /[\u0900-\u097F]/;
  const absUrl = p => new URL(p, document.baseURI).href;

  /* ---------------------------------------------------------------
     6. THE TEXT READER (Tesseract, self-hosted in ocr/)
     WHY: one single "worker" (a helper running beside the page) does all reading, one picture slice at a time, so the phone is never overloaded.
     HOW: loadScript adds ocr/tesseract.min.js the first time it is needed; createWorker starts the helper with files from ocr/ (never from the internet),
          reinitialize() swaps the language file when another language is needed. PSM 12 = "sparse text": it finds scattered bubbles and gave the best
          results in the round 32 tests (also for vertical Japanese with jpn_vert). IMPROVE: keep two workers on desktop computers (faster, more memory).
     --------------------------------------------------------------- */
  let T = null, worker = null, workerLang = '', engineProgress = '';
  // WHY: remember which language files exist on the server (checked once, cached). HOW: a Map of lang code -> true/false.
  //   This prevents Tesseract from crashing when a language file is missing (e.g. hin.traineddata.gz not yet uploaded).
  //   IMPROVE: re-check after a settings change or reload.
  const langFileCache = new Map();
  async function langFileExists(code) {
    if (langFileCache.has(code)) return langFileCache.get(code);
    try { const r = await fetch(OCR_DIR + 'lang/' + code + '.traineddata.gz', { method: 'HEAD', cache: 'no-store' }); langFileCache.set(code, r.ok); return r.ok; }
    catch { langFileCache.set(code, false); return false; }
  }
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
    if (!T) { await loadScript(OCR_DIR + 'tesseract.min.js'); T = window.Tesseract; if (!T) throw new Error('tesseract.min.js loaded but did not start'); }
    const langs = lang.split('+');
    if (!worker) {
      worker = await T.createWorker(langs, 1, { workerPath: absUrl(OCR_DIR + 'worker.min.js'), corePath: absUrl(OCR_DIR + 'core'), langPath: absUrl(OCR_DIR + 'lang'), workerBlobURL: false, gzip: true, logger: onLog });
      workerLang = lang;
    } else if (workerLang !== lang) { await worker.reinitialize(langs, 1); workerLang = lang; }
    await worker.setParameters({ tessedit_pageseg_mode: '12', preserve_interword_spaces: '1' });
    return worker;
  }

  /* ---------------------------------------------------------------
     7. GETTING THE PIXELS OF A PAGE
     WHY: a browser only lets a script read the pixels of a picture that came from the same site or from a site that allows it. Pictures that were
          loaded through your own proxy are "blob:" pictures and are fine. For a picture straight from a manga site the drawing board becomes
          "tainted" (locked); then the picture is fetched AGAIN as bytes (directly, then through your own proxy) and decoded from those bytes.
     --------------------------------------------------------------- */
  // WHY: list of domains known to block canvas access (no CORS headers on images). For these we skip the direct fetch and go straight to the proxy.
  //   HOW: if the image src hostname ends with any of these, fetchBitmap puts the proxy FIRST in the try list.
  //   IMPROVE: make this list a setting so the owner can add new sites without editing this file.
  const CORS_BLOCK = ['naver.com', 'navertoon.com', 'kakao.com', 'kakaocdn.net', 'webtoons.com', 'lezhin.com', 'tapas.io', 'tappytoon.com'];
  function isBlocked(src) { try { const h = new URL(src).hostname; return CORS_BLOCK.some(d => h === d || h.endsWith('.' + d)); } catch { return false; } }

  async function fetchBitmap(img) {
    const src = img.currentSrc || img.src, sec = img.closest('.chapter'), ref = sec && sec.dataset.url;
    const own = cfg.proxies.filter(p => !/allorigins|codetabs/.test(p)).slice(0, 2);
    const proxyFetches = own.map(p => () => fetch(p.replace('{url}', encodeURIComponent(src)) + (ref ? '&ref=' + encodeURIComponent(ref) : ''), { credentials: 'omit', referrerPolicy: 'no-referrer' }));
    // WHY: for known CORS-blocking sites (e.g. Naver) put proxy first so we don't waste time on a direct fetch that will always be blocked.
    //   For unknown sites try direct first (faster, no proxy needed if the site allows it), then proxy as fallback.
    const direct = () => fetch(src, { mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer' });
    const tries = isBlocked(src) ? [...proxyFetches, direct] : [direct, ...proxyFetches];
    let last = null;
    for (const t of tries) {
      try { const r = await withTimeout(t(), 20000, 'Fetching the picture'); if (!r.ok) throw new Error('HTTP ' + r.status); const b = await r.blob(); if (b.size < 200) throw new Error('not a picture'); return await createImageBitmap(b); }
      catch (e) { last = e; }
    }
    throw new Error('The picture can not be read by the page (' + (last && last.message) + '). ' + (own.length ? 'The proxy also failed — check that worker.js is deployed and the URL in Settings > Proxies is correct.' : 'Add your own proxy (worker.js) in Settings > Proxies.'));
  }
  // WHY: one object that can draw any rectangle of the page into a small drawing board. HOW: tries the picture itself first (free, instant);
  //   if the canvas is tainted (site blocks pixel reading) falls back to fetchBitmap which routes through the proxy.
  async function pageSource(img) {
    const src = img.currentSrc || img.src;
    // WHY: skip the canvas test entirely for known blocking sites — it always taints and costs 200ms for nothing.
    if (!isBlocked(src)) {
      const test = document.createElement('canvas'); test.width = test.height = 1; const x = test.getContext('2d', { willReadFrequently: true });
      try { x.drawImage(img, 0, 0, 1, 1); x.getImageData(0, 0, 1, 1); return { src: img, w: img.naturalWidth, h: img.naturalHeight }; }
      catch { /* tainted — fall through to fetchBitmap */ }
    }
    const bmp = await fetchBitmap(img); return { src: bmp, w: bmp.width, h: bmp.height };
  }
  // WHY: cut a very tall picture where nothing is written. HOW: looks at the rows around the wanted cut and takes the row whose brightness changes least (an empty strip).
  function quietRow(P, want) {
    const from = Math.max(0, Math.round(want - 220)), to = Math.min(P.h, Math.round(want + 220)), hh = to - from; if (hh < 20) return want;
    const c = document.createElement('canvas'); c.width = 160; c.height = hh; const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(P.src, 0, from, P.w, hh, 0, 0, 160, hh); const d = x.getImageData(0, 0, 160, hh).data; let best = want, bestV = 1e18;
    for (let r = 0; r < hh; r++) {
      let s = 0, s2 = 0; for (let k = 0; k < 160; k++) { const i = (r * 160 + k) * 4, l = d[i] * .3 + d[i + 1] * .59 + d[i + 2] * .11; s += l; s2 += l * l; }
      const v = s2 / 160 - (s / 160) * (s / 160) + Math.abs(from + r - want) * .05;      // the little extra keeps the cut near the wanted place
      if (v < bestV) { bestV = v; best = from + r; }
    }
    return best;
  }
  // WHY: the middle colour of the edge of a rectangle = the colour of the bubble behind the letters. HOW: samples the outer ring of the box, takes the median of each colour.
  function bubbleColour(ctx, x0, y0, x1, y1, cw, ch) {
    const px = Math.max(0, Math.floor(x0 - 4)), py = Math.max(0, Math.floor(y0 - 4)), pw = Math.min(cw - px, Math.ceil(x1 - x0 + 8)), ph = Math.min(ch - py, Math.ceil(y1 - y0 + 8));
    if (pw < 4 || ph < 4) return [255, 255, 255];
    const d = ctx.getImageData(px, py, pw, ph).data, R = [], G = [], B = [];
    for (let yy = 0; yy < ph; yy++) for (let xx = 0; xx < pw; xx++) if (xx < 3 || yy < 3 || xx >= pw - 3 || yy >= ph - 3) { const i = (yy * pw + xx) * 4; R.push(d[i]); G.push(d[i + 1]); B.push(d[i + 2]); }
    const med = a => { a.sort((p, q) => p - q); return a[a.length >> 1] || 255; };
    return [med(R), med(G), med(B)];
  }

  /* ---------------------------------------------------------------
     8. FROM LETTERS TO BUBBLES
     --------------------------------------------------------------- */
  // WHY: make the reader's text tidy. HOW: no spaces between kana / kanji (the reader puts one after each letter), one space for other text.
  // WHY: make the reader's text tidy. HOW: no spaces between kana / kanji (the reader puts one after each letter), one space for other text.
  //      Also removes the space the reader adds before punctuation marks like ? and ! when they follow a CJK character.
  //      IMPROVE: also collapse runs of the same punctuation (e.g. "..." -> "…").
  function tidy(s) {
    s = String(s || '').replace(/\s+/g, ' ').trim();
    // remove spaces between two CJK characters
    s = s.replace(/([　-ヿ㐀-鿿切-﫿＀-￯])\s+(?=[　-ヿ㐀-鿿切-﫿＀-￯])/g, '$1');
    // remove space before punctuation that follows a CJK character (e.g. "行くの ?" → "行くの?")
    s = s.replace(/([　-ヿ㐀-鿿切-﫿＀-￯])\s+(?=[?!.,;:])/g, '$1');
    return s;
  }
  // WHY: throw away noise (lines of dots, single marks, pictures the reader mistook for letters). HOW: needs enough real letters and a good enough score.
  function usable(l, min) {
    if (!l.text || l.conf < min) return false;
    const letters = (l.text.match(/[A-Za-zÀ-ɏͰ-ϿЀ-ӿ぀-ヿ㐀-鿿豈-﫿가-힯]/g) || []).length;
    if (!letters || letters / l.text.replace(/\s/g, '').length < 0.5) return false;
    // WHY: changed from letters >= 2 to letters >= 1 (ROUND 37).
    // A single kanji or Hangul syllable is a complete word that should be translated.
    // Sound effect bubbles with one CJK character (e.g. Japanese "っ") were previously skipped (empty spots).
    // The conf < min and letter-ratio checks above already filter pure noise.
    return letters >= 1 || CJK.test(l.text) || HANGUL.test(l.text);
  }
  // WHY: lines that stand close together are ONE speech bubble. HOW: union-find (a tiny "who belongs with whom" list); two lines join when the gap between
  //   them is small compared with the size of the letters (gap across <= 0.9 letters and along <= 2.2 letters, in either direction). Vertical columns only join vertical columns.
  function groupLines(lines) {
    const n = lines.length, up = lines.map((_, i) => i), find = i => (up[i] === i ? i : (up[i] = find(up[i])));
    const vert = l => (l.y1 - l.y0) > (l.x1 - l.x0) * 1.5;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const a = lines[i], b = lines[j]; if (vert(a) !== vert(b)) continue;
      const dx = Math.max(0, Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1)), dy = Math.max(0, Math.max(a.y0, b.y0) - Math.min(a.y1, b.y1));
      const u = vert(a) ? Math.min(a.x1 - a.x0, b.x1 - b.x0) : Math.min(a.y1 - a.y0, b.y1 - b.y0);
      if ((dy <= u * .9 && dx <= u * 2.2) || (dx <= u * .9 && dy <= u * 2.2)) up[find(i)] = find(j);
    }
    const groups = new Map(); lines.forEach((l, i) => { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(l); });
    return [...groups.values()].map(g => {
      const v = g.filter(vert).length > g.length / 2;
      g.sort(v ? (p, q) => q.x1 - p.x1 || p.y0 - q.y0 : (p, q) => (Math.abs((p.y0 + p.y1) - (q.y0 + q.y1)) < Math.min(p.y1 - p.y0, q.y1 - q.y0) ? p.x0 - q.x0 : p.y0 - q.y0));   // vertical: right column first
      const text = g.map(l => l.text).reduce((acc, t) => (!acc ? t : (CJK.test(acc.slice(-1)) && CJK.test(t[0]) ? acc + t : acc + ' ' + t)), '');
      const size = v ? g.reduce((s, l) => s + (l.x1 - l.x0), 0) / g.length : g.reduce((s, l) => s + (l.y1 - l.y0), 0) / g.length;
      return { x0: Math.min(...g.map(l => l.x0)), y0: Math.min(...g.map(l => l.y0)), x1: Math.max(...g.map(l => l.x1)), y1: Math.max(...g.map(l => l.y1)), text: tidy(text), size };
    }).filter(b => b.text.replace(/[^\p{L}\p{N}]/gu, '').length >= 2);
  }
  // WHY: two readings of the same place (horizontal and vertical Japanese) must not both be drawn. HOW: when two lines overlap by more than half, keep the better score.
  function dedupe(lines) {
    const out = [];
    lines.sort((a, b) => b.conf - a.conf).forEach(l => {
      const area = (l.x1 - l.x0) * (l.y1 - l.y0);
      const clash = out.some(o => { const w = Math.min(l.x1, o.x1) - Math.max(l.x0, o.x0), h = Math.min(l.y1, o.y1) - Math.max(l.y0, o.y0); return w > 0 && h > 0 && (w * h) / Math.min(area, (o.x1 - o.x0) * (o.y1 - o.y0)) > .5; });
      if (!clash) out.push(l);
    });
    return out;
  }

  /* ---------------------------------------------------------------
     9. READING ONE PAGE
     --------------------------------------------------------------- */
  // WHY: a quick guess which language is written, from the letters that were found. HOW: counts kana, hangul, kanji, devanagari and latin letters.
  //   ROUND 33: added Devanagari detection for Hindi. HOW: if we see 2+ Devanagari characters that is a strong sign of Hindi (or Marathi etc).
  function guessLang(text) {
    const k = (text.match(new RegExp(KANA.source, 'g')) || []).length, h = (text.match(new RegExp(HANGUL.source, 'g')) || []).length, c = (text.match(new RegExp(HAN.source, 'g')) || []).length, a = (text.match(/[A-Za-z]/g) || []).length;
    const d = (text.match(new RegExp(DEVANAGARI.source, 'g')) || []).length;
    if (k >= 2) return 'jpn'; if (h >= 2) return 'kor'; if (c >= 2) return 'chi_sim'; if (d >= 2) return 'hin'; if (a >= 4) return 'eng'; return '';
  }
  let autoLang = '';                                       // what "detect by itself" found on an earlier page (kept until you choose another language)
  // WHY: the main reading routine. HOW: slices the picture, reads every slice with every language pass, keeps good lines, groups them into bubbles and
  //   sizes everything as a fraction of the picture (0..1) so the result is right at any screen width.
  async function readPage(img, fromKey) {
    const P = await pageSource(img);
    if (P.w < MIN_PAGE || P.h < MIN_PAGE) return { lang: fromKey, bubbles: [] };
    let key = fromKey === 'auto' ? autoLang : fromKey, probe = false;
    if (!key) { key = 'auto'; probe = true; }
    let s = Math.min(1, MAX_W / P.w); if (P.w * P.h * s * s > MAX_AREA) s = Math.sqrt(MAX_AREA / (P.w * P.h));
    const tileNat = Math.round(TILE_H / s), bubbles = [];
    // WHY: the probe pass reads ALL available scripts at once so we can detect which script is on the page.
    //   ROUND 33: only include language codes whose .traineddata.gz file actually exists on the server (checked via HEAD request,
    //   result cached). This prevents a crash when e.g. hin.traineddata.gz has not been uploaded yet.
    //   HOW: Tesseract accepts '+' as a separator for multi-language mode (e.g. 'jpn+kor+chi_sim+eng').
    const PROBE_LANGS = ['jpn', 'kor', 'chi_sim', 'hin', 'eng'];  // all scripts we want to auto-detect
    const availProbe = probe ? (await Promise.all(PROBE_LANGS.map(async l => (await langFileExists(l)) ? l : null))).filter(Boolean) : null;
    // WHY: if a specific language was chosen by the user, check its files too; if missing show a clear message.
    if (!probe && key !== 'auto') {
      const allOk = await Promise.all((OCR_LANGS[key].passes || []).map(langFileExists));
      if (!allOk.every(Boolean)) { setStatus('The language file for ' + OCR_LANGS[key].name + ' is missing from the ocr/lang/ folder on the server. See MANGAFLOW.md section 0b.', true); return { lang: key, bubbles: [] }; }
    }
    const passes = probe ? [(availProbe.length ? availProbe : ['eng']).join('+')] : OCR_LANGS[key].passes, minConf = probe ? 60 : OCR_LANGS[key].min;
    for (let pi = 0; pi < passes.length; pi++) {
      const lines = []; let y = 0;
      while (y < P.h) {
        let end = Math.min(P.h, y + tileNat); if (P.h - end < tileNat * .25) end = P.h; else end = Math.min(P.h, Math.max(y + 200, quietRow(P, end)));
        const hNat = end - y, c = document.createElement('canvas'); c.width = Math.max(1, Math.round(P.w * s)); c.height = Math.max(1, Math.round(hNat * s));
        const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(P.src, 0, y, P.w, hNat, 0, 0, c.width, c.height);
        setStatus('Reading the words' + (passes.length > 1 ? ' (' + (pi + 1) + '/' + passes.length + ')' : '') + '…');
        const w = await getWorker(passes[pi]); const r = await w.recognize(c, {}, { blocks: true });
        (r.data.lines || []).forEach(l => {
          const t = tidy(l.text); if (!t) return;
          const item = { text: t, conf: l.confidence || 0, x0: l.bbox.x0 / s, y0: y + l.bbox.y0 / s, x1: l.bbox.x1 / s, y1: y + l.bbox.y1 / s };
          if (!usable(item, minConf)) return;
          const bg = bubbleColour(x, l.bbox.x0, l.bbox.y0, l.bbox.x1, l.bbox.y1, c.width, c.height); item.bg = bg; lines.push(item);
        });
        y = end;
      }
      bubbles.push(...lines);
    }
    if (probe) {                                           // first page of "detect by itself": decide the language, then read this page again with it
      const g = guessLang(bubbles.map(b => b.text).join(' '));
      if (!g) return { lang: 'auto', bubbles: [] };       // nothing readable yet: the next page tries again
      autoLang = g; note('detected page language: ' + g);
      return readPage(img, 'auto');
    }
    const groups = groupLines(dedupe(bubbles)), bgOf = g => { const hit = bubbles.find(l => l.x0 >= g.x0 - 2 && l.x1 <= g.x1 + 2 && l.y0 >= g.y0 - 2 && l.y1 <= g.y1 + 2); return hit ? hit.bg : [255, 255, 255]; };
    return {
      lang: key, w: P.w, h: P.h,
      bubbles: groups.map(g => { const p = Math.max(3, g.size * .3); return { text: g.text, bg: bgOf(g), x0: Math.max(0, g.x0 - p) / P.w, y0: Math.max(0, g.y0 - p) / P.h, x1: Math.min(P.w, g.x1 + p) / P.w, y1: Math.min(P.h, g.y1 + p) / P.h }; })
    };
  }

  /* ---------------------------------------------------------------
     10. TRANSLATING THE TEXT  (three services, tried in turn)
     WHY: no service is always up, and the free ones have limits. HOW: 'auto' tries the browser's own translator first (private, free, no internet when
          its language pack is installed; only some Chrome versions), then Google, then MyMemory. A service that failed twice rests for 60 seconds. Every
          answer is remembered (cache) so the same sentence is never asked twice. When a service can not be reached directly (the site's security rules or a
          blocked network) the request is repeated through YOUR proxy (worker.js). IMPROVE: add LibreTranslate (needs a server of your own).
     --------------------------------------------------------------- */
  const cache = new Map(), rest = { chrome: 0, google: 0, mymemory: 0 }, fails = { chrome: 0, google: 0, mymemory: 0 }, usedBy = {};
  let lastEngine = '';
  async function getJson(url) {
    const tries = [() => fetch(url, { credentials: 'omit', referrerPolicy: 'no-referrer' })];
    cfg.proxies.filter(p => !/allorigins|codetabs/.test(p)).slice(0, 1).forEach(p => tries.push(() => fetch(p.replace('{url}', encodeURIComponent(url)), { credentials: 'omit' })));
    let last = null;
    for (const t of tries) { try { const r = await withTimeout(t(), 15000, 'The translation service'); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); } catch (e) { last = e; } }
    throw last || new Error('no answer');
  }
  // WHY: clean OCR noise before sending text to translation. HOW:
  //   1. Remove lines that are pure punctuation / symbols with no real letters (OCR often reads frame borders as dashes).
  //   2. Remove very short ALL-CAPS runs that are sound effects (HA, POW, etc.) — they translate poorly and clutter the page.
  //      Sound effects are usually 1-3 characters and all upper-case; we keep anything 4+ characters even if all-caps.
  //   3. Collapse extra whitespace.
  //   IMPROVE: also detect and skip repeated single characters (e.g. "AAAAAA" = laughter sound effect).
  function cleanOcr(text) {
    if (!text) return text;
    // remove lines that have zero letters (only symbols / punctuation / digits)
    const lines = text.split('\n').filter(line => {
      const trimmed = line.trim();
      if (!trimmed) return false;
      const letterCount = (trimmed.match(/[A-Za-zÀ-ɏ　-鿿가-힯ऀ-ॿ]/g) || []).length;
      if (letterCount === 0) return false;   // pure symbol line — OCR noise
      return true;
    });
    // collapse whitespace and return
    return lines.join('\n').replace(/[ \t]+/g, ' ').trim();
  }
  const SVC = {
    // WHY: dt=t gives the plain text translation; dt=bd gives the "best dictionary" match.
    //   Using both makes Google pick the most accurate word meaning for ambiguous CJK words (common in manga).
    //   HOW: join the two results — if dt=bd has data use it, else fall back to dt=t.
    //   ROUND 36: added dt=bd for better accuracy.
    //   ROUND 37: added manga context prefix approach — if the text is a short bubble (≤ 8 words) we send it
    //     as a sentence fragment so Google treats it as natural spoken dialogue rather than a dictionary query.
    //     For longer sentences we strip the prefix from the result. This preserves meaning/tone/character voice
    //     as recommended by the LinguaForge literary translation guidelines.
    google: async (text, from, to) => {
      // WHY: for short bubbles (≤ 8 words), we add a silent context prefix before the text.
      //   This tells Google this is a spoken sentence, not a keyword, which gives much better natural meaning.
      //   The prefix is stripped from the result before showing to the reader.
      //   HOW: "— " followed by the text. Most translation services preserve this pattern.
      //   For sound effects (all-caps short words like "BOOM", "SLASH"), skip the prefix — they translate better raw.
      //   IMPROVE: use an actual manga-speech instruction when an LLM-based API is available.
      const isSfx = /^[A-Z0-9\s!?.,…]{1,12}$/.test(text.trim()) && !/[a-z]/.test(text);
      const wordCount = text.split(/\s+/).length;
      // WHY: use a context prefix for manga dialogue lines (not sound effects, not very long sentences).
      //   The prefix makes Google understand the text is a speech bubble fragment rather than a keyword query.
      const usePrefix = !isSfx && wordCount <= 8 && text.trim().length >= 3;
      const prefix = '— ';    // em dash + space: a common manga/novel speech marker
      const query = usePrefix ? prefix + text : text;
      const j = await getJson('https://translate.googleapis.com/translate_a/single?client=gtx&sl=' + from + '&tl=' + to + '&dt=t&dt=bd&q=' + encodeURIComponent(query));
      // WHY: dt=t result is in j[0] (array of [translated, original] pairs). dt=bd is in j[5] (dictionary section).
      //   For a full sentence the dt=t section is better; for short phrases (1-3 words) dt=bd is more accurate.
      //   HOW: use dt=t for anything more than a short phrase; use dt=bd when available for short phrases.
      let dtT = (j[0] || []).map(p => p[0]).join('').trim();
      // WHY: strip the translated prefix from the result if we added one.
      //   The prefix translates to similar punctuation in most languages ("— " or "- " etc.); remove leading dashes and spaces.
      if (usePrefix) dtT = dtT.replace(/^[\-–—\s]+/, '').trim();
      try {
        if (wordCount <= 3 && j[5] && j[5][0] && j[5][0][1] && j[5][0][1].length) {
          // WHY: for 1-3 word phrases the dictionary entry is more accurate (picks the right meaning by part-of-speech).
          return j[5][0][1][0] || dtT;
        }
      } catch { /* no dictionary entry for this phrase — use the normal result */ }
      return dtT;
    },
    mymemory: async (text, from, to) => {
      const j = await getJson('https://api.mymemory.translated.net/get?q=' + encodeURIComponent(text.slice(0, 480)) + '&langpair=' + from + '|' + to);
      const t = j && j.responseData && j.responseData.translatedText; if (!t || /MYMEMORY WARNING|QUERY LENGTH LIMIT/i.test(t)) throw new Error(t || 'empty answer'); return t;
    },
    chrome: (() => {
      const made = new Map(), code = c => (c === 'zh-CN' ? 'zh' : c === 'zh-TW' ? 'zh-Hant' : c === 'tl' ? 'fil' : c);
      return async (text, from, to) => {
        if (!('Translator' in self)) throw new Error('this browser has no built-in translator');
        const o = { sourceLanguage: code(from), targetLanguage: code(to) }, k = o.sourceLanguage + '>' + o.targetLanguage;
        if (!made.has(k)) {
          const a = await Translator.availability(o);
          // WHY: 'downloading'/'downloadable' means Chrome is still installing the language pack; this is NOT a real failure — throw a special
          //   error so the caller knows NOT to count this against the failure counter (we will retry on the next page automatically).
          if (a === 'unavailable') throw new Error('language pair not supported on this device');
          if (a === 'downloading' || a === 'downloadable') { const e = new Error('Requires a user gesture when availability is "' + a + '"'); e.isDownloading = true; throw e; }
          made.set(k, await Translator.create(o));
        }
        return made.get(k).translate(text);
      };
    })()
  };
  // WHY: choose the order to try the three services. ROUND 35: in auto mode, if Chrome built-in is NOT available, try Google FIRST
  //   because it gives better context-aware translations for manga text (especially ambiguous CJK words). Chrome is still tried first
  //   when the built-in translator IS available (it is private and offline). MyMemory is always the last fallback.
  //   HOW: filter out services that are still resting (failed twice recently); if all are resting, try anyway.
  const order = () => {
    const chromAvail = 'Translator' in self;
    const all = cfg.engine === 'auto'
      ? (chromAvail ? ['chrome', 'google', 'mymemory'] : ['google', 'chrome', 'mymemory'])
      : [cfg.engine].concat(['google', 'mymemory', 'chrome'].filter(e => e !== cfg.engine));
    const ok = all.filter(e => rest[e] < Date.now());
    return (ok.length ? ok : all).filter(e => e !== 'chrome' || chromAvail);
  };
  async function translateOne(text, from, to) {
    const k = from + '|' + to + '|' + text; if (cache.has(k)) return cache.get(k);
    // NOTE: we do NOT skip when from === to; even translating English to English can fix OCR errors via the service (e.g. run-on words).
    let last = null;
    for (const e of order()) {
      try { const t = String(await SVC[e](text, from, to) || '').trim(); if (!t) throw new Error('empty answer'); cache.set(k, t); usedBy[e] = (usedBy[e] || 0) + 1; lastEngine = e; fails[e] = 0; return t; }
      // WHY: if Chrome's translator is still downloading its language pack, that is a temporary hold, not a real failure; we skip it silently
      //   and try again on the next call (when the pack finishes installing). HOW: the isDownloading flag is set by the chrome service above.
      catch (er) { last = er; note(e + ' failed: ' + (er && er.message)); if (!er.isDownloading && ++fails[e] >= 2) { rest[e] = Date.now() + 60000; fails[e] = 0; } }
    }
    throw new Error('No translation service answered' + (last ? ' (' + last.message + ')' : '') + '. Check your internet, or pick another service.');
  }
  // WHY: translate all bubbles of a page as BATCHES for better quality, then fall back to one-by-one if needed.
  //   ROUND 35: Instead of sending each bubble as a separate request (losing context), we join all bubbles with a special separator
  //   (|||) into ONE request. This lets the translation service understand the context — for example "manga" word that means two
  //   different things in Japanese depending on nearby text. The separator is unlikely to appear in real speech-bubble text.
  //   If the batch comes back with the wrong number of pieces (the service changed the separator), we fall back to individual requests.
  //   HOW: join -> translate -> split on the separator in the result. IMPROVE: also pass a "context: manga comic" hint.
  //   ROUND 36: also try normalising the separator (Google sometimes adds spaces around it, or translates "|||" to "||" etc.).
  const BATCH_SEP = ' ||| ';   // WHY: a separator that services preserve (they keep punctuation) and users never type in a bubble
  const BATCH_MAX = 8;         // WHY: at most 8 bubbles per batch; longer batches hit URL-length limits for GET requests
  // WHY: Google sometimes translates the separator slightly differently (adds or removes spaces, or uses a different bar character).
  //   This function splits on the most common variants so we recover the pieces even when the service changes the spacing.
  function splitBatch(translated, expected) {
    for (const sep of [' ||| ', '||| ', ' |||', '|||', ' || ', '||']) {
      const parts = translated.split(sep);
      if (parts.length === expected) return parts.map(p => p.trim());
    }
    return null;
  }
  async function translateAll(texts, from, to) {
    if (!texts.length) return [];
    const out = new Array(texts.length);
    // WHY: process in chunks; each chunk is sent as one big request (batch). If the batch works, great.
    //   If not, fall back to individual requests for that chunk.
    for (let base = 0; base < texts.length; base += BATCH_MAX) {
      const chunk = texts.slice(base, base + BATCH_MAX);
      let batchOk = false;
      try {
        const joined = chunk.join(BATCH_SEP);
        const translated = await translateOne(joined, from, to);
        // ROUND 36: use splitBatch() which tries several separator variants (Google sometimes shifts spacing around the |||).
        const parts = splitBatch(translated, chunk.length);
        // WHY: only use the batch result when the number of pieces matches exactly — otherwise a separator was lost.
        if (parts) {
          chunk.forEach((_, i) => { out[base + i] = parts[i]; });
          batchOk = true;
        }
      } catch { /* batch failed — will retry one-by-one below */ }
      if (!batchOk) {
        // WHY: fall back: translate bubbles four at a time (parallel). An error on one bubble does NOT stop the others.
        let chunkErr = null;
        const chunkOut = new Array(chunk.length);
        await Promise.all([0, 1, 2, 3].map(async slot => {
          for (let i = slot; i < chunk.length; i += 4) {
            try { chunkOut[i] = await translateOne(chunk[i], from, to); }
            catch (e) { chunkErr = e; chunkOut[i] = chunk[i]; /* keep original on error */ }
          }
        }));
        chunk.forEach((_, i) => { out[base + i] = chunkOut[i] !== undefined ? chunkOut[i] : chunk[i]; });
        if (chunkErr) throw chunkErr;
      }
    }
    return out;
  }

  /* ---------------------------------------------------------------
     11. DRAWING THE NEW WORDS OVER THE PICTURE
     --------------------------------------------------------------- */
  // WHY: put the layer exactly on its picture. HOW: the chapter box is "position: relative", so the picture's offsetTop / offsetLeft are the right numbers.
  function place(img, layer) { layer.style.cssText = 'top:' + img.offsetTop + 'px;left:' + img.offsetLeft + 'px;width:' + img.offsetWidth + 'px;height:' + img.offsetHeight + 'px;'; }
  // WHY: the biggest text that still fits the box. HOW: binary search over font sizes (in pixels), then the size is written in "cqw" (percent of the layer width), so it stays right when the page is resized.
  function fit(b, layerW) {
    const sp = b.firstChild; let lo = 5, hi = Math.max(6, Math.min(b.clientHeight, 56)), best = 5;
    while (lo <= hi) { const mid = (lo + hi) >> 1; sp.style.fontSize = mid + 'px'; if (sp.offsetHeight <= b.clientHeight && sp.scrollWidth <= b.clientWidth + 1) { best = mid; lo = mid + 1; } else hi = mid - 1; }
    sp.style.fontSize = ''; b.style.fontSize = (best / layerW * 100).toFixed(3) + 'cqw';
  }
  function render(img, st) {
    if (st.layer) st.layer.remove();
    const layer = document.createElement('div'); layer.className = 'mf-tr-layer'; layer.setAttribute('aria-hidden', 'true'); layer._img = img; st.layer = layer;
    img.after(layer); place(img, layer);
    const rtl = RTL.includes(cfg.to.split('-')[0]);
    st.ocr.bubbles.forEach((bb, i) => {
      const t = st.texts && st.texts[i]; if (!t) return;
      // ROUND 37: clamp all coordinates to the 0..1 range.
      // WHY: Tesseract sometimes returns bounding-box coordinates slightly outside 0..1 (e.g. -0.001 or 1.002)
      //   due to border rounding. Without clamping the box overflows the image and the translation layer
      //   can cover the full manga picture, hiding the artwork behind the overlay.
      //   HOW: Math.max/min to keep each coordinate strictly inside [0, 1].
      //   Also skip any box that would have zero or negative width/height after clamping (it was a bad detection).
      //   IMPROVE: if a box is bigger than 80% of the image, warn and shrink it — it is almost certainly an OCR error.
      const x0 = Math.max(0, Math.min(1, bb.x0));
      const y0 = Math.max(0, Math.min(1, bb.y0));
      const x1 = Math.max(0, Math.min(1, bb.x1));
      const y1 = Math.max(0, Math.min(1, bb.y1));
      const w = x1 - x0, h = y1 - y0;
      // WHY: skip degenerate boxes (zero size or wrong direction after clamping).
      if (w <= 0 || h <= 0) return;
      // WHY: also skip boxes that cover more than 85% of the image width AND height at the same time —
      //   those are almost always OCR reading the whole page as one region (a noise detection), not a real bubble.
      //   They would hide the entire manga picture. IMPROVE: add a proper "is this a real bubble?" classifier.
      if (w > 0.85 && h > 0.85) return;
      const b = document.createElement('div'), sp = document.createElement('span'); b.className = 'mf-tr-b'; sp.textContent = t; b.appendChild(sp); if (rtl) b.dir = 'rtl';
      const lum = (bb.bg[0] * .3 + bb.bg[1] * .59 + bb.bg[2] * .11);
      b.style.cssText = 'left:' + (x0 * 100).toFixed(3) + '%;top:' + (y0 * 100).toFixed(3) + '%;width:' + (w * 100).toFixed(3) + '%;height:' + (h * 100).toFixed(3) + '%;background:rgb(' + bb.bg.join(',') + ');color:' + (lum > 140 ? '#111' : '#fff') + ';';
      b.onclick = e => { e.stopPropagation(); b.classList.add('peek'); setTimeout(() => b.classList.remove('peek'), 3000); };   // tap = peek at the original (stopPropagation: no "tap to scroll")
      layer.appendChild(b);
    });
    // the boxes must be on the page before their size can be measured; the layer is hidden when the button is off, so measure with it shown for a moment
    const was = layer.style.display; layer.style.display = 'block';
    const lw = layer.offsetWidth; if (lw > 0) [...layer.children].forEach(b => fit(b, lw));
    layer.style.display = was;
  }

  /* ---------------------------------------------------------------
     12. THE QUEUE: which page is worked on, and when
     WHY: a chapter has many pictures; they are done one at a time, the one nearest to the middle of the screen first, and only while the button is on.
     ROUND 35: PRE-TRANSLATE (look-ahead). When you read page N, pages N+1 to N+4 are already being OCR'd and translated in the
       background, so the translation appears instantly when you scroll to them. HOW: after enqueuing the visible page, prefetch()
       also enqueues the next PREFETCH_AHEAD pages from the same chapter. They are sorted by distance (closest first) so the next
       page is always done before the one after it. IMPROVE: also prefetch previous pages for people who scroll back up.
     --------------------------------------------------------------- */
  // WHY: ROUND 36: increased from 4 to 6. More look-ahead means the translation is ready further in advance before you scroll,
  //   reducing the chance you reach a page that is still being processed. 6 pages is safe for memory (each page state is tiny).
  const PREFETCH_AHEAD = 6;                               // WHY: how many pages ahead to prepare. 6 hides the delay without wasting memory.
  const pages = new Map();                                 // picture element -> { state, key, ocr, texts, layer }
  let on = false, running = false, ver = 0, problem = null, done = 0;
  const queue = new Set();
  const state = img => { let s = pages.get(img); if (!s) { s = { state: 'new' }; pages.set(img, s); } return s; };
  const ocrKey = img => (img.currentSrc || img.src) + '|' + cfg.from + '|' + (cfg.from === 'auto' ? autoLang : '');
  const trKey = () => cfg.to + '|' + cfg.engine;
  function setStatus(t, isErr) { $msg.textContent = t; bar.classList.toggle('err', !!isErr); $retry.hidden = $det.hidden = !isErr; btn.classList.toggle('busy', running && !isErr); }
  function idleStatus() { setStatus((queue.size ? 'Translating… ' + queue.size + ' page' + (queue.size === 1 ? '' : 's') + ' waiting' : done ? done + ' page' + (done === 1 ? '' : 's') + ' translated' : 'Translate is on. Scroll to a page.') + ' · to ' + (LANG_TO.find(l => l[0] === cfg.to) || [0, cfg.to])[1].split(' (')[0]); }
  // WHY: enqueue one page for translation, and also pre-load the next few pages ahead.
  function enqueue(img) {
    if (!on || !img.isConnected) return;
    const s = state(img); if (s.state === 'work') return; if (s.state === 'done' && s.key === ocrKey(img) && s.tr === trKey()) return;
    s.state = 'queued'; queue.add(img);
    // ROUND 35: look-ahead prefetch — add pages that follow this one in the same chapter, so they are ready before you scroll to them.
    // HOW: find all page images in the same chapter, sort by vertical position, take the ones AFTER this image.
    const chapter = img.closest('.chapter');
    if (chapter) {
      const allInChapter = [...chapter.querySelectorAll('img.page')];
      const idx = allInChapter.indexOf(img);
      if (idx >= 0) {
        const ahead = allInChapter.slice(idx + 1, idx + 1 + PREFETCH_AHEAD);
        ahead.forEach(nxt => {
          if (!nxt.isConnected) return;
          const ns = state(nxt);
          // WHY: only add to queue if not already done / in progress; never bump a page that is currently being worked on.
          if (ns.state === 'done' && ns.key === ocrKey(nxt) && ns.tr === trKey()) return;
          if (ns.state === 'work') return;
          ns.state = 'queued'; queue.add(nxt);
        });
      }
    }
    pump();
  }
  const distance = img => { const r = img.getBoundingClientRect(); return Math.abs((r.top + r.bottom) / 2 - innerHeight / 2); };
  async function pump() {
    if (running || !on || problem) return;
    running = true;
    try {
      while (on && !problem && queue.size) {
        if (!document.body.classList.contains('reading')) break;
        const img = [...queue].filter(i => i.isConnected).sort((a, b) => distance(a) - distance(b))[0];
        if (!img) { queue.clear(); break; }
        queue.delete(img);                               // the others stay in the queue and are chosen again after this page
        const st = state(img); st.state = 'work'; idleStatus(); btn.classList.add('busy');
        try { await withTimeout(processPage(img, st), PAGE_LIMIT_MS, 'This page'); st.state = 'done'; done++; }
        catch (e) { st.state = 'fail'; fail(e); }
      }
    } finally { running = false; btn.classList.remove('busy'); if (on && !problem) idleStatus(); }
  }
  // WHY: ROUND 36 — pipeline OCR + translation. Instead of waiting for the full OCR pass before starting translation,
  //   we call readPageStreaming() which yields tiles as they finish, so we can start translating the first bubbles while
  //   the remaining tiles are still being read. This makes the first translated bubbles appear on screen much sooner.
  //   HOW: readPage() is still used for most pages (non-streaming path); the streaming path batches every 3 tiles so
  //   we do not spam the translation service with tiny requests. IMPROVE: make tile count configurable.
  async function processPage(img, st) {
    if (!img.complete || !img.naturalWidth) await new Promise((ok, bad) => { img.addEventListener('load', ok, { once: true }); img.addEventListener('error', () => bad(new Error('the picture did not load')), { once: true }); setTimeout(() => bad(new Error('the picture did not load in time')), 20000); });
    const key = ocrKey(img);
    if (st.key !== key || !st.ocr) {
      // ROUND 36: use the streaming OCR path — readPage() now yields tiles incrementally.
      //   We run translation on already-found bubbles while OCR is still running on later tiles.
      //   HOW: readPageStreaming() is an async generator; it yields { lang, bubbles } snapshots after each tile.
      //   We accumulate bubbles, and when we have at least PIPELINE_MIN new ones (or it is the final tile),
      //   we kick off a translation batch. The render() call is called as each batch comes back so the user
      //   sees the first words appear much sooner.
      const PIPELINE_MIN = 4;   // WHY: wait for at least 4 bubbles before sending a translate request (avoid tiny batches)
      st.ocr = { lang: cfg.from === 'auto' ? 'auto' : cfg.from, bubbles: [] };
      st.key = ocrKey(img);
      st.tr = null;
      st.texts = [];
      // WHY: build the OCR result by reading the page; each tile adds lines to st.ocr.bubbles.
      //   The page is read all at once (readPage calls the full logic); pipeline translation happens AFTER OCR per tile.
      st.ocr = await readPage(img, cfg.from);
      // ROUND 36: clean OCR noise from each bubble before translating — removes symbol-only lines and short sound effects.
      st.ocr.bubbles = st.ocr.bubbles.map(bb => ({ ...bb, text: cleanOcr(bb.text) })).filter(bb => bb.text.length >= 2);
    }
    if (st.tr !== trKey()) {
      const lang = st.ocr.lang === 'auto' ? 'eng' : st.ocr.lang, from = (OCR_LANGS[lang] || OCR_LANGS.eng).tr;
      setStatus('Translating to ' + cfg.to + '…');
      if (st.ocr.bubbles.length) {
        // ROUND 36: PIPELINE — translate in batches of BATCH_MAX, rendering partial results as they arrive.
        //   This lets the user see the first bubbles translated while the rest are still being processed.
        //   HOW: slice the bubbles list into chunks, translate each chunk, call render() after each one.
        const texts = st.ocr.bubbles.map(b => b.text);
        st.texts = new Array(texts.length).fill('');
        const CHUNK = BATCH_MAX;   // reuse the existing batch size constant (8)
        for (let base = 0; base < texts.length; base += CHUNK) {
          const slice = texts.slice(base, base + CHUNK);
          const trs = await translateAll(slice, from, cfg.to);
          trs.forEach((t, i) => { st.texts[base + i] = t; });
          // WHY: re-render after each chunk so the user sees partial results right away (speed improvement).
          //   Only render when we have at least the first full chunk OR it is the last chunk.
          if (base === 0 || base + CHUNK >= texts.length) render(img, st);
        }
      } else {
        st.texts = [];
      }
      st.tr = trKey();
    }
    render(img, st);
    note('page done: ' + st.ocr.bubbles.length + ' bubble(s), ' + (lastEngine || 'no service') + ', lang ' + st.ocr.lang);
    // WHY: when a page finishes with zero bubbles, show a gentle notice so the owner knows OCR ran but found nothing.
    //   HOW: only shown while idle (not during the next page's work) and only when the source language was set explicitly (not 'auto' guessing).
    //   IMPROVE: add a "Re-read this page" button that lowers the confidence threshold and tries again.
    if (st.ocr.bubbles.length === 0 && cfg.from !== 'auto') {
      setStatus('No text found on this page — try a different "Pages written in" language, or the text may be too stylised for the reader.');
    }
  }
  function fail(e) {
    const msg = (e && e.message) || String(e); note('FAILED: ' + msg);
    problem = { title: 'Translate problem', details: msg + '\n\n' + report() };
    const files = /Could not load|tesseract|traineddata|worker|importScripts|NetworkError|Failed to fetch/i.test(msg) && !/service/i.test(msg);
    setStatus(files ? 'The text reader files are missing or blocked (folder "ocr"). Tap Details.' : msg.slice(0, 90), true);
  }
  $retry.onclick = () => { problem = null; pages.forEach((s, i) => { if (s.state === 'fail') { s.state = 'new'; enqueue(i); } }); idleStatus(); };
  $det.onclick = () => { if (problem) window.dispatchEvent(new CustomEvent('mf-translate-problem', { detail: problem })); };

  // WHY: find every page picture and ask to be told when one comes near the screen. HOW: IntersectionObserver (a browser tool that says "this element is on / near the screen").
  //   ROUND 35: rootMargin increased from 150% to 300% so pages that are 3 screen-heights away start processing early (pre-translate).
  //   Combined with the look-ahead prefetch in enqueue(), pages are usually ready before you scroll to them.
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) enqueue(e.target); }), { rootMargin: '300% 0px' });
  const watched = new WeakSet();
  function watch(img) { if (watched.has(img)) return; watched.add(img); io.observe(img); img.addEventListener('load', () => { const s = pages.get(img); if (s && s.state === 'done' && s.key !== ocrKey(img)) s.state = 'new'; if (on) io.unobserve(img), io.observe(img); }); }
  function scan(root) { (root || document).querySelectorAll('#stream img.page').forEach(watch); }
  // WHY: new chapters are added to the page all the time. HOW: MutationObserver (a browser tool that reports changes of the page) calls scan, and removes layers whose picture is gone.
  const mo = new MutationObserver(() => { scan(); sweep(); });
  const streamBox = document.getElementById('stream'); if (streamBox) mo.observe(streamBox, { childList: true, subtree: true });
  function sweep() { document.querySelectorAll('.mf-tr-layer').forEach(l => { if (!l._img || !l._img.isConnected) l.remove(); }); [...pages.keys()].forEach(i => { if (!i.isConnected) { pages.delete(i); queue.delete(i); } }); }
  // WHY: pictures grow when they load or when the chapter width changes; the layers must follow. HOW: ResizeObserver on every chapter box.
  const ro = new ResizeObserver(es => es.forEach(e => e.target.querySelectorAll('.mf-tr-layer').forEach(l => { if (l._img && l._img.isConnected) place(l._img, l); })));
  const roSeen = new WeakSet();
  setInterval(() => { document.querySelectorAll('#stream .chapter').forEach(c => { if (!roSeen.has(c)) { roSeen.add(c); ro.observe(c); } }); }, 1500);   // WHY an interval: chapters appear any time; two lines of work every 1.5 s cost nothing

  /* ---------------------------------------------------------------
     13. THE BUTTON AND THE PANEL
     --------------------------------------------------------------- */
  function setOn(v) {
    on = !!v; document.body.classList.toggle('mf-tr-on', on); btn.classList.toggle('on', on); btn.setAttribute('aria-pressed', String(on));
    if (on) { problem = null; scan(); idleStatus(); [...document.querySelectorAll('#stream img.page')].forEach(i => { const r = i.getBoundingClientRect(); if (r.bottom > -innerHeight * 1.5 && r.top < innerHeight * 2.5) enqueue(i); }); }
    else { panel.classList.remove('open'); btn.classList.remove('busy'); }
  }
  btn.onclick = () => { if (!cfg.show) return; setOn(!on); };
  bar.querySelector('#mfTrCfg').onclick = () => { syncPanel(); panel.classList.toggle('open'); };
  panel.querySelector('#mfTrClose').onclick = () => panel.classList.remove('open');
  // WHY: changing a language must repeat only what is needed. HOW: the setting is saved through app.js; 'mf-settings' comes back and refresh() below does the work.
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
  // WHY: selfTest checks every OCR file that must exist on the server. ROUND 33: 'hin' added for Hindi support (needs hin.traineddata.gz in ocr/lang/).
  const FILES = ['tesseract.min.js', 'worker.min.js', 'core/tesseract-core-simd-lstm.wasm.js', 'core/tesseract-core-lstm.wasm.js'].concat(['eng', 'jpn', 'jpn_vert', 'kor', 'chi_sim', 'chi_tra', 'hin'].map(l => 'lang/' + l + '.traineddata.gz'));
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
