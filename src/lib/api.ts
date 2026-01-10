import { ChatRequest, ChatResponse } from '@/types/chat';

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

interface N8nResponse {
  runID: string;
  [key: string]: unknown;
}

/**
 * Send chat message to n8n and poll for response.
 * n8n returns a runID which we use to poll for the final answer.
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
    console.log('Sending message to n8n...');
    
    // Send request to n8n - it should return a runID immediately
    const triggerResponse = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      body: formData,
    });

    if (!triggerResponse.ok) {
      throw new Error(`Chat request failed: ${triggerResponse.statusText}`);
    }

    // n8n should return JSON with runID
    const n8nData: N8nResponse = await triggerResponse.json();
    const runID = n8nData.runID;

    if (!runID) {
      throw new Error('n8n did not return a runID. Make sure your n8n workflow returns { runID: "..." } in the response.');
    }

    console.log('n8n returned runID:', runID, '- starting to poll...');
    
    // Start polling for the result using the runID from n8n
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
