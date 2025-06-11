# Build stage
FROM node:22-alpine AS builder

# Add labels for metadata
LABEL maintainer="your-email@domain.com"
LABEL description="MCP Collections Email Server"
LABEL version="1.0.0"

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies and run security audit
RUN npm ci && \
    npm audit --production --audit-level=high && \
    npm cache clean --force

# Copy source code
COPY tsconfig.json ./
COPY src ./src

# Build TypeScript
RUN npm run build

# Production stage
FROM node:22-alpine

# Install dumb-init for proper signal handling and curl for health checks
RUN apk add --no-cache dumb-init curl

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

# Create necessary directories
RUN mkdir -p /app/temp && \
    chown -R nodejs:nodejs /app

# Copy package files and install production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev && \
    npm audit --production --audit-level=high && \
    npm cache clean --force

# Copy built application from builder
COPY --from=builder /app/dist ./dist

# Copy env example for reference
COPY .env.example ./

# Change ownership to nodejs user
RUN chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose port 80 for webhook server
EXPOSE 80

# Add health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:80/health || exit 1

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "dist/index.js"]