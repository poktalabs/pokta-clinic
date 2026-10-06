"use client";
import Link from "next/link";
import { useState } from "react";
import { usePoll } from "./use-poll";

type Status = { state: "on" | "off" | "waking"; admin: boolean; render: { serviceSuspended: boolean; databaseSuspended: boolean } | null; renderConfigured: boolean };
type Outbox = { count: number | null; items: { kind: string; ageSeconds: number; attempts: number }[] };

const STATE_STYLE = {
  on: "bg-ok/15 text-ok",
  waking: "bg-warn/20 text-warn",
  off: "bg-bad/15 text-bad",
} as const;

const KIND_LABEL: Record<string, string> = { consent: "Consent", save_history: "History", appointment: "Appointment", escalate: "Escalation" };

const age = (s: number) => (s < 90 ? `${s}s` : s < 5400 ? `${Math.round(s / 60)} min` : `${Math.round(s / 3600)} h`);

export function EhrPanel() {
  const [status, setStatus] = useState<Status | null>(null);
  const [outbox, setOutbox] = useState<Outbox | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = async () => {
    const [s, o] = await Promise.all([fetch("/api/live/ehr", { cache: "no-store" }), fetch("/api/live/outbox", { cache: "no-store" })]);
    if (s.ok) setStatus(await s.json());
    if (o.ok) setOutbox(await o.json());
  };
  usePoll(load, 4000);

  async function act(label: string, url: string, body?: unknown) {
    setBusy(label);
    setNote(null);
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      const data = (await res.json().catch(() => ({}))) as { error?: string; succeeded?: number; remaining?: number; ehrDown?: boolean };
      if (!res.ok && !(url.includes("drain") && data.ehrDown)) setNote(data.error ?? `Request failed (${res.status})`);
      else if (url.includes("drain")) setNote(data.ehrDown ? "EHR is still down; nothing was synced." : `Synced ${data.succeeded ?? 0}, ${data.remaining ?? 0} left.`);
      else setNote(body && (body as { action: string }).action === "on" ? "Resume requested. The EHR takes a minute or more to wake." : "Suspend requested.");
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    await load();
  }

  const admin = status?.admin ?? false;
  return (
    <section aria-labelledby="ehr-h" className="rounded-xl border border-line bg-panel p-5">
      <h2 id="ehr-h" className="text-xl font-semibold">
        EHR and outbox
      </h2>
      <p className="mt-1 text-muted">The EHR (&quot;Expediente Demo&quot;) is a separate system. If it is off, writes wait in the outbox and sync when it returns.</p>
      <dl className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <dt className="text-sm text-muted">EHR state</dt>
          <dd className="mt-1" role="status">
            {status ? <span className={`inline-block rounded-full px-3 py-1 text-lg font-semibold ${STATE_STYLE[status.state]}`}>{status.state}</span> : <span className="text-muted">checking…</span>}
            {admin && status?.render && (
              <span className="ml-3 text-sm text-muted">
                Render: service {status.render.serviceSuspended ? "suspended" : "running"}, database {status.render.databaseSuspended ? "suspended" : "running"}
              </span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted">Outbox</dt>
          <dd className="mt-1 text-lg font-semibold">{outbox?.count ?? "…"} queued</dd>
          {outbox && outbox.items.length > 0 && (
            <ul className="mt-1 text-sm text-muted">
              {outbox.items.map((it, i) => (
                <li key={i}>
                  {KIND_LABEL[it.kind] ?? it.kind}, {age(it.ageSeconds)} old{it.attempts ? `, ${it.attempts} failed attempt${it.attempts > 1 ? "s" : ""}` : ""}
                </li>
              ))}
            </ul>
          )}
        </div>
      </dl>
      {admin && (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
          <button className="btn" disabled={!!busy} onClick={() => act("on", "/api/admin/ehr", { action: "on" })}>
            Turn EHR on
          </button>
          <button className="btn" disabled={!!busy} onClick={() => confirm("Suspend the EHR service and its database?") && act("off", "/api/admin/ehr", { action: "off" })}>
            Turn EHR off
          </button>
          <button className="btn" disabled={!!busy} onClick={() => act("drain", "/api/outbox/drain")}>
            Drain outbox
          </button>
          {busy && <span className="text-sm text-muted">Working…</span>}
        </div>
      )}
      {note && (
        <p className="mt-3 text-sm" role="status">
          {note}
        </p>
      )}
      <p className="mt-4 text-sm text-muted">
        {admin ? (
          <button className="underline underline-offset-2" onClick={logout}>
            Log out
          </button>
        ) : (
          <Link className="underline underline-offset-2" href="/admin">
            admin
          </Link>
        )}
      </p>
    </section>
  );
}
