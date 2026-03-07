FROM node:20-alpine AS builder

WORKDIR /app

# API URL for browser (used when opening app from other PCs)
ARG NEXT_PUBLIC_API_URL=http://localhost:8000/api
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

# Copy package files
COPY package*.json ./
RUN npm ci

# Copy source code
COPY . .

# Build the application (bakes NEXT_PUBLIC_API_URL into the bundle)
RUN npm run build

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Copy necessary files from builder
# Next.js standalone output - copies the entire standalone directory
COPY --from=builder /app/.next/standalone ./
# Copy static files
COPY --from=builder /app/.next/static ./.next/static
# Copy public folder
COPY --from=builder /app/public ./public
# Copy messages for i18n
COPY --from=builder /app/messages ./messages

# Expose port
EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Run the application
# In standalone mode, server.js is at the root of standalone directory
CMD ["node", "server.js"]
