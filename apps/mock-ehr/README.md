# apps/mock-ehr: Expediente Demo

A fictional third-party EHR. It plays the role of the vendor system that holds the Expediente, so pokta-clinic can be shown reaching an EHR only over HL7 FHIR R4. It is a Hono server on Node 22 with Drizzle ORM and Postgres. All data is fictional. The tables follow the Mexican norms NOM-004-SSA3-2012 and NOM-024-SSA3-2012; FHIR is only the edge (see [ADR 0001](../../docs/adr/0001-nom-first-data-model-fhir-at-the-edge.md) and [docs/data-model.md](docs/data-model.md)).

## Endpoints

Routes are wired in [src/app.ts](src/app.ts). Everything under `/fhir/*` except `/fhir/metadata` needs a bearer token.

| Method | Path | Auth | What it does |
|---|---|---|---|
| GET | `/` | none | Public info page (server-rendered HTML): what this is, links, auth model, supported resources and live counts. Never shows patient data. |
| GET | `/console` | Basic (`admin`) | Read-only console, see [Console](#console). 404 unless `EHR_CONSOLE_PASSWORD` is set. |
| GET | `/healthz` | none | Returns `{ ok: true }`. |
| POST | `/oauth/token` | client credentials | Issues a bearer JWT (form body `grant_type=client_credentials`; client sent as Basic header or `client_id`/`client_secret` fields). |
| GET | `/fhir/metadata` | none | CapabilityStatement ([src/capability.ts](src/capability.ts)): FHIR 4.0.1, JSON, OAuth2 client credentials, every resource below with its interactions and search params. |
| GET | `/fhir/Patient?phone=` or `?identifier=` | bearer | Search. Phone is normalized to 10 digits. `identifier` is `system\|value` (CURP or folio system) or a bare CURP. No parameter returns 400. Returns a `searchset` Bundle. |
| GET | `/fhir/Patient/:id` | bearer | Read one Patient; 404 if missing. |
| POST | `/fhir/Patient` | bearer | Create. 400 if invalid or the phone is not 10 digits. A known phone returns the existing Patient with 200 (conditional create); otherwise 201 with a `Location` header. A duplicate CURP returns 409. |
| GET | `/fhir/Consent?identifier=urn:elevenlabs:conversation\|<id>` | bearer | Search by Conversation, newest first. Any other search returns 400. |
| POST | `/fhir/Consent` | bearer | Create a Consent. Each answer is a new row; earlier answers stay as history. 201 with `Location`. |
| PUT | `/fhir/Consent/:id` | bearer | Only links the Consent to a Patient (`patient.reference` required). Changing the answer returns 422. |

| GET | `/fhir/Practitioner` | bearer | Searchset of the seeded Practitioner(s), so a client can resolve the reference once and cache it. |
| GET | `/fhir/Practitioner/:id` | bearer | Read one; 404 if missing. |
| GET | `/fhir/Questionnaire?url=<canonical>` | bearer | Searchset Bundle. Seeded on boot; read-only. No `url` returns 400. |
| GET | `/fhir/Questionnaire/:id` | bearer | Read one; 404 if missing. |
| POST | `/fhir/QuestionnaireResponse` | bearer | Create the answers of one Conversation. 404 if the subject Patient or the Questionnaire does not exist; 422 `business-rule` if `status` is `completed` and a required linkId has no answer (diagnostics lists the missing linkIds, comma-separated); 409 if the Conversation already has a response. 201 with `Location`. |
| PUT | `/fhir/QuestionnaireResponse/:id` | bearer | Replace answers and status. 404 if missing; 422 if subject, identifier or questionnaire change, or if the Practitioner already validated it. |
| GET | `/fhir/QuestionnaireResponse/:id` | bearer | Read one. |
| GET | `/fhir/QuestionnaireResponse?identifier=urn:elevenlabs:conversation\|<id>` or `?subject=Patient/<id>` | bearer | Search, newest first. No parameter returns 400. |
| POST | `/fhir/Appointment` | bearer | Book the first consultation. 404 if the Patient or Practitioner does not exist; 409 `conflict` if the Practitioner has a booked Appointment overlapping the interval. 201 with `Location`. |
| GET | `/fhir/Appointment?patient=Patient/<id>` or `?identifier=<system>\|<value>` | bearer | Search by Patient or by calendar event or Conversation identifier. |
| GET | `/fhir/Appointment/:id` | bearer | Read one. |
| POST | `/fhir/Communication` | bearer | Record a Red flag Escalation. Subject is optional. 422 if `priority` does not match the severity extension; 404 if the Practitioner (or a given Patient) does not exist. 201 with `Location`. |
| GET | `/fhir/Communication?identifier=urn:elevenlabs:conversation\|<id>` | bearer | Search by Conversation, newest first. |

Errors are FHIR `OperationOutcome` bodies. Unknown routes return a 404 outcome; unhandled errors return a 500 outcome.

## Auth flow

OAuth2 client credentials, the shape of SMART Backend Services without the signed client assertion (a named production gap). Code: [src/auth.ts](src/auth.ts).

1. The client POSTs to `/oauth/token` with `grant_type=client_credentials` and its id and secret. Wrong grant returns 400 `unsupported_grant_type`; wrong credentials return 401 `invalid_client`. Credentials are compared in constant time.
2. The server signs an HS256 JWT (`sub`, `scope`, `iat`, `exp`) with `EHR_JWT_SECRET`. Lifetime is 3600 seconds. The response is `{ access_token, token_type: "Bearer", expires_in, scope }`.
3. The client sends `Authorization: Bearer <token>` to `/fhir/*`. [requireToken](src/auth.ts) verifies signature and expiry and stores `sub` as `clientId` for the audit log. Missing or bad tokens return a 401 `OperationOutcome`.

The token's `scope` string is informational: the middleware does not check scopes per route.

## Data model

Schema: [src/db/schema.ts](src/db/schema.ts). Section-by-section sources: [docs/data-model.md](docs/data-model.md).

| Table | Purpose | Norm | Used by routes |
|---|---|---|---|
| `establishment` | The Organization (practice), identified by CLUES | NOM-004 5.2.1, 5.2.2; NOM-024 Apendice A | Seed, Patient create |
| `practitioner` | The rheumatologist, identified by cedula profesional | NOM-004 5.10 | Yes (read) |
| `patient` | Patient identity: folio, optional CURP, names, birth date, sex (H/M), phone, address; `retain_until` for retention | NOM-024 6.5 and Table 1; NOM-004 5.2.3, 5.4 | Yes |
| `questionnaire` | Questionnaire definition: canonical `url`, version, title, items as JSONB; seeded on boot | n/a | Yes (read) |
| `intake` | QuestionnaireResponse: patient-reported document from a Conversation, `completion` (`in_progress` or `completed`), Validation `status` (`pending_validation`, `validated` or `rejected`), author device | NOM-004 5.18 | Yes |
| `consent` | Privacy Consent: granted, method (`voice`), Conversation ID, optional Patient | LFPDPPP; NOM-024 6.6.6 | Yes |
| `appointment` | Booked first consultation, with the Google Calendar event id | n/a | Yes |
| `communication` | Red flag Escalation to the Practitioner: severity, exact words, instruction; Patient optional | n/a | Yes |
| `audit_event` | Append-only log of reads, searches and writes (actor, action, resource, detail) | NOM-024 3.42, 6.6.1 | Written by every route |

The audit log is append-only in the database itself: migration [0001_audit_append_only.sql](drizzle/0001_audit_append_only.sql) adds a trigger that raises `audit_event is append-only` on any UPDATE or DELETE. The app writes through [src/audit.ts](src/audit.ts). Audit detail holds counts and ids, not Patient data.

Migrations are in [drizzle/](drizzle/) (`0000_chief_silvermane.sql` creates the tables; `0001` adds the trigger; `0002_opposite_franklin_richards.sql` adds `communication`, the Questionnaire `url` and `status`, the QuestionnaireResponse `completion`, `updated_at` and unique Conversation, and the Appointment `description`).

## FHIR mapping

Mapping code: [src/fhir/patient.ts](src/fhir/patient.ts) (`toFhir`, `fromFhir`) using constants from [packages/fhir](../../packages/fhir/README.md). Consent mapping uses `consentResource` from the same package inside [src/routes/consent.ts](src/routes/consent.ts).

| NOM field (column) | FHIR |
|---|---|
| `folio` | `Patient.identifier` with system `SYSTEM.folio` |
| `curp` | `Patient.identifier` with system `SYSTEM.curp`; uppercased on input |
| `curp_validada` | Patient extension `EXT.curpValidada` (boolean), only when a CURP exists |
| `nombre` | `Patient.name[0].given` |
| `primer_apellido`, `segundo_apellido` | `name[0].family` (both joined by a space) and `name[0]._family.extension` with `EXT.fathersFamily` and `EXT.mothersFamily` |
| `sexo` (H or M) | Patient extension `EXT.sexoRenapo`, plus `gender` (H is male, M is female) |
| `fecha_nacimiento` | `birthDate` |
| `telefono` | `telecom` with system `phone`; stored as 10 digits |
| `domicilio`, `codigo_postal` | `address[0].text`, `address[0].postalCode` |
| consent `granted` | `Consent.provision.type` (`permit` or `deny`) and `status` (`active` or `rejected`) |
| consent `conversation_id` | `Consent.identifier` with system `CONVERSATION_SYSTEM` |
| consent `patient_id` | `Consent.patient.reference` (`Patient/<id>`) |
| consent `recorded_at` | `Consent.dateTime` |

The mappings for QuestionnaireResponse, Appointment, Communication, Questionnaire and Practitioner are in the table in [docs/data-model.md](docs/data-model.md); their builders live in [packages/fhir](../../packages/fhir/README.md) and their route modules in [src/routes/](src/routes/).

Scope and category on Consent are fixed (`patient-privacy`, LOINC `59284-0`). On input, a missing primer apellido extension falls back to splitting `family` on spaces; no primer apellido at all is a 400.

## Console

`GET /console` is a read-only page for showing the demo: the latest 20 Patients (phone masked to the last 4 digits), Consents, QuestionnaireResponses (with a link to the raw JSON at `/console/questionnaire-response/:id`), Appointments (start in America/Mexico_City) and Communications, plus the latest 30 audit events. Auth is HTTP Basic with user `admin` and the password in `EHR_CONSOLE_PASSWORD`, compared in constant time. If the variable is unset the console returns 404. All values are HTML-escaped; there is no client JS and no write action. Code: [src/routes/console.tsx](src/routes/console.tsx) and [src/pages/console.tsx](src/pages/console.tsx). The root page `/` ([src/pages/root.tsx](src/pages/root.tsx)) is public and shows only counts.

## Boot sequence

[src/server.ts](src/server.ts) calls `prepareDatabase` ([src/db/bootstrap.ts](src/db/bootstrap.ts)) before it starts listening:

1. Apply pending Drizzle migrations from the `drizzle/` folder (resolved relative to the file, so it works from `src/` in dev and `dist/` in the image).
2. Seed the demo practice ([src/db/seed-data.ts](src/db/seed-data.ts)): one establishment (CLUES `DFSMP000001`) and one practitioner. It does nothing if the CLUES already exists. Then seed the rheumatology first-visit Questionnaire; it does nothing if its canonical url already exists.
3. On failure (Postgres not accepting connections yet, for example after a Render resume), wait 5 seconds and retry, up to 12 attempts. After that the process throws and exits so the host restarts it.
4. Listen on `PORT` (default 8787).

`env.ts` throws at import if `EHR_JWT_SECRET`, `EHR_CLIENT_ID` or `EHR_CLIENT_SECRET` is missing, so the server fails closed.

## Environment variables

| Name | Required | Default | Purpose |
|---|---|---|---|
| `DATABASE_URL` | no | local compose Postgres on port 5434 | Postgres connection string. Also read by [drizzle.config.ts](drizzle.config.ts). |
| `EHR_JWT_SECRET` | yes | none | Signs and verifies access tokens. |
| `EHR_CLIENT_ID` | yes | none (example file uses `pokta-clinic`) | The one accepted client id. |
| `EHR_CLIENT_SECRET` | yes | none | The one accepted client secret. |
| `PORT` | no | `8787` | Listen port. |
| `EHR_CONSOLE_PASSWORD` | no | unset (console disabled, 404) | Password for the read-only `/console` (HTTP Basic, user `admin`). On Render it is `sync: false`: set it by hand in the dashboard. |

Local values go in `apps/mock-ehr/.env.local` (copy [.env.example](.env.example)). The `dev`, `db:migrate` and `db:seed` scripts load it through `dotenv`.

## Scripts

From the repo root use `pnpm --filter @pokta-clinic/mock-ehr <script>`, or `pnpm dev:ehr`.

| Script | What it does |
|---|---|
| `dev` | `tsx watch src/server.ts` with `.env.local`. |
| `build` | `tsup` bundles `src/server.ts` to `dist/` and inlines `@pokta-clinic/fhir`. |
| `start` | `node dist/server.js`. |
| `typecheck` | `tsc --noEmit`. |
| `db:generate` | `drizzle-kit generate`: new migration from schema changes. |
| `db:migrate` | `drizzle-kit migrate` with `.env.local` (optional locally; boot also migrates). |
| `db:seed` | Seed the demo practice by hand ([src/seed.ts](src/seed.ts)). |

The [Dockerfile](Dockerfile) builds from the repo root (it needs `packages/fhir`), bundles with tsup, ships only production dependencies plus `dist/` and `drizzle/`, runs as the `node` user and exposes 8787.

## File map

| File | Role |
|---|---|
| [src/server.ts](src/server.ts) | Entry point: prepare database, then serve. |
| [src/app.ts](src/app.ts) | Hono app, public routes, mounts the FHIR routers and the console, error handlers. |
| [src/capability.ts](src/capability.ts) | CapabilityStatement and the resource list shared with the root page. |
| [src/auth.ts](src/auth.ts) | Token endpoint and `requireToken` middleware. |
| [src/env.ts](src/env.ts) | Required secrets, fail closed. |
| [src/audit.ts](src/audit.ts) | `audit()` helper that inserts an `audit_event`. |
| [src/routes/patient.ts](src/routes/patient.ts) | Patient search, read, create. |
| [src/routes/consent.ts](src/routes/consent.ts) | Consent search, create, link-to-Patient update. |
| [src/routes/practitioner.ts](src/routes/practitioner.ts) | Practitioner search and read. |
| [src/routes/questionnaire.ts](src/routes/questionnaire.ts) | Questionnaire search by url and read. |
| [src/routes/questionnaire-response.ts](src/routes/questionnaire-response.ts) | QuestionnaireResponse create, replace, read, search; required-items check. |
| [src/routes/appointment.ts](src/routes/appointment.ts) | Appointment create (with overlap check), read, search. |
| [src/routes/communication.ts](src/routes/communication.ts) | Communication create and search. |
| [src/routes/console.tsx](src/routes/console.tsx), [src/pages/](src/pages/) | Basic-auth console and the public root page (Hono JSX, server-rendered). |
| [src/fhir/refs.ts](src/fhir/refs.ts) | Reference and `system\|value` token parsing; a malformed id reads as not found. |
| [src/fhir/patient.ts](src/fhir/patient.ts) | Patient row to FHIR and back; phone normalization. |
| [src/db/schema.ts](src/db/schema.ts) | Drizzle tables and enums. |
| [src/db/client.ts](src/db/client.ts) | Postgres client and Drizzle instance. |
| [src/db/bootstrap.ts](src/db/bootstrap.ts) | Migrate, seed, retry. |
| [src/db/seed-data.ts](src/db/seed-data.ts) | The fictional practice and Practitioner. |
| [src/seed.ts](src/seed.ts) | CLI wrapper for the seed. |
| [drizzle.config.ts](drizzle.config.ts), [drizzle/](drizzle/) | drizzle-kit config and generated migrations. |
| [tsup.config.ts](tsup.config.ts) | Production bundle config. |

## Adding a FHIR resource

Follow the Consent pattern.

1. Add the zod schema and a builder to [packages/fhir](../../packages/fhir/README.md) and export it.
2. Add or reuse a table in [src/db/schema.ts](src/db/schema.ts). Then run `pnpm --filter @pokta-clinic/mock-ehr db:generate` and commit the new SQL and meta files in `drizzle/`. Migrations apply on the next boot.
3. If the resource needs a row-to-FHIR mapping with several fields, put it in `src/fhir/<resource>.ts` (as for Patient); for a small one, a local `toFhir` in the route file is enough (as for Consent).
4. Create `src/routes/<resource>.ts`: a `Hono<AuthVars>` router that validates input with the zod schema (400 `OperationOutcome` on failure), reads and writes through Drizzle, and calls `audit(c.get("clientId"), action, "<Resource>", id)` for each operation.
5. Mount it in [src/app.ts](src/app.ts) after `requireToken` (`app.route("/fhir/<Resource>", ...)`) and add the resource and its interactions to the CapabilityStatement.
6. Add a method to the `EhrAdapter` and its FHIR implementation in apps/web (see [apps/web/README.md](../web/README.md)).
