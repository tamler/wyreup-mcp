import chalk from 'chalk'

/**
 * Simple in-memory rate limiter for webhook tools
 * Production systems should use Redis or similar for distributed rate limiting
 */
class RateLimiter {
  constructor() {
    this.windows = new Map()
  }

  /**
   * Check if request is within rate limit
   * @param {string} toolName - Tool identifier
   * @param {Object} config - Rate limit config {requests: number, window: number}
   * @param {boolean} DEBUG - Debug logging
   * @returns {boolean} - True if request is allowed
   */
  isAllowed(toolName, config, DEBUG = false) {
    if (!config || !config.requests || !config.window) {
      return true // No rate limiting configured
    }

    const now = Date.now()
    const windowStart = now - config.window
    
    // Get or create window for this tool
    if (!this.windows.has(toolName)) {
      this.windows.set(toolName, [])
    }
    
    const requests = this.windows.get(toolName)
    
    // Clean old requests outside the window
    const validRequests = requests.filter(timestamp => timestamp > windowStart)
    this.windows.set(toolName, validRequests)
    
    // Check if we're within limits
    if (validRequests.length >= config.requests) {
      if (DEBUG) {
        console.warn(
          chalk.yellowBright(
            `[DEBUG] Rate limit exceeded for ${toolName}: ${validRequests.length}/${config.requests} requests in ${config.window}ms window`
          )
        )
      }
      return false
    }
    
    // Add current request
    validRequests.push(now)
    this.windows.set(toolName, validRequests)
    
    if (DEBUG) {
      console.log(
        chalk.blueBright(
          `[DEBUG] Rate limit check for ${toolName}: ${validRequests.length}/${config.requests} requests`
        )
      )
    }
    
    return true
  }

  /**
   * Get rate limit status for a tool
   * @param {string} toolName - Tool identifier
   * @param {Object} config - Rate limit config
   * @returns {Object} - Status object with current usage
   */
  getStatus(toolName, config) {
    if (!config || !this.windows.has(toolName)) {
      return { requests: 0, limit: config?.requests || 0, resetTime: null }
    }

    const now = Date.now()
    const windowStart = now - config.window
    const requests = this.windows.get(toolName)
    const validRequests = requests.filter(timestamp => timestamp > windowStart)
    
    return {
      requests: validRequests.length,
      limit: config.requests,
      resetTime: validRequests.length > 0 ? validRequests[0] + config.window : null
    }
  }

  /**
   * Clear rate limiting data for a tool
   * @param {string} toolName - Tool identifier
   */
  clear(toolName) {
    this.windows.delete(toolName)
  }

  /**
   * Clear all rate limiting data
   */
  clearAll() {
    this.windows.clear()
  }
}

// Export singleton instance
export const rateLimiter = new RateLimiter()