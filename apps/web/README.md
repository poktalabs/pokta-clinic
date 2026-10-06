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
| `/api/tools/get_questionnaire` ([route](src/app/api/tools/get_questionnaire/route.ts)) | `conversation_id` | `items`: the required Questionnaire items as `link_id` plus Spanish `text`; or `consent_required` | Requires a granted Consent. The Questionnaire is fetched from the EHR once per server instance and cached in module scope. |
| `/api/tools/save_history` ([route](src/app/api/tools/save_history/route.ts)) | `conversation_id`, `patient_id`, `status` (`in-progress` or `completed`), `answers` (`[{ link_id, answer }]`), `chief_complaint` | `saved: true`; or `saved: false` with `missing` link_ids; or `patient_mismatch`; or `consent_required` | Requires a granted Consent. Upserts one QuestionnaireResponse per Conversation, merged over what is already stored. Unknown `link_id`s are dropped, blank answers are ignored, `chief_complaint` fills the `chief-complaint` item when `answers` lacks it. Integer and boolean items are converted only when the words are clear (`unos 45 minutos` becomes 45); otherwise the words are kept as a string. `completed` with missing required items returns `saved: false` and a message naming them in Spanish; an EHR 422 `business-rule` is mapped the same way. |
| `/api/tools/check_availability` ([route](src/app/api/tools/check_availability/route.ts)) | `conversation_id`, optional `preferred_date` (ISO date), optional `part_of_day` (`morning` or `afternoon`) | `slots`: up to 3 `{ start, label }` (empty list with a message when none) | Requires a granted Consent. |
| `/api/tools/book_appointment` ([route](src/app/api/tools/book_appointment/route.ts)) | `conversation_id`, `patient_id`, `start` | `booked: true` with `appointment_id`, `start`, `label`; or `booked: false` (slot not bookable or taken); or `patient_mismatch` | Requires a granted Consent. Idempotent per Conversation. Re-validates `start` against the practice rules and the live calendar, creates the calendar event, then the EHR Appointment carrying the event ID; if the EHR answers 409 the event is deleted and the agent is told to offer other slots. Any other failure after the event exists also deletes it, then maps to 503 or 422 as usual. |
| `/api/tools/escalate` ([route](src/app/api/tools/escalate/route.ts)) | `conversation_id`, `severity` (`emergencia` or `urgencia`), `patient_words`, `instruction_given`, optional `patient_id` | `logged: true` | None, on purpose: a Red flag is a safety event and the LFPDPPP allows processing without consent to protect life. Creates a Communication to the Practitioner. Never blocks the script: on any failure it returns `ok: false` with a message telling the agent to continue the script without mentioning it. An unknown `patient_id` is retried without a subject. |

Phone numbers are normalized to the last 10 digits ([src/tools/phone.ts](src/tools/phone.ts)); fewer than 10 returns `invalid_phone`. Refusals (`consent_required`, `invalid_phone`, `patient_mismatch`, `booked: false`, `saved: false`) come back as HTTP 200 with a `message`, not as errors. [scripts/tools-smoke.sh](../../scripts/tools-smoke.sh) tests all of this against a running instance.

## Patient guard

For tools that take `patient_id` (`save_history`, `book_appointment`), `patientMismatch` in [src/tools/handler.ts](src/tools/handler.ts) refuses when the granted Consent is already linked to a Patient and `patient_id` differs. `save_history` and `book_appointment` also refuse when the Conversation's existing QuestionnaireResponse or Appointment belongs to another Patient.

Remaining gap: the `patient_id` is written by the LLM. For a found existing Patient, `find_patient` does not link the Consent (the caller has not yet confirmed the name), so that id is not bound server-side to this Conversation until per-Conversation state exists. Until then, a model that invents or swaps an id for an existing Patient is not stopped here; only ids of Patients registered in this Conversation are.

## Request lifecycle

All in [src/tools/handler.ts](src/tools/handler.ts), function `tool(name, schema, run)`:

