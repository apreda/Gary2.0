"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

// A real recording of the app, played inside a phone frame. Autoplays muted
// and loops; viewers who prefer reduced motion get the poster and a play
// control instead. No mockups: the tape is captured from the shipping build.
export function ProductTape({
  mp4,
  webm,
  poster,
  caption,
}: {
  mp4: string;
  webm?: string;
  poster: string;
  caption: string;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const reduced = useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(REDUCED_MOTION);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => false,
  );
  useEffect(() => {
    const el = video.current;
    if (!el) return;
    if (reduced) el.pause();
    else el.play().catch(() => {});
  }, [reduced]);
  return (
    <figure className="m-0">
      <div className="site-tape">
        <video
          ref={video}
          className="block h-auto w-full"
          autoPlay={!reduced}
          muted
          loop
          playsInline
          controls={reduced}
          preload="metadata"
          poster={poster}
          aria-label={caption}
        >
          {webm && <source src={webm} type="video/webm" />}
          <source src={mp4} type="video/mp4" />
        </video>
      </div>
      <figcaption className="mt-3 text-center font-mono text-[10.5px] uppercase tracking-[0.06em] text-low">
        {caption}
      </figcaption>
    </figure>
  );
}
