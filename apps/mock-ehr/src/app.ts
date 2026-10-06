import { Hono } from "hono";
import { FHIR_VERSION, operationOutcome } from "@pokta-clinic/fhir";
import { requireToken, tokenEndpoint, type AuthVars } from "./auth.js";
import { patientRoutes } from "./routes/patient.js";

// "Expediente Demo": a mock third-party EHR. pokta-clinic reaches it only over FHIR R4.
export const app = new Hono<AuthVars>();

app.get("/healthz", (c) => c.json({ ok: true }));
app.post("/oauth/token", tokenEndpoint);

// The CapabilityStatement is how a FHIR client discovers what this server supports; it is public.
app.get("/fhir/metadata", (c) =>
  c.json({
    resourceType: "CapabilityStatement",
    status: "active",
    date: "2026-10-05",
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
        },
        resource: [
          {
            type: "Patient",
            interaction: [{ code: "read" }, { code: "search-type" }, { code: "create" }],
            searchParam: [
              { name: "phone", type: "token" },
              { name: "identifier", type: "token" },
            ],
          },
        ],
      },
    ],
  }),
);

app.use("/fhir/*", requireToken);
app.route("/fhir/Patient", patientRoutes);

app.notFound((c) => c.json(operationOutcome("not-found", `No route for ${c.req.method} ${c.req.path}`), 404));
app.onError((err, c) => {
  console.error("unhandled", err.name);
  return c.json(operationOutcome("exception", "Internal error"), 500);
});
