# apps/web

Next.js 16 app (deployed on Vercel). Today it has no real UI: [src/app/page.tsx](src/app/page.tsx) is still the create-next-app placeholder. Its job is to host the server tool endpoints that the ElevenLabs agent calls during a Conversation, and to translate them into FHIR calls on the EHR through an `EhrAdapter`. A planned live page and post-call webhook would also live here.

Read [AGENTS.md](AGENTS.md) before writing Next code: this Next version has breaking changes, and the docs ship in `node_modules/next/dist/docs/`.

## Tool endpoints

Each endpoint is a `POST` route in `src/app/api/tools/<name>/route.ts`, built with the `tool()` wrapper. Every body needs `conversation_id` (the ElevenLabs `system__conversation_id`, 1 to 200 chars). Every response body includes a `message` for the LLM.

| Path | Input fields | Outputs | Consent rule |
|---|---|---|---|
| `/api/tools/record_consent` ([route](src/app/api/tools/record_consent/route.ts)) | `conversation_id`, `granted` (boolean) | `consent_id`, `granted`, `message` (continue, or stop collecting data on refusal) | None: this is how Consent is created. Each call writes a new Consent. |
| `/api/tools/find_patient` ([route](src/app/api/tools/find_patient/route.ts)) | `conversation_id`, `phone` (1 to 30 chars) | `found: false`, or `found: true` with `patient_id` and `given_name` only; or `invalid_phone`; or `consent_required` | Requires a granted Consent. Returns the given name only so the agent confirms identity with the caller. |
| `/api/tools/save_patient` ([route](src/app/api/tools/save_patient/route.ts)) | `conversation_id`, `nombre`, `primer_apellido`, `telefono`, optional `segundo_apellido`, `fecha_nacimiento` (ISO date), `sexo` (`H` or `M`) | `patient_id`, `folio`, `already_registered`; or `invalid_phone`; or `consent_required` | Requires a granted Consent. If the Patient is new and the Consent has no Patient yet, links the Consent to the Patient. An existing phone is not linked until the caller confirms the name. |

Phone numbers are normalized to the last 10 digits ([src/tools/phone.ts](src/tools/phone.ts)); fewer than 10 returns `invalid_phone`. Refusals (`consent_required`, `invalid_phone`) come back as HTTP 200 with a `message`, not as errors. [scripts/tools-smoke.sh](../../scripts/tools-smoke.sh) tests all of this against a running instance.

## Request lifecycle

All in [src/tools/handler.ts](src/tools/handler.ts), function `tool(name, schema, run)`:

1. Auth: the `x-pokta-tool-secret` header must equal `TOOL_SECRET` (constant-time compare). Otherwise 401 `{ error: "unauthorized" }`.
2. Validate: the JSON body is parsed with the tool's zod schema. Failure returns 400 `{ ok: false, message: "Invalid input: ..." }`.
3. Run: the tool function executes and its result is returned as `{ ok: true, ...result }` with status 200.
4. Error mapping: `EhrUnavailableError` returns 503 with a message telling the agent to apologise and not retry; `EhrRejectedError` returns 422 with the EHR's diagnostics in the message; anything else is rethrown (Next returns 500).
5. Log: one JSON line per call, `{ tool, ok, ms }` on success and `{ tool, ok: false, ms, error }` (error class name) on failure. No request data is logged.

`grantedConsent(conversationId)` and `NO_CONSENT` in the same file implement the consent gate. They query the EHR on every call, so the check does not depend on the prompt or on server memory.

## EhrAdapter boundary

The tools know only the interface in [src/ehr/adapter.ts](src/ehr/adapter.ts):

| Method | Purpose |
|---|---|
| `findPatientsByPhone(phone)` | List `PatientSummary` (`id`, `folio`, `givenName`). |
| `createPatient(input)` | Returns `{ patient, created }`; `created` is false when the EHR returned an existing Patient (HTTP 200). |
| `recordConsent(conversationId, granted)` | Create a Consent. |
| `latestConsent(conversationId)` | Newest Consent for the Conversation, or null. |
| `linkConsent(consent, conversationId, patientId)` | Attach the Consent to a Patient. |

