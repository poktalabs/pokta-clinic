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
  /** Session language override; unset starts in the agent's default (Spanish). */
  language?: "en";
}

const GOODBYE = /(adios|hasta luego|hasta pronto|que tenga (un )?(muy )?(buen|excelente)|se pondra en contacto|nos pondremos en contacto|goodbye|good bye|take care|have a (good|great|nice|lovely)|will (be in touch|contact you|get in touch))/;
export const isGoodbye = (agentText: string): boolean => GOODBYE.test(normalize(agentText)) && !agentText.includes("?");

export const normalize = (s: string): string => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/** The agent's last question: from the last "¿" in Spanish, or the sentence that ends in the last "?" in English. */
export function lastQuestion(text: string): string {
  const open = text.lastIndexOf("¿");
  if (open >= 0) return text.slice(open);
  const end = text.lastIndexOf("?");
  if (end < 0) return text;
  const start = Math.max(text.lastIndexOf(". ", end), text.lastIndexOf("! ", end));
  return text.slice(start >= 0 ? start + 2 : 0);
}

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
    case "callback": {
      // Golden path until scheduling, then no offered slot works and the caller asks to be called back.
      const golden = buildScenario("golden");
      const keep = golden.rules.filter((r) => !/primera opci[oó]n|No tengo preferencia/i.test(r.say));
      return {
        ...golden,
        name,
        description: golden.description.replace("accepts the first offered slot", "rejects the offered slots and asks for a callback"),
        rules: [
          { match: /le llame|llamarle|horario (le podemos|para) llamar|en que horario/, say: "Sí, que me llamen, entre semana de once a dos." },
          ...keep.filter((r) => !/Del Valle, por favor/.test(r.say)),
          { match: /(cual|que) sucursal|sucursal.*(queda|conviene|prefiere)|queda mejor/, say: "Polanco, por favor." },
          { match: /dia o (un )?horario|preferencia|manana o (en )?la tarde/, say: "Los sábados a las ocho de la mañana." },
          { match: /(opcion|horario|tengo|disponible).*(\d|lunes|martes|miercoles|jueves|viernes|sabado)|cual le acomoda|cual prefiere|no hay/, say: "No, ninguno me queda. Mejor que me llamen." },
        ],
      };
    }
    case "kb": {
      // Golden path with off-script clinic questions, each asked once at a fixed point. The agent should
      // answer from the knowledge base in a sentence or two (or defer to branch staff for what is not in
      // it, like IMSS) and then repeat the question it had pending, which the golden rules answer.
      const golden = buildScenario("golden");
      return {
        ...golden,
        name,
        description: `${golden.description} Interrupts once each: the price at the date of birth, what to bring at allergies, parking in Del Valle at the branch question, and IMSS (not in the knowledge base) at the day preference.`,
        rules: [
          { once: true, match: /nacimiento|nacio|naciste/, say: "Antes de seguir, ¿cuánto cuesta la consulta?" },
          { once: true, match: /alergi/, say: "Perdón, ¿qué tengo que llevar a la consulta?" },
          { once: true, match: /(cual|que) sucursal|sucursal.*(queda|conviene|prefiere)|queda mejor/, say: "¿Tienen estacionamiento en Del Valle?" },
          { once: true, match: /dia o (un )?horario|preferencia|manana o (en )?la tarde/, say: "¿Tienen convenio con el IMSS?" },
          ...golden.rules,
        ],
      };
    }
    case "returning": {
      // A caller who already booked (SCENARIO_PHONE: the phone of an earlier golden run) changes the appointment.
      const known = process.env.SCENARIO_PHONE;
      if (!known) throw new Error("returning needs SCENARIO_PHONE=<10 digits of an existing patient with an upcoming appointment>");
      return {
        name,
        description: `Returning patient ${known}: confirms the name, wants to change the upcoming appointment, takes the first offered slot.`,
        fallback: "Sí, adelante.",
        farewell: "Gracias, hasta luego.",
        rules: [
          { match: /unos minutos|platicar/, say: "Sí, claro.", once: true },
          { match: /consentimiento|acepta|autoriza/, say: "Sí, acepto." },
          { match: /hablo con|es usted/, say: "Sí, soy yo." },
          { match: /mantener|cambiar|conservar/, say: "Quiero cambiarla, por favor." },
          { match: /(es|son) correct|es asi|me confirma|lo tengo bien/, say: "Sí, es correcto." },
          { match: /(telefono|numero)(?!.*nombre)/, say: `Mi teléfono es ${spell(known)}.` },
          { match: /(cual|que) sucursal|sucursal.*(queda|conviene|prefiere)|queda mejor/, say: "La misma, Del Valle." },
          { match: /dia o (un )?horario|preferencia|manana o (en )?la tarde/, say: "En la tarde, por favor." },
          { match: /(opcion|horario|tengo|disponible).*(\d|lunes|martes|miercoles|jueves|viernes)|cual le acomoda|cual prefiere/, say: "La primera opción, por favor." },
          { match: /quedo bien|esta bien asi|alguna duda|algo mas/, say: "Sí, todo bien, gracias." },
        ],
      };
    }
    case "golden_en":
      // The golden persona and answers, in English, in a session started with the English language override.
      return {
        name,
        language: "en",
        description: `English call (language override en). New patient Lucia Mendoza Rios, accepts the privacy notice, phone ${phone}, dob 1988-03-14, sex female; then History (38-year-old, 3 months of symmetric hand pain, 1 hour of morning stiffness) picks the Del Valle branch and accepts the first offered slot. Every agent turn should be in English, with GMA and branch names untranslated.`,
        fallback: "Yes, go ahead.",
        farewell: "Thank you, goodbye.",
        rules: [
          { match: /few minutes|to talk/, say: "Yes, sure.", once: true },
          { match: /consent|authori[sz]e|do you agree|accept/, say: "Yes, I agree." },
          { match: /(is|are) (that|this|these) (correct|right)|did i get|confirm|am i speaking|speaking with/, say: "Yes, that's correct." },
          { match: /(phone|number)(?!.*name)/, say: `My phone number is ${spell(phone)}.` },
          { match: /second (last name|surname)|maternal/, say: "Rios." },
          { match: /(last name|surname).*first name|first name.*(last name|surname)|full name/, say: "Lucia, first last name Mendoza, second last name Rios." },
          { match: /last name|surname/, say: "Mendoza." },
          { match: /birth|born/, say: "I was born on March 14, 1988." },
          { match: /\bsex\b|male or female|man or (a )?woman/, say: "Female." },
          { match: /name/, say: "Lucia." },
          // History: the golden-path Patient, most specific rules first; the order of questions is free.
          { once: true, match: /main reason|reason for|what brings you|bothering you|see a specialist/, say: "Both of my hands have been hurting, on both sides, for about three months." },
          { match: /when did (it|this|the pain|they) start|how long|start|suddenly|gradually|all at once/, say: "For three months, little by little." },
          { match: /swell|swollen|inflam/, say: "Yes, my knuckles are swollen." },
          { match: /stiff|morning.*(how long|last|minutes)|minutes/, say: "About an hour of stiffness in the morning." },
          { match: /joint|where (does it|do you) hurt|which part|hands|wrists|both sides|knuckles/, say: "My hands and knuckles, the same on both sides." },
          { match: /fever|tired|fatigue|weight|general symptoms/, say: "A bit tired, no fever." },
          { match: /skin|eyes|mouth|dry|rash|raynaud|colou?r|cold/, say: "No, nothing on my skin, eyes or mouth, and my fingers don't change color." },
          { match: /allerg/, say: "I have no allergies." },
          { match: /medic|taking any|ibuprofen|treatment/, say: "I take ibuprofen when it hurts." },
          { match: /diagnos|tests|lab|x-ray|imaging|studies/, say: "I haven't been diagnosed with anything and I haven't had any tests." },
          { match: /family|mother|father|autoimmune|rheumatic (disease|condition)/, say: "My mother has rheumatoid arthritis." },
          // Scheduling: accept the first offered slot.
          { match: /which branch|branch.*(suits|convenient|prefer|best)|works best for you/, say: "Del Valle, please." },
          { match: /(day|time) (preference|in mind)|prefer.*(day|time)|preferred (day|time)|morning or (in the )?afternoon/, say: "I have no preference." },
          { match: /(option|slot|have|available).*(\d|monday|tuesday|wednesday|thursday|friday)|which (one )?(works|suits)|which do you prefer/, say: "The first option, please." },
          { match: /(all|everything) (correct|right|good)|does that work|any (other )?questions|anything else/, say: "Yes, all good, thank you." },
        ],
      };
    case "redflag_en":
      return {
        name,
        language: "en",
        description: "English call (language override en). Accepts the privacy notice, then reports chest pain and difficulty breathing. Expect the escalation script in English with 911.",
        fallback: "Yes, thank you.",
        farewell: "Thank you, goodbye.",
        rules: [
          { match: /few minutes|to talk/, say: "Yes, sure.", once: true },
          { match: /consent|authori[sz]e|do you agree|accept/, say: "Yes, I agree.", once: true },
          { match: /./, say: "I have chest pain and it's been hard to breathe for about an hour.", once: true },
          { match: /confirm|will you (do|call)|going to/, say: "Yes, I'm calling right now." },
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
      throw new Error(`unknown scenario "${name}" (golden | callback | kb | returning | refuse | redflag | golden_en | redflag_en)`);
  }
}
