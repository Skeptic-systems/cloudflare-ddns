import { isIP } from "node:net";
import { z } from "zod";

export type ResolvedIpAddresses = {
  readonly ipv4?: string;
  readonly ipv6?: string;
};

const fetchText = async (url: string): Promise<string> => {
  const response = await fetch(url, { method: "GET" });
  if (!response.ok) {
    throw new Error(`Failed to fetch IP from ${url}: ${response.statusText}`);
  }
  return response.text();
};

const ipSchema = z.string().superRefine((value, ctx) => {
  if (isIP(value) === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Invalid IP response"
    });
  }
});

const requestIPv4 = async (): Promise<string> => {
  const text = (await fetchText("https://api.ipify.org")).trim();
  ipSchema.parse(text);
  return text;
};

const requestIPv6 = async (): Promise<string> => {
  const text = (await fetchText("https://api64.ipify.org")).trim();
  ipSchema.parse(text);
  return text;
};

export const resolvePublicAddresses = async (includeIPv4: boolean, includeIPv6: boolean): Promise<ResolvedIpAddresses> => {
  const tasks: Promise<ResolvedIpAddresses>[] = [];
  if (includeIPv4) {
    tasks.push(
      requestIPv4().then((ipv4) => ({
        ipv4
      }))
    );
  }
  if (includeIPv6) {
    tasks.push(
      requestIPv6().then((ipv6) => ({
        ipv6
      }))
    );
  }

  if (tasks.length === 0) {
    throw new Error("At least one IP version must be requested");
  }

  const results = await Promise.all(tasks);
  return results.reduce<ResolvedIpAddresses>(
    (state, entry) => ({
      ipv4: entry.ipv4 ?? state.ipv4,
      ipv6: entry.ipv6 ?? state.ipv6
    }),
    {}
  );
};

