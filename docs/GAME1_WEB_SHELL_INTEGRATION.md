# Game 1 Web Shell Integration — Komplett Dokumentasjon

> Denne dokumentasjonen dekker ALT som ble gjort for å få Spill 1 (Bingo) til å fungere
> via den nye web shell-lobbyen (lobby.js + index.html) istedenfor den gamle Unity-lobbyen.
> Bruk dette som referanse for å implementere Spill 2–5.

## Arkitektur-oversikt

```
Web Shell (lobby.js)          ← Eier lobby, hall-valg, Spillvett
    ↓ klikk på spill
Unity WebGL (on-demand)       ← Kun spillmotor, laster ved behov
    ↓ ReceiveShellToken(jwt)
SpilloramaApiClient           ← REST: profil, wallet
SpilloramaSocketManager       ← Socket: room:join, bet:arm, draw events
SpilloramaGameBridge          ← Oversetter Spillorama-data → AIS-format
    ↓
Game1GamePlayPanel.SocketFlow ← Eksisterende spillogikk (uendret der mulig)
```

## Filer som ble endret

### Web Shell (ingen Unity-build nødvendig)

| Fil | Endring |
|-----|---------|
| `backend/public/web/lobby.js` | `display = 'block'` fix (CSS override) |
| `backend/public/web/index.html` | `OnUnityReady`: sender hall ID via `SwitchActiveHallFromHost` |
| `backend/public/web/index.html` | Debug-knapp (kan fjernes) |

### Unity Bridge-lag

| Fil | Endring |
|-----|---------|
| `Bridge/UIManager.WebHostBridge.cs` | `ReceiveShellToken`: oppretter SpilloramaRuntime, re-creates bridge |
| `Bridge/UIManager.WebHostBridge.cs` | `SwitchActiveHallFromHost`: setter `Player_Hall_ID` direkte |
| `Bridge/UIManager.WebHostBridge.cs` | `LaunchHostGame`: `EnsureSpilloramaRoomJoined` coroutine på UIManager |
| `Bridge/UIManager.WebHostBridge.cs` | `ProcessPendingHostGame`: lanserer spill etter login |
| `Bridge/SpilloramaGameBridge.cs` | `HandleRoomUpdate`: parser snapshot, setter `LatestSnapshot` |
| `Bridge/SpilloramaGameBridge.cs` | `ExtractPlayerTickets`: parser billettdata fra raw JSON |
| `Bridge/SpilloramaGameBridge.cs` | `BuildGame1History`: bygger `BingoGame1History` fra snapshot |
| `Bridge/SpilloramaGameBridge.cs` | Display-billetter: 5×5 grid, cached per rom, maks 30 |
| `Bridge/SpilloramaGameBridge.cs` | `_gameCount`, `_totalWon`: akkumulerer på tvers av runder |
| `Bridge/SpilloramaGameBridge.cs` | `AddMoreTickets()`, `GetCurrentTicketCount()`: for "Kjøp flere" |
| `Bridge/SpilloramaGameBridge.cs` | `SetActiveRoomCode()` fra snapshot.code |

### Socket-lag

| Fil | Endring |
|-----|---------|
| `Network/SpilloramaSocketManager.cs` | `BetArm()`: sender `bet:arm` til backend |
| `Network/SpilloramaSocketManager.cs` | `SetActiveRoomCode()`, `RoomPlayerId`: public setters |
| `Network/SpilloramaSocketManager.cs` | `OnRoomUpdateReceived`: direkte kall til bridge (bypass event) |
| `Network/SpilloramaSocketManager.cs` | `Json.Decode()` for alle Emit-payloads (var string, nå objekt) |
| `Network/SpilloramaSocketManager.cs` | `using BestHTTP.JSON` import |

### Game1-spesifikt

