import { fetch } from 'undici'
import chalk from 'chalk'

/**
 * Webhook health monitoring for tracking endpoint reliability
 */
class HealthMonitor {
  constructor() {
    this.stats = new Map()
    this.healthChecks = new Map()
  }

  /**
   * Record a tool execution result
   * @param {string} toolName - Tool identifier
   * @param {Object} result - Execution result
   */
  recordExecution(toolName, result) {
    if (!this.stats.has(toolName)) {
      this.stats.set(toolName, {
        total: 0,
        success: 0,
        errors: 0,
        avgResponseTime: 0,
        lastSuccess: null,
        lastError: null,
        errorTypes: new Map()
      })
    }

    const stats = this.stats.get(toolName)
    stats.total++
    
    if (result.success) {
      stats.success++
      stats.lastSuccess = result.timestamp
      
      // Update average response time
      if (result.responseTime) {
        stats.avgResponseTime = ((stats.avgResponseTime * (stats.success - 1)) + result.responseTime) / stats.success
      }
    } else {
      stats.errors++
      stats.lastError = {
        timestamp: result.timestamp,
        error: result.error,
        status: result.status
      }
      
      // Track error types
      const errorType = result.errorType || 'unknown'
      stats.errorTypes.set(errorType, (stats.errorTypes.get(errorType) || 0) + 1)
    }

    this.stats.set(toolName, stats)
  }

  /**
   * Get health statistics for a tool
   * @param {string} toolName - Tool identifier
   * @returns {Object} - Health statistics
   */
  getHealth(toolName) {
    const stats = this.stats.get(toolName)
    if (!stats) {
      return {
        status: 'unknown',
        successRate: 0,
        totalRequests: 0,
        avgResponseTime: 0,
        lastSuccess: null,
        lastError: null
      }
    }

    const successRate = stats.total > 0 ? (stats.success / stats.total) * 100 : 0
    let status = 'healthy'
    
    if (successRate < 50) {
      status = 'critical'
    } else if (successRate < 80) {
      status = 'degraded'
    }

    return {
      status,
      successRate: Math.round(successRate * 100) / 100,
      totalRequests: stats.total,
      successfulRequests: stats.success,
      errorRequests: stats.errors,
      avgResponseTime: Math.round(stats.avgResponseTime),
      lastSuccess: stats.lastSuccess,
      lastError: stats.lastError,
      errorTypes: Object.fromEntries(stats.errorTypes)
    }
  }

  /**
   * Get health summary for all tools
   * @returns {Object} - Health summary
   */
  getOverallHealth() {
    const tools = Array.from(this.stats.keys())
    const summary = {
      totalTools: tools.length,
      healthy: 0,
      degraded: 0,
      critical: 0,
      unknown: 0,
      tools: {}
    }

    tools.forEach(toolName => {
      const health = this.getHealth(toolName)
      summary.tools[toolName] = health
      summary[health.status]++
    })

    return summary
  }

  /**
   * Perform health check on a tool endpoint
   * @param {Object} toolConfig - Tool configuration
   * @param {boolean} DEBUG - Debug logging
   * @returns {Object} - Health check result
   */
  async performHealthCheck(toolConfig, DEBUG = false) {
    const startTime = Date.now()
    
    try {
      // Use HEAD request for health check to avoid side effects
      const response = await fetch(toolConfig.url, {
        method: 'HEAD',
        headers: {
          'User-Agent': 'WyreUP-MCP-HealthCheck/1.0'
        },
        signal: AbortSignal.timeout(5000) // 5 second timeout for health checks
      })

      const responseTime = Date.now() - startTime
      const isHealthy = response.status < 400

      if (DEBUG) {
        console.log(
          chalk[isHealthy ? 'green' : 'yellow'](
            `[DEBUG] Health check for ${toolConfig.name}: ${response.status} (${responseTime}ms)`
          )
        )
      }

      return {
        tool: toolConfig.name,
        healthy: isHealthy,
        status: response.status,
        responseTime,
        timestamp: new Date().toISOString()
      }
    } catch (error) {
      const responseTime = Date.now() - startTime
      
      if (DEBUG) {
        console.error(
          chalk.red(
            `[DEBUG] Health check failed for ${toolConfig.name}: ${error.message} (${responseTime}ms)`
          )
        )
      }

      return {
        tool: toolConfig.name,
        healthy: false,
        error: error.message,
        responseTime,
        timestamp: new Date().toISOString()
      }
    }
  }

  /**
   * Clear statistics for a tool
   * @param {string} toolName - Tool identifier
   */
  clearStats(toolName) {
    this.stats.delete(toolName)
  }

  /**
   * Clear all statistics
   */
  clearAllStats() {
    this.stats.clear()
  }
}

// Export singleton instance
export const healthMonitor = new HealthMonitor()