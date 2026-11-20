# BGA Front-End API — Learning Summary for Deep Dive

Source: `https://doc.studio.boardgamearena.com/framework-documentation/front-end/` and every
subpage beneath it, read in full via `browser.open` on 2026-11-20.
**34 pages, ~5,555 lines read.** Three pages (`user-preferences/`,
`game-interface-stylesheet/`, `game-sounds/`) first hit an upstream 429 rate limit and were
re-fetched successfully afterwards, so all 34 are covered.

> **Scope caveat.** The `libs/` pages are *overviews*, not full API references. Each links out
> to a Demo, full Documentation, and a Definition file (`.d.ts`) on `x.boardgamearena.net`.
> Constructors/signatures not named on an overview page (e.g. `SlotStock`, `HandStock`,
> `GridStock`, `Deck`, most `BgaAnimations.Manager` methods) must be taken from the linked
> Documentation / the project's root `.d.ts` files (`bga-animations.d.ts`, `bga-cards.d.ts`,
> `bga-framework.d.ts`) — do not invent them from this summary.

## Pages read

| # | Page | Lines |
|---|---|---|
| 1 | `front-end/` (overview) | 22 |
| 2 | `front-end/game-art/` | 208 |
| 3 | `front-end/game-fonts/` | 52 |
| 4 | `front-end/game-interface-logic/` (overview) | 277 |
| 5 | `…/game-interface-logic/actions/` | 168 |
| 6 | `…/game-interface-logic/dialogs/` | 377 |
| 7 | `…/game-interface-logic/display-3d/` | 221 |
| 8 | `…/game-interface-logic/game-area/` | 72 |
| 9 | `…/game-interface-logic/gameui/` | 161 |
| 10 | `…/game-interface-logic/images/` | 68 |
| 11 | `…/game-interface-logic/notifications/` | 370 |
| 12 | `…/game-interface-logic/player-panels/` | 116 |
| 13 | `…/game-interface-logic/players/` | 108 |
| 14 | `…/game-interface-logic/sounds/` | 75 |
| 15 | `…/game-interface-logic/states/` | 149 |
| 16 | `…/game-interface-logic/status-bar/` | 197 |
| 17 | `…/game-interface-logic/table-options/` | 24 |
| 18 | `…/game-interface-logic/user-preferences/` | 66 |
| 19 | `front-end/game-interface-stylesheet/` | 315 |
| 20 | `front-end/game-sounds/` | 25 |
| 21 | `front-end/libs/` (overview) | 112 |
| 22 | `front-end/libs/bga-animations/` | 109 |
| 23 | `front-end/libs/bga-autofit/` | 76 |
| 24 | `front-end/libs/bga-cards/` | 223 |
| 25 | `front-end/libs/bga-dice/` | 176 |
| 26 | `front-end/libs/bga-jump-to/` | 93 |
| 27 | `front-end/libs/bga-score-sheet/` | 235 |
| 28 | `front-end/libs/bga-zoom/` | 95 |
| 29 | `front-end/libs/counter/` | 129 |
| 30 | `front-end/libs/draggable/` | 95 |
| 31 | `front-end/libs/expandablesection/` | 92 |
| 32 | `front-end/libs/scrollmap/` | 415 |
| 33 | `front-end/libs/zone/` | 328 |
| 34 | `front-end/unit-testing/` | 306 |

---

## 1. Game class and the `bga` object

- **Entry point is `modules/js/Game.js`** (in Deep Dive, the maintained source is
  `src/ts/Game.ts`, built by Rollup into `modules/js/Game.js`). It defines which page
  actions generate server calls, what happens on a server notification, and how the UI is
  set up. Multiple classes may live in `Game.js` as long as a `Game` class is exported;
  split code into e.g. `modules/js/PlayerManager.js` with `export class PlayerManager`
  and `import { PlayerManager } from "./PlayerManager.js";` in `Game.js`.
- **All framework sub-components are available in the `bga` object passed to the
  constructor.** Store it: `constructor(bga) { this.bga = bga; }`.

| Component | Purpose |
|---|---|
| `this.bga.statusBar` | Status-bar prompt and action buttons |
| `this.bga.gameArea` | Main game area; last-turn / win-condition banners |
| `this.bga.playerPanels` | Player-panel content, score counters, automaton panels |
| `this.bga.players` | Player data, names, avatars, IDs; who is active / spectating |
| `this.bga.actions` | Send player actions to the server; check whether an action is allowed |
| `this.bga.states` | Register JS state classes; client states for multi-step interactions |
| `this.bga.notifications` | Register notification handlers; coordinate timing with animations |
| `this.bga.dialogs` | Warning / confirmation / choice / custom dialogs |
| `this.bga.tableOptions` | Table option values, play mode, game version, language |
| `this.bga.userPreferences` | Read/update user preferences, respond to changes |
| `this.bga.sounds` | Sound preloading and playback |
| `this.bga.images` | Image preloading and image URLs |
| `this.bga.display3D` | Rotate / move / zoom a 3D view, optional mouse controls |
| `this.bga.gameui` | Shared utilities: tooltips, animations, resizing, interface locking |

### Lifecycle

- **`setup(gamedatas: object)`** — must set up the UI from the current game situation.
  Called on game start, when a player opens a game later, on page refresh (F5), and on a
  server-side Undo. `gamedatas` is the PHP `getAllDatas()` result plus framework data.
  **Implication: `setup` must be idempotent and fully rebuild from `gamedatas` — it is
  not start-only.**
- **`onEnteringState(stateName, args)`** — called each time a state is entered. PHP
  `arg*` state arguments are at `args?.args`. Typically act only for the active player
  (`this.bga.players.isCurrentPlayerActive()`). Also called (for the current state only)
  on browser refresh, after `setup`.
- **`onLeavingState(stateName)`** — called each time a state is left; use for cleanup.
- **`onUpdateActionButtons(stateName, args)`** — manage action buttons and highlight
  active UI elements. `args` is the PHP `arg*` result and **can be `null`** (game states,
  or no state-args function). Called when the active/multiactive player changes. In a
  classic `ACTIVE_PLAYER` state it is called **before** `onEnteringState`. In a
  `MULTIPLE_ACTIVE_PLAYER` state the sequencing is described on the page as "a mess"
  and depends on entry via transition vs. reload.
- **`setupNotifications`** — associates notifications with handlers.
- **All three of `onEnteringState`, `onLeavingState`, `onUpdateActionButtons` are
  optional, and not needed if you use JS State classes** (registered via
  `this.bga.states`).
- For `MULTIPLE_ACTIVE_PLAYER` states, active players are **not active yet** in
  `onEnteringState`, so use `onUpdateActionButtons` for anything depending on
  active/inactive status; for initialisation not depending on it, replace
  `isCurrentPlayerActive()` with `!isCurrentPlayerSpectator()`.

### Translations

- Client-side: **`_()`** for every translatable string, e.g. `_("original english string")`.
  With parameters: `_("You can pick ${p} cards…").replace('${p}', '2')`.
- **Never use `'\n'`, `'\t'` or similar escapes in a JS string to translate** — it breaks
  the translation bundle and all JS translations fail. Strings become HTML; use HTML
  markup instead.
- **`bga_format(translatedString, map)`** — inline formatting without HTML in the source
  string, Markdown-style delimiters, e.g.
  `bga_format(_('You receive a *special* _tile_'), { '*': (t) => '<b>'+t+'</b>', '_': 'tile-name' })`.
  A string value wraps the inner text in `<span class="…">`; a function receives the
  inner text and its return value replaces text + delimiters. Text must still be passed
  through `_()` first; good delimiters are `['*', '_']`.

### Library imports

Each additional component **must be declared at the top of the JS file**, before any class
declaration, e.g.
```js
/** @type {typeof globalThis.BgaAnimations} */
const BgaAnimations = await globalThis.importEsmLib('bga-animations', '1.x');
const [Counter, Stock] = await importDojoLibs(["ebg/counter", "ebg/stock"]);
```
TypeScript equivalent lives in `src/ts/libs.ts` (see §10).

---

## 2. States — `this.bga.states`

Create one dedicated class per front-end-handled state (states like `NextPlayer` need no
JS handling).

```js
this.bga.states.register('PlayerTurn', new PlayerTurn(this, this.bga));
```
Register in the `Game` constructor; the framework then calls the class's lifecycle
methods automatically.

State-class shape:
```js
class PlayerTurn {
    constructor(game, bga) { this.game = game; this.bga = bga; }
    onEnteringState(args, isCurrentPlayerActive) { }
    onLeavingState(args, isCurrentPlayerActive) { }
    onPlayerActivationChange(args, isCurrentPlayerActive) { } // MULTIPLE_ACTIVE_PLAYER only
    // custom functions used only in this state here
}
```
- `onPlayerActivationChange`: in `MULTIPLE_ACTIVE_PLAYER` states, call it at the end of
  `onEnteringState` via `this.onPlayerActivationChange(args, isCurrentPlayerActive)`.
  If the state is not `MULTIPLE_ACTIVE_PLAYER`, delete it.
- `this.bga.states.getCurrentMainStateName(): string` — current main state name (ignoring
  private states).
- `this.bga.states.getCurrentPlayerStateName(): string` — current player state name
  (private state name if there is one).
- `this.bga.states.getStateClass(stateName): Object` / `getCurrentMainStateClass()` /
  `getCurrentPlayerStateClass()` — state-class instances.
- `this.bga.states.getStateClasses(): Object[]` — all registered state classes.
- `this.bga.states.logger: Function` — set to `console.log` for state-change debug info.
  **Remove before going to production!**

### Client states

Client states simulate a transition **without contacting the server** — useful when asking
the user several questions before sending data. They have **no matching PHP class** and
can be used with JS State classes, as long as the `stateName` in `setClientState` matches
a registered JS State class.
- `this.bga.states.setClientState(stateName, args)` — e.g.
  `setClientState("client_playerPicksLocation", { descriptionmyturn: _("${you} must select location"), args: { card_number: 5 } })`.
- `this.bga.states.restoreServerGameState(): void` — if in a client state, restores the
  current server state (cheap undo).
- `this.bga.states.isOnClientState(): boolean`.

---

## 3. Status bar — `this.bga.statusBar`

- `this.bga.statusBar.setTitle(title: string, args?: object)` — updates the page title /
  status-bar prompt. Handles `${you}` and `${actplayer}` plus any other variables in
  `args`:
  ```js
  this.bga.statusBar.setTitle(
      this.bga.players.isCurrentPlayerActive()
          ? _('${you} must take ${mandatory_card_name}')
          : _('${actplayer} must take ${mandatory_card_name}'),
      args);
  ```
