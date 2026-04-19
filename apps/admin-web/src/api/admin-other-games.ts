// PR-A6 (BIN-674) — admin-other-games API-wrappers (stub + localStorage).
//
// Backend-gap: Ingen `/api/admin/other-games/*` endpoints eksisterer.
// Når BIN-A6-OG lander, erstattes localStorage-lag med apiRequest-kall.
//
// De fire mini-spillene (wheel/chest/mystery/colordraft) er standalone
// bonus-features i legacy Unity. De har ikke live-kjøring i Spillorama-
// stack (pilot-fokus er kjerne-bingo). PR-A6 leverer config-UI med
// visuell paritet + localStorage-fallback for QA.

export type OtherGameSlug = "wheel" | "chest" | "mystery" | "colordraft";

export interface WheelOfFortuneConfig {
  /** 24 prize-verdier i rekkefølge (segmentert hjul). */
  prizeList: number[];
  updatedAt: string;
}

export interface TreasureChestConfig {
  /** 10 prize-verdier (eller lengre; legacy brukte variabelt antall 10-20). */
  prizeList: number[];
  updatedAt: string;
}

export interface MysteryGameConfig {
  /** 6 prize-verdier. */
  prizeList: number[];
  updatedAt: string;
}

export interface ColorDraftConfig {
  /** 4 røde-prize-verdier (tiers 1-4). */
  redPrizes: number[];
  /** 4 gule-prize-verdier. */
  yellowPrizes: number[];
  /** 4 grønne-prize-verdier. */
  greenPrizes: number[];
  updatedAt: string;
}

const WHEEL_DEFAULT: WheelOfFortuneConfig = {
  prizeList: Array.from({ length: 24 }, () => 0),
  updatedAt: new Date(0).toISOString(),
};

const CHEST_DEFAULT: TreasureChestConfig = {
  prizeList: [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000],
  updatedAt: new Date(0).toISOString(),
};

const MYSTERY_DEFAULT: MysteryGameConfig = {
  prizeList: [100, 200, 300, 400, 500, 600],
  updatedAt: new Date(0).toISOString(),
};

const COLORDRAFT_DEFAULT: ColorDraftConfig = {
  redPrizes: [100, 200, 300, 400],
  yellowPrizes: [100, 200, 300, 400],
  greenPrizes: [100, 200, 300, 400],
  updatedAt: new Date(0).toISOString(),
};

const LS_WHEEL_KEY = "bingo_admin_wheel_config";
const LS_CHEST_KEY = "bingo_admin_chest_config";
const LS_MYSTERY_KEY = "bingo_admin_mystery_config";
const LS_COLORDRAFT_KEY = "bingo_admin_colordraft_config";

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

export async function getWheelConfig(): Promise<WheelOfFortuneConfig> {
  return readLs<WheelOfFortuneConfig>(LS_WHEEL_KEY, WHEEL_DEFAULT);
}

export async function updateWheelConfig(prizeList: number[]): Promise<WheelOfFortuneConfig> {
  const record: WheelOfFortuneConfig = {
    prizeList: [...prizeList],
    updatedAt: new Date().toISOString(),
  };
  writeLs(LS_WHEEL_KEY, record);
  return record;
}

export async function getChestConfig(): Promise<TreasureChestConfig> {
  return readLs<TreasureChestConfig>(LS_CHEST_KEY, CHEST_DEFAULT);
}

export async function updateChestConfig(prizeList: number[]): Promise<TreasureChestConfig> {
  const record: TreasureChestConfig = {
    prizeList: [...prizeList],
    updatedAt: new Date().toISOString(),
  };
  writeLs(LS_CHEST_KEY, record);
  return record;
}

export async function getMysteryConfig(): Promise<MysteryGameConfig> {
  return readLs<MysteryGameConfig>(LS_MYSTERY_KEY, MYSTERY_DEFAULT);
}

export async function updateMysteryConfig(prizeList: number[]): Promise<MysteryGameConfig> {
  const record: MysteryGameConfig = {
    prizeList: [...prizeList],
    updatedAt: new Date().toISOString(),
  };
  writeLs(LS_MYSTERY_KEY, record);
  return record;
}

export async function getColorDraftConfig(): Promise<ColorDraftConfig> {
  return readLs<ColorDraftConfig>(LS_COLORDRAFT_KEY, COLORDRAFT_DEFAULT);
}

export async function updateColorDraftConfig(input: {
  redPrizes: number[];
  yellowPrizes: number[];
  greenPrizes: number[];
}): Promise<ColorDraftConfig> {
  const record: ColorDraftConfig = {
    redPrizes: [...input.redPrizes],
    yellowPrizes: [...input.yellowPrizes],
    greenPrizes: [...input.greenPrizes],
    updatedAt: new Date().toISOString(),
  };
  writeLs(LS_COLORDRAFT_KEY, record);
  return record;
}
