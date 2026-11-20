# Framework Helpers Audit — Deep Dive vs. local BGA helper files

Date: 2026-11-19. Scope: read-only audit, no game code edited.
Method: `grep`/`sed` over the four helper files at the repo root, cross-checked
against `modules/php/Game.php`, `modules/php/States/*.php`, `src/ts/Game.ts`,
`src/ts/States/*.ts` (and `src/ts/types.d.ts`, `src/ts/libs.ts`).
Counts below are grep line-counts, not exact call counts; verify a line before
refactoring on the strength of it.

## 1. Helper files inventoried

| File | Size / lines | Contents |
| --- | --- | --- |
| `_ide_helper.php` | 147 KB, 4,012 lines | PHP framework declarations (reference only, not runtime) |
| `bga-framework.d.ts` | 60 KB, 1,718 lines | TS declarations for the `Bga` object, `GameGui`, `StatusBar`, `Players`, `Actions`, `Notifications`, `States`, `GameArea`, `PlayerPanels`, `Dialogs`, `Display3D`, `Counter`, legacy `Stock`/`Dojo` |
| `bga-cards.d.ts` | 1.7 KB, 47 lines | `BgaCards.Manager`, `CardStock`, `HandStock`, `LineStock`, `VoidStock`, `SlotStock`, `Deck` |
| `bga-animations.d.ts` | 281 B, 14 lines | `BgaAnimations.Manager` only (settings: `animationsActive`) |

Caveat: these are local copies with no version stamp in the file. The
`modernize-bga-game-project` skill says to refresh `_ide_helper.php` and
`bga-framework.d.ts` from Studio (right-click → Download File) before relying
on them for a migration. This audit is only as current as the copies in the repo.

## 2. PHP API inventory (`_ide_helper.php`)

### 2.1 Namespaces / top-level types

- `Bga\GameFramework\Actions`: attributes `CheckAction`, `Debug`.
- `Bga\GameFramework\Actions\Types`: param attributes `IntParam(?name, ?min, ?max)`,
  `BoolParam`, `FloatParam(?min, ?max)`, `IntArrayParam(?min, ?max)`,
  `StringParam(?alphanum, ?alphanum_dash, ?base64, ?enum)`, `JsonParam(?associative, ?alphanum, ?class)`.
- `Bga\GameFramework\States`: attribute `PossibleAction`; `abstract GameState`.
- `Bga\GameFramework`: `enum StateType` (`ACTIVE_PLAYER`, `MULTIPLE_ACTIVE_PLAYER`,
  `PRIVATE`, `GAME`, `MANAGER`); `GameStateBuilder` (legacy `states.inc.php` builder:
  `gameSetup()`, `endScore()`, `gameEnd()`, `name/type/description/descriptionMyTurn/
  action/args/possibleActions/transitions/updateGameProgression/initialPrivate/build()`);
  `abstract Bga` (service bag); `abstract Notify`; `abstract Logs`; `abstract Legacy`;
  `abstract Tournament`; `abstract TableOptions`; `abstract UserPreferences`;
  `abstract TableStats`; `abstract PlayerStats`; legacy `abstract GameState`
  (array-based state machine) + `abstract GamestateMachine`; `NotificationMessage`;
  `abstract Debug`; `abstract Table`; exceptions `UserException`, `SystemException`,
  `VisibleSystemException` (global aliases `BgaUserException`,
  `BgaVisibleSystemException`, `BgaSystemException` also exist in the global namespace).
- `Bga\GameFramework\Db`: `abstract Globals` (`get($name, $default, ?$class)`,
  `getAll(...$names)`, `has()`, `inc($name, $step)`, `set()`, `delete(...$names)`),
  `abstract Deck extends \Deck`.