1. Auth: the `x-pokta-tool-secret` header must equal `TOOL_SECRET` (constant-time compare). Otherwise 401 `{ error: "unauthorized" }`.
2. Validate: the JSON body is parsed with the tool's zod schema. Failure returns 400 `{ ok: false, message: "Invalid input: ..." }`.
3. Run: the tool function executes and its result is returned as `{ ok: true, ...result }` with status 200.
4. Error mapping: `EhrUnavailableError` returns 503 with a message telling the agent to apologise and not retry; `EhrRejectedError` returns 422 with the EHR's diagnostics in the message; `CalendarUnavailableError` returns 503 with a message telling the agent to apologise and say the clinic will call back to schedule; anything else is rethrown (Next returns 500).
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
| `getPatient(id)` | `PatientDetail` (summary plus `primerApellido`) or null on 404; used for the calendar event summary. |
| `getQuestionnaire()` | The `QuestionnaireItemDef[]` of `QUESTIONNAIRE_URL` (`linkId`, `text`, `type`, `required`), cached per server instance. |
| `findQuestionnaireResponse(conversationId)` | The Conversation's `HistoryRecord` (`id`, `patientId`, `status`, `answers`) or null. |
| `saveQuestionnaireResponse({ conversationId, patientId, status, answers, existing })` | POST, or PUT when `existing` is given; a 409 race is retried as a PUT. |
| `findAppointmentByConversation(conversationId)` | The Conversation's `AppointmentRecord` or null; makes booking idempotent. |
| `createAppointment({ conversationId, patientId, start, end, calendarEventId, description })` | Creates the Appointment; `EhrRejectedError(409)` when the Practitioner is already booked then. |
| `createCommunication({ conversationId, severity, patientWords, instruction, patientId? })` | Notifies the Practitioner of a Red flag. |

The Practitioner is resolved once through `GET /fhir/Practitioner` inside the FHIR adapter and cached, so tools never see its id.

Implementation: [src/ehr/fhir-adapter.ts](src/ehr/fhir-adapter.ts) builds and reads FHIR Patient and Consent with [@pokta-clinic/fhir](../../packages/fhir/README.md). The HTTP layer is [src/ehr/fhir-client.ts](src/ehr/fhir-client.ts): it fetches an OAuth2 client-credentials token (Basic auth to `/oauth/token`), caches one token per server instance, renews it 60 seconds before expiry, and retries once if the EHR answers 401. Requests time out after 8 seconds. The swap point is [src/ehr/index.ts](src/ehr/index.ts) (`export const ehr`).

Error classes (in adapter.ts):

| Class | When | Tool response |
|---|---|---|
| `EhrUnavailableError` | Network failure, timeout, token endpoint failure, HTTP 5xx, or 401 after one retry | 503 |
| `EhrRejectedError` (has `status`) | The EHR answered 4xx (validation, conflict, not found); message is the OperationOutcome diagnostics | 422 |

## Scheduling rules

Pure functions in [src/scheduling/slots.ts](src/scheduling/slots.ts), tested in [slots.test.ts](src/scheduling/slots.test.ts) with an injected `now`. First consultation is 60 minutes. Starts are Monday to Friday at 9, 10, 11, 12, 13, 16, 17 and 18 (9:00-14:00 and 16:00-19:00) in `America/Mexico_City`. Bookable from now + 24 hours to now + 14 days, both ends inclusive. Wall-clock times are converted with the IANA zone, not a fixed offset, even though Mexico has had no DST since 2022. `start` is ISO 8601 with the numeric offset (`2026-10-13T09:00:00-06:00`); `label` is Spanish, for example `martes 13 de octubre a las 9:00 de la mañana`, `a las 5:00 de la tarde`, `a la 1:00 de la tarde`, `a las 12:00 del día`.

`preferred_date` keeps one local day; `part_of_day` `morning` means before 14:00. Free slots are those that do not overlap a calendar busy interval. Up to 3 are picked for variety: a day not yet chosen first, then a start not adjacent to a chosen one on the same day, then the earliest; the result is sorted by time. `book_appointment` accepts a `start` only if it is one of the rule-allowed starts (`resolveSlot`), then checks the live calendar again.

## Calendar providers

The tools know only `CalendarAdapter` in [src/calendar/adapter.ts](src/calendar/adapter.ts), the way they know `EhrAdapter` for the EHR.

| Method | Purpose |
|---|---|
| `busy(from, to)` | Busy intervals `{ start, end }` between two ISO instants. |
| `createEvent({ start, end, summary, description })` | Creates an event, returns `{ id }`. |
| `deleteEvent(id)` | Deletes it; an already deleted event is not an error. |

Failures throw `CalendarUnavailableError`, which `tool()` maps to 503. Selection is in [src/calendar/index.ts](src/calendar/index.ts), by `CALENDAR_PROVIDER`:

