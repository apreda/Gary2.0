import { headlines } from "../data/headlines";
import { motion } from "framer-motion";
import { useMemo } from "react";
import "../styles/newspaper.css";

const BANNER_HEIGHT = 1000; // px - increased height to cover full hero section
const SPEED_BASE = 140;   // seconds for full traverse - slower for better readability
const VISIBLE_HEADLINES = 12; // increased to cover the entire hero height
const HEADLINE_HEIGHT = 60; // height of each headline lane including spacing
const TOTAL_HEADLINES = 16; // total headlines that will be on rotation

// Colors that match the screenshot (dark charcoal and gold/amber)
const GOLD_COLOR = "#b8953f"; // From the screenshot's coins and highlights
const DARK_GRAY = "#1e1e1e"; // From the screenshot's background

export default function HeroBannerHeadlines() {
  // Prepare headlines with exactly one headline per lane (no overlap)
  const randomized = useMemo(() => {
    // Shuffle the headlines array to get variety
    const shuffled = [...headlines].sort(() => Math.random() - 0.5);
    
    // Only use exactly one headline per lane - take only as many as we have visible lanes
    const selected = shuffled.slice(0, VISIBLE_HEADLINES);
    
    // Create fixed, evenly spaced lanes for headlines
    const positions = [];
    const laneHeight = BANNER_HEIGHT / VISIBLE_HEADLINES;
    
    // Create exactly 12 evenly spaced lanes
    for (let i = 0; i < VISIBLE_HEADLINES; i++) {
      // Calculate precise position for this lane
      const lanePosition = i * laneHeight + (laneHeight / 2) - (HEADLINE_HEIGHT / 2);
      positions.push(lanePosition);
    }
    
    // Return one headline per lane with alternating directions
    return selected.map((h, index) => {
      // Get the exact vertical position for this lane
      const top = positions[index];
      
      // Alternate starting directions (left vs right)
      const startFromRight = index % 2 === 0;
      
      // Stagger initial positions within lane to create natural appearance
      // Different starting progress to avoid all headlines appearing at once
      const initialProgress = (index * 0.08) % 1.0;
      
      // Vary speed slightly for more natural movement
      const speedVariance = 20 + (index * 7);
      const duration = SPEED_BASE + speedVariance;
      
      return {
        ...h,
        top,
        startFromRight,
        dur: duration,
        initialProgress,
        initiallyVisible: true
      };
    });
  }, []);

  return (
    <section className="relative w-full overflow-visible bg-transparent" aria-hidden="true">
      <div className="relative h-full overflow-visible" style={{ height: `${BANNER_HEIGHT}px` }}>
        {randomized.map((h, i) => (
          <motion.div
            key={i}
            // Start positioned in the middle of the screen
            initial={{ 
              x: 0, 
              opacity: 1
            }}
            // Animate to the opposite edge based on direction
            animate={{ 
              x: h.startFromRight ? "-130vw" : "130vw",
              opacity: 1 
            }}
            transition={{
              repeat: Infinity,
              ease: "linear",
              duration: h.dur,
              repeatDelay: 0,
              // No initial progress - headlines start from visible position
              delay: 2 // Short delay before movement starts
            }}
            className="banner-headline absolute whitespace-nowrap"
            style={{ top: h.top }}
          >
            {/* Simplified container without backgrounds */}
            <div className="headline-container">
              <span className="headline-text">
                {h.text}
              </span>
              {h.sub && (
                <span className="headline-subtext">
                  {h.sub}
                </span>
              )}
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
