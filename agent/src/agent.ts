import type { AgentConfig, BuildEnv } from "./config.ts";
import { prompt } from "./prompts.ts";
import type { JsonObject, Workflow } from "./types.ts";

// Rheumatology terms and the insurers a Mexico City practice sees. Boosts speech recognition.
export const ASR_KEYWORDS = [
  "GNP", "AXA", "MetLife", "Seguros Monterrey", "Allianz", "Seguros Atlas", "Zurich", "Banorte",
  "reumatología", "reumatóloga", "artritis reumatoide", "artritis psoriásica", "lupus",
  "espondilitis anquilosante", "síndrome de Sjögren", "esclerodermia", "fibromialgia", "gota",
  "polimialgia reumática", "arteritis de células gigantes", "metotrexato", "leflunomida",
  "hidroxicloroquina", "adalimumab", "etanercept", "rituximab", "tocilizumab", "prednisona",
  "CURP", "ARCO", "LFPDPPP", "Línea de la Vida",
];

export interface AgentParts {
  config: AgentConfig;
  env: BuildEnv;
  workflow: Workflow;
  /** Tool IDs available to every node (none today; tools are attached per node). */
  globalToolIds: string[];
}

export function buildAgent({ config, env, workflow, globalToolIds }: AgentParts): JsonObject {
  const allowlist = [...new Set([...config.allowlist, env.baseHost])];
  return {
    name: config.agent_name,
    tags: ["pokta-clinic"],
    conversation_config: {
      agent: {
        language: config.language,
        first_message: prompt("first-message"),
        disable_first_message_interruptions: true,
        prompt: {
          prompt: prompt("base"),
          llm: config.llm,
          reasoning_effort: config.llm_reasoning_effort,
          temperature: config.llm_temperature,
          timezone: "America/Mexico_City",
          tool_ids: globalToolIds,
          built_in_tools: {
            language_detection: {
              type: "system",
              name: "language_detection",
              description: "",
              params: { system_tool_type: "language_detection" },
            },
          },
        },
      },
      // English is the only other language. The preset gives the language detection tool a target.
      language_presets: {
        en: { overrides: { agent: { language: "en", first_message: prompt("first-message.en") } } },
      },
      asr: { provider: "scribe_realtime", quality: "high", user_input_audio_format: "pcm_16000", keywords: ASR_KEYWORDS },
      turn: { turn_eagerness: "patient" },
      tts: { model_id: config.tts_model_id, voice_id: config.voice_id, agent_output_audio_format: "pcm_16000" },
      conversation: {
        max_duration_seconds: config.max_duration_seconds,
        client_events: ["audio", "interruption", "user_transcript", "agent_response", "agent_response_correction"],
      },
    },
    workflow: workflow as unknown as JsonObject,
    platform_settings: {
      // Public agent: no signed token, only the origin allowlist.
      auth: { enable_auth: false, allowlist: allowlist.map((hostname) => ({ hostname })) },
      data_collection: {
        consent_granted: {
          type: "boolean",
          description: "True if the caller expressly agreed to the aviso de privacidad during the call, false if they refused or the call ended before they answered.",
        },
        patient_type: {
          type: "string",
          enum: ["new", "returning", "unknown"],
          description: "new if the caller was registered as a new patient, returning if they confirmed an existing record, unknown if identification did not finish.",
        },
        drop_off_stage: {
          type: "string",
          enum: ["consent", "identification", "escalation", "completed"],
          description: "The last stage of the workflow the conversation reached: consent, identification, escalation (a red flag ended the call), or completed (identification finished).",
        },
      },
      evaluation: {
        criteria: [
          {
            id: "consent_first",
            name: "Consent first",
            type: "prompt",
            use_knowledge_base: false,
            conversation_goal_prompt:
              "Pass only if no tool other than record_consent was called before record_consent was called with granted true, and no personal or health data was requested before that. Fail if find_patient or save_patient was called, or the caller was asked for a phone number, name or date of birth, before consent was granted. A conversation with no tool calls passes.",
          },
        ],
      },
    },
  };
}
