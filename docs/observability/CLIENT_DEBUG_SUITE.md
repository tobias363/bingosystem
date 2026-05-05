# Client-side Debug Suite (Fase 2B)

**Levert:** 2026-05-05 (feat/client-debug-suite-fase-2b-2026-05-05)
**Tobias-direktiv:** "Full kontroll fra console i nettleser hva som skjer slik at vi eventuelt kan justere utifra hva som virkelig skjer."

Dette er klient-sidens forensikk-verktøy. Den lar utviklere og testere se eksakt hva spill-klienten gjør i sann tid — socket-events, state-mutasjoner, latency, errors — og simulere edge-cases (offline, slow network, race-conditions) direkte fra DevTools console.

Suiten er **opt-in i prod**. Ingen overhead for vanlige spillere.

## Aktivering

| Metode | Når brukes | Eksempel |
|---|---|---|
| URL-flag | One-shot debugging | `https://spillorama.no/web/?debug=1` |
| localStorage | Sticky på tvers av reloads | `localStorage.setItem('spillorama.debug', '1')` |
| Cookie | Hall-terminal kiosker | `document.cookie = 'spillorama.debug=1'` |

Når en av de tre er satt:
- Floating HUD-panel mounter top-right (drag fra title-bar for å flytte; pos persisterer i localStorage)
- `window.spillorama.debug.*` API tilgjengelig i console
- Strukturert console-logger fanger alle socket-events + engine-mutasjoner
- IndexedDB lagrer auto-snapshots ved errors

Slå av: `localStorage.removeItem('spillorama.debug')` og reload.

## Keyboard shortcuts

| Tastetrykk | Effekt |
|---|---|
| `Ctrl+Shift+D` (`Cmd+Shift+D` på Mac) | Toggle HUD synlighet |
| `F8` | Samme som over (alternativ) |
| `Ctrl+Alt+P` (`Cmd+Alt+P`) | Toggle PerfHud (eksisterende komponent) |

## API-oversikt

```javascript
window.spillorama.debug = {
  // 1. Strukturert logger
  setLogLevel('debug' | 'info' | 'warn' | 'error'),

  // 2. HUD
  toggleHud(),

  // 3. Event-historikk
  events.all(),                          // hele bufferen (siste 500)
  events.last(20),                       // siste 20
  events.byType('drawNew'),              // filtrer på type
  events.bySource('socket-in'),          // filtrer på kilde
  events.filter(e => e.payload?.foo),    // egen predicate
  events.replay({ onEvent, speed: 2 }),  // re-spill events
  events.clear(),

  // 4. State-inspector
  state(),                               // gjeldende state-snapshot
  watch('room.drawnNumbers'),            // logg når path endres
  diff(sinceMs),                         // diff state mot N ms tilbake

  // 5. Socket-injector
  emit('event-name', { payload }),       // send til server
  simulateRecv('drawNew', { ... }),      // simuler innkommende

  // 6. Edge-case simulators
  simulateOffline(5000),                 // disconnect i N ms
  simulateLatency(300),                  // legg til 300ms på alle emits
  simulatePacketLoss(20),                // dropp 20% av events
  simulateRaceCondition({ type: 'host-disconnect-mid-draw' }),

  // 7. Performance profiler
  profile.start('label'),
  profile.end('label'),                  // returnerer ms
  profile.report(),                      // p50/p95/p99 per label

  // 8. Stress-tester
  stress({ rapidPurchase: 30 }),         // kjøp 30 brett
  stress({ rapidJoin: 100 }),            // 100 paralelle joins
  stress({ longSession: 300 }),          // 5 min idle, mem-sjekk

  // 9. Network-tap
  network.frames(),                      // alle frames
  network.window(5000),                  // siste 5 sek
  network.throughput(),                  // bytes/sec sent + recv

  // 10. Snapshots (auto-saved på errors)
  snapshots(),                           // liste alle
  snapshot('snap-0001'),                 // hent en spesifikk
  snapshot('snap-0001').export(),        // JSON for bug-rapport
  takeSnapshot('manual-reason'),         // manuell capture

  installed: true,
  version: '0.1.0-fase-2b-2026-05-05',
};
```

