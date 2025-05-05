import { headlines } from "../data/headlines";
import { motion } from "framer-motion";
import { useMemo } from "react";
import "../styles/newspaper.css";

const BANNER_HEIGHT = 600; // px - increased height to match hero
const SPEED_BASE = 80;   // seconds for full traverse - slowed down more
const VISIBLE_HEADLINES = 8; // further reduced number of initial headlines visible
const TOTAL_HEADLINES = 12; // total headlines that will be on rotation

export default function HeroBannerHeadlines() {
  // Prepare headlines with random distribution and varying starting positions
  const randomized = useMemo(() => {
    // Shuffle the headlines array
    const shuffled = [...headlines].sort(() => Math.random() - 0.5);
    
    // Take more headlines than we'll initially show
    const selected = shuffled.slice(0, TOTAL_HEADLINES);
    
    // Create vertical zones to ensure coverage of entire banner
    // Include specific zones for top, middle, and bottom areas
    const verticalZones = [
      [0, BANNER_HEIGHT * 0.2],          // Top zone
      [BANNER_HEIGHT * 0.2, BANNER_HEIGHT * 0.4],  // Upper middle
      [BANNER_HEIGHT * 0.4, BANNER_HEIGHT * 0.6],  // Middle
      [BANNER_HEIGHT * 0.6, BANNER_HEIGHT * 0.8],  // Lower middle
      [BANNER_HEIGHT * 0.8, BANNER_HEIGHT]         // Bottom zone
    ];
    
    // Return headlines with randomized positions and timing
    return selected.map((h, index) => {
      // Determine which vertical zone this headline belongs to
      // Distribute across zones to ensure coverage
      const zoneIndex = index % verticalZones.length;
      const [minY, maxY] = verticalZones[zoneIndex];
      
      // Random positioning within its assigned zone
      const top = minY + Math.random() * (maxY - minY);
      
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
        // More variance in duration for a natural feel
        dur: SPEED_BASE + (Math.random() * 40), 
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
