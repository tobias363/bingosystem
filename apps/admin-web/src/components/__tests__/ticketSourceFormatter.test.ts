// REQ-138: tests for POINTS-skjuling i ticket-source-rendering.

import { describe, expect, it } from "vitest";
import { formatTicketSource, isPointsSource } from "../ticketSourceFormatter.js";

describe("formatTicketSource (REQ-138)", () => {
  it("returnerer em-dash for null/undefined/empty", () => {
    expect(formatTicketSource(null)).toBe("—");
    expect(formatTicketSource(undefined)).toBe("—");
    expect(formatTicketSource("")).toBe("—");
    expect(formatTicketSource("   ")).toBe("—");
  });

  it("preserver Wallet/Cash/Card uten endring", () => {
    expect(formatTicketSource("Wallet")).toBe("Wallet");
    expect(formatTicketSource("Cash")).toBe("Cash");
    expect(formatTicketSource("Card")).toBe("Card");
    expect(formatTicketSource("Kr")).toBe("Kr");
  });

  it("skjuler 'Points' og varianter — REQ-138", () => {
    expect(formatTicketSource("Points")).toBe("Wallet");
    expect(formatTicketSource("points")).toBe("Wallet");
    expect(formatTicketSource("POINTS")).toBe("Wallet");
    expect(formatTicketSource("Poeng")).toBe("Wallet");
    expect(formatTicketSource("loyalty_points")).toBe("Wallet");
    expect(formatTicketSource("Loyalty Points")).toBe("Wallet");
    expect(formatTicketSource("loyalty-points")).toBe("Wallet");
  });

  it("returnerer ikke-typer som em-dash", () => {
    expect(formatTicketSource(123 as unknown)).toBe("—");
    expect(formatTicketSource({} as unknown)).toBe("—");
  });
});

describe("isPointsSource (REQ-138)", () => {
  it("identifiserer alle Points-varianter", () => {
    expect(isPointsSource("Points")).toBe(true);
    expect(isPointsSource("points")).toBe(true);
    expect(isPointsSource("Poeng")).toBe(true);
    expect(isPointsSource("LOYALTY_POINTS")).toBe(true);
    expect(isPointsSource("loyalty-points")).toBe(true);
  });

  it("returnerer false for ikke-Points-kilder", () => {
    expect(isPointsSource("Wallet")).toBe(false);
    expect(isPointsSource("Cash")).toBe(false);
    expect(isPointsSource("")).toBe(false);
    expect(isPointsSource(null)).toBe(false);
    expect(isPointsSource(undefined)).toBe(false);
  });
});