## Recipes

### 1. "Hvorfor er Spill 1-bordet mitt fast?"

```javascript
// Hva sa server sist?
window.spillorama.debug.events.byType('drawNew').slice(-5)

// Hva er klient sin lokale state?
window.spillorama.debug.state()

// Når kom siste room:update?
window.spillorama.debug.events.byType('roomUpdate').slice(-1)[0].timestamp

// Hva endret seg siste 30 sek?
window.spillorama.debug.diff(30_000)
```

### 2. Reproduser en bug der host blir offline midt i draw

```javascript
// Watch state under simulering
const unsub = window.spillorama.debug.watch('drawCount');

// Trigger simulering
await window.spillorama.debug.simulateRaceCondition({
  type: 'host-disconnect-mid-draw',
  drawIndex: 5
});

// Når du er ferdig:
unsub();
```

### 3. Stress-test rapid-purchase mot prod

```javascript
// Kjøp 50 bonger fortløpende — sjekk om idempotency-key holder
const report = await window.spillorama.debug.stress({
  rapidPurchase: 50,
  intervalMs: 100  // 100ms mellom hver
});

console.log(report.summary);
// ["ok: 50, failed: 0", "latency p50=45ms p95=120ms max=210ms"]
```

### 4. Mistanke om memory-leak under lang sesjon

```javascript
// Sit idle i 10 min, sample mem hver 30 sek
const report = await window.spillorama.debug.stress({
  longSession: 600,
  sampleIntervalMs: 30_000
});

console.log(report.summary);
// Ser etter "memory drift: X MB over 600s"
// Drift > 10 MB indikerer leak
```

### 5. Test dårlig nettverk

```javascript
// Legg til 500ms latency + 10% packet loss
window.spillorama.debug.simulateLatency(500);
window.spillorama.debug.simulatePacketLoss(10);

// ... bruk klienten normalt ...

// Sjekk effekten:
window.spillorama.debug.profile.report()
// Viser p95/p99 per emit-type

window.spillorama.debug.network.throughput(10_000)
// { sent: 1234, received: 5678 } bytes/s

// Slå av:
window.spillorama.debug.simulateLatency(0);
window.spillorama.debug.simulatePacketLoss(0);
```

### 6. Eksporter snapshot for bug-rapport

```javascript
// Manuell snapshot:
const snap = await window.spillorama.debug.takeSnapshot('stuck-draw-2026-05-05');

// Eksporter til JSON:
const json = window.spillorama.debug.snapshot(snap.id).export();

// Kopier til clipboard:
copy(json);  // (DevTools-funksjon — limer JSON-blob i clipboard)

// Eller last ned manuelt:
const blob = new Blob([json], { type: 'application/json' });
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = `${snap.id}.json`;
a.click();
URL.revokeObjectURL(url);
```

### 7. Watcher som logger når draws kommer

```javascript
window.spillorama.debug.watch('drawnNumbers', (newVal, oldVal) => {
  console.log('draws:', oldVal?.length, '→', newVal?.length);
});

// Hver gang server sender draw:new, ser du:
// draws: 14 → 15
// draws: 15 → 16
```

### 8. Replay events fra IDB-snapshot lokalt

```javascript
// Last opp en snapshot som ble eksportert tidligere:
const json = '...'; // limt inn JSON-tekst
const data = JSON.parse(json);

// Re-spill events i nåværende klient (krever event-stream-shape-paritet):
for (const ev of data.events) {
  console.log(`[${ev.traceId}] ${ev.source}:${ev.type}`, ev.payload);
}
```

## Trace-id-format

Klient-trace-ids matcher backend ErrorCode-registry (Fase 2A):

```
CLI-{module}-{NNNN}
```

