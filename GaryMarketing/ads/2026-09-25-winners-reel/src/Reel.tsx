import React from "react";
import {
  AbsoluteFill, Audio, Easing, Img, OffthreadVideo, Sequence, continueRender, delayRender,
  interpolate, spring, staticFile, useCurrentFrame, useVideoConfig,
} from "remotion";
import { loadFont } from "@remotion/google-fonts/HankenGrotesk";
import timeline from "../timeline.json";
import { COVER_FRAMES, Cover } from "./Cover";

// SEALED -> CASHED. Every screen is a capture from the app (capture.sh); the
// code only moves the camera, sets the type and cuts to the beat.

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
const BEAT = (timeline.fps * 60) / timeline.bpm;           // 15 frames
const F = (beat: number) => Math.round(beat * BEAT);
const CL = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const fill: React.CSSProperties = { width: "100%", height: "100%", display: "block" };

type Variant = "organic" | "appstore";
/** True inside the Blender cut: the 3D phone settles on the hook's first frame. */
const From3D = React.createContext(false);
const INTRO = Math.round(timeline.intro3d.seconds * timeline.fps);

// ------------------------------------------------------------------ helpers

/** Decaying kick for a camera punch: amt at `at`, gone ~12 frames later. */
const punch = (frame: number, at: number, amt: number, tau = 4) =>
  frame < at ? 0 : amt * Math.exp(-(frame - at) / tau);

/** The phone screen full-bleed: content point (fx, fy) lands on (cx, cy) at
 *  scale s, clamped so no edge of the capture ever shows. */
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

/** A stretch of a recording, `at` seconds in, played at `rate`. */
const Clip: React.FC<{ src: string; from: number; dur: number; at: number; rate: number }> =
  ({ src, from, dur, at, rate }) => (
    <Sequence from={from} durationInFrames={dur} layout="none">
      <OffthreadVideo src={staticFile(src)} trimBefore={Math.round(at * timeline.fps)} playbackRate={rate} muted style={fill} />
    </Sequence>
  );

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
        fontFamily: "Bebas", fontSize: size, lineHeight: 0.9, color, letterSpacing: "0.01em",
        opacity: interpolate(t, [0, 2], [0, 1], CL) * (1 - leave),
        transform: `translateY(${-160 * leave}px) scale(${interpolate(p, [0, 1], [1.45, 1])})`,
        filter: `blur(${interpolate(t, [0, 5], [16, 0], CL) + 10 * leave}px)`,
        textShadow: "0 8px 44px rgba(0,0,0,.65)",
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
      <AbsoluteFill style={{ background: `radial-gradient(ellipse 85% 42% at ${50 + 9 * Math.sin(f / 38)}% 4%, rgba(201,162,39,${0.30 * glow}), transparent 70%)` }} />
      <AbsoluteFill style={{ background: `radial-gradient(ellipse 70% 30% at ${50 - 12 * Math.sin(f / 51)}% 102%, rgba(201,162,39,${0.14 * glow}), transparent 70%)` }} />
    </AbsoluteFill>
  );
};

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

// ------------------------------------------------------------------ sections

const Hook: React.FC = () => {
  const frame = useCurrentFrame();
  const { height: H } = useVideoConfig();
  const still = React.useContext(From3D);
  return (
    <Screen s={still ? 1 : interpolate(frame, [0, 30], [1.1, 1.0], { ...CL, easing: Easing.out(Easing.cubic) })} fy={H * 0.45} cy={H * 0.45}>
      <Img src={staticFile("board_sealed.png")} style={fill} />
    </Screen>
  );
};

/** Over the hook, the header row goes dark (it already carries Thursday's line). */
/** Out of the 3D shot the darkening comes up over a few frames instead of at once. */
const useArrive = () => {
  const frame = useCurrentFrame();
  return React.useContext(From3D) ? interpolate(frame, [0, 6], [0, 1], CL) : 1;
};

const TopScrim: React.FC = () => {
  const frame = useCurrentFrame();
  const arrive = useArrive();
  return <AbsoluteFill style={{ opacity: arrive * interpolate(frame, [F(2), F(3)], [1, 0], CL),
    background: "linear-gradient(to bottom, rgba(10,9,8,.97) 0%, rgba(10,9,8,.93) 27%, rgba(10,9,8,.35) 42%, rgba(10,9,8,0) 60%)" }} />;
};

