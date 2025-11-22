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
ARG INCLUDE_IPV4=true
ARG INCLUDE_IPV6=false
ARG CLOUDFLARE_PROXIED=true
ARG UPDATE_INTERVAL_SECONDS=300
ARG TARGET_HOSTNAMES="placeholder.example.com"
ARG TARGET_ZONES="placeholder.zone"
ARG BLACKLIST_HOSTNAMES=""
ENV CLOUDFLARE_API_TOKEN=${CLOUDFLARE_API_TOKEN}
ENV INCLUDE_IPV4=${INCLUDE_IPV4}
ENV INCLUDE_IPV6=${INCLUDE_IPV6}
ENV CLOUDFLARE_PROXIED=${CLOUDFLARE_PROXIED}
ENV UPDATE_INTERVAL_SECONDS=${UPDATE_INTERVAL_SECONDS}
ENV TARGET_HOSTNAMES=${TARGET_HOSTNAMES}
ENV TARGET_ZONES=${TARGET_ZONES}
ENV BLACKLIST_HOSTNAMES=${BLACKLIST_HOSTNAMES}
ENV CI=true
COPY . .
RUN pnpm build
RUN pnpm prune --prod

FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY --from=builder /app/apps/www/.next/standalone ./
COPY --from=builder /app/apps/www/.next/static ./apps/www/.next/static
COPY --from=builder /app/apps/api/dist ./apps/api/dist

EXPOSE 3000

CMD ["node", "server.js"]

