/**
 * Simple in-memory cache for API responses
 * Helps reduce API calls and handle rate limiting
 */

class ApiCache {
  constructor(maxSize = 100, ttlSeconds = 3600) {
    this.cache = new Map();
    this.maxSize = maxSize;
    this.ttlSeconds = ttlSeconds;
  }

  /**
   * Get a value from the cache
   * @param {string} key - Cache key
   * @returns {any|null} - Cached value or null if not found or expired
   */
  get(key) {
    if (!this.cache.has(key)) return null;
    
    const { value, expiry } = this.cache.get(key);
    
    // Check if the value has expired
    if (Date.now() > expiry) {
      this.cache.delete(key);
      return null;
    }
    
    return value;
  }

  /**
   * Set a value in the cache
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @param {number} customTtl - Optional custom TTL in seconds
   */
  set(key, value, customTtl = null) {
    // Manage cache size
    if (this.cache.size >= this.maxSize) {
      // Delete the oldest entry
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }
    
    const ttl = customTtl || this.ttlSeconds;
    const expiry = Date.now() + (ttl * 1000);
    
    this.cache.set(key, { value, expiry });
  }

  /**
   * Clear the entire cache
   */
  clear() {
    this.cache.clear();
  }

  /**
   * Get the number of items in the cache
   */
  get size() {
    return this.cache.size;
  }
}

// Create and export a single instance to be shared across the application
export const apiCache = new ApiCache();
export default apiCache;
