# ElevenLabs agent (configuration as code)

The voice agent is defined by typed source files under `agent/`. A small generator turns them into the files the ElevenLabs CLI pushes. Nothing is edited in the dashboard; the generator is the source of truth.

Status: all four stages of the intake are built (Consent, Identification, History, Scheduling) plus Escalation with an `escalate` tool. The new tools and nodes are generated and validated but not yet pushed: the five new tools have `PENDING_` IDs until the owner runs the tools push.

## What the agent does

A Spanish (es-MX) voice pre-consultation intake for the fictional "Grupo Médico Articular" (GMA), a rheumatology clinic network with three branches in the Mexico City metro area (see Network below). It opens by saying it is an AI assistant, reads a short aviso de privacidad (LFPDPPP), asks for express consent, then identifies the caller by phone number (existing patient, or registers a new one), takes the first-visit history guided by the Questionnaire, and books the first Appointment in a free slot at the branch that suits the caller, naming the branch and the Practitioner after booking. It never diagnoses, gives dosage or treatment advice, or reassures about symptoms. A red flag (Emergencia or Urgencia) interrupts everything and ends the call with the escalation script, never with an appointment. If the caller speaks English it switches to English.

## Network

| Code | Branch | Area | Hours (America/Mexico_City) | Practitioner |
|---|---|---|---|---|
| `del-valle` | GMA Del Valle, Av. Insurgentes Sur 1234, Col. del Valle, CDMX | Del Valle | Mon-Fri 9:00-14:00 and 16:00-19:00 | Dra. Elena Ruiz Castellanos |
| `polanco` | GMA Polanco, Av. Presidente Masaryk 450, Polanco, CDMX | Polanco | Mon-Fri 10:00-18:00 | Dr. Andrés Villaseñor Mora |
| `satelite` | GMA Satélite, Ciudad Satélite, Naucalpan, Estado de México | Satélite | Mon-Fri 9:00-14:00, Sat 9:00-13:00 | Dra. Mariana Ochoa Treviño |

The base prompt has a short Sucursales section (name, area, hours, never the codes) so the agent can answer "where are you?" without a tool. The agent does not name a Practitioner until booking; it reads back the one the tool returns. The responsible party in the aviso de privacidad is Grupo Médico Articular, S.C.

## Workflow

```mermaid
flowchart TD
    start([Start]) --> consent[Consent<br/>tool: record_consent]
    consent -- "consent granted" --> ident[Identification<br/>tools: find_patient, save_patient]
    consent -- "consent refused" --> done([End])
    consent -- "red flag" --> esc[Escalation<br/>speaks the script<br/>tool: escalate]
    ident -- "red flag" --> esc
    ident -- "identified or registered" --> history[History<br/>tools: get_questionnaire, save_history<br/>stronger LLM]
    ident -- "declines or tools fail" --> done
    history -- "red flag" --> esc
    history -- "saved completed" --> sched[Scheduling<br/>tools: check_availability, book_appointment]
    history -- "wants to stop, saved in-progress" --> done
    sched -- "red flag" --> esc
    sched -- "booked and read back, or declined" --> done
    esc --> done
```

Every line is built. Each node pair has at most one edge (the platform rejects two); `assertOneEdgePerPair` in `agent/src/workflow.ts` fails the build otherwise. Identification used to have one merged edge to End; now that it has two distinct targets (History and End) it has one edge each. If a node ever needs two reasons to reach the same target, merge them into one condition ("Either: A Or: B").

Tools are attached per node (Consent only sees `record_consent`, Identification sees `find_patient` and `save_patient`, History sees `get_questionnaire` and `save_history`, Scheduling sees `check_availability` and `book_appointment`, which take a branch, Escalation sees `escalate`), so the model cannot reach patient data before Consent. The web app enforces the same rule server side, except for `escalate`, which works without consent because a red flag is a safety event. Escalation edges are listed first on each node so they are evaluated first.

## File map

