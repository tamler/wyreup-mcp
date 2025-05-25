import axios from 'axios';
import chalk from 'chalk';
import { Buffer } from 'buffer'; // Added for Basic Auth
import { jobs } from './jobs.js'; // Assuming jobs store is in jobs.js

async function executeTool(toolConfig, requestPayload, originalHeaders, { DEBUG }) { // Removed toolsBaseUrl
    const targetUrl = toolConfig.url; // Use toolConfig.url directly

    if (DEBUG) {
        console.log(chalk.blueBright(`[DEBUG] Executing tool: ${chalk.cyan(toolConfig.name)}`));
        console.log(chalk.blueBright(`[DEBUG]   Target URL: ${targetUrl}`));
        console.log(chalk.blueBright(`[DEBUG]   Request Payload: ${JSON.stringify(requestPayload, null, 2)}`));
    }

    const finalHeaders = {};

    // 1. Copy whitelisted headers from originalHeaders
    if (toolConfig.headers_whitelist) {
        if (toolConfig.headers_whitelist === '*') {
            // Copy all original headers, subsequent auth logic will handle overrides for auth-specific keys
            for (const key in originalHeaders) {
                if (originalHeaders.hasOwnProperty(key)) {
                    finalHeaders[key] = originalHeaders[key];
                }
            }
        } else if (Array.isArray(toolConfig.headers_whitelist)) {
            toolConfig.headers_whitelist.forEach(whitelistedHeaderName => {
                const lowerWhitelistedHeaderName = whitelistedHeaderName.toLowerCase();
                // Find original header key case-insensitively
                const originalHeaderKey = Object.keys(originalHeaders).find(
                    key => key.toLowerCase() === lowerWhitelistedHeaderName
                );
                if (originalHeaderKey) {
                    // Use the specified whitelisted name for the key in finalHeaders
                    finalHeaders[whitelistedHeaderName] = originalHeaders[originalHeaderKey];
                }
            });
        }
    }

    // 2. Ensure Content-Type for object payloads if not already set (and not an auth header itself)
    if (typeof requestPayload === 'object' && requestPayload !== null) {
        // Check if Content-Type is already set (case-insensitively)
        const contentTypeKey = Object.keys(finalHeaders).find(key => key.toLowerCase() === 'content-type');
        if (!contentTypeKey) {
            finalHeaders['Content-Type'] = 'application/json';
        }
    }

    // Helper function to delete a header key case-insensitively before setting a new one
    const deleteHeaderCaseInsensitive = (headers, keyToDelete) => {
        const lowerKey = keyToDelete.toLowerCase();
        Object.keys(headers).forEach(headerKey => {
            if (headerKey.toLowerCase() === lowerKey) {
                delete headers[headerKey];
            }
        });
    };

    // 3. Process tool-specific authentication, ensuring it overrides conflicting headers
    if (toolConfig.auth) {
        if (DEBUG) console.log(chalk.blueBright(`[DEBUG]   Processing auth type: ${toolConfig.auth.type}`));

        // Ensure client-supplied conflicting headers are removed before applying auth
        if (toolConfig.auth.type === 'header' && toolConfig.auth.name) {
            deleteHeaderCaseInsensitive(finalHeaders, toolConfig.auth.name);
        }
        if (toolConfig.auth.type === 'basic' || toolConfig.auth.type === 'jwt') {
            deleteHeaderCaseInsensitive(finalHeaders, 'Authorization');
        }

        switch (toolConfig.auth.type) {
            case 'header':
                if (toolConfig.auth.name && typeof toolConfig.auth.value === 'string') {
                    finalHeaders[toolConfig.auth.name] = toolConfig.auth.value;
                } else if (DEBUG) {
                    console.warn(chalk.yellowBright(`[DEBUG] Auth type 'header' for tool ${toolConfig.name} is missing name or value.`));
                }
                break;
            case 'basic':
                if (toolConfig.auth.username && typeof toolConfig.auth.password === 'string') {
                    const credentials = `${toolConfig.auth.username}:${toolConfig.auth.password}`;
                    finalHeaders['Authorization'] = `Basic ${Buffer.from(credentials).toString('base64')}`;
                } else if (DEBUG) {
                    console.warn(chalk.yellowBright(`[DEBUG] Auth type 'basic' for tool ${toolConfig.name} is missing username or password.`));
                }
                break;
            case 'jwt':
                if (toolConfig.auth.token) {
                    finalHeaders['Authorization'] = `Bearer ${toolConfig.auth.token}`;
                } else if (DEBUG) {
                    console.warn(chalk.yellowBright(`[DEBUG] Auth type 'jwt' for tool ${toolConfig.name} is missing token.`));
                }
                break;
            default:
                if (DEBUG) console.warn(chalk.yellowBright(`[DEBUG] Unknown auth type: ${toolConfig.auth.type} for tool ${toolConfig.name}`));
        }
    }

    if (DEBUG) {
        console.log(chalk.blueBright(`[DEBUG]   Final Forwarding Headers: ${JSON.stringify(finalHeaders, null, 2)}`));
    }

    const method = toolConfig.method?.toUpperCase() || 'POST';
    if (DEBUG) {
        console.log(chalk.blueBright(`[DEBUG]   Method: ${method}`));
    }

    try {
        const axiosConfig = {
            method: method,
            url: targetUrl,
            headers: finalHeaders,
            timeout: toolConfig.timeout || 30000 // Default timeout 30s
        };

        if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
            axiosConfig.data = requestPayload;
        } else if (method === 'GET' && requestPayload && Object.keys(requestPayload).length > 0) {
            // For GET requests, append payload as query parameters if not already in URL
            // This assumes requestPayload is a flat object of key-value pairs.
            // More complex GET request payload handling might be needed depending on tool expectations.
            const currentUrl = new URL(targetUrl);
            Object.entries(requestPayload).forEach(([key, value]) => {
                currentUrl.searchParams.set(key, String(value));
            });
            axiosConfig.url = currentUrl.toString();
            if (DEBUG) console.log(chalk.blueBright(`[DEBUG]   GET URL with params: ${axiosConfig.url}`));
        }


        const response = await axios(axiosConfig);

        if (DEBUG) {
            console.log(chalk.greenBright(`[DEBUG] Tool execution response for ${toolConfig.name}: ${response.status}`));
            console.log(chalk.greenBright(`[DEBUG]   Response Data: ${JSON.stringify(response.data, null, 2)}`));
        }
        return { success: true, data: response.data, status: response.status };
    } catch (error) {
        if (DEBUG) {
            console.error(chalk.redBright(`[DEBUG] Error executing tool ${toolConfig.name}: ${error.message}`));
            if (error.response) {
                console.error(chalk.redBright(`[DEBUG]   Error Response Status: ${error.response.status}`));
                console.error(chalk.redBright(`[DEBUG]   Error Response Data: ${JSON.stringify(error.response.data, null, 2)}`));
            }
        }
        return { success: false, error: error.message, status: error.response ? error.response.status : 500, data: error.response ? error.response.data : null };
    }
}


