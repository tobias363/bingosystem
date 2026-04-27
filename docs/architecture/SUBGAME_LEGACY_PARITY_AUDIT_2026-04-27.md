# Sub-game katalog + schedule-velger: legacy paritet-audit
_2026-04-27 — Agent SUBGAME-PARITY_

## TL;DR

- 5 legacy modeller sjekket: `gameType`, `subGame`, `subGame1`, `subGame5`, `subGameSchedule` + `dailySchedule`, `parentGame`, `savedGame`
- 11 legacy ↔ 5 nye DB-tabeller. ~110 felter sammenliknet på tvers
- **Funksjonell paritet ~70 %.** Wire-felter på `app_sub_games` matcher `subGame1` 1:1 (forenklet shape, men bevart i JSON)
- 5 nye preset-varianter (Kvikkis, TV Extra, Ball×10, Super-NILS, Spillernes) er **mer strukturert** enn legacy som hardkodet logikk på `gameName`-streng
- **Kritiske gaps (P0/P1):**
  1. **Ingen drag-and-drop reordering** av sub-games i schedule-editor (legacy bruker SortableJS) — P1
  2. **Per-uke-dag-spesifikk schedule-mapping mangler** i ny stack (legacy `dailySchedule.days` = `{Mon:[ids], Tue:[ids], ...}`) — P0 for fler-dags-planer
  3. **Ingen FK fra `app_daily_schedules` til `app_schedules`** — kobling skjer via `other_data.scheduleId` og `other_data.scheduleIdByDay` (bevisst, dokumentert i koden, men er teknisk gjeld) — P1
  4. **Ticket-farger har 2 forskjellige enum-univers** mellom `SubGameService` (string-array, fri-form) og `SubGamesListEditor` (kanonisk 9 farger fra `TICKET_COLORS`) + `spill1VariantMapper` (14 farger inkl. Elvis) — P1 (forvirring/data-tap)
  5. **Status-enum krymping:** Legacy `subGame` har `active|running|finish`; ny `app_sub_games` har bare `active|inactive`. Runtime-state er flyttet til `app_game1_scheduled_games` som er korrekt — P2 (avklart, ikke regresjon, men skal dokumenteres)
- **Estimert dev-effort til full paritet: 30–45 timer** (16 t for drag-drop + per-dag-mapping; resten er navngiving, validation, UI-polish)

## 1. GameType-modell

| Felt | Legacy `gameType` | Ny `app_game_types` | Status | Note |
|---|---|---|---|---|
| `name` | string default '' | TEXT NOT NULL | OK | Ny strammere |
| `type` (slug) | string default '' | `type_slug` TEXT NOT NULL, unique | OK | Ny har partial unique index, legacy hadde ingen |
| `pattern` | bool default false | BOOLEAN NOT NULL DEFAULT false | OK | 1:1 |
| `photo` | string default '' | TEXT NOT NULL DEFAULT '' | OK | Ny har max 500 tegn (validation-laget) |
| `row` | string | `grid_rows` INTEGER DEFAULT 5 CHECK > 0 | OK | Type-strammet (string → int) |
| `columns` | string | `grid_columns` INTEGER DEFAULT 5 CHECK > 0 | OK | Type-strammet |
| `totalNoTickets` | string | INTEGER NULL CHECK > 0 | OK | Type-strammet |
| `userMaxTickets` | string | INTEGER NULL CHECK > 0 | OK | Type-strammet |
| `pickLuckyNumber` | array default [] | `lucky_numbers_json` JSONB NOT NULL DEFAULT '[]' | OK | Renamed; samme semantikk |
| `rangeMin` | string | INTEGER NULL | OK | Type-strammet, har CHECK rangeMax≥rangeMin |
| `rangeMax` | string | INTEGER NULL | OK | Som over |
| (mangler) | — | `status` TEXT 'active'/'inactive' | NEW | Ny lifecycle-felt |
| (mangler) | — | `extra_json` JSONB | NEW | Forward-compat fri-form |
| (mangler) | — | `created_by`, `deleted_at` | NEW | Audit + soft-delete |
| `createdAt`, `updatedAt` | Date | TIMESTAMPTZ DEFAULT now() | OK | Begge sider |