const Headline: React.FC = () => {
  const { width: W, height: H } = useVideoConfig();
  const u = W / 1080;
  const out = Math.round(timeline.events.rip * timeline.fps);
  return (
    <AbsoluteFill style={{ alignItems: "center", paddingTop: H * 0.13 }}>
      <Slam at={F(0)} out={out} size={158 * u} color={WHITE}>GARY&rsquo;S PICKS</Slam>
      <Slam at={F(1)} out={out + 2} size={158 * u} color={GOLD}>COME SEALED.</Slam>
    </AbsoluteFill>
  );
};

const Unveil: React.FC = () => {
  const frame = useCurrentFrame();
  const { width: W, height: H } = useVideoConfig();
  const Hc = (W * SRC_H) / SRC_W;
  const packY = Hc * 0.45;
  const u = timeline.unveil;
  const start = F(u.from), land = F(u.land), stamp = F(u.stamp), reasons = F(u.reasons);
  const rip = Math.round(timeline.events.rip * timeline.fps);
  const push = frame < land
    ? interpolate(frame, [start, land], [1.0, 1.12], { ...CL, easing: Easing.inOut(Easing.quad) })
    : interpolate(frame, [land, F(13.5)], [1.12, 1.0], { ...CL, easing: Easing.inOut(Easing.cubic) });
  // The scorebook holds at real speed: a slow push while the chalk writes, and
  // the camera drifts down with it so the last reason lands in frame.
  const hold = interpolate(frame, [reasons, F(u.to)], [0, 0.05], CL);
  const pan = interpolate(frame, [F(16.2), F(19.2)], [0, 1], { ...CL, easing: Easing.inOut(Easing.cubic) });
  const s = push + hold + punch(frame, rip, 0.025) + punch(frame, land, 0.09, 5) + punch(frame, stamp, 0.035);
  const onBook = frame >= reasons;
  return (
    <>
      <Screen s={s} fy={onBook ? pan * Hc : packY} cy={onBook ? pan * H : packY}>
        {u.segments.map((g, i) => (
          <Clip key={i} src="unveil.mp4" from={F(g.from)} dur={F(g.to - g.from)} at={g.src} rate={g.rate} />
        ))}
      </Screen>
      {/* the hook's dim hands off to the app's own dark stage */}
      <AbsoluteFill style={{ background: INK, opacity: interpolate(frame, [start, start + 8], [0.5, 0], CL) }} />
      <Flash at={land} y={`${(packY / H) * 100}%`} strength={0.55} />
    </>
  );
};

const RevealAll: React.FC<{ variant: Variant }> = ({ variant }) => {
  const frame = useCurrentFrame();
  const { width: W, height: H, fps } = useVideoConfig();
  const r = timeline.reveal;
  const start = F(r.from);
  const beats = r.times.map((_, k) => F(r.from + 1 + k));
  const bump = beats.reduce((acc, at) => acc + punch(frame, at, 1, 3.5), 0);
  const clips = (
    <>
      <Clip src="revealall.mp4" from={start} dur={BEAT} at={r.times[0] - r.preroll} rate={1} />
      {r.times.map((t, k) => {
        // each pack gets a beat; the last one holds (slower) to the section's end
        const last = k + 1 === r.times.length;
        const next = last ? r.holdTo : r.times[k + 1];
        const dur = last ? F(r.to) - beats[k] : BEAT;
        return <Clip key={k} src="revealall.mp4" from={beats[k]} dur={dur} at={t} rate={((next - t) * timeline.fps) / dur} />;
      })}
    </>
  );
  if (variant === "appstore") {
    return <Screen s={1 + 0.012 * bump}>{clips}</Screen>;
  }
  // organic: the screen floats in 3D and kicks on every pack
  const t = frame - start;
  const enter = spring({ frame: t, fps, config: { damping: 17, stiffness: 150 } });
  const bw = W * 0.82, bh = H * 0.8;
  const scale = interpolate(enter, [0, 1], [W / bw, 1]) * (1 + 0.02 * bump);
  const ry = interpolate(enter, [0, 1], [0, -9]) + interpolate(t, [0, F(r.to - r.from)], [0, 15], CL);
  const rx = interpolate(enter, [0, 1], [0, 7]) - interpolate(t, [0, F(r.to - r.from)], [0, 4], CL);
  const glow = 0.22 + 0.45 * Math.min(1, bump);
  return (
    <>
      <Stage />
      <AbsoluteFill style={{ perspective: 2400, alignItems: "center", justifyContent: "flex-start", paddingTop: H * 0.1 }}>
        <div style={{
          width: bw, height: bh, borderRadius: 58 * (W / 1080), overflow: "hidden", position: "relative",
          transform: `rotateX(${rx}deg) rotateY(${ry}deg) scale(${scale})`, transformOrigin: "50% 40%",
          border: `2px solid rgba(201,162,39,${0.25 + 0.4 * Math.min(1, bump)})`,
          boxShadow: `0 50px 140px rgba(0,0,0,.7), 0 0 ${60 + 60 * glow}px rgba(201,162,39,${glow})`,
        }}>
          <div style={{ position: "absolute", left: 0, top: 0, width: bw, height: (bw * SRC_H) / SRC_W }}>{clips}</div>
          {/* a sheen across the glass */}
          <AbsoluteFill style={{ background: `linear-gradient(115deg, transparent ${30 + t * 0.25}%, rgba(255,240,200,.07) ${38 + t * 0.25}%, transparent ${46 + t * 0.25}%)` }} />
        </div>
      </AbsoluteFill>
    </>
  );
};

