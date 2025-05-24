import axios from 'axios';
import chalk from 'chalk';
import { jobs } from './jobs.js'; // Assuming jobs store is in jobs.js

async function executeTool(toolConfig, requestPayload, originalHeaders, { DEBUG, toolsBaseUrl }) {
    const webhookPath = toolConfig.webhook;
    const webhookUrl = webhookPath.startsWith('http://') || webhookPath.startsWith('https://')
        ? webhookPath
        : `${toolsBaseUrl.replace(/\/$/, '')}/${webhookPath.replace(/^\//, '')}`;

    if (DEBUG) {
        console.log(chalk.blueBright(`[DEBUG] Executing tool: ${chalk.cyan(toolConfig.name)}`));
        console.log(chalk.blueBright(`[DEBUG]   Webhook URL: ${webhookUrl}`));
        console.log(chalk.blueBright(`[DEBUG]   Request Payload: ${JSON.stringify(requestPayload, null, 2)}`));
    }

    const headersToForward = {};
    if (toolConfig.headers_whitelist && Array.isArray(toolConfig.headers_whitelist)) {
        toolConfig.headers_whitelist.forEach(headerName => {
            const lowerHeaderName = headerName.toLowerCase();
            if (originalHeaders[lowerHeaderName]) {
                headersToForward[headerName] = originalHeaders[lowerHeaderName];
            }
        });
    } else if (toolConfig.headers_whitelist === '*') {
        // Forward all headers - be cautious with this
        Object.assign(headersToForward, originalHeaders);
    }
    // Always forward a content-type if the payload is an object
    if (typeof requestPayload === 'object' && !headersToForward['Content-Type'] && !headersToForward['content-type']) {
        headersToForward['Content-Type'] = 'application/json';
    }


    if (DEBUG) {
        console.log(chalk.blueBright(`[DEBUG]   Forwarding Headers: ${JSON.stringify(headersToForward, null, 2)}`));
    }

    try {
        const webhookResponse = await axios.post(webhookUrl, requestPayload, {
            headers: headersToForward,
            timeout: toolConfig.timeout || 30000 // Default timeout 30s
        });

        if (DEBUG) {
            console.log(chalk.greenBright(`[DEBUG] Webhook response for ${toolConfig.name}: ${webhookResponse.status}`));
            console.log(chalk.greenBright(`[DEBUG]   Response Data: ${JSON.stringify(webhookResponse.data, null, 2)}`));
        }
        return { success: true, data: webhookResponse.data, status: webhookResponse.status };
    } catch (error) {
        if (DEBUG) {
            console.error(chalk.redBright(`[DEBUG] Error executing webhook for ${toolConfig.name}: ${error.message}`));
            if (error.response) {
                console.error(chalk.redBright(`[DEBUG]   Error Response Status: ${error.response.status}`));
                console.error(chalk.redBright(`[DEBUG]   Error Response Data: ${JSON.stringify(error.response.data, null, 2)}`));
            }
        }
        return { success: false, error: error.message, status: error.response ? error.response.status : 500, data: error.response ? error.response.data : null };
    }
}


async function executeToolAndCallback(jobId, toolConfig, requestPayload, callbackUrl, originalHeaders, { DEBUG, toolsBaseUrl }) {
    const job = jobs[jobId];
    if (!job) {
        if (DEBUG) console.error(chalk.redBright(`[DEBUG] Job ${jobId} not found for callback execution.`));
        return;
    }

    job.status = 'processing';
    job.timestamp = new Date().toISOString();
    if (DEBUG) console.log(chalk.blueBright(`[DEBUG] Processing job ${jobId} for tool ${toolConfig.name} with callback to ${callbackUrl}`));

    const executionResult = await executeTool(toolConfig, requestPayload, originalHeaders, { DEBUG, toolsBaseUrl });

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