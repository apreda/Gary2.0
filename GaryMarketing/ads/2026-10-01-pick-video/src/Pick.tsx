import React from "react";
import {
  AbsoluteFill, Audio, Easing, Img, OffthreadVideo, Sequence,
  interpolate, spring, staticFile, useCurrentFrame, useVideoConfig,
} from "remotion";
import { loadFont as loadTight } from "@remotion/google-fonts/InterTight";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";

// THE FREE PICK VIDEO (Oct 1 2026). One pick as a 13-second square for X:
// the real pick card springs in, flips to Gary's reasoning, then the end card.
// Square because X shows 1:1 at full feed width on a phone without cropping.
// Same stage and type as launch film v2. Nothing on screen is redrawn; the
// card is a capture from the app. Copy says only what the card can't: that
// it is free, and that the reasoning comes with it.

const { fontFamily: TIGHT } = loadTight("normal", { weights: ["700", "800"], subsets: ["latin"] });
const { fontFamily: SANS } = loadInter("normal", { weights: ["500", "600"], subsets: ["latin"] });

const FPS = 30;
const BPM = 128;
const BEAT = (FPS * 60) / BPM;                     // 14.06 frames
const F = (beat: number) => Math.round(beat * BEAT);
const CL = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
export const PICK_FRAMES = F(28);                  // 13.1 s

const PAPER = "#ECECE9";
const INK = "#15130F";
const MUTED = "#57534C";

// Beats.
const T = { cardIn: 1.5, flipAt: 10, cardOut: 20, end: 20, flipSrc: 0.45 };
// The card region of a 1320×2868 Picks capture.
const CROP = { x: 40, y: 470, w: 1240, h: 760 };

const Stage: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: PAPER }}>
      <AbsoluteFill style={{ background: `radial-gradient(circle at ${72 + 8 * Math.sin(f / 45)}% ${36 + 8 * Math.cos(f / 60)}%, rgba(201,162,39,.30), transparent 40%)` }} />
      <AbsoluteFill style={{ background: `radial-gradient(circle at ${18 - 6 * Math.sin(f / 70)}% 92%, rgba(201,162,39,.14), transparent 36%)` }} />
    </AbsoluteFill>
  );
};

/** A headline that lands word by word, with an optional quiet line under it. */
const Words: React.FC<{ from: number; to: number; lines: string[]; sub?: string;
  align?: "left" | "center"; x: number; y: number; w: number; size: number }> =
  ({ from, to, lines, sub, align = "left", x, y, w, size }) => {
    const frame = useCurrentFrame();
    const a = F(from) + 2, z = F(to) - 5;
    if (frame < a || frame > z + 8) return null;
    const out = interpolate(frame, [z, z + 7], [0, 1], { ...CL, easing: Easing.in(Easing.cubic) });
    const subP = interpolate(frame, [a + 10, a + 20], [0, 1], { ...CL, easing: Easing.out(Easing.cubic) });
    let n = 0;
    return (
      <div style={{ position: "absolute", left: x, top: y, width: w, textAlign: align, opacity: 1 - out,
        transform: `translateY(${-24 * out}px)` }}>
        {lines.map((line, li) => (
          <div key={li} style={{ fontFamily: TIGHT, fontWeight: 800, fontSize: size, lineHeight: 1.0,
            letterSpacing: "-0.035em", color: INK, overflow: "hidden", paddingBottom: size * 0.08 }}>
            {line.split(" ").map((word, wi) => {
              const d = a + 2.5 * n++;
              const p = interpolate(frame, [d, d + 9], [0, 1], { ...CL, easing: Easing.out(Easing.cubic) });
              return <span key={wi} style={{ display: "inline-block", marginRight: size * 0.24,
                transform: `translateY(${(1 - p) * 110}%)`, opacity: p }}>{word}</span>;
            })}
          </div>
        ))}
        {sub ? <div style={{ fontFamily: SANS, fontWeight: 500, fontSize: size * 0.4, lineHeight: 1.3, color: MUTED,
          marginTop: size * 0.18, opacity: subP, transform: `translateY(${(1 - subP) * 14}px)` }}>{sub}</div> : null}
      </div>
    );
  };

