// The pre-consultation summary: the patient's answers to the first-visit Questionnaire, grouped the way a
// rheumatologist reads them (see clinical.ts). Used by the patient page and the consultation mock.
import { LINK_ID, QuestionnaireItem, QuestionnaireResponseItem } from "@pokta-clinic/fhir";
import { z } from "zod";
import { CLINICAL_SECTIONS, ITEM_LABEL, STIFFNESS_ATTENTION_MIN } from "./clinical.js";
import { COMPLETION, VALIDATION, dateTime } from "./format.js";
import { Card, KeyValue, Notice, Pill } from "./ui.js";

type Answer = QuestionnaireResponseItem["answer"][number];

export type SummaryIntake = {
  completion: "in_progress" | "completed";
  status: "pending_validation" | "validated" | "rejected";
  createdAt: Date;
  validatedAt: Date | null;
  validatorName: string | null;
  items: unknown;
};

/** Stored jsonb to typed items; a malformed row degrades to "no answers" instead of failing the page. */
export function parseIntakeItems(raw: unknown): QuestionnaireResponseItem[] {
  const parsed = z.array(QuestionnaireResponseItem).safeParse(raw);
  return parsed.success ? parsed.data : [];
}

export function parseDefinition(raw: unknown): QuestionnaireItem[] {
  const parsed = z.array(QuestionnaireItem).safeParse(raw);
  return parsed.success ? parsed.data : [];
}

export const answersFor = (items: QuestionnaireResponseItem[], linkId: string): Answer[] => items.find((i) => i.linkId === linkId)?.answer ?? [];

const strings = (answers: Answer[]) => answers.flatMap((a) => ("valueString" in a && a.valueString.trim() ? [a.valueString.trim()] : []));
const integerOf = (answers: Answer[]) => answers.flatMap((a) => ("valueInteger" in a ? [a.valueInteger] : []))[0] ?? null;
const booleanOf = (answers: Answer[]) => answers.flatMap((a) => ("valueBoolean" in a ? [a.valueBoolean] : []))[0] ?? null;

export const stiffnessOf = (items: QuestionnaireResponseItem[]) => integerOf(answersFor(items, LINK_ID.morningStiffnessMin));
export const swellingOf = (items: QuestionnaireResponseItem[]) => booleanOf(answersFor(items, LINK_ID.jointSwelling));

const NO_ANSWER = <span class="muted">Sin respuesta</span>;

function Value(props: { linkId: string; answers: Answer[] }) {
  const { linkId, answers } = props;
  if (!answers.length) return NO_ANSWER;
  if (linkId === LINK_ID.morningStiffnessMin) {
    const min = integerOf(answers);
    if (min === null) return NO_ANSWER;
    return (
      <span class="row">
        <span>{min === 1 ? "1 minuto" : `${min} minutos`}</span>
        {min >= STIFFNESS_ATTENTION_MIN ? <Pill tone="attn">Rigidez prolongada</Pill> : null}
      </span>
    );
  }
  if (linkId === LINK_ID.jointSwelling) {
    const yes = booleanOf(answers);
    if (yes === null) return NO_ANSWER;
    return yes ? (
      <span class="row">
        <span>Sí</span>
        <Pill tone="attn">Referida</Pill>
      </span>
    ) : (
      <span>No</span>
    );
  }
  const bool = booleanOf(answers);
  if (bool !== null) return <span>{bool ? "Sí" : "No"}</span>;
  const int = integerOf(answers);
  if (int !== null) return <span>{int}</span>;
  const text = strings(answers);
  if (!text.length) return NO_ANSWER;
  if (text.length === 1) return <span>{text[0]}</span>;
  return (
    <ul>
      {text.map((t) => (
        <li>{t}</li>
      ))}
    </ul>
  );
}

