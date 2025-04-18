/**
 * RequestQueue for managing API requests to avoid rate limiting
 * Ensures requests are processed one at a time with proper spacing
 */

class RequestQueue {
  constructor() {
    this.queue = [];
    this.processing = false;
    this.requestDelay = 1000; // 1 second between requests
  }

  /**
   * Add a request to the queue
   * @param {Function} requestFn - Function that returns a promise for the request
   * @returns {Promise} - Promise that resolves with the request result
   */
  enqueue(requestFn) {
    return new Promise((resolve, reject) => {
      this.queue.push({
        requestFn,
        resolve,
        reject
      });
      
      this.processQueue();
    });
  }

  /**
   * Process the next item in the queue
   */
  async processQueue() {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;
    const item = this.queue.shift();

    try {
      // Wait for the delay before processing
      await new Promise(resolve => setTimeout(resolve, this.requestDelay));
      
      // Execute the request
      const result = await item.requestFn();
      item.resolve(result);
    } catch (error) {
      item.reject(error);
    } finally {
      this.processing = false;
      this.processQueue(); // Process the next item
    }
  }

  /**
   * Set the delay between requests
   * @param {number} ms - Delay in milliseconds
   */
  setRequestDelay(ms) {
    this.requestDelay = ms;
  }
}

// Create and export a singleton instance
export const requestQueue = new RequestQueue();
export default requestQueue;
