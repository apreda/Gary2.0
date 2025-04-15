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
    
    // Schedule picks generation daily at 1:54 PM EST
    const today = new Date();
    const targetTime = new Date();
    targetTime.setHours(13, 54, 0, 0); // 1:54 PM EST
    
    // Log current time and target time for debugging
    console.log('Current time:', now.toLocaleTimeString());
    console.log('Target time:', targetTime.toLocaleTimeString());
    console.log('Last generation time:', lastGen.toLocaleTimeString());
    
    // Get current hours and minutes for a direct comparison
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    
    // Check if it's after 1:54 PM - inclusive of 1:54 PM exactly
    const isAfterTargetTime = (currentHour > 13 || (currentHour === 13 && currentMinute >= 54));
    
    // Get the last generation hour and minute
    const lastGenHour = lastGen.getHours();
    const lastGenMinute = lastGen.getMinutes();
    
    // Check if last generation was before 1:54 PM today
    const lastGenBeforeTarget = lastGen.getDate() !== today.getDate() || 
                               (lastGenHour < 13 || (lastGenHour === 13 && lastGenMinute < 54));
    
    console.log('Is after target time?', isAfterTargetTime);
    console.log('Was last gen before target?', lastGenBeforeTarget);
    
    // If it's past 10:00 AM EST and we haven't generated picks since then, do it
    if (isAfterTargetTime && lastGenBeforeTarget) {
      console.log('Standard schedule: Generating new picks at 1:54 PM EST');
      return true;
    }
    
    // Normal rule: check if it's a new day and after 1:54pm EST
    const isNewDay = lastGen.getDate() !== now.getDate() || 
                     lastGen.getMonth() !== now.getMonth() || 
                     lastGen.getFullYear() !== now.getFullYear();
    const isAfter154PM = now.getHours() > 13 || (now.getHours() === 13 && now.getMinutes() >= 54); // 1:54 PM EST
    
    return isNewDay && isAfter154PM;
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
    // Always returns the standard 1:54 PM schedule
    return "1:54 PM";
  },
  
  /**
   * Check when next picks will be available
   * @returns {Object} - Information about next pick generation
   */
  getNextPicksInfo: () => {
    const now = new Date();
    
    // Using standard 1:54 PM schedule
    let todayTargetTime = new Date(now);
    todayTargetTime.setHours(13, 54, 0, 0); // 1:54 PM
    
    // If it's before the target time today, next picks are at the target time today
    // If it's after the target time today, next picks are at 10am tomorrow
    let nextPicksTime;
    if (now < todayTargetTime) {
      nextPicksTime = todayTargetTime;
    } else {
      const tomorrow10AM = new Date(now);
      tomorrow10AM.setDate(tomorrow10AM.getDate() + 1);
      tomorrow10AM.setHours(13, 54, 0, 0); // Always 1:54pm for future days
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
