// THE SUNDAY SPOT (Oct 4 2026), a 21 s Instagram reel in three genres.
//   Act 1, the sportsbook ad: a stadium, gold type, the day's real slate by kickoff window, the count.
//   The cut: "One of you." on black, in silence.
//   Act 2, the tech ad: a paper stage, today's real pick cards dealt like a deck, one flips to its reasoning.
//   Act 3, the commercial's button: the end card.
// 120 BPM, so a beat is 15 frames; every hit below sits on timeline.json's grid with the score.
import React from "react";
import { AbsoluteFill, Audio, Easing, Img, continueRender, delayRender, interpolate, random, staticFile, useCurrentFrame } from "remotion";
import anton from "./anton.json";
import timeline from "../timeline.json";

const GOLD = "#C9A227", INK = "#0A0908", WARM = "#F5F1E8", NIGHT = "#050304";
const BEAT = 15;
const E = timeline.events;
const CUT = E.cutBeat * BEAT;            // 285: the music stops
const QUIET = 330;                       // the paper stage
const END = E.endBeat * BEAT;            // 525: the end card
const LOGO = END + BEAT;                 // 540: the clap

const fontsReady = delayRender("fonts");
Promise.all([
  ["Anton", "Anton-Regular.ttf", "400"], ["Bebas", "BebasNeue-Regular.ttf", "400"],
  ["Tight", "InterTight.ttf", "100 900"], ["Barlow", "BarlowCondensed-SemiBold.ttf", "600"],
].map(([family, file, weight]) => new FontFace(family, `url(${staticFile(file)})`, { weight }).load().then((f) => document.fonts.add(f))))
  .then(() => continueRender(fontsReady));

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const out3 = Easing.out(Easing.cubic);
const antonEm = (s: string) => [...s].reduce((w, c) => w + ((anton as Record<string, number>)[c] ?? 0.5), 0);
/** The Anton size at which `s` is `width` wide, capped. */
const fit = (s: string, width: number, max = 9999) => Math.min(max, width / antonEm(s));
/** 1 at the hit, decaying. */
const pulse = (frame: number, at: number, decay = 5) => (frame < at ? 0 : Math.exp(-(frame - at) / decay));

const WINDOWS = [
  { at: 45, until: 105, kicker: "8 GAMES", label: ["1 PM"], labelSize: 330, step: 7.5, rows: [
    ["PATRIOTS", "BILLS"], ["JETS", "BEARS"], ["COWBOYS", "TEXANS"], ["RAMS", "EAGLES"],
    ["JAGUARS", "BENGALS"], ["CARDINALS", "GIANTS"], ["TITANS", "RAVENS"], ["PACKERS", "BUCCANEERS"]] },
  { at: 105, until: 150, kicker: "4 GAMES", label: ["4 PM"], labelSize: 330, step: 7.5, rows: [
    ["DOLPHINS", "VIKINGS"], ["CHARGERS", "SEAHAWKS"], ["BRONCOS", "49ERS"], ["CHIEFS", "RAIDERS"]] },
  { at: 150, until: 195, kicker: "8:20 PM", label: ["SUNDAY", "NIGHT"], labelSize: 300, step: 8, first: 8, rows: [["LIONS", "PANTHERS"]] },
  { at: 195, until: 240, kicker: "OCTOBER", label: ["PLAYOFF", "BASEBALL"], labelSize: 250, step: 15, first: 8, rows: [
    ["PADRES", "BREWERS"], ["BRAVES", "DODGERS"]] },
];
const HITS = [45, 105, 150, 195, 240, 263];           // the opening is already lit at frame 0, the cover

const goldText: React.CSSProperties = {
  background: "linear-gradient(180deg, #FFF4BF 0%, #F3D873 26%, #C9A227 58%, #8C6B12 100%)",
  WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent",
};
const antonStyle = (size: number): React.CSSProperties => ({
  fontFamily: "Anton", fontSize: size, lineHeight: 0.98, letterSpacing: 0, textTransform: "uppercase", whiteSpace: "nowrap",
});

