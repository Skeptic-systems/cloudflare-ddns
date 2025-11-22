import { config } from "./config";
import { CloudflareClient } from "./cloudflare/client";
import { logger } from "./logger";
import { createScheduler } from "./scheduler";

const client = new CloudflareClient(config.apiToken);
const scheduler = createScheduler(client, config);

let schedulerStarted = false;

const shouldAutoStart = process.env.NEXT_PHASE !== "phase-production-build";

export const ensureSchedulerStarted = (): void => {
  if (!shouldAutoStart) {
    return;
  }
  if (schedulerStarted) {
    return;
  }
  schedulerStarted = true;
  scheduler.start();
  logger.info("🛰️ DDNS worker running", {
    includeIPv4: config.includeIPv4,
    includeIPv6: config.includeIPv6,
    updateIntervalSeconds: config.updateIntervalSeconds,
    hostnameTargets: config.hostnameTargets.length,
    zoneTargets: config.zoneTargets.length
  });
};

if (shouldAutoStart) {
  ensureSchedulerStarted();
}

export { config, client, scheduler };

