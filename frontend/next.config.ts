import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Publishing an interview waits on the agent. The default proxy timeout drops that request.
    proxyTimeout: 180_000,
  },
  async rewrites() {
    // Local dev only. A hosted Next app should set NEXT_PUBLIC_API_URL so the browser
    // calls the API directly. Publishing an interview can take a few minutes, and a
    // platform proxy in front of this rewrite will cut that request short.
    const api = process.env.API_URL ?? "http://127.0.0.1:8000";
    return [{ source: "/api/:path*", destination: `${api}/api/:path*` }];
  },
};

export default nextConfig;
