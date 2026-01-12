# =============================================================================
# Stage 1: Build Frontend
# =============================================================================
FROM node:18-alpine AS frontend-builder

WORKDIR /app

# Accept build-time env vars for Vite
ARG VITE_N8N_WEBHOOK_URL
ENV VITE_N8N_WEBHOOK_URL=$VITE_N8N_WEBHOOK_URL

# Copy frontend package files
COPY package.json package-lock.json* ./

# Install frontend dependencies
RUN npm ci || npm install

# Copy frontend source
COPY . .

# Build frontend (Vite will bake VITE_* env vars into the bundle)
RUN npm run build

# =============================================================================
# Stage 2: Build Backend
# =============================================================================
FROM node:18-alpine AS backend-builder

WORKDIR /app/server

# Copy backend package files
COPY server/package.json ./

# Install backend dependencies (using npm install since no lock file)
RUN npm install

# Copy backend source
COPY server/src ./src
COPY server/tsconfig.json ./

# Build backend
RUN npm run build

# =============================================================================
# Stage 3: Production Runtime
# =============================================================================
FROM node:18-alpine AS runtime

WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy built frontend from frontend-builder
COPY --from=frontend-builder /app/dist ./dist

# Copy backend package files and install production dependencies
COPY server/package.json ./server/
WORKDIR /app/server
RUN npm install --omit=dev

# Copy built backend from backend-builder
COPY --from=backend-builder /app/server/dist ./dist

# Set ownership
RUN chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Set working directory back to server
WORKDIR /app/server

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

# Set default environment variables
ENV NODE_ENV=production
ENV PORT=8080

# Start the server
CMD ["node", "dist/index.js"]