- `CLI` = klient-prefix (kollisjonssikkert mot backend `BIN-XXX`)
- `module` = game-slug eller `client`/`harness`
- `NNNN` = monotonic seq, zero-padded

Eksempel: `CLI-BINGO-0042`, `CLI-ROCKET-0173`.

For bug-rapporter: inkluder trace-id fra konsoll-utdraget. Backend-team kan korrelere mot egne logger via correlation-id når den finnes.

## Sikkerhet og personvern

**Hvilke data eksponeres:**
- Wallet-id og spiller-id: kun **første 8 tegn** (`a3bf21cd…`). Aldri full id.
- Access-token: aldri logget eller eksponert
- Passord: ikke aktuelt — passwords går aldri gjennom socket
- Personnummer / adresse / e-post: ikke aktuelt — disse er ikke i klient-state

**Hvilke kanaler er sensitive:**
- `chatMessage` — inneholder fri tekst fra spillere. Ved snapshot-eksport er payload bevart. Ikke del snapshots offentlig uten å sanitere chat-tekst.

**IndexedDB-lagring:**
- Maks 20 snapshots, FIFO eviction
- Slettes ved `localStorage.removeItem('spillorama.debug')` + reload? Nei — IDB lever uavhengig. Slett via `indexedDB.deleteDatabase('spillorama.debug')`.

## Feilsøking

**Q: `window.spillorama.debug` er undefined.**
A: Sjekk at en av aktiveringskanalene er satt. `localStorage.getItem('spillorama.debug')` skal gi `'1'`. Hvis URL-flag — sjekk at `?debug=1` står i URL-en.

**Q: HUD vises ikke selv om suiten er installert.**
A: HUD kan være toggle-skjult. Trykk `Ctrl+Shift+D` eller `F8`. Sjekk også `localStorage.getItem('spillorama.debug.hud.pos')` — hvis HUD havnet utenfor viewport, slett den nøkkelen.

**Q: `simulateRecv()` kaster feil "no-socket".**
A: Suiten ble installert FØR socket var klar. Reload med `?debug=1` etter at klienten er ferdig med oppstart.

**Q: Console er full av rød tekst og jeg ser ikke det viktige.**
A: Hev log-level: `window.spillorama.debug.setLogLevel('warn')`.

## Arkitektur (kort)

```
SpilloramaSocket  ─→  socket-tap  ─→  EventBuffer  ─→  console + HUD
                  ↘                    ↑               ↑
                   networkTap          │               │
                                       ↓               │
GameBridge        ─→  StateInspector  ─→  watchers ────┘
                      ↓                   ↑
                      diff/snapshot       │
                                          │
window.error       ─→  SnapshotManager  ──┘
                       (auto-capture)

Operator:
window.spillorama.debug.* ─→  emit/simulate ─→ socket
                          ─→  stress/profile ─→ socket
                          ─→  events/state/snapshots (read)
```

## Tester

`packages/game-client/src/debug/*.test.ts` dekker:
- EventBuffer FIFO + replay + filtering
- Activation gate (URL/localStorage/cookie)
- DebugLogger trace-id format + subscriber-bus + console-throwing
- StateInspector watch + clone + diff
- PerformanceProfiler p50/p95/p99 + sort-order
- NetworkTap size + throughput + cap
- SnapshotManager init + capture + clip

44 tester, alle grønne på 2026-05-05.

## Referanser

- Direktiv: Tobias 2026-05-05 (worktree-prompt)
- Eksisterende observability: `packages/game-client/src/diagnostics/PerfHud.ts`, `packages/game-client/src/telemetry/Telemetry.ts`
- Backend-paritet (parallelt løp): Fase 2A ErrorCode-registry (BIN-RKT-DRAW-NNN-format)
- Pilot-skala: 24 haller × 1500 spillere = 36 000 samtidige WebSocket-tilkoblinger (`docs/architecture/MASTER_PLAN_SPILL1_PILOT_2026-04-24.md` §6)
