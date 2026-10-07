import type { ToolSpec } from "../types.ts";
import { callerEmail } from "./caller-email.ts";
import { conversationId } from "./conversation-id.ts";

// Mirrors apps/web/src/app/api/tools/save_patient/route.ts. CURP is deliberately not collected.
export const savePatient: ToolSpec = {
  name: "save_patient",
  description:
    "Registers a new patient. Call it only when find_patient found no record, or the caller said they are not the person on the record, and you have at least the nombre, primer apellido and phone. Pass optional fields only if the caller gave them; never invent or guess a value. Call it once per person. The response has a message field that says what to do next; follow it.",
  required: ["conversation_id", "nombre", "primer_apellido", "telefono"],
  properties: {
    conversation_id: conversationId,
    nombre: { type: "string", description: "Given name(s) of the patient, as the caller said them. Example: María Fernanda." },
    primer_apellido: { type: "string", description: "First surname (apellido paterno). Example: Hernández." },
    segundo_apellido: {
      type: "string",
      description: "Second surname (apellido materno). Omit it if the caller has none or does not want to say.",
    },
    telefono: { type: "string", description: "The same 10-digit phone number used with find_patient, digits only." },
    fecha_nacimiento: {
      type: "string",
      description: "Date of birth in YYYY-MM-DD format. Convert what the caller says and confirm it aloud first. Omit it if not given. Example: 1984-03-27.",
    },
    sexo: {
      type: "string",
      enum: ["H", "M"],
      description: "Sex as recorded on the caller's official ID: H for hombre, M for mujer. Omit it if the caller prefers not to say.",
    },
    caller_email: callerEmail,
  },
};
