import React from "react";
import {
  AbsoluteFill, Audio, Easing, Img, OffthreadVideo, Sequence, continueRender, delayRender,
  interpolate, spring, staticFile, useCurrentFrame, useVideoConfig,
} from "remotion";
import { loadFont } from "@remotion/google-fonts/Inter";
import timeline from "../timeline.json";

// THE LAUNCH FILM (Sep 29 2026). A tour of the app in the brand's own look:
// every screen is a real capture; the code only places the phone, sets the
// type and cuts to the beat. Copy follows Ad.md §11 and the playbook wording.

const { fontFamily: SANS } = loadFont("normal", { weights: ["400", "500", "600"], subsets: ["latin"] });
const bebasWait = delayRender("Bebas Neue");
new FontFace("Bebas", `url(${staticFile("BebasNeue-Regular.ttf")}) format("truetype")`).load()
  .then((face) => { document.fonts.add(face); continueRender(bebasWait); })
  .catch((err) => { console.error(err); continueRender(bebasWait); });

const INK = "#0B0A08";
const GOLD = "#C9A227";
const CREAM = "#F2EDE4";
const BODY = "#BDB6AA";
const BEAT = (timeline.fps * 60) / timeline.bpm;          // 15 frames
const F = (beat: number) => Math.round(beat * BEAT);
const CL = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const SCREEN_RATIO = 2868 / 1320;                         // capture height / width

export type Layout = "wide" | "tall";

type Box = { phoneLeft: number; phoneTop: number; phoneW: number; textLeft: number; textTop: number; textW: number;
  label: number; head: number; sub: number; icon: number };
const BOX: Record<Layout, Box> = {
  wide: { phoneLeft: 1150, phoneTop: 150, phoneW: 560, textLeft: 150, textTop: 330, textW: 900, label: 30, head: 126, sub: 34, icon: 200 },
  tall: { phoneLeft: 150, phoneTop: 720, phoneW: 780, textLeft: 96, textTop: 190, textW: 888, label: 38, head: 112, sub: 40, icon: 240 },
};
const LayoutCtx = React.createContext<Layout>("wide");
const useBox = () => BOX[React.useContext(LayoutCtx)];

// ------------------------------------------------------------------ stage

const Stage: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: INK }}>
      <AbsoluteFill style={{ background: `radial-gradient(ellipse 60% 70% at ${68 + 6 * Math.sin(f / 60)}% 38%, rgba(201,162,39,.20), transparent 70%)` }} />
      <AbsoluteFill style={{ background: `radial-gradient(ellipse 80% 40% at ${40 - 8 * Math.sin(f / 80)}% 105%, rgba(201,162,39,.08), transparent 70%)` }} />
      <AbsoluteFill style={{ background: "radial-gradient(ellipse 120% 90% at 50% 45%, transparent 60%, rgba(0,0,0,.55) 100%)" }} />
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------ type

