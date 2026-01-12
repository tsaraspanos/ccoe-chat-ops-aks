# Multi-stage Dockerfile for standalone SSE Chat UI
FROM --platform=linux/amd64 node:18-alpine AS frontend-builder
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
RUN npm run build

FROM --platform=linux/amd64 node:18-alpine AS backend-builder
WORKDIR /app/server
COPY server/package.json ./
RUN npm install
COPY server/src ./src
COPY server/tsconfig.json ./
RUN npm run build

FROM --platform=linux/amd64 node:18-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache dumb-init
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
COPY --from=frontend-builder /app/dist ./dist
COPY server/package.json ./server/
WORKDIR /app/server
RUN npm install --omit=dev
COPY --from=backend-builder /app/server/dist ./dist
RUN chown -R nodejs:nodejs /app
USER nodejs
EXPOSE 8080
ENV NODE_ENV=production PORT=8080
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
