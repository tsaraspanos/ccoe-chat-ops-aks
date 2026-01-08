import { ChatRequest, ChatResponse } from '@/types/chat';

const N8N_WEBHOOK_URL = 'https://tsaraspanos.app.n8n.cloud/webhook/chat-ui-trigger';

export async function sendChatMessage(request: ChatRequest): Promise<ChatResponse> {
  const hasFiles = (request.files && request.files.length > 0) || request.voice;

  try {
    if (hasFiles) {
      // Multipart form data for file uploads
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

      const response = await fetch(N8N_WEBHOOK_URL, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Chat request failed: ${response.statusText}`);
      }

      const data = await response.json();
      // Handle n8n async response format
      if (data.answer) {
        return data;
      }
      return { answer: data.message || 'Message sent', meta: {} };
    } else {
      // Use multipart/form-data even for text-only messages to avoid CORS preflight issues
      const formData = new FormData();
      formData.append('sessionId', request.sessionId);

      if (request.message) {
        formData.append('message', request.message);
      }

      const response = await fetch(N8N_WEBHOOK_URL, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Chat request failed: ${response.statusText}`);
      }

      const data = await response.json();
      // Handle n8n async response format
      if (data.answer) {
        return data;
      }
      return { answer: data.message || 'Message sent', meta: {} };
    }
  } catch (error) {
    console.error('Error sending message to n8n:', error);
    throw error;
  }
}

export async function checkHealth(): Promise<{ status: string }> {
  return { status: 'ok' };
}