- `Bga\GameFramework\Components\ItemManager`: `#[Item(?tableName)]`,
  `enum ItemFieldKind` (`ID`, `LOCATION`, `ORDER`), `#[ItemField(?kind, ?type, ?dbField, serialize, locationIndex)]`,
  `ItemLocation` (`getDefaults()`), `Location::from(...)` / `Location::filter(...)`,
  `ItemManager` (`initDb`, `addLocation(s)`, `getLocationByName`, `createItems`,
  `moveAllItemsInLocation`, `pickItem(s)`, `setItemOrder`, `moveItem(s)`,
  `getItemsByField(Name)(s)`, `getItemById(s)`, `countItemsInLocation`,
  `getMaxOrderInLocation`, `getItemsInLocation`, `getAllItems`, `getItem(s)OnTop`,
  `updateItem(s)`, `updateAllItems`, `getItemFromDb`, `shuffle`, `changeIds(ForLocation)`,
  `upgradeTableDbAddColumns`), `ItemManagerFactory::createItemManager($className, ?$classNameResolver)`.
- `Bga\GameFramework\Components`: `DeckFactory::createDeck($tableName)`.
- `Bga\GameFramework\Components\Counters`: `enum CounterVisibility`,
  `CounterFactory::createPlayerCounter($name, ?min, ?max, $visibility, $useNo, ?strict)` /
  `createTableCounter($name, ?min, ?max)`; `PlayerCounter`
  (`isVisible/isHidden/isSelf`, `setVisibility/setUseNo/setStrict`, `initDb`,
  `get/set/inc/getMin/getMax/getAll/setAll/fillResult`) and `TableCounter`
  (`initDb/get/set/inc/fillResult`); exceptions `OutOfRangeCounterException`,
  `UnknownPlayerException`.
- `Bga\GameFramework\Helpers`: `Collection extends ArrayObject`
  (`keys/isEmpty/first/last/add/has/random/values/all/diff/pluck/find/findKey/
  count/some/every/map/merge/reduce/filter/slice/take/contains/sort/where/
  countWhere/whereNot/whereNull/sortBy/groupBy/update`), `Json::decode($json, ?$class)`,
  `Player`, `GameResult`.
- Global namespace: legacy `APP_Template`, `game_view`, `Table extends \Bga\GameFramework\Table`,
  `APP_GameAction`, `feException`, legacy `abstract Deck` (empty in the helper).

### 2.2 Services available on `Bga` / `GameState` / `Table`

`Bga` bag: `globals`, `notify`, `logs`, `legacy`, `tournament`, `tableOptions`,
`userPreferences`, `tableStats`, `playerStats`, `deckFactory`,
`itemManagerFactory`, `counterFactory`, `debug`, `playerScore`, `playerScoreAux`.
`States\GameState` exposes the same except `itemManagerFactory` (it has
`deckFactory`, `counterFactory`, `playerScore`, `playerScoreAux`, plus
`$gamestate`, `getRandomZombieChoice()`, `getBestZombieChoice()`), and its
constructor is `__construct(Table $game, int $id, StateType $type, ?$name,
$description, $descriptionMyTurn, $transitions, $updateGameProgression,
$initialPrivate)`.

`Notify`: `all($notifName, $message|string|NotificationMessage, $args)`,
`player($playerIdOrNo, ...)`, `addDecorator($fn)`, `setUseNo()`, `alwaysMergePrivate()`.
`TableStats`/`PlayerStats`: `init($name(s), $value)`, `set()`, `inc()`, `get()`,
plus `setAll/incAll/getAll` on player stats.
`Table` (legacy surface, still declared): static DB reads `DbQuery`,
`DbAffectedRow`, `DbGetLastId`, `escapeStringForDB`, `getObjectListFromDB`,
`getUniqueValueFromDB`, `getCollectionFromDB`, `getDoubleKeyCollectionFromDB`,
`getNonEmptyCollectionFromDB`, `getNonEmptyObjectFromDB`, `getObjectFromDB`;
player helpers `activeNextPlayer`, `activePrevPlayer`, `getActivePlayerId/Name`,
`getCurrentPlayerId`, `getPlayerAfter/Before`, `getPlayerColorById`,
`getPlayerNameById/ByNo`, `getPlayerNoById`, `getPlayerIdByNo`,
`getPlayersNumber/getPlayerCount`, `loadPlayersBasicInfos`,
`reattributeColorsBasedOnPreferences`, `reloadPlayersBasicInfos`,
`giveExtraTime`, `eliminatePlayer`, `checkAction`, `isAsync/isRealtime/isSpectator`,
`getGameinfos`, `getGameProgression`, `getGameStateValue/setGameStateValue/
incGameStateValue/setGameStateInitialValue`, `getStat/incStat/setStat/initStat`,
`notifyAllPlayers/notifyPlayer` (legacy; superseded by `Notify`),
`undoSavepoint/undoRestorePoint`, `store/retrieve/removeLegacyData(-Team)`,
`getGameUserPreference`, `getGameLanguage`, `getNext/PrevPlayerTable`,
`createNextPlayerTable`, `getSpecificColorPairings`, `logTextForModeration`,
`getBgaEnvironment`, `applyDbUpgradeToAllDB`, `upgradeTableDb`, `setupNewGame`,
`getAllDatas` (commented out as abstract in the helper), `zombieTurn`
(commented out), `getNew($objectName)` (Deck), `_()` (translation).
`GamestateMachine`: `jumpToState`, `nextState`, `nextPrivateState*`,
`setAllPlayersMultiactive`, `setPlayer(s)Multiactive`, `setPrivateState`,
`state/state_id`, `getCurrentState(Class)/getCurrentMainState(Class)`,
`getCurrentStateId/getCurrentMainStateId`, `runStateClassZombie`,
`checkPossibleAction`, `changeActivePlayer`, `isPlayerActive`,
`isMutiactiveState/isMultiactiveState`, `getActivePlayerList`, `getPrivateState`.

