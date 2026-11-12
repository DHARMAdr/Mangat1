# MANGAFLOW — Project Reference, Code Map & Build History
*GitHub repo: https://github.com/DHARMAdr/Mangat0 · Site: https://dharmadr.github.io/Mangat0/*
*Cloudflare Workers: `worker.js` (page/image proxy) and `accounts-worker.js` (cloud profiles, D1 database)*
*Last updated: Round 66 — 2026-11-12 · Only HTML, CSS and JavaScript are used (no build step, no frameworks).*

> This ONE file replaces every older copy. It has (1) the page naming we use, (2) what every file is for, (3) for every part of every file **why it exists / how it works / how it can be improved**, (4) the complete history up to the latest round, (5) how to continue with Claude.

---

## 0. Page names (used when talking about the site — they change NOTHING in the code)

| Name | What it is | Where in the code |
|------|-----------|-------------------|
| **Page 1** | The home / start page: search-or-paste-link box, Continue reading, Recent pages, Bookmarks. | `#viewport` content in `index.html`; `app.js` §6 (history lists), §7 (address bar) |
| **Page 2** | The "main site" view: any outside site or search result opened INSIDE MangaFlow like a mini browser (e.g. www.google.com, a manga site's home page). | `<iframe id="frame">`; `app.js` §3 (fetch through proxy), §7 (renderFrame, hookDoc), §7b (make sites look complete) |
| **Page 3** | Reading mode: chapters streamed one after another as images. | `#reader`, `#stream`; `app.js` §8–§11 |

Rule of thumb for scrolling: on **Page 2 and Page 3** scrolling DOWN hides the header and floating buttons, scrolling UP brings them back. Page 1 hides only the header.

---

## 1. What is MangaFlow?
A **static website** (GitHub Pages) that opens manga sites through CORS proxies, shows them cleanly (Page 2), detects chapter images and turns them into an endless-scroll reader (Page 3), with optional extras: cloud/local profiles, history, bookmarks, translation overlay (OCR), PDF download, wake-lock ("keep screen awake"), floating helper widgets and a built-in troubleshooter.

## 2. File map (what each file is for)

| File | Size (lines) | Purpose |
|------|--------------|---------|
| `index.html` | ~660 | Page shell, CSP `<meta>`, every button/dialog, loads all scripts with `?v=NN` cache-busting (now **44**). |
| `style.css` | ~1410 | All styling, light/dark themes, mobile rules, auto-hide rules. |
| `app.js` | ~7340 | The main program (sections 0–18 below). |
| `profiles.js` | ~980 | Profile window: sign-in, My history, Bookmarks, sync, Export, admin. |
| `translate.js` | ~880 | OCR (Tesseract) + translation overlay on reader images. |
| `boot.js` | 72 | Runs before first paint: theme + "Reopening…" cover + reload-loop guard. |
| `pdfmaker.js` | 556 | Tiny PDF writer (no library) used by the download feature. |
| `chapter-slider.js`, `reload-wheel.js`, `edge-slider.js` | 132/144/127 | Optional floating widgets (previous/next chapter slider, reload wheel, Top/End slider). |
| `troubleshoot-data.js` | 165 | Plain-text data for Settings → Troubleshoot. |
| `worker.js` | 232 | Cloudflare proxy Worker (deploy separately). |
| `accounts-worker.js` | 286 | Cloudflare accounts Worker with D1 database (deploy separately). |
| `_headers` | small | Security headers — **ignored by GitHub Pages** (only works on Cloudflare Pages/Netlify). The CSP in `index.html` is the one that really applies. |
| `googledb6fd0cf04d837f7.html` | tiny | Google Search Console ownership file. Keep it. |
| `.nojekyll` | empty | Tells GitHub Pages not to process files (needed for the `ocr/` folder names). |
| `ocr/` | 14 files | Tesseract.js, its worker, wasm cores and language data. Self-hosted so the CSP can stay strict. |

Load order: `boot.js` → `style.css` → `pdfmaker.js` → `app.js` → `translate.js` / `profiles.js` / widgets / `troubleshoot-data.js`.

---

## 3. Code map: WHY / HOW / IMPROVE, per file and per section

### 3.1 `app.js`
| § | Lines (≈) | WHY it exists | HOW it works | IMPROVE |
|---|-----------|---------------|--------------|---------|
| 0 Security basics | 41–68 | Stop outside pages or typed text from running code in our page. | `esc()` for HTML, `safeHttp()` allows only http/https links, CSP in `index.html`. | Add a Trusted Types policy. |
| 1 Small helpers | 69–133 | One place for tiny tools used everywhere. | `$`, `$$`, localStorage wrapper `LS` (prefix `mf_`, try/catch), timers, string cleaners. | Move helpers to a shared module. |
| 2 Settings + theme | 134–336 | Remember what the person chose. | One object `settings` saved in `mf_settings`; `applySettings()` writes classes/CSS variables. | Validate with a small schema when loading. |
| 3 Fetching through a CORS proxy | 337–546 | Browsers block reading other sites. | Tries proxies from the list in order, with timeouts/retries; decodes charset safely (`safeDecode`); `fixProxy` repairs pasted proxy URLs. | Rank proxies by recent success; use `Promise.any` for racing. |
| 4 URL helpers | 547–577 | Clean, compare and build URLs. | Resolve relative links, strip tracking, host helpers. | Use `URL` everywhere. |
| 4b Search engines | 578–635 | Typing words (not a link) must search. | Engine list; builds the search URL. | Let the user add engines. |
| 4c Own results page | 636–784 | Show results inside MangaFlow without a server. | Google programmable search / own list page. | Cache results. |
| 5 Errors, toast, busy, loading bar | 785–1083 | Tell the person what went wrong in plain words. | Big error dialog, small toasts, busy spinner (`wakeBusy` fixed in R43), top bar. | Add "copy details" everywhere. |
| 5b Polite requests | 1084–1133 | Don't hammer sites (they ban you). | Queue with spacing/limits. | Per-host adaptive delay. |
| 6 History lists (Page 1) | 1134–1296 | Recent pages, Continue reading, Bookmarks on the start page. | Arrays in localStorage; `listOf()` guards bad data; capped sizes. | Move to IndexedDB for big lists. |
| 7 Mini browser (Page 2) | 1297–1636 | Use MangaFlow as a browser. | `renderFrame()` sanitizes HTML and sets `frame.srcdoc`; `hookDoc(d)` attaches click/submit/error handlers **and (R44) the scroll-hide listener**; address bar, Back/Forward, `navSeq` guard against late answers. | Show a real progress % ; support POST forms. |
| 7b Making outside sites look complete | 1637–2239 | Proxied pages lose styles/images/lazy-load. | Rewrites URLs, loads lazy images, removes scripts, retries images through the proxy. | Per-site rule table in a JSON file. |
| 8 Chapter + image detection | 2240–2865 | Decide whether a page is a chapter and find its images. | Many heuristics (selectors, lazy attributes, JSON blobs, filename patterns); rejects "locked/removed" pages. | Score candidates instead of first match. |
| 8b Full chapter list | 2866–3755 | Chapter dropdown with ALL chapters. | Finds list on the page or the manga page; numeric parsing; fixes glued site-ids. | Cache lists per manga. |
| 9 Reading mode (Page 3) | 3756–4171 | Endless chapters. | `#stream` gets one block per chapter; IntersectionObserver loads next; `_fillTok` token stops stale fills (R43). | Virtualize far-away images. |
| 9b The keeper | 4172–4237 | Keep next chapters ready, heal failed images. | Periodic checks, re-fetch failed ones. | Back-off per host. |
| 10 Chapter navigation | 4238–4320 | Prev/next, home/end, dropdown. | `stepChapter(±1)`, menu open/close. | Remember last chapter per manga. |
| 9b' Reading upwards | 4321–4430 | Load earlier chapters on scroll up. | Prepend blocks while keeping scroll position. | — |
| 10b Free memory | 4431–4527 | Phones run out of RAM. | Clear chapter cache button, unload far images. | Auto-clear by memory pressure. |
| 11 Scroll tracking + auto-hide UI | 4528–4748 | Hide UI on scroll-down in reading mode. | Accumulators (14 px dead zone) → `body.scrolling`; `showUi/hideUi`. | Make dead zone a setting. |
| 12 PDF download | 4749–5133 | Save chapters as PDF. | Fetch images → `MangaPDFLib` → one file; translated text optional. | Web Worker for encoding. |
| 12b Range dialog | 5134–5385 | Choose which chapters to download. | `<dialog id="rangeDlg">`, size estimate. | Remember last range. |
| 12c Download manager + dock | 5386–5823 | Show progress, pause/cancel. | Floating dock list. | Resume after reload. |
| 13 Small-screen search bar | 5824–5839 | Space-saving search on phones. | Floating bar toggled by pill. | — |
| 14 Event wiring | 5840–6099 | Connect buttons/keys to functions. | `keydown` handler (Esc, N, P, T, C, Home, End, arrows, F11), Page 1 header-hide (`navHideInit`). | Replace if-chain by key→function map. |
| 15 Settings dialog + proxies | 6100–6351 | All options in one place. | Tabs, switches, proxy list editor. | Search box inside settings. |
| 16 Start-up + safety nets | 6352–6407 | Never leave a blank screen. | Boot order, reload-loop guard (`MF_RELOAD`), `mf_alive` session marker. | — |
| 17 Reports, watchers, troubleshooter | 6408–6718 | Help find problems fast. | Collects errors/diary; builds copyable report. | Anonymous opt-in telemetry. |
| 18 Google search, full screen, Top/End, remember page | 6719–7340 | Extras around navigation. | `#p=`/`#q=` hash, CSE loader, F11, edge slider hooks. | — |

**Page 2 scroll-hide (new, Round 44)** lives right after `hookDoc()` in §7: `p2ScrollHook(d)`, `p2Set()`, `p2Reset()`. WHY: the outside page is a same-origin `srcdoc` iframe (sandbox has `allow-same-origin`), so OUR script can listen to ITS `scroll` even though the page's own scripts are blocked. HOW: passive listener, 14 px dead zone, adds `.navbar.mf-hide` + `body.p2-hide`; a 450 ms lock after each change prevents a flicker loop (hiding the header makes the iframe taller; at the very bottom the browser clamps the scroll and fakes an "up" move). `updateNav()` removes both classes on every navigation. IMPROVE: make the dead zone a setting; handle pages with their own inner scroll container.

### 3.2 `profiles.js`
| Part | WHY | HOW | IMPROVE |
|------|-----|-----|---------|
| Storage + session (`LS`, `mf_session`, `tok()`) | Local mode works without a server; cloud mode adds a token. | `session = {user, role, cloud, token}`. | Encrypt local codes with WebCrypto. |
| Lists (`readLists`, `writeLists`, `mergeLists`, `CAP`) | Keep reads/books/recent merged between devices without duplicates. | Merge by id/url, cap sizes (recent 500, reads 500, books 2000). | Timestamps per item for true conflict resolution. |
| Cloud (`post`, `pullState`, `pushState`, `flush`, `syncAll`) | Sync with Cloudflare D1. | `post()` sends the token; `flush()` batches activity; `fetchFailed` stops stale cache use. | Retry queue with back-off. |
| CSS block | Look of the floating window. | `#mfProf …` rules; **R44:** `.mfp-kinds` (3 equal columns), `.mfp-chips`, dark date inputs. | Move to style.css. |
| `histBody()` / `applyHist()` / `listHtml()` | History list with search, All/Read/Download filter, From/To dates. | **R44:** the list lives in `#mfpHistList`; typing or changing a date redraws ONLY the list. Inputs are never recreated. | Pagination, undo on delete. |
| `onDate()` | One handler for `input` + `change` on date boxes. | Accepts only full `YYYY-MM-DD` (year ≥ 1990); empty = no limit; stamps `dateTouched`. | Debounce for huge lists. |
| `marksHtml()` | Bookmarks and Continue reading with × and bulk remove. | Checkbox set `view.bmSel`. | Push state right after delete (open item). |
| `render()` / `safeRender()` | One function builds the whole window; the lock stops two renders racing. | Async + `renderPending`. | Virtual DOM-like diff. |
| Click handler (`data-act`) | One place for all buttons: tab, kind, **dpreset (Today/7/30)**, dateall, open, delact, export, clear, sync, admin. | `switch`-like chain. | Map of handlers. |
| Click-outside close | Tap on the dark backdrop closes it. | pointerdown+click pair; **R44:** ignored for 800 ms after a date change and while a date box is focused (a tap that dismisses a phone's date picker is not a backdrop tap). | — |

### 3.3 `translate.js`
Sections (≈ line numbers): language tables and settings (58–200); Tesseract loader and worker (200–420, uses `ocr/`); text-box finding / merging (420–660); translation services — Chrome on-device, Google, MyMemory (660–840); overlay drawing + `MangaFlowTranslate.getPageData` for PDF (840–882).
WHY: read raw-language manga. HOW: OCR each reader image → group lines into bubbles → translate → draw a box over the bubble. R43 fixes: `hasOwnProperty` language check, MyMemory error handling, real-404-only caching of language files. IMPROVE: run OCR in a pool of workers; cache results per image hash; better bubble clean-up (inpainting).

### 3.4 `style.css`
Sections: 1 theme variables · 2 base reset · 3 buttons/inputs · 4 browser view (`.navbar`, `#viewport`, `#frame`, `#fabRead`, `#btnOrigSite`) · 4b search pill · 5 reader bar · 6 auto-hide (`.ui-hide`, `body.scrolling`) · 7 chapter column · 8 floating reader keys · 9 chapter dropdown · 10 toast/busy/settings · 10b PDF panel · 10c settings fits one screen · 11 big error · 12 failed page notices · 13+ later rounds (each marked ROUND n). **R44 (end of file):** `body.p2-hide` fades `#fabRead`, `#btnOrigSite`, `#mfSlider`, `#mfWheel`, `#mfEdge`.
WHY: one stylesheet = one cache entry. IMPROVE: split per feature; replace repeated media queries with container queries.

### 3.5 `index.html`
Head: CSP, `boot.js`, `style.css?v=44`. Body: `#browser` (navbar, start page, `#frame`), `#reader`, dialogs (`#settings`, `#rangeDlg`, error), floating buttons, script tags with `?v=44`. WHY the `?v=NN`: GitHub Pages caches files, so a changed `app.js` was invisible on phones until the number changed (found in R42). **Always bump the number when any file changes.** IMPROVE: generate the number from a build step or file hash.

### 3.6 Small files
- `boot.js` — runs in `<head>` before paint: theme colours, "Reopening where you were…" cover, reload-loop guard. IMPROVE: none needed.
- `pdfmaker.js` — copies original JPEG/PNG bytes into a PDF (no re-compression = fast, lossless). IMPROVE: more PNG modes, streaming output for huge PDFs.
- `chapter-slider.js` — drag a knob down = next chapter, up = previous. Optional: delete the `<script>` line and nothing breaks.
- `reload-wheel.js` — half turn right = reload this chapter; left = reload all open chapters.
- `edge-slider.js` — drag up/release = Top, down/release = End; works on Page 2 and Page 3.
- `troubleshoot-data.js` — symptoms/answers/prompts as plain data; add new entries without touching `app.js`.
- `worker.js` — CORS proxy. **`ALLOWED` is empty = anyone can use it. Fill it (or add a `TOKEN`) after testing.** IMPROVE: rate limit per IP.
- `accounts-worker.js` — sign-in, activity log, delete/clear endpoints (all need the token), bug reports, admin. IMPROVE: password hashing with a per-user salt and rate limiting on sign-in.

---

## 4. Round 44 — Full Change Log (2026-11-08)

1. **Page 2 scroll-hide (app.js §7, style.css).** Scrolling down inside an outside site hides the header and the floating buttons; scrolling up shows them, like reading mode. Reset on every navigation. Earlier comments (rounds 41/42) saying this was "technically impossible" were wrong and are corrected.
2. **My history filter buttons (profiles.js).** Read / Download / All were squeezed by two competing flex rules; the word "Download" overflowed. Now a 3-equal-column grid (`.mfp-kinds`), `nowrap`, centred, `line-height:1`.
3. **From/To date filter on phones (profiles.js).** Three real causes found: (a) the date text was drawn light-on-white on phones, so a picked date was invisible — dark styling + `color-scheme` + 16 px font (stops iOS zoom); (b) every change rebuilt the whole window, destroying the input while the native picker was open — now only the list redraws; (c) a tap that dismissed the picker could land on the dark backdrop and close the whole window — guarded. Added quick chips **Today / 7 days / 30 days / All dates**; boxes are empty when there is no limit; a half-typed year is ignored.
4. Search box in My history no longer loses the keyboard (list-only redraw).
5. Full sweep: every Settings tab, reading-mode keys (T, C, Esc, N, P, Home, End, arrows, PageDown, Space) and header buttons, add-on globals and the profile actions were re-tested in phone emulation — no errors.
6. Cache-busting number 43 → 44; this document rewritten.

Tests used: Playwright with mocked proxies (Pixel 7 and iPhone 13 emulation, Asia/Kolkata time zone).

## 4b. Round 45 — Chapter errors from the 2026-11-09 reports (app.js, index.html `?v=45`)

1. **roliascan.com "LOCKED or REMOVED" (Fist Demon of Mount Hua, ch 57).** The "lock" words were only the site's hidden placeholder ("Loading chapter… not available anymore") and its log-in pop-up. The real chapter is open: the pictures are filled in by the site's own script, but its preview picture is `…/0002.webp`. `probeNumbered()` always started at 0001 and stopped at the first missing number, so it found nothing. NOW it asks for 0, 1 and the sample together and starts at the lowest that exists. `noImagesError()` also stops saying LOCKED when the page has real previous/next links and no log-in/coins/premium words.
2. **arenascan.com "no images found" (Chapter 42).** The site answered the chapter address with ANOTHER series' page (the report shows a different title and 8 chapters), then MangaFlow read that wrong page. NOW `sentOtherPage()` compares the page's canonical address with the one asked for; on a mismatch the chapter is requested once more with a harmless `?mf=<time>` cache-buster, and if it is still wrong the message says plainly "the site answered with a DIFFERENT page", with both addresses in the details.
3. Not verified on the live sites (my workspace cannot open them); verified with mock copies of both pages. If a chapter still fails, send the new report — the details now include the asked and received addresses.

## 4c. Round 46 — Refresh/Home address bug + roliascan picture API (app.js, index.html `?v=46`)

1. **Refresh on the home page jumped back into reading mode; the address after Home was not clean.** ROOT CAUSE: a link such as `/Mangat0/?url=https://site/chapter` is meant to open once, but `rememberView()`, `rememberChapter()` and the failure clean-up all copied `location.search`, so `?url=` stayed in the address for ever. At the next start-up `?url=` was read first, opened as a user action (= reading mode) and even blocked the `#r=`/`#p=` memory. FIX: `cleanSearch()` (section 18a) removes `url` and `q` from every address write; start-up lets a saved `#r=/#p=/#q=` win over `?url=/?q=` and strips `?url=/?q=` at once with `replaceState`; `rememberChapter()` writes only while reading mode is on screen. RESULT (tested): reading → refresh = reading; Home → address is just `/Mangat0/`; refresh = Page 1; Page 2 refresh = Page 2.
2. **roliascan.com: pictures never found (3rd report).** The page is script-built ("Loading chapter…"). Round 45 fixed the numbered-picture start; this round adds `apiPictures()`: it reads the site's own chapter script through the proxy, looks for `/api/…`, `/ajax/…`, `fetch("…")` addresses, adds the ids found in the chapter address (361460) and preview-picture folder (361395), tries them plus common shapes, and takes the first JSON answer holding 2+ picture addresses. Every step is written to `picTrace` and printed in the error report under "Steps tried to find the pictures". HONEST LIMIT: I cannot open roliascan from my workspace, so this was proven with a mock site, not the real one. If it still fails, the new report lists what each address answered, which decides the next fix.

### Regression guard — fixed problems that must never come back
| Problem | Rule that prevents it |
|---|---|
| Home / refresh reopens reading mode | Never copy `?url=`/`?q=` into later addresses (`cleanSearch()`); hash memory beats `?url=`; write `#r=` only while `reader` is visible; `leaveReader()` clears the save timer. |
| Header/buttons cover Page 2 | `p2ScrollHook()` + `body.p2-hide`; keep the 450 ms lock. |
| Date filter dead on phones | Date inputs need explicit colours; update only `#mfpHistList`; ignore backdrop taps within 800 ms of a date change. |
| Phone shows old code | Bump every `?v=NN` in `index.html` on EVERY change (now 46). |
| False "LOCKED" | Lock words are only trusted when there are no real prev/next links or the text has log-in/coins/premium wording. |
| Numbered pictures start at 0002 | Probe 0, 1 and the sample; start at the lowest that exists. |
| Wrong series page from site | Compare canonical address; one cache-busted retry; honest message. |

## 4d. Round 47 — Sign-in problems (profiles.js, app.js, index.html `?v=47`)

Report: "page loaded 5 times in 27 s" + admin sign-in "does not submit". Findings: (1) the sign-in code itself works — tested in a phone-size browser with a mock accounts server (sign-in, reload, session saved, no errors), and with the server answering 500 / 403 / offline (each shows a message). A successful sign-in reloads the page ONCE by design, and the reload guard counted the person's own refreshes/retries as a "loop" (report said "none written" = nothing automatic). (2) So the likely cause is on the Cloudflare side (Worker down, variables, D1 binding, origin list, or the name locked for 15 minutes after 5 wrong codes). Changes: errors now say the usual cause in plain words (`hintFor`); a **Check server** button on the sign-in screen says only "Server connected successfully" (round 48: it no longer shows the address, version or delay, for security); the Sign-in button shows "Signing in…" and ignores a second tap; the loop report explains that own refreshes count.
Cloudflare checklist: Worker deployed; D1 binding named exactly `DB`; variables `ADMIN_USER` (text) and `ADMIN_CODE` (secret, 6 digits); optional `ALLOWED_ORIGINS` = `https://dharmadr.github.io`; open `<worker address>/ping` in a browser tab — it must show version 4; wait 15 minutes if the name was locked.

## 4e. Round 49 — Owner's server address hidden (profiles.js, `?v=49`)
The Server tab used to show the built-in accounts server address to anybody (a browser that once held the admin was remembered by `mf_admin_dev`). NOW the tab is visible to everyone (people may use their own server), but the real address is drawn ONLY while the signed-in person is the admin (`session.role === 'admin'`); others see an empty box and "built-in server in use". Leaving it empty keeps the built-in server working; anyone may save their own address (only in their own browser). HONEST LIMIT: the address still exists in `profiles.js` in the public repo; hiding it stops casual viewing only. Regression rule: never print `cloudUrl()` for a non-admin. Tested: guest with stale admin flag sees no address; signed-in admin does.

## 4f. Round 50 — Chapter pages on Page 2 (the site view) show all pictures (app.js, `?v=50`)
Report (comizy.io chapter): reading mode (Page 3) found the chapter, but the same page opened as a site (Page 2) had blank pictures. CAUSE: Page 2's `fixLazy()` only knew 5 lazy attribute names while reading mode's `imgAddressInfo()` knows many more and also scans every other attribute; and pictures whose address is only built by the site's script (pages 4+ had no address in the HTML) got nothing because Page 2 removes scripts. FIX: (1) `fixLazy()` now asks `imgAddressInfo()` whenever src is empty / a `data:` drawing / a loading placeholder; (2) before showing a page with 2+ empty picture slots, the caller reads the page's scripts as TEXT with `fromScripts()` (or the full `chapterPictures()` finder, max 6 s) and `renderFrame(doc, base, extraPics)` hands those addresses, in order, to the empty slots only. Never runs the site's code. Tested with a mock page: 3 attribute styles + 3 script-only pictures all load. Not tested on the real comizy.io (my workspace cannot open it). Regression rule: Page 2 and Page 3 must use the SAME address finder (`imgAddressInfo`). If a site's pictures still stay blank on Page 2, the picture host probably refuses outside referrers; the page's image-retry-through-proxy step (section 7b) is the next place to look.

## 4g. Round 51 — Site-view pictures blocked by "hotlink" protection (app.js, `?v=51`)
Round 50 did not cure comizy.io. Likely cause found by reading the code: Page 2's picture-retry (a) ran only for errors AFTER its listener existed, but a hotlink-refused picture fails in milliseconds, before the listener is attached, so the retry never happened; (b) used the FIRST proxy of the list with no Referer, while hosts like cmzcdn.org answer only when the request says it comes from the chapter page (reading mode uses YOUR OWN proxy + `&ref=<page address>`). FIX: `retryFrameImg()` (own proxy + `&ref=`), `sweepFrameImgs()` retries pictures that already failed (when the frame is hooked, when it finishes loading, and after 3 s). The diagnostic report has a new line "Site view pictures (round 51): N pictures, X loaded, Y without address, Z retried through the proxy, first failing host: …" — if chapters are still blank, copy the report WHILE the chapter is open on Page 2 and send it: that line says which of the causes remains. Tested with a mock whose picture host refuses everything except the proxy: before the fix all six blank, after all six load. Not verified on the real comizy.io.

## 4h. Round 52 — Chapter boxes that stay empty/stuck + the debug kit (app.js, `?v=52`)
Report: while reading, the first chapters showed but the 4th and 5th were missing until the site was reopened. Differential test (Round 43 files vs now, mock sites with plain / script-list / lazy pictures, 21-chapter list): identical results, so rounds 44-51 did NOT change normal chapter loading; the gap is a box that was never retried. CAUSE: the keeper (section 9b) healed only boxes flagged `data-failed`. A box that became EMPTY (fill replaced and never restarted) or stuck on its spinner had no flag, so nobody retried it. FIX: the keeper now flags a box seen empty for 20 s, or loading longer than 100 s (`_fillStart`), and step B refills it. Tested: two wiped boxes (4th, 5th) refilled by themselves within 40 s. NEW REPORT LINE: "Chapter boxes (round 52): list N chapters, boxes M | Chapter 4: 8 pictures | Chapter 5: EMPTY …" — if it happens again, copy the report while it is visible and send it.
**Debug kit** (outside the site, in `mangaflow-debug-kit.zip`): Playwright scripts with mock sites — `t10` Page 2 scroll-hide, `t11` profile history/date filter/Download buttons, `t14` refresh/Home/address, `t15-17` sign-in + server tab, `t18/t19` Page 2 pictures + hotlink retry, `t20` old-vs-new differential on chapter loading, `t21` self-heal. Run `node tNN.js <port>` with `python3 -m http.server <port>` in the project folder. Rule: before every release run them all.

## 4i. Round 53 — Whole-site audit: every button, shortcut, setting, profile and server option (app.js, `?v=53`)
The owner asked for a full debugger + troubleshooter run with a written report. Method and results are in `TEST_REPORT_ROUND53.md` (also sent as a file). 176 table-driven checks (phone Pixel 7 + desktop 1280x800) plus the older regression scripts ran. Three REAL bugs were found and fixed:
1. **Forward button never worked after Back** (Page 2). WHY: since round 39 history is native (`pushState`), but `updateNav()` still disabled Forward from the old page list (`hi >= hist.length-1`), which is always true after Back. HOW fixed: every pushState stores `{mfi: n}` (`navMax` = newest step); `updateNav()` enables Forward while `history.state.mfi < navMax`; a `popstate` listener refreshes the buttons. IMPROVE: drop the old `hist/hi` list completely.
2. **Esc while in browser full screen also closed reading mode** and left `body.fs` stuck (header hidden). HOW fixed: in the key handler, Esc with `document.fullscreenElement` only calls `leaveFs()` then `syncFs()`; Esc outside full screen still leaves reading.
3. **Header stayed hidden at the very top for up to 2.5 s after a key jump** (n / p / arrows). WHY: `showUi()` sat inside the `Date.now() > holdUi` gate. HOW fixed: `if (y < 40) showUi()` now runs before the gate.
Test-script lessons (not site bugs): settings controls live in tabs (click the tab first); with Slider/Edge ON the Top/End/Prev/Next keys are hidden by design; Esc with nothing open leaves reading mode by design; Page 2 toolbar slides away after scrolling down.

## 4j. Round 54 — nyxscans.com: one-picture chapter + false "font" warning (app.js, `?v=54`)
Report: `nyxscans.com/series/.../chapter-0` gave "No chapters or chapter images found"; Page 2 said "An icon / text font could not be loaded". Page data: only ONE real chapter picture (a long stitched .webp), a Next link, a React reader (`reader-shell`).
1. **Short chapters**: `looksLikeChapter()` needed 3+ pictures. HOW fixed: also a chapter when the address has a chapter number, the page has at least 1 real picture AND a Previous/Next chapter link. Verified with a mock (`work/audit/nyx.js`): old build = error, new build = reader opens with chapters 0 and 1.
2. **Font warning**: `fontBad` fired when ANY font failed. HOW fixed: warn only when an icon-style font failed or more than half of the fonts failed; the report now lists the failed font names ("fonts that failed (n of m): ...").
Not verifiable here (sandbox cannot reach nyxscans.com): whether the real chapter pictures load; check after hard refresh. If the chapter still fails, copy the report: look at the line "pictures with an address".

## 4k. Round 55 — Chapter audit: no more silent jumps from chapter 1 to 22 (app.js, `?v=55`)
Report (nyxscans, Roxana): boxes were Chapter 0, 1, 22..40; chapters 2–21 were missing and no error showed. Cause: the site's own list skipped them and the reader trusted the list.
**New algorithm** (all in app.js before `startReading`): `fillChapterGaps()` reads the number from each chapter address, finds every missing whole number between the first (or 0/1 if the first is small) and the last, and adds a guessed chapter (same address pattern). `verifyChapterList()` then fetches each guessed address in the background (3 at a time): pages with pictures stay, 404 / no pictures are removed from list and menu. `auditReport()` shows ONE pop-up "Chapter check" listing: chapters in the site's list, expected, gaps added, found, NOT on the original site, could not be checked, and (30 s later) chapters in the list but not shown in reading mode. The same text is in both diagnostic reports as "Chapter audit (round 55)".
Mock test `work/audit/gap.js`: list 0,1,22..30 + chapters 2–5 and 10–21 exist, 6–9 give 404 -> menu 0..5,10..30 and pop-up "missing on the site: 6, 7, 8, 9".
Limits: only sites whose chapter addresses contain "chapter/ch/episode + number"; sites with ID-only addresses are skipped (the report says "skipped"). Chapters NEWER than the newest listed are not searched yet. When reading starts from a chapter page whose series page cannot be found, the list is only the prev/next chain, so no gaps can be seen.

## 4l. Round 56 — Icon-only Reading button + BUTTON BRIDGE for script-driven chapter bars (app.js, index.html, style.css, `?v=56`)
1. **Reading mode button** (`#fabRead`) is now ONE small round book icon (44 px, no words; `aria-label`/`title` keep the name). WHY: the wide pill covered the original site.
2. **Button bridge** (app.js, block "ROUND 56 - BUTTON BRIDGE" just above `onFrameClick`). PROBLEM: nyxscans.com (React/Next.js) draws its Next / Previous / Chapters bar with script-driven `<button>`s that have no address; MangaFlow never runs a site's scripts, so they did nothing on Page 2. SOLUTION in 3 parts: (a) `classifyControl()` reads the meaning of the clicked control (aria-label, title, alt, small text, svg title, symbols > <, id/class names; words in English, Spanish, French, Portuguese, Indonesian, Turkish, German, Italian, Arabic, Chinese, Japanese, Korean) -> NEXT / PREVIOUS / LIST; (b) `navTargets()` finds the real addresses (the page's own links via `findNavLinks`, else the detected chapter list, else the same address with the number +1 / -1) and `openNavTarget()` opens them in Page 2; LIST opens our own `<dialog id="mfChapPick">` picker (`openChapterPicker`, loads the series page with `loadSeriesList` when needed, has a find box); controls carrying `data-href/data-url/data-link` are simply opened; (c) `markNavControls()` un-hides recognised controls the site keeps transparent until its script runs, and when a chapter page has NO recognisable buttons, `#p2NavBar` (3 tiny round buttons: previous, list, next) is shown by `updateP2Bar()`. Only active on chapter pages (`onChapterPage()`), never on search lists or ordinary pages, and real `<a>` links are untouched.
3. Test `work/audit/bridge.js` (mock Next-style page): Previous -> chapter 4, Next -> 5 -> 6, data-href button -> 11, list button opens picker with 12 items and picking chapter 2 opens chapter 2; page without any bar -> tiny bar Next/Previous/List all work. Full regression (176 checks + older scripts) still passes.
4. New file `MANGAFLOW_FULL_SITE.md`: the whole site (every source file, full CSS) plus guide, history and rebuild steps.

## 4m. Round 57 — arenascan: "Page 2 keeps loading", "reading shows chapter 1 then 20" (app.js, `?v=57`)
Report: arenascan.com `the-real-tycoon-all-by-myself-chapter-19`: Page 2 showed no chapters and "kept loading"; reading mode showed chapter 1 and then jumped to 20. The report itself had no error. NOT reproduced with a mock (a flat-address site with list "1, 20..30" opened chapters 1..30 correctly, with or without script-written pictures), so these are DEFENSIVE fixes plus better diagnostics:
1. `tryAutoRead` waited for the background chapter-list reader with no limit; the banner "Looking for chapters…" could stay for minutes on long split lists. Now it waits at most 20 s (race) and `setBusy` hides any banner after 120 s.
2. Chapter-audit verification (round 55) removed a guessed chapter when its page answered but showed no pictures in the HTML. Now only a real "not found" removes a chapter: HTTP 404/410, or a page titled 404/not found that does not mention the chapter number. A page that answers is kept and tried when reached.
3. Diagnostic reports now have "Site view chapter list (round 57)": chapters known, number range, whether the background reader has finished, and the banner text.
NEXT STEP if it happens again: send the report copied (a) from the error pop-up "Chapter check" if shown, and (b) while reading, so the lines "Chapter audit (round 55)" and "Site view chapter list (round 57)" show the real numbers.

## 4n. Round 58 — arenascan "dead" Prev/Next links (`#/prev/`, `#/next/`) (app.js, `?v=58`)
Facts read from the real site (WebFetch): chapter pages hold their pictures in plain `<img>` tags (chapter 19: 20 `.webp` on cdn.arenascan.com; chapter 2: 16 numbered `.jpg`), but **Prev / Next are `<a href="#/prev/">` / `<a href="#/next/">`** (wired by the site's script) and the series page `/manga/<slug>/` has a static list 1..32 with a dead "First Chapter" link `#/`.
Reproduced with a faithful mock (`work/audit/arena2.js`): clicking the site's own Next on Page 2 showed an error pop-up and the frame went cross-origin (the `#/…` address resolved against the real site). FIX: `isDeadAnchor()` (href empty, `#...`, `javascript:`) - such links are handled by the button bridge: words from the href text ("#/next/" -> "next"), the label and class names decide next / previous / list, then `openNavTarget()` opens the real chapter. `markNavControls()` also scans these anchors, so the tiny fallback bar is not shown when the site has its own. After the fix: site Next on chapter 19 opens chapter 20; reading mode lists 32 chapters.
NOT reproduced: "reading shows chapter 1 then 20" and empty chapter boxes (mock opens 1..32 fine). If it returns, send the report copied while reading (lines "Chapter boxes", "Chapter audit", "Site view chapter list", "Picture routes").

### Open items (not changed)
- Bookmark deleted in profile can reappear from the cloud until the next state push (push right after delete).
- `worker.js` `ALLOWED` is empty (open proxy) — fill it.
- Revoke the old Google API key that starts `AIzaSyC-cqQ0…` (it is public in the repo).
- A real phone's native date picker cannot be driven by Playwright; the fix was verified by logic and emulation. If it still misbehaves on one specific phone, tell Claude the model + browser.

---


## 4o. Round 59 — Page 2 spinner pictures + the Site-View Doctor in Troubleshoot (app.js, troubleshoot-data.js, index.html, `?v=59`)

**Report (arenascan, 2026-11-10/11):** Page 2 (site view) of a chapter "keeps loading" and shows no chapters, while reading mode (Page 3) works perfectly. The report said "9 pictures, 9 loaded, 0 retried" — i.e. the pictures "loaded" but were not the chapter.

**Root cause (found, reproduced with a mock, fixed):** the site (MangaStream/"mangareader" theme) puts a spinner drawing `readerarea.svg` in every picture slot and lets its own script (`ts_reader.run({... images:[...]})`) swap in the real pages. MangaFlow never runs a site's scripts. The "empty slot" rule only looked for slots with NO address, and a slot with `readerarea.svg` HAS an address, so nothing was filled and the spinner stayed for ever. Old code on the mock: 3 spinner pictures. New code: all 20 pages.

**Fixes**
1. `PLACEHOLDER_SRC` (new) recognises placeholder names (readerarea, blank, spacer, transparent, lazy, placeholder, loader, loading, spinner, 1x1...). They now count as EMPTY in `navigate()` (empty-slot rule), `fixLazy()` and the new `placePictures()`.
2. `placePictures(d, base, pics)` (new, taken out of `renderFrame`): fills empty/placeholder slots in page order, then ADDS the pictures the reader finder knows but the page has no slot for (after the last real picture, same box). Also runs when the page shows 3 or more FEWER pictures than its own scripts list.
3. **Site-View Doctor** (new, before `selfCheck`): `siteViewScan()` counts picture kinds (ok / placeholder / noaddr / failed / pending), asks the reader finder (`fromScripts`, `scanPictures`, `chapterPictures`) what the page SHOULD show and lists named problems: `P2-PLACEHOLDER`, `P2-MISSING`, `P2-FAILED`, `P2-STUCK-LOADING`, `P2-NOLIST`, `P2-NODOC`. `siteViewRepair()` repairs them (fill/add pictures, retry failed through proxies, switch off a never-ending loading bar/banner, load the chapter list from the series page). `siteViewFull()` builds the long detail report.
4. **Settings > Troubleshoot:** "Run checks" now shows those problems; "Fix automatically" runs the doctor; if something cannot be repaired it builds the COMPLETE report (diagnostic + site-view detail: every picture with state/attribute/address/size, class names, script counts, CSP blocks, hash, screen), shows it in a new box (`#fixReport`) and copies it. "Copy full report" and "Send report to server" include the site-view detail. New repair button "Repair this site page" and a new symptom in the guide. Report headers now say "build round 59".

**Tests (mock arenascan, Playwright):** old code = 3 spinners (reproduced); new = 20 pictures; healthy page shows "Site view looks right", no false alarm; broken page (spinners, 3 slots, loading bar stuck) is repaired by Fix automatically; page with spinners and no data anywhere produces the complete report.

**IMPROVE:** add more placeholder names when a new site reports a spinner; add a screenshot hint to the report.


## 4p. Round 60 — Page 2 picture order, full-screen "working" overlay, quiet background detection (app.js, style.css, `?v=60`)

**Report (arenascan chapter 14, build 59, 2026-11-11):** pictures now load (104 loaded) but (a) the chapter was split by "popular manga" thumbnails, (b) the note "Looking for the manga page…" stayed, and (c) after coming back from reading mode the automatic detection "overlapped" the site and blocked it.

**Root causes**
1. `placePictures()` added missing pages after the LAST real-looking picture of the page, which was a sidebar thumbnail. Now it walks the finder's list in order: a page already present is a marker, a missing one is inserted right after the previous marker (leading missing ones go before the first marker). Test: p0..p19 are consecutive, thumbnails stay after them.
2. `#busy` (the working note) was a FULL-SCREEN fixed overlay (`inset: 0`, z-index 55) that swallowed every tap. It is now a small pill at the bottom with `pointer-events: none`, so the site stays usable while detection runs.
3. `loadSeriesList()` never cleared its note ("Looking for the manga page…") when it finished; it now clears it at the end.
4. Background detection (`tryAutoRead`) now backs off when the person has touched/clicked the page (`cur.touched`, set by pointerdown in the frame and in `onFrameClick`), so it cannot pull them into reading mode while they use the site.

**IMPROVE:** a visible "Stop detecting" button on the pill; a setting to turn the quiet detection off for one site.


## 4q. Round 61 — Automatic picture watchdog for Page 2 + the Options Guide files (app.js, `?v=61`)

**Report (arenascan chapter 15):** pictures stayed "loading" (11 of 28 pending) until Settings > Troubleshoot > Fix automatically was pressed; then they loaded. The owner does not want to press it on every chapter.

**Root cause:** the old retry ran only for pictures that had already FAILED (error event) and only once. A picture that just HANGS (slow or silent host, big 690x8000 images, many at once) never fires an error, so nothing ever restarted it. The troubleshooter's "Fix automatically" restarted them by hand.

**Fix:** `kickImg(img)` restarts one picture through the next route (level 1 own proxy + `&ref=` page address, level 2 other proxies, level 3 same address + changing word). `frameWatch(page)` (started in `navigate()` after the page appears) looks at 4, 9, 16, 28, 45, 70 s: failed pictures are kicked at once, hanging ones from 9 s (max 6 per look), and from the 2nd look it runs the quiet Site-View Doctor when the scan finds placeholder/missing/stuck problems. New scan code `P2-STALLED` (pictures still pending after 12 s) is repaired with the same kicks. The watchdog stops when everything loaded or the person leaves the page, never runs on search lists or in reading mode, and its counters appear in the full report ("Picture watchdog").
**Test:** mock chapter where 8 pictures never answer directly: the old code never finished loading; the new code restarts them through the proxy and all 20 load.

**New core files:** `MANGAFLOW_GUIDE.md` and `MANGAFLOW_GUIDE.txt` list every button, shortcut, setting, server option, troubleshoot option and algorithm, with "FIX NOTE (Round N)" lines. Rule: update them with every change; never put private server names, profile names, passwords or keys in them. `MANGAFLOW_FULL_SITE.md` now contains the guide too, so the whole site (all code + guide + history) can be rebuilt from that one file with `node split.js`.

**IMPROVE:** make the look times a setting; show a small "retrying pictures" hint.


## 4r. Round 62 — "Related Series" links taken as chapters + Copy button for profile Reports (app.js, profiles.js, `?v=62`)

**Report (arenascan "A Corporate Underling Who Excels at Work 2", build 60/61):** reading mode showed "chapter 1 of 8", chapter boxes 2-8 stayed empty, the pop-up said "chapters 39, 50, 54, 70, 73, 135, 142 could not be shown", and a later pop-up said "Could not load Chapter 10: no images found" (page title "Master Wants Me Dead").

**Root cause (confirmed with the real site):** the opened page is a chapter whose address has NO word "chapter" (`/a-corporate-underling-who-excels-at-work-2/`). Its only "chapter-looking" links were the **Related Series** cards ("Half Blood Chapter 60" -> `/manga/half-blood/`, a different manga's SERIES page). The number came from the card text, so seven other manga were taken as chapters 39..142 of this one (8 "chapters"), and because there were 8 the code never fetched the real list (the series page `/manga/a-corporate-underling-who-excels-at-work/` has 89 chapters; chapters 1-10 are `/<name>-N/`, later ones `/<name>-chapter-N/`).
**Fixes (app.js)**
1. `detectChapters()`: a link whose address is just `<folder>/<name>/` (`SERIES_PAGE_PATH`: manga, series, comic(s), manhwa, manhua, webtoon, title, read...) with NO number in the address itself is a series page, not a chapter.
2. `guessSeriesUrls()`: also tries the name WITHOUT the trailing number (`-2`, `-chapter-14`) in every typical folder (`/manga/<name>/` is found), up to 8 guesses.
3. `pickSeries()`: when a site changes its address style half way, the other style's links `<name>-<number>` are added back (chapters 1-10 were lost before).
4. Troubleshoot "Run checks" in reading mode: new rows `RD-LIST-SERIES-LINKS` (list contains series-page links) and `RD-MANY-EMPTY` (half or more boxes empty).
**Mock test (`arena10.js`):** before: 8 boxes, 7 empty, menu 8. After: 89 chapters in the menu, chapter boxes fill.
**Profile > Reports:** every report now has a **Copy** button (profiles.js: `bugText` map, `copyplain()` with a hidden-text-box fallback for phones that block the clipboard, action `copybug`). Delete is unchanged. Test `copybug.js`: copy, fallback copy, delete.


## 4s. Round 63 — Script-built sites (drakecomic.net / Next.js): hidden readers, covers, titles, stylesheets, speed (app.js, `?v=63`)

**Report (drakecomic.net chapter, build 60):** reading mode worked but Page 2 did not look like arenascan's; the reader was titled "JavaScript Required"; Troubleshoot could not fix and made a report ("1 style sheet could not be loaded"); pictures took long to appear on every chapter.

**Root causes / fixes**
1. **Hidden reader (Page 2):** such sites keep the reader hidden (opacity 0 / visibility hidden / height 0) and show a full-screen "JavaScript Required" cover until THEIR script runs. MangaFlow never runs site scripts, and its checks only asked "did the picture load?". NEW `frameLook()` asks the browser how every chapter picture is really drawn (getComputedStyle up the parent chain) and finds covers; `unhideFrame()` switches those exact properties to visible with `!important` and removes covers (each change marked `data-mf-unhid`); `galleryFallback()` draws a plain strip of the chapter's pictures (own HTML+CSS) when the site still hides its reader. Runs automatically: quick looks at 0.8 / 2 / 3.5 s (no network), the watchdog looks from 4 s, and "Fix automatically". New problem codes `P2-HIDDEN`, `P2-COVER`; the full report lists how each picture was hidden, the covers, the parts made visible and whether the strip was used.
2. **Title:** an `<h1>` "JavaScript Required" was taken as the manga name. `detectTitle()` now ignores warning words and understands "Chapter 1: Chapter 1 - Name | Site" (`fromChapterFirst`).
3. **Style sheets:** `repairStyles()` repaired only 8 of 17 sheets, one at a time, no second chance ("All promises were rejected"). Now up to 24 sheets, 4 at a time, each failed sheet asked once more after a pause.
4. **Speed (reading mode):** first 3 pictures of the current and next chapter start eager when the box is filled; keeper preload window 4/6 pictures at once (was 3/4; +2 on 4g, 2 on 2g); keeper tick 0.8 s (was 1.5 s); the keeper runs at once when the chapter changes.
**Test (`drake1.js`, mock of a Next.js reader):** before = pictures hidden and cover shown; after = all visible within ~2.5 s, title "They Offered Their Loyalty", reading mode OK.
**IMPROVE:** a visible "Hide strip" button; measure real load times per host and choose routes from them.


## 4t. Round 64 — Style-sheet warning that was not a real problem; readable reasons (app.js, `?v=64`)

**Report (drakecomic, build 63):** "This page may look incomplete: 1 style sheet(s) could not be loaded" with the useless line "All promises were rejected (asked twice)" for `/_next/static/css/ef46...css`; 16 of 17 sheets were repaired.

**Why it was misleading:** the page's own `<link>` for that file is still in the page and the browser may load it by itself fine - MangaFlow only re-fetches sheets through the proxies so it can read them and fix font files. A refusal by the proxies (a 403/timeout, or the site answering 404 for an old file name) was reported as "page may look plain".
**Fix:** `fetchRaw()` now collects every proxy's own reason ("proxy 1: HTTP 403 | proxy 2: timeout | ..."). In `repairStyles()` a failing sheet is (1) ignored when every proxy says 404/410 (the site itself lacks it) and (2) ignored when the browser can fetch it directly (`fetch(..., {mode:'no-cors'})`); both are only noted in the report. Only a sheet that fails BOTH ways triggers the warning, now with the reasons.
**Test (`drake2.js native|404|dead`):** old code warned in the native case; new code: no warning for native and 404, a warning with reasons for a really dead sheet.
**Still open:** the owner has not yet said what looks wrong on Page 2 for drakecomic besides this warning (the chapter pages found are 3 tall strips; the site text says "30 pages"). If pictures are missing, a report showing the real site's picture count is needed.

## 4u. Round 65 — Better word detection and more meaningful translation (translate.js, `?v=65`)

**Problem reported:** after pressing the Translate button the result "is still not perfect and not meaningful".
**Root causes found:** (A) the text reader (OCR) was given the raw picture, so low-contrast, coloured, small or white-on-black letters were read wrongly (for example the word "I" came back as `|`), and a wrong word makes a nonsense translation; (B) whatever came back was drawn on the page without any check, even an empty, an error or an untranslated answer; (C) bubbles were glued with ` ||| ` which services often change, and they were sent in picture order, not story order.

**The new algorithm (all inside `translate.js`, in this order for every page):**
1. `prepTile()` — grey picture, contrast stretched between the darkest and lightest 2 %, a mostly dark slice is turned round (light letters on dark ground), pages narrower than 900 px are enlarged up to 2x.
2. `readPage()` — reads the prepared slice; if no word was found, reads it again as a pure black/white picture (Otsu threshold) in "sparse text" mode.
3. `keepWords()` — removes single words the reader is not sure about (spaced scripts only: English, Hindi, Korean); a lone `|`, `l`, `I`, `A` is kept.
4. `fixOcr()` — repairs typical reading mistakes. English: `|`→`I`, `G00D`→`GOOD`, `exam- ple`→`example`, SHOUTING capitals → normal sentences, `...`→`…`. Japanese/Chinese: half-width → full-width (NFKC), stray `|_~^` between letters removed, a long-vowel mark read as `l`/`I` repaired.
5. `isGarbage()` — English noise such as `Ee i' rl` or `xzq tbr` is not translated (the picture is left alone there).
6. `readingOrder()` — rows from the top, inside a row right-to-left for Japanese/Chinese, left-to-right otherwise.
7. `translateAll()` / `translateGroup()` — one request per page (max 12 bubbles / 3000 encoded characters per request), one bubble per line. If the answer has a different line count the group is cut in two (still in context), down to single bubbles.
8. `badAnswer()` — refuses an empty answer, an error text, an answer that is still in the old language, or one not in the wanted writing system (for example Hindi expected, Latin letters came back). The next service is asked; Google is asked once more with "detect the language" when it returned the old language. If nobody gives a good answer the best refused one is used.
9. `polish()` — HTML codes (`&#39;`), spaces before commas, `...`, leading dash, capital first letter, `i`→`I` (English).
Also: a service that never answers (the built-in browser translator can hang while preparing) is given up after 20 s (built-in) / 40 s (others); the old Google "dictionary j[5]" shortcut was removed because it never returned data and the dictionary's first meaning is often wrong in a story; MyMemory is skipped (not counted as failed) for batches longer than its 480-character limit; the diary (Troubleshoot report) now lists what the reader saw per line.

**Tests (mock):** unit tests of every helper; a real Tesseract run on a generated page with three bubbles (one white-on-black) → 3 boxes, one batched request in story order, sentence case; a batch whose answer lost a line was cut in two and still gave all 4 bubbles.
**Honest limit:** hand-lettered fonts and sound effects can still be misread; tap a box to see the original, use "Translate again" to read once more.

## 4v. Round 66 — Dead old uploads, a harmless "previous chapter" 404, two false alarms (`?v=66`)

**Reports (build 65):** (1) mgeko: pressing the site's own "Previous" of chapter 1 opened `…chapter-0…` → red "Could not load the page … 404". (2) kingofshojo: chapters 3-9 showed 41 red "Page N could not be loaded" boxes and the pop-up "Several pictures … are not loading"; the diagnostic said 939 pictures retried, 283 waiting. (3) the diagnostic said "P2-HIDDEN: 82 of 82 pictures NOT visible" while reading, and "P2-PLACEHOLDER … not repaired" although 84 of 85 pictures were shown.
**Root causes:** (1) a followed link that the site answers with 404 was treated as a MangaFlow failure. (2) the site's own list holds only the NEW uploads (`chapter-3-2` … pictures on a new server); the reader guessed the missing whole numbers (round 55 "gaps", pages 3-9 still answer) and those OLD uploads have deleted pictures (HTTP 404) → the keeper retried every dead picture for ever (this also eats a free proxy's daily limit). (3) the visibility check ran while Page 2 was hidden behind the reader (everything measures 0x0); a spare placeholder slot was counted as a problem although every known picture was shown.
**Fixes (always on, no button needed):**
- `deadUploadDoctor()` (inside the keeper tick, every 3 s while reading): a chapter with ≥4 failed pictures (≥70 %) AFTER two automatic retries, while other chapters load fine, is a dead upload. A guessed chapter — or a listed one whose twin (same whole number) loads — is removed quietly (page, menu, bar) with one small toast; the chapter being read scrolls to the twin first. A real chapter without a twin stays with one note and retries only every 2 minutes. "Fix automatically" runs the doctor at once (after one retry). The "Several pictures … not loading" pop-up is no longer shown for guessed chapters. The diagnostic's Keeper line shows `dead uploads skipped N [numbers]`.
- `navigate()`: a followed link answered with 404/410/"not found" gives a one-line toast ("there is no earlier chapter" when it looks like chapter 0/1) and the address bar returns to the page you are on.
- `siteViewScan()`: the "can a person see the pictures" check only runs when Page 2 is really on screen (not in reading mode); a leftover placeholder slot is ignored when all known pictures are shown.
- Troubleshoot: new symptom `deadupload`.
**Tests (mock, `kings1.js`, `mgeko1.js`):** kingofshojo-like site (list 1.2…9.2 with cdn pictures, 10…22; gaps 1…9 with 404 wp-content pictures): before the fix every second chapter showed 8 red boxes; after, only the 5 loaded chapters remain, no pop-up. mgeko-like site: Previous of chapter 1 → toast, address back on chapter 1, no pop-up.

## How to Deploy / Set Up

### 1. GitHub Pages
- Fork or push to `DHARMAdr/Mangat0`
- Enable GitHub Pages from `main` branch root
- Site is live at `https://dharmadr.github.io/Mangat0/`

### 2. Cloudflare Proxy Worker (`worker.js`)
- Cloudflare Dashboard → Workers → Create → paste `worker.js` → Deploy
- Copy the Worker URL
- In MangaFlow Settings paste it as "Proxy URL"

### 3. Cloudflare Accounts Worker (`accounts-worker.js`)
- Cloudflare Dashboard → D1 → Create database → name it `mangaflow`
- Workers → Create → paste `accounts-worker.js` → Deploy
- Settings → Bindings → Add D1 binding named exactly `DB` → pick the database above
- Settings → Variables:
  - `ADMIN_USER` = your chosen admin name (3-20 letters/digits)
  - `ADMIN_CODE` = your 6-digit admin code (keep it secret)
  - `ALLOWED_ORIGINS` = `https://dharmadr.github.io` (comma-separated if multiple)
  - `PEPPER` = any long random text (extra security)
- In MangaFlow → Profile icon → Server → paste the Worker URL → Save → Test

---

---

## 5. Round-by-Round Change History (key rounds)
| 44 | Page 2 scroll-hide; profile filter buttons; mobile date filter (invisible text, rebuild, backdrop close); chips; new doc | profiles.js, app.js, style.css, MANGAFLOW.md |
(Rounds before 44 follow.)


| Round | What changed |
|-------|-------------|
| 1–10 | Initial site: chapter loading, reader, basic settings |
| 11–13 | KV-based cloud storage |
| 14 | Switched cloud to D1 database |
| 15–18 | Bookmarks, continue-reading, PDF export |
| 19 | Bug reports, guest report endpoint |
| 20 | Admin gets a real user row |
| 21 | Translate overlay v1 |
| 22 | Ping endpoint returns version; OCR improvements |
| 23–27 | Translation quality improvements, language selector |
| 28 | Profiles tab redesign |
| 29–31 | PDF + translate integration planning |
| 32 | Cloud sync robustness; safeRender lock v1 |
| 33–35 | History fixes; more manga sources |
| 36 | WakeLock v1; settings persistence |
| 37 | Chapter pagination improvements; date filter planning |
| 38 | Chapter pagination fix, history fixes, PDF translation, wake lock, cloud delete |
| 39 | My History alignment/date filter, outside-click-close, refresh bug, real back/forward, "Open on site" button, site-compat fixes |
| 40 | Export/download button fix, mobile date-filter CSS, "Open on site" button redesign |
| 41 | Bookmark removal, wake-lock/header fixes, date-filter 2nd pass, roliascan.com check |
| 42 | Cache-busting `?v=` on every script/style tag; header hides on the start page |
| **43** | **Full audit + bug-fix round — see "Round 43" below** |

---

## Round 43 — Full Audit & Bug-Fix Log

Method: syntax + lint pass, ID cross-check (HTML ↔ JS ↔ CSS), real-browser run (phone + desktop size, mocked manga site through a mocked proxy), then a line-by-line review of all of `app.js`. Every item below was confirmed by reading the code before it was changed. Cache-bust number is now `?v=43` in `index.html`.

### Fixed (app.js)
1. **Chapter detection crashed on a stray `%`** (`/promo/100%`, `/sale-50%-off`): `decodeURIComponent` threw and aborted the whole scan. New `safeDecode()` helper used in `detectChapters` and the "current page missing from list" path.
2. **Locked-chapter message never shown**: `mainText()` tested `n.isConnected` on a detached clone (always false), so every wrapper was removed and the 60 % protection never worked. Removed that test.
3. **Loading bar stuck on** after a Google-URL / invalid-address early return in `navigate()`; now `setLoading(false)`.
4. **Home during a slow load**: the old page appeared over the start screen later. `goHome()` now cancels the in-flight navigation (`navSeq++`).
5. **Chapter pictures doubled**: reload pressed while a chapter was still loading (or keeper + reload) made two fills add every page twice. `fillChapter` now has a per-box token; only the newest call may touch the box.
6. **Proxy deleted by mistake**: `isExample` was case-insensitive and unanchored, so a real worker named like `username.workers.dev` / `mangaflow-name.workers.dev` was removed at every load. Now only the literal `//NAME.workers` placeholder matches.
7. **Pasted proxy with a query string** (`…/proxy?key=abc`) was turned into `…?key=abc/?url={url}`. Now `&url={url}` is appended.
8. **Keep-screen-awake race**: switch + click + timer requested several locks, the first was lost, so switching OFF left the screen on. Requests are now serialised (`wakeBusy`) and re-checked after the await.
9. **Back/Forward dead after `?url=` / `?q=` links** (share links, search-result tabs): `resumeFromHash()` was blocked by start-up-only variables. `popstate` now passes `fromPop`.
10. **"Erase when I close the tab" wiped bookmarks on every reload** (Fix automatically, Reset, Sync, F5). It now erases once per NEW tab session (sessionStorage marker `mf_alive`) and never on reload. Trade-off: the erase happens at the next open, not at the moment of closing.
11. **Old baked-in Google API key** was cleared in storage but stayed in memory and was written back by the next `applySettings()`. Now also cleared in memory; the storage read is inside the `try` (blocked storage no longer aborts start-up).
12. **Clipboard list remembered secrets**: copy/paste listeners saved anything pasted in the Google key box, proxy box, password boxes or dialogs. Those are now skipped.
13. **Damaged saved lists** (`recent`/`books`/`reads` = `{}` or containing `null`) crashed the start page. They are now validated to arrays of objects.
14. IntersectionObserver now looks at all entries (`some`), not only the first; PDF diary printed `Chapter ?` (used `it.num`, items carry `label`/`no`).

### Fixed (profiles.js) — found in the second half of round 43, once the full file set was audited
15. **History date filter moved the date back one day** (the "still broken on my phone" report of rounds 39-42): the boxes were read as LOCAL midnight but written back with `toISOString()` (UTC). In India (UTC+5:30) picking 1 Nov showed 31 Oct after the redraw, and "today" could not be picked after midnight. Now both directions use local time. Verified in a headless browser set to Asia/Kolkata: the old file gave 2026-10-31, the new one 2026-11-01.
16. **Deleting history never reached the cloud**: `/activity/delete` (and `/activity/clear`) were sent WITHOUT the sign-in token, so the Worker answered 401 and the empty `catch` hid it. Deleted rows came back after every reload. The token is now sent and a real failure is shown. The extra `/activity/clear` call was dropped (`Cloud.clear()` already calls `/clear-me`).
17. **"Clear history" and "Sync now" left the old list on screen** (the cache was reused). Both now reset `view.cache`.
18. A failed history fetch was cached as an empty history (Export then wrote `[]`). Not cached any more.
19. "Select all" bookmarks selected rows that are not shown (only 100 are listed). Now only the visible ones. Bookmark merge cap raised (it silently cut at 300).

### Fixed (translate.js)
20. A saved `trFrom` of `constructor`/`toString` passed validation and broke every page (now `hasOwnProperty`). MyMemory error texts and non-200 answers were shown as translations (now rejected). A single offline moment marked an OCR language file as missing for the whole session (now only a real 404 is remembered).

### Fixed (style.css)
- Start page on phones: orphan "3" card now spans the full row; long placeholder no longer cut (smaller placeholder font only, typed text stays 16 px).

### Known / not changed (open items)
- **profiles.js**: removed bookmarks / "Continue reading" rows can come back after a sync (the merge is a union with no deletion marker; needs a `deleted` list in the synced JSON). Guest history read before signing in is not adopted in LOCAL mode, and a failed cloud flush at sign-in loses it. Bookmark/state changes in the last 3 s before closing the tab are not pushed (no `keepalive`). An expired token (30 days) is never handled: sign out and in again. The admin filter calls `render()` without the `safeRender` lock.
- **translate.js**: a page that times out keeps running in the background and can clash with Retry (needs a per-run token); changing the language mid-run can give mixed-language results; one failed page stops the whole queue; the vertical-to-horizontal box swap mixes the two axes; the OCR worker and bitmaps are never released; with auto-detect the first page is stamped with the wrong key and is redone when you scroll back. These need the `ocr/` folder to test, so they were documented, not changed.
- **worker.js**: `ALLOWED` is empty, so ANYONE can use your proxy (the Worker prints a warning header). Setting it blocks picture loads that send no Origin, so test before you fill it, or use Cloudflare rate-limit rules. `isPrivateHost` does not catch decimal/hex IP forms or redirects to private hosts.
- **accounts-worker.js**: a lock-out per username lets a stranger lock the admin out for 15 minutes by typing wrong codes (a design trade-off).
- troubleshoot-data.js prompts mention `test/mock-sites.js`, which is not in the project any more.
- **Google API key literal** `AIzaSyC-cqQ0…` is still in `app.js` (needed for the migration check) and in the public GitHub repo. **Revoke it in Google Cloud Console** and then delete the literal.
- `weloma`/lazy `width="100%"` images are ignored by `generalPictures`/`isHolder` (`parseInt('100%')` = 100 < 150 px). Medium confidence, not changed.
- `challenge-platform` marker can show a false "verify you are human" box on Cloudflare pages with no `<img>` tag (medium confidence).
- PDF download: translated-page path ignores `maxW`/2000 px slicing and white background; dead (non-existent) guessed chapters are not skipped in the range; canvases are not shrunk after use (iOS memory); a failed later part aborts the job after earlier parts saved; `Retry-After` is not capped.
- Blob URLs of pictures are not revoked when the stream is wiped (`startReading`/`jumpTo`/`removeSection`).
- Typing `Dr.Stone` is treated as a host name; `runCse` concurrent calls; `goHist` sets the index before the load succeeds.
- Files NOT in the round-42 zip and therefore not audited: `boot.js`, `pdfmaker.js`, `translate.js`, `profiles.js`, `accounts-worker.js`, `worker.js`, `chapter-slider.js`, `reload-wheel.js`, `edge-slider.js`, `troubleshoot-data.js`, `_headers`.

---

## Round 38 — Full Change Log

### 1. Chapter List — All Chapters Now Load (app.js)
**Problem:** ArenaScan (and other paginated sources) only loaded the first ~25–190 chapters.
**Root cause:** `morePages()` had `Math.min(links[last].n, 40)` — hard cap at 40 pages. Timeout was 40 seconds.
**Fix:** Raised cap to 200 pages. Timeout raised to 90 seconds.
```js
// BEFORE:
const maxN = Math.min(links[links.length-1].n, 40)
if (Date.now() - t0 > 40000) { ... break; }
// AFTER:
const maxN = Math.min(links[links.length-1].n, 200)
if (Date.now() - t0 > 90000) { ... break; }
```

### 2. History Delete — Multiple Entries Now Work (profiles.js)
**Problem:** First × worked. Second × did not — deleted item came back.
**Root cause:** Race condition. `render()` was called without `await`. Two rapid taps both ran `render()` concurrently. The second re-fetched from the cloud API and overwrote the first deletion.
**Fix (four layers):**
- `view.cache` updated immediately in the click handler (before render)
- `render()` now uses `view.cache` when non-null (skips API re-fetch)
- `safeRender()` lock prevents two renders running at the same time
- Cache nulled on tab switch and dialog open (so fresh data loads when needed)

### 3. History — All Entries Shown + Date Range Filter (app.js + profiles.js)
**Problem:** Only 20 entries shown in app.js, 30 in profiles. Cloud showed 200 max.
**Fix:**
- `addRecent()` cap: 20 → 500
- `saveRead()` cap: 30 → 500
- `profiles.js CAP`: `{ recent: 500, reads: 500 }`
- Removed `rows.slice(0, 200)` in `listHtml()`
- Added date range filter: From / To date pickers (default: last 7 days)
- "All dates" button to clear the filter

### 4. Export Button Text — No Longer Clipped (profiles.js)
**Problem:** "Export (JSON)" was too wide for the button on mobile screens.
**Fix:** Shortened to "Export". Also "Clear my history" → "Clear history".

### 5. Cloud Sync for History (profiles.js + accounts-worker.js)
**Problem:** Removing a history entry only removed it from the browser — still visible after cloud sync.
**Fix:**
- `delact` handler now calls `POST /activity/delete { user, t, url }` on the Worker
- `clear` handler now calls `POST /activity/clear { user }` on the Worker
- Two new endpoints added to `accounts-worker.js`

### 6. Keep Screen Awake — Fixed + Auto-OFF on Reload (app.js)
**Problem:** WakeLock stopped re-acquiring after the screen turned off and came back. Toggle persisted across reloads (security risk).
**Fix:**
- Added `window.addEventListener('pageshow', syncWake)` and `window.addEventListener('focus', syncWake)` — these re-request the WakeLock when the page becomes visible again
- `settings.keepAwake = false` unconditionally after settings load — so it always starts OFF on a fresh page load

### 7. Translation Text Box — Vertical → Horizontal Resize (translate.js)
**Problem:** Japanese vertical text columns produce tall-narrow OCR boxes. Translated English text crammed into those shapes was unreadable (1-2 characters per line).
**Fix:** When the source box is vertical (height > width × 1.5) AND the target language is LTR (English, Hindi, etc.), swap the box dimensions: new width = old height, new height = old width. The box is re-centered at the original center point.

### 8. PDF Download — Shows Translated Text (app.js + translate.js)
**Problem:** Downloaded PDF showed original manga images with no translation.
**Fix:**
- New `addPageImageWithTranslation(pdf, bytes, mode, imgEl)` function in app.js
  - Decodes image to canvas
  - Looks up OCR + translated text via `translate.js → getPageData(imgEl)`
  - Draws translated text boxes on the canvas (white/black background + text)
  - For vertical source boxes: swaps dimensions (same logic as translate.js overlay)
  - Re-encodes as JPEG and adds to PDF
  - Falls back to `addPageImage()` if no translation data found
- New `getPageData(img)` function in translate.js — returns `{ bubbles, texts }` for a translated page
- `window.MangaFlowTranslate` updated to expose `getPageData`
- PDF download loop now calls `addPageImageWithTranslation(strip, r.b, mode, pageImgEl)` instead of `addPageImage`

---

## Round 39 — Full Change Log

### 1. My History — button alignment + date filter (profiles.js)
**Problem:** buttons in "My History" looked misaligned; the From/To date filter showed a default date but could not be changed.
**Root causes & fixes:**
- `.mfp-row>*{flex:1}` was also stretching the small "From:"/"To:" text labels to the same width as the date boxes next to them, leaving odd gaps. Labels now get `flex:0 0 auto`; row items get a 140px floor instead of starting from zero width.
- Buttons now use `display:inline-flex;align-items:center;justify-content:center;white-space:nowrap` so text always stays centred even if a sibling button wraps to two lines.
- **Date filter root cause:** the date inputs were wired to the `'input'` event, which a native `<input type=date>` fires on *every partial keystroke* (typing just the day before the year is filled in counts as one). Each partial edit reset the filter back to the default before the date could be finished. Fixed by switching to the `'change'` event (fires once, when the date is actually complete) with a regex validating a full `YYYY-MM-DD` value.

### 2. Auto-reopening the last chapter on a plain homepage refresh (app.js)
**Problem:** refreshing the home page sometimes reopened the last-read chapter instead of staying on the home page.
**Root cause:** `updateCurrent()` (runs on every scroll frame while reading) debounces a `rememberChapter()` call 600ms after scrolling stops — and used to do this on **every** pause, even when the chapter hadn't changed. If the person left reading mode within that 600ms window, the pending timer still fired afterward and silently rewrote `#r=<chapter>` into the address bar, even though the screen already showed the home page. A refresh at that moment then reopened the stale chapter.
**Fix:** `leaveReader()` now cancels that pending timer (`clearTimeout(saveTimer)`) the instant reading mode is left.

### 3. Site slowdown "since the updates" (app.js)
**Root cause:** the same debounced save in `updateCurrent()` ran on *every* scroll-pause, not just on a real chapter change — writing the **entire** history array to localStorage (`JSON.stringify` + `setItem`) each time. Round 38 raised the kept history size from 20/30 entries to 500 so "My History" could show everything — which made this already-frequent save go from cheap (small array) to a real, repeated cost on a very hot path (every pause while just reading).
**Fix:** the save now only actually runs when the chapter number really changed, or at most once every 20 seconds while staying on the same chapter (so "Continue reading"'s timestamp still stays roughly fresh).

### 4. Floating tabs now close by tapping outside them (profiles.js, translate.js)
**Problem:** Settings already closed on an outside tap; the Profile window and the Translate settings panel did not.
**Root cause:** app.js's existing "click outside = close" wiring (round 11) only loops over `<dialog>` elements that exist in `index.html` at page-load time. The Profile dialog is created dynamically by `profiles.js`, and the Translate settings panel is a plain `<div>` (not a `<dialog>`) created by `translate.js` — both run *after* that loop, so neither was ever included.
**Fix:** the exact same press-starts-and-ends-outside pattern was added directly in each file for its own window/panel.

### 5. "No images found" on sites using generic lazy-load placeholders (app.js — weloma.net)
**Root cause:** `scanPictures()` returned immediately whenever the reader box found 2+ empty "holder" slots, even when it found **zero** real picture addresses — so the script-scanning fallback (`fromScripts()`, which reads the real addresses straight out of a `<script>` tag, confirmed present by the diagnostic tool: "111 picture addresses found inside scripts") was never even attempted.
**Fix:** when the reader box's own address count is under 3, `fromScripts()` is now also tried, and whichever source finds more pictures wins.

### 6. "Site sent the main page instead of the chapter" false positive (app.js — rawkuma.net)
**Root cause:** `wrongPage()`'s "is this really the series/main page?" check only looked at the canonical/`og:url` tag — which some sites point at the series page even on a genuine chapter page. rawkuma.net's chapter page was rejected despite having 22 real pictures, a "Chapter 1" title, and a working "next chapter" link.
**Fix:** before trusting the canonical-tag guess, `wrongPage()` now checks for a genuine "next"/"previous chapter" link (`findNavLinks`) pointing to a *different* chapter number. A manga's main page never links to "chapter 2" as its own next chapter — only a real chapter page does — so finding one now overrides the canonical-tag guess (and the "locked/login wall" guess too).

### 7. manhuaus.com "several pictures not loading" (no change needed)
This round-14 report pre-dates the Keeper (round 29d), which already retries failed/stalled pictures automatically with growing backoff, plus a weserv.nl fallback proxy. Current code already covers this; no further change made.

### 8. Real browser Back/Forward support (app.js)
**Problem:** pressing the browser's own Back button (or the phone's back gesture) closed reading mode completely with no way back via Forward; the header's own Back/Forward buttons did not include chapters at all.
**Root cause:** every navigation (opening a page, switching chapters, pressing Home) only ever called `history.replaceState` — which edits the *current* history entry instead of adding a new one. A whole reading session was still just one browser-history entry, so Back had nothing of ours to step through and jumped straight to whatever was open before MangaFlow.
**Fix:**
- `rememberView()` and `rememberChapter()` now take a `push` argument; when true (a real navigation, not a passive resume) and the address is actually changing, `history.pushState` is used instead of `replaceState`.
- Pushes happen when: a manga page/search is opened, Home is pressed, reading mode starts, and a chapter actually changes (never on the periodic same-chapter keep-alive save).
- A new `popstate` listener restores whichever page/chapter the browser just stepped to, using a `suppressPush` guard so the restore itself never adds another entry (which would otherwise fight with Back/Forward).
- The header's `#btnBack`/`#btnFwd` buttons now call `history.back()`/`history.forward()` directly, so they behave identically to the browser's own buttons and both include chapters.

### 9. "Open on `<site>`" button (app.js, index.html, style.css)
New pinned button below the top-right of the header, shown only while an actual external manga page is open (never on the home page or a search-results list). Opens that exact page on the real site in a new tab — useful when a button or script on the original page cannot work through MangaFlow's proxy.

### 10. More buttons/shortcuts visible while browsing other sites (app.js)
Extended `MF_NOJS_CSS` (the stylesheet injected into every proxied page to undo "a script would have shown/opened this") with: Alpine.js/Vue "wait for JS" markers (`[x-cloak]`, `.js-hidden`), pagination/"load more" wrappers, and a faint dashed outline on icon-only buttons/links whose icon font produced no visible glyph — so the clickable area is still visible even when the icon itself is invisible. Deliberately does **not** enable any third-party JavaScript inside the mini-browser — that remains blocked by its own `Content-Security-Policy: script-src 'none'` on purpose (a core safety rule of the whole proxy design, mentioned throughout the code since round 8). A real browser's full compatibility is therefore not achievable without removing that safety rule.

### 11. Chapter numbers with a site ID glued on (app.js — rawkuma.net and similar)
**Root cause:** some site themes build chapter addresses like `chapter-1.199375` — the real chapter number (1) followed by a dot and the site's own internal database ID (199375), which has nothing to do with the chapter number. The old number-parsing pattern read "1.199375" as one fractional chapter number.
**Fix:** a genuine fractional/half chapter ("12.5", "7.1") almost always has a short (1-2 digit) fractional part; a database ID glued on the same way is typically 3+ digits. The parser now keeps the fractional part only when it's 1-2 digits, otherwise uses just the whole-number part. This also strengthens fix #6 above (comparing chapter numbers across the main chapter-nav-link check).

---

## Round 40 — Full Change Log

Follow-up round based on a phone screenshot of "My History" and the mini-browser toolbar, after round 39's fixes still left three things not quite right.

### 1. Export/download button in "My History" did nothing on many phones (profiles.js)
**Problem:** tapping "Export" (saves your history as a JSON file) worked on a computer but appeared to do nothing on mobile.
**Root cause:** the `download()` helper built a `<a href="blob:..." download="...">` link and called `.click()` on it **without ever adding that link to the page**. Desktop browsers are often forgiving about clicking a detached element, but a lot of mobile browsers (Android Chrome in some modes, in-app/WebView browsers) only honour a programmatic click + the `download` attribute when the element is genuinely part of the page's DOM — clicking one that was never attached is silently ignored, with no error shown anywhere.
**Fix:** the link is now appended to `document.body` (hidden with `display:none` so it's never visible), clicked, then removed again (along with revoking the blob URL) a moment later. This is the same pattern `app.js`'s own PDF-chapter `saveFile()` already used correctly — only this JSON-export copy in `profiles.js` had the bug.

### 2. Date-range filter in "My History" still not usable on a phone (profiles.js)
**Problem:** round 39 fixed the date filter's *event* (switched from `'input'` to `'change'`), which fixed it on a computer, but on a phone the From/To boxes still didn't work properly.
**Root cause:** the From/To row packed five separate flex items into one line — two text labels, two `<input type="date">` boxes, and the "All dates" button — with the date inputs set to `min-width:0` so they were the ones allowed to shrink when space ran out. A computer's wide window never ran out of space, so this never showed up there; a phone screen (roughly 360-400px) does not have room for all five, and the date boxes got squeezed down to something like 40-60px wide — too narrow for the phone's own native date picker to display or for a tap to land on the right day/month/year digit.
**Fix:** each label is now grouped together with its own date input as a single unit (`.mfp-dateitem`), and that whole unit is what wraps onto its own line on a narrow screen — so on a phone you get a full-width "From: [date]" row, then a full-width "To: [date]" row, then the "All dates" button, each with enough room for the native picker to work properly; a computer still shows all three in one line since there's room.

### 3. "Open original site" button looked out of place (index.html, style.css)
**Problem:** the button added in round 39 was a wide pill with the text "Open original site" on it, floating over the middle of the external site's own page content; on a phone it was additionally moved down near the bottom of the screen (to avoid the header, which wraps onto 2 rows there) — which put it right next to, and visually colliding with, the orange "Reading mode" button.
**Fix:** redesigned as a small, icon-only, square button — the exact same size and shape as the other header buttons next to it (Back, Forward, Reload, Star, Theme, Settings), showing just the ↗ "opens outside this page" arrow, no text. It now always stays pinned at the **top-right, just under the header**, on every screen size; only the exact pixel offset changes between desktop and phone (to clear the header, which is one row tall on a computer and two rows tall on a phone), so it never needs to jump down to the bottom of the screen any more.

---

## Round 41 — Full Change Log

A long follow-up round covering a new site-compatibility report, a repeated slowness complaint, a repeated mobile date-filter complaint, a button-centering complaint, and four new feature/bug requests (bookmark removal, header auto-hide, keep-awake, and another pass over "My History").

### 1. roliascan.com Chapter 1 reported as LOCKED/REMOVED — confirmed correct, no code change
**Report:** MangaFlow said "Chapter 1 may be LOCKED or REMOVED... MangaFlow cannot log in for you" for a chapter on roliascan.com.
**Investigation:** fetched the chapter page directly to check whether this was a false alarm (like round 39's weloma.net/rawkuma.net reports turned out to be). It is not — the page itself shows a **"Login Required"** modal ("Create a free account to continue reading and unlock all chapters") together with an **"Access Restricted — This content is not available anymore"** notice. roliascan.com itself is blocking this specific chapter behind a login wall (or has pulled it), independently of MangaFlow. The diagnostic tool's message was accurate; there is nothing in MangaFlow's own code to fix here. If the manga is otherwise readable on that site when logged in, that is expected — MangaFlow (correctly, for safety) never logs in anywhere on your behalf.

### 2. General site slowness — re-audited, nothing further found
Re-checked the whole app for anything that could be adding to page/chapter load time since round 39's scroll-save fix (which was a confirmed, real slowdown, now fixed). Reviewed the Keeper's background preload interval, the proxy page-cleaning pass, and everything added in rounds 39-40 (wake-lock timer, bookmark checkboxes, date-filter listeners) — none of it runs on a hot path or adds meaningful cost; the new wake-lock safety timer (round 41, #6 below) only fires once every 15 seconds and does nothing when the lock is already held. **This needs more specific information to debug further**: please say exactly where it feels slow next time (the home page loading, opening a chapter, switching chapters, searching another site, something else) and roughly how slow — "slow" by itself does not point at any one piece of code, and changing the page-cleaning security pass by guesswork risks weakening it for no proven benefit.

### 3. My History: Export button not quite centred (profiles.js)
**Root cause:** the dialog is attached to `<body>`, which sets a comfortable **line-height of 1.45** for reading paragraphs. A button's label is one short line, not a paragraph, so that line-height was adding invisible space above and below the text/icon ("half-leading") — the button was already centred by `justify-content`/`align-items`, but centring the *line box* is not quite the same as centring the *ink* when the line box is taller than it needs to be, especially with a symbol character like the "Sync now" ⟲ arrow, whose glyph shape sits differently inside its line than plain letters.
**Fix:** `line-height:1` added to `.mfp-btn`, so the line box now hugs the text/icon exactly and the existing centring lands in the true middle of the button.

### 4. Bookmarks could be added but never removed (profiles.js)
**Problem:** the star button only ever added a bookmark; there was no way to take one back off from inside the Profile window, and no way to remove several at once.
**Fix:** every bookmark row now has its own **×** button (the same single-item-removal pattern "Continue reading" rows already had since round 35) for a quick one-at-a-time removal, PLUS a checkbox on each row and a **"Select all" / "Remove selected (N)"** bar above the list for removing several at once. Removing a bookmark (one or many) immediately tells the home page to redraw its bookmark section and star icons, the same way deleting a history entry already did.

### 5. My History date filter — still broken on some phones, second pass (profiles.js)
Round 40 fixed the *layout* (the date boxes were being squeezed too narrow to use). This round targets the *event handling*, which round 40 did not touch:
- Some phones were found not to reliably fire the `'change'` event at all after picking a date from their native calendar widget — only `'input'`. The filter now also listens on `'input'`, but **only acts when the value is already a complete, valid date** (an incomplete value is simply ignored, never resets the filter) — so this cannot reintroduce round 39's original bug.
- The dialog's own re-render (which rebuilds the date `<input>` element from scratch) now happens a moment later (`setTimeout(…, 0)`) instead of instantly inside the event handler, giving a phone's native picker-closing animation/focus-return sequence time to fully finish first, instead of potentially having its own `<input>` element torn out from under it mid-sequence.

### 6. "Keep screen awake" stopped working partway through a session (app.js)
**Root cause (two found):**
- The switch correctly asked for a Screen Wake Lock, but some phones' own aggressive battery-saving software (several Android makers are known for this) can silently take the lock away without the browser ever firing an event MangaFlow was listening for, and nothing then asked for it again until the phone happened to trigger one of those events — which, left untouched on a desk, might be never.
- Separately found: saving settings was writing `keepAwake:true` straight into permanent storage, even though round 38 explicitly said this switch must *never* persist across a reload (for battery/privacy reasons) — a real inconsistency, now fixed, though not the direct cause of the screen going dark mid-session.
**Fix:** a 15-second safety-net timer re-asks for the lock whenever it isn't currently held (harmless no-op if it already is), plus re-asking on the next tap or touch (a few browsers only allow a fresh request from inside a user action). The switch's own live state is untouched by storage now, so it keeps working normally for the rest of the visit either way. **If a specific phone still dims/locks the screen after this**, that phone's own battery/app-optimisation setting for the browser being used likely needs to be turned off by hand in the phone's own Settings app — that part is outside what any website's code can override.

### 7. Header auto-hiding too eagerly while reading (app.js)
**Problem:** scrolling up to reach the header/buttons while reading could show them for barely a second before they hid again.
**Root cause:** showing AND hiding the header both required a recent (within 1.5s) tap-to-scroll action — drag-scrolling or simply pausing for a moment closed that window, after which scrolling up could no longer bring the header back at all until a tap happened to line up with it again, which felt random.
**Fix:** showing the header on scroll-up no longer needs that "recent tap" gate at all (showing is always safe); hiding still requires it, so an automatic/background scroll can never sneak in a hide. A short 900ms hold after showing also blocks any hide right afterward, so a little scroll jitter the moment the header reappears cannot immediately hide it again. A touch starting now also counts as "recent input" (not just an explicit tap-to-scroll), so hiding still works properly for people who read by dragging rather than tapping.
**Not possible without a bigger change:** the request to also auto-hide the top bar while *browsing other manga sites* (not reading) cannot be done the same way — the mini-browser's `Content-Security-Policy: script-src 'none'` (blocking all third-party JavaScript, a core safety rule of the whole proxy design since round 8) means a site being browsed cannot report anything about its own scroll position back to MangaFlow at all, by design. Doing this would require either running the other site's JavaScript (removing that safety rule) or rebuilding the mini-browser as a true scroll-synced native frame, which is a much larger change — happy to scope that separately if it's wanted badly enough to accept the trade-off.

### 8. A full pass over "every button, shortcut and option" (scope note)
Went through the items explicitly named this round (all above) plus a re-check of the buttons/shortcuts touched directly by those fixes (header buttons, Settings' keep-awake switch, the Profile window's every tab). A genuine, exhaustive click-through of *every* option on a real phone is not something that can be done from here without an actual device in hand — please flag anything specific that still looks or acts wrong after this round, the same way the screenshot and roliascan.com report were used this time, so it can be checked with real evidence instead of guesswork.

---

## Round 42 — Full Change Log

The owner reported that round 41's fixes (Export button, date filter, header-hide) looked completely unchanged on their phone, despite the GitHub push having genuinely succeeded. That mismatch pointed at something bigger than any one button.

### 1. Found the real reason earlier rounds could look like they "never arrived": no cache-busting (index.html)
**Root cause:** every single round, every file kept the exact same name and address — `app.js`, `profiles.js`, `style.css`, and so on, every time. A browser's cache (and, on mobile data, sometimes the phone carrier's own network-level cache too) decides whether it already has a file **purely by that address** — it has no way to know the *contents* at that address changed on the server unless the address itself changes or it happens to re-check. With the same address reused round after round, a phone could easily keep running JavaScript from several rounds ago while genuinely believing it was looking at "the site" — making brand-new, correctly-deployed fixes look like they had never been applied at all, which matches exactly what was reported.
**Fix:** every local `<script src="...">` and `<link rel="stylesheet" href="...">` tag in `index.html` now ends in `?v=42` (see the long comment right above them). Changing that number forces every browser to treat the file as a completely new address it has never cached before — a clean, forced re-download, every round, no exceptions. **Going forward this number will be bumped automatically whenever these files change**, so this class of problem should not come back. **One-time action needed on your end:** since this fix only takes effect once the new `index.html` itself is loaded fresh, please do ONE hard refresh / "clear site data" for the MangaFlow address on your phone after this update goes live — after that one time, this mechanism keeps everything current automatically.

### 2. Header now also hides while scrolling MangaFlow's own search/start page (app.js, style.css)
Re-read the round 41 note that said hiding the header while browsing *another* site's content is technically impossible (that still stands — see below). But browsing **MangaFlow's own search results and start page** is a different story: that content lives in `#viewport`, which is MangaFlow's own element and fires normal scroll events MangaFlow can read. **Added:** the header now hides on scroll-down and reappears on scroll-up while looking at MangaFlow's own start page / search results, the same behaviour reading mode's header already had. It is reset to visible automatically the moment you navigate anywhere else, so it can never get stuck hidden on a different screen.
**Still not possible:** hiding the header while an *external* site is open inside the mini-browser iframe. That site's scrolling happens inside its own separate document, which MangaFlow cannot read (a different website) and whose JavaScript is completely blocked by design (`script-src 'none'`, a core security rule since round 8) — so there is no signal, from either side, that could ever reach MangaFlow. This is a hard technical wall of the current proxy design, not an oversight.

### 3. Re-confirmed: Export button + date filter code from round 41 is correct and already deployed
Re-checked both pieces of code line by line again: the Export button's `line-height:1` fix and the date filter's dual `input`/`change` handling are both syntactically valid and present in the pushed commit. Given finding #1 above, the most likely explanation for these "still" not working is that the phone was running cached code from before round 40/41 ever reached it. Please re-test after the one-time cache clear mentioned in #1 — if either one is still visibly wrong after that, a fresh screenshot showing the current (round 42) state would help pin down anything genuinely still open, the same way it did for the original Export-button report.

---

## How to Improve Further

### Translation quality
- Run a real translation API (DeepL, Google Translate) instead of on-device — better for long sentences
- Cache translations so re-opening a chapter is instant
- Let the user edit individual bubble translations

### PDF export
- Pre-translate all pages before the download starts (currently only translated pages get overlays)
- Support multi-column text reflowing
- Let the user choose font size

### Chapter loading
- Cache the chapter list in localStorage so it loads instantly on revisit
- Show a progress bar during `morePages()` pagination

### History / Cloud
- Add per-chapter progress (page number saved, not just "read")
- Add a "currently reading" shelf separate from history
- Show reading streaks / stats

### Accounts Worker
- PBKDF2 instead of SHA-256 for code hashing (needs paid Workers plan for more CPU)
- E-mail recovery option
- Cron Trigger to auto-delete old history rows daily
- Per-day reading chart for the admin

---

## Security Notes

- **keepAwake**: Always resets to `false` on page load. Never persists across reloads.
- **Tokens**: 30-day expiry. Stored in D1. Cleaned up on each login.
- **Code hashing**: SHA-256(PEPPER + salt + user + code). Never the raw code.
- **Fail lock**: 5 wrong tries → 15-minute lockout per username.
- **CORS**: Set `ALLOWED_ORIGINS` in the Worker to your GitHub Pages URL.
- **CSP (index.html)**: `script-src 'self' 'wasm-unsafe-eval'` — no inline scripts, no CDN.

---

## Continuing Development with Claude

Paste this file at the start of a new session to give Claude full context. Then describe what you want to fix or add. Claude will read this history and continue from Round 43.

**Files to always include in context when asking Claude:**
- `app.js` — main logic
- `translate.js` — translation overlay
- `profiles.js` — profile + history UI
- `accounts-worker.js` — cloud backend
- This `MANGAFLOW.md`

**Useful starting prompt:**
> "Here is MANGAFLOW.md (Round 43). I want to [describe your request]. The files are attached."
