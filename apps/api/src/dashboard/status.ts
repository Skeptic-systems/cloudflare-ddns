import type { CloudflareDnsRecordType, CloudflareErrorItem } from "../cloudflare/client";
import { config } from "../config";
import { ensureSchedulerStarted, scheduler } from "../runtime";
import type { SchedulerSnapshot } from "../scheduler";
import type { RecordChange, RecordChangeKind } from "../update/reconcile";
import type { UpdateSummary } from "../update";

export type RecordStatusSummary = {
  readonly recordType: CloudflareDnsRecordType;
  readonly kind: RecordChangeKind;
  readonly reason?: string;
};

export type HostStatusSummary = {
  readonly hostname: string;
  readonly zone: string;
  readonly records: readonly RecordStatusSummary[];
};

export type LastErrorSummary = {
  readonly timestamp: string;
  readonly message: string;
  readonly status?: number;
  readonly apiErrors: readonly CloudflareErrorItem[];
  readonly responseBody?: string;
};

export type LastSuccessSummary = {
  readonly timestamp: string;
  readonly durationMs: number;
  readonly zoneCount: number;
  readonly hostnameCount: number;
  readonly totals: Record<RecordChangeKind, number>;
};

export type DashboardStatus = {
  readonly generatedAt: string;
  readonly running: boolean;
  readonly includeIPv4: boolean;
  readonly includeIPv6: boolean;
  readonly proxied: boolean;
  readonly intervalSeconds: number;
  readonly hostnameTargets: readonly string[];
  readonly zoneTargets: readonly string[];
  readonly blacklist: readonly string[];
  readonly nextScheduledRun?: string | null;
  readonly lastSuccess?: LastSuccessSummary | null;
  readonly lastError?: LastErrorSummary | null;
  readonly hosts: readonly HostStatusSummary[];
};

const summarizeKinds = (changes: readonly RecordChange[]): Record<RecordChangeKind, number> => {
  return changes.reduce<Record<RecordChangeKind, number>>(
    (acc, change) => {
      acc[change.kind] = (acc[change.kind] ?? 0) + 1;
      return acc;
    },
    { create: 0, update: 0, delete: 0, skip: 0 }
  );
};

const buildHostStatuses = (changes: readonly RecordChange[]): HostStatusSummary[] => {
  const byHost = new Map<string, { hostname: string; zone: string; records: RecordStatusSummary[] }>();

  for (const change of changes) {
    const key = `${change.zoneName}::${change.hostname}`;
    const entry = byHost.get(key) ?? {
      hostname: change.hostname,
      zone: change.zoneName,
      records: []
    };

    entry.records.push({
      recordType: change.recordType,
      kind: change.kind,
      reason: change.reason
    });

    byHost.set(key, entry);
  }

  return Array.from(byHost.values())
    .map((host) => ({
      hostname: host.hostname,
      zone: host.zone,
      records: host.records.sort((a, b) => a.recordType.localeCompare(b.recordType))
    }))
    .sort((a, b) => a.hostname.localeCompare(b.hostname));
};

const computeNextRun = (summary: UpdateSummary | undefined | null, intervalSeconds: number): string | null => {
  if (summary === undefined || summary === null) {
    return null;
  }
  const startedAt = new Date(summary.timestamp).getTime();
  if (Number.isNaN(startedAt)) {
    return null;
  }
  return new Date(startedAt + intervalSeconds * 1000).toISOString();
};

const mapLastError = (snapshot: SchedulerSnapshot): LastErrorSummary | null => {
  if (snapshot.lastError === undefined) {
    return null;
  }
  return {
    timestamp: snapshot.lastError.timestamp,
    message: snapshot.lastError.message,
    status: snapshot.lastError.status,
    apiErrors: snapshot.lastError.apiErrors ?? [],
    responseBody: snapshot.lastError.responseBody ?? undefined
  };
};

export const getDashboardStatus = async (): Promise<DashboardStatus> => {
  ensureSchedulerStarted();
  const snapshot = scheduler.snapshot();
  const lastSuccess = snapshot.lastSuccess;

  const hosts = lastSuccess !== undefined ? buildHostStatuses(lastSuccess.changes) : [];
  const totals = lastSuccess !== undefined ? summarizeKinds(lastSuccess.changes) : { create: 0, update: 0, delete: 0, skip: 0 };

  const lastSuccessSummary: LastSuccessSummary | null =
    lastSuccess !== undefined
      ? {
          timestamp: lastSuccess.timestamp,
          durationMs: lastSuccess.durationMs,
          zoneCount: lastSuccess.zoneCount,
          hostnameCount: lastSuccess.hostnameCount,
          totals
        }
      : null;

  return {
    generatedAt: new Date().toISOString(),
    running: snapshot.running,
    includeIPv4: config.includeIPv4,
    includeIPv6: config.includeIPv6,
    proxied: config.proxied,
    intervalSeconds: config.updateIntervalSeconds,
    hostnameTargets: [...config.hostnameTargets],
    zoneTargets: [...config.zoneTargets],
    blacklist: [...config.blacklist],
    nextScheduledRun: computeNextRun(lastSuccess, config.updateIntervalSeconds),
    lastSuccess: lastSuccessSummary,
    lastError: mapLastError(snapshot),
    hosts
  };
};

