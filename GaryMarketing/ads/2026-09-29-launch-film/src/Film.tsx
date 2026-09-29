import React from "react";
import {
  AbsoluteFill, Audio, Easing, Img, OffthreadVideo, Sequence,
  interpolate, spring, staticFile, useCurrentFrame, useVideoConfig,
} from "remotion";
import { loadFont as loadTight } from "@remotion/google-fonts/InterTight";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import timeline from "../timeline.json";

// THE LAUNCH FILM, v2 (Sep 29 2026). A light stage, no phone frames: tight
// close-ups of real app captures move on the beat under plain words for
// someone who has never placed a bet. Nothing on screen is redrawn.

const { fontFamily: TIGHT } = loadTight("normal", { weights: ["700", "800"], subsets: ["latin"] });
const { fontFamily: SANS } = loadInter("normal", { weights: ["500", "600"], subsets: ["latin"] });

const PAPER = "#ECECE9";
const INKTXT = "#15130F";
const MUTED = "#57534C";
const BEAT = (timeline.fps * 60) / timeline.bpm;           // 14.06 frames
const F = (beat: number) => Math.round(beat * BEAT);
const CL = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

export type Layout = "wide" | "tall";

// ------------------------------------------------------------------ stage

const Stage: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: PAPER }}>
      <AbsoluteFill style={{ background: `radial-gradient(circle at ${70 + 10 * Math.sin(f / 45)}% ${40 + 8 * Math.cos(f / 60)}%, rgba(201,162,39,.30), transparent 38%)` }} />
      <AbsoluteFill style={{ background: `radial-gradient(circle at ${20 - 6 * Math.sin(f / 70)}% 90%, rgba(201,162,39,.14), transparent 34%)` }} />
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------ type

/** A headline that lands word by word, and a quiet line under it. */
const Words: React.FC<{ from: number; to: number; lines: string[]; sub?: string; subAt?: number;
  align?: "left" | "center"; x: number; y: number; w: number; size: number }> =
  ({ from, to, lines, sub, subAt, align = "left", x, y, w, size }) => {
    const frame = useCurrentFrame();
    const a = F(from) + 2, z = F(to) - 5;
    if (frame < a || frame > z + 8) return null;
    const out = interpolate(frame, [z, z + 7], [0, 1], { ...CL, easing: Easing.in(Easing.cubic) });
    let n = 0;
    const subStart = subAt === undefined ? a + 10 : F(subAt);
    const subP = interpolate(frame, [subStart, subStart + 10], [0, 1], { ...CL, easing: Easing.out(Easing.cubic) });
    return (
      <div style={{ position: "absolute", left: x, top: y, width: w, textAlign: align, opacity: 1 - out,
        transform: `translateY(${-30 * out}px)` }}>
        {lines.map((line, li) => (
          <div key={li} style={{ fontFamily: TIGHT, fontWeight: 800, fontSize: size, lineHeight: 1.0, letterSpacing: "-0.035em",
            color: INKTXT, overflow: "hidden", paddingBottom: size * 0.08 }}>
            {line.split(" ").map((word, wi) => {
              const d = a + 2.5 * n++;
              const p = interpolate(frame, [d, d + 9], [0, 1], { ...CL, easing: Easing.out(Easing.cubic) });
              return <span key={wi} style={{ display: "inline-block", marginRight: size * 0.24,
                transform: `translateY(${(1 - p) * 110}%)`, opacity: p }}>{word}</span>;
            })}
          </div>
        ))}
        {sub ? <div style={{ fontFamily: SANS, fontWeight: 500, fontSize: size * 0.34, lineHeight: 1.35, color: MUTED,
          marginTop: size * 0.28, opacity: subP, transform: `translateY(${(1 - subP) * 16}px)`,
          marginLeft: align === "center" ? "auto" : 0, marginRight: align === "center" ? "auto" : 0, maxWidth: w * 0.86 }}>{sub}</div> : null}
      </div>
    );
  };

