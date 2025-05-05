import { headlines } from "../data/headlines";
import { motion } from "framer-motion";
import { useMemo } from "react";
import "../styles/newspaper.css";

const BANNER_HEIGHT = 320; // px – tune to your layout
const SPEED_BASE = 40;   // seconds for full traverse

export default function HeroBannerHeadlines() {
  // lock random positions on first render
  const randomized = useMemo(() =>
    headlines.map(h => ({
      ...h,
      top: Math.random() * (BANNER_HEIGHT - 40),   // 40 = headline line‑height
      dur: SPEED_BASE + Math.random() * 15,        // slight speed variance
      delay: Math.random() * -SPEED_BASE           // desync starting points
    })), []);

  return (
    <section className="relative w-full overflow-hidden bg-black" aria-hidden="true">
      <div className="relative h-[320px]">
        {randomized.map((h, i) => (
          <motion.div
            key={i}
            initial={{ x: "100vw" }}
            animate={{ x: "-100vw" }}
            transition={{
              repeat: Infinity,
              ease: "linear",
              duration: h.dur,
              delay: h.delay,
            }}
            className="banner-headline absolute whitespace-nowrap"
            style={{ top: h.top }}
          >
            <span className="text-2xl md:text-2xl font-bold tracking-tight font-serif">
              {h.text}
            </span>
            {h.sub && (
              <span className="ml-4 text-sm md:text-base italic opacity-70 font-serif">
                {h.sub}
              </span>
            )}
          </motion.div>
        ))}
      </div>
    </section>
  );
}