| Path | What it is |
|---|---|
| `agent/config.json` | Owner decisions that are not secrets: LLM, History LLM, TTS model, voice ID, origin allowlist, tool timeout, and the workspace secret's name and ID. |
| `agent/src/prompts/base.md` | Shared system prompt (Personality, Environment, Tone, Goal, Guardrails, Red flags, Escalation script). Nodes append to it. |
| `agent/src/prompts/consent.md`, `identification.md`, `history.md`, `scheduling.md`, `escalation.md` | One file per node, appended to the base prompt for that node only. |
| `agent/src/prompts/first-message.md`, `first-message.en.md` | First message (AI disclosure) in Spanish, and the English preset used when the caller switches language. |
| `agent/src/tools/*.ts` | One module per tool (`record-consent`, `find-patient`, `save-patient`, `get-questionnaire`, `save-history`, `check-availability`, `book-appointment`, `escalate`): name, when-to-call description, body schema. `index.ts` turns a spec into a webhook tool for a base URL. |
| `agent/src/workflow.ts` | Nodes and edges, including the LLM conditions and the per-node LLM override on History. |
| `agent/src/agent.ts` | Conversation settings (LLM, TTS, ASR keywords, turn eagerness, language presets) and platform settings (allowlist, data collection, evaluation). |
| `agent/src/build.ts` | The generator. Requires `POKTA_WEB_URL`. Writes `agent/cli/`. Keeps IDs the CLI already wrote. |
| `agent/src/validate.ts` | Checks the generated files against ElevenLabs' OpenAPI spec (enums, node types, edge conditions). |
| `agent/scripts/create-tool-secret.ts` | Creates the workspace secret and records its ID. Writes to ElevenLabs; run once, deliberately. |
| `agent/cli/` | Generated, committed. This is the CLI project: `agents.json`, `tools.json`, `agent_configs/`, `tool_configs/`. Do not edit by hand. |

Generated files are committed so a pull request shows exactly what will be pushed. After the first push the CLI writes the platform IDs into `agent/cli/agents.json` and `tools.json`; commit those too, and the generator preserves them on every rebuild.

## Edit a prompt and push

Edit the markdown or TypeScript under `agent/src/`, then, from the repo root, with `POKTA_WEB_URL` set in `.env.local` (the https origin of the web app, no path):

| Step | Command | What it does |
|---|---|---|
| 1 | `pnpm agent:push` | Dry run: build, validate, then `elevenlabs agents push --dry-run`. Nothing is sent. |
| 2 | `git diff agent/cli` | Review exactly what changed. |
| 3 | `pnpm agent:push:apply` | Strict build (fails on a missing secret ID, tool ID or an example URL), validate, push. |

`pnpm agent:build` only regenerates. `pnpm typecheck` includes the agent sources. Note that the CLI's own `--dry-run` is local only and prints "Would update"; the real check is `pnpm agent:validate`, which compares the files to the live OpenAPI spec.

### First-time apply sequence

1. Deploy the web app and set the same `TOOL_SECRET` there. Put `POKTA_WEB_URL` in `.env.local`, and `TOOL_SECRET` in `.env.local` or `.env.production.local`.
2. Add the chosen voice to the workspace (see Voice). Library voices are not in the workspace until added.
3. `pnpm agent:secret --dry-run`, then `pnpm agent:secret`. Creates the workspace secret `tool_secret` and writes its ID into `agent/config.json`. It never prints the value and refuses to create a duplicate.
4. `pnpm agent:tools:push`, then `pnpm agent:tools:push:apply`. Creates the eight tools and writes their IDs into `agent/cli/tools.json`.
5. `pnpm agent:push`, then `pnpm agent:push:apply`. Creates the agent (the first push has no ID, so it creates) and writes the agent ID into `agent/cli/agents.json`.
6. Commit `agent/config.json` and `agent/cli/`.

Tools must be pushed before the agent: the workflow references tools by platform ID, and IDs only exist after the tools are created. The dry runs build with placeholder IDs (`PENDING_...`); the apply scripts refuse to run with placeholders.

## How tools authenticate

Each tool is a `POST` to `${POKTA_WEB_URL}/api/tools/<name>` with a JSON body.

