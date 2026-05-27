---
task_id: canvas-sprint-003-undo-redo
role: developer-worker
status: implemented
qa_mode: browser
last_verified: 2026-05-27
---

# Canvas Sprint 003 Undo Redo

## Scope

- Add a standalone TypeScript history engine for `SmartCanvasDocument` snapshots.
- Keep the module isolated to `web/src/app/canvas/canvas-history.ts`.
- Do not integrate the module into `/canvas` controller, page, node rendering, toolbar, shortcuts, or persistence code in this worker task.

## Implemented API

- `SmartCanvasHistoryState`
- `SmartCanvasHistoryOptions`
- `SmartCanvasHistoryReplaceOptions`
- `createSmartCanvasHistory`
- `pushSmartCanvasHistory`
- `undoSmartCanvasHistory`
- `redoSmartCanvasHistory`
- `replaceSmartCanvasHistoryPresent`
- `canUndoSmartCanvasHistory`
- `canRedoSmartCanvasHistory`
- `DEFAULT_SMART_CANVAS_HISTORY_LIMIT`
- `MAX_SMART_CANVAS_HISTORY_LIMIT`

## Behavior

- `createSmartCanvasHistory` initializes an empty stack and clones the optional current canvas when present.
- `pushSmartCanvasHistory` pushes the current `present` snapshot into `past`, replaces `present`, clears `future`, and ignores `undefined` or `null` canvas values.
- `undoSmartCanvasHistory` and `redoSmartCanvasHistory` move snapshots between `past`, `present`, and `future` without cloning the whole stack.
- `replaceSmartCanvasHistoryPresent` replaces the current snapshot without adding an undo step and clears redo history by default.
- Stack sizes are capped by the configured `limit`, clamped between `1` and `MAX_SMART_CANVAS_HISTORY_LIMIT`.
- Snapshot cloning is limited to the document data tree: top-level document, nodes, node position/data, edges, and viewport.

## Integration Points

- The future `/canvas` controller can keep `SmartCanvasHistoryState` beside the active `SmartCanvasDocument`.
- User-edit commits should call `pushSmartCanvasHistory(history, nextDocument)`.
- Remote refreshes or autosave metadata updates that should not create undo steps can call `replaceSmartCanvasHistoryPresent(history, nextDocument)`.
- Undo and redo commands should call `undoSmartCanvasHistory` or `redoSmartCanvasHistory`, then set the canvas document from the returned `present`.
- Toolbar buttons and keyboard shortcuts can use `canUndoSmartCanvasHistory` and `canRedoSmartCanvasHistory`.

## Acceptance Commands

- `cd web && npm.cmd run build`

## Not Integrated Risks

- No keyboard shortcut, toolbar button, or controller binding exists yet.
- The module does not decide which edits are meaningful history checkpoints; the controller must avoid pushing noisy intermediate pointer-move states unless that behavior is desired.
- The module stores full document snapshots, so very large canvases may need later tuning if memory use becomes visible in real sessions.
