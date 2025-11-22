import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnvFile } from "dotenv";
import { z } from "zod";

const ensureEnvLoaded = (): void => {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  const candidateRoots = [
    process.cwd(),
    resolve(process.cwd(), ".."),
    resolve(process.cwd(), "..", ".."),
    moduleDir,
    resolve(moduleDir, ".."),
    resolve(moduleDir, "..", "..")
  ];
  for (const base of candidateRoots) {
    const candidate = resolve(base, ".env");
    if (existsSync(candidate)) {
      loadEnvFile({ path: candidate });
      return;
    }
  }
  loadEnvFile();
};

ensureEnvLoaded();

export type AppConfig = {
  readonly apiToken: string;
  readonly hostnameTargets: readonly string[];
  readonly zoneTargets: readonly string[];
  readonly blacklist: readonly string[];
  readonly includeIPv4: boolean;
  readonly includeIPv6: boolean;
  readonly updateIntervalSeconds: number;
  readonly proxied: boolean;
};

const envSchema = z.object({
  CLOUDFLARE_API_TOKEN: z.string().min(1, "CLOUDFLARE_API_TOKEN is required"),
  TARGET_HOSTNAMES: z.string().optional(),
  TARGET_ZONES: z.string().optional(),
  BLACKLIST_HOSTNAMES: z.string().optional(),
  INCLUDE_IPV4: z.string().optional(),
  INCLUDE_IPV6: z.string().optional(),
  UPDATE_INTERVAL_SECONDS: z.string().optional(),
  CLOUDFLARE_PROXIED: z.string().optional()
});

const parseBoolean = (value: string | undefined, fallback: boolean, key: string): boolean => {
  if (value === undefined || value.trim().length === 0) {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "true") {
    return true;
  }
  if (normalized === "false") {
    return false;
  }
  throw new Error(`${key} must be either "true" or "false"`);
};

const parseInterval = (value: string | undefined, fallback: number, key: string): number => {
  if (value === undefined || value.trim().length === 0) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    throw new Error(`${key} must be a positive integer`);
  }
  return parsed;
};

const parseList = (value: string | undefined): readonly string[] => {
  if (value === undefined || value.trim().length === 0) {
    return [];
  }
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
};

export const loadConfig = (): AppConfig => {
  const parsed = envSchema.parse(process.env);

  const hostnameTargets = parseList(parsed.TARGET_HOSTNAMES);
  const zoneTargets = parseList(parsed.TARGET_ZONES);
  if (hostnameTargets.length === 0 && zoneTargets.length === 0) {
    throw new Error("Configure at least one entry in TARGET_HOSTNAMES or TARGET_ZONES");
  }

  const blacklist = parseList(parsed.BLACKLIST_HOSTNAMES);
  const includeIPv4 = parseBoolean(parsed.INCLUDE_IPV4, true, "INCLUDE_IPV4");
  const includeIPv6 = parseBoolean(parsed.INCLUDE_IPV6, false, "INCLUDE_IPV6");
  if (!includeIPv4 && !includeIPv6) {
    throw new Error("INCLUDE_IPV4 and INCLUDE_IPV6 cannot both be false");
  }

  const updateIntervalSeconds = parseInterval(parsed.UPDATE_INTERVAL_SECONDS, 300, "UPDATE_INTERVAL_SECONDS");
  const proxied = parseBoolean(parsed.CLOUDFLARE_PROXIED, true, "CLOUDFLARE_PROXIED");

  return Object.freeze({
    apiToken: parsed.CLOUDFLARE_API_TOKEN,
    hostnameTargets,
    zoneTargets,
    blacklist,
    includeIPv4,
    includeIPv6,
    updateIntervalSeconds,
    proxied
  });
};

export const config = loadConfig();

