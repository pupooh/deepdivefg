# Deep Dive — BGA Implementation Plan

An architectural and interaction blueprint for implementing **Deep Dive** on Board Game Arena (BGA) using the modern PHP 8 object-oriented `Bga\GameFramework\States\GameState` architecture and TypeScript client stack (`bga-cards`, `bga-animations`, `this.bga.statusBar`, and `bgaPerformAction`).

---

### User Review & Critical Decisions

> [!IMPORTANT]
> Because this plan targets the BGA Studio framework directly (rather than a standalone web app), please confirm these scope and UX defaults before any code generation begins.

- **Modern PHP 8 State Classes (Recommended)**: Uses individual classes extending `Bga\GameFramework\States\GameState` with `#[PossibleAction]` and typed `*Param` attributes, rather than legacy `states.inc.php` arrays and `*.action.php` handlers.
- **1-Player Solo AI Mode**: Recommended to include alongside 2–6 player multiplayer using a dedicated `AiTurn` (`StateType::GAME`) state and an optional `SoloChooseTiebreakTile` (`StateType::ACTIVE_PLAYER`) state when the player must resolve an AI predator tiebreak, configured via `gameoptions.json` for 1P tables.
- **Direct Board Interaction + Status Bar Mirroring**: Recommended UX pairs clickable highlighted ocean tiles and depth lanes directly on the board with matching action buttons in `this.bga.statusBar` so desktop, mobile, and keyboard/accessibility users have parity.
- **No Undo After Hidden Reveals**: Because flipping a facedown ocean tile reveals hidden information, BGA `undoSavepoint()` is **not** offered after flips; only pre-commit UI highlights or single-click confirmations for Rock ingestion are reversible client-side until sent.

---

### 1. Overview & Core Concept

- **What It Does**: Implements the full 160-tile push-your-luck set-collection game **Deep Dive** on BGA, handling variable player-count tile setup (1–3P Main Set vs. 4–6P Main + Extras with per-depth random removals), multi-depth diving, Rock Tile ingestion, Penguin predation and 3-penguin Retreat, Last Dive round tracking, and set-completion scoring.
- **Target Audience**: Casual and family BGA players in both real-time and turn-based tables (2–6 players, plus optional 1-player Solo AI challenge).
- **Key Value**: Enforces strict hidden-information security on facedown Ocean Tiles, prevents ambiguous edge-case stalls (such as Depth 5 boundaries or empty-depth skips during Last Dive), and translates the tactile push-your-luck tension of diving deeper into crisp, responsive board animations and unambiguous status bar prompts.

---

### 2. User Experience & Visual Design

#### Key User Flows

1. **Game Start & Ocean Setup**:
   - The ocean displays 5 horizontal depth bands ordered shallowest to deepest (Depth 1 light ice-blue at top to Depth 5 abyssal navy at bottom).
   - Each depth shows a neat **Facedown Grid/Stack** (showing exact remaining facedown tile count) alongside a **Faceup Zone** for revealed Food, Rock, Open Water, and Predator tiles (with trapped Penguins docked directly onto their Predator tiles).
   - Each player panel & tableau displays: remaining available Penguins (0–3), held Rock Tiles, and a 3-column Food Tableau (**Pink**, **Green**, **Yellow**) aligned row-by-row into **Set 1, Set 2, Set 3...** with live calculated row/total score indicators.
   - The Start Player holds the **Start Player / Last Dive Token** (`1st` side visible).

2. **Turn Start & Optional Rock Ingestion**:
   - Normally, the player begins immediately at Depth 1.
   - If the player owns at least one unspent **Rock Tile**, their status bar and personal Rock reserve highlight an optional **Ingest Rock to Dive Deeper** flow before they commit to Depth 1. Clicking a held Rock Tile enters depth-pick mode (`Depth 1–5` lanes glow), allowing the player to discard the Rock and drop straight into any depth that still has playable tiles.

