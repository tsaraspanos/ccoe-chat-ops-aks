import { ChatRequest, ChatResponse } from '@/types/chat';
import { v4 as uuidv4 } from 'uuid';

const N8N_WEBHOOK_URL = 'https://tsaraspanos.app.n8n.cloud/webhook/chat-ui-trigger';

// Lovable Cloud edge function URL for webhook polling
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://pgafpfqhsmaanaawjkbf.supabase.co';
const WEBHOOK_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/webhook-update`;

console.log('API Config:', { WEBHOOK_FUNCTION_URL, N8N_WEBHOOK_URL });

interface StreamUpdate {
  status: 'pending' | 'completed' | 'error';
  answer?: string;
  runID?: string;
  pipelineID?: string;
  meta?: Record<string, unknown>;
  error?: string;
}

/**
 * Send chat message to n8n and poll for response.
 * We generate a unique runID client-side and pass it to n8n.
 * n8n should use this runID when posting the completion back.
 */
export async function sendChatMessage(request: ChatRequest): Promise<ChatResponse> {
  // Generate a unique ID for this request - n8n should use this as runID when posting back
  const runID = uuidv4();
  
  const formData = new FormData();
  formData.append('sessionId', request.sessionId);
  formData.append('runID', runID); // Pass runID to n8n so it can use it in the callback

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
    console.log('Sending message to n8n with runID:', runID);
    
    // Fire the request to n8n (fire and forget - we don't wait for n8n response)
    const triggerResponse = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      body: formData,
    });

    if (!triggerResponse.ok) {
      throw new Error(`Chat request failed: ${triggerResponse.statusText}`);
    }

    console.log('n8n webhook triggered, starting to poll for runID:', runID);
    
    // Start polling for the result using the runID we generated
    return await pollForResult(runID);
    
  } catch (error) {
    console.error('Error sending message to n8n:', error);
    throw error;
  }
}

/**
 * Poll for job result from Lovable Cloud edge function
 */
async function pollForResult(runID: string): Promise<ChatResponse> {
  const maxAttempts = 300; // 10 minutes max
  const pollInterval = 2000; // 2 seconds
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await fetch(`${WEBHOOK_FUNCTION_URL}/status/${runID}`);
      
      if (!response.ok) {
        throw new Error(`Poll request failed: ${response.statusText}`);
      }

      const data: StreamUpdate = await response.json();
      console.log(`Poll attempt ${attempt + 1}:`, data);

      if (data.status === 'completed' && data.answer) {
        console.log('Got completed response:', data.answer);
        return {
          answer: data.answer,
          meta: { runID: data.runID, pipelineID: data.pipelineID, ...data.meta },
        };
      }

      if (data.status === 'error') {
        throw new Error(data.error || 'Workflow execution failed');
      }

      // Still pending, wait and try again
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