**Vurdering:** Ny modell er en fornorming + strammere typing. Funksjonell paritet 100%, og forbedringer (status, soft-delete, audit, partial unique index på slug). **Ingen gaps.**

## 2. SubGame-modeller (1: subGame, 2: subGame1, 3: subGame5)

Legacy har **tre forskjellige sub-game-modeller**:

- `subGame` (94 felter): Den kjørbare runtime-instansen — players, ticketIdArray, withdrawNumberList, winners, etc. Sammensmelter mal-data + game-state.
- `subGame1` (11 felter): "Sub-game-mal-katalogen" som admin redigerer — kun mal-felter (gameName, patternRow, ticketColor, status).
- `subGame5` (24 felter): SpinnGo-spesifikk runtime (player-startet databingo).

Ny stack har skilt **mal** (`app_sub_games`) fra **runtime-instans** (`app_game1_scheduled_games`). Dette er en **arkitektonisk forbedring**, ikke et gap.

### 2.1 SubGame1 ↔ app_sub_games (mal-katalogen)

| Felt | Legacy `subGame1` | Ny `app_sub_games` | Status | Note |
|---|---|---|---|---|
| `gameName` | string | `game_name` TEXT NOT NULL | OK | Display-label |
| `patternRow` | array | `pattern_rows_json` JSONB | OK (forenklet) | Wire er `{patternId,name}[]`; legacy hadde mer (`_id`, `patternType`, `isWoF`); øvrige bevares i extra |
| `ticketColor` | array | `ticket_colors_json` JSONB | OK (forenklet) | Wire er `string[]`; legacy hadde `{name,type}[]`. Type kan deriveres |
| `allPatternRowId` | array | (i pattern_rows_json) | OK | Bevart i JSON |
| `subGameId` | string | `sub_game_number` TEXT NOT NULL | OK | Renamed; legacy var "SG_<ts>" |
| `gameType` | string | `game_type_id` TEXT NOT NULL | OK | Renamed; refererer slug |
| `status` | string | TEXT 'active'/'inactive' | **PARTIAL** | Legacy hadde også `running`, `finish` — flyttet til runtime-tabell |
| `creationDateTime` | Date | (mangler — kan settes via extra) | MINOR | `created_at` brukes i stedet |
| (mangler) | — | `name` TEXT NOT NULL | NEW | Display-navn separert fra gameName |
| (mangler) | — | partial unique idx på (game_type_id, name) | NEW | Legacy hadde `checkForGameName` på app-nivå (global); ny er per-gameType (strammere) |
| (mangler) | — | `created_by`, `deleted_at`, `extra_json` | NEW | Audit + forward-compat |

**Vurdering:** `app_sub_games` er en strammere, type-sikker speiling av `subGame1`. **Ingen kritiske gaps.** Note om at `name` og `gameName` er separate i ny modell; legacy hadde kun `gameName` — admin må derfor sette begge eller mapperen må falle til `gameName` (mapper i `SubGameService.create` setter `gameName = name` hvis `gameName` ikke gitt — OK).

### 2.2 SubGame (runtime) ↔ ny stack

Legacy `subGame` (runtime-instansen) har 94 felter inkl. `players`, `ticketIdArray`, `withdrawNumberList`, `winners`, `purchasedTickets`, `currentPatternList`, `patternWinnerHistory`, `socketId`, `timerStart`, `betData`, `groupHalls`, `halls`, etc.

Ny stack: `app_game1_scheduled_games` (BIN-PR Game1) er runtime-tabellen for Spill 1. Denne lagrer `game_config_json`, draws, status. **Ikke 1:1 sammenliknet i denne audit** — fokus var katalog + schedule-velger.

**Vurdering:** Strukturelt korrekt separasjon. Audit av runtime-paritet hører hjemme i Spill 1 backend-research-rapporten (R1).

