# MANGAFLOW — Project Reference & Build History
*GitHub Pages site: https://dharmadr.github.io/Mangat1/*
*Cloudflare Worker: accounts-worker.js (mangaflow-accounts.YOURNAME.workers.dev)*
*Last updated: Round 41 — 2026-11-06*

---

## What is MangaFlow?

MangaFlow is a **static website** you host for free on GitHub Pages. It lets you read manga from many different manga sites (like MangaDex, Cubari, ArenaScan, etc.) inside one clean reader, with:

- Cloud profile system (sign-in with a 6-digit code, history/bookmarks saved to Cloudflare D1)
- Translation overlay (OCR + AI translate — bubbles are detected, text replaced in-place)
- PDF export (download a chapter as a PDF, with translated text overlaid when translate is ON)
- Keep-screen-awake toggle for reading without the screen dimming
- Bookmark / "continue reading" / recent pages saved to your cloud profile
- Admin panel (see all users, their history, bug reports)

---

## File Structure

| File | Purpose |
|------|---------|
| `index.html` | The page shell. Loads CSS and all JS. CSP header lives here. |
| `style.css` | All visual styling. Dark/light theme. |
| `app.js` | Main app — navigation, chapter fetching, PDF download, settings, wake lock. |
| `translate.js` | OCR + translation layer — detects text bubbles, overlays translations. |
| `profiles.js` | Profile/cloud tab — sign-in, history, bookmarks, date filter, cloud sync. |
| `pdfmaker.js` | Low-level PDF builder (MangaPDF class). Used by app.js to encode images. |
| `accounts-worker.js` | Cloudflare Worker — cloud backend. D1 database. |
| `worker.js` | Cloudflare proxy Worker — proxies image fetches past CORS restrictions. |

---

## How the Code Is Connected

```
index.html
  └── loads style.css
  └── loads app.js          → uses MangaFlowTranslate (translate.js), MangaPDF (pdfmaker.js)
  └── loads translate.js    → exposes window.MangaFlowTranslate { el, report, getPageData, ... }
  └── loads profiles.js     → exposes window.MangaFlowProfiles { open }
  └── loads pdfmaker.js     → exposes window.MangaPDF
```

The **Cloudflare Worker proxy** (`worker.js`) is deployed separately — it fetches manga images and pages from other sites and re-serves them with the right CORS headers so the browser will load them. Without it, most manga sites refuse direct image requests from GitHub Pages.

The **accounts Worker** (`accounts-worker.js`) is also deployed separately — it stores user data in a Cloudflare D1 (SQL) database: sign-in tokens, history, bookmarks, bug reports.

---

## How to Deploy / Set Up

### 1. GitHub Pages
- Fork or push to `DHARMAdr/Mangat1`
- Enable GitHub Pages from `main` branch root
- Site is live at `https://dharmadr.github.io/Mangat1/`

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

## Round-by-Round Change History (key rounds)

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
| **41** | **See full details below** |

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

Paste this file at the start of a new session to give Claude full context. Then describe what you want to fix or add. Claude will read this history and continue from Round 38.

**Files to always include in context when asking Claude:**
- `app.js` — main logic
- `translate.js` — translation overlay
- `profiles.js` — profile + history UI
- `accounts-worker.js` — cloud backend
- This `MANGAFLOW.md`

**Useful starting prompt:**
> "Here is MANGAFLOW.md (Round 38). I want to [describe your request]. The files are attached."
