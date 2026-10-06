import { defineConfig } from "tsup";

// Bundle the shared FHIR package (TypeScript source) into the server build.
export default defineConfig({
  entry: ["src/server.ts"],
  format: ["esm"],
  target: "node22",
  clean: true,
  noExternal: ["@pokta-clinic/fhir"],
});
