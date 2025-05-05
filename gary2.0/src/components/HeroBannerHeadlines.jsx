import { headlines } from "../data/headlines";
import { motion } from "framer-motion";
import { useMemo } from "react";
import "../styles/newspaper.css";

const BANNER_HEIGHT = 600; // px - increased height to match hero
const SPEED_BASE = 110;   // seconds for full traverse - slowed down significantly
const VISIBLE_HEADLINES = 5; // reduced to 5 visible headlines
const HEADLINE_HEIGHT = 40; // height of each headline for spacing
const TOTAL_HEADLINES = 8; // total headlines that will be on rotation

export default function HeroBannerHeadlines() {
  // Prepare headlines with random distribution and varying starting positions
  const randomized = useMemo(() => {
    // Shuffle the headlines array
    const shuffled = [...headlines].sort(() => Math.random() - 0.5);
    
    // Take more headlines than we'll initially show
    const selected = shuffled.slice(0, TOTAL_HEADLINES);
    
    // Create evenly spaced positions for headlines to prevent overlap
    // Specifically ensure coverage of full banner including bottom section
    const positions = [];
    
    // Calculate evenly distributed positions with slight randomness
    const segmentHeight = BANNER_HEIGHT / VISIBLE_HEADLINES;
    
    for (let i = 0; i < VISIBLE_HEADLINES; i++) {
      // Calculate base position for this segment
      const basePosition = i * segmentHeight;
      
      // Add randomness within the segment, but not too much to prevent overlap
      // Stay within the segment bounds with a margin
      const margin = segmentHeight * 0.2; // 20% margin within segment
      const randomOffset = Math.random() * (segmentHeight - (2 * margin)) + margin;
      
      positions.push(basePosition + randomOffset);
    }
    
    // Shuffle positions to randomize which headlines go where
    const shuffledPositions = [...positions].sort(() => Math.random() - 0.5);
    
    // Return headlines with calculated positions and timing
    return selected.map((h, index) => {
      // Assign position, ensuring the last headline is at the bottom
      let top;
      
      if (index === selected.length - 1 && index >= VISIBLE_HEADLINES) {
        // Force the last headline to be at the bottom
        top = BANNER_HEIGHT - HEADLINE_HEIGHT - 20; // 20px from bottom
      } else if (index < shuffledPositions.length) {
        // Use pre-calculated position
        top = shuffledPositions[index];
      } else {
        // For any extra headlines, place randomly but avoid collision
        // This ensures we have some headlines at the bottom
        top = (BANNER_HEIGHT * 0.6) + (Math.random() * (BANNER_HEIGHT * 0.4 - HEADLINE_HEIGHT));
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
    <section className="relative w-full overflow-hidden bg-black" aria-hidden="true">
      <div className="relative h-full" style={{ height: `${BANNER_HEIGHT}px` }}>
        {randomized.map((h, i) => (
          <motion.div
            key={i}
            // Start positioned randomly within the visible area
            initial={{ 
              x: `${-50 + Math.random() * 100}vw`,
              opacity: h.initiallyVisible ? 1 : 0 
            }}
            // Animate to the end position
            animate={{ 
              x: h.startFromRight ? "-150vw" : "150vw",
              opacity: 1 
            }}
            transition={{
              repeat: Infinity,
              ease: "linear",
              duration: h.dur,
              // Start the animation from initial progress point to create
              // the impression of continuous movement
              repeatDelay: 0,
              // Important: this makes it look like animation was already happening
              progress: h.initialProgress,
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
