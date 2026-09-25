import React from "react";
import { AbsoluteFill, Audio, Easing, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

// The cover (founder, Sep 25 2026: "a very quick intro screen... like a
// YouTube thumbnail"). Frame 0 is the thumbnail: fully drawn, nothing fading
// in. A gold field, the app icon, the real numbers, the 3D object; then it
// punches through to the dark film on its first hit.

export const COVER_FRAMES = 30;
const INK = "#0A0908";
const CL = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

export type CoverSpec = {
  kicker: string;
  title: string;
  art: string;                 // a transparent Blender still
  artX?: number;               // shift of the still, in canvas widths
  artY: number;                // shift of the still, in canvas heights
  artScale: number;
};

export const Cover: React.FC<CoverSpec> = ({ kicker, title, art, artX = 0, artY, artScale }) => {
  const frame = useCurrentFrame();
  const { width: W, height: H } = useVideoConfig();
  const u = W / 1080;
  const out = interpolate(frame, [22, COVER_FRAMES - 1], [0, 1], { ...CL, easing: Easing.in(Easing.cubic) });
  const s = 1 + 0.025 * (frame / 22) + 0.22 * out;
  return (
    <AbsoluteFill style={{ background: INK }}>
      <AbsoluteFill style={{ opacity: 1 - out, transform: `scale(${s})`, filter: `blur(${8 * out}px)` }}>
        <AbsoluteFill style={{ background: "radial-gradient(ellipse 95% 70% at 50% 30%, #E6C352 0%, #C9A227 45%, #9C7A14 100%)" }} />
        <Img src={staticFile(art)} style={{ position: "absolute", left: 0, top: 0, width: W, height: H,
          transform: `translate(${artX * W}px, ${artY * H}px) scale(${artScale})`, transformOrigin: "50% 50%",
          filter: "drop-shadow(0 40px 60px rgba(40,28,0,.55))" }} />
        <AbsoluteFill style={{ alignItems: "center", paddingTop: H * 0.075 }}>
          <div style={{ width: 150 * u, height: 150 * u, borderRadius: 34 * u, background: INK, display: "flex",
            alignItems: "center", justifyContent: "center", boxShadow: "0 18px 40px rgba(40,28,0,.45)" }}>
            <Img src={staticFile("gary-mark.png")} style={{ width: 126 * u, height: 126 * u }} />
          </div>
          <div style={{ fontFamily: "Bebas", fontSize: 104 * u, lineHeight: 1, color: INK, letterSpacing: "0.02em", marginTop: 44 * u }}>{kicker}</div>
          <div style={{ fontFamily: "Bebas", fontSize: 236 * u, lineHeight: 0.92, color: INK, letterSpacing: "0.005em", marginTop: 6 * u }}>{title}</div>
        </AbsoluteFill>
        <AbsoluteFill style={{ mixBlendMode: "multiply", opacity: 0.35,
          background: "radial-gradient(ellipse 120% 90% at 50% 40%, transparent 55%, rgba(60,40,0,.9) 100%)" }} />
      </AbsoluteFill>
      <Audio src={staticFile("cover.wav")} />
    </AbsoluteFill>
  );
};
