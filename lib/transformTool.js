/**
 * Transform simplified tool configurations to full format
 * Supports backward compatibility while enabling simplified onboarding
 */

/**
 * Transform a simplified tool configuration to the full internal format
 * @param {Object} tool - Tool configuration (can be simplified or full format)
 * @returns {Object} - Transformed tool in full format
 */
export function transformSimplifiedTool(tool) {
  // If the tool already has all required fields, return as-is (backward compatibility)
  if (tool.description && tool.url && tool.input && tool.output) {
    return tool;
  }
  
  // Transform simplified webhook format
  if (tool.webhook && !tool.url) {
    const transformed = { ...tool };
    
    // Transform webhook to url
    transformed.url = tool.webhook;
    delete transformed.webhook;
    
    // Set default description if missing
    if (!transformed.description) {
      transformed.description = `Forward to ${getWebhookDescription(tool.webhook)}`;
    }
    
    // Set default method if missing
    if (!transformed.method) {
      transformed.method = 'POST';
    }
    
    // Set default input schema if missing
    if (!transformed.input) {
      transformed.input = {
        type: "object",
        properties: {}
      };
    }
    
    // Set default output schema if missing
    if (!transformed.output) {
      transformed.output = {
        type: "object",
        properties: {
          result: {
            type: "string",
            description: "Response from webhook"
          }
        }
      };
    }
    
    // Set default public flag if missing
    if (transformed.public === undefined) {
      transformed.public = false;
    }
    
    return transformed;
  }
  
  // Return the tool as-is if it's not in simplified format
  return tool;
}

/**
 * Generate a user-friendly description for a webhook URL
 * @param {string} webhookUrl - The webhook URL
 * @returns {string} - Generated description
 */
function getWebhookDescription(webhookUrl) {
  try {
    const url = new URL(webhookUrl);
    const pathSegments = url.pathname.split('/').filter(segment => segment.length > 0);
    
    // Extract meaningful part from the URL
    if (pathSegments.length > 0) {
      const lastSegment = pathSegments[pathSegments.length - 1];
      // Convert kebab-case or snake_case to readable format
      const readable = lastSegment
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, letter => letter.toUpperCase());
      return `${readable} webhook`;
    }
    
    // Fallback to hostname
    return `${url.hostname} webhook`;
  } catch (error) {
    // If URL parsing fails, return generic description
    return 'webhook';
  }
}

/**
 * Transform an entire tools array, supporting both simplified and full formats
 * @param {Array} tools - Array of tool configurations
 * @returns {Array} - Array of transformed tools in full format
 */
export function transformToolsArray(tools) {
  if (!Array.isArray(tools)) {
    return tools;
  }
  
  return tools.map(tool => transformSimplifiedTool(tool));
}