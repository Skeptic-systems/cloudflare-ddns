import { AppConfig } from "../config";
import {
  CloudflareClient,
  CloudflareDnsRecord,
  CloudflareDnsRecordType,
  DnsRecordInput
} from "../cloudflare/client";
import { ResolvedIpAddresses } from "./ip-resolver";

export type RecordChangeKind = "create" | "update" | "delete" | "skip";

export type RecordChange = {
  readonly kind: RecordChangeKind;
  readonly recordType: CloudflareDnsRecordType;
  readonly hostname: string;
  readonly zoneId: string;
  readonly zoneName: string;
  readonly reason?: string;
};

type PartitionedRecords = {
  readonly aRecords: CloudflareDnsRecord[];
  readonly aaaaRecords: CloudflareDnsRecord[];
  readonly cnameRecords: CloudflareDnsRecord[];
};

const AUTO_TTL = 1;

const partitionRecords = (records: readonly CloudflareDnsRecord[]): PartitionedRecords => {
  const aRecords: CloudflareDnsRecord[] = [];
  const aaaaRecords: CloudflareDnsRecord[] = [];
  const cnameRecords: CloudflareDnsRecord[] = [];
  for (const record of records) {
    if (record.type === "A") {
      aRecords.push(record);
      continue;
    }
    if (record.type === "AAAA") {
      aaaaRecords.push(record);
      continue;
    }
    if (record.type === "CNAME") {
      cnameRecords.push(record);
    }
  }
  return { aRecords, aaaaRecords, cnameRecords };
};

const shouldUpdate = (existing: CloudflareDnsRecord, desired: DnsRecordInput): boolean => {
  if (existing.content !== desired.content) {
    return true;
  }
  if (existing.proxied !== desired.proxied) {
    return true;
  }
  if (existing.ttl !== desired.ttl) {
    return true;
  }
  return false;
};

const deleteRecords = async (
  client: CloudflareClient,
  zoneId: string,
  zoneName: string,
  hostname: string,
  records: readonly CloudflareDnsRecord[]
): Promise<readonly RecordChange[]> => {
  const changes: RecordChange[] = [];
  for (const record of records) {
    await client.deleteDnsRecord(zoneId, record.id);
    changes.push({
      kind: "delete",
      recordType: record.type,
      hostname,
      zoneId,
      zoneName
    });
  }
  return changes;
};

const ensureRecord = async (
  client: CloudflareClient,
  zoneId: string,
  zoneName: string,
  hostname: string,
  desired: DnsRecordInput,
  existingRecords: readonly CloudflareDnsRecord[]
): Promise<readonly RecordChange[]> => {
  const changes: RecordChange[] = [];
  if (existingRecords.length === 0) {
    const created = await client.createDnsRecord(zoneId, desired);
    changes.push({
      kind: "create",
      recordType: created.type,
      hostname,
      zoneId,
      zoneName
    });
    return changes;
  }

  const [primary, ...duplicates] = existingRecords;
  if (shouldUpdate(primary, desired)) {
    const updated = await client.updateDnsRecord(zoneId, primary.id, desired);
    changes.push({
      kind: "update",
      recordType: updated.type,
      hostname,
      zoneId,
      zoneName
    });
  } else {
    changes.push({
      kind: "skip",
      recordType: primary.type,
      hostname,
      zoneId,
      zoneName,
      reason: "unchanged"
    });
  }
  const duplicateChanges = await deleteRecords(client, zoneId, zoneName, hostname, duplicates);
  return changes.concat(duplicateChanges);
};

export const reconcileHostname = async (
  client: CloudflareClient,
  config: AppConfig,
  zoneId: string,
  zoneName: string,
  hostname: string,
  ips: ResolvedIpAddresses
): Promise<readonly RecordChange[]> => {
  const records = await client.listDnsRecords(zoneId, { name: hostname });
  const { aRecords, aaaaRecords, cnameRecords } = partitionRecords(records);
  const changes: RecordChange[] = [];

  if (cnameRecords.length > 0) {
    const deleted = await deleteRecords(client, zoneId, zoneName, hostname, cnameRecords);
    changes.push(...deleted);
  }

  if (config.includeIPv4) {
    if (ips.ipv4 === undefined) {
      throw new Error("IPv4 address not resolved");
    }
    const desired: DnsRecordInput = {
      type: "A",
      name: hostname,
      content: ips.ipv4,
      proxied: config.proxied,
      ttl: AUTO_TTL
    };
    const applied = await ensureRecord(client, zoneId, zoneName, hostname, desired, aRecords);
    changes.push(...applied);
  } else if (aRecords.length > 0) {
    const deleted = await deleteRecords(client, zoneId, zoneName, hostname, aRecords);
    changes.push(...deleted);
  }

  if (config.includeIPv6) {
    if (ips.ipv6 === undefined) {
      throw new Error("IPv6 address not resolved");
    }
    const desired: DnsRecordInput = {
      type: "AAAA",
      name: hostname,
      content: ips.ipv6,
      proxied: config.proxied,
      ttl: AUTO_TTL
    };
    const applied = await ensureRecord(client, zoneId, zoneName, hostname, desired, aaaaRecords);
    changes.push(...applied);
  } else if (aaaaRecords.length > 0) {
    const deleted = await deleteRecords(client, zoneId, zoneName, hostname, aaaaRecords);
    changes.push(...deleted);
  }

  return changes;
};

