import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig({
  // R2 incremental cache is intentionally disabled for the first Worker deploy.
  // Add the bucket binding only after the Cloudflare target is stable.
});
