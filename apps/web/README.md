# apps/web

Next.js 16 app (deployed on Vercel). It hosts the server tool endpoints that the ElevenLabs agent calls during a Conversation and translates them into FHIR calls on the EHR through an `EhrAdapter`. It also owns a small store of its own (Upstash Redis) so it keeps working while the EHR is switched off, and it serves the live demo page at `/`: the voice widget, a live tool timeline, and the EHR on/off panel. See [Store](#store), [Tool timeline](#tool-timeline), [Outbox](#outbox-ehr-outages), [EHR toggle](#ehr-toggle-and-admin), [Post-call webhook](#post-call-webhook) and [Live page](#live-page).

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
| `/api/tools/check_availability` ([route](src/app/api/tools/check_availability/route.ts)) | `conversation_id`, optional `branch` (`del-valle`, `polanco`, `satelite` or `any`; absent means `any`), optional `preferred_date` (ISO date), optional `part_of_day` (`morning` or `afternoon`) | `slots`: up to 3 `{ branch, branch_name, practitioner_name, start, label }` (empty list with a message when none) | Requires a granted Consent. `any` searches the three branch calendars and keeps variety across branches and days. Each branch is read from its own calendar; a branch whose calendar does not answer is left out while another does, and the call fails (503) only when none does. `branch_name` and `practitioner_name` come from the EHR (Location, then PractitionerRole and Practitioner), cached per server instance; when the EHR is down or does not know the branch they come from [src/scheduling/branches.ts](src/scheduling/branches.ts), because availability depends only on the calendars. |
| `/api/tools/book_appointment` ([route](src/app/api/tools/book_appointment/route.ts)) | `conversation_id`, `patient_id`, `branch` (`del-valle`, `polanco` or `satelite`), `start` | `booked: true` with `appointment_id`, `branch`, `branch_name`, `address`, `practitioner_name`, `start`, `label`; or `booked: false` (slot not bookable or taken); or `patient_mismatch` | Requires a granted Consent. Idempotent per Conversation. Re-validates `start` against that branch's rules and that branch's live calendar, creates the event in that branch's calendar, then the EHR Appointment at the branch's Location with the branch's Practitioner, carrying the event ID. The message tells the agent to read back day, date, time, branch name and practitioner, and the address once; if the EHR answers 409 the event is deleted and the agent is told to offer other slots. Any other failure after the event exists also deletes it, then maps to 503 or 422 as usual. |
| `/api/tools/escalate` ([route](src/app/api/tools/escalate/route.ts)) | `conversation_id`, `severity` (`emergencia` or `urgencia`), `patient_words`, `instruction_given`, optional `patient_id` | `logged: true` | None, on purpose: a Red flag is a safety event and the LFPDPPP allows processing without consent to protect life. Creates a Communication to a Practitioner: the one at the Conversation's booked branch when it already booked, else no recipient (the EHR notifies its default Practitioner). Never blocks the script: on any failure it returns `ok: false` with a message telling the agent to continue the script without mentioning it. An unknown `patient_id` is retried without a subject. |

Phone numbers are normalized to the last 10 digits ([src/tools/phone.ts](src/tools/phone.ts)); fewer than 10 returns `invalid_phone`. Refusals (`consent_required`, `invalid_phone`, `patient_mismatch`, `booked: false`, `saved: false`) come back as HTTP 200 with a `message`, not as errors. [scripts/tools-smoke.sh](../../scripts/tools-smoke.sh) tests all of this against a running instance.

## Patient guard

For tools that take `patient_id` (`save_history`, `book_appointment`), `patientMismatch` in [src/tools/handler.ts](src/tools/handler.ts) refuses when the granted Consent is already linked to a Patient and `patient_id` differs. `save_history` and `book_appointment` also refuse when the Conversation's existing QuestionnaireResponse or Appointment belongs to another Patient.

Remaining gap: the `patient_id` is written by the LLM. For a found existing Patient, `find_patient` does not link the Consent (the caller has not yet confirmed the name), so that id is not bound server-side to this Conversation until per-Conversation state exists. Until then, a model that invents or swaps an id for an existing Patient is not stopped here; only ids of Patients registered in this Conversation are.

## Request lifecycle

All in [src/tools/handler.ts](src/tools/handler.ts), function `tool(name, schema, run)`:

1. Auth: the `x-pokta-tool-secret` header must equal `TOOL_SECRET` (constant-time compare). Otherwise 401 `{ error: "unauthorized" }`.
2. Validate: the JSON body is parsed with the tool's zod schema. Failure returns 400 `{ ok: false, message: "Invalid input: ..." }`.
3. Run: the tool function executes and its result is returned as `{ ok: true, ...result }` with status 200. The tool also receives a context whose `outcome(label)` names what happened for the timeline.
4. Error mapping: `EhrUnavailableError` returns 503 with a message telling the agent to apologise and not retry; `EhrRejectedError` returns 422 with the EHR's diagnostics in the message; `CalendarUnavailableError` returns 503 with a message telling the agent to apologise and say the clinic will call back to schedule; anything else is rethrown (Next returns 500).
5. Log: one JSON line per call, `{ tool, ok, ms }` on success and `{ tool, ok: false, ms, error }` (error class name) on failure. No request data is logged.
6. Timeline: one event per call goes to the store, see [Tool timeline](#tool-timeline).

`grantedConsent(conversationId)` and `NO_CONSENT` in the same file implement the consent gate. The check does not depend on the prompt or on server memory: it asks the store first (where `record_consent` wrote the decision) and the EHR second, and a store miss or failure falls through to the EHR, never to a grant. The EHR stays the system of record; the store is a cache keyed by Conversation.

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
| `getBranch(branch)` | The `BranchRecord` (`locationId`, `name`, `address`, `practitionerId`, `practitionerName`) of a branch code, cached per server instance. |
| `createAppointment({ conversationId, branch, patientId, start, end, calendarEventId, description })` | Creates the Appointment at the branch's Location with the Practitioner who has a role there; `EhrRejectedError(409)` when that Practitioner is already booked then. |
| `createCommunication({ conversationId, severity, patientWords, instruction, patientId?, branch?, sent? })` | Notifies the Practitioner at `branch` of a Red flag, or the EHR's default when no branch is given. `sent` keeps the original time when the write is replayed from the outbox. |
| `findCommunicationsByConversation(conversationId)` | The Conversation's Communications (`id`, `severity`, `patientWords`); the outbox drain uses it to avoid writing one twice. |

A branch is resolved once inside the FHIR adapter and cached: `GET /fhir/Location?identifier=urn:pokta-clinic:branch|<code>`, then `GET /fhir/PractitionerRole?location=Location/<id>`, then `GET /fhir/Practitioner/<id>` for the name. Tools only use branch codes, never Location or Practitioner ids.

Implementation: [src/ehr/fhir-adapter.ts](src/ehr/fhir-adapter.ts) builds and reads FHIR Patient and Consent with [@pokta-clinic/fhir](../../packages/fhir/README.md). The HTTP layer is [src/ehr/fhir-client.ts](src/ehr/fhir-client.ts): it fetches an OAuth2 client-credentials token (Basic auth to `/oauth/token`), caches one token per server instance, renews it 60 seconds before expiry, and retries once if the EHR answers 401. Requests time out after 8 seconds. The swap point is [src/ehr/index.ts](src/ehr/index.ts) (`export const ehr`).

Error classes (in adapter.ts):

| Class | When | Tool response |
|---|---|---|
| `EhrUnavailableError` | Network failure, timeout, token endpoint failure, HTTP 5xx, or 401 after one retry | 503 |
| `EhrRejectedError` (has `status`) | The EHR answered 4xx (validation, conflict, not found); message is the OperationOutcome diagnostics | 422 |

## Scheduling rules

Pure functions in [src/scheduling/slots.ts](src/scheduling/slots.ts), tested in [slots.test.ts](src/scheduling/slots.test.ts) with an injected `now`. First consultation is 60 minutes, in `America/Mexico_City`. The hours of each branch live in one module, [src/scheduling/branches.ts](src/scheduling/branches.ts):

| Branch | Code | Hours (one start per hour) |
|---|---|---|
| GMA Del Valle | `del-valle` | Mon-Fri 9:00-14:00 and 16:00-19:00 |
| GMA Polanco | `polanco` | Mon-Fri 10:00-18:00 |
| GMA Satélite | `satelite` | Mon-Fri 9:00-14:00, Sat 9:00-13:00 |

The web config is authoritative for booking. The EHR Location also carries `hoursOfOperation`, but booking has to work while the EHR is switched off and `resolveSlot` needs the hours synchronously, so the config is not read from the EHR; it must match the seeded Location hours ([apps/mock-ehr/src/db/seed-data.ts](../mock-ehr/src/db/seed-data.ts)). The config also holds each branch's name, address and practitioner name as a fallback for an EHR outage. Bookable from now + 24 hours to now + 14 days, both ends inclusive. Wall-clock times are converted with the IANA zone, not a fixed offset, even though Mexico has had no DST since 2022. `start` is ISO 8601 with the numeric offset (`2026-10-13T09:00:00-06:00`); `label` is Spanish, for example `martes 13 de octubre a las 9:00 de la mañana`, `a las 5:00 de la tarde`, `a la 1:00 de la tarde`, `a las 12:00 del día`.

`preferred_date` keeps one local day; `part_of_day` `morning` means before 14:00. Free slots are those that do not overlap a calendar busy interval. Up to 3 are picked for variety: a day not yet chosen first, then a start not adjacent to a chosen one on the same day at the same branch, then a branch not yet chosen, then the earliest; the result is sorted by time. `book_appointment` accepts a `start` only if it is one of that branch's rule-allowed starts (`resolveSlot`), then checks that branch's live calendar again.

## Calendar providers

The tools know only `CalendarAdapter` in [src/calendar/adapter.ts](src/calendar/adapter.ts), the way they know `EhrAdapter` for the EHR.

| Method | Purpose |
|---|---|
| `busy(branch, from, to)` | Busy intervals `{ start, end }` of the branch's calendar between two ISO instants. |
| `createEvent({ branch, start, end, summary, description })` | Creates an event in the branch's calendar, returns `{ id }`. |
| `deleteEvent(branch, id)` | Deletes it from the branch's calendar; an already deleted event is not an error. |

Failures throw `CalendarUnavailableError`, which `tool()` maps to 503. Selection is in [src/calendar/index.ts](src/calendar/index.ts), by `CALENDAR_PROVIDER`:

| Value | Behavior |
|---|---|
| `google` (default) | [src/calendar/google.ts](src/calendar/google.ts). Service account from `GOOGLE_SERVICE_ACCOUNT_KEY_B64` (base64 of the JSON key) and one calendar per branch (`GOOGLE_CALENDAR_ID_GMA_DEL_VALLE`, `GOOGLE_CALENDAR_ID_GMA_POLANCO`, `GOOGLE_CALENDAR_ID_GMA_SATELITE`), scopes `calendar.events` and `calendar.freebusy`, through the Calendar REST API (`freeBusy.query`, `events.insert`, `events.delete`) with `google-auth-library` for the JWT access token. Events carry time zone `America/Mexico_City` and the summary `Primera consulta: <given name> <first surname>`. The description holds only the branch, folio, patient id and conversation id: the calendar is a third-party system outside the Expediente, so no clinical data goes into it. A calendar the service account cannot read is reported as unavailable, never as free. A missing variable throws at first use. |
| `fake` | [src/calendar/fake.ts](src/calendar/fake.ts), in memory, for local dev and tests only. Refused when `VERCEL_ENV` is `production`. There is no silent fallback from `google` to `fake`. |

Each branch must share its calendar with the service account's email, with permission to make changes to events.

## Store

pokta-clinic keeps a small store of its own, independent of the EHR, so the demo works while the EHR is suspended. It holds operational data only, with a 7 day TTL: the tool timeline, a Consent decision cache, a booking cache per Conversation, the outbox, the post-call records and the toggle's intent. The EHR remains the record. The interface is `Store` in [src/store/types.ts](src/store/types.ts):

| Method | Purpose |
|---|---|
| `addEvent(event)`, `recentEvents(limit)` | The tool timeline (newest last, capped at 200). |
| `getConsent(conversationId)`, `putConsent(conversationId, decision)` | Consent decision cache, so the gate works with the EHR down. |
| `getBooking(conversationId)`, `putBooking(conversationId, booking)` | Makes `book_appointment` idempotent when the EHR cannot be asked. |
| `enqueue(item)`, `outbox()`, `updateOutboxItem(item)`, `removeOutboxItem(id)` | The outbox, in enqueue order. |
| `getEhrIntent()`, `putEhrIntent(intent)` | What the toggle last asked for, and whether a drain is pending. |
| `putConversation(record)`, `getConversation(id)`, `listConversations(limit)` | Post-call webhook records. |
| `lock(name, ttlSeconds)` | Returns a release function or null; keeps two drains from running at once. |

Implementations: [upstash.ts](src/store/upstash.ts) (`@upstash/redis` over REST; keys are prefixed `pc:`) and [memory.ts](src/store/memory.ts) (in process, no TTL, local dev and tests only). `STORE_PROVIDER` picks one at first use; the default is `upstash` and missing credentials throw. The memory store is refused on Vercel production and never stands in silently. Outbox payloads and post-call transcripts can hold patient data (fictional in the demo), which is why they expire and why the only readers are admin-only or show counts.

## Tool timeline

`tool()` records one event per call after the response is built: `conversationId`, `tool`, `ok`, `status`, `ms`, `at` and a short `outcome` label such as `consent granted`, `slot booked 2026-10-13 09:00` or `queued in outbox`. Tools set the label with `ctx.outcome(...)`; without one the handler infers `consent required`, `patient mismatch` or `invalid phone`, else `ok`. Events never contain answers, names or phones. The write goes through `after()` (so Vercel keeps the function alive for it), times out after 1.5 s and only logs on error, so it cannot fail or noticeably slow a tool. A 200 answer with `ok: false` (escalate when the EHR fails) shows as an error. `GET /api/live/events?since=<epoch ms>` returns the last 50 events newer than `since`, newest last. It is public.

## Outbox (EHR outages)

When the EHR is unreachable (`EhrUnavailableError`), these writes are queued in the store instead of failing, and the tool answers `ok` with a message saying the data is saved and will sync, so the call continues:

| Kind | Queued from | Replay (idempotent) |
|---|---|---|
| `save_history` | `save_history`, with the raw input | `saveHistory` upserts one QuestionnaireResponse per Conversation and merges over what is stored. A queued `completed` that the EHR now says is missing required items is saved as `in-progress`, still pending Validation. |
| `appointment` | `book_appointment`, after the calendar event is created (its id is kept) | Appointment search by Conversation identifier first, create only if none. |
| `escalate` | `escalate` | Communication search by Conversation identifier; skipped when one with the same severity and words exists. The original `sent` time is kept. |
| `consent` | `record_consent` when the EHR is down at that moment | Skipped when the EHR already has the same decision, else a Consent is created. |

Consent still gates everything while the EHR is down: `record_consent` writes the decision to the store, and `grantedConsent()` asks the store first and the EHR second. With the EHR down and no cached decision the gate asks the EHR, fails, and the tool answers 503, so nothing is read or written without a recorded yes.

What still needs the EHR, on purpose: `find_patient` and `save_patient` (they fail with the existing 503 apology message), `get_questionnaire` on a server instance that has not cached the Questionnaire yet, and the `book_appointment` look-ups. For `book_appointment` the EHR reads are best effort during an outage: the calendar event then carries the ids but not the Patient's name (`Primera consulta (pendiente de sincronizar)`), and a repeat call for the same Conversation is answered from the store. If the store is down as well, the original 503 comes back.

The drain ([src/outbox/drain.ts](src/outbox/drain.ts)) takes a lock, replays the items in order, removes successes, and keeps failures queued with an attempt count and the error class (never the EHR's message, which can echo patient data). If the EHR is unreachable the run stops, so later items keep their order; a rejection (4xx) of one item does not block the items behind it. It runs from: `POST /api/outbox/drain` (admin cookie, or the cron bearer), `GET /api/outbox/drain` (Vercel Cron, `Authorization: Bearer $CRON_SECRET`, every 10 minutes per [vercel.json](vercel.json)), and once when `GET /api/live/ehr` first sees a healthy EHR after the toggle resumed it. `GET /api/live/outbox` returns the count and each item's kind, age in seconds and attempts; no patient data and no Conversation ids. It is public.

## EHR toggle and admin

The admin can suspend or resume the Render EHR web service and its Postgres ([src/ehr-control/render.ts](src/ehr-control/render.ts)): `POST /v1/services/{id}/suspend|resume` and `POST /v1/postgres/{id}/suspend|resume`. Resume order is database then service; suspend order is service then database. `POST /api/admin/ehr` takes `{"action":"on"|"off"}` and returns 202 at once (Render answers 202 and the EHR needs a minute or more to boot). Without the three Render variables it answers 501 "not configured".

`GET /api/live/ehr` is public and returns `state`: `on` when the EHR's `/healthz` answers (2.5 s timeout), `waking` when it does not but a resume was requested in the last 10 minutes, otherwise `off`. For an admin it also returns the `suspended` flags Render reports (read with `GET /v1/services/{id}` and `GET /v1/postgres/{id}`), so the public page never spends Render API calls. Note that on the free plan an idle (not suspended) service wakes when its health is probed.

Admin auth: `POST /api/admin/login` with `{"password"}` compares it in constant time with `ADMIN_PASSWORD` and sets the `pc_admin` cookie: httpOnly, `Secure` on Vercel and in production builds, `SameSite=Strict`, 12 hours, value `<expiry>.<HMAC-SHA256>` signed with `ADMIN_SESSION_SECRET` or a key derived from the password. Nothing is stored server-side, so a session ends only by expiring or by changing the signing secret. A wrong password waits 750 ms; there is no per-IP limit, so use a long random password. `POST /api/admin/logout` clears the cookie and `GET /api/admin/session` says whether the caller is an admin. Every admin route checks the cookie: `POST /api/admin/ehr`, `POST /api/outbox/drain`, `GET /api/live/conversations` and `GET /api/live/conversations/[id]`.

## Post-call webhook

`POST /api/webhooks/elevenlabs` verifies the `ElevenLabs-Signature` header against the raw body before parsing it: the header is `t=<unix seconds>,v0=<hex>` and `v0` is `HMAC-SHA256(ELEVENLABS_WEBHOOK_SECRET, "<t>.<raw body>")`, compared in constant time, with a 30 minute tolerance in both directions. This is the scheme of `constructEvent` in the ElevenLabs SDK; the docs page only names the header and points to the SDK. A bad or missing signature is 401; an unset secret is 503. A verified `post_call_transcription` is stored per Conversation (transcript with role, text, workflow node id, tool calls and time; data collection and evaluation results; summary; duration; status) and any other verified event type is acknowledged and ignored, because ElevenLabs retries and eventually disables a webhook that answers non-2xx. It is the fallback evidence if a reviewer cannot open a Conversation ID from another workspace. `GET /api/live/conversations` and `GET /api/live/conversations/[id]` read it (admin only). The webhook is created by hand in ElevenLabs, see [docs/deploy.md](../../docs/deploy.md).

## Live page

`/` ([src/app/page.tsx](src/app/page.tsx), client pieces in [src/components/](src/components/)) is the page for the Loom and for reviewers: header with the fictional-data and AI notice, the ElevenLabs widget (`<elevenlabs-convai agent-id>` plus the embed script from unpkg, agent id from `NEXT_PUBLIC_ELEVENLABS_AGENT_ID`), the tool timeline (polls `/api/live/events` every 1.5 s while the tab is visible, grouped by Conversation, newest on top, six shown), the EHR and outbox panel (polls every 4 s; admins also get Turn on, Turn off and Drain buttons, others see state only, plus a small `admin` link to `/admin`), a How it works strip and links to the EHR info page and FHIR metadata. Styling is Tailwind with CSS variables for light and dark; no other UI library, no secrets in the browser.

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
| `GOOGLE_CALENDAR_ID_GMA_DEL_VALLE` | Id of the GMA Del Valle calendar. Required when the provider is `google`. |
| `GOOGLE_CALENDAR_ID_GMA_POLANCO` | Id of the GMA Polanco calendar. Required when the provider is `google`. |
| `GOOGLE_CALENDAR_ID_GMA_SATELITE` | Id of the GMA Satélite calendar. Required when the provider is `google`. |
| `STORE_PROVIDER` | `upstash` (default) or `memory` (local dev and tests only, refused when `VERCEL_ENV` is `production`). Any other value fails closed. |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Upstash Redis REST credentials, as the Vercel Marketplace integration injects them. |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | The same credentials under the other name the integration can use; either pair works. |
| `ADMIN_PASSWORD` | Password of the admin login. Unset means nobody can log in (fail closed). |
| `ADMIN_SESSION_SECRET` | Optional. Signs the admin cookie. Without it the key is derived from `ADMIN_PASSWORD`, so changing the password also ends every session. |
| `CRON_SECRET` | Vercel Cron sends it as `Authorization: Bearer`; protects `GET /api/outbox/drain`. Unset means the cron call is refused. |
| `RENDER_API_KEY`, `RENDER_EHR_SERVICE_ID`, `RENDER_EHR_POSTGRES_ID` | The EHR on/off toggle. Unset means the toggle answers 501 "not configured". The key is account-wide, see [docs/deploy.md](../../docs/deploy.md). |
| `ELEVENLABS_WEBHOOK_SECRET` | Signing secret of the post-call webhook. Unset means the webhook answers 503. |
| `NEXT_PUBLIC_ELEVENLABS_AGENT_ID` | Agent id for the widget on `/`. Public by design (the agent is public with an origin allowlist). Inlined at build time, so changing it needs a redeploy. |

## Scripts

Run with `pnpm --filter @pokta-clinic/web <script>` or, from the root, `pnpm dev:web`.

| Script | What it does |
|---|---|
| `dev` | `next dev` (port 3000). |
| `build` | `next build`. |
| `start` | `next start`. |
| `lint` | `eslint`. |
| `typecheck` | `next typegen && tsc --noEmit`. |
| `test` | `vitest run`: unit tests of the scheduling rules, the outbox drain, the webhook signature check, the admin session and the Render call order. From the root: `pnpm test`. |

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
| [src/scheduling/branches.ts](src/scheduling/branches.ts) | The three GMA branches: hours (authoritative for booking), and fallback name, address and practitioner name. |
| [src/tools/branch-details.ts](src/tools/branch-details.ts) | Branch name, address and practitioner for the agent: EHR first, config fallback. |
| [src/scheduling/slots.ts](src/scheduling/slots.ts) | Per-branch rules: slot generation across branches, filters, variety, labels, validation. |
| [src/calendar/](src/calendar/) | `CalendarAdapter`, the Google and fake implementations, and the provider switch. |
| [src/env.ts](src/env.ts) | Lazy env vars. |
| [src/store/](src/store/) | `Store` interface, the Upstash and in-memory implementations, and the provider switch. |
| [src/timeline/record.ts](src/timeline/record.ts) | Fire-and-forget write of one tool event. |
| [src/outbox/](src/outbox/) | `queueForEhr`, the drain, and the public summary. |
| [src/tools/save-history.ts](src/tools/save-history.ts) | The EHR half of `save_history`, shared by the tool and the drain. |
| [src/ehr-control/](src/ehr-control/) | Render API client, EHR health and state, and the status used by the page and the drain trigger. |
| [src/admin/session.ts](src/admin/session.ts) | Admin password check and the signed cookie. |
| [src/webhooks/elevenlabs.ts](src/webhooks/elevenlabs.ts) | Signature check and payload mapping for the post-call webhook. |
| [src/app/page.tsx](src/app/page.tsx), [src/components/](src/components/) | The live page. |
| [vercel.json](vercel.json) | The outbox cron. |
| [src/app/page.tsx](src/app/page.tsx), [layout.tsx](src/app/layout.tsx), [globals.css](src/app/globals.css) | Placeholder UI from create-next-app. |

## Adding a tool

1. If the tool needs a new EHR operation, add the method to `EhrAdapter` ([adapter.ts](src/ehr/adapter.ts)), implement it in [fhir-adapter.ts](src/ehr/fhir-adapter.ts), and make sure the mock EHR serves it (see [apps/mock-ehr/README.md](../mock-ehr/README.md)).
2. Create `src/app/api/tools/<name>/route.ts`. Define a zod `Input` that includes `conversation_id: conversationId` (import from `@/tools/handler`).
3. Export `POST = tool("<name>", Input, async (input) => { ... })`. Return a short result plus a `message` that tells the agent what to do next.
4. If the tool touches Patient data, start with `const consent = await grantedConsent(input.conversation_id); if (!consent) return NO_CONSENT;`. Normalize phones with `normalizePhone` and return `INVALID_PHONE` when it is not 10 digits.
5. Throw nothing for expected refusals; return them as results. Let `EhrUnavailableError` and `EhrRejectedError` propagate, since `tool()` maps them to 503 and 422.
6. Add checks to [scripts/tools-smoke.sh](../../scripts/tools-smoke.sh) and register the tool on the agent (see [docs/agent.md](../../docs/agent.md)).
