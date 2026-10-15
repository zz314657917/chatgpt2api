### PASS: task-037-game-promo-sidebar-qa

## Findings

- Original P1 route-height finding fixed by developer and independently retested. At 1440×1000 with 16 projects, list `clientHeight=762`, `scrollHeight=2300`; actual wheel scroll reaches `scrollTop=1538` while workspace stays at `0`.
- Actual workspace wheel reaches the sixteenth slot with its export button inside the viewport; rail position remains unchanged.
- Eight original functional groups and four post-fix groups PASS. No outstanding finding in the approved sidebar/UI scope. Parent's final verdict remains separate.
- Parent's final source verification also confirms the hidden-upload positioning fix: document/body height stay 1000px after twelve additional 5000px wheel events, `scrollY=0`, and file inputs use MAIN as their containing block. No temporary browser styles were applied in this final run.

## Executed Checks

- `node docs/workflow/evidence/task-037-game-promo-sidebar/browser-sidebar.cjs`: eight completed groups PASS before a QA helper stopped the long-list step. The helper incorrectly required the unpinned button label when the rail was already pinned; this test helper has been corrected.
- `node docs/workflow/evidence/task-037-game-promo-sidebar/browser-scroll-retest.cjs`: actual long-list scroll assertion FAIL, reproduced twice.
- `node docs/workflow/evidence/task-037-game-promo-sidebar/browser-height-fix-retest.cjs`: four final post-fix groups PASS. Sixteen projects/nine complete images seeded only inside isolated browser storage.
- `node docs/workflow/evidence/task-037-game-promo-sidebar/browser-1280-collapsed-recheck.cjs`: PASS after parent identified the first retest's 1280 collapsed label did not match its 276px measured state. Explicit collapse, pointer outside rail, workspace input focus, and polling now confirm `data-expanded=false`, width `68`, workspace `clientWidth=scrollWidth=1149`, no control overflow. The JSON row and screenshot were replaced with this verified state; no source changes.
- Completed PASS evidence: 68/276px rail widths, hover expansion without persistence, pointer leave, pin/collapse reload preference, explicit collapse focus restoration, hidden actions excluded from Tab navigation, CRUD and active highlight, rename Enter/blur/Escape, nonselected rename/delete preserving selection, delete confirmation cancel/accept, copy selecting its new copy.
- Completed PASS evidence: demo facts/reference upload, mock copy and hero confirmation, nine designs/sixteen crop controls, upload replacement, actual 16-file ZIP download, project/reference persistence after reload with no extra task submissions.
- Completed PASS evidence: body/workspace/grid horizontal overflow measurements and control bounds at 1280/1440 in both rail states; 390/768 mobile drawer Escape, trigger focus restoration, 14 Tab movements trapped inside dialog, selection closing drawer, and horizontal bounds.
- Post-fix PASS: bounded rail/native wheel independent scroll; workspace native wheel reaching last slot; ZIP16 decoded with dimensions; all four viewport layouts, desktop both rail states, mobile drawer/slot16 wheel access. Browser errors `[]`, unknown API `[]`, task POSTs `0`.
- Developer report reviewed: build/lint/pure assertions PASS; no reason to repeat unchanged build checks. These do not prove vertical browser usability.
- Final source verification executed by parent: `$env:QA_DOC_FINAL='1'; node docs/workflow/evidence/task-037-game-promo-sidebar/browser-docscroll-diagnostic.cjs`: PASS, exit 0. This is the independent QA-authored script; the last QA agent turn encountered HTTP 524, so parent executed the prepared script and recorded the final evidence rather than dispatching a replacement model.

## Evidence

