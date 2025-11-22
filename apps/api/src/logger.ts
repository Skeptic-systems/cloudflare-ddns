type LogLevel = "debug" | "info" | "warn" | "error";

export type LogFields = Record<string, unknown>;

const log = (level: LogLevel, message: string, fields?: LogFields): void => {
  const payload = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...fields
  };
  const text = JSON.stringify(payload);
  if (level === "error") {
    console.error(text);
    return;
  }
  if (level === "warn") {
    console.warn(text);
    return;
  }
  if (level === "debug") {
    console.debug(text);
    return;
  }
  console.info(text);
};

export const logger = {
  debug: (message: string, fields?: LogFields): void => log("debug", message, fields),
  info: (message: string, fields?: LogFields): void => log("info", message, fields),
  warn: (message: string, fields?: LogFields): void => log("warn", message, fields),
  error: (message: string, fields?: LogFields): void => log("error", message, fields)
};

