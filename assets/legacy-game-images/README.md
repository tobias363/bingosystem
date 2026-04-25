# Legacy Game Images

Bilder ekstrahert fra det gamle Unity-prosjektet (`Spillorama LEGACY`) for visuell referanse i web-implementasjonen av Spill 1, Spill 2, Spill 3 og SpinnGo (Spill 4).

## Source

`/Users/tobiashaugen/Projects/Spillorama LEGACY` — Unity-prosjekt, Assets-mappe.

Hovedasset-undermapper i legacy-prosjektet:
- `Assets/_Project/Sprites/` — eldre asset-organisasjon (per skjerm-nummer)
- `Assets/_Project/New Sprites/` — nyere asset-organisasjon (per spill / hovedmenyer)

## Extraction-dato

2026-04-25

## Innhold

```
assets/legacy-game-images/
├── README.md                 (denne filen)
├── game1/                    Spill 1 — Hovedspill 1, 75-ball 5×5 (60 bilder, 5.9 MB)
│   ├── game-start/           Hoved-game-skjerm (ball tube, 5x5 ticket-mockup)
│   │   Source: Sprites/9 Game 1 Start
│   ├── main-screen/          Stor splash-bilde (Game 1 lobby)
│   │   Source: Sprites/48 Game 1
│   ├── ticket-purchase-panel/        Side-panel for kjøp av tickets
│   │   Source: Sprites/51 Game 1 Ticket Purchase Panel
│   ├── ticket-purchase-side-panel/   Sliders, Group 474/477/478, base graphics
│   │   Source: Sprites/50 Gane 1 Purchase Ticket Side Panel
│   ├── chat/                 Chat-panel (Chat.png, ChatBg, ChatBox 1/2, base, online indicator, send button)
│   │   Source: Sprites/9 Game 1 Start/Chat + New Sprites/Game 1 Chat Closed.png
│   └── chat-emojis/          43 emoji-PNGs (Vector-Smart-Object navngiving)
│       Source: Sprites/9 Game 1 Start/Chat/Emojis
│
├── game2/                    Spill 2 — Hovedspill 2, rakett-tema (23 bilder, 2.5 MB)
│   ├── main/                 Hoved-Bingo Game 2 sprites: rocket, rocket flame/cloud, ticket selection, autoplay, base
│   │   Source: Sprites/18 Bingo game 2
│   └── new-sprites/          Nyere asset-versjoner per panel
│       ├── Choose Tickets/        Active/deactive game button graphics
│       ├── Gameplay/              Ball 4 280x280
│       ├── Rocket/                Rocket sprite (newer)
│       ├── Select Lucky Number/   (kun .meta-filer i original)
│       └── Upcoming Game Popup/   Upcoming-game popup graphics
│       Source: New Sprites/18 Bingo game 2
│
├── game3/                    Spill 3 — Hovedspill 3 (Monsterbingo i web; legacy var bare 5x5-variant) (40 bilder, 516 KB)
│   ├── patterns/             Pattern-grafikk: jackpot, pyramid, plus, V, A, 1L, 2L, M, W, checker board, etc.
│   │   Source: Sprites/Patterns/Game 4 (note: mappenavn i legacy er "Game 4", men disse mønstrene blir brukt av Game 3-panelet)
│   └── markers-backgrounds/  Marker- og bakgrunns-ikoner for å tilpasse Game 3-tickets
│       Source: Sprites/17 Change Marker And Background
│   NOTE: Legacy "Game 3" hadde ingen monster-tema. "Monster bingo" er web-teamets egen visuelle retning;
│   bruk asset-ene her som strukturell referanse, ikke endelig tema. Monster-grafikk må lages på nytt.
│
├── game5/                    SpinnGo — Spill 4 / databingo (45 bilder, 8.0 MB)
│   └── main/                 Komplett Bingo Game 5-asset-pakke
│       ├── (root)            Bakgrunn, BonusImg, Game5RouletteWheel, RouletteBlock, Plus/Minus, Ellipse, Winnings, etc.
│       ├── Drag Options/     Drag-grafikk for chip-beløp: 1, 5, 10, 20, 50
│       ├── Mini Game/        Roulette-grafikk, ball-grafikk, jackpot-arrow/stand/wheel, "Vinn opptil 1.png"
│       │   └── Balls/        8 ball-PNGs (1.png-8.png) for mini-game roulette
│       └── Patterns/         Tom i original (kun Rectangle 782/786 — pattern slot fra atlas)
│       Source: New Sprites/Bingo Game 5
│
└── shared/                   Brukt på tvers av flere spill / fellesskjermer (192 bilder, 33 MB)
    ├── admin-hall-display/   Hall-display ball-grafikk (Blue/Green/Red/Yellow/Purpule 280x280),
    │                         Bingo-skjerm, vinnerskjerm, baller-bakgrunn
    │   Source: Sprites/Admin Display + New Sprites/Admin Bingo Hall Display
    ├── backgrounds/          Game Play Background (Bg2-5), login bg, lobby bg, splash bg, signup bg
    │   Source: Sprites/Backgrounds
    ├── box-panels/           Brun/maroon/red panels i ulike størrelser
    │   Source: Sprites/Box Panel
    ├── buttons/              Felles knapper (blue/red/yellow/maroon/grønn) i ulike størrelser
    │   Source: Sprites/Buttons
    ├── color-draft/          Color Draft mini-game (Gold Safe Door, Sample door)
    │   Source: Sprites/Color Draft
    ├── gameplan/             Gameplan-asset
    │   Source: Sprites/6_Gameplan
    ├── icons/                ~70 felles UI-ikoner (close, plus, minus, back, audio etc.)
    │   Source: Sprites/Icons
    ├── mystery-game/         Joker- og round ball-grafikk for Mystery Game (mini-game)
    │   Source: Sprites/Mystery Game Sprites
    ├── pick-lucky-number/    Pick Lucky Number screen (mini-game)
    │   Source: Sprites/19 Pick Lucky Number
    ├── select-game-type/     Lobby-skjerm med spill-thumbnails (bingo_1.png-bingo_4.png)
    │   Source: Sprites/5 Select Game Type + New Sprites/5 Select Game Type
    ├── select-lucky-number/  Select Lucky Number screen
    │   Source: Sprites/25 Select Lucky Number
    ├── select-lucky-number-2/ Annen variant av samme skjerm
    │   Source: Sprites/10 select lucky number
    ├── spin-wheel/           Spin wheel mini-game
    │   Source: Sprites/14 Spin Wheel
    ├── splash-and-logo/      Splash screen + logo
    │   Source: Sprites/1 Splash + New Sprites/1 Splash
    ├── start-game/           "Start Game" overgangs-skjerm med login number, NumberBase, etc.
    │   Source: Sprites/22 Start Game
    ├── treasure-chest/       Treasure chest mini-game
    │   Source: Sprites/16 Treasure Chest
    ├── tv-extra/             TV Extra (5-ball mini-game): Blue/Green/Red/Yellow/Purpule baller, Marker, PatternBg, jackpot/tvextra-skjermer
    │   Source: Sprites/11 tvextra
    └── ui/                   Felles UI-elementer
        ├── checkbox/         Checkbox-grafikk
        ├── cursors/          Custom cursor PNG/curs
        ├── inputbox/         Input-boks-bakgrunn
        ├── pagination/       Next/select-arrow + button-states
        ├── scroll-bars/      Horizontal/vertical slider PNGs
        └── toggle-buttons/   Toggle-on/off buttons
```

