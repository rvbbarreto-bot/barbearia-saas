# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# ARG permite injetar variáveis VITE_ em build-time via docker-compose args
ARG VITE_DEFAULT_TENANT_ID
ENV VITE_DEFAULT_TENANT_ID=${VITE_DEFAULT_TENANT_ID}

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ── Stage 2: serve estático com nginx ─────────────────────────────────────────
FROM nginx:1.27-alpine AS runner

RUN apk add --no-cache curl

# Configuração customizada do nginx (proxy reverso para API + SPA fallback)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Artefatos de build do Vite
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=5 \
  CMD curl -fsS http://127.0.0.1/ >/dev/null || exit 1

CMD ["nginx", "-g", "daemon off;"]
