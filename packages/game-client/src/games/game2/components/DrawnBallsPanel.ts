import { Container } from "pixi.js";
import { NumberBall } from "../../../components/NumberBall.js";

const MAX_VISIBLE = 10;
const BALL_SIZE = 40;
const GAP = 4;

/**
 * Horizontal row of drawn NumberBall instances.
 * Shows the last MAX_VISIBLE drawn balls, newest on the right.
 */
export class DrawnBallsPanel extends Container {
  private balls: NumberBall[] = [];

  addBall(number: number): void {
    const ball = new NumberBall(number, BALL_SIZE);
    ball.x = this.balls.length * (BALL_SIZE + GAP);
    ball.y = 0;
    this.addChild(ball);
    this.balls.push(ball);

    // Remove oldest if exceeding max
    while (this.balls.length > MAX_VISIBLE) {
      const oldest = this.balls.shift()!;
      oldest.destroy();
    }

    // Reposition remaining
    for (let i = 0; i < this.balls.length; i++) {
      this.balls[i].x = i * (BALL_SIZE + GAP);
    }
  }

  clear(): void {
    for (const ball of this.balls) ball.destroy();
    this.removeChildren();
    this.balls = [];
  }

  get panelWidth(): number {
    return Math.min(this.balls.length, MAX_VISIBLE) * (BALL_SIZE + GAP) - GAP;
  }
}
