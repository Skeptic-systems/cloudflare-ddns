/** @type {import("next").NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  experimental: {
    typedRoutes: true
  },
  transpilePackages: ["@cloudflare-ddns/api"]
};

export default nextConfig;

