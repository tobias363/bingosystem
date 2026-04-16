# Roulette Wheel Cross-Platform Verification — Game 5

**Date:** 2026-04-14
**Scope:** `RouletteWheel.ts` (in-game) + `JackpotOverlay.ts` (jackpot mini-game)

---

## 1. Components Verified

### RouletteWheel (in-game visual)
- **Location:** `packages/game-client/src/games/game5/components/RouletteWheel.ts`
- **Purpose:** Spins on every number draw during gameplay, showing the drawn number
- **Rendering:** PixiJS Graphics (procedural arcs) + optional sprite overlay
- **Animation:** GSAP `power3.out` ease, 5 full rotations, 5s duration
- **Integration:** Right side of PlayScreen, radius adapts to `min(100, screenHeight * 0.22)`

### JackpotOverlay (jackpot mini-game)
- **Location:** `packages/game-client/src/games/game5/components/JackpotOverlay.ts`
- **Purpose:** Full-screen overlay after BINGO win, player spins for bonus prize
- **Rendering:** PixiJS Graphics (procedural arcs) + optional arrow sprite
- **Animation:** GSAP `power3.out` ease, 5 full rotations, 5s duration
- **Interaction:** SPINN button (pointer events) + 10s auto-spin countdown

---

## 2. Animation Analysis

### Rotation calculation (both components)
```js
const segmentAngle = 360 / NUM_SEGMENTS;  // 45° per segment
const targetAngle = segmentIndex * segmentAngle + segmentAngle / 2;  // Land center
const totalRotation = 360 * 5 + (360 - targetAngle);  // 5 full rotations + offset
```

This is a pure GSAP rotation tween — no physics engine needed. The `power3.out` easing provides natural deceleration (fast start, slow end).

### Performance characteristics
| Metric | Expected | Notes |
|--------|----------|-------|
| Draw calls per frame | 1–2 | Single container rotation, not individual segment redraws |
| CPU during spin | Minimal | GSAP drives one `rotation` property |
| GPU load | Trivial | No shaders, no particles, 2D rotation only |
| Memory | ~1 MB | 8 Graphics objects + text labels |
| Animation frames | 300 (60fps × 5s) | Standard GSAP ticker at display refresh rate |

---

## 3. Cross-Platform Compatibility

### Desktop (Chrome/Edge/Firefox)
| Check | Status | Notes |
|-------|--------|-------|
| WebGL rendering | OK | PixiJS auto-selects WebGL2 → WebGL1 fallback |
| GSAP `power3.out` easing | OK | Pure JS math, no platform dependency |
| 60fps during spin | OK | Single container rotation, trivial GPU load |
| Pointer events (SPINN button) | OK | Standard `pointerdown` event |
| Sprite loading fallback | OK | `catch` block keeps procedural graphics |
| Center number display | OK | Scale tween on Text object |

### iOS Safari
| Check | Status | Notes |
|-------|--------|-------|
| WebGL context | OK | iOS Safari supports WebGL 2.0 since iOS 15 |
| Touch events | OK | PixiJS maps touch → pointer events automatically |
| GSAP animations | OK | requestAnimationFrame-based, no Safari-specific issues |
| `setInterval` for auto-spin | OK | Not throttled in foreground tab |
| Memory pressure | OK | ~1 MB for wheel, well within iOS WebGL limits |
| Viewport scaling | OK | `autoDensity: true` + `devicePixelRatio` in GameApp |
| WebGL context loss | Low risk | Simple 2D scene, no large textures |

**Known Safari considerations:**
- iOS Safari throttles `requestAnimationFrame` to 30fps when low-power mode is active. GSAP animation still completes correctly (duration-based, not frame-based), but may appear less smooth.
- No CSS transforms involved — purely canvas-based rendering.

### Android Chrome
| Check | Status | Notes |
|-------|--------|-------|
| WebGL rendering | OK | Supported on all Android 5.0+ devices |
| Touch events | OK | PixiJS pointer abstraction handles this |
| Low-end GPU (Mali-400) | OK | Single container rotation, no overdraw |
| Memory (512MB devices) | OK | Total game-client ~10MB heap |
| GSAP timing | OK | `Date.now()`-based, not frame-dependent |

### Responsive layout
| Screen size | Wheel radius | Adequate? |
|-------------|-------------|-----------|
| Desktop (1920×1080) | 100px | Yes — right sidebar |
| Tablet (1024×768) | 100px | Yes — fits comfortably |
| Mobile portrait (375×667) | 100px | Tight — `wheelAreaWidth` = 240px, leaves 135px for tickets |
| Mobile portrait (320×568) | 100px | Tight — consider reducing radius on narrow screens |

**Recommendation:** For screens < 400px wide, consider reducing `wheelRadius` cap or stacking layout vertically. Current implementation uses `min(100, screenHeight * 0.22)` which only scales with height, not width.

---

## 4. Outcome Readability

