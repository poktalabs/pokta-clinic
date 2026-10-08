import type { Metadata } from "next";
import { Fragment } from "react";
import { AVISO } from "@/content/aviso-privacidad";

export const metadata: Metadata = {
  title: "Aviso de privacidad: Grupo Médico Articular (demo PoktaClinic)",
};

// The full notice the voice agent points to. The agent reads only the short version on the call; the
// same text (apps/web/src/content/aviso-privacidad.ts) is in its knowledge base for questions.
// Fictional: Grupo Médico Articular does not exist and this text has not been reviewed by a lawyer.
export default function Privacidad() {
  return (
    <>

      <main className="wrap wrap-narrow page" lang="es-MX">
        <section aria-labelledby="aviso-h">
          <p className="kicker">{AVISO.title}</p>
          <h1 id="aviso-h" className="headline">
            {AVISO.entity}
          </h1>
          <p role="note" className="notice">
            <strong>{AVISO.disclaimer.lead}</strong> {AVISO.disclaimer.rest}
          </p>
        </section>

        <section className="card prose">
          {AVISO.sections.map((section) => (
            <Fragment key={section.heading}>
              <h2 className="title">{section.heading}</h2>
              {section.paragraphs.map((p) => (
                <p key={p}>{p}</p>
              ))}
            </Fragment>
          ))}
        </section>
      </main>
    </>
  );
}
