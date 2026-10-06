"use client";
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
    <main className="mx-auto w-full max-w-sm px-6 py-24">
      <h1 className="text-2xl font-semibold">Admin</h1>
      <p className="mt-1 text-muted">Controls the EHR on/off switch and the outbox drain.</p>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <label className="block">
          <span className="text-sm text-muted">Password</span>
          <input name="password" type="password" required autoFocus autoComplete="current-password" className="mt-1 w-full rounded-lg border border-line bg-panel px-3 py-2" />
        </label>
        <button className="btn" disabled={busy} type="submit">
          Log in
        </button>
        {error && (
          <p role="alert" className="text-bad">
            {error}
          </p>
        )}
      </form>
      <p className="mt-6 text-sm">
        <Link className="underline underline-offset-2" href="/">
          Back to the demo
        </Link>
      </p>
    </main>
  );
}
