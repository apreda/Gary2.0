import React from "react";
import {
  AbsoluteFill, Audio, Easing, Img, continueRender, delayRender,
  interpolate, spring, staticFile, useCurrentFrame, useVideoConfig,
} from "remotion";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";

// THE FREE PICK UNVEIL, 16:9 for X (Oct 1 2026). Adam's direction, in order:
// "recording the pick unveil the app has"; post a normal wide video with the
// words in the tweet, like a real company; nothing leaves the frame; show
// every reason; then zoom out to the whole page and stamp it: FREE PICKS
// DAILY. GARY NEVER SKIPS THE BIG GAME.
//
// Scenes: (1) frame 0 = the headline beside the sealed pack, the X preview;
// (2) the pack tears and the pick spells out, close enough to read on a
// phone; (3) the card rides the app's slide to the top and stays pinned while
// all four reasons step through under it; (4) the camera pulls back to the
// whole breakdown; (5) the stamp lands; (6) end card. Every app pixel is real:
// a screen recording of the app's own Winners unveil, then a stitched capture
// of the full breakdown page (two screenshots, offset 828 px, the same page
// as the recording's last frame). The stage is the app's background
// (5,3,4), so there's no frame or border anywhere.

const { fontFamily: SANS } = loadInter("normal", { weights: ["500", "600"], subsets: ["latin"] });
const BEBAS = "GaryBebas";
const fontHandle = delayRender("Bebas Neue");
new FontFace(BEBAS, `url(${staticFile("BebasNeue-Regular.ttf")})`).load()
  .then((f) => { document.fonts.add(f); continueRender(fontHandle); })
  .catch(() => continueRender(fontHandle));

const FPS = 30;
const CL = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const STAGE = "rgb(5,3,4)";
const CREAM = "#F2EDE4";
const GOLD = "#F0CD62";
const GOLD_DEEP = "#C9A227";
const INK = "#E3B53D";
const SUPPORT = "#BDB6AA";
const W = 1920, H = 1080;
const ease = Easing.inOut(Easing.cubic);
const SRC_W = 1320;

// ---- Recording seconds. Measured Oct 1 on the 1320×2868 capture:
// pack alone on dark from 2.15 (top 800, bottom 1896); tear 3.0; card rises
// to top 760 (4.0-4.8), centered at top 1096 by 5.2, spelled out by ~5.6;
// slides to top 310 over 8.4-9.15 (table below); breakdown still from 9.6.
// On the stitched page: nav row 206-256, card 310-690, reasons start 750,
// then 1296 (-0.11), 1890 (11 TD) and 2390 (41.5); the signature sits at
// 2909, and the container ends at 2985.
const T = {
  packIn: 2.15, tear: 3.0, fastFrom: 6.2, slide: 8.4, settled: 9.6, page: 10.0,
  zoomOut: [15.4, 16.4] as const, impact: 17.15, end: 18.9,
};
const SLIDE_T = [8.40, 8.45, 8.50, 8.55, 8.60, 8.65, 8.70, 8.75, 8.80, 8.85, 8.90, 8.95, 9.00, 9.05, 9.10, 9.15];
const SLIDE_TOP = [1096, 1068, 954, 812, 636, 556, 476, 412, 388, 376, 350, 334, 328, 316, 314, 310];
// Each reason holds long enough to read, then a short scroll to the next.
const STEPS: [number, number, number][] = [[10.6, 11.1, 546], [12.2, 12.7, 1140], [13.8, 14.3, 1640]];

// ---- Output time ↔ recording time. The pack plays at 0.6× so the headline
// can be read; the finished card's wait before the slide plays at 1.7×.
const LEAD = (T.tear - T.packIn) / 0.6;
const O1 = LEAD + (T.fastFrom - T.tear);
const O2 = O1 + (T.slide - T.fastFrom) / 1.7;
const O3 = O2 + (T.end - T.slide);
const MAP_OUT = [0, LEAD, O1, O2, O3];
const MAP_SRC = [T.packIn, T.tear, T.fastFrom, T.slide, T.end];
const srcAt = (frame: number) => interpolate(frame / FPS, MAP_OUT, MAP_SRC, CL);
const frameAt = (src: number) => Math.round(interpolate(src, MAP_SRC, MAP_OUT, CL) * FPS);
const END_AT = frameAt(T.end);
export const UNVEIL_FRAMES = END_AT + Math.round(2.4 * FPS);

