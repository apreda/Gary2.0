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
    
    // Schedule picks generation daily at 9:32 AM EST
    const today = new Date();
    const targetTime = new Date();
    targetTime.setHours(9, 32, 0, 0); // 9:32 AM EST
    
    // Log current time and target time for debugging
    console.log('Current time:', now.toLocaleTimeString());
    console.log('Target time:', targetTime.toLocaleTimeString());
    console.log('Last generation time:', lastGen.toLocaleTimeString());
    
    // Get current hours and minutes for a direct comparison
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    
    // Check if it's after 9:32 AM - inclusive of 9:32 AM exactly
    const isAfterTargetTime = (currentHour > 9 || (currentHour === 9 && currentMinute >= 32));
    
    // Get the last generation hour and minute
    const lastGenHour = lastGen.getHours();
    const lastGenMinute = lastGen.getMinutes();
    
    // Check if last generation was before 10:00 AM today
    const lastGenBeforeTarget = lastGen.getDate() !== today.getDate() || 
                               (lastGenHour < 10 || (lastGenHour === 10 && lastGenMinute < 0));
    
    console.log('Is after target time?', isAfterTargetTime);
    console.log('Was last gen before target?', lastGenBeforeTarget);
    
    // If it's past 10:00 AM EST and we haven't generated picks since then, do it
    if (isAfterTargetTime && lastGenBeforeTarget) {
      console.log('Standard schedule: Generating new picks at 10:00 AM EST');
      return true;
    }
    
    // Normal rule: check if it's a new day and after 10am EST
    const isNewDay = lastGen.getDate() !== now.getDate() || 
                     lastGen.getMonth() !== now.getMonth() || 
                     lastGen.getFullYear() !== now.getFullYear();
    const isAfter10AM = now.getHours() >= 10; // 10:00 AM EST
    
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
    // Always returns the standard 10:00 AM schedule
    return "10:00 AM";
    
    return "10:00 AM";
  },
  
  /**
   * Check when next picks will be available
   * @returns {Object} - Information about next pick generation
   */
  getNextPicksInfo: () => {
    const now = new Date();
    
    // Using standard 10:00 AM schedule
    let todayTargetTime = new Date(now);
    todayTargetTime.setHours(10, 0, 0, 0); // 10:00 AM
    
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
