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
  return platform === "ios" || platform === "android" ? platform : "web";
}

export function isNativeApp(): boolean {
  return typeof window !== "undefined" && Capacitor.isNativePlatform();
}

/** True only inside the iOS shell, where StoreKit purchases are available. */
export function isIosApp(): boolean {
  return isNativeApp() && nativePlatform() === "ios";
}