// ------------------------------------------------------------------ screens

type Crop = { x: number; y: number; w: number; h: number };

/** A close-up of a capture: the crop fills a rounded dark card of width `w`. */
const Screen: React.FC<{ srcW: number; crop: Crop; w: number; radius?: number; children: (style: React.CSSProperties) => React.ReactNode }> =
  ({ srcW, crop, w, radius = 36, children }) => {
    const k = w / crop.w;
    return (
      <div style={{ width: w, height: crop.h * k, borderRadius: radius, overflow: "hidden", background: "#0A0908", position: "relative",
        boxShadow: "0 40px 90px rgba(20,16,8,.28), 0 8px 24px rgba(20,16,8,.18)" }}>
        {children({ position: "absolute", left: -crop.x * k, top: -crop.y * k, width: srcW * k, display: "block" })}
      </div>
    );
  };

/** Springs a card into place, pushes the camera in slowly, cuts it away fast. */
const Move: React.FC<{ from: number; to: number; x: number; y: number; tilt?: number; push?: number; children: React.ReactNode }> =
  ({ from, to, x, y, tilt = 0, push = 0.05, children }) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    const a = F(from), z = F(to);
    if (frame < a || frame > z + 6) return null;
    const p = spring({ frame: frame - a, fps, config: { damping: 17, stiffness: 150, mass: 0.8 } });
    const drift = interpolate(frame, [a, z], [0, 1], CL);
    const out = interpolate(frame, [z - 1, z + 6], [0, 1], { ...CL, easing: Easing.in(Easing.cubic) });
    return (
      <div style={{ position: "absolute", left: x, top: y, perspective: 1600, opacity: Math.min(1, p * 1.6) * (1 - out) }}>
        <div style={{ transformOrigin: "50% 50%",
          transform: `translateY(${(1 - p) * 140 - out * 60}px) rotateX(${(1 - p) * 14}deg) rotateY(${tilt * (1 - drift * 0.6)}deg) scale(${(0.9 + 0.1 * p) * (1 + push * drift) * (1 + 0.04 * out)})` }}>
          {children}
        </div>
      </div>
    );
  };

const Pic: React.FC<{ src: string; srcW: number; crop: Crop; w: number; scrollBy?: number; from?: number; to?: number }> =
  ({ src, srcW, crop, w, scrollBy = 0, from = 0, to = 1 }) => {
    const frame = useCurrentFrame();
    const dy = scrollBy ? interpolate(frame, [F(from), F(to)], [0, scrollBy], { ...CL, easing: Easing.inOut(Easing.quad) }) : 0;
    return <Screen srcW={srcW} crop={{ ...crop, y: crop.y + dy }} w={w}>{(style) => <Img src={staticFile(src)} style={style} />}</Screen>;
  };

const Vid: React.FC<{ src: string; srcW: number; crop: Crop; w: number; from: number; at: number; rate?: number; dur: number }> =
  ({ src, srcW, crop, w, from, at, rate = 1, dur }) => (
    <Screen srcW={srcW} crop={crop} w={w}>{(style) => (
      <Sequence from={F(from)} durationInFrames={dur} layout="none">
        <OffthreadVideo src={staticFile(src)} trimBefore={Math.round(at * timeline.fps)} playbackRate={rate} muted style={style} />
      </Sequence>
    )}</Screen>
  );

// Regions of the 1320-wide captures (home_screen is the 966-wide screen of the Sep 24 frame).
const CROP = {
  home: { x: 0, y: 150, w: 966, h: 1180 },
  card: { x: 40, y: 470, w: 1240, h: 760 },
  unveil: { x: 0, y: 260, w: 1320, h: 1900 },
  board: { x: 40, y: 1040, w: 1240, h: 1260 },
  calendar: { x: 30, y: 60, w: 1260, h: 1140 },
};

