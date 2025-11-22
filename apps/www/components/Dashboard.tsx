/* eslint-disable react-hooks/exhaustive-deps */
"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import type {
  DashboardStatus,
  HostStatusSummary,
  RecordStatusSummary
} from "@cloudflare-ddns/api/dashboard";
import { triggerUpdate } from "../app/actions";

type DashboardProps = {
  initialData: DashboardStatus;
};

const REFRESH_INTERVAL_MS = 15_000;

const formatDateTime = (value?: string | null): string => {
  if (!value) {
    return "—";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "medium"
  }).format(date);
};

const formatDuration = (durationMs?: number): string => {
  if (durationMs === undefined || durationMs === null) {
    return "—";
  }
  if (durationMs < 1000) {
    return `${durationMs} ms`;
  }
  const seconds = durationMs / 1000;
  if (seconds < 60) {
    return `${seconds.toFixed(2)} s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds.toFixed(0)}s`;
};

const recordTypeClass = (record: RecordStatusSummary): string => {
  if (record.recordType === "A") {
    return "type-A";
  }
  if (record.recordType === "AAAA") {
    return "type-AAAA";
  }
  return "type-other";
};

const kindClass = (kind: RecordStatusSummary["kind"]): string => {
  switch (kind) {
    case "create":
      return "create";
    case "update":
      return "update";
    case "delete":
      return "delete";
    default:
      return "skip";
  }
};

export default function Dashboard({ initialData }: DashboardProps) {
  const [data, setData] = useState<DashboardStatus>(initialData);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const busy = isPending || data.running;

  const fetchStatus = useCallback(async () => {
    try {
      setIsRefreshing(true);
      const response = await fetch("/api/status", {
        cache: "no-store"
      });
      if (!response.ok) {
        throw new Error(`Request failed with ${response.status}`);
      }
      const next = (await response.json()) as DashboardStatus;
      setData(next);
    } catch (error) {
      console.error("Failed to refresh dashboard status", error);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void fetchStatus();
    }, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [fetchStatus]);

  const handleTriggerUpdate = useCallback(() => {
    startTransition(async () => {
      try {
        await triggerUpdate();
      } finally {
        await fetchStatus();
      }
    });
  }, [fetchStatus]);

  const statusChip = useMemo(() => {
    if (data.running) {
      return <span className="status-chip running">Update running</span>;
    }
    if (data.lastError) {
      return <span className="status-chip error">Last update failed</span>;
    }
    return <span className="status-chip idle">Idle</span>;
  }, [data.running, data.lastError]);

  const hosts: readonly HostStatusSummary[] = useMemo(() => data.hosts, [data.hosts]);

  return (
    <main>
      <div className="controls">
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          {statusChip}
          <span className="muted">Dashboard refreshed {formatDateTime(data.generatedAt)}</span>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={handleTriggerUpdate}
          aria-live="polite"
        >
          {busy ? "Updating..." : "Run Update Now"}
        </button>
      </div>

      <div className="card-grid">
        <div className="card">
          <h2>Refresh Interval</h2>
          <div className="card-value">{data.intervalSeconds}s</div>
          <div className="card-subtitle">
            Next run: {formatDateTime(data.nextScheduledRun)}
          </div>
        </div>
        <div className="card">
          <h2>Last Update</h2>
          <div className="card-value">
            {data.lastSuccess ? formatDateTime(data.lastSuccess.timestamp) : "No runs yet"}
          </div>
          <div className="card-subtitle">
            Duration: {formatDuration(data.lastSuccess?.durationMs)}
          </div>
        </div>
        <div className="card">
          <h2>Records Changed</h2>
          <div className="card-value">
            {data.lastSuccess
              ? data.lastSuccess.totals.create +
                data.lastSuccess.totals.update +
                data.lastSuccess.totals.delete
              : 0}
          </div>
          <div className="card-subtitle">
            {data.lastSuccess
              ? `${data.lastSuccess.totals.create} created · ${data.lastSuccess.totals.update} updated · ${data.lastSuccess.totals.delete} deleted`
              : "Pending first run"}
          </div>
        </div>
        <div className="card">
          <h2>Configured Targets</h2>
          <div className="card-value">
            {data.hostnameTargets.length +
              (data.zoneTargets.length > 0 ? data.zoneTargets.length : 0)}
          </div>
          <div className="card-subtitle">
            {data.hostnameTargets.length} hostname(s) · {data.zoneTargets.length} zone(s)
          </div>
        </div>
      </div>

      <div className="grid-2">
        <section className="panel">
          <h3>Hostname Targets</h3>
          {data.hostnameTargets.length === 0 ? (
            <p className="muted">No individual hostnames configured.</p>
          ) : (
            <ul className="list">
              {data.hostnameTargets.map((host) => (
                <li key={host}>{host}</li>
              ))}
            </ul>
          )}
        </section>
        <section className="panel">
          <h3>Zone Targets</h3>
          {data.zoneTargets.length === 0 ? (
            <p className="muted">No entire zones configured.</p>
          ) : (
            <ul className="list">
              {data.zoneTargets.map((zone) => (
                <li key={zone}>{zone}</li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {data.lastError && (
        <section className="panel" style={{ marginTop: 24 }}>
          <h3>Last Error</h3>
          <p>
            <strong>{formatDateTime(data.lastError.timestamp)}</strong> — {data.lastError.message}
          </p>
          {data.lastError.status !== undefined && (
            <p className="muted">HTTP Status: {data.lastError.status}</p>
          )}
          {data.lastError.apiErrors.length > 0 && (
            <details>
              <summary>Cloudflare details</summary>
              <ul>
                {data.lastError.apiErrors.map((error, index) => (
                  <li key={`${error.code}-${index}`}>
                    #{error.code} — {error.message}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {data.lastError.responseBody && (
            <details style={{ marginTop: 8 }}>
              <summary>Response body</summary>
              <pre style={{ whiteSpace: "pre-wrap", overflowX: "auto" }}>{data.lastError.responseBody}</pre>
            </details>
          )}
        </section>
      )}

      <section className="panel" style={{ marginTop: 24 }}>
        <h3>
          Host Status{" "}
          {isRefreshing && (
            <span className="muted" style={{ marginLeft: 8 }}>
              refreshing…
            </span>
          )}
        </h3>
        {hosts.length === 0 ? (
          <p className="muted">No host data available. Run an update to populate the dashboard.</p>
        ) : (
          <div className="host-status-list">
            {hosts.map((host) => (
              <HostStatus key={`${host.zone}-${host.hostname}`} host={host} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function HostStatus({ host }: { host: HostStatusSummary }) {
  return (
    <div className="host-item">
      <div className="host-header">
        <h4>{host.hostname}</h4>
        <span className="host-zone">{host.zone}</span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {host.records.map((record, index) => (
          <span
            key={`${record.recordType}-${record.kind}-${index}`}
            className={`record-pill ${recordTypeClass(record)}`}
            title={record.reason ?? record.kind}
          >
            <span className={`kind-dot ${kindClass(record.kind)}`} />
            <span>{record.recordType}</span>
            <span>{record.kind}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

