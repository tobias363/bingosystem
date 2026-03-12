# Theme1 Cleanup Ledger

## Scope
- Phase 1 production scope: Theme1 runtime/render/data/test and direct editor support.
- No scene/resource cleanup in this round.
- Prototype and capture tools are either kept as explicit debug support or quarantined outside the Theme1 production path.

## Frozen Baseline
- `bash scripts/unity-compile-check.sh`: `PASS`
- `bash scripts/unity-theme1-smoke.sh`: `FAIL`
  - Known baseline mismatch:
    - `cards[0].cells[12].number: expected='15' actual='13'`
    - `cards[0].cells[13].number: expected='13' actual='14'`
    - `cards[0].cells[14].number: expected='14' actual='15'`
- `UNITY_THEME1_VISUAL_CAPTURE_FULL_FRAME=1 ... bash scripts/unity-theme1-visual-preview.sh`: `PASS`
- `CANDY_SOAK_TARGET_DRAWS=40 CANDY_SOAK_TIMEOUT_SECONDS=900 bash scripts/unity-draw-soak.sh`: `FAIL`
  - Known baseline mismatch:
    - `no synchronized near-win visuals observed`

## Keep
- `Candy/Assets/Script/APIManager.Theme1RealtimeView.cs`
- `Candy/Assets/Script/Theme1BongPatternRenderState.cs`
- `Candy/Assets/Script/Theme1BongRenderUtils.cs`
- `Candy/Assets/Script/Theme1BongStyle.cs`
- `Candy/Assets/Script/Theme1BongTypography.cs`
- `Candy/Assets/Script/Theme1ButtonPressFeedback.cs`
- `Candy/Assets/Script/Theme1ButtonRelayProxy.cs`
- `Candy/Assets/Script/Theme1CellPulseController.cs`
- `Candy/Assets/Script/Theme1DisplayPresenter.cs`
- `Candy/Assets/Script/Theme1DisplayState.cs`
- `Candy/Assets/Script/Theme1GameplayViewRepairUtils.cs`
- `Candy/Assets/Script/Theme1GameplayViewRoot.cs`
- `Candy/Assets/Script/Theme1HudControlRuntimeBuilder.cs`
- `Candy/Assets/Script/Theme1HudControlStyle.cs`
- `Candy/Assets/Script/Theme1HudTextMirror.cs`
- `Candy/Assets/Script/Theme1LocalStateAdapter.cs`
- `Candy/Assets/Script/Theme1ManagedTypographyRegistry.cs`
- `Candy/Assets/Script/Theme1PatternEngine.cs`
- `Candy/Assets/Script/Theme1RealtimePresenter.cs`
- `Candy/Assets/Script/Theme1RealtimeStateAdapter.cs`
- `Candy/Assets/Script/Theme1RoundRenderState.cs`
- `Candy/Assets/Script/Theme1RoundRenderStateComparer.cs`
- `Candy/Assets/Script/Theme1RuntimeAssetCatalog.cs`
- `Candy/Assets/Script/Theme1RuntimeMaterialCatalog.cs`
- `Candy/Assets/Script/Theme1RuntimeShapeCatalog.cs`
- `Candy/Assets/Script/Theme1StateBuilder.cs`
- `Candy/Assets/Script/Theme1VisibleTextBridge.cs`
- `Candy/Assets/Editor/CandyTheme1DedicatedRealtimeSmoke.cs`

## Consolidate
- `Candy/Assets/Script/Theme1DisplayPresenter.cs`
  - Shares HUD/text application rules with `Theme1RealtimePresenter.cs`.
- `Candy/Assets/Script/Theme1RealtimePresenter.cs`
  - Shares HUD/text application rules with `Theme1DisplayPresenter.cs`.
- `Candy/Assets/Script/Theme1GameplayViewRoot.cs`
  - Applies Theme1 HUD styling separately from the presenters; should use the same helper path.
- `Candy/Assets/Script/Theme1HudControlStyle.cs`
  - Theme1 HUD styling constants should remain here as the single authoritative style source.

## Quarantine
- `Candy/Assets/Editor/Debug/Theme1/Theme1VisualRenderCapture.cs`
  - Useful, but debug-only capture support.
- `Candy/Assets/Editor/Debug/Theme1/Theme1VisualCaptureRequestListener.cs`
  - Useful, but debug-only editor automation.
- `Candy/Assets/Editor/Debug/Theme1/Theme1MachineMotionProbe.cs`
  - Debug-only probe, not part of Theme1 production flow.
- `Candy/Assets/Editor/Debug/Theme1/Theme1MachineMotionProbeRequestListener.cs`
  - Debug-only probe listener.
- `Candy/Assets/Editor/Prototype/Theme3/CandyDrawMachinePrototypeSceneBuilder.cs`
  - Theme3/draw-machine prototype tooling.
- `Candy/Assets/Editor/Prototype/Theme3/Theme3PrototypeMotionProbe.cs`
  - Theme3 prototype tooling.
- `Candy/Assets/Editor/Prototype/Theme3/Theme3PrototypeVisualCapture.cs`
  - Theme3 prototype tooling.
- `Candy/Assets/Script/Prototype/Theme3/CandyDrawMachinePrototypeController.cs`
  - Theme3 prototype runtime controller, not Theme1 production.

## Remove
- `Candy/Assets/Script/Theme1TmpTextMirror.cs`
  - Audit found no direct C# references, no menu entrypoints, no request listeners, and no `Resources.Load` / string-based lookups.
  - Replaced by the active Theme1 HUD/runtime mirror path using `Theme1HudTextMirror` and `Theme1VisibleTextBridge`.

## Cleanup Batches
- Batch 1: consolidate Theme1 presenter/HUD text/styling helpers and remove `Theme1TmpTextMirror.cs`.
- Batch 2: move Theme1 visual/probe utilities into a clear editor debug zone.
- Batch 3: move Theme3 draw-machine prototype code into a clear prototype zone without changing production Theme1 behavior.

## Implemented In This Round
- Batch 1
  - Added shared `Theme1PresentationTextUtils` for Theme1 presenters.
  - Centralized HUD bar styling through `Theme1HudControlStyle.ApplyHudBarStyles`.
  - Removed dead `Theme1TmpTextMirror.cs`.
  - Aligned zero-win handling so hidden per-card win labels are cleared consistently in both runtime display and captured Theme1 state.
- Batch 2
  - Moved Theme1 visual capture and motion probe editor tools into `Assets/Editor/Debug/Theme1`.
- Batch 3
  - Moved Theme3 prototype editor/runtime helpers into `Assets/Editor/Prototype/Theme3` and `Assets/Script/Prototype/Theme3`.
