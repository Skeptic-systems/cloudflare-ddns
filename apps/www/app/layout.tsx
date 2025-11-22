import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cloudflare DDNS Dashboard",
  description: "Monitor Cloudflare DDNS updates, status, and configured domains."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

