/**
 * BIN-494: Socket.IO Redis adapter cross-node fanout test.
 *
 * Starts two independent Socket.IO servers on different ports, both wired
 * through the same Redis via @socket.io/redis-adapter. Verifies that an emit
 * on node A reaches a client connected to node B.
 *
 * Skipped when REDIS_URL is unset — the happy path only matters in Redis-enabled
 * environments and the test would deadlock waiting for a Redis that does not exist.
 */
import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import { Server } from "socket.io";
import { io as ioClient, type Socket as ClientSocket } from "socket.io-client";
import { createAdapter } from "@socket.io/redis-adapter";
import { Redis } from "ioredis";

const REDIS_URL = process.env.REDIS_URL?.trim();

async function startNode(redisUrl: string): Promise<{
  io: Server;
  port: number;
  pub: Redis;
  sub: Redis;
  close: () => Promise<void>;
}> {
  const pub = new Redis(redisUrl, { maxRetriesPerRequest: 3, lazyConnect: false });
  const sub = pub.duplicate();
  const server = http.createServer();
  const io = new Server(server, { cors: { origin: "*" } });
  io.adapter(createAdapter(pub, sub));
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  return {
    io,
    port,
    pub,
    sub,
    close: async () => {
      io.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      try { await pub.quit(); } catch { /* best effort */ }
      try { await sub.quit(); } catch { /* best effort */ }
    },
  };
}

function connect(port: number): Promise<ClientSocket> {
  return new Promise((resolve, reject) => {
    const c = ioClient(`http://localhost:${port}`, { transports: ["websocket"], reconnection: false });
    c.on("connect", () => resolve(c));
    c.on("connect_error", (err) => reject(err));
  });
}

test("BIN-494: cross-node fanout via Redis adapter", { skip: !REDIS_URL ? "REDIS_URL unset — skipping Redis adapter test" : false }, async () => {
  const nodeA = await startNode(REDIS_URL!);
  const nodeB = await startNode(REDIS_URL!);

  // Track room joins from clients connected to each node. The adapter handles
  // cross-node fanout only after the subscription is propagated, so we need
  // both clients joined before emitting.
  nodeA.io.on("connection", (s) => s.on("room:join", (roomCode: string, ack: () => void) => { s.join(roomCode); ack(); }));
  nodeB.io.on("connection", (s) => s.on("room:join", (roomCode: string, ack: () => void) => { s.join(roomCode); ack(); }));

  const clientA = await connect(nodeA.port);
  const clientB = await connect(nodeB.port);

  try {
    const roomCode = "BIN494-TEST";
    await new Promise<void>((resolve) => clientA.emit("room:join", roomCode, () => resolve()));
    await new Promise<void>((resolve) => clientB.emit("room:join", roomCode, () => resolve()));

    const received = new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Client B did not receive cross-node event within 3s")), 3000);
      clientB.once("x-node:ping", (payload) => { clearTimeout(timer); resolve(payload); });
    });

    // Tiny settle so the adapter's pub/sub subscription for the room is live on both nodes.
    await new Promise((r) => setTimeout(r, 100));

    nodeA.io.to(roomCode).emit("x-node:ping", { from: "A", roomCode });

    const payload = await received;
    assert.deepEqual(payload, { from: "A", roomCode });
  } finally {
    clientA.disconnect();
    clientB.disconnect();
    await nodeA.close();
    await nodeB.close();
  }
});
