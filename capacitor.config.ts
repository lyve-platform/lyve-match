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
    appendUserAgent: "LYVE-iOS/1",
    // Must stay false: app-bound domains make WKWebView hand every navigation
    // to Safari unless the host is listed in WKAppBoundDomains, which broke the
    // TestFlight shell (the site opened in Safari, so StoreKit was unavailable).
    limitsNavigationsToAppBoundDomains: false,
  },
  android: {
    appendUserAgent: "LYVE-Android/1",
    allowMixedContent: false,
  },
  server: {
    url: "https://lyve-match.lovable.app",
    cleartext: false,
    androidScheme: "https",
    allowNavigation: [
      "lyve-match.lovable.app",
      "*.lovable.app",
      "oauth.lovable.app",
      "lovable.dev",
      "*.supabase.co",
      "appleid.apple.com",
      "accounts.google.com",
    ],
  },
};

export default config;
