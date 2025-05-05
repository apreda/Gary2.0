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
  // Prepare headlines with evenly spaced lanes across the entire hero section
  const randomized = useMemo(() => {
    // Shuffle the headlines array
    const shuffled = [...headlines].sort(() => Math.random() - 0.5);
    
    // Take more headlines than we'll initially show
    const selected = shuffled.slice(0, TOTAL_HEADLINES);
    
    // Assign each headline to its own specific lane with precise vertical positioning
    // This creates the newspaper-style columns across the full height
    const positions = [];
    
    // Create evenly spaced lane positions with exact spacing
    // These are not randomized to ensure no overlapping occurs
    const laneHeight = BANNER_HEIGHT / VISIBLE_HEADLINES;
    
    for (let i = 0; i < VISIBLE_HEADLINES; i++) {
      // Calculate exact position for this lane
      const lanePosition = i * laneHeight + (laneHeight / 2) - (HEADLINE_HEIGHT / 2);
      positions.push(lanePosition);
    }
    
    // Return headlines with calculated positions and timing
    return selected.map((h, index) => {
      // Assign position with even distribution
      let top;
      
      // Ensure we have headlines at all parts of the page, especially at the bottom
      if (index < VISIBLE_HEADLINES) {
        // Assign this headline to one of our calculated lane positions
        top = positions[index];
      } else {
        // For additional headlines (when we rotate), distribute them across the full height
        // Ensure coverage of bottom area as well
        top = Math.floor(index % VISIBLE_HEADLINES) * laneHeight + (laneHeight / 2) - (HEADLINE_HEIGHT / 2);
      }
      
      // Alternate starting directions
      // Some headlines start from left, others from right
      const startFromRight = index % 2 === 0;
      
      // Calculate initial progress based on index
      // This makes it appear like the animation was already in progress
      // when the page loaded
      const initialProgress = (index * 0.12) % 1.0; // Staggered starting positions
      
      return {
        ...h,
        top,
        startFromRight,
        // More variance in duration for a natural feel, but overall slower
        dur: SPEED_BASE + (Math.random() * 60), 
        // Staggered delays for continuous movement effect
        // First few headlines are already in motion when component loads
        initialProgress,
        // Whether this headline should be initially visible
        initiallyVisible: index < VISIBLE_HEADLINES
      };
    });
  }, []);

  return (
    <section className="relative w-full overflow-visible bg-transparent" aria-hidden="true">
      <div className="relative h-full overflow-visible" style={{ height: `${BANNER_HEIGHT}px` }}>
        {randomized.map((h, i) => (
          <motion.div
            key={i}
            // Start positioned at the edge of the screen
            initial={{ 
              x: h.startFromRight ? "120vw" : "-120vw",
              opacity: h.initiallyVisible ? 1 : 0 
            }}
            // Animate to the opposite edge
            animate={{ 
              x: h.startFromRight ? "-120vw" : "120vw",
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
            <div className="headline-container">
              <span className="headline-text text-2xl md:text-2xl font-bold tracking-tight font-serif">
                {h.text}
              </span>
              {h.sub && (
                <span className="headline-subtext ml-4 text-sm md:text-base italic opacity-70 font-serif">
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
