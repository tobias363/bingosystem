import type { GameDefinition } from "../platform/PlatformService.js";

export type GameSettingFieldType = "string" | "text" | "integer" | "number" | "boolean" | "enum" | "json";

export interface GameSettingFieldOptionDefinition {
  label: string;
  value: string | number | boolean;
}

export interface GameSettingFieldDefinition {
  key: string;
  path: string;
  label: string;
  description: string;
  type: GameSettingFieldType;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  defaultValue?: string | number | boolean | Record<string, unknown> | Array<unknown>;
  required?: boolean;
  readOnly?: boolean;
  isLocked?: boolean;
  lockReason?: string;
  options?: GameSettingFieldOptionDefinition[];
}

export interface GameSettingsSectionDefinition {
  id: string;
  label: string;
  description: string;
  fields: GameSettingFieldDefinition[];
}

export interface GameSettingsDefinition {
  slug: string;
  title: string;
  description: string;
  sections: GameSettingsSectionDefinition[];
  fields: GameSettingFieldDefinition[];
}

export interface AdminSettingsCatalog {
  generatedAt: string;
  games: GameSettingsDefinition[];
}

export interface CandySettingsCatalogContext {
  minRoundIntervalMs: number;
  minPlayersToStart: number;
  maxTicketsPerPlayer: number;
  forceAutoStart: boolean;
  forceAutoDraw: boolean;
  runningRoundLockActive: boolean;
}

function cloneField(field: GameSettingFieldDefinition): GameSettingFieldDefinition {
  return {
    ...field,
    options: field.options ? [...field.options] : undefined
  };
}

function flattenSections(sections: GameSettingsSectionDefinition[]): GameSettingFieldDefinition[] {
  return sections.flatMap((section) => section.fields.map((field) => cloneField(field)));
}

export function buildCandySettingsDefinition(context: CandySettingsCatalogContext): GameSettingsDefinition {
  const lockReason = context.runningRoundLockActive
    ? "Kan ikke endres mens en runde kjører. Planlegg endring med effectiveFrom."
    : "";

  const sections: GameSettingsSectionDefinition[] = [
    {
      id: "scheduler",
      label: "Rundeplan",
      description: "Styrer auto-start og minimumsregler for nye runder.",
      fields: [
        {
          key: "autoRoundStartEnabled",
          path: "autoRoundStartEnabled",
          label: "Auto-start aktiv",
          description: "Starter nye runder automatisk når intervallet er nådd.",
          type: "boolean",
          defaultValue: true,
          readOnly: context.forceAutoStart,
          isLocked: context.runningRoundLockActive,
          lockReason: context.forceAutoStart
            ? "Tvunget av driftsregel (force auto-start)."
            : lockReason
        },
        {
          key: "autoRoundStartIntervalMs",
          path: "autoRoundStartIntervalMs",
          label: "Startintervall",
          description: "Tid mellom runde-start i millisekunder.",
          type: "integer",
          min: context.minRoundIntervalMs,
          step: 1000,
          unit: "ms",
          defaultValue: context.minRoundIntervalMs,
          isLocked: context.runningRoundLockActive,
          lockReason
        },
        {
          key: "payoutPercent",
          path: "payoutPercent",
          label: "Utbetaling (%)",
          description: "Andel av innsats som går til premiepotten.",
          type: "number",
          min: 0,
          max: 100,
          step: 0.01,
          unit: "%",
          defaultValue: 90,
          isLocked: context.runningRoundLockActive,
          lockReason
        }
      ]
    },
    {
      id: "draw",
      label: "Trekk",
      description: "Styrer automatisk trekking av tall i aktive runder.",
      fields: [
        {
          key: "autoDrawEnabled",
          path: "autoDrawEnabled",
          label: "Auto-trekk aktiv",
          description: "Trekker nye tall automatisk i aktive runder.",
          type: "boolean",
          defaultValue: true,
          readOnly: context.forceAutoDraw,
          isLocked: context.runningRoundLockActive,
          lockReason: context.forceAutoDraw
            ? "Tvunget av driftsregel (force auto-draw)."
            : lockReason
        },
        {
          key: "autoDrawIntervalMs",
          path: "autoDrawIntervalMs",
          label: "Trekkintervall",
          description: "Tid mellom hvert trekk i millisekunder.",
          type: "integer",
          min: 250,
          step: 50,
          unit: "ms",
          defaultValue: 2000,
          isLocked: context.runningRoundLockActive,
          lockReason
        }
      ]
    },
    {
      id: "openingHours",
      label: "Åpningstider",
      description: "Begrens når spillet kjører. Pågående runder fullføres alltid.",
      fields: [
        {
          key: "openingHoursEnabled",
          path: "openingHoursEnabled",
          label: "Bruk åpningstider",
          description: "Når av kjører spillet 24/7. Når på startes nye runder kun innenfor åpningstid.",
          type: "boolean",
          defaultValue: false,
        },
        {
          key: "openingHoursSchedule",
          path: "openingHoursSchedule",
          label: "Ukeplan",
          description: "Åpnings- og stengetid per ukedag (HH:MM, 24-timers format).",
          type: "json",
          defaultValue: {
            monday:    { open: "08:00", close: "22:00", enabled: true },
            tuesday:   { open: "08:00", close: "22:00", enabled: true },
            wednesday: { open: "08:00", close: "22:00", enabled: true },
            thursday:  { open: "08:00", close: "22:00", enabled: true },
            friday:    { open: "08:00", close: "22:00", enabled: true },
            saturday:  { open: "10:00", close: "20:00", enabled: true },
            sunday:    { open: "00:00", close: "00:00", enabled: false },
          },
        },
      ]
    }
  ];

  return {
    slug: "candy",
    title: "Candy",
    description: "Typed driftsinnstillinger for Candy.",
    sections,
    fields: flattenSections(sections)
  };
}

export function buildDefaultGameSettingsDefinition(game: GameDefinition): GameSettingsDefinition {
  return {
    slug: game.slug,
    title: game.title,
    description: game.description,
    sections: [],
    fields: []
  };
}
