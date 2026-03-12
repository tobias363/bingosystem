# Theme1 Stabilization Gate

Date: 2026-03-10

## Scope
This gate records the current stabilization state for `Theme1` covering:
- visual sharpness captures in Editor and WebGL
- draw-loop benchmark for bottom HUD hitching risk
- legacy HUD/mirror removal status
- asset import audit status

## Result Summary
- Compile: PASS
- Theme1 asset import audit: PASS
- Theme1 realtime smoke: PASS
- Editor visual capture gate: PASS at 1920x1080 and 2560x1440
- WebGL shell capture gate: PASS at 1920x1080, 2560x1440, 430x932
- Draw-loop benchmark after Theme1 HUD dirty-check pass: PASS
- Legacy Theme1 HUD mirror scripts moved out of active runtime path: PASS
- Mobile composition parity for Theme1 gameplay layout: NOT YET PASS

## Captures
### Editor captures
- 1920x1080: `/Users/tobiashaugen/Projects/Bingo/output/theme1-captures/editor/theme1-editor-full-1920x1080.png`
- 2560x1440: `/Users/tobiashaugen/Projects/Bingo/output/theme1-captures/editor/theme1-editor-full-2560x1440.png`
- 430x932: `/Users/tobiashaugen/Projects/Bingo/output/theme1-captures/editor/theme1-editor-full-430x932.png`

### WebGL captures
- 1920x1080: `/Users/tobiashaugen/Projects/Bingo/output/theme1-captures/webgl/theme1-webgl-1920x1080.png`
- 2560x1440: `/Users/tobiashaugen/Projects/Bingo/output/theme1-captures/webgl/theme1-webgl-2560x1440.png`
- 430x932: `/Users/tobiashaugen/Projects/Bingo/output/theme1-captures/webgl/theme1-webgl-430x932.png`

## Visual Findings
### Desktop
- Theme1 card frame, ball art, toppers and bottom HUD render sharply in Editor captures.
- WebGL shell now fills the viewport correctly and no longer forces the old fixed desktop canvas shell.

### Mobile-like viewport (430x932)
- WebGL shell is responsive and fills the screen.
- Theme1 gameplay composition is not yet mobile-ready. Content stacks and compresses vertically, and bottom HUD readability is not acceptable.
- This is a Theme1 layout problem, not a WebGL host-shell problem.

## Benchmark
Command:

```bash
/Applications/Unity/Hub/Editor/6000.3.10f1/Unity.app/Contents/MacOS/Unity \
  -batchmode -quit -nographics \
  -projectPath /Users/tobiashaugen/Projects/Bingo/Candy \
  -logFile /tmp/theme1-draw-loop-benchmark.log \
  -executeMethod CandyRealtimeDrawLoopBenchmark.RunRealtimeDrawLoopBenchmark
```

Latest result:

```text
[DrawLoopBenchmark] scene=Assets/Scenes/Theme1.unity iterations=80 drawCount=30 avgMs=20.160 p50Ms=19.943 p95Ms=21.705 minMs=19.350 maxMs=21.863
```

Previous noisy run was approximately:

```text
p95Ms=24.803 maxMs=30.031
```

### Interpretation
- The draw-loop benchmark improved materially from the old noisy baseline after reducing Theme1 HUD write amplification and muting draw-trace/bootstrap logging during the benchmark.
- The latest clean run remains in the same reduced band and no longer shows the previous worst-case spikes around `30 ms`.
- This still does not by itself prove all visible hitching is gone in every runtime context; an interactive profiler pass in the open Editor is still required to close that item.

## Legacy Theme1 HUD / Mirror Status
The following scripts were moved out of the active Theme1 runtime path and now live under Legacy:
- `/Users/tobiashaugen/Projects/Bingo/Candy/Assets/Script/Legacy/Theme1/Theme1HudControlRuntimeBuilder.cs`
- `/Users/tobiashaugen/Projects/Bingo/Candy/Assets/Script/Legacy/Theme1/Theme1VisibleTextBridge.cs`
- `/Users/tobiashaugen/Projects/Bingo/Candy/Assets/Script/Legacy/Theme1/Theme1HudTextMirror.cs`

Notes:
- `Theme1VisibleTextMirrorFactory` still exists in the main script tree for compatibility with non-Theme1 repair/build helpers.
- Active `Theme1` suppresses mirror creation through the current presentation checks and scene cleanup.

## Asset Import Policy Status
Theme1 asset audit reports PASS using the current policy:
- gameplay PNGs: no compression, quality 100, larger max size where needed
- gameplay SVGs: higher import resolution and gradient resolution

Audit command:

```bash
/Applications/Unity/Hub/Editor/6000.3.10f1/Unity.app/Contents/MacOS/Unity \
  -batchmode -quit -nographics \
  -projectPath /Users/tobiashaugen/Projects/Bingo/Candy \
  -logFile /tmp/theme1-asset-audit.log \
  -executeMethod Theme1AssetImportAudit.AuditTheme1AssetImportsCli
```

## Remaining Blockers Before Declaring Theme1 Fully Stable
1. Implement a dedicated mobile composition/layout strategy for Theme1.
2. Run one interactive profiler pass in the live Editor with visible draw activity to confirm bottom HUD no longer flashes under a real frame timeline.
3. Optionally remove or quarantine `Theme1VisibleTextMirrorFactory` once all non-Theme1 repair/build paths are replaced.
