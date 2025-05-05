import { headlines } from "../data/headlines";
import { motion } from "framer-motion";
import { useMemo } from "react";
import "../styles/newspaper.css";

const BANNER_HEIGHT = 600; // px - increased height to match hero
const SPEED_BASE = 70;   // seconds for full traverse - slowed down
const VISIBLE_HEADLINES = 10; // reduced number of headlines visible at once

export default function HeroBannerHeadlines() {
  // Prepare a subset of headlines with even vertical distribution
  const randomized = useMemo(() => {
    // Shuffle the headlines array
    const shuffled = [...headlines].sort(() => Math.random() - 0.5);
    
    // Take only the number we want to show
    const selected = shuffled.slice(0, VISIBLE_HEADLINES);
    
    // Calculate section height for even distribution
    const sectionHeight = BANNER_HEIGHT / VISIBLE_HEADLINES;
    
    // Return headlines with calculated positions
    return selected.map((h, index) => ({
      ...h,
      // Position within its vertical section plus a small random offset
      top: (index * sectionHeight) + (Math.random() * 40 - 20),
      // More variance in duration for a natural feel
      dur: SPEED_BASE + (Math.random() * 30),
      // Staggered delays so they don't all move at once
      delay: (Math.random() * SPEED_BASE * 0.5) - (SPEED_BASE * 0.25)
    }));
  }, []);

  return (
    <section className="relative w-full overflow-hidden bg-black" aria-hidden="true">
      <div className="relative h-full" style={{ height: `${BANNER_HEIGHT}px` }}>
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
