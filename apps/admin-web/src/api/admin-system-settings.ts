// PR-A6 (BIN-674) — admin-system-settings API-wrappers (stub + localStorage).
//
// Backend-gap: Ingen `/api/admin/system/settings` eller `/maintenance` +
// `/system/information` endpoints eksisterer i `apps/backend/src/routes/`.
// Når BIN-A6-SETTINGS og BIN-A6-SYS lander, erstattes localStorage-lag
// med faktiske apiRequest-kall.
//
// NB: Per-spill game-settings (bingo round interval, payoutPercent, etc.)
// er et SEPARAT domene (admin.ts:500-555) og dekkes av PR-A3/A4. Dette er
// **globale app-settings** (android/ios/webgl-versjoner + spiller-tak).
//
// Design-avvik: spiller-tak (daily/monthly spending) er read-only i ny
// arkitektur — per-hall Spillvett-limits tar presedens (se
// project_spillvett_implementation.md + apps/backend/src/spillevett/).

// ── Settings (global app-config) ─────────────────────────────────────────────

export interface GlobalAppSettings {
  android_version: string;
  android_store_link: string;
  ios_version: string;
  ios_store_link: string;
  wind_linux_version: string;
  windows_store_link: string;
  webgl_version: string;
  webgl_store_link: string;
  disable_store_link: "Yes" | "No";
  /** Read-only i ny arkitektur (per-hall Spillvett tar presedens). */
  daily_spending: number;
  /** Read-only i ny arkitektur (per-hall Spillvett tar presedens). */
  monthly_spending: number;
  screenSaver: boolean;
  screenSaverTime: number;
  updatedAt: string;
}

const DEFAULT_GLOBAL_SETTINGS: GlobalAppSettings = {
  android_version: "",
  android_store_link: "",
  ios_version: "",
  ios_store_link: "",
  wind_linux_version: "",
  windows_store_link: "",
  webgl_version: "",
  webgl_store_link: "",
  disable_store_link: "No",
  daily_spending: 0,
  monthly_spending: 0,
  screenSaver: false,
  screenSaverTime: 5,
  updatedAt: new Date(0).toISOString(),
};

const LS_GLOBAL_SETTINGS_KEY = "bingo_admin_global_settings";

function readLs<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeLs<T>(key: string, value: T): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // quota exceeded — silently ignore
  }
}

export async function getGlobalSettings(): Promise<GlobalAppSettings> {
  return readLs<GlobalAppSettings>(LS_GLOBAL_SETTINGS_KEY, DEFAULT_GLOBAL_SETTINGS);
}

export async function updateGlobalSettings(patch: Partial<GlobalAppSettings>): Promise<GlobalAppSettings> {
  const current = await getGlobalSettings();
  const next: GlobalAppSettings = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  writeLs(LS_GLOBAL_SETTINGS_KEY, next);
  return next;
}

// ── Maintenance ──────────────────────────────────────────────────────────────

export interface MaintenanceConfig {
  id: string;
  message: string;
  showBeforeMinutes: number;
  maintenance_start_date: string;
  maintenance_end_date: string;
  status: "active" | "inactive";
  updatedAt: string;
}

const DEFAULT_MAINTENANCE: MaintenanceConfig = {
  id: "maintenance-default",
  message: "",
  showBeforeMinutes: 15,
  maintenance_start_date: "",
  maintenance_end_date: "",
  status: "inactive",
  updatedAt: new Date(0).toISOString(),
};

const LS_MAINTENANCE_KEY = "bingo_admin_maintenance";

export async function getMaintenance(): Promise<MaintenanceConfig> {
  return readLs<MaintenanceConfig>(LS_MAINTENANCE_KEY, DEFAULT_MAINTENANCE);
}

export async function updateMaintenance(patch: Partial<MaintenanceConfig>): Promise<MaintenanceConfig> {
  const current = await getMaintenance();
  const next: MaintenanceConfig = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  writeLs(LS_MAINTENANCE_KEY, next);
  return next;
}

// ── System Information ──────────────────────────────────────────────────────

export interface SystemInformationRecord {
  content: string;
  updatedAt: string;
}

const LS_SYSTEM_INFO_KEY = "bingo_admin_system_information";

export async function getSystemInformation(): Promise<SystemInformationRecord> {
  return readLs<SystemInformationRecord>(LS_SYSTEM_INFO_KEY, {
    content: "",
    updatedAt: new Date(0).toISOString(),
  });
}

export async function updateSystemInformation(content: string): Promise<SystemInformationRecord> {
  const record: SystemInformationRecord = {
    content,
    updatedAt: new Date().toISOString(),
  };
  writeLs(LS_SYSTEM_INFO_KEY, record);
  return record;
}