/** Camera: recording point (SRC_W/2, cy) sits at output point (ox, H/2), scale k. */
const camera = (s: number) => {
  const pack = { k: 0.8, cy: 1348, ox: 1440 };
  const card = { k: 1.22, cy: 1336 };
  const brk = { k: 0.92, cy: 790 };
  const full = { k: 960 / (2985 - 300), cy: (300 + 2985) / 2 };
  const ox = interpolate(s, [3.0, 3.6], [pack.ox, W / 2], { ...CL, easing: ease });
  const z = interpolate(s, [5.0, 5.7], [0, 1], { ...CL, easing: ease });
  let k = pack.k + (card.k - pack.k) * z;
  let cy = pack.cy + (card.cy - pack.cy) * z;
  k *= interpolate(s, [5.7, T.slide], [1, 1.03], CL);
  if (s >= T.slide) {
    // The card's on-screen top is set from the measured slide, so it moves
    // from mid-frame to its resting place and never past the top edge.
    const q = interpolate(s, [T.slide, T.settled], [0, 1], { ...CL, easing: ease });
    const top = interpolate(s, SLIDE_T, SLIDE_TOP, CL);
    const k0 = card.k * 1.03;
    k = k0 + (brk.k - k0) * q;
    const outTop0 = H / 2 - (card.cy - 1096) * k0;
    const outTop1 = H / 2 - (brk.cy - 310) * brk.k;
    cy = top + (H / 2 - (outTop0 + (outTop1 - outTop0) * q)) / k;
  }
  if (s >= T.zoomOut[0]) {
    const p = interpolate(s, [...T.zoomOut], [0, 1], { ...CL, easing: ease });
    k = brk.k + (full.k - brk.k) * p;
    cy = brk.cy + (full.cy - brk.cy) * p;
  }
  return { k, cy, ox };
};

/** How far the reasons have scrolled under the pinned card (page px). */
const scrollAt = (s: number) => {
  let v = 0;
  for (const [a, b, px] of STEPS) {
    if (s >= a) v = interpolate(s, [a, b], [v, px], { ...CL, easing: ease });
  }
  if (s >= T.zoomOut[0]) v *= 1 - interpolate(s, [...T.zoomOut], [0, 1], { ...CL, easing: ease });
  return v;
};

const Page: React.FC = () => {
  const frame = useCurrentFrame();
  const s = srcAt(frame);
  const { k, cy, ox } = camera(s);
  const scroll = scrollAt(s);
  // The recording as 60 fps stills (Chrome refused full-size video frames on
  // a near-full disk); from 10.0 the stitched full page, which matches it.
  const still = Math.min(597, Math.max(1, Math.round((s - T.packIn) * 60) + 1));
  const src = s >= T.page ? "breakdown_page.png" : `uf/${String(still).padStart(4, "0")}.jpg`;
  // The stamp's impact shakes the page for a quarter second.
  const fi = frameAt(T.impact);
  const sh = frame >= fi && frame < fi + 8 ? (1 - (frame - fi) / 8) * 9 : 0;
  const dx = sh * Math.sin(frame * 2.1), dy = sh * Math.cos(frame * 1.7);
  const feather = "linear-gradient(90deg, transparent 0, #000 36px, #000 calc(100% - 36px), transparent 100%)";
  const shot = (lift: number): React.CSSProperties => ({
    position: "absolute", left: 0, top: 0, width: SRC_W, transformOrigin: "0 0",
    transform: `translate(${ox - (SRC_W / 2) * k + dx}px, ${H / 2 - cy * k + dy - lift}px) scale(${k})`,
    WebkitMaskImage: feather, maskImage: feather,
  });
  const img = <Img src={staticFile(src)} style={{ display: "block", width: SRC_W }} />;
  // Output y of a page y; the clip sits between the card (ends 690) and the reasons (start 750).
  const y = (pageY: number) => H / 2 + (pageY - cy) * k + dy;
  const clipY = y(720);
  const pinned = s >= T.settled;
  const bottomFade = interpolate(s, [8.6, 9.0], [0, 1], CL) * (1 - interpolate(s, [T.zoomOut[0], T.zoomOut[0] + 0.4], [0, 1], CL));
  const fadeOut = interpolate(frame, [END_AT, END_AT + 10], [1, 0], CL);
  return (
    <AbsoluteFill style={{ opacity: fadeOut }}>
      {pinned ? <>
        <div style={{ position: "absolute", left: 0, top: 0, width: W, height: Math.max(0, clipY), overflow: "hidden" }}>
          <div style={shot(0)}>{img}</div>
        </div>
        <div style={{ position: "absolute", left: 0, top: clipY, width: W, height: Math.max(0, H - clipY), overflow: "hidden" }}>
          <div style={shot(clipY + scroll * k)}>{img}</div>
          <div style={{ position: "absolute", left: 0, top: 0, width: W, height: 44, opacity: Math.min(1, scroll / 60),
            background: `linear-gradient(180deg, ${STAGE}, rgba(5,3,4,0))` }} />
        </div>
      </> : <div style={shot(0)}>{img}</div>}
      {/* The app's status bar and nav row (page y < 256) stay under stage
          color; the card (y >= 310) is never covered. */}
      <div style={{ position: "absolute", left: 0, top: 0, width: W, height: Math.max(0, y(292)),
        background: `linear-gradient(180deg, ${STAGE} 0, ${STAGE} ${Math.max(0, y(262))}px, rgba(5,3,4,0) 100%)` }} />
      {/* While the reasons step: the next one fades at the bottom edge. */}
      <AbsoluteFill style={{ opacity: bottomFade,
        background: `linear-gradient(180deg, rgba(5,3,4,0) 0, rgba(5,3,4,0) 1000px, ${STAGE} 1080px)` }} />
    </AbsoluteFill>
  );
};

