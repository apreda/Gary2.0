"use client";

import { useEffect, useRef } from "react";
import type { GaryMood } from "@/lib/gary/winners-recap";
import { webAppStorePath } from "@/lib/gary/app-store";
import { logAppStoreHandoff } from "@/lib/gary/analytics";

// Gary's face for last night (the app's morning recap art) and the weather
// that comes with it, drawn on a canvas behind the whole hero: rain for a
// bad night, snow when it's cold, bubbles over a beer, steam when he's
// cooking, embers when he's on fire. Stills for reduced motion.

type Kind = "rain" | "snow" | "bubbles" | "steam" | "embers";
const KIND: Record<GaryMood, Kind> = {
  doomsday: "rain",
  icecold: "snow",
  beer: "bubbles",
  cooking: "steam",
  fire: "embers",
};
const COUNT: Record<Kind, number> = { rain: 150, snow: 130, embers: 90, bubbles: 70, steam: 26 };

interface Particle {
  x: number; y: number; vx: number; vy: number;
  s: number; a: number; l: number; life: number; ph: number;
}

export function NightFace({ mood, alt }: { mood: GaryMood | null; alt: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const face = useRef<HTMLDivElement>(null);
  const img = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const cv = canvas.current, fc = face.current, im = img.current;
    const hero = cv?.closest<HTMLElement>(".night-hero");
    if (!cv || !fc || !im || !hero || !mood) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const cx = cv.getContext("2d");
    if (!cx) return;
    const kind = KIND[mood];
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);
    let W = 0, H = 0, raf = 0, parts: Particle[] = [];
    const origin = () => {
      const f = fc.getBoundingClientRect(), h = hero.getBoundingClientRect();
      return { x: f.left - h.left + f.width / 2, y: f.top - h.top + f.height / 2, r: f.width / 2 };
    };
    const spawn = (fresh: boolean): Particle => {
      const o = origin();
      const p: Particle = { x: 0, y: 0, vx: 0, vy: 0, s: 0, a: 0, l: 0, life: 1, ph: rnd(0, 6) };
      if (kind === "rain") Object.assign(p, { x: rnd(0, W), y: fresh ? rnd(-H, H) : rnd(-80, -10), vy: rnd(9, 14), vx: -1.6, l: rnd(14, 26), a: rnd(0.1, 0.28) });
      else if (kind === "snow") Object.assign(p, { x: rnd(0, W), y: fresh ? rnd(-H, H) : -10, vy: rnd(0.5, 1.4), vx: rnd(-0.3, 0.3), s: rnd(1.2, 3.2), a: rnd(0.35, 0.85) });
      else if (kind === "embers") Object.assign(p, { x: o.x + rnd(-o.r, o.r), y: o.y + rnd(0, o.r) + (fresh ? rnd(-o.r * 2, 0) : 0), vy: rnd(-1.8, -0.7), vx: rnd(-0.4, 0.4), s: rnd(1.2, 3), life: rnd(0.6, 1) });
      else if (kind === "bubbles") Object.assign(p, { x: o.x + rnd(-o.r * 1.4, o.r * 1.4), y: fresh ? rnd(0, H) : H + 10, vy: rnd(-1.1, -0.4), s: rnd(2, 7), a: rnd(0.25, 0.6) });
      else Object.assign(p, { x: o.x + rnd(-o.r * 0.8, o.r * 0.8), y: o.y + rnd(-o.r * 0.2, o.r * 0.4) + (fresh ? rnd(-o.r, 0) : 0), vy: rnd(-0.7, -0.35), vx: rnd(-0.15, 0.15), s: rnd(18, 34), a: rnd(0.05, 0.11) });
      return p;
    };
    const size = () => {
      const d = Math.min(2, devicePixelRatio || 1);
      W = cv.clientWidth; H = cv.clientHeight;
      cv.width = W * d; cv.height = H * d;
      cx.setTransform(d, 0, 0, d, 0, 0);
      parts = Array.from({ length: COUNT[kind] }, () => spawn(true));
    };
    const tick = (t: number) => {
      cx.clearRect(0, 0, W, H);
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        p.ph += 0.03;
        p.x += p.vx + (kind === "snow" || kind === "bubbles" ? Math.sin(p.ph) * 0.4 : 0);
        p.y += p.vy;
        let dead = false;
        if (kind === "rain") {
          cx.strokeStyle = `rgba(190,200,220,${p.a})`; cx.lineWidth = 1;
          cx.beginPath(); cx.moveTo(p.x, p.y); cx.lineTo(p.x + p.vx * 2, p.y + p.l); cx.stroke();
          dead = p.y > H;
        } else if (kind === "snow") {
          cx.fillStyle = `rgba(235,242,255,${p.a})`; cx.beginPath(); cx.arc(p.x, p.y, p.s, 0, 7); cx.fill();
          dead = p.y > H;
        } else if (kind === "embers") {
          p.life -= 0.006;
          const a = Math.max(0, p.life) * (0.6 + 0.4 * Math.sin(p.ph * 3));
          cx.fillStyle = `rgba(255,${150 + Math.round(70 * p.life)},60,${a})`;
          cx.shadowColor = "rgba(255,140,40,.9)"; cx.shadowBlur = 8;
          cx.beginPath(); cx.arc(p.x, p.y, p.s, 0, 7); cx.fill(); cx.shadowBlur = 0;
          dead = p.life <= 0 || p.y < 0;
        } else if (kind === "bubbles") {
          cx.strokeStyle = `rgba(214,170,50,${p.a})`; cx.lineWidth = 1.2;
          cx.beginPath(); cx.arc(p.x, p.y, p.s, 0, 7); cx.stroke();
          dead = p.y < -10;
        } else {
          p.life -= 0.004; p.s += 0.25;
          const g = cx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.s);
          g.addColorStop(0, `rgba(255,248,235,${p.a * Math.max(0, p.life)})`);
          g.addColorStop(1, "rgba(255,248,235,0)");
          cx.fillStyle = g; cx.beginPath(); cx.arc(p.x, p.y, p.s, 0, 7); cx.fill();
          dead = p.life <= 0;
        }
        if (dead) parts[i] = spawn(false);
      }
      im.style.setProperty("--bob", `${(Math.sin(t / 900) * 6).toFixed(2)}px`);
      raf = requestAnimationFrame(tick);
    };
    const tilt = (e: PointerEvent) => {
      const f = fc.getBoundingClientRect();
      im.style.setProperty("--tilt", `${(((e.clientX - (f.left + f.width / 2)) / innerWidth) * 10).toFixed(2)}deg`);
    };
    const observer = new ResizeObserver(size);
    observer.observe(hero);
    hero.addEventListener("pointermove", tilt);
    size();
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      hero.removeEventListener("pointermove", tilt);
    };
  }, [mood]);

  return (
    <>
      <canvas ref={canvas} className="night-fx" aria-hidden="true" />
      <div ref={face} className="night-face">
        {/* eslint-disable-next-line @next/next/no-img-element -- animated per frame */}
        <img ref={img} src={mood ? `/site/hero/mood-${mood}.webp` : "/site/gary-current.png"} alt={alt} width={480} height={480} />
      </div>
    </>
  );
}

/** The app icon as it sits on a home screen: the way to the App Store, without words. */
export function AppIconLink({ surface }: { surface: string }) {
  return (
    <a
      className="night-app-icon"
      href={webAppStorePath(surface)}
      onClick={() => logAppStoreHandoff(surface)}
      aria-label="Get Gary on the App Store"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- a fixed 84 point tile */}
      <img src="/site/hero/app-icon.png" alt="" width={180} height={180} />
    </a>
  );
}
