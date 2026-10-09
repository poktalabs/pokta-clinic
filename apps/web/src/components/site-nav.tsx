"use client";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { EHR_URL } from "@/ehr-console";
import { ThemeToggle } from "./theme-toggle";

// Routes that render without the shared header and footer: the full-screen scenario deck, the decisions
// and gaps present modes, the patient's emailed link (patient-facing, keeps its own minimal header) and the admin
// login. To opt a new route out, add its prefix here.
export const CHROMELESS_PREFIXES = ["/deck", "/decisions/present", "/gaps/present", "/paciente", "/admin"];

export function isChromeless(pathname: string): boolean {
  return CHROMELESS_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/deck", label: "Scenario" },
  { href: "/explainer", label: "Live demo" },
  { href: "/review", label: "Call review" },
  { href: "/decisions", label: "Decisions" },
  { href: "/gaps", label: "Gaps" },
  { href: "/tools", label: "Tools" },
  { href: "/testing", label: "Testing" },
] as const;

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function SiteHeader() {
  const pathname = usePathname();
  // The mobile menu is open for the route it was opened on, so navigating closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const setOpen = (next: boolean) => setOpenOn(next ? pathname : null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  // Escape closes the open menu and returns focus to its button.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpenOn(null);
      toggleRef.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (isChromeless(pathname)) return null;

  return (
    <header className="site-header">
      <div className="wrap x-wide">
        <Link className="brand" href="/" aria-label="PoktaClinic home">
          <Image src="/poktacare-logo.svg" alt="" width={20} height={20} priority />
          <span className="wordmark">
            Pokta<b>Clinic</b>
          </span>
        </Link>
        <nav className="site-nav" aria-label="Main">
          <button ref={toggleRef} type="button" className="nav-toggle" aria-expanded={open} aria-controls="site-nav-list" onClick={() => setOpen(!open)}>
            <span className="nav-toggle-bars" aria-hidden="true" />
            Menu
          </button>
          <ul id="site-nav-list" className={open ? "nav-list is-open" : "nav-list"}>
            {LINKS.map((l) => {
              const active = isActive(pathname, l.href);
              return (
                <li key={l.href}>
                  <Link href={l.href} className={active ? "nav-link is-active" : "nav-link"} aria-current={active ? "page" : undefined}>
                    {l.label}
                  </Link>
                </li>
              );
            })}
            <li>
              <a href={`${EHR_URL}/`} target="_blank" rel="noreferrer" className="nav-link nav-ext" title="Password protected; opens in a new tab">
                EHR console
                <LockIcon />
                <span className="sr-only"> (password protected, opens in a new tab)</span>
              </a>
            </li>
          </ul>
        </nav>
        <ThemeToggle />
      </div>
    </header>
  );
}

export function SiteFooter() {
  const pathname = usePathname();
  if (isChromeless(pathname)) return null;
  return (
    <footer className="site-footer">
      <div className="wrap x-wide">
        <p className="muted">
          <strong className="soft">All data here is fictional.</strong> Grupo Médico Articular is a fictional rheumatology network and the agent is an AI, not a clinician. A Pokta Labs demo.
        </p>
        <ul className="footer-links">
          <li>
            <Link href="/privacidad">Aviso de privacidad</Link>
          </li>
          <li>
            <a href={`${EHR_URL}/developer`} target="_blank" rel="noreferrer">
              EHR developer page<span className="sr-only"> (opens in a new tab)</span>
            </a>
          </li>
          <li>
            <a href={`${EHR_URL}/fhir/metadata`} target="_blank" rel="noreferrer">
              FHIR metadata<span className="sr-only"> (opens in a new tab)</span>
            </a>
          </li>
        </ul>
      </div>
    </footer>
  );
}

function LockIcon() {
  return (
    <svg className="nav-lock" width="11" height="11" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
      <rect x="2" y="5.5" width="8" height="5.5" fill="currentColor" />
      <path d="M3.75 5.5V4a2.25 2.25 0 0 1 4.5 0v1.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
