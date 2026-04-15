import type { BingoCellColors } from "../../../components/BingoCell.js";

/**
 * Ticket color theme — matches Unity's TicketColorManager.
 *
 * Properties map to Unity inspector values extracted via CoPlay:
 *   cardBg      → Tickets_Color.BG_Color
 *   cellColors.bgDefault → Tickets_Color.Block_Color
 *   headerBg/headerText/toGoColor → derived from card identity
 */
export interface TicketColorTheme {
  name: string;
  cardBg: number;         // Card background fill
  headerBg: number;       // Header bar background
  headerText: number;     // Header text color
  toGoColor: number;      // "ToGo" counter text
  toGoCloseColor: number; // "ToGo" when close to winning
  cellColors: BingoCellColors;
}

/**
 * One-to-go highlight color — extracted from Unity TicketColorManager.One_to_go_Color.
 * RGBA(0.6902, 0.8314, 0.6314, 1.0) = #b0d4a1
 */
export const ONE_TO_GO_COLOR = 0xb0d4a1;

/**
 * Ticket color themes — verified against Unity TicketColorManager inspector values.
 * Extracted 2026-04-15 via CoPlay execute_script on Managers/Ticket_Color_Manager.
 *
 * Unity stores: name, BG_Color (card bg), Block_Color (cell bg), Large_BG_Color.
 * headerBg/headerText/toGoColor are derived (dark shade of card color for header).
 */
export const TICKET_THEMES: TicketColorTheme[] = [
  // 0. DEFAULT — Beige/Tan
  // Unity: BG=fff2ce, Block=ffd6a7
  {
    name: "default",
    cardBg: 0xfff2ce,
    headerBg: 0x790001,
    headerText: 0xffe83d,
    toGoColor: 0x790001,
    toGoCloseColor: 0xb0d4a1,
    cellColors: {
      bgDefault: 0xffd6a7,
      bgFree: 0xffe83d,
      bgHighlight: 0xffe83d,
      markerColor: 0x7e001b,
      textDefault: 0x1a0a0a,
      textMarked: 0xffd6a7,
      textFree: 0x790001,
      borderColor: 0xd4a574,
    },
  },

  // 1. SMALL YELLOW
  // Unity: BG=f5c103, Block=f6f36e
  {
    name: "yellow",
    cardBg: 0xf5c103,
    headerBg: 0x987d00,
    headerText: 0xf5c103,
    toGoColor: 0x987d00,
    toGoCloseColor: 0xb0d4a1,
    cellColors: {
      bgDefault: 0xf6f36e,
      bgFree: 0xffe83d,
      bgHighlight: 0xffe83d,
      markerColor: 0xee9700,
      textDefault: 0x1a0a0a,
      textMarked: 0xf5c103,
      textFree: 0x987d00,
      borderColor: 0xd4b832,
    },
  },

  // 2. SMALL WHITE
  // Unity: BG=ffffff, Block=d2d2d2
  {
    name: "white",
    cardBg: 0xffffff,
    headerBg: 0x444444,
    headerText: 0xffffff,
    toGoColor: 0x444444,
    toGoCloseColor: 0xb0d4a1,
    cellColors: {
      bgDefault: 0xd2d2d2,
      bgFree: 0xffe83d,
      bgHighlight: 0xffe83d,
      markerColor: 0x555555,
      textDefault: 0x000000,
      textMarked: 0xffffff,
      textFree: 0x444444,
      borderColor: 0x999999,
    },
  },

  // 3. SMALL PURPLE
  // Unity: BG=af91ff, Block=7864ff
  {
    name: "purple",
    cardBg: 0xaf91ff,
    headerBg: 0x4b2daa,
    headerText: 0xaf91ff,
    toGoColor: 0x4b2daa,
    toGoCloseColor: 0xb0d4a1,
    cellColors: {
      bgDefault: 0x7864ff,
      bgFree: 0xffe83d,
      bgHighlight: 0xffe83d,
      markerColor: 0x4b2daa,
      textDefault: 0x1a001a,
      textMarked: 0xaf91ff,
      textFree: 0x4b2daa,
      borderColor: 0x8a70e0,
    },
  },

  // 4. SMALL RED
  // Unity: BG=d20000, Block=ffa55f
  {
    name: "red",
    cardBg: 0xd20000,
    headerBg: 0x7e0000,
    headerText: 0xffa55f,
    toGoColor: 0x7e0000,
    toGoCloseColor: 0xb0d4a1,
    cellColors: {
      bgDefault: 0xffa55f,
      bgFree: 0xffe83d,
      bgHighlight: 0xffe83d,
      markerColor: 0xd20000,
      textDefault: 0x1a0000,
      textMarked: 0xffc8c8,
      textFree: 0x7e0000,
      borderColor: 0xc06060,
    },
  },

  // 5. SMALL GREEN
  // Unity: BG=199600, Block=28ff78
  {
    name: "green",
    cardBg: 0x199600,
    headerBg: 0x0e5400,
    headerText: 0x28ff78,
    toGoColor: 0x0e5400,
    toGoCloseColor: 0xb0d4a1,
    cellColors: {
      bgDefault: 0x28ff78,
      bgFree: 0xffe83d,
      bgHighlight: 0xffe83d,
      markerColor: 0x199600,
      textDefault: 0x001a00,
      textMarked: 0x28ff78,
      textFree: 0x0e5400,
      borderColor: 0x40a050,
    },
  },

  // 6. SMALL ORANGE
  // Unity: BG=ff6400, Block=ffaa69
  {
    name: "orange",
    cardBg: 0xff6400,
    headerBg: 0x993c00,
    headerText: 0xffaa69,
    toGoColor: 0x993c00,
    toGoCloseColor: 0xb0d4a1,
    cellColors: {
      bgDefault: 0xffaa69,
      bgFree: 0xffe83d,
      bgHighlight: 0xffe83d,
      markerColor: 0xff6400,
      textDefault: 0x1a0a00,
      textMarked: 0xffaa69,
      textFree: 0x993c00,
      borderColor: 0xcc7040,
    },
  },

  // 7. ELVIS (all Elvis 1-5 share the same colors)
  // Unity: BG=d20000, Block=ffa55f, Large_BG=4b0000
  {
    name: "elvis",
    cardBg: 0xd20000,
    headerBg: 0x4b0000,
    headerText: 0xffa55f,
    toGoColor: 0x4b0000,
    toGoCloseColor: 0xb0d4a1,
    cellColors: {
      bgDefault: 0xffa55f,
      bgFree: 0xffe83d,
      bgHighlight: 0xffe83d,
      markerColor: 0xd20000,
      textDefault: 0x1a0000,
      textMarked: 0xffc8c8,
      textFree: 0x4b0000,
      borderColor: 0xc06060,
    },
  },
];