- `this.bga.statusBar.addActionButton(label, callback, params?): HTMLButtonElement`
  - `label`: shown label; **can be HTML**. Pass a translated string, e.g. `_('Yes')`.
  - `callback`: **must be a function, not a method name**.
  - `params` (optional): `color` — `primary` (default, blue), `secondary` (gray),
    `alert` (red); `id` — DOM id to set (null/undefined = none); `classes` — string or
    array, e.g. `'disabled blinking'`; `destination` — DOM element to add the button to
    (default: the status bar); `title` — plain-text description, set when the label is
    an icon, for accessibility; `disabled` — prevents the callback executing;
    `tooltip`; `confirm` — string **or** function returning a string or `null`
    (`null` = no warning), e.g. `confirm: () => selected.length === 0 ? _('Are you sure…?') : null`;
    `autoclick` — `boolean | { abortSignal, pausable }`, clicks the button automatically
    after a short delay (for confirmation buttons).
  - Standard call: `addActionButton(_('Pass'), () => this.bga.actions.performAction('actPass', {}))`.
  - Autoclick + user preference: `autoclick: this.bga.userPreferences.get(100) == 1`
    (adapt id/values to your preference); pausable form:
    `autoclick: this.bga.userPreferences.get(100) == 1 ? { pausable: true } : null`.
  - Autoclick with abort (use **only** if `pausable` isn't enough):
    `autoclick: { abortSignal: abortController.signal }` via `new AbortController()`,
    plus a secondary `"Let me think!"` button calling `abortController.abort()`.
- `this.bga.statusBar.removeActionButtons()` — removes all buttons from the title bar.

---

## 4. Actions — `this.bga.actions`

### `performAction` — exact signature

```ts
this.bga.actions.performAction(
  action: string,
  args?: object,
  options: { lock: boolean, checkAction: boolean, checkPossibleActions?: boolean, ignoreDefaultErrorHandler?: boolean }
): Promise<void>
```
**This method must be used to send a player's input to the game server.**

- **Must NOT be triggered programmatically**, especially not in loops, in callbacks, in
  notifications, or in `onEnteringState` / `onUpdateActionButtons` / `onLeavingState` —
  to avoid race conditions and breaking game replay and tutorial features.
  **Use only in reaction to a user action in the interface.**
- `action`: name as written in `possibleactions` of the current state.
- `args`: object of parameters; may be omitted if the action has none.
  **Forbidden argument names:** `$args`, `$activePlayerId`, `$active_player_id`,
  `$currentPlayerId`, `$current_player_id`, `$activePlayerNo`, `$active_player_no`,
  `$currentPlayerNo`, `$current_player_no` (they would interfere with magic params).
- `options` defaults are **`{ lock: true, checkAction: true }`**:
  - `lock` (default `true`): locks the UI before any other action can execute. Set
    `false` only to handle locking yourself.
  - `checkAction` (default `true`): checks the action is in possible actions and the
    user is active. Set `false` only for rare out-of-turn actions.
  - `checkPossibleActions` (default `false`): checks the action is in possible actions.
- **Asynchronous: do nothing after this line except return.** Use promise handlers
  `catch` / `then` for follow-up. The PHP callback **cannot return a result; results
  must come via notifications.** On error the framework handles the message; you can
  use it in `catch({ message, args })` but should not display it (unless
  `ignoreDefaultErrorHandler: true` was set).

```js
this.bga.actions.performAction('pass');
this.bga.actions.performAction('actPlayCard', { id: this.selectedCardId });
this.bga.actions.performAction('actChangeMind', {}, { checkAction: false, checkPossibleActions: true }); // inactive player, multiactive
this.bga.actions.performAction('actSetAutoBid', { alwaysBidUntil: 500 }, { lock: false, checkAction: false });
this.bga.actions.performAction('actPlayCards', { ids: this.selectedCardIds }); // #[IntArrayParam] on PHP side
this.bga.actions.performAction('actPlanComplexStuff', { answer: JSON.stringify(this.theJsonObject) }); // #[JsonParam]; note "stringify"
this.bga.actions.performAction('actPlayCard', { id: this.selectedCardId }).catch(() => { this.selectedCardId = undefined; });
this.bga.actions.performAction('actPlayCard', { id: this.selectedCardId }).then(() => { this.unselectAll(); });
```

### Checks

- `this.bga.actions.checkAction(action: string, nomessage?: boolean): boolean` —
  false (+ "An action is already in progress" / "This is not your turn" / "This move is
  not authorized now", unless `nomessage`) if the interface is locked, the player is not
  active, or the action is not in possible actions. **Included in `performAction` by
  default** — usually no need to call it explicitly.
- `this.bga.actions.checkPossibleActions(action: string): boolean` — independent of the
  player being active (useful in multiplayer states, e.g. "change their mind"). Unlike
  `checkAction`, it does **not** take interface locking into account. Included in
  `performAction` only if enabled (`checkPossibleActions: true`).

---

## 5. Notifications — `this.bga.notifications`

### `setupPromiseNotifications` (recommended)

```js
setupNotifications: function() {
    this.bga.notifications.setupPromiseNotifications();
}
notif_playedCard: async function(args) {
    await this.getPlayerTable(args.playerNo).playCard(args.card);
}
```
- `this.bga.notifications.setupPromiseNotifications(params = undefined)`
- Defaults: `{ prefix: 'notif_', minDuration: 500, minDurationNoText: 1, logger: null,
  ignoreNotifications: [], onStart: undefined, onEnd: undefined }`.
- Auto-detects all notification functions declared on the game object (functions
  starting with `notif_`) and registers them with `dojo.subscribe`.
- Registered notifications are **synchronous** with a **minimum duration if animations
  are active: 500 ms with text, 1 ms without** by default. If the handler returns a
  Promise, the notification ends when **the promise AND the minimum durations** are over.
- **If a handler returns a Promise, the dev is responsible for making it resolve
  instantaneously if animations are not active.** See `bgaAnimationsActive`; see
  `bgaPlayDojoAnimation` for dojo animations with promises.
- **Second argument = full notification data:** `notif_playedCard: async function(args, notif)`
  gives `notif.log` and technical data such as `move_id`, `table_id`, `uid`.
- Custom params example:
  ```js
  this.bga.notifications.setupPromiseNotifications({
    prefix: 'notif_',
    minDuration: 1200,           // longer animations (500 by default)
    minDurationNoText: 1,
    handlers: [this.notificationsManager], // handlers live in a subclass
    logger: console.log,
    ignoreNotifications: ['updateAutoPlay'], // notif_updateAutoPlay ignored; subscribe manually if needed
    onStart: (notifName, msg, args) => $('pagemaintitletext').innerHTML = `${_('Animation for:')} ${msg}`,
    onEnd: (notifName, msg, args) => $('pagemaintitletext').innerHTML = '',
  });
  ```

### Notifications in JS State Classes

```js
setupNotifications: function() {
  this.bga.notifications.setupPromiseNotifications({
    handlers: [this, ...this.bga.states.getStateClasses()],
  });
}
```
**Warning: if the same `notif_doSomething` is defined in `Game.js` and several State
classes, they ALL will be called.**

### `wait`

- `this.bga.gameui.wait(delay)` — `delay` in ms. Returns a Promise resolving after that
  many ms; **resolves instantaneously if animations are not active**.
  `await this.bga.gameui.wait(500);`

### Manual subscription

- `dojo.subscribe(notif_type, callback_obj, handler)` — `notif_type` = notification
  type/name sent by PHP; `callback_obj` usually `this`; `handler` = method name string
  or function. `setupNotifications` is where to subscribe, e.g.
  `dojo.subscribe('playDisc', this, "notif_playDisc");`. In a manual handler, access args
  as `notif.args` (PHP `$this->bga->notify->all("apples", clienttranslate('player takes ${count} apples'), ["count" => 3])` → JS `notif.args.count`).
- "cometD" is **not** named on this page; the documented mechanism is
  `dojo.subscribe` / `setupPromiseNotifications`.

### Ignoring notifications

- `this.bga.gameui.notifqueue.setIgnoreNotificationCheck(notif_type, predicate)`:
  ```js
  this.bga.gameui.notifqueue.setIgnoreNotificationCheck('dealCard', (notif) => notif.args.playerNo === this.bga.players.getCurrentPlayerNo());
  ```
  Framework calls the predicate before dispatching; if it returns `true` the
  notification is ignored.
- **Security rule:** an ignored notification is **still received by the client**, so it
  must not contain private information — cheaters can get it. Sending `private` in
  `notify->all` is better.
- **Reload / history replay:** when a game is reloaded (F5) or a turn-based game is
  opened, old notifications are replayed as history notifications, used just to update
  the game log and **stripped of all arguments except `player_id`, `i18n`, and any
  argument present in the message**. Preserve `playerNo` in the PHP payload with
  `'preserve' => ['playerNo']` when using it in an ignore predicate.

### Synchronous notifications (manual)

- Notifications are otherwise processed immediately, one after another, in exactly the
  order generated in PHP.
- `this.bga.gameui.notifqueue.setSynchronous('playDisc', 500);` — wait 500 ms after
  executing the handler.
- **Dynamic duration:** call `setSynchronous('cardPlayed')` with no duration, then call
  `setSynchronousDuration(...)` inside the handler, e.g.
  `setSynchronousDuration(notif.args.duration)` or `setSynchronousDuration(anim.duration)`.
  **NOTE: if you forget to invoke `setSynchronousDuration`, the game will remain paused
  forever.** You can also call `setSynchronousDuration(0)` once client operations are
  finished, but ensure even fast replay has a path to call it.
- **WARNING — combining synchronous + ignored notifications:** do **NOT** combine a
  conditionally-ignored notification with `setSynchronous('myNotif')` (no duration):
  when the ignore check passes, the handler (which sets the duration) is never called
  and the interface remains locked. Workaround: `setSynchronous('myNotif', 5000)` — the
  value is irrelevant but must be large enough to cover the time before the handler is
  called.

### Pre-defined notification types

- `tableWindow` — displays Scoring Dialogs.
- `message` — appears in players' logs, no other effect (any unhandled notification does
  the same, but use this keyword for consistency). PHP:
  `$this->bga->notify->all('message', clienttranslate('hello'), []);` — no client code needed.
- `simplePause` — just delays other notifications; requires a `time` parameter (ms).
  PHP: `$this->bga->notify->all('simplePause', '', ['time' => 500]);`

### Reserved notification names — do NOT use

`gameStateChange`, `gameStateChangePrivateArg`, `gameStateMultipleActiveUpdate`,
`newActivePlayer`, `playerstatus`, `yourturnack`, `clockalert`, `tableInfosChanged`,
`playerEliminated`, `tableDecision`, `archivewaitingdelay`, `end_archivewaitingdelay`,
`replaywaitingdelay`, `end_replaywaitingdelay`, `replayinitialwaitingdelay`,
`end_replayinitialwaitingdelay`, `aiPlayerWaitingDelay`, `replay_has_ended`,
`updateSpectatorList`, `wouldlikethink`, `updateReflexionTime`, `undoRestorePoint`,
`resetInterfaceWithAllDatas`, `zombieModeFail`, `zombieModeFailWarning`, `aiError`,
`skipTurnOfPlayer`, `zombieBack`, `allPlayersAreZombie`, `gameResultNeutralized`,
`playerConcedeGame`, `showTutorial`, `showCursor`, `showCursorClick`,
`skipTurnOfPlayerWarning`, `banFromTable`, `resultsAvailable`, `switchToTurnbased`,
`newPrivateState`, `infomsg`.

---

## 6. Game area, player panels, players

### Game area — `this.bga.gameArea`

- `this.bga.gameArea.getElement(): HTMLElement` — returns the div of the game area to
  put the game template into. In `setup`:
  ```js
  this.bga.gameArea.getElement().insertAdjacentHTML('beforeend', html);
  ```
- `this.bga.gameArea.addLastTurnBanner(message?, args?): void` — predefined banner when
  someone fulfils an end-of-game condition. Default message: `"This is the last turn!"`.
  E.g. `addLastTurnBanner(_('This is the last turn! (deck is empty)'))`.
- `this.bga.gameArea.removeLastTurnBanner(): void` — remove it if the triggering action
  is cancelled.
- `this.bga.gameArea.addWinConditionBanner(message?, args?): void` — when the game has
  multiple win conditions, display which was reached. The `args` pattern matches
  `format_string_recursive`-style `${…}` substitution, e.g. a `player_name` arg filled
  with `this.bga.players.getFormattedPlayerName(winnerId)`.

### Player panels — `this.bga.playerPanels`

- `this.bga.playerPanels.getElement(player_id: number): HTMLElement` — div in the player
  panel for counters & other indicators.
- `this.bga.playerPanels.getElementByNo(playerNo: number): HTMLElement` — same, by
  playerNo. **Prefer this when game logic uses player numbers.**
- Example (in `setup`): iterate `Object.values(gamedatas.players)` — `gamedatas.players`
  is **keyed by player ID**, convert at this boundary via
  `this.bga.players.getPlayerNoById(Number(player.id))` — then
  `getElementByNo(playerNo).insertAdjacentHTML('beforeend', html)`, e.g. a stone icon +
  `<span id="stonecount_p${playerNo}">0</span>`. To distinguish the current player,
  compare `playerNo` with `this.bga.players.getCurrentPlayerNo()` (`null` for spectators).
- `this.bga.playerPanels.addAutomataPlayerPanel(id, name, params): void` — panel for an
  automated opponent (solo). `id`: automaton id, used for the panel score counter;
  **0 or a negative value is recommended** to avoid conflicts with real player ids.
  `params` (optional): `color` (default black); `iconClass` — class(es) applied to the
  player picture; `score` (default `undefined`, displays `'-'`). E.g.
  `addAutomataPlayerPanel(0, 'Tom', { iconClass: 'tom-avatar', score: gamedatas.tom.score })`.
- Disabling / enabling panels (note: these live under **`this.bga.gameui`**, not
  `playerPanels`): `this.bga.gameui.disablePlayerPanel(player_id)` — panel background
  becomes gray; usually signals the player has passed / will be inactive. **Only visual;
  no consequences on panel behaviour.** `enablePlayerPanel(player_id)`,
  `enableAllPlayerPanels()`.
- `this.bga.gameui.updatePlayerOrdering(): void` — makes panel order match
  `this.gamedatas.playerorder`; normally called by the framework. Call it yourself if
  you change `this.gamedatas.playerorder` from a notification. Can be overridden to
  change defaults or insert a non-player panel.
- `this.bga.playerPanels.getScoreCounter(player_id): Counter` /
  `getScoreCounterByNo(playerNo): Counter` — the score counter on the player panel.
  For other counters on the player panel, use the `ebg/counter` library (see §10.8).

### Players — `this.bga.players`

- `getCurrentPlayerId(): number` — id of the player looking at the game; may be a spectator.
- `getCurrentPlayerNo(): number | null` — `null` for spectators.
- `isCurrentPlayerSpectator(): boolean`. Read-only helper suggested on the page:
  ```js
  isReadOnly: function () {
    return this.bga.players.isCurrentPlayerSpectator() || typeof g_replayFrom != 'undefined' || g_archive_mode;
  }
  ```
  (true for spectators, instant replay during game, archive mode after game end).
- `isCurrentPlayerActive(): boolean` — true if the player on whose browser the code runs
  is currently active. See remarks about usage inside `onEnteringState`.
- `getActivePlayerId(): number | null` / `getActivePlayerNo(): number | null` — null if
  not in an `ACTIVE_PLAYER` type state. E.g.
  `if (args.playerNo === this.bga.players.getActivePlayerNo()) { … }`.
- `getActivePlayerIds(): number[]` — ids of currently active players (empty if none).
- `getFormattedPlayerName(playerId, params?): string` — HTML for the player name, bold,
  with color. `params` optional; `{ replaceByYou: true }` displays a colored "You".
- `this.gamedatas: object` — initial data, created at game start or refresh (F5). Can be
  updated as needed, but most of the time unnecessary. **Caution:** in hotseat mode the
  framework does not keep `this.gamedatas` of hotseat players and shares the same set as
  the main player. **Be careful when updating this data structurally: many framework
  functions expect data structured a certain way and will break if they see something else.**
- `getPlayerById(playerId): object` / `getPlayerByNo(playerNo): object` — player data
  from `gamedatas.players`; can be `undefined` if the player isn't at this table.
- `getActivePlayer(): object` / `getCurrentPlayer(): object`.
- `getPlayerAvatarUrl(playerId, size): string` — size `32`, `50`, `92`, or `184`
  (default). `playerId` `0` = default avatar.
- `getPlayerNoById(playerId): number | null` / `getPlayerIdByNo(playerNo): number`.

---

## 7. Dialogs, 3D, gameui, table options, user preferences

### Dialogs — `this.bga.dialogs`

- **`showMessage(msg, type): void`** — message in a big rectangular area at the top of
  the current player's screen; disappears after a few seconds (also appears in the log
  in some cases). `msg` translated. `type`: `"info"` (white), `"error"` (red, added to
  the log), `"only_to_log"` (log only, no pop-up), or a custom string — transparent
  background; define `head_xxx` in CSS, e.g. type `"warning"` +
  `.head_warning { background-color: #e6c66e; }`. **The normal way to inform players is
  the game log. `showMessage` is intrusive and should not be used often.** Can be used
  client-side to prevent invalid moves before they are sent to the server.
