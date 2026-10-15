### DONE: task-037-game-promo-sidebar

## Changed files

- `web/src/app/game-promo/project-sidebar.tsx`: dedicated project rail and mobile drawer using existing Button, Input and Radix Dialog primitives.
- `web/src/app/game-promo/page.tsx`: connect project selection/create/copy/delete/rename and separate project management from game facts, settings and reference inputs; responsive workspace layout.
- `web/src/app/animated-routes.tsx`: approved QA amendment, add `/game-promo` to the existing viewport workspace predicate only.
- `docs/workflow/worker-results/task-037-game-promo-sidebar-result.md`: this report.

## UI behavior

- Desktop rail defaults to 68px collapsed, expands to 276px on hover and scrolls its project list independently.
- Folder button explicitly pins expansion; collapse button explicitly collapses. Only these explicit choices write `chatgpt2api.game-promo.project-rail-collapsed`; hover does not persist.
- Expanded cards show title, completed designs out of nine, reference count, copy confirmation and updated date. Selection is highlighted; create, copy, rename and delete are available.
- Inline rename uses the existing project update API; Enter/blur saves, Escape cancels. Because title is also the game name, changed titles reset the existing copy/hero confirmation gates, matching the facts editor's behavior.
- Deletion requires the existing browser confirmation before mutation. Deleting the last project atomically replaces it with an empty project; deleting another project leaves the selected project unchanged.
- Collapsed card controls are unmounted rather than only transparent, preventing hidden Tab targets. Hover expansion stays open while focus remains inside; explicit collapse restores focus to the folder button.
- Below 1024px a Radix Dialog drawer provides focus trapping, Escape dismissal and trigger focus restoration. Selecting, creating or copying closes the drawer.
- Inputs remain inside the workspace regardless of rail state. Container-based one/two/three-column layouts respond to available workspace width, with `minmax(0,1fr)` and `min-w-0` preventing large content from imposing a wider grid. Export slots remain all sixteen.
- No canvas runtime import, project schema/store edits, dependencies, preview process changes, generation, deployment, commit or push.

## Commands run

- `cd web; npm.cmd run build`: PASS, including TypeScript, Vite and asset compression. Existing npm configuration and chunk size warnings remain.
- `cd web; npm.cmd run lint`: PASS, 0 errors and the existing 2 `beads/upstream/workspace-canvas.tsx` dependency warnings.
- `node web/src/lib/game-promo/run-assertions.mjs` from repository root: FAILED because the existing runner resolves `/src/lib/game-promo/core.assert.ts` against the current working directory.
- `cd web; node src/lib/game-promo/run-assertions.mjs`: PASS for mapping, crop geometry, draft parser, lifecycle, model parameters and ZIP16.
- `git diff --check -- web/src/app/game-promo`: PASS. Since this directory is currently untracked, additionally ran `git diff --no-index --check -- .codex-build/task-037-game-promo-sidebar/page-before.tsx web/src/app/game-promo/page.tsx`: no whitespace findings; only Windows line-ending notices.
- Read-only Node check of emitted CSS: PASS for `container-type:inline-size` and the 760px/1060px/1160px container layout rules.

## Risks and unverified acceptance

- Independent QA/parent still owns real browser verification at 390px, 768px, 1280px and 1440px, persistence across refresh, keyboard focus, hover/pin interactions, drawer operation, CRUD and reference editing.
- Build and pure assertions are not browser or live-generation acceptance. No paid or authenticated upstream generation was invoked.
- Local storage can be unavailable; then explicit preferences remain for the current session and cannot persist across refresh.
- Existing unrelated dirty worktree paths were preserved. The normal approved build generated ignored embedded assets; no backend source was edited.

## Contract compliance

- Source edits are limited to the two allowed game-promo page/sidebar files and the one-line route predicate authorized by the QA fix amendment; the only added documentation is this allowed worker result.
- Reused existing clone/update/mutation semantics; task recovery, history, identity scope, generation gates and export helpers remain unchanged.
- No knowledge candidates.

## QA fix amendment (2026-10-15)

- QA found that a sixteen-project list and workspace grew to 4906px, preventing independent scrolling. `AppShell` already identified `/game-promo` as a viewport workspace, but `AnimatedRoutes` omitted the route, so its wrapper could grow with content.
- After reading the amended approved contract and independent amendment review, added only `pathname === "/game-promo"` to `isViewportWorkspacePage` in `web/src/app/animated-routes.tsx`. This gives the existing wrapper its `min-h-0 flex-1 overflow-hidden` behavior. No viewport-height workaround or other source changes were introduced.
- Source fix is available to the running Vite preview via normal HMR; no process was stopped or started.
- Re-ran `cd web; npm.cmd run build`: PASS; existing npm/chunk warnings remain.
- Re-ran `cd web; npm.cmd run lint`: PASS, 0 errors and the same 2 existing beads warnings.
- Re-ran `cd web; node src/lib/game-promo/run-assertions.mjs`: PASS.
- Re-ran `git diff --check -- web/src/app/game-promo web/src/app/animated-routes.tsx` and the `animated-routes-before.tsx` scratch comparison with `git diff --no-index --check`: PASS, only Windows line-ending notices. Reviewed tracked route diff and confirmed its sole change is this predicate addition.
- Independent QA must still retest a long project list, independent rail wheel scrolling, normal workspace wheel scrolling to the final slot, and responsive geometry.

## Document overflow fix (2026-10-15)

- Parent independently reproduced a second overflow source: absolutely positioned `sr-only` file inputs used `BODY` as their offset parent and extended document height beyond the viewport, allowing blank-page overscroll after the workspace reached its bottom.
- Parent's browser-only diagnostic changed root `main` positioning to `relative` and observed the offset parent become `MAIN`, with document height returning to viewport height. Following this explicit authorization, added only `relative` to the game-promo root `main` class in `page.tsx`; no global styles, body scroll lock or other source edits.
- The source fix is available via Vite HMR. Independent QA owns the final extra-wheel verification of `scrollY=0` and document height matching viewport height.
- Re-ran frontend build including asset compression: PASS, exit 0. The command emitted a nonfatal Windows npm-prefix `CALL` invocation message before successfully running TypeScript/Vite/compression, plus the existing npm configuration/chunk warnings.
- Re-ran frontend lint: PASS, 0 errors and the existing 2 beads warnings.
- Re-ran tracked `git diff --check` and the original-page `--no-index --check` comparison: no whitespace findings; only Windows line-ending notices. The no-index comparison returns its normal difference exit code because the page changed.
- Core logic remains untouched; the scoped game-promo assertions passed immediately before this positioning-only fix and were not repeated.
