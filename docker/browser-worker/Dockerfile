# Production Isolated Browser Worker Container for Sofia AI
FROM mcr.microsoft.com/playwright:v1.49.0-noble

# Set environment
ENV NODE_ENV=production
ENV BROWSER_WORKER_PORT=9222
ENV BROWSER_WORKER_HOST=0.0.0.0

ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

WORKDIR /app

# Copy dependency manifests
COPY package.json pnpm-lock.yaml* ./

# Install dependencies including playwright and tsx
RUN npm install -g pnpm tsx && pnpm install --frozen-lockfile

# Copy worker application code
COPY tsconfig.json ./
COPY src/lib/browser/ src/lib/browser/
COPY src/server/ src/server/
COPY scripts/browser-worker.ts scripts/

# Set up non-root user and restricted permissions
RUN chown -R pwuser:pwuser /app

# Switch to non-root user
USER pwuser

# Expose private worker port
EXPOSE 9222

# Healthcheck
HEALTHCHECK --interval=15s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "http.get('http://127.0.0.1:9222/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

CMD ["tsx", "scripts/browser-worker.ts"]
