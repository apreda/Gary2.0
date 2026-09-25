import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";

// The opening frame is the thumbnail (founder, Sep 25 2026: the gold card was
// "a bit harsh"; the start should just naturally be the thumbnail). It is a
// frame of the film itself: the same dark stage, the same object, the real
// line in the film's own type, sharp on frame 0. It holds a beat, then the
// film carries on out of it.

export const POSTER_HOLD = 18;
export const POSTER_FADE = 6;
const WHITE = "#F5F1E8";
const GOLD = "#C9A227";
const CL = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** The two lines of the poster; they leave over `leave` frames after the hold. */
export const PosterTitles: React.FC<{ kicker: string; title: string; leave?: number }> = ({ kicker, title, leave = POSTER_FADE }) => {
  const frame = useCurrentFrame();
  const { width: W, height: H } = useVideoConfig();
  const u = W / 1080;
  const out = interpolate(frame, [POSTER_HOLD, POSTER_HOLD + leave], [0, 1], CL);
  return (
    <AbsoluteFill style={{ alignItems: "center", paddingTop: H * 0.085, opacity: 1 - out,
      transform: `translateY(${-40 * out}px)`, filter: `blur(${6 * out}px)` }}>
      <div style={{ fontFamily: "Bebas", fontSize: 104 * u, lineHeight: 1, color: WHITE, letterSpacing: "0.02em",
        textShadow: "0 6px 36px rgba(0,0,0,.7)" }}>{kicker}</div>
      <div style={{ fontFamily: "Bebas", fontSize: 236 * u, lineHeight: 0.92, color: GOLD, marginTop: 4 * u,
        textShadow: "0 10px 50px rgba(0,0,0,.75)" }}>{title}</div>
    </AbsoluteFill>
  );
};

/** A still that holds, drifting in a touch, then (with `fade`) dissolves into
 *  whatever the film has underneath. */
export const PosterStill: React.FC<{ fade?: boolean; children: React.ReactNode }> = ({ fade, children }) => {
  const frame = useCurrentFrame();
  const out = fade ? interpolate(frame, [POSTER_HOLD, POSTER_HOLD + POSTER_FADE], [0, 1], CL) : 0;
  const push = 1 + 0.018 * Math.min(frame, POSTER_HOLD + POSTER_FADE) / POSTER_HOLD;
  return <AbsoluteFill style={{ opacity: 1 - out, transform: `scale(${push})` }}>{children}</AbsoluteFill>;
};

/** Behind the titles: the top of the frame darkened just enough to read them. */
export const PosterScrim: React.FC = () => (
  <AbsoluteFill style={{ background: "linear-gradient(to bottom, rgba(10,9,8,.97) 0%, rgba(10,9,8,.93) 29%, rgba(10,9,8,.35) 43%, rgba(10,9,8,0) 55%)" }} />
);