/** Frame 0: the lockup and the headline beside the sealed pack, gone before the tear. */
const Head: React.FC = () => {
  const frame = useCurrentFrame();
  const a = Math.round((LEAD - 0.25) * FPS);
  const out = interpolate(frame, [a, a + 7], [0, 1], { ...CL, easing: Easing.in(Easing.cubic) });
  if (out >= 1) return null;
  return (
    <div style={{ position: "absolute", left: 140, top: 0, height: H, display: "flex", flexDirection: "column",
      justifyContent: "center", opacity: 1 - out, transform: `translateX(${-36 * out}px)` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
        <Img src={staticFile("icon.png")} style={{ width: 92, height: 92, borderRadius: 21, boxShadow: "0 12px 40px rgba(0,0,0,.6)" }} />
        <div style={{ fontFamily: BEBAS, fontSize: 72, letterSpacing: "0.05em", color: CREAM, lineHeight: 1 }}>GARY A.I.</div>
      </div>
      <div style={{ fontFamily: BEBAS, fontSize: 236, lineHeight: 0.88, marginTop: 34, letterSpacing: "0.005em" }}>
        <div style={{ color: CREAM }}>TODAY'S</div>
        <div style={{ backgroundImage: `linear-gradient(180deg, ${GOLD}, ${GOLD_DEEP})`, WebkitBackgroundClip: "text",
          color: "transparent", filter: "drop-shadow(0 0 28px rgba(201,162,39,.28))" }}>FREE PICK</div>
      </div>
    </div>
  );
};

/** The stamp: slams onto the whole breakdown page, which dims beneath it. */
const Stamp: React.FC = () => {
  const frame = useCurrentFrame();
  const fi = frameAt(T.impact);
  if (frame < fi - 7 || frame >= END_AT + 10) return null;
  const t = frame - fi;
  const fall = interpolate(t, [-7, 0], [0, 1], { ...CL, easing: Easing.in(Easing.quad) });
  const settle = t <= 0 ? 1 : 1 - 0.035 * Math.sin(Math.min(1, t / 6) * Math.PI);
  const scale = (2.3 - 1.3 * fall) * settle;
  const blur = 7 * (1 - fall);
  const dim = interpolate(t, [-2, 6], [0, 0.78], CL);
  const out = interpolate(frame, [END_AT, END_AT + 10], [1, 0], CL);
  const ink = "url(" + staticFile("stamp_ink.png") + ")";
  return (
    <AbsoluteFill style={{ opacity: out }}>
      <AbsoluteFill style={{ background: STAGE, opacity: dim }} />
      <div style={{ position: "absolute", left: "50%", top: "50%", opacity: fall,
        transform: `translate(-50%, -50%) rotate(-6deg) scale(${scale})`, filter: `blur(${blur}px)` }}>
        {/* A dark plate under the ink keeps the page text from showing through the letters. */}
        <div style={{ position: "absolute", inset: 0, borderRadius: 28, background: "rgba(5,3,4,.72)" }} />
        <div style={{ position: "relative", WebkitMaskImage: ink, maskImage: ink, WebkitMaskSize: "100% 100%", maskSize: "100% 100%",
          border: `10px solid ${INK}`, borderRadius: 28, padding: 12 }}>
          <div style={{ border: `3px solid ${INK}`, borderRadius: 16, padding: "30px 70px 34px", textAlign: "center", color: INK }}>
            <div style={{ fontFamily: BEBAS, fontSize: 186, lineHeight: 0.9, letterSpacing: "0.02em", whiteSpace: "nowrap" }}>FREE PICKS DAILY.</div>
            <div style={{ height: 4, background: INK, margin: "22px 40px 20px" }} />
            <div style={{ fontFamily: BEBAS, fontSize: 76, lineHeight: 1, letterSpacing: "0.08em", whiteSpace: "nowrap" }}>GARY NEVER SKIPS THE BIG GAME.</div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

const End: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (frame < END_AT) return null;
  const t = frame - END_AT;
  const bg = interpolate(t, [0, 10], [0, 1], CL);
  const p = spring({ frame: t - 4, fps, config: { damping: 15, stiffness: 150 } });
  const fade = (d: number) => interpolate(t, [d, d + 10], [0, 1], { ...CL, easing: Easing.out(Easing.cubic) });
  return (
    <AbsoluteFill style={{ background: STAGE, opacity: bg, alignItems: "center", justifyContent: "center", flexDirection: "column", textAlign: "center" }}>
      <AbsoluteFill style={{ background: "radial-gradient(circle at 50% 40%, rgba(201,162,39,.22), transparent 40%)" }} />
      <div style={{ transform: `scale(${0.75 + 0.25 * p})`, opacity: Math.min(1, p * 1.5) }}>
        <Img src={staticFile("icon.png")} style={{ width: 168, height: 168, borderRadius: 38, boxShadow: "0 30px 80px rgba(0,0,0,.6)" }} />
      </div>
      <div style={{ fontFamily: BEBAS, fontSize: 112, lineHeight: 0.95, marginTop: 34, opacity: fade(8) }}>
        <div style={{ color: CREAM }}>GARY A.I.</div>
        <div style={{ backgroundImage: `linear-gradient(180deg, ${GOLD}, ${GOLD_DEEP})`, WebkitBackgroundClip: "text", color: "transparent" }}>A PICK FOR EVERY GAME.</div>
      </div>
      <div style={{ opacity: fade(18), marginTop: 36, fontFamily: SANS, fontWeight: 600, fontSize: 36, color: "#0A0908",
        background: `linear-gradient(180deg, ${GOLD}, ${GOLD_DEEP})`, padding: "18px 50px", borderRadius: 999 }}>Get Gary free</div>
      <div style={{ opacity: fade(24), marginTop: 16, fontFamily: SANS, fontWeight: 500, fontSize: 26, color: SUPPORT }}>On the App Store</div>
      <div style={{ position: "absolute", bottom: 40, width: "100%", opacity: fade(30), fontFamily: SANS, fontWeight: 500, fontSize: 22, color: "#8A8378" }}>
        21+ | Not a sportsbook | Gambling problem? Call 1-800-GAMBLER
      </div>
    </AbsoluteFill>
  );
};

export const Unveil: React.FC = () => {
  const frame = useCurrentFrame();
  const vol = interpolate(frame, [UNVEIL_FRAMES - 24, UNVEIL_FRAMES - 1], [0.85, 0], CL);
  return (
    <AbsoluteFill style={{ background: STAGE, overflow: "hidden" }}>
      <Page />
      <Head />
      <Stamp />
      <End />
      <Audio src={staticFile("score.wav")} volume={vol} />
    </AbsoluteFill>
  );
};
