import type { CapacitorConfig } from "@capacitor/cli";

/**
 * LYVE iOS shell (Capacitor).
 *
 * The native app is a thin shell around the existing LYVE web app. All
 * business logic, RLS and billing verification stay server-side; the shell
 * only adds StoreKit 2 in-app purchases, which Apple requires to run natively.
 *
 * `server.url` points at the hosted app so the shell always runs the current
 * release. Remove it and ship `dist/client` to bundle the app offline.
 */
const config: CapacitorConfig = {
  appId: "app.lyve.ios",
  appName: "LYVE Match",
  webDir: "dist/client",
  ios: {
    contentInset: "always",
    limitsNavigationsToAppBoundDomains: true,
  },
  server: {
    url: "https://lyve-match.lovable.app",
    cleartext: false,
    androidScheme: "https",
  },
};

export default config;
