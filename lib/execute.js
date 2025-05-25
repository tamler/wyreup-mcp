import fs from 'fs'
import path from 'path'
import os from 'os'

import { fetch } from 'undici'
import chalk from 'chalk'
// import https from 'https'; // No longer needed with undici
import { Buffer } from 'buffer'
import { jobs } from './jobs.js' // Assuming jobs store is in jobs.js

// Secret loader (outside function)
function loadSecretAuth(user, toolName) {
  const baseDir = path.join(os.homedir(), '.wyreup-secrets')
  const filePath = path.join(baseDir, `${user}.json`)
  if (!fs.existsSync(filePath)) return null
  try {
    const raw = fs.readFileSync(filePath, 'utf-8')
    const parsed = JSON.parse(raw)
    return parsed[toolName] || null
  } catch {
    return null
  }
}

async function executeTool(
  toolConfig,
  requestPayload,
  originalHeaders,
  { DEBUG }
) {
  let currentTargetUrl = toolConfig.url // Use toolConfig.url directly

  if (DEBUG) {
    console.log(
      chalk.blueBright(`[DEBUG] Executing tool: ${chalk.cyan(toolConfig.name)}`)
    )
    console.log(chalk.blueBright(`[DEBUG]   Target URL: ${currentTargetUrl}`))
    console.log(
      chalk.blueBright(
        `[DEBUG]   Request Payload: ${JSON.stringify(requestPayload, null, 2)}`
      )
    )
  }

  const finalHeaders = { ...originalHeaders } // Start with all original headers

  // The loop for preserving only Content-Type is removed as all headers are now copied.

  const deleteHeaderCaseInsensitive = (headers, keyToDelete) => {
    const lowerKey = keyToDelete.toLowerCase()
    Object.keys(headers).forEach((headerKey) => {
      if (headerKey.toLowerCase() === lowerKey) {
        delete headers[headerKey]
      }
    })
  }

  let auth = toolConfig.auth

  // Check for external auth override
  if (toolConfig.authFrom && toolConfig.authFrom.user && toolConfig.name) {
    const loaded = loadSecretAuth(toolConfig.authFrom.user, toolConfig.name)
    if (loaded) {
      auth = loaded
      if (DEBUG) {
        console.log(chalk.blueBright(`[DEBUG]   Loaded auth for tool ${toolConfig.name} from .wyreup-secrets/${toolConfig.authFrom.user}.json`))
      }
    } else if (DEBUG) {
      console.warn(chalk.yellowBright(`[DEBUG]   No external auth found for ${toolConfig.name} in .wyreup-secrets/${toolConfig.authFrom.user}.json`))
    }
  }

  if (auth) {
    if (auth.type === 'header' && auth.name) {
      deleteHeaderCaseInsensitive(finalHeaders, auth.name)
    }
    if (auth.type === 'jwt') {
      deleteHeaderCaseInsensitive(finalHeaders, 'Authorization')
    }
  }

  const method = toolConfig.method?.toUpperCase() || 'POST'

  // 1. Prepare body and Content-Type for POST/PUT/PATCH, and effectiveTargetUrl
  let bodyToSend
  // Initialize effectiveTargetUrl with currentTargetUrl. It might be modified by GET parameter logic.
  let effectiveTargetUrl = currentTargetUrl

  if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
    if (typeof requestPayload === 'object' && requestPayload !== null) {
      // For object payloads, ensure Content-Type is application/json and stringify.
      // Remove any existing Content-Type header first to avoid conflicts or incorrect casing.
      const existingContentTypeKey = Object.keys(finalHeaders).find(
        (key) => key.toLowerCase() === 'content-type'
      )
      if (existingContentTypeKey) {
        delete finalHeaders[existingContentTypeKey]
      }
      finalHeaders['Content-Type'] = 'application/json' // Explicitly set (no charset for this test)
      deleteHeaderCaseInsensitive(finalHeaders, 'Accept'); // Remove any existing Accept header
      finalHeaders['Accept'] = 'application/json'; // Also set Accept header for JSON requests
      bodyToSend = JSON.stringify(requestPayload)
    } else {
      // For non-object payloads (e.g., string, Buffer, or null), send as is.
      // Content-Type should ideally be in originalHeaders if needed (e.g., text/plain).
      bodyToSend = requestPayload
    }
  } else if (
    method === 'GET' &&
    requestPayload &&
    Object.keys(requestPayload).length > 0
  ) {
    // For GET requests, append payload as query parameters. bodyToSend remains undefined.
    const currentUrl = new URL(effectiveTargetUrl) // Use effectiveTargetUrl as base
    Object.entries(requestPayload).forEach(([key, value]) => {
      currentUrl.searchParams.set(key, String(value))
    })
    effectiveTargetUrl = currentUrl.toString()
    if (DEBUG)
      console.log(
        chalk.blueBright(`[DEBUG]   GET URL with params: ${effectiveTargetUrl}`)
      )
  }
  // Auth processing (which modifies finalHeaders) will occur after this block.
  // Then the DEBUG log for finalHeaders will show the combined state.
  // The Content-Type for JSON objects was set in the block above (lines 61-77),
  // overriding originalHeaders if necessary.
  // The redundant Content-Type check block that was here is removed.

  if (auth) {
    if (DEBUG)
      console.log(
        chalk.blueBright(
          `[DEBUG]   Processing auth type: ${auth.type}`
        )
      )
    switch (auth.type) {
      case 'header':
        if (auth.name) {
          let authValue = auth.value;
          
          // Check for environment variable override
          if (auth.valueFromEnv && typeof auth.valueFromEnv === 'string') {
            const envValue = process.env[auth.valueFromEnv];
            if (envValue) {
              authValue = envValue;
              if (DEBUG) {
                console.log(
                  chalk.blueBright(
                    `[DEBUG]   Using auth value from env var: ${auth.valueFromEnv}`
                  )
                );
              }
            } else {
              if (DEBUG) {
                console.warn(
                  chalk.yellowBright(
                    `[DEBUG]   Environment variable ${auth.valueFromEnv} not found, falling back to auth.value`
                  )
                );
              }
            }
          }
          
          if (typeof authValue === 'string') {
            finalHeaders[auth.name] = authValue;
            if (DEBUG) {
              console.log(
                chalk.blueBright(
                  `[DEBUG]   Set header ${auth.name} with ${auth.valueFromEnv ? 'env-resolved' : 'manifest-defined'} value.`
                )
              );
            }
          } else if (DEBUG) {
            console.warn(
              chalk.yellowBright(
                `[DEBUG] Auth type 'header' for tool ${toolConfig.name} has no valid value (neither auth.value nor env var ${auth.valueFromEnv}).`
              )
            )
          }
        } else if (DEBUG) {
          console.warn(
            chalk.yellowBright(
              `[DEBUG] Auth type 'header' for tool ${toolConfig.name} is missing auth.name.`
            )
          )
        }
        break
      case 'jwt':
        let jwtToken = auth.token;
        
        // Check for environment variable override
        if (auth.tokenFromEnv && typeof auth.tokenFromEnv === 'string') {
          const envToken = process.env[auth.tokenFromEnv];
          if (envToken) {
            jwtToken = envToken;
            if (DEBUG) {
              console.log(
                chalk.blueBright(
                  `[DEBUG]   Using JWT token from env var: ${auth.tokenFromEnv}`
                )
              );
            }
          } else {
            if (DEBUG) {
              console.warn(
                chalk.yellowBright(
                  `[DEBUG]   Environment variable ${auth.tokenFromEnv} not found, falling back to auth.token`
                )
              );
            }
          }
        }
        
        if (jwtToken) {
          finalHeaders['Authorization'] = `Bearer ${jwtToken}`;
          if (DEBUG) {
            console.log(
              chalk.blueBright(
                `[DEBUG]   Set Authorization header with ${auth.tokenFromEnv ? 'env-resolved' : 'manifest-defined'} JWT token.`
              )
            );
          }
        } else if (DEBUG) {
          console.warn(
            chalk.yellowBright(
              `[DEBUG] Auth type 'jwt' for tool ${toolConfig.name} has no valid token (neither auth.token nor env var ${auth.tokenFromEnv}).`
            )
          )
        }
        break
      default:
        if (DEBUG)
          console.warn(
            chalk.yellowBright(
              `[DEBUG] Unknown auth type: ${auth.type} for tool ${toolConfig.name}`
            )
          )
    }
  }

  // Remove Host header (case-insensitively) to allow undici/node to set it automatically
  deleteHeaderCaseInsensitive(finalHeaders, 'Host')
  deleteHeaderCaseInsensitive(finalHeaders, 'Content-Length'); // Let undici set this
  deleteHeaderCaseInsensitive(finalHeaders, 'User-Agent'); // Let undici use its default or be absent

  if (DEBUG) {
    console.log(
      chalk.blueBright(
        `[DEBUG]   Final Forwarding Headers: ${JSON.stringify(
          finalHeaders,
          null,
          2
        )}`
      )
    )
    console.log(chalk.blueBright(`[DEBUG]   Method: ${method}`))
  }

  const timeout = toolConfig.timeout || 30000 // Default timeout 30s
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  const fetchOptions = {
    method: method,
    headers: finalHeaders,
    signal: controller.signal,
    // Body will be set below
  }
  // bodyToSend was prepared by the logic in lines 61-93, including JSON.stringify for objects.
  // finalHeaders was also updated with 'Content-Type': 'application/json' in that block if the payload was an object.
  // Auth logic further modified finalHeaders.
  // The redundant logic for setting body, Content-Type, and GET params here is removed.
  fetchOptions.body = bodyToSend
  // fetchOptions.headers is already correctly set to finalHeaders (which includes auth and Content-Type).

  try {
    const response = await fetch(effectiveTargetUrl, fetchOptions)
    clearTimeout(timeoutId)

    if (!response.ok) {
      // Try to get error details from response body
      let errorData
      try {
        errorData = await response.json()
      } catch (e) {
        try {
          errorData = await response.text()
        } catch (e2) {
          errorData = 'Could not parse error response body.'
        }
      }
      if (DEBUG) {
        console.error(
          chalk.redBright(
            `[DEBUG] Tool execution error for ${toolConfig.name}: ${response.status} ${response.statusText}`
          )
        )
        console.error(
          chalk.redBright(
            `[DEBUG]   Error Response Data: ${JSON.stringify(
              errorData,
              null,
              2
            )}`
          )
        )
      }
      throw new Error(
        `Request failed: ${response.status} ${response.statusText}`
      )
    }

    // Check for streaming response
    const contentType = response.headers.get('content-type')
    const isStreamResponse = contentType && (
      contentType.includes('text/event-stream') ||
      contentType.includes('application/x-ndjson') ||
      contentType.includes('text/plain; charset=utf-8') // Common for streaming
    )
    
    if (isStreamResponse && response.body) {
      if (DEBUG) {
        console.log(
          chalk.greenBright(
            `[DEBUG] Detected streaming response for ${toolConfig.name}: ${contentType}`
          )
        )
      }
      return {
        success: true,
        stream: response.body,
        status: response.status,
        contentType: contentType
      }
    }

    // Attempt to parse as JSON, fallback to text if not JSON (non-streaming)
    let responseData
    if (contentType && contentType.includes('application/json')) {
      responseData = await response.json()
    } else {
      responseData = await response.text()
    }

    if (DEBUG) {
      console.log(
        chalk.greenBright(
          `[DEBUG] Tool execution response for ${toolConfig.name}: ${response.status}`
        )
      )
      console.log(
        chalk.greenBright(
          `[DEBUG]   Response Data: ${JSON.stringify(responseData, null, 2)}`
        )
      )
    }
    return { success: true, data: responseData, status: response.status }
  } catch (error) {
    clearTimeout(timeoutId)
    if (DEBUG) {
      console.error(
        chalk.redBright(
          `[DEBUG] Error executing tool ${toolConfig.name}: ${error.message}`
        )
      )
      if (error.code) {
        console.error(chalk.redBright(`[DEBUG]   Error Code: ${error.code}`));
      }
      if (error.cause) {
        // Attempt to stringify error.cause, but handle potential circular references or non-plain objects
        let causeString;
        try {
          causeString = JSON.stringify(error.cause, Object.getOwnPropertyNames(error.cause), 2);
        } catch (stringifyError) {
          causeString = `Could not stringify error.cause: ${stringifyError.message}. Cause: ${error.cause}`;
        }
        console.error(chalk.redBright(`[DEBUG]   Error Cause: ${causeString}`));
      }
      // error.response is not available with undici.fetch in the same way as axios
      // The status and data are handled in the !response.ok block above for HTTP errors
    }
    // For network errors or aborts, error.response won't exist.
    // The status code might not be available if it's a network error before HTTP response.
    return {
      success: false,
      error: error.message,
      status: error.response
        ? error.response.status
        : error.name === 'AbortError'
        ? 408
        : 500,
      data: error.response ? error.response.data : null,
    }
  }
}

