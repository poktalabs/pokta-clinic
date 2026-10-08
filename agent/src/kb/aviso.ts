import { AVISO } from "../../../apps/web/src/content/aviso-privacidad.ts";

// The full aviso as plain text, the same words the /privacidad page shows. The Consent node gets it in
// prompt mode so the agent can quote it exactly when the caller asks about a part of it.
export function renderAviso(): string {
  const sections = AVISO.sections.map((s) => [`## ${s.heading}`, ...s.paragraphs].join("\n\n"));
  return [
    `# ${AVISO.title}: ${AVISO.entity}`,
    `${AVISO.disclaimer.lead} ${AVISO.disclaimer.rest}`,
    ...sections,
  ].join("\n\n");
}
