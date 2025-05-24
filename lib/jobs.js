// In-memory store for async jobs
const jobs = {};

// Helper function to generate unique job IDs
function generateJobId() {
  return `job_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

function createJob(toolName, requestBody, callbackUrl, originalHeaders, appBaseUrl) {
    const jobId = generateJobId();
    const pollUrl = `${appBaseUrl}/status/${jobId}`;

    jobs[jobId] = {
        toolName: toolName,
        input: requestBody,
        timestamp: new Date().toISOString(),
        status: 'pending',
        poll_url: pollUrl,
        callback_url: callbackUrl, // Store callback_url if provided
        headers: originalHeaders // Store original request headers for later use
    };
    return jobId;
}

function getJob(jobId) {
    return jobs[jobId];
}

export {
    createJob,
    getJob,
    jobs // Exporting the raw store might be useful for some advanced scenarios or debugging
};