Implementation: [src/ehr/fhir-adapter.ts](src/ehr/fhir-adapter.ts) builds and reads FHIR Patient and Consent with [@pokta-clinic/fhir](../../packages/fhir/README.md). The HTTP layer is [src/ehr/fhir-client.ts](src/ehr/fhir-client.ts): it fetches an OAuth2 client-credentials token (Basic auth to `/oauth/token`), caches one token per server instance, renews it 60 seconds before expiry, and retries once if the EHR answers 401. Requests time out after 8 seconds. The swap point is [src/ehr/index.ts](src/ehr/index.ts) (`export const ehr`).

Error classes (in adapter.ts):

| Class | When | Tool response |
|---|---|---|
| `EhrUnavailableError` | Network failure, timeout, token endpoint failure, HTTP 5xx, or 401 after one retry | 503 |
| `EhrRejectedError` (has `status`) | The EHR answered 4xx (validation, conflict, not found); message is the OperationOutcome diagnostics | 422 |

## Environment variables

Server-only, read lazily in [src/env.ts](src/env.ts) so `next build` works without secrets; a missing one throws at first use. Local values go in `apps/web/.env.local` (copy [.env.example](.env.example)); production values live in Vercel.

| Name | Purpose |
|---|---|
| `EHR_BASE_URL` | Base URL of the EHR (trailing slash removed). Local: `http://localhost:8787`. |
| `EHR_CLIENT_ID` | OAuth2 client id for the EHR. |
| `EHR_CLIENT_SECRET` | OAuth2 client secret for the EHR. |
| `TOOL_SECRET` | Shared secret the agent sends in `x-pokta-tool-secret`; matches the ElevenLabs workspace Secret `tool_secret`. |

## Scripts

Run with `pnpm --filter @pokta-clinic/web <script>` or, from the root, `pnpm dev:web`.

| Script | What it does |
|---|---|
| `dev` | `next dev` (port 3000). |
| `build` | `next build`. |
| `start` | `next start`. |
| `lint` | `eslint`. |
| `typecheck` | `next typegen && tsc --noEmit`. |

`@/*` maps to `src/*`. [next.config.ts](next.config.ts) sets `transpilePackages: ["@pokta-clinic/fhir"]` because the shared package ships as TypeScript source.

## File map

| File | Role |
|---|---|
| [src/app/api/tools/*/route.ts](src/app/api/tools/) | One route per agent tool; each exports `POST = tool(...)`. |
| [src/tools/handler.ts](src/tools/handler.ts) | `tool()` wrapper, secret check, consent gate, error mapping. |
| [src/tools/phone.ts](src/tools/phone.ts) | Phone normalization and the `invalid_phone` result. |
| [src/ehr/adapter.ts](src/ehr/adapter.ts) | `EhrAdapter` interface, types, error classes. |
| [src/ehr/fhir-adapter.ts](src/ehr/fhir-adapter.ts) | FHIR implementation of the adapter. |
| [src/ehr/fhir-client.ts](src/ehr/fhir-client.ts) | Token cache, fetch with timeout, status mapping. |
| [src/ehr/index.ts](src/ehr/index.ts) | Exports the active adapter as `ehr`. |
| [src/env.ts](src/env.ts) | Lazy required env vars. |
| [src/app/page.tsx](src/app/page.tsx), [layout.tsx](src/app/layout.tsx), [globals.css](src/app/globals.css) | Placeholder UI from create-next-app. |

## Adding a tool

1. If the tool needs a new EHR operation, add the method to `EhrAdapter` ([adapter.ts](src/ehr/adapter.ts)), implement it in [fhir-adapter.ts](src/ehr/fhir-adapter.ts), and make sure the mock EHR serves it (see [apps/mock-ehr/README.md](../mock-ehr/README.md)).
2. Create `src/app/api/tools/<name>/route.ts`. Define a zod `Input` that includes `conversation_id: conversationId` (import from `@/tools/handler`).
3. Export `POST = tool("<name>", Input, async (input) => { ... })`. Return a short result plus a `message` that tells the agent what to do next.
4. If the tool touches Patient data, start with `const consent = await grantedConsent(input.conversation_id); if (!consent) return NO_CONSENT;`. Normalize phones with `normalizePhone` and return `INVALID_PHONE` when it is not 10 digits.
5. Throw nothing for expected refusals; return them as results. Let `EhrUnavailableError` and `EhrRejectedError` propagate, since `tool()` maps them to 503 and 422.
6. Add checks to [scripts/tools-smoke.sh](../../scripts/tools-smoke.sh) and register the tool on the agent (see [docs/agent.md](../../docs/agent.md)).
