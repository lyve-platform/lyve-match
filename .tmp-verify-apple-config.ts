import { appleConfig, appleRail, configuredStoreEnvironment } from "./src/lib/billing/store-env.server";

const env = configuredStoreEnvironment();
const config = appleConfig();
const rail = appleRail();

console.log(`Environment: ${env}`);
console.log(`Apple rail: ${rail}`);
console.log(`Config ok: ${config.ok}`);
if (!config.ok) {
  console.log(`Config reason: ${config.reason}`);
} else {
  console.log(`Bundle ID: ${config.config.bundleId}`);
  console.log(`API base: ${config.config.apiBase}`);
  console.log(`Trusted roots count: ${config.config.trustedRootFingerprints.length}`);
}