// ── The stadium ───────────────────────────────────────────────────────────────
const Bank: React.FC<{ x: number; flip: boolean; power: number; frame: number }> = ({ x, flip, power, frame }) => (
  <div style={{ position: "absolute", left: x, top: 70, width: 330, transform: `rotate(${flip ? 7 : -7}deg)` }}>
    {[0, 1, 2].map((r) => (
      <div key={r} style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
        {[0, 1, 2, 3, 4, 5].map((c) => {
          const on = power * (0.82 + 0.18 * random(`led${x}${r}${c}${Math.floor(frame / 2)}`));
          return <div key={c} style={{ width: 34, height: 34, borderRadius: 34, opacity: Math.min(1, on),
            background: "radial-gradient(circle, #FFFFFF 0%, #FFF1BE 45%, #E9C656 100%)",
            boxShadow: `0 0 ${26 + 30 * power}px ${8 + 12 * power}px rgba(255,232,160,${0.5 * power})` }} />;
        })}
      </div>
    ))}
  </div>
);

const Beam: React.FC<{ x: number; angle: number; power: number }> = ({ x, angle, power }) => (
  <div style={{ position: "absolute", left: x - 330, top: 110, width: 660, height: 2300, transformOrigin: "50% 0%",
    transform: `rotate(${angle}deg)`, opacity: 0.34 * power, mixBlendMode: "screen", filter: "blur(26px)",
    clipPath: "polygon(46% 0, 54% 0, 100% 100%, 0 100%)",
    background: "linear-gradient(180deg, rgba(255,238,190,0.95) 0%, rgba(255,226,150,0.35) 40%, rgba(255,226,150,0) 82%)" }} />
);

const Stadium: React.FC<{ frame: number; power: number }> = ({ frame, power }) => {
  const sway = Math.sin(frame / 38) * 5;
  return (
    <AbsoluteFill style={{ background: `radial-gradient(120% 70% at 50% 0%, #241A07 0%, #0C0904 46%, ${NIGHT} 100%)` }}>
      <Beam x={225} angle={-19 + sway} power={power} />
      <Beam x={225} angle={-4 + sway * 0.6} power={power * 0.8} />
      <Beam x={855} angle={19 - sway} power={power} />
      <Beam x={855} angle={4 - sway * 0.6} power={power * 0.8} />
      <Bank x={60} flip={false} power={power} frame={frame} />
      <Bank x={690} flip power={power} frame={frame} />
      {Array.from({ length: 46 }, (_, i) => {
        const sx = random(`hx${i}`) * 1080, sy = random(`hy${i}`) * 1920, sp = 0.6 + random(`hs${i}`) * 1.6;
        const y = (((sy - frame * sp) % 1920) + 1920) % 1920, s = 3 + random(`hz${i}`) * 7;
        return <div key={i} style={{ position: "absolute", left: sx + Math.sin((frame + i * 9) / 30) * 14, top: y, width: s, height: s,
          borderRadius: s, background: "#FFE9A8", opacity: (0.1 + 0.3 * random(`ho${i}`)) * power, filter: "blur(1.5px)" }} />;
      })}
      <AbsoluteFill style={{ background: "radial-gradient(70% 28% at 50% 104%, rgba(201,162,39,0.5) 0%, rgba(201,162,39,0) 100%)", opacity: power }} />
      <AbsoluteFill style={{ backgroundImage: "radial-gradient(rgba(255,244,210,0.07) 1.2px, rgba(0,0,0,0) 1.9px)", backgroundSize: "10px 10px" }} />
      <AbsoluteFill style={{ background: "radial-gradient(90% 75% at 50% 46%, rgba(0,0,0,0) 50%, rgba(0,0,0,0.6) 100%)" }} />
    </AbsoluteFill>
  );
};

