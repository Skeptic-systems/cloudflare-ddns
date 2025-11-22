import { AppConfig } from "../config";
import { CloudflareClient } from "../cloudflare/client";
import { logger } from "../logger";
import { resolvePublicAddresses } from "./ip-resolver";
import { RecordChange, reconcileHostname } from "./reconcile";
import { collectZoneTargets } from "./targets";

export type UpdateSummary = {
  readonly timestamp: string;
  readonly durationMs: number;
  readonly zoneCount: number;
  readonly hostnameCount: number;
  readonly changes: readonly RecordChange[];
};

const summarizeChangeKinds = (entries: readonly RecordChange[]): Record<RecordChange["kind"], number> => {
  const counts: Record<RecordChange["kind"], number> = {
    create: 0,
    update: 0,
    delete: 0,
    skip: 0
  };
  for (const entry of entries) {
    counts[entry.kind] += 1;
  }
  return counts;
};

export const performUpdate = async (client: CloudflareClient, config: AppConfig): Promise<UpdateSummary> => {
  const startedAt = Date.now();
  logger.info("🚀 DNS update started");
  const ips = await resolvePublicAddresses(config.includeIPv4, config.includeIPv6);
  logger.info("🌐 Public IPs resolved", {
    ipv4: ips.ipv4 ?? null,
    ipv6: ips.ipv6 ?? null
  });
  const zoneTargets = await collectZoneTargets(client, config);
  const allChanges: RecordChange[] = [];
  let hostnameCount = 0;

  for (const { zone, hostnames } of zoneTargets) {
    logger.info("🛠 Updating zone", {
      zone: zone.name,
      hostnames: hostnames.length
    });
    const zoneChanges: RecordChange[] = [];
    for (const hostname of hostnames) {
      hostnameCount += 1;
      const changes = await reconcileHostname(client, config, zone.id, zone.name, hostname, ips);
      allChanges.push(...changes);
      zoneChanges.push(...changes);
    }
    const zoneSummary = summarizeChangeKinds(zoneChanges);
    logger.info("✅ Zone updated", {
      zone: zone.name,
      hostnames: hostnames.length,
      ...zoneSummary
    });
  }

  const finishedAt = Date.now();
  const summary: UpdateSummary = {
    timestamp: new Date(startedAt).toISOString(),
    durationMs: finishedAt - startedAt,
    zoneCount: zoneTargets.length,
    hostnameCount,
    changes: allChanges
  };
  const totalSummary = summarizeChangeKinds(allChanges);
  logger.info("🏁 DNS update finished", {
    durationMs: summary.durationMs,
    zoneCount: summary.zoneCount,
    hostnameCount: summary.hostnameCount,
    ...totalSummary
  });
  return summary;
};

