# Cloudflare DDNS

Cloudflare DDNS is a TypeScript-based dynamic DNS updater built as a pnpm monorepo containing two applications:

- **API worker (`apps/api`)** – reconciles A/AAAA records via the Cloudflare REST API, tracks execution summaries, and runs on a configurable schedule.
- **Dashboard (`apps/www`)** – a dark-mode Next.js 14 UI that surfaces the scheduler state, configured targets, recent record changes, and exposes a manual update button.

You can deploy the stack either as a single container (API + UI) or as a standalone API worker.

## Architecture

- **Cloudflare REST API** is the only external dependency. Authentication uses an API token with DNS edit permissions.
- **API worker**
  - Loads configuration from environment variables (see `env.example`).
  - Resolves the public IPv4/IPv6 addresses based on the provided flags.
  - Converts CNAME records to A/AAAA when required, removes stale entries, and respects blacklisted hosts.
  - Scheduler runs immediately on startup and then according to `UPDATE_INTERVAL_SECONDS`.
  - Shipped as the npm package `@cloudflare-ddns/api`.
- **Dashboard**
  - Fetches initial status during SSR.
  - Polls `/api/status` every 15 seconds; errors leave the previous state visible.
  - "Run Update Now" invokes the scheduler trigger and refreshes data afterward.
  - Displays intervals, record counts, Cloudflare error details, hostnames, and zones.
- **Deployment**
  - Multi-stage Dockerfiles exist for the full stack (`dockerfile`) and API only (`apps/api/Dockerfile`).
  - GitHub workflow `docker-images.yml` builds and publishes Docker Hub images with auto-incremented semantic versions.

## Features

- IPv4 and IPv6 record management (individually toggleable).
- Zone-wide discovery with blacklist handling.
- Detailed logging per record action (create/update/delete/skip).
- Dark-mode dashboard without authentication (homelab friendly).
- Docker and Docker Compose support out of the box.

## Requirements

- Node.js ≥ 20 and pnpm ≥ 8 for local development.
- Cloudflare API token with DNS edit permissions.
- Docker / Docker Compose for container deployments.

## Configuration

Environment variables are documented in `env.example`:

| Variable | Required | Description |
|----------|----------|-------------|
| `CLOUDFLARE_API_TOKEN` | ✅ | Bearer token for the Cloudflare REST API |
| `TARGET_HOSTNAMES` | ✅/optional | Comma-separated hostnames (subdomains) |
| `TARGET_ZONES` | ✅/optional | Comma-separated zones (e.g. `example.com`) |
| `BLACKLIST_HOSTNAMES` | optional | Hostnames skipped during zone discovery |
| `INCLUDE_IPV4` | optional (default `true`) | Maintain IPv4 records |
| `INCLUDE_IPV6` | optional (default `false`) | Maintain IPv6 records |
| `CLOUDFLARE_PROXIED` | optional (default `true`) | Apply the Cloudflare proxy flag |
| `UPDATE_INTERVAL_SECONDS` | optional (default `300`) | Scheduler interval |

> Either `TARGET_HOSTNAMES` or `TARGET_ZONES` (or both) must be specified. The worker exits if both are empty.

## Local Development

```bash
pnpm install

# Start the dashboard (Next.js dev server)
pnpm dev

# Run the API worker separately
pnpm api:dev
```

Build commands:

```bash
pnpm build        # builds API + dashboard
pnpm api:build    # builds API only
pnpm www:build    # builds dashboard only
```

## Docker Images

Published on Docker Hub:

- `skepticsystems/cloudflare-ddns` – full stack (API + dashboard, exposes port 3000).
- `skepticsystems/cloudflare-ddns-api` – headless API worker.

### Docker Compose – Full Stack (UI + API)

```yaml
services:
  cloudflare-ddns:
    image: skepticsystems/cloudflare-ddns:latest
    restart: unless-stopped
    container_name: cloudflare-ddns
    ports:
      - "3000:3000"
    environment:
      CLOUDFLARE_API_TOKEN: "your-api-token"
      TARGET_HOSTNAMES: "1example.com,2example.com"
      TARGET_ZONES: "full-domain.com"
      BLACKLIST_HOSTNAMES: ""
      INCLUDE_IPV4: "true"
      INCLUDE_IPV6: "false"
      CLOUDFLARE_PROXIED: "true"
      UPDATE_INTERVAL_SECONDS: "300"
```

### Docker Compose – API Only

```yaml
services:
  cloudflare-ddns:
    image: skepticsystems/cloudflare-ddns-api:latest
    restart: unless-stopped
    container_name: cloudflare-ddns
    environment:
      CLOUDFLARE_API_TOKEN: "your-api-token"
      TARGET_HOSTNAMES: "1example.com,2example.com"
      TARGET_ZONES: "full-domain.com"
      BLACKLIST_HOSTNAMES: ""
      INCLUDE_IPV4: "true"
      INCLUDE_IPV6: "false"
      CLOUDFLARE_PROXIED: "true"
      UPDATE_INTERVAL_SECONDS: "300"
```

### Deployment Steps

1. Provide real values via `.env` or Compose `environment`.
2. Run `docker compose pull` to fetch the latest image.
3. Run `docker compose up -d` to start or update the container.
4. Inspect logs with `docker logs cloudflare-ddns`.
5. Access the dashboard at `http://<host>:3000`.

## GitHub Workflow

The `Build and Push Docker Images` workflow (triggered via `workflow_dispatch`) publishes Docker images:

- `target=both` (default) builds full stack and API images.
- `target=full` builds the full stack image only.
- `target=api` builds the API image only.

Versioning reads the latest Docker Hub tags (`cloudflare-ddns`, `cloudflare-ddns-api`) and increments the minor version. Required secrets:

- `DOCKERHUB_USERNAME`
- `DOCKERHUB_TOKEN`

## Troubleshooting

- **Dashboard shows placeholders (`placeholder.example.com`)**  
  The container started with placeholder build-time values. Ensure Compose injects the actual environment variables and restart the service.

- **"Run Update Now" clears the UI after a few seconds**  
  The `/api/status` poll is failing. Check the browser console and backend logs (`docker logs cloudflare-ddns`) for configuration or Cloudflare API errors.

- **API does not start**  
  `CLOUDFLARE_API_TOKEN` is mandatory. For the full stack image, confirm that TCP port 3000 is reachable.

- **Docker build fails**  
  Supply the required env vars when building locally (e.g. copy `env.example` to `.env`). The Dockerfiles already provide safe defaults for CI builds.

## License

This project is released under the MIT License.