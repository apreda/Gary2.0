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
// every reason steps through under it; (4) the camera pulls back to the whole
// breakdown; (5) the stamp lands; (6) end card. Every app pixel is real: a
// screen recording of the app's own Winners unveil (as 60 fps stills), then
// the full breakdown page stitched from screenshots. The stage is the app's
// background (5,3,4), so there's no frame or border anywhere.
//
// Daily: pipeline/run.mjs records the day's free pick, pipeline/analyze.py
// measures it, and the measurements arrive as props. The defaults are the
// Sep 28 Bears unveil.

const { fontFamily: SANS } = loadInter("normal", { weights: ["500", "600"], subsets: ["latin"] });
const BEBAS = "GaryBebas";
const fontHandle = delayRender("Bebas Neue");
new FontFace(BEBAS, `url(${staticFile("BebasNeue-Regular.ttf")})`).load()
  .then((f) => { document.fonts.add(f); continueRender(fontHandle); })
  .catch(() => continueRender(fontHandle));

export type UnveilProps = {
  stillsDir: string; stillsCount: number; pageFile: string;
  recording: { packIn: number; packTop: number; packBottom: number; cardTop: number; cardBottom: number;
    slide: number; settled: number; slideTable: [number, number][] };
  page: { cardTop: number; cardBottom: number; reasonsTop: number; reasonTops: number[]; containerEnd: number; height: number };
};

export const DEMO_PROPS: UnveilProps = {
  stillsDir: "uf", stillsCount: 597, pageFile: "breakdown_page.png",
  recording: { packIn: 2.15, packTop: 798, packBottom: 1890, cardTop: 1094, cardBottom: 1598, slide: 8.4, settled: 9.65,
    slideTable: [[8.4, 1094], [8.45, 1068], [8.5, 954], [8.55, 812], [8.6, 636], [8.65, 556], [8.7, 476], [8.75, 412], [8.8, 388],
      [8.85, 376], [8.9, 350], [8.95, 334], [9.0, 328], [9.05, 316], [9.1, 314], [9.15, 310], [9.2, 310]] },
  page: { cardTop: 310, cardBottom: 691, reasonsTop: 711, reasonTops: [711, 1295, 1881, 2408], containerEnd: 3019, height: 3022 },
};

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

/** Every time (recording seconds) and every camera stop, derived from the measurements. */
export function plan(p: UnveilProps) {
  const r = p.recording, g = p.page;
  const packIn = r.packIn, tear = packIn + 0.85;
  const slide = r.slide, settled = r.settled;
  const fastFrom = Math.min(packIn + 4.05, slide);
  const pageAt = settled + 0.4;
  const brkK = 0.92, brkCy = g.cardTop + (H / 2 - 98) / brkK;
  const tops = g.reasonTops.length ? g.reasonTops : [g.reasonsTop];
  const lastScroll = Math.min(tops[tops.length - 1] - g.reasonsTop, Math.max(0, g.containerEnd - brkCy - 460 / brkK));
  const steps: [number, number, number][] = [];
  for (let i = 1; i < tops.length; i++) {
    const a = settled + 1.0 + 1.6 * (i - 1);
    steps.push([a, a + 0.5, i === tops.length - 1 ? lastScroll : tops[i] - g.reasonsTop]);
  }
  const lastEnd = steps.length ? steps[steps.length - 1][1] : settled + 0.9;
  const zoomOut: [number, number] = [lastEnd + 1.1, lastEnd + 2.1];
  const impact = zoomOut[1] + 0.75, end = impact + 1.75;
  const LEAD = (tear - packIn) / 0.6;
  const O1 = LEAD + (fastFrom - tear);
  const O2 = O1 + (slide - fastFrom) / 1.7;
  const MAP_OUT = [0, LEAD, O1, O2, O2 + (end - slide)];
  const MAP_SRC = [packIn, tear, fastFrom, slide, end];
  const packK = Math.min(0.8, 900 / (r.packBottom - r.packTop));
  const cardK = Math.min(1.22, 860 / (r.cardBottom - r.cardTop));
  const top0 = g.cardTop - 10;
  return {
    packIn, tear, slide, settled, pageAt, steps, zoomOut, impact, end, LEAD, MAP_OUT, MAP_SRC,
    pack: { k: packK, cy: (r.packTop + r.packBottom) / 2, ox: 1440 },
    card: { k: cardK, cy: (r.cardTop + r.cardBottom) / 2, top: r.cardTop },
    brk: { k: brkK, cy: brkCy },
    full: { k: 960 / (g.containerEnd - top0), cy: (top0 + g.containerEnd) / 2 },
    clip: (g.cardBottom + g.reasonsTop) / 2, pageCardTop: g.cardTop,
    slideT: r.slideTable.map((x) => x[0]), slideTop: r.slideTable.map((x) => x[1]),
  };
}
type Plan = ReturnType<typeof plan>;

