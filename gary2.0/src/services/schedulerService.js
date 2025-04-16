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
    
    // Schedule picks generation daily at 8:51 AM today (April 16, 2025), otherwise 10:00 AM
    const today = new Date();
    const targetTime = new Date();
    
    // Special case for April 16, 2025 - generate at 5:37 PM
    const isApril16_2025 = today.getDate() === 16 && today.getMonth() === 3 && today.getFullYear() === 2025;
    
    if (isApril16_2025) {
      targetTime.setHours(18, 11, 0, 0); // 6:11 PM for April 16, 2025
    } else {
      targetTime.setHours(10, 0, 0, 0); // 10:00 AM EST for all other days
    }
    
    // Log current time and target time for debugging
    console.log('Current time:', now.toLocaleTimeString());
    console.log('Target time:', targetTime.toLocaleTimeString());
    console.log('Last generation time:', lastGen.toLocaleTimeString());
    
    // Get current hours and minutes for a direct comparison
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    
    // Check if it's after target time (2:35 PM on April 16, 2025 or 10:00 AM on other days)
    let isAfterTargetTime;
    if (isApril16_2025) {
      isAfterTargetTime = (currentHour > 18 || (currentHour === 18 && currentMinute >= 11));
    } else {
      isAfterTargetTime = (currentHour > 10 || (currentHour === 10 && currentMinute >= 0));
    }
    
    // Get the last generation hour and minute
    const lastGenHour = lastGen.getHours();
    const lastGenMinute = lastGen.getMinutes();
    
    // Check if last generation was before 4:00 PM today
    const lastGenBeforeTarget = lastGen.getDate() !== today.getDate() || lastGenHour < 16;
    
    console.log('Is after target time?', isAfterTargetTime);
    console.log('Was last gen before target?', lastGenBeforeTarget);
    
    // If it's past the target time and we haven't generated picks since then, do it
    if (isAfterTargetTime && lastGenBeforeTarget) {
      console.log(`Generating new picks at ${isApril16_2025 ? '2:35 PM' : '10:00 AM'} EST`);
      return true;
    }
    
    // Normal rule: check if it's a new day and after the target time
    const isNewDay = lastGen.getDate() !== now.getDate() || 
                     lastGen.getMonth() !== now.getMonth() || 
                     lastGen.getFullYear() !== now.getFullYear();
    
    // Check if after target time (2:35 PM on April 16, 2025 or 10:00 AM on other days)
    let isAfterTargetHour;
    if (isApril16_2025) {
      isAfterTargetHour = now.getHours() > 18 || (now.getHours() === 18 && now.getMinutes() >= 11); // 6:11 PM on April 16
    } else {
      isAfterTargetHour = now.getHours() > 10 || (now.getHours() === 10 && now.getMinutes() >= 0); // 10:00 AM EST on other days
    }
    
    return isNewDay && isAfterTargetHour;
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
    // Special case for April 16, 2025
    const today = new Date();
    const isApril16_2025 = today.getDate() === 16 && today.getMonth() === 3 && today.getFullYear() === 2025;
    
    if (isApril16_2025) {
      return "6:11 PM";
    } else {
      return "10:00 AM";
    }
  },
  
  /**
   * Check when next picks will be available
   * @returns {Object} - Information about next pick generation
   */
  getNextPicksInfo: () => {
    const now = new Date();
    
    // Check if it's April 16, 2025 for special schedule
    const isApril16_2025 = now.getDate() === 16 && now.getMonth() === 3 && now.getFullYear() === 2025;
    
    // Set target time based on date
    let todayTargetTime = new Date(now);
    if (isApril16_2025) {
      todayTargetTime.setHours(18, 11, 0, 0); // 6:11 PM on April 16, 2025
    } else {
      todayTargetTime.setHours(10, 0, 0, 0); // 10:00 AM on other days
    }
    
    // If it's before the target time today, next picks are at the target time today
    // If it's after the target time today, next picks are at 10am tomorrow
    let nextPicksTime;
    if (now < todayTargetTime) {
      nextPicksTime = todayTargetTime;
    } else {
      const tomorrow10AM = new Date(now);
      tomorrow10AM.setDate(tomorrow10AM.getDate() + 1);
      tomorrow10AM.setHours(10, 0, 0, 0); // Standard 10:00 AM for future days
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
