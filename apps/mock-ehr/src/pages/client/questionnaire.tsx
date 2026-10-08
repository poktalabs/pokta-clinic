import { QuestionnaireItem, RHEUM_FIRST_VISIT_ITEMS } from "@pokta-clinic/fhir";
import { asc, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/client.js";
import { intake, questionnaire } from "../../db/schema.js";
import { CLINICAL_SECTIONS, ITEM_LABEL } from "./clinical.js";
import { COMPLETION, VALIDATION, dateOnly } from "./format.js";
import { Card, ClientLayout, Empty, KeyValue, PageHeader, Pill, Section } from "./ui.js";

const TYPE_LABEL = { string: "Texto libre", integer: "Número (minutos)", boolean: "Sí / No" } as const;

export async function loadQuestionnaire() {
  const [[q], completion, validation] = await Promise.all([
    db.select().from(questionnaire).orderBy(asc(questionnaire.createdAt)).limit(1),
    db.select({ key: intake.completion, n: sql<number>`count(*)::int` }).from(intake).groupBy(intake.completion),
    db.select({ key: intake.status, n: sql<number>`count(*)::int` }).from(intake).groupBy(intake.status),
  ]);
  const parsed = z.array(QuestionnaireItem).safeParse(q?.items);
  return {
    q: q ? { url: q.url, version: q.version, title: q.title, status: q.status, createdAt: q.createdAt } : null,
    items: parsed.success ? parsed.data : RHEUM_FIRST_VISIT_ITEMS,
    completion: Object.fromEntries(completion.map((r) => [r.key, r.n])) as Record<string, number>,
    validation: Object.fromEntries(validation.map((r) => [r.key, r.n])) as Record<string, number>,
  };
}

export function QuestionnairePage(props: Awaited<ReturnType<typeof loadQuestionnaire>>) {
  const { q, items, completion, validation } = props;
  if (!q) {
    return (
      <ClientLayout title="Cuestionario" active="cuestionario">
        <PageHeader kicker="Primera consulta de reumatología" title="Cuestionario" />
        <Empty>Todavía no hay un cuestionario publicado.</Empty>
      </ClientLayout>
    );
  }
  const position = new Map(items.map((it, i) => [it.linkId, i + 1]));
  const byId = new Map(items.map((it) => [it.linkId, it]));
  const known = new Set(CLINICAL_SECTIONS.flatMap((s) => s.linkIds));
  // Items added later that no clinical section covers still show, in a last group.
  const extra = items.filter((it) => !known.has(it.linkId));
  const sections = [
    ...CLINICAL_SECTIONS.map((s) => ({ id: s.id, title: s.title, why: s.why as string | undefined, list: s.linkIds.map((l) => byId.get(l)).filter((it): it is QuestionnaireItem => !!it) })),
    ...(extra.length ? [{ id: "otras", title: "Otras preguntas", why: undefined, list: extra }] : []),
  ].filter((s) => s.list.length);
  const total = Object.values(completion).reduce((a, b) => a + b, 0);

  return (
    <ClientLayout title="Cuestionario" active="cuestionario">
      <PageHeader
        kicker="Primera consulta de reumatología"
        title={q.title}
        lede="El asistente de voz hace estas preguntas al paciente antes de su primera consulta. Las respuestas llegan al reumatólogo como un resumen de pre-consulta, pendiente de validación médica."
        meta={
          <div class="row">
            <Pill tone="brand">Versión {q.version}</Pill>
            <Pill tone={q.status === "active" ? "ok" : "neutral"}>{q.status === "active" ? "Activo" : q.status === "draft" ? "Borrador" : "Retirado"}</Pill>
            <Pill tone="neutral">{items.length} preguntas</Pill>
          </div>
        }
      />
      <div class="section">
        <Card>
          <KeyValue items={[["Identificador canónico", <span class="mono">{q.url}</span>], ["Publicado", dateOnly(q.createdAt)]]} />
        </Card>
      </div>
      {sections.map((s) => (
        <Section id={s.id} title={s.title} description={s.why}>
          <ol class="stack plain">
            {s.list.map((it) => (
              <li class="card" value={position.get(it.linkId)}>
                <div class="stack">
                  <div class="row">
                    <strong>
                      {position.get(it.linkId)}. {ITEM_LABEL[it.linkId] ?? it.linkId}
                    </strong>
                  </div>
                  <p>{it.text}</p>
                  <div class="row">
                    <Pill tone="neutral">{TYPE_LABEL[it.type]}</Pill>
                    {it.required ? <Pill tone="brand">Obligatoria</Pill> : null}
                    {it.repeats ? <Pill tone="neutral">Admite varias respuestas</Pill> : null}
                    <span class="mono small muted">{it.linkId}</span>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </Section>
      ))}
      <Section id="respuestas" title="Respuestas recibidas" description="Pre-consultas capturadas por el asistente con este cuestionario.">
        {total === 0 ? (
          <Empty>Todavía no se ha recibido ninguna pre-consulta.</Empty>
        ) : (
          <Card>
            <div class="stack">
              <div class="row">
                <span class="small muted">Por avance:</span>
                {(Object.keys(COMPLETION) as (keyof typeof COMPLETION)[]).map((k) => (
                  <Pill tone={COMPLETION[k].tone}>
                    {COMPLETION[k].label}: {completion[k] ?? 0}
                  </Pill>
                ))}
              </div>
              <div class="row">
                <span class="small muted">Por revisión médica:</span>
                {(Object.keys(VALIDATION) as (keyof typeof VALIDATION)[]).map((k) => (
                  <Pill tone={VALIDATION[k].tone}>
                    {VALIDATION[k].label}: {validation[k] ?? 0}
                  </Pill>
                ))}
              </div>
              <p class="small">
                <a href="/pacientes?revision=pendiente">Ver pre-consultas por revisar</a>
              </p>
            </div>
          </Card>
        )}
      </Section>
    </ClientLayout>
  );
}
