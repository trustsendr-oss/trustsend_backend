# Multi-stage build for AdonisJS application
# Stage 1: Build
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build -- --ignore-ts-errors

# Stage 2: Runtime
FROM node:22-alpine
WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

# Copy built application and node_modules from builder
COPY --from=builder /app/build ./build
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./

# Set non-root user
USER nodejs

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3333/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Default command (can be overridden to run worker instead of API server)
CMD ["node", "build/bin/server.js"]
