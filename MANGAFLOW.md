# MANGAFLOW — Project Reference & Build History
*GitHub Pages site: https://dharmadr.github.io/Mangat1/*
*Cloudflare Worker: accounts-worker.js (mangaflow-accounts.YOURNAME.workers.dev)*
*Last updated: Round 38 — 2026-11-04*

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
| **38** | **See full details below** |

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