const Bumper: React.FC = () => {
  const frame = useCurrentFrame();
  const { width: W } = useVideoConfig();
  const u = W / 1080;
  const t = frame - F(timeline.bumper.from);
  const len = F(timeline.bumper.to - timeline.bumper.from);
  return (
    <>
      <Stage glow={0.45} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div style={{
          fontFamily: "Bebas", fontSize: 150 * u, lineHeight: 1,
          letterSpacing: `${interpolate(t, [0, 14], [0.32, 0.06], { ...CL, easing: Easing.out(Easing.cubic) })}em`,
          opacity: interpolate(t, [0, 4, len - 3, len], [0, 1, 1, 0], CL),
          backgroundImage: `linear-gradient(100deg, ${WHITE} 40%, #FFE7A1 50%, ${WHITE} 60%)`,
          backgroundSize: "300% 100%", backgroundPosition: `${interpolate(t, [0, len], [100, 0])}% 0`,
          WebkitBackgroundClip: "text", color: "transparent",
        }}>NEXT MORNING.</div>
      </AbsoluteFill>
    </>
  );
};

const Recap: React.FC<{ variant: Variant }> = ({ variant }) => {
  const frame = useCurrentFrame();
  const { width: W, height: H, fps } = useVideoConfig();
  const k = W / SRC_W;
  const from = F(timeline.recap.from), punchAt = F(timeline.recap.punch), back = F(36);
  // "9-6  +$465" in the real screenshot, capture pixels
  const fx = 219 * k, fy = 576 * k;
  const zoom = variant === "appstore" ? 1.45 : 1.8;
  const zin = spring({ frame: frame - punchAt, fps, config: { damping: 15, stiffness: 190 } });
  const zout = spring({ frame: frame - back, fps, config: { damping: 20, stiffness: 120 } });
  const creep = Math.max(0, frame - punchAt) * 0.0016;
  const s = interpolate(frame, [from, punchAt], [1, 1.04], CL) + (zoom - 1.04 + creep) * zin - (zoom + creep - 1) * zout;
  return (
    <>
      <Screen s={s} fx={fx} fy={fy} cx={W * 0.5} cy={H * 0.37}>
        <Img src={staticFile("recap_top.png")} style={fill} />
      </Screen>
      <Flash at={from} y="25%" strength={0.5} />
      <Flash at={punchAt} x="30%" y="37%" strength={0.35} />
    </>
  );
};

