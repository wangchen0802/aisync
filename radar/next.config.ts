import type { NextConfig } from "next";

const config: NextConfig = {
  serverExternalPackages: ["pg"],
  // This app lives in a subfolder of the SimReal Sync repo; trace files from here, not the repo root.
  outputFileTracingRoot: process.cwd(),
};

export default config;