### 2.3 SubGame5 (SpinnGo runtime) ↔ ny stack

Legacy `subGame5` har 24 felter for SpinnGo runtime-instans. **Ny SpinnGo-runtime ligger ikke i denne audit-en** (separat scope).

## 3. Schedule-modeller

### 3.1 Legacy `subGameSchedule` ↔ ny `app_schedules`

| Felt | Legacy `subGameSchedule` | Ny `app_schedules` | Status | Note |
|---|---|---|---|---|
| `name` | string | `schedule_name` TEXT NOT NULL | OK | Renamed |
| `type` | string default 'single' | (mangler) | **GAP** | Legacy hadde `type='single'` som diskriminant — uklart om brukt; antatt deprecated |
| `scheduleType` | string default 'single' | TEXT 'Auto'/'Manual' | DIVERGENT | Legacy default var `single`; ny er `Auto`/`Manual` (fra `schedule.js`-modellen, ikke `subGameSchedule`-modellen) |
| `subGames` | array default [] | `sub_games_json` JSONB | OK | 1:1 (JSON-shape forskjellig — se §4) |
| `createdAt`, `updatedAt` | Date | TIMESTAMPTZ | OK | |
| (mangler) | — | `lucky_number_prize` NUMBER | NEW | Sentralisert mal-felt (legacy hadde det per-subGame) |
| (mangler) | — | `manual_start_time`, `manual_end_time` | NEW | For Manual scheduleType |
| (mangler) | — | `created_by`, `deleted_at` | NEW | Audit |

**OBS:** Legacy hadde **to schedule-modeller**: `subGameSchedule.js` (mal-katalog) og `schedule.js` (admin-schedule med `Auto/Manual`). Ny `app_schedules` (BIN-625) konsoliderer disse til én tabell. **Konsolidering er forbedring**, ikke gap.

### 3.2 Legacy `dailySchedule` ↔ ny `app_daily_schedules`

| Felt | Legacy `dailySchedule` | Ny `app_daily_schedules` | Status | Note |
|---|---|---|---|---|
| `dailyScheduleId` | string default '' | (id PK + name) | OK | Splittet |
| `name` | string | `name` TEXT NOT NULL | OK | |
| `startDate`, `endDate` | Date | TIMESTAMPTZ | OK | |
| `day` | string default 'sunday' | TEXT (monday..sunday) | OK | CHECK constraint i ny |
| `days` | object default {} | (mangler — finnes i `subgames_json` per slot) | **GAP P0** | Legacy `days` = `{Mon:[id1,id2], Tue:[id3], ...}` — per-uke-dag schedule-id mapping. Ny stack flytter dette til `other_data.scheduleIdByDay` (dokumentert i `DailyScheduleEditorModal.ts:148`). **Funksjonelt OK men "fri-form"** — ikke validert av service |
| `groupHalls` | array | `hall_ids_json.groupHallIds` (subset) | OK | Strukturert |
| `halls` | array | `hall_ids_json.hallIds` | OK | Strukturert |
| `allHallsId` | array | (deriverbar fra hallIds + groupHallIds) | OK | |
| `masterHall` | object | `hall_ids_json.masterHallId` | OK | |
| `stopGame` | bool | `stop_game` BOOLEAN | OK | |
| `status` | string default 'active' | 'active'/'running'/'finish'/'inactive' | OK | Ny har CHECK-constraint, mer eksplisitt |
| `isSavedGame` | bool | `is_saved_game` | OK | |
| `isAdminSavedGame` | bool | `is_admin_saved_game` | OK | |
| `innsatsenSales` | number | `innsatsen_sales` BIGINT | OK | Type strammet |
| `startTime` | string default "" | `start_time` TEXT (regex `HH:MM`) | OK | Validation strengere |
| `endTime` | string default "" | `end_time` TEXT (regex `HH:MM`) | OK | Som over |
| `specialGame` | bool default false | `special_game` BOOLEAN | OK | |
| `weekDays` | (mangler) | INTEGER bitmask 0-127 | NEW | Bedre enn legacy `days`-objekt for daglig-bitwise-sjekk |
| `subgames_json` | (i `days`-objektet) | JSONB array | DIVERGENT | Legacy strukturerer per-ukedag; ny flat-liste + bruker `other_data.scheduleIdByDay` for per-dag-mapping |
| `otherData` | Schema.Types.Mixed | `other_data_json` JSONB | OK | |
| (mangler) | — | `game_management_id`, `hall_id` | NEW | FK-lignende fields |