- **`showMoveUnauthorized(): void`** — predefined error that the move is not currently
  authorized.
- **Confirmation dialog — AVOID in general.** They slow the game and bother players.
  Use only when: it must not happen very often; it is linked to an action that can
  really "kill a game" if the player does not pay attention; it is something that can
  be done by mistake. `this.bga.dialogs.confirmation(message): Promise<boolean>` —
  async, handle the result in the promise handler; **nothing should be called/done
  after calling it**.
  ```js
  this.bga.dialogs.confirmation(_("Are you sure you want to bake a pie?")).then(result => {
    if (result) { this.bakeThePie(); }
  });
  return;
  ```
- **`info(message, title): Promise<void>`** — avoid it, prefer `showMessage`. Both
  translated. Async — handle in promise handler.
- **`multipleChoice(message, choices: string[]): Promise<string | null>`** — choice from
  a small number of options. `message` translated; `choices` array. Async. **If the
  user cancels, it returns `null`.** The resolved value is the **index** into `choices`,
  not the choice string itself.
  ```js
  const keys = ["0", "1", "5", "10"];
  this.bga.dialogs.multipleChoice(_("How many bugs to fix?"), keys).then(choice => {
    if (choice === null) { return; } // cancel, do not call server action
    const bugchoice = keys[choice];
    this.bga.actions.performAction("fixBugs", { number: bugchoice });
  });
  return;
  ```
- **Generic dialogs — avoid dialog windows for game elements.** All game elements should
  be displayed on the main screen; players can scroll; anchors can move between sections.
  An open dialog prevents players accessing other game components. When one is needed:
  `this.bga.dialogs.generic(title, content, params)` — returns `Promise<void>` resolving
  when the dialog is hidden/destroyed; `await` may be omitted if waiting is unnecessary.
  Title and content must be translated. Settings: `id` (unique, auto-generated if
  omitted), `maxWidth` (px), `beforeShow` (callback receiving the dialog instance after
  content is inserted, before it is shown — use to populate dynamic content or attach
  listeners), `hideCloseIcon` (default `false`), `closeOnOverlayClick` (default `true`;
  **always disabled when `hideCloseIcon` is `true`**). If the close icon is hidden,
  provide a way to close the dialog in its content. The helper automatically destroys
  the dialog when hidden.
- **Scoring dialogs (PHP-side only)** — managed entirely on the PHP side; visible only
  client-side. Uses special notification type **`"tableWindow"`**:
  ```php
  $this->bga->notify->all("tableWindow", '', [
      "id" => 'finalScoring',
      "title" => clienttranslate("Title of the scoring dialog"),
      "table" => $table
  ]);
  ```
  `table` is a two-dimensional PHP array, line by line / column by column; cells may be
  simple strings or `["str" => clienttranslate("a string with an ${argument}"), "args" => […]]`;
  a cell may carry `'type' => 'header'` (e.g. player names with colours). Extra params:
  `header` (shown before the table; HTML parsed, player names coloured), `footer`
  (shown after; no player-name colour parsing), `closing` (label of a button at the
  bottom to close the popup). Notes: `id` is not currently used, so the resulting div
  cannot be accessed by id on the JS side. **Don't:**
  `"footer" => '<div>'.clienttranslate("The end").'</div>'` — this will not work for
  translations.

### 3D display — `this.bga.display3D`

Provides a 3D view for one or more HTML elements: rotate/move the view, zoom in/out,
optionally let players control the view with the mouse.
- `init3d(settings?: Display3DInitSettings): void` — if `elements` is not specified, the
  view uses the default game area elements. Settings: `elements: HTMLElement[]`,
  `showControls` (default `false`), `view` (initial view + limits), `draggable`
  (boolean, numeric multiplier, or settings object), `zoomByWheel` (same forms).
  ```js
  this.bga.display3D.init3d({
      elements: [document.getElementById("game_play_area")],
      showControls: true,
      view: { xAxis: 40, zAxis: 0, xPos: -100, yPos: -50, zoom: 1, minZoom: 0.5, maxZoom: 3 },
      draggable: true, zoomByWheel: true,
  });
  ```
- `setElements(elements: HTMLElement[])` / `addElements(elements: HTMLElement[])`.
- `change3d(xaxis, xpos, ypos, zaxis, scale): void` — relative changes, in that order.
- `resetView(): void` — resets to neutral position while respecting configured limits.
- `rotate(x, y): void` — `x` = X-axis rotation, `y` = Z-axis rotation.
- `slide(x, y): void` — `x` = X position, `y` = Y position.
- `zoom(inc: number): void` — relative zoom change. `setZoom(value: number): void` — absolute.
- `setDraggable(enabled?: boolean | number | Display3DDraggableSettings, settings?)` —
  right-button dragging rotates, middle-button dragging slides. Object form:
  `{ enabled, multiplier, rotationMultiplier, slideMultiplier }`; defaults
  `rotationMultiplier = 0.1`, `slideMultiplier = 1`.
- `setZoomByWheel(enabled?: boolean | number | Display3DZoomByWheelSettings, settings?)` —
  object: `enabled` (default `true` in object form), `multiplier` (default `0.1`),
  `zoomMultiplier` (alias, also default `0.1`).
- `view` properties (all optional): `xAxis`, `minXAxis`, `maxXAxis`, `zAxis`, `minZAxis`,
  `maxZAxis`, `xPos`, `minXPos`, `maxXPos`, `yPos`, `minYPos`, `maxYPos`, `zoom`,
  `minZoom`, `maxZoom`.
- Limit setters (passing `null` clears that limit): `setMinXAxis`, `setMaxXAxis`,
  `setMinZAxis`, `setMaxZAxis`, `setMinXPos`, `setMaxXPos`, `setMinYPos`, `setMaxYPos`,
  `setMinZoom`, `setMaxZoom` — all `: void`.

### Game UI utilities — `this.bga.gameui`

- **Animations:** use the BgaAnimations library. `this.bga.gameui.bgaAnimationsActive()`
  returns whether animations should be played — **not** in instantaneousMode
  (fast-replay) or if the tab is not displayed:
  ```js
  if (this.bga.gameui.bgaAnimationsActive()) { /* play an animation */ }
  else { /* just apply the end situation */ }
  ```
  **BgaAnimations uses this function in its setup to handle it automatically** — only
  useful if writing custom animations.
- **Tooltips — don't rely too heavily on them** (not practical on mobile; must not be
  essential to understanding the game).
  - `addTooltip(nodeId, helpStringTranslated, actionStringTranslated, delay?): void` —
    simple text tooltip. Both strings must be specified (empty string if unused). Text
    must be marked with `_()` except an empty string. Generates a **static** tooltip on
    an existing DOM element; call again to update dynamically.
  - `addTooltipHtml(nodeId, html, delay?): void` — HTML tooltip (e.g. a bigger card).
  - `addTooltipToClass(cssClass, helpStringTranslated, actionStringTranslated, delay?): void`
    — text tooltip on all nodes with this CSS class. **All concerned nodes must exist
    and have IDs.**
  - `addTooltipHtmlToClass(cssClass, html, delay?): void` — same ID requirement.
  - `removeTooltip(nodeId: string): void`.
  - Force a tooltip open: `this.bga.gameui.tooltips[id].open(id)`.
- `this.bga.gameui.onScreenWidthChange = () => this.myWidthChangeCallback()` — override
  to manage client-side resizing. Also triggered at load time, so it can adapt to
  viewport size at game start.
- `this.bga.gameui.checkLock(nomessage?: boolean): boolean` — when using `lock: true` in
  an AJAX call, checks if the interface is locked (during a server call and notification
  processing). Use to block other interactions that do not result in an ajax call, or to
  suppress errors. Normally only `this.bga.actions.checkAction(...)` is needed; this is
  for advanced cases.
- The page also mentions `this.bga.gameui.slideToObject()` and similar BGA-provided
  animation functions as automatically handling instantaneous mode, but gives no
  signature for them on the page.
- **Deprecated globals / replay & archive mode:**
  - `globalThis.g_replayFrom` — replay number in a live game; `undefined` when not in
    replay mode. Correct check: `typeof g_replayFrom != 'undefined'`.
  - `globalThis.g_archive_mode` — true if the game is in archive mode *after* the game.
  - `globalThis.g_tutorialwritten` — an object if in tutorial mode, otherwise undefined.
    Tutorial mode is a special case of archive mode.
  - `this.bga.gameui.instantaneousMode` — true during replay/archive mode if animations
    should be skipped. Only needed for custom animations; BGA-provided animation
    functions (bga-animations, bga-cards, bga-dice, `slideToObject()` and similar) handle
    it automatically. Clicking "replay from move #20" replays the game from the
    beginning with moves 0–19 in instantaneous mode and moves 20+ in normal mode.