/** Prompts for the clinician derived from the answers. Wording is a reminder to check, never a diagnosis. */
export function confirmPrompts(items: QuestionnaireResponseItem[], redFlags: number): string[] {
  const prompts: string[] = [];
  const stiffness = stiffnessOf(items);
  if (stiffness !== null && stiffness >= STIFFNESS_ATTENTION_MIN) prompts.push(`Confirmar la duración de la rigidez matutina referida (${stiffness} minutos).`);
  if (swellingOf(items) === true) prompts.push("Explorar las articulaciones con hinchazón referida por el paciente.");
  const allergies = strings(answersFor(items, LINK_ID.allergies));
  if (allergies.length) {
    const none = allergies.every((a) => /^(ninguna?|no|no tiene|no sabe)\b/i.test(a));
    prompts.push(none ? "Confirmar con el paciente la ausencia de alergias antes de prescribir." : `Confirmar las alergias referidas antes de prescribir: ${allergies.join(", ")}.`);
  }
  const meds = strings(answersFor(items, LINK_ID.currentMedications));
  if (meds.length) prompts.push("Revisar los medicamentos actuales referidos.");
  if (redFlags > 0) prompts.push(redFlags === 1 ? "Revisar la alerta registrada durante la llamada." : `Revisar las ${redFlags} alertas registradas durante las llamadas.`);
  const unanswered = CLINICAL_SECTIONS.flatMap((s) => s.linkIds).filter((id) => !answersFor(items, id).length);
  if (unanswered.length) prompts.push(`Completar en consulta: ${unanswered.map((id) => (ITEM_LABEL[id] ?? id).toLowerCase()).join(", ")}.`);
  return prompts;
}

/** The latest pre-consultation status of a patient, as one pill. */
export function PreConsultaPill(props: { intake: { completion: "in_progress" | "completed"; status: "pending_validation" | "validated" | "rejected" } | null }) {
  const { intake } = props;
  if (!intake) return <Pill tone="neutral">Sin cuestionario</Pill>;
  const state = intake.completion === "in_progress" ? COMPLETION.in_progress : VALIDATION[intake.status];
  return <Pill tone={state.tone}>{state.label}</Pill>;
}

export function ClinicalSummary(props: { intake: SummaryIntake; definition: unknown }) {
  const { intake } = props;
  const items = parseIntakeItems(intake.items);
  const known = new Set(parseDefinition(props.definition).map((d) => d.linkId));
  const completion = COMPLETION[intake.completion];
  const validation = VALIDATION[intake.status];
  const pending = intake.status === "pending_validation";
  return (
    <Card>
      <div class="stack">
        <div class="stack">
          <div class="row">
            <Pill tone={completion.tone}>{completion.label}</Pill>
            <Pill tone={validation.tone}>{validation.label}</Pill>
          </div>
          <p class="small muted">
            Registrado por el asistente de voz el {dateTime(intake.createdAt)}.
            {intake.status === "validated" && intake.validatedAt ? ` Validado por ${intake.validatorName ?? "el médico"} el ${dateTime(intake.validatedAt)}.` : ""}
          </p>
        </div>
        <Notice tone={pending ? "attn" : "brand"}>
          {pending
            ? "Información referida por el paciente durante la llamada. Pendiente de validación médica: no es una nota clínica ni un diagnóstico."
            : "Información referida por el paciente durante la llamada. Es un documento complementario: no es una nota clínica ni un diagnóstico."}
        </Notice>
        {CLINICAL_SECTIONS.map((section) => {
          const linkIds = section.linkIds.filter((id) => known.size === 0 || known.has(id));
          const rows: [string, ReturnType<typeof Value>][] = linkIds
            .filter((id) => id !== LINK_ID.allergies)
            .map((id) => [ITEM_LABEL[id] ?? id, <Value linkId={id} answers={answersFor(items, id)} />]);
          const showAllergies = linkIds.includes(LINK_ID.allergies);
          const allergies = answersFor(items, LINK_ID.allergies);
          return (
            <div class="stack">
              <div>
                <h3>{section.title}</h3>
                <p class="small muted">{section.why}</p>
              </div>
              {rows.length ? <KeyValue items={rows} /> : null}
              {showAllergies ? (
                allergies.length ? (
                  <div class="panel-brand">
                    <span class="kicker">{ITEM_LABEL[LINK_ID.allergies]}</span>
                    <div>
                      <Value linkId={LINK_ID.allergies} answers={allergies} />
                    </div>
                  </div>
                ) : (
                  <KeyValue items={[[ITEM_LABEL[LINK_ID.allergies], NO_ANSWER]]} />
                )
              ) : null}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
