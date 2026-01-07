import { ChatRequest, ChatResponse } from '@/types/chat';

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

// Demo mode: when no backend is available, simulate responses
const DEMO_MODE = !API_BASE_URL;

const DEMO_RESPONSES = [
  "Hello! I'm your AI assistant. I can help you with various tasks, answer questions, and have meaningful conversations. What would you like to discuss today?",
  "That's a great question! Let me think about this for a moment. Based on what you've shared, I'd suggest exploring a few different angles to approach this effectively.",
  "I understand what you're asking. Here's my perspective on this: the key factors to consider are context, timing, and your specific goals. Would you like me to elaborate on any of these?",
  "Thanks for sharing that with me! I've processed the information you provided. Is there anything specific you'd like me to help you with based on this?",
  "Interesting point! I appreciate you bringing this up. Let me provide some insights that might be helpful for your situation.",
];

function getRandomResponse(): string {
  return DEMO_RESPONSES[Math.floor(Math.random() * DEMO_RESPONSES.length)];
}

async function simulateDelay(): Promise<void> {
  const delay = 800 + Math.random() * 1200;
  return new Promise(resolve => setTimeout(resolve, delay));
}

export async function sendChatMessage(request: ChatRequest): Promise<ChatResponse> {
  // Demo mode for testing without backend
  if (DEMO_MODE) {
    await simulateDelay();
    
    let response = getRandomResponse();
    
    if (request.files && request.files.length > 0) {
      response = `I received ${request.files.length} file(s): ${request.files.map(f => f.name).join(', ')}. ${response}`;
    }
    
    if (request.voice) {
      response = `I received your voice message. ${response}`;
    }
    
    return {
      answer: response,
      meta: { toolCalls: [], raw: {} }
    };
  }

  const hasFiles = (request.files && request.files.length > 0) || request.voice;

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

    const response = await fetch(`${API_BASE_URL}/api/chat`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Chat request failed: ${response.statusText}`);
    }

    return response.json();
  } else {
    // JSON for text-only messages
    const response = await fetch(`${API_BASE_URL}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sessionId: request.sessionId,
        message: request.message,
        attachments: [],
        voice: null,
      }),
    });

    if (!response.ok) {
      throw new Error(`Chat request failed: ${response.statusText}`);
    }

    return response.json();
  }
}

export async function checkHealth(): Promise<{ status: string }> {
  if (DEMO_MODE) {
    return { status: 'ok' };
  }
  
  const response = await fetch(`${API_BASE_URL}/health`);
  if (!response.ok) {
    throw new Error('Health check failed');
  }
  return response.json();
}