// ------------------------------------------------------------------ open and close

const Mark: React.FC<{ size: number }> = ({ size }) => (
  <Img src={staticFile("icon.png")} style={{ width: size, height: size, borderRadius: size * 0.225,
    boxShadow: "0 30px 70px rgba(20,16,8,.30)" }} />
);

const Intro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const I = timeline.intro;
  if (frame > F(I.to) + 6) return null;
  const p = spring({ frame, fps, config: { damping: 14, stiffness: 160, mass: 0.8 } });
  const out = interpolate(frame, [F(I.to) - 3, F(I.to) + 5], [0, 1], { ...CL, easing: Easing.in(Easing.cubic) });
  const wide = width > 1500;
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column",
      opacity: 1 - out, transform: `scale(${1 + out * 0.08})` }}>
      <div style={{ transform: `scale(${0.6 + 0.4 * p}) rotate(${(1 - p) * -8}deg)` }}><Mark size={wide ? 170 : 210} /></div>
      <div style={{ position: "relative", width: "100%", height: wide ? 150 : 170, marginTop: 34 }}>
        <Words from={0.6} to={I.to + 1} lines={["Meet Gary."]} align="center" x={0} y={0} w={width} size={wide ? 120 : 130} />
      </div>
    </AbsoluteFill>
  );
};

const End: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const E = timeline.end;
  if (frame < F(E.from)) return null;
  const t = frame - F(E.from);
  const p = spring({ frame: t, fps, config: { damping: 15, stiffness: 150 } });
  const fade = (d: number) => interpolate(t, [d, d + 10], [0, 1], { ...CL, easing: Easing.out(Easing.cubic) });
  const wide = width > 1500;
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column", textAlign: "center" }}>
      <div style={{ transform: `scale(${0.7 + 0.3 * p})`, opacity: Math.min(1, p * 1.5) }}><Mark size={wide ? 150 : 190} /></div>
      <div style={{ position: "relative", width: "100%", height: wide ? 230 : 300, marginTop: 26 }}>
        <Words from={E.from + 0.6} to={E.to + 4} lines={["Gary A.I.", "A pick for every game."]} align="center" x={0} y={0} w={width} size={wide ? 96 : 96} />
      </div>
      <div style={{ opacity: fade(24), fontFamily: SANS, fontWeight: 600, fontSize: wide ? 34 : 40, color: PAPER, background: INKTXT,
        padding: wide ? "18px 40px" : "22px 46px", borderRadius: 18, marginTop: wide ? 10 : 30 }}>Free on the App Store</div>
      <div style={{ opacity: fade(34), fontFamily: SANS, fontWeight: 500, fontSize: wide ? 20 : 25, color: MUTED, marginTop: 34 }}>
        21+ | Not a sportsbook | Gambling problem? Call 1-800-GAMBLER
      </div>
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------ the film

