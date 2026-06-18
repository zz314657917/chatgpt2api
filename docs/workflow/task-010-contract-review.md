### PASS: task-010-ecommerce-production-delivery

# Contract Review

- Scope is limited to Ecommerce production delivery UX and existing frontend API use.
- Denied paths exclude database schema, deploy config, production secrets, Sub2API payment/login/charge protocol, and upstream 502 repair.
- ZIP download must be implemented without adding dependencies.
- Text asset and image collection actions must reuse existing `/api/text-assets` and `/api/image-collections` endpoints.
- Acceptance commands are executable in the current repo: `npm run lint`, `npm run build`, and `go test ./...`.

# Notes

- This Sprint intentionally treats the user's real-account image generation success as context, not as a substitute for local QA evidence.
- Results without managed image `path` cannot be assigned to backend image collections; implementation should report skipped items rather than pretending they were archived.
