# =============================================================================
# Chat UI - AKS Optimized Dockerfile
# This version uses internal SSE for real-time updates (no Supabase dependency)
# =============================================================================

# =============================================================================
# Stage 1: Build Frontend
# =============================================================================
FROM node:18-alpine AS frontend-builder

WORKDIR /app

# Copy package files from project root
COPY package.json package-lock.json* ./

# Install frontend dependencies
RUN npm ci

# Copy frontend source
COPY . .

# Copy AKS-specific source files (overwrite originals)
COPY aks-deploy/src/hooks/useChat.ts ./src/hooks/useChat.ts
COPY aks-deploy/src/hooks/useSSEUpdates.ts ./src/hooks/useSSEUpdates.ts
COPY aks-deploy/src/lib/api.ts ./src/lib/api.ts

# Build frontend with production optimizations
ENV NODE_ENV=production
RUN npm run build

# =============================================================================
# Stage 2: Build Backend
# =============================================================================
FROM node:18-alpine AS backend-builder

WORKDIR /app/server

# Copy backend package files
COPY server/package.json server/package-lock.json* ./

# Install backend dependencies
RUN npm ci

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

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy built frontend from frontend-builder
COPY --from=frontend-builder /app/dist ./dist

# Copy backend package files and install production dependencies
COPY server/package.json server/package-lock.json* ./server/
WORKDIR /app/server
RUN npm ci --omit=dev

# Copy built backend from backend-builder
COPY --from=backend-builder /app/server/dist ./dist

# Set ownership
RUN chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Set working directory
WORKDIR /app/server

# Expose port
EXPOSE 8080

# Health check for Kubernetes
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

# Environment variables
ENV NODE_ENV=production
ENV PORT=8080

# Use dumb-init as PID 1 for proper signal handling
ENTRYPOINT ["dumb-init", "--"]

# Start the server
CMD ["node", "dist/index.js"]
