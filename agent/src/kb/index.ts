import { renderAviso } from "./aviso.ts";
import { renderFaq } from "./faq.ts";
import { renderPrimeraVisita } from "./primera-visita.ts";

// Knowledge base documents, rendered from typed sources and uploaded as text documents by
// `pnpm agent:kb:push:apply` (agent/scripts/push-kb.ts). The agent references them by platform ID.
//   scope "agent":   on the agent's knowledge base, retrieved with RAG on every node (usage_mode auto).
//   scope "consent": only on the Consent node, injected whole into its prompt (usage_mode prompt),
//                    because the legal text must be quoted exactly, never paraphrased from a chunk.
export interface KbDoc {
  /** Stable key: file name under agent/cli/kb_docs/ and entry in knowledge_base.json. */
  key: string;
  /** Document name on ElevenLabs; push-kb reuses a document with exactly this name. */
  name: string;
  render: () => string;
  scope: "agent" | "consent";
  usageMode: "auto" | "prompt";
}

export const KB_DOCS: KbDoc[] = [
  { key: "primera-visita", name: "GMA, guía para su primera consulta", render: renderPrimeraVisita, scope: "agent", usageMode: "auto" },
  { key: "faq", name: "GMA, preguntas frecuentes", render: renderFaq, scope: "agent", usageMode: "auto" },
  { key: "aviso", name: "GMA, aviso de privacidad", render: renderAviso, scope: "consent", usageMode: "prompt" },
];

// Multilingual model: the documents and the callers are Spanish. The agent's rag config and the RAG
// index push-kb computes must use the same model, or retrieval finds no index.
export const RAG_EMBEDDING_MODEL = "multilingual_e5_large_instruct";

/** Registry of uploaded documents, agent/cli/knowledge_base.json. push-kb writes id and sha256. */
export interface KbRegistryEntry {
  key: string;
  name: string;
  file: string;
  id?: string;
  /** sha256 of the file content last uploaded, so a rebuild can tell when a document needs a push. */
  sha256?: string;
}
export const KB_REGISTRY = "knowledge_base.json";
export const kbFile = (key: string) => `kb_docs/${key}.md`;
