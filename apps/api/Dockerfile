# syntax=docker/dockerfile:1.7

FROM node:20-alpine AS deps
WORKDIR /app
RUN corepack enable

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/api/package.json apps/api/
RUN pnpm install --filter @cloudflare-ddns/api... --frozen-lockfile

FROM deps AS builder
COPY . .
ENV CI=true
RUN pnpm api:build
RUN pnpm install --filter @cloudflare-ddns/api... --prod --frozen-lockfile

FROM node:20-alpine AS runner
WORKDIR /app
RUN corepack enable

ENV NODE_ENV=production

COPY --from=builder /app/pnpm-lock.yaml ./
COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-workspace.yaml ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/package.json ./apps/api/
COPY --from=builder /app/apps/api/dist ./apps/api/dist

CMD ["pnpm", "--dir", "apps/api", "start"]

