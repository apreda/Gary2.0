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
    
    // Special case for April 16, 2025 - skip rest of day after current time
    const isApril16_2025 = today.getDate() === 16 && today.getMonth() === 3 && today.getFullYear() === 2025;
    // Special case for April 17, 2025 - generate at 10am
    const isApril17_2025 = today.getDate() === 17 && today.getMonth() === 3 && today.getFullYear() === 2025;
    
    if (isApril16_2025) {
      // Set time to 23:59 to effectively skip the rest of today
      targetTime.setHours(23, 59, 0, 0);
    } else if (isApril17_2025) {
      // Generate at 10:00 AM on April 17th
      targetTime.setHours(10, 0, 0, 0);
    } else {
      // Standard 10:00 AM for all other days
      targetTime.setHours(10, 0, 0, 0);
    }
    
    // Log current time and target time for debugging
    console.log('Current time:', now.toLocaleTimeString());
    console.log('Target time:', targetTime.toLocaleTimeString());
    console.log('Last generation time:', lastGen.toLocaleTimeString());
    
    // Get current hours and minutes for a direct comparison
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    
    // Check if it's after target time based on the date
    let isAfterTargetTime;
    if (isApril16_2025) {
      // Skip the rest of today (April 16) - effectively returns false by setting the target to end of day
      isAfterTargetTime = false;
    } else if (isApril17_2025) {
      // Check if it's after 10:00 AM on April 17th
      isAfterTargetTime = (currentHour > 10 || (currentHour === 10 && currentMinute >= 0));
    } else {
      // Standard check for 10:00 AM on other days
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
    // Get current date for comparison
    const today = new Date();
    const isApril16_2025 = today.getDate() === 16 && today.getMonth() === 3 && today.getFullYear() === 2025;
    const isApril17_2025 = today.getDate() === 17 && today.getMonth() === 3 && today.getFullYear() === 2025;
    
    if (isApril16_2025) {
      return "10:00 AM April 17th, 2025"; // Show tomorrow's time
    } else if (isApril17_2025) {
      return "10:00 AM";
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
    
    // Check for special dates
    const isApril16_2025 = now.getDate() === 16 && now.getMonth() === 3 && now.getFullYear() === 2025;
    const isApril17_2025 = now.getDate() === 17 && now.getMonth() === 3 && now.getFullYear() === 2025;
    
    // Set target time based on date
    let todayTargetTime = new Date(now);
    
    if (isApril16_2025) {
      // For April 16th, skip to tomorrow at 10am
      todayTargetTime.setDate(todayTargetTime.getDate() + 1); // Move to April 17th
      todayTargetTime.setHours(10, 0, 0, 0); // 10:00 AM on April 17th
    } else if (isApril17_2025) {
      // For April 17th, use 10:00 AM
      todayTargetTime.setHours(10, 0, 0, 0);
    } else {
      // Standard 10:00 AM for all other days
      todayTargetTime.setHours(10, 0, 0, 0);
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
