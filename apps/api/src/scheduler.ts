import { AppConfig } from "./config";
import { CloudflareApiError, CloudflareClient, CloudflareErrorItem } from "./cloudflare/client";
import { logger } from "./logger";
import { UpdateSummary, performUpdate } from "./update";

export type SchedulerError = {
  readonly timestamp: string;
  readonly message: string;
  readonly stack?: string;
  readonly status?: number;
  readonly apiErrors?: readonly CloudflareErrorItem[];
  readonly responseBody?: string;
};

export type SchedulerSnapshot = {
  readonly running: boolean;
  readonly lastSuccess?: UpdateSummary;
  readonly lastError?: SchedulerError;
};

export type Scheduler = {
  readonly start: () => void;
  readonly stop: () => void;
  readonly trigger: () => Promise<UpdateSummary | null>;
  readonly snapshot: () => SchedulerSnapshot;
};

export const createScheduler = (client: CloudflareClient, config: AppConfig): Scheduler => {
  let timer: NodeJS.Timeout | null = null;
  let running = false;
  let lastSuccess: UpdateSummary | undefined;
  let lastError: SchedulerError | undefined;

  const execute = async (): Promise<void> => {
    if (running) {
      logger.warn("⏳ Update skipped because a previous execution is still running");
      return;
    }
    running = true;
    logger.info("⏱️ Executing scheduled update");
    try {
      const summary = await performUpdate(client, config);
      lastSuccess = summary;
      lastError = undefined;
    } catch (error) {
      const baseFailure = {
        timestamp: new Date().toISOString(),
        message: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined
      };
      const cloudflareFailure =
        error instanceof CloudflareApiError
          ? {
              status: error.status,
              apiErrors: error.errors,
              responseBody: error.body
            }
          : {};
      const failure: SchedulerError = { ...baseFailure, ...cloudflareFailure };
      lastError = failure;
      logger.error("💥 Scheduled update failed", {
        ...failure,
        responseBody: failure.responseBody?.slice(0, 1024)
      });
    } finally {
      running = false;
    }
  };

  const start = (): void => {
    if (timer !== null) {
      return;
    }
    logger.info("🕒 Scheduler started", {
      intervalSeconds: config.updateIntervalSeconds
    });
    void execute();
    timer = setInterval(() => {
      void execute();
    }, config.updateIntervalSeconds * 1000);
  };

  const stop = (): void => {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };

  const trigger = async (): Promise<UpdateSummary | null> => {
    logger.info("⚡ Manual update trigger received");
    await execute();
    return lastSuccess ?? null;
  };

  const snapshot = (): SchedulerSnapshot => ({
    running,
    lastSuccess,
    lastError
  });

  return {
    start,
    stop,
    trigger,
    snapshot
  };
};