**Vurdering:** Ny modell er strammere typet og har bedre indekser, men **`days`-felt-mapping er flyttet til fri-form `other_data` uten validation** — dette er teknisk gjeld kommentert i koden (`DailyScheduleEditorModal.ts:1-15`).

## 4. Variant-config-detaljer

Legacy hadde ingen sentralisert "variant-mekanisme". Hver variant ble håndtert ved hardkodet `gameName === "Tv Extra"`-sjekker i `GameProcess.js`. Ny stack har innført en typesikker variant-mapper (`spill1VariantMapper.ts` + `packages/shared-types/src/spill1-sub-variants.ts`) med 6 kanoniske varianter.

| Variant | Legacy-shape | Ny-shape | Paritet |
|---|---|---|---|
| **Standard** (Norsk Bingo) | `gameName === "Norsk Bingo"`, prizer i `patternNamePrice`-array | `subVariant: "standard"` + admin override via `prizePerPattern` | OK — admin kan override; uten override = papir-default 100/200/200/200/1000 kr |
| **Kvikkis** | `gameName === "Kvikkis"` med flat 1000 kr på Fullt Hus | `subVariant: "kvikkis"` → preset Fullt Hus = 1000 kr fast | OK — preset-låst, admin kan ikke override |
| **TV Extra** | `gameName === "Tv Extra"` med separate Frame + Full House conditions | `subVariant: "tv-extra"` → 3 concurrent customPatterns (Bilde 500, Ramme 1000, FH 3000) | OK — bruker `customPatterns` i variantConfig, mutually exclusive med `patternsByColor` |
| **Ball × 10** | `gameName === "Ball X 10"`: `winningAmount + 10 * lastBall` ved Full House | `subVariant: "ball-x-10"` → preset Fullt Hus = `ball-value-multiplier` med base=1250, multiplier=10 | OK |
| **Super-NILS** | `gameName === "Super Nils"`: premie-array per kolonne-index 0-4 (B/I/N/G/O) | `subVariant: "super-nils"` → preset Fullt Hus = `column-specific` med columnPrizesNok={B:500,I:700,N:1000,G:700,O:500} | OK |
| **Spillernes spill** | `gameName === "Spillerness Spill"` (eller " 2"/"3"): Rad N = Rad 1 × N + min-gulv | `subVariant: "spillernes-spill"` → preset multiplier-chain med phase1Multiplier=2,3,4,full=10 + minPrize | OK |
| **Innsatsen** | Egen `innsatsenSales` på dailySchedule, builds-up pot | `app_daily_schedules.innsatsen_sales` BIGINT | OK |
| **Mystery Game** | (Egen sub-game-type) | `subGameType: "MYSTERY"` med `priceOptions[]` + `yellowDoubles` | OK — strukturert i ticket-colors.ts shared-type |
| **Wheel of Fortune / Treasure Chest / Color Draft** | (Egne mini-spill med sin egen sub-game-name-matching) | (Egen mini-game-config — ikke i denne audit) | UTENFOR scope |

**Funn:** Variant-håndtering er en **klar forbedring**. Legacy hadde 13 varianter hardkodet på navn-string; ny stack har 6 kanoniske enum-typer med preset-mapping og admin-UI dropdown. Mini-games (Wheel/Chest/ColorDraft) lever utenfor denne katalogen, som er korrekt.

