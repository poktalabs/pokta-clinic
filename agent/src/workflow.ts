import type { Workflow } from "./types.ts";
import type { AgentConfig } from "./config.ts";
import { prompt } from "./prompts.ts";

export interface WorkflowToolIds {
  record_consent: string;
  find_patient: string;
  save_patient: string;
  get_questionnaire: string;
  save_history: string;
  check_availability: string;
  book_appointment: string;
  reschedule_appointment: string;
  request_callback: string;
  escalate: string;
}

const RED_FLAG =
  "The caller reports or describes an Emergencia or Urgencia red flag at any point: chest pain, stroke signs, difficulty breathing, thoughts of suicide or self-harm, suspected giant cell arteritis with vision changes, a hot swollen joint with fever, cauda equina symptoms, or fever while taking methotrexate or a biologic.";

// The platform allows one edge per node pair. Identification has two distinct targets (History, End),
// so each outcome has its own edge. Any future stage that can be reached for two reasons from the same
// node must merge those reasons into one edge condition ("Either: A Or: B"), as this workflow did
// while Identification led only to End.
const IDENTIFIED =
  "The caller was identified (confirmed their name on an existing record) or was registered with save_patient, and was told the questions about their health come next.";
const STOPPED =
  "Either: the caller does not want to give their data or asks to stop, or the tools failed repeatedly, and the caller was told the clinic will contact them and given a goodbye. Or: a returning caller confirmed their name, wants to keep the upcoming appointment find_patient returned, and was given a goodbye.";
// A returning caller skips History when there is nothing to ask: they want to change their appointment,
// would rather schedule than wait for a pending callback, or their questions are already saved.
const RETURNING_TO_SCHEDULING =
  "A returning caller confirmed their name on an existing record, and either: they want to change the upcoming appointment find_patient returned, or they want to schedule now instead of waiting for the pending callback, or find_patient returned history_completed true. They were told you will look for a day and time.";