| Fil | Endring |
|-----|---------|
| `Game1/Game1GamePlayPanel.SocketFlow.cs` | `OnSubscribeRoom_Spillorama`: kaller `GenerateTicketList` |
| `Game1/Game1GamePlayPanel.SocketFlow.cs` | `OnGameStart_Spillorama`: re-bygger billetter, oppdaterer rundeteller |
| `Game1/Game1GamePlayPanel.SocketFlow.cs` | `OnGameFinish_Spillorama`: reset ball-panel, viser "..." timer |
| `Game1/Game1GamePlayPanel.SocketFlow.cs` | `OnPatternWon_Spillorama`: markerer mønster som vunnet, oppdaterer gevinst |
| `Game1/Game1GamePlayPanel.SocketFlow.cs` | `OnScheduler_Spillorama`: nedtellingstimer (ingen 120s cap) |
| `Game1/Game1GamePlayPanel.SocketFlow.cs` | `CountdownTimer_Spillorama`: coroutine for nedtelling |
| `Game1/Game1GamePlayPanel.SocketFlow.cs` | `PopulateUpcomingGameDataFromSnapshot`: billettkjøp-data |
| `Game1/Game1GamePlayPanel.SocketFlow.cs` | `OnRoomState_Spillorama`: oppdaterer spillerinfo + innsats |
| `Game1/Game1GamePlayPanel.cs` | `GenerateTicketList`: skjuler delete-knapp i WebGL-modus |
| `Game1/Game1GamePlayPanel.Interactions.cs` | `OnLuckyNumberSelection`: kobler til `SetLuckyNumber` |
| `Game1/Game1GamePlayPanel.UpcomingGames.cs` | `Upcoming_Game1_Ticket_Set_Up_Open`: Spillorama-gren for "Kjøp flere" |
| `Game1/Game1Panel.cs` | `Open_Buy_Option`: implementert med `BetArm()` |
| `Game1/Game1GamePlayPanel.cs` | Null-guards for `topBarPanel` i `OnEnable`/`OnDisable` |

### Scene-endringer (via Coplay)

| Endring | Detaljer |
|---------|----------|
| `loaderPanel` | Koblet til `Canvas - Utilities/Panel - Loader` |
| `messagePopup` | Koblet til `Canvas - Utilities/Panel - Message Popup` |
| `txtLuckyNumber` | Koblet til `Text - Lucky Number` (child av Game1GamePlayPanel) |

### Backend-endringer

| Fil | Endring |
|-----|---------|
| `backend/src/index.ts` | `room:join`: auto-create rom hvis BINGO1 ikke finnes |
| `backend/src/index.ts` | `room:join` catch-block: logging |
| `backend/src/platform/PlatformService.ts` | KYC bypass i dev-modus (`NODE_ENV !== "production"`) |
| `backend/.env` | `AUTO_ROUND_ENTRY_FEE=20`, `AUTO_ROUND_TICKETS_PER_PLAYER=30` |

### Build-verktøy

| Fil | Endring |
|-----|---------|
| `Editor/TriggerWebGLBuildNow.cs` | Path fix (`../..` istedenfor `../../..`) |
| `Editor/TriggerWebGLBuildNow.cs` | Output til `/web` subdir (gir `web.*` filnavn) |
| `Editor/DiagnoseAllGames.cs` | Diagnostikk-script for null-referanser |
| `Editor/WireGame1Refs.cs` | Auto-kobling av scene-referanser |

---

## Detaljert flyt: Fra klikk til spillende bong

### 1. Bruker klikker "Bingo" i web lobby

```
lobby.js: launchGame(game) → loadUnityAndStartGame(game)
  → unityContainer.style.display = 'block'   // FIX: var '' som falt tilbake til CSS none
  → window._initUnity()                       // Laster Unity WebGL
  → window._pendingGame = game
```

### 2. Unity laster og signaliserer ready

```
SplashScreenPanel.cs: SignalHostReady()
  → Application.ExternalCall("OnUnityReady")
```

### 3. JS sender JWT + hall + spill til Unity

```javascript
// index.html OnUnityReady():
SendMessage('UIManager', 'ReceiveShellToken', jwt)
SendMessage('UIManager', 'SwitchActiveHallFromHost', hallId)  // NY
SendMessage('UIManager', 'NavigateToGame', 'game_1')
```

### 4. Unity mottar JWT og starter profil-fetch

```csharp
// UIManager.WebHostBridge.cs
ReceiveShellToken(jwt):
  _shellJwt = jwt
  // Opprett SpilloramaRuntime hvis det ikke finnes
  if (SpilloramaApiClient.Instance == null)
    → new GameObject("SpilloramaRuntime") + AddComponent<ApiClient, SocketManager, GameBridge>
  // Re-opprett bridge hvis Instance er null (singleton-guard destroyet den)
  if (SpilloramaGameBridge.Instance == null)
    → AddComponent<SpilloramaGameBridge>()
  // Fetch profil
  SpilloramaApiClient.GetProfile() → callback:
    gameAssetData.PlayerId = user.id
    gameAssetData.IsLoggedIn = true
    SpilloramaSocketManager.Connect()
    ProcessPendingHostGame()
```

### 5. SwitchActiveHallFromHost setter hall ID

```csharp
// Setter Player_Hall_ID DIREKTE (bypass tom ApprovedHalls-liste)
Player_Hall_ID = hallId
topBarPanel?.SwitchHallFromHost(hallId)  // Prøver, men feiler grasiøst
```

