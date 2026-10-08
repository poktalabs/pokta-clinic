// The clinic's EHR client console (apps/mock-ehr, deployed on Render). One base URL for every page that
// links into it. The console is password protected; patient routes take the EHR Patient UUID that
// find_patient and save_patient return as patient_id. Anchors match apps/mock-ehr/src/pages/client/patient.tsx.
export const EHR_URL = "https://pokta-clinic-ehr.onrender.com";

export const ehrLinks = {
  patient: (id: string) => `${EHR_URL}/pacientes/${encodeURIComponent(id)}`,
  history: (id: string) => `${EHR_URL}/pacientes/${encodeURIComponent(id)}#preconsulta`,
  consultation: (id: string) => `${EHR_URL}/pacientes/${encodeURIComponent(id)}/consulta`,
  appointments: (id: string | null) => (id ? `${EHR_URL}/pacientes/${encodeURIComponent(id)}#citas` : `${EHR_URL}/citas`),
  callbacks: (id: string | null) => (id ? `${EHR_URL}/pacientes/${encodeURIComponent(id)}#llamadas` : `${EHR_URL}/llamadas`),
  alerts: () => `${EHR_URL}/alertas`,
};
