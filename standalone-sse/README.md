# Standalone SSE Chat UI

This is a **standalone version** of the Chat UI designed for Docker/Kubernetes deployment without any cloud dependencies. It uses **Server-Sent Events (SSE)** for real-time updates instead of external services.

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                     Docker Container                          │
│  ┌────────────────────────────────────────────────────────┐  │
│  │                Express Server (Port 8080)               │  │
│  │  ┌──────────────┬─────────────────┬─────────────────┐  │  │
│  │  │   /health    │   /api/chat     │  /api/webhook   │  │  │
│  │  │  Health      │   Chat proxy    │  SSE streams    │  │  │
│  │  │  check       │   to n8n        │  + updates      │  │  │
│  │  └──────────────┴─────────────────┴─────────────────┘  │  │
│  │                         ↓                               │  │
│  │  ┌────────────────────────────────────────────────────┐│  │
│  │  │           Static React Frontend (dist/)            ││  │
│  │  └────────────────────────────────────────────────────┘│  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
                              ↕
                         n8n Webhook
```

## 📁 Project Structure

```
standalone-sse/
├── src/                      # Frontend source
│   ├── components/           # React UI components
│   │   └── chat/            # Chat-specific components
│   ├── hooks/               # React hooks (SSE-based)
│   ├── lib/                 # API layer
│   ├── types/               # TypeScript types
│   └── main.tsx             # App entry point
├── server/                   # Backend source
│   ├── src/
│   │   ├── routes/          # Express routes
│   │   ├── integrations/    # n8n client
│   │   └── index.ts         # Server entry
│   ├── package.json
│   └── tsconfig.json
├── public/                   # Static assets
├── Dockerfile               # Multi-stage Docker build
├── docker-compose.yml       # Local development
├── package.json             # Frontend dependencies
└── README.md                # This file
```

## 🚀 Quick Start

### Option 1: Docker Compose (Recommended for local testing)

```bash
cd standalone-sse

# Build and run
docker-compose up --build

# Access at http://localhost:8080
```

### Option 2: Docker Build Only

```bash
cd standalone-sse

# Build the image
docker build -t chat-ui-sse:latest .

# Run the container
docker run -p 8080:8080 \
  -e N8N_WEBHOOK_URL=http://your-n8n:5678/webhook/chat \
  chat-ui-sse:latest
```

### Option 3: Development Mode (without Docker)

```bash
# Terminal 1: Start backend
cd standalone-sse/server
npm install
npm run dev

# Terminal 2: Start frontend
cd standalone-sse
npm install
npm run dev

# Frontend: http://localhost:5173
# Backend: http://localhost:8080
```

## ⚙️ Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `8080` |
| `N8N_WEBHOOK_URL` | n8n webhook endpoint | `http://localhost:5678/webhook/chat` |
| `ALLOWED_ORIGIN` | CORS allowed origin | `*` |
| `NODE_ENV` | Environment | `production` |

## 🔄 How SSE Works

1. **User sends message** → Frontend calls n8n webhook
2. **n8n returns jobId** → Frontend subscribes to `/api/webhook/stream/{jobId}`
3. **n8n processes async** → When done, POSTs to `/api/webhook/update`
4. **Server pushes via SSE** → Frontend receives real-time update

### SSE Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/webhook/stream/:jobId` | GET | SSE stream for job updates |
| `/api/webhook/update` | POST | n8n pushes updates here |
| `/api/webhook/status/:jobId` | GET | Poll fallback for job status |

### n8n Webhook Response Format

When n8n triggers an async workflow:
```json
{
  "runID": "execution-123",
  "status": "in_progress",
  "answer": "Working on it..."
}
```

When n8n has a direct answer:
```json
{
  "answer": "Here's your response..."
}
```

### n8n Update Callback Format

n8n should POST to `/api/webhook/update`:
```json
{
  "jobId": "execution-123",
  "sessionId": "user-session-id",
  "status": "completed",
  "answer": "Here's the final response"
}
```

## 🐳 Docker Details

The Dockerfile uses a **multi-stage build**:

1. **Stage 1**: Build React frontend with Vite
2. **Stage 2**: Build Express backend with TypeScript
3. **Stage 3**: Minimal Alpine runtime with both

Final image size: ~150MB

### Health Check

The container includes a health check:
```bash
GET /health → { "status": "ok" }
```

## 🧪 Testing

### Test Health Endpoint
```bash
curl http://localhost:8080/health
```

### Test Chat API (without n8n)
```bash
curl -X POST http://localhost:8080/api/chat \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "test-123", "message": "Hello"}'
```

### Test SSE Stream
```bash
# In one terminal, listen to SSE:
curl -N http://localhost:8080/api/webhook/stream/test-job

# In another terminal, push an update:
curl -X POST http://localhost:8080/api/webhook/update \
  -H "Content-Type: application/json" \
  -d '{"jobId": "test-job", "status": "completed", "answer": "Done!"}'
```

## 📦 For AKS Deployment

This standalone project can be deployed to AKS by:

1. Build and push to ACR:
   ```bash
   docker build -t your-acr.azurecr.io/chat-ui-sse:v1.0.0 .
   docker push your-acr.azurecr.io/chat-ui-sse:v1.0.0
   ```

2. Apply Kubernetes manifests from `k8s/` folder

3. Configure n8n to POST updates to the internal service URL

See the main project's `aks-deploy/README.md` for detailed AKS instructions.

## 🔧 Troubleshooting

### SSE Not Connecting
- Check if the server is running on port 8080
- Verify CORS settings if accessing from different domain
- Check browser console for connection errors

### n8n Updates Not Received
- Verify n8n webhook URL is correct
- Check that n8n is POSTing to `/api/webhook/update`
- Look at server logs for incoming requests

### Docker Build Fails
- Ensure you're building with `--platform linux/amd64` on M1/ARM
- Check that all files in `src/` and `server/` exist