## 3. What Deep Dive actually uses (PHP)

### 3.1 Used — modern, as intended

| API | Where / how |
| --- | --- |
| `States\GameState` subclasses + `StateType` | All 8 states in `modules/php/States/`: `StartTurn` (10, GAME, `updateGameProgression: true`), `PlayerDiveStep` (20, ACTIVE_PLAYER), `ConfirmFlipOrDive` (25, ACTIVE_PLAYER), `RetreatPickTile` (30, ACTIVE_PLAYER), `NextPlayer` (40, GAME), `AiTurn` (50, GAME), `SoloChooseTiebreak` (51, ACTIVE_PLAYER), `EndScore` (98, GAME). Constructors promote `protected Game $game` and call `parent::__construct($game, id:, type:, description:/descriptionMyTurn:, updateGameProgression:)`. |
| `#[PossibleAction]` + `#[IntParam(min: 1)]` / `(min: 1, max: 5)` | 9 actions: `actFlipTile`, `actTakeFaceup`, `actSkipDepth`, `actIngestRock` (`PlayerDiveStep`); `actKeepFlipped`, `actDiveDeeper` (`ConfirmFlipOrDive`); `actSelectRetreatTile`, `actRetreatEmpty` (`RetreatPickTile`); `actChooseAiTile` (`SoloChooseTiebreak`). All take injected `int $activePlayerId` and return a state class-string. Only `IntParam` is used of the six param attributes. |
| `Globals::get/set` | 12 keys, ~70 lines: `startPlayerId`, `currentDepth`, `flippedTileId`, `usedRockThisTurn`, `gameEndTriggered`, `gameEndDepth`, `lastDiveFlipped`, `isSoloMode`, `soloAiDepth`, `soloAiTurn`, `soloDifficulty`, `soloTiebreakCandidateIds`. Set in `Game::setupNewGame()` and in states; read in `getArgs()`/`onEnteringState()`/`getAllDatas()`. |
| `Notify::all()` with `clienttranslate()` | 20 call sites, 9 notification types: `tileFlipped` (2), `tileCollected` (6), `penguinMovedDepth` (3), `predatorTrapped` (1), `penguinRetreat` (3), `rockIngested` (1), `gameEndTriggered` (2), `lastDiveFlipped` (1), `aiFinalScore` (1). `clienttranslate()` appears 61× in PHP. |
| `TableStats` / `PlayerStats` `init/set/inc` | `Game::setupNewGame()` inits `turns_number`, `game_end_depth` (table) and 8 player stats; `inc` for `turns_number`, `dives_taken`, `predators_hit`, `retreats_triggered` (×2 sites), `rocks_collected`, `rocks_used`; `set` for `game_end_depth`, `sets_completed`, `points_food`. |
| Built-in `playerScore` / `playerScoreAux` (`PlayerCounter`) | Only in `Game::updatePlayerScores()` — `playerScore->set($playerId, $total)`, `playerScoreAux->set($playerId, $completedSets)`. Called from `collectTileForPlayer()` and `EndScore`. |
| `Table` helpers | `setupNewGame()` (returns `StartTurn::class`), `getGameProgression()` (facedown count vs. hardcoded 120), `getGameinfos()` + `reattributeColorsBasedOnPreferences()` + `reloadPlayersBasicInfos()` (setup), `loadPlayersBasicInfos()` (scoring), `activeNextPlayer()` (setup + `NextPlayer`), `getActivePlayerId()` (`NextPlayer`, `PlayerDiveStep::getArgs`), `giveExtraTime()` (`NextPlayer::onEnteringState`), `getPlayerNameById()` (notification args). |
| `zombie(int $playerId)` on ACTIVE_PLAYER states | All 4 active states implement it (see §4.3). |
| `getArgs()` / `onEnteringState()` | `getArgs()` in 4 active states + `PlayerDiveStep` (9 `getArgs` hits incl. calls); `onEnteringState()` in the 4 GAME states. |
| Exceptions | `UserException(clienttranslate(...))` ×13 (validation in actions); `\BgaVisibleSystemException` ×1 (`Game::collectTileForPlayer`, "Tile not found"). |

