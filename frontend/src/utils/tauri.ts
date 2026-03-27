// Utilities for Tauri desktop integration.
// All functions are no-ops when running in a browser.

export const isTauri = (): boolean =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

// Update the tray icon tooltip with unread message count.
export async function setBadgeCount(count: number): Promise<void> {
  if (!isTauri()) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("set_badge_count", { count });
}

// Send a native desktop notification (falls back to Web Notifications in browser).
export async function sendDesktopNotification(
  title: string,
  body: string
): Promise<void> {
  if (isTauri()) {
    const { sendNotification, isPermissionGranted, requestPermission } =
      await import("@tauri-apps/plugin-notification");
    let granted = await isPermissionGranted();
    if (!granted) {
      const permission = await requestPermission();
      granted = permission === "granted";
    }
    if (granted) {
      sendNotification({ title, body });
    }
  } else if ("Notification" in window) {
    if (Notification.permission === "granted") {
      new Notification(title, { body });
    }
  }
}