### 6. NavigateToGame køer spillet

```csharp
NavigateToGame("game_1"):
  // Spiller ikke logget inn ennå → kø
  pendingHostGameNumber = "game_1"
```

### 7. ProcessPendingHostGame lanserer spillet

```csharp
ProcessPendingHostGame():
  LaunchHostGame("1"):
    EnsureSpilloramaRoomJoined()  // Coroutine på UIManager (overlever panel-close)
    LobbyGameSelection.LaunchGameFromHost("1"):
      lobbyPanel.OpenHostShellLobbyState()
      gamePlanPanel.Game1() → OpenGame1() → game1Panel.OpenGamePlayPanel()
```

### 8. EnsureSpilloramaRoomJoined venter på socket og joiner rom

```csharp
// Coroutine på UIManager (ikke LobbyPanel som ble lukket)
WaitForSocketAndJoinRoom():
  while (!SpilloramaSocketManager.IsConnected) yield wait
  SpilloramaSocketManager.JoinRoom(hallId)
    → emit "room:join" { accessToken, roomCode:"BINGO1", hallId }
    → Backend: auto-creates rom hvis det ikke finnes
    → Backend: KYC bypass i dev
    → Ack: { ok, data: { roomCode, playerId, snapshot } }
```

### 9. Room:update mottas → bridge setter snapshot

```csharp
SpilloramaSocketManager.OnRoomUpdateReceived():
  raw = GetPacketString(packet)
  SpilloramaGameBridge.Instance.HandleRoomUpdate(raw)  // Direkte kall (event var ødelagt)

HandleRoomUpdate(rawJson):
  snap = JsonUtility.FromJson<SpilloramaSnapshotRaw>(rawJson)
  LatestSnapshot = snap
  SetActiveRoomCode(snap.code)  // F.eks. "ACX76G"
  ExtractPlayerTickets(rawJson)  // Parser billetter for RoomPlayerId
  OnRoomStateUpdated?.Invoke(snap)
  // Detect transitions: RUNNING → OnGameStarted, ENDED → OnGameFinished
```

### 10. Game1 subscriber og viser bonger

```csharp
Game1GamePlayPanel.WaitForSnapshotThenSubscribe():
  // Venter til LatestSnapshot != null
  history = SpilloramaGameBridge.BuildGame1History(snap, RoomPlayerId)
  OnSubscribeRoom_Spillorama(history):
    BingoGame1HistoryData = history
    GenerateTicketList(history.ticketList)  // ← DEN KRITISKE LINJEN
    GenerateRowDetails(history.patternList)
    GeneratePatternList(history.patternList)
    // ... etc
```

---

## Billett-generering (5×5 grid)

### Struktur

```
GameTicketData.ticketCellNumberList = [25 integers]
  Index:  0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24
  Col:    B  B  B  B  B  I  I  I  I  I  N  N  F  N  N  G  G  G  G  G  O  O  O  O  O
  Range: 1-15          16-30          31-45          46-60          61-75
  
  Index 12 = FREE cell (verdi 0, vises som "F")
```

### Caching

- Billetter genereres ÉN GANG per rom (seeded med `snap.code.GetHashCode()`)
- Alle 30 mulige billetter pre-genereres og caches i `_cachedDisplayTickets`
- `GetCurrentTicketCount()` bestemmer hvor mange som vises (default 6, maks 30)
- "Kjøp flere brett" kaller `AddMoreTickets(1)` og re-rendrer fra cache

### Viktig: RoomPlayerId vs UserId

```
UserId (fra profil):     08095935-ab94-4dba-9c24-d9e3595e5639  ← IKKE bruk denne for billetter
RoomPlayerId (fra rom):  f1bdc587-500a-41d1-9a08-c1ea23294aa7  ← Bruk denne
```

Backend lagrer billetter under `RoomPlayerId`. `ExtractPlayerTickets` søker etter denne ID-en i raw JSON.

---

## Socket-events brukt

| Event | Retning | Formål |
|-------|---------|--------|
| `room:join` | Client → Server | Bli med i rom (auto-creates om nødvendig) |
| `room:update` | Server → Client | Full snapshot (spillstatus, spillere, billetter, scheduler) |
| `draw:new` | Server → Client | Nytt tall trukket |
| `pattern:won` | Server → Client | Mønster vunnet |
| `bet:arm` | Client → Server | Armer spilleren for neste runde |
| `lucky-number:set` | Client → Server | Setter lucky number |
| `chat:send` | Client → Server | Send chat-melding |

### Payload-format for room:join