3. **Diving Depth-by-Depth (The Core Push-Your-Luck Loop)**:
   - The active player's diving penguin marker sits beside the current active depth (`d`), which expands/highlights with a luminous cyan focus ring while non-active depths dim slightly.
   - **Action Choices at Depth `d`**:
     - **Flip a Facedown Tile**: Click any facedown tile (or the facedown stack button) at depth `d`. The tile animates a 3D flip (`bga-animations`) into the Faceup Zone.
     - **Take a Faceup Food or Rock Tile**: Click any faceup Food/Rock tile at depth `d`. The tile slides directly into the player's tableau column (or Rock reserve), ending the turn.
     - **Skip Depth `d`**: Available (via status bar button `"Skip to Depth X"` or clicking the downward depth arrow) *only* if the player has a trapped Penguin at depth `d`, OR if Game End is triggered and depth `d` has 0 facedown tiles (and `d < 5`).
   - **Immediate Tile Resolution After Flipping**:
     - **Open Water**: Brief reveal pulse, status log notification, and automatic penguin descent animation to `d + 1`.
     - **Food or Rock (at Depth 1–4)**: Enters an inline decision prompt in the status bar (`"Take [Tile] & Resurface"` vs. `"Leave & Dive to Depth X"`), while also allowing the player to click the newly revealed tile to take it or click the next depth lane to continue.
     - **Food (at Depth 5)**: Auto-resurfaces (since no Depth 6 exists), animating the tile into the player's tableau.
     - **Predator**: Danger flash + predator shake; one available Penguin slides onto the Predator tile. If it was Penguin #1 or #2, the turn ends immediately.

4. **3rd Penguin Retreat Flow**:
   - When a player's 3rd (final) Penguin lands on a Predator, the board highlights **all eligible faceup Food/Rock tiles** across the depths where those 3 Penguins are trapped (including the one just flipped).
   - If 1 or more eligible tiles exist, the player clicks one to rescue it alongside their 3 Penguins (or chooses `"Retreat Empty-Handed"` if desired). All 3 Penguins then arc back to the player's waddle supply in unison.

5. **Game End Trigger & Last Dive**:
   - The moment the final facedown tile in any depth is flipped, a banner/toast announces Game End Triggered; that depth's facedown slot converts into a `"Depth Exhausted — Free to Skip"` badge.
   - Once turn order reaches the Start Player, the token flips with a rotation animation to **`LAST DIVE`**, signaling one final turn per player before end-of-game scoring breakdown.

#### Visual Identity & UI Polish

- **Aesthetic Direction**: Crisp Arctic/Oceanic tabletop fidelity matching Flatout Games' layered ice-to-abyss gradient palette (`#E6F4FA` ice surface down to `#0B2545` deep ocean, `#FF5A5F` coral/pink shrimp & crab accents, `#2ECC71` sea-green fish, `#F1C40F` yellow squid/fish, `#E67E22` predator warning orange).
- **Interactive Affordances**:
  - Valid clickable tiles show a subtle lift + border glow (`cursor: pointer`) only for the active player during their legal state; illegal depths/tiles never show misleading hover states.
  - **Tableau Set Preview**: Incomplete rows softly outline the missing color slots so players immediately see which color finishes a set for full points vs. half-points.
  - **Responsive Layout**: On narrower viewports, the 5 depth rows stack compactly with horizontal scroll/wrap for faceup tiles, while opponent tableaus collapse into compact badges expandable on click.

---

### 3. Key Product Decisions & Trade-Offs

- **State Modeling: Separate `DepthDecision` vs. `RevealDecision` States**
  - *Chosen Approach*: Split `"choosing an action at a depth"` (`PlayerDiveStep`) from `"deciding whether to keep a newly flipped Food/Rock tile or dive deeper"` (`ConfirmFlipOrDive`) and `"retreat rescue selection"` (`RetreatPickTile`).
  - *Why*: BGA's `GameState` model validates `#[PossibleAction]` methods per state and drives `descriptionMyTurn` + `onUpdateActionButtons`. Separate states guarantee the server cannot accept a `"flip"` action while a `"keep or dive deeper"` decision is pending, and page reloads restore the exact sub-step cleanly.
  - *Alternatives Considered*: A single monolithic `PlayerTurn` state storing a sub-phase global variable. Rejected because it blurs `getArgs()`, complicates zombie handling, and weakens BGA action validation.

