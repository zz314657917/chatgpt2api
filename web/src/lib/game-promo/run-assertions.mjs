import { createServer } from "vite";
const server = await createServer({ server: { middlewareMode: true }, appType: "custom" });
try {
  await server.ssrLoadModule("/src/lib/game-promo/core.assert.ts");
} finally {
  await server.close();
}
