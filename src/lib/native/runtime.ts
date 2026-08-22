/**
 * Native shell detection — browser-safe.
 *
 * The web build must behave exactly as before when no native shell is
 * present, so every check is defensive and SSR-safe.
 */
import { Capacitor } from "@capacitor/core";

export type NativePlatform = "ios" | "android" | "web";

export function nativePlatform(): NativePlatform {
  if (typeof window === "undefined") return "web";
  const platform = Capacitor.getPlatform();
  if (platform === "ios" || platform === "android") return platform;

  // The marker is added only by the signed iOS shell. It also lets diagnostics
  // distinguish the app WebView from Safari if bridge injection is damaged.
  if (navigator.userAgent.includes("LYVE-iOS/")) return "ios";
  if (navigator.userAgent.includes("LYVE-Android/")) return "android";
  return "web";
}

export function isNativeApp(): boolean {
  return (
    typeof window !== "undefined" &&
    (Capacitor.isNativePlatform() ||
      navigator.userAgent.includes("LYVE-iOS/") ||
      navigator.userAgent.includes("LYVE-Android/"))
  );
}

/** True only inside the iOS shell, where StoreKit purchases are available. */
export function isIosApp(): boolean {
  return isNativeApp() && nativePlatform() === "ios";
}

/** True only inside the Android shell, where Play Billing is available. */
export function isAndroidApp(): boolean {
  return isNativeApp() && nativePlatform() === "android";
}
