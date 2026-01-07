import express from 'express';
import cors from 'cors';
import path from 'path';
import chatRouter from './routes/chat';
import healthRouter from './routes/health';

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

// Chat API endpoint
app.use('/api/chat', chatRouter);

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
  console.log(`   n8n Webhook: ${process.env.N8N_WEBHOOK_URL || 'NOT CONFIGURED'}`);
  console.log(`   Allowed Origin: ${ALLOWED_ORIGIN}`);
});
