# syntax=docker/dockerfile:1.7

FROM node:20-alpine AS deps
WORKDIR /app
RUN corepack enable

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/www/package.json apps/www/

RUN pnpm install --frozen-lockfile

FROM deps AS builder
ARG CLOUDFLARE_API_TOKEN=placeholder-token
ENV CLOUDFLARE_API_TOKEN=${CLOUDFLARE_API_TOKEN}
COPY . .
RUN pnpm build
RUN pnpm prune --prod

FROM node:20-alpine AS runner
WORKDIR /app
RUN corepack enable

ENV NODE_ENV=production
ENV PORT=3000

COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-workspace.yaml ./
COPY --from=builder /app/pnpm-lock.yaml ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/package.json ./apps/api/
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/www/package.json ./apps/www/
COPY --from=builder /app/apps/www/next.config.mjs ./apps/www/
COPY --from=builder /app/apps/www/.next ./apps/www/.next

EXPOSE 3000

CMD ["pnpm", "--dir", "apps/www", "start"]

