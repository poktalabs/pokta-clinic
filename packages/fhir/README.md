# @pokta-clinic/fhir

Shared FHIR R4 contract for pokta-clinic. Both [apps/web](../../apps/web/README.md) (the client side) and [apps/mock-ehr](../../apps/mock-ehr/README.md) (the server side) import it, so the two cannot drift apart. It holds zod schemas and TypeScript types for `Patient` and `Consent`, builders, the identifier systems and the extension URLs. The package is private and exports TypeScript source directly (`"exports": { ".": "./src/index.ts" }`); there is no build step.

## Exports

Everything is re-exported from [src/index.ts](src/index.ts).

| Export | Kind | Defined in | Notes |
|---|---|---|---|
| `FHIR_VERSION` | const | [index.ts](src/index.ts) | `"4.0.1"`. |
| `OperationOutcome` | zod schema + type | [index.ts](src/index.ts) | At least one issue (severity, code, optional diagnostics). |
| `operationOutcome(code, diagnostics, severity?)` | function | [index.ts](src/index.ts) | Builds an error body. Severity defaults to `"error"`. |
| `SYSTEM` | const | [patient.ts](src/patient.ts) | Identifier systems: `curp` (`urn:mx:renapo:curp`), `folio` (`urn:pokta-clinic:expediente-demo:folio`), `clues`, `cedula`. Local URNs, because no official Mexican FHIR implementation guide exists. |
| `EXT` | const | [patient.ts](src/patient.ts) | Extension URLs: `fathersFamily` and `mothersFamily` (core R4 HumanName extensions), `sexoRenapo` and `curpValidada` (local URNs). |
| `Identifier`, `HumanName` | zod schemas | [patient.ts](src/patient.ts) | `HumanName` needs at least one `given`; the two surnames travel in `_family.extension`. |
| `Patient` | zod schema + type | [patient.ts](src/patient.ts) | Requires `name` and `telecom` (phone or email). `birthDate` is `YYYY-MM-DD`. Only the fields the demo uses. |
| `bundle(resources)` | function | [patient.ts](src/patient.ts) | Wraps resources in a `searchset` Bundle with `total`. |
| `CONVERSATION_SYSTEM` | const | [consent.ts](src/consent.ts) | `urn:elevenlabs:conversation`. The identifier system that ties a Consent to a Conversation. |
| `Consent` | zod schema + type | [consent.ts](src/consent.ts) | `provision.type` (`permit` or `deny`) carries the answer; at least one `identifier`. |
| `CONSENT_METHOD_EXT` | const | [consent.ts](src/consent.ts) | Extension URL recording how consent was given (`voice`). |
| `consentResource({ conversationId, granted, patientId?, id?, dateTime? })` | function | [consent.ts](src/consent.ts) | Builds a Consent: scope `patient-privacy`, category LOINC `59284-0`, `status` active or rejected, `provision.type` permit or deny. |

## Why `.ts` import suffixes

Files inside this package import each other as `./patient.ts` and `./consent.ts`, and [tsconfig.json](tsconfig.json) sets `allowImportingTsExtensions`. The reason: apps/web consumes this package as source, and Next 16 with Turbopack does not resolve a `./patient.js` import to `patient.ts` inside workspace packages. Writing the real `.ts` extension works for every consumer. apps/web also lists the package in `transpilePackages` in [next.config.ts](../../apps/web/next.config.ts), and apps/mock-ehr bundles it into its build with tsup (`noExternal`, see [tsup.config.ts](../../apps/mock-ehr/tsup.config.ts)). Keep the `.ts` suffix on any new relative import here.

## Adding a resource

1. Add `src/<resource>.ts` with a zod schema, the inferred type, and a builder if callers need one. Use `.ts` suffixes for relative imports.
2. Re-export it from [src/index.ts](src/index.ts) with `export * from "./<resource>.ts";`.
3. Add any new identifier system or extension URL to `SYSTEM` or `EXT` (or a new const next to the schema, as Consent does).
4. Run `pnpm typecheck` from the repo root.

`pnpm --filter @pokta-clinic/fhir typecheck` runs only this package's type check.
