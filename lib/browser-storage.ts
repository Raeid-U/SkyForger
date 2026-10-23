// Optional browser-only persistence. Never store inventory, profile responses, or jobs.
export type StorageConsent = "allow" | "decline";
const consentKey = "skyforger:storage-consent:v1";
export const browserKeys = {
  settings: "skyforger:settings:v1",
  account: "skyforger:account:v1",
  sort: "skyforger:sort:v1",
  typography: "skyforger:type-mode",
  bazaar: "skyforger:bazaar:v1",
  auctions: "skyforger:auctions:v1",
};
export function storageConsent(): StorageConsent | null {
  try {
    const value = localStorage.getItem(consentKey);
    return value === "allow" || value === "decline" ? value : null;
  } catch {
    return null;
  }
}
export function readBrowserValue(key: string): unknown {
  try {
    return storageConsent() === "allow"
      ? JSON.parse(localStorage.getItem(key) ?? "null")
      : null;
  } catch {
    return null;
  }
}
export function writeBrowserValue(key: string, value: unknown) {
  try {
    if (storageConsent() === "allow")
      localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}
export function chooseStorage(value: StorageConsent) {
  try {
    if (value === "decline")
      for (const key of Object.values(browserKeys))
        localStorage.removeItem(key);
    localStorage.setItem(consentKey, value);
  } catch {}
}
export function clearOptionalStorage() {
  try {
    for (const key of Object.values(browserKeys)) localStorage.removeItem(key);
  } catch {}
}