- **Tile Persistence: `ItemManager` (Typed Item Class) vs. Legacy `Deck`**
  - *Chosen Approach*: Use BGA's modern `ItemManagerFactory` (`$this->bga->itemManagerFactory`) with an `OceanTile` `#[Item]` entity class (or `Deck` if targeting older studio templates, though `ItemManager` is first-class in `_ide_helper.php`).
  - *Why*: `ItemManager` provides strongly typed PHP 8 properties (`depth`, `category`, `foodColor`, `points`, `isExtra`, `isFaceup`, `trappedPlayerId`, `rowIndex`), clean location tuples (`['ocean', $depth]` / `['tableau', $playerId]`), and native collection filtering (`Collection::filter()`), removing raw SQL boilerplate.
  - *Status (Nov 19, 2026 — implemented)*: `modules/php/OceanTile.php` + `modules/php/OceanTileManager.php` (the single owner of all `ocean_tile` access). The `ocean_tile` table is created by `ItemManager::initDb()` and is **not** declared in `dbmodel.sql`; there is no `trapped_penguin` table — a trapped Penguin lives on its Predator tile as `trappedPlayerId`. The AI uses `tableau` / `rock` with locationArg `9999` (no separate `ai_tableau` location).
  - *Hidden-Information Security*: Before returning tiles in `getAllDatas()` or `getArgs()`, any tile with `isFaceup === false` is serialized strictly as `{ id, depth, faceup: false }`—never leaking `tileCategory`, `foodColor`, or `points` over the network to prevent client-side inspection cheating.

- **Live Score Synchronization (`PlayerCounter`)**
  - *Chosen Approach*: Recompute and update `$this->playerScore` (total points) and `$this->playerScoreAux` (completed rows) via BGA's `CounterFactory` (`PlayerCounter`) after every Food Tile collected, rather than waiting solely for `EndScore`.
  - *Why*: BGA players expect real-time score updates on player panels during set-collection games; `PlayerCounter::set()` automatically dispatches framework score notifications without custom counter sync code.

---

### 4. Technical Architecture & State Machine Specification

#### System Architecture Diagram

```text
┌────────────────────────────────────────────────────────────────────────────┐
│                           BGA SERVER (PHP 8)                               │
│                                                                            │
│  ┌──────────────────┐    ┌──────────────────────────────────────────────┐  │
│  │ Game (Table)     │───▶│ States\GameState Classes (State Machine)     │  │
│  │ - setupNewGame() │    │ - Setup -> PlayerDiveStep -> ConfirmFlip...  │  │
│  │ - getAllDatas()  │    │ - Globals, Notify, PlayerScore, ItemManager  │  │
│  └────────┬─────────┘    └──────────────────────┬───────────────────────┘  │
│           │                                     │                          │
│           ▼                                     ▼                          │
│  ┌──────────────────┐                  ┌────────────────────────────────┐  │
│  │ ItemManager      │                  │ Bga\GameFramework\Db\Globals   │  │
│  │ (OceanTile DB)   │                  │ - currentDepth, flippedTileId  │  │
│  │ - ocean / box    │                  │ - gameEndTriggered, lastDive   │  │
│  │ - tableau / rock │                  │ - startPlayerId, soloAiDepth   │  │
│  └──────────────────┘                  └────────────────────────────────┘  │
└───────────────────────────────────┬────────────────────────────────────────┘
                                    │ JSON (getAllDatas / getArgs / Notify)
                                    ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                         BGA CLIENT (TypeScript)                            │
│                                                                            │
│  ┌──────────────────────┐   bgaPerformAction()    ┌─────────────────────┐  │
│  │ GameGui (Main)       │────────────────────────▶│ Server Action Route │  │
│  │ - onEnteringState()  │                         └─────────────────────┘  │
│  │ - onUpdateActionBtns │◀── this.bga.statusBar                            │
│  └──────────┬───────────┘                                                  │
│             ├──────────────────────┬──────────────────────┐                │
│             ▼                      ▼                      ▼                │
│  ┌────────────────────┐ ┌────────────────────┐ ┌────────────────────────┐  │
│  │ OceanBoardManager  │ │ TableauManager     │ │ AnimationController    │  │
│  │ - 5x bga-cards     │ │ - 3-col food grids │ │ - bga-animations       │  │
│  │   Line/Slot Stocks │ │ - Rock & Penguin   │ │   flip, slide, retreat │  │
│  └────────────────────┘ └────────────────────┘ └────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────┘
```

#### BGA State Machine Diagram