async function executeToolAndCallback(jobId, toolConfig, requestPayload, callbackUrl, originalHeaders, { DEBUG }) { // Removed toolsBaseUrl
    const job = jobs[jobId];
    if (!job) {
        if (DEBUG) console.error(chalk.redBright(`[DEBUG] Job ${jobId} not found for callback execution.`));
        return;
    }

    job.status = 'processing';
    job.timestamp = new Date().toISOString();
    if (DEBUG) console.log(chalk.blueBright(`[DEBUG] Processing job ${jobId} for tool ${toolConfig.name} with callback to ${callbackUrl}`));

    const executionResult = await executeTool(toolConfig, requestPayload, originalHeaders, { DEBUG }); // Removed toolsBaseUrl

    const callbackPayload = {
        job_id: jobId,
        tool_name: toolConfig.name,
        status: executionResult.success ? 'completed' : 'failed',
        timestamp: new Date().toISOString(),
    };

    if (executionResult.success) {
        callbackPayload.result = executionResult.data;
        job.status = 'completed';
        job.result = executionResult.data;
    } else {
        callbackPayload.error = {
            message: executionResult.error,
            status_code: executionResult.status,
            details: executionResult.data
        };
        job.status = 'failed';
        job.error = callbackPayload.error;
    }
    job.timestamp = new Date().toISOString(); // Update timestamp after execution

    if (DEBUG) {
        console.log(chalk.blueBright(`[DEBUG] Job ${jobId} status: ${job.status}. Preparing callback.`));
        console.log(chalk.blueBright(`[DEBUG]   Callback Payload: ${JSON.stringify(callbackPayload, null, 2)}`));
    }

    try {
        await axios.post(callbackUrl, callbackPayload, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 30000 // Timeout for callback
        });
        if (DEBUG) console.log(chalk.greenBright(`[DEBUG] Callback successful for job ${jobId} to ${callbackUrl}`));
    } catch (callbackError) {
        console.error(chalk.red(`Error sending callback for job ${jobId} to ${callbackUrl}: ${callbackError.message}`));
        if (DEBUG && callbackError.response) {
            console.error(chalk.redBright(`[DEBUG]   Callback Error Status: ${callbackError.response.status}`));
            console.error(chalk.redBright(`[DEBUG]   Callback Error Data: ${JSON.stringify(callbackError.response.data, null, 2)}`));
        }
        // Optionally, update job status to reflect callback failure
        job.status = 'callback_failed';
        job.error = { ...job.error, callback_error: callbackError.message };
        job.timestamp = new Date().toISOString();
    }
}

export { executeTool, executeToolAndCallback };