### Table options — `this.bga.tableOptions`

- `get(optionId)` — returns the **numeric** value of a table option. **Throws an error
  if the option does not exist.**
- `isTurnBased()` — true for turn-based play. `isRealTime()` — true for real-time play.
- `getGameVersion()` — numeric game version recorded when the game page was loaded.
- `getGameLanguage()` — selected language index from the gameinfos file. Returns `null`
  if the table has no language option.

### User preferences — `this.bga.userPreferences`

Preferences are defined in `gamepreferences.jsonc` with ids **100–199**.
- `get(pref_id)` — value currently selected in the select combo box in the top-right menu.
- `set(pref_id, value)` — programmatically change a preference; same effect as the
  player changing it in the menu.
- `onChange` — callback to define if you want to be notified when a user changes a
  preference. Set in the `Game` constructor:
  ```js
  this.bga.userPreferences.onChange = (pref_id, pref_value) => this.myGamePreferenceChanged(pref_id, pref_value);
  // switch (pref_id) { case 201: document.getElementsByTagName('html')[0].classList.toggle('dark-background', pref_value == 2); break; }
  ```
- `toggleVisibility(pref_id, visible)` — hide or show a preference, e.g. hide a
  "Countdown timer on confirm" preference (102) when "Confirm moves" (101) is disabled.

---

## 8. Images, fonts, sounds

### Images (`img/`)

- **All images used in the game interface must be uploaded to the `img` directory.**
- **Filenames must not contain spaces or parentheses** (deployment requirement).
- **Do not use images larger than 4096 × 4096 px** — they will not work on mobile (max
  texture size on Android is 4096).
- **You must use CSS sprites**: combine several images into a single sprite sheet, to
  reduce loaded images / speed loading.
- Use images at higher resolution than needed at default zoom, and display at the needed
  size with CSS **`background-size`** (so browser zoom does not pixelate).
- Use text-free art where possible and **overlay translatable text**; PDF files often
  contain multiple layers — tools like Inkscape can remove text. If the publisher sends
  text-free images, also request the English version as the source for translations.
- Request assets from the publisher as soon as the project starts (print files for
  cards/boards, 2D images of 3D elements from the planned angle, thematic backgrounds,
  metadata images). Print files in PDF are usually ideal.
- **By default, ALL images at the root of `img/` are preloaded** in each player's browser
  on game load. **Images in subdirectories of `img/` are NOT preloaded by default** — use
  subdirectories for images only needed when e.g. an expansion is enabled.
- Control loading with `this.bga.images.preloadImages` / `dontPreloadImages` (see below).
  General recommendation: **no more than a dozen image files, each no larger than 2 MB.**
  Player-specific large assets should be kept separate with preloading disabled.
- Debug: debug menu → Preloaded: **Images** lists all preloaded images.
- Formats: **WebP whenever possible** (small, transparency); **SVG** for icons/abstract
  images (also consider Font Awesome instead of separate asset files); **JPEG** for images
  without transparency (usually smaller than PNG — boards/cards; rounded card corners do
  not require transparency, create them with CSS); **PNG** for images with transparency
  (non-square tokens/meeples, combined into a sprite sheet); **GIF** usable for animated
  images but generally not recommended.
- Tools listed on the page: GIMP, ImageMagick (`magick`, batch/WebP), Inkscape, Photopea,
  ZeroTool Sprite Sheet Generator (WebP sprite sheets + CSS export), Squoosh, SVGOMG.
  AI tools: only for basic manipulation (crop/resize), not AI-altered art.

`this.bga.images`:
- `dontPreloadImage(image_file_name: string)` / `dontPreloadImages(image_file_names: string[])`
  — e.g. `dontPreloadImages([1,2,3,4,5,6].filter(clan => !gamedatas.clans.include(clan)).map(clan => `clan${clan}.png`))`.
- `preloadImage(image_file_name)` / `preloadImages(image_file_names)` — opposite; useful
  **only** for images not in root `img/`, e.g. `preloadImages(['expansion/board.jpg', 'expansion/new-cards.jpg'])` when `gamedatas.expansionActive`.
