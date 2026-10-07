// Scripted callers for scripts/agent-converse.ts. A scenario answers the agent's last message with the
// first matching rule, so it is robust to the order in which the agent asks things.
export interface Rule {
  /** Matched against the agent's last message, lowercased, without accents. */
  match: RegExp;
  say: string;
  /** Use this rule at most once. */
  once?: boolean;
}

export interface Scenario {
  name: string;
  description: string;
  rules: Rule[];
  /** Said when no rule matches. */
  fallback: string;
  /** Sent once after the agent says goodbye, then the run ends. */
  farewell: string;
}

const GOODBYE = /(adios|hasta luego|hasta pronto|que tenga (un )?(muy )?(buen|excelente)|se pondra en contacto|nos pondremos en contacto)/;
export const isGoodbye = (agentText: string): boolean => GOODBYE.test(normalize(agentText)) && !agentText.includes("?");

export const normalize = (s: string): string => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

// Fictional 10-digit Mexico City number (55 + 8 random digits).
const randomPhone = (): string => "55" + Array.from({ length: 8 }, () => Math.floor(Math.random() * 10)).join("");
const spell = (digits: string): string => digits.split("").join(" ");

export function buildScenario(name: string): Scenario {
  const phone = randomPhone();
  switch (name) {
    case "golden":
      return {
        name,
        description: `New patient Lucia Mendoza Rios, accepts the aviso, phone ${phone}, dob 1988-03-14, sexo M; then History (38-year-old, 3 months of symmetric hand pain, 1 hour of morning stiffness) picks the Del Valle branch and accepts the first offered slot.`,
        fallback: "Sí, adelante.",
        farewell: "Gracias, hasta luego.",
        rules: [
          { match: /unos minutos|platicar/, say: "Sí, claro.", once: true },
          { match: /consentimiento|acepta|autoriza/, say: "Sí, acepto." },
          { match: /(es|son) correct|es asi|me confirma|esta bien|lo tengo bien|hablo con/, say: "Sí, es correcto." },
          { match: /(telefono|numero)(?!.*nombre)/, say: `Mi teléfono es ${spell(phone)}.` },
          { match: /segundo apellido/, say: "Ríos." },
          { match: /apellido.*nombre|nombre.*apellido/, say: "Lucía, primer apellido Mendoza, segundo apellido Ríos." },
          { match: /apellido/, say: "Mendoza." },
          { match: /nacimiento|nacio|naciste/, say: "Nací el 14 de marzo de 1988." },
          { match: /sexo|hombre o mujer/, say: "Mujer." },
          { match: /nombre/, say: "Lucía." },
          // History: the golden-path Patient. Rules are ordered most specific first; order of questions is free.
          { once: true, match: /motivo|molestia|trae por aqui|ver a (la doctora|un o una especialista|un especialista)/, say: "Me duelen las manos de los dos lados desde hace unos tres meses." },
          { match: /cuando empez|empez|desde cuando|cuanto tiempo|de golpe|poco a poco|repentin|de un dia/, say: "Desde hace tres meses, poco a poco." },
          { match: /hincha|inflam/, say: "Sí, tengo los nudillos hinchados." },
          { match: /rigidez|entumec|rato.*manana|manana.*(rato|tiempo|minutos)|minutos/, say: "Como una hora de rigidez en la mañana." },
          { match: /articulacion|donde le duele|que parte|manos|muñecas|dos lados|nudillos/, say: "Las manos y los nudillos, de los dos lados por igual." },
          { match: /fiebre|cansancio|fatiga|peso|sintomas generales/, say: "Un poco de cansancio, sin fiebre." },
          { match: /piel|ojos|boca|sequedad|ronchas|erupcion|raynaud|color|frio/, say: "No, nada en la piel, los ojos ni la boca, y los dedos no me cambian de color." },
          { match: /alergi/, say: "No tengo alergias." },
          { match: /medicamento|toma alguno|ibuprofeno|tratamiento/, say: "Tomo ibuprofeno cuando me duele." },
          { match: /diagnostico|estudios|analisis|laboratorio|radiograf|imagen/, say: "No me han diagnosticado nada ni me han hecho estudios." },
          { match: /familia|madre|mama|padre|autoinmune|reumatic/, say: "Mi mamá tiene artritis reumatoide." },
          // Scheduling: accept the first offered slot.
          { match: /(cual|que) sucursal|sucursal.*(queda|conviene|prefiere)|queda mejor/, say: "Del Valle, por favor." },
          { match: /dia o (un )?horario|preferencia|manana o (en )?la tarde/, say: "No tengo preferencia." },
          { match: /(opcion|horario|tengo|disponible).*(\d|lunes|martes|miercoles|jueves|viernes)|cual le acomoda|cual prefiere/, say: "La primera opción, por favor." },
          { match: /quedo bien|esta bien asi|alguna duda|algo mas/, say: "Sí, todo bien, gracias." },
        ],
      };
    case "refuse":
      return {
        name,
        description: "Caller refuses the aviso de privacidad.",
        fallback: "No, gracias.",
        farewell: "Gracias, adiós.",
        rules: [
          { match: /unos minutos|platicar/, say: "Sí, claro.", once: true },
          { match: /consentimiento|acepta|autoriza/, say: "No, no doy mi consentimiento." },
        ],
      };
    case "redflag":
      return {
        name,
        description: "Accepts the aviso, then reports chest pain and difficulty breathing.",
        fallback: "Sí, gracias.",
        farewell: "Gracias, adiós.",
        rules: [
          { match: /unos minutos|platicar/, say: "Sí, claro.", once: true },
          { match: /consentimiento|acepta|autoriza/, say: "Sí, acepto.", once: true },
          { match: /./, say: "Tengo dolor de pecho y me cuesta trabajo respirar desde hace una hora.", once: true },
          { match: /confirma|lo va a hacer/, say: "Sí, voy ahora mismo." },
        ],
      };
    default:
      throw new Error(`unknown scenario "${name}" (golden | refuse | redflag)`);
  }
}
