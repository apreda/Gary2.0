import React from "react";
import {
  AbsoluteFill, Audio, Easing, Img, OffthreadVideo, Sequence, continueRender, delayRender,
  interpolate, spring, staticFile, useCurrentFrame, useVideoConfig,
} from "remotion";
import { loadFont } from "@remotion/google-fonts/HankenGrotesk";
import timeline from "../timeline.json";
import { POSTER_HOLD, POSTER_FADE, PosterStill, PosterTitles } from "./Poster";

// BIG GAME? GARY'S IN. The open is Blender (blender/darts3d.py): the app's own
// board in 3D, darts on the beat, dropping onto the real Thursday Night
// Football screen. Every screen after it is a capture from the app (capture.sh).

const { fontFamily: SANS } = loadFont("normal", { weights: ["400", "500", "600"], subsets: ["latin"] });
const bebasWait = delayRender("Bebas Neue");
new FontFace("Bebas", `url(${staticFile("BebasNeue-Regular.ttf")}) format("truetype")`).load()
  .then((face) => { document.fonts.add(face); continueRender(bebasWait); })
  .catch((err) => { console.error(err); continueRender(bebasWait); });

const INK = "#0A0908";
const GOLD = "#C9A227";
const WHITE = "#F5F1E8";
const SRC_W = 1320;
const SRC_H = 2868;
const BOARD = { x: 660, y: 1586.5 };            // the dartboard's bull in every Darts capture
const BEAT = (timeline.fps * 60) / timeline.bpm;
const F = (beat: number) => Math.round(beat * BEAT);
const CL = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const fill: React.CSSProperties = { width: "100%", height: "100%", display: "block" };

const punch = (frame: number, at: number, amt: number, tau = 4) => (frame < at ? 0 : amt * Math.exp(-(frame - at) / tau));

const Screen: React.FC<{ s?: number; fx?: number; fy?: number; cx?: number; cy?: number; children: React.ReactNode }> =
  ({ s = 1, fx, fy, cx, cy, children }) => {
    const { width: W, height: H } = useVideoConfig();
    const Hc = (W * SRC_H) / SRC_W;
    const px = fx ?? W / 2, py = fy ?? 0;
    let tx = (cx ?? px) - px * s;
    let ty = (cy ?? py) - py * s;
    tx = Math.min(0, Math.max(W - W * s, tx));
    ty = Math.min(0, Math.max(H - Hc * s, ty));
    return (
      <AbsoluteFill style={{ overflow: "hidden" }}>
        <div style={{ position: "absolute", left: 0, top: 0, width: W, height: Hc, transformOrigin: "0 0",
          transform: `translate(${tx}px, ${ty}px) scale(${s})` }}>{children}</div>
      </AbsoluteFill>
    );
  };

const Slam: React.FC<{ at: number; out?: number; size: number; color: string; children: React.ReactNode }> =
  ({ at, out, size, color, children }) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    const t = frame - at;
    if (t < 0) return null;
    const p = spring({ frame: t, fps, config: { damping: 13, stiffness: 260, mass: 0.7 } });
    const leave = out === undefined ? 0 : interpolate(frame, [out, out + 8], [0, 1], { ...CL, easing: Easing.in(Easing.cubic) });
    return (
      <div style={{
        fontFamily: "Bebas", fontSize: size, lineHeight: 0.9, color, letterSpacing: "0.01em", textAlign: "center",
        opacity: interpolate(t, [0, 2], [0, 1], CL) * (1 - leave),
        transform: `translateY(${-160 * leave}px) scale(${interpolate(p, [0, 1], [1.45, 1])})`,
        filter: `blur(${interpolate(t, [0, 5], [16, 0], CL) + 10 * leave}px)`,
        textShadow: "0 8px 44px rgba(0,0,0,.7)",
      }}>{children}</div>
    );
  };