/** Label, two-line headline and an optional line under it; rises in, lifts out. */
const Words: React.FC<{ from: number; to: number; label: string; top: string; bottom: string;
  sub?: string; subAt?: number }> = ({ from, to, label, top, bottom, sub, subAt }) => {
  const frame = useCurrentFrame();
  const b = useBox();
  const a = F(from) + 4, z = F(to) - 8;
  if (frame < a - 1 || frame > z + 12) return null;
  const inP = interpolate(frame, [a, a + 16], [0, 1], { ...CL, easing: Easing.out(Easing.cubic) });
  const outP = interpolate(frame, [z, z + 10], [0, 1], { ...CL, easing: Easing.in(Easing.cubic) });
  const line = (delay: number) => {
    const p = interpolate(frame, [a + delay, a + delay + 16], [0, 1], { ...CL, easing: Easing.out(Easing.cubic) });
    return { opacity: p * (1 - outP), transform: `translateY(${(1 - p) * 34 - outP * 26}px)`, filter: `blur(${(1 - p) * 10 + outP * 6}px)` };
  };
  const subP = subAt === undefined ? inP : interpolate(frame, [F(subAt), F(subAt) + 14], [0, 1], { ...CL, easing: Easing.out(Easing.cubic) });
  return (
    <div style={{ position: "absolute", left: b.textLeft, top: b.textTop, width: b.textW }}>
      <div style={{ ...line(0), fontFamily: "Bebas", fontSize: b.label, letterSpacing: "0.22em", color: GOLD }}>{label}</div>
      <div style={{ ...line(3), fontFamily: "Bebas", fontSize: b.head, lineHeight: 0.9, color: CREAM, marginTop: 14 }}>{top}</div>
      <div style={{ ...line(6), fontFamily: "Bebas", fontSize: b.head, lineHeight: 0.9, marginTop: 2,
        background: "linear-gradient(180deg, #F0CD62 0%, #C9A227 100%)", WebkitBackgroundClip: "text", color: "transparent" }}>{bottom}</div>
      {sub ? <div style={{ opacity: subP * (1 - outP), transform: `translateY(${(1 - subP) * 20 - outP * 20}px)`,
        fontFamily: SANS, fontSize: b.sub, lineHeight: 1.3, color: BODY, marginTop: 26, maxWidth: b.textW * 0.9 }}>{sub}</div> : null}
    </div>
  );
};

// ------------------------------------------------------------------ the phone

/** One capture on the screen for a stretch of beats, cross-faded in and out. */
const Shot: React.FC<{ from: number; to: number; children: React.ReactNode }> = ({ from, to, children }) => {
  const frame = useCurrentFrame();
  const a = F(from), z = F(to);
  if (frame < a || frame > z + 8) return null;
  const inP = from === timeline.home.from ? 1 : interpolate(frame, [a, a + 8], [0, 1], CL);
  const outP = interpolate(frame, [z, z + 8], [0, 1], CL);
  return <AbsoluteFill style={{ opacity: inP * (1 - outP), transform: `scale(${1.03 - 0.03 * inP})` }}>{children}</AbsoluteFill>;
};

const Still: React.FC<{ src: string; drift?: number; from: number; to: number }> = ({ src, drift = 0, from, to }) => {
  const frame = useCurrentFrame();
  const y = interpolate(frame, [F(from), F(to)], [0, -drift], CL);
  return <Img src={staticFile(src)} style={{ width: "100%", display: "block", transform: `translateY(${y}px)` }} />;
};

const Video: React.FC<{ src: string; from: number; at: number; rate?: number; dur: number }> = ({ src, from, at, rate = 1, dur }) => (
  <Sequence from={F(from)} durationInFrames={dur} layout="none">
    <OffthreadVideo src={staticFile(src)} trimBefore={Math.round(at * timeline.fps)} playbackRate={rate} muted
      style={{ width: "100%", display: "block" }} />
  </Sequence>
);