const EndCard: React.FC<{ variant: Variant }> = ({ variant }) => {
  const frame = useCurrentFrame();
  const { width: W, height: H, fps } = useVideoConfig();
  const u = W / 1080;
  const from = F(timeline.end.from);
  const inMark = spring({ frame: frame - from, fps, config: { damping: 12, stiffness: 120, mass: 0.9 } });
  const fade = (at: number) => interpolate(frame, [at, at + 6], [0, 1], CL);
  const rise = (at: number) => interpolate(frame, [at, at + 10], [24, 0], { ...CL, easing: Easing.out(Easing.cubic) });
  const organic = variant === "organic";
  return (
    <>
      <Stage glow={1.2} />
      <AbsoluteFill style={{ alignItems: "center" }}>
        <Img src={staticFile("gary-mark.png")} style={{
          position: "absolute", top: H * 0.14, width: W * 0.46, height: W * 0.46,
          opacity: interpolate(inMark, [0, 0.4], [0, 1], CL),
          transform: `translateY(${6 * Math.sin((frame - from) / 14)}px) scale(${interpolate(inMark, [0, 1], [0.62, 1])}) rotate(${interpolate(inMark, [0, 1], [-7, 0])}deg)`,
          filter: "drop-shadow(0 0 70px rgba(201,162,39,.45)) drop-shadow(0 30px 60px rgba(0,0,0,.6))",
        }} />
        <div style={{ position: "absolute", top: H * 0.5, width: "100%", display: "flex", justifyContent: "center" }}>
          <Slam at={F(39)} size={172 * u} color={WHITE}>OPEN TONIGHT&rsquo;S.</Slam>
        </div>
        <div style={{ position: "absolute", top: H * 0.615, width: W * 0.86, textAlign: "center", fontFamily: SANS,
          fontWeight: 500, fontSize: (organic ? 40 : 36) * u, lineHeight: 1.3, color: "rgba(245,241,232,.86)",
          opacity: fade(F(40)), transform: `translateY(${rise(F(40))}px)` }}>
          {organic ? <>Make an account before Oct 1<br />and Winners stays free.</> : <>Winners boards need a pass.<br />Picks and tracking are free.</>}
        </div>
        {organic && (
          <div style={{ position: "absolute", top: H * 0.735, display: "flex", flexDirection: "column", alignItems: "center",
            opacity: fade(F(41)), transform: `translateY(${rise(F(41))}px)` }}>
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

// ------------------------------------------------------------------ the reel

/** Sections read the reel's absolute frame (a Sequence would rebase it), so
 *  each one is simply shown inside its beats. */
const Beats: React.FC<{ from: number; to: number; children: React.ReactNode }> = ({ from, to, children }) => {
  const frame = useCurrentFrame();
  return frame >= F(from) && frame < F(to) ? <AbsoluteFill>{children}</AbsoluteFill> : null;
};

const HookDim: React.FC = () => <AbsoluteFill style={{ background: INK, opacity: 0.45 * useArrive() }} />;

/** Blender's 60 frames (blender/intro3d.py) over the stage; the last few
 *  dissolve into the capture the 3D screen was carrying. */
const Intro3D: React.FC = () => {
  const frame = useCurrentFrame();
  const handoff = interpolate(frame, [INTRO - 6, INTRO - 1], [0, 1], CL);
  return (
    <AbsoluteFill>
      <Stage />
      <AbsoluteFill style={{ opacity: handoff }}>
        <Screen><Img src={staticFile("board_sealed.png")} style={fill} /></Screen>
      </AbsoluteFill>
      <Img src={staticFile(`intro3d/${String(frame + 1).padStart(4, "0")}.png`)} style={{ ...fill, position: "absolute", opacity: 1 - handoff }} />
      <Vignette />
      <Grain />
      <Audio src={staticFile("intro.wav")} />
    </AbsoluteFill>
  );
};

const With3D: React.FC<{ variant: Variant }> = ({ variant }) => (
  <AbsoluteFill style={{ background: INK }}>
    <Sequence durationInFrames={INTRO}><Intro3D /></Sequence>
    <Sequence from={INTRO}><From3D.Provider value={true}><Main variant={variant} /></From3D.Provider></Sequence>
  </AbsoluteFill>
);

/** The cover leads the organic cuts: Thursday's real line, the 3D phone. */
export const Reel: React.FC<{ variant: Variant; intro3d?: boolean; cover?: boolean }> = ({ variant, intro3d, cover }) => {
  const film = intro3d ? <With3D variant={variant} /> : <Main variant={variant} />;
  if (!cover) return film;
  return (
    <AbsoluteFill style={{ background: INK }}>
      <Sequence durationInFrames={COVER_FRAMES}>
        <Cover kicker={"THURSDAY\u2019S PICKS:"} title="9-6. +$465." art="intro3d/0022.png" artX={-0.07} artY={0.2} artScale={1.18} />
      </Sequence>
      <Sequence from={COVER_FRAMES}>{film}</Sequence>
    </AbsoluteFill>
  );
};

const Main: React.FC<{ variant: Variant }> = ({ variant }) => {
  const T = timeline;
  return (
    <AbsoluteFill style={{ background: INK }}>
      <Beats from={T.hook.from} to={T.hook.to}><Hook /><HookDim /></Beats>
      <Beats from={T.unveil.from} to={T.unveil.to}><Unveil /></Beats>
      <Beats from={0} to={4}><TopScrim /></Beats>
      <Beats from={0} to={6}><Headline /></Beats>
      <Beats from={T.reveal.from} to={T.reveal.to}><RevealAll variant={variant} /></Beats>
      <Beats from={T.bumper.from} to={T.bumper.to}><Bumper /></Beats>
      <Beats from={T.recap.from} to={T.recap.to}><Recap variant={variant} /></Beats>
      <Beats from={T.end.from} to={T.end.to}><EndCard variant={variant} /></Beats>
      <Vignette />
      <Grain />
      <Audio src={staticFile("score.wav")} />
    </AbsoluteFill>
  );
};