// ── Act 1 type ────────────────────────────────────────────────────────────────
const Opening: React.FC<{ frame: number }> = ({ frame }) => {
  const size = fit("SUNDAY", 900);
  const scale = interpolate(frame, [0, 45], [1.06, 1], { ...clamp, easing: out3 });
  const glint = interpolate(frame, [6, 30], [-30, 130], clamp);
  const exit = interpolate(frame, [39, 45], [0, 1], clamp);
  const word: React.CSSProperties = { ...antonStyle(size), position: "absolute", left: 0, top: 0 };
  return (
    <AbsoluteFill style={{ opacity: 1 - exit, transform: `translateY(${-220 * exit}px) scale(${scale})`, filter: `blur(${exit * 10}px)` }}>
      <div style={{ position: "absolute", left: 60, top: 640, width: 960, textAlign: "center", fontFamily: "Barlow", fontWeight: 600, fontSize: 58,
        letterSpacing: "0.42em", color: WARM, opacity: 0.9, paddingLeft: "0.42em", boxSizing: "border-box" }}>OCTOBER 4</div>
      <div style={{ position: "absolute", left: 90, top: 730, width: 900, height: size, transform: "skewX(-7deg)",
        filter: "drop-shadow(0 7px 0 #3A2B05) drop-shadow(0 26px 40px rgba(0,0,0,0.7))" }}>
        <div style={{ ...word, ...goldText }}>SUNDAY</div>
        <div style={{ ...word, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent",
          backgroundImage: `linear-gradient(105deg, rgba(255,255,255,0) ${glint - 14}%, rgba(255,255,255,0.95) ${glint}%, rgba(255,255,255,0) ${glint + 14}%)` }}>SUNDAY</div>
      </div>
      <div style={{ position: "absolute", left: 90, top: 730 + size + 34, width: 900, height: 5, background: GOLD, opacity: 0.9,
        transform: `scaleX(${interpolate(frame, [4, 22], [0, 1], { ...clamp, easing: out3 })})` }} />
    </AbsoluteFill>
  );
};