/** The card: springs in, pushes in slowly, flips to the reasoning, cuts away. */
const Card: React.FC<{ w: number; x: number; y: number }> = ({ w, x, y }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const a = F(T.cardIn), z = F(T.cardOut), flip = F(T.flipAt);
  if (frame < a || frame > z + 6) return null;
  const p = spring({ frame: frame - a, fps, config: { damping: 17, stiffness: 150, mass: 0.8 } });
  const drift = interpolate(frame, [a, z], [0, 1], CL);
  const out = interpolate(frame, [z - 1, z + 6], [0, 1], { ...CL, easing: Easing.in(Easing.cubic) });
  const k = w / CROP.w;
  const img: React.CSSProperties = { position: "absolute", left: -CROP.x * k, top: -CROP.y * k, width: 1320 * k, display: "block" };
  return (
    <div style={{ position: "absolute", left: x, top: y, perspective: 1600, opacity: Math.min(1, p * 1.6) * (1 - out) }}>
      <div style={{ transform: `translateY(${(1 - p) * 140 - out * 60}px) rotateX(${(1 - p) * 14}deg) scale(${(0.9 + 0.1 * p) * (1 + 0.035 * drift) * (1 + 0.04 * out)})` }}>
        <div style={{ width: w, height: CROP.h * k, borderRadius: 34, overflow: "hidden", background: "#0A0908", position: "relative",
          boxShadow: "0 40px 90px rgba(20,16,8,.28), 0 8px 24px rgba(20,16,8,.18)" }}>
          {frame < flip ? <Img src={staticFile("pick_front.png")} style={img} /> : <>
            <Img src={staticFile("pick_back.png")} style={img} />
            <Sequence from={flip} durationInFrames={Math.round(0.85 * fps)} layout="none">
              <OffthreadVideo src={staticFile("pick_flip.mp4")} trimBefore={Math.round(T.flipSrc * fps)} muted style={img} />
            </Sequence>
          </>}
        </div>
      </div>
    </div>
  );
};

const Mark: React.FC<{ size: number }> = ({ size }) => (
  <Img src={staticFile("icon.png")} style={{ width: size, height: size, borderRadius: size * 0.225,
    boxShadow: "0 30px 70px rgba(20,16,8,.30)" }} />
);

const End: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  if (frame < F(T.end)) return null;
  const t = frame - F(T.end);
  const p = spring({ frame: t, fps, config: { damping: 15, stiffness: 150 } });
  const fade = (d: number) => interpolate(t, [d, d + 10], [0, 1], { ...CL, easing: Easing.out(Easing.cubic) });
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column", textAlign: "center" }}>
      <div style={{ transform: `scale(${0.7 + 0.3 * p})`, opacity: Math.min(1, p * 1.5) }}><Mark size={170} /></div>
      <div style={{ position: "relative", width: "100%", height: 220, marginTop: 26 }}>
        <Words from={T.end + 0.6} to={T.end + 12} lines={["Gary A.I.", "A pick for every game."]} align="center"
          x={0} y={0} w={width} size={84} />
      </div>
      <div style={{ opacity: fade(24), fontFamily: SANS, fontWeight: 600, fontSize: 38, color: PAPER, background: INK,
        padding: "20px 44px", borderRadius: 18, marginTop: 8 }}>Free on the App Store</div>
      <div style={{ opacity: fade(34), fontFamily: SANS, fontWeight: 500, fontSize: 22, color: MUTED, marginTop: 30 }}>
        21+ | Not a sportsbook | Gambling problem? Call 1-800-GAMBLER
      </div>
    </AbsoluteFill>
  );
};

export const Pick: React.FC = () => {
  const frame = useCurrentFrame();
  const cardW = 920;
  const cardH = (CROP.h * cardW) / CROP.w;
  const cardY = 1080 - cardH - 92;
  const vol = interpolate(frame, [PICK_FRAMES - 24, PICK_FRAMES - 1], [0.9, 0], CL);
  return (
    <AbsoluteFill style={{ background: PAPER, overflow: "hidden" }}>
      <Stage />
      <Words from={0} to={T.flipAt} lines={["Today's free pick."]} x={80} y={84} w={920} size={96} />
      <Words from={T.flipAt} to={T.cardOut} lines={["And why."]} sub="Every pick comes with Gary's reasoning."
        x={80} y={84} w={920} size={96} />
      <Card w={cardW} x={(1080 - cardW) / 2} y={cardY} />
      <End />
      <Audio src={staticFile("score.wav")} volume={vol} />
    </AbsoluteFill>
  );
};