## Skipped folders (ikke ekstrahert)

| Source-folder | Grunn |
|---|---|
| `Assets/TextMesh Pro/` | Unity-internal TextMesh-pro plugin-assets, ikke spill-grafikk |
| `Assets/AddressableAssetsData/` | Unity build-system metadata |
| `Assets/Plugins/ImageCropper/` | 3rd-party plugin-icons |
| `Assets/Editor/`, `Assets/Editor Default Resources/` | Unity editor-spesifikt, ikke runtime |
| `Assets/_Project/Sprites/30 bingo game 4/` | Game 4 deprecated (BIN-496) — temabingo (Galopp, Godterihuset, Gold Digger, Papirbingo) — fjernet fra spillkatalogen |
| `Assets/_Project/Sprites/28 Game 4 Selection/` | Game 4 deprecated |
| `Assets/_Project/_Scripts/Panels/Game/Game 4/` | Game 4 deprecated (script-folder, men nevnes for fullstendighet) |
| `Assets/_Project/Sprites/Patterns/Game 4/` | NB: mappen heter "Game 4" i legacy, men sprite-filene er generelle pattern-mockups — disse er gjenbrukt i Game 3 og kopiert til `game3/patterns/` |
| `Assets/StackerGame/` | StackerGame er et separat prototype-spill, ikke en av de 4 hovedspillene |
| Diverse 3rd-party plugin-mapper (Best HTTP, Firebase, GPM, JsonDotNet, LeanTween, Mobile Native, OSK, Parse, StandaloneFileBrowser, Vuplex, WebGLSupport, WebGLTemplates, Unity-Logs-Viewer, Mobile Native, ExternalDependencyManager, GeneratedLocalRepo, OrientationManager) | Tredjepart-plugins / build-tools, ikke spill-grafikk |
| `Assets/Resources/document_default_*.png` | KYC-dokument-mockups, ikke spill-grafikk |
| `.zip`, `.rar`, `.psd` | Fjernet etter kopiering — kildefiler er for store/uleselige for web-utviklere. Originalene ligger i legacy-prosjektet hvis trengs |

