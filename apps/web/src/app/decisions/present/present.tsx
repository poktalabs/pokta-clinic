"use client";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { flipTheme, toggleFullscreen } from "@/app/deck/controls";
import d from "@/app/deck/deck.module.css";
import { DECISIONS, GROUPS, KEY_ORDER, type Decision } from "@/decisions/data";
import { ROADMAP } from "@/decisions/roadmap";
import s from "./present.module.css";

// The decision log as a deck, on the /deck look and mechanics: one slide per decision, deep link per
// slide (#N), arrows / PageUp / PageDown / Space to move, Home / End to jump, F fullscreen, T theme.
// The roadmap's Scribe v2 Medical items close it. By default only the key decisions, in the order of
// the walkthrough (KEY_ORDER); ?all=1 shows all of them in log order.

type PresentSlide = {
  key: string;
  kicker: string;
  flag?: string;
  title: string;
  rows: { label: string; text: string }[];
  code: string[];
};

const GROUP_LABEL = Object.fromEntries(GROUPS.map((g) => [g.id, g.label]));

const decisionSlide = (x: Decision): PresentSlide => ({
  key: x.id,
  kicker: GROUP_LABEL[x.group],
  flag: x.status === "superseded" ? `Superseded${x.statusNote ? ` · ${x.statusNote}` : ""}` : undefined,
  title: x.title,
  rows: [
    { label: "Decision", text: x.summary },
    { label: "Why", text: x.presentWhy },
    { label: "Trade-off", text: x.presentTradeoff },
  ],
  code: x.code.map((c) => c.label),
});

const ROADMAP_SLIDES: PresentSlide[] = ROADMAP.filter((r) => r.inPresent).map((r) => ({
  key: r.id,
  kicker: `Roadmap and expansion · ${r.kind}`,
  title: r.title,
  rows: [
    { label: "What", text: r.summary },
    { label: "Why", text: r.presentWhy },
    { label: "Effort", text: r.effort },
  ],
  code: r.code?.map((c) => c.label) ?? [],
}));

const BY_ID = new Map(DECISIONS.map((x) => [x.id, x]));
const KEY_SLIDES = [...KEY_ORDER.flatMap((id) => BY_ID.get(id) ?? []).map(decisionSlide), ...ROADMAP_SLIDES];
const ALL_SLIDES = [...DECISIONS.map(decisionSlide), ...ROADMAP_SLIDES];

const pad = (n: number) => String(n).padStart(2, "0");
const onHashChange = (cb: () => void) => {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
};

export function Present({ all }: { all: boolean }) {
  const slides = all ? ALL_SLIDES : KEY_SLIDES;
  const count = slides.length;
  const clamp = useCallback((n: number) => Math.max(0, Math.min(count - 1, n)), [count]);
  // The URL hash is the slide state: deep links, reloads and back/forward all land on the same slide.
  const fromHash = useCallback(() => clamp((Number(window.location.hash.slice(1)) || 1) - 1), [clamp]);
  const index = useSyncExternalStore(onHashChange, fromHash, () => 0);

  const show = useCallback(
    (next: number) => {
      history.replaceState(null, "", `#${clamp(next) + 1}`);
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    },
    [clamp],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key;
      if (k === "ArrowRight" || k === "ArrowDown" || k === "PageDown" || k === " ") {
        e.preventDefault();
        show(index + 1);
      } else if (k === "ArrowLeft" || k === "ArrowUp" || k === "PageUp") {
        e.preventDefault();
        show(index - 1);
      } else if (k === "Home") {
        e.preventDefault();
        show(0);
      } else if (k === "End") {
        e.preventDefault();
        show(count - 1);
      } else if (k === "f" || k === "F") toggleFullscreen();
      else if (k === "t" || k === "T") flipTheme();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, count, show]);

  const slide = slides[index];
  const progress = ((index + 1) / count) * 100;

  return (
    <div className={d.deck}>
      <header className={d.topbar}>
        <div className={d.brand}>
          <Image src="/poktacare-logo.svg" alt="" width={28} height={28} priority />
          <div className={d.brandCopy}>
            <strong>
              Pokta<b>Clinic</b>
            </strong>
            <span>Decision log · present mode</span>
          </div>
        </div>
        <div className={d.meta}>
          <Link href={all ? "/decisions/present#1" : "/decisions/present?all=1#1"} className={s.exit} aria-label={all ? `Show the ${KEY_ORDER.length} key decisions only` : `Show all ${DECISIONS.length} decisions`}>
            {all ? `Key ${KEY_ORDER.length}` : `All ${DECISIONS.length}`}
          </Link>
          <b aria-live="polite">
            {pad(index + 1)} / {pad(count)}
          </b>
          <Link href={`/decisions#${slide.key}`} className={s.exit}>
            Exit
          </Link>
        </div>
      </header>

      <main className={d.main}>
        <section key={slide.key} className={d.slide} aria-roledescription="slide" aria-label={`${index + 1} of ${count}: ${slide.title}`}>
          <div className={d.slideInner}>
            <p className={s.kickerRow}>
              <span className={d.kicker}>{slide.kicker}</span>
              {slide.flag && <span className={s.flag}>{slide.flag}</span>}
            </p>
            <h1 className={s.title}>{slide.title}</h1>
            <dl className={s.rows}>
              {slide.rows.map((r, i) => (
                <div key={r.label} className={i === 0 ? s.lead : undefined}>
                  <dt>{r.label}</dt>
                  <dd>{r.text}</dd>
                </div>
              ))}
            </dl>
            {slide.code.length > 0 && <p className={s.code}>{slide.code.join("  ·  ")}</p>}
          </div>
        </section>
      </main>

      <div className={d.progress} aria-hidden="true">
        <span style={{ width: `${progress}%` }} />
      </div>
      <div className={d.counter} aria-hidden="true">
        POKTACLINIC / DECISIONS <span>← → move · F fullscreen · T theme</span>
      </div>
      <nav className={`${d.controls} ${s.controls}`} aria-label="Slide controls">
        <button type="button" onClick={() => show(index - 1)} disabled={index === 0} aria-label="Previous slide">
          ←
        </button>
        <button type="button" onClick={() => show(index + 1)} disabled={index === count - 1} aria-label="Next slide">
          →
        </button>
        <button type="button" onClick={flipTheme} aria-label="Switch light or dark">
          ◐
        </button>
        <button type="button" onClick={toggleFullscreen} aria-label="Fullscreen">
          ⛶
        </button>
      </nav>
    </div>
  );
}
