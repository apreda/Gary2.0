import React from "react";
import {
  AbsoluteFill, Audio, Easing, Img, continueRender, delayRender,
  interpolate, spring, staticFile, useCurrentFrame, useVideoConfig,
} from "remotion";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";

// THE FREE PICK UNVEIL, 16:9 (Oct 1 2026). Adam: a tall video takes over the
// feed; companies post a normal wide video and put the words in the tweet
// (ElevenLabs, Sep 28). So this is 1920×1080, with the copy in the tweet
// text, cut from a screen recording of the app's own Winners unveil.
//
// The camera works the recording like a close-up lens: the sealed pack sits
// right of a two-line headline (frame 0, which X shows before play), then the
// pick card fills the frame large enough to read on a phone, then the camera
// rides the app's own slide up and pulls back to the breakdown. The stage is
// the app's own background color (5,3,4) and the recording's edges are
// feathered, so there's no frame or border anywhere.

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
const SUPPORT = "#BDB6AA";
const W = 1920, H = 1080;

// ---- The recording (1320×2868). Measured Oct 1, recording seconds:
// pack alone on dark from 2.15 (top y 800, bottom 1896); tear at 3.0; card
// rises to top 760 (4.0-4.8), settles centered at top 1096 by 5.2 (center y
// 1336); the app slides it up 8.4-9.1 (top below); breakdown from 9.1 with
// the card at 310-690 and the first stat to 1296. Nav row y 206-256. The
// breakdown is still from 9.6 on; its reasons run 750-1296 (212.5),
// 1296-1890 (-0.11) and 1890-2370 (11 TD). The recording ends at 12.1; later
// times hold its last frame.
const SRC_W = 1320;
const SRC = { packIn: 2.15, tear: 3.0, out: 14.0 };
// Adam: "it shows only one reason?" The card stays pinned at the top while
// the reasons scroll under it, like scrolling the breakdown in the app. CLIP
// is the line between them (the card ends at 448, the reasons start at 503).
// Stepped, so each reason holds long enough to read: 212.5, then -0.11, then
// 11 TD (scroll 546 puts -0.11 under the card; 1123 ends 11 TD at 960).
const SCROLL = { t: [10.6, 11.1, 12.3, 12.8], px: [0, 546, 546, 1123] };
const CLIP = 474;
const SLOW = 0.6;                                   // the pack moment, slowed to read the headline
const LEAD = (SRC.tear - SRC.packIn) / SLOW;        // 1.42 s of output
// The card's top border during the slide, measured at 20 fps.
const SLIDE_T = [8.40, 8.45, 8.50, 8.55, 8.60, 8.65, 8.70, 8.75, 8.80, 8.85, 8.90, 8.95, 9.00, 9.05, 9.10, 9.15];
const SLIDE_TOP = [1096, 1068, 954, 812, 636, 556, 476, 412, 388, 376, 350, 334, 328, 316, 314, 310];

/** Recording time shown at an output frame. */
const srcAt = (frame: number) => {
  const out = frame / FPS;
  return out < LEAD ? SRC.packIn + out * SLOW : SRC.tear + (out - LEAD);
};
const outAt = (src: number) => LEAD + (src - SRC.tear);

const ease = Easing.inOut(Easing.cubic);
/** Camera: which recording point (cx, cy) sits at which output point (ox, oy), at scale k. */
const camera = (s: number) => {
  const pack = { k: 0.72, cy: 1348, ox: 1300 };
  const card = { k: 1.22, cy: 1336, ox: W / 2 };
  const brk = { k: 0.92, cy: 790, ox: W / 2 };
  let k = pack.k, cy = pack.cy, ox = pack.ox;
  let cardTopOnScreen: number | null = null;
  // Pack on the right of the headline, then centered as it tears.
  ox = interpolate(s, [3.0, 3.6], [pack.ox, W / 2], { ...CL, easing: ease });
  // Zoom to the card once it settles.
  const z = interpolate(s, [5.0, 5.7], [0, 1], { ...CL, easing: ease });
  k = pack.k + (card.k - pack.k) * z;
  cy = pack.cy + (card.cy - pack.cy) * z;
  // A slow push while it is spelled out.
  k *= interpolate(s, [5.7, 8.4], [1, 1.03], CL);
  // Ride the app's slide in one move: the card goes from the middle of the
  // frame to near the top (never past it) while the camera pulls back to show
  // the card and the first stat. Its screen position is set directly from the
  // measured slide, so it can't outrun or lag the app.
  if (s >= 8.4) {
    const q = interpolate(s, [8.4, 9.6], [0, 1], { ...CL, easing: ease });
    const top = interpolate(s, SLIDE_T, SLIDE_TOP, CL);
    const k0 = card.k * 1.03;
    k = k0 + (brk.k - k0) * q;
    const outTop0 = H / 2 - (card.cy - 1096) * k0;          // where the card's top sat before the slide
    const outTop1 = H / 2 - (brk.cy - 310) * brk.k;          // where it rests on the breakdown (98 px)
    const outTop = outTop0 + (outTop1 - outTop0) * q;
    cy = top + (H / 2 - outTop) / k;
    cardTopOnScreen = outTop;
  }
  return { k, cy, ox, oy: H / 2, cx: SRC_W / 2, cardTopOnScreen };
};

