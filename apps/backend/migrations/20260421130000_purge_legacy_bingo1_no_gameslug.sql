-- One-shot cleanup: remove legacy game_checkpoints / mark stale game_sessions
-- for canonical bingo room "BINGO1" rows that were created BEFORE gameSlug was
-- propagated through buildRoomUpdatePayload (fixed in fix-game1-unify).
--
-- Symptom on a deployed env: backend restart restores BINGO1 from checkpoint
-- with gameSlug=undefined, which falls back to 60-ball / 3x5 tickets even
-- though the engine's draw bag is correctly 75-ball. Players see 3x5 grids
-- with numbers 1-60 while balls 61-75 are drawn.
--
-- Idempotent: safe to re-run; deletes only hit the legacy snapshots that
-- still lack a gameSlug. Active rooms created post-fix are left alone.

BEGIN;

UPDATE game_sessions
SET status = 'ENDED', ended_at = NOW()
WHERE room_code = 'BINGO1'
  AND status = 'RUNNING';

DELETE FROM game_checkpoints
WHERE room_code = 'BINGO1'
  AND (
    snapshot ->> 'gameSlug' IS NULL
    OR snapshot ->> 'gameSlug' = ''
  );

COMMIT;
