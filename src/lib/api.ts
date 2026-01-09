import { ChatRequest, ChatResponse } from '@/types/chat';

const N8N_WEBHOOK_URL = 'https://tsaraspanos.app.n8n.cloud/webhook/chat-ui-trigger';

// Server webhook endpoints (your Express server)
const API_BASE_URL = import.meta.env.VITE_API_URL || '';

interface StreamUpdate {
  status: 'pending' | 'completed' | 'error';
  answer?: string;
  meta?: Record<string, unknown>;
  error?: string;
}

/**
 * Send chat message and listen for real-time updates via SSE.
 * n8n should return a jobId immediately, then push updates to the webhook.
 */
export async function sendChatMessage(request: ChatRequest): Promise<ChatResponse> {
  const formData = new FormData();
  formData.append('sessionId', request.sessionId);

  if (request.message) {
    formData.append('message', request.message);
  }

  if (request.files) {
    request.files.forEach((file) => {
      formData.append('files[]', file);
    });
  }

  if (request.voice) {
    formData.append('voice', request.voice, 'voice-recording.webm');
  }

  try {
    // Step 1: Send the message and get a jobId
    const triggerResponse = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      body: formData,
    });

    if (!triggerResponse.ok) {
      throw new Error(`Chat request failed: ${triggerResponse.statusText}`);
    }

    const triggerData = await triggerResponse.json();
    console.log('n8n response:', triggerData);
    
    // Handle different n8n response formats
    // 1. Direct answer field
    if (triggerData.answer) {
      return { answer: triggerData.answer, meta: triggerData.meta || {} };
    }
    
    // 2. Array response from n8n (common format)
    if (Array.isArray(triggerData) && triggerData.length > 0) {
      const firstItem = triggerData[0];
      if (firstItem.answer) {
        return { answer: firstItem.answer, meta: firstItem.meta || {} };
      }
      if (firstItem.output) {
        return { answer: firstItem.output, meta: {} };
      }
      if (firstItem.message) {
        return { answer: firstItem.message, meta: {} };
      }
      if (firstItem.text) {
        return { answer: firstItem.text, meta: {} };
      }
      // Return stringified first item as fallback
      return { answer: JSON.stringify(firstItem), meta: {} };
    }

    // 3. Check for jobId to use async SSE flow
    const jobId = triggerData.jobId || triggerData.executionId || triggerData.id;
    
    if (jobId) {
      // Async mode: wait for webhook callback
      return await waitForResult(jobId);
    }
    
    // 4. Other common response fields
    if (triggerData.message) {
      return { answer: triggerData.message, meta: triggerData.meta || {} };
    }
    if (triggerData.text) {
      return { answer: triggerData.text, meta: triggerData.meta || {} };
    }
    if (triggerData.response) {
      return { answer: triggerData.response, meta: triggerData.meta || {} };
    }
    if (triggerData.output) {
      return { answer: triggerData.output, meta: triggerData.meta || {} };
    }
    
    // 5. Last resort: stringify the entire response
    return { 
      answer: JSON.stringify(triggerData, null, 2), 
      meta: {} 
    };
  } catch (error) {
    console.error('Error sending message to n8n:', error);
    throw error;
  }
}

/**
 * Wait for workflow result using SSE stream with polling fallback
 */
async function waitForResult(jobId: string): Promise<ChatResponse> {
  // Try SSE first
  try {
    return await listenForUpdates(jobId);
  } catch (sseError) {
    console.warn('SSE failed, falling back to polling:', sseError);
    return await pollForResult(jobId);
  }
}

/**
 * Listen for updates via Server-Sent Events
 */
function listenForUpdates(jobId: string): Promise<ChatResponse> {
  return new Promise((resolve, reject) => {
    const streamUrl = `${API_BASE_URL}/api/webhook/stream/${jobId}`;
    const eventSource = new EventSource(streamUrl);
    
    const timeout = setTimeout(() => {
      eventSource.close();
      reject(new Error('SSE connection timed out'));
    }, 600000); // 10 minute timeout

    eventSource.onmessage = (event) => {
      try {
        const data: StreamUpdate = JSON.parse(event.data);
        
        if (data.status === 'completed' && data.answer) {
          clearTimeout(timeout);
          eventSource.close();
          resolve({
            answer: data.answer,
            meta: data.meta || {},
          });
        }
        
        if (data.status === 'error') {
          clearTimeout(timeout);
          eventSource.close();
          reject(new Error(data.error || 'Workflow execution failed'));
        }
      } catch (parseError) {
        console.warn('Failed to parse SSE message:', parseError);
      }
    };

    eventSource.onerror = (error) => {
      clearTimeout(timeout);
      eventSource.close();
      reject(error);
    };
  });
}

/**
 * Fallback polling for job result
 */
async function pollForResult(jobId: string): Promise<ChatResponse> {
  const maxAttempts = 300;
  const pollInterval = 2000;
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/webhook/status/${jobId}`);
      
      if (!response.ok) {
        throw new Error(`Poll request failed: ${response.statusText}`);
      }

      const data: StreamUpdate = await response.json();

      if (data.status === 'completed' && data.answer) {
        return {
          answer: data.answer,
          meta: data.meta || {},
        };
      }

      if (data.status === 'error') {
        throw new Error(data.error || 'Workflow execution failed');
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval));
    } catch (error) {
      console.warn(`Poll attempt ${attempt + 1} failed:`, error);
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
  }

  throw new Error('Request timed out waiting for response');
}

export async function checkHealth(): Promise<{ status: string }> {
  return { status: 'ok' };
}
