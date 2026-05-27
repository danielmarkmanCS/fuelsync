FROM node:20-alpine AS builder
WORKDIR /app

# Install web app dependencies
COPY apps/web/package*.json ./apps/web/
RUN cd apps/web && npm ci --legacy-peer-deps

# Copy source: web app + shared types
COPY apps/web        ./apps/web
COPY shared          ./shared

# Build
RUN cd apps/web && npm run build

# ─── Serve ───────────────────────────────────────────────────────────────────
FROM nginx:alpine
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
