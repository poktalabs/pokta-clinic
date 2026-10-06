# ElevenLabs API keys: least-privilege setup

How pokta-clinic scopes its ElevenLabs credentials, written so it can be reused as a client reference. Sources, checked 2026-10-05: the API Keys guide (https://elevenlabs.io/docs/overview/administration/workspaces/api-keys.md) and the `PermissionType` enum in the API's OpenAPI spec (https://api.elevenlabs.io/openapi.json). The mapping from each task to a permission is inferred from endpoint names; ElevenLabs does not publish a per-endpoint table, so confirm each key with a read-only call and widen it only on a `403`.

The dashboard (Developers > API Keys) groups permissions by product with a No Access / Read / Write or No Access / Access choice per row; the API and audit logs use the `PermissionType` names. The tables below give both.

## Principles

1. **One key per job, not one key per project.** Developer tooling and the running app have different blast radii, so they get different keys.
2. **Grant the smallest scope that works.** Every key can be restricted by scope (which endpoints), by credit quota (a monthly character limit) and by IP allowlist (public IPs or CIDR ranges only).
3. **Short lives for human keys.** User API keys can expire after 15 minutes to 30 days; service account keys never expire, so they rely on rotation.
4. **Never in the browser or the repo.** Keys live in `.env.local` (gitignored) locally and in the hosting provider's encrypted environment in production. ElevenLabs is a GitHub secret-scanning partner: a key pushed to a public repository is disabled automatically (`disable_reason: exposed_publicly`).
5. **The public agent needs no key at all.** The widget talks to a public agent directly; no ElevenLabs key ever reaches a Patient's browser.

## Which kind of key

| | User API key | Service account API key |
|---|---|---|
| Belongs to | A person, inherits their access | A service account, independent of people |
| Expiry | Optional, 15 min to 30 days | None (rotate instead) |
| Requires | A Full Seat | A multi-seat plan, created by a workspace admin |
| Use for | Personal development, CLI | Backends, automation, production |

pokta-clinic runs on a single-seat personal workspace, so both keys below are user keys. On a client's multi-seat workspace, key 2 should be a service account key.

## The keys

Key names follow `<project>-<env>-<where>-<machine>-<os>`, so a key seen in a usage log or a leak alert points straight at the one place it lives.

**None of these keys runs the agent.** Conversations through the public agent (speech recognition, the LLM, text-to-speech) are billed to the workspace and authenticated by the agent's own settings, not by an API key. The keys only manage the agent or read its data.

### Key 1: `pokta-clinic-dev-local-charmeleon-macos` (developer laptop, CLI)

Used by `pnpm agent:push`, `agent:pull` and `agent:test` (the ElevenLabs CLI) to manage the agent as code.

| Dashboard row: setting | API permission | Why |
|---|---|---|
| ElevenAgents: Write | `convai_read`, `convai_write` | Pull and push the agent, workflow, tools, knowledge base, secrets and tests; run tests; read conversations while debugging |
| Voices: Read | `voices_read` | List voices to shortlist the es-MX voice |
| Models: Access | `models_read` | List TTS and LLM models available to the agent |
| Webhooks: Access | `webhooks_write` | Register the post-call webhook |

Every other dashboard row stays at No Access. If a read fails with `403` under Write alone, add Read on the same row.

Restrictions: expiry 30 days (the dashboard offers fixed options; 30 days covers the build and the review window), credit quota 10,000 credits (management calls are not expected to use credits; the quota caps agent test runs and limits what a leaked key can spend). No IP allowlist: home IPs change.

### Key 2: `pokta-clinic-runtime` (apps/web on Vercel)

Used only if apps/web reads conversation details (transcript and analysis) from the API, for example to show a Conversation by ID on the live page. If the post-call webhook payload is enough, skip this key entirely.

| Dashboard row: setting | API permission | Why |
|---|---|---|
| ElevenAgents: Read | `convai_read` | Fetch a Conversation's transcript, analysis and metadata by ID |

Restrictions: expiry 30 days, so it outlives the review window; a low credit quota (reads are not character-billed, so a near-zero quota caps abuse). No IP allowlist: Vercel functions do not have stable egress IPs on standard plans.

### Not keys: secrets that look like keys

| Secret | Where it lives | Purpose |
|---|---|---|
| Tool shared secret | An ElevenLabs workspace Secret (`secret__*` variables are only used in headers and never sent to the LLM) and Vercel env | Proves a tool call came from the agent |
| Post-call webhook secret | ElevenLabs webhook settings and Vercel env | Verifies `ElevenLabs-Signature: t=...,v0=HMAC-SHA256(secret, "t.rawBody")` |

## Explicitly not granted

`text_to_speech`, `speech_to_text` and the other generation scopes (the agent runtime is billed to the workspace, not to these keys), every `workspace_*` and `workspace_members_*` scope, `service_account_write`, `create_user_api_key`, `user_write`, `conversation_privacy_manage` and `copy_resources_cross_workspace`. A leaked dev key can then change the agent but cannot spend on generation, add people or mint new keys.

## Lifecycle

- **Rotate:** create the new key with the same permissions, switch the app over, then delete the old one.
- **Compromise:** disable the key at once, either in the dashboard or with `POST /v1/workspaces/api-keys/disable?api_key_name=self` (only if third-party disabling is allowed for the key).
- **Offboarding:** user keys follow their owner out of the workspace, which is why production belongs on service account keys.
