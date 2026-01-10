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

    // Prevent the UI from being stuck on "Thinking" forever if n8n doesn't respond.
    // If this times out, we return a placeholder and let the background completion watcher
    // (or runID polling, when available) pick up the final result.
    const controller = new AbortController();
    const timeoutMs = 20000;
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

    let triggerResponse: Response;
    try {
      triggerResponse = await fetch(N8N_WEBHOOK_URL, {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });
    } finally {
      window.clearTimeout(timeoutId);
    }

    if (!triggerResponse.ok) {
      throw new Error(`Chat request failed: ${triggerResponse.statusText}`);
    }

    const n8nData: N8nResponse = await triggerResponse.json();
    console.log('n8n response:', n8nData);

    // n8n may return either a direct conversational answer OR a runID for async processing
    const runId = n8nData.runID ?? n8nData.runId;
    const pipelineId = n8nData.pipelineID ?? n8nData.pipelineId;
    const normalizedTriggerStatus = String(n8nData.status ?? '').toLowerCase().trim();

    const directAnswer = extractAnswer(n8nData);
    
    // Only consider it a valid workflow runId if it's not a placeholder value like "1"
    // and the status indicates the workflow is actually in progress
    const runIdStr = runId !== undefined && runId !== null ? String(runId).trim() : '';
    const isValidWorkflowRun = runIdStr.length > 1 && normalizedTriggerStatus === 'in_progress';

    const errorStatuses = new Set(['error', 'failed', 'failure']);

    // If n8n explicitly reports an error, surface it
    if (errorStatuses.has(normalizedTriggerStatus)) {
      throw new Error(directAnswer || 'Workflow execution failed');
    }

    // If we have a valid workflow run (real runId + in_progress status), return with meta
    if (isValidWorkflowRun) {
      console.log('Valid workflow started:', {
        runId: runIdStr,
        pipelineId,
        status: n8nData.status,
        hasDirectAnswer: Boolean(directAnswer),
      });

      return {
        answer: directAnswer || 'Working on it…',
        meta: {
          runID: runIdStr,
          pipelineID: pipelineId ? String(pipelineId) : undefined,
        },
      };
    }

    // Direct answer from n8n (no runId to track)
    if (directAnswer) {
      console.log('Direct answer from n8n:', directAnswer);
      return {
        answer: directAnswer,
        meta: {
          pipelineID: pipelineId ? String(pipelineId) : undefined,
        },
      };
    }

    // Fallback: show stringified response so user can see what n8n returned
    console.warn('Unexpected n8n response shape:', n8nData);
    return {
      answer: JSON.stringify(n8nData, null, 2),
      meta: { raw: n8nData as Record<string, unknown> },
    };
  } catch (error) {
    console.error('Error sending message to n8n:', error);
    throw error;
  }
}

export async function checkHealth(): Promise<{ status: string }> {
  return { status: 'ok' };
}