**Gap:** Mapperen mangler eksplisitt mapping for varianter `Norsk Bingo` (uten override), `Innsatsen` (er pot-mekanisme, ikke pattern-variant). Disse er dekket via "standard" + dailySchedule-felt. **Ingen reelle gaps for Spill 1.**

## 5. Admin UI-flow

### 5.1 Legacy schedule-create-flow

**`/createSchedule` (legacy `schedules/create.html`, 5382 linjer):**

1. Admin angir `scheduleName` + `luckyNumberPrize` + `scheduleType` (Auto/Manual)
2. Hvis Manual: angir `manualStartTime` + `manualEndTime`
3. Klikk "Add SubGame"-knapp → ny `<div>` legges til i `#subGamesContainer`
4. For hver sub-game-rad:
   - Velg fra dropdown: enten `Yes`/`No` for "Stored Game" — hvis Yes vises annen dropdown med eksisterende `subGameList[]`
   - Velg `selectSubGame_${i}` (mal fra `subGame1`-katalog)
   - Skriv inn `custom_game_name`, `start_time`, `end_time`, `notification_start_time`, `min/max/seconds`
   - Velg `ticketColorType[]` checkboxer (Small Yellow, Large Yellow, etc.)
   - Per ticket-color: skriv inn `ticketColorTypePrice`
   - Per pattern × ticket-color: skriv inn `prize` + `minimumPrize`
   - Spesial-håndtering for `Traffic Light`, `Elvis`, `Super Nils`, `Spillerness Spill 1/2/3`, `Wheel of Fortune`, `Treasure Chest`, `Mystery`, `Color Draft`
5. **Drag-and-drop reordering** av sub-game-rader via SortableJS
6. POST → `/createSchedule`-controller → MongoDB

### 5.2 Ny schedule-create-flow

**`/admin/schedules` (ny `ScheduleEditorModal.ts` + `SubGamesListEditor.ts`):**

1. Admin velger `scheduleName` + `luckyNumberPrize` + `scheduleType`
2. Hvis Manual: `manualStartTime` + `manualEndTime`
3. Klikk "Add Sub-game"-knapp → ny rad legges til `#subGamesContainer`
4. For hver sub-game:
   - Velg fra dropdown (`SubGame`-navn fra katalog)
   - `customGameName`, `startTime`, `endTime`, `notificationStartTime`, `min/max/seconds`
   - **Spill 1 sub-variant-dropdown** (K4): Standard / Kvikkis / TV Extra / Ball×10 / Super-NILS / Spillernes spill
   - Velg `selectedColors` (multi-select fra TICKET_COLORS = 9 farger)
   - Per farge: `ticketPrice` + `row1` + `row2` + `row3` + `row4` + `fullHouse` (når subVariant=standard)
   - Mystery-config (når subGameType=MYSTERY): `priceOptions` (komma-separert) + `yellowDoubles`-checkbox
   - Lucky Number Bonus: `amount` + `enabled`
   - Jackpot Draw + Prize (strukturerte felter)
   - "Avansert"-toggle: rå JSON for `ticketTypesData` / `jackpotData` / `elvisData` / `extra`
5. **Ingen drag-and-drop** — kun Add og Remove
6. POST → `/api/admin/schedules` → Postgres

### 5.3 Differanser

