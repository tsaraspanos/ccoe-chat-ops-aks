import { ChatRequest, ChatResponse } from '@/types/chat';

const N8N_WEBHOOK_URL = 'https://tsaraspanos.app.n8n.cloud/webhook/chat-ui-trigger';
const N8N_POLL_URL = 'https://tsaraspanos.app.n8n.cloud/webhook/chat-ui-poll';

// Polling configuration
const POLL_INTERVAL_MS = 2000; // Poll every 2 seconds
const MAX_POLL_ATTEMPTS = 300; // Max 10 minutes (300 * 2s)

interface PollResponse {
  status: 'pending' | 'completed' | 'error';
  answer?: string;
  meta?: Record<string, unknown>;
  error?: string;
}

/**
 * Send chat message and poll for the response.
 * n8n should return a jobId immediately, then we poll until completion.
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
    
    // If n8n returns an immediate answer (sync response), return it
    if (triggerData.answer) {
      return triggerData;
    }

    // Get the jobId for polling
    const jobId = triggerData.jobId || triggerData.executionId || triggerData.id;
    
    if (!jobId) {
      // Fallback for different response formats
      return { 
        answer: triggerData.message || triggerData.text || triggerData.response || 'Response received', 
        meta: triggerData.meta || {} 
      };
    }

    // Step 2: Poll for the result
    return await pollForResult(jobId, request.sessionId);
  } catch (error) {
    console.error('Error sending message to n8n:', error);
    throw error;
  }
}

/**
 * Poll the n8n webhook for the job result
 */
async function pollForResult(jobId: string, sessionId: string): Promise<ChatResponse> {
  let attempts = 0;

  while (attempts < MAX_POLL_ATTEMPTS) {
    attempts++;

    try {
      const pollFormData = new FormData();
      pollFormData.append('jobId', jobId);
      pollFormData.append('sessionId', sessionId);

      const response = await fetch(N8N_POLL_URL, {
        method: 'POST',
        body: pollFormData,
      });

      if (!response.ok) {
        throw new Error(`Poll request failed: ${response.statusText}`);
      }

      const data: PollResponse = await response.json();

      if (data.status === 'completed' && data.answer) {
        return {
          answer: data.answer,
          meta: data.meta || {},
        };
      }

      if (data.status === 'error') {
        throw new Error(data.error || 'Workflow execution failed');
      }

      // Still pending, wait and poll again
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
    } catch (error) {
      // If polling fails, wait and try again (network hiccups)
      console.warn(`Poll attempt ${attempts} failed:`, error);
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }

  throw new Error('Request timed out waiting for response');
}

export async function checkHealth(): Promise<{ status: string }> {
  return { status: 'ok' };
}
