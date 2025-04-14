import { picksService } from './picksService';

/**
 * Service for scheduling daily pick generation
 */
export const schedulerService = {
  /**
   * Check if new picks should be generated
   * @returns {boolean} - Whether new picks should be generated
   */
  shouldGenerateNewPicks: () => {
    const lastGenerationTime = localStorage.getItem('lastPicksGenerationTime');
    
    if (!lastGenerationTime) {
      return true; // No picks have been generated yet
    }
    
    const lastGen = new Date(lastGenerationTime);
    const now = new Date();
    
    // SPECIAL TEST: Force generation at 6:35pm on April 14, 2025
    // Create a more explicit time check for the test
    const today = new Date();
    const targetTime = new Date();
    targetTime.setHours(18, 35, 0, 0); // 6:35 PM
    
    // Log current time and target time for debugging
    console.log('Current time:', now.toLocaleTimeString());
    console.log('Target time:', targetTime.toLocaleTimeString());
    console.log('Last generation time:', lastGen.toLocaleTimeString());
    
    // Get current hours and minutes for a direct comparison
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    
    // Check if it's after 6:35 PM today (18:35) - inclusive of 6:35pm exactly
    const isAfterTargetTime = (currentHour > 18 || (currentHour === 18 && currentMinute >= 35));
    
    // Get the last generation hour and minute
    const lastGenHour = lastGen.getHours();
    const lastGenMinute = lastGen.getMinutes();
    
    // Check if last generation was before 6:35 PM today
    const lastGenBeforeTarget = lastGen.getDate() !== today.getDate() || 
                               (lastGenHour < 18 || (lastGenHour === 18 && lastGenMinute < 35));
    
    console.log('Is after target time?', isAfterTargetTime);
    console.log('Was last gen before target?', lastGenBeforeTarget);
    
    // If it's past 6:35 PM and we haven't generated picks since then, do it
    if (isAfterTargetTime && lastGenBeforeTarget) {
      console.log('TEST MODE: Generating new picks at 6:35 PM');
      return true;
    }
    
    // Normal rule: check if it's a new day and after 10am
    const isNewDay = lastGen.getDate() !== now.getDate() || 
                     lastGen.getMonth() !== now.getMonth() || 
                     lastGen.getFullYear() !== now.getFullYear();
    const isAfter10AM = now.getHours() >= 10;
    
    return isNewDay && isAfter10AM;
  },
  
  /**
   * Mark picks as generated for today
   */
  markPicksAsGenerated: () => {
    localStorage.setItem('lastPicksGenerationTime', new Date().toISOString());
  },
  
  /**
   * Get scheduled generation time
   * @returns {string} - The scheduled time for new picks (e.g., "10:00 AM")
   */
  getScheduledTime: () => {
    // SPECIAL TEST: For today only, return 6:35 PM
    const now = new Date();
    const isTestDay = now.getDate() === 14 && now.getMonth() === 3; // April 14 (0-indexed months)
    
    if (isTestDay) {
      return "6:35 PM";
    }
    
    return "10:00 AM";
  },
  
  /**
   * Check when next picks will be available
   * @returns {Object} - Information about next pick generation
   */
  getNextPicksInfo: () => {
    const now = new Date();
    
    // SPECIAL TEST: For April 14, use 6:35 PM instead of 10 AM
    const isTestDay = now.getDate() === 14 && now.getMonth() === 3; // April 14 (0-indexed months)
    
    let todayTargetTime;
    if (isTestDay) {
      todayTargetTime = new Date(now);
      todayTargetTime.setHours(18, 35, 0, 0); // 6:35 PM
    } else {
      todayTargetTime = new Date(now);
      todayTargetTime.setHours(10, 0, 0, 0); // 10:00 AM (normal schedule)
    }
    
    // If it's before the target time today, next picks are at the target time today
    // If it's after the target time today, next picks are at 10am tomorrow
    let nextPicksTime;
    if (now < todayTargetTime) {
      nextPicksTime = todayTargetTime;
    } else {
      const tomorrow10AM = new Date(now);
      tomorrow10AM.setDate(tomorrow10AM.getDate() + 1);
      tomorrow10AM.setHours(10, 0, 0, 0); // Always 10am for future days
      nextPicksTime = tomorrow10AM;
    }
    
    return {
      nextPicksTime,
      formattedTime: nextPicksTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      formattedDate: nextPicksTime.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }),
      isToday: nextPicksTime.getDate() === now.getDate(),
      isTomorrow: nextPicksTime.getDate() === now.getDate() + 1
    };
  }
};
