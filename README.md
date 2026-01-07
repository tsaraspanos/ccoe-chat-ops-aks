# Chat UI Microservice

A production-ready full-stack TypeScript chat UI microservice designed for Azure Kubernetes Service (AKS). Features a React frontend with voice recording and file attachments, and an Express backend that integrates with n8n for AI-powered responses.

## Features

- 💬 **Real-time Chat UI** - Clean, modern interface with user/assistant message separation
- 🎤 **Voice Recording** - Browser-based voice recording using MediaRecorder API
- 📎 **File Attachments** - Support for multiple file uploads (images, PDFs, etc.)
- 🔗 **n8n Integration** - Webhook-based integration with n8n AI Agent workflows
- 🐳 **Docker Ready** - Multi-stage Dockerfile for production deployment
- ☸️ **Kubernetes Ready** - Deployment and Service manifests for AKS

## Tech Stack

- **Frontend**: React + TypeScript + Tailwind CSS
- **Backend**: Node.js + Express + TypeScript
- **Build**: Vite (frontend), tsc (backend)
- **Container**: Docker with multi-stage build

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `8080` | Server port |
| `N8N_WEBHOOK_URL` | Yes | - | n8n webhook endpoint URL |
| `ALLOWED_ORIGIN` | No | `*` | CORS allowed origin |

## Local Development

### Prerequisites

- Node.js 18+
- npm or yarn

### Running Locally

1. Clone the repository and install dependencies:

```bash
npm install
cd server && npm install
```

2. Set environment variables:

```bash
export N8N_WEBHOOK_URL="https://your-n8n-instance/webhook/chat-agent"
export ALLOWED_ORIGIN="http://localhost:5173"
```

3. Run development servers:

```bash
# Terminal 1: Frontend (Vite dev server)
npm run dev

# Terminal 2: Backend (Express server)
cd server && npm run dev
```

4. Open http://localhost:5173

### Building for Production

```bash
# Build frontend
npm run build

# Build backend
cd server && npm run build

# Start production server
cd server && npm start
```

## Docker

### Building the Image

```bash
docker build -t chat-ui:latest .
```

### Running the Container

```bash
docker run -p 8080:8080 \
  -e N8N_WEBHOOK_URL="https://your-n8n-instance/webhook/chat-agent" \
  -e ALLOWED_ORIGIN="https://your-frontend-domain.com" \
  chat-ui:latest
```

## Kubernetes Deployment (AKS)

### 1. Create Secrets

```bash
kubectl create secret generic chat-ui-secrets \
  --from-literal=n8n-webhook-url='https://your-n8n-instance/webhook/chat-agent'
```

### 2. Update Image Reference

Edit `k8s/deployment.yaml` and replace the image reference:

```yaml
image: myregistry.azurecr.io/chat-ui:1.0.0
```

### 3. Deploy

```bash
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
```

### 4. Verify Deployment

```bash
kubectl get pods -l app=chat-ui
kubectl get svc chat-ui
```

## n8n Integration Setup

1. Create a new workflow in n8n
2. Add a **Webhook** node as the trigger:
   - HTTP Method: POST
   - Path: `chat-agent`
   - Response Mode: `Last Node`
3. Add your AI Agent node (e.g., OpenAI, Claude, etc.)
4. Connect the webhook to your AI logic
5. Return a response in this format:

```json
{
  "answer": "Assistant reply text",
  "meta": {
    "toolCalls": [],
    "raw": {}
  }
}
```

6. Copy the webhook URL and set it as `N8N_WEBHOOK_URL`

## API Endpoints

### `GET /health`

Health check endpoint for Kubernetes probes.

**Response:**
```json
{ "status": "ok" }
```

### `POST /api/chat`

Send a chat message with optional attachments.

**Request (JSON - text only):**
```json
{
  "sessionId": "uuid",
  "message": "Hello, how can you help me?"
}
```

**Request (multipart/form-data):**
- `sessionId` (string) - Session identifier
- `message` (string, optional) - User message
- `files[]` (files, optional) - File attachments
- `voice` (file, optional) - Voice recording

**Response:**
```json
{
  "answer": "I can help you with...",
  "meta": {
    "toolCalls": [],
    "raw": {}
  }
}
```

## Project Structure

```
├── src/                    # Frontend source
│   ├── components/         # React components
│   │   └── chat/          # Chat-specific components
│   ├── hooks/             # Custom React hooks
│   ├── lib/               # Utilities and API client
│   ├── types/             # TypeScript types
│   └── pages/             # Page components
├── server/                 # Backend source
│   ├── src/
│   │   ├── integrations/  # External integrations (n8n)
│   │   ├── routes/        # Express routes
│   │   └── index.ts       # Server entry point
│   └── package.json
├── k8s/                    # Kubernetes manifests
│   ├── deployment.yaml
│   └── service.yaml
├── Dockerfile             # Multi-stage Docker build
└── README.md
```

## Extending Integrations

The backend is designed to easily add new integrations. To add a new AI provider:

1. Create a new client in `server/src/integrations/`:

```typescript
// server/src/integrations/myProvider.ts
export async function sendMessageToMyProvider(payload: ChatPayload): Promise<ChatResponse> {
  // Implementation
}
```

2. Update the chat route to use your new provider.

## License

MIT
