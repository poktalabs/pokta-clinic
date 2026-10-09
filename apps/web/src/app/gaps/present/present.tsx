"use client";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { flipTheme, toggleFullscreen } from "@/app/deck/controls";
import d from "@/app/deck/deck.module.css";
import s from "@/app/decisions/present/present.module.css";
import { GAPS, GROUPS, bySeverity, type Gap } from "@/gaps/data";
import { VIDEO, type VideoGap } from "@/gaps/video";

// The production gaps as a deck, on the /decisions/present look and mechanics: one slide per gap, deep link
// per slide (#N), arrows / PageUp / PageDown / Space to move, Home / End to jump, F fullscreen, T theme.
// By default the 5 video gaps (video.ts) in speaking order; ?all=1 shows every gap, grouped, most severe first.

type PresentSlide = { key: string; kicker: string; flag: string; title: string; rows: { label: string; text: string }[] };

const GROUP_LABEL = Object.fromEntries(GROUPS.map((x) => [x.id, x.label]));
const BY_ID = new Map(GAPS.map((x) => [x.id, x]));

const gapSlide = (x: Gap): PresentSlide => ({
  key: x.id,
  kicker: GROUP_LABEL[x.group],
  flag: x.severity,
  title: x.title,
  rows: [
    { label: "Gap", text: x.summary },
    { label: "Why", text: x.presentWhy },
    { label: "Fix", text: x.presentFix },
  ],
});

const videoSlide = (v: VideoGap, i: number): PresentSlide => {
  const card = BY_ID.get(v.id);
  return {
    key: v.id,
    kicker: `${i + 1} of ${VIDEO.length} · ${card ? GROUP_LABEL[card.group] : ""}`,
    flag: card?.severity ?? "",
    title: v.title,
    rows: [
      { label: "Gap", text: v.gap },
      { label: "Fix", text: v.fix },
    ],
  };
};

const SLIDES = {
  video: VIDEO.map(videoSlide),
  all: GROUPS.flatMap((grp) => bySeverity(GAPS.filter((x) => x.group === grp.id))).map(gapSlide),
};

const pad = (n: number) => String(n).padStart(2, "0");
const onHashChange = (cb: () => void) => {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
};

export function Present({ all }: { all: boolean }) {
  const slides = all ? SLIDES.all : SLIDES.video;
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
          <div className={`${d.brandCopy} ${s.brandCopy}`}>
            <strong>
              Pokta<b>Clinic</b>
            </strong>
            <span>Production gaps · present mode</span>
          </div>
        </div>
        <div className={d.meta}>
          <Link href={all ? "/gaps/present#1" : "/gaps/present?all=1#1"} className={s.exit} aria-label={all ? `Show the ${VIDEO.length} video gaps only` : `Show all ${GAPS.length} gaps`}>
            {all ? `Video ${VIDEO.length}` : `All ${GAPS.length}`}
          </Link>
          <b aria-live="polite">
            {pad(index + 1)} / {pad(count)}
          </b>
          <Link href={`/gaps#${slide.key}`} className={s.exit}>
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
          </div>
        </section>
      </main>

      <div className={d.progress} aria-hidden="true">
        <span style={{ width: `${progress}%` }} />
      </div>
      <div className={d.counter} aria-hidden="true">
        POKTACLINIC / GAPS <span>← → move · F fullscreen · T theme</span>
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
