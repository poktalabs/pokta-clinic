"use client";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function AdminLogin() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const password = new FormData(event.currentTarget).get("password");
    const res = await fetch("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
    if (res.ok) {
      router.push("/");
      return;
    }
    setError(res.status === 503 ? "Admin login is not configured." : "Wrong password.");
    setBusy(false);
  }

  return (
    <main className="login">
      <Link className="brand" href="/">
        <Image src="/poktacare-logo.svg" alt="" width={20} height={20} />
        <span className="wordmark">
          pokta-<b>clinic</b>
        </span>
      </Link>
      <div className="card">
        <p className="kicker">Admin</p>
        <h1 className="headline" style={{ marginTop: 8 }}>
          Sign in
        </h1>
        <p className="sub small">Controls the EHR on/off switch and the outbox drain.</p>
        <form onSubmit={submit} style={{ marginTop: 20, display: "grid", gap: 16 }}>
          <label className="field">
            <span>Password</span>
            <input name="password" type="password" required autoFocus autoComplete="current-password" />
          </label>
          <button className="btn btn-primary" disabled={busy} type="submit">
            Log in
          </button>
          {error && (
            <p role="alert" className="err">
              {error}
            </p>
          )}
        </form>
      </div>
      <p className="small" style={{ marginTop: 24 }}>
        <Link href="/">Back to the demo</Link>
      </p>
    </main>
  );
}
