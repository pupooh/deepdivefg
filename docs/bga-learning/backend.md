# BGA Back-end API — Learning Notes for Deep Dive

Source: https://doc.studio.boardgamearena.com/framework-documentation/back-end/
Read 2026-11-19/20, by direct `browser.open` on every page below (full pages,
paging where needed). No game code was edited for this document.

## Pages read

| # | Page | URL suffix (under `framework-documentation/back-end/`) | Status |
|---|---|---|---|
| 1 | Back-end overview | `/` | complete, 28 lines |
| 2 | Main game logic | `main-game-logic/` | complete, 754 lines |
| 3 | Actions | `main-game-logic/actions/` | complete, 273 lines |
| 4 | Counter factory | `main-game-logic/counter-factory/` | complete |
| 5 | Database | `main-game-logic/database/` | complete, 109 lines |
| 6 | Debug | `main-game-logic/debug/` | complete, 165 lines |
| 7 | Deck factory | `main-game-logic/deck-factory/` | complete |
| 8 | Globals | `main-game-logic/globals/` | complete, 108 lines |
| 9 | ItemManager factory | `main-game-logic/item-manager-factory/` | complete |
| 10 | Legacy | `main-game-logic/legacy/` | complete |
| 11 | Logs | `main-game-logic/logs/` | complete, 69 lines |
| 12 | Notify | `main-game-logic/notify/` | complete, 326 lines |
| 13 | Player score | `main-game-logic/player-score/` | complete, 208 lines |
| 14 | Player score aux | `main-game-logic/player-score-aux/` | complete |
| 15 | Player stats | `main-game-logic/player-stats/` | complete |
| 16 | Players | `main-game-logic/players/` | complete, 137 lines |
| 17 | Table options | `main-game-logic/table-options/` | complete |
| 18 | Table stats | `main-game-logic/table-stats/` | complete |
| 19 | Tournament | `main-game-logic/tournament/` | complete |
| 20 | User preferences | `main-game-logic/user-preferences/` | complete |
| 21 | Game state classes | `game-state-classes/` | complete, 810 lines |
| 22 | Game database model | `game-database-model/` | complete, 30 lines |
| 23 | Game meta-information | `game-meta-information/` | complete, 296 lines |
| 24 | Game statistics | `game-statistics/` | complete, 244 lines |
| 25 | PHP unit testing | `php-unit-testing/` | complete, 460 lines |
| 26 | Table options (config) | `table-options/` | complete, 533 lines |
| 27 | User preferences (config) | `user-preferences/` | complete, 116 lines |
| 28 | Zombie mode | `zombie-mode/` | complete, 158 lines |
| 29 | Back-end libs overview | `libs/` | complete, 26 lines |
| 30 | ItemManager | `libs/itemmanager/` | complete, 813 lines (tail re-fetched after an initial 429) |
| 31 | PlayerCounter | `libs/playercounter/` | complete, 406 lines |
| 32 | TableCounter | `libs/tablecounter/` | complete, 181 lines |

Front-end docs and the Reversi/Hearts tutorials were **not** re-read here
(they were read in the previous session); this file is back-end only.

---

## 1. Table class — `modules/php/Game.php`

Entry point. `class Game extends \Bga\GameFramework\Table`, namespace
`Bga\Games\DeepDiveFG`. A new `Game` instance is created per request; anything
that must survive between requests goes in the DB, in Globals, or in a
persistent component such as ItemManager.

### 1.1 Main callbacks

| Callback | Contract |
|---|---|
| `__construct()` | Call `parent::__construct()` first, then create components and configure framework APIs. |
| `setupNewGame($players, $options = [])` | Initialise the DB for a new table. **Return the class name of the first state** (e.g. `return StartTurn::class;`). Without a return value the initial state is state `2`. |
| `getAllDatas(int $currentPlayerId)` (framework may also supply `?int $currentPlayerNo`, null for spectators) | Associative array used to rebuild the interface on page load/refresh. Keep the generated `players` structure, add game fields. **Do not add unrelated parameters.** Use the current player to decide which private data to include. |
| `getGameProgression(): int` | Percentage 0–100. Also used when handling a player leaving/conceding. |
| `upgradeTableDb($from_version)` | Migrate tables already in progress when a released game needs a DB change. |

Deep Dive: `setupNewGame` returns `StartTurn::class` ✓; `getAllDatas(int
$currentPlayerId)` ✓; `upgradeTableDb` is an empty stub (fine pre-release —
see §7 for the ItemManager upgrade helper if the model ever changes).

### 1.2 `$this->bga` services (in `Game`; in a state class use `$this->game->bga`)

| Service | Purpose |
|---|---|
| `$this->bga->notify` | Public/private notifications (§5) |
| `$this->bga->globals` | Persist JSON values for the table (§2) |
| `$this->bga->tableOptions` | Read table options, play mode, game version, language (§9) |
| `$this->bga->userPreferences` | Read a player's interface preferences (§9) |
| `$this->bga->tableStats` | Table statistics (§8) |
| `$this->bga->playerStats` | Per-player statistics (§8) |
| `$this->bga->deckFactory` | Create `Deck` components (**deprecated** — see §7) |
| `$this->bga->itemManagerFactory` | Create managers for typed persistent objects (§7) |
| `$this->bga->counterFactory` | Create table/player counters (§8) |
| `$this->bga->playerScore` / `$this->bga->playerScoreAux` | Built-in `PlayerCounter`s for `player_score` / `player_score_aux` (§8) |
| `$this->bga->logs` | Identify moves / remove logs when undoing (§10) |
| `$this->bga->tournament` | Tournament info + per-player tournament data (§9) |
| `$this->bga->legacy` | Data persisting across tables, e.g. campaign progress (§9) |
| `$this->bga->debug` | Run zombie moves automatically while debugging (§11) |

`GameState` also exposes the same services directly as properties
(`$this->globals`, `$this->notify`, `$this->playerStats`,
`$this->playerScore`, … — see `_ide_helper.php`); Deep Dive state classes
use that shorthand throughout, which matches the docs' state examples.

### 1.3 State-machine control from `Game` / states (`$this->game->gamestate`)

- `activeNextPlayer()` / `activePrevPlayer()` — activate next/previous player
  in natural table order. Transition to a state within the same action so the
  client receives the changed active player.
- `gamestate->changeActivePlayer($playerId)` — select a particular player,
  followed by a state transition.
