import { CONVERSATION_SYSTEM, FHIR_VERSION } from "@pokta-clinic/fhir";

// The CapabilityStatement is how a FHIR client discovers what this server supports; it is public.
const token = (name: string) => ({ name, type: "token" });
const reference = (name: string) => ({ name, type: "reference" });

export const RESOURCES = [
  { type: "Patient", interaction: ["read", "search-type", "create"], searchParam: [token("phone"), token("identifier")] },
  { type: "Organization", interaction: ["read", "search-type"], searchParam: [] },
  { type: "Location", interaction: ["read", "search-type"], searchParam: [token("identifier")] },
  { type: "Practitioner", interaction: ["read", "search-type"], searchParam: [] },
  { type: "PractitionerRole", interaction: ["read", "search-type"], searchParam: [reference("location"), reference("practitioner")] },
  { type: "Questionnaire", interaction: ["read", "search-type"], searchParam: [{ name: "url", type: "uri" }] },
  {
    type: "QuestionnaireResponse",
    interaction: ["read", "create", "update", "search-type"],
    searchParam: [token("identifier"), reference("subject")],
  },
  { type: "Consent", interaction: ["create", "search-type", "update"], searchParam: [token("identifier")] },
  { type: "Appointment", interaction: ["read", "create", "search-type"], searchParam: [reference("patient"), reference("location"), token("identifier")] },
  { type: "Communication", interaction: ["create", "search-type"], searchParam: [token("identifier")] },
] as const;

export const capabilityStatement = () => ({
  resourceType: "CapabilityStatement",
  status: "active",
  date: "2026-10-06",
  kind: "instance",
  software: { name: "Expediente Demo", version: "0.1.0" },
  fhirVersion: FHIR_VERSION,
  format: ["json"],
  rest: [
    {
      mode: "server",
      security: {
        service: [{ text: "OAuth2 client credentials" }],
        extension: [
          {
            url: "http://fhir-registry.smarthealthit.org/StructureDefinition/oauth-uris",
            extension: [{ url: "token", valueUri: "/oauth/token" }],
          },
        ],
        description: `Conversation identifiers use system ${CONVERSATION_SYSTEM}`,
      },
      resource: RESOURCES.map((r) => ({ type: r.type, interaction: r.interaction.map((code) => ({ code })), searchParam: r.searchParam })),
    },
  ],
});
