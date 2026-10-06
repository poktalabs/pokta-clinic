import { count } from "drizzle-orm";
import type { AnyPgTable } from "drizzle-orm/pg-core";
import { db } from "../db/client.js";
import { RESOURCES } from "../capability.js";
import { appointment, communication, consent, intake, patient } from "../db/schema.js";
import { Layout } from "./layout.js";

// Public landing page: counts only, never patient data.
export async function counts() {
  const of = async (table: AnyPgTable) => (await db.select({ n: count() }).from(table))[0].n;
  const [patients, consents, responses, appointments, communications] = await Promise.all([patient, consent, intake, appointment, communication].map(of));
  return { patients, consents, responses, appointments, communications };
}

export async function RootPage() {
  const n = await counts();
  const stats = [
    ["Patients", n.patients],
    ["Consents", n.consents],
    ["QuestionnaireResponses", n.responses],
    ["Appointments", n.appointments],
    ["Communications", n.communications],
  ] as const;
  return (
    <Layout title="Expediente Demo">
      <h1>Expediente Demo</h1>
      <p class="sub">A mock third-party EHR (HL7 FHIR R4) for the pokta-clinic voice agent demo</p>
      <p>
        Expediente Demo plays the vendor system that holds the Expediente of a private rheumatology practice in Mexico. pokta-clinic reaches it only over FHIR R4. Everything stored here is fictional.
      </p>

      <h2>Live counts</h2>
      <div class="grid">
        {stats.map(([label, value]) => (
          <div class="stat">
            <b>{value}</b>
            <span>{label}</span>
          </div>
        ))}
      </div>

      <h2>Links</h2>
      <ul>
        <li>
          <a href="/fhir/metadata">/fhir/metadata</a>: CapabilityStatement (public)
        </li>
        <li>
          <a href="/healthz">/healthz</a>: liveness check
        </li>
      </ul>

      <h2>Authentication</h2>
      <p>
        OAuth2 client credentials. POST <code>grant_type=client_credentials</code> with the client id and secret to <code>/oauth/token</code>, then send <code>Authorization: Bearer &lt;token&gt;</code> to <code>/fhir/*</code>. Tokens last one hour.
      </p>

      <h2>Supported resources</h2>
      <ul>
        {RESOURCES.map((r) => (
          <li>
            <code>{r.type}</code>: {r.interaction.join(", ")}
            {r.searchParam.length ? ` (search: ${r.searchParam.map((p) => p.name).join(", ")})` : ""}
          </li>
        ))}
      </ul>
      <p class="note">Data model and norms (NOM-004, NOM-024): see the repository docs.</p>
    </Layout>
  );
}
