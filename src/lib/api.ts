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

/**
 * n8n response structure.
 * - If n8n is still gathering info it may NOT include runID/pipelineID (just answer/message).
 * - Once n8n triggers a workflow it returns runID, pipelineID, status: "in_progress".
 */
interface N8nResponse {
  runID?: string;
  pipelineID?: string;
  status?: string;
  answer?: string;
  message?: string;
  [key: string]: unknown;
}

/**
 * Send chat message to n8n.
 * 
 * Flow:
 * 1. UI sends message to n8n webhook.
 * 2. n8n may respond with conversational replies (no runID) – return immediately.
 * 3. When n8n triggers workflow it responds with runID + status "in_progress".
 *    UI then polls the edge function until n8n posts the completed answer.
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
    
    const triggerResponse = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      body: formData,
    });

    if (!triggerResponse.ok) {
      throw new Error(`Chat request failed: ${triggerResponse.statusText}`);
    }

    const n8nData: N8nResponse = await triggerResponse.json();
    console.log('n8n response:', n8nData);

    // Case 1: n8n returned runID with status "in_progress" -> poll for final answer
    if (n8nData.runID && n8nData.status === 'in_progress') {
      console.log('Workflow in progress, polling for runID:', n8nData.runID);
      return await pollForResult(n8nData.runID);
    }

    // Case 2: n8n returned a direct answer (conversational reply, no workflow triggered yet)
    const directAnswer = n8nData.answer ?? n8nData.message;
    if (directAnswer) {
      console.log('Direct answer from n8n:', directAnswer);
      return {
        answer: directAnswer,
        meta: {
          runID: n8nData.runID,
          pipelineID: n8nData.pipelineID,
        },
      };
    }

    // Fallback: unexpected response shape
    console.warn('Unexpected n8n response shape:', n8nData);
    return {
      answer: 'Received response from workflow.',
      meta: n8nData as Record<string, unknown>,
    };
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