export const Film: React.FC<{ layout: Layout }> = ({ layout }) => {
  const T = timeline;
  const wide = layout === "wide";
  // Text column on the left (wide) or on top (tall); the screen close-up opposite.
  const tx = wide ? 130 : 80, tw = wide ? 900 : 920, ty = wide ? 320 : 190, ts = wide ? 86 : 96;
  const center = (w: number, h: number) => wide ? { x: 1020 + (780 - w) / 2, y: (1080 - h) / 2 + 20 } : { x: (1080 - w) / 2, y: 740 + (1120 - h) / 2 };
  const hk = (c: Crop, w: number) => (c.h * w) / c.w;
  const homeW = wide ? 560 : 700;
  const cardW = wide ? 760 : 940;
  const unveilW = wide ? 520 : 620;
  const boardW = wide ? 640 : 900;
  const calW = wide ? 760 : 960;
  return (
    <AbsoluteFill style={{ background: PAPER, overflow: "hidden" }}>
      <Stage />
      <Intro />

      {/* Home: every game on one board */}
      <Move from={T.home.from} to={T.home.to} {...center(homeW, hk(CROP.home, homeW))} tilt={wide ? -10 : 0}>
        <Pic src="home_screen.png" srcW={966} crop={CROP.home} w={homeW} scrollBy={260} from={T.home.from + 2} to={T.home.to} />
      </Move>
      <Words from={T.home.from} to={T.home.to} lines={["Every game today,", "in one place."]}
        sub="Live scores, with Gary's pick next to each one." x={tx} y={ty} w={tw} size={ts} />

      {/* Picks: the card, then the reasoning on its back */}
      <Move from={T.picks.from} to={T.picks.flipAt} {...center(cardW, hk(CROP.card, cardW))} push={0.03}>
        <Pic src="picks_front.png" srcW={1320} crop={CROP.card} w={cardW} />
      </Move>
      <Move from={T.picks.flipAt} to={T.picks.to} {...center(cardW, hk(CROP.card, cardW))} push={0.03}>
        <Screen srcW={1320} crop={CROP.card} w={cardW}>{(style) => (<>
          <Img src={staticFile("picks_back.png")} style={style} />
          <Sequence from={F(T.picks.flipAt)} durationInFrames={Math.round(0.9 * T.fps)} layout="none">
            <OffthreadVideo src={staticFile("picks_flip.mp4")} trimBefore={Math.round(T.picks.flipSrc * T.fps)} muted style={style} />
          </Sequence>
        </>)}</Screen>
      </Move>
      <Words from={T.picks.from} to={T.picks.flipAt} lines={["Who Gary thinks", "will win."]}
        sub="On the games, and on the players in them." x={tx} y={ty} w={wide ? 860 : tw} size={ts} />
      <Words from={T.picks.flipAt} to={T.picks.to} lines={["And why."]}
        sub="Every pick comes with his reasoning, in plain English." x={tx} y={ty} w={wide ? 860 : tw} size={ts} />

      {/* Winners: the day's most confident picks, sealed */}
      <Move from={T.winners.from} to={T.winners.to} {...center(unveilW, hk(CROP.unveil, unveilW))} tilt={wide ? 8 : 0}>
        <Vid src="unveil.mp4" srcW={1320} crop={CROP.unveil} w={unveilW} from={T.winners.from} at={T.winners.src} rate={T.winners.rate} dur={F(T.winners.to - T.winners.from) + 6} />
      </Move>
      <Words from={T.winners.from} to={T.winners.to} lines={["His most confident", "picks each day."]}
        sub="Tap one open to see the numbers behind it." x={tx} y={ty} w={tw} size={ts} />

      {/* Darts: the fun side */}
      <Move from={T.darts.from} to={T.darts.to} {...center(boardW, hk(CROP.board, boardW))} push={0.06}>
        <Vid src="hr_throw.mp4" srcW={1320} crop={CROP.board} w={boardW} from={T.darts.from} at={T.darts.src} rate={T.darts.rate} dur={F(T.darts.to - T.darts.from) + 6} />
      </Move>
      <Words from={T.darts.from} to={T.darts.to} lines={["Just for fun:", "who scores tonight."]}
        sub="Touchdowns, home runs and hot streaks." x={tx} y={ty} w={tw} size={ts} />

      {/* Billfold: the record */}
      <Move from={T.billfold.from} to={T.billfold.to} {...center(calW, hk(CROP.calendar, calW))} push={0.04}>
        <Pic src="calendar.png" srcW={1320} crop={CROP.calendar} w={calW} />
      </Move>
      <Words from={T.billfold.from} to={T.billfold.to} lines={["Right or wrong,", "it stays up."]}
        sub="Every result is posted the next morning." x={tx} y={ty} w={wide ? 860 : tw} size={ts} />

      <End />
      <Audio src={staticFile("score.wav")} />
    </AbsoluteFill>
  );
};