## Hvordan finne mer

Hvis et bilde mangler:

1. Sjekk legacy-prosjektet direkte: `/Users/tobiashaugen/Projects/Spillorama LEGACY/Assets/`
2. Vanlige steder for ekstra grafikk:
   - `Assets/_Project/Sprites/` — eldre asset-organisasjon
   - `Assets/_Project/New Sprites/` — nyere asset-organisasjon
   - `Assets/_Project/Material/` — Unity material-definisjoner (ikke direkte bilder)
   - `Assets/_Project/Animations/` — animasjons-controllere (.anim, .controller — ikke bilder)
   - `Assets/_Project/Prefabs/Game/` — prefab-filer (referanser til sprites via GUID)
3. For å finne hvilken sprite et prefab refererer til, søk på GUID i `.meta`-filer:
   ```bash
   grep -rl "GUID_HERE" "/Users/tobiashaugen/Projects/Spillorama LEGACY/Assets/_Project" --include="*.meta"
   ```

## Meta-filer (.meta)

Alle `.meta`-filer er beholdt sammen med tilhørende bilder. Disse inneholder:
- `pixelsPerUnit` (Unity-spesifikt, men gir intuisjon om størrelses-forhold)
- `pivot` (anchor point for sprite — viktig for posisjonering)
- `border` (9-slice-border, hvis aktivert — relevant for skalerbar UI)
- `spriteSheet`-konfigurasjon (hvis sprite er en sliced sheet)
- `mipMaps`-innstillinger

Web-utviklere kan trygt ignorere disse med mindre de trenger kontekst for spritesheet-slicing eller pivot-points.

## Per-spill mapping (per `docs/architecture/SPILLKATALOG.md`)

| Folder | Spill (offisielt navn) | Type |
|---|---|---|
| `game1/` | Spill 1 | Hovedspill 1 — 75-ball 5×5 |
| `game2/` | Spill 2 | Hovedspill 2 — Rakett-tema |
| `game3/` | Spill 3 | Hovedspill 3 — Monsterbingo (web-tema; legacy-grafikk er strukturell) |
| `game5/` | SpinnGo (Spill 4) | Databingo |
| `shared/` | Felles | UI, mini-games, hall-display, backgrounds |

## Stats

| Folder | Bilder (.png/.jpg/.jpeg/.svg/.webp) | Størrelse |
|---|---|---|
| `game1/` | 60 | 5.9 MB |
| `game2/` | 23 | 2.5 MB |
| `game3/` | 40 | 516 KB |
| `game5/` | 45 | 8.0 MB |
| `shared/` | 192 | 33 MB |
| **Totalt** | **360** | **~50 MB** |

(Av legacy-prosjektets 891 totale bilder; resterende ble skippet som beskrevet over.)