const Flash: React.FC<{ at: number; x?: string; y?: string; strength?: number }> = ({ at, x = "50%", y = "50%", strength = 0.6 }) => {
  const t = useCurrentFrame() - at;
  if (t < 0 || t > 10) return null;
  return <AbsoluteFill style={{ mixBlendMode: "screen", opacity: strength * (1 - t / 10),
    background: `radial-gradient(circle at ${x} ${y}, rgba(255,238,180,1), rgba(201,162,39,.55) 28%, transparent 68%)` }} />;
};

const Stage: React.FC<{ glow?: number }> = ({ glow = 1 }) => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: INK }}>
      <AbsoluteFill style={{ background: `radial-gradient(ellipse 85% 42% at ${50 + 9 * Math.sin(f / 38)}% 4%, rgba(201,162,39,${0.3 * glow}), transparent 70%)` }} />
      <AbsoluteFill style={{ background: `radial-gradient(ellipse 70% 30% at ${50 - 12 * Math.sin(f / 51)}% 102%, rgba(201,162,39,${0.14 * glow}), transparent 70%)` }} />
    </AbsoluteFill>
  );
};

const TopScrim: React.FC<{ opacity?: number }> = ({ opacity = 1 }) => (
  <AbsoluteFill style={{ opacity, background: "linear-gradient(to bottom, rgba(10,9,8,.96) 0%, rgba(10,9,8,.9) 24%, rgba(10,9,8,.35) 38%, rgba(10,9,8,0) 50%)" }} />
);

const Vignette: React.FC = () => (
  <AbsoluteFill style={{ pointerEvents: "none", background: "radial-gradient(ellipse 115% 85% at 50% 42%, transparent 58%, rgba(0,0,0,.5) 100%)" }} />
);

const Grain: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ mixBlendMode: "overlay", opacity: 0.1, pointerEvents: "none" }}>
      <svg width="100%" height="100%">
        <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={2} seed={f % 16} stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" /></filter>
        <rect width="100%" height="100%" filter="url(#grain)" />
      </svg>
    </AbsoluteFill>
  );
};

const Beats: React.FC<{ from: number; to: number; children: React.ReactNode }> = ({ from, to, children }) => {
  const frame = useCurrentFrame();
  return frame >= F(from) && frame < F(to) ? <AbsoluteFill>{children}</AbsoluteFill> : null;
};

// ------------------------------------------------------------------ sections

/** Blender's frames over the stage; the last few dissolve into the capture
 *  its screen was carrying, which the next section opens on. */
const Open3D: React.FC = () => {
  const frame = useCurrentFrame();
  const { width: W, height: H } = useVideoConfig();
  const u = W / 1080;
  const n = timeline.open3d.frames;
  const handoff = interpolate(frame, [n - 6, n - 1], [0, 1], CL);
  return (
    <>
      <Stage />
      <AbsoluteFill style={{ opacity: handoff }}>
        <Screen><Img src={staticFile("tnf_recyds.png")} style={fill} /></Screen>
      </AbsoluteFill>
      <Img src={staticFile(`darts3d/${String(frame + 1).padStart(4, "0")}.png`)} style={{ ...fill, position: "absolute", opacity: 1 - handoff }} />
      <Flash at={0} y="50%" strength={0.45} />
      <AbsoluteFill style={{ alignItems: "center", paddingTop: H * 0.09 }}>
        {timeline.hook.map((h, i) => (
          <Slam key={i} at={F(h.beat)} out={F(h.out)} size={170 * u} color={h.gold ? GOLD : WHITE}>{h.text.replace("'", "’")}</Slam>
        ))}
      </AbsoluteFill>
    </>
  );
};

