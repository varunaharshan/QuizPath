import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `pg` conditionally `require()`s its optional native bindings (pg-native,
  // pg-cloudflare) for environments that don't have them installed; letting
  // Next bundle it can make the dev-mode Turbopack bundler try to eagerly
  // resolve those as external chunks and fail with a cryptic
  // ERR_MODULE_NOT_FOUND. Marking it external keeps it on plain Node
  // `require`, which already has correct try/catch guards around those.
  serverExternalPackages: ["pg"],
};

export default nextConfig;
