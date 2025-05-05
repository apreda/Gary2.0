import { headlines } from "../data/headlines";
import { motion } from "framer-motion";
import { useMemo } from "react";
import "../styles/newspaper.css";

const BANNER_HEIGHT = 1000; // px - increased height to cover full hero section
const SPEED_BASE = 140;   // seconds for full traverse - slower for better readability
const VISIBLE_HEADLINES = 12; // increased to cover the entire hero height
const HEADLINE_HEIGHT = 60; // height of each headline lane including spacing
const TOTAL_HEADLINES = 16; // total headlines that will be on rotation

export default function HeroBannerHeadlines() {
  // Prepare headlines with properly staggered animations to prevent overlap
  const randomized = useMemo(() => {
    // Shuffle the headlines array
    const shuffled = [...headlines].sort(() => Math.random() - 0.5);
    
    // Take more headlines than we'll initially show
    const selected = shuffled.slice(0, TOTAL_HEADLINES);
    
    // Assign each headline to its own specific lane with precise vertical positioning
    const positions = [];
    
    // Create evenly spaced lane positions with exact spacing
    const laneHeight = BANNER_HEIGHT / VISIBLE_HEADLINES;
    
    for (let i = 0; i < VISIBLE_HEADLINES; i++) {
      // Calculate exact position for this lane
      const lanePosition = i * laneHeight + (laneHeight / 2) - (HEADLINE_HEIGHT / 2);
      positions.push(lanePosition);
    }
    
    // Return headlines with calculated positions and carefully staggered timing
    return selected.map((h, index) => {
      // Assign vertical position with even distribution
      const laneIndex = index % VISIBLE_HEADLINES;
      const top = positions[laneIndex];
      
      // Carefully staggered starting positions
      // Headlines in the same lane will start from opposite sides and at different positions
      // This ensures they won't overlap during animation
      const startFromRight = index % 2 === 0;
      
      // Calculate horizontal staggering to prevent overlap
      // Headlines in the same lane need to be separated in time/space
      // We create a unique position for each headline within its lane
      const laneGroup = Math.floor(index / VISIBLE_HEADLINES);
      
      // This staggers headlines in the same lane to start at different positions
      // The modulo math ensures that headlines in the same lane are maximally separated
      const initialProgress = ((laneIndex * 0.07) + (laneGroup * 0.33)) % 1.0;
      
      // Slightly vary speed for more natural movement
      // We avoid making headlines in the same lane have similar speeds
      const speedVariance = 30 + (laneIndex * 5) + (laneGroup * 15);
      const duration = SPEED_BASE + speedVariance;
      
      return {
        ...h,
        top,
        startFromRight,
        dur: duration,
        initialProgress,
        initiallyVisible: true // Make all headlines initially visible for better distribution
      };
    });
  }, []);

  return (
    <section className="relative w-full overflow-visible bg-transparent" aria-hidden="true">
      <div className="relative h-full overflow-visible" style={{ height: `${BANNER_HEIGHT}px` }}>
        {randomized.map((h, i) => (
          <motion.div
            key={i}
            // Start positioned well off-screen to prevent visible jumps
            initial={{ 
              x: h.startFromRight ? "130vw" : "-130vw", 
              opacity: 1
            }}
            // Animate to the opposite edge
            animate={{ 
              x: h.startFromRight ? "-130vw" : "130vw",
              opacity: 1 
            }}
            transition={{
              repeat: Infinity,
              ease: "linear",
              duration: h.dur,
              repeatDelay: 0,
              progress: h.initialProgress,
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
