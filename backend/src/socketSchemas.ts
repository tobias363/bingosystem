import { z } from "zod";

// ---------------------------------------------------------------------------
// Shared base schemas
// ---------------------------------------------------------------------------

const authenticatedPayload = z.object({
  accessToken: z.string().optional(),
});

const roomActionPayload = authenticatedPayload.extend({
  roomCode: z.string().min(1, "roomCode is required"),
  playerId: z.string().min(1, "playerId is required"),
});

// ---------------------------------------------------------------------------
// Socket event payload schemas
// ---------------------------------------------------------------------------

export const createRoomSchema = authenticatedPayload.extend({
  playerName: z.string().optional(),
  walletId: z.string().optional(),
  hallId: z.string().optional(),
});

export const joinRoomSchema = createRoomSchema.extend({
  roomCode: z.string().min(1, "roomCode is required"),
});

export const resumeRoomSchema = roomActionPayload;

export const roomStateSchema = authenticatedPayload.extend({
  roomCode: z.string().min(1, "roomCode is required"),
});

export const startGameSchema = roomActionPayload.extend({
  entryFee: z.number().optional(),
  ticketsPerPlayer: z.number().int().positive().optional(),
});

export const betArmSchema = roomActionPayload.extend({
  armed: z.boolean().optional(),
});

export const configureRoomSchema = roomActionPayload.extend({
  entryFee: z.number().optional(),
});

export const endGameSchema = roomActionPayload.extend({
  reason: z.string().optional(),
});

export const drawNextSchema = roomActionPayload;

export const markSchema = roomActionPayload.extend({
  number: z.number().int().positive(),
});

export const ticketRerollSchema = roomActionPayload.extend({
  ticketsPerPlayer: z.number().int().positive().optional(),
  ticketIndex: z.number().int().min(0).optional(),
});

export const claimSchema = roomActionPayload.extend({
  type: z.enum(["LINE", "BINGO"]),
});

export const extraDrawSchema = roomActionPayload.extend({
  requestedCount: z.number().int().positive().optional(),
  packageId: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Utility: parse and throw DomainError on failure
// ---------------------------------------------------------------------------

export function parseSocketPayload<T>(
  schema: z.ZodType<T>,
  payload: unknown,
  eventName: string,
): T {
  const result = schema.safeParse(payload);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join(", ");
    throw Object.assign(new Error(`Invalid ${eventName} payload: ${issues}`), {
      code: "VALIDATION_ERROR",
    });
  }
  return result.data;
}