```text
  [1: GameSetup] (MANAGER)
         │
         ▼
  [10: StartTurn] (GAME) ──(evaluates start player / Last Dive token flip / solo AI check)
         │
         ├──(if Solo AI turn)──▶ [50: AiTurn] (GAME) ──▶ [51: SoloChooseTiebreak] (ACTIVE_PLAYER, if tie) ──▶ [40: NextTurn]
         │
         └──(if Human turn & depth=1)──▶ [20: PlayerDiveStep] (ACTIVE_PLAYER)
                                              │
          ┌───────────────────────────────────┼───────────────────────────────────┐
          │                                   │                                   │
          ▼ (actIngestRock)                   ▼ (actTakeFaceup / actSkipDepth)    ▼ (actFlipTile)
   Jumps to chosen depth              • Take: moves tile, ends turn ──▶ [40]  Reveals tile:
   & stays in [20]                    • Skip: depth++, stays in [20]          • Open Water ──▶ depth++, stays [20]
                                        (auto-ends if forced into empty D5)   • Predator ──▶ place Penguin:
                                                                                 - <3 trapped ──▶ [40: NextTurn]
                                                                                 - 3rd trapped ──▶ [30: RetreatPickTile]
                                                                              • Food / Rock:
                                                                                 - if depth == 5 ──▶ auto-take ──▶ [40]
                                                                                 - if depth < 5 ──▶ [25: ConfirmFlipOrDive]
                                                                                                         │
                                                                                      ┌──────────────────┴──────────────────┐
                                                                                      ▼ (actKeepFlipped)                    ▼ (actDiveDeeper)
                                                                              Collect tile ──▶ [40: NextTurn]        depth++, back to [20]

  [30: RetreatPickTile] (ACTIVE_PLAYER) ──(actSelectRetreatTile / actRetreatEmpty)──▶ [40: NextTurn]

  [40: NextTurn] (GAME)
         │
         ├──(if Last Dive active & next player == Start Player)──▶ [98: EndScore] (GAME) ──▶ [99: GameEnd] (MANAGER)
         │
         └──(else)──▶ activeNextPlayer() ──▶ [10: StartTurn]
```

#### Detailed `Bga\GameFramework\States\GameState` Specifications

Every state class resides in `modules/php/States/` and extends `\Bga\GameFramework\States\GameState`.

| ID | State Class | `StateType` | `updateGameProgression` | Purpose & Lifecycle Details |
| :--- | :--- | :--- | :--- | :--- |
| `1` | Framework `gameSetup` | `MANAGER` | `false` | Handled by `Table::setupNewGame()`, returns `StartTurn::class` (ID `10`). |
| `10` | `StartTurn` | `GAME` | `true` | `onEnteringState()`: Checks if `gameEndTriggered && !lastDiveFlipped && activePlayerId == startPlayerId`; if so, flips the Start Player token to `LAST DIVE` and notifies all players. Sets `currentDepth = 1`, `usedRockThisTurn = false`, `flippedTileId = null`. If 1P Solo mode & active turn belongs to AI (`soloAiTurn === true`), returns `AiTurn::class`; otherwise returns `PlayerDiveStep::class`. |
| `20` | `PlayerDiveStep` | `ACTIVE_PLAYER` | `false` | Core action state at `currentDepth`. `getArgs()` returns `currentDepth`, `canIngestRock` (`currentDepth == 1 && !usedRockThisTurn && rockCount > 0`), `canSkip` (`hasTrappedPenguinAtDepth || (gameEndTriggered && facedownCount == 0)` AND `currentDepth < 5`), `validSkipDepths` (for Rock ingestion: depths `1..5` that have at least 1 facedown or collectible faceup tile), `facedownIds` (anonymized IDs at `currentDepth`), `takeableFaceupIds` (Food/Rock IDs at `currentDepth`). |
| `25` | `ConfirmFlipOrDive` | `ACTIVE_PLAYER` | `false` | Entered only when flipping a Food or Rock tile at `currentDepth < 5`. `getArgs()` returns `flippedTile` (full public data), `currentDepth`, `nextDepth`. `#[PossibleAction]` methods: `actKeepFlipped()` (collects tile, updates tableau/score, returns `NextTurn::class`) and `actDiveDeeper()` (leaves tile faceup, increments `currentDepth`, returns `PlayerDiveStep::class`). |
| `30` | `RetreatPickTile` | `ACTIVE_PLAYER` | `false` | Entered only when a player's 3rd Penguin lands on a Predator AND at least 1 eligible faceup Food/Rock tile exists across the depths of the 3 trapped Penguins. (If 0 eligible tiles exist, `actFlipTile` resolves the 3-penguin return immediately and transitions to `NextTurn::class`). `getArgs()` returns `eligibleTileIds` and `trappedDepths`. `#[PossibleAction]` methods: `actSelectRetreatTile(#[IntParam] int $tileId)` and `actRetreatEmpty()`. Returns `NextTurn::class`. |
| `40` | `NextTurn` | `GAME` | `true` | `onEnteringState()`: Determines next clockwise player (or toggles `soloAiTurn` in 1P mode). If `lastDiveFlipped` is `true` AND next player is `startPlayerId` (meaning the player to the right of the Start Player just finished their final turn), returns `EndScore::class`. Otherwise calls `$this->game->activeNextPlayer()` and returns `StartTurn::class`. |
| `50` | `AiTurn` | `GAME` | `false` | *(1P Solo Mode only)* Advances AI Penguin to the next depth with facedown tiles (wrapping `5 -> 1`). Flips 1 facedown tile. If Food/Rock/Open Water, AI collects it. If Predator, leaves it and checks faceup Food at that depth: auto-picks by rule (`fewest color > highest points`); if tied, stores candidate IDs and returns `SoloChooseTiebreak::class`; otherwise returns `NextTurn::class`. |
| `51` | `SoloChooseTiebreak` | `ACTIVE_PLAYER` | `false` | *(1P Solo Mode only)* Human player selects which tied faceup Food Tile the AI takes (`#[PossibleAction] actChooseAiTile(#[IntParam] int $tileId)`), then returns `NextTurn::class`. |
| `98` | `EndScore` | `GAME` | `true` | Finalizes all player scores & tiebreakers (`playerScore`, `playerScoreAux`), computes Solo AI score by difficulty (`Easy`/`Medium`/`Hard`), records `TableStats` / `PlayerStats` (sets completed, dives taken, predators hit, retreats triggered, rocks ingested), and returns `99` (`ST_END_GAME`). |

