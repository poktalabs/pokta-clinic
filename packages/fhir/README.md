# @pokta-clinic/fhir

Shared FHIR R4 contract for pokta-clinic. Both [apps/web](../../apps/web/README.md) (the client side) and [apps/mock-ehr](../../apps/mock-ehr/README.md) (the server side) import it, so the two cannot drift apart. It holds zod schemas and TypeScript types for `Patient`, `Organization`, `Location`, `Practitioner`, `PractitionerRole`, `Questionnaire`, `QuestionnaireResponse`, `Consent`, `Appointment` and `Communication`, builders, the identifier systems and the extension URLs. The package is private and exports TypeScript source directly (`"exports": { ".": "./src/index.ts" }`); there is no build step.

## Exports

Everything is re-exported from [src/index.ts](src/index.ts).

| Export | Kind | Defined in | Notes |
|---|---|---|---|
| `FHIR_VERSION` | const | [index.ts](src/index.ts) | `"4.0.1"`. |
| `OperationOutcome` | zod schema + type | [index.ts](src/index.ts) | At least one issue (severity, code, optional diagnostics). |
| `operationOutcome(code, diagnostics, severity?)` | function | [index.ts](src/index.ts) | Builds an error body. Severity defaults to `"error"`. |
| `SYSTEM` | const | [patient.ts](src/patient.ts) | Identifier systems: `curp` (`urn:mx:renapo:curp`), `folio` (`urn:pokta-clinic:expediente-demo:folio`), `clues` (`urn:mx:dgis:clues`, identifies a Location), `cedula`, `branch` (`urn:pokta-clinic:branch`, the stable branch code of a Location). Local URNs, because no official Mexican FHIR implementation guide exists. |
| `EXT` | const | [patient.ts](src/patient.ts) | Extension URLs: `fathersFamily` and `mothersFamily` (core R4 HumanName extensions), `sexoRenapo` and `curpValidada` (local URNs). |
| `Identifier`, `HumanName` | zod schemas | [patient.ts](src/patient.ts) | `HumanName` needs at least one `given`; the two surnames travel in `_family.extension`. |
| `Patient` | zod schema + type | [patient.ts](src/patient.ts) | Requires `name` and `telecom` (phone or email). `birthDate` is `YYYY-MM-DD`. Only the fields the demo uses. |
| `bundle(resources)` | function | [patient.ts](src/patient.ts) | Wraps resources in a `searchset` Bundle with `total`. |
| `CONVERSATION_SYSTEM` | const | [consent.ts](src/consent.ts) | `urn:elevenlabs:conversation`. The identifier system that ties a Consent to a Conversation. |
| `Consent` | zod schema + type | [consent.ts](src/consent.ts) | `provision.type` (`permit` or `deny`) carries the answer; at least one `identifier`. |
| `CONSENT_METHOD_EXT` | const | [consent.ts](src/consent.ts) | Extension URL recording how consent was given (`voice`). |
| `consentResource({ conversationId, granted, patientId?, id?, dateTime? })` | function | [consent.ts](src/consent.ts) | Builds a Consent: scope `patient-privacy`, category LOINC `59284-0`, `status` active or rejected, `provision.type` permit or deny. |
| `reference(type)`, `ref(type, id)`, `TextExtension` | helpers | [reference.ts](src/reference.ts) | zod schema for a literal `Type/<id>` reference, a reference builder, and a `{ url, valueString }` extension schema. |
| `Practitioner`, `practitionerResource({ id, nombre, primerApellido, segundoApellido?, cedulaProfesional, especialidad })` | zod schema + builder | [practitioner.ts](src/practitioner.ts) | Read-only resource: cedula identifier, name, qualification. |
| `Organization`, `organizationResource({ id, nombre, razonSocial })` | zod schema + builder | [organization.ts](src/organization.ts) | Read-only: the clinic network. The razón social travels as `alias[0]`. |
| `BRANCH_CODE`, `BRANCH_CODES`, `BranchCode` | const + type | [location.ts](src/location.ts) | The stable branch codes `delValle` (`del-valle`), `polanco` (`polanco`) and `satelite` (`satelite`). Location ids are generated at seed time, so a client resolves them with `GET /fhir/Location?identifier=urn:pokta-clinic:branch\|<code>`. |
| `DAYS_OF_WEEK`, `DayOfWeek`, `HoursOfOperation` | const + type + type | [location.ts](src/location.ts) | R4 `hoursOfOperation` entry: `daysOfWeek` (`mon` to `sun`), `openingTime`, `closingTime` as `HH:MM:SS`, local time (America/Mexico_City). |
| `Location`, `locationResource({ id, codigo, clues, nombre, domicilio, organizationId, horarios })` | zod schema + builder | [location.ts](src/location.ts) | Read-only: a branch. Identifiers `SYSTEM.branch` (codigo) and `SYSTEM.clues`, `address.text`, `managingOrganization`, `hoursOfOperation`. |
| `PractitionerRole`, `practitionerRoleResource({ id, practitionerId, locationId, organizationId, especialidad })` | zod schema + builder | [practitioner-role.ts](src/practitioner-role.ts) | Read-only: a Practitioner at one Location. Resolve with `?location=Location/<id>` or `?practitioner=Practitioner/<id>`. |
| `QUESTIONNAIRE_URL`, `QUESTIONNAIRE_VERSION`, `QUESTIONNAIRE_TITLE` | consts | [questionnaire.ts](src/questionnaire.ts) | Canonical url `urn:pokta-clinic:questionnaire:rheum-first-visit`, version, Spanish title. |
| `LINK_ID`, `RHEUM_FIRST_VISIT_ITEMS`, `requiredLinkIds(items)` | consts + function | [questionnaire.ts](src/questionnaire.ts) | The 11 stable linkIds (`chief-complaint`, `onset-duration`, `joints-involved`, `morning-stiffness-min`, `joint-swelling`, `systemic-symptoms`, `extra-articular`, `current-medications`, `allergies`, `prior-dx-tests`, `family-history`), the item definitions (all required), and a helper that returns the required ones. |
| `Questionnaire`, `QuestionnaireItem`, `questionnaireResource({ id?, url, version, title, status?, items })` | zod schemas + builder | [questionnaire.ts](src/questionnaire.ts) | Item types are `string`, `integer` or `boolean`. |
| `VALIDATION_STATUS_EXT`, `AGENT_AUTHOR` | consts | [questionnaire-response.ts](src/questionnaire-response.ts) | `urn:pokta-clinic:extension:validation-status` and `"pokta-clinic voice agent"`. |
| `QuestionnaireResponse`, `QuestionnaireResponseItem`, `questionnaireResponseResource({ id?, questionnaire, status, patientId, conversationId, authored?, items, validationStatus? })` | zod schemas + builder | [questionnaire-response.ts](src/questionnaire-response.ts) | `status` is `in-progress` or `completed`; each answer is one of `valueString`, `valueInteger`, `valueBoolean`; validation status defaults to `pending`. |
| `CALENDAR_EVENT_SYSTEM`, `FIRST_VISIT_SERVICE`, `FIRST_VISIT_MINUTES` | consts | [appointment.ts](src/appointment.ts) | `urn:google:calendar:event`, `"Primera consulta de reumatologia"`, `60`. |
| `Appointment`, `appointmentResource({ id?, patientId, practitionerId, locationId, start, end, calendarEventId, conversationId?, description? })` | zod schema + builder | [appointment.ts](src/appointment.ts) | `participant` is Patient, Practitioner and a Location (`actor: Location/<id>`), at least three. `start` and `end` are ISO 8601 with offset; `minutesDuration` is derived. |
| `RED_FLAG_SEVERITY_EXT`, `RED_FLAG_CATEGORY`, `RED_FLAG_SEVERITY`, `PRIORITY_BY_SEVERITY`, `RedFlagSeverity` | consts + type | [communication.ts](src/communication.ts) | `urn:pokta-clinic:extension:red-flag-severity`, `"red-flag"`, `["emergencia", "urgencia"]`, and the map to `stat` and `urgent`. |
| `Communication`, `communicationResource({ id?, conversationId, severity, patientId?, practitionerId, sent?, patientWords, instruction? })` | zod schema + builder | [communication.ts](src/communication.ts) | `subject` and `recipient` are both optional (the EHR defaults the recipient to the network's first Practitioner); `payload[0]` is the exact words, `payload[1]` the instruction. |

## Why `.ts` import suffixes

Files inside this package import each other as `./patient.ts` and `./consent.ts`, and [tsconfig.json](tsconfig.json) sets `allowImportingTsExtensions`. The reason: apps/web consumes this package as source, and Next 16 with Turbopack does not resolve a `./patient.js` import to `patient.ts` inside workspace packages. Writing the real `.ts` extension works for every consumer. apps/web also lists the package in `transpilePackages` in [next.config.ts](../../apps/web/next.config.ts), and apps/mock-ehr bundles it into its build with tsup (`noExternal`, see [tsup.config.ts](../../apps/mock-ehr/tsup.config.ts)). Keep the `.ts` suffix on any new relative import here.

## Adding a resource

1. Add `src/<resource>.ts` with a zod schema, the inferred type, and a builder if callers need one. Use `.ts` suffixes for relative imports.
2. Re-export it from [src/index.ts](src/index.ts) with `export * from "./<resource>.ts";`.
3. Add any new identifier system or extension URL to `SYSTEM` or `EXT` (or a new const next to the schema, as Consent does).
4. Run `pnpm typecheck` from the repo root.

`pnpm --filter @pokta-clinic/fhir typecheck` runs only this package's type check.
