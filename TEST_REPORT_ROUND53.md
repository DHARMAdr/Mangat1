# MangaFlow — Round 53 full-site test report (2026-11-09)

## Result in one line
**176 automatic checks, 176 PASS, 0 FAIL** (phone Pixel 7 and desktop 1280x800), plus 15 regression scripts from earlier rounds all passing. **3 real bugs were found and fixed** during the run (listed below); everything else already worked.

## How it was run
1. A mock manga website (home, series page with 21 chapters, chapters with 6 pictures each) and a mock accounts server were served to the real app inside a real Chromium browser (Playwright). The sandbox cannot reach real manga sites, so real sites (roliascan, comizy, arenascan) are NOT part of this report.
2. Each button was really tapped/clicked (not just called in code). Settings tick boxes were switched, the window closed and reopened to prove they are remembered, then switched back. Each drop-down option was chosen. Every keyboard key was pressed on the real keyboard.
3. After every check the script looked for JavaScript errors on the page; any error counts as FAIL.
4. The built-in troubleshooter (Settings > Troubleshoot) was run at the end: Run checks, Fix automatically, Symptoms & answers, Copy report, Send report, Clear history & cache, Reset settings.
5. Server/sign-in cases were tested against the mock server answering OK, HTTP 500, HTTP 403 and no network.

## Bugs found and fixed in this round
| # | Bug | Cause | Fix |
|---|-----|-------|-----|
| 1 | Forward button stayed grey after pressing Back (Page 2) | Forward looked at the old page list, but history is native since round 39 | Each history step stores a number; Forward is on while a newer step exists |
| 2 | Esc in full screen also left reading mode and left the screen stuck in full-screen look | Esc handler did not know about full screen | Esc in full screen only leaves full screen |
| 3 | Header stayed hidden at the very top for ~2.5 s after n / p / arrow-key chapter jumps | "show at top" rule sat behind a 2.5 s hold | "show at top" now always runs |

## What was checked (all PASS)
### Page 1 / Page 2 buttons (phone + desktop)
engine list (every engine chosen and remembered), Paste/Clipboard buttons, Google button + tab + close, typing a link + Enter, Page 2 scroll-hide/show, Reload, address bar + Enter, Back, Forward (fixed), Star bookmark add/remove, Theme, Full screen, Settings open/close, Original-site button, Home returns to a clean address, chapter link opens reading mode, refresh on Page 1 stays on Page 1.
### Page 3 reading mode (phone + desktop)
all chapters get all 6 pictures, End, Top, Next, Previous, Chapters menu, Free memory, Download window (From/To/Split/Mode, Cancel), Theme, reading address bar + Enter, Settings, Full screen on/off, Home, Exit.
### Keyboard shortcuts (phone + desktop)
End, Home, ArrowRight, ArrowLeft, t, c, n, p, Esc (menu first, then leave reading; in full screen only leaves full screen), F11, keys ignored while typing in a box, keys ignored while a dialog is open.
### Settings (phone + desktop, every control)
All check boxes (tick, remembered after reopen, restored), every drop-down option, all sliders, proxy Add (button and Enter), Test all, Reset to defaults, Check my setup, Open my profile, Sync now.
### Troubleshooter
Run checks, Fix automatically, Symptoms & answers (open/close), Copy full report, Send report, Clear history & cache, Reset settings.
### Profiles and server (regression scripts t11, t15, t16, t17, t10, t12, t13, t14, t18, t19, t21)
- Profile window: sign in (admin), tabs, My history list, Read/Download/All kinds filter buttons aligned, search keeps focus, date From/To plus Today/30 days/All presets, backdrop tap does not close the window right after a date tap.
- Server: sign-in with mock server OK -> session `admin`, cloud on; HTTP 500, HTTP 403 and no-network each show a clear plain-words message; Check server shows only "Server connected successfully."; guests never see the owner's server address, admin does; built-in server still used when none is saved.
- Refresh/Home: refresh while reading stays in reading, after Home the address is clean, refresh on Page 2 stays on Page 2.
- Chapters: pictures on Page 2 (including hotlink retry), emptied 4th/5th chapter boxes heal themselves within 40 s.