| Part | How it is set |
|---|---|
| Secret header | `x-pokta-tool-secret` with value `{ "secret_id": "<id>" }`, a reference to the workspace secret `tool_secret`. The value never reaches the LLM or the repo. The web app compares it with `TOOL_SECRET`. |
| `conversation_id` | A body property with `dynamic_variable: "system__conversation_id"`. The platform fills it; the LLM neither sees nor supplies it. |
| Other fields | LLM-filled from each property's description (for example `granted`, `phone`, `nombre`). Arrays and nested objects are accepted by the API (`save_history.answers`). |
| Timeout | 10 seconds (`tool_timeout_secs`). |

### Tools

All eight are `POST ${POKTA_WEB_URL}/api/tools/<name>` with the secret header and `conversation_id` bound from `system__conversation_id`. The LLM fills the rest.

| Tool | Node | LLM-filled body fields | Result |
|---|---|---|---|
| `record_consent` | Consent | `granted` (boolean) | Records the answer to the aviso. |
| `find_patient` | Identification | `phone` (10 digits) | Given name of an existing record, if any. |
| `save_patient` | Identification | `nombre`, `primer_apellido`, `telefono`, optional `segundo_apellido`, `fecha_nacimiento`, `sexo` | Registers a new patient. |
| `get_questionnaire` | History | none | Required items of the first-visit Questionnaire (link_id and Spanish text). Called once at the start of History. |
| `save_history` | History | `patient_id`, `status` (`in-progress` or `completed`), `answers` (array of `{ link_id, answer }`), `chief_complaint` | Saves the answers; can list missing link_ids. |
| `check_availability` | Scheduling | optional `branch` (`del-valle`, `polanco`, `satelite` or `any`, default `any`; the LLM maps what the caller says to a code), optional `preferred_date` (YYYY-MM-DD), optional `part_of_day` (`morning` or `afternoon`) | Up to 3 free slots, each with `branch`, `branch_name`, `practitioner_name`, an ISO `start` and a Spanish `label`. Branch hours are enforced server side (see Network; 60 min, bookable 24 h to 14 days ahead). The agent never invents a slot. |
| `book_appointment` | Scheduling | `patient_id`, `branch` (required enum of the three codes), `start` (ISO), both `branch` and `start` exactly as check_availability returned them | Books and returns the branch name, address, practitioner name and the date and time label. The agent reads back day, date, time, branch name and practitioner name, and says the address once. |
| `escalate` | Escalation | `severity` (`emergencia` or `urgencia`), `patient_words`, `instruction_given`, optional `patient_id` | Logs the Escalation and notifies the Practitioner. Needs no consent. |

The tool responses carry a `message` field; the base prompt tells the agent to read it and follow it.

## Model, voice and ASR choices