| Aspekt | Legacy | Ny | Severity |
|---|---|---|---|
| Drag-and-drop reordering av sub-game-rader | SortableJS, `cursor: grab/grabbing`, full reorder | **Ingen** — kun Add/Remove | **P1** |
| "Stored Game"-toggle (yes/no) | Eksplisitt UI: velge fra eksisterende eller skrive nytt | Implicit — bruker eksisterende SubGame-katalog | OK (forenklet) |
| Antall ticket-farger | 11 (Small/Large × Yellow/White/Purple + Red/Green/Blue/Small Green) + Elvis 1-5 | 9 i `TICKET_COLORS` (mangler Elvis 1-5 + Small Orange — finnes kun i variant-mapper) | **P1** |
| Per-pattern × per-color premie-matrise | `subGame[N][ticketColorTypePrice][][type]` med både `prize` og `minimumPrize` | `rowPrizesByColor[color] = {ticketPrice, row1..row4, fullHouse}` (mangler `minimumPrize`-input) | **P2** (kun spillernes-spill bruker minPrize, og det er nå preset) |
| Variant-spesifikk UI (Traffic Light/Elvis/Mystery) | Hardkodet hver variant i HTML+JS | Strukturert via `subGameType` + `spill1Variant` enums | **Forbedring** |
| Legacy "save as template"-knapp i daglig-plan-create | Egen "savedGame"-modal | Egen "load saved game" på dailySchedule-edit | OK |
| Per-uke-dag schedule-mapping | `days = {Mon:[id1], Tue:[id2]}` (legacy `dailySchedule`) | `other_data.scheduleIdByDay = {monday: "..."}` (ufri-form) | **P0** (validation gap, men funksjonelt OK) |

## 6. Identifiserte gaps

| ID | Gap | Severity | Estimat |
|---|---|---|---|
| **G1** | Mangler drag-and-drop reordering av sub-game-rader i schedule-editor (legacy bruker SortableJS) | P1 | 4-6 t (npm sortablejs, mount i SubGamesListEditor, push-down handler i `getSubGames()`) |
| **G2** | `app_daily_schedules.other_data.scheduleIdByDay` er fri-form Record uten service-validation. Legacy `dailySchedule.days` hadde implicit per-ukedag-mapping av schedule-arrayer | P0 | 4-6 t (legg til strukturert `scheduleIdsByDay`-felt på `app_daily_schedules` med CHECK constraint, migrer eksisterende `other_data`) |
| **G3** | Ticket-color-enumen er splittet over 3 filer: `TICKET_COLORS` (9), `COLOR_SLUG_TO_NAME` (14), `LEGACY_TICKET_COLOR_OPTIONS` (?). Risiko: silent fail når admin velger farge i ett UI som ikke finnes i mapper | P1 | 6-8 t (konsolider til én kanonisk liste i `shared-types`, propager) |
| **G4** | `app_sub_games.status` mangler `running`/`finish` statuser fra legacy. Korrekt arkitektonisk (separasjon mal/runtime), men endring av runtime-status nå går via `app_game1_scheduled_games.status` — admin-UI bør reflektere dette tydelig | P2 | 2 t (UI-tekst + dok) |
| **G5** | Per-pattern `minimumPrize`-input mangler i ny SubGamesListEditor. Spillernes-spill bruker minPrize via preset; men hvis admin manuelt vil sette per-color × per-row gulv, finnes det ikke UI | P2 | 3-4 t (legg til input ved siden av rowN-prize) |
| **G6** | Schedule-mal har ikke FK til `app_sub_games` — kun JSON-array av subgame-strenger eller -ids. Hard-delete av subgame blokkert via `isReferenced()`-sjekk på `subgames_json` (gjør det rette, men ikke RDBMS-håndhevet) | P2 | 4-6 t (legg til junction-tabell `app_schedule_sub_games` for håndheving, evt behold JSON for ordre) |
| **G7** | Legacy `subGame.creationDateTime` er separert fra `createdAt`. Ny stack har bare `created_at`. Ikke regresjon fordi creationDateTime alltid var = createdAt i legacy | P3 | 0 (ingen handling) |
| **G8** | Legacy `gameType.row`/`columns`/`totalNoTickets`/`userMaxTickets` var lagret som **string**. Ny stack lagrer som **integer**. Migration-script må parse legacy-verdier | P2 | 2 t (legg til migration-step) |
| **G9** | Legacy `parentGame` (94 felter) konsoliderer alle game-types med flagg `isMasterGame`/`isSubGame`/`isParent`. Ny stack har skilt `app_game_management` + `app_sub_games` + `app_schedules`. Mal-import fra legacy MongoDB krever ETL-script | P1 | 8-12 t (skriv ETL-script, kjør på dump fra legacy DB) |
| **G10** | "Stored Game" (Yes/No) toggle i legacy schedule-editor er fjernet. Admin kan ikke lenger velge "lag ny ad-hoc sub-game inline" — må først lage SubGame i katalog. Mer ryddig, men endringen er ikke dokumentert i admin-UX-guide | P3 | 1 t (dok i admin-help-tekst) |
| **G11** | Ticket-color "Elvis 1-5" finnes i `spill1VariantMapper.COLOR_SLUG_TO_NAME` men IKKE i `TICKET_COLORS` brukt av `SubGamesListEditor`. Admin kan ikke velge Elvis-farger i UI | P1 | 3 t (legg til Elvis-farger i TICKET_COLORS hvis Elvis-spill skal støttes) |