const Phone: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const b = useBox();
  const k = b.phoneW / 1010;                                  // the App Store frames' phone is 1010 wide
  const screenW = b.phoneW - 44 * k;
  const rise = spring({ frame: frame - F(3), fps, config: { damping: 20, stiffness: 90, mass: 1 } });
  const drop = interpolate(frame, [F(timeline.end.from) - 2, F(timeline.end.from) + 14], [0, 1], { ...CL, easing: Easing.in(Easing.cubic) });
  const y = (1 - rise) * 900 + drop * 1100;
  if (frame < F(3) || drop >= 1) return null;
  const P = timeline.picks, W = timeline.winners, D = timeline.darts, B = timeline.billfold, H = timeline.home;
  return (
    <div style={{ position: "absolute", left: b.phoneLeft, top: b.phoneTop, width: b.phoneW, transform: `translateY(${y}px)`,
      padding: 22 * k, borderRadius: 156 * k,
      background: "linear-gradient(145deg,#3B372F 0%,#1B1915 30%,#121110 70%,#2E2A23 100%)",
      boxShadow: `0 0 0 ${2 * k}px rgba(255,236,190,.10), 0 ${60 * k}px ${140 * k}px rgba(0,0,0,.75), 0 0 ${180 * k}px rgba(201,162,39,.14)` }}>
      <div style={{ position: "relative", width: screenW, height: screenW * SCREEN_RATIO, borderRadius: 134 * k, overflow: "hidden", background: "#000" }}>
        <Shot from={H.from - 3} to={H.to}><Still src="home_screen.png" drift={screenW * 0.05} from={H.from} to={H.to} /></Shot>
        <Shot from={P.from} to={P.flipAt}><Img src={staticFile("picks_front.png")} style={{ width: "100%", display: "block" }} /></Shot>
        <Sequence from={F(P.flipAt)} durationInFrames={F(P.to - P.flipAt) + 8} layout="none">
          <AbsoluteFill style={{ opacity: interpolate(frame, [F(P.to), F(P.to) + 8], [1, 0], CL) }}>
            <OffthreadVideo src={staticFile("picks_flip.mp4")} trimBefore={Math.round(P.flipSrc * timeline.fps)} muted
              style={{ width: "100%", display: "block" }} />
          </AbsoluteFill>
        </Sequence>
        <Shot from={W.from} to={W.to}><Video src="unveil.mp4" from={W.from} at={W.src} dur={F(W.to - W.from) + 8} /></Shot>
        <Shot from={D.from} to={D.to}><Video src="hr_throw.mp4" from={D.from} at={D.src} rate={0.95} dur={F(D.to - D.from) + 8} /></Shot>
        <Shot from={B.from} to={B.to}><Still src="billfold.png" drift={screenW * 0.04} from={B.from} to={B.to} /></Shot>
      </div>
    </div>
  );
};

/** The Billfold calendar lifts out of the phone toward the camera. */
const CalendarCard: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const layout = React.useContext(LayoutCtx);
  const B = timeline.billfold;
  if (frame < F(B.cardAt) || frame > F(B.to) + 10) return null;
  const p = spring({ frame: frame - F(B.cardAt), fps, config: { damping: 18, stiffness: 110 } });
  const out = interpolate(frame, [F(B.to), F(B.to) + 10], [0, 1], CL);
  const w = layout === "wide" ? 720 : 900;
  const left = layout === "wide" ? 1070 : 90;
  const top = layout === "wide" ? 250 : 900;
  return (
    <div style={{ position: "absolute", left, top, width: w, opacity: Math.min(1, p * 1.4) * (1 - out),
      transform: `translateY(${(1 - p) * 120}px) scale(${0.82 + 0.18 * p})`, transformOrigin: "50% 60%",
      borderRadius: 34, overflow: "hidden", border: "2px solid rgba(201,162,39,.45)",
      boxShadow: "0 50px 120px rgba(0,0,0,.8), 0 0 140px rgba(201,162,39,.18)", background: "#0E0D0B" }}>
      <Img src={staticFile("calendar.png")} style={{ width: "100%", display: "block" }} />
    </div>
  );
};

// ------------------------------------------------------------------ open and close

const Mark: React.FC<{ size: number; glow: number }> = ({ size, glow }) => (
  <div style={{ position: "relative", width: size, height: size }}>
    <div style={{ position: "absolute", inset: -size * 0.6, background: `radial-gradient(circle, rgba(201,162,39,${0.35 * glow}), transparent 62%)` }} />
    <Img src={staticFile("icon.png")} style={{ position: "relative", width: size, height: size, borderRadius: size * 0.225,
      boxShadow: "0 30px 80px rgba(0,0,0,.7)" }} />
  </div>
);

