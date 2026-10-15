### DONE: task-037-game-promo-batch

READY for parent diff review and independent browser QA. Implemented only the approved six source paths and this report. No delegation, dependency installation, backend/API resource change, commit, push, deployment, preview-server control or live paid generation.

## Behavior

- Replaced the eight-design action with a batch panel containing a shared correction field, missing-only generation and whole-suite regeneration.
- Missing planning preserves successful selected images and excludes active design tasks. Starting either batch rejects any already active project batch/task, so existing individual work cannot overlap a new batch.
- Regeneration targets all nine designs, creates a new hero first and requires explicit approval of that exact batch hero before automatically submitting the remaining eight. Existing successful heroes also require approval for missing-only batches.
- Captured project facts, activity, original references and their purposes, draft, models and settings are persisted with batch identity, target list, correction and fingerprint. Changing captured inputs or losing confirmed copy visibly stops future submissions.
- Account-scoped storage mutations use native `navigator.locks`; batch target association and task/version creation are persisted together before reference loading or POST. A refreshed scheduler only queries associated IDs, never resubmits them.
- A second locked inspection checks stop/deletion/input invalidation and exact approved hero immediately before dispatch. It releases the storage lock before waiting for the network response.
- Dependent submissions run consecutively after hero approval while polling continues independently. Failed dependents remain associated and do not retry automatically or prevent the remaining targets; failed/cancelled heroes prevent dependent submission.
- Stop prevents future dispatch while already submitted tasks keep their existing per-card cancel action. Leaving the page or changing account aborts future scheduling. Cloning removes batch authorization and active task IDs.
- Latest progress and historical batches show completion/total, active/failed counts, correction, waiting-for-hero, terminal state and errors. Existing image versions, selection controls, sidebar, lower masonry gallery, crop/export mapping and API routes remain available.
- The existing polling missing-task rule is retained: after 120 seconds without a server task, an uncertain associated version becomes a visible error for manual retry. No automatic POST retry is introduced.
- Old projects without batch data remain usable. Native Web Locks are required by this current browser implementation; no compatibility fallback was introduced.

## Verification

Commands executed from `F:/java/chatgpt2api/web`:

```text
npm.cmd run build
npm.cmd run lint
node --input-type=module -e "import { createServer } from 'vite'; const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' }); try { const tests = await server.ssrLoadModule('/src/lib/game-promo/batch.test.ts'); console.log(JSON.stringify(tests.runPromoBatchAssertions())); } finally { await server.close(); }"
```

- Final build exit 0; final lint exit 0; assertions returned `{"checks":31,"status":"PASS"}`.
- Lint retains the two existing `react-hooks(exhaustive-deps)` warnings in beads upstream `workspace-canvas.tsx`; no new lint errors/warnings.
- Build retains the existing large-chunk warning and npm configuration warnings.
- Build/lint logs: `.codex-build/task-037-game-promo-batch/build.log` and `lint.log`.
- `git diff --check` for the four edited existing source paths exited 0.
- All 11 hashes in `.codex-build/task-037-game-promo-batch/protected-baseline.json` were recomputed and unchanged. The four before snapshots retain their original hashes below.
- Pure assertions cover missing/regeneration planning, active-design exclusion, exact new/existing hero approval, uncertain claims, hero failure/cancellation, independent dependent failure, stop, captured-input invalidation, crop/history/approval fingerprint exclusions, progress, completion, clone isolation and old projects.

## Source Manifest (SHA-256)

| Source | Final hash |
| --- | --- |
| `web/src/app/game-promo/page.tsx` | `44B12428CE857C6C8037BC32260AB51C20A8C7D94A81569E7DC099AECFE7BBA2` |
| `web/src/lib/game-promo/tasks.ts` | `DD979E3D9EE177D6A9914B47A22DF9D6AFF22C934613CD75D52CEE91DA8D7A03` |
| `web/src/lib/game-promo/core.ts` | `D0728B4E2EAD741D2AF930F0A631A68116E7F04F323A28FB3A161B8F59443667` |
| `web/src/store/game-promo-projects.ts` | `4338013AE73ABF3FC660B37E0E4F34CDA12417B1A5E6FB9C5AE5C8A7440BB044` |
| `web/src/lib/game-promo/batch.ts` | `046BA347876EEDAF6DDBB57E1F99C06CB1CE9090614423F99F9CCD61364882C3` |
| `web/src/lib/game-promo/batch.test.ts` | `AF44C6917D941FC6C6AAA838551865DD0F0B07D841A2EF786FFCB68A20CE6E46` |

Before snapshots (same directory, original four sources):

| Snapshot | Hash |
| --- | --- |
| `web_src_app_game-promo_page.tsx` | `F059E9446B43EA78DE3EE664741F19DAD85C2A4B4D3300A815E513F4EA8EAABE` |
| `web_src_lib_game-promo_tasks.ts` | `FFEDE3E5BD04F349F457CE6C18508F2B2C6938C1AA84437C9248DB694AD59CAF` |
| `web_src_lib_game-promo_core.ts` | `7207BDE31128CBB1A30325A529A9F405B84DA449D8C85E14C26A5175A20D0275` |
| `web_src_store_game-promo-projects.ts` | `364E44942AE9F563D93BFC2421E45825689F24DB6F81E1BBAACAE438DE114170` |

## Limits

This is implementation and static/pure-test evidence, not browser acceptance. Independent browser QA must still verify actual request counts, multi-tab atomic claims, refresh recovery, stop during delayed original-reference loading, account switching, deletion/unmount, correction/reference propagation, approval gating, failures and history controls. Real model generation, image quality and Chinese readability remain unverified and were not invoked. Existing services on 5173/18737 were not controlled.
