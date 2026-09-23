import type { NextConfig } from "next";

const config: NextConfig = {
  // The extension download route zips files from ./extension at runtime.
  outputFileTracingIncludes: { "/api/extension": ["./extension/**/*"] },
  serverExternalPackages: ["pg"],
};

export default config;