### 3.2 Used — legacy / raw, where a framework component exists

This is the main gap. The game does **not** use `ItemManager` or `Deck` at all
(0 hits for `itemManagerFactory`, `ItemManager`, `Deck`, `deckFactory`,
`counterFactory`), and instead hand-rolls persistence on two raw tables
(`ocean_tile`, `trapped_penguin`, see `dbmodel.sql`):

| Raw approach | Count | Framework alternative (declared in helpers) |
| --- | --- | --- |
| `static::DbQuery("INSERT/UPDATE/DELETE ...")` with string-interpolated SQL | 13 call sites | `ItemManager::createItems / moveItem(s) / updateItem(s) / shuffle`, `Deck` |
| `getUniqueValueFromDB("SELECT COUNT(*) ...")` | 13 | `ItemManager::countItemsInLocation / getItemsByFieldNames(...)->count()` |
| `getCollectionFromDb("SELECT ...")` (note lowercase `b`; PHP method names are case-insensitive, so this resolves to the helper's `getCollectionFromDB`) | 14 | `ItemManager::getItemsInLocation / getItemsByField(s) / getAllItems` returning typed objects + `Collection::where/countWhere/sortBy` |
| `getObjectFromDB("SELECT * ...")` | 2 (`Game::getTile`) | `ItemManager::getItemById` |
| **Total raw-SQL call sites** | **42 across 6 files** (`Game.php` 23, `PlayerDiveStep` 7, `AiTurn` 7, `EndScore` 3, `RetreatPickTile` 1, `SoloChooseTiebreak` 1) | — |

Consequences to be aware of (not bugs proven by this audit): hand-written
`tile_order` shuffling in `Game::generateOceanTiles()` (per-depth `shuffle()` +
per-tile `UPDATE`), manual `row_index` bookkeeping in `collectTileForPlayer()`,
manual facedown-anonymisation in `getAllDatas()` (facedown tiles serialised as
`{id, depth, isFaceup: false}` only — correct and important, but hand-enforced),
and SQL built by interpolating ints/strings (`"WHERE tile_id = {$tileId}"`,
`"food_color = '{$foodColor}'"`) rather than bound parameters. The plan in
`docs/implementation_plan.md` §3/§4 describes an `OceanTile #[Item]` +
`ItemManagerFactory` design; the code as committed does not implement it.

Other legacy/raw notes:
- `getGameProgression()` divides by a hardcoded `120` ("approximate active
  tiles") instead of counting the actual initial ocean population.
- `Game::setupNewGame()` builds the `player` INSERT by string concatenation
  (`vsprintf` + `addslashes`), the pattern the `bga-new-table` workflow in the
  modernize skill cleans up.
- `upgradeTableDb($from_version)` is an empty stub in `Game.php`.

## 4. Helper-declared APIs Deep Dive does NOT use (relevant ones)

### 4.1 PHP — unused but directly relevant

- **`ItemManagerFactory` / `ItemManager` / `#[Item]` / `#[ItemField]` /
  `ItemFieldKind` / `Location` / `Collection`** — the biggest unused surface.
  Would replace the 42 raw-SQL sites above and give typed `OceanTile` objects,
  `Location::from('ocean', $depth)` / `('tableau', $playerId, $color)`,
  `shuffle($location)`, `pickItem(s)`, `moveItem(s)`, `countItemsInLocation`.
  Note: `GameState` does **not** expose `itemManagerFactory` as a property —
  it lives on the `Bga` bag (`$this->bga->itemManagerFactory`), so states would
  reach it via `$this->bga` (or via a manager created in `Game` and passed in).
  The plan's `#[Item(tableName: 'ocean_tile')]` sketch would also need a
  migration of `dbmodel.sql` / `upgradeTableDb()`, since ItemManager owns its
  table columns.
- **`CounterFactory`** — never used. The game only needs the two built-in score
  counters, so this is correctly unused *unless* a custom counter is wanted
  (e.g. a visible per-player rock/penguin counter instead of the hand-rolled
  panel badges in TS). `PlayerCounter::set/inc` accept an optional
  `NotificationMessage`; Deep Dive never passes one, so score changes carry no
  custom log message.
- **`DeckFactory` / `Deck`** — never used; same observation as ItemManager.
  The legacy global `Deck` is empty in the helper, so no API can be audited
  from it.
- **`Globals::inc / has / delete / getAll`** — only `get`/`set` are used.
  `inc` would fit e.g. a turn counter; `has`/`getAll` are not needed as written.
- **`Notify::player()`** — never used; every notification is `all()`. No
  private-per-player notification exists (facedown secrecy is enforced by
  stripping fields in `getAllDatas()`/`getArgs()`, not by private notifs).
  Also unused: `Notify::addDecorator`, `setUseNo`, `alwaysMergePrivate`,
  and `NotificationMessage` as a value (0 hits).
- **`BoolParam / StringParam / FloatParam / IntArrayParam / JsonParam`** — only
  `IntParam` is used. No current action needs the others (all action params are
  a single int id/depth plus the injected player id).
- **`CheckAction` / `Actions\Debug` attributes** — unused; no action needs
  check-disabling or reload-debug.
- **`GameState::getRandomZombieChoice()` / `getBestZombieChoice()`** — unused.
  See §4.3.
- **`TableOptions` / `UserPreferences` (`$this->tableOptions`, `$this->userPreferences`)**
  — unused server-side. The solo difficulty option (`gameoptions.jsonc` id 100)
  is read once via `$options[100]` in `setupNewGame()`, not via `tableOptions->get(100)`.
  No game preferences exist (`gamepreferences.jsonc` is an empty `{}` with a
  commented example), so `userPreferences` has nothing to read.
- **`Logs`, `Legacy`, `Tournament`, `Debug` (`$this->bga->...`)** — unused.
- **`Table` helpers unused**: `undoSavepoint` / `undoRestorePoint` (deliberate —
  plan §2 says no undo after hidden reveals), `eliminatePlayer`, `checkAction`,
  `getPlayerAfter/Before`, `getPlayerNoById`, `getPlayerIdByNo`,
  `getPlayerColorById`, `isAsync/isRealtime/isSpectator`, `getGameStateValue*`,
  `getStat/incStat/setStat/initStat` (stats go through the `*Stats` services
  instead), `notifyAllPlayers/notifyPlayer` (legacy superseded by `Notify`),
  `store/retrieve/removeLegacyData`, `getGameUserPreference`, `getDoubleKeyCollectionFromDB`,
  `getObjectListFromDB`, `getNonEmpty*FromDB`, `DbAffectedRow/DbGetLastId`,
  `escapeStringForDB`, `getNew()` (Deck), `getSpecificColorPairings`,
  `logTextForModeration`, `getBgaEnvironment`, `applyDbUpgradeToAllDB`.
- **`GameStateBuilder` / legacy `GamestateMachine`** — correctly unused: the
  game has no `states.inc.php` and all states are classes. `StateType::MULTIPLE_ACTIVE_PLAYER`
  and `::PRIVATE` are also unused (no multi-active/private states).
- **`Bga\GameFramework\Helpers\Collection` / `Json`** — unused (a consequence of
  not using ItemManager, which returns `Collection`s).

### 4.2 Zombie handling — deterministic, not the helper's random helpers

All four `zombie()` implementations call the real action with the **first**
eligible element instead of the helper's random/best-choice helpers:

- `PlayerDiveStep::zombie` — first `takeableFaceupIds[0]`, else first
  `facedownIds[0]`, else `actSkipDepth`, else `NextPlayer::class`.
- `ConfirmFlipOrDive::zombie` — always `actKeepFlipped` (safe resurface).
- `RetreatPickTile::zombie` — first `eligibleTileIds[0]`, else `actRetreatEmpty`.
- `SoloChooseTiebreak::zombie` — first `candidateTileIds[0]`, else `NextPlayer::class`.

The modernize skill's `bga-zombie-random-move` workflow exists precisely for
this: replace first-element zombie picks with `getRandomZombieChoice()` /
`getBestZombieChoice()` (the latter weighted by tile points for the retreat
pick). The plan (§4) describes exactly that weighted behaviour; the code does
not implement it. Note the plan's claim that `PlayerDiveStep::zombie` "prefers
taking a faceup Food tile … otherwise flips a random facedown tile" is
inaccurate as committed — the flip is `[0]`, not random.

## 5. TS API inventory (`bga-framework.d.ts` + cards/animations)

### 5.1 `Bga` object surface (declared)

`gameui`, `display3D`, `statusBar` (`setTitle`, `addActionButton(label, cb, params?)`,
`removeActionButtons`), `images` (`preload/dontPreloadImage(s)`, `getImgUrl`),
`sounds` (`load` — deprecated, sounds now autoload from `sounds/` — `play`,
`preload/dontPreloadSounds`), `tableOptions` (`get`, `isTurnBased`, `isRealTime`,
`getGameVersion`, `getGameLanguage`), `userPreferences` (`get/set/toggleVisibility`,
`onChange`), `players` (`getCurrentPlayerId/No`, `getCurrentPlayer`,
`isCurrentPlayerSpectator/Active`, `isPlayerActive`, `getActivePlayerId/No`,
`getActivePlayer`, `getPlayerById/ByNo`, `getFormattedPlayerName`,
`getActivePlayerIds`, `getPlayerAvatarUrl`, `getPlayerNoById`, `getPlayerIdByNo`),
`actions` (`performAction(action, args?, {lock, checkAction, checkPossibleActions,
ignoreDefaultErrorHandler})`, `checkAction`, `checkPossibleActions`),
`notifications` (`setupPromiseNotifications({prefix: 'notif_', minDuration, ...})`),
`gameArea` (`getElement`, `addLastTurnBanner`, `removeLastTurnBanner`,
`addWinConditionBanner`), `playerPanels` (`getElement`, `getElementByNo`,
`getScoreCounter`, `getScoreCounterByNo`, `addAutomataPlayerPanel`),
`dialogs` (`showMessage`, `showMoveUnauthorized`, `generic`, `info`,
`confirmation`, `multipleChoice`), `states` (`register`, `getStateClass`,
`getCurrentMainStateName/Class`, `getCurrentPlayerStateName/Class`,
`getStateClasses`, `setClientState`, `restoreServerGameState`, `isOnClientState`,
`logger`), plus `GameGui` (`setup`, `onEnteringState`, `onLeavingState`,
`onUpdateActionButtons`, `bgaAnimationsActive`, `wait`, `disableNextMoveSound`,
`onScreenWidthChange`, …) and legacy `Stock`, `Counter`, `Dojo`.

### 5.2 What Deep Dive actually uses (TS)

| API | Where / how |
| --- | --- |
| `bga.states.register()` | `Game` constructor registers 4 client state classes: `PlayerDiveStep`, `ConfirmFlipOrDive`, `RetreatPickTile`, `SoloChooseTiebreak`. No registration for the GAME states (`StartTurn`, `NextPlayer`, `AiTurn`, `EndScore`) — correct, they have no client behaviour. |
| `StateClass.onEnteringState / onLeavingState` | All 4 TS state classes implement both; `onEnteringState` sets the active depth, wires interactivity, and adds status-bar buttons for the active player only; `onLeavingState` calls `game.clearInteractivity()`. `onPlayerActivationChange` is not implemented. |
| `bga.statusBar.addActionButton` | 7 call sites in TS state classes (skip / rock-ingest per depth / resurface / dive-deeper / rescue per tile / retreat-empty / give-AI per candidate). `setTitle` / `removeActionButtons` are **not** called directly — titles are presumably left to the framework from PHP `description/descriptionMyTurn`. |
| `bga.actions.performAction` | 9 calls in `Game.ts` (`performFlipTile` → `actFlipTile`, `actTakeFaceup`, `actSkipDepth`, `actIngestRock`, `actKeepFlipped`, `actDiveDeeper`, `actSelectRetreatTile`, `actRetreatEmpty`, `actChooseAiTile`), all with default params (no explicit `{lock, checkAction, …}`). `checkAction` / `checkPossibleActions` are never called client-side. |
| `bga.notifications.setupPromiseNotifications()` | Once, in `Game.setupNotifications()` (`Game.ts:419`), with default params (prefix `notif_`). |
| `notif_*` handlers | 8 handlers in `Game.ts`: `notif_tileFlipped`, `notif_tileCollected`, `notif_penguinMovedDepth`, `notif_predatorTrapped`, `notif_penguinRetreat`, `notif_rockIngested`, `notif_gameEndTriggered`, `notif_lastDiveFlipped`. |
| `bga.gameArea.getElement()` | Once, in `setup()`; the board/tableaus are then built with template literals + `insertAdjacentHTML`. |
| `bga.playerPanels.getElement(playerId)` | Once, in `setup()`; appends penguin/rock/sets badges to each panel. |
| `bga.players.getCurrentPlayerId()` | Once (`Game.ts:189`). All other player lookups go through `gamedatas.players` directly, not the `Players` service. |
| `_()` (global translate) | Used for all user-visible TS strings (depth names, button labels, panel labels). |
| Hand-rolled DOM | Tiles/depths are plain `div`s manipulated via `document.getElementById` / `querySelectorAll` + `classList`/`innerHTML` (many sites in `Game.ts`, e.g. `dd-depth-*`, `dd-tile-*`, `dd-facedown-count-*`). No framework stock/animation manager is actually wired in (see §5.3). |

### 5.3 TS — declared but NOT used (relevant ones)

- **`BgaCards` / `BgaAnimations` — declared, typed, but not loaded.**
  `src/ts/libs.ts` contains the `importEsmLib('bga-animations'/'bga-cards', '1.x')`
  snippet entirely inside a block comment, with a comment telling the reader to
  import from `./libs`. Nothing in `src/ts/` imports `./libs`, and
  `modules/js/Game.js` (generated) contains no `BgaCards`/`BgaAnimations`/
  `importEsmLib` reference. So `CardStock`/`LineStock`/`SlotStock`/`HandStock`/
  `Deck`, `Manager.getCardElement`, and `BgaAnimations.Manager` are all unused,
  despite the plan (§4) describing "5× bga-cards Line/Slot Stocks" and
  `bga-animations` flip/slide/retreat animations. Tile flips/slides are
  hand-rolled DOM/CSS instead. This is the largest TS-side gap and the one most
  likely to matter for the planned "clean it up" work.
- **`bga.images` / `bga.sounds`** — 0 uses. No sounds are loaded or played; no
  images preloaded (the game has no `sounds/` folder and `img/` holds only a
  README, so the `bga-sounds` / `bga-fonts` modernize workflows are N/A).
- **`bga.dialogs`** — 0 uses (no confirm/info/multiple-choice dialogs; the
  retreat-empty and rock-ingest choices are status-bar buttons instead).
- **`bga.tableOptions` / `bga.userPreferences`** — 0 uses (solo difficulty is
  server-side only; `gamepreferences.jsonc` is empty).
- **`bga.display3D`** — 0 uses.
- **`bga.playerPanels.getScoreCounter*` / `addAutomataPlayerPanel`** — 0 uses.
  Scores are shown via the framework's default score display plus hand-written
  panel badges; the solo AI has no automata panel (it is not a real player row).
- **`bga.gameArea.addLastTurnBanner / addWinConditionBanner`** — 0 uses. The
  Last Dive is signalled by flipping the `1st`/`LAST DIVE` token in the header
  and by the `lastDiveFlipped` notification, not by the framework banner.
- **`bga.states.getCurrentMainStateClass / getCurrentMainStateName / setClientState /
  restoreServerGameState / isOnClientState`** — 0 uses. `Game.ts` never reads
  the current state class directly; all state UI lives in the registered classes.
- **`GameGui.onEnteringState / onLeavingState / onUpdateActionButtons`** — not
  defined on `Game` itself (only on the 4 registered state classes). No
  `onUpdateActionButtons` anywhere, so there is no multiactive-safe button hook
  (fine — there are no multi-active states).
- **Legacy `Stock`, `Counter`, `Dojo`, `ebg`, `gameui.scoreCtrl`, `ajaxcall`,
  `bgaPerformAction`** — 0 uses; correctly avoided in the modern TS setup.
  `rollup.config.mjs` + `package.json` build TS → `modules/js/Game.js` and
  SCSS → `deepdivefg.css` (`npm run build`).

### 5.4 Notification mismatch (found by cross-checking §3.1 vs §5.2)

Server sends 9 notification types; the client handles 8. **`aiFinalScore`
(sent once by `EndScore.php:55`) has no `notif_aiFinalScore` handler in
`Game.ts`** — its log line will still appear in the game log (the framework
shows the message text), but no client-side UI update is attached to it. All
other 8 types have exactly one handler each.

## 6. Summary — main gaps, in priority order

1. **No `ItemManager` / `Deck` — raw SQL everywhere (PHP).** 42 raw-SQL call
   sites across 6 files; the plan's `OceanTile #[Item]` design is not
   implemented. Biggest structural cleanup candidate; also the prerequisite
   chain in the modernize skill (`bga-new-table` → `bga-new-apis` →
   `bga-autowired-actions` → state classes) is already satisfied, so an
   ItemManager migration would be a fresh refactor, not a skill workflow.
2. **`BgaCards` / `BgaAnimations` not wired in (TS).** `libs.ts` is commented
   out; tiles are hand-rolled DOM. The plan's stock/animation architecture is
   not implemented.
3. **Zombie moves are deterministic first-element picks**, not
   `getRandomZombieChoice()` / `getBestZombieChoice()` — the skill's
   `bga-zombie-random-move` workflow covers this, and it is the only
   modernize workflow that maps cleanly onto a real gap in this codebase
   (the other 24 workflows are mostly already satisfied: JSONC files,
   namespaced game, state classes, autowired actions, strict types, ES6/TS —
   see the workflow table in the skill).
4. **`aiFinalScore` has no client handler** (minor; log-only today).
5. **Small nits:** `getGameProgression()` hardcodes 120; `upgradeTableDb()` is
   an empty stub; `playerScore->set()` passes no `NotificationMessage`;
   `Notify::player()` unused (no private notifications); `tableOptions->get(100)`
   not used for the solo-difficulty option; `statusBar.setTitle` never called
   from TS (titles come from PHP state descriptions).
6. **Already-modern — do not re-do:** namespaced `Game.php`, 8 PHP state
   classes, `#[PossibleAction]`/`#[IntParam]`, JSONC configs, TS client with
   registered state classes, `setupPromiseNotifications`, no `states.inc.php` /
   `.action.php` / `material.inc.php`, no Dojo/`ajaxcall`/legacy `Stock`.

## 7. Sources

- `_ide_helper.php` (4,012 lines), `bga-framework.d.ts` (1,718 lines),
  `bga-cards.d.ts` (47 lines), `bga-animations.d.ts` (14 lines) — repo root.
- Cross-checked files: `modules/php/Game.php` (512 lines),
  `modules/php/States/{StartTurn,PlayerDiveStep,ConfirmFlipOrDive,RetreatPickTile,NextPlayer,AiTurn,SoloChooseTiebreak,EndScore}.php`,
  `src/ts/Game.ts` (555 lines), `src/ts/States/*.ts` (31–45 lines each),
  `src/ts/types.d.ts`, `src/ts/libs.ts`, `dbmodel.sql`, `gameoptions.jsonc`,
  `gamepreferences.jsonc`, `stats.jsonc`, `docs/implementation_plan.md`.
- Reference: `~/workspace/custom-skills/modernize-bga-game-project/SKILL.md`
  (workflow list / prerequisites) — used only to judge which workflows are
  already satisfied, not as an API source.
