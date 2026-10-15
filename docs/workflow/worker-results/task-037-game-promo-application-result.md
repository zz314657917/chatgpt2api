### DONE: task-037-game-promo-application

Generator implementation is READY for main-controller review and independent browser QA. This is not final acceptance or live AI validation.

Implemented independent full-width application materials: four factual inputs and editable application-copy outputs, field copying, combined TXT, separate copy history/raw responses/prompt snapshots/result fingerprints, explicit copy confirmation, Chinese headline/subtitle validation, independent banner history/selection/correction/upload/crop and exact 1082×300 PNG/JPEG export.

Application tasks reuse existing chat/image creation-task children, authenticated original references, model capability/settings helpers and current scoped polling. Each task/version ID is persisted under the existing Web Lock before POST. The final storage-lock check revalidates account, project existence, input fingerprint, selected task authority and unmount signal. Uncertain submissions stay query-only. Task outcomes update only their originating scoped project; changed inputs/drafts preserve late copy results in history without replacing edits. Missing weekly facts use the persisted submission snapshot and stay explicitly unprovided. Original batch and application work share the project working guard. Clone clears application task IDs, active statuses, confirmation and visual-inspection authority.

Original DESIGNS/SLOTS and ZIP16 are unchanged. Sidebar, masonry, crop preview, export helpers and model-size helpers are unchanged. The application image preview and export reuse the original shared crop geometry. Export measures the actual Blob and rejects sizes above 10,000,000 bytes. Mandatory human inspection is bound to selected version/source/crop and is revalidated after asynchronous image encoding before download. The UI explicitly states that AI can err and does not claim OCR validation.

Actual modified source manifest (SHA-256):

| Path | SHA-256 |
| --- | --- |
| `web/src/app/game-promo/page.tsx` | `C3A396D1DA8FF4165EEBEBD9B67AC742098A93F8FC47AE23A97842EF913277A8` |
| `web/src/app/game-promo/application-panel.tsx` | `03B90CD276B87773EB130ED24AE1977A38177906D731E93D76E20F7B299A9C9A` |
| `web/src/lib/game-promo/application.ts` | `B251B03097EAD201E903030A085D39C27E08872EBCB3E287FF18008B87548CD5` |
| `web/src/lib/game-promo/application.test.ts` | `4613812CEF65E09FBDBBD996945C7B3D21D11F1CC4CC5C4988482DD8B1A45DB4` |
| `web/src/lib/game-promo/tasks.ts` | `34154D77B28FB02E809D60839AFA39147ADE55E28BD35FF765ADC981DE32CE0F` |
| `web/src/lib/game-promo/batch.ts` | `45C623AD341DDC521FDE6DB9D31BEDB9CCB391052DB76E13F9D32B67B2E22101` |
| `web/src/lib/game-promo/core.ts` | `B213338FEAD3364137EDC0005B86109894B04A0CB6927A702929531A56073FEF` |
| `web/src/store/game-promo-projects.ts` | `0EB7536E330D3B7CE42A96DC4623EDD56D8CE012B1843B2F85D0F1868C438485` |

Executed commands on final source:

```powershell
cd F:/java/chatgpt2api/web
$env:PATH = 'D:/nobe;' + $env:PATH
& D:/nobe/npm.cmd run build
& D:/nobe/npm.cmd run lint
& D:/nobe/node.exe --input-type=module -e "import { createServer } from 'vite'; const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' }); try { const tests = await server.ssrLoadModule('/src/lib/game-promo/application.test.ts'); const batch = await server.ssrLoadModule('/src/lib/game-promo/batch.test.ts'); console.log(JSON.stringify({ application: tests.runPromoApplicationAssertions(), batch: batch.runPromoBatchAssertions() })); } finally { await server.close(); }"
```

Results:

- Build PASS. TypeScript, Vite and compression completed; 65 assets precompressed. Existing npm configuration warning and bundle-size warning remain.
- Lint PASS: zero errors; two existing exhaustive-deps warnings in `web/src/app/beads/upstream/workspace-canvas.tsx`.
- Focused pure assertions PASS: application 26 checks; existing batch 31 checks.
- Compared the five modified existing files against their `.before` backups under `.codex-build/task-037-game-promo-application`; changes are scoped to this contract.
- All 14 paths from `protected-baseline.json` retain exact SHA-256.
- Existing listeners retained: 5173 PID 65516, 18737 PID 22412.
- The only authored non-source output is this allowed worker result. Build generated ignored frontend dist artifacts as required by the acceptance command.

No dependencies installed, no paid generation, platform request/submission, commit, push, deployment, knowledge/memory mutation, QA-evidence edits or workflow-status/main-log changes. Real browser interactions, task network/count/isolation fixtures, crop/download dimensions and ZIP16 require the independent QA gate. Chinese-only image correctness remains a mandatory human visual check.
