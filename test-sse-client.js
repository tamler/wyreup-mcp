import { EventSource } from 'undici';
import fetch from 'node-fetch';

// Connect to SSE endpoint
const sse = new EventSource('http://localhost:3333/sse');

sse.addEventListener('endpoint', async (event) => {
  const sessionPath = event.data;
  console.log('Got SSE session:', sessionPath);

  const postUrl = `http://localhost:3333${sessionPath}`;
  console.log('Posting to URL:', postUrl);
  const payload = {
    jsonrpc: '2.0',
    id: 'sse-test-1',
    method: 'tools/call',
    params: {
      name: 'get_quote',
      arguments: {}
    }
  };

  try {
    const response = await fetch(postUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const text = await response.text();
    console.log('Response:', text);
  } catch (err) {
    console.error('Error sending POST:', err);
  }

  sse.close();
});

sse.addEventListener('message', (event) => {
  console.log('Received message from server:', event.data);
});

sse.onerror = (err) => {
  console.error('SSE error:', err);
  sse.close();
};