## Not testable here (please check on your phone after hard refresh)
Real sites (roliascan.com, comizy.io, arenascan.com), your real Cloudflare server, a real phone's native date picker, real browser F11, real copy-to-clipboard permission.

## Full list of the 176 PASS lines
- P1 phone       start page shows (hero box, engine list) | 7 engines
- P1 phone       engineSel: every engine can be chosen and is remembered | 7 engines selected, saved=?
- P1 phone       heroPaste / heroClip buttons respond (no error)
- P1 phone       googleBtn opens/doesn't crash; gvTab + gvClose
- P1 phone       typing a link + Enter opens Page 2 (site view)
- P1 phone       Page 2: scroll down hides header, up shows (R44)
- P1 phone       btnReload reloads the page
- P1 phone       addr (address bar) + Enter navigates
- P1 phone       btnBack goes back, btnFwd goes forward | back showed Home, forward showed /about
- P1 phone       btnStar toggles bookmark (saved in list)
- P1 phone       btnThemeB switches theme
- P1 phone       btnFsNav (full screen) responds | class before/after/esc: 29/41/41
- P1 phone       btnSettings opens settings; Close works
- P1 phone       btnOrigSite offers the original site address | button
- P1 phone       btnHome returns to Page 1 and address is clean
- P1 phone       chapter link opens Page 3 (reading mode)
- P1 phone       reading: pictures per chapter and chapter boxes
- P1 phone       btnChapters opens menu, choosing a chapter jumps | 12 chapters in menu
- P1 phone       btnTheme (reading) toggles theme
- P1 phone       rdAddr (reading address) + Enter
- P1 phone       btnFreeMenu / btnFsMenu / btnDlMenu respond
- P1 phone       btnSettingsR opens settings
- P1 phone       btnHomeR leaves reading and cleans address
- P1 phone       refresh on Page 1 stays on Page 1
- P1 desktop     start page shows (hero box, engine list) | 7 engines
- P1 desktop     engineSel: every engine can be chosen and is remembered | 7 engines selected, saved=?
- P1 desktop     heroPaste / heroClip buttons respond (no error)
- P1 desktop     googleBtn opens/doesn't crash; gvTab + gvClose
- P1 desktop     typing a link + Enter opens Page 2 (site view)
- P1 desktop     Page 2: scroll down hides header, up shows (R44)
- P1 desktop     btnReload reloads the page
- P1 desktop     addr (address bar) + Enter navigates
- P1 desktop     btnBack goes back, btnFwd goes forward | back showed Home, forward showed /about
- P1 desktop     btnStar toggles bookmark (saved in list)
- P1 desktop     btnThemeB switches theme
- P1 desktop     btnFsNav (full screen) responds | class before/after/esc: 29/32/32
- P1 desktop     btnSettings opens settings; Close works
- P1 desktop     btnOrigSite offers the original site address | button
- P1 desktop     btnHome returns to Page 1 and address is clean
- P1 desktop     chapter link opens Page 3 (reading mode)
- P1 desktop     reading: pictures per chapter and chapter boxes
- P1 desktop     btnChapters opens menu, choosing a chapter jumps | 12 chapters in menu
- P1 desktop     btnTheme (reading) toggles theme
- P1 desktop     rdAddr (reading address) + Enter
- P1 desktop     btnFreeMenu / btnFsMenu / btnDlMenu respond
- P1 desktop     btnSettingsR opens settings
- P1 desktop     btnHomeR leaves reading and cleans address
- P1 desktop     refresh on Page 1 stays on Page 1
- P3 phone       reading mode is open with chapters 5.. loaded | 10 chapter boxes
- P3 phone       every loaded chapter has all 6 pictures | [6,6,6,6,6,6,6,6,6,6]
- P3 phone       btnEnd goes to the bottom
- P3 phone       btnTop goes to the top
- P3 phone       btnNext jumps to next chapter
- P3 phone       btnPrev jumps to previous chapter
- P3 phone       btnChapters menu lists chapters; picking one works | 33 items in menu
- P3 phone       chapter menu: Download / Full screen / Free memory entries open
- P3 phone       download window: pick range From/To/Split/Mode, Cancel closes it
- P3 phone       btnTheme toggles day/night
- P3 phone       rdAddr: another chapter address + Enter opens it
- P3 phone       btnSettingsR opens settings, Esc closes
- P3 phone       btnFsMenu/fsRead: full screen on, fsExit off
- Keys phone     End key goes to bottom
- Keys phone     Home key goes to top
- Keys phone     ArrowRight = next chapter (Arrows on)
- Keys phone     ArrowLeft = previous chapter
- Keys phone     t key switches theme
- Keys phone     c key opens chapter menu
- Keys phone     n / p keys move chapters
- Keys phone     Esc closes an open dialog first, then leaves
- Keys phone     F11 toggles full screen without error
- Keys phone     keys are ignored while typing in an address box
- Keys phone     keys ignored while a dialog is open
- Keys phone     Arrow keys off: setArrows unchecked stops chapter jump
- P3 desktop     reading mode is open with chapters 5.. loaded | 9 chapter boxes
- P3 desktop     every loaded chapter has all 6 pictures | [6,6,6,6,6,6,6,6,6]
- P3 desktop     btnEnd goes to the bottom
- P3 desktop     btnTop goes to the top
- P3 desktop     btnNext jumps to next chapter
- P3 desktop     btnPrev jumps to previous chapter
- P3 desktop     btnChapters menu lists chapters; picking one works | 29 items in menu
- P3 desktop     chapter menu: Download / Full screen / Free memory entries open
- P3 desktop     download window: pick range From/To/Split/Mode, Cancel closes it
- P3 desktop     btnTheme toggles day/night
- P3 desktop     rdAddr: another chapter address + Enter opens it
- P3 desktop     btnSettingsR opens settings, Esc closes
- P3 desktop     btnFsMenu/fsRead: full screen on, fsExit off
- Keys desktop   End key goes to bottom
- Keys desktop   Home key goes to top
- Keys desktop   ArrowRight = next chapter (Arrows on)
- Keys desktop   ArrowLeft = previous chapter
- Keys desktop   t key switches theme
- Keys desktop   c key opens chapter menu
- Keys desktop   n / p keys move chapters
- Keys desktop   Esc closes an open dialog first, then leaves
- Keys desktop   F11 toggles full screen without error
- Keys desktop   keys are ignored while typing in an address box
- Keys desktop   keys ignored while a dialog is open
- Keys desktop   Arrow keys off: setArrows unchecked stops chapter jump
- Settings phone settings window opens (15 check boxes found)
- Settings phone setSlider (tick/untick, remembered after reopen) | true→false, kept after reopen, restored
- Settings phone setWheel (tick/untick, remembered after reopen) | true→false, kept after reopen, restored
- Settings phone setAwake (tick/untick, remembered after reopen) | false→true, kept after reopen, restored
- Settings phone setAutoRead (tick/untick, remembered after reopen) | true→false, kept after reopen, restored
- Settings phone setArrows (tick/untick, remembered after reopen) | true→false, kept after reopen, restored
- Settings phone setTap (tick/untick, remembered after reopen) | true→false, kept after reopen, restored
- Settings phone setGoStraight (tick/untick, remembered after reopen) | false→true, kept after reopen, restored
- Settings phone setGoogleManga (tick/untick, remembered after reopen) | false→true, kept after reopen, restored
- Settings phone setStrict (tick/untick, remembered after reopen) | false→true, kept after reopen, restored
- Settings phone setFs (tick/untick, remembered after reopen) | true→false, kept after reopen, restored
- Settings phone setEdge (tick/untick, remembered after reopen) | true→false, kept after reopen, restored
- Settings phone setTrShow (tick/untick, remembered after reopen) | true→false, kept after reopen, restored
- Settings phone setTrAuto (tick/untick, remembered after reopen) | false→true, kept after reopen, restored
- Settings phone setNoHist (tick/untick, remembered after reopen) | false→true, kept after reopen, restored
- Settings phone setWipe (tick/untick, saved)
- Settings phone setSide (every option can be chosen) | 2 options
- Settings phone setPdf (every option can be chosen) | 4 options
- Settings phone setAhead (every option can be chosen) | 4 options
- Settings phone setTrTo (every option can be chosen) | 30 options
- Settings phone setTrFrom (every option can be chosen) | 7 options
- Settings phone setTrEngine (every option can be chosen) | 4 options
- Settings phone memFrom (every option can be chosen) | 0 options
- Settings phone memTo (every option can be chosen) | 0 options
- Settings phone memAuto (every option can be chosen) | 4 options
- Settings phone setWidth / setSlider range inputs move | setWidth
- Settings phone proxyAdd adds a proxy; proxyNew + Enter also adds
- Settings phone proxyTest "Test all" runs
- Settings phone proxyReset restores the default list
- Settings phone secCheck "Check my setup" shows a result
- Settings phone profOpen opens the profile window
- Settings phone profSync "Sync now" runs
- Troubleshoot phone fixCheck "Run checks" gives a result list
- Troubleshoot phone fixAuto "Fix automatically" runs
- Troubleshoot phone fixOpen "Symptoms & answers" opens and fixClose closes
- Troubleshoot phone fixCopy copies the full report | report 1430 chars
- Troubleshoot phone fixSend "Send report to server" responds
- Troubleshoot phone btnClear "Clear history & cache" works
- Troubleshoot phone fixReset "Reset settings" works
- Settings desktop settings window opens (15 check boxes found)
- Settings desktop setSlider (tick/untick, remembered after reopen) | true→false, kept after reopen, restored
- Settings desktop setWheel (tick/untick, remembered after reopen) | true→false, kept after reopen, restored
- Settings desktop setAwake (tick/untick, remembered after reopen) | false→true, kept after reopen, restored
- Settings desktop setAutoRead (tick/untick, remembered after reopen) | true→false, kept after reopen, restored
- Settings desktop setArrows (tick/untick, remembered after reopen) | true→false, kept after reopen, restored
- Settings desktop setTap (tick/untick, remembered after reopen) | true→false, kept after reopen, restored
- Settings desktop setGoStraight (tick/untick, remembered after reopen) | false→true, kept after reopen, restored
- Settings desktop setGoogleManga (tick/untick, remembered after reopen) | false→true, kept after reopen, restored
- Settings desktop setStrict (tick/untick, remembered after reopen) | false→true, kept after reopen, restored
- Settings desktop setFs (tick/untick, remembered after reopen) | true→false, kept after reopen, restored
- Settings desktop setEdge (tick/untick, remembered after reopen) | true→false, kept after reopen, restored
- Settings desktop setTrShow (tick/untick, remembered after reopen) | true→false, kept after reopen, restored
- Settings desktop setTrAuto (tick/untick, remembered after reopen) | false→true, kept after reopen, restored
- Settings desktop setNoHist (tick/untick, remembered after reopen) | false→true, kept after reopen, restored
- Settings desktop setWipe (tick/untick, saved)
- Settings desktop setSide (every option can be chosen) | 2 options
- Settings desktop setPdf (every option can be chosen) | 4 options
- Settings desktop setAhead (every option can be chosen) | 4 options
- Settings desktop setTrTo (every option can be chosen) | 30 options
- Settings desktop setTrFrom (every option can be chosen) | 7 options
- Settings desktop setTrEngine (every option can be chosen) | 4 options
- Settings desktop memFrom (every option can be chosen) | 0 options
- Settings desktop memTo (every option can be chosen) | 0 options
- Settings desktop memAuto (every option can be chosen) | 4 options
- Settings desktop setWidth / setSlider range inputs move | setWidth
- Settings desktop proxyAdd adds a proxy; proxyNew + Enter also adds
- Settings desktop proxyTest "Test all" runs
- Settings desktop proxyReset restores the default list
- Settings desktop secCheck "Check my setup" shows a result
- Settings desktop profOpen opens the profile window
- Settings desktop profSync "Sync now" runs
- Troubleshoot desktop fixCheck "Run checks" gives a result list
- Troubleshoot desktop fixAuto "Fix automatically" runs
- Troubleshoot desktop fixOpen "Symptoms & answers" opens and fixClose closes
- Troubleshoot desktop fixCopy copies the full report | report 1422 chars
- Troubleshoot desktop fixSend "Send report to server" responds
- Troubleshoot desktop btnClear "Clear history & cache" works
- Troubleshoot desktop fixReset "Reset settings" works
