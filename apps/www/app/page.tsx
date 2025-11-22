import Dashboard from "../components/Dashboard";
import { getDashboardStatus } from "@cloudflare-ddns/api/dashboard";

export const dynamic = "force-dynamic";

export default async function Page() {
  const initialData = await getDashboardStatus();
  return <Dashboard initialData={initialData} />;
}