// Start -> Consent -> Identification -> History -> Scheduling -> End. Escalation is reachable from every
// stage after Start through an LLM-condition edge, and is listed first so it is evaluated first.
// History alone runs on a stronger LLM (a per-node override); every other node uses the agent's LLM.
// Tools are attached per node, so the model cannot even see find_patient or save_patient until
// Consent has been granted (the web app also enforces this server side).
export function buildWorkflow(ids: WorkflowToolIds, config: Pick<AgentConfig, "history_llm" | "history_llm_reasoning_effort">): Workflow {
  return assertOneEdgePerPair({
    nodes: {
      start_node: { type: "start", edge_order: ["start_to_consent"] },
      consent: {
        type: "override_agent",
        label: "Consent",
        additional_prompt: prompt("consent"),
        additional_tool_ids: [ids.record_consent],
        edge_order: ["consent_to_escalation", "consent_to_identification", "consent_to_end"],
      },
      identification: {
        type: "override_agent",
        label: "Identification",
        additional_prompt: prompt("identification"),
        additional_tool_ids: [ids.find_patient, ids.save_patient],
        edge_order: ["identification_to_escalation", "identification_to_scheduling", "identification_to_history", "identification_to_end"],
      },
      // Free-form, adaptive interview guided by the Questionnaire. The model picks order and follow-ups, so
      // it gets a stronger tool-capable LLM than the scripted stages.
      history: {
        type: "override_agent",
        label: "History",
        additional_prompt: prompt("history"),
        additional_tool_ids: [ids.get_questionnaire, ids.save_history],
        conversation_config: {
          agent: { prompt: { llm: config.history_llm, reasoning_effort: config.history_llm_reasoning_effort } },
        },
        edge_order: ["history_to_escalation", "history_to_scheduling", "history_to_end"],
      },
      scheduling: {
        type: "override_agent",
        label: "Scheduling",
        additional_prompt: prompt("scheduling"),
        additional_tool_ids: [ids.check_availability, ids.book_appointment, ids.reschedule_appointment, ids.request_callback],
        edge_order: ["scheduling_to_escalation", "scheduling_to_end"],
      },
      // The escalate tool works without consent: a red flag is a safety event.
      escalation: {
        type: "override_agent",
        label: "Escalation",
        additional_prompt: prompt("escalation"),
        additional_tool_ids: [ids.escalate],
        edge_order: ["escalation_to_end"],
      },
      end_node: { type: "end" },
    },
    edges: {
      start_to_consent: { source: "start_node", target: "consent", forward_condition: { type: "unconditional" } },

      consent_to_escalation: { source: "consent", target: "escalation", forward_condition: { type: "llm", condition: RED_FLAG } },
      consent_to_identification: {
        source: "consent",
        target: "identification",
        forward_condition: { type: "llm", condition: "The record_consent tool was called with granted true and the caller was thanked." },
      },
      consent_to_end: {
        source: "consent",
        target: "end_node",
        forward_condition: {
          type: "llm",
          condition: "The caller refused consent (record_consent was called with granted false) and, after that tool call, the agent has already said in its own spoken message that they can contact a branch directly and said goodbye. The record_consent call alone does not meet this condition.",
        },
      },

      identification_to_escalation: {
        source: "identification",
        target: "escalation",
        forward_condition: { type: "llm", condition: RED_FLAG },
      },
      identification_to_scheduling: {
        source: "identification",
        target: "scheduling",
        forward_condition: { type: "llm", condition: RETURNING_TO_SCHEDULING },
      },
      identification_to_history: {
        source: "identification",
        target: "history",
        forward_condition: { type: "llm", condition: IDENTIFIED },
      },
      identification_to_end: {
        source: "identification",
        target: "end_node",
        forward_condition: { type: "llm", condition: STOPPED },
      },

      history_to_escalation: { source: "history", target: "escalation", forward_condition: { type: "llm", condition: RED_FLAG } },
      history_to_scheduling: {
        source: "history",
        target: "scheduling",
        forward_condition: {
          type: "llm",
          condition: "save_history was called with status completed and the response did not list missing items, and the caller was told the next step is choosing a day and time.",
        },
      },
      history_to_end: {
        source: "history",
        target: "end_node",
        forward_condition: {
          type: "llm",
          condition: "The caller wants to stop the questions or the tools failed repeatedly, save_history was called with status in-progress (if any answer had been given), and the caller was told the clinic will contact them and given a goodbye.",
        },
      },

      scheduling_to_escalation: { source: "scheduling", target: "escalation", forward_condition: { type: "llm", condition: RED_FLAG } },
      scheduling_to_end: {
        source: "scheduling",
        target: "end_node",
        forward_condition: {
          type: "llm",
          condition: "After the last tool result, the agent has already said, in its own spoken message, a goodbye to the caller, and either: book_appointment or reschedule_appointment confirmed the appointment and its day, date and time were read back; or request_callback was called and the caller was told when the clinic will call; or the caller declined both an appointment and a callback. A tool call or tool result alone does not meet this condition.",
        },
      },

      escalation_to_end: {
        source: "escalation",
        target: "end_node",
        forward_condition: {
          type: "llm",
          condition: "The escalation script was fully delivered: the instruction was given and repeated, and the caller confirmed or said goodbye.",
        },
      },
    },
  });
}

// The platform rejects two edges between the same pair of nodes; fail at build time instead of on push.
function assertOneEdgePerPair(workflow: Workflow): Workflow {
  const seen = new Map<string, string>();
  for (const [id, edge] of Object.entries(workflow.edges)) {
    const pair = `${edge.source} -> ${edge.target}`;
    const other = seen.get(pair);
    if (other) throw new Error(`workflow: edges ${other} and ${id} both connect ${pair}`);
    seen.set(pair, id);
  }
  return workflow;
}
