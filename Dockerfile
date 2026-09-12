# ==========================================
# Stage 1: Build application
# ==========================================
FROM node:22-alpine AS builder

WORKDIR /app

# Install build dependencies for native packages
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci

COPY . .

# Compile TypeScript into build/ (AdonisJS validates env variables at build time)
RUN NODE_ENV=production \
    PORT=3330 \
    HOST=0.0.0.0 \
    LOG_LEVEL=info \
    APP_KEY=dummy_build_key_32_characters_long_! \
    APP_URL=http://localhost:3330 \
    SESSION_DRIVER=cookie \
    DB_CONNECTION=pg \
    ENCRYPTION_KEY=dummy_build_key_32_characters_long_! \
    SMTP_HOST=localhost \
    SMTP_PORT=587 \
    SMTP_USERNAME=dummy \
    SMTP_PASSWORD=dummy \
    MAIL_FROM_ADDRESS=dummy@example.com \
    MAIL_FROM_NAME=dummy \
    npm run build -- --ignore-ts-errors

# ==========================================
# Stage 2: Production dependencies
# ==========================================
FROM node:22-alpine AS production-deps

WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY --from=builder /app/build/package*.json ./
RUN npm ci --omit=dev

# ==========================================
# Stage 3: Production runtime image
# ==========================================
FROM node:22-alpine AS runner

WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

# Copy production node_modules
COPY --from=production-deps --chown=nodejs:nodejs /app/node_modules ./node_modules

# Copy compiled application from build
COPY --from=builder --chown=nodejs:nodejs /app/build ./

# Create persistent storage directories with proper permissions
RUN mkdir -p /app/storage/kyc_documents /app/storage/card_art /app/tmp \
    && chown -R nodejs:nodejs /app/storage /app/tmp

USER nodejs

EXPOSE 3330

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3330

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "const req = require('http').get('http://127.0.0.1:3330/health', (res) => process.exit(res.statusCode === 200 ? 0 : 1)); req.on('error', () => process.exit(1));"

# Applique les migrations en attente avant de demarrer le serveur
CMD ["sh", "-c", "node ace migration:run --force && node bin/server.js"]
