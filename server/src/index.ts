import express from 'express';
import cors from 'cors';
import path from 'path';
import healthRouter from './routes/health';
import webhookRouter from './routes/webhook';

const app = express();
const PORT = process.env.PORT || 8080;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';

// CORS configuration
app.use(cors({
  origin: ALLOWED_ORIGIN === '*' ? true : ALLOWED_ORIGIN,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Parse JSON bodies
app.use(express.json());

// Health check endpoint
app.use('/health', healthRouter);

// Webhook endpoint for n8n to push updates
app.use('/api/webhook', webhookRouter);

// Serve static frontend files in production
const staticPath = path.join(__dirname, '../../dist');
app.use(express.static(staticPath));

// Catch-all: serve index.html for SPA routing
app.get('*', (_req, res) => {
  res.sendFile(path.join(staticPath, 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Chat UI server running on port ${PORT}`);
  console.log(`   Health check: http://localhost:${PORT}/health`);
  console.log(`   Webhook endpoint: http://localhost:${PORT}/api/webhook/update`);
  console.log(`   Allowed Origin: ${ALLOWED_ORIGIN}`);
});
