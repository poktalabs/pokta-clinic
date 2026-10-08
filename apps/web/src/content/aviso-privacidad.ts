// The full aviso de privacidad as data, so the /privacidad page and the agent's knowledge base
// (agent/src/kb/aviso.ts) quote the same text. Pure data: no `@/` imports, the agent build imports it.
// Fictional: Grupo Médico Articular does not exist and this text has not been reviewed by a lawyer.

export interface AvisoSection {
  heading: string;
  paragraphs: string[];
}

export const AVISO = {
  title: "Aviso de privacidad integral",
  entity: "Grupo Médico Articular, S.C.",
  disclaimer: {
    lead: "Documento ficticio para una demostración.",
    rest: "Grupo Médico Articular no existe y este texto no ha sido revisado por un abogado.",
  },
  sections: [
    {
      heading: "Responsable",
      paragraphs: [
        "Grupo Médico Articular, S.C. (GMA) y sus sucursales GMA Del Valle (Av. Insurgentes Sur 1234, Col. del Valle, Benito Juárez, Ciudad de México), GMA Polanco (Av. Presidente Masaryk 450, Polanco, Miguel Hidalgo, Ciudad de México) y GMA Satélite (Naucalpan de Juárez, Estado de México) son responsables del tratamiento de sus datos personales.",
      ],
    },
    {
      heading: "Datos que tratamos",
      paragraphs: [
        "Datos de identificación y contacto: nombre, apellidos, fecha de nacimiento, sexo y teléfono. Datos personales sensibles: datos de salud que usted nos comparte en la preconsulta (motivo de consulta, síntomas, medicamentos, alergias, antecedentes y estudios previos) y la información de su cita.",
      ],
    },
    {
      heading: "Finalidades",
      paragraphs: [
        "Finalidades que requieren su consentimiento expreso: preparar su primera consulta de reumatología con una preconsulta por voz, integrar la información a su expediente clínico, agendar su cita y, si usted refiere un síntoma de alarma, registrar el aviso para el personal médico. No usamos sus datos con fines publicitarios ni los transferimos a terceros, salvo a los proveedores que nos dan servicio de cómputo, telefonía y calendario, obligados a guardar confidencialidad.",
      ],
    },
    {
      heading: "Asistente de voz con inteligencia artificial",
      paragraphs: [
        "La preconsulta la realiza un asistente virtual con inteligencia artificial, no un profesional de la salud. El asistente no da diagnósticos ni consejos médicos. La llamada se procesa para transcribirla y registrar sus respuestas.",
      ],
    },
    {
      heading: "Derechos ARCO y revocación",
      paragraphs: [
        "Usted puede acceder a sus datos, rectificarlos, cancelarlos u oponerse a su tratamiento, así como revocar su consentimiento o limitar el uso de sus datos, presentando una solicitud en cualquier sucursal o al correo privacidad@gma.example. Responderemos en los plazos que señala la Ley Federal de Protección de Datos Personales en Posesión de los Particulares.",
      ],
    },
    {
      heading: "Cambios a este aviso",
      paragraphs: ["Publicaremos cualquier cambio en esta página y en las sucursales."],
    },
  ] satisfies AvisoSection[],
};
