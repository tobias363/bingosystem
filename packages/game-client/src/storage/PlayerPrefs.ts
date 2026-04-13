/**
 * Typed localStorage wrapper with Unity PlayerPrefs key migration.
 *
 * Unity WebGL stores PlayerPrefs in localStorage with keys like
 * "unity.player_prefs.MarkerDesign". This class reads existing Unity keys
 * and provides a typed API for the web client.
 */

const PREFIX = "spillorama.prefs.";

/** Known preference keys with their types. */
export interface PrefsSchema {
  markerDesign: number;
  language: string;
  volume: number;
  voiceGender: string;
  soundEnabled: boolean;
}

/** Unity PlayerPrefs key → web key mapping. */
const UNITY_KEY_MAP: Partial<Record<keyof PrefsSchema, string[]>> = {
  markerDesign: ["MarkerDesign", "Marker_Design"],
  language: ["Language", "SelectedLanguage"],
  volume: ["Volume", "SoundVolume", "MasterVolume"],
  voiceGender: ["VoiceGender", "SoundGender"],
  soundEnabled: ["SoundEnabled", "IsSoundOn"],
};

export class PlayerPrefs {
  private migrated = false;

  /**
   * Try to migrate Unity PlayerPrefs values on first access.
   * Unity WebGL stores in localStorage with various key formats.
   */
  private migrateFromUnity(): void {
    if (this.migrated) return;
    this.migrated = true;

    for (const [webKey, unityKeys] of Object.entries(UNITY_KEY_MAP)) {
      const fullWebKey = PREFIX + webKey;
      // Skip if web value already exists
      if (localStorage.getItem(fullWebKey) !== null) continue;

      // Try each possible Unity key
      for (const unityKey of unityKeys ?? []) {
        // Unity WebGL uses several possible prefixes
        const candidates = [
          unityKey,
          `unity.player_prefs.${unityKey}`,
          `PlayerPrefs.${unityKey}`,
        ];
        for (const candidate of candidates) {
          const val = localStorage.getItem(candidate);
          if (val !== null) {
            localStorage.setItem(fullWebKey, val);
            break;
          }
        }
      }
    }
  }

  get<K extends keyof PrefsSchema>(key: K, defaultValue: PrefsSchema[K]): PrefsSchema[K] {
    this.migrateFromUnity();
    const raw = localStorage.getItem(PREFIX + key);
    if (raw === null) return defaultValue;

    // Type coercion based on default value type
    if (typeof defaultValue === "number") return Number(raw) as PrefsSchema[K];
    if (typeof defaultValue === "boolean") return (raw === "true") as PrefsSchema[K];
    return raw as PrefsSchema[K];
  }

  set<K extends keyof PrefsSchema>(key: K, value: PrefsSchema[K]): void {
    localStorage.setItem(PREFIX + key, String(value));
  }

  delete<K extends keyof PrefsSchema>(key: K): void {
    localStorage.removeItem(PREFIX + key);
  }

  has<K extends keyof PrefsSchema>(key: K): boolean {
    this.migrateFromUnity();
    return localStorage.getItem(PREFIX + key) !== null;
  }
}
