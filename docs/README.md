# docs

Index of everything under `docs/`, plus the docs that live next to code.

## Start here

1. [../README.md](../README.md): what the project is, architecture, quick start.
2. [../CONTEXT.md](../CONTEXT.md): domain glossary. Read before reading code.
3. [explainers/architecture/index.html](explainers/architecture/index.html): one-page visual of what is built (open in a browser).
4. [adr/0001-nom-first-data-model-fhir-at-the-edge.md](adr/0001-nom-first-data-model-fhir-at-the-edge.md): why the data model is not FHIR-first.
5. [../apps/mock-ehr/README.md](../apps/mock-ehr/README.md), [../apps/web/README.md](../apps/web/README.md), [../packages/fhir/README.md](../packages/fhir/README.md): per-package guides.
6. [agent.md](agent.md) and [deploy.md](deploy.md) when you need to change the agent or ship.

## Index

| File | What it is |
|---|---|
| [adr/0001-nom-first-data-model-fhir-at-the-edge.md](adr/0001-nom-first-data-model-fhir-at-the-edge.md) | Decision: tables follow NOM-004 and NOM-024, FHIR R4 only at the edge, agent output pending Validation. |
| [agent.md](agent.md) | ElevenLabs agent configuration as code: what lives in `agent/` and how to push and pull. |
| [deploy.md](deploy.md) | Runbook for Render (mock EHR and Postgres) and Vercel (apps/web), including the Upstash store, the outbox cron, the EHR toggle (Render key risk) and the ElevenLabs post-call webhook. |
| [../apps/web/README.md](../apps/web/README.md) | The Next.js app: tool endpoints, store, tool timeline, outbox, EHR toggle and admin, post-call webhook, live page, env vars. |
| [explainers/architecture/index.html](explainers/architecture/index.html) | Standalone one-page explainer of what is built (fonts and logo in the same folder). |
| [questionnaire-rheum-first-visit.md](questionnaire-rheum-first-visit.md) | Draft for clinical review: the 11 required items of the first-visit rheumatology Questionnaire, with rationale and references. |
| [security/elevenlabs-api-keys.md](security/elevenlabs-api-keys.md) | Least-privilege setup for ElevenLabs API keys, key naming, rotation. |
| [../apps/mock-ehr/docs/data-model.md](../apps/mock-ehr/docs/data-model.md) | Expediente Demo data model: NOM sections behind each table and the FHIR mapping. |
