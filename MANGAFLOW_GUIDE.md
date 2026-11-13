# MangaFlow — Options Guide (buttons, shortcuts, settings, servers, troubleshoot, fix notes)

*Core file. Keep it next to `MANGAFLOW.md` (history + code map) and `MANGAFLOW_FULL_SITE.md` (all code). A plain-text copy is `MANGAFLOW_GUIDE.txt` (same content).*
*Last updated: Round 68 — 2026-11-13*

## HOW TO KEEP THIS FILE UP TO DATE (rule for every future update)
1. Every time a button, shortcut, setting, server option, troubleshoot check or algorithm is added or changed, change its line here in the same update.
2. Every time an ERROR is fixed, put a note on that line in this form: `FIX NOTE (Round N): it used to <problem>; now <what happens>.` Keep old notes (they are the history).
3. NEVER write private things here: no server addresses of the owner, no profile names, no passwords, no keys or IDs. Use placeholders such as `<your Cloudflare proxy>`.
4. Only HTML, CSS and JavaScript are used. Nothing else is needed to run the site.

## 0. Page names (how we talk about the site)
- **Page 1** = start page (search box, recent list, Paste / clipboard list, search engine picker).
- **Page 2** = site view (a mini browser showing the outside manga page; its scripts are blocked, MangaFlow draws what it needs).
- **Page 3** = reading mode (chapters one under another, endless scroll).

