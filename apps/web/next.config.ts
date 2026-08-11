import path from "node:path";
import type { NextConfig } from "next";

/**
 * The API is its own process now. The browser never talks to it directly: it
 * asks this server for `/api/...` as it always did and the request is handed
 * over from here, which keeps everything on one origin — one port to open on a
 * server, no CORS, and the OAuth callback landing where the tab that opened it
 * can still hear it.
 *
 * Rewrites are resolved when the app is built, so this is a build-time setting.
 * Both halves always run side by side, which is why the default is loopback.
 */
const API = process.env.API_PROXY_URL ?? "http://127.0.0.1:4000";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The app is one of three packages, and what it pulls in from the others has
  // to be traced from the root of the repo or it is left out of the build.
  outputFileTracingRoot: path.join(__dirname, "../.."),
  output: "standalone",
  rewrites() {
    return Promise.resolve([
      { source: "/api/:path*", destination: `${API}/api/:path*` },
    ]);
  },
};

export default nextConfig;
