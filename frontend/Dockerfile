# Production image of the Next.js frontend (used by docker-compose.app.yml)
FROM node:22-slim

ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# Read at build time for the Content Security Policy (next.config.ts)
ARG PUBLIC_BACKEND_URL=http://localhost:8000
ENV PUBLIC_BACKEND_URL=$PUBLIC_BACKEND_URL
RUN npm run build && chown -R node:node .next

ENV NODE_ENV=production
USER node
EXPOSE 3000
# 0.0.0.0 inside the container; docker-compose.app.yml only publishes the port on localhost
CMD ["node_modules/.bin/next", "start", "-H", "0.0.0.0", "-p", "3000"]