- `getImgUrl(filename?: string): string` — URL for use in JS (usually images are referenced
  in CSS and don't need JS). `getImgUrl('board.jpg')`, `getImgUrl('expansion/board.jpg')`;
  `getImgUrl()` with no argument returns the URL up to and including `img/`.

### Fonts (`fonts/`)

- **All fonts used in the game interface must be uploaded to the `fonts` directory.**
  Fonts in `fonts/` are loaded in each player's browser when they load the game.
- **Format priority: `woff2` > `woff` > `otf` > `ttf`.**
- **Filenames must not contain spaces or special characters.**
- **Do NOT declare a `@font-face` rule.** Use a font by setting `font-family` to **the
  filename without its extension, with dashes replaced by spaces**. File
  `custom-font.woff2` → `font-family: 'custom font';`. File `custom-font-bold.woff2` →
  either `font-family: 'custom font'; font-weight: bold;` or
  `font-family: 'custom font bold';`.
- Fonts should be freeware. **Include a `.txt` file with the license information
  alongside the font files.**
- Debug: debug menu → Preloaded: **Fonts** lists preloaded font families.

### Sounds (`sounds/`)

- **All sounds used in the game interface must be uploaded to the `sounds` directory.**
- Sound files should use **MP3 or OGG**; for each sound there should be an **`.ogg` and
  an `.mp3`** with that file name in `sounds/`.
- Filenames must not contain spaces or special characters.
- **By default, ALL sounds at the root of `sounds/` are loaded** when the game loads.
  Avoid unused sounds in root. Sounds in subfolders are **NOT** preloaded by default.
- Debug: debug menu → Preloaded: **Sounds**.

`this.bga.sounds`:
- `dontPreloadSounds(sound_file_names: string[])` — **do not include the extension**;
  the method handles both `filename.mp3` and `filename.ogg`. E.g.
  `dontPreloadSounds(['automata-move'])`.
- `preloadSounds(sound_file_names: string[])` — opposite; useful only for sounds not in
  root `sounds/`. E.g. `preloadSounds(['expansion/extramove'])` when
  `gamedatas.expansionActive`.
- `play(id: string): void` — play by id (filename **without extension**). E.g.
  `play('play')`, `play('claw')`.
- `this.bga.gameui.disableNextMoveSound(): void` — disable the standard "move" sound
  **for this move only** (to replace it with a custom sound); add to the notification
  handler.

---

## 9. Stylesheet (CSS / SCSS)

- All CSS rules go in **`<yourgamename>.css` at the root of the project folder**
  (Deep Dive: `deepdivefg.css`, generated from `src/scss/Game.scss` by Sass).
- CSS has three responsibilities: layout, image-sprite rules, thematic background.
- **Drop shadows:** they currently cause significant performance issues in Safari,
  especially with more than one on the page. Alternatives: use `box-shadow` instead
  (works for rectangles including rounded corners, and circles with
  `border-radius: 50%`); bake the shadow into the image (WebP then contains it);
  disable `drop-shadow` in Safari using the `dj_safari` class, automatically added to
  the document:
  ```css
  .game-element { filter: drop-shadow(3px 3px 4px rgba(0,0,0,0.7)); }
  .dj_safari .game-element { filter: none; }
  ```
- Thematic background: `body { background: url('img/background.webp'), #f2f2f2; }`.
  The default BGA background is set on the `html` element, so a background set on
  `body` will cover it.
- Sprite examples on the page: single-row sprite (`.disc`, `background-size: auto 100%`,
  `background-position-x: 0% / 100%` via `data-side`); card sprite (4 rows × 10 cards,
  `background-size: 1000% 400%`, `background-position-x: calc(var(--card-column) * 100% / 9)`,
  `background-position-y: calc(var(--card-row) * 100% / 3)` with `--card-row` /
  `--card-column` custom properties, zero-based).
- Maximum sprite size: images no larger than **4096 × 4096 px**.
- **Dark mode:** BGA supports it natively. When dark mode is enabled, BGA adds
  `data-theme="dark"` to the `html` element. Use the `[data-theme="dark"]` selector to
  override light styles. **Use this selector instead of `@media (prefers-color-scheme: dark)`**,
  because the media query relies on browser settings and ignores the BGA toggle.
  ```css
  body { background: url('img/light-background.webp'), #f2f2f2; }
  [data-theme="dark"] body { background: url('img/dark-background.webp'), #1d1d1d; }
  [data-theme="light"] .player-board { --game-bga-player-panel-background: white; }
  /* no separate dark image? */ [data-theme="dark"] body { background-blend-mode: color-burn; }
  ```
  Common migration problem: an element with a fixed light background color and no text
  color set works in light mode but gives light text on a light background in dark mode.
  Adding `color: black;` to elements with a fixed light background fixes it.
  The BGA extension already overrides `data-theme` based on the user's choice; check its
  source for styles to integrate so all players get them.
- Background user-preference example (pref id 103, "Background": 0 Automatic / 1 Light /
  2 Dark) with CSS keyed on `body[data-background="…"]` combined with
  `[data-theme="…"]`, and a `userPreferences.onChange` callback setting
  `document.body.dataset.background = `${prefValue}``.
- **Using SCSS:** rename `src-disabled` to `src` and write SCSS in `src/scss/`; the build
  setup generates `<yourgamename>.css`. See the VSCode setup page to configure automatic
  builds when saving SCSS files.

---

## 10. Front-end libs

### 10.0 Common loading rules (all ESM libs)

- Load libraries at the top of `modules/js/Game.js` (JS) or in `src/ts/libs.ts`
  (TypeScript), **before any class declarations**.
- Create containers and initialize components in `setup`, **after** the HTML they need
  has been inserted into the page.
- Use `globalThis.importEsmLib('<name>', '1.x')` and **await each module** before using
  its classes/functions. Annotate the returned module with the namespace declared by its
  `.d.ts` file.
- For each library used, download its **Definition file (d.ts)** to the project root.
- Each library page: use Demo to try it, Documentation for the full API, Definition file
  for types. Inspect demo source via browser DevTools Sources tab. Folded **Changelog**
  holds versioning/release notes. Libraries use semver: require `1.x` to get latest fixes
  without risking a breaking change; breaking changes are noted in Changelog.
- TypeScript pattern (`src/ts/libs.ts`):
  ```ts
  const BgaAnimations: typeof globalThis.BgaAnimations = await globalThis.importEsmLib('bga-animations', '1.x');
  const BgaCards: typeof globalThis.BgaCards = await globalThis.importEsmLib('bga-cards', '1.x');
  export { BgaAnimations, BgaCards };
  ```
  At top of `src/ts/Game.ts`: `import { BgaAnimations, BgaCards } from "./libs";`
- JS pattern: `/** @type {typeof globalThis.BgaAnimations} */ const BgaAnimations = await globalThis.importEsmLib('bga-animations', '1.x');`
- UMD libs use a separate mechanism: `importDojoLibs` with an array of module paths;
  it returns constructors **in the same order**:
  ```js
  const [Scrollmap, Zone] = await importDojoLibs(['ebg/scrollmap', 'ebg/zone']);
  ```
  Instantiate returned constructors, e.g. `new Zone()`; loading also makes them
  available under `ebg`, e.g. `new ebg.zone()`. `Counter` is loaded automatically by
  the framework for player scores: `new ebg.counter()` needs no import.
- **Stock is deprecated — do not use for new projects. Use `bga-cards` instead.**

| ESM library | Purpose | Dependencies |
|---|---|---|
| `bga-zoom` | Zoom controls | None |
| `bga-animations` | Animations | None |
| `bga-cards` | Display cards | `bga-animations` |
| `bga-dice` | Display dice | `bga-animations` |
| `bga-autofit` | Fit text within a container | None |
| `bga-score-sheet` | Animated score sheet | None |
| `bga-jump-to` | Board shortcuts | None |

| UMD library | Module path |
|---|---|
| `Draggable` | `ebg/draggable` |
| `Counter` | `ebg/counter` (auto-loaded) |
| `ExpandableSection` | `ebg/expandablesection` |
| `Scrollmap` | `ebg/scrollmap` |
| `Zone` | `ebg/zone` |

### 10.1 bga-animations — CORE for Deep Dive

- JS component to handle animations. Handles **container scaling and rotation during
  animations**, which Dojo animations available through `this` cannot.
  **Promise-based**, so it works easily with `async` notification functions. Relies on
  `Element.animate`. Example game: Reversi. Versions 1.0.0–1.0.2 (1.0.2: fix an error
  when a `parallelAnimation` is null).
- Loading: `const BgaAnimations = await globalThis.importEsmLib('bga-animations', '1.x');`
  Download `bga-animations.d.ts` to project root.
- **`BgaAnimations.Manager`** — constructor takes a settings object:
  ```js
  // In Game.js setup
  this.animationManager = new BgaAnimations.Manager({
      animationsActive: () => this.bga.gameui.bgaAnimationsActive(),
  });
  ```
  Bind it to `gameui.bgaAnimationsActive()`. **Only set up an animation manager if you
  do not already have one. Otherwise, reuse the existing one.**
- Methods named on the page:
  ```js
  async notif_moveMeeple(args) {
      const meepleDiv = document.getElementById(`player-meeple-${args.playerNo}`);
      const destinationDiv = document.getElementById(`table-slot-${args.slot}`);
      await this.animationManager.slideAndAttach(meepleDiv, destinationDiv);
  }
  async notif_scoreMeeple(args) {
      const meepleDiv = document.getElementById(`player-meeple-${args.playerNo}`);
      await this.animationManager.displayScoring(meepleDiv, args.score, this.bga.players.getPlayerByNo(args.playerNo).color);
  }
  ```
  - `slideAndAttach(element, destinationElement)` — slide an element to, and attach it
    into, a destination container. `await` it in async notif handlers.
  - `displayScoring(element, score, color)` — scoring animation; colour in the example
    is the player's colour via `this.bga.players.getPlayerByNo(playerNo).color`.
  - `slideOutAndDestroy(element)` — named only in Developer Notes; no signature/example
    given on this page.
  - No other animation methods (e.g. no method literally named `flip` or `slide` alone)
    are named on this page — flip/rotate handling is described for bga-cards. The full
    method list is in the linked Documentation / `.d.ts`.
- **Developer notes — mandatory conventions:**
  - **Style animated elements with CSS class selectors, NOT ID or parent-based
    selectors.** Animations typically **clone the element to animate (giving it a new
    ID)**, and DOM parentage may change. Symptoms if violated: `slideOutAndDestroy`
    simply causes the element to disappear, or `slideAndAttach` causes the element to
    "jump" to the destination.
  - **Animating absolutely positioned elements might not behave as expected. Instead,
    animate elements to or from container elements**, which can be positioned absolutely.

### 10.2 bga-cards — CORE for Deep Dive

- JS component to display cards. Handles associated animations (moving between stocks,
  **flipping or rotating** the cards). Examples: Frenchtarot (JS), Verso (TypeScript).
  Hearts tutorial also uses bga-cards. **Requires `bga-animations`.** Download **both**
  `bga-animations.d.ts` **and** `bga-cards.d.ts` to project root. Versions 1.0.0–**1.0.14**.
- **`BgaCards.Manager`** — note: the class is `Manager` under the `BgaCards` namespace,
  **not** `CardManager` (that name does not appear on the page):
  ```js
  this.animationManager = new BgaAnimations.Manager({
      animationsActive: () => this.bga.gameui.bgaAnimationsActive(),
  });
  this.cardsManager = new BgaCards.Manager({
      animationManager: this.animationManager,
      type: 'mygame-card',
      getId: (card) => card.id,
      setupFrontDiv: (card, div) => {
          div.style.background = 'blue';
          this.bga.gameui.addTooltipHtml(div.id, `tooltip of ${card.type}`);
      },
  });
  ```
  Settings shown: `animationManager`, `type` (CSS class/type string), `getId`,
  `setupFrontDiv`. `setupBackDiv` and `isCardVisible` are also manager settings (see
  below). Full settings list is in the linked Documentation / `.d.ts`, not here.
- **`BgaCards.LineStock`** — the only stock class given with a constructor example:
  ```js
  this.cardStock = new BgaCards.LineStock(this.cardsManager, document.getElementById('card-stock'));
  this.cardStock.addCards(gamedatas.cards);
  // Cards should look like [{ id: 1, type: 3, type_arg: 2, location: 'table', location_arg: 0 }]
  ```
  Signature pattern: `new BgaCards.LineStock(manager, containerElement)`.
- **`SlotStock` / `HandStock` / `GridStock` / `VoidStock` / `Deck`:** **no constructor or
  signature is given on this overview page.** The words "slot stock" appear only in the
  1.0.10/1.0.12 changelog notes (moving a card inside a slot stock with `addCard`;
  duplication when adding to another slot of the same stock). `VoidStock` is named only
  via `VoidStock.addCards` (1.0.9) and `autoPlace` with `VoidStock` (1.0.6); `HandStock`
  only via the 1.0.7 blinking fix; `GridStockSettings` only via 1.0.10.
  **Do not invent their constructors from this page — fetch the linked Documentation /
  `bga-cards.d.ts`.**
- Stock methods named:
  - `addCards(cards)` — async; accepts arrays **and, as of 1.0.14, keyed objects**.
    Card shape: `{ id, type, type_arg, location, location_arg }`.
    ```js
    async notif_revealNewCards(args) { await this.cardStock.addCards(args.newCards); }
    ```
  - `addCard(card)` — singular; mentioned in 1.0.10 as the way to move a card inside a
    slot stock.
  - `removeCards(cards, settings)` — async; settings shown:
    ```js
    await this.lineStock.removeCards(cards, {
        fadeOut: true,
        slideTo: document.getElementById(`otherhand_${playerNo}`),
    });
    ```
  - `removeCard(...)` — singular; 1.0.7 notes `removeCard.fadeOut` without `slideTo`.
  - `setSelectableCards(...)` — **not async** (explicitly contrasted with async `addCards`).
  - `getLastPlayedCardStyle()` — named in 1.0.10 (reads `settings?.selectedCardStyle`).
  - Settings/fields mentioned in changelog only: `lastPlayedCardStyle`,
    `selectedCardStyle`, `emptyHandMessage`, `autoPlace`.
- **Card display — sprite markup (mandatory: stock does NOT work out of the box).**
  "If you use the stock component, the card images will not work out of the box. You
  have to add sprite markup manually" in the card manager constructor. Sprite-sheet
  positioning in `setupFrontDiv`:
  ```js
  setupFrontDiv: (card, div) => {
      div.style.backgroundPositionX = `calc(100% / 14 * (${card.type_arg} - 2))`; // 14 = columns − 1
      div.style.backgroundPositionY = `calc(100% / 3 * (${card.type} - 1))`;     // 3 = rows − 1
  }
  ```
  Alternative — data attributes + own CSS:
  ```js
  setupFrontDiv: (card, div) => {
      div.dataset.type = card.type;       // suit 1..4
      div.dataset.typeArg = card.type_arg; // value 2..14
  }
  ```
- **Card faces — two-faced cards / flip.** Component supports two-faced cards, so flip
  animations work in most cases. Define the card back with **`setupBackDiv`** in the
  manager. The function determining which face is up is **`isCardVisible`**. Redefine it
  to determine the side dynamically. Default: `isCardVisible: (card) => card.type`.
  Recommended to write a custom function (which may just be `isCardVisible: () => true`
  if cards are always visible).
- **Void Stock.** As of 1.0.7, `VoidStock` **still lacks some animations, such as shrink
  and `fadeOut`**. Achieve the same effect **without** `VoidStock` by providing animation
  settings to `removeCards` (see `fadeOut: true, slideTo: …` above).
- **Asynchronicity — mandatory rule.** Many functions that add or remove cards are
  **async (return a Promise)**. If you call them one after another, you **must await or
  chain them**. Account for pending promises in `setup()`, `onEnteringState()`, and
  similar methods. Example: `addCards` is async, while `setSelectableCards` is **not**.
  If you add cards to your "hand" in `setup` and try to set which cards are selectable
  in `onEnteringState`, it will not work properly **unless you also defer the call to
  `setSelectableCards` using `setTimeout`**.

### 10.3 bga-dice

- Display dice; handles animations such as **rolling and moving between stocks**.
  Requires `bga-animations`; download `bga-animations.d.ts` + `bga-dice.d.ts`.
  Versions 1.0.0–1.0.2.
- `BgaDice.Manager({ animationManager, type: 'my-game-die' })` — only set up an animation
  manager if you do not already have one; otherwise reuse it.
- `BgaDice.LineStock(manager, element)`:
  ```js
  this.dieStock = new BgaDice.LineStock(this.diceManager, document.getElementById('dice-stock'));
  this.dieStock.addDice(gamedatas.dice); // [{ id: 1, face: 5, location: 'table' }]
  async notif_rollDice(args) { await this.dieStock.rollDice(args.rolledDice); }
  ```
- Methods named: `addDice(dice)`, `rollDice(dice)`, `getDice()`.
- Simple d6 example: `setupFaceDiv(die, element, face) { element.innerText = `${face}`; }`
  as a Manager setting; CSS classes `.bga-dice_die-face`, `.<type>-face-1` …
  `.<type>-face-6`. Roll example mutates `die.face = Math.floor(Math.random()*6)+1` then
  calls `rollDice(dice)`.
- Page ends: "Look at the demo page and the demo source code for a list of all
  possibilities!" — full API is not on this page.
- **Deep Dive: no dice use — do not add it.**

### 10.4 bga-autofit

- Make text fit fixed-size boxes; main use is translated text on game cards fitting the
  dedicated space in the card image. No dependencies. Versions 1.0.0–1.0.1 (1.0.1: reapply
  autofit when an element is made visible).
- Loading: `const BgaAutofit = await globalThis.importEsmLib('bga-autofit', '1.x');`
  → namespace `globalThis.BgaAutofit`; download `bga-autofit.d.ts`.
- **Only API: `BgaAutofit.init()`** — call once, at the end of `setup`:
  ```js
  BgaAutofit.init();
  ```
- Markup: add class `bga-autofit` to any fixed-size element whose text should fit:
  `<div class="my-class-for-fixed-size bga-autofit">${text}</div>`.
- Works for `bga-autofit` divs added **after** setup finishes (uses a `MutationObserver`).
  **Make sure you only call `BgaAutofit.init();` once!**

### 10.5 bga-jump-to

- Add shortcuts to the different boards of the game. **Use only if the game has many
  boards that do not usually fit on the screen. Showing it when there are few elements
  will unnecessarily clutter the game area.** Examples: Akropolis, Knarr, Path of
  Civilization. Version 1.0.0 only.
- Loading: `const BgaJumpTo = await globalThis.importEsmLib('bga-jump-to', '1.x');`
  download `bga-jump-to.d.ts`.
- API:
  - `BgaJumpTo.Entry(label, targetId, styleOptions)`:
    ```js
    const entries = [
        new BgaJumpTo.Entry(_('Main board'), 'table-center', { color: '#224757', backgroundImage: `url('${this.bga.images.getImgUrl('board.jpg')}')` }),
    ];
    ```
  - `BgaJumpTo.BgaPlayerEntries(bga, { entryTarget })` — one entry per player:
    ```js
    entries.push(...BgaJumpTo.BgaPlayerEntries(this.bga, {
        entryTarget: playerId => `player-table-${this.bga.players.getPlayerNoById(playerId)}`,
    }));
    ```
    `BgaPlayerEntries` passes a **player ID** to `entryTarget`; convert it with
    `getPlayerNoById` to target containers whose IDs use player numbers.
  - `BgaJumpTo.Manager({ localStorageFoldedKey, entries })`:
    ```js
    new BgaJumpTo.Manager({ localStorageFoldedKey: LOCAL_STORAGE_JUMP_TO_FOLDED_KEY, entries });
    ```
    Define `const LOCAL_STORAGE_JUMP_TO_FOLDED_KEY = '<yourgamename>-folded';` so the
    user's preferred folded state is stored on their device.
- **Deep Dive: only if the game ever has many boards that don't fit on screen; otherwise
  explicitly discouraged (clutter). Likely not needed.**

### 10.6 bga-score-sheet

- Display an **animated score sheet at the end of the game**. No dependencies. Version
  1.0.0 only.
- Loading: `const BgaScoreSheet = await globalThis.importEsmLib('bga-score-sheet', '1.x');`
  download `bga-score-sheet.d.ts`.
- **Player-ID vs player-number rule (stated twice on the page):** the library expects
  `players` and score objects **keyed by player ID**, and passes an **ID** to
  `onScoreDisplayed`. Keep this format at the library boundary and convert to a player
  number when accessing framework player panels.
- **`BgaScoreSheet.ScoreSheet(containerElement, settings)`**, constructed at the end of
  `setup` into an empty div in the template:
  ```js
  this.scoreSheet = new BgaScoreSheet.ScoreSheet(
      document.getElementById(`my-score-sheet`),
      {
        animationsActive: () => this.bga.gameui.bgaAnimationsActive(), // prevent animations during fast replay
        playerNameWidth: 80, playerNameHeight: 30,
        entryLabelWidth: 120, entryLabelHeight: 20,
        classes: 'score-sheet-background',
        players: gamedatas.players,
        entries: [
          { property: 'conquest-cards', label: _('Conquest cards'), labelClasses: 'entries-label' },
          { property: 'total', label: _('Total'), labelClasses: 'entries-label', scoresClasses: 'total', width: 80, height: 40 },
        ],
        scores: gamedatas.endScores, // set if game state is 99, otherwise null, so scores appear immediately on reload after the game ends; if unset, the sheet is hidden by default
        onScoreDisplayed: (property, playerId, score) => {
          if (property === 'total') {
            const playerNo = this.bga.players.getPlayerNoById(playerId);
            this.bga.playerPanels.getScoreCounterByNo(playerNo).setValue(Number(score));
          }
        },
      }
  );
  ```
  Settings named: `animationsActive`, `playerNameWidth`, `playerNameHeight`,
  `entryLabelWidth`, `entryLabelHeight`, `classes`, `players`, `entries[]` (`property`,
  `label`, `labelClasses`, `scoresClasses`, `width`, `height`), `scores`,
  `onScoreDisplayed(property, playerId, score)`.
- Method: **`scoreSheet.setScores(endScores, { startBy })`** — setting scores makes the
  sheet visible if hidden:
  ```js
  async notif_endScores(args) {
      const playerNo = this.bga.players.getCurrentPlayerNo();
      await this.scoreSheet.setScores(args.endScores, {
          // The library expects an ID here; spectators have no player number.
          startBy: playerNo === null ? undefined : this.bga.players.getPlayerIdByNo(playerNo)
      });
  }
  ```
  (Assumes `bgaSetupPromiseNotifications` for async notifications.)
- PHP/server side (exact format the notif must use — keys are **player IDs**, score keys
  must match entry `property` names):
  ```php
  $endScores = [ 156463 => [ 'conquest-cards' => 18, 'total' => 34 ], 278971 => [ 'conquest-cards' => 31, 'total' => 41 ] ];
  function stEndScore(): void {
    $this->bga->notify->all('endScores', '', [ 'endScores' => $this->getEndScores() ]);
  }
  // getAllDatas — display on refresh when already over:
  $isEndScore = intval($this->gamestate->state_id()) >= ST_END_SCORE;
  $result['endScores'] = $isEndScore ? $this->getEndScores() : null;
  ```
- **Deep Dive: useful only for an animated end-of-game score breakdown.** If adopted,
  `endScores` must be keyed by player ID (not number), `scores: gamedatas.endScores`
  when state is 99 / null otherwise, and `onScoreDisplayed` must convert ID → number
  via `getPlayerNoById`.

### 10.7 bga-zoom

- Add zoom controls to the game area, plus an autoscale feature that automatically zooms
  out on load so a requested width fits the screen. Example: Azul: Queen's Garden.
  Versions 1.0.0–1.0.2 (1.0.2: fix default state at min/max zoom; 1.0.1: light/dark themes).
- Loading: `const BgaZoom = await globalThis.importEsmLib('bga-zoom', '1.x');`
  download `bga-zoom.d.ts`.
- **Only API documented on the page — `BgaZoom.Manager` constructor:**
  ```ts
  new BgaZoom.Manager({
      element: document.getElementById('full-table')!,
      zoomControls: { color: 'black' },
      localStorageZoomKey: LOCAL_STORAGE_ZOOM_KEY,
      autoZoom: { expectedWidth: 1600, minZoomLevel: 0.25 },
  });
  ```
  Define `const LOCAL_STORAGE_ZOOM_KEY = '<yourgamename>-zoom';`.
- The game area is scaled using **CSS zoom**. **Old Dojo animations are not compatible
  with it, but the `bga-animations` library is.**
- No programmatic zoom-in / zoom-out / get-zoom methods are documented on this page —
  only the `Manager` config above. Check `bga-zoom.d.ts` for anything beyond `Manager`.

### 10.8 Counter (`ebg/counter`)

- Simple control to set/get a numeric value displayed in a `div` or `span`, and animate
  changes between values. Used for the built-in score counter in player panels.
  **Loaded by default by BGA — no import needed.**
- Setup:
  ```js
  this.bga.gameArea.getElement().insertAdjacentHTML('beforeend', `<span id="my_counter"></span>`);
  /** @type {Counter} */
  const counter = new ebg.counter();
  counter.create('my_counter');
  ```
  The target passed to `create` can be an element ID **or** an existing DOM element.
- API: `create(target, settings?)` — settings: `value` (initial value; `null` to
  disable), `tableCounter` (name of the PHP-side `TableCounter`, to update display
  automatically when value changes), `playerCounter` + `playerId` (name of PHP-side
  `PlayerCounter` + player ID, to update automatically). `playerCounter` **requires an
  ID** — if you have a player number, use `playerId: this.bga.players.getPlayerIdByNo(playerNo)`.
  `getValue()`; `incValue(by)` — increment, animating from the previous value;
  `setValue(value)` — set **without** animation; `toValue(value)` — set **with**
  animation; `disable()` — set displayed value to `"-"` (only changes display once;
  does not disable the counter); `speed` (property, animation duration, default `100`,
  e.g. `x.speed = 300` to make it slower).
- Per-player pattern (mandatory convention):
  ```js
  /** @type {Record<number, Counter>} player no => counter */
  stone_counters = {};
  // In setup — gamedatas.players is keyed by PLAYER ID, never treat keys as player numbers:
  for (const player of Object.values(gamedatas.players)) {
      const playerNo = this.bga.players.getPlayerNoById(Number(player.id));
      this.bga.playerPanels.getElementByNo(playerNo).insertAdjacentHTML('beforeend', this.getPlayerBoardTemplate(playerNo));
      this.stone_counters[playerNo] = new ebg.counter();
      this.stone_counters[playerNo].create(`stonecount_p${playerNo}`);
  }
  ```
  To distinguish the current player, compare `playerNo` with
  `this.bga.players.getCurrentPlayerNo()` (`null` for spectators).

### 10.9 Draggable (`ebg/draggable`)

- The component that supports drag and drop. Example shows use with Stock; full
  implementation in the `sharedcode` game on BGA.
- API (only example given — no separate API reference on the page):
  ```js
  const draggableObj = new ebg.draggable();
  draggableObj.create(this.bga.gameui, targetDivId, targetDivId);
  draggableObj.onStartDragging = (item_id, left, top) => { /* ... */ };
  draggableObj.onDragging = (item_id, left, top, dx, dy) => { /* ... */ };
  draggableObj.onEndDragging = (item_id, left, top, bDragged) => { /* ... */ };
  ```
  Stock example: `onDragging` computes a drop target via `getDragTarget(item_id, allDragTargets, left, top)`
  and toggles a `.drag_target_hover` class; `onEndDragging` returns early
  `if (!bDragged) return;`, then moves the card between Stocks via
  `fromstock.getItemTypeById(cardId)` / `tostock.addToStockWithId(cardType, cardId)` /
  `fromstock.removeFromStockById(cardId)`, else `fromstock.resetItemsPosition()`.
- **Modern alternatives — the page's explicit recommendation (do not skip this):**
  > "Draggable was created a long time ago, before HTML5 supported drag and drop.
  > **It is probably best to use native browser APIs now.**"
  - **Pointer Events API** — CodePen `https://codepen.io/VictoriaLa/pen/MWOgYYZ`
    (also works on mobile). Game: **Century**.
  - **Native HTML Drag and Drop API** — CodePen `https://codepen.io/VictoriaLa/pen/rNGXKxj`
    (**does not work in mobile browsers**, and Chrome currently does not fire most of the
    events). Game: **Patchwork**.

### 10.10 ExpandableSection (`ebg/expandablesection`)

- Setup: `const [expandablesection] = await importDojoLibs(['ebg/expandablesection']);`
- API:
  ```js
  this.expanded = new ebg.expandablesection();
  this.expanded.create(this.bga.gameui, "my_expandable");
  this.expanded.expand();   // show
  this.expanded.collapse(); // hide
  this.expanded.toggle();   // switch show/hide
  ```
- Required HTML structure:
  ```html
  <div id="my_expandable" style="border: 1px solid black">
      <a href="#" id="my_click_to_toggle" class="expandabletoggle expandablearrow"><div class="icon20"></div></a>
      <div id="my_hidden_content" class="expandablecontent">Here's the hidden content</div>
  </div>
  ```
  Give the inner elements IDs so the component can find them. The section **already
  starts with click-to-toggle behaviour**, so you probably won't need to toggle in your
  own code — just set the initial state in `setup`.
- Helper for repeated sections (verbatim on the page; `content` is trusted HTML generated
  by your game; `parentId` is an existing container, `id` must be unique):
  `placeExpandableSection(parentId, id, content)` inserts the div above into `parentId`,
  then initialise an `ebg.expandablesection` for each section.

### 10.11 Scrollmap (`ebg/scrollmap`)

- Client-side component for displaying an **infinite** game area (players build the main
  area with tiles/cards, no boundaries). Supports **scrolling** (arrow buttons
  top/bottom/left/right) and **panning** (drag the surface with the mouse). Examples:
  **Carcassonne, Saboteur, Taluva**. Warning: some games use an *advanced* scrollmap
  module which replaces the basic scrollmap described here — check **Alternative
  implementations of BGA modules** in **BGA Code Sharing**.
- Setup: `const [scrollmap] = await importDojoLibs(['ebg/scrollmap']);`
- Required HTML (in `setup`):
  ```html
  <div id="map_container">
      <div id="map_scrollable"></div>
      <div id="map_surface"></div>
      <div id="map_scrollable_oversurface"></div>
      <div class="movetop"></div><div class="movedown"></div>
      <div class="moveleft"></div><div class="moveright"></div>
  </div>
  ```
- Required CSS (adaptable, except as noted):
  ```css
  #map_container { position: relative; overflow: hidden; width: 100%; height: 400px; }
  #map_scrollable, #map_scrollable_oversurface { position: absolute; }
  #map_surface { position: absolute; top: 0px; left: 0px; width: 100%; height: 100%; cursor: move; }
  .movetop,.moveleft,.moveright,.movedown { display: block; position: absolute; background-image: url('../../../img/common/arrows.png'); width: 32px; height: 32px; }
  ```
  **Rule: do not change the position, width, or height of `map_surface`; it must exactly
  fill the container.**
- Initialisation:
  ```js
  this.scrollmap = new ebg.scrollmap();
  this.scrollmap.create(
      document.getElementById('map_container'),
      document.getElementById('map_scrollable'),
      document.getElementById('map_surface'),
      document.getElementById('map_scrollable_oversurface'),
  );
  this.scrollmap.setupOnScreenArrows(150); // scroll by 150 px per click
  ```
- API: `create(container_div, undersurface_div, surface_div, onsurface_div)` — **must be
  called before use**; params are `HTMLElement`s. **Note: this method also calls
  `scrollto(0,0)`, which is animated. Before adjusting the position, wait for the
  animation to finish (currently 350 ms).** `scroll(dx, dy [, duration [, delay]])` —
  relative offset, animated, defaults `350` / `0`. `scrollto(x, y [, duration [, delay]])`
  — centre on the given position (`0,0` = centre). `disableScrolling()` /
  `enableScrolling()`.
- **Layer rules (the core of the page — mandatory):** place elements **only** in
  `map_scrollable` or `map_scrollable_oversurface`; all layers scroll synchronously.
  `map_scrollable` is **beneath** the panning surface: use it for elements that do
  **not** need clicks (users can start panning from a point on that element).
  `map_scrollable_oversurface` is **above** the surface: use it for elements that
  **need clicks / user interaction**, otherwise clicks cannot reach them. Tip: place a
  game element in `map_scrollable` and a corresponding **invisible element above the
  surface** to handle interactions when an interactive element must appear beneath a
  non-interactive one. If `map_scrollable_oversurface` covers `map_surface` completely,
  panning is impossible unless CSS is adjusted. By default the game area is centred at
  `(0,0)`.
- Customisations: disable arrows (remove their HTML, skip `setupOnScreenArrows()`);
  enlarge zone (footer link `#enlargedisplay`, `onIncreaseDisplayHeight` adds 300 px to
  container height); fall-through mouse events on oversurface
  (`#map_scrollable_oversurface { pointer-events: none; } #map_scrollable_oversurface > * { pointer-events: initial; }`);
  avoid scrolling on touch devices (`#map_container { touch-action: none; }`); zooming
  is difficult because layers must stay aligned — scale **both** scrollable layers
  together (manual approach, clamp 0.2–2, step 0.1, via `style.transform = scale(…)` on
  both layers). May link to a user preference.

### 10.12 Zone (`ebg/zone`)

- Component to organise items of the same type inside a predefined space. In action:
  **Can't Stop** (diagonal mode), **Niagara** (custom mode).
- Setup: `const [zone] = await importDojoLibs(['ebg/zone']);`
- Constructor + creation:
  ```js
  // In Game.js constructor
  this.myZone = new ebg.zone();
  // In setup — attach to a div, set width (optionally height/position) in CSS: #my_zone { width: 100px; }
  this.myZone.create(this.bga.gameui, 'my_zone', <item_width>, <item_height>);
  this.myZone.setPattern(<mode>);
  ```
  `<item_width>` / `<item_height>`: integers, size of the objects to organise.
  `<mode>`: `'grid'`, `'diagonal'`, or `'custom'`.
- **Warning (mandatory):** since the Zone width is defined statically, make sure items do
  not overflow on small screens. **If you need a responsive component, consider using
  the Stock component instead.**
- Core API: `create(gameui, zoneId, item_width, item_height)`; `setPattern(pattern_name)`;
  `placeInZone(object_id, weight?)` — `object_id` is the string ID; `weight` optional,
  used to sort items. Item HTML must be created first, e.g. `insertAdjacentHTML` a
  `<div id="my_object_id" class="my-item">`, then `placeInZone('my_object_id')`.
  `removeFromZone(object_id, destroy?, to?)` — `destroy?` boolean, destroy after removal;
  `to` — destination the object slides to when removed, before being destroyed if
  requested. `removeAll()`; `getItemNumber()`; `getAllItems()` — array of the IDs of all
  items.
- Patterns (all six):
  - **`grid`** (default if `setPattern` never called): single horizontal row if space
    allows; wraps to next line when horizontal space is insufficient.
  - **`diagonal`**: illusion of stacks. Each successive item is offset below + right of
    the previous by `item_margin` pixels (**default `5`**). Adjust thickness:
    `this.zone.diagonal_zone_3.item_margin = 2;` (thin) vs `= 36;` (fully displayed).
  - **`verticalfit`**: single column regardless of space. Without min/max-height, items
    stack upward with `item_margin` (5 px default) between them. With more space than one
    item but less than all, items overlap just enough to fit the allotted height; with
    enough space, a plain vertical column. If space exceeds items + margins, the column
    is **centred** within the container's min-height.
  - **`horizontalfit`**: single row regardless of space. Width unset → assumed same as
    parent. Width set but too small → items overlap just enough to fit; enough space →
    plain row (almost identical to `grid` with enough space but without margins by
    default). Excess space → row **centred** within min-width.
  - **`ellipticalfit`**: items in a circular/elliptical arrangement with equal radial
    distances. Enough space → one non-overlapping circle; insufficient space → extra
    items form an additional concentric circle, overlapping if space is still insufficient.
  - **`custom`**: complete control — determine coordinates by item number when added:
    ```js
    this.zone.setPattern('custom');
    this.zone.itemIdToCoords = function(i, control_width) {
        if (i % 8 == 0)      { return { x: 1,  y: 19, w: 60, h: 30 }; }
        else if (i % 8 == 1) { return { x: 30, y: 38, w: 60, h: 30 }; }
        // … i%8 == 2..7 each return { x, y, w, h }
    };
    ```

---

## 11. Front-end unit testing

Tests run the game's JavaScript/TypeScript **locally, without opening a Studio table**.
Useful for checking which elements appear, how notifications change the interface, and
which action a click sends to the server. Uses **Vitest** (run tests, assertions, replace
dependencies) + **jsdom** (provides `document`, `window`, other browser APIs). Same setup
supports JS and TS and works alongside the Studio project's Rollup build.

- Install (from game root): `npm install --save-dev vitest@^5 jsdom@^29`. If npm reports
  an unsupported Node.js version, update to the latest Node.js LTS and rerun.
- `package.json` scripts (keep existing build/watch commands):
  ```json
  "test:frontend": "vitest run",
  "test:frontend:watch": "vitest"
  ```
  The PHP unit-testing guide provides an optional `test:php` command, so each suite can
  be run by name. **Commit `package.json` and `package-lock.json`.** Another developer
  runs `npm ci`. Keep `node_modules`, `.vitest`, `coverage` **out of Git and SFTP uploads**
  — add to existing `.gitignore` and `.vscode/sftp.json` ignore lists if needed.
  **Tests do not need to be uploaded to Studio.**
- Runner config — `vitest.config.mjs` (game root; `.mjs` makes it an ES module without
  changing the rest of the project's module config):
  ```js
  import { defineConfig } from 'vitest/config';
  export default defineConfig({
      test: {
          environment: 'jsdom',
          include: ['src/tests/**/*.test.{js,ts}'],
          setupFiles: ['./src/tests/setup.js'],
          restoreMocks: true,
          unstubGlobals: true,
      },
  });
  ```
- Setup file — `src/tests/setup.js` (keep as JavaScript for either language; Vitest loads
  it before importing each test file):
  ```js
  import { afterEach, vi } from 'vitest';
  vi.stubGlobal('importEsmLib', async (name) => {
      if (name === 'bga-animations') { return {}; }
      throw new Error(`Unexpected BGA library import: ${name}`);
  });
  afterEach(() => { document.body.replaceChildren(); vi.useRealTimers(); });
  ```
  Clears the DOM and restores real timers after each test. The Reversi JS module also
  loads `bga-animations` when imported; the substitute allows that import without
  downloading a library from BGA. These tests do not construct an animation manager, so
  they need no animation implementation. **Other unexpected library imports fail
  immediately.** `restoreMocks` restores spied-on methods; `unstubGlobals` restores globals
  replaced with `vi.stubGlobal()` before the next test. If a test needs a global while it
  runs, install that substitute in its `beforeEach`, rather than relying on the
  import-time substitute.
- Example — test Reversi's selectable squares (`PlayDisc.updatePossibleMoves()`):
  JS: the state class is declared inside `modules/js/Game.js` — add a named export at the
  end of that file (`export { PlayDisc };`). TS: the state class is already exported:
  ```ts
  import { PlayDisc } from '../ts/States/PlayDisc';
  ```
  This path follows the skeleton's `src/ts/States/` directory. **Import the TypeScript
  source, so tests do not depend on a previous Rollup build.**
  ```js
  describe('PlayDisc.updatePossibleMoves', () => {
      let state;
      beforeEach(() => {
          document.body.innerHTML = '<div id="board"></div>';
          const board = document.getElementById('board');
          for (let y = 1; y <= 8; y++) for (let x = 1; x <= 8; x++)
              board.insertAdjacentHTML('beforeend', `<div id="square_${x}_${y}" class="square"></div>`);
          // This method only uses the DOM, so skip the game and BGA constructor dependencies.
          state = Object.create(PlayDisc.prototype);
      });
      it('highlights the supplied possible moves', () => {
          state.updatePossibleMoves([{ x: 3, y: 5 }, { x: 4, y: 6 }]);
          expect(selectableIds()).toEqual(['square_3_5', 'square_4_6']);
      });
      it('replaces the previous possible moves', () => {
          state.updatePossibleMoves([{ x: 3, y: 5 }]);
          state.updatePossibleMoves([{ x: 6, y: 4 }]);
          expect(selectableIds()).toEqual(['square_6_4']);
      });
      it('clears the highlights when there are no possible moves', () => {
          state.updatePossibleMoves([{ x: 3, y: 5 }, { x: 4, y: 6 }]);
          state.updatePossibleMoves([]);
          expect(selectableIds()).toEqual([]);
      });
  });
  function selectableIds() {
      return Array.from(document.querySelectorAll('.square.selectable'), square => square.id).sort();
  }
  ```
  `Object.create(PlayDisc.prototype)` gives the actual state methods without running the
  constructor — sufficient because `updatePossibleMoves()` only reads/changes DOM. For
  methods using instance fields, initialise those fields or construct the state with the
  specific dependencies it needs.
- Run: `npm run test:frontend`; `npm run test:frontend -- src/tests/PlayDisc.test.js`;
  `npm run test:frontend -- -t "replaces the previous possible moves"`;
  `npm run test:frontend:watch` (rerun when files change). For TypeScript use `.test.ts`.
- **TypeScript checking (mandatory companion):** Vitest executes TypeScript but **does
  not type-check it by default**. Keep a separate check. Create `tsconfig.test.json`:
  ```json
  { "extends": "./tsconfig.json",
    "compilerOptions": { "noEmit": true, "rootDir": ".", "skipLibCheck": true },
    "include": ["*.d.ts", "src/ts/**/*.ts", "src/tests/**/*.ts"],
    "exclude": ["node_modules"] }
  ```
  Add `"test:types": "tsc -p tsconfig.test.json"` to `package.json`. Run
  `npm run test:types` alongside `npm run test:frontend`. **Keep tests out of the
  production build config:** the skeleton includes `src/ts/`, while tests live in
  `src/tests/`. If your project includes all of `src/`, exclude `src/tests/` from its
  production `tsconfig.json`.
- Other framework dependencies: keep substitutes small and specific to the behaviour
  under test. E.g. when testing an action handler, replace `bga.actions.performAction`
  with `vi.fn().mockResolvedValue({})` and assert the action name and arguments. Use
  `vi.stubGlobal()` for globals such as `_`, and `vi.spyOn()` for existing methods.
  Create fresh dependency objects in `beforeEach` so calls and mutable data do not carry
  over between tests. For timers, use `vi.useFakeTimers()` and advance time explicitly;
  await asynchronous handlers before checking results. If an imported module loads a BGA
  library and you need more control than the setup above provides, use Vitest's module
  mocking to replace that module. Keep ES module imports in tests; **no CommonJS
  conversion or changes to Node's module resolver are needed.**
- **What to test next (per the guide):** a notification updating a counter, a click
  sending the expected action, a state adding the correct buttons, leaving a state
  removing its highlights. When fixing a front-end bug, reproduce it with a test that
  expects the corrected behaviour.

---

## 12. Deep Dive audit — conforms, gaps, and candidates

Verified against the current tree (`~/workspace/deepdivefg`, commit `fc7a29d`).
Line references are to the files as read on 2026-11-20.

### Conforms

- **Modern state classes.** `src/ts/Game.ts:1–4,16–28` registers the four states in the
  constructor via `this.bga.states.register('PlayerDiveStep', …)` etc., each with
  `onEnteringState(args, isCurrentPlayerActive)` / `onLeavingState(…)` and the
  `(game, bga)` constructor the docs show. `Game` stores `this.bga`.
- **`setup` rebuilds from `gamedatas`.** `src/ts/Game.ts:35–36` clears
  `this.bga.gameArea.getElement()` and re-renders via `insertAdjacentHTML`, and
  `src/ts/Game.ts:72` injects per-player panel content — the documented pattern.
- **Actions are click-only.** All nine `performAction` calls (`src/ts/Game.ts:355–395`:
  `actFlipTile`, `actTakeFaceup`, `actSkipDepth`, `actIngestRock`, `actKeepFlipped`,
  `actDiveDeeper`, `actSelectRetreatTile`, `actRetreatEmpty`, `actChooseAiTile`) are
  reached from tile clicks / status-bar buttons, never from loops, callbacks,
  notifications, or state-entry handlers. No forbidden `$…` argument names are used.
- **Dialogs avoided for routine choices.** `ConfirmFlipOrDive` uses status-bar buttons
  (`src/ts/States/ConfirmFlipOrDive.ts:18,25`), not `dialogs.confirmation()` — matching
  the "avoid confirmation dialogs" guidance for a routine flip/dive choice.
- **Notification handler signature is defensive.** `notif_*` handlers in
  `src/ts/Game.ts:422–555` accept `(notif: any)` and unwrap via `getNotifArgs`
  (`notif.args ?? notif`), so they work whether the framework passes `args` or the full
  `notif` object.
- **No reserved notification names** are used (`tileFlipped`, `tileCollected`,
  `penguinMovedDepth`, `predatorTrapped`, `penguinRetreat`, `rockIngested`,
  `gameEndTriggered`, `lastDiveFlipped` — none is on the reserved list in §5).
- **No `ebg.stock`** — the deprecated Stock is not used anywhere.
- **SCSS build matches the documented pattern:** SCSS in `src/scss/Game.scss`, generated
  `deepdivefg.css` at project root via `npm run build:scss`.

### Gaps / violations to fix

1. **bga-cards / bga-animations are NOT actually loaded — the plan's claim is
   aspirational.** `src/ts/libs.ts` is **entirely commented out** (the
   `importEsmLib('bga-animations', '1.x')` / `importEsmLib('bga-cards', '1.x')` block
   is inside a comment), `src/ts/Game.ts` never imports `./libs`, and there is no
   `BgaAnimations.Manager`, no `BgaCards.Manager`, and no `LineStock`/`SlotStock`
   anywhere in `src/ts/`. The `.d.ts` files exist at project root, but no ESM lib is
   loaded at runtime. Tiles are manual DOM: `renderTileHtml`, `outerHTML` flip
   replacement in `notif_tileFlipped` (`Game.ts:433–443`), `setTimeout(() => tileEl.remove(), 400)`
   in `notif_tileCollected` / `notif_penguinRetreat`, and CSS classes
   (`tile-flip-animation`, `tile-collect-animation`). To use bga-cards per §10.2:
   uncomment `libs.ts`, import it in `Game.ts`, create one shared
   `BgaAnimations.Manager({ animationsActive: () => this.bga.gameui.bgaAnimationsActive() })`
   in `setup`, pass it to `BgaCards.Manager({ type, getId, setupFrontDiv, setupBackDiv, isCardVisible })`,
   add manual sprite markup in `setupFrontDiv`, and `await` all stock add/remove calls.
   Note the bga-animations class-selector rule (§10.1): animated elements must be styled
   by class, not ID — Deep Dive's tile elements are currently addressed by ID
   (`dd-tile-${id}`), which would break under cloned-element animation.
2. **No status-bar title is ever set.** There is no `statusBar.setTitle` call anywhere in
   `src/ts/`. The documented pattern is `setTitle` in `onEnteringState` with
   `${you}` / `${actplayer}` branching on `isCurrentPlayerActive()`.
3. **No explicit `statusBar.removeActionButtons()` anywhere.** All four state classes'
   `onLeavingState` only call `this.game.clearInteractivity()`
   (`PlayerDiveStep.ts:42–44`, `ConfirmFlipOrDive.ts:37–39`, `RetreatPickTile.ts:36–38`,
   `SoloChooseTiebreak.ts:28–30`). Verify whether the framework clears action buttons
   automatically on state exit; if not, stale buttons are a real risk — add
   `removeActionButtons()` to each `onLeavingState`.
4. **`notif_*` handlers are synchronous and return nothing** (`Game.ts:422–555`).
   That is fine for the current CSS-class animations, but if they are converted to
   `await animationManager.slideAndAttach(…)` / stock `addCards`/`removeCards`, they
   must become `async`, be awaited, and **resolve instantaneously when animations are
   inactive** (see §5; `setupPromiseNotifications` default `minDuration: 500` ms).
   Also: `setupNotifications()` (`Game.ts:418–420`) calls bare
   `setupPromiseNotifications()` with no `handlers` argument — correct today because all
   `notif_*` handlers live on `Game` itself, but if any move into a state class, pass
   `handlers: [this, ...this.bga.states.getStateClasses()]` and remember the
   duplicate-call warning (a handler defined in both places is called in **all** places).
5. **`drop-shadow` in Safari.** `src/scss/Game.scss:214` and `:401` (and the generated
   `deepdivefg.css:261,461`) use `filter: drop-shadow(…)`. The docs warn this causes
   significant Safari performance issues with more than one on the page — prefer
   `box-shadow`, bake the shadow into the image, or add a `.dj_safari … { filter: none; }`
   guard (§9).
6. **No dark-mode overrides.** No `[data-theme="dark"]` selector was found in
   `src/scss/Game.scss`. Check every fixed light background / fixed text colour
   (e.g. `#dd-container { color: #2b2d42; }`) against dark mode; the docs' fix is to set
   an explicit text colour on fixed-light elements (§9).
7. **No assets yet, and no sounds/fonts directories.** `img/` contains only `README`;
   there is no `sounds/` or `fonts/` directory, no sprite sheet, and no
   `this.bga.sounds.play(…)` call. When art/sound arrives: WebP sprites ≤ 4096 px, no
   spaces/parens in filenames, both `.ogg` + `.mp3` per sound (§8).
8. **No user preferences defined.** `gamepreferences.jsonc` is `{}` (example commented
   out). So there is no autoclick/confirm preference for the status-bar buttons (§3)
   and no background/dark-mode preference (§9) — both are optional, but the
   `userPreferences.get(100)` pattern in the status-bar docs has no Deep Dive pref to
   point at yet.
9. **Panel access uses IDs, not numbers.** `Game.ts:72` uses
   `this.bga.playerPanels.getElement(playerId)`; the docs prefer `getElementByNo(playerNo)`
   when game logic uses player numbers, converting at the `gamedatas.players` boundary
   with `getPlayerNoById` (§6). Minor — consistent today because the call site already
   has the ID, but worth aligning if panel code is reworked (e.g. for Counter, §10.8).
10. **No tooltips.** No `addTooltip` / `addTooltipHtmlToClass` call exists. Optional —
    and per the docs, tooltips must never carry essential rules (not practical on mobile).

### Candidates worth adopting (in priority order)

| Candidate | Verdict | Why |
|---|---|---|
| **Counter (`ebg/counter`)** | **Yes — first** | No import needed. Directly replaces manual `innerText` updates: facedown count `dd-facedown-count-${depth}` (`Game.ts:427–429`), panel rocks `dd-panel-rocks-${player_id}` / `dd-held-rocks-${player_id}` (`:460–466, :523–529`), available penguins `dd-panel-penguins-${player_id}` / `dd-avail-penguins-${player_id}` (`:493–496, :504–507`). Use one counter per depth + a `Record<number, Counter>` keyed by player **number** (§10.8), `toValue()` for animated updates. Automatic sync via `playerCounter`/`tableCounter` only works if the matching PHP counter exists — not verified in Deep Dive's PHP; manual `toValue()`/`incValue()` still gives the animation benefit without it. |
| **bga-zoom** | **Yes — evaluate** | `Manager` + autoscale (`expectedWidth`, `minZoomLevel`) + persisted zoom key, explicitly compatible with `bga-animations` (§10.7). The 5-depth ocean board is a fixed-width board that could benefit; follows the same `importEsmLib(…, '1.x')` + `libs.ts` pattern already sketched (commented out) in Deep Dive. No imperative zoom API on the overview page — check `bga-zoom.d.ts`. |
| **bga-cards (+ bga-animations)** | **Yes — but a real migration, not a tweak** | See gap #1. Gives flip/rotate and stock-move animations, `isCardVisible`/`setupBackDiv` for facedown tiles, and async add/remove discipline (§10.2). Requires the `.d.ts` / linked Documentation for `SlotStock`/`HandStock`/`GridStock` constructors, which the overview page does not give. |
| **Vitest + jsdom unit tests** | **Yes — set up as documented** | No test infra exists today: no `test:frontend` / `test:types` scripts, no Vitest/jsdom devDependencies, no `src/tests/` (§11). Deep Dive's TS state classes in `src/ts/States/` are already exported, so tests can import them directly without a Rollup build. Natural first tests: `notif_tileFlipped` updating the facedown count; a tile click sending `actFlipTile`/`actTakeFaceup` with the right `tileId` (mock `bga.actions.performAction` with `vi.fn().mockResolvedValue({})`); leaving a state removing `interactive-tile` highlights. Adaptation: the guide's `setup.js` stubs only `bga-animations` and throws on any other `importEsmLib` name — once `bga-cards`/`bga-zoom` imports are live, the stub must also return `{}` for `'bga-cards'` (and `'bga-zoom'`). Add `test:types` — Vitest does not type-check. |
| **bga-score-sheet** | **Optional** | Only for an animated end-of-game score breakdown (§10.6). Requires `endScores` keyed by player ID, `scores: gamedatas.endScores` when state is 99 / null otherwise, and ID→number conversion in `onScoreDisplayed`. |
| **bga-autofit** | **Optional** | One `BgaAutofit.init()` call + `bga-autofit` class, if tile/card text ever needs to fit a fixed-size area (§10.4). |
| **ExpandableSection** | **Optional** | Only for a future collapsible help/rules block (§10.10). |
| **Zone** | **Maybe, narrowly** | Layout-only. A depth lane (`dd-depth-tiles-${depth}`) is structurally a `grid`/`horizontalfit` Zone; `removeFromZone(id, true, to?)` could replace the manual collect path (`Game.ts:448–455`); `diagonal` fits a facedown stack visual. But Zone does **not** render, flip, or click tiles, is static-width/non-responsive (docs warn about small-screen overflow and point to Stock instead), and is a Dojo lib with no `.d.ts` mentioned — do not present it as replacing the manual tile DOM handling (§10.12). |
| **Draggable** | **No** | Docs explicitly recommend native Pointer Events instead of `ebg.draggable`, and Deep Dive has no drag interaction to replace — all tile interaction is click-based (§10.9). |
| **Scrollmap** | **No** | For unbounded/infinite boards (Carcassonne etc.). Deep Dive's board is 5 fixed depth rows (§10.11). Its zoom recipe is superseded by `bga-zoom`. |
| **bga-jump-to** | **No** | Only for many-board games; explicitly discouraged otherwise as clutter (§10.5). |
| **bga-dice** | **No** | No dice in Deep Dive (§10.3). |
| **display3D** | **No** | Only if the board is presented in 3D; not required for a flat tile game (§7). |
| **Client states** | **Possible later** | `setClientState` / `restoreServerGameState` are the documented mechanism for multi-step client-only interactions (e.g. pick-then-confirm flows) with no PHP class (§2). Not needed while every step is a server state. |
| **Solo automaton panel** | **Possible** | `playerPanels.addAutomataPlayerPanel(0, …)` is the documented solo-opponent panel pattern (§6). Check whether Deep Dive's solo AI currently gets a panel at all. |
| **Last-turn / win-condition banner** | **Possible** | `gameArea.addLastTurnBanner()` fits the Last Dive trigger; `addWinConditionBanner()` fits multiple end conditions (§6). Deep Dive currently flips a token and sets status text instead (`notif_lastDiveFlipped`, `Game.ts:544–554`). |