const Slate: React.FC<{ frame: number; w: (typeof WINDOWS)[number] }> = ({ frame, w }) => {
  const t = frame - w.at;
  const enter = interpolate(t, [0, 4], [0, 1], { ...clamp, easing: out3 });
  const exit = interpolate(frame, [w.until - 4, w.until], [0, 1], clamp);
  const rowSize = Math.min(...w.rows.map(([a, h]) => fit(`${a}${h}`, 960 - 150)), w.rows.length > 4 ? 100 : 150);
  const rowH = rowSize * 1.14;
  const blockH = 78 + w.label.length * w.labelSize * 0.98 + 70 + w.rows.length * rowH;
  const labelTop = Math.max(250, 900 - blockH / 2);
  const listTop = labelTop + 78 + w.label.length * w.labelSize * 0.98 + 70;
  return (
    <AbsoluteFill style={{ opacity: 1 - exit, transform: `translateY(${-160 * exit}px)`, filter: `blur(${exit * 9}px)` }}>
      <div style={{ position: "absolute", left: 64, top: labelTop, fontFamily: "Barlow", fontWeight: 600, fontSize: 54, letterSpacing: "0.3em",
        color: GOLD, opacity: enter }}>{w.kicker}</div>
      <div style={{ position: "absolute", left: 60, top: labelTop + 78, transformOrigin: "0% 60%",
        transform: `skewX(-7deg) scale(${interpolate(t, [0, 4], [1.22, 1], { ...clamp, easing: out3 })})`,
        filter: `blur(${(1 - enter) * 9}px) drop-shadow(0 16px 30px rgba(0,0,0,0.7))`, opacity: enter }}>
        {w.label.map((line) => <div key={line} style={{ ...antonStyle(w.labelSize), color: WARM }}>{line}</div>)}
      </div>
      <div style={{ position: "absolute", left: 64, top: listTop - 34, width: 952 * enter, height: 4, background: GOLD }} />
      {w.rows.map(([away, home], k) => {
        const rt = t - (w.first ?? 0) - k * w.step;
        if (rt < 0) return null;
        const hot = interpolate(rt, [0, 5], [1, 0], clamp);
        return (
          <div key={away} style={{ position: "absolute", left: 64, top: listTop + k * rowH, display: "flex", alignItems: "baseline",
            transform: `translateX(${interpolate(rt, [0, 5], [-70, 0], { ...clamp, easing: out3 })}px) skewX(-7deg)`,
            opacity: interpolate(rt, [0, 2], [0, 1], clamp), filter: `brightness(${1 + hot * 1.5}) drop-shadow(0 8px 16px rgba(0,0,0,0.6))` }}>
            <span style={{ ...antonStyle(rowSize), ...goldText }}>{away}</span>
            <span style={{ fontFamily: "Barlow", fontWeight: 600, fontSize: rowSize * 0.4, letterSpacing: "0.1em", color: WARM, opacity: 0.78,
              margin: `0 ${rowSize * 0.18}px`, transform: `translateY(${-rowSize * 0.16}px)` }}>AT</span>
            <span style={{ ...antonStyle(rowSize), ...goldText }}>{home}</span>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

const Count: React.FC<{ frame: number; at: number; until: number; n: string; words: string }> = ({ frame, at, until, n, words }) => {
  const t = frame - at;
  if (t < 0 || frame >= until) return null;
  const slam = interpolate(t, [0, 4], [1.7, 1], { ...clamp, easing: out3 });
  const wSize = fit(words, 940);
  return (
    <AbsoluteFill style={{ alignItems: "center", transform: `scale(${slam}) skewX(-7deg)`, filter: `blur(${interpolate(t, [0, 3], [14, 0], clamp)}px)` }}>
      <div style={{ ...antonStyle(700), ...goldText, marginTop: 300, filter: "drop-shadow(0 10px 0 #3A2B05) drop-shadow(0 30px 50px rgba(0,0,0,0.7))" }}>{n}</div>
      <div style={{ ...antonStyle(wSize), color: WARM, marginTop: 30, filter: "drop-shadow(0 14px 26px rgba(0,0,0,0.7))" }}>{words}</div>
    </AbsoluteFill>
  );
};

// ── Act 2: the paper stage ────────────────────────────────────────────────────
const DECK = ["card_10.png", "card_9.png", "card_8.png", "card_7.png", "card_6.png", "card_5.png", "card_4.png", "card_3.png", "hero_front.png"];
const CARD_W = 860, FRONT_H = Math.round(CARD_W * 698 / 1179), HERO_H = Math.round(CARD_W * 702 / 1189), BACK_H = Math.round(CARD_W * 771 / 1193);
const STACK_Y = 1085;

const Words: React.FC<{ frame: number; at: number; lines: string[]; gap?: number; out?: number }> = ({ frame, at, lines, gap = 6, out }) => {
  let n = 0;
  const leave = out === undefined ? 0 : interpolate(frame, [out, out + 8], [0, 1], clamp);
  return (
    <div style={{ position: "absolute", left: 90, top: 330, opacity: 1 - leave, transform: `translateY(${-30 * leave}px)` }}>
      {lines.map((line) => (
        <div key={line} style={{ fontFamily: "Tight", fontWeight: 800, fontSize: 132, lineHeight: 1.04, letterSpacing: "-0.035em", color: INK, whiteSpace: "nowrap" }}>
          {line.split(" ").map((word) => {
            const t = frame - at - gap * n++;
            return <span key={word} style={{ display: "inline-block", marginRight: "0.24em", opacity: interpolate(t, [0, 7], [0, 1], clamp),
              transform: `translateY(${interpolate(t, [0, 9], [34, 0], { ...clamp, easing: out3 })}px)` }}>{word}</span>;
          })}
        </div>
      ))}
    </div>
  );
};

const Deck: React.FC<{ frame: number }> = ({ frame }) => {
  const flip = interpolate(frame, [E.flipFrame, E.flipFrame + 24], [0, 180], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const lift = Math.sin((flip / 180) * Math.PI);
  return (
    <div style={{ position: "absolute", left: 540, top: STACK_Y, perspective: 2400 }}>
      <div style={{ position: "absolute", left: -470, top: FRONT_H / 2 - 10, width: 940, height: 90, borderRadius: "50%", background: "rgba(40,30,10,0.34)",
        filter: "blur(38px)", opacity: interpolate(frame, [E.dealFrames[0], E.dealFrames[0] + 12], [0, 1], clamp) }} />
      {DECK.map((file, k) => {
        const t = frame - E.dealFrames[k];
        if (t < 0) return null;
        const hero = k === DECK.length - 1;
        const p = interpolate(t, [0, 10], [0, 1], { ...clamp, easing: out3 });
        const side = random(`side${k}`) > 0.5 ? 1 : -1;
        const restRot = hero ? 0 : (random(`rot${k}`) - 0.5) * 22;
        const restX = hero ? 0 : (random(`dx${k}`) - 0.5) * 90, restY = hero ? 0 : (random(`dy${k}`) - 0.5) * 70;
        const x = interpolate(p, [0, 1], [side * 520, restX]), y = interpolate(p, [0, 1], [1150, restY]);
        const rot = interpolate(p, [0, 1], [side * 34, restRot]);
        const h = hero ? HERO_H : FRONT_H;
        const shadow = "drop-shadow(0 14px 22px rgba(20,14,4,0.34))";
        if (!hero) return <Img key={file} src={staticFile(file)} style={{ position: "absolute", left: -CARD_W / 2, top: -h / 2, width: CARD_W, height: h,
          transform: `translate(${x}px, ${y}px) rotate(${rot}deg)`, filter: shadow }} />;
        return (
          <div key={file} style={{ position: "absolute", left: -CARD_W / 2, top: -h / 2, width: CARD_W, height: h, transformStyle: "preserve-3d",
            transform: `translate(${x}px, ${y - 46 * lift}px) rotate(${rot}deg) scale(${1 + 0.07 * lift}) rotateY(${flip}deg)` }}>
            {flip < 90
              ? <Img src={staticFile(file)} style={{ position: "absolute", inset: 0, width: CARD_W, height: h, filter: shadow }} />
              : <Img src={staticFile("hero_back.png")} style={{ position: "absolute", left: 0, top: (h - BACK_H) / 2, width: CARD_W, height: BACK_H,
                  transform: "rotateY(180deg)", filter: shadow }} />}
          </div>
        );
      })}
    </div>
  );
};

const Paper: React.FC<{ frame: number }> = ({ frame }) => {
  const push = interpolate(frame, [E.flipFrame + 24, END], [1, 1.045], { ...clamp, easing: Easing.inOut(Easing.quad) });
  const underline = interpolate(frame, [E.flipFrame + 30, E.flipFrame + 44], [0, 1], { ...clamp, easing: out3 });
  return (
    <AbsoluteFill style={{ background: "radial-gradient(95% 60% at 50% 36%, #FCFBF7 0%, #EFEDE6 58%, #DEDACD 100%)" }}>
      <AbsoluteFill style={{ transform: `scale(${push})`, transformOrigin: "50% 58%" }}>
        <Words frame={frame} at={QUIET + 6} lines={["Gary did", "the reading."]} out={E.flipFrame - 4} />
        <Words frame={frame} at={E.flipFrame + 8} lines={["And shows", "his work."]} />
        <div style={{ position: "absolute", left: 92, top: 330 + 132 * 2.08 + 4, width: 520 * underline, height: 12, borderRadius: 6, background: GOLD }} />
        <Deck frame={frame} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ── Act 3: the end card ───────────────────────────────────────────────────────
const EndCard: React.FC<{ frame: number }> = ({ frame }) => {
  const t = frame - LOGO;
  const slam = interpolate(t, [0, 5], [1.5, 1], { ...clamp, easing: out3 });
  const on = t >= 0 ? 1 : 0;
  const rise = (at: number) => ({ opacity: interpolate(t, [at, at + 8], [0, 1], clamp),
    transform: `translateY(${interpolate(t, [at, at + 10], [26, 0], { ...clamp, easing: out3 })}px)` });
  return (
    <AbsoluteFill style={{ alignItems: "center" }}>
      <div style={{ marginTop: 470, opacity: on, transform: `scale(${slam})`, filter: `blur(${interpolate(t, [0, 3], [12, 0], clamp)}px)`,
        display: "flex", flexDirection: "column", alignItems: "center" }}>
        <Img src={staticFile("icon.png")} style={{ width: 290, height: 290, borderRadius: 64, boxShadow: "0 0 90px rgba(201,162,39,0.45)" }} />
        <div style={{ fontFamily: "Bebas", fontSize: 210, lineHeight: 1, color: WARM, marginTop: 46, letterSpacing: "0.02em" }}>GARY A.I.</div>
      </div>
      <div style={{ fontFamily: "Bebas", fontSize: 96, lineHeight: 1, marginTop: 14, letterSpacing: "0.03em", ...goldText, ...rise(10) }}>A PICK FOR EVERY GAME.</div>
      <div style={{ marginTop: 92, padding: "30px 76px", borderRadius: 999, background: GOLD, color: INK, fontFamily: "Tight", fontWeight: 700, fontSize: 52,
        letterSpacing: "-0.01em", ...rise(22) }}>Get Gary free</div>
      <div style={{ marginTop: 30, fontFamily: "Tight", fontWeight: 500, fontSize: 34, color: WARM, ...rise(28), opacity: 0.72 * rise(28).opacity }}>On the App Store</div>
      <div style={{ position: "absolute", top: 1490, width: "100%", textAlign: "center", fontFamily: "Tight", fontWeight: 500, fontSize: 25, color: WARM,
        opacity: 0.5 * on }}>21+ | Not a sportsbook | Gambling problem? Call 1-800-GAMBLER</div>
    </AbsoluteFill>
  );
};

// ── The spot ──────────────────────────────────────────────────────────────────
export const Spot: React.FC = () => {
  const frame = useCurrentFrame();
  const hit = Math.max(...HITS.map((h) => pulse(frame, h)));
  const act1 = frame < CUT;
  const end = frame >= END;
  const stomps = Math.max(pulse(frame, END, 4), pulse(frame, END + 8, 4), pulse(frame, LOGO, 9), pulse(frame, LOGO + 30, 6) * 0.4, pulse(frame, LOGO + 60, 6) * 0.3);
  const power = act1
    ? Math.min(1.25, 0.62 + 0.5 * hit + (frame >= 150 ? 0.16 : 0))
    : end ? (frame < LOGO ? 0.12 + 0.5 * stomps : 0.6 + 0.45 * stomps) : 0;
  const shake = act1 || end ? (act1 ? hit : pulse(frame, LOGO, 4)) * 13 : 0;
  const sx = (random(`sx${frame}`) - 0.5) * 2 * shake, sy = (random(`sy${frame}`) - 0.5) * 2 * shake;
  const paperIn = interpolate(frame, [QUIET - 8, QUIET + 4], [0, 1], clamp);
  return (
    <AbsoluteFill style={{ background: NIGHT }}>
      <Audio src={staticFile("score.wav")} />
      {(act1 || end) && (
        <AbsoluteFill style={{ transform: `translate(${sx}px, ${sy}px) scale(1.02)` }}>
          <Stadium frame={frame} power={power} />
          {frame < 45 && <Opening frame={frame} />}
          {WINDOWS.map((w) => frame >= w.at && frame < w.until && <Slate key={w.at} frame={frame} w={w} />)}
          <Count frame={frame} at={240} until={263} n="13" words="NFL GAMES." />
          <Count frame={frame} at={263} until={CUT} n="2" words="PLAYOFF GAMES." />
          {end && <EndCard frame={frame} />}
          <AbsoluteFill style={{ background: "#FFF6D8", opacity: (act1 ? hit : pulse(frame, LOGO, 3)) * 0.42, mixBlendMode: "screen" }} />
        </AbsoluteFill>
      )}
      {frame >= CUT && frame < QUIET + 4 && (
        <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", opacity: interpolate(frame, [QUIET - 12, QUIET - 4], [1, 0], clamp) }}>
          <div style={{ fontFamily: "Tight", fontWeight: 600, fontSize: 100, letterSpacing: "-0.02em", color: WARM, marginTop: -120 }}>One of you.</div>
        </AbsoluteFill>
      )}
      {frame >= QUIET - 8 && frame < END && (
        <AbsoluteFill style={{ opacity: paperIn }}><Paper frame={frame} /></AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};
