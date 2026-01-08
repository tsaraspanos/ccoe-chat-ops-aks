import { ChatRequest, ChatResponse } from '@/types/chat';

const N8N_WEBHOOK_URL = 'https://tsaraspanos.app.n8n.cloud/webhook/chat-ui-trigger';

/**
 * Send chat message and wait for n8n workflow to complete.
 * n8n webhook must use "Respond to Webhook" node at the end.
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
    const response = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Chat request failed: ${response.statusText}. ${errorText}`);
    }

    const data = await response.json();

    // Handle n8n response
    if (data.answer) {
      return data;
    }

    // Fallback for different response formats
    return {
      answer: data.message || data.text || data.response || data.output || 'Response received',
      meta: data.meta || {},
    };
  } catch (error) {
    console.error('Error sending message to n8n:', error);
    throw error;
  }
}

export async function checkHealth(): Promise<{ status: string }> {
  return { status: 'ok' };
}
