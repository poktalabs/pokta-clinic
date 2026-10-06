import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Pure logic only: scheduling rules (where a silent date bug would book a wrong time), the outbox drain,
// the webhook signature check, the admin session and the Render call order.
export default defineConfig({
  test: { include: ["src/**/*.test.ts"] },
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
});
