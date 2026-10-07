import type { Email } from "./send";

// Spanish (es-MX) emails for the fictional Grupo Médico Articular. Plain layout with inline styles
// (email clients ignore stylesheets), one accent colour from the brand kit, no images.

const ACCENT = "#3333DE";
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function layout(title: string, rows: string[], cta?: { href: string; label: string }): string {
  const button = cta
    ? `<p style="margin:24px 0"><a href="${esc(cta.href)}" style="background:${ACCENT};color:#fff;padding:12px 18px;text-decoration:none;font-weight:600;display:inline-block">${esc(cta.label)}</a></p>`
    : "";
  return `<!doctype html><html lang="es-MX"><body style="margin:0;background:#f4f5fb;font-family:Helvetica,Arial,sans-serif;color:#14142b">
<div style="max-width:560px;margin:0 auto;background:#fff;border-top:4px solid ${ACCENT};padding:28px">
<p style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:${ACCENT};margin:0 0 8px">Grupo Médico Articular</p>
<h1 style="font-size:22px;margin:0 0 16px">${esc(title)}</h1>
${rows.map((r) => `<p style="font-size:15px;line-height:1.5;margin:0 0 12px">${r}</p>`).join("\n")}
${button}
<p style="font-size:12px;color:#6b6b80;margin-top:28px">Demo de PoktaClinic: Grupo Médico Articular es ficticio y los datos son de prueba. Este correo lo envió un asistente de voz con inteligencia artificial; no es consejo médico.</p>
</div></body></html>`;
}

const text = (title: string, rows: string[], link?: string) =>
  [title, "", ...rows.map((r) => r.replace(/<[^>]+>/g, "")), ...(link ? ["", link] : []), "", "Demo de PoktaClinic: datos ficticios."].join("\n");

export function appointmentConfirmation(i: { to: string; name: string; label: string; branchName: string; address: string; practitioner: string; link: string }): Email {
  const title = "Su primera consulta quedó agendada";
  const rows = [
    `Hola${i.name ? `, ${esc(i.name)}` : ""}.`,
    `<strong>${esc(i.label)}</strong><br>${esc(i.branchName)}, con ${esc(i.practitioner)}<br>${esc(i.address)}`,
    "Llegue 15 minutos antes y traiga una identificación oficial, la lista de sus medicamentos y los estudios que tenga.",
    "Para que la consulta empiece a tiempo, complete los datos que nos faltan (correo, domicilio, contacto de emergencia y aseguradora):",
  ];
  return { to: i.to, subject: `Cita confirmada: ${i.label}`, html: layout(title, rows, { href: i.link, label: "Completar mis datos" }), text: text(title, rows, i.link) };
}

export function rescheduled(i: { to: string; name: string; oldLabel: string; label: string; branchName: string; address: string; practitioner: string; link: string }): Email {
  const title = "Cambiamos su cita";
  const rows = [
    `Hola${i.name ? `, ${esc(i.name)}` : ""}.`,
    `Su cita del ${esc(i.oldLabel)} quedó cancelada. La nueva es:`,
    `<strong>${esc(i.label)}</strong><br>${esc(i.branchName)}, con ${esc(i.practitioner)}<br>${esc(i.address)}`,
  ];
  return { to: i.to, subject: `Cita cambiada: ${i.label}`, html: layout(title, rows, { href: i.link, label: "Ver mi cita y mis datos" }), text: text(title, rows, i.link) };
}

export function callbackReceived(i: { to: string; name: string | null; availability: string; branchName: string; link: string | null }): Email {
  const title = "Le vamos a llamar";
  const rows = [
    `Hola${i.name ? `, ${esc(i.name)}` : ""}.`,
    `Recibimos su solicitud. El equipo de ${esc(i.branchName)} le llamará para agendar su primera consulta en el horario que nos indicó: <strong>${esc(i.availability)}</strong>.`,
    ...(i.link ? ["Mientras tanto, puede revisar y completar sus datos:"] : []),
  ];
  return {
    to: i.to,
    subject: "Recibimos su solicitud de llamada",
    html: layout(title, rows, i.link ? { href: i.link, label: "Revisar mis datos" } : undefined),
    text: text(title, rows, i.link ?? undefined),
  };
}

export function frontDeskCallback(i: {
  to: string;
  name: string | null;
  folio: string | null;
  phone: string | null;
  branchName: string;
  availability: string;
  reason: string;
  conversationId: string;
}): Email {
  const title = "Nueva solicitud de devolución de llamada";
  const rows = [
    `<strong>Paciente:</strong> ${esc(i.name ?? "sin identificar")}${i.folio ? ` (folio ${esc(i.folio)})` : ""}`,
    `<strong>Teléfono:</strong> ${esc(i.phone ?? "no disponible")}`,
    `<strong>Sucursal:</strong> ${esc(i.branchName)}`,
    `<strong>Horario para llamar:</strong> ${esc(i.availability)}`,
    `<strong>Motivo:</strong> ${esc(i.reason)}`,
    `La tarea quedó en el expediente (Task) y como recordatorio en el calendario de la sucursal. Conversación: ${esc(i.conversationId)}`,
  ];
  return { to: i.to, subject: `Devolver llamada: ${i.name ?? "paciente"} (${i.branchName})`, html: layout(title, rows), text: text(title, rows) };
}