| Value | Behavior |
|---|---|
| `google` (default) | [src/calendar/google.ts](src/calendar/google.ts). Service account from `GOOGLE_SERVICE_ACCOUNT_KEY_B64` (base64 of the JSON key) and the calendar `GOOGLE_CALENDAR_ID`, scopes `calendar.events` and `calendar.freebusy`, through the Calendar REST API (`freeBusy.query`, `events.insert`, `events.delete`) with `google-auth-library` for the JWT access token. Events carry time zone `America/Mexico_City` and the summary `Primera consulta: <given name> <first surname>`. The description holds only folio, patient id and conversation id: the calendar is a third-party system outside the Expediente, so no clinical data goes into it. A calendar the service account cannot read is reported as unavailable, never as free. A missing variable throws at first use. |
| `fake` | [src/calendar/fake.ts](src/calendar/fake.ts), in memory, for local dev and tests only. Refused when `VERCEL_ENV` is `production`. There is no silent fallback from `google` to `fake`. |

The practice must share its calendar with the service account's email, with permission to make changes to events.

## Environment variables

Server-only, read lazily in [src/env.ts](src/env.ts) so `next build` works without secrets; a missing one throws at first use. Local values go in `apps/web/.env.local` (copy [.env.example](.env.example)); production values live in Vercel.

| Name | Purpose |
|---|---|
| `EHR_BASE_URL` | Base URL of the EHR (trailing slash removed). Local: `http://localhost:8787`. |
| `EHR_CLIENT_ID` | OAuth2 client id for the EHR. |
| `EHR_CLIENT_SECRET` | OAuth2 client secret for the EHR. |
| `TOOL_SECRET` | Shared secret the agent sends in `x-pokta-tool-secret`; matches the ElevenLabs workspace Secret `tool_secret`. |
| `CALENDAR_PROVIDER` | `google` (default) or `fake`. Any other value fails closed. Local dev: `fake`. |
| `GOOGLE_SERVICE_ACCOUNT_KEY_B64` | Base64 of the service account JSON key. Required when the provider is `google`. |
| `GOOGLE_CALENDAR_ID` | Id of the Practitioner's calendar. Required when the provider is `google`. |

## Scripts

Run with `pnpm --filter @pokta-clinic/web <script>` or, from the root, `pnpm dev:web`.

| Script | What it does |
|---|---|
| `dev` | `next dev` (port 3000). |
| `build` | `next build`. |
| `start` | `next start`. |
| `lint` | `eslint`. |
| `typecheck` | `next typegen && tsc --noEmit`. |
| `test` | `vitest run`: unit tests of the scheduling rules. From the root: `pnpm test`. |

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
| [src/tools/history.ts](src/tools/history.ts) | Answer coercion and the missing-required-items rule for `save_history`. |
| [src/scheduling/slots.ts](src/scheduling/slots.ts) | Practice rules: slot generation, filters, variety, labels, validation. |
| [src/calendar/](src/calendar/) | `CalendarAdapter`, the Google and fake implementations, and the provider switch. |
| [src/env.ts](src/env.ts) | Lazy env vars. |
| [src/app/page.tsx](src/app/page.tsx), [layout.tsx](src/app/layout.tsx), [globals.css](src/app/globals.css) | Placeholder UI from create-next-app. |

## Adding a tool

1. If the tool needs a new EHR operation, add the method to `EhrAdapter` ([adapter.ts](src/ehr/adapter.ts)), implement it in [fhir-adapter.ts](src/ehr/fhir-adapter.ts), and make sure the mock EHR serves it (see [apps/mock-ehr/README.md](../mock-ehr/README.md)).
2. Create `src/app/api/tools/<name>/route.ts`. Define a zod `Input` that includes `conversation_id: conversationId` (import from `@/tools/handler`).
3. Export `POST = tool("<name>", Input, async (input) => { ... })`. Return a short result plus a `message` that tells the agent what to do next.
4. If the tool touches Patient data, start with `const consent = await grantedConsent(input.conversation_id); if (!consent) return NO_CONSENT;`. Normalize phones with `normalizePhone` and return `INVALID_PHONE` when it is not 10 digits.
5. Throw nothing for expected refusals; return them as results. Let `EhrUnavailableError` and `EhrRejectedError` propagate, since `tool()` maps them to 503 and 422.
6. Add checks to [scripts/tools-smoke.sh](../../scripts/tools-smoke.sh) and register the tool on the agent (see [docs/agent.md](../../docs/agent.md)).
