"use client";
import { useState } from "react";
import type { PatientProfile } from "@/ehr";

type Field = { key: keyof PatientProfile & string; label: string; type?: string; hint?: string; inputMode?: "numeric" | "email" | "tel" };

const FIELDS: Field[] = [
  { key: "email", label: "Correo electrónico", type: "email", inputMode: "email" },
  { key: "address", label: "Domicilio", hint: "Calle, número, colonia, alcaldía o municipio" },
  { key: "postalCode", label: "Código postal", inputMode: "numeric" },
  { key: "emergencyContactName", label: "Contacto de emergencia: nombre" },
  { key: "emergencyContactPhone", label: "Contacto de emergencia: teléfono", inputMode: "tel", hint: "10 dígitos" },
  { key: "insurer", label: "Aseguradora", hint: "Déjelo vacío si no tiene seguro de gastos médicos" },
  { key: "policyNumber", label: "Número de póliza" },
];

// The data the clinic needs before the visit and the call did not collect. Saved to the EHR Patient.
export function PatientForm({ token, profile }: { token: string; profile: PatientProfile }) {
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(FIELDS.map((f) => [f.key, String(profile[f.key] ?? "")])));
  const [saved, setSaved] = useState<Record<string, string>>(values);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const missing = FIELDS.filter((f) => !saved[f.key]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch(`/api/paciente/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "No se pudo guardar.");
      setSaved(values);
      setStatus({ ok: true, text: "Guardado en su expediente." });
    } catch (err) {
      setStatus({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card" aria-labelledby="form-h">
      <div className="section-head">
        <h2 id="form-h" className="title">
          Complete sus datos antes de la consulta
        </h2>
        <span className={`pill ${missing.length ? "pill-attn" : "pill-ok"}`}>{missing.length ? `Faltan ${missing.length}` : "Completo"}</span>
      </div>
      <p className="sub small">Así la recepción no le pide estos datos el día de su cita.</p>
      <form className="p-form" onSubmit={submit}>
        {FIELDS.map((f) => (
          <label key={f.key} className="p-field">
            <span className="x-label small">
              {f.label} {!saved[f.key] && <span className="pill pill-attn">falta</span>}
            </span>
            <input
              className="x-input"
              type={f.type ?? "text"}
              inputMode={f.inputMode}
              value={values[f.key]}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
            />
            {f.hint && <span className="small muted">{f.hint}</span>}
          </label>
        ))}
        <div className="actions">
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "Guardando…" : "Guardar"}
          </button>
          {status && (
            <span role="status" className={`small ${status.ok ? "" : "x-error"}`}>
              {status.text}
            </span>
          )}
        </div>
      </form>
    </section>
  );
}
