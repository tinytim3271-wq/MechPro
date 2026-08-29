/**
 * Platform detection and native API abstraction for web, Capacitor, and Electron.
 */
export type MechProPlatform = "web" | "capacitor-ios" | "capacitor-android" | "electron";

export function getPlatform(): MechProPlatform {
  const ua = navigator.userAgent;
  const isElectron = "mechproDesktop" in window;
  if (isElectron) return "electron";

  const cap = (window as Window & { Capacitor?: { getPlatform: () => string } }).Capacitor;
  if (cap) {
    const p = cap.getPlatform();
    if (p === "ios") return "capacitor-ios";
    if (p === "android") return "capacitor-android";
  }

  if (/iphone|ipad|ipod/i.test(ua)) return "web";
  if (/android/i.test(ua)) return "web";
  return "web";
}

export function isNativeApp(): boolean {
  const p = getPlatform();
  return p.startsWith("capacitor") || p === "electron";
}

export async function getCurrentPosition(): Promise<GeolocationPosition> {
  const cap = (window as Window & {
    Capacitor?: { Plugins?: { Geolocation?: { getCurrentPosition: () => Promise<{ coords: GeolocationCoordinates }> } } };
  }).Capacitor;

  if (cap?.Plugins?.Geolocation) {
    const pos = await cap.Plugins.Geolocation.getCurrentPosition();
    return { coords: pos.coords } as GeolocationPosition;
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 15000,
    });
  });
}

export function openExternalUrl(url: string): void {
  if (url.startsWith("/") || url.startsWith(window.location.origin)) {
    window.location.href = url;
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}