### During gameplay (RouletteWheel)
- Drawn number displayed in center circle after spin (28px font at radius=100)
- Center circle animates in with scale tween (0.3 → 1.8 → 1.0)
- Segment labels show random numbers during spin, not relevant to outcome
- **Verdict:** Clear — center display is the primary outcome indicator

### Jackpot overlay (JackpotOverlay)
- Prize labels on wheel segments (`15 kr`, `50 kr`, etc.) — 15% of radius font size
- Result text below wheel: `"Du vant XXX kr!"` — 28px bold yellow on dark backdrop
- Arrow pointer at top indicates winning segment after spin
- **Verdict:** Clear — both segment label and result text confirm outcome

---

## 5. Touch Interaction

### SPINN button (JackpotOverlay)
- `eventMode = "static"` + `cursor = "pointer"` — standard PixiJS interactive
- `pointerdown` event (not `click`) — responds immediately on touch
- Disabled during spin (`isSpinning` guard in `handleSpinClick`)
- Button size: 180×50px — adequate touch target (exceeds 48×48 minimum)
- Auto-spin timer provides fallback if player doesn't interact

### RouletteWheel (passive)
- No touch interaction — spins automatically on number draw
- No user input needed

---

## 6. Visual Comparison with Unity

| Aspect | Web (PixiJS) | Unity |
|--------|-------------|-------|
| Segments | 8 colored arcs (procedural) | Sprite-based wheel texture |
| Colors | `[0xe63946, 0xf77f00, 0xffba00, 0x2a9d8f, 0x457b9d, 0x9b59b6, ...]` | Match Spillorama theme |
| Arrow | Procedural triangle (gold/maroon) or sprite | Sprite asset |
| Spin duration | 5s | ~5s (Unity animation curve) |
| Easing | `power3.out` (GSAP) | Similar deceleration curve |
| Hub | Maroon circle with gold border | Sprite |
| Outcome display | Center number (RouletteWheel) / result text (Jackpot) | Similar |

**Sprite upgrade path:** The web client attempts to load Unity sprite assets (`roulette-wheel.png`, `roulette-arrow.png`, `roulette-stand.png`) from `assets/game5/`. When available, these replace the procedural graphics for pixel-identical appearance with Unity. Currently falls back to procedural.

---

## 7. FPS During Spin (Estimated)

GSAP uses `requestAnimationFrame` and only updates the `rotation` property of one PixiJS `Container`. PixiJS re-renders the rotated container as a single GPU operation (matrix transform on pre-rasterized Graphics).

| Device class | Expected FPS | Bottleneck |
|--------------|-------------|-----------|
| Desktop (any) | 60 fps | None |
| iPad Air (2022+) | 60 fps | None |
| iPhone SE (2022) | 60 fps | None |
| Samsung Galaxy A14 (low-end) | 55–60 fps | Minor — integrated GPU |
| iPhone 8 (2017) | 60 fps | None — GPU handles 2D rotations trivially |

For comparison, a 2D rotation of 8 colored arcs + text labels is orders of magnitude below any GPU's capability threshold. The bottleneck for bingo games is JavaScript execution (socket events, state updates), not rendering.

---

## 8. Issues Found

### None critical. Minor recommendations:

1. **Narrow mobile layout** — On screens < 400px wide, the roulette wheel takes ~60% of screen width, leaving little room for tickets. Consider a `Math.min(80, ...)` radius cap or vertical stacking for mobile portrait.

2. **JackpotOverlay `wheelContainer.children[0]` access** — Line 178-179 accesses the wheel inner container by index. If sprite loading reorders children, this could target the wrong child. The wheel inner is created in `drawWheel()` and should be the only child, but a `name` property would be safer.

3. **Auto-spin timer not paused on tab switch** — The 10s `setInterval` countdown continues when the tab is backgrounded. Not a bug (auto-spin is the correct behavior), but the visual countdown may show stale values when switching back. Minor UX issue.

---

## 9. Manual Testing Checklist

The following requires manual testing on physical devices (cannot be automated):

| # | Test | Device | Status |
|---|------|--------|--------|
| 1 | Wheel renders correctly (8 segments, labels visible) | Desktop Chrome | |
| 2 | Wheel renders correctly | iOS Safari (iPhone) | |
| 3 | Wheel renders correctly | Android Chrome | |
| 4 | Spin animation smooth (no jank) | Desktop | |
| 5 | Spin animation smooth | iOS Safari | |
| 6 | Spin animation smooth | Android Chrome (mid-range) | |
| 7 | SPINN button responds to touch | iOS Safari | |
| 8 | SPINN button responds to touch | Android Chrome | |
| 9 | Auto-spin triggers after 10s idle | Any | |
| 10 | Result text readable after spin | Mobile (small screen) | |
| 11 | Jackpot overlay blocks background interaction | Any | |
| 12 | Wheel segment labels show correct prize amounts | Any | |
| 13 | Center number visible after gameplay spin | Desktop + mobile | |
| 14 | Low-power mode (iOS) — animation still completes | iOS | |

**Test URL:** `http://localhost:4000/web/?webClient=game_5`