const srcAt = (P: Plan, frame: number) => interpolate(frame / FPS, P.MAP_OUT, P.MAP_SRC, CL);
const frameAt = (P: Plan, src: number) => Math.round(interpolate(src, P.MAP_SRC, P.MAP_OUT, CL) * FPS);
export const totalFrames = (p: UnveilProps) => { const P = plan(p); return frameAt(P, P.end) + Math.round(2.4 * FPS); };

/** Camera: recording point (SRC_W/2, cy) sits at output point (ox, H/2), scale k. */
const camera = (P: Plan, s: number) => {
  const ox = interpolate(s, [P.tear, P.tear + 0.6], [P.pack.ox, W / 2], { ...CL, easing: ease });
  const z = interpolate(s, [P.packIn + 2.85, P.packIn + 3.55], [0, 1], { ...CL, easing: ease });
  let k = P.pack.k + (P.card.k - P.pack.k) * z;
  let cy = P.pack.cy + (P.card.cy - P.pack.cy) * z;
  k *= interpolate(s, [P.packIn + 3.55, P.slide], [1, 1.03], CL);
  if (s >= P.slide) {
    // The card's on-screen top comes from the measured slide, so it moves from
    // mid-frame to its resting place and never past the top edge.
    const q = interpolate(s, [P.slide, P.settled], [0, 1], { ...CL, easing: ease });
    const top = interpolate(s, P.slideT, P.slideTop, CL);
    const k0 = P.card.k * 1.03;
    k = k0 + (P.brk.k - k0) * q;
    const outTop0 = H / 2 - (P.card.cy - P.card.top) * k0;
    const outTop1 = 98;
    cy = top + (H / 2 - (outTop0 + (outTop1 - outTop0) * q)) / k;
  }
  if (s >= P.zoomOut[0]) {
    // Pull back with the card's on-screen top moving straight from 98 px to its
    // place on the full page, so the card never leaves the frame mid-zoom.
    const p = interpolate(s, P.zoomOut, [0, 1], { ...CL, easing: ease });
    k = P.brk.k + (P.full.k - P.brk.k) * p;
    const top0 = H / 2 - (P.brk.cy - P.pageCardTop) * P.brk.k;
    const top1 = H / 2 - (P.full.cy - P.pageCardTop) * P.full.k;
    cy = P.pageCardTop + (H / 2 - (top0 + (top1 - top0) * p)) / k;
  }
  return { k, cy, ox };
};

/** How far the reasons have scrolled under the pinned card (page px). */
const scrollAt = (P: Plan, s: number) => {
  let v = 0;
  for (const [a, b, px] of P.steps) {
    if (s >= a) v = interpolate(s, [a, b], [v, px], { ...CL, easing: ease });
  }
  if (s >= P.zoomOut[0]) v *= 1 - interpolate(s, P.zoomOut, [0, 1], { ...CL, easing: ease });
  return v;
};