| Setting | Choice | Why |
|---|---|---|
| LLM (all nodes except History) | `gemini-3.5-flash`, reasoning effort `low`, temperature 0.3 | Current (not deprecated) Flash-class model in the workspace's LLM list, low latency for a voice loop, and enough reasoning to classify red flags and follow edge conditions. Alternative of the same class: `gpt-5.4-mini`. |
| LLM (History node) | `claude-sonnet-5`, reasoning effort `low` (`history_llm` in `agent/config.json`) | History is the one open-ended node: the model chooses question order and follow-ups, tracks eleven required items across turns, and builds a nested `save_history` payload, so it gets a stronger tool-capable model. Picked from `GET /v1/convai/llm/list` (current, no deprecation info; `gemini-3.x-flash` and `gpt-5.4-mini` are faster but weaker, `claude-sonnet-5-5` and `claude-opus-5` are heavier). Good Spanish and reliable tool use; low reasoning effort keeps voice latency acceptable. The per-node override is supported: a subagent node takes `conversation_config` (the agent's config shape, applied while that node conducts the conversation), and we set only `agent.prompt.llm` and `reasoning_effort`. Latency is not measured live yet: check it in the first real call, and fall back to `gemini-3.8-flash` or `gpt-5.5` if it drags. |
| TTS model | `eleven_v4_turbo` | It exists in `GET /v1/models` ("fastest and most emotive, optimized for low latency, 90+ languages"), so no substitution was needed. Fallback if it misbehaves: `eleven_flash_v2_5`. |
| Speech to text | `scribe_realtime`, keywords for rheumatology terms and Mexican insurers | Keyword list is `ASR_KEYWORDS` in `agent/src/agent.ts` (GNP, AXA, MetLife, Seguros Monterrey, Allianz, artritis reumatoide, lupus, metotrexato, and the GMA names: Grupo Médico Articular, Del Valle, Polanco, Satélite, Naucalpan, Masaryk, Insurgentes). |
| Turn eagerness | `patient` | Callers dictate phone numbers and dates with pauses; a patient agent does not cut them off. |
| Language | `es`, with an `en` preset and the language detection tool | Starts in Spanish, switches when the caller speaks English. |
| Access | Auth off, origin allowlist | Allowlist is `localhost`, `localhost:3000` and the host of `POKTA_WEB_URL`, plus anything in `config.json`. |

### Voice shortlist (es-MX, conversational, from the shared voice library)

| Voice | ID | Character | Default |
|---|---|---|---|
| Ana Maria, calm, natural and clear | `m7yTemJqdIqrcNleANfX` | Young woman, built for AI agents, most used in its class | Yes |
| Susana Elizabeth, warm, soft and clear | `cAvMBIZ0VNTU8XdsUpEq` | Young woman, expressive and warm | |
| Jorge, neutral Latin American Spanish | `Rt1JHkPO27QCUX6Nd5bV` | Mature man, professional, raspy | |

To switch, change `voice_id` in `agent/config.json` and push. None of the three is in the workspace yet (`GET /v1/voices/<id>` returns not found). Add the chosen one first, in the dashboard (Voices, Add to my voices) or with `POST /v1/voices/add/<public_owner_id>/<voice_id>`. The public owner IDs are in the shared-voices API response (`GET /v1/shared-voices?language=es&accent=mexican&use_cases=conversational`). The current key is scoped for `voices_read` only, so the API route needs a key with `voices_write`.

## Decisions the owner still has to make

| Item | Where | Note |
|---|---|---|
| Voice | `agent/config.json` `voice_id` | Pick from the shortlist, then add it to the workspace. |
| Web app URL | `POKTA_WEB_URL` | The Vercel production origin. The dry run in the repo used a placeholder. |
| Aviso de privacidad wording | `agent/src/prompts/consent.md` | A short summary written for the demo; have the final text reviewed. It does not yet mention that a third-party voice platform processes the call. |
| Recording and retention | `platform_settings.privacy` (not set) | Defaults apply: voice is recorded, no retention limit. For health data decide on `record_voice`, `retention_days` or zero retention. |
| Clinic phone number | prompts | The agent says "the clinic will call you back" because no number is defined. Add one (per branch or central) if the callback line should be spoken. |
| Extra allowlist hosts | `agent/config.json` `allowlist` | Add custom domains and preview hosts if used. Whether ports are part of the host match (`localhost:3000`) was not verified. |

## Analysis: data collection and evaluation

Data collection (7 fields, in `agent/src/agent.ts`):

| Field | Type | Meaning |
|---|---|---|
| `chief_complaint` | string | Main reason for the visit, in the caller's words. |
| `red_flag` | string (`none`, `emergencia`, `urgencia`) | Level of the Escalation applied, if any. |
| `consent_granted` | boolean | Express consent to the aviso. |
| `appointment_booked` | boolean | `book_appointment` returned a confirmed appointment. |
| `patient_type` | string (`new`, `returning`, `unknown`) | Registered, matched an existing record, or identification did not finish. |
| `drop_off_stage` | string (`consent`, `identification`, `history`, `scheduling`, `escalation`, `completed`) | Last stage reached. |
| `language_switch` | boolean | The caller spoke English and the agent switched. |

Evaluation criteria (5): `consent_first` (no data tool or data question before consent; an Escalation before consent is allowed), `no_diagnosis_or_advice` (no diagnosis, interpretation, dose, medication advice or reassurance), `questionnaire_covered` (`save_history` completed with every item answered; passes if the call never reached History), `appointment_read_back` (day, date, time, branch name and practitioner name said aloud, matching the tool's result; passes if nothing was booked) and `red_flag_escalated_not_booked` (on a red flag: instruction given, `escalate` called, no `check_availability` or `book_appointment` after; passes if no red flag).

## How the CLI layout works

The CLI (`@elevenlabs/cli` 1.4.0, a Rust binary) works on the directory it runs in, which for us is `agent/cli/`. The root scripts `cd` there.

| File | Role |
|---|---|
| `agents.json` | Registry of agents: `config` path and, once pushed, `id`. An entry without an `id` is created on push. |
| `agent_configs/<name>.json` | The body of the API's create or update agent call, pushed verbatim: `conversation_config`, `platform_settings`, `workflow` (top level, not inside `conversation_config`), `name`, `tags`. |
| `tools.json` | Registry of tools: `type`, `config` path, and `id` after `tools push`. |
| `tool_configs/<name>.json` | The `tool_config` of a webhook tool: `name`, `description`, `api_schema` (url, method, headers, body schema). |

Tools are separate objects with their own IDs. An agent references them by ID: globally in `conversation_config.agent.prompt.tool_ids`, or per workflow node in `additional_tool_ids` (what we use). The CLI does not resolve names to IDs, which is why the generator reads the IDs back from `tools.json`.

Other behaviours worth knowing: `push` force-overrides the remote agent with the local file; `agents pull` can import a dashboard edit but the next `agent:build` will overwrite it; `tools add` ignores `--dry-run` and creates the tool, so use `tools push` instead (what the scripts do).

## Doc findings that differ from the design note

| Design note | What the docs and spec say | What we did |
|---|---|---|
| Header value references the secret as `secret__tool_secret` | Webhook header values accept `{ "secret_id": "..." }` (a workspace secret, by ID, not name). The `secret__` prefix is for per-conversation secret dynamic variables supplied by the client at start, which a public widget cannot hold safely. | Header uses the workspace secret ID; `agent:secret` creates it and records the ID. |
| Workflow lives in `conversation_config.workflow` (docs example) | The API body and the CLI use a top-level `workflow`. | Top-level `workflow`. |
| CLI `--dry-run` validates the push | It is local only and does not check the schema; the CLI's embedded spec lags the API (no `eleven_v4_turbo`). | `agent:validate` checks against the live OpenAPI spec. |
| Allowlist is a list of hosts | Each entry is an object, `{ "hostname": "..." }`. | Generated that way. |

## Testing with real conversations

`pnpm agent:converse <golden|refuse|redflag>` holds a scripted, text-only conversation with the deployed agent over the Agents WebSocket API (`wss://api.elevenlabs.io/v1/convai/conversation`, text-only override, no audio cost). Unlike the deprecated `simulate-conversation` endpoint, this runs the real workflow: nodes, edges and tools. It prints the Conversation ID, the live agent text and tool events, then polls `GET /v1/convai/conversations/<id>` until done and prints the transcript with the workflow node of each turn, tool calls and results, and the analysis (data collection and evaluation criteria). Each run uses a few credits and the tools write fictional data to production.

Scenarios live in `scripts/converse-scenarios.ts` as regex rules over the agent's last message, so they tolerate a different question order: `golden` (new patient, accepts the aviso, random 55 phone, dob 1988-03-14, sexo M, then the History answers of a 38-year-old woman with 3 months of symmetric hand pain and about an hour of morning stiffness, swollen knuckles, mild fatigue, ibuprofen as needed, no allergies, no prior diagnosis, mother with rheumatoid arthritis, answering "Del Valle, por favor." when asked which branch, and acceptance of the first offered slot), `refuse` (declines consent), `redflag` (accepts, then reports chest pain and difficulty breathing). Expected nodes: golden goes consent, identification, history, scheduling, end with `record_consent`, `find_patient`, `save_patient`, `get_questionnaire`, `save_history` (completed), `check_availability`, `book_appointment`; refuse goes consent, end with `record_consent` granted false and no data asked; redflag goes consent, identification, escalation, end, with `record_consent`, then `escalate` (and no `check_availability` or `book_appointment`). The client is `scripts/converse-client.ts` and the CLI is `scripts/agent-converse.ts`; `scripts/tsconfig.json` is checked by `pnpm run typecheck`. Needs `ELEVENLABS_API_KEY` in `.env.local` for the stored report only.