const FEATHER = 56;
const Recording: React.FC = () => {
  const frame = useCurrentFrame();
  const s = srcAt(frame);
  const { k, cx, cy, ox, oy, cardTopOnScreen } = camera(s);
  const end = outAt(SRC.out) - 0.15;
  const fadeOut = interpolate(frame, [Math.round(end * FPS), Math.round(end * FPS) + 10], [1, 0], CL);
  const brk = interpolate(s, [8.4, 8.5], [0, 1], CL);
  // The recording as 60 fps stills (public/uf, from `ffmpeg -ss 2.15 -vf fps=60`):
  // Chrome refused the compositor's full-size video frames on a near-full disk.
  const still = Math.min(597, Math.max(1, Math.round((s - SRC.packIn) * 60) + 1));
  const mask = `linear-gradient(90deg, transparent 0, #000 ${FEATHER / k}px, #000 calc(100% - ${FEATHER / k}px), transparent 100%)`;
  const scroll = s < SCROLL.t[1]
    ? interpolate(s, [SCROLL.t[0], SCROLL.t[1]], [SCROLL.px[0], SCROLL.px[1]], { ...CL, easing: ease })
    : interpolate(s, [SCROLL.t[2], SCROLL.t[3]], [SCROLL.px[2], SCROLL.px[3]], { ...CL, easing: ease });
  const shot = (dy: number): React.CSSProperties => ({ position: "absolute", left: 0, top: 0, width: SRC_W, height: 2868,
    transformOrigin: "0 0", transform: `translate(${ox - cx * k}px, ${oy - cy * k + dy}px) scale(${k})`,
    WebkitMaskImage: mask, maskImage: mask });
  const img = <Img src={staticFile(`uf/${String(still).padStart(4, "0")}.jpg`)}
    style={{ position: "absolute", left: 0, top: 0, width: SRC_W, display: "block" }} />;
  const pinned = s >= 9.6;
  return (
    <AbsoluteFill style={{ opacity: fadeOut }}>
      {pinned ? <>
        <div style={{ position: "absolute", left: 0, top: 0, width: W, height: CLIP, overflow: "hidden" }}>
          <div style={shot(0)}>{img}</div>
        </div>
        <div style={{ position: "absolute", left: 0, top: CLIP, width: W, height: H - CLIP, overflow: "hidden" }}>
          <div style={shot(-CLIP - scroll * k)}>{img}</div>
          <div style={{ position: "absolute", left: 0, top: 0, width: W, height: 44, opacity: Math.min(1, scroll / 60),
            background: `linear-gradient(180deg, ${STAGE}, rgba(5,3,4,0))` }} />
        </div>
      </> : <div style={shot(0)}>{img}</div>}
      {/* From the slide on: everything above the card (the app's nav row as
          the breakdown page arrives) sits under stage color, and the next stat
          fades at the bottom rather than being cut through. The band follows
          the card, so it never covers it. */}
      {cardTopOnScreen !== null ? (
        <AbsoluteFill style={{ opacity: brk,
          background: `linear-gradient(180deg, ${STAGE} 0px, ${STAGE} ${cardTopOnScreen - 60}px, rgba(5,3,4,0) ${cardTopOnScreen - 8}px, rgba(5,3,4,0) 960px, ${STAGE} 1080px)` }} />
      ) : null}
    </AbsoluteFill>
  );
};

/** Frame 0: the lockup and the headline beside the sealed pack. Gone before the tear. */
const Head: React.FC = () => {
  const frame = useCurrentFrame();
  const out = interpolate(frame, [Math.round((LEAD - 0.25) * FPS), Math.round((LEAD - 0.25) * FPS) + 7], [0, 1], { ...CL, easing: Easing.in(Easing.cubic) });
  if (out >= 1) return null;
  return (
    <div style={{ position: "absolute", left: 150, top: 300, opacity: 1 - out, transform: `translateX(${-30 * out}px)` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        <Img src={staticFile("icon.png")} style={{ width: 64, height: 64, borderRadius: 14 }} />
        <div style={{ fontFamily: BEBAS, fontSize: 48, letterSpacing: "0.04em", color: CREAM }}>GARY A.I.</div>
      </div>
      <div style={{ fontFamily: BEBAS, fontSize: 176, lineHeight: 0.95, marginTop: 26 }}>
        <div style={{ color: CREAM }}>TODAY'S</div>
        <div style={{ backgroundImage: `linear-gradient(180deg, ${GOLD}, ${GOLD_DEEP})`, WebkitBackgroundClip: "text", color: "transparent" }}>FREE PICK</div>
      </div>
    </div>
  );
};

const End: React.FC<{ from: number }> = ({ from }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (frame < from) return null;
  const t = frame - from;
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

const END_AT = Math.round((outAt(SRC.out) - 0.15) * FPS);
export const UNVEIL_FRAMES = END_AT + 3 * FPS;

export const Unveil: React.FC = () => {
  const frame = useCurrentFrame();
  const vol = interpolate(frame, [UNVEIL_FRAMES - 24, UNVEIL_FRAMES - 1], [0.85, 0], CL);
  return (
    <AbsoluteFill style={{ background: STAGE, overflow: "hidden" }}>
      <Recording />
      <Head />
      <End from={END_AT} />
      <Audio src={staticFile("score.wav")} volume={vol} />
    </AbsoluteFill>
  );
};
