### PASS: task-037-game-promo-split-qa

## Result

The game-promo editor and preview remain side by side on desktop at a 60:40 width split, with independent scrolling. Repeated placement sizes now share one preview card, reducing the gallery from 16 cards to 12; the five carousel images remain separate. At 768px and 390px, the panes stack in one bounded workspace; the editor is not overlapped by preview content.

## Executed checks

- `node docs/workflow/evidence/task-037-game-promo-split/browser-split.cjs`: PASS, five browser groups.
- Desktop at 1440px and 1920px with the project rail expanded and collapsed: 60:40 editor/preview geometry, independent wheel scrolling, one application control owner, and no horizontal document overflow.
- Preview gallery: 12 cards, three shared-size groups, and five separately named carousel cards.
- Right-side design images and crop canvases open in the shared image lightbox on click; the lightbox close control works without changing crop or export state.
- Narrow layouts at 768px and 390px: editor precedes preview, workspace wheel scrolls, document height remains bounded to the viewport, no horizontal overflow, and Playwright trial click plus `elementFromPoint` confirm the application-copy button is reachable after scrolling to the gallery.
- Application banner export: PNG, 1082×300, 8,513 bytes.
- Existing full export: ZIP contains exactly 16 PNGs with the expected names and per-slot pixel dimensions.
- Mocked generation flow submits one application-copy request. Browser console errors and unknown API calls: none.
- `cd web; npm.cmd run build`: PASS, including typecheck and dist compression.
- `cd web; npm.cmd run lint`: PASS, zero errors; two existing dependency warnings in `beads/upstream/workspace-canvas.tsx`.
- `cd web; node src/lib/game-promo/run-assertions.mjs`: PASS, mapping, crop geometry, draft parser, lifecycle, model parameters, and ZIP16.
- `git diff --check`: PASS.

## Evidence

- Browser metrics, request log and export checks: `docs/workflow/evidence/task-037-game-promo-split/browser-results.json`.
- Screenshots: `desktop-1440-expanded.png`, `desktop-1440-collapsed.png`, `desktop-1920-expanded.png`, `desktop-1920-collapsed.png`, `desktop-gallery-size-groups.png`, `mobile-768.png`, `mobile-390.png`.
- Export samples: `application-banner.png`, `original-full-16.zip`.
- Final page SHA-256: recorded in `source-manifest.json`.
- Application panel SHA-256: `A5E1D83A46B76D5AD83C8885151CB3F0CFDBCFCD86C630F5EAF9DD69B22DE3D9`.

## Limitations

Browser requests used the isolated local mock transport; no live or paid AI generation was performed. This verifies layout and existing export behavior, not the visual quality of upstream generated art.
