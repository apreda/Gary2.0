import React from "react";
import {
  AbsoluteFill, Audio, Easing, Img, OffthreadVideo, continueRender, delayRender,
  interpolate, spring, staticFile, useCurrentFrame, useVideoConfig,
} from "remotion";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";

// THE FREE PICK UNVEIL (Oct 1 2026, Adam: "recording the pick unveil the app
// has"). A 4:5 post for X (Ad.md §6) cut from a screen recording of the app's
// own Winners unveil: the sealed pack tears, the pick spells out, then the
// card rises and Gary's breakdown fills in. The recording runs full bleed, so
// there's no frame or border around it. A slow camera window moves from the
// pack to the breakdown. Frame 0 is the sealed pack under the headline,
// because X shows the first frame before anything plays.

const { fontFamily: SANS } = loadInter("normal", { weights: ["500", "600"], subsets: ["latin"] });
const BEBAS = "GaryBebas";
const fontHandle = delayRender("Bebas Neue");
new FontFace(BEBAS, `url(${staticFile("BebasNeue-Regular.ttf")})`).load()
  .then((f) => { document.fonts.add(f); continueRender(fontHandle); })
  .catch(() => continueRender(fontHandle));

const FPS = 30;
const CL = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

const INK = "#0A0908";
const CREAM = "#F2EDE4";
const GOLD = "#F0CD62";
const GOLD_DEEP = "#C9A227";
const SUPPORT = "#BDB6AA";

// Seconds of output. `srcIn` trims the recording to the first frame where the
// sealed pack sits alone on dark (the board behind it has faded).
const T = { srcIn: 2.15, pan: [6.45, 7.95], headOut: 6.1, end: 9.9, total: 12.9 };
export const UNVEIL_FRAMES = Math.round(T.total * FPS);

// The recording is 1320×2868. The window is its full width scaled to 1080,
// so 1650 source pixels tall fill the 1350 frame. y = the window's top edge.
const SRC_W = 1320;
const K = 1080 / SRC_W;
const WIN = { packY: 470, breakdownY: 250 };

const s = (sec: number) => Math.round(sec * FPS);

const Recording: React.FC = () => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [s(T.pan[0]), s(T.pan[1])], [0, 1], { ...CL, easing: Easing.inOut(Easing.cubic) });
  const y = WIN.packY + (WIN.breakdownY - WIN.packY) * p;
  const out = interpolate(frame, [s(T.end), s(T.end) + 10], [1, 0], CL);
  return (
    <AbsoluteFill style={{ opacity: out }}>
      <OffthreadVideo src={staticFile("unveil.mp4")} trimBefore={s(T.srcIn)} muted
        style={{ position: "absolute", left: 0, top: -y * K, width: SRC_W * K, display: "block" }} />
    </AbsoluteFill>
  );
};

/** Lockup and headline: on screen from frame 0, gone before the camera pans. */
const Head: React.FC = () => {
  const frame = useCurrentFrame();
  const out = interpolate(frame, [s(T.headOut), s(T.headOut) + 9], [0, 1], { ...CL, easing: Easing.in(Easing.cubic) });
  if (out >= 1) return null;
  return (
    <div style={{ position: "absolute", left: 64, top: 52, opacity: 1 - out, transform: `translateY(${-20 * out}px)` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <Img src={staticFile("icon.png")} style={{ width: 54, height: 54, borderRadius: 12 }} />
        <div style={{ fontFamily: BEBAS, fontSize: 40, letterSpacing: "0.04em", color: CREAM }}>GARY A.I.</div>
      </div>
      <div style={{ fontFamily: BEBAS, fontSize: 112, lineHeight: 1, letterSpacing: "0.01em", marginTop: 18,
        textShadow: "0 4px 24px rgba(0,0,0,.6)" }}>
        <span style={{ color: CREAM }}>TODAY'S </span>
        <span style={{ backgroundImage: `linear-gradient(180deg, ${GOLD}, ${GOLD_DEEP})`, WebkitBackgroundClip: "text", color: "transparent" }}>FREE PICK</span>
      </div>
    </div>
  );
};

const End: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (frame < s(T.end)) return null;
  const t = frame - s(T.end);
  const bg = interpolate(t, [0, 10], [0, 1], CL);
  const p = spring({ frame: t - 4, fps, config: { damping: 15, stiffness: 150 } });
  const fade = (d: number) => interpolate(t, [d, d + 10], [0, 1], { ...CL, easing: Easing.out(Easing.cubic) });
  return (
    <AbsoluteFill style={{ background: INK, opacity: bg, alignItems: "center", justifyContent: "center", flexDirection: "column", textAlign: "center" }}>
      <AbsoluteFill style={{ background: "radial-gradient(circle at 50% 42%, rgba(201,162,39,.25), transparent 46%)" }} />
      <div style={{ transform: `scale(${0.75 + 0.25 * p})`, opacity: Math.min(1, p * 1.5) }}>
        <Img src={staticFile("icon.png")} style={{ width: 190, height: 190, borderRadius: 42, boxShadow: "0 30px 80px rgba(0,0,0,.6)" }} />
      </div>
      <div style={{ fontFamily: BEBAS, fontSize: 128, lineHeight: 0.95, marginTop: 40, opacity: fade(8) }}>
        <div style={{ color: CREAM }}>GARY A.I.</div>
        <div style={{ backgroundImage: `linear-gradient(180deg, ${GOLD}, ${GOLD_DEEP})`, WebkitBackgroundClip: "text", color: "transparent" }}>A PICK FOR EVERY GAME.</div>
      </div>
      <div style={{ opacity: fade(18), marginTop: 44, fontFamily: SANS, fontWeight: 600, fontSize: 40, color: INK,
        background: `linear-gradient(180deg, ${GOLD}, ${GOLD_DEEP})`, padding: "22px 54px", borderRadius: 999 }}>Get Gary free</div>
      <div style={{ opacity: fade(24), marginTop: 20, fontFamily: SANS, fontWeight: 500, fontSize: 30, color: SUPPORT }}>On the App Store</div>
      <div style={{ position: "absolute", bottom: 54, width: "100%", opacity: fade(30), fontFamily: SANS, fontWeight: 500, fontSize: 24, color: "#8A8378" }}>
        21+ | Not a sportsbook | Gambling problem? Call 1-800-GAMBLER
      </div>
    </AbsoluteFill>
  );
};

export const Unveil: React.FC = () => {
  const frame = useCurrentFrame();
  const vol = interpolate(frame, [UNVEIL_FRAMES - 24, UNVEIL_FRAMES - 1], [0.85, 0], CL);
  return (
    <AbsoluteFill style={{ background: INK, overflow: "hidden" }}>
      <Recording />
      <Head />
      <End />
      <Audio src={staticFile("score.wav")} volume={vol} />
    </AbsoluteFill>
  );
};
