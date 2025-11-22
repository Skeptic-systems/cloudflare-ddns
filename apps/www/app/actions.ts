"use server";

import { revalidatePath } from "next/cache";
import { ensureSchedulerStarted, scheduler } from "@cloudflare-ddns/api";

export async function triggerUpdate(): Promise<void> {
  ensureSchedulerStarted();
  await scheduler.trigger();
  revalidatePath("/");
}

