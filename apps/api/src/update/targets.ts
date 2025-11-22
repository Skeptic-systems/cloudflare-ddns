import { AppConfig } from "../config";
import { CloudflareClient, CloudflareDnsRecord, CloudflareZone } from "../cloudflare/client";
import { logger } from "../logger";

export type ZoneHostTargets = {
  readonly zone: CloudflareZone;
  readonly hostnames: readonly string[];
};

const HOST_RECORD_TYPES: ReadonlySet<CloudflareDnsRecord["type"]> = new Set(["A", "AAAA", "CNAME"]);

const normalizeHostname = (value: string): string => value.trim().toLowerCase();

const appendHostname = (
  buckets: Map<string, Map<string, string>>,
  zoneId: string,
  hostname: string
): Map<string, Map<string, string>> => {
  const canonical = normalizeHostname(hostname);
  const bucket = buckets.get(zoneId) ?? new Map<string, string>();
  if (!bucket.has(canonical)) {
    bucket.set(canonical, hostname);
  }
  buckets.set(zoneId, bucket);
  return buckets;
};

const findZoneForHostname = (hostname: string, zones: readonly CloudflareZone[]): CloudflareZone | null => {
  const canonical = normalizeHostname(hostname);
  let match: CloudflareZone | null = null;
  for (const zone of zones) {
    const zoneName = normalizeHostname(zone.name);
    if (canonical === zoneName || canonical.endsWith(`.${zoneName}`)) {
      if (match === null || zoneName.length > normalizeHostname(match.name).length) {
        match = zone;
      }
    }
  }
  return match;
};

const isBlacklisted = (hostname: string, blacklist: ReadonlySet<string>): boolean => {
  const canonical = normalizeHostname(hostname);
  return blacklist.has(canonical);
};

const collectHostnamesFromZoneRecords = (
  records: readonly CloudflareDnsRecord[],
  blacklist: ReadonlySet<string>
): readonly string[] => {
  const bucket = new Map<string, string>();
  for (const record of records) {
    if (!HOST_RECORD_TYPES.has(record.type)) {
      continue;
    }
    if (isBlacklisted(record.name, blacklist)) {
      continue;
    }
    const canonical = normalizeHostname(record.name);
    if (!bucket.has(canonical)) {
      bucket.set(canonical, record.name);
    }
  }
  return Array.from(bucket.values());
};

export const collectZoneTargets = async (client: CloudflareClient, config: AppConfig): Promise<readonly ZoneHostTargets[]> => {
  const zones = await client.listZones();
  if (zones.length === 0) {
    throw new Error("No Cloudflare zones available for the configured token");
  }
  logger.info("🔍 Domain discovery started", {
    availableZones: zones.length,
    hostnameTargets: config.hostnameTargets.length,
    zoneTargets: config.zoneTargets.length
  });
  const buckets = new Map<string, Map<string, string>>();
  const blacklist: ReadonlySet<string> = new Set<string>(config.blacklist.map(normalizeHostname));
  const zonesByName = new Map<string, CloudflareZone>(
    zones.map((zone) => [normalizeHostname(zone.name), zone] as const)
  );
  const zonesById = new Map<string, CloudflareZone>(zones.map((zone) => [zone.id, zone] as const));

  for (const hostname of config.hostnameTargets) {
    if (isBlacklisted(hostname, blacklist)) {
      continue;
    }
    const zone = findZoneForHostname(hostname, zones);
    if (zone === null) {
      throw new Error(`No Cloudflare zone found for hostname ${hostname}`);
    }
    appendHostname(buckets, zone.id, hostname);
  }

  for (const zoneName of config.zoneTargets) {
    const normalizedZoneName = normalizeHostname(zoneName);
    const zone = zonesByName.get(normalizedZoneName);
    if (zone === undefined) {
      throw new Error(`No Cloudflare zone found for domain ${zoneName}`);
    }
    appendHostname(buckets, zone.id, zone.name);
    const records = await client.listDnsRecords(zone.id);
    const names = collectHostnamesFromZoneRecords(records, blacklist);
    for (const name of names) {
      appendHostname(buckets, zone.id, name);
    }
    logger.info("📁 Zone inspected", {
      zone: zone.name,
      discoveredHostnames: names.length + 1
    });
  }

  const results = Array.from(buckets.entries()).map(([zoneId, hostnames]) => {
    const zone = zonesById.get(zoneId);
    if (zone === undefined) {
      throw new Error(`Missing zone metadata for ${zoneId}`);
    }
    return {
      zone,
      hostnames: Array.from(hostnames.values()).sort()
    };
  });

  const totalHostnames = results.reduce((count, entry) => count + entry.hostnames.length, 0);
  logger.info("✅ Domains discovered", {
    zoneCount: results.length,
    hostnameCount: totalHostnames
  });

  return results;
};

