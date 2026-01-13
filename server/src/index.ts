import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import healthRouter from './routes/health';
import webhookRouter from './routes/webhook';

const app = express();
const PORT = process.env.PORT || 8080;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';

// Runtime configuration to inject into frontend
const runtimeConfig = {
  AZURE_CLIENT_ID: process.env.AZURE_CLIENT_ID || '',
  AZURE_TENANT_ID: process.env.AZURE_TENANT_ID || '',
  N8N_WEBHOOK_URL: process.env.N8N_WEBHOOK_URL || '',
};

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
app.use(express.static(staticPath, { index: false })); // Don't auto-serve index.html

// Catch-all: serve index.html with injected runtime config
app.get('*', (_req, res) => {
  const indexPath = path.join(staticPath, 'index.html');
  
  fs.readFile(indexPath, 'utf8', (err, html) => {
    if (err) {
      console.error('Error reading index.html:', err);
      return res.status(500).send('Server error');
    }
    
    // Inject runtime config as a script tag before closing </head>
    const runtimeScript = `<script>window.__RUNTIME_CONFIG__ = ${JSON.stringify(runtimeConfig)};</script>`;
    const modifiedHtml = html.replace('</head>', `${runtimeScript}</head>`);
    
    res.send(modifiedHtml);
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Chat UI server running on port ${PORT}`);
  console.log(`   Health check: http://localhost:${PORT}/health`);
  console.log(`   Webhook endpoint: http://localhost:${PORT}/api/webhook/update`);
  console.log(`   Allowed Origin: ${ALLOWED_ORIGIN}`);
  console.log(`   Runtime config keys: ${Object.keys(runtimeConfig).join(', ')}`);
});