- `gamestate->setAllPlayersMultiactive()` — activate all eligible players
  (in the multiactive state's `onEnteringState`). For a subset use
  `setPlayersMultiactive($players, $nextState, $bInactivePlayersNotOnTheList = false)`.
- `gamestate->setAllPlayersNonMultiactive($nextState)`,
  `gamestate->setPlayerNonMultiactive($playerId, $nextState)` — deactivate;
  the next-state argument accepts a transition name, state ID, state class
  name, or a callable returning one of those.
- `gamestate->getActivePlayerList()`, `isPlayerActive($playerId)`,
  `isMultiactiveState(): bool`, `updateMultiactiveOrNextState($nextStateIfNone)`
  (do not call after the setters — they already do this).
- `gamestate->nextState($transition = '')` — follows a transition label
  declared in the current state's `transitions` map; does **not** resolve a
  state ID/class. Empty argument requires exactly one transition.
- `gamestate->jumpToState($nextState, $bWithActions = true)` — jump directly
  to a state ID/class, bypassing named transitions; for exceptional
  dispatch/recovery only.
- Inspection: `getCurrentMainState()`, `getCurrentMainStateClass()`,
  `getCurrentMainStateId()`, `getCurrentState($playerId)`,
  `getCurrentStateClass($playerId)`, `getCurrentStateId($playerId)`.
  Descriptors expose `->name` and `->toArray()`. These replace older
  `state()` / `state_id()`.
- `checkAction($actionName, $bThrowException = true)` — autowired actions run
  this automatically; a manually dispatched action must check first.
  `gamestate->checkPossibleAction($actionName, $bThrowException = true)` —
  checks state membership without requiring the requester to be active
  (does not establish participation/non-elimination — enforce yourself).
- Private parallel states: `initializePrivateStateForAllActivePlayers()`,
  `initializePrivateStateForPlayers($playerIds)`,
  `initializePrivateState($playerId)`,
  `nextPrivateStateForAllActivePlayers($transition)`,
  `nextPrivateStateForPlayers($playerIds, $transition)`,
  `nextPrivateState($playerId, $transition)`,
  `unsetPrivateStateForAllPlayers()` / `...ForPlayers()` / `...($playerId)`,
  `setPrivateState($playerId, $newStateId)`, `getPrivateState($playerId)`
  (legacy array; prefer `getCurrentState`). Private transitions must lead to
  another private state. Clear a private state when no longer needed.
- Advanced: `$this->bIndependantMultiactiveTable = true` in the `Game`
  constructor moves multiactive tracking to a separate table (only for
  confirmed production deadlocks; do not combine with SQL assuming activity
  lives in `player`).

Deep Dive uses only single-active-player flow: `activeNextPlayer()` in
`setupNewGame` and in `NextPlayer`, plus class-name returns. No multiactive
or private states — nothing to change unless a simultaneous phase is added.

### 1.4 Randomisation

- `bga_rand($min, $max): int` — inclusive bounds, backed by PHP `random_int`.
  **Use this for dice rolls and individual random choices. Do not use `rand`,
  `mt_rand`, or SQL `RAND()` for these choices.**
- For stored cards/pieces, use the shuffle method on Deck or ItemManager so
  ordering/persistence stay consistent with the component.
- ⚠️ **Deep Dive violation (minor):** `Game::generateOceanTiles()` calls PHP
  `shuffle($ids)` / `shuffle($remainingIds)` twice to pick random tiles to
  remove and to assign `tile_order`. That is shuffling a plain ID array, not
  a stored component, so it is not the exact case the rule targets — but the
  idiomatic form is a `bga_rand`-based sample without replacement (docs give
  a `getRandomKey` / `getRandomSlice` pattern), or ItemManager `shuffle()`
  after creation (§7). Worth changing when the tile model is next touched.

### 1.5 Errors and exceptions

Throwing aborts the request's DB changes and queued notifications.

| Exception | Use |
|---|---|
| `Bga\GameFramework\UserException` | Player attempted a move the rules forbid. Translated message shown to the player; expected refusal. |
| `Bga\GameFramework\SystemException` | Technical inconsistency / unexpected failure. Details logged, hidden from player. |
| `Bga\GameFramework\VisibleSystemException` | Unexpected failure whose details help diagnose a report. Shown as unexpected error, and logged. |

All three accept a `string` or a `NotificationMessage`. Translate user errors
with `clienttranslate`; keep technical messages untranslated.
Deep Dive ✓: `UserException(clienttranslate(...))` for illegal moves in all
state classes; `\BgaVisibleSystemException("Tile not found: ...")` in
`Game::collectTileForPlayer()`.

### 1.6 Translations — `clienttranslate()`

- Marks an English string for translation on the client; **returns its input
  unchanged — it does not translate in PHP.** The scanner collects literal
  strings inside these calls.
- **Mark the literal where it is defined.** `clienttranslate($message)` on a
  variable does not make its contents discoverable.
- Use **single-quoted** strings containing `${...}` placeholders (double
  quotes interpolate PHP variables first). Keep values in the arguments.
- Do not concatenate translated fragments or build a string dynamically
  inside `clienttranslate`. Translate complete sentences and substitute
  arguments so translators can reorder for target grammar.
- `i18n` lists argument names whose values need translation (their original
  English value must itself be marked with `clienttranslate`).
  **Do not translate player names or numbers.** Keep stable IDs separate
  from translated display values (client logic should key on `card_id`, not
  `card_name`).
- An array listed in `i18n` is translated entry by entry; `separator` joins
  them (`'and'` / `'or'` give a localised final conjunction; a custom string
  such as `' / '` joins every entry literally).
- Deep Dive ✓ mostly: notification messages and state descriptions use
  `clienttranslate` with single quotes and `${...}` placeholders; tile
  descriptions are built with `clienttranslate` at the definition site.
  ⚠️ Minor: `ConfirmFlipOrDive::getTileDescription()` builds food text as
  `sprintf(clienttranslate('%s Food (%d pts)'), ucfirst($food_color), $points)`.
  The colour name is inserted untranslated English, and the docs' preferred
  form is a full sentence with arguments (`'${color} Food (${points} pts)'`
  + `i18n`). Also **no `i18n` key appears anywhere in `modules/php/`** —
  harmless today because `tile_desc` is pre-translated, but any future
  argument whose value needs translation (e.g. a tile/depth name) must be
  listed in `i18n`.

### 1.7 Autoloading / other classes

Classes in `modules/php` are autoloaded when namespace and file path follow
PSR-4: `Bga\Games\YourGameName\ScoreManager` → `modules/php/ScoreManager.php`;
sub-namespaces map to subdirectories (`...\Cards\StandardCard` →
`modules/php/Cards/StandardCard.php`). No `require_once` needed. (Only for
games with the `modules/php/Game.php` entry point.)

### 1.8 Player colours

Enable `favorite_colors_support` in gameinfos **and** call
`reattributeColorsBasedOnPreferences($players, $gameinfos['player_colors'])`
in `setupNewGame` after creating player rows, then
`reloadPlayersBasicInfos()`. The flag alone only advertises support.
**Do not use preference-based assignment when colour determines a role or
advantage.** Override `getSpecificColorPairings(): array` to map a preference
colour to a specific game colour (or list); a mapped colour must be among the
available colours. Preference keys are fixed (`ff0000` red, `008000` green,
`0000ff` blue, `ffa500` yellow, `000000` black, `ffffff` white, `e94190` pink,
`982fff` purple, `72c3b1` cyan, `f07f16` orange, `bdd002` khaki, `7b7b7b` gray).
Deep Dive ✓: flag is `true` and the call is made in `setupNewGame`.

### 1.9 Free-form player text

`logTextForModeration($playerId, $text)` — record free-form text another
player can see (clue/answer) so it can be reported for moderation. It does
not add a visible gameplay message. Not needed by Deep Dive (no text input).

---

## 2. Globals — `$this->bga->globals`

Values for the current table, stored in the `bga_globals` DB table,
serialised as **JSON**. Scalars, arrays, or serialisable data objects.
**Each call reads/writes the DB rather than a local cache.** Keys are
developer-defined, at most **50 characters**, preferably constants.

| Method | Behaviour |
|---|---|
| `set(string $name, mixed $obj): void` | Create or replace a value. |
| `get(string $name, mixed $defaultValue = null, ?string $class = null): mixed` | Read, returning default if absent. `class: MyClass::class` reconstructs a data object (constructor parameter names must match stored properties). Without it, a stored object reads back as `stdClass`. |
| `getAll(string ...$names): array` | Values keyed by name; no args = every stored global; missing keys omitted. |
| `has(string $name): bool` | Exists, **including a key whose stored value is `null`**. |
| `inc(string $name, int $inc): int` | Add to an existing integer, return new value. Absent/non-integer throws. Negative increment subtracts. |
| `delete(string ...$names): void` | Delete the named keys. **With no arguments, nothing is deleted.** |

JSON cannot store functions or circular references.

Deep Dive ✓: 11 globals (`startPlayerId`, `currentDepth`, `flippedTileId`,
`usedRockThisTurn`, `gameEndTriggered`, `gameEndDepth`, `lastDiveFlipped`,
`isSoloMode`, `soloAiDepth`, `soloAiTurn`, `soloDifficulty`, plus
`soloTiebreakCandidateIds` set in `AiTurn`). All keys short, all reads supply
a default. One inconsistency to note: `flippedTileId` is initialised to `0`
and read with default `0`, while the implementation plan describes it as
`?int` (null when none) — `0` works as the sentinel here, just keep it
consistent. `soloTiebreakCandidateIds` is stored as a plain array — fine.

---

## 3. State classes — `modules/php/States/`, `Bga\GameFramework\States\GameState`

Each state is its own class extending `GameState`, constructor pattern:

```php
parent::__construct($game,
    id: 2,
    type: StateType::ACTIVE_PLAYER,
    description: clienttranslate('${actplayer} must play a card or pass'),
    descriptionMyTurn: clienttranslate('${you} must play a card or pass'),
    updateGameProgression: false,
    initialPrivate: null,
);
```

### 3.1 Constructor parameters

| Parameter | Rule |
|---|---|
| `id` (mandatory) | Positive integer, unique across all states. **IDs `1` (first state) and `99` (final state) are reserved — do not use or modify them.** Any other positive integer, including >100. **Once in production, changing a state ID breaks in-progress games.** Deep Dive uses 10, 20, 25, 30, 40, 50, 51, 98 ✓ (98 is its own `EndScore`, 99 is the framework end state). |
| `type` (mandatory) | `StateType::ACTIVE_PLAYER` (one player), `StateType::MULTIPLE_ACTIVE_PLAYER` (several), `StateType::PRIVATE` (per-player parallel state inside a multiactive state), `StateType::GAME` (no active player; automatic operations). |
| `name` | Defaults to the class name exactly. Several states may share a name (not recommended). Valid identifier only. |
| `description` | Shown in the action bar to all players **except** the active player. Wrap in `clienttranslate`; use `${actplayer}`. May be omitted for `GAME` states (but a description helps when synchronous notifications keep the client in a `GAME` state briefly). Custom arguments come from `getArgs()`. `${otherplayer}` requires both `otherplayer` and `otherplayer_id` in args, or the game will not load. |
| `descriptionMyTurn` | **Mandatory for `ACTIVE_PLAYER` / `MULTIPLE_ACTIVE_PLAYER`.** Shown to the active player(s); use `${you}`. |
| `updateGameProgression` | Default `false`. When `true`, the framework calls `getGameProgression()` on entering. **At least one state must set this to `true`.** |
| `initialPrivate` | First private state players enter in a multiactive state (`null`, int ID, or class name). |

Deep Dive ✓: all four `ACTIVE_PLAYER` states have both descriptions;
`updateGameProgression: true` on `StartTurn`, `NextPlayer`, `AiTurn`,
`EndScore`.

### 3.2 `getArgs(): array`

Data the front end needs for the state. Magic parameters (injected by name):
`int $activePlayerId` / `$activePlayerNo` (ACTIVE_PLAYER only),
`int $playerId` / `$playerNo` (also `$currentPlayerId` / `$currentPlayerNo`,
PRIVATE only).

- **By default all returned data is public to all players.** Do not include
  private data — players can inspect it even if the UI hides it. For
  per-player data, return a `_private` key (keyed by player number — first
  configure `$this->bga->notify->setUseNo(true)` in the `Game` constructor),
  available on the client as `args.args._private`. Add
  `'_merge_private' => true` to merge it into `args.args` instead, or call
  `$this->bga->notify->alwaysMergePrivate()` once in the constructor.
  Private args can hurt performance in `MULTIPLE_ACTIVE_PLAYER` states — use
  only when needed.
- `_no_notify => true` — suppress enter/leave notifications for a state
  that is skipped automatically (avoids flashing its message). **If you use
  it, `onEnteringState` must redirect when the flag is true.** Leave it off
  for `EndScore` so its "Computing end score..." description stays visible
  during animated notifications.

Deep Dive: `getArgs()` in the four `ACTIVE_PLAYER` states returns only
public, already-safe data (facedown tile **IDs only**, takeable faceup IDs,
eligible IDs, candidate IDs). The full hidden tile data is never sent —
`getAllDatas()` likewise serialises facedown tiles as
`{id, depth, isFaceup: false}`. That is the correct pattern and means no
`_private` machinery is needed. `getArgs()` does not use magic parameters —
it reads the active player via `$this->game->getActivePlayerId()` instead,
which is fine (the docs note the magic param makes the getter "useless most
of the time").

### 3.3 `onEnteringState()`

Runs on entering the state. Magic parameters: `array $args` (result of
`getArgs()`), plus the same injected player params as `getArgs()`.
Redirect by returning a state class (`return NextPlayer::class;`), a state
ID as an **integer** (`return 99;` — numeric strings are not accepted), or
nothing. In a `GAME` state, typically: check victory conditions, deal,
select next player, then redirect. In a `MULTIPLE_ACTIVE_PLAYER` state,
typically `setAllPlayersMultiactive()` then return nothing.

**Do not override `stGameEnd()` or `argGameEnd()`** in `Game.php` — it can
leave the game stuck on "Recording game results + computing statistics in
progress...". Deep Dive ✓ (neither is overridden).

End-of-game scores/statistics go in the state immediately before `endGame`
(`EndScore`, id 98) — Deep Dive ✓ (`updatePlayerScores()` + solo AI scoring
there, returning `ST_END_GAME` = 99).

### 3.4 Actions — `#[PossibleAction]`

- Action method names **must start with `act`**. Mark each with
  `#[PossibleAction]` (`Bga\GameFramework\States\PossibleAction`).
  Actions are autowired using the function name and parameter types.
- If an action is not declared in the current state, the framework falls
  back to checking `Game.php` — actions triggerable in any state can live
  there.
- Return value works like `onEnteringState` (return a state class to
  redirect).
- Magic parameters (injected by name): `array $args` (current state's
  `getArgs()` result); `int $activePlayerId` / `int $activePlayerNo`
  (**single-active-player states only**); `int $currentPlayerId` /
  `int $currentPlayerNo` (the player who triggered the action — the
  request's author, who may differ from the active player). Snake-case
  equivalents also work. **An unqualified `$playerId` is NOT a magic
  parameter for an action.**
- `#[CheckAction(false)]` (`Bga\GameFramework\Actions\CheckAction`) disables
  the automatic action check — only for actions intentionally available
  outside the requester's turn. Then check participation, elimination, and
  state rules explicitly (`gamestate->checkPossibleAction(...)`), and call
  the front end with `{checkAction: false, checkPossibleActions: true}`.
  Deep Dive does not use it (all actions are active-player only) ✓.

Deep Dive ✓: all actions are `#[PossibleAction]`, named `act*`, return
`string` (a state class name), and take the injected `int $activePlayerId`
(last parameter). No action relies on a bare `$playerId`.

### 3.5 Autowired action parameters — `Bga\GameFramework\Actions\Types`

The server matches request fields to parameter names and converts basic
`int`/`float`/`bool`/`string` values. No attribute is needed for simple
types unless extra configuration is needed. All attributes support an
optional `$name` to read a request field with a different name.

| Attribute | Meaning |
|---|---|
| `BoolParam(?string $name = null)` | Boolean request parameter. |
| `IntParam(?string $name = null, ?int $min = null, ?int $max = null)` | Integer with optional inclusive bounds. |
| `FloatParam(?string $name = null, ?float $min = null, ?float $max = null)` | Float with optional inclusive bounds. |
| `StringParam(?string $name = null, ?bool $alphanum = false, ?bool $alphanum_dash = false, ?bool $base64 = false, ?array $enum = null)` | String constrained by character check or allowed-value list. `alphanum` = ASCII letters, digits, underscores, spaces; `alphanum_dash` also allows hyphens. |
| `IntArrayParam(?string $name = null, ?int $min = null, ?int $max = null)` | List of integers. **Bounds apply to the number of entries, not individual values.** Validate IDs, ownership, duplicates in the action. For an optional empty list use a nullable parameter (`?array $ids`) and treat `null` as empty. |
| `JsonParam(?string $name = null, ?bool $associative = true, ?bool $alphanum = true, ?string $class = null)` | Decode a JSON string (default: associative array). Default `alphanum` validation restricts string keys/values to letters, digits, underscores, hyphens, spaces; disabling it requires your own validation. A typed parameter or `class:` reconstructs a data object (`PlacementPlan` with promoted constructor props). |

Deep Dive ✓: `actFlipTile(#[IntParam(min: 1)] int $tileId, ...)`,
`actTakeFaceup(#[IntParam(min: 1)] ...)`,
`actIngestRock(#[IntParam(min: 1, max: 5)] int $targetDepth, ...)`,
`actSelectRetreatTile(#[IntParam(min: 1)] ...)`,
`actChooseAiTile(#[IntParam(min: 1)] ...)`. Note the framework validates
the bounds — the actions must still validate ownership/depth/faceup status
themselves, which they do (tile location/depth/faceup checks + `UserException`).

### 3.6 `zombie(int $playerId): string`

**Mandatory in all states except `GAME` states.** The framework calls the
current state's `zombie` when a player leaves (quit / expelled for time) and
whenever that player must act afterwards. First parameter is the zombie
player's ID (`int $playerId`); use `int $playerNo` / `int $player_no` to
receive the number instead. Magic parameter `array $args` receives
`getArgs()`. Return value works like `onEnteringState`; a zombie may
delegate directly to an `act*` method.

**Never use `getCurrentPlayerId()` / `getCurrentPlayerName()` in a zombie
function** — there is no current player associated with a zombie turn. Use
the supplied `$playerNo` or `$this->game->getPlayerNameByNo($playerNo)`.

Helpers on the state: `getRandomZombieChoice($choices)` (random legal move),
`getBestZombieChoice($scoredChoices)` (highest-scoring move; associative
choice => points).

Zombie levels (set the level in the Game Metadata Manager; if parts differ,
pick the most common, or the lowest if tied):
0 passing (move on without acting, unless an action is required to keep the
game running); 1 random legal action; 2 greedy (greatest immediate benefit
from visible info, no planning/memory/blocking); 3 smart (plans, remembers
revealed info). **Aim for level 1 or 2** (level 0 suffices for solo-only
games). **Do not try to end the game early, even in a two-player game** —
the zombie exists to let the game continue.

Testing: the debug menu's arrow button calls each active player's current
`zombie`. To test a real quit: Friendly mode table → Express Start (or the
infinite-time symbol) → open as another player → "Quit this game". Leaving
in Friendly mode costs no karma; other modes reduce karma.

Deep Dive — present but **level 0 in practice** ⚠️:
- `zombie()` exists in all four `ACTIVE_PLAYER` states ✓ (GAME states
  correctly have none), and none of them uses `getCurrentPlayerId()` ✓.
- But every implementation picks the **first** candidate deterministically:
  `PlayerDiveStep` takes the first takeable faceup tile, else flips the
  first facedown tile; `RetreatPickTile` takes the first eligible tile
  (not the highest-point one); `SoloChooseTiebreak` takes the first
  candidate. `getRandomZombieChoice()` / `getBestZombieChoice()` are never
  called. That is below the recommended level 1–2: at minimum
  `PlayerDiveStep::zombie` should use `getRandomZombieChoice()` over the
  legal moves, and `RetreatPickTile::zombie` should use
  `getBestZombieChoice()` weighted by food points (the implementation plan
  already says this — the code does not do it yet).
  `ConfirmFlipOrDive::zombie` always keeping the flipped tile is fine
  (safe resurface).

### 3.7 `ACTIVE_PLAYER` vs `MULTIPLE_ACTIVE_PLAYER`

| | `ACTIVE_PLAYER` | `MULTIPLE_ACTIVE_PLAYER` |
|---|---|---|
| Change active player during state | No — one player active throughout | Yes — set them during the state |
| Setting active player(s) | Must set **before** entering | Set in the state's `onEnteringState` |
| JS `onUpdateActionButtons` vs `onEnteringState` | `onUpdateActionButtons` runs before `onEnteringState` in play, after it on reload (F5) | During JS `onEnteringState`, active players are **not yet** marked active — use `onUpdateActionButtons` for anything depending on active status |

Players can perform actions even when not active in special cases — see
out-of-turn actions (`#[CheckAction(false)]`, §3.4). Use sparingly.

State design guidance: follow the rulebook's round/turn structure. Several
actions in one turn usually belong in a single player state, with a `GAME`
state to select the next player. A simple game needs just a
`playerTurn`/`gameTurn` pair; a complex eurogame may use one multiactive
state for a simultaneous phase, an `ACTIVE_PLAYER`+`GAME` pair for turns,
another pair for resolution, and a final `GAME` state for upkeep. For an
`ACTIVE_PLAYER`+`GAME` pair, either state can be entered first.

Private parallel states (`PRIVATE` type): each player moves through their
own sequence inside one master `MULTIPLE_ACTIVE_PLAYER` state — avoids
making fast players wait, and avoids losing progress on refresh (the
client-states alternative) or duplicating validation client-side. Set
`initialPrivate` on the master state, then
`initializePrivateStateForAllActivePlayers()` /
`nextPrivateState($playerId, ...)` etc. (§1.3). Deep Dive does not use them.

Named constants: avoid numeric state IDs in code; define a `StateConstants`
class (e.g. `STATE_PLAYER_TURN = 4`, `STATE_END_GAME = 99`) and use
`id: StateConstants::STATE_PLAYER_TURN_OP`. Deep Dive uses literal IDs in
constructors and a file-local `const ST_END_GAME = 99;` in `EndScore.php` —
works, but a shared constants class would be cleaner if IDs are ever
referenced elsewhere.

---

## 4. Database access — methods on `Game` (in a state, via `$this->game`)

The framework owns the request's DB transaction: success commits, an
exception rolls back. **Do not start or commit a separate transaction.**
Avoid statements that implicitly commit (e.g. `TRUNCATE` — use
`DELETE FROM` when clearing data during play).

| Method | Behaviour |
|---|---|
| `DbQuery($sql)` | Execute a query (INSERT/UPDATE/DELETE). Prefer the read methods below for results. |
| `getUniqueValueFromDB($sql)` | One scalar; `null` when no row matches; more than one row is an error. |
| `getCollectionFromDB($sql, $bSingleValue = false)` | Map keyed by the first selected column; each value is the whole row. With `$bSingleValue = true` and two columns, map from first column to second. First column must uniquely identify rows or entries overwrite each other. Empty result is `[]`. (Note the capitalisation: `getCollectionFromDB`, not `...FromDb`.) |
| `getNonEmptyCollectionFromDB($sql)` | Same map, throws if empty. No single-value flag. |
| `getObjectFromDB($sql)` | One row as an **associative array** (despite the name), or `null`. More than one row is an error. |
| `getNonEmptyObjectFromDB($sql)` | One row, throws if none. |
| `getObjectListFromDB($sql, $bUniqueValue = false)` | Numerically indexed list of rows, or `[]`. With `$bUniqueValue = true`, a list of each row's first value. Use when the first column is not a unique key. |
| `getDoubleKeyCollectionFromDB($sql, $bSingleValue = false)` | Nested map keyed by first and second columns; leaf is the row, or the third value when `$bSingleValue = true`. |
| `DbGetLastId()` | Auto-generated ID of the last inserted row. |
| `DbAffectedRow()` | Rows affected by the last operation. |

Escaping: `escapeStringForDB($string)` — escapes a string for inclusion in
SQL; **put the result inside single quotes yourself** (it does not quote),
and it does **not** escape `%`/`_` for `LIKE`. Action parameter types do
not replace escaping for player-provided text.

Deep Dive uses `DbQuery`, `getUniqueValueFromDB`, `getCollectionFromDb`,
`getObjectFromDB`. ⚠️ Naming: the code calls `getCollectionFromDb` (lowercase
`b`) — PHP method names are case-insensitive, so this works, but the
canonical framework spelling is `getCollectionFromDB`; align it for
readability. All interpolated values in its SQL are ints / internal enums,
never raw player text — no escaping issue today, but any future
player-supplied string in SQL must go through `escapeStringForDB`.

---

## 5. Notifications — `$this->bga->notify`

Send **after** updating game data. Queued during an action; normally
delivered when the action completes successfully, **including its state
transitions**. An exception rolls back the move and prevents delivery.
Send from action methods, `onEnteringState`, or `setupNewGame` (after
players are initialised). **Constructors and read-only methods such as
`getArgs` must not send notifications.** Each serialised notification packet
is limited to **128 KiB** during normal play — send only the changes the
interface needs; keep log messages as text and render HTML on the client.

| Method | Behaviour |
|---|---|
| `all(string $notifName, string\|NotificationMessage $message = '', array $args = []): void` | Public notification to players **and spectators**. Empty message = UI update with no log entry. |
| `player(int $playerIdOrNo, string $notifName, string\|NotificationMessage $message = '', array $args = []): void` | Notification to one player (IDs by default). The recipient must be a player at the table; use public notifications for info spectators need. |
| `setUseNo(bool $useNo): void` | Use player numbers for `player` targets and `_private` keys. **Does not convert IDs inside custom arguments.** |
| `addDecorator(callable $fn)` | Register `function(string $message, array $args): array` returning decorated args. A `decorateNotifArgs` method on `Game` is registered automatically. Runs for `bga->notify` methods, **including private argument arrays**. Deprecated `notifyAllPlayers` / `notifyPlayer` bypass decorators. |
| `alwaysMergePrivate()` | Merge private data directly into each recipient's arguments instead of under `args._private`. Call in the `Game` constructor; per-array alternative: `'_merge_private' => true`. |

- `_private` (in `all` args): per-player private data, keyed by ID or number
  per `setUseNo`. Other recipients do not receive those values. A private
  entry can itself be a `NotificationMessage` to give that recipient
  different log text (refer to private fields as `${_private.field}`, or
  `${field}` with merging enabled).
- An action with **only private notifications has no associated move ID** —
  include a public notification (even with an empty message) if it needs one.
  Private and public channels are stored separately: private entries precede
  public entries in the restored log, so **do not rely on interleaved
  ordering** between channels.
- Log args: single-quoted `${...}` strings; supply every referenced
  argument. `i18n` lists args needing translation; **player names must not
  be in `i18n`**. To colour player names, pass matching pairs such as
  `player_name` + `player_id` (or `player_name2` + `player_id2`); these
  fields contain **player IDs even when notification targets use player
  numbers**.
- Nested log fragments: an argument can contain its own `log` + `args`,
  formatted recursively by the client.
- Log history: on reload, old notifications rebuild the log **without**
  calling normal notification handlers, and most non-log arguments are
  stripped from history. If a custom log formatter needs extra fields, list
  them in `preserve` (e.g. `'preserve' => ['tileType']`). Rebuild the board
  from `getAllDatas`, not from history handlers.
- Public flag `doNotWriteNextNotificationsToDatabase` suppresses persistence
  of subsequent notifications for the current request (used by the logs API
  when removing undone moves).

Deep Dive ✓: all notifications are `notify->all(...)` with
`clienttranslate` messages, `player_id` + `player_name` pairs, and full tile
payloads well under the packet limit. It never uses `player()` /
`_private` — correct, because it has no per-player secret data to send
(facedown tiles are anonymised server-side). It also does not configure
`setUseNo(true)` on notify — consistent, since it passes player IDs.

---

## 6. Players — methods on `Game`

- **Active player** = whose turn it is. **Current player** = the person
  making the request (may be inactive or a spectator) — not interchangeable.
- Prefer **player numbers** for game logic, custom DB locations, and
  notification payloads; convert to a player ID only when an API requires
  it. Player numbers are fixed seats within a table; player IDs identify
  accounts across tables. In state callbacks/actions prefer the injected
  player parameters.
- `getPlayerCount()` / `getPlayersNumber(): int` — players at the table.
  Before populating the player table in `setupNewGame`, use `count($players)`.
- `getPlayerNameById($playerId)` / `getPlayerNameByNo(int $playerNo): string`;
  `getPlayerColorById($playerId)` / `getPlayerColorByNo(int $playerNo): string`
  (hex **without** `#`).
- `getPlayerNoById($playerId)` / `getPlayerIdByNo($playerNo)`.
- `loadPlayersBasicInfos(): array` — cached player info keyed by player ID
  (`player_name`, `player_color`, `player_no`, framework flags). Does **not**
  load custom columns added by the game.
- `reloadPlayersBasicInfos(): void` — refresh after changing player info
  during setup (e.g. colours).
- `isSpectator()` — current requester is outside the player list; spectators
  receive only public data.
- `getActivePlayerId()` — stored active-player ID; alone it does **not**
  establish that the player is currently active (single-active-player states
  only). Older APIs may return it as a string — cast to `int`. The magic
  param makes this getter "useless most of the time".
- `getCurrentPlayerId()` — **deprecated**; only call on `getAllDatas` and
  actions, both of which support the magic param, so it "should not be used".
- `isCurrentPlayerZombie()` — **deprecated** in practice: if the game uses
  `zombie` functions for random moves, this should never be needed. Keep
  zombie decisions in the zombie callback; ordinary validation should work
  for human and zombie alike.
- Turn order: `player_no` is a fixed seat — **do not change it to implement
  a custom turn order**; persist custom ordering separately (game column or
  global). `getNextPlayerTable()` (map each player ID → next ID, wrapping;
  key `0` = first player), `getPrevPlayerTable()` (no `0` entry),
  `getPlayerAfter($playerId)` / `getPlayerBefore($playerId)`,
  `getPlayerNoAfter(int $playerNo): int` / `getPlayerNoBefore(int $playerNo): int`,
  `createNextPlayerTable($players, $bLoop = true)` (builds a map for a chosen
  order without changing stored order; `$bLoop = false` maps the last player
  to `null`; key `0` = first player in either mode).
- `giveExtraTime($playerId, $specificTime = null)` — extra thinking time in
  real-time games (no effect turn-based). Default increment follows table
  speed; an explicit value is in seconds and does **not** scale with speed.
  Prefer the default. Remaining time is capped; adding time on a full clock
  has no benefit; beginners' extra time is doubled without doubling the cap.
- Rule-based elimination: call `$this->eliminatePlayer($playerId)` in `Game`
  only when the rules eliminate a player, and ensure they are no longer
  active at the end of the action. If this eliminates the last player,
  finish end scoring and transition to game end in the same action, otherwise
  the framework jumps directly to the final state. (Separate from a player
  leaving, which normally **neutralises** results; games whose rules stay
  fair with a zombie can request "Keep ranking on player quit" from Studio
  Support.)
- `onConcede($concederTeam)` (optional, on `Game`): conceding player's ID is
  `$concederTeam->players[0]->id`. **Do not change game state in this
  callback**; exceptions are logged, not propagated — keep it small.

Deep Dive: uses `getPlayerNameById`, `getActivePlayerId` (in `NextPlayer`),
`activeNextPlayer`, `loadPlayersBasicInfos` (in `updatePlayerScores`),
`giveExtraTime($activePlayerId)` in `NextPlayer` ✓. No elimination or
concede handling (not needed by the rules).

---

## 7. ItemManager vs Deck vs raw SQL

### 7.1 Deck — deprecated

`$this->bga->deckFactory->createDeck(string $tableName): Deck` returns a
`Deck` for a named DB table; **define its DB table in your database model**,
create it after `parent::__construct()`, declare a `Deck` property on `Game`,
populate in `setupNewGame`. **Do not use for new projects — use ItemManager.**
The libs page keeps Deck documentation only for old projects.

### 7.2 ItemManager — the current component

PHP component for typed, persistent game objects (cards, tiles, dice,
tokens). One ItemManager manages **one PHP item class and one DB table**,
auto-creates the table, and returns **instances of your item class, not
associative arrays**. Multi-item methods return a `Collection` keyed by item
ID (use `->values()` for a plain list before sending to the client).
Example game: Hearts.

**Item class** (`Bga\GameFramework\Components\ItemManager\Item`,
`ItemField`, `ItemFieldKind`):

```php
#[Item]                                   // table name; default = short class name
class Card {
    #[ItemField(kind: ItemFieldKind::ID)]
    public int $id;                        // auto-generated integer
    #[ItemField(kind: ItemFieldKind::LOCATION, locationIndex: 0)]
    public string $location;
    #[ItemField(kind: ItemFieldKind::LOCATION, locationIndex: 1)]
    public int|string|null $locationArg;   // nullable after the first part
    #[ItemField(kind: ItemFieldKind::ORDER)]
    public int $order;                     // zero-based position in its exact location
    #[ItemField]
    public int $suit;                      // custom field
    public string $displayName;            // no attribute = not stored
}
```

- **ID, LOCATION and ORDER are mandatory.** Location indexes start at 0 and
  are consecutive. First location field must be non-null `string`/`int`/
  `string|int`; later ones must be nullable. ID and ORDER must be non-null
  integers. Field names are yours; the `kind` assigns the roles.
- Custom fields: any typed public property with `#[ItemField]`. Storage type
  is inferred: `bool`/`int`/`float`/`string` → scalar columns; backed enums
  → scalar matching the backing type; arrays/other objects/interfaces → JSON
  (reconstructed as the declared PHP class on read); nullable → `NULL`.
  `serialize: true` only when PHP serialisation is specifically required.
- `#[ItemField( ?ItemFieldKind $kind = null, ?string $type = null, ?string $dbField = null, bool $serialize = false, int $locationIndex = 0 )]` —
  `$type` normally inferred (`bool`, `int`, `float`, `double`, `string`,
  `json`); `$dbField` when the PHP name differs from an existing DB column
  (key for Deck migration: `card_id`, `card_location`, `card_location_arg`,
  `card_type`, `card_type_arg`).
- `#[Item( ?string $tableName = null )]` — a table name may belong to only
  one managed class during a request.

**Locations** — must be registered before use:

```php
$locations = [ new ItemLocation('deck'), new ItemLocation('discard'),
               new ItemLocation('table'), new ItemLocation('hand') ];
```

- `new ItemLocation(string|int $name, bool $randomPick = false, string|int|ItemLocation|null $autoReshuffleFrom = null, ?callable $autoReshuffleCallback = null)` —
  `$randomPick` shuffles that location before each pick (a bag);
  `$autoReshuffleFrom` moves+shuffles another location in when a pick finds
  too few items; `$autoReshuffleCallback` runs after an automatic reshuffle.
- `ItemLocation::getDefaults(bool $reshuffleDiscardToDeck = true)` —
  `deck`, `discard`, `table`, `hand`; by default picking from an
  insufficient deck automatically moves the discard pile in and shuffles.
- Three equivalent location forms: `'deck'`, `['hand', $playerNo]`,
  `Location::from('hand', $playerNo)` (also `Location::from(['hand', $playerNo])`).
  For two LOCATION fields, `'deck'` is complete (second part `null`) while
  `['hand', $playerNo]` is one player's hand.
- Read filters: omitted trailing parts are unconstrained; a `null` in a
  non-trailing part is also a wildcard; arrays mean "any of these":
  `getItemsInLocation('hand')` (every hand),
  `getItemsInLocation(Location::filter('hand', [12, 34]))`,
  `getItemsInLocation(Location::filter([['deck', 'discard']]))`.
  **Filters are read-only — moving/picking always needs a concrete location.**
- Prefix wildcard locations: an `ItemLocation` name ending in `*` or `%`
  (e.g. `'played*'`) accepts `'played1'`, `'played2'`, … Prefer separate
  location fields when the suffix is structured data such as a player ID.

**Creating a manager** (in `Game` or a dedicated domain manager — a
dedicated manager keeps item rules, queries and notifications together):

```php
$this->items = $game->bga->itemManagerFactory->createItemManager(
    Card::class, locations: ItemLocation::getDefaults());
```

`createItemManager(string $className, ?callable $classNameResolver = null,
array $locations = [], ?callable $dbUpdateCallback = null,
?callable $countChangeCallback = null)` — `$classNameResolver` receives a DB
row (or `null`) and returns the class to instantiate (must extend the managed
base class; `null` = base class) for per-type behaviour in subclasses.
Callbacks: `dbUpdateCallback(string $tableName, array $linesByItemId,
string $operation)` with `$operation` `'INSERT'`/`'UPDATE'`;
`countChangeCallback(string $tableName, array $changesByLocation)` (each
change: `location` parts + new `count`). Prefer the factory over
`new ItemManager(...)` (the factory also registers locations).
`initDb()` creates the table — call at the start of `setupNewGame`, before
`createItems()` or any query. **Do NOT also declare the generated table in
`dbmodel.sql`.** `addLocation()` / `addLocations()` register more
(duplicate names and unknown `autoReshuffleFrom` references throw);
`getLocationByName()` returns the matching registered location (incl. prefix
wildcard) or `null`.

**Creating items:** `createItems(array $itemsTypes)` — rows keyed by PHP
property names; location is mandatory; `item_nbr` key creates multiple
copies (default 1). Unknown properties, invalid locations and negative
`item_nbr` throw. **Input rows are randomised before insertion, so creation
order must not be used to infer hidden item types.** Returns no IDs — query
afterwards if needed. ORDER is assigned at the end of each location unless
explicitly supplied.

**Picking:** `pickItem($from, $to)` — top item from one concrete location to
the end (top) of another, returns the updated item or `null`;
`pickItems(int $number, $from, $to)` — up to `$number`, returns a Collection
keyed by ID (fewer when the source is exhausted). `randomPick` locations are
shuffled first; `autoReshuffleFrom` picks the remaining source items, moves
the configured location in and shuffles, then continues.

**Moving / ordering:** within a location, lower ORDER is the beginning, the
highest ORDER is the top; moves reindex affected locations to consecutive
values starting at 0.
- `moveAllItemsInLocation($from, $to)` — every item, preserving relative
  order; `null` `$from` gathers all managed items.
- `setItemOrder(object|int $itemOrItemId, int $order)` — move within its
  current location; position clamped to bounds.
- `moveItem(object|int $itemOrItemId, $to, ?int $order = null)` — append by
  default; `$order` inserts before the item at that position, `0` prepends.
  When given an object, its LOCATION/ORDER properties are updated to the
  persisted values.
- `moveItems(array|Collection $itemsOrItemIds, $to, bool $prepend = false)` —
  one ordered block, relative order retained; duplicates moved once.
- `getMaxOrderInLocation($location)` — highest ORDER in a concrete location
  (0 when none); supply every sub-location part for one sub-location.

**Reading:** all multi-item methods return an ID-keyed `Collection` of typed
objects.
- `getItemById(int $id)` — item or `null`.
- `getItemsByIds(array $ids, ?string $sortByField = null, bool $reversed = false)`
- `getItemsByFieldName(string $fieldName, mixed $values, ?int $limit = null, ?string $sortByField = null, bool $reversed = false)` — `$values` may be an array (any-of); empty values → empty Collection.
- `getItemsByFieldNames(array $filters, ...)` — AND-combined named filters,
  associative or tuple form (`['type' => [3,4], 'location' => 'hand']` or
  `[['type', [3,4]], ...]`); empty filter list returns all items.
- `getItemsByField(ItemField $field, ...)` / `getItemsByFields(...)` —
  ItemField-object variants; prefer the field-name methods in game code.
- `countItemsInLocation($location)` / `getItemsInLocation($location, bool $reversed = false, ?int $limit = null, ?string $sortByField = null)` — default ORDER ascending; `reversed` for descending, `sortByField` for another managed property.
- `getAllItems(?int $limit = null)` — no ordering guaranteed.
- `getItemOnTop($location)` — highest ORDER, or `null`;
  `getItemsOnTop(int $number, $location)` — up to N, top downward.

**Updating:** changing a PHP object does **not** change the DB.
`updateItem(object $item, array|string|null $fields = null)` — `null` updates
every persisted property except ID; `updateItems(...)` for several;
`updateAllItems(string $fieldName, mixed $value)` — one property for every
item (ID cannot be updated this way). `getItemFromDb(?array $dbItem)` —
converts a raw DB row to a typed item (`null` for null/empty row; the
class-name resolver selects the concrete class).

**Shuffle / hiding IDs:** `shuffle($location)` — randomises ORDER of items
matching concrete location parts; does not change IDs or locations.
`changeIds(array|Collection $itemsOrItemIds)` — changes IDs, returns
old→new map (supplied objects get their ID updated); useful when previously
visible items become hidden again so players cannot track them by ID.
`changeIdsForLocation($location)` — same for a whole location, no map returned.

**DB upgrades:** `upgradeTableDbAddColumns(array $fieldNames)` — adds columns
for newly `#[ItemField]`-marked properties; call from `upgradeTableDb()`
with PHP property names (existing columns skipped; data migrations still
need explicit queries).

**Migrating from Deck:** specify `dbField` for all five pre-existing
columns, remove the table creation from `dbmodel.sql` (ItemManager creates
it), and add the `order` column, e.g.
`ALTER TABLE DBPREFIX_card ADD order INT DEFAULT 0, MODIFY card_location_arg INT NULL`
via `applyDbUpgradeToAllDB`, then backfill `order` from `card_location_arg`
for deck rows and null the arg. Note the typing change: Deck returned
strings for numeric columns; ItemManager objects return proper types.

### 7.3 Deep Dive's current position — raw SQL, not ItemManager ⚠️

> **Update (Nov 19, 2026): this section is now historical — the migration
> described below was done.** `modules/php/OceanTile.php` +
> `modules/php/OceanTileManager.php` implement the ItemManager model
> (`ocean_tile` auto-created by `initDb()`, no `trapped_penguin` table,
> trapped Penguins via `trappedPlayerId`). The rest of this section is
> kept as the record of what the migration changed.

Deep Dive defines two tables in `dbmodel.sql` (`ocean_tile`,
`trapped_penguin`) and accesses them with raw SQL from `Game.php` and all
eight state classes (`DbQuery`, `getCollectionFromDb`,
`getUniqueValueFromDB`, `getObjectFromDB`). It uses **neither** ItemManager
nor Deck. The implementation plan (§"Tile Persistence") already chose
ItemManager (`OceanTile` `#[Item]` with `depth`, `tileCategory`,
`foodColor`, `points`, `isExtra`, `isFaceup`, `trappedPlayerId`, `rowIndex`;
locations `ocean` / `box` / `tableau` / `rock` / `ai_tableau`) — the code
does not implement that plan.

What a migration would buy here, concretely:
- `OceanTile` as a typed object instead of associative arrays with string
  keys (`tile_id`, `food_color`, …) — the plan's fields map almost 1:1 onto
  `#[ItemField]`s, with `location` + `locationArg` (depth / player id)
  replacing the current `location` + `depth` + `owner_id` columns, and
  `order` replacing `tile_order`.
- No hand-written setup/removal SQL: `createItems()` + `shuffle('ocean')`
  per depth, `countItemsInLocation()`, `getItemsInLocation()` with
  `Location::filter`, `pickItems()` for dealing — replacing the
  `shuffle($ids)` + `array_slice` removal loop and the per-depth
  `tile_order` UPDATE loop in `generateOceanTiles()`.
- `moveItem()` / `updateItem()` replacing the `UPDATE ocean_tile SET
  location=...` statements in `collectTileForPlayer()`, `actFlipTile()`,
  and the retreat flow; `trapped_penguin` (a separate table + manual
  insert/count/delete in `Game::trapPenguin` / `freeTrappedPenguins` /
  `getTrappedPenguins`) could become a location/field on the predator tile
  itself (`trappedPlayerId`), as the plan describes.
- `initDb()` auto-creates the table — `dbmodel.sql` would lose the
  `ocean_tile` definition (keep `trapped_penguin` only if it survives as a
  table, which it need not).
- Caveats: this is a real refactor, not a rename — every SQL call site in
  `Game.php` and the state classes changes, `getAllDatas()` serialisation
  must keep anonymising facedown tiles, and `upgradeTableDb()` would be
  needed if any table already exists in production. Do it as a deliberate
  step (the `modernize-bga-game-project` skill does not cover an
  ItemManager migration; it would be hand work), not as drive-by cleanup.
  Until then, the raw-SQL code is functional — it is a maintainability /
  framework-idiom gap, not a correctness bug.

Also note the DB-model page's rules Deep Dive currently bends:
- "Create a Manager class for each table. Only this class should execute SQL
  for that table." — Deep Dive has no manager class; SQL for `ocean_tile`
  is spread across `Game.php` and `AiTurn`, `PlayerDiveStep`,
  `RetreatPickTile`, `SoloChooseTiebreak`, `EndScore`. Even without
  ItemManager, a single `OceanTileManager` (or `TileManager`) class owning
  all `ocean_tile` / `trapped_penguin` queries would satisfy the rule and is
  a smaller step than full ItemManager migration.
- "Store only dynamic data in the DB; static data in PHP files" ✓ (tile
  definitions are PHP arrays in `generateOceanTiles`).
- "Do not store translatable strings in the DB" ✓ (only codes/ints).
- Default tables (`player`, `global`, `stats`, `gamelog`, `bga_*`): **must
  not modify their schemas; do not query them directly** — use the framework
  APIs. Deep Dive reads `player` via `getCollectionFromDb("SELECT ...
  FROM player")` in `getAllDatas()` — the framework's own template does the
  same for the `players` structure, but prefer `loadPlayersBasicInfos()` /
  the documented `playerScore`/`fillResult` paths where they cover the need.

---

## 8. Scores, counters, statistics

### 8.1 `playerScore` / `playerScoreAux` — `$this->bga->playerScore` (+`Aux`)

Built-in `PlayerCounter`s for `player.player_score` /
`player.player_score_aux`. Start at 0, no min/max, use player IDs by
default. **Do not create another counter named `player_score` /
`player_score_aux`. Do not update those DB fields manually.**

| Method | Behaviour |
|---|---|
| `get(int $playerIdOrNo): int` | Current value. |
| `set(int $playerIdOrNo, int $value, ?NotificationMessage $message = new NotificationMessage()): int` | Set, return new value. |
| `inc(int $playerIdOrNo, int $inc, ?NotificationMessage $message = new NotificationMessage()): int` | Add signed amount, return new score. |
| `setAll(int $value, ?NotificationMessage $message = new NotificationMessage()): int` | Set every player's score. |
| `getMin(): int` / `getMax(): int` / `getAll(): array` | Lowest / highest / all values (keyed by ID, or by number with `useNo`). |
| `fillResult(array &$result, ?string $fieldName = null, ?int $currentPlayerId = null)` | Write values into each `$result["players"]` entry for `getAllDatas`. |

- Default message updates front-end score counters with no log text. Pass a
  `NotificationMessage` for a log entry, or `null` to suppress notifications
  entirely. `inc` of 0 sends no notification.
- Player-number mode: `$this->bga->playerScore->setUseNo(true);` in the
  `Game` constructor (after `parent::__construct()`). Built-in counters use
  player IDs by default; Deep Dive passes IDs ✓.
- Visibility: `setVisibility(CounterVisibility::HIDDEN)` or a zero-arg
  callback returning a `CounterVisibility` (evaluated on each check, not
  cached — keep it side-effect free). Changing visibility sends no
  notification. `fillResult` / `set` / `inc` notifications respect it;
  **`setAll` notifications always include the value publicly** — for
  `SELF`/`HIDDEN` counters pass `null` as the message or use individual
  `set` calls.
- Include `score` in each player's `getAllDatas` data so score counters
  restore on reload ✓ (Deep Dive does this).
- Final ranking: higher main score ranks first; equal main scores compare
  `playerScoreAux`; equal on both = tie. Describe the aux rule in
  gameinfos `tie_breaker_description` (one line — it is also included in
  generated JS, so newlines can break game loading). For several ordered
  tie breakers, combine them into one integer and set
  `tie_breaker_split` (e.g. `10000 * money + 100 * buildings + cards`,
  split `[10000, 100, 1]`; each component must stay below its multiplier).
- Reverse scoring (lowest wins): return a `GameResult` from the final
  state — `GameResult::individualRanking(reverseScore: true)` (and/or
  `reverseScoreAux: true`). Reads scores from the player table. Migrating
  running tables that stored negative scores to simulate reverse scoring:
  preserve the sign convention until they finish; supply explicit result
  players with converted scores (`Player::fromPlayersDb($rows)`).
- Cooperative: `"is_coop": 1` in gameinfos; default convention shared
  positive score = win, zero or below = loss; otherwise return an explicit
  result: `GameResult::coop(score: $teamScore, win: $teamScore >= 12)`.
- Solo: `GameResult::solo(score: $playerScore, win: $playerScore > $automatonScore)`.
- Winners/losers without ranked losers: give every winner the same higher
  score and every loser the same lower score + `losers_not_ranked` in
  gameinfos. Do not use it for full cooperation or two-player games.
- Leaving normally neutralises results; elimination is separate
  (`eliminatePlayer`, §6).

Deep Dive ✓: `updatePlayerScores()` sets `playerScore` (total) and
`playerScoreAux` (completed sets) for every player after each food
collection, and `EndScore` re-syncs them; `tie_breaker_description` is
"Most completed rows" (one line) ✓. ⚠️ Solo mode: the AI opponent is a
pseudo-player (`AiTurn::AI_PLAYER_ID = 9999`) whose score is computed in
`EndScore` and sent only as an `aiFinalScore` notification — no
`GameResult::solo(...)` is returned (the final state returns the int
`ST_END_GAME`). For a 1-player table the framework ranking is just the
human; if a win/loss vs the AI is ever wanted, that is the place to return
`GameResult::solo(score: $humanScore, win: $humanScore > $aiTotalScore)`.
Check whether the AI's `9999` id ever leaks into `playerScore`/`playerStats`
calls — `computePlayerScore(9999)` reads tiles by `owner_id` only, which is
safe, but `playerScore->set(9999, ...)` must never be called (it is not,
today).

### 8.2 Counters — `counterFactory` + `TableCounter` / `PlayerCounter`

Create in the `Game` constructor (after `parent::__construct()`), declare
the property on `Game`, call `initDb` in `setupNewGame` before use.

- `createTableCounter(string $name, ?int $min = 0, ?int $max = null): TableCounter`
  — one value for the whole table (e.g. round, remaining tokens). No
  visibility / `useNo` / strict concepts.
- `createPlayerCounter(string $name, ?int $min = 0, ?int $max = null, CounterVisibility|callable $visibility = CounterVisibility::VISIBLE, bool $useNo = false, ?bool $strict = null): PlayerCounter`
  — distinct value per player (e.g. money, energy).
- Both default `min = 0`, no max; set a bound to `null` to remove it. Names
  unique **within each counter type**.
- `CounterVisibility`: `VISIBLE` (default), `SELF` (each player sees only
  their own; others see `"-"`), `HIDDEN` (nobody sees; `"-"`). Import
  `Bga\GameFramework\Components\Counters\CounterVisibility`. A callable
  visibility is stored without being called and evaluated on each check.
- `useNo: true` → pass player **numbers** to `initDb`/`get`/`set`/`inc`;
  otherwise player IDs. When `strict` is omitted it is **enabled for player
  numbers, disabled for player IDs**. Strict mode rejects players not at the
  table.
- `TableCounter`: `initDb(int $initialValue = 0)` (creates `bga_table_counters`),
  `get(): int`, `set(int $value, ?NotificationMessage $message): int`,
  `inc(int $inc, ?NotificationMessage $message): int`,
  `fillResult(array &$result, ?string $fieldName = null)`.
- `PlayerCounter`: `initDb(array $playerIdsOrNos, int $initialValue = 0)`
  (creates `bga_player_counters`; with `useNo` supply player numbers —
  convert via `getPlayerNoById`; a game with an automaton may also need its
  ID), `get(int $playerIdOrNo): int` (throws `UnknownPlayerException` if not
  initialised), `set(...)` / `inc(...)` (throw `OutOfRangeCounterException`
  outside min/max, `UnknownPlayerException` if not initialised),
  `getAll(): array`, `setAll(int $value, ?NotificationMessage $message): int`,
  `fillResult(array &$result, ?string $fieldName = null, ?int $currentPlayerId = null)`
  (pass the viewing player's ID when visibility can resolve to `SELF`),
  `setVisibility(...)`, `isVisible(): bool` / `isHidden(): bool` / `isSelf(): bool`,
  `setUseNo(bool)`, `setStrict(bool)`.
- Notifications: `set`/`inc` send `setPlayerCounter` / `setTableCounter`
  (auto-supplied args: `name`, `value`, `oldValue`, `inc`, `absInc`, plus
  `playerId` — **even when the counter uses player numbers** — and
  `player_name` for player counters). `setAll` sends
  `setPlayerCounterAll`. Message semantics: empty = no log; `null` = no
  notification at all. Front-end `ebg.counter` updates automatically; listen
  with `notif_setPlayerCounter` / `notif_setTableCounter` /
  `notif_setPlayerCounterAll` as needed.

Deep Dive does not define custom counters — it uses only the built-in score
counters. If a live "remaining facedown tiles" or "rocks held" counter is
ever wanted on the client, this is the mechanism (a `TableCounter` for
facedown count, or a `PlayerCounter` for rocks/penguins), rather than
hand-rolled notifications.

### 8.3 Statistics — `stats.jsonc`, `$this->bga->tableStats` / `playerStats`

Declare in `stats.jsonc` (`table` and/or `player` sections). Each entry:
key = internal name, `id`, `name` (label, auto-added to translations),
`type` (`int` | `float` | `bool`).

- **IDs must be 10 or greater** (below 10 reserved). The ID is the reference
  used by the BGA website — changing it loses all historical data for that
  stat. **Never reuse the ID of a deleted statistic.** After editing, click
  **Reload statistics configuration** on the Manage game page (a bad JSON
  shows an error there).
- Initialise in `setupNewGame` (after the player table is populated).
  Initialise variant-only stats **only when that variant is active**.
  **Uninitialised stats display as `-`; initialising to `0` records a real
  zero** and includes it in averages — a meaningful distinction.
- Compute end-of-game statistics in the `EndScore` state.
- `value_labels`: display a label instead of a number (array indexed by the
  stored int; applies to table and player stats **with the same ID** — use
  the same ID only when labels make sense for both). `"display": "limited"`
  restricts a stat to developers/publishers/admins.
- `tableStats`: `init(string|array $nameOrNames, int|float|bool $value): void`,
  `get(string $name)`, `set(string $name, int|float|bool $value): void`,
  `inc(string $name, int|float $delta): void` (booleans cannot be incremented).
- `playerStats`: `init(string|array $nameOrNames, int|float|bool $value, bool $updateTableStat = false): void`,
  `get(string $name, int $playerIdOrNo)`, `getAll(string $name): array`,
  `set(string $name, int|float|bool $value, int $playerIdOrNo): void`,
  `setAll(string $name, int|float|bool $value): void`,
  `inc(string $name, int|float $delta, int $playerIdOrNo, bool $updateTableStat = false): void`,
  `incAll(string $name, int|float $delta): void`,
  `setUseNo(bool $useNo): void` (configure in the constructor if the game
  uses player numbers; player args are IDs by default).
  With `$updateTableStat = true`, `init`/`inc` also maintain a table stat
  with the same name. `set`/`setAll`/`incAll` do **not** update a matching
  table stat automatically.
- Modern `set`/`inc` take the **name first**, then value/delta, then player
  — the opposite order from legacy `setStat`/`incStat`/`initStat`/`getStat`,
  which these replace.

Deep Dive ✓: `stats.jsonc` uses IDs 10–17, all `int`; `setupNewGame`
inits `turns_number` + `game_end_depth` (table) and 8 player stats;
`NextPlayer` incs `turns_number` (table + player, but as two separate calls
rather than `updateTableStat: true` — equivalent, just verbose);
`StartTurn` / `PlayerDiveStep` / `RetreatPickTile` inc the rest.
`dives_taken` is inc'd in `StartTurn` ✓. Note `game_end_depth` is set from
both `AiTurn` and `PlayerDiveStep` ✓. Nothing here needs changing; the
`updateTableStat` shorthand is optional.

---

## 9. Configuration files — gameinfos / gameoptions / gamepreferences

Reload buttons on the Manage game page (a JSON error shows there):
`gameinfos.jsonc` → **Reload game informations**;
`stats.jsonc` → **Reload statistics configuration**;
`gameoptions.json` / `gamepreferences.json` → **Reload game options
configuration**.

### 9.1 `gameinfos.jsonc`

- Publisher: special BGG IDs — public domain `171`, self-published `4`,
  prototype/looking for publisher `772` (URL may be empty for these).
- Time profiles: leave defaults; from beta an automatic process adjusts them
  to actual durations, after which file changes have no effect.
- `suggest_player_number` (single count or `null`) /
  `not_recommend_player_number` (array or `null`): use `null` unless a count
  is clearly better/worse. Suggested count caps the Elo K-factor multiplier
  at that count. **Automatic lobby tries the lowest supported count first
  if no suggestion is set** — if that count is incompatible with default
  options, set a suggested count that works with them (e.g. a solo mode
  requiring training mode must not become the default).
- `player_colors`: hex without `#`; provide more colours than max players if
  you like, but the game must support every colour listed.
- `losers_not_ranked`: results show Winner / Loser; give all winners the
  same score and all losers `0`. **Do not use** for two-player games,
  cooperative games, or frequent perfect ties.
- `disable_player_order_swap_on_rematch` (default `false`): `true` uses
  random order instead of rotation on rematch.
- `tie_breaker_description`: one line (see §8.1).
- `language_dependency`: `false`/omitted = none; `true` = common language
  required; a map restricts to listed languages.
- `coop_elo_mode`: normally not recommended; reference values 1300–2500 per
  difficulty/player count (forms: `points_references` by options+win/loss,
  or by score). JSON keys (option IDs, scores) must be quoted strings.
- Team games (Tichu/Spades/Belote): teammates gain/lose no Elo vs each
  other ("Teammate: -100%") — enable via a BGA administrator. Do not apply
  to cooperative games or ≥3-sided modes.
- `db_undo_support: true` enables DB savepoints for undo (see §10).
  Adding it to a released game enables savepoint tables only for newly
  created games.

Deep Dive ✓: publisher Flatout Games / BGG 42733, game BGG 376747;
`players: [1..6]`, `suggest_player_number: 4`; `tie_breaker_description`
"Most completed rows"; `losers_not_ranked: false`;
`solo_mode_ranked: false` (solo exists alongside multiplayer — correct);
`is_coop: 0`; `favorite_colors_support: true`;
`game_interface_width.min: 740`; `exception_on_warning: true`.
No `db_undo_support` — consistent with the plan (no undo after hidden
reveals).

### 9.2 `gameoptions.jsonc` — table options

- IDs **100–199**, need not be consecutive. **Never change an option ID in
  production; never reuse a deleted option's ID.** Preference IDs are an
  independent namespace (preference 100 ≠ option 100).
- `level`: `base` (default), `major` (exactly one major option per game,
  must significantly affect gameplay; values get a carousel; give values
  concise descriptive names, not "Enabled"/"Disabled"), `additional`
  (hidden by default).
- Per value: `id` (use 0/1 for booleans), `name`, `description`,
  `tmdisplay` (lobby text; for an On/Off variant usually the variant name
  when enabled, empty when disabled), `nobeginner`, `firstgameonly`,
  `beta`, `alpha` (warning + training mode only), `premium`.
- `default`: the base-game value (do not enable expansions by default).
- `displaycondition`: hides the option unless conditions hold;
  `displayconditionoperand`: `and` (default) / `or`. Types: `minplayers`
  (single value, or array of valid counts for non-consecutive counts),
  `maxplayers`, `otheroption`, `otheroptionisnot`.
- `startcondition`: per-value conditions checked before the game starts;
  **all** must be true or players see a red error (a condition may carry a
  `message`). `minplayers` arrays are **not** supported here.
  Use `displaycondition` to hide an option, `startcondition` when a
  combination is invalid but the options should still be displayed.
- `notdisplayedmessage`: text shown in place of the dropdown when
  `displaycondition` hides the option.
- Checkbox display: exactly two values whose names form `yes`/`no`,
  `on`/`off`, or `enabled`/`disabled` (case-insensitive) — still specify a
  `default`.

Deep Dive: one option, `100` "Solo AI Difficulty" (Easy 0 / Medium 1 /
Hard 2, default 1). ⚠️ It is read in `setupNewGame` from the `$options`
parameter (`(int) ($options[100] ?? 1)`). The documented back-end API is
`$this->bga->tableOptions->get(100)` (returns `?int`, `null` when the option
does not exist, e.g. at a table created before the option was introduced —
so `?? 1` fallback is still the right pattern). Reading it via
`tableOptions` later in the game (e.g. in `EndScore`, which currently reads
the `soloDifficulty` global) would be more idiomatic and avoids the
redundant global; either works, but do not mix the two sources.

### 9.3 `gamepreferences.jsonc` — user preferences

Per-player interface customisation; **no effect on the table as a whole**.
Appear in the hamburger menu ("Display game logs" and "Display tooltips"
are included by default). Good for accessibility (e.g. colourblind support).
**Limit the number** — add one only if it significantly improves the
interface for many users. Same ID rules as options (100–199, never change /
reuse). Per value only `id` + `name` are documented (no
`description`/`tmdisplay`/`nobeginner`/`beta`/`premium`).
`needReload` (default `false`): reload the interface when the preference
changes — **avoid reloading**; prefer updating the interface in response.
`default`: the value suiting most players.

Deep Dive: `gamepreferences.jsonc` is effectively empty (`{}`, only a
commented colourblind example). Fine as-is; a colourblind preference is the
obvious candidate if one is ever added (food colours pink/green/yellow are
the game's main colour coding).

### 9.4 `tableOptions` / `userPreferences` / `tournament` / `legacy` services

- `tableOptions->get(int $optionId): ?int` — 100–199; `null` if absent.
  `set(int $optionId, int $value): void` — after resolving a random option
  to a concrete value (invalid ID/value throws).
  `isTurnBased(): bool`, `isRealTime(): bool`, `getGameVersion(): int`,
  `getGameLanguage(): ?int` (language index from gameinfos, or `null`).
  **Do not read framework numeric globals as options**: `200` →
  `isTurnBased`/`isRealTime`, `207` → `getGameLanguage`, `300` →
  `getGameVersion`.
- `userPreferences->get(int $playerId, int $prefId): ?int` — cached value or
  `null`. Player argument is an **ID**. Use the front-end preferences API
  to change preferences / respond to changes, not this back-end API.
- `tournament->isTournament(): bool`; `getInfo(): array` (or `[]` outside a
  tournament; fields `id`, `name`, `championship_name`, `oot_options`,
  `tournament_group`, `tournament_parent_id`, `avatar`);
  `getSeedInfo(): array` (or `[]`; `tournament_seed` shared by all
  encounters, `step_seed` by one step, `parent_tournament_seed` by the
  parent tournament — the API returns the seed, it does **not** seed your
  RNG automatically). `storePlayerGameData(int $playerId, string $key,
  mixed $data)` / `retrievePlayerGameData(...)` / `removePlayerGameData(...)`
  — JSON, cumulative limit **64 KiB (65,535 bytes) per player + tournament**;
  keys 1–16 ASCII letters/digits (`%` wildcard for retrieve/remove
  patterns); guard reads/writes with `isTournament()` (they fail outside a
  tournament). Data belongs to the current tournament ID. Use `legacy` for
  campaign progress that must survive the tournament.
- `legacy->get(string $key, int $playerId, mixed $defaultValue = null)` /
  `set(string $key, int $playerId, mixed $value, int $ttl = 365)` /
  `delete(string $key, int $playerId)` — player data across tables; player
  ID `0` = shared by all tables of the game. `getTeam(...)` / `setTeam(...)`
  / `deleteTeam()` — team data. Limit **64 KiB per key/player/game** and
  **64 KiB per team/game**; TTL in days, max 365. **Only write at the end
  of the game, during its last action** (reduces conflicts between
  simultaneous tables); never use `set`/`setTeam` during setup. Handle a
  size failure so it cannot prevent the game ending (catch `feException`,
  code `FEX_legacy_size_exceeded`, keep only essential progress, do not
  retry the same value). Read sparingly — ideally once per player/team per
  game. Deep Dive uses none of these (correct — no tournament or campaign
  features).

---

## 10. Undo, logs, and DB savepoints

- Undo policy: follow the BGA Undo policy when deciding which decisions may
  be undone. Enable with `"db_undo_support": true` in `gameinfos.jsonc`.
- `undoSavepoint()` — request one DB snapshot. **It only sets a flag; the
  snapshot is taken when the action's notifications are flushed**, not at
  the calling line — account for subsequent state transitions.
  **Multiactive states are not supported**, including a `GAME` state that
  continues into multiactive play before saving.
- `undoRestorePoint()` — restore that snapshot. The active player must match
  the one the snapshot was saved for. After restoration, transition
  immediately **or** call `gamestate->reloadState()` before reading cached
  state values.
- Logs API (`$this->bga->logs`) — for a game-specific undo and removal of
  reverted log entries: `getCurrentMoveId(): int` (save it alongside the
  data needed to undo); `remove(int $startMoveId): void` (deletes logs for
  that move **and all later moves**; framework sends `bgaRemoveLogs` and
  suppresses DB recording of subsequent notifications in that request).
  **Restore the game data first** — removing logs alone undoes nothing.
  Make `remove` the **final explicit logging operation** of the undo; send
  the interface-restoring notifications **before** it, and only return to
  the restored decision point afterwards.

Deep Dive: no undo support anywhere (no `db_undo_support`, no
`undoSavepoint`/`undoRestorePoint`, no logs API use). That matches the
implementation plan — flipping a facedown tile reveals hidden information,
so undo after flips is deliberately not offered. Nothing to change.

---

## 11. Debugging and PHP unit testing

### 11.1 Debug — `$this->bga->debug`

- `playUntil(callable $fn)` — checks the callback before each iteration
  (starting count 0); while it returns `false`, increments the count and
  runs the zombie method for each active player. An iteration may advance
  several players — **not necessarily one turn**; choose a condition that
  can become true even if the game stops advancing. Requires working
  `zombie` methods (§3.6).
- `Bga\GameFramework\Table::getBgaEnvironment()` returns `studio` or `prod`
  for environment-specific hooks.
- Custom debug functions: methods in `modules/php/Game.php` named
  `debug_*`. BGA detects them and their parameters automatically; functions
  **with parameters appear with `...`** in the Studio debug menu and open a
  dialog; parameterless ones run immediately. `#[Debug(reload: true)]`
  (`Bga\GameFramework\Actions\Debug`) reloads the interface after the
  function runs. Examples: `debug_setCardType(int $id, int $type, int
  $typeArg = 0)` (UPDATE the DB row), `debug_goToState(int $state)` via
  `gamestate->jumpToState($state)`, `debug_playToFiftyPercent()` /
  `debug_playToEndRound()` / `debug_playUntilTurnOf(int $playerId)` /
  `debug_playUntilMyTurn()` via `playUntil(...)`, `debug_testUpgradeTableDb(int
  $version = 0)` calling `upgradeTableDb($version)`.

Deep Dive has **no `debug_*` methods** — a gap worth closing during
cleanup: even `debug_playUntilMyTurn`-style helpers and a
`debug_goToState` would speed up Studio testing considerably, and they cost
a few lines each. (They only run in Studio; they are not shipped behaviour.)

### 11.2 PHP unit testing

- Tests run small parts of the game's PHP **locally, without opening a
  Studio table**. Best for legal moves, scoring, special rules: give code a
  known position, check the result. Keep testing the complete game in Studio
  too (DB changes, state transitions, notifications, interface).
- Install: Composer + PHP on the command line; **PHPUnit 13 requires PHP
  8.4+**. From the game root: `composer require --dev phpunit/phpunit:^13`
  (installs into `vendor/`). `.gitignore`: `/vendor/`, `/.phpunit.cache/`.
  Commit `composer.json` + `composer.lock` + tests + config; exclude
  `vendor` (and `.*`) in `.vscode/sftp.json` `ignore`.
- `composer.json` autoload: `"autoload": {"psr-4": {"Bga\\Games\\MyGame\\":
  "modules/php/"}}`, then `composer dump-autoload`.
- `phpunit.xml.dist` in the game root: `bootstrap="tests/bootstrap.php"`,
  `colors="true"`, `cacheDirectory=".phpunit.cache"`,
  `failOnWarning="true"`, `failOnRisky="true"`, testsuite `<directory>tests</directory>`.
- Pattern (Reversi `BoardManager` example): test pure rule/scoring code
  that takes PHP values and returns a result — **no framework or DB
  needed**. Supply a small stub for framework types actually used (the
  example stubs `Bga\GameFramework\Helpers\Collection` with `find`/`add`/
  `merge`/`isEmpty`/`values` only), load it in `tests/bootstrap.php`
  **before** `vendor/autoload.php`. Skip the production constructor in a
  test subclass (anonymous class extending the manager, overriding only
  construction + data loading). ItemManager attributes on the item class
  need no substitutes (creating an item does not instantiate attributes).
- Run: `vendor/bin/phpunit`, `vendor/bin/phpunit tests/BoardManagerTest.php`,
  `vendor/bin/phpunit --filter testCapturesInSeveralDirections`. Optional
  npm shortcut: `"test:php": "vendor/bin/phpunit"` in `package.json`.
- For other framework-dependent code: replace data loading with a fixed
  position, keep move/scoring methods unchanged, initialise every property
  the tested calculation uses. When a class extends a framework class, PHP
  needs a declaration for its parent — add only declarations required, with
  compatible signatures; make unsupported operations **throw rather than
  return plausible empty results**. Use PHPUnit `createStub()` when a
  dependency only needs to return known values; use a **mock** when the
  interaction itself matters (e.g. checking a state gives extra time to the
  correct player).
- **Add a test whenever you fix a rule bug**: reproduce the position, check
  the test fails before the fix, keep it after. Useful cases: empty
  selection, board edge, tied scores, forced pass, game ending while spaces
  remain.

Deep Dive has **no `tests/` directory, no `composer.json`, no PHPUnit**.
The scoring code is the obvious first candidate: `Game::computePlayerScore()`
(set completion = full row sum, incomplete row = `floor(sum / 2)`) is pure
PHP over a tile list and is exactly the kind of function the docs' pattern
fits — extract the row-scoring from the DB query (or feed it a fixed tile
array) and test: complete vs incomplete rows, `floor` rounding on odd sums,
multiple rows, empty tableau. Same for the solo-AI difficulty scoring in
`EndScore` (Easy/Medium/Hard branches). This is the single highest-value
testing addition for the project.

---

## 12. Deep Dive — compliance checklist

| Area | Status |
|---|---|
| Namespaced `Game extends Table`, state classes, `#[PossibleAction]`, autowired `IntParam` | ✓ conforms |
| State IDs avoid reserved 1/99; `updateGameProgression: true` on ≥1 state; `descriptionMyTurn` on all ACTIVE_PLAYER states | ✓ conforms |
| `zombie()` on all 4 ACTIVE_PLAYER states; none on GAME states | ✓ present, ⚠️ level 0 — should use `getRandomZombieChoice()` / `getBestZombieChoice()` (§3.6) |
| Facedown tiles anonymised in `getAllDatas()` / `getArgs()`; no `_private` needed | ✓ conforms (good hidden-info practice) |
| `playerScore` / `playerScoreAux` via built-in counters; stats init + inc/set with name-first arg order; stat IDs ≥ 10 | ✓ conforms |
| `UserException` for illegal moves; `VisibleSystemException` for internal errors | ✓ conforms |
| `favorite_colors_support` + `reattributeColorsBasedOnPreferences` | ✓ conforms |
| `getGameProgression()` exists (note: hardcodes total 120 — recompute from actual setup counts when the tile model changes) | ✓ with note |
| Tile model: raw SQL `ocean_tile` / `trapped_penguin`, SQL spread across `Game.php` + 5 state files | ⚠️ biggest gap — ItemManager migration (§7.3) or at minimum a single `OceanTileManager` class |
| `shuffle()` on plain ID arrays in `generateOceanTiles()` | ⚠️ prefer `bga_rand`-based sampling / ItemManager `shuffle()` (§1.4) |
| `getCollectionFromDb` spelling (canonical: `getCollectionFromDB`) | ⚠️ cosmetic |
| `tile_desc` built with `sprintf(clienttranslate('%s Food (%d pts)'), ucfirst($color), ...)`; no `i18n` anywhere | ⚠️ minor translation nit (§1.6) |
| Solo difficulty read from `$options[100]` in setup + `soloDifficulty` global in `EndScore`; no `GameResult::solo()` | ⚠️ consider `tableOptions->get(100)` + `GameResult::solo()` (§8.1, §9.2) |
| No `debug_*` methods; no PHPUnit tests / `composer.json` | ⚠️ missing tooling (§11) |
| No undo support | ✓ deliberate (hidden reveals) |
| No multiactive/private states, no tournament/legacy use, empty `gamepreferences.jsonc` | ✓ n/a for this game |

## 13. Suggested order if the above is acted on

1. Zombie level 1–2 (one-line changes in 3 `zombie()` methods).
2. `debug_*` helpers + PHPUnit skeleton with `computePlayerScore` tests.
3. `bga_rand` sampling replacing `shuffle()` in tile setup; `getCollectionFromDB` spelling.
4. `tableOptions->get(100)` for solo difficulty; `GameResult::solo()` in `EndScore` if AI win/loss is wanted.
5. `i18n` / `tile_desc` translation tidy-up.
6. Tile-model refactor: single manager class first; full ItemManager migration as a separate, deliberate step (§7.3).
