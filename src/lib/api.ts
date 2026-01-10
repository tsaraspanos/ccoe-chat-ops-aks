import { ChatRequest, ChatResponse } from '@/types/chat';

const N8N_WEBHOOK_URL = 'https://tsaraspanos.app.n8n.cloud/webhook/chat-ui-trigger';

// Lovable Cloud edge function URL for webhook polling
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://pgafpfqhsmaanaawjkbf.supabase.co';
const WEBHOOK_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/webhook-update`;

console.log('API Config:', { WEBHOOK_FUNCTION_URL, N8N_WEBHOOK_URL });

interface StreamUpdate {
  status: 'pending' | 'completed' | 'error' | string;
  answer?: string | string[];
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
  runID?: string | number;
  runId?: string | number;
  pipelineID?: string | number;
  pipelineId?: string | number;
  status?: string;
  answer?: string;
  message?: string;
  [key: string]: unknown;
}

/**
 * Extract answer from n8n response - handles various common field names
 */
function extractAnswer(data: N8nResponse): string | undefined {
  // Common field names for text responses
  const answerKeys = ['answer', 'message', 'text', 'output', 'response', 'content', 'result'];
  
  for (const key of answerKeys) {
    const value = data[key];
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }
  
  // Check if data itself is a string (some workflows return plain text)
  if (typeof data === 'string') {
    return data;
  }
  
  // Check for nested data.data.answer pattern
  if (data.data && typeof data.data === 'object') {
    for (const key of answerKeys) {
      const value = (data.data as Record<string, unknown>)[key];
      if (typeof value === 'string' && value.trim()) {
        return value;
      }
    }
  }
  
  return undefined;
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

    // Case 1/2: n8n may return either a direct conversational answer OR a runID for async processing
    const runId = n8nData.runID ?? n8nData.runId;
    const pipelineId = n8nData.pipelineID ?? n8nData.pipelineId;
    const normalizedTriggerStatus = String(n8nData.status ?? '').toLowerCase().trim();

    const directAnswer = extractAnswer(n8nData);
    const hasRunId = runId !== undefined && runId !== null && String(runId).trim().length > 0;

    const completedStatuses = new Set(['completed', 'complete', 'done', 'success']);
    const errorStatuses = new Set(['error', 'failed', 'failure']);

    // If n8n explicitly reports an error, surface it
    if (errorStatuses.has(normalizedTriggerStatus)) {
      throw new Error(directAnswer || 'Workflow execution failed');
    }

    // If we have a runId and no direct answer, always poll.
    // (Some n8n flows omit status or use different wording than "in_progress".)
    if (hasRunId && !directAnswer && !completedStatuses.has(normalizedTriggerStatus)) {
      console.log('Workflow started, polling for runID:', runId, 'status:', n8nData.status);
      return await pollForResult(String(runId));
    }

    // If n8n claims it's completed but didn't include the answer, fetch it from the status endpoint.
    if (hasRunId && !directAnswer && completedStatuses.has(normalizedTriggerStatus)) {
      console.log('Workflow marked completed, fetching result for runID:', runId);
      return await pollForResult(String(runId));
    }

    // Direct answer from n8n
    if (directAnswer) {
      console.log('Direct answer from n8n:', directAnswer);
      return {
        answer: directAnswer,
        meta: {
          runID: hasRunId ? String(runId) : undefined,
          pipelineID: pipelineId ? String(pipelineId) : undefined,
        },
      };
    }

    // Fallback: show stringified response so user can see what n8n returned
    console.warn('Unexpected n8n response shape:', n8nData);
    return {
      answer: JSON.stringify(n8nData, null, 2),
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
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const functionHeaders: HeadersInit | undefined = anonKey
        ? {
            apikey: anonKey,
            Authorization: `Bearer ${anonKey}`,
          }
        : undefined;

      const response = await fetch(`${WEBHOOK_FUNCTION_URL}/status/${runID}?t=${Date.now()}`, {
        headers: functionHeaders,
        cache: 'no-store',
      });

      if (!response.ok) {
        throw new Error(`Poll request failed: ${response.status} ${response.statusText}`);
      }

      const data: StreamUpdate = await response.json();
      console.log(`Poll attempt ${attempt + 1}:`, data);

      // Normalize status to lowercase for comparison
      const normalizedStatus = String(data.status ?? '').toLowerCase();

      if (normalizedStatus === 'completed' || normalizedStatus === 'complete' || normalizedStatus === 'done' || normalizedStatus === 'success') {
        // Handle answer that might be a string, a string[], or a stringified JSON array
        let answerText = '';
        if (typeof data.answer === 'string') {
          const trimmed = data.answer.trim();
          if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
            try {
              const parsed = JSON.parse(trimmed);
              answerText = Array.isArray(parsed) ? parsed.join('\n') : data.answer;
            } catch {
              answerText = data.answer;
            }
          } else {
            answerText = data.answer;
          }
        } else if (Array.isArray(data.answer)) {
          answerText = data.answer.join('\n');
        } else if (data.answer) {
          answerText = JSON.stringify(data.answer, null, 2);
        }

        console.log('Got completed response:', answerText);
        return {
          answer: answerText || 'Workflow completed (no answer provided)',
          meta: { runID: data.runID, pipelineID: data.pipelineID, ...data.meta },
        };
      }

      if (normalizedStatus === 'error' || normalizedStatus === 'failed' || normalizedStatus === 'failure') {
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
