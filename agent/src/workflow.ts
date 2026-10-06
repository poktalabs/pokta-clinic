import type { Workflow } from "./types.ts";
import { prompt } from "./prompts.ts";

export interface WorkflowToolIds {
  record_consent: string;
  find_patient: string;
  save_patient: string;
}

const RED_FLAG =
  "The caller reports or describes an Emergencia or Urgencia red flag at any point: chest pain, stroke signs, difficulty breathing, thoughts of suicide or self-harm, suspected giant cell arteritis with vision changes, a hot swollen joint with fever, cauda equina symptoms, or fever while taking methotrexate or a biologic.";

// Extension point: where a patient goes once identified. Today the call ends there, with the
// identification prompt saying "we will continue in the next version". The platform allows one edge
// per node pair, so while the next stage is the end node, "identified" and "stopped" share one edge.
// When the History stage is added: define its node, point identification_to_next at it with the
// IDENTIFIED condition alone, and restore a separate identification_to_end with STOPPED.
const IDENTIFIED =
  "The caller was identified (confirmed their name on an existing record) or was registered with save_patient, and was told the intake continues in the next version.";
const STOPPED =
  "The caller does not want to give their data or asks to stop, or the tools failed repeatedly, and the caller was told the practice will contact them and given a goodbye.";

// Start -> Consent -> Identification -> (End). Escalation is reachable from Consent and
// Identification through an LLM-condition edge, and is listed first so it is evaluated first.
// Tools are attached per node, so the model cannot even see find_patient or save_patient until
// Consent has been granted (the web app also enforces this server side).
export function buildWorkflow(ids: WorkflowToolIds): Workflow {
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
        edge_order: ["identification_to_escalation", "identification_to_next"],
      },
      escalation: {
        type: "override_agent",
        label: "Escalation",
        additional_prompt: prompt("escalation"),
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
          condition: "The caller refused consent (record_consent was called with granted false), was told they can call the practice directly, and was given a goodbye.",
        },
      },

      identification_to_escalation: {
        source: "identification",
        target: "escalation",
        forward_condition: { type: "llm", condition: RED_FLAG },
      },
      identification_to_next: {
        source: "identification",
        target: "end_node",
        forward_condition: { type: "llm", condition: `Either: ${IDENTIFIED} Or: ${STOPPED}` },
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