#### `PlayerDiveStep` (State 20) `#[PossibleAction]` Signatures & Validation

Using `_ide_helper_33cf7d9a.php` typed parameter attributes:
- `#[PossibleAction] public function actFlipTile(#[IntParam(min: 1)] int $tileId, int $activePlayerId): string`
  - Verifies `$tile->location === 'ocean'` and `$tile->depth === $currentDepth` and `!$tile->isFaceup`.
  - Marks `$tile->isFaceup = true`, persists, sends `tileFlipped` notification with revealed tile data.
  - Checks if remaining facedown count at `$currentDepth` just hit `0`: if `!$gameEndTriggered`, sets `gameEndTriggered = true` and notifies `gameEndTriggered`.
  - Branches on `$tile->category`:
    - `OPEN_WATER`: Increments `currentDepth` (safely checking Depth 5 boundary) and returns `PlayerDiveStep::class`.
    - `FOOD` / `ROCK`: If `currentDepth === 5`, collects tile immediately and returns `NextTurn::class`; else stores `flippedTileId = $tileId` and returns `ConfirmFlipOrDive::class`.
    - `PREDATOR`: Moves 1 available Penguin onto `$tileId` (`trappedPlayerId = $activePlayerId`). If trapped count reaches `3`: identifies eligible faceup Food/Rock tiles in the 3 trapped depths; if non-empty, returns `RetreatPickTile::class`; if empty, returns all 3 Penguins to waddle and returns `NextTurn::class`. If `< 3` trapped, returns `NextTurn::class`.
- `#[PossibleAction] public function actTakeFaceup(#[IntParam(min: 1)] int $tileId, int $activePlayerId): string`
  - Verifies `$tile->location === 'ocean'`, `$tile->depth === $currentDepth`, `$tile->isFaceup === true`, and category is `FOOD` or `ROCK`.
  - Moves tile to player's tableau/rock reserve, updates `playerScore` & `playerScoreAux`, notifies `tileCollected`, returns `NextTurn::class`.
- `#[PossibleAction] public function actSkipDepth(int $activePlayerId): string`
  - Verifies `$currentDepth < 5` AND (`hasTrappedPenguinAtDepth($activePlayerId, $currentDepth)` OR (`$gameEndTriggered && countFacedown($currentDepth) === 0`)).
  - Increments `currentDepth`, notifies `penguinSkippedDepth`, checks if new depth has any legal move (if landed on Depth 5 with 0 facedown and 0 takeable faceup tiles, handles forced empty resurface cleanly), returns `PlayerDiveStep::class`.
