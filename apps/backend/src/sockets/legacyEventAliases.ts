import type { Socket } from "socket.io";

/**
 * BIN-585: Unity fallback-klient (client_variant="unity-fallback" per BIN-540)
 * sender legacy event-navn som `SwapTicket`, `Game2BuyBlindTickets` osv.
 * Denne fila aliaser legacy-navn → kanonisk nytt event-navn på socket-nivå
 * ved å re-dispatche til allerede-registrerte handlers via
 * `socket.listeners(canonical)`.
 *
 * Kontrakten:
 * - Alias registreres ETTER canonical-handleren — se wiring i
 *   `apps/backend/src/index.ts` og `__tests__/testServer.ts`.
 * - Klienten sender NY payload-form (`roomCode`, `ticketId` osv.). Mappet fra
 *   legacy-feltnavn (`gameId` → `roomCode`) er Unity-bridge sitt ansvar; vi
 *   gjør ikke payload-transform her. Se SOCKET_EVENT_MATRIX.md.
 * - Fjernes når Unity slås av permanent.
 */
const LEGACY_EVENT_ALIASES: Record<string, string> = {
  // BIN-585 PR A
  SwapTicket: "ticket:swap",
  // BIN-585 PR B, D og videre legger til flere her.
};

export function registerLegacyEventAliases(socket: Socket): void {
  for (const [legacyName, canonicalName] of Object.entries(LEGACY_EVENT_ALIASES)) {
    socket.on(legacyName, (...args: unknown[]) => {
      const listeners = socket.listeners(canonicalName);
      if (listeners.length === 0) {
        const callback = args[args.length - 1];
        if (typeof callback === "function") {
          (callback as (r: unknown) => void)({
            ok: false,
            error: { code: "ALIAS_NOT_WIRED", message: `Legacy alias "${legacyName}" has no canonical handler "${canonicalName}" registered.` },
          });
        }
        return;
      }
      for (const listener of listeners) {
        (listener as (...a: unknown[]) => void)(...args);
      }
    });
  }
}

/** Exported for tests. */
export const LEGACY_EVENT_ALIAS_MAP: Readonly<Record<string, string>> = LEGACY_EVENT_ALIASES;
