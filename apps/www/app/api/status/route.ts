import { NextResponse } from "next/server";
import { getDashboardStatus } from "@cloudflare-ddns/api/dashboard";

export async function GET() {
  const status = await getDashboardStatus();
  return NextResponse.json(status, {
    headers: {
      "Cache-Control": "no-store"
    }
  });
}