```json
{
  "accessToken": "7afb97b59d10ec402cc76b6ab0c1af57...",
  "roomCode": "BINGO1",
  "hallId": "cd20ce1d-85ed-44ff-892a-82da7c7d11cb"
}
```

**VIKTIG**: Payload MÅ sendes som `Json.Decode(json)` (objekt), IKKE som `JsonUtility.ToJson(payload)` (string). Ellers mottar backend en string istedenfor objekt → UNAUTHORIZED.

---

## Spilltilstander

```
WAITING → bruker ser bonger + "Vent til spillet starter"
    ↓ scheduler starter
RUNNING → baller trekkes, markeres på bonger
    ↓ alle mønstre vunnet eller maxDraws nådd
ENDED → "..." vises, venter på neste runde
    ↓ scheduler
WAITING → (neste runde)
```

### Hva skjer ved hver overgang

**WAITING → RUNNING (`OnGameStart_Spillorama`)**:
- Reset lyd-announcements
- Skjul kjøps-UI
- Skjul timer
- Re-bygg billetter fra BuildGame1History (friske tall-marker)
- Oppdater rundeteller ("Spill N: Jackpot")
- Oppdater premieoversikt

**Ball trukket (`OnBallDrawn_Spillorama`)**:
- Vis ball-animasjon
- Marker tall på alle bonger
- Oppdater trekkhistorikk
- Spill lydannonsering

**RUNNING → ENDED (`OnGameFinish_Spillorama`)**:
- Stopp blink-animasjoner
- Reset ball-panel
- Lukk trekkhistorikk
- Vis "..." timer (venter på countdown)
- Re-aktiver kjøps-knapp
- `isTimerReceived = false` → lar scheduler-event vise countdown

**Scheduler-oppdatering (`OnScheduler_Spillorama`)**:
- Viser nedtelling hvis `millisUntilNextStart > 0`
- Eller viser "0" hvis `canStartNow`

---

## Kjente begrensninger / gjenstår

| Feature | Status | Detaljer |
|---------|--------|----------|
| **Server-validerte billetter** | ⚠️ | Billetter er klient-generert (display-only). Backend har `preRoundTickets` men parsing er ustabil |
| **Chat** | ❌ | `ChatPanel` bruker AIS GameData direkte, krever refactoring |
| **Mini-spill** | ❌ | Lykkehjul, Skattekiste, Mystery, Color Draft — stubs |
| **Elvis-billetter** | ❌ | Erstatning/kansellering ikke koblet til Spillorama |
| **Jackpot-display** | ❌ | Alltid `isDisplay = false` |
| **Custom pattern ToGo** | ⚠️ | `patternDataList` alltid tom → design=0 patterns mangler indekser |
| **Ticket cancellation** | ❌ | Delete-knapp skjult i WebGL-modus |

---

## Oppskrift for Spill 2 (og 3, 4, 5)

1. **Sjekk `BuildGame2History`** i `SpilloramaGameBridge.cs` — populer `ticketList` med display-billetter (5×5, cached)
2. **Kall `GenerateTicketList`** fra `OnSubscribeRoom_Spillorama` i Game2's SocketFlow
3. **Implementer `OnGameStart/Finish/BallDrawn`** — kopier mønster fra Game1
4. **Koble `bet:arm`** — allerede delt, bruker samme `SpilloramaSocketManager.BetArm()`
5. **Bruk `RoomPlayerId`** — IKKE `gameAssetData.PlayerId` for billettoppslag
6. **Legg til `PopulateUpcomingGameDataFromSnapshot`** for kjøps-UI
7. **Timer**: Bruk `OnSchedulerUpdated` event for nedtelling

### Eksempel: Minimum endring for Game2

```csharp
// I Game2 sin OnSubscribeRoom_Spillorama:
GenerateTicketList(history.ticketList);  // LEGG TIL DENNE

// I Game2 sin OnGameStart_Spillorama:
var history = SpilloramaGameBridge.BuildGame2History(snap);
GenerateTicketList(history.ticketList);  // Re-bygg for ny runde
```

---

## Backend-konfigurasjon (.env)

```env
AUTO_ROUND_ENTRY_FEE=20          # Pris per billett (kr)
AUTO_ROUND_TICKETS_PER_PLAYER=30 # Maks billetter per spiller
AUTO_ROUND_MIN_PLAYERS=1         # Min spillere for å starte
BINGO_PAYOUT_PERCENT=100         # Utbetalingsprosent
```

KYC er deaktivert i dev (`NODE_ENV !== "production"`).

---

*Sist oppdatert: 2026-04-13*
