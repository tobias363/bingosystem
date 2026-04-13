import { Container, Text } from "pixi.js";

/**
 * Displays player count, draw count, and prize pool.
 */
export class PlayerInfoBar extends Container {
  private playersText: Text;
  private drawText: Text;
  private prizeText: Text;

  constructor() {
    super();

    this.playersText = new Text({
      text: "0 spillere",
      style: { fontFamily: "Arial", fontSize: 16, fill: 0xaaaaaa },
    });
    this.addChild(this.playersText);

    this.drawText = new Text({
      text: "",
      style: { fontFamily: "Arial", fontSize: 16, fill: 0xaaaaaa },
    });
    this.drawText.x = 160;
    this.addChild(this.drawText);

    this.prizeText = new Text({
      text: "",
      style: { fontFamily: "Arial", fontSize: 16, fill: 0xffc107 },
    });
    this.prizeText.x = 320;
    this.addChild(this.prizeText);
  }

  update(playerCount: number, drawCount: number, totalDraws: number, prizePool: number): void {
    this.playersText.text = `${playerCount} spillere`;
    this.drawText.text = drawCount > 0 ? `Trekk ${drawCount}/${totalDraws}` : "";
    this.prizeText.text = prizePool > 0 ? `Pott: ${prizePool} kr` : "";
  }
}