const Page: React.FC<{ p: UnveilProps; P: Plan }> = ({ p, P }) => {
  const frame = useCurrentFrame();
  const s = srcAt(P, frame);
  const { k, cy, ox } = camera(P, s);
  const scroll = scrollAt(P, s);
  const still = Math.min(p.stillsCount, Math.max(1, Math.round((s - P.packIn) * 60) + 1));
  const src = s >= P.pageAt ? p.pageFile : `${p.stillsDir}/${String(still).padStart(4, "0")}.jpg`;
  // The stamp's impact shakes the page for a quarter second.
  const fi = frameAt(P, P.impact);
  const sh = frame >= fi && frame < fi + 8 ? (1 - (frame - fi) / 8) * 9 : 0;
  const dx = sh * Math.sin(frame * 2.1), dy = sh * Math.cos(frame * 1.7);
  const feather = "linear-gradient(90deg, transparent 0, #000 36px, #000 calc(100% - 36px), transparent 100%)";
  const shot = (lift: number): React.CSSProperties => ({
    position: "absolute", left: 0, top: 0, width: SRC_W, transformOrigin: "0 0",
    transform: `translate(${ox - (SRC_W / 2) * k + dx}px, ${H / 2 - cy * k + dy - lift}px) scale(${k})`,
    WebkitMaskImage: feather, maskImage: feather,
  });
  const img = <Img src={staticFile(src)} style={{ display: "block", width: SRC_W }} />;
  const y = (pageY: number) => H / 2 + (pageY - cy) * k + dy;
  const clipY = y(P.clip);
  const pinned = s >= P.settled;
  const bottomFade = interpolate(s, [P.slide + 0.2, P.slide + 0.6], [0, 1], CL) * (1 - interpolate(s, [P.zoomOut[0], P.zoomOut[0] + 0.4], [0, 1], CL));
  const endF = frameAt(P, P.end);
  const fadeOut = interpolate(frame, [endF, endF + 10], [1, 0], CL);
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
      {/* The app's status bar and nav row (page y < 256) stay under stage color; the card (y >= 300) is never covered. */}
      <div style={{ position: "absolute", left: 0, top: 0, width: W, height: Math.max(0, y(292)),
        background: `linear-gradient(180deg, ${STAGE} 0, ${STAGE} ${Math.max(0, y(262))}px, rgba(5,3,4,0) 100%)` }} />
      {/* While the reasons step: the next one fades at the bottom edge. */}
      <AbsoluteFill style={{ opacity: bottomFade,
        background: `linear-gradient(180deg, rgba(5,3,4,0) 0, rgba(5,3,4,0) 1000px, ${STAGE} 1080px)` }} />
    </AbsoluteFill>
  );
};

/** Frame 0: the lockup and the headline beside the sealed pack, gone before the tear. */
const Head: React.FC<{ P: Plan }> = ({ P }) => {
  const frame = useCurrentFrame();
  const a = Math.round((P.LEAD - 0.25) * FPS);
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
const Stamp: React.FC<{ P: Plan }> = ({ P }) => {
  const frame = useCurrentFrame();
  const fi = frameAt(P, P.impact), endF = frameAt(P, P.end);
  if (frame < fi - 7 || frame >= endF + 10) return null;
  const t = frame - fi;
  const fall = interpolate(t, [-7, 0], [0, 1], { ...CL, easing: Easing.in(Easing.quad) });
  const settle = t <= 0 ? 1 : 1 - 0.035 * Math.sin(Math.min(1, t / 6) * Math.PI);
  const scale = (2.3 - 1.3 * fall) * settle;
  const blur = 7 * (1 - fall);
  const dim = interpolate(t, [-2, 6], [0, 0.78], CL);
  const out = interpolate(frame, [endF, endF + 10], [1, 0], CL);
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

const End: React.FC<{ P: Plan }> = ({ P }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const endF = frameAt(P, P.end);
  if (frame < endF) return null;
  const t = frame - endF;
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

export const Unveil: React.FC<UnveilProps> = (props) => {
  const p = { ...DEMO_PROPS, ...props };
  const P = plan(p);
  const frame = useCurrentFrame();
  const total = totalFrames(p);
  const vol = interpolate(frame, [total - 24, total - 1], [0.85, 0], CL);
  return (
    <AbsoluteFill style={{ background: STAGE, overflow: "hidden" }}>
      <Page p={p} P={P} />
      <Head P={P} />
      <Stamp P={P} />
      <End P={P} />
      <Audio src={staticFile("score.wav")} volume={vol} />
    </AbsoluteFill>
  );
};
