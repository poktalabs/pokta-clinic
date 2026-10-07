import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Aviso de privacidad: Grupo Médico Articular (demo PoktaClinic)",
};

// The full notice the voice agent points to. The agent reads only the short version on the call.
// Fictional: Grupo Médico Articular does not exist and this text has not been reviewed by a lawyer.
export default function Privacidad() {
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
          <span className="kicker muted">Pokta Labs demo</span>
        </div>
      </header>

      <main className="wrap wrap-narrow page" lang="es-MX">
        <section aria-labelledby="aviso-h">
          <p className="kicker">Aviso de privacidad integral</p>
          <h1 id="aviso-h" className="headline">
            Grupo Médico Articular, S.C.
          </h1>
          <p role="note" className="notice">
            <strong>Documento ficticio para una demostración.</strong> Grupo Médico Articular no existe y este texto no ha sido revisado por un abogado.
          </p>
        </section>

        <section className="card prose">
          <h2 className="title">Responsable</h2>
          <p>Grupo Médico Articular, S.C. (GMA) y sus sucursales GMA Del Valle (Av. Insurgentes Sur 1234, Col. del Valle, Benito Juárez, Ciudad de México), GMA Polanco (Av. Presidente Masaryk 450, Polanco, Miguel Hidalgo, Ciudad de México) y GMA Satélite (Naucalpan de Juárez, Estado de México) son responsables del tratamiento de sus datos personales.</p>

          <h2 className="title">Datos que tratamos</h2>
          <p>Datos de identificación y contacto: nombre, apellidos, fecha de nacimiento, sexo y teléfono. Datos personales sensibles: datos de salud que usted nos comparte en la preconsulta (motivo de consulta, síntomas, medicamentos, alergias, antecedentes y estudios previos) y la información de su cita.</p>

          <h2 className="title">Finalidades</h2>
          <p>Finalidades que requieren su consentimiento expreso: preparar su primera consulta de reumatología con una preconsulta por voz, integrar la información a su expediente clínico, agendar su cita y, si usted refiere un síntoma de alarma, registrar el aviso para el personal médico. No usamos sus datos con fines publicitarios ni los transferimos a terceros, salvo a los proveedores que nos dan servicio de cómputo, telefonía y calendario, obligados a guardar confidencialidad.</p>

          <h2 className="title">Asistente de voz con inteligencia artificial</h2>
          <p>La preconsulta la realiza un asistente virtual con inteligencia artificial, no un profesional de la salud. El asistente no da diagnósticos ni consejos médicos. La llamada se procesa para transcribirla y registrar sus respuestas.</p>

          <h2 className="title">Derechos ARCO y revocación</h2>
          <p>Usted puede acceder a sus datos, rectificarlos, cancelarlos u oponerse a su tratamiento, así como revocar su consentimiento o limitar el uso de sus datos, presentando una solicitud en cualquier sucursal o al correo privacidad@gma.example. Responderemos en los plazos que señala la Ley Federal de Protección de Datos Personales en Posesión de los Particulares.</p>

          <h2 className="title">Cambios a este aviso</h2>
          <p>Publicaremos cualquier cambio en esta página y en las sucursales.</p>
        </section>
      </main>
    </>
  );
}
