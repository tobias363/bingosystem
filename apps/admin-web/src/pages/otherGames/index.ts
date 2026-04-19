// PR-A6 (BIN-674) — otherGames dispatcher.
//
// Routes:
//   /wheelOfFortune    → WheelOfFortunePage (24 prizes)
//   /treasureChest     → TreasureChestPage (10 prizes)
//   /mystery           → MysteryGamePage (6 prizes)
//   /colorDraft        → ColorDraftPage (3 colors × 4 prizes)
//
// Backend-gap: BIN-A6-OG (ingen /api/admin/other-games/* ennå).

import { renderWheelOfFortunePage } from "./WheelOfFortunePage.js";
import { renderTreasureChestPage } from "./TreasureChestPage.js";
import { renderMysteryGamePage } from "./MysteryGamePage.js";
import { renderColorDraftPage } from "./ColorDraftPage.js";

const OTHER_GAMES_ROUTES = new Set<string>([
  "/wheelOfFortune",
  "/treasureChest",
  "/mystery",
  "/colorDraft",
]);

export function isOtherGamesRoute(path: string): boolean {
  return OTHER_GAMES_ROUTES.has(path);
}

export function mountOtherGamesRoute(container: HTMLElement, path: string): void {
  container.innerHTML = "";
  switch (path) {
    case "/wheelOfFortune":
      renderWheelOfFortunePage(container);
      return;
    case "/treasureChest":
      renderTreasureChestPage(container);
      return;
    case "/mystery":
      renderMysteryGamePage(container);
      return;
    case "/colorDraft":
      renderColorDraftPage(container);
      return;
    default:
      container.innerHTML = `<div class="box box-danger"><div class="box-body">Unknown otherGames route: ${path}</div></div>`;
  }
}
