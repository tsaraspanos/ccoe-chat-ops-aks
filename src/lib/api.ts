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
    
    // Handle n8n response with runID/pipelineID for async processing
    const data = Array.isArray(triggerData) ? triggerData[0] : triggerData;
    
    // Check for runID to use async polling flow
    const runID = data.runID || data.runId;
    
    if (runID) {
      console.log('Async mode: waiting for completion with runID:', runID);
      // Store pipelineID for reference if needed
      const pipelineID = data.pipelineID || data.pipelineId;
      return await waitForResult(runID, pipelineID);
    }
    
    // Direct answer (sync mode)
    if (data.answer) {
      return { answer: data.answer, meta: { runID: data.runID, pipelineID: data.pipelineID } };
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
 * Wait for workflow result using polling (SSE not supported by edge functions)
 */
async function waitForResult(runID: string, pipelineID?: string): Promise<ChatResponse> {
  console.log('Polling for result:', { runID, pipelineID });
  return await pollForResult(runID);
}

/**
 * Poll for job result from Lovable Cloud edge function
 */
async function pollForResult(runID: string): Promise<ChatResponse> {
  const maxAttempts = 300;
  const pollInterval = 2000;
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await fetch(`${WEBHOOK_FUNCTION_URL}/status/${runID}`);
      
      if (!response.ok) {
        throw new Error(`Poll request failed: ${response.statusText}`);
      }

      const data: StreamUpdate = await response.json();

      if (data.status === 'completed' && data.answer) {
        return {
          answer: data.answer,
          meta: { runID: data.runID, pipelineID: data.pipelineID, ...data.meta },
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
