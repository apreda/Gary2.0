/**
 * Gary's phrases for various situations
 */
export const garyPhrases = {
  /**
   * Random phrases when user decides to bet with Gary
   */
  betPhrases: [
    "Smart move! You're riding with a champion today!",
    "That's what I'm talking about! Let's get this money!",
    "Now we're talking! Gary approved bet right there!",
    "You've got the touch! This one's a lock!",
    "Big brain move! We're about to cash!",
    "This is why you're my favorite! Let's ride!",
    "That's how champions think! We're locked in!",
    "Money incoming! You made the right call!",
  ],
  
  /**
   * Random phrases when user decides to fade Gary
   */
  fadePhrases: [
    "Fading ME? Bold strategy, cotton!",
    "Your funeral, pal. I'm GARY for a reason!",
    "Oh, you think you're smarter than Gary? That's cute.",
    "That's a mistake you'll be regretting soon...",
    "Really? REALLY? Good luck with that decision!",
    "I see someone woke up and chose violence today!",
    "I'll remember this betrayal when I'm counting my money!",
    "Sure, fade the best in the business. See how that works out!",
  ],
  
  /**
   * Random phrases when user wins by betting with Gary
   */
  userWinsWithGary: [
    "BOOM! That's how we do it! Another winner!",
    "Did you ever doubt? Gary ALWAYS delivers!",
    "Cha-ching! The money printer keeps rolling!",
    "That's what happens when you trust the process!",
    "Never in doubt! We're COOKING today!",
  ],
  
  /**
   * Random phrases when user loses by betting with Gary
   */
  userLosesWithGary: [
    "Even the GOAT misses sometimes. We'll get 'em next time!",
    "Just setting up the comeback. Trust the process!",
    "That one's on me. Regrouping for the next W!",
    "Can't win 'em all, but we'll bounce back stronger!",
    "A minor setback for a major comeback!",
  ],
  
  /**
   * Random phrases when user wins by fading Gary
   */
  userWinsByFading: [
    "You got lucky THIS time. Don't make it a habit!",
    "Even a broken clock is right twice a day, pal!",
    "Enjoy the win. I'm taking notes for next time!",
    "Congrats on the fade win. My ego is bruised but intact!",
    "Fine, you win this round. Don't get comfortable!",
  ],
  
  /**
   * Random phrases when user loses by fading Gary
   */
  userLosesByFading: [
    "TOLD YA! Never fade greatness!",
    "That's what happens when you doubt Gary!",
    "Lesson learned? Don't fade the best in the business!",
    "This is why you ride with Gary, not against him!",
    "How's that fade working out for ya? Next time, trust me!",
  ],
  
  /**
   * Get a random phrase from the specified category
   * @param {string} category - The phrase category
   * @returns {string} A random phrase
   */
  getRandom(category) {
    const phrases = this[category];
    if (!phrases || phrases.length === 0) {
      return "Gary's watching your picks!";
    }
    const randomIndex = Math.floor(Math.random() * phrases.length);
    return phrases[randomIndex];
  }
};
