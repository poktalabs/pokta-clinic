import { defineConfig } from "vitest/config";

// Only the pure scheduling rules are tested: the date math is where a silent bug would book a wrong time.
export default defineConfig({ test: { include: ["src/**/*.test.ts"] } });