- `#[PossibleAction] public function actIngestRock(#[IntParam(min: 1, max: 5)] int $targetDepth, int $activePlayerId): string`
  - Verifies `$currentDepth === 1`, `!$usedRockThisTurn`, player has ≥ 1 Rock Tile, and `$targetDepth` has at least 1 facedown or takeable faceup tile (or `$targetDepth < 5` with skip path).
  - Moves 1 player Rock Tile to `'box'`, sets `usedRockThisTurn = true`, sets `currentDepth = $targetDepth`, notifies `rockIngested`, returns `PlayerDiveStep::class`.

#### Zombie Mode Handling (`GameState::zombie(int $playerId)`)

Each `ACTIVE_PLAYER` state implements `zombie(int $playerId): string`:
- **`PlayerDiveStep::zombie`**: Uses `$this->getRandomZombieChoice()` across legal actions—prefers taking a faceup Food tile if available at `currentDepth` (ending turn safely), otherwise flips a random facedown tile or skips.
- **`ConfirmFlipOrDive::zombie`**: Always calls `actKeepFlipped` so a zombie player safely resurfaces and terminates their turn cleanly.
- **`RetreatPickTile::zombie`**: Uses `$this->getBestZombieChoice()` weighted by Food point value (or Rock fallback) to pick the best eligible tile and end the turn.

#### Data Model (`OceanTile` Item & `Globals`)

- **`OceanTile` (`#[Item(tableName: 'ocean_tile')]`)**:
  - `id` (`ItemFieldKind::ID`)
  - `location` (`ItemFieldKind::LOCATION`, index 0): `'ocean'`, `'box'`, `'tableau'`, `'rock'`
  - `locationArg` (`ItemFieldKind::LOCATION`, index 1): depth (`1..5`) when in `'ocean'`, player id (incl. AI `9999`) when in `'tableau'` / `'rock'`, `null` in `'box'`
  - `order` (`ItemFieldKind::ORDER`): Sort position within its exact location (draw order in the ocean)
  - `depth` (`int`, `1..5`): the tile's original depth, kept after collection
  - `category` (`string`: `'open_water' | 'rock' | 'food' | 'predator'`)
  - `foodColor` (`?string`: `'pink' | 'green' | 'yellow'`)
  - `points` (`int`, `0..10`)
  - `isExtra` (`bool`: `true` for 4–6P marked tiles)
  - `isFaceup` (`bool`)
  - `trappedPlayerId` (`?int`: player id of the Penguin trapped on this Predator tile, or `null`; replaces the old `trapped_penguin` table)
  - `rowIndex` (`?int`: 1-based set row in tableau)
- **`Globals` (`Bga\GameFramework\Db\Globals`)**:
  - `startPlayerId` (`int`), `currentDepth` (`int`), `flippedTileId` (`?int`), `usedRockThisTurn` (`bool`), `gameEndTriggered` (`bool`), `lastDiveFlipped` (`bool`), `isSoloMode` (`bool`), `soloAiDepth` (`int`), `soloAiTurn` (`bool`).

#### Client-Server Notification & Animation Mapping

| Server `Notify::all()` | Client `bga-cards` & `bga-animations` Handler |
| :--- | :--- |
| `tileFlipped` | Flips tile element in depth `d`'s stock from back sprite to revealed front sprite (`flipAndReveal`), updates facedown counter badge. |
| `penguinMovedDepth` | Slides active player's diving penguin token from depth `d` dock to `d + 1` dock and shifts depth highlight ring. |
| `tileCollected` | Slides Food Tile from depth `d` into player's matching color column (`Pink`/`Green`/`Yellow`) at `rowIndex`, or Rock Tile into Rock reserve; updates row set-completion glow and score counter. |
| `predatorTrapped` | Shakes Predator tile, slides 1 available Penguin from player's waddle onto the Predator tile, marks depth `d` as skippable for that player. |
| `penguinRetreat` | Animates all 3 trapped Penguins arcing back to player's waddle, and if a rescue tile was chosen, slides it to player's tableau/Rock reserve. |
| `rockIngested` | Slides 1 held Rock Tile to box/fade-out and drops diving Penguin directly to `targetDepth`. |
| `gameEndTriggered` | Pulses exhausted depth badge (`"Empty — Skippable"`). |
| `lastDiveFlipped` | 3D flips the Start Player token on the holder's panel from `1st` to `LAST DIVE`. |