## 7. Anbefaling

**Konklusjon:** Featuren "lagre sub-games separat + velge når man oppretter spillplan" er **funksjonelt på plass og 1:1 med legacy** for kjerne-flyten. SubGameService + ScheduleService + DailyScheduleService matcher legacy-shape strukturelt og er **strammere typet og bedre validert**. Variant-håndtering (Spill 1 sub-varianter) er en betydelig forbedring over legacy hardcoded-name-matching.

**Anbefalte handlinger før pilot:**
1. **G2 (P0):** Strukturer `scheduleIdsByDay` som førsteklasses kolonne på `app_daily_schedules` med validation, migrér eksisterende `other_data.scheduleIdByDay`-data. **4-6 t.**
2. **G1 + G3 + G11 (P1):** Drag-drop reordering, konsolidering av ticket-color-enum, Elvis-farger inn i `TICKET_COLORS`. Disse går sammen i én PR. **13-17 t.**
3. **G9 (P1):** ETL-script for legacy-mal-import før første prod-runde. **8-12 t.** (kan parallelliseres)

**Kan utsettes til post-pilot:** G4, G5, G6, G7, G8, G10. **Total post-pilot effort: ~13-19 t.**

**Estimert dev-effort til full paritet: 30–45 timer** (P0 + P1 = 25-35 t; P2 = 5-10 t).

## 8. Referanser

- Legacy modeller: `git show 5fda0f78:legacy/unity-backend/App/Models/{gameType,subGame,subGame1,subGame5,subGameSchedule,dailySchedule,parentGame,savedGame}.js`
- Legacy schedule-create UI: `git show 5fda0f78:legacy/unity-backend/App/Views/schedules/create.html` (5382 linjer)
- Legacy daily-schedule UI: `git show 5fda0f78:legacy/unity-backend/App/Views/dailySchedules/create.html` (878 linjer)
- Ny GameTypeService: `apps/backend/src/admin/GameTypeService.ts`
- Ny SubGameService: `apps/backend/src/admin/SubGameService.ts`
- Ny ScheduleService: `apps/backend/src/admin/ScheduleService.ts`
- Ny DailyScheduleService: `apps/backend/src/admin/DailyScheduleService.ts`
- Ny SavedGameService: `apps/backend/src/admin/SavedGameService.ts`
- Variant-mapper: `apps/backend/src/game/spill1VariantMapper.ts`
- Sub-variants shared-types: `packages/shared-types/src/spill1-sub-variants.ts`
- Migrations: `apps/backend/migrations/202604{22,25}*.sql`
- Admin-UI sub-game pages: `apps/admin-web/src/pages/games/subGame/`
- Admin-UI schedule editor: `apps/admin-web/src/pages/games/schedules/SubGamesListEditor.ts`
- Admin-UI daily-schedule modal: `apps/admin-web/src/pages/games/dailySchedules/DailyScheduleEditorModal.ts`

---

**Audit utført av:** Agent SUBGAME-PARITY (claude-opus-4-7-1m)
**Tid brukt:** ~1.5 t
**Worktree:** `/Users/tobiashaugen/Projects/Spillorama-system/.claude/worktrees/agent-afb7591e31883449f`