const Thursday: React.FC = () => {
  const frame = useCurrentFrame();
  const { width: W, height: H } = useVideoConfig();
  const u = W / 1080;
  const k = W / SRC_W;
  const t = timeline.tnf;
  const cuts = t.cuts;
  const current = [...cuts].reverse().find((c) => frame >= F(c.beat)) ?? cuts[0];
  const bump = cuts.slice(1).reduce((acc, c) => acc + punch(frame, F(c.beat), 0.035), 0) + punch(frame, F(t.stat.beat), 0.05, 5);
  const s = interpolate(frame, [F(t.from), F(t.to)], [1, 1.07], CL) + bump;
  const scrimIn = interpolate(frame, [F(t.from), F(t.from) + 6], [0, 1], CL);
  return (
    <>
      <Screen s={s} fx={BOARD.x * k} fy={BOARD.y * k} cx={BOARD.x * k} cy={BOARD.y * k}>
        <Img src={staticFile(current.img)} style={fill} />
      </Screen>
      <TopScrim opacity={scrimIn} />
      <AbsoluteFill style={{ alignItems: "center", paddingTop: H * 0.075 }}>
        <Slam at={F(t.label.beat)} out={F(t.label.out)} size={112 * u} color={WHITE}>{t.label.text}</Slam>
      </AbsoluteFill>
      <AbsoluteFill style={{ alignItems: "center", paddingTop: H * 0.07 }}>
        <Slam at={F(t.stat.beat)} size={220 * u} color={GOLD}>{t.stat.text}</Slam>
      </AbsoluteFill>
      <Flash at={F(t.stat.beat)} y="12%" strength={0.35} />
    </>
  );
};

const HomeRuns: React.FC = () => {
  const frame = useCurrentFrame();
  const { width: W } = useVideoConfig();
  const k = W / SRC_W;
  const h = timeline.hr;
  const s = interpolate(frame, [F(h.from), F(h.to)], [1.02, 1.12], CL) + h.darts.reduce((acc, d) => acc + punch(frame, F(d), 0.022, 2.5), 0);
  return (
    <Screen s={s} fx={BOARD.x * k} fy={BOARD.y * k} cx={BOARD.x * k} cy={BOARD.y * k}>
      <Sequence from={F(h.from)} durationInFrames={F(h.to - h.from)} layout="none">
        <OffthreadVideo src={staticFile("hr_throw.mp4")} trimBefore={Math.round(h.src * timeline.fps)} playbackRate={h.rate} muted style={fill} />
      </Sequence>
    </Screen>
  );
};

const Sunday: React.FC = () => {
  const frame = useCurrentFrame();
  const { width: W, height: H } = useVideoConfig();
  const u = W / 1080;
  const k = W / SRC_W;
  const sd = timeline.sunday;
  const s = interpolate(frame, [F(sd.from), F(sd.to)], [1.0, 1.16], { ...CL, easing: Easing.inOut(Easing.quad) });
  return (
    <>
      <Screen s={s} fx={BOARD.x * k} fy={BOARD.y * k} cx={BOARD.x * k} cy={BOARD.y * k}>
        <Img src={staticFile(sd.img)} style={fill} />
      </Screen>
      <TopScrim />
      <AbsoluteFill style={{ alignItems: "center", paddingTop: H * 0.085 }}>
        <Slam at={F(sd.beat)} size={150 * u} color={WHITE}>{sd.text.replace("'", "’")}</Slam>
      </AbsoluteFill>
      <Flash at={F(sd.from)} y="60%" strength={0.3} />
    </>
  );
};