async function executeToolAndCallback(
  jobId,
  toolConfig,
  requestPayload,
  callbackUrl,
  originalHeaders,
  { DEBUG }
) {
  const job = jobs[jobId]
  if (!job) {
    if (DEBUG)
      console.error(
        chalk.redBright(
          `[DEBUG] Job ${jobId} not found for callback execution.`
        )
      )
    return
  }

  job.status = 'processing'
  job.timestamp = new Date().toISOString()
  if (DEBUG)
    console.log(
      chalk.blueBright(
        `[DEBUG] Processing job ${jobId} for tool ${toolConfig.name} with callback to ${callbackUrl}`
      )
    )

  const executionResult = await executeTool(
    toolConfig,
    requestPayload,
    originalHeaders,
    { DEBUG }
  )

  const callbackPayload = {
    job_id: jobId,
    tool_name: toolConfig.name,
    status: executionResult.success ? 'completed' : 'failed',
    timestamp: new Date().toISOString(),
  }

  if (executionResult.success) {
    callbackPayload.result = executionResult.data
    job.status = 'completed'
    job.result = executionResult.data
  } else {
    callbackPayload.error = {
      message: executionResult.error,
      status_code: executionResult.status,
      details: executionResult.data, // This might be null if error was not HTTP error with body
    }
    job.status = 'failed'
    job.error = callbackPayload.error
  }
  job.timestamp = new Date().toISOString()

  if (DEBUG) {
    console.log(
      chalk.blueBright(
        `[DEBUG] Job ${jobId} status: ${job.status}. Preparing callback.`
      )
    )
    console.log(
      chalk.blueBright(
        `[DEBUG]   Callback Payload: ${JSON.stringify(
          callbackPayload,
          null,
          2
        )}`
      )
    )
  }

  const callbackTimeout = 30000
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), callbackTimeout)

  try {
    const response = await fetch(callbackUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(callbackPayload),
      signal: controller.signal,
    })
    clearTimeout(timeoutId)

    if (!response.ok) {
      let errorBodyText = 'Could not read error body'
      try {
        errorBodyText = await response.text()
      } catch (e) {
        /* ignore */
      }
      throw new Error(
        `Callback request failed: ${response.status} ${response.statusText}. Body: ${errorBodyText}`
      )
    }
    if (DEBUG)
      console.log(
        chalk.greenBright(
          `[DEBUG] Callback successful for job ${jobId} to ${callbackUrl}`
        )
      )
  } catch (callbackError) {
    clearTimeout(timeoutId)
    console.error(
      chalk.red(
        `Error sending callback for job ${jobId} to ${callbackUrl}: ${callbackError.message}`
      )
    )
    // callbackError.response is not available with undici.fetch
    if (DEBUG) {
      // Log status if available (e.g. from the error message string if we parsed it)
      console.error(
        chalk.redBright(`[DEBUG]   Callback Error: ${callbackError.message}`)
      )
    }
    job.status = 'callback_failed'
    job.error = { ...job.error, callback_error: callbackError.message }
    job.timestamp = new Date().toISOString()
  }
}

export { executeTool, executeToolAndCallback }
