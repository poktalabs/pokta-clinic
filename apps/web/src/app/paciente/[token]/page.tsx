import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ehr, type CallbackRecord, type PatientProfile, type UpcomingAppointment } from "@/ehr";
import { verifyPatientLink } from "@/patient-link/token";
import { describeStart } from "@/scheduling/slots";
import { branchDetails } from "@/tools/branch-details";
import { ThemeToggle } from "@/components/theme-toggle";
import { PatientForm } from "./patient-form";

export const metadata: Metadata = { title: "Mis datos: Grupo Médico Articular (demo PoktaClinic)", robots: { index: false } };
export const dynamic = "force-dynamic";

// What the emailed link opens: the Patient's basic data, their appointment or callback, and a form for
// the administrative data the call did not collect. The signed token is the only access check.
export default async function PatientPage({ params }: PageProps<"/paciente/[token]">) {
  const { token } = await params;
  const patientId = verifyPatientLink(token);
  let profile: PatientProfile | null = null;
  let appointments: UpcomingAppointment[] = [];
  let callbacks: CallbackRecord[] = [];
  let offline = false;
  if (patientId) {
    try {
      [profile, appointments, callbacks] = await Promise.all([ehr.getPatientProfile(patientId), ehr.upcomingAppointments(patientId, new Date()), ehr.pendingCallbacks(patientId)]);
    } catch {
      offline = true;
    }
  }
  const next = appointments[0];
  const branch = next?.branch ? await branchDetails(next.branch) : null;

  return (
    <>
      <header className="site-header">
        <div className="wrap">
          <Link className="brand" href="/">
            <Image src="/poktacare-logo.svg" alt="" width={20} height={20} priority />
            <span className="wordmark">
              Pokta<b>Clinic</b>
            </span>
          </Link>
          <span className="header-end">
            <span className="kicker muted">Pokta Labs demo</span>
            <ThemeToggle />
          </span>
        </div>
      </header>
      <main className="wrap wrap-narrow page" lang="es-MX">
        <section>
          <p className="kicker">Grupo Médico Articular</p>
          <h1 className="headline">{profile ? `Hola, ${profile.givenName}` : "Mis datos"}</h1>
          <p role="note" className="notice small">
            <strong>Demo con datos ficticios.</strong> Grupo Médico Articular no existe. <Link href="/privacidad">Aviso de privacidad</Link>.
          </p>
        </section>

        {!patientId ? (
          <p className="empty">Este enlace no es válido o ya venció. Pida uno nuevo en su sucursal.</p>
        ) : offline ? (
          <p className="empty">El expediente no responde en este momento. Intente de nuevo en unos minutos.</p>
        ) : !profile ? (
          <p className="empty">No encontramos su expediente.</p>
        ) : (
          <>
            <section className="grid-2">
              <div className="card">
                <h2 className="title">Su cita</h2>
                {next ? (
                  <p className="sub">
                    <strong>{describeStart(next.start).label}</strong>
                    <br />
                    {branch ? `${branch.name}, con ${branch.practitionerName}` : null}
                    <br />
                    <span className="muted">{branch?.address}</span>
                  </p>
                ) : callbacks[0] ? (
                  <p className="sub">
                    Aún no tiene cita. La clínica le llamará: <strong>{callbacks[0].availability}</strong>.
                  </p>
                ) : (
                  <p className="sub muted">No tiene citas próximas.</p>
                )}
              </div>
              <div className="card">
                <h2 className="title">Sus datos</h2>
                <dl className="x-fields">
                  <div className="x-field">
                    <dt>Nombre</dt>
                    <dd>{[profile.givenName, profile.primerApellido, profile.segundoApellido].filter(Boolean).join(" ")}</dd>
                  </div>
                  <div className="x-field">
                    <dt>Folio</dt>
                    <dd className="num">{profile.folio ?? "n/a"}</dd>
                  </div>
                  <div className="x-field">
                    <dt>Teléfono</dt>
                    <dd className="num">{profile.phone}</dd>
                  </div>
                  {profile.birthDate && (
                    <div className="x-field">
                      <dt>Fecha de nacimiento</dt>
                      <dd className="num">{profile.birthDate}</dd>
                    </div>
                  )}
                </dl>
                <p className="small muted" style={{ marginTop: 8 }}>
                  Para corregir estos datos, comuníquese con su sucursal.
                </p>
              </div>
            </section>
            <PatientForm token={token} profile={profile} />
          </>
        )}
      </main>
    </>
  );
}
