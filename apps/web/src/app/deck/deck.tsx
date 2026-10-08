"use client";
import Image from "next/image";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { flipTheme, toggleFullscreen as fullscreen } from "./controls";
import { SLIDES } from "./slides";
import s from "./deck.module.css";

// Port of the standalone slide-cycling deck (pokta-care docs/decks/rheumai-beta-launch): one slide at a
// time, deep link per slide (#slide-N), arrows / PageUp / PageDown / Space to move, Home / End to jump,
// N for speaker notes, F for fullscreen, T for light or dark.

const pad = (n: number) => String(n).padStart(2, "0");
const clamp = (n: number) => Math.max(0, Math.min(SLIDES.length - 1, n));
const fromHash = () => clamp((Number(window.location.hash.replace("#slide-", "")) || 1) - 1);
const onHashChange = (cb: () => void) => {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
};

export function Deck() {
  // The URL hash is the slide state: deep links, reloads and back/forward all land on the same slide.
  const index = useSyncExternalStore(onHashChange, fromHash, () => 0);
  const [notes, setNotes] = useState(false);

  const show = useCallback((next: number) => {
    history.replaceState(null, "", `#slide-${clamp(next) + 1}`);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  }, []);

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
        show(SLIDES.length - 1);
      } else if (k === "n" || k === "N") setNotes((v) => !v);
      else if (k === "f" || k === "F") fullscreen();
      else if (k === "t" || k === "T") flipTheme();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, show]);

  const slide = SLIDES[index];
  const progress = ((index + 1) / SLIDES.length) * 100;

  return (
    <div className={s.deck}>
      <header className={s.topbar}>
        <div className={s.brand}>
          <Image src="/poktacare-logo.svg" alt="" width={28} height={28} priority />
          <div className={s.brandCopy}>
            <strong>
              Pokta<b>Clinic</b>
            </strong>
            <span>The scenario · voice pre-consultation</span>
          </div>
        </div>
        <div className={s.meta}>
          <span>Grupo Médico Articular · fictional</span>
          <b aria-live="polite">
            {pad(index + 1)} / {pad(SLIDES.length)}
          </b>
        </div>
      </header>

      <main className={s.main}>
        <section key={index} className={s.slide} aria-roledescription="slide" aria-label={`${index + 1} of ${SLIDES.length}: ${slide.label}`}>
          <div className={s.slideInner}>{slide.body}</div>
        </section>
      </main>

      {notes ? (
        <aside className={s.notes} aria-label="Speaker notes">
          <p className={s.notesHead}>
            Notes · {pad(index + 1)} {slide.label}
            {index + 1 < SLIDES.length ? <span>Next: {SLIDES[index + 1].label}</span> : <span>Next: live demo</span>}
          </p>
          <p className={s.notesBody}>{slide.notes}</p>
        </aside>
      ) : null}

      <div className={s.progress} aria-hidden="true">
        <span style={{ width: `${progress}%` }} />
      </div>
      <div className={s.counter} aria-hidden="true">
        POKTACLINIC / POKTA LABS <span>N notes · F fullscreen · T theme</span>
      </div>
      <nav className={s.controls} aria-label="Slide controls">
        <button type="button" onClick={() => show(index - 1)} disabled={index === 0} aria-label="Previous slide">
          ←
        </button>
        <button type="button" onClick={() => show(index + 1)} disabled={index === SLIDES.length - 1} aria-label="Next slide">
          →
        </button>
        <button type="button" onClick={() => setNotes((v) => !v)} aria-pressed={notes} aria-label="Speaker notes">
          N
        </button>
        <button type="button" onClick={flipTheme} aria-label="Switch light or dark">
          ◐
        </button>
        <button type="button" onClick={fullscreen} aria-label="Fullscreen">
          ⛶
        </button>
      </nav>
    </div>
  );
}