- `docs/workflow/evidence/task-037-game-promo-sidebar/browser-results.json`: consolidated final PASS.
- `docs/workflow/evidence/task-037-game-promo-sidebar/height-fix-retest-results.json`: final retest checks, bounds, ZIP dimensions.
- `docs/workflow/evidence/task-037-game-promo-sidebar/viewport1280-collapsed-recheck.json`: exact 1280/68px state and bounds.
- `docs/workflow/evidence/task-037-game-promo-sidebar/browser-results-before-height-fix.json`: preserved real pre-fix failure.
- `docs/workflow/evidence/task-037-game-promo-sidebar/browser-results-first-attempt.json`: retained initial run evidence.
- `docs/workflow/evidence/task-037-game-promo-sidebar/scroll-retest-results.json`
- `docs/workflow/evidence/task-037-game-promo-sidebar/scroll-measurement.json`
- `docs/workflow/evidence/task-037-game-promo-sidebar/desktop-scroll-diagnostic.png`: visible top cards and clipped lower list.
- `docs/workflow/evidence/task-037-game-promo-sidebar/desktop-1280-{collapsed,expanded}.png`
- `docs/workflow/evidence/task-037-game-promo-sidebar/desktop-1440-{collapsed,expanded}.png`
- `docs/workflow/evidence/task-037-game-promo-sidebar/mobile-{390,768}-{drawer,workspace}.png`
- `docs/workflow/evidence/task-037-game-promo-sidebar/island-16-slots.zip`
- Final recommended screenshot: `docs/workflow/evidence/task-037-game-promo-sidebar/fixed-desktop-1440-expanded.png`.
- Other post-fix screenshots: `fixed-desktop-{1280,1440}-{collapsed,expanded}.png`, `fixed-desktop-independent-rail-scroll.png`, `fixed-desktop-slot16-wheel-bottom.png`, `fixed-mobile-{390,768}-{drawer,workspace,slot16-bottom}.png`, all under the same evidence directory.
- Final actual export: `docs/workflow/evidence/task-037-game-promo-sidebar/height-fix-island-16-slots.zip`.
- `docs/workflow/evidence/task-037-game-promo-sidebar/absolute-upload-diagnosis.json`: parent independently measured the file-input containing-block problem.
- `docs/workflow/evidence/task-037-game-promo-sidebar/docscroll-final-source-results.json`: final source, no temporary styles; extra wheel events leave document at the viewport height and `scrollY=0`.
- `docs/workflow/evidence/task-037-game-promo-sidebar/final-desktop-workspace-top.png` and `final-docscroll-wheel-bottom.png`: screenshots from that final source run.

## Unverified Risks

- All generated image/model API results were mocked using the user's island PNG. Written facts/activity are demonstration placeholders. No live AI generation, authentic game facts, Chinese AI image readability, paid service, or production deployment was verified.
- The initial overscroll finding was resolved in the final source run. Its cause was absolute `sr-only` file inputs using BODY as their containing block; the root MAIN's `relative` class contains them. Twelve additional oversized wheel events now leave document height 1000px and `scrollY=0`.
- Mock inventory initially observed `/api/canvases` GET from global navigation. Final mock returns empty items for this unrelated navigation API; final browser page/console errors and unknown API inventory are empty.
- Only own random-port Vite processes and isolated Chromium contexts were launched and stopped. User preview on port 5173/profile was not operated.

## Recommendation

Accept the sidebar fixture/UI scope. Keep live generation outside this acceptance, and let parent independently review final screenshots/metrics.

## Root Cause and Fix Record

- Before fix: `web/src/app/animated-routes.tsx` omitted `/game-promo` from `isViewportWorkspacePage`, while `app-shell.tsx` included it. Route wrapper lacked bounded flex/overflow classes, stretching sidebar/workspace to `4906px`; list `clientHeight=scrollHeight=4754`, `scrollTop=0`.
- Approved developer fix adds `/game-promo` to the route predicate, applying `min-h-0 min-w-0 flex-1 overflow-hidden`. QA made no product source edits.
- Initial failures and screenshots remain preserved. Final actual rail and workspace wheel measurements, four viewport regression, and ZIP16 retest all PASS.
- Later parent review traced the remaining blank document overflow to hidden file inputs. Developer added only `relative` to the page root MAIN; final QA-authored source checks were executed by parent and PASS. Global styles and canvas scroll-lock behavior were not changed.