/**
 * Mapping from Unity color names (sent by backend as ticket.color) to theme index.
 * Keys match the color names used in TicketColorManager and SpilloramaGameBridge.
 */
const THEME_BY_NAME: Record<string, number> = {
  // Default / standard color cycling
  "Default":       0,
  "Small Yellow":  1,
  "Small White":   2,
  "Small Purple":  3,
  "Small Red":     4,
  "Small Green":   5,
  "Small Orange":  6,
  // Large variants map to same visual base but could be extended
  "Large Yellow":  1,
  "Large White":   2,
  "Large Purple":  3,
  "Large Red":     4,
  "Large Green":   5,
  "Large Orange":  6,
  // Elvis variants (all identical visually)
  "Elvis1":        7,
  "Elvis2":        7,
  "Elvis3":        7,
  "Elvis4":        7,
  "Elvis5":        7,
  "Small Elvis1":  7,
  "Small Elvis2":  7,
  "Small Elvis3":  7,
  "Small Elvis4":  7,
  "Small Elvis5":  7,
};

/** Get a theme by cycling through the list based on ticket index (uses first 7, skips elvis). */
export function getTicketTheme(index: number): TicketColorTheme {
  // Cycle through standard colors only (0-6), skip elvis (7)
  const STANDARD_COUNT = 7;
  return TICKET_THEMES[index % STANDARD_COUNT];
}

/** Get a theme by Unity color name (e.g. "Small Yellow"). Falls back to cycling by index. */
export function getTicketThemeByName(colorName: string | undefined, fallbackIndex: number): TicketColorTheme {
  if (colorName && colorName in THEME_BY_NAME) {
    return TICKET_THEMES[THEME_BY_NAME[colorName]];
  }
  return getTicketTheme(fallbackIndex);
}