## 1. Buttons
### 1.1 Top bar (Page 1 and Page 2)
| Button | What it does / how it works |
|---|---|
| Back / Forward | Moves through the pages opened inside MangaFlow (also works with the phone's own Back). FIX NOTE (Round 53): Forward after Back used to do nothing; now works. |
| Reload | Loads the current page again (clears its saved copy first). |
| Start page (home) | Goes to Page 1. |
| Address box + search pill | Paste a manga link (opens it; if chapters exist it may open reading mode) or type a name (searches with the chosen search engine). |
| Bookmark star | Adds / removes the page from bookmarks (saved in the profile). FIX NOTE (Round 41): bookmarks could be added but not removed; now removable. |
| White/Black | Switches the theme. |
| Full screen | Hides the bars; Esc leaves. |
| Settings | Opens the settings window (section 3). |
| Open on original site | Opens the real page in a new browser tab. |
| Report / Open original / Dismiss (page note) | Small note shown when a page looks wrong: send a report, open the real site, or close the note. |

### 1.2 Page 1 (start page)
| Button | What it does |
|---|---|
| Paste (clipboard icon) | Pastes the copied link or words into the box. |
| Clipboard list (arrow) | Shows the last copied links to pick from. |
| Search engine picker | Chooses which engine is used for names (Google, DuckDuckGo, etc.). |
| Google | Searches the words with Google inside MangaFlow; "google.com" opens it in a tab; Close hides the panel. |

### 1.3 Page 2 floating buttons
| Button | What it does |
|---|---|
| Reading mode (book icon, icon only) | Starts reading mode for this page. FIX NOTE (Round 56): used to show words and was too big; now a small icon. |
| Previous / Chapter list / Next (bottom bar) | MangaFlow's own chapter buttons for the site view. FIX NOTE (Round 56): sites with script-driven chapter bars (their Next/Prev did nothing here) are handled by the "button bridge" — the site's own Next / Previous / Chapters controls are recognised and made to work. FIX NOTE (Round 58): dead links like `#/next/` no longer cause an error. |

### 1.4 Reading mode (Page 3) bars and menus
| Button | What it does |
|---|---|
| Home | Leaves reading and goes to Page 1 (also cleans the address). |
| Exit (Esc) | Leaves reading mode and opens the chapter you were on. |
| Chapters (C) | Chapter list menu to jump. |
| White/Black (T) | Theme. |
| Settings | Settings; also "clear chapter cache". |
| Address box (reading) | Paste another link or type a name without leaving reading mode first. |
| Menu: Download chapters (PDF), Full screen, Free memory | PDF maker, full screen, clears the chapter cache. |
| Load earlier chapters | Loads the chapters before the first one shown. |
| Top / Previous chapter / Next chapter / End | Jump to the top, previous chapter, next chapter, end of loaded chapters. FIX NOTE (Round 53): after a key jump the header could stay hidden; now shown at the top. |
| Full screen (and Exit full screen) | Full-screen reading. FIX NOTE (Round 53): Esc in full screen used to leave reading mode; now it only leaves full screen. |
| Downloads dock (icon, minimise) | Shows running PDF downloads; they keep running when minimised. |

### 1.5 Windows
| Window | Buttons |
|---|---|
| PDF maker | From / To chapter, split, mode, Cancel, Make PDF. |
| Search pop-up | Link/name box, Paste, clipboard list. |
| Error window | Close, Troubleshoot, Copy report. |
| Human check window | Open the site, "I did it – try again", Close (for sites that ask "are you a robot"). |

## 2. Keyboard shortcuts (reading mode)
| Key | Action |
|---|---|
| Esc | Closes menus / leaves full screen / leaves reading mode (in that order). |
| N / P | Next / previous chapter. |
| T | Theme. |
| C | Chapter menu. |
| Left / Right arrows | Previous / next chapter (only when "Keys ← → change chapter" is on). |
| Home / End | Top / end of loaded chapters (hidden on purpose when the Slider or Edge add-on is on). |
| Up / Page Up at the very top | Loads earlier chapters. |
| F11 | Full screen (when the full-screen button setting is on). |
| Enter in the proxy box | Adds the proxy. |

## 3. Settings (window "Settings")
- **Reading:** page width, chapter-bar side (left/right), PDF quality, Chapter slider, Reload wheel, Keep screen awake (turns off after a reload), Open manga link straight in reading mode (auto-read), Load chapters ahead (how many), Keys ← →, Tap to scroll (top = up), Full-screen button, Top/End slider (edge).
- **Search:** Search engine, Google search ID and key (private — stored only in the browser), Test Google search, "Copy my sites for Google", Only use the engine I chose, Open search straight after Paste, add the word "manga" to Google searches. FIX NOTE (Round 47/49): the owner's own address and old key must never be written in files.
- **Translate add-on:** button on/off, language to translate into, language written on pages, engine, start automatically, Test translate.
- **Profile (accounts add-on):** Open my profile, Sync now (history, bookmarks synced to the accounts server). Tabs: My history, Bookmarks, and (admin) All profiles, Reports, Server. **Reports tab:** each report can be opened ("show report"), **Copied** (Copy button, Round 62 — copies title, user, page and the whole report; works even when the phone blocks the clipboard) or Deleted (admin). Profile names and passwords are NOT listed in any file.
- **Memory / history:** Clear a range of chapters, clear all before my chapter, automatic clearing, "Do not save my reading history", "Erase history and cache when I close this tab", Clear history & cache.
- **Servers (proxies):** list of picture/page proxies, Add, Test all, Reset to defaults (see section 4).
- **Troubleshoot:** see section 5. Reset settings puts every setting back to default.

## 4. Server options (generic — no private names)
- **Proxy server (Cloudflare Worker, `worker.js`):** `<your Cloudflare proxy>/?url={url}&ref=<page address>`. Fetches pages and pictures for MangaFlow because browsers block direct access. `&ref=` sends the chapter page as Referer so picture hosts that check it answer. Optional allow-list `ALLOWED` limits which sites it will fetch.
- **Public proxies (backup):** a few free public proxy services are tried when your own proxy fails. They cannot send a Referer.
- **Accounts server (Cloudflare Worker + D1 database, `accounts-worker.js`):** sign-in, history/bookmark sync, and receiving "Send report to server". Passwords are never shown to the page or stored in files.
- **Picture routes (reading mode):** direct → your proxy with Referer → other proxies → image resizer service; the first that works is used.
- **Hosting:** GitHub Pages (static files). Cache busting uses `?v=NN` in `index.html`; raise NN every update. FIX NOTE (Round 42): updates seemed "not to arrive" because browsers kept old files; version numbers fixed that.

## 5. Troubleshoot (Settings → Troubleshoot)
| Option | What it does |
|---|---|
| Run checks | Tests browser features, proxies, downloads and (new, Round 59) the site view: lists named problems with codes. Round 62 adds reading-mode rows `RD-LIST-SERIES-LINKS` (the chapter list holds other manga's pages) and `RD-MANY-EMPTY` (half or more chapter boxes empty). |
| Fix automatically | Clears caches, tests proxies, repairs reading-mode pictures/boxes, cancels stuck work, and runs the Site-View Doctor. If something cannot be fixed it builds the COMPLETE error report, shows it in a box and copies it. |
| Symptoms & answers | A guide of common problems with fixes. |
| Copy full report / Send report to server | The full report (includes the Page 2 detail) for you, Claude or any AI. |
| Reset settings | Back to defaults. |

**Site-View Doctor codes (Page 2):** `P2-HIDDEN` (loaded but not visible), `P2-COVER` (a cover hides the page), `P2-PLACEHOLDER` (spinner/empty slots), `P2-MISSING` (fewer pictures than the reader finder knows), `P2-FAILED` (pictures failed), `P2-STALLED` (pictures still loading after 12 s), `P2-STUCK-LOADING` (loading note that never ends), `P2-NOLIST`, `P2-NODOC`.
**Automatic algorithms (nothing to press):**
- *Visibility doctor (Round 63):* checks how each chapter picture is really drawn; un-hides it, removes "loading / JavaScript required" covers, or draws a plain strip of the chapter. Runs at 0.8, 2, 3.5 s and with the watchdog.
- *Reading speed (Round 63):* the first pictures of the current and next chapter load at once; the preloader runs more pictures in parallel on good connections and reacts on every chapter change.
- *Picture watchdog (Round 61):* after a site page appears it looks at 4, 9, 16, 28, 45, 70 s; failed pictures are restarted at once, hanging pictures after 9 s, through your proxy (with Referer), other proxies, then the same address with a changing word. From the 2nd look it also runs the quiet Doctor repair. Stops when all pictures are loaded or when you leave.
- *Placeholder rule (Round 59):* spinner pictures such as `readerarea.svg` count as EMPTY slots and are filled with the real chapter pictures (in the correct order, Round 60).
- *Chapter audit (Round 55):* detects missing/jumping chapter numbers (e.g. 1 then 22) and reports/repairs them.
- *Quiet detection (Round 60):* the check "is this a manga? open reading mode" runs in the background, shows only a small non-blocking note, and stops as soon as you touch the page.

## 6. Add-ons
*Translate algorithm (Round 65):* prepare picture → read (second black/white reading if empty) → drop unsure words → repair reading mistakes → drop noise → story order → one in-context request per page → check answer → tidy.

Chapter slider, Reload wheel, Edge (Top/End) slider, Translate, Profiles. Each can be turned off in Settings. Files: `chapter-slider.js`, `reload-wheel.js`, `edge-slider.js`, `translate.js`, `profiles.js`.

## 7. Fix notes by round (what was broken → what happens now)
- **Round 38–42:** chapter lists incomplete (all chapters now load); history delete/date filter/export on phones; keep-screen-awake stopping; header hiding too eagerly; bookmarks not removable; old files cached (version numbers added).
- **Round 43:** full audit of app, profiles, translate and style files (many small bugs fixed; see `MANGAFLOW.md`).
- **Round 45–46:** chapter errors from reports; refresh on Page 1 reopened the last chapter (now stays on Page 1); roliascan picture API.
- **Round 47/49:** sign-in problems fixed; owner's server address removed from visible text.
- **Round 50–52:** Page 2 chapter pages show all pictures; hotlink-protected pictures load through the proxy with Referer; stuck/empty chapter boxes recovered.
- **Round 53:** whole-site audit of every button, shortcut, setting, profile and server option (Forward, Esc in full screen, header at top fixed).
- **Round 54:** one-picture chapters accepted; false "font" warning fixed.
- **Round 55:** chapter audit — no silent jump from chapter 1 to 22.
- **Round 56:** icon-only Reading button; button bridge for script-driven chapter bars.
- **Round 57–58:** "Page 2 keeps loading"; chapter list 1..N; dead `#/next/` links.
- **Round 59:** Page 2 showed only a spinner (placeholder pictures were counted as real) → fixed; Site-View Doctor added to Troubleshoot with full error report.
- **Round 60:** added pages were placed after sidebar thumbnails → correct order; the "working" note covered the whole screen and blocked the site → small non-blocking note; detection stops when you touch the page.
- **Round 61:** some Page 2 pictures hung until "Fix automatically" was pressed → picture watchdog does it automatically; this guide added.
- **Round 62:** a "Related Series" box (links to OTHER manga labelled "Chapter 74") was read as the chapter list, so reading mode showed 8 empty "chapters" and the pop-up named chapters that never existed → such series-page links are now ignored, the real series page is found (also for names ending in -2 or -chapter-14), and chapters written in two address styles are joined into one list. Profile → Reports got a Copy button.
- **Round 63:** script-built sites (Next.js, e.g. drakecomic) keep the reader hidden until their own script runs, so Page 2 showed a blank page / "JavaScript Required" cover although the pictures were loaded → MangaFlow now makes them visible (and removes the cover) by itself, or draws the chapter in a plain strip; the reader name "JavaScript Required" fixed; style sheets repaired up to 24 (was 8) with a second try; pictures start sooner in reading mode.
- **Round 64:** the warning "1 style sheet could not be loaded, so the page may look plain" appeared even when the browser loaded that file fine or the site itself had no such file → such cases are no longer warned; a real failure now lists why each proxy failed.
- **Round 65:** translated words were often wrong or meaningless because the picture text was read from the raw picture (for example the word "I" read as "|") and answers were never checked → the reader now prepares the picture (grey, contrast, white-on-black turned round, small pages enlarged, second black/white reading), repairs typical reading mistakes, ignores noise, puts bubbles in story order (right-to-left for Japanese), translates the whole page in one request in context, refuses bad answers (empty / untranslated / wrong writing) and asks the next service, then tidies the text. A translator that hangs is given up after 20–40 s.
- **Round 66:** some chapters showed dozens of red "Page N could not be loaded" boxes because the site's old upload of the chapter has deleted pictures (the site's own list shows a newer copy) -> the dead-upload doctor now runs by itself while you read and skips such old copies quietly; pressing the site's own "Previous" on chapter 1 (a page that does not exist) now only shows a small note; the "pictures hidden" check no longer raises a false alarm while reading, and a spare placeholder slot is no longer reported.

- **Round 67: the site's re-uploaded chapters (chapter-3-2) were read as "chapter 3.2" and the reader then guessed a "missing" chapter 3 whose pictures are dead -> "-2" copies are now chapter 3 (no guessed dead copy); a background AutoPilot (every 10 s) now repairs ALL loaded chapters by itself (dead uploads, boxes with messages, long waits, proxies, stuck loaders, Page 2 pictures) and "Fix automatically" now also looks at the chapters ahead.

- **Round 68: the site felt slower because the new background AutoPilot asked the network up to 4x more on pages with dead pictures (measured with a profiler mock) -> it now waits for the page's own watchdog, restarts each picture at most twice, only scans when the picture situation changed and repairs at most 3 times per page.

## 8. Known open items
- Replace/revoke any old Google key that was ever shown in a report.
- Fill the proxy's `ALLOWED` list if you want to restrict it.
- Sites with strong bot checks may still need the "Human check" window.
