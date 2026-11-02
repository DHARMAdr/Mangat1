# MangaFlow Reader — the project blueprint (history + full specification, build round 35)

**What this file is.** The ONE combined project file of MangaFlow. It tells the whole story (every round, in order), the rules, and a full specification of every file, so that you (or Claude) can fix, improve or rebuild the site from it. Give it to Claude together with the code files and say what you want ("improve X", "fix site Y", "build it again from this file").

**How accurate is it? (read this once).** The last guide (round 27) was typed by hand and drifted away from the code: it listed files that were never delivered (`proxy-local.js`, `start-manga.bat`, `test/mock-sites.js`, `test/e2e-test.js`), described a ZIP download, a "Downloads" settings tab and page swiping that do not exist, and gave old element names, old key sizes and old settings. This version fixes that in three ways:

1. **The tables, lists and counts** (files, element tree, settings, functions, constants, tests, troubleshooter, CSS variables and blocks, comment coverage) are **generated from the real files** of build round 30 by a helper script that opens `index.html` in a browser, parses `app.js` and the other files and reads the last full test run. They are not typed from memory.
2. **The explanations around the tables** (why / how / how to improve) were written by hand and checked against the code while writing.
3. **`test/check-guide.js`** (delivered with the files; it needs only Node.js) looks up every file name, element id, function, constant, storage key and event written in `back-ticks` in this guide and fails when one is not in the files. Its result for this exact text is in section 18. It skips the history (section 12) and the "replaced" list (section 13) on purpose, and it cannot tell whether a sentence is *true*: that part is a human (or Claude) reading the code.

Section 12 (history) is a story. Entries for rounds 1–8 come from earlier chats and cannot be re-checked against code. Entries for rounds 9–27 were written when the work was done; when a later round changed something, the entry carries a **"Replaced later"** line. **If a history entry disagrees with sections 2–11, sections 2–11 are right.**

**Reading order for Claude:** 0 → 0b → 1 → 3 → 13 (what was replaced) → the round 32 entry in 12 → the file you must change (sections 2, then 5–9).

**How to keep it current.** When something changes: add a new round to section 12, change the specification in place, move anything that was replaced into section 13, run `node test/check-guide.js` and `node test/ui.test.js` (section 18.1), or ask Claude: "update MANGAFLOW.md for these changes".

## 0. Quick facts

| Thing | Value |
|---|---|
| Owner | GitHub user `DHARMAdr`; the site is served by GitHub Pages (repository `DHARMAdr/Mangaflow`, address `https://dharmadr.github.io/Mangaflow/`; the origin that the Workers allow is `https://dharmadr.github.io`) |
| Proxy Worker (built in) | `https://mangaflow-proxy.dharmaraj-p2013.workers.dev` (`BUILTIN_PROXY` in `app.js`; code in `worker.js`) |
| Accounts Worker (built in) | `https://mangaflow-accounts.dharmaraj-p2013.workers.dev` (`ACCOUNTS_URL` in `profiles.js`; code in `accounts-worker.js`, answers `version: 4`) |
| Google Programmable Search ID | `c0d44f55eddb847e4` (`settings.googleCx`; also in the Google verification file `googledb6fd0cf04d837f7.html`) |
| Build | round 32 (error reports start with "MangaFlow error report (build round 32)") |
| Size | 22 files in section 2 (+`translate.js`, +`ocr/` folder, +`test/translate.test.js`); `app.js` = 6793 lines; all code files together = 13800+ lines |
| Tests | 133 browser checks (ui) + 43 translate checks = 176 total; last runs: "133/133 checks passed" and "43/43 translate tests passed" |
| Settings | 33 keys (section 7.3); the settings window has 8 tabs (Translate added in round 32) |
| Troubleshooter | 37 symptoms, 12 ready prompts for Claude, 14 repair buttons (section 11; 4 translate symptoms added in round 32) |


---

## 0b. What you (the owner) must do for the Translate add-on (round 32)

The translate add-on is an **optional** file (`translate.js`). Remove its `<script>` line from `index.html` and the whole feature disappears — nothing else breaks. If you want to keep it, read this section once.

### What you must upload

The OCR (text-reading) engine runs **in your own browser** using WebAssembly. It does not call any server. The files are big (~20 MB) and must live in a folder called `ocr/` next to `index.html`:

```
ocr/
  tesseract.min.js          (the main Tesseract script)
  worker.min.js             (the background worker)
  core/
    tesseract-core-lstm.wasm.js          (the normal engine)
    tesseract-core-simd-lstm.wasm.js     (the faster engine, used automatically when the browser supports it)
  lang/
    eng.traineddata.gz      (English)
    jpn.traineddata.gz      (Japanese horizontal)
    jpn_vert.traineddata.gz (Japanese vertical)
    kor.traineddata.gz      (Korean)
    chi_sim.traineddata.gz  (Chinese, simplified)
    chi_tra.traineddata.gz  (Chinese, traditional)
```

All these files are in the `ocr/` folder of the zip. Upload the entire folder to GitHub as-is (push it the same way you push `index.html`). GitHub Pages will serve them automatically.

### The Content-Security-Policy change

The text-reader (WebAssembly) needs an extra permission. `index.html` already has it (`'wasm-unsafe-eval'` in the `<meta>` tag), and `_headers` has it too. You do not need to change anything yourself — just upload the new versions of both files.

### How to test it after uploading

1. Open the site and wait for the cache to clear (or clear it yourself: on a phone, Settings → Site data → clear MangaFlow).
2. Open Settings → Translate → tap **Test translate**. The tool checks all 10 reader files one by one. Each should get a ✓. If any gets ✗ it means that file is missing from `ocr/`.
3. Open any manga chapter and tap the **文A** button on the left edge of the screen (middle height). The button turns blue and a small bar appears at the bottom. After a few seconds translated boxes appear on top of the pictures.

### How to add a new language

The languages in the Translate settings come from `OCR_LANGS` (the list at the top of `translate.js`) and `LANG_TO` (the 30 target languages). To add a new **page language** (for reading manga written in that language):

1. Download the trained data file for it from [tesseract-ocr/tessdata_fast on GitHub](https://github.com/tesseract-ocr/tessdata_fast) — look for `<langcode>.traineddata`.
2. Compress it with gzip: `gzip <langcode>.traineddata` → produces `<langcode>.traineddata.gz`.
3. Put it in `ocr/lang/` and upload.
4. In `translate.js`, find `const OCR_LANGS = {` and add a line:
   ```js
   mycode: { name: 'My Language', passes: ['mycode'], tr: 'xx', min: 50 },
   ```
   where `mycode` is the Tesseract code, `name` is shown in Settings, `tr` is the Google Translate language code, and `min` is the minimum OCR confidence (50 is safe).

To add a new **target language** (what the translation comes out in), add a `['xx', 'Language name']` entry to `LANG_TO` in `translate.js`. No extra files needed — Google Translate already handles hundreds of languages.

### Honest limits of the translate add-on

| Limit | Details |
|---|---|
| OCR accuracy | The text reader works well on clean, high-resolution scans with clear fonts. Hand-lettered manga, stylised fonts or low-resolution scans give worse results. There is no fix for this. |
| Translation accuracy | The built-in translation services (Google gtx, MyMemory, Chrome Translator) give rough translations. They are not as good as a human translator. The Chrome Translator only works in Chrome (it is skipped in other browsers). |
| First page is slower | The text reader loads its engine on the first page (~1-3 seconds extra). Later pages are faster. |
| No offline translation | The translation step needs the internet (it calls a translation service). The OCR step works offline. |
| Large files | The `ocr/` folder is ~20 MB. On the first visit the browser downloads all of it. After that it is cached. On a slow connection the first visit will be slow. |
| Phone memory | Very tall pages (webtoon strips) are read in slices. On phones with less than 2 GB RAM the WebAssembly engine may be killed by the browser. |
| GitHub Pages and .gz files | GitHub Pages serves `.gz` files with `Content-Encoding: gzip` automatically when the file has a `.gz` extension — this is what the reader expects. If you host elsewhere, check this. |


---

## 1. What the project is

A manga reading website made with only **HTML, CSS and JavaScript**: no framework, no build step, no database of its own. You paste the address of a manga series or of one chapter. MangaFlow opens it inside a small built-in browser. **Reading mode** then turns every chapter into one endless scroll (chapters load by themselves, up and down). **Download** builds a PDF of the chapters you choose. The same page also works as a small web browser and search box (Google through the owner's own Programmable Search, plus free search engines as fall-back).

**How it works in one picture**

```text
 your browser (phone or PC)                    the internet
 ┌──────────────────────────┐   page address   ┌────────────────────────┐
 │ index.html + app.js ...  │ ───────────────► │ CORS proxy             │ ──► manga site
 │ (GitHub Pages, static)   │ ◄─────────────── │ own Cloudflare Worker  │ ◄── (HTML, pictures)
 └──────────────────────────┘   page text      │ (+ free proxies)       │
        │  optional                             └────────────────────────┘
        ▼
 ┌──────────────────────────┐
 │ accounts Worker + D1     │  profiles, history, bookmarks, bug reports (optional)
 └──────────────────────────┘
```

**Why a proxy at all?** A browser page may not read other websites directly (the CORS rule). The proxy fetches the page for the app and adds the permission header. Your own Worker (`worker.js`) is the reliable route; free public proxies are slow and often blocked, so they are only a back-up. The proxy list is in Settings > Proxies; the owner's Worker is added to everybody's list (`BUILTIN_PROXY`).

**Where it runs.** On GitHub Pages (or any static host) with the files of section 2 in one flat folder. There is no local launcher in the file set any more: `start-manga.bat` and `proxy-local.js` (an optional Windows helper from round 4) are **not part of the delivered files**. The app still adds a local proxy at `<this address>/proxy?url={url}` when the page itself is served from `localhost`; the test server (`test/server.js`) provides exactly that.

**What MangaFlow deliberately does NOT do**

* It never runs the scripts of other websites (pages are shown in a sandboxed frame without scripts).
* It never bypasses bot checks, captchas, logins, paywalls or a site's own protection. When a site blocks it, it says so plainly and offers honest options. A page that the site seals on purpose (the theme marker `InitMangaEncryptedChapter`) is shown as far as the page itself gives it and the person is told where the rest can be read.
* It has no server of its own except the two optional Workers. Everything you read is kept in your browser (`localStorage`), unless you sign in to a profile.

**Who it is for.** A beginner developer (GitHub user `DHARMAdr`) who wants a personal manga reader that works on PC **and** phone, and who wants every code file explained in basic English (why / how / how to improve).

---

## 2. The files (the real inventory of build round 32)

| File | Lines | Size | What it is | Needed? |
|---|---:|---:|---|---|
| `index.html` | 609 | 46 KB | The page: structure, every element id, the Content-Security-Policy meta tag, the order of the script files | REQUIRED |
| `style.css` | 1322 | 110 KB | All visuals: themes (white / black), keys, dock, reading column, settings window, digital start page, one block per round | REQUIRED |
| `boot.js` | 73 | 6 KB | Tiny script in the page head (round 29): sets the saved theme before the first paint and shows the "reopening" cover so the start page never flashes | optional (without it the flash returns) |
| `app.js` | 6793 | 568 KB | All behaviour: mini browser, search, reading mode, chapter + picture detection, downloads, settings, error reports, troubleshooter | REQUIRED |
| `pdfmaker.js` | 557 | 42 KB | Own tiny PDF writer (`MangaPDF`): copies JPEG bytes untouched, one tall page per chapter, chapter bookmarks | REQUIRED (loaded before app.js) |
| `troubleshoot-data.js` | 151 | 22 KB | Text data for Settings > Troubleshoot (`window.MF_FIX`: symptoms + prompts for Claude) | optional (the tab has short built-in texts without it) |
| `chapter-slider.js` | 133 | 11 KB | Add-on: vertical chapter slider (drag down = next chapter, up = previous) | optional |
| `reload-wheel.js` | 145 | 12 KB | Add-on: ship's-wheel dial (right = reload this chapter, left = reload all) | optional |
| `edge-slider.js` | 128 | 11 KB | Add-on: Top / End slider (replaces the Top and End keys) | optional |
| `profiles.js` | 583 | 60 KB | Add-on: profiles (name + 6-digit code), per-profile history + bookmarks, bug reports, admin view, sync with the accounts Worker | optional |
| `worker.js` | 233 | 18 KB | Cloudflare Worker: the CORS proxy (`BUILTIN_PROXY`). Not a website file: paste it into the Worker editor | needed for reliable reading |
| `accounts-worker.js` | 264 | 22 KB | Cloudflare Worker + D1 database: cloud profiles, history, bookmarks, bug reports. Not a website file: paste it into the Worker editor | optional (version 4) |
| `_headers` | 18 | 2 KB | Real HTTP security headers for Netlify / Cloudflare Pages (GitHub Pages ignores this file) | optional |
| `googledb6fd0cf04d837f7.html` | 1 | 0 KB | Google Search Console ownership file (one line of text; keep it next to index.html) | optional |
| `MANGAFLOW.md` | - | - | This file | optional |
| `test/server.js` | 165 | 23 KB | Test only: a tiny web server that serves the project files and pretends to be the proxy and the manga / search sites (mock sites) | test only |
| `test/ui.test.js` | 848 | 101 KB | Test only: Playwright browser tests (133 checks) | test only |
| `test/page.jpg` | - | 96 KB | Test only: the picture the mock sites serve | test only |
| `translate.js` | ~410 | 38 KB | Add-on: Translate (round 32) — reads the words in every picture with the built-in text reader (Tesseract OCR, WebAssembly) and shows the translated words on top of the picture, like Google Lens | optional |
| `ocr/` folder | — | ~20 MB | Tesseract.js 5.1.1 files (`ocr/tesseract.min.js`, `ocr/worker.min.js`, `ocr/core/`, `ocr/lang/`) needed by `translate.js`. Must be uploaded to GitHub alongside `index.html` | required when `translate.js` is used |
| `test/translate.test.js` | ~310 | 35 KB | Test only: 43 Playwright checks for the translate add-on | test only |
| `test/check-guide.js` | 288 | 22 KB | Guide check: confirms that every file, element id, function, constant, storage key and event written in this guide exists in the files (needs only Node.js) | for you and Claude; not part of the website |

**Upload to GitHub Pages (one flat folder, no sub-folders needed):** `index.html`, `style.css`, `boot.js` (new in round 29), `app.js`, `pdfmaker.js`, `troubleshoot-data.js`, `chapter-slider.js`, `reload-wheel.js`, `edge-slider.js`, `profiles.js`, and (if you like) `_headers` and `googledb6fd0cf04d837f7.html`. **Round 32 new:** `translate.js` and the whole `ocr/` folder (about 20 MB; keep the sub-folder structure: `ocr/tesseract.min.js`, `ocr/worker.min.js`, `ocr/core/`, `ocr/lang/`). The two Worker files (`worker.js`, `accounts-worker.js`) are **not** uploaded to GitHub: they are pasted into the Cloudflare Worker editor (section 9). `MANGAFLOW.md` and the `test/` folder are for you and for Claude; the website does not need them.

**Load order in `index.html`:** `boot.js` first, in the `<head>` right after `style.css` (round 29: it must run before the page is painted); then the plain `<script src>` tags at the end of `<body>`, same folder, exact file names: `pdfmaker.js`, `troubleshoot-data.js`, `app.js`, then the add-ons `chapter-slider.js`, `reload-wheel.js`, `edge-slider.js`, `translate.js` (round 32), `profiles.js`. `app.js` does not need the add-ons; each add-on checks `window.MangaFlow...` and builds itself only once. Remove an add-on file **and** its `<script>` line and nothing else changes.

**Names that other files depend on:** `window.MangaPDFLib` (pdfmaker.js; app.js builds PDFs with `new MangaPDFLib.MangaPDF(...)`), `window.MF_FIX` (troubleshoot-data.js), `window.MangaFlowSlider`, `window.MangaFlowWheel`, `window.MangaFlowEdge`, `window.MangaFlowProfiles`, `window.MangaFlowTranslate` (add-ons; app.js looks them up by these names). The events between the files are in section 8.

**Files that are NOT in the file set (do not look for them, do not list them as parts of the site):** `proxy-local.js` and `start-manga.bat` (optional Windows helper, round 4; removed from the delivered set), `test/mock-sites.js`, `test/e2e-test.js`, `test/fake-d1-server.mjs`, `test/img/` (the old round 14-17 test suite). The tests that exist now are `test/server.js` + `test/ui.test.js` + `test/page.jpg` + `test/translate.test.js` (section 10).

---

## 3. Rules of this project

1. **Pure HTML / CSS / JS.** No build step, no npm packages in the website. (The tests use Playwright; they are not part of the site.)
2. **Every code file is commented in basic English for beginners**: WHY it exists, HOW it works, how to IMPROVE it. New code gets the same, above the code it explains. Section 15.4 says how to read and use these comments.
3. **One combined project file** (this one). Add a round, never start a second guide, and run `node test/check-guide.js` after you change it (section 18).
4. **Never bypass protection.** No captcha, Cloudflare or login bypass (since round 29 a check that a person can pass gets a message and a way to do it on the site: section 4.13). A chapter that the site seals on purpose (`InitMangaEncryptedChapter` in the page) is not decrypted and not guessed around: MangaFlow shows what the page plainly gives and says where to read the rest.
5. **Safe by default.** Scripts of other sites never run; only `http(s)` addresses open; outside text is written with `textContent`, never as HTML.
6. **Nothing fails silently.** Every problem ends in the big error pop-up with a copyable report (`showError`), or in a clear note where a pop-up would be wrong (for example the yellow "Only 1 of 7 pictures …" note under a chapter).
7. **Works on PC and phone.** Touch targets of at least 40 px, safe-area padding, 16 px text boxes (no iOS zoom), reduced-motion support, keyboard shortcuts on PC.
8. **Be honest** about what was tested (mock sites in a headless browser) and what was not (live sites, the real Google, the real Workers, real phones).
9. **Keep what works.** New features go in their own block (a "ROUND n" block in `style.css`, an add-on file, a new section) so older rules are not moved by accident. Run the whole test suite before delivering. A bug gets a **failing test first**, then the fix (rounds 27 and 28 did this).
10. **Deliver every file as its own file AND as one zip** (owner request, round 28). Website files go in the GitHub repo root.

### 3.1 Pitfalls — read before editing

* **Never** call `preventDefault` in `touchstart` / `pointerdown` on a button that must also react to `click` (that broke the clear ✕ button).
* **Never** decide full screen from the window size (false positives); use the Fullscreen API element and `display-mode: fullscreen`.
* Section 18 of `app.js` (Google, full screen, Top / End jumps, "remember my page") must stay **before** the start-up code: it uses `const`s, so order matters.
* Every `await` inside `navigate()` needs a `stale()` check (else an old search can replace a new one); every `await` inside `fillChapter()` needs the `gen !== R.gen` check (else a chapter from before a jump lands in the new reading session).
* Keep `#fsRead`, the wheel `#mfWheel` and the download pill `#dock` on the same `--col-top` so they slide together.
* Never skip the admin when saving history; never show the accounts Server tab to non-admins.
* A failed download must say so: never save a PDF made only of placeholder pages.
* Google's own pop-up is never shown (CSS hides `.gsc-overlay-wrapper` and friends); results are drawn in `#gvBox` or in MangaFlow's own list.
* **Tests:** a full run takes about 1.5 minutes, longer than a tool call may last: start it in the background (`(nohup node test/ui.test.js > run.log 2>&1 &)`) and read the log. **Do not edit `app.js`, `index.html` or `style.css` while a run is going** (the tests load them live). The mock server's `/__log` keeps every request of the whole run, so a test must look only at the part written after it started (`slice`).

---

## 4. How it works (the flows, in the order a person meets them)

Every function named here exists in `app.js` (section 7.2 lists them by section). Each flow ends with **WHY** it is built this way and how it could be **improved**.

### 4.1 Opening an address or a search (the mini browser) — §3, §4, §7

1. `normalizeInput(text)` decides what was typed: `any.com`, `any.com:8080/path`, `any.com?x=1` open that site (https is added); anything else is a **search** (the word "manga" is added unless the switch `#scopeSwitch` says *Everything*).
2. `navigate(url, push, opts)` is the one door for every page. A search goes through the engine loop (4.6); an address goes through `fetchDoc` → `fetchHTML` (all proxies are asked **at the same time**, the first good answer wins: `askProxy` + `Promise.any`; free proxies time out after 10 s, your own after 15 s; pages are cached, 40 at most). `gate(key, max, gap)` keeps requests to one site polite (a few at a time, small gaps); `coolDown` pauses a site for up to 20 s after HTTP 429 / 503.
3. `renderFrame` puts the cleaned page into `#frame`, an `<iframe>` with `sandbox="allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"` and **no scripts**. `neutralizeLinks` gives every link our own address (`appLink`: `?url=<address>` or `?q=<words>`), so Ctrl+click, middle click and "open in new tab" open **MangaFlow**, not the original site. `onFrameClick` (links) and `onFrameSubmit` (GET and POST forms, POST goes through `fetchDoc(url, {post})`) keep everything inside the app.
4. Pages that need scripts to look right are repaired without running them (`repairStyles`, `packCss`, `MF_NOJS_CSS`, section 7b): style sheets that the browser could not load are fetched through the proxy and inlined; fonts go through the proxy too. Pages built entirely by JavaScript stay mostly empty and a notice (`#pageNote`) says so honestly.
5. `navSeq` / `stale()`: every `await` in `navigate()` checks whether a newer navigation started, so a slow old search can never overwrite a new one.

**WHY** a sandboxed frame without scripts: it is the only safe way to show a stranger's page. **IMPROVE:** a per-site rules table; a headless-browser proxy for script-built sites.

### 4.2 From a page to reading mode — §7, §8, §8b, §9

1. `tryAutoRead` (after a page loaded) and `readFrom` (a click on a chapter) decide "is this a manga?" with `looksLikeChapter` (a page of pictures) or by counting chapter links of this manga; then `startReading({quiet:true})` runs. Setting `autoRead` = a pasted manga link opens straight in reading mode.
2. `startReading` calls `analyze(page)`, which returns the chapter list and which chapter is "now". Order of discovery: 4.3.
3. The reading state is `R = { gen, title, chapters[], first, next, cur, loading, paused, seriesUrl, batchP }`. A chapter is `{ url, title, num, guess?, dead? }` (`guess` = invented from the address number, `dead` = a guessed chapter that does not exist). `first` = lowest chapter index on the screen, `next` = next index to load, `cur` = chapter in view, `gen` = a counter that makes results of loads started before a jump harmless.
4. `loadNext` makes `BATCH = 10` chapter boxes at once (`makeSection`) and fills them in parallel (`fillChapter`); an `IntersectionObserver` on `#sentinel` loads the next batch when you get close (`cur >= next - 2`). Scrolling **up** near the top (or the ▲ button, Up / PageUp / Home at the very top, wheel-up, finger-drag) calls `loadPrev`, which inserts `BATCH_PREV = 5` earlier chapters **above** and corrects the scroll so the picture on screen does not jump (the browser's scroll anchoring, with a manual fallback for old Safari: `ANCHOR_OK`).
5. Every chapter you scroll into is saved by `rememberChapter` (history row for "Continue reading" and `#r=<chapter link>` in the address bar). After a refresh `resumeFromHash` reopens that chapter in reading mode; if it cannot be loaded, the start page stays and the broken `#r=` is removed.
6. `onScroll` hides the title bar and the floating buttons while you scroll down (more than 14 px) and shows them on scroll up; `updateCurrent` works out the chapter in view and the progress line; `markInput` / `holdUiFor` ignore scrolling that was not caused by a person.

### 4.3 Finding the chapter list — §8, §8b (changed in round 28)

In this order, the first step that gives a real list wins; every step validates (`belongsToPage`, at least 2 chapters of THIS manga) so a sidebar of other manga is never taken as the list:

1. chapter links on the page itself (`detectChapters`; `pickSeries` / `seriesKey` keep only this manga);
2. a list the site fills in by script, asked directly (`ajaxChapterList`, Madara theme `ajax/chapters/`);
3. a dropdown or loose boxes (`detectChaptersLoose`; since round 28 a link such as `Previous sentence` is not an address: `isWordHref`);
4. for a chapter page: `loadSeriesList` = the series page by a shorter address (`findParentLink`), by a link found by name or words or JSON-LD (`findSeriesLink`), by typical addresses `/comics/NAME/`, `/manga/NAME/`, `/series/NAME/` (`guessSeriesUrls`, at most 6 guesses / 25 s; a page counts only with at least 2 chapters of this manga);
5. **round 28 — lists split into pages.** Many themes show 24 chapters per page (`…/chapter/page/2/`). `pagerLinks` finds the page-number links under the series folder (`PAGER_RE`), `morePages` downloads the other pages **3 at a time** (at most 40 pages and about 40 seconds), keeps only chapters of this manga, joins them without repeats and sorts them. Pages that could not be loaded are reported ("N list pages could not be read") instead of hiding them. A chapter page that yielded fewer than 4 chapters also triggers `loadSeriesList`, and `analyze` takes the longer list.
6. last resort `synthesizeChapters`: chapters 1..N from the number in the address; a guessed chapter that does not exist disappears again (`dead`).

Previous / next chapter addresses are read from the page's own scripts (`prevUrl`, `nextUrl` inside e.g. `ts_reader.run(...)`) and links by `findNavLinks`; a placeholder (`#`) or plain words with spaces (`Previous sentence`, `Next sentence`: the "read aloud" buttons of some themes) are never accepted as addresses.

**WHY** so many steps: sites differ; each step was added after a real report. **IMPROVE:** remember the working step and the page template per site so the next visit asks for the right page directly; follow `rel="next"`.

### 4.4 Finding the pictures of a chapter — §8 (rewritten in round 28)

`scanPictures(doc, base)` is the ONE place that answers "which pictures does this page show?" and returns `{ list, holders, box, how }`: `list` = addresses found, `holders` = picture slots that exist but have **no address** (lazy placeholders), `box` = the reading box that was used, `how` = a short text for the report.

1. **The reading box first** (`READER_BOX`: `.reading-content`, `.reader`, `#chapter-content`, `.image-based` …). `readerSlots` collects its pictures with four safety rules: a side block (`SIDE_BOX`: aside, nav, recommended, related, comments …) counts only when it sits **inside** the reading box; a grid of 4 or more pictures that are links to different pages (60 % distinct) is a list of covers, not pages; an empty slot that is inside a link is not a page slot; an empty slot whose parent also holds a `<noscript>` is not counted (the real picture is written again there).
2. `generalPictures` — the older rules (the container with the most pictures; the "list of manga" rule lives only here, so a chapter that has one real picture plus a block of recommended covers is no longer thrown away).
3. **Addresses** (`imgAddressInfo`): the known lazy attributes (`data-src`, `data-lazy-src`, `data-original`, `data-url`, `data-lazy`, `src`), then **any other attribute whose value looks like a picture address**, also when `src` is a placeholder, then `srcset`. `looksLikeImgUrl` decides "looks like"; `BAD_IMG` refuses logos, banners, icons, avatars, tiny sizes. **Slots without address** (`isHolder`): size at least 300 px (on the tag or in an inline `data:image/svg+xml`), or alt text "Image N / Page N", or lazy + empty.
4. **Completing the chapter** — `chapterPictures(doc, base, ref)` (used by reading mode **and** by the PDF download) returns `{ list, total, partial, sealed, how, scan }`. If slots are still missing it asks, in this order, and keeps the first answer that fills them: the page text (`pageTextPictures`: addresses in the same folder as the first picture, in scripts, hidden blocks, `<noscript>`), the page's scripts (`fromScripts`), then **numbering** (`inferNumbered`: `1.webp` → `2.webp` … `N.webp`; picture 2 and the LAST picture are asked for first, only when both exist is the whole list trusted; never more pictures than there are slots; `existsRun` finds how far a run goes). One odd empty slot among 5 or more real pictures is ignored.
5. **Sealed pages.** When the page carries the theme's own marker `InitMangaEncryptedChapter` (`sealedPage`), step "numbering" is **not** used: that is the site hiding its pictures on purpose. The reader shows the pictures the page plainly gives and `partialNote` adds a yellow note: "Only 1 of 7 pictures of Chapter 1 could be found …" with **Retry**, **Open on the site** (the chapter's own page in a new tab) and **Details** (the report).
6. Nothing at all in the page: `probeNumbered` (round 10: the og:image picture is page 1 and the others sit next to it with the next numbers; max 300, 6 at a time).
7. **Showing the pictures** (`makeImg`): direct → your own proxy with `&ref=<chapter address>` (hotlink protection) → `images.weserv.nl` → a visible "Page N could not be loaded" box with **Retry** and **Details**.

**WHY** this order: the reading box is the most precise place; numbering is a guess, so it is only trusted after two real answers and never against a site that seals its pictures. **IMPROVE:** remember per site which step worked; show "page 3 missing" boxes in the right place instead of one note.

### 4.5 "No pictures found" and "LOCKED" — §8b, §5

`noImagesError` builds the message. A page is called **LOCKED or REMOVED** only when `LOCK_RE` (log in to read, unlock this chapter, coins required, members only, premium, "has been removed" …) matches the **main text** of the page: `mainText` first cuts away headers, navigation, footers, side blocks, menus, comment boxes and "recommended" blocks, so a menu entry such as "Unlock Center" or a comment line such as "This comment has been removed" no longer makes a chapter look locked (round 28). The error carries `diagnose(doc, base)`: title, number of `<img>` and `<script>`, reading box and how it was found, pictures with an address / empty placeholders, pictures whose address sits in an unusual attribute, the sealed-chapter marker, chapter-list pages linked from the page, lock words (on the main text), previous / next links, `/api/` hints, bot-check words, the first 300 characters of text. **Copy report** is how a new kind of site gets fixed.

### 4.6 Search — §4b, §4c, §18

* **What starts the in-app Google search (round 28b).** Four things, all through `navigate()` with `opts.engine = 'google'`: the engine drop-down set to Google (`#engineSel`, setting `searchEngine`, default `google`) with words typed; the **Google** button (`#googleBtn`) whenever the box holds words; a pasted `https://www.google.com/search?q=…` address; and the **Google** chip under a results list. **With** an API key (`settings.googleKey`, empty by default, `gKeyOn()`) the words go to Google's JSON API and MangaFlow draws the list itself (`googleApi`; when Google answers that the project has no access, `googleApiDead` switches to the key-less way). **Without** a key (the normal case) `googleSearch` loads Google's search element (`loadCse`, explicit render, tag `searchresults-only`: no box and no pop-up) into the panel `#gview` / `#gvBox`, `runCse` starts the search and `hasGoogleResults` tells **real** results (a title link `a.gs-title[href]`) from Google's "No Results" note (which uses the same CSS classes as a result: found in round 28). A click on a result is intercepted and opened **inside** MangaFlow. The only time the Google button leaves the site is an **empty** box (no words to search): it then opens google.com in a new tab. Before round 28b the pasted address and the chip stayed inside the app only when an API key existed, so for everybody without a key they opened a new tab (section 12, round 28b).
* If Google's script does not load within 10 seconds or is blocked, or no real result is drawn within 9 seconds (or only the "No Results" note), the panel closes and the free engines answer (`ENGINE_ORDER`: Bing, Mojeek, Yahoo, DuckDuckGo, Brave; `searchProblem` recognises CAPTCHA / "anomaly" pages and moves on; MangaFlow never solves a CAPTCHA). `parseResults` reads each engine's page with a rule per host (`RESULT_RULES`) plus a fall-back; `unwrap` turns Bing, Yahoo, DuckDuckGo and Google redirect links into the real address; `resultsPage` draws MangaFlow's own clean result cards (phone first, light / dark like the app). Round 28 adds a yellow note on that page saying **why** Google had nothing (`googleNote` / `GOOGLE_NOTE`).
* **Google since 20 January 2026 (verified on Google's own pages, see appendix B):** a *new* Programmable Search engine can only search the **sites listed** in its control panel ("Sites to search", at most 50 sites), not the whole web; engines made earlier may keep "Search the entire web" until 1 January 2027. So a title that is not on one of the listed sites gives "No Results" whatever MangaFlow does. **Settings > Search & extras > "Copy my sites for Google"** (`mySitesForGoogle`) copies the sites you have opened as lines `host/*` (up to 50, search engines and this app left out) to paste into the control panel. "Test Google search" (`googleDiag`) checks the ID, the script, a test search and every blocked host and copies the result.
* **A search-engine address that cannot be loaded (round 28c).** If you tap a chip such as *Yahoo* (or follow an engine link, or press Back to one) and that engine refuses every proxy, `navigate()` does not show the red pop-up: it shows MangaFlow's own results page for the same words with the chips of all engines and the reason under *Details*, so you can pick another engine. Only when there is no proxy at all, or the address is not a search (or is the "Show the original page" link), the old pop-up with the Settings hint stays.
* Setting `engineStrict` ("Only use the search engine I chose", Settings > Search & extras): when a **free** engine (Bing, Mojeek, Yahoo, DuckDuckGo, Brave) is chosen and fails, the other free engines are **not** tried. It does not stop Google from handing over to the free engines when Google has nothing (that hand-over is what the yellow note explains). The engine you chose is never changed by a fall-back: the drop-down keeps showing your choice.

### 4.7 Downloading a PDF — §12, §12b, §12c

1. `#rangeDlg` ("Download chapters as PDF"): chapter range (`#rgFrom`, `#rgTo`), **split** (`#rgSplit`: one file, or a new file every 25 / 50 / 100 chapters), **quality** (`#rgMode`: `PDF_PROFILES` original / balanced / small / tiny) and an **estimated size** (`measureAll` downloads up to 4 sample pages once, encodes them in all four qualities, `estimate` multiplies; orange above 300 MB, red above 700 MB; above 400 MB it suggests a split).
2. `queueDownload` → `runQueue` → `runJob` → `buildPart`. A job works from a **snapshot** (addresses, labels), so you can keep reading. `chapterImages` gets each chapter's pictures with `chapterPictures` (so a partly-hidden chapter is reported in the job diary, `jlog`); `fetchBytes` downloads a picture over the best route (route health `routeStats` / `routeBreaker`, `gate`, 20 s per try, 70 s limit per picture, pictures at once per site `hostLimit` 6 → at least 2, self-tuning); failures are retried after 4 s / 12 s; 2 dead chapters in a row stop the job (`fatal`); a PDF with no pictures is never saved. A watchdog opens a pop-up when nothing moves for 90 s; `jobReport` is the copyable report.
3. `pdfmaker.js` writes the PDF itself: JPEG bytes are copied untouched, simple PNG copied, anything else decoded on a canvas in strips of `SLICE = 2000` px; **one tall page per chapter** (`strip`), each chapter a PDF **bookmark**. WebP pages must be converted (a PDF cannot hold WebP). The whole file is built in browser memory: very large ranges can run out of memory on a phone (use "a new file every 25 / 50 chapters").
4. The floating dock `#dock` shows progress (a filling ring, count, size so far); minimised it is a small ⬇ pill; green = PDF ready, red = failed.

### 4.8 Profiles, history and sync — `profiles.js` + `accounts-worker.js`

`app.js` only fires events (`mf-activity`, `mf-store`, `mf-bug`, section 8). With no `profiles.js` nothing is tracked. A signed-in profile keeps its four personal lists (`recent`, `books`, `reads`, `progress`) under `mf_u:<name>:<list>` so profiles never see each other's lists; after a sign-in or sign-out the page reloads once so `app.js` starts with the right lists. `profiles.js` copies the lists to the accounts Worker (bookmarks 3 s after a change, history after 8 s, on hide and on sign-out), pulls them after sign-in and **merges** them (union, newer wins), keeps guest reading (`mf_guest_acts`, max 200) and adopts it at sign-in, and records every sync result (`mf_sync`) so Settings > Profile can show "saved 2 min ago" or the exact error. The admin uses the same code path as everybody else. Details of the server: section 9.2.

### 4.9 The error and troubleshooting path — §5, §17

`showError(message, {title, hint, details})` is the single place every problem goes through: a big `<dialog id="errbox">` with a friendly title (`explain` turns technical words into a title + hint), the copyable report in `#errText`, **Copy report** (`#errCopy`), **Troubleshoot** (`#errFix`, opens Settings > Troubleshoot) and, for signed-in people, **Send to admin**. A report starts with "MangaFlow error report (build round 28)". Settings > Troubleshoot (`#fixBox`) has **Fix automatically** (`autoFix`: the safe repairs in order), **Run checks** (`selfCheck`), **Symptoms & answers** (`#fixDlg`: section 11), **Copy full report** (`diagnostic`), **Send report to server** and **Reset settings**. Watchers (`watch`, `noteFail`, `addNoNextButton` / `showNoNext`) open a report when a chapter takes more than 75 s, a page opens in more than 60 s, three pictures of one chapter fail, or there is no next chapter.

### 4.10 Opening again without a flash — `boot.js`, `endResume`, `resumeFromHash` (round 29a)

**Why.** `#start` (the start page) is ordinary HTML, so a browser paints it the moment it has read `index.html`. `app.js` is big; only when it has run does `resumeFromHash` know that you were in a chapter, on a website or on a search, and switch screens. In between you saw the wrong screen.

**How.** (1) `boot.js` sits in the `<head>` and runs before anything is painted. It reads the address: a saved place (`#r=` chapter, `#p=` page, `#q=` search, or `?url=` / `?q=`) puts the class `mf-resuming` on `<html>`. (2) The CSS shows the cover `#resume` ("Reopening where you were…") over everything while that class is there. (3) `rememberChapter` / `rememberView` keep writing the place into the address while you read or browse. (4) `endResume()` removes the class when the page or the reader is really visible (`startReading` calls it right after reading mode is switched on, not after the whole batch has loaded) or when the load failed, so the start page can show. (5) A 30-second timer in `boot.js` removes it in any case. `boot.js` also puts the saved light / dark theme and the accent colour on the page before the first paint, so a dark page does not flash white.

**Improve.** Keep the scroll position in the address too (a chapter is restored, the place inside it is not always); use a service worker so the files are on the phone and the cover is almost never seen.

### 4.11 Full screen on a phone and on a computer — `syncFs`, `SMALL_SCREEN` (round 29c)

`syncFs` runs whenever the browser enters or leaves full screen. It sets `body.fs` for every full screen and `body.fs-small` when `SMALL_SCREEN` (the media query for phones and small tablets, read through `isSmallScreen()`) is true. **Phone / small tablet:** the CSS hides the bars (`#readerBar`, the navbar), the helper keys, the chapter slider, the wheel, the edge slider, `#side`, `#dock` and `#fabRead`; only the exit icon stays (`#fsRead` in reading mode, `#fsExit` on a website page). **Computer:** only `body.fs` is set and nothing is hidden. Leaving full screen removes both classes and every button returns. **Improve:** let the person choose "hide buttons in full screen" per device in Settings.

### 4.12 The keeper — next chapters ready, failed items retried in the background (round 29d)

Section 9b of `app.js`. One timer (`keeperOn`, every 1.5 s) calls `keeperTick`:

1. **Failed chapter boxes** (`sec.dataset.failed`): one at a time, nearest to the chapter you read first, each after its own waiting time (`healBase()` × 2ⁿ with ±15 % random spread, at most 90 s). A box that waits for the human check (`sec.dataset.verify`) is skipped on purpose.
2. **Failed pictures** (`img._failed`): up to 3 at a time, `img._reload()` after the same kind of waiting time; pictures stalled for more than 45 s are restarted.
3. **Preload:** pictures of the current chapter and of the next `keeperAhead()` chapters (setting `preloadAhead`, default 9) are switched from lazy to eager, at most 4 loading at once (3 on a narrow screen). Data saver (`saveData`) lowers the number to 1, a device with little memory (`deviceMemory` 2 or less) to 3.
4. `keeperPoke()` runs a tick at once when the browser says it is online again or the tab becomes visible.

The base wait is 4 s (hidden setting `healBaseMs`; the tests use 300 ms). **Honest limit:** the keeper costs data and memory (nine chapters of pictures); `#setAhead` switches it Off or to 3 / 5. **Improve:** stop the keeper while the phone is on battery saver; learn which picture host is slow and wait longer for it.

### 4.13 The "verify you are human" check — `HUMAN_RE`, `humanCheckBox`, `verifyNote` (round 29e)

**What a check is.** A site behind Cloudflare sometimes answers with a page ("Just a moment…", "Verify you are human") that only a person can pass. MangaFlow never solves or skips it (rule 4, section 3).

**How it is recognised.** `askProxy` reads the answer body for the codes 403, 429 and 503 (and the normal body for a 200) and tests it with `HUMAN_RE`; a match throws the one sentence `HUMAN_MSG`, and `isHumanCheck(message)` finds it again anywhere. `fetchHTML` leaves out the wrong "add your own proxy" tip for it; `explain` gives it its own friendly title.

**What the person sees.**
* A page you open (`navigate`) or a chapter list (`startReading`): the **verify box** `#verifyBox`, filled by `humanCheckBox(url, retry)`, with **Open the site** (`#vfOpen`, a new tab, `noopener`), **I did it – try again** (`#vfRetry`) and **Close** (`#vfClose`). No red pop-up.
* Reading mode: each waiting chapter gets its own box (`verifyNote`, class `ch-verify`) with the same two buttons. The site is remembered in `humanHosts`; for 20 seconds the other chapters of that site wait at once **without a request** (no hammering), and the keeper skips them.

**How the way back works.** The button marks the site "opened". When the tab becomes visible again (`humanReturn`, on `visibilitychange` and `focus`) every marked site is retried once after 0.6 s: the page is opened again, or `humanRetryHost` loads the nearest waiting chapter alone; only when it works are the others loaded, three at a time. If the check is still there, only that one request was made and the box stays. A person who returns without passing the check does not cause a loop (the mark is cleared first).

**Honest limit.** The proof "I am human" is saved in the cookies of the browser that solved it. MangaFlow's helper (the Cloudflare Worker or a public proxy) is a different visitor, so after you passed the check the site may still refuse the helper. It works when the site relaxes its check for a while after a person passed it (common); otherwise read that chapter on the site itself. **Improve:** with the site's permission let the person paste the cookie of their own browser for ONE site into Settings and have the Worker send it along (never done without that permission).

### 4.14 The reload guard and the lists from the cloud — `boot.js`, `profiles.js` (round 30)

**What went wrong before.** A signed-in cloud profile pulls its lists at every start. If the merged lists differed from the stored ones, `profiles.js` reloaded the page. Because the merge kept other rows than the app keeps (300 against 20 pages, one row per chapter against one per manga), the two copies never became equal after a reopen: reload, differ, reload … "the site keeps reloading".

**How it works now.**
1. `mergeLists` uses the app's keys (`keyOf`: `id` for `reads`, `url` for `recent` and `books`) and limits (`CAP`: 30 manga, 20 pages), lets the **newer** row of the same key win and sorts timed rows newest first. The same two copies always give the same answer.
2. A change from the cloud does **not** reload anything. `profiles.js` sends `mf-lists-changed`; `app.js` reads `recent`, `books` and `reads` again and draws the start page (`window.MF_LISTS_LIVE` tells `profiles.js` that this door exists; with an old `app.js` it falls back to `MF_RELOAD`).
3. **Guard for any other loop.** `boot.js` counts the loads of this tab in the last minute (`sessionStorage` `mf_boots`). **Five loads in a minute** = a loop: `window.MF_LOOP` is set, automatic reloads are switched off for ten minutes (`mf_noreload`) and `app.js` opens the report **"The page keeps reloading"** with the number, the reasons that `window.MF_RELOAD(why)` wrote down (`mf_why`), the profile and the last sync result. Buttons the person presses (sign in, sign out, Reset) still reload at once.
4. **A reopen that is slow.** After `resumeSlowMs` (12 s, hidden setting) the cover shows "This is taking longer than usual" and **Open the start page** (`#resumeHome`, handled by one click listener in `boot.js`); after twice that time `resumeFromHash` removes the cover and opens the report "Taking too long" with the saved address, the step it is in, the proxies and whether the device is online.

**Honest limit.** A browser that reloads a restored tab by itself (some phone browsers do this once) can not be stopped; it is counted and, from the fifth load, reported. **Improve:** send the loop report to the admin profile (`mf-bug`); show the sync state in the cover.

### 4.15 A page that gives pictures but is not the chapter — `wrongPage` (round 30)

`scanPictures` first looks in the reading boxes (`how: 'reader'`); only when none is convincing it takes the pictures of the whole page (`how: 'page'`). For a chapter behind a login wall, or when the site answers the chapter address with the manga's **main page**, that fallback used to show covers and promo pictures as if they were the chapter ("random images"). `chapterPictures` now asks `wrongPage` for every `how: 'page'` answer: **'series'** when the page's own canonical address (`<link rel="canonical">` or `og:url`) is a parent folder of the chapter address and has no chapter number; **'wall'** when the chapter's own text (`mainText`: menus, side blocks and comments cut away) says log in / locked / coins / premium (`LOCK_RE`) and 10 or fewer pictures were found. Then no pictures are returned and `noImagesError(doc, base, kind)` gives the sentence (a locked chapter or the main page instead). Both are **permanent** answers: `fillChapter` does not mark the box `failed`, so the keeper (section 4.12) does not ask the site again, and the box offers **Open on the site**. A page with a real reading box is never touched. **Not proven:** the real mgread.io page was not available; the rule comes from the owner's report and a mock manga (`/manga/gate/`). **Improve:** also look at the shape of the pictures (pages are tall, covers are small).

`fetchHTML` also marks a site's own **404 / 410** (`NOT FOUND: the site itself …`) so `explain` can say "The page was not found" and not "add your own proxy".

### 4.16 The progress line sits at the very top edge — `#progress` (round 31)

`#progress` (a thin line, 3–4 px, `position: fixed`, `z-index: 35`) shows how far the middle of the screen is through the chapter on screen: `updateCurrent` sets the width of its `<i>`. Until round 30 its distance from the top was `var(--safe-t)` (the phone-notch space, `env(safe-area-inset-top)`). That is right only while something fills the space: the title bar does (its `padding-top` uses the same value) — except **in full screen on a phone**, where round 29c hides the title bar and the browser reports a real notch space, and **while the title bar slides away** on scrolling down. The line then floated 24–40 px down inside the pictures.

**Now:** `top: 0` in every state. The title bar keeps `padding-top: calc(var(--safe-t) + 3px)`, so nothing else moves. A few pixels of the line may sit under a camera hole; the line spans the whole width, so that does not matter. Checks R31-1 / R31-2 give `--safe-t` 32 px (a simulated notch) and measure the line in normal reading, in full screen and after scrolling down, on a phone-sized and a computer-sized screen. **Improve:** if some phone hides the line under its status bar, add a second thin line at the bottom edge as a fallback.

### 4.17 One more try for a 404 with the other spelling of the address — `fetchHTML` (round 31)

`fetchHTML(url, opt)` is now a thin wrapper around `fetchHTMLOnce` (the old function, unchanged: cache, politeness gate, all helpers at once, the explanations). When `fetchHTMLOnce` ends with the marker **"NOT FOUND: the site itself …"** (a helper said HTTP 404 / 410 and the others only failed to connect), the wrapper asks `slashVariant(url)` for the other spelling (final slash added or removed) and calls `fetchHTMLOnce` **once** for it with `noVariant: true`. If that works the page is returned and cached under the first address; if not, the **original** error is thrown, so a really missing page still says "not found" and names the address that was asked for. It is never done for POST requests, for addresses that end in a file name (`.php`, `.jpg` …) or for the front page, and never twice (no loop). The wrapper holds no politeness ticket while it waits, so many failing chapters at once cannot block each other. **Improve:** also try the `www.` spelling, and offer a search of the site by the title in the address.

---
### 4.18 Translate (Google Lens style) — `translate.js` (round 32)

When the **文A** button is pressed, `translate.js` starts reading the current visible pages. For each page:

1. **Fetch the image bytes** — `fetch()` the same URL the `<img>` uses; if that is blocked (tainted canvas) the own proxy is tried.
2. **Draw to a canvas** — scaled to at most 1400 px wide and 14 MP total area; tall images (webtoon strips) are cut into 2000 px tiles at "quiet rows" (rows with near-constant pixel brightness).
3. **Run Tesseract OCR** on the canvas — the language is either chosen by the user or detected on the first page (a combined probe pass). Japanese gets two passes (`jpn_vert` then `jpn`); other languages get one.
4. **Group the text lines into bubbles** — union-find: two lines join when the gap between them is at most 0.9 letter sizes across and 2.2 letter sizes along the line. Vertical Japanese columns are ordered right-to-left.
5. **Remove duplicates** from overlapping tiles, and discard noisy results (too few letters, confidence below the threshold).
6. **Translate the bubble texts** — the engine order is: Chrome built-in Translator API → Google `translate.googleapis.com/translate_a/single` → MyMemory. Results are cached; a failed engine rests 60 seconds after two consecutive failures.
7. **Place a `div.mf-tr-layer`** on top of each image; inside it one `div.mf-tr-b` per bubble, positioned by the OCR bounding box. Font size is fitted by binary search. Bubble background colour is sampled from the edge ring of the bounding box (median colour). Tapping a box shows the original text (peek mode).

The button is `position:fixed`, `z-index:29`, left edge, middle height, only shown while `body.reading`. `body.mf-tr-on` is set while it is on; `body.no-translate` hides it when Settings "Show translate button" is off; `body.no-tr-file` hides the Settings tab when `translate.js` is not linked.

An `IntersectionObserver` on each `img.page` starts the OCR when the image enters a 150%-margin viewport. A `MutationObserver` on `#stream` handles newly added chapters. A `ResizeObserver` on each `.chapter` repositions the layers when the screen is resized.



## 5. `index.html` — the page (structure only)

**Why it exists.** `index.html` is only the skeleton: it says *what is on the page*. How it looks is in `style.css`, what it does is in `app.js`. Keeping the three apart means you can restyle without touching the logic. The file has 187 element ids written in it; after the add-ons ran, the live page has 196 (the add-ons build their own parts).

**How it works.** Every element that a script needs has an `id`. `app.js` finds it with `$('#thatId')`. **If you rename an id here, rename it in every script too** (`node test/check-guide.js`, part B, looks up every id that a script asks for and proves that it exists in `index.html` or is made by a script, and that no id is used twice; section 18).

### 5.1 The head

| Tag | What it does and why |
|---|---|
| `<html lang="en" data-theme="light">` | `data-theme` is the light / dark switch. `app.js` (`applySettings`) changes it; `style.css` reads it. `lang` helps screen readers. |
| `<body data-side="right">` | which side the round keys / the buttons column stand on (setting `side`, Settings > Reading). |
| `<meta charset="utf-8">` | symbols and other languages show correctly. |
| `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content">` | fits phones; `viewport-fit=cover` uses the whole screen on notched phones (CSS adds `--safe-t` / `--safe-b`); `interactive-widget=resizes-content` shrinks the page when the keyboard opens, so the floating search bar is not hidden behind it. |
| `<meta name="theme-color" content="#ffffff">` | colours the phone's browser bar; `app.js` updates it with the theme. |
| `<meta name="referrer" content="no-referrer">` | **important for manga**: our address is not sent as "Referer" to picture servers; many of them refuse pictures when the Referer is another site. (For hosts that still refuse, `makeImg` routes the picture through your own proxy with `&ref=<chapter address>`.) |
| `<meta http-equiv="Content-Security-Policy" …>` | the list of what this page may load (5.2). |
| `<title>MangaFlow Reader</title>` and `<link rel="stylesheet" href="style.css">` | the title and the one style sheet. |
| `<script src="boot.js">` (round 29) | the only script in the head. It runs before the first paint: sets the saved light / dark theme and accent colour, and puts `mf-resuming` on `<html>` when the address holds a saved place, so the cover `#resume` (first element of `<body>`) hides the start page while `app.js` loads (section 4.10). Without the file the site works, only the flash returns. |

**IMPROVE:** add a web-app manifest + service worker so the site can be "installed" on phones; choose the starting theme from the phone's `prefers-color-scheme`.

### 5.2 The Content-Security-Policy (the `<meta>` tag)

A browser-only site is protected by what the browser itself can do. The policy is a list of what the page may load:

| Directive | Value in the file | Why |
|---|---|---|
| `default-src` | `'self'` | everything not named below may only come from our own address |
| `script-src` | `'self'` + the Google Programmable Search hosts (`cse.google.com`, `www.google.com`, `www.gstatic.com`, `clients1.google.com`, `clients1.google.co.in`, `*.google.com`, `partner.googleadservices.com`, `*.googleadservices.com`, `pagead2.googlesyndication.com`, `*.googlesyndication.com`, `syndicatedsearch.goog`, `*.syndicatedsearch.goog`) | only OUR script files and Google's search script may run: no inline scripts, no other sites, so a script slipped into a manga page or link cannot run |
| `style-src` | `'self' 'unsafe-inline' https:` | pages we show bring their own `<style>` blocks and style-sheet links (they sit in a frame without scripts; style sheets cannot run code) |
| `img-src` / `media-src` / `font-src` | `*` (with `data:` / `blob:`) | manga pictures and fonts live on many hosts |
| `connect-src` | `*` | the proxies and the Google API are different hosts (IMPROVE: list only your own proxy addresses) |
| `frame-src` | `'self' about: blob: data:` + the Google hosts | the page frame and the Google panel |
| `object-src` | `'none'` | no plug-ins |
| `form-action` | `'self'` | a form can not send data to another site |

`base-uri` is not limited (the page frame needs its own `<base>`). A `<meta>` policy **cannot** set `frame-ancestors` (who may put us in a frame): `app.js` §0 does a small anti-clickjacking check by script, and the `_headers` file (for Netlify / Cloudflare Pages; **GitHub Pages ignores it**) sets real headers: the same policy plus a few more Google hosts and `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy` (camera, microphone, geolocation, payment, usb off), `Cross-Origin-Opener-Policy: same-origin`, `Strict-Transport-Security`. Keep the two policies in step when you change one.

### 5.3 The body: big containers

| Container | What it is |
|---|---|
| `#browser` | the "mini browser": top bar (`.navbar`: back, forward, reload, home, address box, bookmark star, theme, full screen, settings), the thin load bar, the "page may look incomplete" note (`#pageNote`), the viewport (`#viewport`: start page `#start`, page frame `#frame`, Google panel `#gview`) and the "Reading mode" button `#fabRead` |
| `#reader` | **reading mode**: progress line, title bar (`#readerBar`), chapter menu (`#chapterMenu`), the earlier-chapters bar, the endless column `#stream`, the sentinel `#sentinel` that triggers loading the next batch, the download bar, the end box `#theEnd` and the round keys `#side` |
| `#busy`, `#toast` | the "working…" banner (`setBusy(text)`; shown while reading mode starts, and `startReading` uses it to refuse a second start) and the small message at the bottom (`toast(text)`, fades after about 3 seconds) |
| `#fsExit`, `#fsRead` | full-screen exit / enter buttons |
| `#dock` | the floating download list (round pill + list) |
| `#rangeDlg` | the "Download chapters as PDF" dialog (range, split, quality, estimated size) |
| `#clipPop`, `#popShade`, `#searchPop` | the clipboard list, the shade behind pop-ups and the phone's floating search bar |
| `#errbox` | the big error pop-up (title, summary, hint, copyable report, Close / Troubleshoot / Copy report) |
| `#settings` | the settings window: 7 tabs (see 5.5) |
| `#fixDlg` | "Symptoms & answers" (the troubleshooter's guide, section 11) |
| `<script src>` x7 | in this order: `pdfmaker.js`, `troubleshoot-data.js`, `app.js`, `chapter-slider.js`, `reload-wheel.js`, `edge-slider.js`, `profiles.js` |

### 5.4 State classes on `<body>` (CSS reads them; scripts set them)

`reading` = reading mode is open · `scrolling` = the title bar and floating buttons are hidden because you scroll down · `fs` = full screen is on · `fs-small` = (round 29) full screen on a phone or small tablet, where every button except the exit icon is hidden · `no-fs` = full-screen buttons switched off in settings · `fs-unsupported` = this browser has no Fullscreen API · `has-slider` / `no-slider` = the chapter slider is linked and on / switched off · `has-wheel` / `no-wheel` = the same for the reload wheel · `has-edge` / `no-edge` = the same for the Top / End slider · `no-translate` = translate button switched off in Settings or `showTranslate: false` · `no-tr-file` = `translate.js` is not linked (hides the Translate Settings tab) · `mf-tr-on` = translate is on and processing. `applyAddons()` in `app.js` sets the add-on classes; `style.css` does all the hiding, so switching an add-on off brings the old keys back at once.

### 5.5 The element tree (generated from the page itself)

The tree below was produced by opening the real `index.html` in a browser and listing every element that has an id (with the add-ons running; lines marked "made by a script" do not exist in the HTML file). Indentation = nesting. **Settings tabs:** `proxy` = Proxies; `reading` = Reading; `search` = Search & extras; `profile` = Profile; `memory` = Memory; `security` = Security; `fix` = Troubleshoot.

```text
#resume <div>
  #resumeSlow <div>
    #resumeHome <button.primary> "Open the start page" [type=button]
#browser <div>
  #btnBack <button> "←"
  #btnFwd <button> "→"
  #btnReload <button> "⟳"
  #btnHome <button> "⌂"
  #addrForm <form>
    #addr <input> [type=text]
  #addrPill <button> "🔍Search or paste a link" [type=button]
    #pillText <span> "Search or paste a link"
  #btnStar <button> "☆"
  #btnThemeB <button> "◐"
  #btnFsNav <button.fs-btn> "⛶"
  #btnSettings <button> "⚙"
  #loadbar <div>
  #pageNote <div>
    #pageNoteText <span>
    #pageNoteReport <button> "Report" [type=button]
    #pageNoteOpen <button> "Open original" [type=button]
    #pageNoteX <button> "✕" [type=button]
  #viewport <main>
    #start <section>
      #heroForm <form>
        #addrHero <input> [type=text]
        #heroPaste <button> "📋" [type=button]
        #heroClip <button.clipdd> "▾" [type=button]
      #scopeSwitch <div.scope>
      #engineRow <div.scope.engine>
        #engineSel <select>
        #googleBtn <button> "Google" [type=button]
      #statusChips <div.status-chips>
      #hud <div.hud>
      #mfProfChip <button> "👤Sign in" [type=button]   <- made by a script
      #readList <div.list.cards>
      #recentList <div.list>
      #bookList <div.list>
    #frame <iframe>
    #gview <section>
      #gvQuery <span.muted.small>
      #gvTab <button> "google.com ↗" [type=button]
      #gvClose <button> "✕ Close" [type=button]
      #gvStatus <div.muted.small>
      #gvBox <div>
  #fabRead <button> "📖 Reading mode"
#reader <div>
  #progress <div>
  #readerBar <header>
    #btnHomeR <button.ui-hide> "⌂"
    #btnExit <button.ui-hide> "✕ End reading"
    #rTitle <h1> "Manga"
    #rSub <span>
    #btnChapters <button.ui-hide> "☰ ▾"
    #btnTheme <button.ui-hide> "◐"
    #btnSettingsR <button.ui-hide> "⚙"
    #rdForm <form.rb-search.ui-hide>
      #rdAddr <input> [type=text]
  #chapterMenu <div>
    #btnDlMenu <button.primary.dl-menu> "⬇ Download chapters (PDF)…"
    #btnFsMenu <button.dl-menu.fs-btn> "⛶ Full screen"
    #btnFreeMenu <button.dl-menu> "🧹 Free memory (clear chapter cach"
    #chapterList <ul>
  #prevBar <div>
    #btnPrevLoad <button> "▲ Load earlier chapters" [type=button]
    #prevInfo <span.muted.small>
  #stream <main>
  #sentinel <div>
  #dlBar <section>
    #dlInfo <p.muted>
    #btnDl <button.primary> "⬇ Download chapters (PDF)…"
    #btnFsDl <button.fs-btn> "⛶ Full screen"
  #theEnd <div>
    #btnTopEnd <button.primary> "Back to top"
  #side <nav.ui-hide>
    #btnTop <button.key.k-top> "⇧"
    #btnPrev <button.key.k-up> "↑"
    #btnNext <button.key.k-down> "↓"
    #btnEnd <button.key.k-end> "↧"
#busy <div>
#fsExit <button> "✕ Exit full screen" [type=button]
#fsRead <button.fs-btn> "⛶" [type=button]
#dock <aside.ui-hide.min>
  #dockIcon <button> "⬇ Downloads" [type=button]
    #dockLabel <span> "Downloads"
    #dockCount <b>
  #dockBox <div>
    #dockMin <button> "—" [type=button]
    #dockList <ul>
#rangeDlg <dialog>
  #rgChips <div.chips>
  #rgFrom <select>
  #rgTo <select>
  #rgSplit <select>
  #rgMode <select>
  #rgSize <p.rg-size>
  #rgInfo <p.muted.small>
  #rgCancel <button> "Cancel" [type=button]
  #rgGo <button.primary> "Make PDF" [type=button]
#clipPop <div>
#popShade <div>
#searchPop <div>
  #popForm <form>
    #addr2 <input> [type=text]
    #btnPaste <button> "📋" [type=button]
    #popClip <button.clipdd> "▾" [type=button]
#errbox <dialog>
  #errTitle <h2> "⚠ Something went wrong"
  #errSummary <p>
  #errHint <p.muted>
  #errText <textarea>
  #errClose <button> "Close" [type=button]
  #errFix <button> "🔧 Troubleshoot" [type=button]
  #errCopy <button.primary> "Copy report" [type=button]
#verifyBox <dialog>
  #vfTitle <h2> "🧑 Please prove you are human on t"
  #vfText <p>
  #vfHow <ol.muted>
  #vfLimit <p.muted> "MangaFlow never solves or skips th"
  #vfClose <button> "Close" [type=button]
  #vfOpen <button> "🔗 Open the site" [type=button]
  #vfRetry <button.primary> "I did it – try again" [type=button]
#toast <div>
#settings <dialog>
  #setForm <form>
    #setTitle <h3> "Settings"
    #setTabs <nav>
    #proxyBox <fieldset.set-card.active> [data-tab=proxy]
      #proxyList <ul>
      #proxyNew <input> [type=text]
      #proxyAdd <button.primary> "Add" [type=button]
      #proxyTest <button> "Test all" [type=button]
      #proxyReset <button> "Reset to defaults" [type=button]
    #readBox <fieldset.set-card> [data-tab=reading]
      #setWidthVal <b>
      #setWidth <input> [type=range min=420 max=1200]
      #setSide <select>
      #setPdf <select>
      #setSlider <input> [type=checkbox]
      #setWheel <input> [type=checkbox]
      #setAwake <input> [type=checkbox]
      #accentRow <span.accent-row>
      #setAutoRead <input> [type=checkbox]
      #setAhead <select>
      #setArrows <input> [type=checkbox]
      #setTap <input> [type=checkbox]
    #searchBox <fieldset.set-card> [data-tab=search]
      #setCx <input> [type=text]
      #setGoStraight <input> [type=checkbox]
      #setGoogleManga <input> [type=checkbox]
      #setGKey <input> [type=password]
      #setGTest <button> "Test Google search" [type=button]
      #setGSites <button> "Copy my sites for Google" [type=button]
      #gTestOut <pre.small>
      #setStrict <input> [type=checkbox]
      #setFs <input> [type=checkbox]
      #setEdge <input> [type=checkbox]
    #profBox <fieldset.set-card> [data-tab=profile]
      #profInfo <p.small> "Checking…"
      #profOpen <button.primary> "👤 Open my profile" [type=button]
      #profSync <button> "↻ Sync now" [type=button]
    #memBox <fieldset.set-card> [data-tab=memory]
      #memInfo <p.muted.small>
      #memFrom <select>
      #memTo <select>
      #memRange <button> "Clear this range" [type=button]
      #memBefore <button> "Clear all before my chapter" [type=button]
      #memAuto <select>
    #secBox <fieldset.set-card> [data-tab=security]
      #setNoHist <input> [type=checkbox]
      #setWipe <input> [type=checkbox]
      #secCheck <button> "Check my setup" [type=button]
      #secList <ul.small>
    #fixBox <fieldset.set-card> [data-tab=fix]
      #fixAuto <button.primary> "Fix automatically" [type=button]
      #fixCheck <button> "Run checks" [type=button]
      #fixList <ul.small>
      #fixOpen <button> "Symptoms & answers…" [type=button]
      #fixCopy <button> "Copy full report" [type=button]
      #fixSend <button> "Send report to server" [type=button]
      #fixReset <button> "Reset settings" [type=button]
    #btnClear <button> "Clear history & cache" [type=button]
#fixDlg <dialog>
  #fixTitle <h3> "Symptoms & answers"
  #fixClose <button> "Close" [type=button]
  #fixGuide <div>
  #fixPrompts <ul.fix-prompts>
  #fixRecent <ul.fix-recent>
#mfSlider <div>   <- made by a script
#mfWheel <div>   <- made by a script
#mfEdge <div>   <- made by a script
#mfProf <dialog>   <- made by a script
```

**The cards of the settings window** (generated; each card is a `<fieldset class="set-card" data-tab="…">`, only the card of the open tab is shown):

* **CORS proxies** (`#proxyBox`, tab `proxy`): `#proxyAdd`, `#proxyTest`, `#proxyReset`
* **Reading & display** (`#readBox`, tab `reading`): `#setWidth`, `#setSide`, `#setPdf`, `#setSlider`, `#setWheel`, `#setAwake`, `#accentRow`, `#setAutoRead`, `#setAhead`, `#setArrows`, `#setTap`
* **Search & extras** (`#searchBox`, tab `search`): `#setCx`, `#setGoStraight`, `#setGoogleManga`, `#setGKey`, `#setGTest`, `#setGSites`, `#setStrict`, `#setFs`, `#setEdge`
* **Profile & sync** (`#profBox`, tab `profile`): `#profInfo`, `#profOpen`, `#profSync`
* **Free memory (reading mode)** (`#memBox`, tab `memory`): `#memInfo`, `#memFrom`, `#memTo`, `#memRange`, `#memBefore`, `#memAuto`
* **Security & privacy** (`#secBox`, tab `security`): `#setNoHist`, `#setWipe`, `#secCheck`
* **Troubleshoot** (`#fixBox`, tab `fix`): `#fixAuto`, `#fixCheck`, `#fixOpen`, `#fixCopy`, `#fixSend`, `#fixReset`

**Search engine choices** (`#engineSel`): `google` = Google (your search); `auto` = Auto (free engines); `bing` = Bing; `mojeek` = Mojeek; `yahoo` = Yahoo; `duckduckgo` = DuckDuckGo; `brave` = Brave. **Accent colour swatches** (Settings > Reading): `#e8590c`, `#1c7ed6`, `#7048e8`, `#0ca678`, `#d6336c`.

---

## 6. `style.css` — how it looks (1322 lines)

**Why it exists.** Every colour, size and position lives here, so changing the look never touches the logic. **How it works.** Colours are stored once as CSS variables; the theme switch only flips `data-theme` on `<html>` and every colour updates. **How the file is built.** Sections 1–13 are the base (rounds up to 8); after that **each round added its own block** at the end of the file. That is deliberate (round 13 rule: "keep what works", an older rule is never moved by accident) but it has one consequence you must know:

> **Later rules win.** To change how something looks, search the file for its id and look at the **last** rule that touches it. Example: the reload wheel was moved by several rounds; its final place (top left, under the title bar) is in the "ROUND 20" lines near the end, not in the first block that mentions it. Comments in older blocks that describe an old place carry a "ROUND 28 NOTE" where that would mislead.

### 6.1 Colours and variables (generated from the file)

| Variable | Light (`:root`) | Dark (`[data-theme="dark"]`) |
|---|---|---|
| `--bg` | #ffffff | #000000 |
| `--fg` | #111111 | #eeeeee |
| `--muted` | #666666 | #9a9a9a |
| `--bar` | rgba(255, 255, 255, .92) | rgba(0, 0, 0, .92) |
| `--line` | rgba(0, 0, 0, .14) | rgba(255, 255, 255, .18) |
| `--accent` | #e8590c | (same) |
| `--shadow` | 0 14px 44px rgba(0, 0, 0, .20) | 0 14px 44px rgba(255, 255, 255, .08) |
| `--keytop` | #f6f6f6 | #2d2d2d |
| `--keyedge` | #b9b9b9 | #1b1b1b |
| `--keyhi` | #ffffff | #5a5a5a |
| `--w` | 820px | (same) |
| `--safe-t` | env(safe-area-inset-top, 0px) | (same) |
| `--safe-b` | env(safe-area-inset-bottom, 0px) | (same) |

* The theme: light = pure white page, dark = pure black (`#000`). `app.js` `applySettings()` writes `data-theme` (on `<html>`), `--w` (chapter column width, Settings > Reading, 420–1200 px) and `--accent` (the accent colour; only a plain `#rrggbb` value is accepted, nothing else can reach the CSS).
* `--safe-t` / `--safe-b` = the notch / home-bar spacing of phones (`env(safe-area-inset-top / bottom)`).
* **`--col-top`** (round 19, set on `body`): the height under the title bar where the right-hand column starts (`calc(124px + var(--safe-t))`; while you scroll down in reading mode it is `calc(10px + var(--safe-t))`, so the download pill, the full-screen icon and the reload wheel **slide up together**). Never give one of them its own number; they must stay on the same `--col-top`.
* Phone details: text boxes are 16 px (iOS Safari does not zoom on focus); buttons are at least 40 px high; `100dvh` (the real visible height on phones) with `100vh` as the fallback; `prefers-reduced-motion` switches animations off.

### 6.2 Map of the file (generated: line: block)

```text
1: MangaFlow Reader - style.css
7: 1. THEME VARIABLES
45: 2. BASE RESET
77: 3. BUTTONS & INPUTS
121: 4. BROWSER VIEW
198: 4b. SEARCH PILL + FLOATING SEARCH BAR (small screens)
244: 5. READER BAR (title space at the top)
273: ROUND 8: search / link row inside the reader bar.
279: ROUND 9: the reading-progress line is pinned to the very top edge of the screen (position: fixed), outside th
300: 6. AUTO-HIDE WHILE SCROLLING DOWN
310: ROUND 9: while you scroll down the WHOLE bar (title, buttons, search row) slides up out of the screen. The pr
319: 7. CHAPTER COLUMN (centered, "floating")
326: ROUND 9: the earlier-chapters bar sits above the stream and also provides the empty space under the fixed tit
406: 8. FLOATING READER KEYS (round 9: ONE horizontal row of round 3D buttons, bottom-RIGHT corner)
421: ROUND 9b: #side is a click-through strip across the bottom. The reload keys (.kg-l) sit in the LEFT corner and
475: 9. CHAPTER DROPDOWN
499: 10. TOAST, BUSY, SETTINGS
533: 10c. SETTINGS DIALOG: FITS ONE SCREEN (round 9)
600: 10b. PDF DOWNLOAD PANEL
603: DOWNLOAD DOCK + RANGE DIALOG (round 7)
614: ROUND 8: the dock sits right ABOVE the reader keys, in the same corner. column-reverse puts the open list abo
702: 11. BIG ERROR POP-UP (round 8)
721: 12. FAILED PAGE + CLEARED CHAPTER NOTICES (round 8)
733: 13. ROUND 8 EXTRAS
749: ROUND 9b: the clear (x) button INSIDE a search box. WHY: pasting a new link meant deleting the old one by hand
770: ROUND 10 ADDITIONS
869: ROUND 11 ADDITIONS
986: ROUND 12: ALIGNMENT ON EVERY DEVICE + THE WHEEL CORNER + THE DOWNLOAD LIST ON PHONES
1015: ROUND 13: SWITCHING THE ADD-ONS OFF + LEANER LOOK
1025: ROUND 13: the two add-on switches share one line so the Reading card stays short (all five cards still fit on
1029: ROUND 14: LAYOUT + CLEAR BUTTON + SMALL KEYS WITHOUT WORDS
1061: ROUND 14: accent colour swatches (Settings > Reading). WHY: a quick "pro" way to restyle. HOW: five small roun
1067: ROUND 15: DIGITAL START PAGE + "PAGE MAY LOOK INCOMPLETE" NOTICE
1094: ROUND 16: engine row. WHY: reuse the pill look of .scope; the select is a small dark-glass drop-down and the G
1114: ROUND 17 ADDITIONS
1149: ROUND 17: the clipboard arrow glyph must be visible: the start-page buttons are white, so the arrow is dark th
1154: ROUND 18 ADDITIONS (Google panel, full screen, Top / End slider, settings card)
1161: 1. GOOGLE SEARCH PANEL (#gview)
1176: 2. FULL SCREEN
1182: ROUND 29c: the helpers (slider, wheel, Top / End slider, keys, download pill, Reading-mode button) hide in ful
1200: 3. TOP / END SLIDER (edge-slider.js)
1210: 4. SETTINGS CARD "Search & extras"
1214: 5. PAGES SHOWN WITHOUT THEIR SCRIPTS (renderFrame adds class mf-nojs to <html> inside the frame)
1220: ROUND 19 ADDITIONS (reading-mode column at the top right, hide rules)
1231: ROUND 20: the full-screen button has EXACTLY the size of the download pill (44 x 38 px, pill shape) and stands
1237: ROUND 21: while in full screen the SAME icon button, in the SAME place, becomes the EXIT button (the old botto
1243: ROUND 20: the reload wheel is at the TOP LEFT under the title bar (the mirror of the download pill), in the sa
1251: ROUND 19: DIGITAL POLISH FOR THE HEADER BUTTONS AND THE SETTINGS WINDOW
1270: ROUND 22
1279: ROUND 28: the note under a chapter that could only be read in part ("Only 1 of 7 pictures of Chapter 1 could b
1288: ROUND 29a - THE REOPEN COVER (no flash of the start page)
1303: ROUND 30: the way out of a slow reopen. boot.js shows #resumeSlow (it has the attribute hidden until then) whe
1309: ROUND 29e - THE "VERIFY YOU ARE HUMAN" BOX AND THE WAITING CHAPTER BOXES
```

### 6.3 Layout in one picture (reading mode, phone and PC)

```text
 ┌ #readerBar (title, buttons, search row) ──────────┐  slides up while you scroll down (.scrolling)
 │ #progress  = thin line at the very top edge        │
 ├────────────────────────────────────────────────────┤
 │ #prevBar  "▲ Load earlier chapters"                │
 │ #stream   = the chapters, width min(var(--w),100%) │  centred column
 │ #sentinel = invisible line that loads the next     │
 │ #dlBar, #theEnd                                    │
 └────────────────────────────────────────────────────┘
 top left : reload wheel #mfWheel          top right: download pill #dock, under it the full-screen icon #fsRead
 bottom left: Top / End slider #mfEdge     bottom right: chapter slider #mfSlider      (they swap sides with the "buttons side" setting)
 #side = the round keys (Top, previous, next, End): hidden when the sliders replace them
```

### 6.4 Media queries (generated)

`@media (prefers-reduced-motion: reduce)` x7, `@media (max-width: 760px)` x1, `@media (max-width: 700px)` x4, `@media (max-width: 520px)` x4, `@media (max-width: 370px)` x2, `@media (max-height: 560px)` x1, `@media (max-height: 430px)` x1, `@media (max-width: 480px)` x1. What the width / height limits do:

| Query | What changes |
|---|---|
| `max-width: 760px` | the top bar wraps to two rows; the address form is replaced by the pill `#addrPill` ("Search or paste a link") which opens the floating search bar `#searchPop` |
| `max-width: 700px` | chapters are full width without side borders; the open download list becomes a **bottom sheet** (`#dockBox`; in reading mode it hangs under the title bar); coloured chapter borders |
| `max-width: 520px` | the round keys get smaller (38 px); the words "End reading" are hidden (only the ✕ stays); the download pill steps aside for the chapter slider |
| `max-width: 480px` / `370px` | start-page rows tighten / very small phones: keys 34 px, still one row |
| `max-height: 560px` | the settings window hides its long help texts (every control stays) |
| `max-height: 430px` | phone turned sideways: the download list gets a lower height cap |
| `prefers-reduced-motion: reduce` | animations and transitions off (7 places) |

### 6.5 Things the CSS does **not** contain (so you do not look for them here)

* The rules for **pages of other sites** shown in `#frame` are written by `app.js` (`MF_NOJS_CSS`, injected into the frame by `renderFrame`) because that page is a separate document.
* The **results list** MangaFlow draws for a search (`resultsPage`) has its own small `<style>` inside the page it builds (light and dark like the app).
* The **Google panel** results are drawn by Google's script in `#gvBox`; `app.js` adds a small style so they stay light in dark mode (`styleR25`), and round 22 hides Google's own pop-up (`.gsc-overlay-wrapper`, `.gsc-modal-background-image`, `.gsc-overlay-wrapper-constraint`).
* The add-ons (`chapter-slider.js`, `reload-wheel.js`, `edge-slider.js`, `profiles.js`) carry **their own CSS inside their file**, so each is really one file.

### 6.6 How to change things safely (and how to improve)

| You want | Do this |
|---|---|
| another accent colour for every button | Settings > Reading swatches, or change the default `--accent` in `:root` **and** the fallback `'#e8590c'` in `applySettings()` |
| a third theme (for example sepia) | add a `[data-theme="sepia"] { … }` block with the same variables, add the value to the theme switch in `app.js` |
| a wider / narrower chapter column | Settings > Reading, or change `--w` |
| move a floating button | change its `top` / `left` in the **last** block that mentions its id (see the map) and keep it on `--col-top` |
| smaller or bigger touch targets | search `min-height: 40px` (9 places) and `min-height: 44px`; keep 40 px or more |

**IMPROVE:** merge the round blocks into one tidy file (only with the 133 browser checks of section 10 running before and after); move the colours of the add-ons into the variables; add a high-contrast theme.

---

## 7. `app.js` — the behaviour (6793 lines)

**Why it exists.** Everything that happens is decided here: the mini browser, search, finding chapters and pictures, reading mode, PDF download, settings, error reports and the troubleshooter. **How it is built.** One big function that runs at once, `(() => { 'use strict'; … })()`, so no variable leaks into the page. Inside it the code is cut into numbered **sections** (below). Every section starts with a comment block with **WHY / HOW / IMPROVE** (section 7.9 prints them), and nearly every function has a short WHY / HOW / IMPROVE comment above it. The file is long on purpose: there is no build step, and every part is meant to be readable as a lesson.

**Rules that keep it working** (details in section 3.1): section 18 must stay **before** the start-up code at the bottom (it uses `const`s); every `await` in `navigate()` needs a `stale()` check and every `await` in `fillChapter()` the `gen !== R.gen` check; talk to the add-on files only through events (7.6); keep new features in their own section.

### 7.1 Section map (generated from the section headers of the file)

| § | Lines | Title (from the code) |
|---|---|---|
| 0 | 41-68 | SECURITY BASICS (round 7) |
| 1 | 69-133 | SMALL HELPERS |
| 2 | 134-284 | SETTINGS + THEME |
| 3 | 285-494 | FETCHING PAGES THROUGH A CORS PROXY |
| 4 | 495-525 | URL HELPERS |
| 4b | 526-583 | SEARCH ENGINES (ROUND 16) |
| 4c | 584-732 | OWN RESULTS PAGE (ROUND 17) |
| 5 | 733-1031 | ERRORS (BIG POP-UP), TOAST, BUSY, LOADING BAR (rewritten in round 8) |
| 5b | 1032-1081 | POLITE REQUESTS (round 8) |
| 6 | 1082-1221 | HISTORY: RECENT PAGES, CONTINUE READING, BOOKMARKS (start page) |
| 7 | 1222-1538 | MINI BROWSER (address bar, back/forward, iframe) |
| 7b | 1539-2086 | MAKING OTHER SITES LOOK COMPLETE (round 15) |
| 8 | 2087-2640 | CHAPTER + IMAGE DETECTION (the "guessing" part) |
| 8b | 2641-3494 | FINDING THE FULL CHAPTER LIST FROM A CHAPTER PAGE (round 9) |
| 9 | 3495-3901 | READING MODE - state + infinite chapter streaming |
| 9b | 3902-3967 | THE KEEPER (round 29d) - keeps the next chapters ready and heals failed pictures / chapters by itself |
| 10 | 3968-4050 | CHAPTER NAVIGATION (dropdown list, prev/next, home/end) |
| 9b | 4051-4160 | READING UPWARDS: EARLIER CHAPTERS (round 9) |
| 10b | 4161-4257 | FREE MEMORY / CLEAR CHAPTER CACHE (round 7) |
| 11 | 4258-4424 | SCROLL TRACKING + AUTO-HIDING UI (changed in round 2) |
| 12 | 4425-4740 | PDF DOWNLOAD (the "Download all chapters" button) |
| 12b | 4741-4992 | DOWNLOAD RANGE DIALOG (round 7) |
| 12c | 4993-5422 | DOWNLOAD MANAGER + FLOATING DOCK (round 7) |
| 13 | 5423-5438 | SEARCH BAR FOR SMALL SCREENS (floating bar) |
| 14 | 5439-5651 | EVENT WIRING |
| 15 | 5652-5890 | SETTINGS DIALOG + PROXY LIST |
| 16 | 5891-5946 | START-UP + SAFETY NETS (round 8) |
| 17 | 5947-6256 | REPORTS, WATCHERS AND THE TROUBLESHOOTER (round 11) |
| 18 | 6257-6793 | ROUND 18: GOOGLE SEARCH, FULL SCREEN, TOP / END JUMPS, "REMEMBER MY PAGE" |

### 7.2 Functions by section (277 functions that sit directly inside the big wrapper; generated)

| § | Functions directly inside that section (in file order) |
|---|---|
| 0 | safeWebUrl |
| 1 | $, $$, endResume, fixProxy, proxyName, isExample |
| 2 | syncWake, applyAddons, applySettings, toggleTheme |
| 3 | proxyAsleep, proxyNote, proxyList, isHumanCheck, askProxy, slashVariant, fetchHTML, fetchHTMLOnce, fetchDoc |
| 4 | absUrl, sameUrl, hostOf, shortUrl, normalizeInput |
| 4b | searchQuery, searchCandidates, isSearchHost, searchProblem |
| 4c | escHtml, clipText, parseResults, queryOf, resultsPage, unwrap |
| 5 | explain, showError, toast, setBusy, setLoading, reportBlocked, closeVerify, humanCheckBox, openHumanSite, verifyNote, humanRetryHost, humanReturn, diagnose |
| 5b | gate, coolDown |
| 6 | timeAgo, addRecent, saveRead, item, renderStatus, renderStart, toggleBookmark, continueReading |
| 7 | fixLazy, appLink, neutralizeLinks, injectChapters, fixShortcuts, renderFrame |
| 7b | wait, liveDoc, proxyUrlFor, fetchRaw, packCss, noteBar, hidePageNote, repairStyles, pageHealth, hookFrame, hookDoc, applyLive, onFrameClick, onFrameSubmit, setAddress, navigate, tryAutoRead, readFrom, isChapterLinkOfCurrent, goHist, goHome, updateNav |
| 8 | numFrom, isWordHref, fmtNum, isPlainTitle, seriesKey, pickSeries, belongsToPage, detectChapters, detectTitle, srcsetBest, fromScripts, looksLikeImgUrl, imgAddressInfo, imgAddress, isHolder, readerSlots, generalPictures, scanPictures, looksLikeChapter, detectChaptersLoose |
| 8b | unescapeJs, chapterNumOf, attrCls, findNavLinks, slugOf, findSeriesLink, guessSeriesUrls, pagerLinks, morePages, loadSeriesList, synthesizeChapters, metaImageSamples, imgExists, probeNumbered, sealedPage, pageTextPictures, existsRun, inferNumbered, chapterPictures, wrongPage, partialNote, mainText, noImagesError, findParentLink, ajaxChapterList, enhanceSeriesPage, findStep, findNextLink, findPrevLink, analyze |
| 9 | labelFor, secFor, startReading, readingTip, loadNext, makeSection, fillChapter, makeImg |
| 9b | healBase, healWait, keeperAhead, keeperOn, keeperTick, keeperPoke |
| 10 | buildChapterMenu, toggleMenu, closeMenu, markCurrent, jumpTo, goChapter, jumpOrGo, goEnd |
| 9b | updatePrevBar, removeSection, loadPrev, alive, stepChapter, reloadSections, reloadCurrent |
| 10b | freeSection, restoreSection, clearRange, memInfo, fillMemSelects, autoFree, reloadEvery |
| 11 | holdUiFor, markInput, showUi, hideUi, onScroll, updateCurrent, announce, rememberChapter, leaveReader, exitReading, readerGo, tapScroll |
| 12 | sniff, limitOf, withLimit, statOf, routeStatText, byteRoutes, fetchBytes, toRgb, addPageImage, addTextPage, fileSafe, updateDlBar |
| 12b | chapNo, setRange, rangeValues, rangeInfo, openRangeDialog, measureAll, estimate, scheduleEstimate |
| 12c | jlog, jobReport, sleep0, waitFor, fmtSize, queueDownload, runQueue, runJob, chapterImages, buildPart, saveFile, jobEl, paintJob, paintPill, syncDock, renderDock |
| 13 | openSearch, closeSearch |
| 14 | goTop, pressCap |
| 15 | renderProxyList, addProxy, testProxies, openSettings, showTab, fitSettings |
| 16 | quietError, onSecurityViolation |
| 17 | watch, noteFail, noNextDetails, showNoNext, addNoNextButton, FIXDATA, copyText, heapText, pingProxies, selfCheck, paintRows, autoFix, diagnostic, renderGuide, refreshProfInfo |
| 18 | rememberView, hasGoogleResults, googleDiag, gKeyOn, googleApi, loadCse, runCse, hideGview, showGview, googleSearch, mySitesForGoogle, fsSupported, fsApiEl, isFs, enterFs, leaveFs, toggleFs, isSmallScreen, syncFs, resumeFromHash, syncScope, drawHud, clipList, clipAdd, fillBox, submitBox, pasteInto, closeClip, openClip, syncClear |

### 7.3 Settings (33 keys; generated from the `settings` object)

Saved as one JSON text in `localStorage` key `mf_settings` (7.5). Saved values are copied on top of these defaults, so a new key simply gets its default for people who already used the site. `ver` is a counter for one-time upgrades (for example round 19 put the built-in proxy first, once). "Changed by" = the element in `index.html` that edits it.

| Key | Default | Changed by | Meaning |
|---|---|---|---|
| `proxies` | `null` | `#proxyList` (Settings > Proxies) |  |
| `width` | `820` | `#setWidth` |  |
| `side` | `'right'` | `#setSide` |  |
| `theme` | `'light'` | `#btnTheme`, `#btnThemeB`, key T |  |
| `arrowKeys` | `true` | `#setArrows` |  |
| `tapScroll` | `true` | `#setTap` |  |
| `autoRead` | `true` | `#setAutoRead` | (r8) a pasted manga link opens straight in reading mode |
| `ver` | `0` | (none: one-time upgrades) | (r8) settings version (used for one-time upgrades below) |
| `pdfMode` | `'balanced'` | `#setPdf`, `#rgMode` | (r11) PDF picture quality = 'original' \| 'balanced' (default) \| 'small' \| 'tiny' (see PDF_PROFILES in section 12) |
| `showSlider` | `true` | `#setSlider` | (r13) show the vertical chapter slider (chapter-slider.js). false = hidden and disabled |
| `showWheel` | `true` | `#setWheel` | (r13) show the reload wheel (reload-wheel.js). false = hidden and disabled |
| `accent` | `'#e8590c'` | `#accentRow` swatches | (r14) the highlight colour (buttons, progress bar). Chosen by the swatches in Settings > Reading |
| `searchManga` | `true` | `#scopeSwitch` (Manga / Everything) | (r15) typed words are searched as "<words> manga" (true) or as they are (false = search everything) |
| `engineStrict` | `false` | `#setStrict` | (r19) true = never fall back to another engine when the chosen one fails |
| `searchEngine` | `'google'` | `#engineSel` | (r18) 'google' (YOUR Google Programmable Search, the default) \| 'auto' \| 'bing' \| 'mojeek' \| 'yahoo' \| 'duckduckgo' \| 'brave' (the chosen free engine is tried first, the others are the fallback) |
| `keepAwake` | `false` | `#setAwake` | (r14) keep the screen on while MangaFlow is open (Screen Wake Lock; only some browsers) |
| `googleKey` | `''` | `#setGKey` | (r24) removed — Google closed the Custom Search JSON API to new projects. If you have an older project with access, paste your key here. Otherwise use the Programmable Search box below (no key needed). |
| `googleCx` | `'c0d44f55eddb847e4'` | `#setCx` | (r18) the ID (cx) of the owner's Google Programmable Search Engine. Change it in Settings > Search & extras |
| `googleManga` | `false` | `#setGoogleManga` | (r18) add the word "manga" to Google searches (off: the engine you built already knows which sites to search) |
| `goStraight` | `false` | `#setGoStraight` | (r18) open the search straight after a paste (one tap / one Ctrl+V) |
| `showFs` | `true` | `#setFs` | (r18) show the full-screen buttons |
| `showEdge` | `true` | `#setEdge` | (r18) show the Top / End slider (edge-slider.js); on = the Top and End keys are hidden, off = the keys come back |
| `autoFree` | `0` | `#memAuto` | (r7) clear chapters more than N behind you (0 = off) |
| `noHistory` | `false` | `#setNoHist` | (r7) do not save reading history |
| `wipeOnClose` | `false` | `#setWipe` | (r7) erase history + cache when the tab closes |
| `preloadAhead` | `9` |  | round 29d: the keeper keeps this many chapters AFTER the one you read loaded and ready in the background (0 = off) |
| `resumeSlowMs` | `12000` |  | round 30 (hidden): how long "Reopening where you were..." may stand alone before boot.js offers "Open the start page" and (after twice that time) app.js writes a report. Tests set it small. |
| `healBaseMs` | `4000` |  | round 29d: first waiting time (ms) of the keeper before it retries a failed picture / chapter; it doubles each time up to 90 s. Tests set it small. |
| `showTranslate` | `true` | `#setTrShow` | (r32) show the translate button (文A). false = button + bar hidden |
| `trTo` | `'en'` | `#setTrTo`, `#mfTrTo` | (r32) translate the words INTO this language (two-letter BCP-47 code, e.g. `'hi'` = Hindi, `'en'` = English); default English |
| `trFrom` | `'auto'` | `#setTrFrom`, `#mfTrFrom` | (r32) language the pages are written in for OCR (`'auto'` = detect on the first page, `'jpn'` = Japanese, `'kor'` = Korean, `'chi_sim'` = Chinese simplified, `'chi_tra'` = Chinese traditional, `'eng'` = English) |
| `trEngine` | `'auto'` | `#setTrEngine`, `#mfTrEng` | (r32) translation service to use (`'auto'` = Chrome built-in → Google gtx → MyMemory, `'chrome'` = Chrome only, `'google'` = Google gtx only, `'mymemory'` = MyMemory only) |
| `trAuto` | `false` | `#setTrAuto` | (r32) switch translate on automatically when reading mode opens |

Notes: `googleKey` is **empty by default** (round 24): Google closed the Custom Search JSON API to new projects; only someone who still owns an older project with access can paste a key. Without a key, Google answers through the Programmable Search panel (no key needed). `proxies = null` means "build the list the first time": the old single proxy of earlier versions (if it is real), then the two free ones (`DEFAULT_PROXIES`: `api.allorigins.win`, `api.codetabs.com`), and then a one-time upgrade (`ver` < 13) puts the owner's own Worker (`BUILTIN_PROXY`) **first**; "Reset to defaults" brings it back too. At request time `proxyList()` adds `<this address>/proxy?url={url}` when the page itself is served from `localhost` / `127.0.0.1` (the test server does this), leaves sleeping free proxies out while others are awake, and for POST forms uses only proxies that are not in `DEFAULT_PROXIES` (the free ones can only GET).

**Add a setting in 5 steps:** (1) a default in the `settings` object; (2) a control in the right card of `index.html`; (3) fill the control from `settings` where the other controls are filled (`openSettings`); (4) an `onchange` that writes `settings.<key>` and calls `applySettings()` (it saves); (5) use `settings.<key>` where it matters. Then add one line to the tests.

### 7.4 Constants worth knowing (generated: line and first line of the definition)

| Name | Line | Value (first line of its definition) |
|---|---:|---|
| `BUILTIN_PROXY` | 198 | `BUILTIN_PROXY = 'https:` |
| `DEFAULT_PROXIES` | 144 | `DEFAULT_PROXIES = [` |
| `NS_KEYS` | 90 | `NS_KEYS = ['recent', 'books', 'reads', 'progress'];` |
| `ENGINE_ORDER` | 546 | `ENGINE_ORDER = ['bing', 'mojeek', 'yahoo', 'duckduckgo', 'brave'];` |
| `SEARCH_HOST` | 572 | `SEARCH_HOST = /(^\|\.)(bing\.com\|mojeek\.com\|duckduckgo\.com\|search\.brave\.com\|brave\.com\|yahoo\.com\|google\.[a-z.]+)$/;` |
| `CH_RE` | 2097 | `CH_RE = /(?<![a-z])(?:chapter\|chap\|ch\|episode\|ep)(?![a-z])[\s._\-#:/]*(\d+(?:[._-]\d+)?)/i;` |
| `BAD_IMG` | 2294 | `BAD_IMG = /logo\|banner\|avatar\|icon\|sprite\|\bads?[-_/.]\|advert\|loading\|gravatar\|emoji\|placeholder\|button\|badge\|thumb-?small\|[-_]\d{2,3}x\d{2,3}\.(?:...` |
| `IMG_EXT` | 2296 | `IMG_EXT = /\.(?:jpe?g\|png\|webp\|avif\|gif)(?:[?#]\|$)/i;` |
| `READER_BOX` | 2395 | `READER_BOX = '.reading-content, .reader, #manga-page, .page-content, .chapter-content, .comic-page, [class*="reader"], [id*="reader"], #chapter-con...` |
| `SIDE_BOX` | 2397 | `SIDE_BOX = 'aside, nav, footer, header, [class*="sidebar" i], [class*="widget" i], [class*="recommend" i], [class*="related" i], [class*="popular" ...` |
| `NOT_SERIES` | 2758 | `NOT_SERIES = /\/(?:genres?\|tags?\|authors?\|artists?\|categor(?:y\|ies)\|page\|search\|bookmarks?\|login\|register\|user\|forum\|contact\|about\|privacy\|dmca\|ter...` |
| `PAGER_RE` | 2851 | `PAGER_RE = /\/page\/(\d{1,3})\/?$\|[?&](?:page\|paged\|pg\|p)=(\d{1,3})(?:&\|$)/i;` |
| `NUM_IMG` | 2997 | `NUM_IMG = /^(.*\/)(\d{1,4})(\.(?:jpe?g\|png\|webp\|avif\|gif))(\?.*)?$/i;` |
| `LOCK_RE` | 3216 | `LOCK_RE = /(?:please\s+)?log\s*in\s+to\s+(?:read\|unlock\|view\|continue)\|unlock\s+(?:this\s+)?chapter\|(?:chapter\|content)\s+is\s+locked\|premium\s+(?:...` |
| `BATCH` | 3509 | `BATCH = 10;` |
| `BATCH_PREV` | 4066 | `BATCH_PREV = 5;` |
| `PDF_MODES` | 4466 | `PDF_MODES = Object.keys(PDF_PROFILES);` |
| `SLICE` | 4478 | `SLICE = 2000;` |
| `BREAK_AFTER` | 4507 | `BREAK_AFTER = 3, BREAK_FOR = 60000;` |
| `CLIP_MAX` | 6666 | `CLIP_MAX = 12;` |
| `SKIP_HOST` | 6461 | `SKIP_HOST = /(^\|\.)(google\.[a-z.]+\|googleapis\.com\|gstatic\.com\|workers\.dev\|github\.io\|pages\.dev\|netlify\.app\|localhost)$/i;` |

### 7.5 What is stored in the browser (`localStorage`)

Everything is kept in the browser of the person; nothing is sent anywhere unless a profile is signed in (4.8). All reads and writes are wrapped in `try / catch` (private mode, full storage and blocked storage must never break the page).

| Key | Written by | Holds |
|---|---|---|
| `mf_settings` | `app.js` | the settings object (7.3) |
| `mf_recent` | `app.js` (`addRecent`) | pages you opened: `{ url, title, host, at }`, 20 at most |
| `mf_reads` | `app.js` (`saveRead`) | "Continue reading": one entry per manga `{ id, title, host, seriesUrl, chapterUrl, chapterLabel, at }`, 30 at most |
| `mf_books` | `app.js` | bookmarks `{ url, title }` |
| `mf_progress` | (reserved) | a list that `profiles.js` also syncs; `app.js` only clears it (Settings > Clear). Nothing reads it today |
| `mf_u:<name>:recent`, `…:books`, `…:reads`, `…:progress` | `app.js` while a profile is signed in | the same four lists, one set per profile (`NS_KEYS` + `nsPrefix`), so profiles never see each other's lists |
| `mf_clips` | `app.js` | the clipboard list (texts you copied or pasted inside MangaFlow) |
| `mf_session` | `profiles.js` | the signed-in profile `{ user, role: 'user' \| 'admin', cloud, token }`; read once at start-up by `app.js` |
| `mf_profiles` | `profiles.js` | local profiles of this browser (name, salt, hash, last use) |
| `mf_act_<name>` | `profiles.js` | the history rows of one local profile (500 at most, `KEEP`) |
| `mf_guest_acts` | `profiles.js` | reading done before signing in (200 at most); adopted at sign-in |
| `mf_bugs_local` | `profiles.js` | error reports kept on this device (100 at most) |
| `mf_acct_url` | `profiles.js` | the accounts Worker address when you changed it in the Server tab |
| `mf_sync` | `profiles.js` | result of the last cloud sync `{ t, ok, err, sent }` |
| `mf_stateat_<name>` | `profiles.js` | when this browser last agreed with the cloud copy |
| `mf_autobug` | `profiles.js` | the switch "Send error reports to the admin automatically" |
| `mf_admin_dev` | `profiles.js` | this browser may show the admin Server tab on the sign-in screen |
| `mf_srv_ver` | `profiles.js` | the version number the accounts Worker answered last |
| `mf_t` | `app.js` (`selfCheck`) | a throw-away test value written and removed at once, to see whether the browser lets the page save anything |

### 7.6 Events between the files

`app.js` never calls the add-ons and the add-ons never reach into `app.js`; they talk with browser events on `window`. **Remove an add-on and nothing breaks.**

| Event | Sent by | Heard by | `detail` |
|---|---|---|---|
| `mf-activity` | `app.js` (`announce`) | `profiles.js` | `{ type, title, chapter, url, host }`: "a chapter was opened / read" (not sent when history is off) |
| `mf-store` | `app.js` (`store.set` of a personal list) | `profiles.js` | `{ key }`: the list that changed, so it can be copied to the cloud |
| `mf-bug` | `app.js` (`showError`) | `profiles.js` | `{ title, report, page }`: the error report |
| `mf-lists-changed` | `profiles.js` (after a pull from the cloud brought changes) | `app.js` | none: read `recent`, `books`, `reads` again and redraw the start page (round 30; before, the page was reloaded) |
| `mf-chapter-step` | `chapter-slider.js` | `app.js` | `{ dir: +1 \| -1 }`: next or previous chapter |
| `mf-reload` | `reload-wheel.js` | `app.js` | `{ scope: 'current' \| 'all' }`: reload this chapter (turn right) or every open chapter (turn left) |
| `mf-edge-jump` | `edge-slider.js` | `app.js` | `{ where: 'top' \| 'end' }` |
| `mf-settings` | `app.js` | `translate.js` | a full copy of the settings object; sent by `applySettings()` so the add-on always has the latest values |
| `mf-settings-set` | `translate.js` | `app.js` | `{ trTo, trFrom, trEngine, trAuto, showTranslate }` (only these 5 keys accepted); the language panel changed a value; app.js saves it |
| `mf-translate-problem` | `translate.js` | `app.js` | `{ message }` → calls `showError`; something failed that the bar alone cannot explain |

Globals made by `boot.js` (round 30): `window.MF_RELOAD(why)` (the one door for an automatic reload; refuses during a reload loop), `window.MF_LOOP` (set when the tab loaded 5 times in a minute). `app.js` sets `window.MF_LISTS_LIVE` (tells `profiles.js` that it may send `mf-lists-changed` instead of reloading). Names the files look each other up by: `window.MangaPDFLib` (pdfmaker.js), `window.MF_FIX` (troubleshoot-data.js), `window.MangaFlowSlider`, `window.MangaFlowWheel`, `window.MangaFlowEdge`, `window.MangaFlowProfiles`.

### 7.7 Keyboard (PC)

Reading mode only, and only when no dialog is open and the cursor is not in a text box (so typing is never stolen). Modifier keys are never taken (`Ctrl+Home` still belongs to the browser).

| Key | Does |
|---|---|
| `Esc` | closes the floating search bar (any screen); in reading mode closes the chapter menu, otherwise leaves reading mode |
| `F11` | full screen on / off (any screen; only if the full-screen buttons are on and the browser supports it) |
| `N` / `P` | next / previous chapter |
| `→` / `←` | next / previous chapter (only while Settings > Reading "Keys ← → change chapter" is on; setting `arrowKeys`) |
| `T` | light / dark theme |
| `C` | open / close the chapter menu |
| `Home` / `End` | jump to the top (and load an earlier chapter if there is one) / to the end of what is loaded |
| `↑` / `PageUp` at the very top | load earlier chapters (the page cannot scroll up, so no scroll event comes) |

### 7.8 The address of the page (what MangaFlow puts in and reads from its own web address)

| Part | Meaning |
|---|---|
| `?url=<address>` | open this site address inside MangaFlow (every link shown inside the page frame carries it, so Ctrl+click / middle click / "open in new tab" open **MangaFlow**, not the original site) |
| `?q=<words>` | run this search in MangaFlow's own search |
| `#r=<chapter address>` | the chapter you are reading (written while reading; a refresh reopens it in reading mode; removed when it cannot be loaded). Not written when history is off |
| `#p=<page address>` | the normal website page you were on (a refresh returns to it, without jumping into reading mode) |
| `#q=<words>` | the search you were on (a refresh runs it again) |

When the address holds one of these places, `boot.js` shows the cover `#resume` at once, and `endResume` removes it when the page, the reader or an error is on screen (round 29a, section 4.10).

### 7.9 What the code says about itself (the opening comment of every section, copied from `app.js`)

**§0 (line 41) — SECURITY BASICS  (round 7)**
```text
WHY: this is a browser-only site, so the protections are the ones a browser can do by itself:
     1. Anti-clickjacking: if another website shows MangaFlow inside its own frame (to trick clicks),
        we blank the page and open ourselves normally. (A header on your host is stronger, see _headers.)
     2. safeWebUrl(): only http(s) addresses are ever opened or fetched. javascript:, data:, file: ... are refused.
     3. Pages from other sites are cleaned (renderFrame) and shown in a frame WITHOUT scripts.
     4. A Content-Security-Policy in index.html stops any script that is not ours.
     5. Everything shown from the outside is written with textContent (never as HTML), so a manga title like
        "<img onerror=...>" is just text.
IMPROVE: add a "report a problem" link, and use Subresource Integrity if you ever load a library from a CDN.
```

**§1 (line 69) — SMALL HELPERS**
```text
WHY: $ / $$ shorten document.querySelector; `store` wraps localStorage in try/catch because
     it throws in private mode or when full.
HOW: every saved value gets the prefix "mf_" so we never clash with other sites' data.
IMPROVE: move to IndexedDB if you store lots of data (offline chapters).
```

**§2 (line 134) — SETTINGS + THEME**
```text
WHY: Remember the user's theme, width, button side and proxy list between visits.
HOW: `settings` starts with defaults, then saved values are copied over it.
     The proxy list is filled with the free defaults the FIRST time the site is opened
     (or when upgrading from the old one-proxy setting). After that the list is the user's own:
     removing a default does not bring it back, and "Reset to defaults" restores it.
IMPROVE: add font/zoom, "auto-start reading mode" and image-quality options.
```

**§3 (line 285) — FETCHING PAGES THROUGH A CORS PROXY**
```text
WHY: Without a proxy the browser blocks the request. We ask ALL proxies at the same time and the
     first good answer wins, with a timeout so a dead proxy cannot freeze the app.
     `{url}` is replaced by the encoded page address.
HOW: proxyList() builds the list. A local proxy at <this address>/proxy?url={url} is added automatically when
     the page itself is served from localhost (the test server in test/server.js does this; the old optional
     start-manga.bat helper did too, but it is NOT part of the uploaded files any more). POST requests (used for chapter lists) only go to proxies that
     are NOT in the free default list, because free public proxies cannot POST.
IMPROVE: remember which proxy succeeded last and ask it first; retry with back-off.
```

**§4 (line 495) — URL HELPERS**
```text
WHY: absUrl turns "/ch/12" into a full address; normalizeInput decides if the user typed a
     URL or a search; unwrap removes DuckDuckGo's redirect wrapper from search results.
IMPROVE: let users pick a search engine; handle sites that need a "Referer" or cookies.
```

**§4b (line 526) — SEARCH ENGINES   (ROUND 16)**
```text
WHY: DuckDuckGo's plain page sometimes answers a cloud proxy with a CAPTCHA ("are you a robot?"). MangaFlow must NEVER try
     to solve or get around a CAPTCHA (that would be unfair to the site and could break its rules). Instead it politely
     moves on to another FREE search engine, so searching still works like a normal search box.
HOW: ENGINES lists free engines that have a simple page without JavaScript. searchCandidates() puts the engine you chose
     first and the others after it. navigate() tries them one by one and stops at the first real result page.
     Google is NOT in the list: Google blocks proxies and its rules forbid automatic searching, so Google is never fetched
     through a proxy. (Round 16 opened google.com in a new tab; since rounds 18-28b Google answers INSIDE MangaFlow through
     YOUR Programmable Search panel or, with a key, the Google API - see section 18 and googleSearch.)
IMPROVE: add more engines (for example a SearXNG address of your own) by adding one line to ENGINES.
```

**§4c (line 584) — OWN RESULTS PAGE   (ROUND 17)**
```text
WHY: the engines' own pages need their scripts and style sheets, so inside the mini browser they looked broken, showed the
     wrong part of the page, or filled the screen with adverts. A clean list made by MangaFlow always fits the screen.
HOW: parseResults() reads the result links (title, address, short text) out of the engine page with a rule per engine and a
     general fallback; resultsPage() builds a small page of cards from them (nothing from the engine's page is run).
     "Original page" under the list still opens the engine's own page. Only the title and the first words of the text are
     taken; the real page opens when you tap a card.
IMPROVE: add more rules when an engine changes its page (the fallback keeps working meanwhile).
```

**§5 (line 733) — ERRORS (BIG POP-UP), TOAST, BUSY, LOADING BAR   (rewritten in round 8)**
```text
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
IMPROVE: add a "Retry" button that repeats the action that failed, and a "download report" button.
```

**§5b (line 1032) — POLITE REQUESTS (round 8)**
```text
WHY: a site notices a reader that asks for 50 pictures in the same second. Reading like a person (a few requests
     at a time, small pauses) is kinder to the site and much less likely to get you blocked.
HOW: gate(key, max, gap) hands out a "ticket". Only `max` tickets per key (one key per website) can be open at
     once and two tickets are at least `gap` ms apart (plus a random extra, so it does not look like a clock).
     When a site answers 429 / 503 ("too many requests") coolDown() makes everybody wait first.
LIMIT: this makes blocks LESS likely, it cannot promise they never happen. We never try to break bot checks.
IMPROVE: make the numbers settings; slow down automatically after each refusal.
```

**§6 (line 1082) — HISTORY: RECENT PAGES, CONTINUE READING, BOOKMARKS (start page)**
```text
WHY: lets users return to a manga quickly without retyping the address, and (new) go back to
     the EXACT chapter they were reading.
HOW: three saved lists.
     recent = pages you opened          { url, title, host, at }
     reads  = manga you were reading    { id, title, host, seriesUrl, chapterUrl, chapterLabel, at }
     books  = your bookmarks            { url, title }
     `at` is a time in milliseconds; timeAgo() turns it into "3 h ago".
IMPROVE: sync to a cloud database so history follows the user between devices; store the scroll
         position inside the chapter too.
```

**§7 (line 1222) — MINI BROWSER (address bar, back/forward, iframe)**
```text
WHY: shows the other website so the user can search/open a manga and choose a chapter.
     We sanitise the HTML (remove scripts, inline handlers) before putting it in the iframe.
IMPROVE: many modern sites render content with JavaScript and will look empty here. A
         server-side headless browser (Puppeteer) behind your proxy would fix that.
```

**§7b (line 1539) — MAKING OTHER SITES LOOK COMPLETE (round 15)**
```text
WHY: people open normal sites in the mini browser (not only manga). Some looked broken: unstyled, black boxes instead of icons.
     Reasons found: (a) a style sheet was refused when fetched directly (hotlink / Referer rules, mixed http), (b) an icon font
     needs a CORS permission its host does not give, (c) the site hides the page until a script shows it (we run no scripts, on
     purpose, for your safety).
HOW: 2.5 s after the page is shown we look at the live frame. Style sheets that did not load are fetched through your proxy and put
     into the page as <style> text (url(...) made absolute; font files sent through the proxy, which adds the CORS permission). If a
     font failed, all sheets are repaired that way. Then pageHealth() decides whether to show the "may look incomplete" notice with a
     copyable report. Scripts of other sites still never run.
LIMITS: pages built entirely by JavaScript (React, Vue ...) stay mostly empty: that is reported honestly, not hidden.
IMPROVE: also route background images, inline SVG sprites and @font-face "local()" fallbacks.
```

**§8 (line 2087) — CHAPTER + IMAGE DETECTION (the "guessing" part)**
```text
WHY: every manga site has different HTML. We use common-sense rules:
     - chapter links contain "chapter 12", "ch.12", "episode 3"... in the text or the URL
     - chapter images are the biggest group of <img> sharing one container
IMPROVE: this is the part most likely to need tweaks per site. Add a table of site-specific
         rules (CSS selectors per hostname), plus support for "c012" style URLs, and for sites
         that hide image URLs inside JSON/JavaScript (needs a headless-browser proxy).
```

**§8b (line 2641) — FINDING THE FULL CHAPTER LIST FROM A CHAPTER PAGE  (round 9)**
```text
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
IMPROVE: remember the series address per site so step 3 and 4 are skipped next time; add per-site rules.
```

**§9 (line 3495) — READING MODE - state + infinite chapter streaming**
```text
WHY: R holds everything about the current reading session. `gen` is a counter that lets us
     ignore results of a chapter that finished loading after the user already jumped elsewhere.
     An IntersectionObserver watches an invisible marker at the bottom: when it nears the
     screen we load the next chapter, so scrolling never ends until all chapters are done.
ROUND 6: chapters now load in BATCHES of BATCH (10) at the same time. When reading starts, chapter 1..10
     are all asked for together (the 10 boxes appear at once and each fills as soon as its page arrives).
     When you get close to the last chapter of the batch (updateCurrent) the next 10 start loading, so you
     never wait. The pictures themselves stay lazy (they load when you scroll near them) to save data.
IMPROVE: also load PREVIOUS chapters when scrolling up (needs scroll-position correction),
         make BATCH a setting, remove far-away chapters from the page to save memory on phones.
```

**§9b (line 3902) — THE KEEPER  (round 29d) - keeps the next chapters ready and heals failed pictures / chapters by itself**
```text
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
IMPROVE: show a small "N pictures still loading" indicator; learn which picture hosts need the proxy first; pause while a PDF download is running on a very slow line.
```

**§10 (line 3968) — CHAPTER NAVIGATION (dropdown list, prev/next, home/end)**
```text
WHY: goChapter scrolls to a chapter that is already loaded, loads it if it is the next one,
     or restarts the stream from it (jumpTo) when it is far away.
HOW: markInput() tells the scroll code "this scrolling was on purpose" (see section 11).
IMPROVE: when jumping far, keep earlier chapters collapsed above so scrolling up still works.
```

**§9b (line 4051) — READING UPWARDS: EARLIER CHAPTERS  (round 9)**
```text
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
IMPROVE: also remove far-away chapters at the bottom when many earlier ones are loaded (see Free memory).
```

**§10b (line 4161) — FREE MEMORY / CLEAR CHAPTER CACHE  (round 7)**
```text
WHY: with 30-50 chapters open, thousands of big pictures sit in memory and the page gets slow and jumpy.
     Clearing a range of chapters throws their pictures away but keeps the empty box (same height), so
     your scroll position does not jump.
HOW: freeSection() removes the pictures and puts a small notice in the box. The picture ADDRESSES stay in
     sec._imgs, so (1) when the box comes near the screen again restoreSection() rebuilds the pictures by
     itself (observer clearIO), and (2) a PDF download still knows the chapter.
     The chapter you are reading is never cleared. Optional automatic mode: settings.autoFree.
WHERE: buttons live in the Settings dialog (index.html #memBox) and are wired in section 15;
       the reader bar has a gear button and the chapter menu a "Free memory" entry that open that dialog.
IMPROVE: also drop far-away chapters that were never visited, show how many MB were freed.
```

**§11 (line 4258) — SCROLL TRACKING + AUTO-HIDING UI  (changed in round 2)**
```text
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
IMPROVE: make the 14 px and 1.5 s numbers settings; add a small "show buttons" handle at the screen edge.
```

**§12 (line 4425) — PDF DOWNLOAD (the "Download all chapters" button)**
```text
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
         the person pick a chapter range. Very large PDFs (hundreds of MB) can run out of memory on phones.
```

**§12b (line 4741) — DOWNLOAD RANGE DIALOG  (round 7)**
```text
WHY: a manga can have 100s of chapters. The person picks WHICH ones (1-50, 51-100, the rest...) and may split
     the result into several smaller files. Chapters that are not open in reading mode are fetched by the
     download itself, so any chapter of the list can be chosen.
HOW: two drop-downs (from / to), quick buttons made from the chapter count, and a "split" choice.
     "Make PDF" builds a job description (a plain snapshot) and hands it to queueDownload().
WHERE: dialog markup = index.html #rangeDlg; styles = style.css "RANGE DIALOG"; opened by #btnDl and #btnDlMenu.
IMPROVE: show an estimated file size, remember the last range, add "only chapters I have not downloaded".
```

**§12c (line 4993) — DOWNLOAD MANAGER + FLOATING DOCK  (round 7)**
```text
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
IMPROVE: pause / resume, a max-size limit per file, and save straight to disk (File System Access API).
```

**§13 (line 5423) — SEARCH BAR FOR SMALL SCREENS (floating bar)**
```text
WHY: on a phone the long address bar was squeezed next to six buttons and showed almost nothing.
     On narrow screens (CSS media query, 760px) the wide input is hidden and a "pill" takes the full row.
     Tapping the pill opens a floating bar with a big input, a Paste button and a Go button.
HOW: both inputs call the same navigate(). The popup closes on Go, on Esc, or when you tap outside.
IMPROVE: show suggestions (history) under the input; add a "search engine" switch.
```

**§14 (line 5439) — EVENT WIRING**
```text
WHY: one place that connects every button/key to the functions above.
IMPROVE: add touch gestures (swipe from edge = prev/next chapter) and a keyboard help
         overlay (press "?").
```

**§15 (line 5652) — SETTINGS DIALOG + PROXY LIST**
```text
WHY: the person can see which proxies are used, remove any (also the free ones), add their own
     (for example a Cloudflare Worker), test them, or go back to the free defaults.
HOW: settings.proxies is the saved list. renderProxyList() draws it; every button edits the list,
     calls applySettings() (saves) and draws again.
IMPROVE: drag to re-order, a "test on every start" option, and per-site proxy choice.
```

**§16 (line 5891) — START-UP + SAFETY NETS (round 8)**
```text
WHY: nothing should fail silently. These handlers send every unexpected crash and every blocked attack to the
     big error pop-up (section 5), so a problem is never just a line in a hidden console.
HOW: 1. "error" and "unhandledrejection" catch crashes and forgotten failures of async code.
     2. "securitypolicyviolation" fires when the browser's Content-Security-Policy STOPS something (for example a
        script that is not ours). That is the protection working, and you are told about it. Only script, plug-in,
        frame and form blocks are reported (style / picture blocks would only be noise). Browser add-ons are
        ignored, and at most 3 such pop-ups are shown per visit.
IMPROVE: add a small "problems log" page that lists everything caught, and a "send report" button.
```

**§17 (line 5947) — REPORTS, WATCHERS AND THE TROUBLESHOOTER  (round 11)**
```text
WHY: you asked that EVERY problem is visible and copyable (a page that does not load, a stuck download, no next chapter),
     and for a place in Settings that checks and repairs things by itself, with ready-made questions for Claude.
HOW: 1. watch(label, ms, details) = a timer; if the job is not finished after `ms` it shows a report. Call the returned
        function when the job ends.  2. noteFail() counts pictures that did not load per chapter and reports at 3.
     3. addNoNextButton() puts a "report" button on the last chapter. 4. selfCheck() lists what works; FIX.* are the repair
        buttons; autoFix() runs the safe ones in order. 5. diagnostic() makes the full text that goes into the Claude questions.
     Texts of the guide live in troubleshoot-data.js (window.MF_FIX).
LIMIT: a repair can only reset MangaFlow itself. It can not unblock a site, fix a dead proxy or log in for you.
IMPROVE: run selfCheck() by itself after 3 problems in a row, save the last results, test one chosen site on demand.
```

**§18 (line 6257) — ROUND 18: GOOGLE SEARCH, FULL SCREEN, TOP / END JUMPS, "REMEMBER MY PAGE"**
```text
WHY: (1) the owner built a Google Programmable Search Engine (cx in settings.googleCx) and wants it as the DEFAULT search, working like a normal
         search; (2) a full-screen button like F11; (3) the Top / End slider needs somebody to scroll; (4) a refresh on a normal website page used
         to drop you on the start page.
HOW: everything new lives in this one section so the older sections stay as they were (an earlier update once changed things nobody asked for).
     It sits BEFORE the start-up code on purpose: start-up may already call navigate(), which calls the functions below.
IMPROVE: when stable, split this section into its own file (like pdfmaker.js).
```

### 7.10 Recipes (where to change what)

* **Add a search engine:** one line in `ENGINES` (name + address function), its key in `ENGINE_ORDER`, its host in `SEARCH_HOST`, a row in `RESULT_RULES` (the host and which page parts are the results; without a row the fall-back reader is used), an `<option>` in `#engineSel` in `index.html`, and if the engine wraps links in its own redirect address, teach `unwrap` that pattern.
* **A site says "locked" / "removed" wrongly, or rightly:** `LOCK_RE` (words) and `mainText` (what part of the page is read for those words).
* **A site hides pictures in a new attribute:** nothing to do (`imgAddressInfo` takes any attribute that holds a picture address); if pictures are filtered wrongly look at `BAD_IMG` and `looksLikeImgUrl`.
* **A site's chapter list is in pages with another pattern:** `PAGER_RE` and `pagerLinks`.
* **A reading box is not found:** `READER_BOX` (names to look for) and `SIDE_BOX` (blocks that are not the chapter).
* **PDF quality or size:** `PDF_PROFILES` (the four qualities), `SLICE`, `BREAK_AFTER`, the limits in `estimate`.
* **How many chapters are kept ready / how long failed items wait:** `settings.preloadAhead` (Off / 3 / 5 / 9, `#setAhead`), `keeperAhead` (the limits for data saver and little memory), `healBase` (the base wait, hidden setting `healBaseMs`), `keeperTick` (the three jobs).
* **A new check-page phrase:** one word in `HUMAN_RE`; what the person sees is `humanCheckBox` (a page) and `verifyNote` (a chapter).
* **Which buttons stay in full screen on a phone:** the block "full screen" in `style.css` for `body.fs.fs-small`, and `SMALL_SCREEN` (what counts as a small screen).
* **A new message for people:** `explain` (technical words into a title and a hint) and `showError`.

---

## 8. The add-on files (optional extras)

**Why separate files?** Each add-on is one file plus one `<script>` line in `index.html`. If the file is missing or the line is deleted, the reader works exactly as before (the old keys come back). Each add-on:

* starts with `if (window.MangaFlowXxx) return;` so loading it twice builds it only once;
* keeps its variables private (one function that runs at once);
* carries **its own CSS inside the file**;
* talks to `app.js` **only through browser events** (section 7.6): `app.js` does not call the add-on, the add-on does not call `app.js`. `app.js` only checks whether the add-on exists (`window.MangaFlowSlider` …) to decide which round keys to hide (`applyAddons`).

| File | Window name | What it does | Event |
|---|---|---|---|
| `chapter-slider.js` | `window.MangaFlowSlider` | a small vertical slider, bottom RIGHT (76 px tall): drag the knob **down** and let go = next chapter, **up** = previous chapter; one chapter per drag | sends `mf-chapter-step` `{dir:+1 \| -1}` |
| `reload-wheel.js` | `window.MangaFlowWheel` | a ship's wheel, **TOP LEFT** under the title bar (round 20 place): half a turn to the right (≥ 150°) = reload this chapter, half a turn to the left = reload every open chapter; springs back | sends `mf-reload` `{scope:'current' \| 'all'}` |
| `edge-slider.js` | `window.MangaFlowEdge` | a small vertical slider, bottom LEFT (76 px tall): knob **up** = jump to the top, **down** = jump to the end; also on normal website pages (not on the start page) | sends `mf-edge-jump` `{where:'top' \| 'end'}` |
| `profiles.js` | `window.MangaFlowProfiles` | profiles with history and bookmarks, error reports to the admin, admin view, cloud sync | hears `mf-activity`, `mf-store`, `mf-bug` |

### 8.1 The three sliders and the wheel (they share one design)

1. The file builds its own HTML (a groove and a knob, or an SVG wheel) and its own CSS and adds them to the page.
2. `app.js` decides whether it is shown (Settings > Reading "chapter slider" / "reload wheel", Settings > Search & extras "Top / End slider") by adding the body classes `has-slider`, `has-wheel`, `has-edge` (or `no-…`); `style.css` does the hiding of the replaced keys. Switching an add-on off brings the old keys back at once.
3. The knob moves on the Y axis only, is limited to `MAX` = 26 px and springs back when you let go. If it was pulled at least `TRIGGER` = 17 px (the wheel: `TRIGGER` = 150°, `MAXTURN` = 210°) the file sends **one** event. Finger wobbles under `LOCK` = 4 px are ignored.
4. Keyboard: focus the knob and press ↑ / ↓ (the wheel: Enter = this chapter, Shift+Enter = all, or ← / →).
5. Flip a direction: `DOWN_IS_NEXT` (chapter slider) or `UP_IS_TOP` (edge slider) = `false`.

**Where they stand** (round 20 layout, default "buttons on the right"): the chapter slider bottom right, the Top / End slider bottom left, the reload wheel top left, the download pill and the full-screen icon in the top-right column. With "buttons on the left" they mirror. **IMPROVE:** make `MAX` / `TRIGGER` settings; vibrate on phones (`navigator.vibrate`); show the page position next to the Top / End knob; let a long pull scroll continuously.

### 8.2 `profiles.js` — profiles, history, bookmarks, reports (round 14, version number `VERSION = 3`)

**Why.** Several people can use one site; each profile has its own history, bookmarks, "continue reading" and recent pages, and an error report can go to the admin with one tap. **How.**

* The start page shows a profile chip (`#mfProfChip`) and the file builds its own window (`#mfProf`, a `<dialog>`). Signed out: tabs **Sign in** / **Create profile**. Signed in: **My history**, **Bookmarks**; the admin also gets **All profiles**, **Reports**, **Server** (the Server tab, with the address of the accounts Worker, exists **only** for an admin, or on a browser where an admin signed in before).
* A profile is a **name** (3–20 letters, digits, `.`, `-`, `_`) plus a **6-digit code**. The code is never stored as typed: a salted SHA-256 fingerprint is (browser, or sent over https to the Worker). The sign-up form says openly that history is saved and the admin can see it.
* **Two modes.** LOCAL (default, nothing to set up): profiles live in this browser (`localStorage`), the admin sees only this device; the first profile named `admin` becomes the admin of that browser. CLOUD: `cloudUrl()` = the built-in accounts Worker address (`ACCOUNTS_URL`, round 19: every visitor uses it without seeing it) unless an admin saved another one (`mf_acct_url`); profiles, history, bookmarks and reports then live on the server (section 9.2) and follow you to every device.
* **Sync** (cloud): the four lists go to the server about 3 s after a bookmark change and 8 s after history changes, when the page hides and on sign-out; after sign-in they are pulled and **merged** (union with the app's own keys and limits since round 30: `reads` by manga `id` (30 rows), `recent` by address (20 rows), `books` by address (300 rows); the newer row of the same key wins, rows with a time are newest first; a change from the cloud is applied in place with the event `mf-lists-changed`, never by reloading the page; "last writer wins" if two devices save at once). Reading done before signing in is kept (`mf_guest_acts`, 200 at most) and adopted at sign-in. Every sync writes `mf_sync`; Settings > Profile shows "saved 2 min ago" or the exact error, and **Sync now** pushes at once.
* After a sign-in / sign-out the page **reloads once**, so `app.js` starts with the right personal lists (`mf_u:<name>:books` …).
* Reports: `app.js` fires `mf-bug` for every error pop-up; a signed-in person sees **Send to admin** (or switches on automatic sending, at most one every 30 s). Not signed in, Settings > Troubleshoot > **Send report to server** uses the Worker's `/report` route.

**Honest limits.** A 6-digit code has a million possibilities: local mode locks a name for 10 minutes after 5 wrong tries, the Worker for 15. Anyone who controls a device can read its browser storage, so LOCAL mode is a convenience, not a vault. The accounts Worker address is in the page source (it is not a secret; the sign-in token and `ALLOWED_ORIGINS` protect the data). Only what MangaFlow itself reports is tracked (chapters scrolled into, downloads started).

**IMPROVE:** avatars; e-mail recovery; PBKDF2 hashing; a daily activity chart for the admin; merging bookmarks from two devices field by field; a share button; let the admin store the Worker address in the Worker so every device follows a change.

### 8.3 `translate.js` — Google Lens style translate (round 32)

The add-on reads the words in every manga page picture (using the Tesseract OCR engine via WebAssembly) and shows the translated words on top of the picture. It works exactly like Google Lens, but runs inside the browser, locally.

**How the add-on talks to `app.js`:**
* `app.js` sends `mf-settings` (a full copy of the settings object) every time any setting changes. `translate.js` reads the five translate keys from it.
* `translate.js` sends `mf-settings-set` when the user changes a translate setting in the floating panel (only the 5 translate keys are accepted by `app.js`).
* `translate.js` sends `mf-translate-problem` when the error bar alone is not enough (for example, the OCR files are missing); `app.js` calls `showError`.

**The button and the UI:**
* `#mfTr` — the round button (文A, "translate"), `position:fixed`, left edge, middle height, `z-index:29`. Only visible while `body.reading`.
* `#mfTrBar` — the status pill at the bottom (shows progress and error; Retry / Details / gear buttons).
* `#mfTrPanel` — the small panel (To / From / Engine dropdowns, "Translate again" button).
* `.mf-tr-layer` — a `div` placed on top of each `img.page`, one per image.
* `.mf-tr-b` — a translate bubble box inside the layer, one per speech bubble found on the page.

**The OCR files (`ocr/` folder):** Tesseract.js 5.1.1 is self-hosted (no CDN; works offline; no extra domain needed in the CSP). The `ocr/lang/` folder holds one `.traineddata.gz` file per language. The `ocr/core/` folder holds the WebAssembly engine (files ending in `-lstm.wasm` and the SIMD variant). See section 0b for the full list and how to add a language.

**Public API:** `window.MangaFlowTranslate = { version: 1, el, report, info, langs, _test }` — the same pattern as the other add-ons (`version:1`, `el` = the button DOM element, `report()` = a string for Troubleshoot, `info()` = live state, `langs` = the language lists, `_test` = pure functions exposed for unit tests).

### 8.4 Switching an add-on off or removing it

* **Off without deleting:** Settings > Reading (chapter slider, reload wheel) and Settings > Search & extras (Top / End slider, full-screen buttons).
* **Remove for good:** delete the file **and** its `<script src>` line in `index.html`. Nothing else changes. (Without `profiles.js` nothing is tracked and the profile chip disappears; without `troubleshoot-data.js` the troubleshooter uses its short built-in texts.)

---

## 9. The two Cloudflare Workers (not website files)

A **Worker** is a tiny program that runs on Cloudflare's servers (the free plan is enough). The two files are pasted into the Worker editor in the Cloudflare dashboard; they are **not** uploaded to GitHub Pages. Round 28 changed **no code** in either Worker (only a comment in `accounts-worker.js`), so the Workers you already deployed keep working as they are.

### 9.1 `worker.js` — the CORS proxy (`BUILTIN_PROXY`)

**Why.** A web page may not read another website directly (the CORS rule). The Worker fetches the page or picture for MangaFlow and adds the header that lets the browser read the answer. Free public proxies are slow and often blocked, so your own Worker is the dependable route.

**How a request looks:** `https://<your-worker>.workers.dev/?url=<address>` and optionally `&ref=<chapter address>` (sent as the Referer, because many picture hosts only answer what looks like it comes from the manga site), `&method=POST&body=<form text>` (for sites that fill a chapter list with a POST), and `?k=<TOKEN>` when you set a token. In MangaFlow the proxy is stored as a template with `{url}` where the page address goes.

**Variables at the top of the file (the only things you normally edit):**

| Name | Meaning | Default in the file |
|---|---|---|
| `ALLOWED` | list of web pages that may use the proxy, for example `['https://yourname.github.io']`. **Empty = anyone** (the answer then carries a warning header `X-MangaFlow-Warning`). Pages opened from a file on your computer send the origin `null` | `[]` |
| `TOKEN` | optional secret; when set, requests need `?k=<TOKEN>`. A token written in a web page can be read by anyone, so `ALLOWED` is the real lock | `''` |
| `MAX_BYTES` | largest answer passed on (80 MB). It is checked against the `content-length` the site announces; an answer with no announced length is not cut | 80 MB |
| `PER_MINUTE` | requests per visitor per minute (600; a 50-chapter download is many requests). Counted in memory, so it resets when Cloudflare restarts the Worker | 600 |
| `OK_TYPES` | answer types passed on: text, JSON, XML, JavaScript text, pictures, fonts, `application/octet-stream`; no `.zip` / `.exe` | a regular expression |

**What it does for every request:** answers only `GET` (and the browser's `OPTIONS` pre-check); refuses origins not in `ALLOWED` (403); refuses private and local targets (localhost, `10.x`, `192.168.x`, `127.x`, link-local, `100.64–127.x`, `.local`, `.internal`, private IPv6; this stops the proxy being used to reach private machines) and its own address; looks like a normal browser (User-Agent, Accept-Language); never passes cookies of other sites (`set-cookie` removed); removes `content-security-policy`, `x-frame-options` and `content-encoding` from the answer; adds `X-Content-Type-Options: nosniff`; asks Brave and Bing for English / US results with a small cookie sent only with that one request (round 19). **For pictures** (an address that looks like a picture, or an `Accept: image/…` request) it tries again with other Referer values (the one MangaFlow sent, the site root of that page, the picture host's own root, none) until one answers, and reports how many tries were needed in the answer header `X-MangaFlow-Tries` and the status the site really gave in `X-MangaFlow-Upstream`. Time limit 20 s per try: **504** = the site was too slow, **502** = could not connect, **415** = blocked file type, **413** = too big, **429** = too many requests, **403** = forbidden origin / token / target, **405** = not GET.

**Deploy (about 3 minutes, no coding):** (1) free account at `dash.cloudflare.com`; (2) Workers & Pages → Create → Create Worker → name it (for example `mangaflow-proxy`) → Deploy; (3) Edit code, delete everything, paste `worker.js`, Deploy; (4) copy the address (`https://mangaflow-proxy.<you>.workers.dev`); (5) in MangaFlow: Settings → Proxies → add `https://mangaflow-proxy.<you>.workers.dev/?url={url}` (with a token: `…/?k=<TOKEN>&url={url}`). The owner's own Worker is already built in as `BUILTIN_PROXY` in `app.js`.

**Redeploy (when `worker.js` ever changes):** open the Worker → Edit code → **first copy your own `ALLOWED` and `TOKEN` lines** → paste the new file → put your two lines back → Deploy. (The file in this project has `ALLOWED = []`; your live Worker may have your own list.)

**Honest limits / IMPROVE:** pages built entirely by scripts cannot be fetched this way (a headless-browser service would be needed); a site with a bot check, captcha or login still refuses (MangaFlow never works around that); add a cache (`caches.default`); use Cloudflare Access or rate-limit rules for stronger protection than the in-memory counter.

### 9.2 `accounts-worker.js` — cloud profiles (version 4, optional)

**Why.** Without it profiles live in one browser. With it every profile has its own history, bookmarks, "continue reading" and recent pages on every device, the admin can open every profile, and error reports are kept for the admin. **How.** A Worker plus a free **D1** database; the tables are created by the Worker itself on its first call (`CREATE TABLE IF NOT EXISTS`), nothing to type into an SQL console.

**Setup (about 6 minutes):** (1) Storage & databases → D1 SQL database → Create database (name `mangaflow`, any name works); (2) Workers & Pages → Create Worker → name `mangaflow-accounts` → Deploy → Edit code → paste `accounts-worker.js` → Deploy; (3) that Worker → Settings → Bindings → Add → D1 database → the variable name must be exactly **`DB`** → pick the database → Save; (4) Settings → Variables and Secrets → add the four below → Deploy again; (5) in MangaFlow: profile icon → Server tab (visible to an admin) → paste the address → Save → Test (it must say it is ready and the admin is set); (6) sign in with `ADMIN_USER` and `ADMIN_CODE`: you now see **All profiles** and **Reports**.

| Variable | Type | Meaning |
|---|---|---|
| `DB` (binding) | D1 | the database |
| `ADMIN_USER` | Text | the admin name (3–20 letters, digits, `.`, `-`, `_`); the admin lives in the variables, not in the table; that name cannot be registered by anybody else |
| `ADMIN_CODE` | Secret | the admin's 6-digit code |
| `ALLOWED_ORIGINS` | Text | pages that may use the Worker, comma separated, for example `https://yourname.github.io`. Empty = any page. Other pages get 403 |
| `PEPPER` | Secret | optional long random text mixed into the stored code fingerprints |

**Constants:** `MAX_ACTS` = 1000 history rows per profile (older ones are deleted), `MAX_BUGS` = 300 reports in total, `FAIL_LIMIT` = 5 wrong codes then the name is locked for `FAIL_SECONDS` = 900 s (15 min), `TOKEN_SECONDS` = 30 days per sign-in, `MAX_STATE` = 150 000 characters of saved lists per profile.

**Tables:** `users (name, salt, hash, created, last)`, `acts (id, user, t, type, title, chapter, url, host)` + index `acts_user`, `state (user, json, updated)`, `bugs (id, user, t, title, report, page)`, `tokens (token, user, role, exp)`, `fails (name, n, until)` (also used for the report limit, under the name `rpt:<ip>`). The code itself is never stored: only `SHA-256(pepper:salt:user:code)`.

**Routes.** Everything is a `POST` with a JSON body, except that a `GET` of `/ping` in a browser tab shows `{ ok: true, version: 4, note: … }` so you can **see** that the new file is deployed.

| Route | Who | Does |
|---|---|---|
| `/ping` | anyone | answers `ok`, whether the admin is set, and `version: 4` |
| `/register`, `/login` | anyone | create a profile / sign in; both answer `{ token, user, role }`; wrong codes are counted in `fails` |
| `/report` | anyone (not signed in) | a problem report from a visitor, stored as user `guest`; at most 3 per 10 minutes per visitor address |
| `/logout`, `/act`, `/me`, `/state/get`, `/state/put`, `/bug`, `/clear-me`, `/delete-me` | a signed-in profile (token) | write history rows (100 per call), read own history, read / write own saved lists, send a report, clear own history, delete own profile (not the admin) |
| `/admin/users`, `/admin/bugs`, `/admin/bug-delete`, `/admin/user`, `/admin/delete`, `/admin/reset` | the admin only | list all profiles with counts, list reports, delete a report, open one profile (history, lists, reports), delete a profile, set a new 6-digit code for a profile |

**Redeploy (when `accounts-worker.js` changes):** Edit code → paste the new file → Deploy. Bindings and variables stay. Open `<worker address>/ping` in a tab and check the version.

**Honest limits / IMPROVE:** a 6-digit code has only a million possibilities (protection = the 5-try lock, `PEPPER`, `ALLOWED_ORIGINS`); D1's free plan allows about 100 000 writes and 5 000 000 reads a day and 5 GB; PBKDF2 hashing on the paid plan; e-mail recovery; a daily clean-up with a Cron Trigger; per-day activity charts for the admin.

---

## 10. Tests

**Why.** A past update once changed something nobody asked for (the clear ✕ button broke again and again). These tests press the real buttons in a real browser, so a regression is caught **before** the files are sent. They are **not** part of the website: do not upload the `test/` folder to GitHub Pages.

**What is there (the whole suite; the old round 14–17 suite is gone, see section 13):**

| File | What it is |
|---|---|
| `test/ui.test.js` | the browser tests: 133 checks (all passing in the last full run) in 23 groups |
| `test/server.js` | a tiny web server on port 8765: it serves the project files, pretends to be the CORS proxy (`/proxy?url=…`) and the manga and search sites behind it (mock sites), and keeps a list of every proxied address at `/__log` |
| `test/page.jpg` | the picture the mock sites serve |
| `test/check-guide.js` | needs only Node.js, no browser: (A) checks that every file name, element id, function, constant, object path, storage key and event written in this guide exists in the files, and that the number of checks written here is right; (B) checks that every `#id` a script asks for exists and that no id is used twice (section 18) |

**Run it on your own computer:** install Node.js, then in the folder that holds `index.html`: `npm install playwright`, `npx playwright install chromium`, then `node test/ui.test.js`. A full run takes about 1.5–2 minutes and prints one `PASS` / `FAIL` line per check and `N/N checks passed`. The exit code is 0 only when everything passed. (`require('playwright')` is tried first; the long path at the top of the file is only the place it lives on the machine where the files were built.)

**Run it with Claude:** a full run is longer than one tool call may last, so start it in the background (`(nohup node test/ui.test.js > run.log 2>&1 &)`) and read the log. **Do not edit `app.js`, `index.html` or `style.css` while a run is going** (the tests load them live). `/__log` keeps every request of the whole run, so a check must look only at the part written after it started (`slice` from the length it noted before).

### 10.1 What the tests use instead of the internet

* **Mock sites** on `mock.test` (pictures on `img.mock.test`, search on `www.bing.com`): a demo manga (`/manga/demo/`, five chapters of four pictures), a WordPress-style reader (`/wp/chapter-1/` with a banner and a sidebar of pictures that must NOT be read as pages), form pages (`/form-post`, `/form-empty`, `/form-multi`, `/results`), and the **Init Manga** family copied from the owner's report about mgread.io: `/manga/<style>/chapter-N/` and `/manga/<style>/` with the styles `zenith` (lazy pictures with the address in an attribute MangaFlow did not know; 112 chapters in pages of 24; 7 pictures per chapter), `numbered` (no address anywhere, the first picture is numbered), `secret` / `sealed` (hidden pictures; `sealed` carries the theme's "encrypted chapter" marker), `nopics`, `locked` (the page itself says "locked … log in to read"), `sidebar` (`<body class="has-sidebar">`), `wrapped` (a cover grid inside the reader wrapper). Menu words ("Unlock Center"), comment words and `href="Previous sentence"` links are in these pages on purpose.
* **Flaky site** (`/manga/flaky/…`, pictures on `img.mock.test/flaky/…`, round 29): fails the first pictures and the first page loads of chapters 2 and up on purpose, so the keeper can be proved; `/__flaky` sets the numbers and `/__flakycount` reads how often each address was asked.
* **Shield site** (`/manga/shield/…`, round 29): answers chapter pages with a Cloudflare-style "Just a moment…" page (HTTP 403, or 200 / 503) while `/__shield?on=1&from=N&code=…` is set, and normally after `/__shield?on=0` ("the check is solved"); `/__shieldcount` tells how often each address was asked, which proves that the site is not hammered.
* **Fake Google:** `FAKE_CSE` (answers one result), `FAKE_EMPTY` ("No results"), `FAKE_NOMATCH` (a "No Results" note inside a box that has the normal result classes, as the real Google does), a blocked script, and a fake `googleapis.com/customsearch` answer for the API-key tests.
* **Fake accounts server** (`mangaflow-accounts…workers.dev`): keeps everything in memory so the tests can check what the page **sends**.
* The `google.com` home page is answered by a stub in the round 28b tests, so a failing run never touches the real internet.

### 10.2 The groups (generated from the test file)

| # | Group (the header in the test file) | Checks |
|---|---|---:|
| 1 | start-up | 3 |
| 2 | clear (x) button, mouse: start page box, navbar box | 5 |
| 3 | clear (x) with a TOUCH tap (phone) incl. popup box | 2 |
| 4 | Google search through the panel, result click opens inside MangaFlow | 6 |
| 5 | Google blocked: free engines take over | 1 |
| 6 | stale search: the LAST search wins | 1 |
| 7 | normal page + refresh returns to it (#p=) | 3 |
| 8 | reading mode: sliders geometry, edge slider, full screen | 19 |
| 9 | full-screen switch in Settings hides the buttons | 1 |
| 10 | ROUND 19: Google empty answer -> free engines; list page is not a chapter; built-in proxy; profiles + sync | 10 |
| 11 | ROUND 22: links open OUR site; Google through its API; full-screen icon hides on scroll | 8 |
| 12 | ROUND 27: bugs found by reading the whole code (B1-B4) | 4 |
| 13 | ROUND 28: the "Init Manga" kind of site (mgread.io) + Google "No Results" | 15 |
| 14 | ROUND 28b: Google WITHOUT an API key (the default since round 24) stays INSIDE MangaFlow | 4 |
| 15 | ROUND 28c: an engine address that cannot be loaded (e.g. Yahoo refusing the proxies) | 1 |
| 16 | ROUND 28d: inline event handlers of OTHER sites' pages must not open the red error pop-up | 3 |
| 17 | ROUND 29a: no flash of the start page when a page is reopened (refresh, closed and reopened browser) | 6 |
| 18 | ROUND 29b: the start-page Paste button pastes; ONLY the little arrow opens the clipboard list | 4 |
| 19 | ROUND 29c: full screen is different on a phone / small tablet and on a computer | 4 |
| 20 | ROUND 29d: the KEEPER - failed pictures / chapters retry by themselves, the next chapters are kept ready | 5 |
| 21 | ROUND 29e: a "verify you are human" page (Cloudflare style) is explained inside MangaFlow, never hammered, and retried when the person comes back | 5 |
| 22 | ROUND 30: the endless reloading after a reopen, the cover that never ends, and a chapter that is really the main page | 10 |
| 23 | ROUND 31 | 6 |

**`test/translate.test.js`** — 43 separate translate checks (run with `node test/translate.test.js`; last run: 43/43 passed):

| Group | Checks |
|---|---|
| A. File, button, Settings tab (T1–T8) | 8 |
| B. Pure functions: groupLines, tidy, usable, guessLang (T9–T14) | 6 |
| C. End-to-end: OCR → translate → overlay boxes (T15–T32) | 18 |
| D. No collision with wheel and sliders — computer + phone (T33–T34) | 4 |
| E. Missing or switched off: showTranslate off, translate.js absent, ocr files missing, services down, selfTest (T35–T41) | 7 |

### 10.3 All 133 ui checks (generated from the last run)

1. page starts without script errors
2. Google is the default engine
3. edge slider + wheel + chapter slider add-ons are present
4. clear x on the start page is on top (nothing covers it)
5. clear x on the start page empties the box (mouse)
6. …and the x hides again
7. …and the box keeps the focus
8. clear x in the address bar empties the box (mouse)
9. clear x on the start page empties the box (touch tap)
10. clear x in the phone search pop-up empties the box (touch tap)
11. Google panel opens with results for the typed words
12. the address bar shows the typed words
13. hash remembers the search (#q=)
14. a refresh reopens the same Google search
15. a Google result opens INSIDE MangaFlow (no new tab)
16. the Google panel closed after opening the result
17. when Google cannot load, the free engine results list appears
18. a slow OLD search does not replace the NEW one
19. hash remembers the normal page (#p=)
20. a refresh on a normal page returns to that page (not the start page)
21. …and does NOT jump into reading mode
22. reading mode: hash is #r= (chapter)
23. chapter slider knob is centred on its line (x)
24. chapter slider knob is centred in the slider (y)
25. Top / End slider is 30% shorter than the 108 px chapter slider (76 px)
26. Top / End knob is centred (x and y)
27. Top / End slider stands at the bottom of the LEFT edge
28. reload wheel is at the TOP LEFT, in the same row as the download pill; full-screen icon is under the pill and has the SAME size
29. chapter slider has the same 76 px height as the Top / End slider
30. full-screen icon button: icon only, no words
31. Top and End keys are hidden while the slider is on
32. dragging the Top / End knob DOWN scrolls to the end
33. dragging the Top / End knob UP scrolls to the top
34. Top / End slider OFF: slider hidden and the Top / End keys are back
35. chapter-menu text buttons for full screen are replaced by the icon in reading mode
36. full screen on: browser is in full screen and body.fs is set
37. full screen on (computer, round 29c): wheel, both sliders and the keys STAY (a phone hides them: see R29-11)
38. full screen on: title bar stays, and the SAME icon button (#fsRead) stays in place as the Exit button
39. Exit (icon) button leaves full screen and everything returns
40. leaving full screen the way Esc does clears body.fs
41. Full-screen switch OFF hides the navbar button
42. Google gives no results -> the panel is hidden and the free engines show a list (no empty page)
43. a home page of cover pictures is NOT opened as a chapter (stays a normal page)
44. built-in proxy is added to everybody's list once (and the own list is kept)
45. reading as a guest is kept in the guest list
46. Settings has a Profile tab that says the guest is not signed in
47. a guest sees NO Server tab and no server address
48. after the admin signs in, the reading done BEFORE signing in was sent to the server
49. the signed-in admin sees the Server tab and the own History / Bookmarks tabs
50. the admin's bookmarks are pushed to the server (state/put)
51. a report from a visitor who is not signed in reaches the server (/report)
52. links inside a shown page carry OUR address (?url=...) so Ctrl+click / middle click / new tab open MangaFlow
53. the page frame allows pop-ups (new tab) but still has NO scripts
54. Google API key set: results are MangaFlow's own list (no Google panel / pop-up)
55. …and the address bar shows the words, not an internal address
56. google.com/search address is searched inside MangaFlow (no new tab)
57. engine select still says Google after searching
58. API refused the key: the Google search box answers (no other engine)
59. full-screen icon hides while scrolling down and returns on scroll up
60. B1 WordPress reader: the 4 real pages, /uploads/ pictures kept, banner and sidebar covers skipped
61. B2 POST form is sent as POST (body q=hello reaches the site)
62. B3 form without action goes to the same page with ?q=abc
63. B4 GET form keeps both genre=a and genre=b
64. R28-1 chapter page of a paged site: the FULL chapter list (112 chapters) is found, not only 2
65. R28-2 lazy pictures whose address sits in an attribute MangaFlow did not know: all 7 pages of chapter 1
66. R28-3 pictures without any address: the 7 numbered pages are worked out from the first one (and no page 8 of any chapter is asked for)
67. R28-4 hidden pictures: page 1 is shown and the notice says "Only 1 of 7 pictures"
68. R28-5 menu and comment words ("Unlock Center", "log in to post", "has been removed") do NOT make a page with pictures "LOCKED"
69. R28-6 the report counts the empty slots, says lock words = false and does not take "Previous sentence" for the previous chapter
70. R28-7 series page that lists its chapters in pages of 24: all 112 chapters are collected
71. R28-8 Google says "No Results": the empty Google panel is closed and the free engines answer
72. R28-9 …and the results page tells WHY (Google only searches the sites listed in its control panel)
73. R28-10 a sealed (encrypted) chapter is NOT guessed: 1 picture, no request for pages 2-7, and the notice says the site hides them on purpose
74. R28-11 a chapter with no pictures and only menu / comment words says "no images", NOT "LOCKED"
75. R28-12 a chapter whose OWN text says "locked ... log in to read" is still reported as LOCKED
76. R28-14 <body class="has-sidebar"> does not hide the pictures: all 7 pages of chapter 1
77. R28-15 a cover grid inside the reader wrapper is not read as pages: exactly the 7 real pages
78. R28-13 "Copy my sites for Google" lists the sites you opened (mock.test/*) and not search engines or this app
79. R28-16 start-page Google button with NO API key: Google answers inside MangaFlow (panel open, no new tab, the words in the address bar)
80. R28-17 a pasted google.com/search address with NO API key is searched inside MangaFlow (panel open, no new tab, the words - not the Google address - in the bar)
81. R28-18 the "Google" chip under a results list (no API key): plain label without the arrow, opens Google inside MangaFlow, no new tab
82. R28-19 Google button with an EMPTY box: opens google.com in a new tab (nothing to search inside MangaFlow) and no Google panel
83. R28-20 an engine address that cannot be loaded (Yahoo refuses the proxies) shows the results page with the other engines, NOT a red error pop-up
84. R28-21 A: a blocked INLINE event handler (script-src-attr, as reported while reading kingofshojo.com) is counted quietly, no red pop-up
85. R28-21 B: a block that is OURS (a script file of an unknown host on MangaFlow's own page) still opens the pop-up
86. R28-21 C: index.html has no inline event-handler attribute (its own security rule would block it)
87. R29-1 refresh on a website page: the start screen is never on top, the page comes back, the cover is gone
88. R29-2 refresh on a search: the start screen is never on top, the results come back
89. R29-3 refresh while reading: no start screen and no half-way website page before the reader opens (computer)
90. R29-4 the same on a phone-sized screen
91. R29-5 a reopen address that cannot be loaded: the cover goes away by itself (never stuck)
92. R29-6 the saved dark theme is on before app.js has even loaded (no white flash)
93. R29-7 (computer) Paste button: the last copied text goes straight into the search box and no list opens
94. R29-8 (computer) Paste button when the browser refuses to share the clipboard: NO list opens; the box is focused and a message says what to do
95. R29-9 (computer) only the arrow opens the clipboard list, and it does not read the clipboard
96. R29-10 (computer) a row of the list fills the search box and closes the list
97. R29-7 (phone) Paste button: the last copied text goes straight into the search box and no list opens
98. R29-8 (phone) Paste button when the browser refuses to share the clipboard: NO list opens; the box is focused and a message says what to do
99. R29-9 (phone) only the arrow opens the clipboard list, and it does not read the clipboard
100. R29-10 (phone) a row of the list fills the search box and closes the list
101. R29-11 (computer) in full screen ALL the buttons stay: title bar, keys, wheel, both sliders, and the exit icon
102. R29-12 (computer) leaving full screen brings every button back
103. R29-11 (phone) in full screen EVERY button is hidden except the full-screen (exit) icon
104. R29-12 (phone) leaving full screen brings every button back
105. R29-13 (phone) on a website page, full screen hides the address bar and its buttons and shows only the Exit button
106. R29-14 (computer) pictures that failed twice come back by themselves (nobody pressed Retry)
107. R29-15 (computer) chapters whose page failed twice (HTTP 503) load by themselves, one after the other: all 10 chapters of the first batch show their pictures, no error box is left
108. R29-16 (computer) reading chapter 1 WITHOUT scrolling: the pictures of chapters 1-10 are all loaded in the background
109. R29-17 (computer) with "keep the next chapters ready" switched off the far pictures are NOT loaded in advance (saves data)
110. R29-18 (phone) pictures that failed twice come back by themselves
111. R29-19 a check page: the VERIFY box opens (not the red error pop-up) and offers to open the site; after the check is solved and you come back, the page opens by itself
112. R29-20 reading: chapters behind the check get their own box with "Open the site" / "I did it - try again"; no pop-up; the good chapters stay readable; the site is not hammered
113. R29-21 "I did it - try again" loads every chapter that was waiting for the check
114. R29-22 opening the site from a chapter box and coming back to MangaFlow loads the waiting chapters by itself
115. R29-23 phone, check answered with HTTP 200: the VERIFY box fits the screen (no sideways scroll, big buttons), no red pop-up, and Close works
116. R30-1 a signed-in profile whose cloud list is longer than this browser's: the page loads ONCE after a reopen (no reload loop), the cloud list is trimmed to what the app keeps
117. R30-2 a manga read on another device appears in "Continue reading" without reloading the page
118. R30-3 the same manga read on two devices is ONE row (the newest chapter), nothing is doubled, no reload
119. R30-4 a page that loads 5 times in a minute is reported (the pop-up names the number, the reasons and the profile) and automatic reloads are switched off
120. R30-4b a normal single reload still works (and is written in the reload reasons)
121. R30-5 a saved page that is slow to open: after a while the cover says so and offers "Open the start page", which works
122. R30-6 the same slow reopen ends in a REPORT (pop-up with the saved address and the proxies) and the cover is gone, so the person is never left waiting silently
123. R30-7 a chapter behind a login wall is reported as locked; the promo pictures and the cover around the wall are NOT shown as the chapter
124. R30-8 when the site sends the manga's MAIN PAGE instead of the chapter, MangaFlow says so and shows none of its pictures
125. R30-9 a page that does not exist (HTTP 404 from the site itself) is explained as "not found" and does NOT tell you to add your own proxy
126. R31-1 (phone) the progress line is at the very top edge of the screen in normal reading, in full screen and after scrolling down (even with a 32 px notch space)
127. R31-2 (phone) the title bar still keeps its notch space (nothing else moved)
128. R31-1 (computer) the progress line is at the very top edge of the screen in normal reading, in full screen and after scrolling down (even with a 32 px notch space)
129. R31-2 (computer) the title bar still keeps its notch space (nothing else moved)
130. R31-3 a chapter address that answers 404 only WITHOUT the final slash opens in reading mode (the other spelling is tried once)
131. R31-4 only ONE more request was needed (no hammering): the address as given, then the other spelling
132. R31-5 the same the other way round: 404 WITH the slash, the address without it works
133. R31-6 a page that is really missing (404 both ways) still says "not found", names the ORIGINAL address, and the site is asked only twice (as given, other spelling)

### 10.4 How a bug is handled (the rule since round 27)

1. Write a check that reproduces the bug and run it on the **old** code: it must **FAIL** for the reason you expect (not because of a typo).
2. Change the code (new code gets WHY / HOW / IMPROVE comments).
3. Run the check: it must pass. Then run the **whole** suite.
4. Also run `node --check` on every `.js` file, and (optional) ESLint with `no-undef` on: it finds a function that is called but does not exist.

### 10.5 Pitfalls that cost time before

* `#errbox` is a `<dialog>`: read the report from `#errText`'s value, not the dialog text.
* A check that waits for something must end in a **FAIL line**, never in a crash of the whole run (`.catch(() => false)`).
* A check that can pass for the wrong reason is useless: round 28 added checks that prove the opposite case too (a page that really says "locked" must still be reported as LOCKED).
* Mock results prove the **logic**, not the live sites.

### 10.6 What the tests do **not** prove (be honest about this when you report)

The live manga sites (including mgread.io), the real Google element and its sites list, the real Workers, real phones, and every site that sits behind a bot check. A green run means "the code does what the mock pages ask for"; a new kind of site is fixed from its **error report** (section 15).

---

## 11. The troubleshooter (Settings > Troubleshoot) and the error reports

**Why.** Sites differ and change; the owner is not a programmer. So every problem ends in something a person can **press** (a repair button) or **copy** (a report to paste into a question to Claude). **How.** The code is in `app.js` section 17 (`FIX`, `selfCheck`, `autoFix`, `diagnostic`, `renderGuide`); the guide **texts** are data in `troubleshoot-data.js` (`window.MF_FIX`), so a symptom or a question can be added without touching `app.js`. Without that file the checks and repair buttons still work and the guide is empty.

### 11.1 The card (`#fixBox`, tab `fix`)

| Button | Does |
|---|---|
| **Fix automatically** (`#fixAuto` → `autoFix`) | the safe repairs in order: reset caches and routes → test the proxies → (in reading mode) retry failed pictures, reload the chapter boxes that show a message, free memory when the heap is over 60 % → cancel stuck downloads → says "Done" and what to do next |
| **Run checks** (`#fixCheck` → `selfCheck`) | rows with ✅ / ⚠️ / ℹ️: online, `pdfmaker.js` loaded, PDF compression and WebP conversion supported, saving works, add-ons linked, every proxy answers (and how fast), failed pictures, chapter boxes with messages, download jobs, picture routes, memory |
| **Symptoms & answers…** (`#fixOpen` → dialog `#fixDlg`) | the guide: each symptom (`<details>`) with its theory, its repair buttons and **Copy question for Claude**; below it all ready-made questions (`#fixPrompts`, **Copy with my report**) and the last problems (`#fixRecent`) |
| **Copy full report** (`#fixCopy` → `diagnostic`) | the report starts with "MangaFlow diagnostic (build round 28)" and holds time, app address, browser, page open, reading state, proxies, settings, add-ons, search engine and Google ID, the last Google result, blocked hosts, profile + sync, picture routes, memory, downloads, the last four problems and the latest download report |
| **Send report to server** (`#fixSend`) | sends the report through `profiles.js` to the accounts Worker (`/report`, also for people who are not signed in; at most 3 per 10 minutes). Without `profiles.js` it says so instead |
| **Reset settings** (`#fixReset`) | asks first, then puts ALL settings back to their defaults and reloads the page; history and bookmarks stay |

### 11.2 The repair buttons (14; generated from the `FIX` table in `app.js`)

| Key | Button text | Used by symptoms |
|---|---|---|
| `reloadChapter` | Reload this chapter | `noimg`, `blank`, `partial` |
| `reloadAll` | Reload all open chapters | `one`, `nonext`, `order`, `listpage` |
| `clearCaches` | Reset caches and routes | `noimg`, `one`, `dlstuck`, `dlslow`, `dlmissing`, `dlall404`, `partial`, `listpage`, `reloadloop`, `notfound`, `progressline`, `bot` |
| `retryPictures` | Retry failed pictures | `blank` |
| `freeMemory` | Free memory | `slow` |
| `cancelStuck` | Cancel stuck downloads | `dlstuck` |
| `safePdf` | Use Small picture quality | `dlbig`, `dlslow` |
| `testProxies` | Test proxies | `blank`, `dlstuck`, `dlslow`, `dlmissing`, `p403`, `timeout`, `dlall404`, `partial`, `engine`, `proxyfree` |
| `openProxies` | Open proxy list | `noimg`, `p403`, `timeout`, `dlall404`, `proxyfree` |
| `openDownload` | Open the download window | `dlbig`, `dlmissing` |
| `resetEngine` | Reset search engine to Auto | `googlepanel`, `googlenone`, `engine` |
| `clearApiKey` | Clear Google API key | `googlepanel` |
| `resetProxies` | Reset proxies to defaults | `timeout`, `proxyfree` |
| `reloadPage` | Reload this page | `googlepanel`, `googlenone` |

Every button returns one line that says what happened (shown as a small message). `resetProxies` keeps your own proxies **and** the built-in Worker and adds the free ones back (an earlier version dropped the built-in Worker, so every page failed). Since round 27 the three Google-related repairs also update the control on screen, so it no longer looks as if nothing happened.

### 11.3 Symptoms (33; generated from `troubleshoot-data.js`)

Each row: the symptom as the person sees it, which repair buttons it offers and which ready-made question it points to.

| id | Symptom (as the person sees it) | Repair buttons | Prompt for Claude |
|---|---|---|---|
| `noimg` | Red box: "no images found on this chapter page" | `reloadChapter`, `clearCaches`, `openProxies` | `noimages` |
| `one` | It says "chapter 1 of 1" but the manga has many chapters, or the list stops at 24 / 20 / 12 | `clearCaches`, `reloadAll` | `chapterlist` |
| `nonext` | There is no next chapter at the end, or "next" jumps to the wrong place | `reloadAll` | `nonext` |
| `blank` | Grey boxes, or "Page N could not be loaded" | `retryPictures`, `reloadChapter`, `testProxies` | `blank` |
| `dlstuck` | The download stops at some page and does not move | `cancelStuck`, `clearCaches`, `testProxies` | `dlstuck` |
| `dlbig` | The PDF is too big | `safePdf`, `openDownload` | `dlbig` |
| `dlslow` | The download is slow | `clearCaches`, `safePdf`, `testProxies` | `dlslow` |
| `dlmissing` | The PDF has blocks saying "This page could not be downloaded" | `clearCaches`, `testProxies`, `openDownload` | `blank` |
| `order` | Chapters are in the wrong order, or one appears twice | `reloadAll` | `chapterlist` |
| `p403` | Report says "HTTP 403" from my workers.dev proxy | `testProxies`, `openProxies` | `proxy` |
| `timeout` | allorigins / codetabs "Failed to fetch" or "timed out" | `testProxies`, `resetProxies`, `openProxies` | `proxy` |
| `resume` | After refreshing, reading does not return to my chapter | - | `ui` |
| `dlall404` | Download report: every picture route fails (HTTP 404 / NetworkError) or the PDF is tiny | `clearCaches`, `testProxies`, `openProxies` | `blank` |
| `googlepanel` | Search shows a Google panel that stays empty / says Google could not load | `clearApiKey`, `resetEngine`, `reloadPage` | `ui` |
| `partial` | Only the first picture of a chapter shows ("Only 1 of 7 pictures ... could be found") | `reloadChapter`, `clearCaches`, `testProxies` | `noimages` |
| `googlenone` | Google says "No results" / "no match found" and the free engines answer instead | `resetEngine`, `reloadPage` | `ui` |
| `pastebubble` | Paste button still shows a small "Paste" bubble | - | `ui` |
| `fullscreen` | Full-screen button does nothing or is missing | - | `ui` |
| `edgeslider` | Top / End keys are gone (replaced by a slider) | - | `ui` |
| `listpage` | A website home page opened as "chapter 3 of 3" or shows thumbnails that do not load | `reloadAll`, `clearCaches` | `newsite` |
| `engine` | Search results are in another language, or the search engine I chose is not the one that answered | `resetEngine`, `testProxies` | `ui` |
| `profilesave` | My history or bookmarks are not saved to my profile | - | `ui` |
| `proxyfree` | Only my own proxy works, the free proxies time out | `testProxies`, `resetProxies`, `openProxies` | `proxy` |
| `slow` | The page gets slow or jumpy after many chapters | `freeMemory` | `ui` |
| `addons` | I do not see the slider or the reload wheel | - | `ui` |
| `locked` | The chapter asks for coins, a login or a premium account | - | - |
| `reloadloop` | The page keeps reloading (after closing and reopening the browser) | `clearCaches` | `ui` |
| `mainpage` | Reading mode shows random pictures (covers, banners) instead of the chapter, or says "the site sent the main page" | - | `ui` |
| `notfound` | A page or chapter says "not found (HTTP 404)" although the same site worked before (for example arenascan.com) | `clearCaches` | `ui` |
| `progressline` | The thin progress line is not at the very top edge of the screen (full screen on a phone, or while scrolling down) | `clearCaches` | `ui` |
| `human` | "Verify you are human" / "Just a moment..." (a check page), a chapter waits with "Open the site" | - | - |
| `bot` | "Just a moment", "bot check" or "HTTP 429" | `clearCaches` | `proxy` |
| `keys` | The buttons disappear while I read | - | - |

**Ready-made questions for Claude (11):** `noimages` (A site shows "no images found"), `chapterlist` (Chapter list is wrong (only 1 chapter / wrong order)), `nonext` (No next chapter / next goes to the wrong chapter), `blank` (Pictures do not load / pages missing in the PDF), `dlstuck` (The download is stuck or stops early), `dlbig` (PDF too big), `dlslow` (The download is too slow), `proxy` (Proxy problems (403, timeout, blocked)), `ui` (Something looks or behaves wrong in the reader), `newsite` (Add support for a new site), `improve` (Improve the website safely (general)). The word `{{REPORT}}` inside a question text is replaced by the full diagnostic when you press Copy.

### 11.4 Where the error pop-up comes from

`showError(message, { title, hint, details })` is the single door: a big dialog (`#errbox`) with a friendly title and hint (`explain` turns technical words into both), the copyable report (`#errText`), **Copy report**, **Troubleshoot** and, for signed-in people, **Send to admin**. A report starts with "MangaFlow error report (build round 28)". A site that says "no" (403 / 429 / bot check) gets **one pop-up per minute**, not one per chapter. Watchers open a report when a chapter takes more than 75 s, a page opens in more than 60 s, three pictures of one chapter fail, a download does not move for 90 s, or there is no next chapter. Where a pop-up would be wrong the app uses a calm note instead (for example the yellow "Only 1 of 7 pictures of Chapter 1 could be found …" under a chapter, which has **Retry**, **Open on the site** and **Details**).

### 11.5 Adding a symptom or a question

Copy one block in `troubleshoot-data.js`, give it a new `id`, write `title` (what the person sees), `why` ("Theory: …"), `fix` (names from the table in 11.2) and `ask` (the id of a question). To add a **new repair button** add an entry to `FIX` in `app.js` (`name: { label: '…', run: async () => '…one line…' }`) **and** use its name in a symptom, otherwise it is unreachable (this was a real bug in round 24, fixed in round 27). **IMPROVE:** a `site` field so the guide shows only the symptoms that match the site you are on; translate the texts; hide private addresses in the report.

---

## 12. History — every round, in order

**How to read this section.** The table gives one line per round, oldest first. Below it every round has an entry with the details: what was reported, the real cause, what was done and where. A line that starts with **Replaced later** says which part of that entry is *no longer true*; all such items are collected in section 13 ("do not bring back"). **If a history entry disagrees with sections 2–11, sections 2–11 are right.**

**How reliable is each part.** Rounds 1–8 exist only as short summaries from earlier chats; they cannot be checked against code. The entries for rounds 9–27 were copied from the previous guide: they were written when the work was done and keep their original wording, including the test counts of that time (those older test suites no longer exist; the one suite that exists now is described in section 10). The round 28 entry at the end was written from the real code and the real test run of this delivery, and every name in it is checked by `test/check-guide.js` (section 18).

<!-- story:start -->
### Overview (one line per round)

| Round | What happened |
|---|---|
| 1 | First reader like manhuatop.org: white/black toggle, upload chapters, auto sort by name, smooth scroll, tap to scroll, chapter dropdown, left/right arrow keys. Storage: Supabase + IndexedDB. |
| 2 | Any file type: JPG/PNG/WebP, CBZ, ZIP (auto unzip), PDF. Hosted on GitHub Pages. |
| 3 | An Oracle Cloud database for uploads (ORDS handlers, a BLOB table, delete protected by a key). Fixed 500 errors. This upload feature is **not** part of the current files. |
| 4 | **MangaFlow**: mini browser + reading mode, CORS proxy, chapter + image detection. Files then: index.html, style.css, app.js, worker.js, proxy-local.js, start-manga.bat (the last two are **not** delivered any more). |
| 5 | Series pages with script-built chapter lists (Madara `ajax/chapters/`), bars hide on scroll down / return on scroll up, free default proxies, mechanical keycaps, richer "Continue reading" history, PDF download (JPEG/PNG bytes copied untouched), mobile search pill, comments, a first guide. |
| 6 | Two chapter keys (up = previous, down = next), reload buttons, **10 chapters loaded at once** (`BATCH`), one long PDF page per chapter. |
| 7 | Choose which chapters to download (range dialog), floating download dock with live size, reading while downloading, "Free memory", security hardening (CSP, sandboxed frame, proxy rules, `_headers`). |
| 8 | One row of round 3D keys + End key, title/search bar inside reading mode, manga links open straight in reading mode, download dock above keys, pictures hidden in scripts, hotlink-protected pictures (`&ref=`), polite request gating, BIG error pop-ups with a copyable report. 41 browser checks. |
| 9 | Chapter-5 links reach chapters 1–4 (earlier-chapters engine), Thunder Scans family fixed, settings as a grid, progress line pinned to the top edge. |
| 9b | Reload keys left / arrows right, ✕ clear button, refresh keeps reading (`#r=`), Home button. |
| 10 | roliascan-type sites (numbered pictures next to the preview picture), download size estimate + stall protection + reports, Top key, the optional chapter-slider file, always-visible download button, redesigned start page. |
| 11 | Vertical chapter slider, 4 PDF qualities with size per quality, faster downloads, error reports for everything, click-outside closes windows, ship-wheel reload dial, digital reading mode, Troubleshoot tab. |
| 12 | Stuck-download fix (self-tuning speed, hard time limits), reload keys replaced by the wheel, download list fits phones, safe-area margins. |
| 13 | Top key fixed, wheel redesigned, leaner keys + slider, Settings switches for slider / wheel, profiles with 6-digit code + admin view (`profiles.js`, `accounts-worker.js`), blocked-site hint. |
| 14 | Cloud storage on Cloudflare **D1** (profiles, own history + bookmarks per profile, bug reports, admin sees all), slider knob centred, ✕ stays still, symbols-only keys, new corner layout, accent colour + keep-awake options. |
| 15 | Normal websites in the mini browser look complete (style sheets / icon fonts repaired through the proxy, async-CSS and noscript tricks), "page may look incomplete" notice with a report, Manga / Everything switch, domain typing, digital start page. |
| 16 | Search engine list with automatic fall-back (Bing, Mojeek, DuckDuckGo, Brave), CAPTCHA pages detected and skipped (never solved), Google button opened a new tab. |
| 17 | MangaFlow's own clean results list, Yahoo added, friendly failure page, ✕ fixed at 22 × 22, paste button + clipboard list. |
| 18 | Google Programmable Search inside MangaFlow (`#gview`), stale-search guard (`navSeq`), paste and ✕ fixes, `#p=` / `#q=` refresh, Top/End slider file, full screen, safer downloads, Worker retries pictures with other Referers, ONE combined guide. |
| 19 | Google drawn in our own panel (no pop-up), right-hand button column, admin history saved, sync, built-in accounts address, built-in proxy first, `engineStrict`, list pages (manhwafan), `/report`, polish. |
| 20 | More Google hosts in the page security rules, layout moves (Top/End slider bottom left, wheel top left), visible admin sync, accounts Worker version 4. |
| 21 | Full-screen exit icon, Google self-test (`googleDiag`), wildcard Google hosts, richer bug report. |
| 22 | Links open OUR site (`appLink`), optional Google API key, sync version check (`/ping`), full-screen icon hides on scroll. |
| 23 | Google stays Google (button, chip and pasted address searched in-app), quiet script blocks (`cspSeen`), 23b: key-less fall-back when Google closes the JSON API. |
| 24 | POST forms on pages, Troubleshoot repair buttons added, API key default emptied. |
| 25 | Dark-mode results readable, picture retry through the proxy. 25b: buttons and dropdowns on shown pages work again (only links are intercepted). |
| 26 | WordPress reader pictures (the claimed fix was wrong; corrected in 27). |
| 27 | Full audit: 6 bugs found by reading the code, each proved by a failing test first (63 checks). |
| 28 | mgread.io / "Init Manga" sites read completely (paged chapter lists, pictures without address, hidden address attributes, sealed chapters told honestly, false "LOCKED" removed), Google "No Results" detected + free engines + yellow explanation + "Copy my sites for Google", **28b:** Google button / pasted google.com/search address / results-page Google chip stay inside MangaFlow without an API key, messages stop mentioning `start-manga.bat`, this guide rebuilt from the real files, `test/check-guide.js`, 82 checks. **28c:** an engine address that cannot be loaded (Yahoo refusing the proxies) ends on the results page with the other engines, not a red pop-up. **28d:** inline on-click / on-load attributes of other sites' pages (kingofshojo.com) no longer open a red pop-up. |
| 29 | no start-page flash when reopening / refreshing (`boot.js` + cover `#resume`), the Paste button pastes at once (only the arrow opens the list), full screen hides every button on phones / small tablets but nothing on a computer, the next 9 chapters are kept ready and failed pictures / chapters are retried in the background by themselves (`keeper`), a Cloudflare "verify you are human" page is explained inside MangaFlow with "Open the site" / "I did it - try again" and an automatic retry when you come back (never solved, never skipped), 29 new checks. |
| 30 | the **endless reloading after a reopen** found, reproduced (8 page loads in a row) and fixed (profiles.js merge made stable, the cloud no longer reloads the page, a reload-loop guard and report in `boot.js` / `app.js`), a slow reopen gets a way out and a report, a login wall or the manga's **main page** is no longer shown as the chapter ("random images"), permanent chapter errors are not retried for ever, a site 404 is explained as "not found"; 10 new checks. |
| **31** | **(this build)** the thin **reading-progress line** is now always at the very top edge of the screen (it floated down inside the pictures in full screen on a phone with a notch, and while the title bar slid away), a page that answers **404 with one spelling of its address** (with / without the final slash, the arenascan.com case) is tried once more with the other spelling, two new troubleshooter symptoms; 8 new checks. |
<!-- story:end -->

<!-- story:start -->
### Round 9 — chapter-5 links, earlier chapters, settings grid
| # | Request | Done | Where |
|---|---|---|---|
| 1 | Keys horizontal, right corner | One horizontal row, bottom-right (see 9b for the final split with the reload keys). Setting "Reader buttons on the" = right (default) / left. Old saved settings are migrated once (`settings.ver < 9`). | `style.css` `#side`; `app.js` settings defaults |
| 2a | Errors on en-thunderscans.com (and arenascans.com) | Root cause found for the MangaStream / Thunder Scans family: the series link (`/comics/name/`) is **not** a path prefix of the chapter address, the chapter dropdown is empty, and the Prev/Next buttons are `#` placeholders — the real addresses are only inside the script (`ts_reader.run({... "prevUrl", "nextUrl", "sources":[{"images":[...]}]})`). New code reads those (`findNavLinks`), looks for the series page by link, by name and by typical addresses (`loadSeriesList`, `findSeriesLink`, `guessSeriesUrls`), and, as a last resort, builds chapters 1..N from the number in the address (`synthesizeChapters`). Chapters that turn out not to exist vanish quietly. A page that asks for a login / coins is reported as **LOCKED** instead of "broken" (`noImagesError`, `LOCK_RE`). The error report now also says: Next.js data present, ts_reader present, lock words, prev/next found, `/api/` hints (`diagnose`). | `app.js` section 8b, `analyze`, `fillChapter`, `explain`, `diagnose` |
| 2b | Chapter-5 link: cannot reach chapters 1–4 | Reading used to only grow downwards. New **earlier chapters** engine (`loadPrev`, `R.first`): scroll up near the top, wheel-up / finger-drag / Up / PageUp / Home at the very top, the "▲ Load earlier chapters" button, the up round key and Left arrow at the first loaded chapter. Chapters are inserted ABOVE and the scroll position is corrected so the picture on screen does not jump (browser scroll anchoring + a manual fallback for old Safari). | `app.js` section 9b, `goChapter`, `stepChapter`; `index.html` `#prevBar` |
| 3 | Progress line stays mid-page when the title bar hides | `#progress` was inside the bar. The whole bar now **slides up out of the screen** while you scroll down, and the 3 px progress line is pinned to the very top edge (it is outside the transformed bar). | `index.html`, `style.css` `#readerBar`, `#progress` |
| 4 | Beginner comments everywhere | Block comments (WHY / HOW / WHERE / IMPROVE) on every section and function in all files; see section 13 for the honest coverage. | all files |
| 5 | Settings must fit the screen, no scrolling, keep every option | Settings is now a **grid of four cards** (Proxies / Reading / Memory / Security). If the window is too small for all four, `fitSettings()` switches to **tabs** (one card at a time). Same options, same ids. | `index.html` `#settings`; `style.css`; `app.js` `fitSettings`, `showTab` |
| 6 | All files fresh + a full blueprint | All nine files are delivered again (including a new `start-manga.bat`) plus this file and a zip. | — |

**Replaced later:** the single horizontal key row at the bottom right (item 1) was rearranged in rounds 12, 14, 19 and 20 (today: `#btnTop` bottom-left, `#btnPrev` / `#btnNext` / `#btnEnd` bottom-right, each hidden while its slider add-on is on; sections 6, 8.1, 13). The four-card settings grid became 7 tabs (section 5). `start-manga.bat` is not delivered any more. Item 5 ("history cannot sync") is out of date: optional cloud profiles exist since round 14 (sections 8.2, 9.2).
<!-- story:end -->

<!-- story:start -->
### Round 9b — reload keys, clear button, refresh keeps reading
| # | Request | Done | Where |
|---|---|---|---|
| 1 | Only the arrow keys and End are a horizontal row in the right corner; **reload keys stay in the bottom-left corner** | `#side` is a click-through strip: `.kg-l` (↻, ↻ all) left, `.kg-r` (↑, ↓, End) right. Setting "left" swaps the groups. | `index.html` `#side`; `style.css` `#side .kg` |
| 2 | Error report from another site: `proxy 403, allorigins/codetabs timed out` | This is the **site refusing the cloud proxy** (usually bot protection on the site, which blocks Cloudflare-Worker and public-proxy addresses). It is shown as "The site is blocking MangaFlow". MangaFlow does not try to bypass protection; run `start-manga.bat` (your home connection) or open the chapter in your normal browser. See 11.3. | `explain()` |
| 3 | Progress line | as 2.1 #3 | — |
| 4 | **Clear (✕) button inside the search boxes** (paste a new link without deleting the old one by hand) | Three boxes (start page, phone search pop-up, reader bar) have a ✕ that appears only when there is text. | `index.html` `.inwrap/.clearx`; `app.js` bottom (wiring), `setAddress` |
| 5 | **Refresh in reading mode must not go home**; update history on every new chapter; see the last chapter on another device | While you read, the address of the page holds `#r=<chapter link>` (`rememberChapter`). On start-up `resumeFromHash()` reopens that chapter in reading mode. A new **⌂ Home** button in the reader bar and "✕ End reading" clear it (so only those go to the start page). Every chapter you scroll into is saved in "Continue reading" (`reads`). **Other device:** the history lives in each browser's `localStorage` and cannot sync by itself (there is no server). What does work: copy the page address while reading (it contains `#r=`) and open it on the other device — it resumes at that chapter. A real sync would need a small backend (idea in section 12). | `app.js` `rememberChapter`, `leaveReader`, `resumeFromHash` |
| 6 | Phone bar: manga title was squeezed | On screens ≤ 520 px the words "End reading" are hidden (only ✕ stays). | `style.css` `#btnExit .lbl` |

**Replaced later:** the two reload keys (`#btnReload1`, `#btnReloadAll`) were deleted in round 12; the reload wheel does their job. The advice "run `start-manga.bat`" (item 2) points at a file that is not delivered; since round 28 no message tells people to run it.
<!-- story:end -->

<!-- story:start -->
### Round 10 — roliascan-type sites, download size, chapter slider file
| # | Request | Done | Where |
|---|---|---|---|
| 1 | **roliascan.com**: "no images found on this chapter page" (report: 3 `<img>` tags, 20 scripts, nothing in scripts, no API hints, text only menu/login) | The pictures are added by JavaScript after the page loads, so the downloaded page has none. The page's preview picture (`og:image`) is page 1 of the chapter (`.../storage/chapters/<code>/001.webp`) and the other pages sit next to it with the next numbers. New fallback `probeNumbered()` asks for 001, 002, 003 … (6 at a time) and stops at the first missing number (max 300); each test tries an `<img>` first, then your own proxy with the chapter as referer. It is used only when normal detection finds nothing, in reading mode, in downloads and in `analyze` / `tryAutoRead` (a page with a chapter number in the address + numbered preview picture counts as a chapter page). The report now also lists og:image, the first `<img>` addresses, script files and whether the page says "loading" or "not available". `LOCK_RE` also matches "not available anymore / has been removed" → message "may be LOCKED or REMOVED". **Honest note:** a live fetch of that page showed only a "Loading chapter…" placeholder and "This content is not available anymore", so some chapters may simply be removed or hidden by the site; the fix covers sites whose pictures are numbered next to the preview picture. | `app.js` `probeNumbered`, `metaImageSamples`, `imgExists`, `analyze`, `tryAutoRead`, `diagnose`, `noImagesError` |
| 2a | **Download size** (15 chapters = 1 GB) — show the size BEFORE downloading | The download window now has a **picture-mode** choice and an **"Estimated size"** box. It downloads 4 sample pages, builds a throw-away PDF in the chosen mode and multiplies (pages of open chapters are known, the rest use the average). Above 400 MB it suggests and selects "a new file every N chapters (≈ 300 MB each)". Colours: orange > 300 MB, red > 700 MB. **Cause of the 1 GB:** WebP pages were stored as raw pixels ("lossless"). The default is now **JPEG 92 %** (about 5–10× smaller, looks the same; JPEG/PNG pages are still copied untouched); old settings are moved once (`settings.ver < 10`). | `app.js` `measure`, `estimate`, `scheduleEstimate`, `PDF_Q`, `addPageImage(..., mode)`; `index.html` `#rgMode`, `#rgSize` |
| 2b | Download **stopped after 2 of 10 chapters** with no message | The exact cause was not visible (most likely memory: a huge PDF in the browser, or a site slowing down). Now: every picture has a 150 s limit; a chapter that crashes unexpectedly is marked missing and the next one continues (3 crashes in a row stop the job); a **watchdog** shows a pop-up if nothing moves for 90 s; every step goes into a **diary** (`job.log`); ANY failure / stall / "saved with missing pages" shows the big pop-up with `jobReport()` = job facts + last 45 diary lines + JS memory use + failed list. | `app.js` `jlog`, `jobReport`, `runJob`, `buildPart` (`doChapter`) |
| 3 | An error report for EVERYTHING | Page-load failures (`navigate`), any chapter failure (once per site and kind), failed pictures (**Details** button on the "Page N could not be loaded" box), downloads (above), crashes and security blocks (round 8) all open the big pop-up with a copyable report. Bot/403/429/503 keep their own pop-up. | `showError` callers |
| 4 | Go-to-top key beside the reload keys | `#btnTop` (⇧ top), same round 3D style, left group; the Home key does the same and the key "presses" visibly. | `index.html`, `app.js` |
| 5 | **Separate horizontal slider file** (like the attached cross-slider, X axis only) at the middle of the right edge to change chapter one at a time; visible only when the file is linked | New file **`chapter-slider.js`**, linked by ONE `<script>` line in `index.html`. It builds its own HTML + CSS, shows only in reading mode (`body.reading`), fades while scrolling (`body.scrolling`), moves the knob on X only (±38 px, spring back), and when released past 26 px sends the browser event `mf-chapter-step` with `detail.dir` = +1 (next) / −1 (previous): **one chapter per drag**. `app.js` listens (`stepChapter`). Delete the file or the script line → no slider, nothing else changes. Keyboard: focus the knob, ←/→. Sets `window.MangaFlowSlider`. | `chapter-slider.js`; `app.js` `mf-chapter-step` |
| 6 | Download button always visible like the arrow keys, hides on scroll, minimised, highlight only while downloading | `#dock` is shown whenever you read (even with no job), minimised, class `ui-hide` (fades while scrolling down). Idle = a small round ⬇ (tap = open the download window). While a job runs: filling ring, bobbing arrow, pulsing glow and a count; green = PDF ready, red = failed. | `index.html #dock`; `style.css`; `app.js` `syncDock` |
| 7 | Clear (✕) button smaller and fixed | 22 × 22 px, pinned by `.inwrap .clearx` (a more specific rule than the search-bar button rules). | `style.css` |
| 8 | Comments on all lines | All new code (the slider file, estimate, watchdog, probing, start page) has WHY / HOW / IMPROVE on every block and on most lines; see section 13 for the honest overall coverage. | all files |
| 9 | Digital, friendlier home page | Hero card (animated gradient) with a search form (Paste + Read + ✕), status chips (local launcher / own proxy / free proxies only; slider add-on on/off; Settings), a 3-step "how it works" row, and history / bookmarks as cards with coloured letter tiles. Plain HTML / CSS / JS. | `index.html #start`; `style.css`; `app.js` `renderStart`, `renderStatus`, `item` |
| 10 | All files fresh + this blueprint | All ten files + the zip are delivered again. | — |

**Replaced later:** the horizontal chapter slider at the middle of the right edge (item 5) became a vertical slider in round 11 and sits bottom right since round 19; the default "JPEG 92 %" PDF mode (item 2a) became four qualities in round 11 (default Balanced); the 150 s limit per picture (item 2b) was replaced by 20 s per try and a 70 s limit per picture (rounds 11–12). The start-page chip texts about a "local launcher" describe the old helper (section 14).
<!-- story:end -->

<!-- story:start -->
### Round 11 — vertical slider, 4 PDF qualities, speed, wheel, Troubleshoot tab
| # | Request | Done | Where |
|---|---|---|---|
| 1 | Chapter slider becomes **vertical**, at the bottom of the right corner **above the End key**; remove the "up and down arrow keys"; change nothing else | `chapter-slider.js` version 2: `#mfSlider` 56 × 150 px, centred above the End key (`right`/`bottom` computed from `--mfedge`, `--mfkey`). Drag DOWN = next chapter, UP = previous (`DOWN_IS_NEXT = true`); MAX 38 px, TRIGGER 26 px; text labels PREV / NEXT; sends `mf-chapter-step`. While the file is linked it sets `body.has-slider`, which **hides the two ↑/↓ chapter keys** (`#btnPrev`, `#btnNext`) and moves the download dock to the left of the End key. Left/Right keyboard keys, N/P and the chapter menu still work. Delete the one CSS rule `body.has-slider #btnPrev,#btnNext{display:none}` to bring the keys back. | `chapter-slider.js`; `style.css` round-11 block |
| 2 | PDFs too big even with "smaller"; find the bloat; several quality options; keep one chapter = one page | Four profiles (`PDF_PROFILES`): **Original** (JPEG q 0.92, JPEG + PNG kept), **Balanced** (q 0.82, default), **Small** (q 0.72, max width 1100), **Tiny** (q 0.60, max width 800). Bloat causes found and removed: (a) WebP / GIF / AVIF were stored as raw pixels in the old "lossless" mode; (b) a re-encoded picture was kept even when bigger. Now a re-encoded JPEG/PNG is used **only if smaller than the original** (`total >= bytes*0.97` → keep the original bytes). Canvas slices of 2000 px; `imageSmoothingQuality = 'high'`. `pdfmaker.js` still writes one tall page per chapter. | `app.js` `PDF_PROFILES`, `addPageImage(pdf, bytes, mode)`; `index.html` `#rgMode`, `#setPdf` |
| 2b | Show the size per quality | `measureAll()` downloads up to 4 sample pages once, encodes them in all 4 qualities and caches the result (`estCache.all`). `estimate()` writes "about NN MB" onto every `#rgMode` option, colours the box (orange > 300 MB, red > 700 MB), suggests the next smaller quality and a split into files above 400 MB. The chosen quality and estimate travel with the job (`spec.mode`, `spec.est`) and appear in the job report. | `app.js` `measureAll`, `estimate`, `lastEstimate`, `rgGo` |
| 3 | Download speed too slow now | Troubleshoot found: only 3 chapters of look-ahead, a per-host gate of 4, dead routes tried again and again, no overall deadline. Fixes: `AHEAD = 8` (was 3); gate 6 per host with a 40 ms gap; **route health** (`routeStats`, `routeBreaker`: a route that fails 3 times in a row for a host is skipped for 60 s); 20 s per try and a 70 s `DEADLINE` per picture; 429/503 are not counted against a route; 1.2 s pause between rounds; the next chapter's picture list is **prefetched** (`nextList`). Quality and size were not touched. Honest measure on the mock site: 6.4 s → 4.8 s; on real sites the gain depends on how many requests used to fail. | `app.js` `fetchBytes`, `buildPart`, `routeStatText` |
| 4 | Error report for everything; Copy report stays; floating windows close on an outside click | `errLog` ring (last 20); header "round 11"; `watch(label, ms, details)` timers (chapter load 75 s, page open 60 s) → report; `noteFail` (3 failed pictures in one chapter → one report); **"no next chapter"** report (button on the last chapter's `.ch-end`, auto pop-up once per site when the list holds only 1 chapter); online / offline toasts. All `<dialog>`s close when you press **and** release outside them; the download dock goes back to its minimised state on a press outside it. | `app.js` section 5, `fillChapter`, `navigate`, `addNoNextButton`, `showNoNext`; outside-click handlers |
| 5 | The pasted stuck download (manhuatop.org, chapter 4 of 10, 12 failed pages, "Failed to fetch" on every route in bursts of 3, STALL after 90 s) | Reading of the report: **every route failed at the same moment, in bursts** → the network dropped or the host rate-limited. The cause could not be reproduced here. Now: a failed picture gets up to 2 retries after 4 s / 12 s (`waitFor`, cancellable) unless `job.deadRun >= 5` (then the job stops with a clear report instead of looping); the route breaker stops hammering dead routes; the report lists quality, estimate, speed (pages/min) and route health. | `app.js` `buildPart`, `jobReport`, `waitFor` |
| 6 | Digitalise reading mode a little, more friendly, not too different | Glass bar with a gradient underline, accent progress line with glow, chapter card with gradient top border, number pill, dashed end divider, ring on key hover, mono `#rSub` chip, thin scrollbar, a one-time tip (`readingTip`, `mf_tip11`). Layout unchanged. | `style.css` round-11 block |
| 7 | Ship's steering-wheel dial, middle of the LEFT edge: ~180° one way reloads this chapter, the other way reloads all | New optional file `reload-wheel.js` (SVG wheel: rim, 8 spokes, 8 handles, hub; 76 px, 64 px on phones). Angle by `atan2` with shortest-way delta; TRIGGER 150°, MAXTURN 210°; cyan ring clockwise, magenta anti-clockwise; **clockwise = this chapter (`'current'`), anti-clockwise = all (`'all'`)**; springs back; keyboard Enter / Shift+Enter / arrows; vibration. Sends `mf-reload {scope}`; `app.js` listens. Sets `window.MangaFlowWheel`. Mirrors if `data-side=left`. | `reload-wheel.js`; `app.js` `mf-reload` |
| 8 | Comments (why / what / how to improve) on all lines of all code | Comments inserted above code lines by a script (JS is re-parsed and the syntax tree must be identical, so no code changed). Honest coverage in section 13. | all code files |
| 9 | New MD that does not mark old things wrongly | This file; section 3b lists what was replaced. | `MANGAFLOW.md` |
| 10 | Troubleshoot tab in Settings that fixes errors automatically, with example queries for Claude and several made-up theories | 5th settings tab **Troubleshoot** (`#fixBox`): **Fix automatically** (`autoFix`), **Check** (`selfCheck`), list of results, **Open guide** (`#fixDlg`: 17 symptoms, each with several possible causes and a fix button; 11 ready-made prompts for Claude with `{{REPORT}}` replaced by the live report; recent errors), **Copy diagnostic**, **Reset**. Actions (`FIX`): reloadChapter, reloadAll, clearCaches, retryPictures, freeMemory, cancelStuck, safePdf, testProxies, openProxies, openDownload. Texts live in `troubleshoot-data.js` (`window.MF_FIX = {SYMPTOMS, PROMPTS}`); the red error window has a "🔧 Troubleshoot" button (`#errFix`). | `app.js` section 17; `troubleshoot-data.js`; `index.html` |

**Test result round 11: 103 checks, 0 failed** (78 earlier + wheel, outside click, troubleshooter, no-next report, quality sizes + retry). Synthetic test images: Original 512 824 B, Balanced 483 796, Small 333 220, Tiny 304 285; on a coloured test page Balanced ≈ 53 % and Tiny ≈ 21 % of Original.

**Replaced later:** slider 56 × 150 px with MAX 38 / TRIGGER 26 (now 76 px tall, 26 / 17); the wheel at the middle of the left edge (now top left, round 20); `AHEAD = 8` and a fixed gate of 6 (now `AHEAD = 6` and a self-tuning `hostLimit`, round 12); five settings tabs (now seven); the "103 checks" belong to a test suite that no longer exists.
<!-- story:end -->

<!-- story:start -->
### Round 12 — stuck download, wheel moves, phone layout
Report that started the round: manhuatop.org "Lord Baby Runs A Romance Fantasy With Cash", chapter 1 of 10, page 19 of 31, "trying again…", STALL after 90 s. Reading of the report: route health was `direct ok 1 / fail 29`, `allorigins ok 0 / fail 20`, `codetabs ok 0 / fail 20`, `weserv ok 0 / fail 18`, own Worker `ok 58 / fail 28` (a phone on a mobile network). So only the own Worker worked and a third of its requests died with "Failed to fetch"; between +455 s and +877 s nothing happened.

| # | Request | Done | Where |
|---|---|---|---|
| 1 | Download still stuck | (a) `gate()` waited without limit (a long cool-down or a lost ticket froze the job): after 25 s it now goes on; `coolDown` is capped at 20 s. (b) The retry fetch had no hard limit: wrapped in `withLimit(..., 100 s)`. (c) **Self-tuning speed**: `hostLimit` (pictures at once per website, 6 → minimum 2) drops by 1 when the route that normally works fails and rises again after 6 good ones. (d) Dead routes: a route blocked once is blocked again after ONE more failure, for 60 s, 120 s … up to 10 min (`strikes`). (e) `AHEAD` 8 → 6. Honest: the real cause on the phone (weak network, host limits) cannot be removed by code; the app now slows down by itself and can no longer wait for minutes without a limit. | `app.js` `gate`, `coolDown`, `fetchBytes`, `buildPart`, `hostLimit`, `withLimit` |
| 2 | Download tab not aligned on mobile | The dock sits beside the End key, so its 380 px list was pushed off the screen. On screens up to 700 px the open list is now a **bottom sheet** (8 px from both sides, above the key row); safe-area margins on both sides; dialogs never wider / taller than the screen. | `style.css` round-12 block |
| 3 | Files in a separate folder cannot be uploaded to GitHub | All files are sent one by one (no zip, no folders). Website files go in the repo ROOT; `test/` and `MANGAFLOW.md` are optional. | delivery |
| 4 | Remove reload / reload-all keys, wheel bottom-left | `#btnReload1`, `#btnReloadAll` deleted from `index.html`; the wheel sits at the bottom-left corner (`left:12px`, same baseline as the keys, 72 px; 60 / 54 / 50 px on phones / tiny / sideways); the Top key sits beside it (`body.has-wheel`, `--mfw`). Tip bubble above the wheel. Clockwise = this chapter, anti-clockwise = all (unchanged). | `index.html`, `reload-wheel.js`, `style.css` |
| 5 | Every interface aligned on every device | `max(12px, env(safe-area-inset-*))` margins, dock `max-width`, sheet for the list, wheel size steps, dialogs capped. Tested at 1100 px and 360 px. | `style.css`, `reload-wheel.js` |
| 6 | Fix anything missed | Test suite adapted (keys list, wheel position) and extended with a 360 px phone check. | `test/e2e-test.js` |
| 7 | All files + new MD | This file; sent unzipped. | — |

**Test result round 12: 104 checks, 0 failed.**

**Replaced later:** the wheel in the bottom-left corner moved to the top left in round 20; item 3 ("all files unzipped") is now "every file separately AND one zip" (owner request, round 28); `test/e2e-test.js` does not exist any more (the suite is `test/ui.test.js`).
<!-- story:end -->

<!-- story:start -->
### Round 13 — Top key, leaner keys, add-on switches, profiles
Report that started the round: reading `manhuaus.com`, then a link to `comix.to` failed: "no proxy could load it — own Worker HTTP 403 | allorigins Failed to fetch | codetabs timed out". Reading of it: the **site refuses cloud addresses** (HTTP 403 from the own Worker = bot protection). On a phone nothing inside MangaFlow can change that, and comix.to builds its pictures with scripts (not supported). `explain()` now says this explicitly when the own Worker got 403.

| # | Request | Done | Where |
|---|---|---|---|
| 1 | Error from another site | See above: honest hint added; report header is now "round 13". | `app.js` `explain`, `showError` |
| 2 | Top key not working; remove the "reload" title on the wheel; digitalise | `goTop()`: instant jump (a smooth scroll over many long chapters stopped half way), repeated on the next 2 frames (lazy pictures move the page), loads earlier chapters when there are any (same as the Home key). The wheel lost its RELOAD caption, got a digital tick ring, dashed inner ring, neon glow, pulsing core, size 64 px (56 / 50 / 46 on small screens). | `app.js`, `reload-wheel.js` |
| 3 | Slider and End / Top keys smaller ("lean") | Keys 50 → **40 px** (38 ≤ 520 px, 34 ≤ 370 px), lighter shadow; slider 56 × 150 → **40 × 120 px**, knob 30 px, MAX 36 / TRIGGER 24; all dock offsets follow the new key size. Everything else unchanged. | `style.css`, `chapter-slider.js` |
| 4 | Setting to make slider and wheel invisible and disabled | Settings → Reading: **Chapter slider** and **Reload wheel** check boxes (`showSlider`, `showWheel`, default on). `applyAddons()` sets `body.no-slider / no-wheel` (CSS `display:none !important`) and sets `has-slider / has-wheel` only when the file is linked AND the switch is on, so with the slider off the ↑/↓ chapter keys come back by themselves. | `app.js` `applyAddons`; `index.html`; `style.css` |
| 5 | Is the .bat needed? | **No.** The website is only HTML + CSS + JS (+ the Cloudflare Worker you already have). `start-manga.bat` + `proxy-local.js` are an OPTIONAL Windows helper (needs Node.js) that reads sites from your home connection, which blocked sites trust more. They do nothing on a phone or on GitHub Pages. Do not upload them to GitHub. | — |
| 6 | Profile icon on the home page, user name + 6-digit code, tracking of files accessed, admin profile that sees all profiles | New optional file **`profiles.js`** (icon in the start card, window with Sign in / Create profile / Server, My history with search + filter + Open + Export + Clear + Delete, **admin tab "All profiles"** with counts, active-24 h, per-profile history, reset code, delete, export all). `app.js` only sends the event `mf-activity` (`announce()`); no `profiles.js` = nothing is tracked. Two modes: **LOCAL** (default; profiles inside this browser; the first profile named `admin` is the admin of that browser) and **CLOUD** (paste the address of **`accounts-worker.js`**, a second Cloudflare Worker with a KV namespace named `PROFILES` (**REPLACED in round 14 by D1, see 3b**); variables `ADMIN_USER`, `ADMIN_CODE`, optional `ALLOWED_ORIGINS`, `PEPPER`; then profiles work on every device and the admin sees ALL profiles). The sign-up form states openly that history is saved and the admin can see it. The admin is not tracked. | `profiles.js`, `accounts-worker.js`, `app.js` `announce` |
| 7 | MD file again | This file. | — |

**Test result round 13: 114 checks, 0 failed** (round 12: 104; new [27] covers the icon, create / sign in / wrong code / invalid code, history per profile, admin list + profile view, and the two switches).

**Profiles — facts to remember**
* `localStorage` keys: `mf_profiles` (`{users:{name:{salt,hash,created,last,role,fails,until}}}`), `mf_act_<name>` (history, newest last, max 500), `mf_session` (`{user,role,cloud,token?}`), `mf_acct_url` (Worker address).
* History item: `{t, type:'read'|'download', title, chapter, url, host}`. `read` is sent when you scroll into a new chapter (same chapter twice in a row is skipped); `download` when a download job starts.
* Worker routes (all POST, JSON): `/ping /register /login /logout /act /me /clear-me /delete-me /admin/users /admin/user /admin/delete /admin/reset`. KV keys: `u:<name>`, `a:<name>`, `t:<token>` (30-day TTL), `f:<name>` (failed tries, 15-minute TTL).
* Code storage: SHA-256 of `pepper:salt:user:code` (browser: `salt:user:code`), never the code. 6 digits = 1 000 000 possibilities, so the lock (5 wrong tries → 10 min local / 15 min Worker) is the real protection. Free Worker plan ≈ 1000 KV writes a day: history is sent in batches (about every 45 s and when the page is hidden).
* **Not tested:** the cloud mode against a real Cloudflare Worker (tests use local mode only; the Worker file was syntax-checked and reviewed). Test it once with a fresh test profile before relying on it.
* Ideas: per-profile "Continue reading", avatars, e-mail recovery, activity chart, PBKDF2 on a paid Worker plan.

**Replaced later:** the KV namespace `PROFILES` was replaced by a D1 database in round 14; history batches "about every 45 s" are about 8 s since round 20; the slider is 76 px tall now (keys stay 40 px, wheel 64 px); "114 checks" belongs to the old suite. Item 5 stays true: `start-manga.bat` / `proxy-local.js` are an optional helper and are not part of the delivered files.
<!-- story:end -->

<!-- story:start -->
### Round 14 — cloud storage on D1, slider knob, layout, accent colour
| # | Request | Done | Where |
|---|---|---|---|
| 1 | Slider knob too big and not on the line | Root cause: the global rule `button{min-width:40px;min-height:40px}` made the knob 40 px. Knob is now **22 px**, `min-width/min-height:0`, centred by `left:50%;top:50%;margin:-11px 0 0 -11px` on a thin 8 px track. | `chapter-slider.js` |
| 2 | Cloud storage linked to the site: profile history, bookmarks, bug reports; each profile sees only its own; admin sees status, history, bookmarks | **`accounts-worker.js` rewritten for Cloudflare D1** (SQL; tables created by the Worker itself). Per profile: history (max 1000), one JSON "state" (bookmarks, continue-reading, recent, progress), bug reports. `app.js` keeps those four lists under `mf_u:<name>:<list>` while a profile is signed in (`NS_KEYS`, `nsPrefix`), so profiles never see each other's lists; `profiles.js` copies them to the cloud (6 s after a change, on hide, on sign-out) and pulls them after sign-in (newer side wins). Admin tabs: **All profiles** (reads, downloads, bookmarks, bugs, last seen; open one for history + bookmarks + bugs) and **Bug reports**. A signed-in person gets **Send to admin** in the error pop-up (or the switch "send automatically"). The Server tab lists the 6 setup steps and has **Copy Worker code**. | `accounts-worker.js`, `profiles.js`, `app.js` `store` / `showError` |
| 3 | ✕ in the search bar moves | Root cause: global `button:active{transform:scale(.96)}` replaced the ✕ centring transform. Fixed with margin-based centring; `pointerdown` is also cancelled so the box keeps focus. | `style.css`, `app.js` |
| 4 | No text titles on End / Top / slider | Labels removed (symbols only). | `index.html`, `style.css`, `chapter-slider.js` |
| 5 | Layout | Bottom-left: **Top key at the bottom, wheel above it**. Bottom-right: **End key at the bottom, slider above it**. Download button **top-right under the title bar**, smaller letters; its list opens below it (phones: top sheet). | `style.css`, `reload-wheel.js`, `chapter-slider.js` |
| 6 | Keep what works; do not bring back old errors | Full regression suite (all earlier checks kept and still pass). See the checklist below. | `test/e2e-test.js` |
| 7 | Comments, new MD, more "pro" options | Comments added (section 13). New options in Settings → Reading: **accent colour** (5 swatches, `settings.accent`) and **keep screen awake** (`settings.keepAwake`, Screen Wake Lock). Report header says "round 14". | `app.js`, `index.html`, `style.css` |

**New browser events (add-on contract):** `mf-store {key}` (a personal list was saved), `mf-bug {title, report, page}` (an error report was shown), plus the older `mf-activity`, `mf-chapter-step`, `mf-reload`.

**Cloud link steps (the same text is in the Server tab and at the top of `accounts-worker.js`):**
1. Cloudflare > Storage & databases > **D1 SQL database** > Create, name `mangaflow`.
2. Workers & Pages > Create > **Worker** `mangaflow-accounts` > Deploy > Edit code > paste `accounts-worker.js` > Deploy.
3. Worker > Settings > Bindings > Add > **D1 database**, variable name exactly **`DB`**.
4. Worker > Settings > Variables and Secrets: `ADMIN_USER` (text), `ADMIN_CODE` (6 digits, Secret), optional `ALLOWED_ORIGINS` (your github.io address), `PEPPER` (Secret). Deploy again.
5. Paste the Worker address in MangaFlow > profile icon > Server > Save > Test (must say "ready, admin is set").
6. Sign in with `ADMIN_USER` / `ADMIN_CODE`: tabs **All profiles** and **Bug reports** appear.

**Worker routes (all POST, JSON):** `/ping /register /login /logout /act /me /state/get /state/put /bug /clear-me /delete-me /admin/users /admin/user /admin/bugs /admin/bug-delete /admin/delete /admin/reset`. **D1 tables:** `users`, `acts`, `state`, `bugs`, `tokens`, `fails`.

**Test result round 14: 140 checks, 0 failed (round 15: 151 checks, 0 failed) — section 14** (the real `accounts-worker.js` is run against a fake D1 built on `node:sqlite`, `test/fake-d1-server.mjs`, port 9102). **Still NOT tested:** a real Cloudflare account / real D1, real phones, live manga sites.

**Honest limits:** 6-digit codes are weak (lock after 5 tries, optional PEPPER and ALLOWED_ORIGINS help); cloud sync is "last writer wins" (two devices editing at once: the later save wins); history is sent in batches, so the last seconds before closing the tab are sent with `keepalive` but a crash can lose them; the admin is not tracked and has no cloud bookmarks.

**Regression checklist (things that were broken before — each has a test; do not break them again):** chapter loading through proxies (rounds 8–12), stuck download (round 12: `gate` 25 s, `coolDown` ≤ 20 s, self-tuning `hostLimit`, `withLimit` 100 s, `AHEAD = 6`), error reports always offered (`showError` for every failure), download options (4 PDF qualities, size estimate, range dialog), Top key instant jump, add-on switches, ✕ stays still, knob centred, keys symbols-only.

**Replaced later:** "Top key at the bottom-left with the wheel above it" and "End key with the slider above it" were rearranged in rounds 19–20 (wheel top left, Top / End slider bottom left, chapter slider bottom right; section 8.1); sync timing is 3 s (bookmarks) / 8 s (history) since round 20; the 140-check suite with a fake D1 (`test/fake-d1-server.mjs`) no longer exists; the Worker gained the `/report` route in round 19.
<!-- story:end -->

<!-- story:start -->
### Round 15 — normal websites look complete, digital start page
Request (voice-typed, Oct 18 20:30): in the plain mini browser (not reading mode) pages open but do not load completely: icons are black boxes / "crazy", as if styles were not recognised. Wanted: read the whole website, use the home page like a normal browser (type any.com to open it, or search the web), stay within safe and legal limits, give a bug report when something fails, digitalise the home page more, an "empty set" file to build the site from scratch, comments on every line, all files again, nothing that worked may break.

**Root causes found (by test, not guessed)**
1. The frame runs no scripts (on purpose). Sites that switch their CSS on with a script (`<link media="print" onload="this.media='all'">`, `rel=preload as=style`) stayed unstyled; their `<noscript><link rel=stylesheet>` fallback was deleted by the cleaning.
2. Style sheets refused when fetched directly (hotlink / Referer rules, `http:` on an `https:` page, the page's own CSP) left the page plain; the browser gives **no signal** for this (`link.sheet` exists and `cssRules` throws exactly like for a good cross-origin sheet), so detection by `.sheet` does not work.
3. Icon fonts from another host need a CORS permission their host often does not send → icons show as boxes.
4. Many sites hide the page (opacity 0 / loader curtain) until a script reveals it.
5. Pages built entirely by JavaScript (React / Vue) cannot be shown without running their scripts: reported honestly, never faked.

| # | Request | Done | Where |
|---|---|---|---|
| 1 | Pages should load completely | `renderFrame`: async-CSS and preload tricks switched on, noscript style sheets kept, a last "rescue" `<style data-mf="rescue">` (page visible, loader curtains hidden). New section 7b: `repairStyles` 2.5 s after showing the page fetches every external style sheet that is not surely good through the proxy (`fetchRaw`, max 8, cached in `rawCache`), makes it self-contained (`packCss`: `@import` one level, `url()` made absolute, `expression(` removed) and swaps the `<link>` for `<style data-mf="repaired">`; if a font still fails, the sheets are rebuilt with font files sent through the proxy (`proxyUrlFor`). Scripts of other sites still never run. | `app.js` 7b |
| 2 | Home page works like a browser | `normalizeInput`: `any.com`, `any.com:8080/path`, `any.com?x=1` open that site (https added); other text is a web search. New **Manga / Everything** switch under the start-page search (`settings.searchManga`, default Manga = old behaviour; Everything = search words as typed). | `app.js`, `index.html` |
| 3 | Safe and within limits | Unchanged rules: sandboxed frame without scripts, frame CSP, no-referrer, only http(s), no bot-check bypass. Repaired CSS is plain text in `<style>` (cannot run code). | — |
| 4 | Bug report on problems | `pageHealth` builds a report (sheets total / failed / repaired / still failed, font problem, scripts not run, visible text length, proxies, browser) and shows the amber **notice** `#pageNote` (Report / Open original / ✕). Report opens the big error pop-up with the copyable text (header "MangaFlow page report (round 15)"). Fetch failures keep the old pop-up. | `app.js`, `index.html`, `style.css` |
| 5 | Digitalise the home page | Moving grid + scanner line on the hero, neon heading, mono badge, glowing search box, live **HUD** strip (online LED, proxies, cached pages, reading, marks, clock; drawn every second only while the start page is visible). Motion off for reduced-motion users. | `style.css`, `index.html`, `app.js` `drawHud` |
| 6 | Download button a little lower in reading mode | `104px` → `124px` (sent as a separate `style.css` earlier). | `style.css` |
| 7 | Empty-set file for rebuilding | Section 15 of this file (still ONE combined file). | this file |
| 8 | Comments on every line, all files again, nothing broken | New code fully commented; 50 more comments in `app.js` (≈ 97 % of its code lines); all 12 files delivered; regression suite kept. | all |

**New settings key:** `searchManga` (true = add the word manga to typed searches). **New element ids:** `#pageNote`, `#pageNoteText`, `#pageNoteReport`, `#pageNoteOpen`, `#pageNoteX`, `#scopeSwitch` (buttons `data-scope="manga|all"`), `#hud`.
**Test result round 15: 151 checks, 0 failed.** See section 14 (new block [29]; mock site F in `test/mock-sites.js`: a style sheet host that refuses browsers but answers a proxy, async-CSS, noscript, a JavaScript-only page).
**Honest limits:** JavaScript-built sites stay empty; a sheet that is refused even for the proxy stays unstyled (reported); background images and font files other than via CSS `url()` are not rerouted; repairs cost up to 8 proxy requests per page view the first time (then cached); real sites were not tested, only the mock.

**Regression checklist additions:** the repair never runs scripts; a person who navigates away during a repair is not affected (`liveDoc(token)` check); the repair must not break reading mode (it only touches the mini-browser frame).

**Replaced later:** "section 15 of this file" (rebuild from an empty folder) is now section 17; the mock "site F" lives in `test/server.js` now.
<!-- story:end -->

<!-- story:start -->
### Round 16 — search engines with CAPTCHA detection
Request (Oct 19): the DuckDuckGo search in the mini browser did not work (a CAPTCHA notice, no result). Wanted: fix it if possible; add other search options (other free providers) so it works like a normal search box; do not harm the sites; all files again with comments and a new MD; change nothing else.

**Root cause:** DuckDuckGo's plain page (`html.duckduckgo.com/html/`) answers requests that come from cloud proxies with a "prove you are human" page. That page is HTTP 200, so it looked like a result page.
**Decision (safety):** MangaFlow never solves, imitates or goes around a CAPTCHA. It only **detects** it and moves to the next free engine. Google is NOT proxied or scraped (it blocks that and its rules forbid it); a **Google ↗** button only opens google.com in a new tab.

| # | Request | Done | Where |
|---|---|---|---|
| 1 | Fix the DuckDuckGo CAPTCHA problem | New section 4b: `ENGINES` (Bing, Mojeek, DuckDuckGo, Brave), `ENGINE_ORDER`, `searchQuery`, `searchCandidates`, `searchProblem` (CAPTCHA words / anomaly form / no result links). `navigate()` tries the engines one by one, shows a toast like "asked for a CAPTCHA - trying Mojeek…", stops at the first real result page; if all fail the first page that loaded is shown. | `app.js` |
| 2 | Different search options | Start page: **ENGINE** drop-down (Auto, Bing, Mojeek, DuckDuckGo, Brave) saved in `settings.searchEngine` (default `auto`; the chosen engine is tried first, the others are the fallback). | `index.html`, `style.css`, `app.js` |
| 3 | Use like Google | **Google ↗** button: opens `google.com/search?q=<words>` in a new tab (`noopener`). | `index.html`, `app.js` |
| 4 | Result links | `unwrap()` also opens Bing `bing.com/ck/a?...&u=a1<base64url>` links as the real address. `tryAutoRead` skips every search host (`isSearchHost`). | `app.js` |
| 5 | Nothing else changed | Settings dialog untouched; all other code as in round 15. | — |

**New settings key:** `searchEngine`. **New ids:** `#engineRow`, `#engineSel`, `#googleBtn`.
**Test result round 16: 160 checks, 0 failed** (block [30]: CAPTCHA pages from DuckDuckGo and Bing are skipped, Mojeek results shown, address bar shows the answering engine, "manga" added, engine choice saved, Google button opens a new tab, Bing wrapped link opens the real address). The engines are answered by the test itself (no internet in the test box).
**Honest limits:** free engines may also refuse cloud proxies at times (then the next one is tried; if all refuse you see the first page that loaded); results from Bing/Mojeek/Brave pages are plain HTML and look simpler than in a normal browser; real engines and a real phone were NOT tested here; your own Cloudflare Worker is the most reliable proxy for this.

**Replaced later:** the **Google ↗** button that opens a new tab (item 3): Google is searched inside MangaFlow since round 18, and again without an API key since round 28b (only an empty box opens google.com). The engine list has five free engines since round 17 (Yahoo added).
<!-- story:end -->

<!-- story:start -->
### Round 17 — own results list, clear x, paste + clipboard list
Request (Oct 19): after searching, the results were wrong / the page looked broken, and the Brave page gave the error "no proxy could load it ... Failed to fetch" (all three proxies). Wanted: fix it properly; align the website, the searched page and the floating tabs so they fit the screen; the clear (x) button still moved when pressed (home page and reading mode); the paste button must paste whatever was copied with one tap and get a drop-down beside it that works like a clipboard; fix any other problem that can come up while searching; a new MD with all the information; all files again.

**Root causes found**
1. Engine pages are built for a full browser (scripts, style sheets, adverts). Through the plain mini browser they looked broken or showed the wrong part. And an engine that refuses a cloud proxy ends in "Failed to fetch" for every proxy; the old code then threw that as a red error.
2. The clear (x) was a 22 px wide but 48 px tall oval: `#heroForm button { min-height: 48px }` and `#popForm button { min-height: 46px }` are more specific than the old `.clearx` rules. That also made it look off-centre and "jump".
3. The paste button only filled the box and had no list; when the browser refused clipboard reading it only said "paste with Ctrl+V".

| # | Request | Done | Where |
|---|---|---|---|
| 1 | Correct search results, no Brave error | New section 4c: `parseResults` reads the results (title, address, text) out of the engine page with a rule per engine (`RESULT_RULES`: Bing, Mojeek, DuckDuckGo, Brave, Yahoo) and a fallback that uses any long link; `resultsPage` builds MangaFlow's OWN clean list of cards (phone first, light/dark like the app, never wider than the screen, 150 px free at the bottom for the floating buttons). Engine chips under the title switch engine; "Show the original page" opens the engine's own page (`#mf-raw`). Nothing from the engine's page is run. | `app.js` |
| 2 | When every engine fails | No red pop-up any more: a friendly page with the other engines as buttons, a Google button and a collapsed "Details (for a bug report)". (Only when there is no proxy at all the old error + Settings guidance stays.) | `app.js` |
| 3 | More free engines, better results | **Yahoo** added; order Bing, Mojeek, Yahoo, DuckDuckGo, Brave; language / region parameters (`setlang=en&cc=US`, `lb=en`, `kl=us-en`) so results are not in a random language; the words are cleaned (extra spaces squeezed, 300 letters max). | `app.js` |
| 4 | Result links | `unwrap()` now also opens **Yahoo** (`/RU=`) and **Google** (`/url?q=`) wrapped links, besides DuckDuckGo and Bing. A result tapped in the list may open straight in reading mode (`user` flag). Search lists are not saved as visited manga, get no chapter-list scan and no "page may look incomplete" notice, and the floating "Reading mode" button is hidden on them. | `app.js` |
| 5 | Google | A typed or tapped Google address opens in a NEW TAB (`noopener`) and is never proxied. | `app.js` |
| 6 | Clear (x) must not move | Fixed 22 x 22 circle in every search box (start page, address bar, popup, reader bar) with `!important` sizes and position, no transform, no transition; a finger tap also keeps the focus in the box (`touchstart` prevented). | `style.css`, `app.js` |
| 7 | Paste = paste | `pasteInto()`: reads the clipboard and fills the box with one tap, says so when it is empty, and when the browser refuses it opens the list and explains the long-press way. | `app.js` |
| 8 | Clipboard drop-down | A **▾** button beside the paste button (start page and the search popup). `#clipPop` lists the last 12 texts you pasted or copied (newest first); tap a row to fill the box; ✕ removes one row; "Clear list" removes all; "Paste what I copied last" repeats the paste. Saved on this device only (`mf_clips`), not saved when "Do not save history" is on, erased by "erase when the tab closes". | `index.html`, `style.css`, `app.js` |
| 9 | Alignment | Checked at phone width (390 px) with screenshots: results list, failure page and clipboard list fit the screen; the engine row wraps on narrow phones. | `style.css` |

**New settings key:** none (`searchEngine` from round 16; new local key `mf_clips`). **New ids:** `#heroClip`, `#popClip`, `#clipPop`. **New code:** `ENGINES.yahoo`, `RESULT_RULES`, `parseResults`, `queryOf`, `resultsPage`, `escHtml`, `clipText`, `pasteInto`, `openClip`, `closeClip`, `clipAdd`, `clipList`, `fillBox`; `cur.isSearch`.
**Test result round 17: 176 checks, 0 failed** (block [31]: clean list that does not overflow, Bing and Yahoo links unwrapped, a result opens, every engine failing gives the friendly page, Google opens a new tab, the clear x is 22 x 22 / centred / does not move on the start page and in the popup, paste fills the box, the clipboard list shows newest first and stays inside the screen, a row fills the box, Clear list). The engines are answered by the test itself (no internet in the test box).
**Honest limits:** the real engine pages were NOT reachable from the test box, so the rules in `RESULT_RULES` follow each engine's usual page and the fallback covers changes; Brave builds much of its page with scripts and may give few or no results through a proxy (the next engine is then used); a free engine can refuse cloud proxies at any time; reading the clipboard needs https, a tap, and on some phones a one-time permission; only text is saved in the list; a real phone was NOT tested.

**Replaced later:** item 5 ("a Google address opens in a NEW TAB and is never proxied") was replaced by rounds 18, 23 and 28b; the rest (own results list, ✕ circle, paste, clipboard list) is still current.
<!-- story:end -->

<!-- story:start -->
### Round 18 — Google search, full screen, Top/End slider, download safety
**Requests (from the round 14/15 bug reports and the user's message):** "no proxy could load it" for search and for a mangazin chapter; search results that differ from what was typed; add the user's Google Programmable Search (`cx=c0d44f55eddb847e4`) as a direct, DEFAULT provider; Paste must not need a second confirmation; the clear (x) button broke after an update; other sites showed theme-dropdown code and no chapters; PDF slow and size not matching the estimate; chapter slider line 10 % shorter and knob centred; full-screen button (like F11) with a Settings switch; refresh on the normal site must return to the same page/search; Top/End keys replaced by a slider above the reload wheel (switchable); every code file commented for beginners; ONE combined MD file.

| # | Request | What was done | Where |
|---|---|---|---|
| 1 | Google as default provider | `settings.searchEngine='google'` (migration `ver 12`), `googleCx` setting, `googleSearch()` loads `cse.google.com/cse.js` (explicit render, 10 s timeout) into a panel `#gview`; clicking a result is intercepted and opened INSIDE MangaFlow (`unwrap(data-ctorig||href)` → `navigate`). If Google cannot load, the free engines run automatically. CSP allows only `cse.google.com`, `www.google.com`, `www.gstatic.com` (+ frame-src). The Google engine uses the sites list of the CSE itself, so "scope" (Manga/Everything) applies only to free engines unless `googleManga` is on. | `app.js` §18, `index.html`, `_headers` |
| 2 | Wrong results shown | `navSeq` counter: every `navigate()` checks `stale()` after each await, so a slow older search can never overwrite a newer one. | `app.js` |
| 3 | Paste | `pasting` flag, `pasteInto()` focuses first and makes ONE clipboard request; if refused it selects the box and shows "Press Ctrl+V". `goStraight` setting ("Open straight after paste") submits automatically. **Honest limit:** Firefox/Safari always show their own native "Paste" bubble — page code cannot remove it. | `app.js` |
| 4 | Clear (x) | Root cause of the break: `touchstart`/`pointerdown` `preventDefault` on the button cancelled the tap's `click`. Now ONE capture-phase `click` handler on the document (empties box, fires `input`, refocuses) + `mousedown` prevented for the mouse only. | `app.js` `syncClear` |
| 5 | Refresh keeps place | `#p=<page>` / `#q=<search>` next to `#r=`; `rememberView`, `resumeFromHash`, `goHome` clears it. | `app.js` §18 |
| 6 | Slider | `chapter-slider.js` height 120→108 px, knob `left/top:calc(50% - 11px)`, `margin:0`, `font-size:0`. | `chapter-slider.js` |
| 7 | Top/End slider | NEW `edge-slider.js` (event `mf-edge-jump {where:'top'|'end'}`), `body.has-edge` hides the two keys; Settings switch `showEdge`. | `edge-slider.js`, `style.css`, `app.js` |
| 8 | Full screen | Navbar `#btnFsNav`, chapter menu `#btnFsMenu`, download bar `#btnFsDl`, exit button `#fsExit`; `toggleFs`, F11 key, Esc; `body.fs` hides wheel, sliders, keys, side panels; Settings switch `showFs`. `isFs()` uses only the API element + `display-mode: fullscreen` (a window-size guess was removed: it fired by mistake). | `app.js` §18, `style.css` |
| 9 | Download safety | Page 1 is probed first; if it fails the chapter page is re-read FRESH (`chapterImages(it,job,true)`), then retried. A dead chapter is marked in one step; 2 dead chapters in a row stop the job (`fatal`) instead of saving a PDF of placeholders; a PDF with 0 pictures is never saved. New route through YOUR proxy with the site root as Referer. Estimate uses 6 middle pages; result line shows "estimate was …". | `app.js` `doChapter`, `byteRoutes`, `runJob` |
| 10 | Worker | 20 s timeout per try, picture requests retried with other Referers (given, site root, picture host root, none), `Accept: image/*`, headers `X-MangaFlow-Tries/Upstream`, 504 for slow sites. **Must be re-uploaded to Cloudflare.** | `worker.js` |
| 11 | Pages without scripts | `MF_NOJS_CSS` appended in `renderFrame`: hides closed dropdowns/modals/cookie bars, opens collapsed chapter lists, shows lazy images. Fonts of repaired style sheets now go through the proxy at once. | `app.js` §7 |
| 12 | Proxy list | Reset keeps YOUR own proxy; free proxies time out after 10 s (own proxy 15 s). | `app.js` |

**New settings keys:** `googleCx`, `googleManga`, `goStraight`, `showFs`, `showEdge` (`ver` 12). **New ids:** `#gview #gvQuery #gvTab #gvClose #gvStatus #gvBox #btnFsNav #btnFsMenu #btnFsDl #fsExit #mfEdge #searchBox #setCx #setGoStraight #setGoogleManga #setFs #setEdge`. **New file:** `edge-slider.js`. **New events:** `mf-edge-jump`.
**Test result round 18:** `node test/ui.test.js` (Playwright + `test/server.js` mock proxy) = **40/40 checks** (clear x with mouse and touch, Google panel with a FAKE cse.js, result opens inside the app, Google-blocked fallback, stale search, `#p=` refresh, slider 108 px and centring, edge slider position/drag/off, full screen on/off/Esc).
**Honest limits:** the REAL Google CSE and the real sites could not be reached from the test box; why the picture hosts answered 404 is unknown without the site (round 18 tries more Referers and stops early with a clear report); the Firefox/Safari Paste bubble cannot be removed; pages built entirely by JavaScript stay mostly empty.
**Code-comment rule:** the new code carries `WHY / HOW / IMPROVE` comments in simple English (older files keep theirs).

**Replaced later:** the page-security host list "only `cse.google.com`, `www.google.com`, `www.gstatic.com`" grew in rounds 19–21; the Top/End slider "above the reload wheel" was moved in rounds 19–20; the full-screen buttons `#btnFsMenu`, `#btnFsDl`, `#fsExit` are hidden in reading mode since rounds 19 / 21 (the icon `#fsRead` does their job); the advice "Search the entire web ON" is out of date for new Google engines (round 28, appendix B).
<!-- story:end -->

<!-- story:start -->
### Round 19 — Google inside our bar, right-hand column, accounts fixed, built-in server + proxy
**Requests:** Google popup/empty results/redirect and CSP errors (`clients1.google.com` blocked); Google verification file; fullscreen ICON under the download pill in reading mode; Top/End slider 30% shorter at the bottom right; reload wheel under the fullscreen icon; admin (Admin0) history/bookmarks not saved; built-in server hidden from other profiles; sync option + Profile page inside Settings; free proxies not working; header/settings polish; wrong-language search results and the engine "changing"; manhwafan.com not readable; stronger Troubleshoot + server reports.

| # | Request | What was done | Where |
|---|---|---|---|
| 1 | Google in OUR bar | `loadCse` renders tag `searchresults-only` (no box, no popup). `runCse` returns a promise: results drawn = true; nothing in 9 s or "no results" = false -> `googleSearch` hides the panel and the free engines answer (never an empty page). CSP now also allows `clients1.google.com` and `*.google.com` scripts (that was the reported block). File `googledb6fd0cf04d837f7.html` added (content: `google-site-verification: googledb6fd0cf04d837f7.html`). The pasted `<script src="https://google.com">` was cut off; the real one is `https://cse.google.com/cse.js?cx=c0d44f55eddb847e4` (already used). | `app.js` §18, `index.html`, `_headers` |
| 2 | Reading-mode column | New `#fsRead` icon button (same symbol as the navbar, no text) under the download pill `#dock`; `#mfWheel` under it; all use `--col-top` so they slide up with the title bar like the pill; old text buttons `#btnFsMenu/#btnFsDl` hidden in reading mode. | `style.css` ROUND 19, `index.html`, `app.js` |
| 3 | Top/End slider | 76 px (30% shorter), `MAX 26`, `TRIGGER 17`, bottom of the RIGHT edge, left of the chapter slider (`bottom 14 px`, mirrored for side=left). | `edge-slider.js`, `style.css` |
| 4 | Admin data not saved | ROOT CAUSE: the admin was skipped in 3 places (Worker `/act` and `/me`, `profiles.js` `mf-activity`, `mf-store`, `pullState`). Now tracked everywhere; admin has tabs All profiles / My history / Bookmarks / Reports / Server. | `profiles.js`, `accounts-worker.js` |
| 5 | Sync | Guest reading is kept (`mf_guest_acts`, max 200) and adopted at sign-in (`adoptGuest`); lists are MERGED (`mergeLists`, union) not overwritten; `syncAll()` = flush + pull + push; Settings > Profile has "Open my profile" and "Sync now" (works in reading mode). | `profiles.js`, `app.js` `refreshProfInfo` |
| 6 | Built-in server | `ACCOUNTS_URL` is built into `profiles.js`. The Server tab/address/setup steps are drawn only for an admin (signed in, or a browser flagged `mf_admin_dev` after an admin sign-in). Honest limit: a static site's source is public; the data is protected by sign-in tokens and `ALLOWED_ORIGINS`. | `profiles.js` |
| 7 | Free proxies | The owner's Worker (`BUILTIN_PROXY`) is added FIRST to everybody's list (one-time migration `ver 13`; Reset keeps it). Free proxies that fail twice sleep 5 min (`proxyHealth`); free ones time out after 10 s. Free proxies are still unreliable by nature; the built-in one is the reliable route. | `app.js` |
| 8 | Search engine | Setting `engineStrict` ("Only use the search engine I chose"); English parameters for Brave/Yahoo; Worker sends English cookies to Brave/Bing. | `app.js`, `worker.js` |
| 9 | manhwafan.com | `/home` is a LIST of covers. `extractImages` returns nothing when 4+ pictures are links to different pages (>=60% distinct), so it stays a normal page; real series/chapter pages (Madara theme) use the old logic. | `app.js` |
| 10 | Reports to the server | Troubleshoot > "Send report to server" (`MangaFlowProfiles.sendReport`): signed in = `/bug`; not signed in = new Worker route `/report` (3 per 10 min per visitor). Admin reads them under Reports. New Troubleshoot symptoms: listpage, engine, profilesave, proxyfree, dlall404. | `profiles.js`, `accounts-worker.js`, `troubleshoot-data.js` |
| 11 | Polish | Glow/focus/pressed states, 40 px targets, pill tabs that scroll on phones. | `style.css` |

**New settings:** `engineStrict` (`ver` 13). **New ids:** `#fsRead #profBox #profInfo #profOpen #profSync #fixSend #setStrict`. **Redeploy needed:** `worker.js` and `accounts-worker.js` (Cloudflare > Edit code > paste > Deploy).
**Tests:** `node test/ui.test.js` = 51/51 (fake Google, empty-Google fallback, list page, built-in proxy, guest reading adopted at sign-in, admin Server tab, guest has none, bookmarks pushed, `/report`).
**Honest limits:** real Google, real manga sites and the real accounts Worker could not be reached from the test box; Firefox/Safari paste bubble cannot be removed; the Google engine's "sites to search" list controls what Google returns.

**Replaced later:** item 3 (Top/End slider "bottom of the RIGHT edge") — it sits bottom LEFT since round 20; item 2 (wheel under the full-screen icon) — it sits top left since round 20.
<!-- story:end -->

<!-- story:start -->
### Round 20 — Google ad hosts, layout moves, visible admin sync
**Requests:** two new CSP blocks from Google's search element (`partner.googleadservices.com` script and `syndicatedsearch.goog` frame); Top/End slider to the bottom LEFT; reload wheel to the TOP LEFT under the header (mirror of the download pill); chapter slider the same size as the Top/End slider; admin sync "still not working", must behave like any profile; full-screen button the same size as the download pill; all files + MD again.

| # | Request | What was done | Where |
|---|---|---|---|
| 1 | Google blocks | The search element loads ad/partner helpers. `script-src` now also allows `partner.googleadservices.com`, `*.googleadservices.com`, `pagead2.googlesyndication.com`, `*.googlesyndication.com`, `syndicatedsearch.goog`; `frame-src` allows `syndicatedsearch.goog`, `*.google.com`, `*.googlesyndication.com`. Same text in `index.html` (meta) and `_headers`. If you ever see a NEW "browser blocked" report, copy the blocked host into BOTH places. | `index.html`, `_headers` |
| 2 | Layout | Edge (Top/End) slider: bottom LEFT. Wheel: top LEFT, same row as the pill (`top: var(--col-top)`), tip opens downward. Chapter slider: 76 px like the edge slider (`MAX 26`, `TRIGGER 17`). Full-screen icon: 44 x 38 px = the download pill, directly under it. | `edge-slider.js`, `chapter-slider.js`, `style.css` ROUND 20 |
| 3 | Admin sync | Re-analysed the whole path. Findings: (a) an OLD accounts Worker answers `{skipped}` for the admin and saves nothing, silently; (b) the admin had no row in `users`, so "All profiles" never showed the admin; (c) failures were swallowed. Fixes: Worker v4 gives the admin a normal `users` row and lists it; the client checks `/ping` version (< 3 = "old Worker, redeploy"), treats `skipped` as an error, records every result in `mf_sync` and SHOWS it (Settings > Profile and the profile window: "saved 2 min ago" or the exact error); "Sync now" throws real errors; history is sent after 8 s, bookmarks after 3 s. The admin uses the same code path as every other profile. | `profiles.js`, `accounts-worker.js`, `app.js` |

**Redeploy:** `accounts-worker.js` (now version 4) and the new `index.html` / `_headers`. If Settings > Profile says "OLD version", the Worker was not updated.
**Tests:** `node test/ui.test.js` = 51/51 (layout checks changed to the new positions).
**Honest limits:** the real Google element and the real Worker could not be reached from the test box; Google may request more hosts in future (see item 1).

**Replaced later:** nothing in the layout; this is the layout that is still used (section 8.1).
<!-- story:end -->

<!-- story:start -->
### Round 21 — full-screen exit icon, Google self-test
* **Exit full screen (reading mode):** the SAME icon button `#fsRead`, in the SAME place (under the download pill), is the exit button while in full screen; the old bottom `#fsExit` is hidden in reading mode. It fades while scrolling down and returns on scroll up (`body.fs.reading.scrolling`). Esc / F11 still work. (`style.css` ROUND 21)
* **Google:** `script-src` and `frame-src` now use wildcards for the Google hosts the search element needs (`*.google.com`, `*.google.co.in`, `*.googleapis.com`, `*.gstatic.com`, `*.googlesyndication.com`, `*.googleadservices.com`, `*.doubleclick.net`, `*.syndicatedsearch.goog`) in `index.html` and `_headers`. New **Settings > Search & extras > "Test Google search"** (`googleDiag`): checks the ID, loads the script, draws the element, runs a test search, lists every host the page security rules blocked, and copies the result so it can be pasted to Claude. Use it first whenever Google fails.
* **Tests:** 51/51. **Honest limit:** real Google could not be reached from the test box.

**Replaced later:** nothing; the Google host lists were compared again in round 28 (comment in `index.html`).
<!-- story:end -->

<!-- story:start -->
### Round 22 — links open OUR site, Google API key, sync check
**Requests:** hide the full-screen icon while scrolling down (show on scroll up); "Sync now" error "accounts server is the OLD version (2)"; Google search shows a Google pop-up with "no match found"; links opened in a new tab / window / Ctrl+click / middle click went to the ORIGINAL site (must open MangaFlow and run the link in our own bar); all files + MD again.

| # | What was done | Where |
|---|---|---|
| 1 | `body.reading.scrolling #fsRead {opacity:0}` (back on scroll up), same for the other floating buttons. | `style.css` ROUND 22 |
| 2 | **Sync error analysis:** "version (2)" means the Worker running in Cloudflare is still the OLD file; the new code was not deployed (or pasted into another Worker). It is not a bug in the page. Changes: (a) only the ADMIN is refused on an old server (the old one silently skips the admin), everybody else can still sync; (b) the message now lists the exact Cloudflare steps; (c) opening `<worker address>/ping` in a browser tab (GET, works even with `ALLOWED_ORIGINS`) shows `{"version":4,...}` so you can SEE the new file is live. | `profiles.js`, `accounts-worker.js` |
| 3 | **Links:** `appLink(real)` gives every link of a shown page, and every Google result link, an address of THIS site (`?url=<address>`, or `?q=<words>` for a search-engine address). Plain click still handled by `onFrameClick`; Ctrl/Cmd/Shift click, middle click, "open in new tab/window" follow the href, so a new MangaFlow tab opens and runs the link (`?url=` / `?q=` handled at start-up; `#p=`/`#q=` skipped then). The frame sandbox is now `allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox` (still NO scripts). | `app.js` (`appLink`, `neutralizeLinks`, `onFrameClick`, section 18), `index.html` |
| 4 | **Google:** new optional **Google API key** (Settings > Search & extras). With a key, `googleApi()` calls the Custom Search JSON API and MangaFlow draws the results as its own list (same as the other engines, history entry `mf-google:<words>`, bar shows the words). No Google pop-up. Without a key the drawn element is used as before; Google's overlay classes are hidden by CSS. "Test Google search" also tests the API. Errors are explained (limit 100/day, key refused, no sites in the engine). | `app.js`, `index.html`, `style.css` |

**Settings added:** `googleKey`. **Ids:** `#setGKey`. **Redeploy:** `accounts-worker.js` (version 4) is REQUIRED for admin sync; upload the site files.
**Google engine must be set up on Google's side** (control panel): "Search the entire web" ON or sites listed, engine public, Ads off. Otherwise Google answers "no match found" whatever the page does.
**Tests:** 56/56 (links carry our address, popups allowed without scripts, API list, scroll hide).
**Honest limits:** real Google, the real Worker and real sites could not be reached from the test box.

**Replaced later:** the Google API key route: Google closed the JSON API to new projects (round 23b), so the key is empty by default (round 24). "Search the entire web ON or sites listed" is out of date for engines made after 20 January 2026 (round 28, appendix B).
<!-- story:end -->

<!-- story:start -->
### Round 23 — Google stays Google, quiet script blocks
- **Problem 1:** choosing Google then searching answered with another engine; the Google button/chip opened google.com.
  **Fix:** `settings.googleKey` now defaults to the owner's Custom Search API key. `navigate()` has `opts.engine`; a `google.com/search?q=` address, the Google button and the Google chip are turned into the same in-app Google search (`engine:'google'`). The engine select is never changed by a fallback.
- **Problem 2:** reports about `cdn.search.brave.com/...js` blocked. **Fix:** scripts of a shown page being blocked is intended (pages never run scripts), so `onSecurityViolation` only records them in `cspSeen` (shown by "Test Google search" and the bug report). Blocks of our own page are still reported.
- **Problem 3:** Bing/Mojeek/Yahoo 403/502 = those engines block cloud proxy addresses. Not fixable in HTML/JS; Google (API) is the reliable route.
- **Your steps:** in Google Cloud Console > Credentials restrict the key: Websites = `https://dharmadr.github.io/*`, API = Custom Search API only (the key is visible in site source). In the Programmable Search control panel enable "Search the entire web" (or list manga sites). Free quota is 100 searches/day. Redeploy both Workers if not done and check `/ping` shows version 4.
- Tests: 59/59 (new: google.com address stays in-app, select stays Google).
- **Round 23b:** the API answered 'project does not have access to Custom Search JSON API' (Google closed it to new projects). `gKeyOn()`/`googleApiDead`: on that refusal MangaFlow switches to the key-less Programmable Search box (`googleSearch`) before any free engine; editing the key resets it. Simplest setup: empty the API key box.

**Replaced later:** "`settings.googleKey` defaults to the owner's API key" was undone in round 24 (a key written into a static page is public: never do that again). After round 24 the in-app handling of a `google.com/search` address, of the Google button and of the Google chip worked **only with a key**; round 28b fixed that (see the round 28 entry below).
<!-- story:end -->

<!-- story:start -->
### Round 24 — forms, Troubleshoot fixes, API key cleared
- **Problem 1:** POST forms on websites didn't work (search, filters, logins). **Fix:** `onFrameSubmit` now handles POST forms by converting FormData to URL-encoded body and passing it through `fetchDoc(url, { post: body })`. Sites with form-based search now work.
- **Problem 2:** the Troubleshoot auto-fix button only ran basic fixes and couldn't recover from Google API failure. **Fix:** added new FIX entries: "Reset search engine to Auto" (for when Google fails), "Clear Google API key" (for API-closed-to-new-projects scenario), "Reset proxies to defaults", "Reload this page". These are simple fixes the user can click one at a time.
- **Problem 3:** the default API key was hardcoded (and Google closed the API anyway). **Fix:** set googleKey default to empty string `''`. Added migration: if a user has the old default key saved from before round 24, it is automatically cleared (they can paste their own key if they have one). The search box works without any key.
- **You tested:** "Google API test" still shows the "project has no access" error because Google closed the Custom Search JSON API to new projects. This is not a site bug—the API is gone. The search box (Programmable Search, no key needed) works as fallback. Simplest fix: Settings > Search & extras, clear the API key box and leave it empty.
- **Mobile:** landscape/portrait nav and touch interactions were tested. No crashes found on iPhone 12 viewport.
- Tests: 59/59 (unchanged, POST forms are not tested at the framework level; real sites would test them).

**Replaced later:** the POST-form fix had never been tested and was incomplete (round 27 B2–B4); the new repair buttons could not be reached from the guide (round 27 B5).
<!-- story:end -->

<!-- story:start -->
### Round 25 — dark-mode results, image retry, guide
- **Dark mode results:** Results panel is now light (white background, black text) and readable in both light and dark themes. Google results are no longer hard to read.
- **Image loading:** Images that fail to load due to CORS are automatically retried through the proxy. More images should display now.
- **Keyboard events:** Basic keyboard forwarding added for better compatibility with site shortcuts and interactions.
- **Documentation:** Expanded guide on how every feature works (see sections below).
- Tests: 59/59 (unchanged).

**Replaced later / not found in the code:** the line "Basic keyboard forwarding added" describes nothing that exists in the code of round 28 (the frame runs no scripts; the keys MangaFlow handles itself are in section 7.7).
<!-- story:end -->

<!-- story:start -->
### Round 25b — buttons and dropdowns work
- **Problem:** Buttons, dropdowns, filters, and other interactive elements didn't work because we were blocking ALL clicks to prevent leaving the app.
- **Fix:** Now only link clicks are intercepted. Buttons, dropdowns, filters, and form elements work normally. This means site features like:
  - Chapter filters and sorting
  - Next/previous buttons  
  - Dropdown menus
  - Search boxes on the site
  - Any button or interactive element
  All now work as expected.
- **Tests:** 59/59 still passing.

**Replaced later:** nothing; round 27 B3 / B4 corrected how forms are sent.
<!-- story:end -->

<!-- story:start -->
### Round 26 — WordPress reader images
- **Problem:** Images on arenascan.com and similar WordPress MangaReader sites showed "9 img tags found but 0 extracted" because all images were being filtered out as decorations.
- **Fix:** Added `findReaderImages()` to search common reader containers (.reading-content, .reader, #manga-page, etc.) first. WordPress sites store chapter images there and the function now finds them before checking generic images.
- **Diagnosis focus:** The real issue is that many sites load chapter images via JavaScript, which we can't run (safety first). The diagnostic now shows exactly what's happening so we can debug.
- **Next:** User needs to redeploy their Cloudflare Worker which is down. That's the bottleneck - once the Worker is up, images should load.
- Tests: 59/59 still passing.
- **CORRECTION (round 27):** the claim above that `findReaderImages()` fixes WordPress images was FALSE. It had its own loose `BAD_IMG` (`ads?`) that also matched `/wp-content/uploads/`, so it threw those pictures away. Fixed in round 27 (B1).

**Replaced later:** `findReaderImages` no longer exists; its job is done by `readerSlots` and `scanPictures` (round 28, section 4.4).
<!-- story:end -->

<!-- story:start -->
### Round 27 — full audit, 6 bugs
Every bug below got a failing test BEFORE the fix (`test/ui.test.js` section 12, mock pages in `test/server.js`).
- **B1 `findReaderImages` (app.js):** removed its private `BAD_IMG` (the word `ads?` matched "upl-**oads**", so every `/wp-content/uploads/` picture was rejected) and use the shared one; repeated addresses from nested containers (`.reader > .reading-content`) are removed with a Set.
- **B2 POST forms:** `fetchDoc(url, opt)` now forwards `{post:true, body}`; `navigate()` passes `opts.post`. Before, round 24 POST forms were silently sent as GET.
- **B3 form without `action`:** `onFrameSubmit` used the neutralized `about:blank`; now it uses the saved `data-mf-action` and, when empty, the current page.
- **B4 GET form with repeated names:** `searchParams.set` kept only the last `genre=`; now old keys are cleared and every field is appended (also uses `e.submitter`).
- **B5 Troubleshooter:** round 24 fixes (`resetEngine`, `clearApiKey`, `resetProxies`) were never listed in `troubleshoot-data.js` (unreachable) and did not refresh the screen; `resetProxies` removed the built-in Worker. Now listed under engine / googlepanel / timeout / proxyfree, controls refresh, built-in Worker kept.
- **B6 download size estimate:** `estCache` was never cleared when a new manga started, so the download window showed the old manga's sizes. Cleared in `startReading`.
- **Small:** `_headers` no longer sets `base-uri 'self'` (the page frame needs its own `<base>`; index.html already says so); Yahoo added to the search-engine drop-down (it was selectable only through settings); diagnostic header says round 27.
- **Tests:** 63/63 (59 old + B1-B4 new). B1-B4 fail on the round 26 code. B5/B6 were checked by reading and by a script that every fix name in `troubleshoot-data.js` exists in `FIX`; they have no browser test yet.
- **Not tested here:** live sites, the Cloudflare Workers (need redeploying by you; `worker.js` / `accounts-worker.js` were read and found correct).

**Replaced later:** the picture-detection rules of B1 were reorganised in round 28 (reading box first, `generalPictures` second; section 4.4). "Not tested here: the Workers need redeploying" — round 28 changed no Worker code.
<!-- story:end -->

### Round 28 (with 28b, 28c and 28d) — mgread.io chapters, Google "no match found", an honest guide

It is written from the real code and the real test run of that delivery.

#### What the owner reported (2026-10-25)

* "Overall is okay but the Google search is still not resolved and show no match found in the result Page."
* On the new site **mgread.io** only part of a chapter shows ("only page one"), the chapter list is incomplete, and "it was still unable to read from all the websites".
* The error report that came with it: chapter 1 of `https://mgread.io/manga/childhood-friend-of-the-zenith/chapter-1/`, message "Could not load Chapter 1: This chapter may be LOCKED or REMOVED", **32 `<img>` tags**, the first picture `https://mg.mgread.io/65708/1/1.webp`, every other picture a `data:image/svg+xml` placeholder, a script called `smart-loader.min.js` ("init-manga"), "Chapters in the list: 2", build round 27, Opera mobile on Android.
* Requests: analyse and debug **all** the files, fix the errors, create the files again, put **why / how / how to improve** into the code, and rebuild the project guide, because "the last MD files to recreate the websites are wrong". Earlier the same day: "give me the files in the open, not in a zip, and also add the zip".

#### How it was worked (so the next round can repeat it)

1. **Reproduce first.** A mock copy of the *Init Manga* WordPress theme (the kind of site mgread.io is) was built from the report and added to the test server (`test/server.js`, section 10.1). Each new check was run on the **old** code and had to FAIL for the expected reason before any fix was written (rule 9 in section 3).
2. **Look for the same kind of bug, not only the reported one.** A rule written for one kind of site was silently throwing away another kind's pictures, so the code was searched for other rules that could discard good data (pictures, chapters, search results). `node --check` and ESLint (`no-undef`) were run on every `.js` file.
3. **Check outside claims.** What Google changed in 2026 was read on Google's own pages (appendix B) instead of guessed. The round-27 guide was compared with the real files (section 18).

#### What was really wrong (found, then proved by a failing check)

| # | What the owner saw | Real cause | Check |
|---|---|---|---|
| 1 | Only page 1 of a chapter | The page lists the chapter's pictures as `<img>` tags, but only the first one has a real address; the rest are empty grey boxes (`data:image/svg+xml`, 800 wide, about 15 500 tall) that the site's own script fills in later. MangaFlow never runs other sites' scripts, so it saw one picture. | R28-2, R28-3, R28-4 |
| 2 | "may be LOCKED or REMOVED" on a chapter that is not locked | (a) The page also has a "recommended manga" block of cover pictures inside links, and the old rule "this is a list of manga" threw **all** pictures away, so the page was not even seen as a chapter. (b) The lock words were searched in **all** text of the page, so a menu entry ("Unlock Center") or a comment box ("You must log in to post a comment", "This comment has been removed") was enough to say LOCKED. | R28-5, R28-11, R28-12, R28-14, R28-15 |
| 3 | "Chapters in the list: 2" | The series has 112 chapters but shows 24 per page (`…/page/2/`, `/3/` …); only the first page was read, and a chapter page that lists only its Previous / Next buttons was taken as "a list". | R28-1, R28-7 |
| 4 | Previous / next chapter shown as ".../chapter-1/Previous sentence" | The theme's read-aloud bar has links like `<a href="Previous sentence">`; words were turned into an address. | R28-6 |
| 5 | Google: "no match found", an empty panel | Two real causes. (a) Google's own "No Results" note is drawn inside a box that has the **same classes** as a real result, so the old check "is there a result box?" said yes, the free engines never took over, and the panel stayed empty. (b) A Google engine made after 20 January 2026 can only search the **sites listed** in its control panel (appendix B): a title that is not on those sites honestly finds nothing. | R28-8, R28-9 |
| 6 | **28b:** the Google button / a pasted `google.com/search?q=…` address / the "Google" chip opened a **new browser tab** | Found while testing the Google complaint end to end: these three only stayed inside MangaFlow when an API key existed (`gKeyOn()`). Since round 24 nobody has a key by default, so for the owner this was always the new-tab path. | R28-16 … R28-19 |
| 7 | Messages told people to run `start-manga.bat` | That helper is not part of the delivered files. | (reading) |
| 8 | The guide did not match the files | The round-27 guide listed files that were never delivered, a ZIP download, a "Downloads" settings tab and page swiping that do not exist, and old element names / sizes (section 18). | `check-guide.js` |
| 9 | **28c:** a Yahoo button under the results list ended in a red "Could not load the page" pop-up (report of 2026-10-28: the Worker answered HTTP 502 for `search.yahoo.com`, the two public proxies timed out) | Two parts. (a) Yahoo (like other engines) refuses some cloud proxies: this is outside MangaFlow and cannot be fixed in the code. (b) MangaFlow's own part: an engine address opened by a chip, a link or the back button went the plain "load a page" way in `navigate()`, which on failure only shows the red pop-up; only a *typed* search had the friendly page. | R28-20 |
| 10 | **28d:** while reading kingofshojo.com a red pop-up "The browser blocked something: script-src-attr → inline" (From: app.js line 427) came on every chapter | The site's HTML has `onload=` / `onclick=` attributes. MangaFlow's page security rule forbids inline handlers on purpose (it never runs other sites' scripts), so the block is right. Chrome 156 reports it while `DOMParser` reads the page (line 427 is the `DOMParser` call in `fetchDoc`), on MangaFlow's **own** document; the older "a foreign page was blocked, stay quiet" test only recognised events that come from inside the page frame, so `onSecurityViolation` showed it as an error. | R28-21 |

#### What was changed, why it works, how it could be better

**A. Pictures without an address (`scanPictures` and its helpers, `app.js` §8; section 4.4 of this guide).**
*Why:* the reader must show the whole chapter whenever that is honestly possible, and say plainly when it is not. *How:* `scanPictures` is now the ONE place that answers "which pictures does this page show?". It looks in the known **reading boxes** first (`READER_BOX`), skipping side blocks (`SIDE_BOX`: menus, "recommended", comments). `imgAddressInfo` reads the real address of one `<img>` from the known lazy attributes, then from **any other attribute whose value looks like a picture address** (themes invent names such as `data-page-src`), then `src` / `srcset`; a `data:` drawing is never a real picture. `isHolder` recognises an empty page slot (a tall empty drawing, an alt text "Image 3", or lazy + empty). The old "list of manga" rule only runs afterwards (`generalPictures`), so a chapter that also shows recommended covers is no longer thrown away. `looksLikeChapter` states the three rules in one place (3 or more pictures, OR empty slots the site fills later, OR a chapter number plus a numbered preview picture). *Improve:* let the owner add reader-box names in Settings; also read CSS background pictures.

**B. Completing a chapter (`chapterPictures`).**
*Why:* one real address plus 6 empty slots should become 7 pictures when the site's pattern is clear. *How:* it asks in this order and keeps the first answer that fills every slot: (1) the page text again (`pageTextPictures`: addresses written in a script, a hidden block or `<noscript>`, only in the **same folder** as the first picture, so a banner can never slip in); (2) the scripts (`fromScripts`); (3) **numbering** (`inferNumbered`: the first picture is `1.webp`, so the others are `2.webp … N.webp`, where N is the number of slots on the page). Picture 2 and the LAST picture are asked for first (`existsRun`, six at a time); only when both really exist is the whole list trusted; never more pictures than the page has slots (so no request for a page 8 that does not exist, R28-3). The PDF download uses the same function, so a chapter is complete in the file too. *Improve:* remember per site which step worked; draw "page 3 missing" boxes in the right place.

**C. Sealed chapters (`sealedPage`) — told honestly, never bypassed.**
If the page carries the theme's own marker `InitMangaEncryptedChapter` inside a script, the site is hiding its pictures **on purpose**. Step (3) numbering is then **not** used and nothing is decrypted or guessed (rule 4, section 3). The reader shows what the page plainly gives and `partialNote` adds the yellow note "Only 1 of 7 pictures of Chapter 1 could be found …" with **Retry**, **Open on the site** and **Details** (R28-4, R28-10). *Unverified:* the real mgread.io could not be reached from the build machine, so what its own script does with that marker is inferred from the owner's report and from the marker name; the code only reacts to the marker's presence.

**D. A false "LOCKED" (`mainText`, `LOCK_RE`, `noImagesError`).**
*Why:* a wrong "locked" message sends the person away from a site that could be read. *How:* `mainText(doc)` copies the page, cuts away menus, headers, footers, side blocks, comment boxes and "recommended" blocks from the **copy**, and the lock words are searched only in what is left. A wrapper that holds more than 60 % of all text is kept (a `<div class="has-sidebar">` around the whole page would otherwise empty the text and hide a real "locked" notice; R28-14). A page whose own text says "locked … log in to read" is still reported as LOCKED (R28-12). *Improve:* look at the reading box only.

**E. Chapter lists split into pages (`pagerLinks`, `morePages`, `enhanceSeriesPage`, `loadSeriesList`).**
*Why:* many themes show 24 chapters per page. *How:* `pagerLinks` finds the page-number links under the series folder (`PAGER_RE`: `/page/N/` or `?page=N`), `morePages` downloads the other pages 3 at a time (at most 40 pages and about 40 seconds), reads the chapters of each with the same rule as page 1, joins them without repeats and sorts them; a page that could not be loaded is named in the notice instead of being hidden. A chapter page that lists fewer than 4 chapters also looks for the series page. `isWordHref` stops words such as `Previous sentence` from becoming addresses (R28-6). *Improve:* remember the page template per site; follow `rel="next"`.

**F. Google "No Results" (`hasGoogleResults`, `googleNote`, `GOOGLE_NOTE`).**
*How:* a real result has a title link with an address (`a.gs-title[href]`); the "No Results" box has the class `gs-no-results-result` and no title link, and is ignored. When Google has nothing, the panel closes, the free engines answer and the results page carries a yellow note that says **why** (the sites-only rule). *Improve:* when Google changes its page, change only `hasGoogleResults`.

**G. "Copy my sites for Google" (`mySitesForGoogle`, button `#setGSites`).**
*Why:* a Google engine can only search the sites in its control panel, and typing 20 manga sites by hand is slow. *How:* it reads the hosts of your Recent list, bookmarks, reading history and the open page, drops search engines, this app's own address and hosting sites (`SKIP_HOST`), puts the most used first, keeps at most 50 and writes each as `host/*`, the form Google's "Sites to search" accepts; the list is shown under the button and copied (R28-13). *Improve:* let the person untick sites; open the Google control panel in one tap.

**H. 28b — the Google button, a pasted `google.com/search` address and the chip stay inside MangaFlow.**
*Why:* the button's own title says "Search these words with Google inside MangaFlow", but without an API key it opened google.com in a new tab. *How:* `navigate()` no longer asks for a key when it meets `google.com/search?q=…` (it turns it into the same in-app Google search); `#googleBtn` passes the typed words to `navigate(words, true, { engine: 'google' })`; the results-page chip is plain "Google" (no ↗). With a key the words go to the Google API list; without one to the key-less search panel (`googleSearch`); if Google cannot answer, the free engines take over. The only time the button leaves the site is an **empty** box (R28-19). *Improve:* with an empty box, focus the box and say "Type the words first" instead of leaving.

**I. Smaller things.** The error report gained lines for reading box, empty placeholders, pictures in unusual attributes, the sealed-chapter marker and the chapter-list pages (`diagnose`); two Troubleshoot symptoms (`partial`, `googlenone`) and a corrected button list; the settings note about Google's 2026 rule; messages no longer mention `start-manga.bat` / `proxy-local.js`; `test/ui.test.js` tries `require('playwright')` first so it runs on the owner's own computer; comments corrected where they had drifted (style.css round 9 block, `index.html` security-policy comment, `accounts-worker.js`, `reload-wheel.js`, `troubleshoot-data.js`); `index.html` comment about the free engine order now includes Yahoo.

**J. 28c — an engine address that cannot be loaded (`navigate()`, the branch for addresses).**
*Why:* when Yahoo (or any engine) refused every proxy, the person got a red pop-up and no way forward except typing the search again. *How:* the load of an address is wrapped in `try / catch`; when the address is a search-engine host (`isSearchHost`) **and** carries words (`queryOf`), **and** at least one proxy exists, the failure builds the same friendly page as a typed search (`resultsPage`: the words, the chips of every engine, the reason under *Details*) and a toast says which engine did not answer. The "Show the original page" link (an address ending in mf-raw), a non-search address or a person with no proxy at all keep the old red pop-up and the Settings hint. `stale()` is checked first, as everywhere in `navigate()`. *Improve:* try the next engine by itself when the person did not choose this one on purpose (idea in section 16).

**K. 28d — inline event handlers of other sites (`onSecurityViolation`).**
*Why:* see row 10 above: a correct block was shown as an error. *How:* a violation whose directive is `script-src-attr` (only about attributes such as `onclick=`) is ignored by the pop-up; the second listener in section 18 still records it in `cspSeen`, so the bug report shows it. It cannot hide a mistake of MangaFlow itself, because `index.html` has no inline handler (check R28-21 C), and a script block of MangaFlow's own page still opens the pop-up (R28-21 B). *Honesty:* the build machine's Chromium (153) does not send this event for `DOMParser`, so the check builds the same event by hand (a real kingofshojo.com page could not be reached); the fix follows the owner's report. *Improve:* when the test browser is newer, add a real page with `onload=` attributes.

#### Files

| File | Round 28 |
|---|---|
| `app.js` | the changes above (it grew from about 6100 to about 6460 lines) |
| `index.html` | `#setGSites` button + Google note, comment fixes |
| `style.css` | the yellow note under a partly read chapter, comment fixes |
| `troubleshoot-data.js` | two symptoms, wording without `start-manga.bat`, corrected comment |
| `test/server.js`, `test/ui.test.js` | the *Init Manga* mock family; 23 new checks R28-1 … R28-21 (63 → 86) |
| `test/check-guide.js`, `MANGAFLOW.md` | new checker, guide rebuilt from the real files |
| `accounts-worker.js`, `reload-wheel.js` | **comments only** (no code change) |
| unchanged | `worker.js`, `pdfmaker.js`, `profiles.js`, `chapter-slider.js`, `edge-slider.js`, `_headers`, `googledb6fd0cf04d837f7.html` |

**What to upload:** `index.html`, `style.css`, `app.js`, `troubleshoot-data.js` (and, if you like, the two comment-only files). **No Worker redeploy is needed.** In the Google control panel add your manga sites to "Sites to search" (paste what **Copy my sites for Google** gives you).

#### Tests and honesty

Result of the full run of that delivery (mock sites, section 10): 86 passed, 0 failed; `node --check` is clean for every `.js` file; ESLint finds no errors. **Not tested:** the live mgread.io (not reachable from the build machine), the real Google element and the owner's real engine, the real Workers, real phones. A green run means "the code does what the mock pages ask for". If a live site still shows only part of a chapter, copy the report (Settings > Troubleshoot > Copy full report, or Details under the chapter): the new report lines show which of the steps in A / B ran.

#### Lessons (rules for the next round)

* A rule that **throws pictures away** must run last, after the precise rule (the reading box) had its chance.
* Words such as "locked" must be searched in the page's **own** text, never in menus or comments.
* Never write "fixed" for a live site without a live test; say "fixed for the mock, please test" (the round-26 claim about WordPress pictures was wrong).
* Anything that depends on an **API key** must also work without one, because the default key is empty.
* A guide that is typed from memory drifts. Keep tables generated from the files and run `node test/check-guide.js` after every change to this file.


### Round 29 (29a – 29e) — no start-page flash, one-tap Paste, full screen per device, a background keeper, the human check

It is written from the real code and the real test run of that delivery.

#### What the owner reported (2026-10-29)

* "When I refresh the page while in reading mode, or on the website itself after searching, I see a glitch of the homepage." And: "sometimes if I close the browser and reopen it … glitches and jumps, front and back."
* Sites that say **"verify you are human" / Cloudflare**: handle it inside MangaFlow as far as allowed, and tell me the steps on my side. (Today: open the site in another tab, submit the check, then it works.)
* While reading: keep the **next nine chapters** ready and keep loading failed pictures / chapters in the background, without manual refresh or Retry.
* **Full screen:** on phones and small tablets hide every button except the full-screen (exit) button; on a computer keep all buttons.
* **Paste button** on the start page: paste the most recently copied text at once, with no second confirmation; only the arrow (▾) shows the clipboard list.
* Works on computer and mobile, user friendly; recreate the files; the guide must hold everything (why / how / how to improve for each part, the designs); use only HTML, CSS and JavaScript and make it faster.

#### How it was worked

Every item got a check that FAILED on the old code first (rule 9, section 3), then the fix, then the check. The flash was measured by **sampling what is on screen while the page loads** (which of `#start`, the website frame, the reader is visible, 100 times a second), not by looking at one final picture. A fake "flaky" site (`/manga/flaky/…` in `test/server.js`) fails the first pictures and chapters on purpose, and a fake "shield" site (`/manga/shield/…`) answers with a Cloudflare-style check page, so the background loading and the human check can be proved without the real internet.

#### What was really wrong, what was changed, why it works, how it could be better

| # | What the owner saw | Real cause | Fix (where) | Checks |
|---|---|---|---|---|
| 1 | **29a** The start page flashed on refresh / reopen, then the page or the reader appeared (and sometimes the screen jumped between them) | `#start` is plain HTML, so the browser paints it at once; `app.js` is 540 KB and only afterwards `resumeFromHash` reads the saved place (`#r=` chapter, `#p=` page, `#q=` search) and switches screens. For a moment the wrong screen was visible, and a reader opened half-way. | `boot.js` is a tiny script in the **head**: when the address holds a saved place it puts the class `mf-resuming` on `<html>`; CSS then shows a plain cover (`#resume`, "Reopening where you were…") above everything. `endResume()` in `app.js` removes it when the page or the reader is really on screen (or the load failed); `boot.js` removes it by itself after 30 s, so it can never stay. The saved light / dark theme and accent colour are also set in `boot.js`, so a dark page does not flash white. | R29-1 … R29-6 |
| 2 | **29b** The Paste button asked for a second confirmation (it opened the clipboard list first) | `pasteInto` opened the list whenever the browser would not hand over the clipboard, and the button and the arrow did nearly the same thing. | Paste reads the clipboard once and puts the text into the box (`pasteInto`). If the browser refuses (it asks the person first; a page can not remove that question) the box is only focused and a short message says what to do. Only the arrow (`#popClip`, `openClip`) opens the list; a row of the list fills the box. | R29-7 … R29-10 (computer + phone) |
| 3 | **29c** Full screen kept all the buttons on a phone | One rule hid the same things on every screen size. | `syncFs` adds `body.fs` for any full screen and `body.fs-small` when `SMALL_SCREEN` (a media query: phones and small tablets) is true. The CSS hides the bars, keys, wheel, sliders and side buttons only for `body.fs.fs-small`; the exit icon (`#fsRead` in reading mode, `#fsExit` on a website page) stays. A computer keeps everything. | R29-11 … R29-13 |
| 4 | **29d** Failed pictures / chapters needed Retry; the next chapters were not ready | Each picture or chapter was tried a few times, then waited for the person. Only lazy pictures near the screen were loaded. | The **keeper** (section 9b of `app.js`): a timer every 1.5 s that (1) heals failed chapter boxes one at a time, (2) heals failed pictures up to 3 at a time with a growing wait (`healBase()` × 2ⁿ, at most 90 s, ±15 % so many pictures do not retry in the same second), (3) restarts pictures stalled for more than 45 s, (4) loads the pictures of the current chapter and the next `settings.preloadAhead` chapters (default 9; Settings > Reading > `#setAhead`: Off / 3 / 5 / 9) at most 4 at a time (3 on a narrow screen). It wakes when the network comes back or the tab becomes visible, and uses fewer chapters when the browser says "data saver" or the device has little memory. | R29-14 … R29-18 |
| 5 | **29e** A Cloudflare "verify you are human" page ended in a red "blocked" pop-up and a stuck chapter | The proxy only reported the number (403 / 503). A person can pass such a check, a helper can not. | See section 4.13: the page is recognised (`HUMAN_RE`), the person gets the **verify box** (`#verifyBox`) or, while reading, a box in each waiting chapter, with **Open the site** and **I did it – try again**; coming back to the tab retries by itself. The waiting chapters make no further requests (the keeper skips them). Nothing is solved or skipped (rule 4). | R29-19 … R29-23 |

**Performance (what "make it faster" was read as).** Only HTML / CSS / JS tools were used: the cover and the theme need no 540 KB wait; pictures of the next chapters are fetched while you read (so scrolling never waits), with limits for data saver and low memory; failed items retry with growing waits instead of in a burst. The reading column, the picture decoding and the memory release of far chapters were not changed. *Not measured:* real network speed on real phones.

#### Files

| File | Round 29 |
|---|---|
| `boot.js` | **NEW** (head script, section 5.1): saved theme + the "reopening" cover switch |
| `index.html` | `<script src="boot.js">`, `#resume`, `#setAhead` (+ note), `#verifyBox` with `#vfText`, `#vfOpen`, `#vfRetry`, `#vfClose` |
| `style.css` | cover, full-screen per device, verify box and `.ch-verify` |
| `app.js` | `endResume`, `SMALL_SCREEN`, `pasteInto`, the keeper, human-check helpers, `askProxy` / `fetchHTML` / `explain` / `navigate` / `startReading` / `fillChapter` changes, report headers "build round 29" |
| `troubleshoot-data.js` | one new symptom (`human`) |
| `test/server.js`, `test/ui.test.js` | the flaky and shield mock sites; 29 new checks R29-1 … R29-23 (86 → 115) |
| `MANGAFLOW.md` | this guide for round 29 |
| unchanged | `worker.js`, `accounts-worker.js`, `pdfmaker.js`, `profiles.js`, `chapter-slider.js`, `edge-slider.js`, `reload-wheel.js`, `_headers`, `googledb6fd0cf04d837f7.html` |

**What to upload:** `index.html`, `style.css`, **`boot.js` (new file, same folder)**, `app.js`, `troubleshoot-data.js`. **No Worker redeploy is needed.** If `boot.js` is missing the site still works (only the flash comes back).

#### Tests and honesty

Result of the full run of that delivery (mock sites, section 10): 115 passed, 0 failed; `node --check` is clean for every `.js` file; ESLint finds no errors. **Not tested:** real phones, a real browser restart with its own session restore, the real clipboard permission question, live sites, the real Cloudflare (a real check can not be created from here), the real Workers. **Known limits:** the permission question of the browser for the clipboard can not be removed by a page; a Cloudflare pass lives in the cookies of the browser that solved it, so the proxy may still be refused after you passed it (then read that chapter on the site); the keeper uses more data and memory than reading only (switch it Off or to 3 in Settings if that matters).

#### Lessons (rules for the next round)

* Measure a flash by **sampling the screen during the load**; a screenshot after the load proves nothing.
* A page that is painted before the script runs (static HTML) needs a head script, not a faster script.
* When a test passes on the first run, break the code on purpose once to see it fail (R29-5 first passed for the wrong reason because the first sample was taken before `boot.js` had run).
* A check that only a person can pass is a message and two buttons, never a workaround.


### Round 30 — the endless reloading, wrong pictures on a locked chapter, a clearer 404

It is written from the real code and the real test run of that delivery.

#### What the owner reported (2026-10-30, with three reports)

* **Reading mode shows "random images of the main page" instead of the chapters** (mgread.io, *Using My Cooking Skills in a Murim World*, "chapter 10 of 16"; the open page was `…/chapter-1`). "Unable to fetch the chapters."
* **After closing and reopening the browser the site keeps reloading and reloading** and shows nothing; **no error, report or notification** came. (The diagnostic of that moment: profile `admin0` signed in with cloud sync, "sync OK" at the second of the report, keeper idle, no site waiting for a human check.)
* An error report from **arenascan.com**: `no proxy could load it — mangaflow-proxy…workers.dev: HTTP 404. Tip: add your own proxy…`. Address `…/the-white-tiger-princess-is-not-in-danger-chapter-1`, while the page open was another manga.
* The reports show the site running at `https://dharmadr.github.io/Mangafox/` (a repository called *Mangafox*; the guide's other sections say *Mangaflow*). The files are the same; upload them to whichever repository serves the page.

#### How it was worked

The reload code was searched first (`location.reload`, `hashchange`, `pageshow`): the only automatic one is in `profiles.js` (a signed-in cloud profile reloads when the pulled lists "changed"). Its merge was read against what `app.js` really stores, a test with a **slow cloud answer** (1.5 s) was written, and the OLD code loaded the page **8 times in 11 seconds** (check R30-1). The picture complaint could **not** be checked on the real site (the build machine cannot reach mgread.io; the page fetch tool refused it), so a mock "gate" manga was built from the report's words and the code path that shows page-wide pictures as a chapter, and the OLD code showed **5 pictures** (covers and promos) in each locked chapter (R30-7, R30-8). **Honest limit:** the real mgread.io page was never seen; if the real cause is another one, the new "Details" report of a chapter (`diagnose`) holds what is needed.

#### What was really wrong, what was changed

| # | What the owner saw | Real cause | Fix (where) | Checks |
|---|---|---|---|---|
| 1 | **The site keeps reloading after a reopen** | `profiles.js` called `location.reload()` whenever `pullState` said the lists changed. The merge never made the two copies equal: (a) it kept 300 `recent` rows, `app.js` keeps 20 and trims them at its next save, the cloud gave the rest back, so the copies differed again; (b) `reads` were joined by chapter address, but the app keeps ONE row per manga (same `id`), so every chapter ever read on the other device came back as a second row; (c) older and newer copies of one row were both kept. Each reload started the same race again. | `mergeLists`: same keys as the app (`id` for `reads`, `url` for `recent` / `books`), the limits the app keeps (`CAP`: 20 and 30), the newer copy of a row wins, rows with a time are sorted newest first. A change from the cloud no longer reloads: `profiles.js` sends `mf-lists-changed`, `app.js` reads `recent`, `books`, `reads` again and redraws the start page (`window.MF_LISTS_LIVE`). | R30-1 … R30-3 |
| 2 | **No report, no notification** | Nothing counted page loads, and the "Reopening where you were…" cover (round 29a) only had a 30-second timer. | `boot.js` counts loads per tab (`mf_boots`); **5 in a minute** sets `window.MF_LOOP`, switches automatic reloads off for 10 minutes and `app.js` opens the report "The page keeps reloading" (numbers, reasons, profile, last sync). Every automatic reload goes through `window.MF_RELOAD(why)`, which writes the reason down and refuses during a loop. | R30-4, R30-4b |
| 3 | A reopen that is slow shows only the spinner | no way out, no report | after `resumeSlowMs` (12 s) the cover shows "This is taking longer than usual" and **Open the start page** (`#resumeHome`); after twice that time `resumeFromHash` removes the cover and opens the report "Taking too long" (saved address, step, proxies, online state). | R30-5, R30-6 |
| 4 | **Random images instead of the chapter** | When a page has no reading box, `scanPictures` falls back to ALL pictures of the page (`how: 'page'`). On a chapter behind a login wall, or when the site answers a chapter address with the manga's **main page**, those are promos, covers and the logo. | `wrongPage` (used by `chapterPictures` for `how: 'page'` only): **'series'** = the page's own canonical address is a parent folder of the chapter address without a chapter number; **'wall'** = the chapter's own text says log in / locked / coins / premium (`LOCK_RE`, after `mainText` cut menus, side blocks and comments) and 10 or fewer pictures were found. No pictures are returned; `noImagesError` gives the honest sentence. A page with a real reading box is never touched. | R30-7, R30-8 |
| 5 | (found while testing 4) locked / removed / empty chapters were asked for again and again | the keeper of round 29d retried EVERY failed chapter for ever | an error that carries a report (`e.details`) or is 404 / 410 / locked / main page is **permanent**: no retry flag, no "keeps trying" line, an **Open on the site** link instead. | R30-7, R30-8 |
| 6 | arenascan.com: "HTTP 404 … add your own proxy" | the site itself answered 404; a proxy tip cannot help | `fetchHTML` marks "NOT FOUND: the site itself answers that this page does not exist" when a helper says 404 / 410 and the others only failed to connect; `explain` gives it the title "The page was not found (HTTP 404)". | R30-9 |

#### Files

| File | Round 30 |
|---|---|
| `boot.js` | reload-loop guard (`MF_RELOAD`, `MF_LOOP`), the slow-cover message and button |
| `profiles.js` | stable `mergeLists` (`keyOf`, `CAP`), no reload, `mf-lists-changed` |
| `app.js` | `mf-lists-changed` listener, loop report, slow-reopen report, `wrongPage`, `noImagesError(kind)`, permanent errors, 404 explanation, `resumeSlowMs` |
| `index.html`, `style.css` | `#resumeSlow` and `#resumeHome` inside the cover |
| `test/server.js`, `test/ui.test.js` | mocks `/manga/hang/`, `/manga/gate/`, `/manga/gone/`, a slow cloud answer; 10 new checks R30-1 … R30-9 (115 → 125) |
| `troubleshoot-data.js` | two symptoms (`reloadloop`, `mainpage`) |
| `MANGAFLOW.md` | this guide |
| unchanged | `worker.js`, `accounts-worker.js`, `pdfmaker.js`, `chapter-slider.js`, `edge-slider.js`, `reload-wheel.js`, `_headers`, `googledb6fd0cf04d837f7.html` |

**What to upload:** `index.html`, `style.css`, `boot.js`, `app.js`, `profiles.js`, `troubleshoot-data.js`. **No Worker redeploy.** After uploading, open the site once with the cache bypassed (a phone: clear the site's data) so the new `profiles.js` and `boot.js` replace the old ones; an old `profiles.js` next to the new `app.js` still reloads, because the fix is in both files.

#### Tests and honesty

Result of the full run of that delivery (mock sites, section 10): 125 passed, 0 failed. **Not tested:** the real mgread.io (so the "random images" fix is built from the report and a mock, not from the real page), a real browser restart on a phone, the real cloud Worker. The reload loop itself **was** reproduced and is fixed in the mock; whether it was the only cause on the owner's phone is not proven (a browser that reloads a restored tab by itself would not be stopped, but it is now reported).

#### Lessons (rules for the next round)

* A line that reloads the page by itself needs a **stable reason** (the two sides must become equal after one step) and a **guard** (a counter that stops it and a report that says why). Search for every `location.reload` when someone says "it keeps reloading".
* Two copies of a list must be merged with the **same keys and limits the app itself uses**, and the newer row must win.
* Retrying is only right for errors that can change (network, 5xx, timeouts), never for "locked", "removed", "main page", "not found".
* A page-wide picture fallback must have a way to say "this is not the chapter".
* A background test run stops when the conversation sits idle for a long time: start it and poll it inside the same turn.


### Round 31 — the progress line always at the top, a 404 gets a second try

This is the newest entry. It is written from the real code and the real test run of this delivery.

#### What the owner reported (2026-10-31)

* "The **speed lines** that show how much of the chapter is left while scrolling" (the thin reading-progress line, `#progress`): **in full screen on a phone it does not go to the top** ("it stays like without full screen"); it must **always be at the top of the screen, on every device and browser, in full screen and while scrolling down**, so that it never shows "in between the chapters". In normal reading mode it was already right.
* The **arenascan.com** chapter that does not load: the owner says the site loaded before, "previously it seems to be only fixed, then the website shows up". No new report text arrived with this message; the report of the round-30 request (HTTP 404 through the Worker, address `…/the-white-tiger-princess-is-not-in-danger-chapter-1`) is the only data.

#### How it was worked

The line's CSS was read first: `#progress { position: fixed; top: var(--safe-t) … }`. `--safe-t` is `env(safe-area-inset-top)`, the space a phone keeps for its notch or status bar. In a normal page that space is 0 (the browser's own bar is above the page) or it is covered by the title bar, whose `padding-top` also uses it. **In full screen** the phone browser reports the real space (about 24–40 px on notch phones) **and** round 29c hides the title bar, so the line floated that far down **inside the pictures**. The same happens in normal mode while the title bar slides away on scrolling down. A small throw-away script put 32 px into `--safe-t`, opened a chapter and measured the line: **32 px in every state** (red). No notch is needed to see it: any value above 0 shows it.

For the 404 nothing can be measured on the real site (arenascan.com cannot be reached from the build machine; the page fetch tool was refused). What the report does show: the **Worker passes the site's own status**, so the site answered 404 for that exact spelling of the address. Many WordPress sites answer one spelling (with or without the final slash) with the page and the other with 404, depending on rewrite rules and cache; an address copied from a search result or typed by hand can have either. So the fix is generic and cheap, and it is **proved only on a mock** of that behaviour.

#### What was really wrong, what was changed

| # | What the owner saw | Real cause | Fix (where) | Checks |
|---|---|---|---|---|
| 1 | The progress line is not at the top in full screen on a phone / while scrolling down | `top: var(--safe-t)`: the notch space was used as the distance from the top, but the title bar that used to fill that space is hidden in full screen (and slides away on scrolling) | `style.css`: `#progress { top: 0 }` for every state. The title bar keeps its own notch space (`padding-top`), so nothing else moves. | R31-1, R31-2 (phone and computer) |
| 2 | arenascan.com: "page not found (HTTP 404)" for a chapter that opens on the site | the site answers one spelling of the address with 404 (final slash added / missing) | `slashVariant` + `fetchHTML` (a thin wrapper) + `fetchHTMLOnce` (the old body): only when every helper says "NOT FOUND: the site itself", ONE more request with the other spelling; if it works the page is used and cached under the first address, if not the ORIGINAL answer is reported. Never for POST, file endings or the front page. | R31-3, R31-4, R31-5, R31-6 |
| 3 | (help text) | the troubleshooter had no entry for either | `troubleshoot-data.js`: symptoms `notfound` and `progressline` | (data) |

#### Files

| File | Round 31 |
|---|---|
| `style.css` | `#progress` at `top: 0` with the long explanation |
| `app.js` | `slashVariant`, `fetchHTML` wrapper, `fetchHTMLOnce`, report headers "build round 31" |
| `troubleshoot-data.js` | two symptoms (`notfound`, `progressline`) |
| `test/server.js`, `test/ui.test.js` | mock `/arena-demo-chapter-1/`, `/arena-demo-chapter-2`, `/arena-lost-chapter-1`; 8 new checks R31-1 … R31-6 (125 → 133) |
| `MANGAFLOW.md` | this guide |
| unchanged | `index.html`, `boot.js`, `profiles.js`, `worker.js`, `accounts-worker.js`, `pdfmaker.js`, `chapter-slider.js`, `edge-slider.js`, `reload-wheel.js`, `_headers`, `googledb6fd0cf04d837f7.html` |

**What to upload:** `style.css`, `app.js`, `troubleshoot-data.js`. **No Worker redeploy.** Open the site once with the cache bypassed (a phone: clear the site's data), otherwise the old `style.css` stays in use and the line stays where it was.

#### Tests and honesty

133 of 133 browser checks pass on the mock sites. The notch is **simulated** (`--safe-t` set to 32 px); a real phone with a real notch, in real full screen, was not available. The 404 second try is proved on a mock; whether it is the cause of the owner's arenascan.com problem is **not proven** (the real site could not be reached and no new report text arrived). If that chapter still says "not found", send the report of that moment (Details / Copy report) together with the address as it opens on the site.

#### Lessons (rules for the next round)

* A distance taken from the safe area (`env(safe-area-inset-*)`) is only right while something fills that space. Anything that must sit at the very edge uses 0.
* A "not found" from a site is a fact about ONE spelling of an address. Try the other spelling once before giving up, and report the first answer if the second does not help.
* When a message says "I attached a report" and no text came with it, say so and work from what is really known.

### Round 32 — Google Lens style translate for every page

This is the newest entry. Written from the real code and the real test run of this delivery.

#### What the owner reported (2026-10-31)

> "I'm thinking of creating a new site similar to the previously registered one where it can translate all the [words] visible in the pics … I want another option to translate the mangas. It is like in the reading mode of the site … it will be working like a Google lens like the website will be showing in another language … make sure to add the option like that in the settings too so we can change whatever the language we wanted … I want to read all the chapters and pages and the images in the reading mode … make sure to create the new md file too … make sure to use the same designs and everything … and it just works with the new translate option without any issue and make sure to use only CSS, JS and HTML"

#### How it was worked

The whole feature was designed and built from scratch as an **add-on** (`translate.js`) using the same pattern as the wheel, the sliders and profiles — an isolated file that talks to `app.js` only through browser `CustomEvent`s and that can be removed by deleting one `<script>` line. No framework, no npm packages in the website (Playwright is only for the tests).

The biggest challenge was running OCR (text reading) inside the browser without a server. **Tesseract.js 5.1.1** was chosen because it is pure JavaScript + WebAssembly, works offline, and does not require any CDN or extra domain. It needs `'wasm-unsafe-eval'` in the Content-Security-Policy, which was added to `index.html` and `_headers`.

A test page (`test/page.jpg`) was created with three speech bubbles (two English, one Japanese) and an end-to-end test suite (`test/translate.test.js`, forty-three checks) was written first (test-driven development). The OCR settings were tuned on that picture:
* PSM 12 (sparse text, any orientation) for all languages.
* Japanese: two passes (`jpn_vert` + `jpn`), minimum confidence 75.
* Korean, Chinese, English: one pass, minimum confidence 50.
* Own line grouping using union-find (gap across ≤ 0.9 letter sizes, along ≤ 2.2) because Tesseract merges bubbles into one paragraph.
* Vertical Japanese columns ordered right-to-left.
* Duplicate detection by overlap (for tiled tall pages).

For translation, three services are tried in order: Chrome built-in Translator API (Chrome only, no CORS issue), Google `translate.googleapis.com/translate_a/single` (gtx, no key needed, CORS-friendly), MyMemory (free, with CORS). A 60-second rest is applied after two consecutive failures. Results are cached.

The overlay is a `div.mf-tr-layer` inserted after each `img.page`, positioned with `position:absolute` inside `.chapter { position: relative }`. Font size is fitted by binary search. Bubble background colour is sampled from the edge ring (median). Tapping a box shows the original text (peek).

The OCR files (~20 MB) are self-hosted in the `ocr/` folder. GitHub Pages serves them automatically. The `_headers` file and the `<meta>` CSP were updated to allow `'wasm-unsafe-eval'`.

#### What was really done, what was changed

| # | New feature | Where | Checks |
|---|---|---|---|
| 1 | Translate add-on (`translate.js`): button, status bar, language panel, OCR with Tesseract.js, grouping, translation (3 services), overlay boxes, peek | new file `translate.js` | T1–T41 |
| 2 | OCR engine files (Tesseract.js 5.1.1, 6 language packs) | new `ocr/` folder (~20 MB) | T41 (selfTest) |
| 3 | CSP: `'wasm-unsafe-eval'` added | `index.html`, `_headers` | T31 |
| 4 | Settings: 5 new keys (`showTranslate`, `trTo`, `trFrom`, `trEngine`, `trAuto`) | `app.js`, `index.html` | T4–T7 |
| 5 | Translate Settings tab (`data-tab="translate"`, `#trBox`) | `index.html` | T4, T5 |
| 6 | `applyAddons` sets body classes `no-translate`, `no-tr-file`; `applySettings` dispatches `mf-settings`; `mf-settings-set` listener (whitelist 5 keys); `mf-translate-problem` listener; report lines | `app.js` | T3, T36, T38 |
| 7 | `body.no-tr-file [data-tab="translate"] { display:none }` | `style.css` (ROUND 32 block) | T36 |
| 8 | 4 new troubleshoot symptoms (`trfiles`, `trnothing`, `trwrong`, `trservice`) + translate prompt | `troubleshoot-data.js` | (data) |
| 9 | `tidy()` fix: strip space before `?!.,;:` after CJK character | `translate.js` | T12 |
| 10 | ui.test.js header updated to 133 (was "125 at the end of round 30") | `test/ui.test.js` | check-guide |

#### Files

| File | Round 32 |
|---|---|
| `translate.js` | NEW — ~410 lines, fully commented in beginner English |
| `ocr/` folder | NEW — Tesseract.js 5.1.1 + 6 language packs (~20 MB total) |
| `index.html` | `'wasm-unsafe-eval'` in CSP; Translate Settings tab + fieldset; `<script src="translate.js">` |
| `_headers` | `'wasm-unsafe-eval'` in `script-src` |
| `app.js` | 5 new settings keys + defaults; `applyAddons`/`applySettings`/`openSettings` wiring; event listeners; report row |
| `style.css` | ROUND 32 block: `body.no-tr-file [data-tab="translate"] { display:none !important }` |
| `troubleshoot-data.js` | 4 new symptoms + translate prompt |
| `test/translate.test.js` | NEW — 43 translate checks |
| `test/ui.test.js` | header count updated 125→133 |
| `MANGAFLOW.md` | this guide |
| unchanged | `boot.js`, `pdfmaker.js`, `chapter-slider.js`, `reload-wheel.js`, `edge-slider.js`, `profiles.js`, `worker.js`, `accounts-worker.js`, `googledb6fd0cf04d837f7.html`, `test/server.js`, `test/check-guide.js`, `test/page.jpg` |

**What to upload:** `index.html`, `_headers`, `app.js`, `style.css`, `troubleshoot-data.js`, `translate.js`, and the entire `ocr/` folder. **No Worker redeploy needed.** Clear the site cache after uploading (phone: Settings → Site data → clear MangaFlow). Use Settings → Translate → **Test translate** to confirm all 10 OCR files loaded.

### Round 33 — translate fixes, Hindi support, Kuaikan next-chapter fix

This entry is for build round 33. Written from the real code delivered in this session.

#### What the owner reported (2026-11-01)

After round 32 was pushed to GitHub the owner found these problems:

1. **translate.js was truncated** — the owner re-uploaded an old 241-line partial file via the GitHub web UI, overwriting the correct 601-line version.
2. **Korean webtoons (Naver, Webtoons) still showed 0 bubbles** — Root cause: those sites send images without CORS headers, so `canvas.getImageData()` throws a "tainted canvas" error. The OCR engine never received the pixels.
3. **Kuaikan showed "No next chapter found after Chapter 1"** — even though the site has more chapters. The prev/next links (IDs 800334 and 800342) were found correctly but `synthesizeChapters()` could not build a list because Kuaikan uses numeric IDs in URLs, not `/chapter-N/` patterns.
4. **Hindi/Devanagari support requested** — so Hindi manga can be read and translated to English.

#### How it was worked

**Problem 1 — translate.js restored:** Copied the full 601-line file from the round-32 work folder back to the repo and pushed. Restored: CORS_BLOCK proxy-first fetching, Korean min confidence 35, Chrome-downloading error fix, hardcoded dark panel CSS.

**Problem 2 — Naver/Webtoons CORS:** Added a `CORS_BLOCK` list of hostnames known to block canvas pixel reading (naver.com, navertoon.com, kakao.com, kakaocdn.net, webtoons.com, lezhin.com, tapas.io, tappytoon.com). `isBlocked(src)` checks the hostname. `pageSource()` skips the canvas test entirely for blocked sites (saves 200 ms). `fetchBitmap()` puts the owner's Cloudflare Worker proxy FIRST for blocked sites, so those images are routed through the proxy which fetches them server-side without CORS restrictions.

**Problem 3 — Kuaikan ID-based chapters:** Added a "second last resort" block in `app.js` after `synthesizeChapters`. When the list has fewer than 2 chapters AND `synthesizeChapters` returned null AND `findNavLinks` found at least one prev/next link → build a minimal [prev, current, next] list from those links. The reader can now continue through chapters on any site that puts prev/next links on the page, regardless of URL format.

**Problem 4 — Hindi OCR:** Added `hin` to `OCR_LANGS` (min confidence 40, translation code `hi`). Added `DEVANAGARI` regex for Unicode block U+0900-U+097F. Updated `guessLang()` to return `'hin'` when 2+ Devanagari characters are found. Updated the auto-detect probe pass to include `hin` in the combined language string. Added `hin.traineddata.gz` to the selfTest file list.

> **Owner action required for Hindi:** Download `hin.traineddata.gz` from the Tesseract language data repo and upload it to `ocr/lang/` in the GitHub repository. Without it, selecting "Hindi" will show "OCR file missing". Download URL: `https://github.com/tesseract-ocr/tessdata_fast/raw/main/hin.traineddata` — gzip it and name it `hin.traineddata.gz`.

#### What was really done, what was changed

| # | Fix / New feature | Where |
|---|---|---|
| 1 | Restored full translate.js (601 lines; was truncated to 241 by web upload) | `translate.js` |
| 2 | CORS_BLOCK list — proxy-first for Naver/Webtoons/Kakao/Lezhin/Tapas | `translate.js` section 7 |
| 3 | Korean min confidence 50->35 (Tesseract scores Korean glyphs lower) | `translate.js` OCR_LANGS.kor.min |
| 4 | Chrome "Requires a user gesture" — isDownloading flag, not counted as failure | `translate.js` translateOne() |
| 5 | Panel CSS hardcoded dark theme (#1e1e2e) — was invisible in reading mode | `translate.js` CSS block |
| 6 | 0-bubble notice when OCR ran but found no text, with suggested fix | `translate.js` processPage() |
| 7 | Hindi OCR support: hin language, DEVANAGARI regex, guessLang updated | `translate.js` |
| 8 | Auto-detect probe includes Hindi in the combined language pass | `translate.js` readPage() |
| 9 | selfTest checks hin.traineddata.gz | `translate.js` FILES list |
| 10 | Nav-link fallback for ID-based chapter URLs (Kuaikan fix) | `app.js` ROUND 33 block |

#### Files changed in round 33

| File | Round 33 |
|---|---|
| `translate.js` | Restored full 601-line version + Hindi support (was 241 lines) |
| `app.js` | Nav-link fallback for ID-based chapter URLs |
| unchanged | `index.html`, `_headers`, `style.css`, `worker.js`, `boot.js`, all test files |

**What to upload (if not using GitHub push):** `translate.js`, `app.js`. Also add `ocr/lang/hin.traineddata.gz` if you want Hindi OCR.
After uploading: clear site cache (Settings > Site data > clear MangaFlow). Use Settings > Translate > **Test translate** to confirm all OCR files.

#### Lessons (rules for the next round)

* **Never re-upload files via the GitHub web UI for this project.** The web UI replaces the whole file silently. Uploading an OLD file from your phone's downloads replaces the NEW one. Always push changes through Claude.
* **Canvas taint detection is not enough for known-blocking sites.** Always maintain a CORS_BLOCK list and skip the canvas test entirely for those hostnames. Skip saves 200 ms and avoids a confusing tainted-canvas error in the log.
* **Tesseract confidence scores vary by script.** Latin >= 50, Japanese >= 75 (two passes), Korean >= 35, Hindi/Devanagari >= 40. A single threshold for all scripts causes missed bubbles or noise.
* **Sites that use IDs in chapter URLs (not /chapter-N/) break synthesizeChapters.** Always fall back to the nav links when the chapter list is too small.

### Round 34 — Hindi traineddata file, safe auto-detect, delete history buttons

This entry is for build round 34. Written from the real code delivered in this session.

#### What the owner reported (2026-11-02)

1. **hin.traineddata.gz 404 error** — selecting Hindi (or auto-detect) caused a network error because the file was missing from the repo.
2. **Auto-detect crashed for Korean when hin was absent** — the probe pass `jpn+kor+chi_sim+hin+eng` told Tesseract to load `hin.traineddata.gz`; if absent, the whole OCR session crashed, including Korean.
3. **Delete button missing on profile reading history** — the home page "Continue reading" had a × button after Round 34, but the Bookmarks tab inside the Profile window did not.

#### How it was worked

**Problem 1 — hin.traineddata.gz 404:**
Downloaded `hin.traineddata` (1.1 MB raw) from `raw.githubusercontent.com/tesseract-ocr/tessdata_fast/main/hin.traineddata`, gzipped it to 901 KB, and committed it to `ocr/lang/hin.traineddata.gz`.

**Problem 2 — Safe auto-detect probe pass:**
Added `langFileCache` (a `Map`) and `langFileExists(code)` which HEAD-checks each `.traineddata.gz` once and caches the result. The probe pass in `readPage()` now builds `availProbe` by filtering the PROBE_LANGS list to only files that exist on the server. If a specific language is chosen and its file is missing, a clear "language file missing" message is shown instead of crashing.

**Problem 3 — Delete history buttons:**
Added optional 5th argument `onDelete` to the `item()` function in `app.js`. Both `reads` (Continue reading) and `recent` lists in `renderStart()` now pass a delete callback that splices the entry out and calls `renderStart()` to redraw. Added `.item-del` CSS in `style.css` for the circular × button.

#### Files changed in round 34

| File | Round 34 |
|---|---|
| `translate.js` | `langFileCache` + `langFileExists()` + safe probe pass + missing-file guard |
| `app.js` | `item()` 5th arg `onDelete`; delete callbacks in `renderStart()` for reads + recent |
| `style.css` | `.item-del` button CSS |
| `ocr/lang/hin.traineddata.gz` | NEW — Hindi OCR language file (901 KB gzipped) |

**What to upload (if not using GitHub push):** `translate.js`, `app.js`, `style.css`. Also upload `ocr/lang/hin.traineddata.gz`.

#### Lessons (rules for the next round)

* **Always HEAD-check language files before Tesseract tries to load them.** Tesseract crashes the whole OCR session when one file in a `+` list is missing — it does not skip it gracefully.
* **Download Tesseract files from `raw.githubusercontent.com`, not `github.com`.** The `github.com` URL returns a redirect JSON (378 bytes), not the binary.


### Round 35 — Pre-translate, better translation quality, profile history delete

This entry is for build round 35. Written from the real code delivered in this session.

#### What the owner reported (2026-11-02)

1. **Translation too slow** — translation only appeared after scrolling to each page; pages were not pre-loaded.
2. **Translation quality** — some words were translated with wrong meaning because each bubble was sent as a separate request with no context.
3. **Profile reading history delete missing** — the × delete button appeared on the home page "Continue reading" list but NOT on the "Continue reading" list inside the Profile window (Bookmarks tab).

#### How it was worked

**Problem 1 — Pre-translate / look-ahead:**
Two changes working together:

1. `IntersectionObserver rootMargin` widened from `150% 0px` to `300% 0px` — pages 3 screen-heights away now trigger the observer and start OCR+translation early.
2. New `PREFETCH_AHEAD = 4` constant and logic in `enqueue()` — when a page is enqueued, the next 4 pages in the same chapter are also enqueued immediately. The queue sorts by distance (closest page first), so page N+1 is always done before N+2.

Result: by the time you scroll to page 3, pages 4–7 are already translating in the background.

**Problem 2 — Batch translation for better context:**
Added `BATCH_SEP = ' ||| '` separator and `BATCH_MAX = 8` constant. `translateAll()` now joins up to 8 bubbles into one request (e.g. `"Hello ||| Are you okay? ||| I see."`), sends it as one call, then splits the result on the same separator. Because the translation service sees the full context of a page, it makes better choices for ambiguous words (e.g. Japanese "行く" with different meanings in different sentences). If the batch response loses the separator, the code falls back to translating bubbles one by one.

Also improved service order in `auto` mode: Google is tried FIRST when Chrome's built-in translator is NOT available (Chrome built-in is still first when it is available). Google gives better context-aware results for manga text than MyMemory.

**Problem 3 — Profile reading history delete:**
In `profiles.js`, updated `marksHtml()` to use a new `readRow()` helper (instead of the shared `row()`) for the "Continue reading" section. When `canOpen=true` (the owner's own view), each row gets a `data-act="delread"` × button. A new `delread` handler in the click delegation reads `readLists(session.user)`, filters out the matching entry by `id` (or `chapterUrl` as fallback), writes back with `writeLists()`, fires `mf-lists-changed` so `app.js` redraws the home page, and re-renders the profile window. Also added `.mfp-del` CSS (circular × button that turns red on hover).

#### What was really done, what was changed

| # | Fix / New feature | Where |
|---|---|---|
| 1 | rootMargin widened 150%→300% (start OCR earlier) | `translate.js` IntersectionObserver |
| 2 | Look-ahead prefetch: next 4 pages enqueued when a page becomes visible | `translate.js` enqueue() |
| 3 | Batch translation: up to 8 bubbles per request for better context | `translate.js` translateAll() |
| 4 | Google tried first in auto mode (better quality when Chrome built-in is absent) | `translate.js` order() |
| 5 | × delete button on each "Continue reading" row in Profile Bookmarks tab | `profiles.js` marksHtml() + click handler + CSS |

#### Files changed in round 35

| File | Round 35 |
|---|---|
| `translate.js` | Pre-translate prefetch, batch translation, improved service order |
| `profiles.js` | × delete button on profile reading history rows |
| `app.js` | unchanged |
| `style.css` | unchanged |

**What to upload (if not using GitHub push):** `translate.js`, `profiles.js`.

#### Lessons (rules for the next round)

* **Pre-translate pays off.** Widening the IntersectionObserver margin and enqueuing siblings together adds ~4 pages of free prefetch at no extra cost — the OCR worker is idle while you read anyway.
* **Batch translation reduces wrong-word errors.** Services translate ambiguous words better when given full sentence context. The `|||` separator approach is cheap and the fallback keeps it safe.
* **Profile and home-page history are in different files.** Home-page `reads` are in `app.js`; profile `reads` are in `profiles.js` under `readLists()` / `writeLists()`. A delete on one must also fire `mf-lists-changed` to stay in sync.



#### Tests and honesty

133/133 ui checks + 43/43 translate checks pass on mock sites in headless Chromium. Things not tested on real hardware:
* **OCR accuracy on real manga scans.** The test page is clean. Real scans with stylised fonts, low resolution, or hand lettering will give worse results.
* **Translation quality.** The fake service returns `TR[xx]: <original>`. Real services may fail or give rough translations.
* **Chrome Translator API.** Only available in Chrome (skipped elsewhere). Not tested because headless Chromium does not have it.
* **Phone memory.** Very tall webtoon strips are tiled. On phones with <2 GB RAM the WebAssembly engine may be killed.
* **GitHub Pages `.gz` serving.** Expected to work (GitHub sets `Content-Encoding: gzip` for `.gz` files automatically). Not confirmed live.
* **Live manga with tainted canvas.** The own proxy fallback was written but not tested with a real tainted image from a live site.

#### Lessons (rules for the next round)

* A WebAssembly engine needs `'wasm-unsafe-eval'` in both the `<meta>` CSP and the `_headers` file. Forget one and the engine silently does nothing.
* Tesseract merges all text in a page into one paragraph. Own line grouping (union-find) is needed to get speech bubbles.
* Japanese is written in vertical columns, right to left. The OCR reads each column as one line; columns must be sorted by X descending.
* Always test the button click with a JS `.click()` call in Playwright when the button sits near a scrollable container — Playwright's hit-test may find the container first.
* Self-hosted WebAssembly files stay the same version forever (no CDN surprise updates). Put the version in the folder comment.

---
---

## 13. Replaced or removed — do NOT bring back and do NOT mark as current

**Why this section exists.** Older chats, older error reports and the history in section 12 mention things that are gone. If one of the left-hand items shows up, it describes an **older build**, not a bug in this one. The right-hand side is what exists now (the current details are in sections 2–11).

<!-- story:start -->
### 13.1 Files and tools

| Old thing | Now | Round |
|---|---|---|
| `start-manga.bat` and `proxy-local.js` (a Windows helper from round 4) | **not delivered.** The app still adds a proxy at `<this address>/proxy?url={url}` when the page is served from `localhost` (the test server does that), and a few texts still say "local launcher"; for the owner's setup nothing of it is needed (GitHub Pages + the Cloudflare Worker) | 13, 28 |
| `test/mock-sites.js`, `test/e2e-test.js`, `test/fake-d1-server.mjs`, `test/img/` (the round 14–17 test suites) | `test/server.js` + `test/ui.test.js` + `test/page.jpg`, and `test/check-guide.js` for this guide (section 10) | 18, 28 |
| A KV-based `accounts-worker.js` (namespace `PROFILES`) | D1 database bound as `DB` | 14 |
| The upload reader with Supabase / Oracle storage (rounds 1–3) | not part of the project | 4 |

### 13.2 Layout and controls

| Old thing | Now | Round |
|---|---|---|
| Reload key + Reload-all key (`#btnReload1`, `#btnReloadAll`) | the reload **wheel** (`reload-wheel.js`): half a turn right = this chapter, half a turn left = all | 12 |
| Wheel at the middle of the left edge; then bottom-left above the Top key; then under the full-screen icon | **top left**, under the title bar | 11, 12, 19 → 20 |
| Horizontal chapter slider at the middle of the right edge | vertical slider `chapter-slider.js`, bottom right, 76 px tall (`MAX` 26, `TRIGGER` 17) | 10 → 11, 19–20 |
| Slider sizes 56 × 150, 40 × 120, 108 px | 76 px | 11, 13, 18 → 19 |
| Keys 50 px | 40 px (38 px up to 520 px wide, 34 px up to 370 px) | 13 |
| ↑ / ↓ chapter keys always visible | hidden by `body.has-slider` while the slider add-on is linked **and** switched on (Left / Right arrows, N / P and the chapter menu still work) | 11, 13 |
| Top / End keys as the only way to jump | still there; hidden by `body.has-edge` while the Top / End slider (`edge-slider.js`, bottom left) is linked and on | 18–20 |
| Download button in the key row | top-right column under the title bar (`#dock`, `--col-top`) | 14, 19 |
| Open download list 380 px wide beside the End key | opens below the pill; a sheet on screens up to 700 px | 12, 14 |
| Full-screen text buttons `#btnFsMenu`, `#btnFsDl` and `#fsExit` visible in reading mode | hidden in reading mode; the icon `#fsRead` under the download pill enters **and** leaves full screen | 19, 21 |
| Settings as four cards, then five tabs | seven tabs (section 5) | 9, 11 → 19+ |
| `has-slider` / `has-wheel` set by the add-on files themselves | set by `applyAddons()` (file linked AND switch on) | 13 |
| Top key = smooth scroll | instant jump, repeated on the next frames, loads earlier chapters | 13 |
| ✕ as a 22 × 48 oval that jumped; `preventDefault` in `touchstart` | fixed 22 × 22 circle (`!important`), one capture-phase `click` handler | 17, 18 |
| Paste button without a list | `pasteInto` + the clipboard list (`#clipPop`) | 17 |

### 13.3 Search and Google

| Old thing | Now | Round |
|---|---|---|
| Search = DuckDuckGo only; its CAPTCHA page shown as results | engine list with fall-back (Bing, Mojeek, Yahoo, DuckDuckGo, Brave); CAPTCHA pages detected and skipped, never solved | 16, 17 |
| Engine page shown as it is; red pop-up when every engine fails | MangaFlow's own results list (`resultsPage`) and a friendly failure page | 17 |
| A search-engine address that fails (chip, link, back button) ends in a red pop-up | the results page with the other engines (the reason under Details) | 28c |
| Typed words always searched as "words manga" | Manga / Everything switch (`settings.searchManga`) | 15 |
| Google button / google.com address always opens a **new tab** | Google is searched **inside** MangaFlow; only the Google button with an **empty** box opens google.com | 16, 17 → 18, 23, 28b |
| Google button, pasted `google.com/search` address and results-page chip stayed inside only **with an API key** | with or without a key | 23–27 → 28b |
| `settings.googleKey` defaulted to the owner's key | empty (a key written into a static page is public) | 23 → 24 |
| "Turn on Search the entire web" in the Google control panel | engines made after 20 January 2026 can only use "Sites to search" (up to 50 domains); older engines may keep entire-web until 1 January 2027 (appendix B) | 22 → 28 |
| `hasGoogleResults` answered yes for any result box | yes only for a real result **link**; the "No Results" box is ignored | 19–27 → 28 |
| Script blocks of shown pages reported as errors (for example `cdn.search.brave.com`) | only recorded in `cspSeen` (shown by "Test Google search" and in the report) | 23 |
| The page reloaded by itself whenever the cloud lists "changed" (an endless loop after a reopen, no report) | no reload: the lists are read again in place (`mf-lists-changed`); the merge uses the app's keys and limits; a loop guard and a report | 30 |
| `reads` merged by chapter address, `recent` limited to 300 rows | by manga `id`, limited to what the app keeps (30 manga, 20 pages), newest copy wins | 30 |
| A chapter page with no reading box showed ALL its pictures (covers, promos) as the chapter, even behind a login wall or when the site sent the main page | `wrongPage` says so and shows nothing; the sentence says why | 30 |
| Every failed chapter was retried by the keeper for ever | only errors that can change are retried (not locked, removed, main page, 404) | 30 |
| A site's own 404 ended with "add your own proxy" | "The page was not found (HTTP 404)" | 30 |
| The start page showed for a moment while a saved place was reopened | cover `#resume` from `boot.js`, removed by `endResume` | 29a |
| The Paste button opened the clipboard list when the browser refused to hand over the clipboard | Paste only pastes (or says what to do); only the arrow opens the list | 29b |
| Full screen hid the same things on every screen size | phones / small tablets hide every button except exit, computers keep all (`body.fs-small`) | 29c |
| Failed pictures / chapters waited for Retry; only pictures near the screen were loaded | the keeper retries by itself and keeps the next 9 chapters ready (`settings.preloadAhead`) | 29d |
| A Cloudflare "verify you are human" page ended in a red "blocked" pop-up | the verify box / chapter boxes with the way to pass it on the site and an automatic retry | 29e |
| Blocked inline `onclick=` / `onload=` attributes of a shown page reported as an error ("script-src-attr") | counted quietly (`cspSeen`), no pop-up | 28d |
| Every click inside the shown page blocked | only link clicks are intercepted; buttons, dropdowns and forms work | 25b |
| "Reset proxies" dropped the built-in Worker | keeps your own proxies **and** the built-in Worker | 24 → 27 |

### 13.4 Pictures and chapters

| Old thing | Now | Round |
|---|---|---|
| `findReaderImages` with its own loose `BAD_IMG` (`ads?` matched "uploads") | `readerSlots` + `scanPictures` with the shared `BAD_IMG` | 26, 27 → 28 |
| The rule "this is a list of manga" ran first and threw **all** pictures away | it runs last (`generalPictures`) | 28 |
| Lock words searched in all text of the page | searched in `mainText` only | 28 |
| Picture addresses read only from five known attributes | any attribute that holds a picture address; empty slots counted; numbering | 28 |
| Chapter list = the first page only | every page (`morePages`) | 28 |
| Links whose "address" is plain words (`Previous sentence`) accepted | refused (`isWordHref`) | 28 |
| Download size estimate kept the previous manga's numbers | cleared in `startReading` | 27 |

### 13.5 Downloads and PDF

| Old thing | Now | Round |
|---|---|---|
| PDF modes `small` (JPEG 92 %) and `lossless` (raw pixels); default "JPEG 92 %" | four profiles `original / balanced / small / tiny`, default balanced (`settings.ver` < 11 moves old settings to balanced) | 10 → 11 |
| Estimate for one mode only (`measure`) | `measureAll` (all four, cached) | 11 |
| Look-ahead 3, then 8 | `AHEAD` = 6 | 11 → 12 |
| Gate fixed at 4, then 6 per website | self-tuning `hostLimit` (6 down to 2) | 12 |
| 150 s per picture | 20 s per try, 70 s per picture, retries after 4 s / 12 s | 11, 12 |
| A gate that could wait without limit | 25 s gate limit, 20 s cool-down cap, 100 s retry limit | 12 |

### 13.6 Accounts and cloud

| Old thing | Now | Round |
|---|---|---|
| Personal lists under plain `mf_books / mf_reads / mf_recent / mf_progress` for everybody | `mf_u:<name>:…` while signed in; the plain keys are the guest's | 14 |
| The admin skipped when saving history (three places) | the admin is tracked like everybody else | 19 |
| An accounts server of "version 2" accepted for the admin | refused with an explanation; `/ping` shows `version: 4` | 20, 22 |
| History batches about every 45 s | about 8 s (history), 3 s (bookmarks) | 14, 20 |
| Error report headers "round 8 / 10 / 11 / 13 / 14" | "build round 31" | every round |
| `#progress { top: var(--safe-t) }` (the line floated down in full screen on a notch phone) | `top: 0` in every state (round 31) | 31 |
| One request for a page; a site 404 ended it | one more try with the other spelling of the address (final slash), then the original answer (round 31) | 31 |

### 13.7 Things in the round-27 guide that were wrong

The round-27 guide (typed by hand) listed `proxy-local.js`, `start-manga.bat`, `test/mock-sites.js` and `test/e2e-test.js` as part of the delivery; described a ZIP download, a "Downloads" settings tab and page swiping that do not exist; and gave old element names, old key sizes and old settings. It also still said the round 26 fix for WordPress pictures worked, which round 27 had already shown to be false. This guide replaces it; do not copy sentences back from it.
<!-- story:end -->

### 13.8 Things that look like bugs but are intended (do not "fix")

* A **blocked script** message for a page shown in the frame: pages never run scripts (rule 5).
* A yellow note under a chapter that says only some pictures were found, with **Open on the site**: that is the honest answer for a sealed chapter (rule 4).
* A yellow note on the search results that says why Google had nothing: Google's sites-only rule (appendix B).
* Firefox and Safari show their own "Paste" bubble when a page reads the clipboard: page code cannot remove it.
* The words "local launcher" in a start-page chip or a setting: they describe a proxy on `localhost`, which only the test server provides now (section 14).
* A report that says `version: 2` from the accounts server: the Worker running in Cloudflare is an old file; paste the current `accounts-worker.js` and Deploy.

---

## 14. Honest limits (what MangaFlow cannot do, and loose ends)

Read this before promising anything to yourself, to a user, or to Claude ("make it read every site" is not possible; the list below says why).

### 14.1 What the tests prove, and what they do not

All 176 total checks (133 browser checks in ui.test.js + forty-three translate checks in translate.test.js) run on **mock sites** in a headless Chromium (section 10). They prove the **logic**. They do **not** prove: the live manga sites (including mgread.io), the real Google element and the owner's real engine, the real Cloudflare Workers, real phones, or any site behind a bot check. Round 29 adds: a real browser restart with its own session restore, the browser's own clipboard permission question, and a real Cloudflare check (the shield mock only imitates its words). A new kind of site is fixed from its **report** (section 15.5).

### 14.2 Sites

| Limit | Why | What you can do |
|---|---|---|
| Pages built entirely by JavaScript stay empty or partial | the page frame never runs other sites' scripts (safety rule); the Worker only fetches text | read the chapter on the site (**Open on the site**); a headless-browser service would be needed to do more (big change) |
| Sealed chapters (marker `InitMangaEncryptedChapter`) show only what the page plainly gives | the site hides its pictures on purpose; MangaFlow does not decrypt or guess around that (rule 4) | **Open on the site** |
| Bot checks, captchas, logins, paywalls, "403 / 429" | MangaFlow never works around protection; it reads politely and says plainly when a site says no | wait; add your own Worker; open the chapter in your normal browser |
| Picture hosts that only answer readers coming from the manga site | hotlink protection | your own Worker sends the chapter address as the Referer (`&ref=`) and tries other Referer values |
| A theme whose reader box has a new name | `READER_BOX` is a list of known names | add the name (section 7.10); the report says which box was used |
| Numbered-picture guessing (`1.webp` → `2.webp`) can be wrong for a site with another pattern | it is a guess, so it is trusted only when picture 2 **and** the last picture exist, never beyond the number of slots, never for a sealed page | the report shows which step ran |
| Chapter lists split into pages: at most 40 pages and about 40 seconds | a polite limit | a long series may need a second try; the notice names the pages that could not be read |

### 14.3 Search and Google

| Limit | Why | What you can do |
|---|---|---|
| Google finds only the sites **you list** in the engine's control panel | Google's rule since 20 January 2026 for new engines: "Sites to search", up to 50 domains; older engines may keep "Search the entire web" only until 1 January 2027 (appendix B) | Settings > Search & extras > **Copy my sites for Google**, paste into "Sites to search"; or use another default engine |
| Free engines (Bing, Mojeek, Yahoo, DuckDuckGo, Brave) may refuse cloud proxies | they protect themselves | the next engine is tried; your own Worker is the most reliable route |
| Result rules follow each engine's usual page | engines change their pages | `parseResults` has a fall-back; add a row in `RESULT_RULES` |
| Google's page can change | `hasGoogleResults` looks for the title link `a.gs-title[href]` | change only that function |
| The Google JSON API is not usable for new projects | Google answers "project does not have access" | leave the key box empty (the default) |
| Real Google was never reached from the build machine | no internet there | use **Test Google search**, copy the result |

### 14.4 Downloads and PDF

* The PDF is built in **browser memory**. A very large range can run out of memory on a phone: use "a new file every 25 / 50 chapters" or a smaller quality.
* A PDF cannot hold WebP, so WebP pages are decoded and stored as JPEG (quality as chosen); JPEG and simple PNG are copied untouched.
* One tall page per chapter (not one page per picture) is a design choice of round 6; a few PDF viewers handle very tall pages badly.
* The size shown before the download is an **estimate** from up to 4 sample pages; the result line shows what it really was.

### 14.5 The Workers and accounts

* `worker.js`: `MAX_BYTES` (80 MB) is checked against the `content-length` the site announces; an answer with no announced length is not cut. The request counter (`PER_MINUTE`) lives in the Worker's memory and resets when Cloudflare restarts it. Free public proxies are slow and often blocked.
* `accounts-worker.js`: a 6-digit code has a million possibilities (the real protection is the 5-try lock, `PEPPER` and `ALLOWED_ORIGINS`). The Worker's address is in the page source of a static site (it is not a secret). Local profile mode is a convenience, not a vault: anyone who controls the device can read its browser storage.
* Cloud sync is "last writer wins" per list; two devices saving at the same second can lose one change.

### 14.6 Loose ends found in this round (not bugs that hurt; known and left alone on purpose)

* `findPrevLink` in `app.js` and `importGuest` in `profiles.js` are defined and **never called** (ESLint reports them). They are harmless; remove them in a quiet moment.
* `mf_progress` (and `…:progress`) is written empty and cleared by `app.js`, and synced by `profiles.js`, but nothing reads it.
* A few texts still speak of a "local launcher" (section 13.8).
* `app.js` is one very long file by choice (no build step). If it hurts, move whole sections into new add-on files and talk to them with events (section 7.6).

### 14.7 Browsers and phones

A modern browser is needed (the code uses `Promise.any`, `IntersectionObserver`, the Clipboard and Fullscreen APIs where present). The full-screen buttons are shown only where the browser can do it; "keep screen awake" needs the Wake Lock API. Layout was checked at 360 px and 390 px in a headless browser only; **not on a real phone**.

### 14.8 Round 29 limits (clipboard, the human check, the keeper)

* **Clipboard.** A page can only read the clipboard when the browser lets it. Chrome asks once ("allow this site to see text and images in the clipboard?"); Firefox and Safari show a small "Paste" bubble. No page code can remove that question. If you press **Allow** once (or set the site's Clipboard permission to Allow in the address-bar lock menu), the Paste button pastes at once from then on.
* **Human check.** MangaFlow never solves or skips a check. After you pass it on the site the proof sits in the cookies of YOUR browser; the Worker or public proxy that fetches pages for MangaFlow is another visitor and may still be refused. Then the chapter can only be read on the site itself. Nothing in MangaFlow can change that without the site's permission.
* **The keeper uses data and memory.** Nine chapters of pictures kept ready can be tens of megabytes. Settings > Reading > "Keep the next chapters ready" can be Off, 3, 5 or 9; data saver and low-memory devices are lowered automatically.
* **Flash on reopening.** The cover removes the visible start page. A browser that restores its own saved copy of the page (back-forward cache) can still show it for a frame before `boot.js` runs; that is the browser's, not ours.

### 14.9 Round 30 limits

* **The "random images" fix was built without the real page.** mgread.io can not be reached from the build machine. The fix removes a known wrong behaviour (page-wide pictures shown as a chapter behind a wall or on the main page) and is proved on a mock; if a chapter of the real site still shows wrong pictures, press **Details** on it (or copy the report) and send it to Claude: it lists how the pictures were chosen and what the page contained.
* **A locked chapter stays locked.** MangaFlow does not log in and does not get around a wall (rule 4). It now says so instead of showing other pictures.
* **Reload loops.** The one cause found (the cloud lists) is fixed. A browser that reloads a restored tab by itself is only counted and reported (from the fifth load in a minute).
* **Both files must be new.** The loop is fixed in `profiles.js` **and** `app.js` (and reported through `boot.js`); an old `profiles.js` beside the new `app.js` still reloads.

### 14.10 Round 31 limits

* **The notch was simulated.** The progress-line checks set `--safe-t` to 32 px; a real phone with a real notch in real full screen was not available. The fix does not depend on the number (the line is at 0 whatever the browser reports).
* **The arenascan.com cause is not proven.** The real site could not be reached from the build machine and no new report text arrived with the request. The second try with the other spelling of the address is a generic measure proved on a mock. If a chapter that opens on the site still says "not found", send the report of that moment with the address as it opens on the site.
* **A removed page stays removed.** The second try is one request; it cannot find a page the site really does not have.

### 14.11 Round 32 limits (Translate add-on)

* **OCR accuracy depends on scan quality.** The text reader (Tesseract) works well on clean, high-resolution scans with standard comic fonts. Hand-lettered manga, very stylised fonts (grunge, display), and low-resolution pictures give rough or missed text.
* **Translation quality.** The built-in services give rough machine translations, not the quality of a human scanlation. The Chrome built-in Translator API was not available in the headless Chromium test browser; it is skipped in test and only works in real Chrome.
* **Tainted canvas.** When a picture host blocks direct fetch (CORS), the own proxy is tried. This was written but not tested on a live tainted image. If the feature does nothing on a particular site, check whether the proxy is reachable.
* **GitHub Pages `.gz` serving.** The language packs are compressed. GitHub Pages is expected to serve them with `Content-Encoding: gzip` automatically; this was not confirmed on the live site. Use Settings → Translate → **Test translate** to confirm all 10 files are reachable after upload.
* **Phone memory.** Very tall webtoon strips are read in 2000 px tiles. On phones with very little free RAM the browser may kill the WebAssembly worker silently. The bar turns red with a details report.
* **First-page delay.** The engine (WebAssembly) loads on the first page. Expect 1–3 seconds extra on the first page; later pages are faster because the engine is cached.


---

## 15. How to use it (the owner's guide)

Every button name below is the real text in the page (checked against `index.html`). **Why this section is here:** the rest of this file explains the code; this part explains the *website* in the order a person meets it, so that you (or Claude) can tell what is a bug and what is intended.

### 15.1 Read a manga

1. Open your site. The start page has one big box: **Paste a manga link, or type a name to search**. The 📋 button (`#heroPaste`) pastes what you copied; ▾ (`#heroClip`) opens a list of the last 12 things you pasted or copied; ✕ empties the box; **Read** opens it.
2. A series page or a chapter link opens straight in **reading mode** (Settings > Reading > "Open a manga link straight in reading mode"). With that switch off the page opens in the mini browser and a floating **📖 Reading mode** button (`#fabRead`) appears when MangaFlow thinks the page is a manga.
3. In reading mode every chapter is part of one endless column. More chapters load by themselves; scroll up near the top (or press **▲ Load earlier chapters**, `#btnPrevLoad`) to get earlier ones. The title bar hides while you scroll down and returns when you scroll up. Its buttons: Home (`#btnHomeR`), Exit reading mode (`#btnExit`, Esc), Chapter list (`#btnChapters`, key C), white / black (`#btnTheme`, key T), Settings (`#btnSettingsR`).
4. The chapter list (C) also holds **Download chapters (PDF)…**, **Full screen** and **Free memory (clear chapter cache)…**, then every chapter.
5. Moving between chapters: scroll; the Left / Right arrow keys (or N / P); the round keys ⇧ top, ↑ previous, ↓ next, ⇩ end (`#btnTop`, `#btnPrev`, `#btnNext`, `#btnEnd`); or the add-ons: the **chapter slider** (bottom right: pull the knob down = next, up = previous), the **Top / End slider** (bottom left), the **reload wheel** (top left: half a turn right reloads this chapter, half a turn left reloads all). Switching an add-on off in Settings brings the round keys back (section 8).
6. A refresh keeps your place (`#r=` in the address). **Continue reading** on the start page lists what you were reading.
7. **If a chapter shows only some pictures** you will see a yellow note under it, for example "Only 1 of 7 pictures of Chapter 1 could be found …", with **Retry**, **Open on the site** and **Details** (the report). That is the honest answer when a site hides the other pictures (section 4.4); it is not a crash.

### 15.2 Search, and Google

* Type words or a site name in the same box. A name such as `any.com` opens that site; other words are a search. The **SEARCH** switch says whether the word "manga" is added (**Manga**) or not (**Everything**). The **ENGINE** list chooses Google (your search), Auto (free engines), Bing, Mojeek, Yahoo, DuckDuckGo or Brave; the **Google** button searches the typed words with Google inside MangaFlow (an empty box opens google.com in a new tab).
* The result list is MangaFlow's own (cards). Tapping a result opens it inside MangaFlow, and a manga page opens in reading mode if you set it so.
* **Google gives "No results"?** Since 20 January 2026 a new Google engine can only search the **sites you list** in its control panel (appendix B). Do this once: (1) open your engine in Google's Programmable Search control panel (its ID is in Settings > Search & extras > "Google search ID (cx)"); (2) in **Sites to search** add your manga sites; (3) in MangaFlow press Settings > Search & extras > **Copy my sites for Google** and paste the list into step (2); (4) press **Test Google search**: it checks the ID, the script, a test search and any blocked address, and copies the result so you can send it to Claude. While Google has nothing, the free engines answer and a yellow note says why.
* **Dates to remember:** an engine made **before** 20 January 2026 may keep "Search the entire web" only until **1 January 2027**; after that it also needs a list of at most 50 sites.
* The "Google API key" box can stay empty (Google no longer gives the JSON API to new projects).

### 15.3 Download a PDF

1. In reading mode open the chapter list (C) and press **Download chapters (PDF)…** (or the small ⬇ pill at the top right).
2. In **Download chapters as PDF** choose the range (From / To), **one file** or **a new file every 25 / 50 / 100 chapters**, and the **quality** (Original, Balanced, Small, Tiny). The window shows the estimated size of each quality before you start (orange above 300 MB, red above 700 MB).
3. Press **Make PDF**. The pill shows progress (a ring, the count, the size so far); you can keep reading. Green = the PDF is ready (it is saved by the browser), red = it failed (a report opens).
4. Phones: choose "a new file every 25 chapters" or a smaller quality for long ranges (the PDF is built in memory, section 14.4).

### 15.4 How to read the comments in the code (WHY / HOW / IMPROVE)

You asked for every code file to be explained in basic English. The comments follow one pattern, so you can find what you need:

| Word in a comment | Meaning |
|---|---|
| **WHY** | the reason this code exists (what problem it solves, often the report that caused it) |
| **HOW** | how it works, step by step, in plain words |
| **IMPROVE** | how it could be better later (a to-do list for you or Claude) |
| **ROUND n** | the round in which that part was added or changed, so old and new code can be told apart |
| `/* … */` block above a section | the opening comment of a section: why the section exists and how its parts fit |
| `//` line comment | a short note on the next line or the same line |

Every code file starts with a header comment that says what the file is and how to use it. In `app.js` every numbered section starts with a WHY / HOW / IMPROVE block (section 7.9 prints them) and nearly every function has its own short WHY / HOW / IMPROVE comment. New code must get the same (rule 2, section 3).

**How much is explained (measured, generated from the files).** A code line counts as explained when it has a comment on the same line or one of the three lines above it is a comment. It is a blunt measure, not a promise that every line is perfectly clear.

| File | Code lines | Explained | Share |
|---|---:|---:|---:|
| `app.js` | 3411 | 2813 | 82% |
| `pdfmaker.js` | 211 | 200 | 95% |
| `troubleshoot-data.js` | 127 | 15 | 12% |
| `chapter-slider.js` | 92 | 62 | 67% |
| `reload-wheel.js` | 108 | 42 | 39% |
| `edge-slider.js` | 92 | 51 | 55% |
| `profiles.js` | 420 | 197 | 47% |
| `worker.js` | 101 | 75 | 74% |
| `accounts-worker.js` | 160 | 96 | 60% |
| `test/server.js` | 127 | 43 | 34% |
| `test/ui.test.js` | 663 | 236 | 36% |

**Finding a thing in the code:** use the function index (section 7.2) or search the file for the name; the comment above it tells you why it is there. **Asking Claude to change something:** name the file and the function, say what you want, and ask for WHY / HOW / IMPROVE comments on the new code (section 18).

### 15.5 When something does not work — what to do

1. **Settings > Troubleshoot > Fix automatically.** It resets caches and routes, tests the proxies, retries failed pictures and cancels stuck downloads (section 11).
2. **Run checks** shows ✅ / ⚠️ / ℹ️ rows (online, proxies, PDF support, add-ons, memory …).
3. **Symptoms & answers…** lists what people usually see, with a theory and repair buttons for each.
4. Still wrong? **Copy full report** (Settings > Troubleshoot) or **Copy report** in the big error window, and give Claude: the report, the project files, this file, and one sentence: what you did and what you expected. The report holds the page address, the browser, the proxies, the picture facts (reading box, pictures with an address, empty placeholders, unusual attributes, sealed-chapter marker), the Google result and the last problems. **A new kind of site is fixed from its report**, not from a guess.
5. For Google: **Test Google search**, then copy its result.
6. **Putting new files online (GitHub Pages):** upload the changed website files (section 2) to the repository, commit, wait a minute or two, then reload with the cache bypassed (Ctrl+F5, or clear the site's data on a phone). A Worker file is redeployed in Cloudflare only when `worker.js` / `accounts-worker.js` itself changed (section 9); round 28 changed neither.

A message to Claude that works well: *"MangaFlow (files and MANGAFLOW.md attached). Site X shows only part of a chapter. Here is the report: … Please find the cause, write a failing check in `test/ui.test.js` first, fix it, keep every old check passing, comment the new code with WHY / HOW / IMPROVE, add a round entry to MANGAFLOW.md, and send each file separately and as one zip."*

### 15.6 Settings tour

The settings window (`#settings`, gear button) has seven tabs. The text is exactly what the page shows.

| Tab | What it holds |
|---|---|
| **Proxies** | the list of CORS proxies (**Add**, **Test all**, **Reset to defaults**); all are asked at the same time, the first good answer wins |
| **Reading** | chapter width, reader buttons on the right / left, **PDF picture quality**, **Chapter slider**, **Reload wheel**, **Keep screen awake**, the five accent colours, "Open a manga link straight in reading mode", "Keys ← → change chapter", "Tap to scroll (top = up)" |
| **Search & extras** | Google search ID (cx), "Open the search straight after Paste (one tap)", "Add the word “manga” to Google searches", the optional Google API key, **Test Google search**, **Copy my sites for Google**, "Only use the search engine I chose (no automatic switch)", **Full-screen button**, **Top / End slider** |
| **Profile** | your profile and sync status: **Open my profile**, **Sync now** |
| **Memory** | **Free memory (reading mode)**: clear a range of loaded chapters, or everything before yours, or let MangaFlow clear old chapters by itself (after 10 / 20 / 30 chapters behind you); the chapter you read is never cleared and downloads are not affected |
| **Security** | "Do not save my reading history", "Erase history and cache when I close this tab", **Check my setup** |
| **Troubleshoot** | **Fix automatically**, **Run checks**, **Symptoms & answers…**, **Copy full report**, **Send report to server**, **Reset settings** (section 11) |

At the bottom of the window **Clear history & cache** empties what MangaFlow saved on this device.

### 15.7 Your own servers (optional)

* **Proxy Worker** (`worker.js`): the dependable way to read sites; setup in section 9.1 (about 3 minutes). Without it only the slow free proxies are used.
* **Accounts Worker** (`accounts-worker.js` + a D1 database): profiles, history, bookmarks and reports that follow you to every device; setup in section 9.2 (about 6 minutes). Without it profiles live in one browser.

### 15.8 What is new in round 29, and your steps

1. **Upload `boot.js` too** (a new file) together with `index.html`, `style.css`, `app.js` and `troubleshoot-data.js`, all in the same GitHub folder; wait a minute or two and reload with the cache bypassed.
2. **Paste button:** press once. If your browser asks "allow this site to see the clipboard", press **Allow** (Chrome: the lock icon next to the address > Site settings > Clipboard > Allow). Only the little arrow next to the button shows the list of earlier copies.
3. **Full screen:** on a phone or small tablet only the exit icon stays; tap it to bring everything back. On a computer all buttons stay.
4. **Next chapters ready:** Settings > Reading > "Keep the next chapters ready" (Off / 3 / 5 / 9). If your mobile data is small, choose 3 or Off.
5. **"Verify you are human" pages:** press **Open the site** (a new tab opens), tick the box or solve the puzzle there until the real page shows, then come back to MangaFlow; it tries again by itself (or press **I did it – try again**). If the check comes back at once, that site also refuses MangaFlow's helper: read that chapter on the site, or try later. MangaFlow does not solve the check for you.

### 15.9 Round 30 — what to upload and what to do if the page reloads

1. Upload `index.html`, `style.css`, `boot.js`, `app.js`, `profiles.js`, `troubleshoot-data.js` (same folder as before, the repository that serves your page: the reports showed `…github.io/Mangafox/`). Then open the site with the cache bypassed (a phone: clear the site's data once).
2. **If the page keeps reloading:** after five loads in a minute MangaFlow stops its own reloads and opens the report "The page keeps reloading". Copy it and send it to Claude. Closing the tab and opening MangaFlow again usually ends it.
3. **If "Reopening where you were…" stays:** after 12 seconds press **Open the start page**; after 24 seconds a report "Taking too long" opens by itself.
4. **A chapter says LOCKED or "the site sent the main page":** the site wants a login, coins or has removed the chapter. Press **Open on the site**. MangaFlow does not log in.
5. **"The page was not found (HTTP 404)":** the link is wrong or old; search the manga by name on the start page.

### 15.10 Round 31 — what to upload and what changed for you

1. Upload `style.css`, `app.js`, `troubleshoot-data.js` (same folder as before). Then open the site with the cache bypassed (a phone: clear the site's data once); otherwise the old `style.css` stays in use and the progress line stays where it was.
2. **The thin progress line** is now at the very top edge of the screen: in normal reading, in full screen and while you scroll down, on a phone and on a computer.
3. **"The page was not found (HTTP 404)":** MangaFlow now tries the other spelling of the address (with / without the final slash) once before giving up. If it still says "not found", the site has no page at that address: search the manga by name on the start page, or open the site and copy the chapter's address from there. If a chapter that opens on the site still fails, press **Details** / **Copy report** and send it.

---

### 15.11 Round 32 — what to upload and the new Translate feature

**Files to upload (same folder as before, plus the new ones):**

1. `index.html` — updated CSP and new Settings tab.
2. `_headers` — updated CSP (only matters if your host reads this file; GitHub Pages ignores it).
3. `app.js` — 5 new settings keys.
4. `style.css` — one new CSS rule for the Translate Settings tab.
5. `troubleshoot-data.js` — 4 new troubleshoot symptoms.
6. `translate.js` — **new file** — the Translate add-on itself.
7. `ocr/` — **new folder, ~20 MB** — upload the whole folder with its sub-folders (`ocr/tesseract.min.js`, `ocr/worker.min.js`, `ocr/core/`, `ocr/lang/`).

**No Worker redeploy needed.** The proxy is only used as a fallback for tainted images.

**After uploading:**

1. Clear the site cache on your device (phone: Settings → Apps → MangaFlow → Storage → Clear data, or clear site data in the browser).
2. Open the site. Open Settings → Translate. Tap **Test translate**. Wait — it checks all 10 OCR files one by one. Every line should show ✓. If any show ✗, that file is missing from `ocr/`.
3. Open any manga chapter. Look for the **文A** button on the left edge of the screen, middle height. Tap it. The button turns blue and a small bar appears at the bottom. After a few seconds translated boxes appear on the pictures.

**How to change the target language:** Settings → Translate → "Translate into". You can also change it in the small panel that opens when you tap the ⚙ button in the bar at the bottom.

**If translation does not work:** Settings → Troubleshoot → search "translation" — the symptoms `trfiles`, `trnothing`, `trwrong` and `trservice` explain the most common causes.

**What is NOT needed:**
* You do NOT need to change anything in the Cloudflare Workers.
* You do NOT need an API key for translation (the built-in services are free and key-less).
* You do NOT need to install anything on your own computer or phone.



## 16. How it can be improved (a to-do list, safest first)

Each idea says **why** it helps, **where** to start and how big it is. The comments in the code carry many more small IMPROVE notes (section 7.9 prints the ones at the top of each section). Whenever you do one: follow section 3 (failing test first, comments, new round entry here).

| # | Idea | Why | Where to start | Size |
|---|---|---|---|---|
| 1 | Remove the dead code and the half-used key: `findPrevLink` (`app.js`), `importGuest` (`profiles.js`), `mf_progress` | less to read, no false hints | the three names (section 14.6) | small |
| 2 | Reword the texts that still speak of a "local launcher" | they describe a helper that is not delivered | `app.js` (start-page chip, Settings > Proxies check) | small |
| 3 | Google button with an empty box: focus the box and say "Type the words first" instead of opening google.com | the button then never leaves the site by surprise | the `#googleBtn` handler | small |
| 4 | "Copy my sites for Google": let the person untick sites, show how many of the 50 are used, open the Google control panel in one tap | the list is the thing that makes Google work now | `mySitesForGoogle`, `#setGSites` | small |
| 5 | Remember, per site, which picture step worked (page text, scripts or numbering) and which list-page pattern | fewer requests, faster chapters | `chapterPictures`, `pagerLinks` | medium |
| 6 | Draw "page 3 is missing" boxes in the right place instead of one note under the chapter | the reader sees exactly what is absent | `partialNote`, `makeImg` | medium |
| 7 | A small per-site rules table (reader box name, lock words, list pattern) next to `READER_BOX` | quirks of one site stay out of the general rules | `READER_BOX`, `LOCK_RE`, `PAGER_RE` | medium |
| 8 | Make the slider / wheel limits settings (`MAX`, `TRIGGER`), vibrate on phones (`navigator.vibrate`) | personal feel | the three add-on files | small |
| 9 | A web-app manifest + a service worker | install on the phone's home screen, start page without internet | `index.html`, a new file | medium |
| 10 | List only your own proxy addresses in `connect-src` of the page security policy | a tighter policy | `index.html` meta tag, `_headers` | small |
| 11 | Worker: cache answers (`caches.default`), use Cloudflare rate-limit rules or Access instead of the in-memory counter | stronger and cheaper | `worker.js` | medium |
| 12 | Accounts: PBKDF2 hashing on a paid plan, e-mail recovery, a daily clean-up (Cron Trigger), activity charts for the admin | stronger sign-in, tidier database | `accounts-worker.js`, `profiles.js` | medium |
| 13 | Run `node test/ui.test.js` and `node test/check-guide.js` automatically on every upload (a GitHub Actions workflow) | a regression is caught before visitors see it | a new `.github/workflows` file | medium |
| 14 | A small live-site smoke test that **you** run on your own computer for the sites you really read | the mock sites cannot prove a live site | `test/` (new file) | medium |
| 15 | Another search back-end if Google keeps narrowing its engine (Google's own post names Vertex AI Search for up to 50 domains) | Google results may become a paid or narrower feature | `googleSearch` and a new section | large |
| 16 | A headless-browser service for sites built only with scripts | those sites cannot be read today | a new Worker; legal and cost questions first | large |
| 17 | Split `app.js` into several files that talk with events (like the add-ons) | easier to read and change | one section at a time (section 7.6) | large |
| 18 | Accessibility pass: focus rings, labels for screen readers, high-contrast check | usable by more people | `index.html`, `style.css` | medium |
| 19 | Translate the texts (one object of messages instead of strings spread over `app.js`) | other languages | `explain`, `toast`, `showError` | large |
| 20 | Reading extras: tap to zoom a picture, remember the scroll position inside a chapter | comfort | `makeImg`, `rememberChapter` | medium |
| 21 | When an engine address fails (round 28c), try the next engine by itself unless the person chose that engine on purpose (`settings.engineStrict`) | one tap fewer when Yahoo or another engine refuses the proxies | the `catch` of the address branch in `navigate()`, `ENGINE_ORDER` | small |
| 22 | Show a small counter "3 chapters waiting for the check" and let the verify box list them | clearer when many chapters wait | `humanHosts`, `verifyNote` | small |
| 23 | Pause the keeper on battery saver or a slow connection (the browser's connection-type hint) | less data on weak networks | `keeperAhead`, `keeperTick` | small |
| 24 | Keep the scroll place inside a chapter in the address (`#r=`) so a reopen returns to the exact picture | no scroll jump after a reopen | `rememberChapter`, `resumeFromHash` | medium |
| 25 | Send the reload-loop and slow-reopen reports to the admin profile automatically (through `mf-bug`) | the owner sees problems without copying | `showError`, `profiles.js` | small |
| 26 | Judge a page-wide picture list by the SHAPE of the pictures (pages are tall, covers and logos are small) | fewer wrong pictures on unusual sites | `wrongPage`, `generalPictures` | medium |
| 27 | Show a "synced from the cloud" mark when `mf-lists-changed` brought something new | the person sees why the list changed | `app.js`, `profiles.js` | small |
| 28 | When a site answers 404, also try the `www.` spelling and offer a search of the site by the title in the address | more moved or renamed chapters open by themselves | `fetchHTML`, `slashVariant` | small |
| 29 | A second thin progress line at the bottom edge as a fallback for phones that hide the top edge under the status bar | the line is never hidden | `style.css` (`#progress`) | small |

**Not to do:** anything that works around a site's protection (captcha, login, a sealed chapter, a paywall). That is rule 4 of this project and it stays.

---

### 16.x Translate add-on improvements (safest first)

1. **A comic font** — replace the system font in `.mf-tr-b` with a free comic font (e.g. `Bangers` from Google Fonts, already allowed by the CSP). Looks much more natural.
2. **TextDetector API** — Chrome and Samsung Internet have a native TextDetector browser API that is faster than Tesseract for English. Use it first and fall back to Tesseract.
3. **Vertical Japanese improvement** — the current column ordering (right to left) is correct for most manga but breaks when columns are not evenly spaced. A smarter gap threshold would help.
4. **More OCR languages** — Thai, Vietnamese, Arabic (add the `.traineddata.gz` file to `ocr/lang/` and one line to `OCR_LANGS`).
5. **Retry individual failed boxes** — a box that failed keeps its red border; tapping it retries just that one (saves re-running the full page).
6. **Custom glossary** — let the owner add word pairs that are always corrected before translation (e.g. character names that the service always gets wrong).
7. **Progress per page** — show the page number in the status bar while OCR is running ("Reading page 3 of 10").
8. **Worker for translation** — use your own Cloudflare Worker as the translation proxy (avoid CORS issues with the public endpoints, and add caching on the server).

## 17. Rebuild from an empty folder

**Be clear about what this guide is.** It is a **map and a specification**, not the source code. 12292 lines of code cannot be printed inside a guide and stay correct. There are three ways to use it:

| You have | You can | How |
|---|---|---|
| the code files + this guide | fix, improve, extend | section 17.3 |
| the code files only | do the same, but Claude has to rediscover the rules | give it this guide too |
| this guide + the `test/` folder only | rebuild a new copy that behaves the same | sections 17.1 and 17.2; the tests are the acceptance test |
| this guide only | rebuild a similar site, **not** an identical one | the tests are missing; section 10.1 describes the mock sites and section 10.3 lists the 133 checks by name |

### 17.1 What must come out (the acceptance test)

A rebuild is finished when **all 133 checks pass** (`node test/ui.test.js`, section 10) and `node test/check-guide.js` says every name in this guide exists. In words: the page frame never runs other sites' scripts; chapters load as one endless column in both directions; chapters and pictures are found on the mock sites of section 10.1 (including the Init Manga family); a chapter that the site seals is shown as far as the page gives it and says so; "LOCKED" is said only when the page's own text says it; search goes through the engine list with CAPTCHA detection; Google runs inside MangaFlow with or without an API key and hands over to the free engines with a yellow note when it finds nothing; PDFs are built in the browser in four qualities with a size estimate; errors end in a copyable report; the add-on files can be removed without breaking anything.

### 17.2 Build order (each step ends with a check you can run)

1. **Folder.** One flat folder; `test/` inside it. Copy `MANGAFLOW.md` and the `test/` folder in first.
2. **`index.html`** from section 5: the head (security policy, viewport, referrer, and `boot.js` right after the style sheet link), the containers (`#browser`, `#reader`, dialogs), every id of the tree in 5.5, and the eight `<script src>` lines (`boot.js` in the head, then the seven at the end of the body) in the order of section 2. *Check:* it opens; the ids audit of `node test/check-guide.js` (part B) is quiet once the scripts exist.
2b. **`boot.js`** (section 4.10): ~40 lines in the head: saved theme + accent, the class `mf-resuming` for a saved place, a 30-second safety timer. *Check:* a refresh on a chapter shows the cover, never the start page.
3. **`style.css`** from section 6: the variables first (light and dark), then the blocks in the order of the block map. Keep each later round as its own block.
4. **`pdfmaker.js`** (section 2): a small PDF writer that copies JPEG bytes untouched, decodes anything else on a canvas in strips, writes one tall page per chapter and bookmarks. *Check:* a test PDF opens.
5. **`troubleshoot-data.js`** (section 11): the symptoms and questions as data.
6. **`app.js`** in the order of the section map (7.1), sections 0 to 18: security basics, helpers, settings and theme, fetching through a proxy, URL helpers, search engines and the own results list, errors, polite requests, history lists, the mini browser, making other sites look complete, chapter and picture detection (sections 4.3 and 4.4 are the rules), reading mode, navigation, earlier chapters, free memory, scroll tracking, PDF download, range dialog, download manager and dock, the floating search bar, event wiring, the settings dialog, safety nets, reports and the troubleshooter, and last Google, full screen, Top / End jumps and "remember my page". The **start-up calls** (`applySettings()`, `renderStart()` … `resumeFromHash()`) sit at the end of section 18, **after** the definitions they may reach (they are `const`s, so order matters). Build in stages and run the checks of that area after each stage.
7. **Add-ons** (section 8): the slider, the wheel, the Top / End slider, `profiles.js`. They only talk to `app.js` through the events of 7.6.
8. **Workers** (section 9): paste into Cloudflare, add `DB` and the variables, test `/ping`.
9. **Deploy:** upload the website files (section 2) to GitHub Pages.
10. **Run everything:** `node test/ui.test.js` (about 1.5–2 minutes), `node test/check-guide.js`.

### 17.3 A starter message for Claude

> MangaFlow Reader. I am attaching `MANGAFLOW.md` and the project files (every file separately, plus the zip). Read these sections first: 0, 1, 3, 13, the **round 31** entry in 12, then the sections of the files you will touch (2, 5–9). Rules: pure HTML / CSS / JS; never bypass a site's protection; every code file commented in basic English (WHY / HOW / IMPROVE); a failing check first, then the fix; run `node test/ui.test.js` and `node test/check-guide.js` before you answer; update `MANGAFLOW.md` (add a round to section 12, change the specification in place, move replaced things to section 13); send **every file separately and one zip**; tell me honestly what was tested (mock sites) and what was not (live sites, the real Google, the Workers, real phones).
> My request: …

If a file in the delivery did not change, Claude should say so (round 31 left `index.html`, `boot.js`, `profiles.js`, `worker.js`, `accounts-worker.js`, `pdfmaker.js`, the slider, the wheel and the Top / End slider, `_headers` and the Google verification file as they were).

---

## 18. Keeping this guide true, and asking Claude

### 18.1 How to keep this file current

1. Change the code (failing check first, WHY / HOW / IMPROVE comments, section 3).
2. In this file: add a round entry to section 12, change the specification in place (sections 2–11), move anything that was replaced into section 13, add new limits to section 14, and keep the numbers right (the number of checks is in the header of `test/ui.test.js` and in the guide).
3. Run `node test/check-guide.js` (below). It must say all is fine.
4. Run `node test/ui.test.js`. It must say all checks passed.
5. Send every file separately **and** one zip (owner request).

The big tables of this file (files, element tree, settings, functions, constants, test list, troubleshooter symptoms and repair buttons, CSS variables and blocks, comment coverage) were **produced from the real files** by a helper script that is not part of the delivery (it needs a browser and a JavaScript parser). The explanations around the tables were written by hand and checked against the code. When you change the code, ask Claude to "update MANGAFLOW.md for these changes"; it can rebuild a table by reading the file it comes from.

### 18.2 The guide check (`test/check-guide.js`)

**What it does.** It needs only Node.js. It reads this file, picks every name written in `back-ticks` and looks it up in the project files with the comments cut away: file names, element ids, storage keys, events, functions and constants, object paths such as `settings.searchEngine`. It compares the number of browser checks written here with the number in the header of `test/ui.test.js`. It also checks that every `#id` the scripts look up exists in `index.html` (or is made by a script) and that no id is used twice. **What it skips on purpose:** the history (section 12) and the "replaced" list (section 13), because they talk about things that are gone, and the block below, which is its own output. **What it cannot do:** tell whether a *sentence* is true. A name can exist and still be described wrongly; that needs a person (or Claude) to read the code.

**Run it:** `node test/check-guide.js` in the folder that holds `index.html` and `MANGAFLOW.md`. Exit code 0 = fine, 1 = something is wrong (it prints the name and the guide line).

**Result for this file** (pasted from the run on exactly this text; the block is skipped when the check runs):

<!-- guide-check:start -->
```text
MangaFlow guide check
guide:   MANGAFLOW.md
project: 17 code files read, comments cut away, 4362 different words
PART A   names written in the guide: 433 file names, 208 element ids, 33 storage keys, 30 events, 69 object paths, 554 function / constant names  (38 allowed because they belong to the browser, Cloudflare or other websites)
PART A2  check count: the test header says 133; 10 mention(s) in the guide
PART B   ids that the scripts look up: 173 (in index.html: 187, made by scripts: 61); missing: 0; ids used twice in index.html: none

RESULT: all names in the guide exist in the project files, the check count matches, and every id the scripts ask for exists.
```
<!-- guide-check:end -->

### 18.3 Questions that work well

| You want | Say |
|---|---|
| a site to work | "Site X shows only part of a chapter. Report: … Find the cause, write a failing check first, fix it, keep every old check passing." Attach the report and the files. |
| a change | "Add (or change) …. Follow the rules in section 3 of MANGAFLOW.md. Comment the new code with WHY / HOW / IMPROVE." |
| an idea from section 16 | "Do idea number N of section 16." |
| to understand something | "Explain `chapterPictures` in basic English: why it exists, how it works, how it could be improved." (use any function name from section 7.2) |
| the guide updated | "Update MANGAFLOW.md for the last change and run the guide check." |
| a rebuild | the starter message in section 17.3 |
| an honest status | "What was tested, and what was not?" (Claude should answer with section 10.6 and 14.1) |

**How Claude should answer you (the standing rules):** say first what it is about to do; keep to the rules of section 3; never claim a live site works because a mock site passes; send every file separately and as one zip; and finish with what changed, what to upload, and what was **not** tested.

---

## Appendix A. Words explained simply

| Word | Plain meaning |
|---|---|
| **CORS** | a browser rule: a web page may not read another website's pages directly; a proxy fetches them for you and adds a "this is allowed" header |
| **Proxy / Worker** | a small program on a server that fetches a page for MangaFlow; a Cloudflare **Worker** is such a program you run on Cloudflare's free plan |
| **D1** | Cloudflare's small SQL database, used only for the optional profiles |
| **Referer** | a header that tells a picture server which page asked; many manga picture hosts answer only when it looks like their own site (hotlink protection) |
| **Lazy loading** | a page puts a tiny placeholder in the picture tag and a script swaps in the real picture later; MangaFlow never runs that script, so it looks for the real address itself |
| **Placeholder / empty slot** | the tiny drawing (`data:image/svg+xml`) that stands for a picture that has no address yet |
| **Sealed chapter** | a chapter whose page carries the theme's marker `InitMangaEncryptedChapter`: the site hides its pictures on purpose |
| **CSP (Content-Security-Policy)** | the list of what the page may load; it is the main protection of a browser-only site |
| **Sandboxed frame** | the box that shows a stranger's page without letting it run scripts |
| **CAPTCHA** | a "prove you are human" page; MangaFlow only detects it and moves on, it never solves it |
| **Programmable Search Engine** | Google's search box that you configure; its ID is the `cx` value |
| **Round** | one delivery of the project (the guide numbers them 1 to 28) |
| **Mock site** | a fake website made by `test/server.js` so a test can run without the internet |
| **Regression** | something that worked before and broke again; the tests exist to catch it |

## Appendix B. Google's search rules in 2026 (read on Google's own pages, 2026-10-28)

This is the background of the "No Results" problem and of the **Copy my sites for Google** button. It was read again on the day this guide was finished; Google can change it, so open the two sources when it matters.

* **20 January 2026.** Google's announcement "Updates to our Web Search Products & Programmable Search Engine Capabilities" says that "all new engines must be configured to use the 'Sites to search' feature", and that this option allows "a maximum number of 50 domains for site-specific searches".
* **Older engines.** "existing engines are not affected and can continue to use the 'Search the entire web' option until January 1, 2027." Search Element users who query more than 50 domains must complete the transition by that date. For web-wide search the post says to contact Google; it names Vertex AI Search as an alternative for up to 50 domains.
* **The help page** says: "All new engines must now be configured to use the 'Sites to search' feature", "Your URL patterns cannot be from more than 50 distinct domains", and shows the entry forms `www.example.com/*` (all URLs beginning with that host) and `*.mysite.com/*` (a whole domain). **Copy my sites for Google** writes lines of the first form.
* **What this means for you:** a title that is not on a listed site gets "No Results" from Google, whatever MangaFlow does. The fix is the list (section 15.2). From 1 January 2027 every engine, old or new, is in the same position.
* **Not stated on those pages:** whether new customers can still get the Custom Search JSON API. The owner's own test (round 23b) showed Google answering "project does not have access", which is why the API key box stays empty.

**Sources:** [Updates to our Web Search Products & Programmable Search Engine Capabilities (Google, 20 January 2026)](https://programmablesearchengine.googleblog.com/2026/01/updates-to-our-web-search-products.html?m=1) · [Getting started with Programmable Search Engine (Google help)](https://support.google.com/programmable-search/answer/12397162?hl=en)

## Appendix C. Where the round 28 changes sit in `app.js` (generated from the file)

The opening line of every block marked ROUND 28 (the line number moves when the file changes):

```text
456: otherwise suggest an own proxy. ROUND 28: the old text told people to run start-manga.bat, a helper file that is NOT part of the files you
668: ROUND 28b: the Google chip no longer carries the "↗" (= opens another tab): since round 28b a google.com/search address is searched INSIDE MangaFlow w
692: ROUND 28: the yellow note ("Google found nothing ... because your engine only searches the sites you listed"). WHY: the person must see WHY the free e
781: ROUND 28: only part of a chapter could be found. WHY: a plain explanation instead of "something went wrong". HOW: matches the message of partialNote()
991: ROUND 28. WHY: the words that say "locked / removed / loading" must be looked for in the page's OWN text, not in the menu, the comment box or a "recom
1004: ROUND 28: what the reader really sees in the page.
1837: ROUND 28b - WHY: this conversion only ran when an API key existed (gKeyOn()). Since round 24 nobody has a key by default, so a pasted google.com/searc
1851: ROUND 28b: this now only meets Google addresses that are NOT a search with words (google.com itself, google.com/maps, ...): a google.com/search?q=word
1875: ROUND 28c - AN ENGINE ADDRESS THAT CANNOT BE LOADED. WHY: the owner tapped the "Yahoo" chip under a results list, Yahoo refused every proxy (Worker: H
2022: ROUND 28: looksLikeChapter() holds the three rules in one place: 3 or more pictures, OR empty picture slots the site fills in later, OR (round 10) a c
2108: ROUND 28: a link whose "address" is only plain words. WHY: the Init Manga theme (mgread.io) puts a read-aloud bar on every chapter with links such as 
2380: ROUND 28 - PICTURES THAT HAVE NO ADDRESS YET ("empty page slots"): mgread.io and every site built with the "Init Manga" theme
2503: ROUND 28: this rule now only runs here, AFTER readerSlots() had its chance, so a chapter page that also shows "recommended manga" covers is no longer 
2843: ROUND 28 - A CHAPTER LIST THAT IS SPLIT INTO PAGES ("1 2 3 … 5")
2921: ROUND 28: the series page may show its chapters in PAGES ("1 2 3 … 5", 24 each on mgread.io). morePages() reads the other pages and joins the lists; `
3080: ROUND 28 - COMPLETING A CHAPTER WHOSE PAGE LISTS PICTURES WITHOUT ADDRESSES
3326: ROUND 28: the list may continue on more pages ("1 2 3 … 5"). WHY: mgread.io shows 24 chapters per page, so the first page alone gave 24 of 112. HOW: m
3407: ROUND 28: ... or when the page shows empty picture slots that the site fills in later (mgread.io). WHY: three rules, one question. HOW: looksLikeChapt
3415: ROUND 28: the background reader (enhanceSeriesPage) also reads the OTHER pages of a split list ("1 2 3 … 5"). WHY: the page itself only holds the firs
3435: ROUND 28: a chapter page that only lists a few chapters (usually just its Previous and Next buttons) is not the whole list either. WHY: on mgread.io c
3720: ROUND 28: tell the person plainly when only part of the chapter could be found (with Retry, Open on the site and Details buttons).
5153: ROUND 28: the same completion as the reader (chapterPictures): empty picture slots, page text, scripts, numbered pictures (never for a sealed page).
5928: ROUND 28d - INLINE EVENT HANDLERS OF OTHER SITES' PAGES (script-src-attr). WHY: kingofshojo.com and many other sites put onload= / onclick= attributes
6288: ROUND 28 - GOOGLE "NO RESULTS". WHY: the owner still saw "no match found" and an empty Google panel. Two causes, both real: (1) Google's own "No Resul
6456: ROUND 28 - "COPY MY SITES FOR GOOGLE"
6634: ROUND 28b - WHY: the button says "Search these words with Google inside MangaFlow", but without an API key (the default since round 24) it opened goog
```

## Appendix D. Where the round 29 changes sit in `app.js` (generated from the file)

The opening line of every block marked ROUND 29 (the line number moves when the file changes):

```text
81: ROUND 29a - THE REOPEN COVER (see boot.js). It lives up here with the helpers because startReading() also calls it, and a const is only usable after i
321: ROUND 29e - HUMAN CHECK ("Just a moment...", "Verify you are human").
362: ROUND 29e - "verify you are human". WHY: a site behind Cloudflare answers the proxy with HTTP 403 / 429 / 503 and a page that says "Just a moment...";
380: ROUND 29e: a "Just a moment..." page now says so plainly (HUMAN_MSG) so the screens can offer the human way; the "Attention Required" page (a plain bl
468: ROUND 29e: when the site asked for the human check, "add your own proxy" is the wrong advice (the check is the problem, not the proxy), so the tip is 
761: ROUND 29e: the site asks the person to prove they are human. WHY: that is a step the person can take, not a "blocked" dead end. HOW: isHumanCheck() fi
913: ROUND 29e - the human-check helpers (see the long comment at HUMAN_RE). Three places use them: navigate() (a page you open), fillChapter() (chapters w
1989: ROUND 29e: a check for humans gets the VERIFY box (with the way to pass it and the automatic retry), everything else the red pop-up as before.
3687: ROUND 29e. WHY: when this site asked for the human check a moment ago, asking again for every chapter would only hammer it. HOW: within 20 s of the la
3736: ROUND 29e: the site wants the person to pass a human check. WHY: this is NOT a failure the keeper may retry (that would hammer the site); the person i
3739: ROUND 29d: mark the box as failed so the keeper loads it again by itself (with growing waits); a chapter the person skipped or that was removed is not
3788: ROUND 29d: say that nobody has to press Retry. HOW: one small line under the buttons. IMPROVE: show a countdown.
3845: ROUND 29d: the SAME reload is used by the Retry button and by the keeper. WHY: one way to start again, so the two can never differ. HOW: remove the re
3853: ROUND 29d: a picture that failed is NOT reported at once any more: the keeper tries again by itself (4 s, 8 s, 16 s ... up to 90 s). Only a picture th
6172: ROUND 29e: which sites asked for the "verify you are human" check (empty = none). WHY: it tells at once whether a "chapters do not load" report is a c
6512: ROUND 29c - FULL SCREEN IS DIFFERENT ON A PHONE AND ON A COMPUTER. WHY: the owner: on a phone / small tablet full screen must hide ALL buttons except 
6577: ROUND 29a: everything below is inside try / finally so the cover ALWAYS goes away, even when the page cannot be loaded or something unexpected is thro
6692: ROUND 29b - A REFUSED PASTE NO LONGER OPENS THE LIST. WHY: reading the clipboard can be refused (the browser's own "Allow clipboard" question was dism
```

## Appendix E. Where the round 30 changes sit in `app.js` (generated from the file)

The opening line of every block marked ROUND 30 (the line number moves when the file changes):

```text
464: ROUND 30: a helper got HTTP 404 / 410 and none of the others said anything else = the SITE says the page does not exist (a link to a removed manga, a 
770: ROUND 30: the site answered a chapter address with the manga's main page. Placed BEFORE the locked rule because its text also says "locked".
771: ROUND 30: the site itself says "404 / gone". Placed before the network rule, whose text ("no proxy could load it") this message also contains.
3141: ROUND 30 - "RANDOM IMAGES OF THE MAIN PAGE" (owner report, 2026-10-30, mgread.io). WHY: when the page has no reading box, scanPictures falls back to A
3159: ROUND 30. WHY: decide whether a page that gave pictures only through the page-wide fallback is NOT the chapter. HOW: two honest signs, nothing guessed
3222: ROUND 30: the site sent the manga's MAIN PAGE instead of the chapter (see wrongPage). HOW: its own sentence; the report (details) still says what the 
3740: ROUND 30: ... but only when trying again can help. WHY: a chapter that is locked, removed, answered with the main page or has no pictures (those error
6566: ROUND 30 - THE REOPEN THAT NEVER ENDS. WHY: when the saved page is slow (a slow proxy, a site that does not answer) the cover stood there and the pers
6598: ROUND 30 - LISTS FROM THE CLOUD WITHOUT A RELOAD. WHY: when a signed-in profile finds newer lists in the cloud, profiles.js used to reload the whole p
6603: ROUND 30 - A RELOAD LOOP IS ALWAYS REPORTED. WHY: the owner got only "the site keeps reloading" and no report. HOW: boot.js counts the loads of this t
```

## Appendix F. Where the round 31 changes sit in `app.js` (generated from the file)

The opening line of every block marked ROUND 31 (the line number moves when the file changes):

```text
396: ROUND 31 - ONE MORE TRY FOR A "404" WITH THE OTHER SPELLING OF THE ADDRESS. WHY: the owner's arenascan.com chapters worked before and then answered "H
```

## Appendix G. Where the round 32 changes sit in `app.js` (generated from the file)

The opening line of every block marked ROUND 32 (the line number moves when the file changes):

```text
262: ROUND 32 - the Translate add-on (translate.js). no-translate = the button is switched off in Settings; no-tr-file = the file is not linked, so its Settings tab is hidden too.

284: ROUND 32 - tell the add-ons that listen (translate.js) what the settings are now. WHY an event: the add-on does not share variables with this file. HOW: a copy of the object travels in detail.

5746: ROUND 32 - the Translate tab. The language lists are filled by translate.js; their value is set here.

5837: ROUND 32 - the Translate tab. Each control saves at once; applySettings() then sends 'mf-settings' so translate.js repeats only the work that the change needs.

5843: ROUND 32 - the small panel of the Translate button changes a setting by sending this event. Only the five translate keys are accepted (an add-on cannot change anything else).

5849: ROUND 32 - translate.js asks for the big error box (with a report that can be copied) when it cannot do its work.
```

What each change does:

| Line | What it does |
|------|-------------|
| 262 | Adds two body classes (`no-translate`, `no-tr-file`) that show/hide the translate button and its Settings tab |
| 284 | Dispatches a `mf-settings` CustomEvent so translate.js always knows the current settings without sharing variables |
| 5746 | Builds the Translate tab in the Settings panel (language dropdowns, engine radio, auto-translate toggle) |
| 5837 | Wires up the Translate tab controls so each change is saved and broadcast immediately |
| 5843 | Listens for `mf-settings-set` events from translate.js (only the 5 translate keys are accepted for security) |
| 5849 | Listens for `mf-translate-problem` events from translate.js and calls the app's own `showError()` for a consistent error UI |