const Intro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const b = useBox();
  const I = timeline.intro;
  if (frame > F(I.to) + 10) return null;
  const p = spring({ frame: frame - 4, fps, config: { damping: 16, stiffness: 120, mass: 0.9 } });
  const word = interpolate(frame, [18, 34], [0, 1], { ...CL, easing: Easing.out(Easing.cubic) });
  const out = interpolate(frame, [F(I.to) - 6, F(I.to) + 8], [0, 1], { ...CL, easing: Easing.in(Easing.cubic) });
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 36,
      opacity: 1 - out, transform: `translateY(${-40 * out}px)`, filter: `blur(${out * 8}px)` }}>
      <div style={{ opacity: Math.min(1, p * 1.5), transform: `scale(${0.7 + 0.3 * p})` }}><Mark size={b.icon} glow={p} /></div>
      <div style={{ opacity: word, transform: `translateY(${(1 - word) * 18}px)`, fontFamily: "Bebas", fontSize: b.head * 0.7,
        letterSpacing: "0.04em", color: CREAM }}>Gary <span style={{ color: GOLD }}>A.I.</span></div>
    </AbsoluteFill>
  );
};

const End: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const b = useBox();
  const E = timeline.end;
  if (frame < F(E.from)) return null;
  const t = frame - F(E.from) - 6;
  const p = spring({ frame: t, fps, config: { damping: 16, stiffness: 110 } });
  const fade = (d: number) => interpolate(t, [d, d + 16], [0, 1], { ...CL, easing: Easing.out(Easing.cubic) });
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column", textAlign: "center", padding: "0 80px" }}>
      <div style={{ opacity: Math.min(1, p * 1.5), transform: `scale(${0.8 + 0.2 * p})` }}><Mark size={b.icon * 0.8} glow={p} /></div>
      <div style={{ opacity: fade(8), transform: `translateY(${(1 - fade(8)) * 20}px)`, fontFamily: "Bebas", fontSize: b.head * 0.9,
        lineHeight: 0.92, color: CREAM, marginTop: 44 }}>
        Game and prop picks<br /><span style={{ background: "linear-gradient(180deg, #F0CD62 0%, #C9A227 100%)", WebkitBackgroundClip: "text", color: "transparent" }}>for every game.</span>
      </div>
      <div style={{ opacity: fade(20), fontFamily: SANS, fontWeight: 600, fontSize: b.sub * 1.05, color: CREAM, marginTop: 36,
        padding: "16px 34px", border: `2px solid ${GOLD}`, borderRadius: 14 }}>Gary A.I. on the App Store</div>
      <div style={{ opacity: fade(30) * 0.75, fontFamily: SANS, fontSize: b.sub * 0.62, color: BODY, marginTop: 40, letterSpacing: "0.02em" }}>
        21+ | Not a sportsbook | Gambling problem? Call 1-800-GAMBLER
      </div>
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------ the film

export const Film: React.FC<{ layout: Layout }> = ({ layout }) => {
  const T = timeline;
  return (
    <LayoutCtx.Provider value={layout}>
      <AbsoluteFill style={{ background: INK, overflow: "hidden" }}>
        <Stage />
        <Intro />
        <Phone />
        <CalendarCard />
        <Words from={T.home.from} to={T.home.to} label="Home" top="Every game," bottom="one board." sub="Today's games, live scores and Gary's pick next to each one." />
        <Words from={T.picks.from} to={T.picks.to} label="Picks" top="Game and prop picks" bottom="for every game." sub="With the reasoning behind each one." subAt={T.picks.flipAt} />
        <Words from={T.winners.from} to={T.winners.to} label="Winners" top="A select set of" bottom="his best picks." sub="Sealed until you open them, with the numbers behind each one." />
        <Words from={T.darts.from} to={T.darts.to} label="Darts" top="Fun picks," bottom="thrown daily." sub="Touchdown scorers, home runs and hot streaks." />
        <Words from={T.billfold.from} to={T.billfold.to} label="Billfold" top="Every result" bottom="on the record." sub="Wins and losses, posted the morning after." />
        <End />
        <Audio src={staticFile("score.wav")} />
      </AbsoluteFill>
    </LayoutCtx.Provider>
  );
};