const EndCard: React.FC<{ cta: boolean }> = ({ cta }) => {
  const frame = useCurrentFrame();
  const { width: W, height: H, fps } = useVideoConfig();
  const u = W / 1080;
  const from = F(timeline.end.from);
  const inMark = spring({ frame: frame - from, fps, config: { damping: 12, stiffness: 120, mass: 0.9 } });
  const fade = (at: number) => interpolate(frame, [at, at + 6], [0, 1], CL);
  const rise = (at: number) => interpolate(frame, [at, at + 10], [24, 0], { ...CL, easing: Easing.out(Easing.cubic) });
  return (
    <>
      <Stage glow={1.2} />
      <AbsoluteFill style={{ alignItems: "center" }}>
        <Img src={staticFile("gary-mark.png")} style={{
          position: "absolute", top: H * 0.1, width: W * 0.42, height: W * 0.42,
          opacity: interpolate(inMark, [0, 0.4], [0, 1], CL),
          transform: `translateY(${6 * Math.sin((frame - from) / 14)}px) scale(${interpolate(inMark, [0, 1], [0.62, 1])}) rotate(${interpolate(inMark, [0, 1], [-7, 0])}deg)`,
          filter: "drop-shadow(0 0 70px rgba(201,162,39,.45)) drop-shadow(0 30px 60px rgba(0,0,0,.6))",
        }} />
        <div style={{ position: "absolute", top: H * 0.44, width: "100%", display: "flex", flexDirection: "column", alignItems: "center" }}>
          <Slam at={F(26.5)} size={150 * u} color={WHITE}>GARY NEVER SITS OUT</Slam>
          <Slam at={F(27)} size={150 * u} color={GOLD}>THE BIG GAME.</Slam>
        </div>
        <div style={{ position: "absolute", top: H * 0.625, width: W * 0.86, textAlign: "center", fontFamily: SANS,
          fontWeight: 500, fontSize: 40 * u, lineHeight: 1.3, color: "rgba(245,241,232,.86)",
          opacity: fade(F(28)), transform: `translateY(${rise(F(28))}px)` }}>
          Darts are free in the app.
        </div>
        {cta && (
          <div style={{ position: "absolute", top: H * 0.72, display: "flex", flexDirection: "column", alignItems: "center",
            opacity: fade(F(29)), transform: `translateY(${rise(F(29))}px)` }}>
            <div style={{ fontFamily: "Bebas", fontSize: 104 * u, color: GOLD, letterSpacing: "0.03em", lineHeight: 1 }}>GET GARY&nbsp;&rsaquo;</div>
            <div style={{ fontFamily: SANS, fontWeight: 500, fontSize: 36 * u, color: "rgba(245,241,232,.72)", marginTop: 10 * u }}>On the App Store</div>
          </div>
        )}
        <div style={{ position: "absolute", bottom: H * 0.045, width: "100%", textAlign: "center", fontFamily: SANS,
          fontSize: 24 * u, color: "rgba(245,241,232,.5)", opacity: fade(from) }}>
          21+ &middot; Not a sportsbook &middot; Gambling problem? Call 1-800-GAMBLER
        </div>
      </AbsoluteFill>
    </>
  );
};

/** The film opens on a poster frame of itself (see Poster.tsx): Thursday night's real line over the 3D board. */
export const DartsReel: React.FC<{ cta: boolean; cover?: boolean }> = ({ cta, cover }) => {
  if (!cover) return <Film cta={cta} />;
  // The board with the three darts in, under the line; then it dissolves
  // into the film's opening, the lights coming up on the empty board.
  return (
    <AbsoluteFill style={{ background: INK }}>
      <Sequence from={POSTER_HOLD}><Film cta={cta} /></Sequence>
      <Sequence durationInFrames={POSTER_HOLD + POSTER_FADE}>
        <PosterStill fade>
          <Stage />
          <Img src={staticFile("darts3d/0053.png")} style={{ ...fill, position: "absolute", transform: "translateY(4%)" }} />
          <Vignette />
          <Grain />
        </PosterStill>
        <PosterTitles kicker="THURSDAY NIGHT FOOTBALL:" title="7 OF 8 HIT." />
      </Sequence>
      <Audio src={staticFile("cover.wav")} />
    </AbsoluteFill>
  );
};

const Film: React.FC<{ cta: boolean }> = ({ cta }) => {
  const T = timeline;
  return (
    <AbsoluteFill style={{ background: INK }}>
      <Beats from={T.open3d.from} to={T.open3d.to}><Open3D /></Beats>
      <Beats from={T.tnf.from} to={T.tnf.to}><Thursday /></Beats>
      <Beats from={T.hr.from} to={T.hr.to}><HomeRuns /></Beats>
      <Beats from={T.sunday.from} to={T.sunday.to}><Sunday /></Beats>
      <Beats from={T.end.from} to={T.end.to}><EndCard cta={cta} /></Beats>
      <Vignette />
      <Grain />
      <Audio src={staticFile("score.wav")} />
    </AbsoluteFill>
  );
};
