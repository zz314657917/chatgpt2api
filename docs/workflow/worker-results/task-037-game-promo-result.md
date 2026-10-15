### DONE: task-037-game-promo

## Task ID
task-037-game-promo

## Changed Files
- `web/src/app/game-promo/page.tsx`
- `web/src/app/game-promo/crop-preview.tsx`
- `web/src/store/game-promo-projects.ts`
- `web/src/lib/game-promo/core.ts`
- `web/src/lib/game-promo/tasks.ts`
- `web/src/lib/game-promo/model-parameters.ts`
- `web/src/lib/game-promo/export.ts`
- `web/src/lib/game-promo/core.assert.ts`
- `web/src/lib/game-promo/run-assertions.mjs`
- `web/src/lib/zip.ts`
- `web/src/app/route-config.tsx`
- `web/src/app/app-shell.tsx`
- `web/src/components/top-nav.tsx`
- `web/src/app/ecommerce-suite/page.tsx` (only extract existing ZIP implementation and import it)
- This result report.

## Implementation
- Added `/game-promo`, lazy route, viewport workspace recognition and desktop/mobile shared navigation. Both route and `useAuthGuard` require `/image`; shared nav explicitly maps game promotion to `/image`.
- Three responsive columns contain account-scoped local projects/inputs/references, nine complete poster designs, and sixteen separately cropped publication slots.
- Explicit account scope is captured for localforage read/write operations and originating project IDs are captured before asynchronous work. Writes are serialized; reads await queued writes. Storage errors appear in the page alert.
- Account scope comes from the current verified cached/session helper, including cookie-only sessions whose key is empty and whose persisted token session is intentionally cleared. Scope still uses provider/role/subject, and submission checks the currently verified account again.
- Project create/copy/delete preserves reference originals, purpose text, copy and completed design histories, selected versions and per-slot crops. Copies clear inherited task identities and cancel unfinished copied versions. Deleting an active project does not recreate it on completion.
- Original PNG/JPEG/WebP multi-upload and paginated managed-image library are supported. Library selection requires `detail.url` and authenticated original blobs; previews are never substituted for originals. Reference counts reserve one approved hero slot, with explicit rejection rather than truncation.
- Copy tasks use `/api/creation-tasks/chat-completions`, trusted facts/activity and strict JSON validation. Titles, selling points and all five carousel themes/copy are editable. Input/copy changes revoke confirmations; late stale copy results are preserved visibly without overwriting edited inputs. Copy history and original responses are inspectable.
- Hero is generated first and requires explicit version approval. Generation of missing eight designs checks approval again in the submission layer, uses `n=1` per task and never replaces prior versions. Individual correction prompts, uploaded replacements, history selection and task cancellation are supported.
- Uses current model catalog and an existing known reference-capability profile, model settings UI and task-field helpers. Unavailable current models are explicitly shown as disabled selections with explanatory errors. Grok/Seedream/GPT Image 2.5/official parameters reuse existing normalizers. Banner uses model-supported ratio rather than 1082x300; safe vertical crop area is calculated from actual request ratio (Grok 49%, official 64%, with further text margins).
- Tasks get persisted identities before submission. Module locks and persisted active states prevent duplicate submissions. Ambiguous submission failures remain queryable until server response/missing timeout; no automatic resubmission. Refresh and project switches poll saved identities, including tasks from nonselected projects. One abortable recursive polling loop replaces intervals.
- Terminal task outcomes are immutable for the same version: late POST active responses and repeated success responses cannot regress finished images or reapply copy. Active progress also cannot regress running to queued/submitting. Polling checks cancellation after every asynchronous read/fetch and within queued result mutations, so stopped loops cannot apply late fetched results.
- Real Canvas PNG/JPEG exports use authenticated original source pixels and cover-crop without stretching. Preview and export share `cropGeometry` and `drawPromoCrop`; slot drag and zoom persist independently. Preview supports fitted and actual-pixel modes. Transient object URLs are revoked.
- ZIP extraction retains the existing ecommerce ZIP algorithm; each completed slot has a unique slot ID/name/dimensions filename. Partial ZIP count and missing slot names are visible; complete ZIP contains exactly sixteen entries.

## Commands Run
Executed from `E:/codex-worktrees/chatgpt2api/task-037-game-promo/web`:

1. `npm.cmd run build` — PASS (TypeScript, Vite and compress-dist completed). Existing Vite large vendor-three chunk warning and npm enable-pre-post-scripts configuration warnings remain.
2. `npm.cmd run lint` — PASS, zero errors. Two pre-existing `react-hooks/exhaustive-deps` warnings in `src/app/beads/upstream/workspace-canvas.tsx` remain.
3. `node src/lib/game-promo/run-assertions.mjs` — PASS: exact slot mapping, nine designs, sixteen unique slots, seven sizes, crop bounds/aspect/no stretch, JSON malformed/five-theme parser, copy/hero lifecycle gates, text-only image failure, cancellation, task-identity cleanup in copies, legal model parameters, calculated banner safe area, ZIP16 central-directory entry count.
4. `git diff --check` — PASS. Git emits only normal LF-to-CRLF informational warnings for the minimally changed ecommerce file.

The missing worktree node_modules directory was supplied as an authorized directory junction to `F:/java/chatgpt2api/web/node_modules`; no dependencies were installed and package manifests were untouched.

## Risks / Unverified Runtime
- No paid image or chat generation was called. Real provider quality, cost, generated text legibility and runtime authenticated creation-task behavior require parent-owned browser/live acceptance.
- Browser interaction, decoded final export pixels, ZIP file-image dimensions, account/project switching during real requests and mobile layout still require the parent's prepared UI harness. Pure assertions are not equivalent to that acceptance.
- Existing backend independent redirect behavior does not enumerate this new route. Backend changes are forbidden by the contract; the frontend route and API auth boundaries remain in place.
- Current supported model selection intentionally comes from enabled catalog items intersected with existing known reference profiles. Empty/unavailable catalogs are visibly explained, not supplemented with invented models.
- Browser localforage stores original uploaded/reference data URLs, which may reach browser quota with many large histories. Quota failures surface as page alerts; no references or history are silently truncated.

## Contract Compliance
- All authored business source files are inside the allowed frontend paths. Only existing ZIP helper extraction touches ecommerce.
- The required frontend build generated ignored `internal/web/dist` artifacts through the repository's standard build command; no backend source or deployment file was edited.
- No dependencies, backend/auth catalog/protocol changes, commits, pushes, deployment, global memory changes, paid generation, old runner startup or further delegation.
- Main worktree dirty knowledge files were not edited.
- Developer implementation and local checks are ready for independent parent review and browser acceptance.
