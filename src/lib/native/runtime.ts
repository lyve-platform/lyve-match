/**
 * Native shell detection — browser-safe.
 *
 * The web build must behave exactly as before when no native shell is
 * present, so every check is defensive and SSR-safe.
 */
export type NativePlatform = "ios" | "android" | "web";

type CapacitorGlobal = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
};

function cap(): CapacitorGlobal | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
}

export function nativePlatform(): NativePlatform {
  const platform = cap()?.getPlatform?.();
  return platform === "ios" || platform === "android" ? platform : "web";
}

export function isNativeApp(): boolean {
  return cap()?.isNativePlatform?.() === true;
}

/** True only inside the iOS shell, where StoreKit purchases are available. */
export function isIosApp(): boolean {
  return isNativeApp() && nativePlatform() === "ios";
}
