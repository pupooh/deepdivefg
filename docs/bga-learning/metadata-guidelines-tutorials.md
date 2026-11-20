# BGA Learning Notes — Metadata, Guidelines, AI Tooling & Tutorials

**Project:** Deep Dive (`deepdivefg`) — push-your-luck set-collection game, 5 ocean depths,
hidden facedown tiles, 1–6 players + solo AI. Repo: `~/workspace/deepdivefg`
(single commit `fc7a29d`, "initial commit; basic implementation with gemini antigravity").

**Purpose of this file:** record what was read in the BGA Studio docs, the exact rules
that matter for Deep Dive, and concrete violations / opportunities found by auditing
the code against those rules. No game code was edited while writing this.

**Companion file:** `framework-helpers-audit.md` (same folder) covers `_ide_helper.php` /
`bga-framework.d.ts` API auditing.

---

## 0. Honest scope note — what was actually read

The parent question was whether *all* framework-documentation subpages were read
recursively. Answer: **not fully.** The docs site rate-limited `browser.open`
(HTTP 429) after the first batch of reads, and three paging attempts failed with
429 (back-end overview lines 366+, Reversi lines 465+, Hearts lines 437+). Those
exact paging requests were not retried. Coverage achieved instead:

| Area | Status |
|---|---|
| Framework overview (`framework-documentation/`) | Read (16 lines, index only) |
| Game Metadata intro + Media + Tags + Metadata | Read in full |
| Guidelines intro (UX/UI) | Read — page is only a 2-line heading; no UX/UI body text exists there |
| Guidelines / Code | Read in full (117 lines) |
| AI tooling | Read in full (65 lines); skill ZIP downloaded and installed to `~/workspace/custom-skills/modernize-bga-game-project/` |
| Back-end / Main game logic overview | Read lines 0–366 only (rest blocked by 429) |
| Back-end / tableOptions, notify, game-state-classes, zombie-mode, game-meta-information | Read in full |
| Front-end / Game interface logic overview | Read in full (277 lines) |
| Front-end / notifications | Read in full (370 lines) |
| Back-end pages NOT opened directly: Database, globals, ItemManager, Deck, table/player stats, playerScore/playerScoreAux, userPreferences, actions, players, logs, private parallel states, scoring, game-statistics, user-preferences | Covered indirectly via the overview table, the installed modernize skill's reference files (`bga-new-apis.md`, `bga-jsonc-files.md`, `bga-gameinfos-cleanup.md`, `bga-zombie-random-move.md`, `bga-state-classes-common.md`), and search snippets. Still to read directly when the rate limit allows. |
| Reversi tutorial | Lines 0–465 read directly; remainder covered via search excerpts (old wiki mirror + new-doc snippets): ItemManager/BoardManager, `getPossibleMoves`, notifications, scores, zombie, end-game |
| Hearts tutorial | Lines 0–437 read directly; remainder covered via search excerpts: passing (`GiveCards`, MULTIPLE_ACTIVE_PLAYER), EndTrick/EndRound scoring, `playerScore->getMin() <= -100` end condition, `tableWindow` scoring dialog suggestion, game options |

Do not claim full recursive coverage until the "not opened directly" rows above are
read. The findings below only cite rules from pages actually read (or from the
official skill references, which themselves cite the doc URLs).

---

## 1. Game Metadata Manager

Source: `framework-documentation/game-metadata/` (+ `media/`, `tags/`, `metadata/`).
This is a **portal on the Studio / production site, not files in the repo** — open it
via **Game Metadata Manager** on the Manage game page. Studio version is for
pre-private-alpha; production version for private alpha and beyond. **Changes made
on production do NOT sync back to Studio automatically** — click **Sync metadata
from production** on the Studio Manage game page to fetch them.

### 1.1 Media (`game-metadata/media/`)

Images representing the game (separate from in-game artwork):

| Asset | Required for | Spec |
|---|---|---|
| Box | public alpha | PNG, 280×280 px, 3D image of the physical box as in a shop, transparent background, no shadow. Prefer the original publisher's version matching the adaptation artwork. No 3D render? `boxshot.com/3d-box/`. One image on Studio; per-language variants possible once deployed (English fallback). |
| Icon | public alpha | PNG, 50×50 px, recognizable in game/table lists (e.g. part of the cover/title). Need not be transparent, no border. |
| Title | beta | PNG, max 2 MB, 2000×2000 px, transparent background, must look good overlaid on the banner. Per-language variants possible. |
| Publisher logo | optional (if no publisher) | PNG, max 2 MB, 280×280 px, may be transparent. |
| Banner | beta | JPG, max 2 MB, 1386×400 px, **no text**. Atmosphere/cover detail; box overlaid on the left must stand out and the title stay readable over it. |
| Display (carousel) | release | JPG, height 400–760 px, width ≤ 1.5× height, up to 10 images. Show close-ups / a physical game in progress. **Do not use screenshots of the BGA adaptation** — the "see game in action" replay covers that. |
| Major Variant | optional | PNG, 280×280 px, accompanies major options (see game options). |

**Deep Dive status:** `img/` contains only a `README` — no box/icon/title/banner assets
exist yet. These are Studio-portal uploads, not repo files, but the artwork must be
produced before public alpha (box, icon) / beta (title, banner) / release (display).

### 1.2 Tags (`game-metadata/tags/`)

Tags are the filters on the production Games page. Use the **Classification** section
of the game's BGG page as inspiration. Only one hard rule stated: the **Awarded game**
tag requires a **first place** win in one of the listed major awards.
**Deep Dive:** BGG id 376747 is already in `gameinfos.jsonc`; sensible tags would be
push-your-luck, set collection, family, animals/penguins — pick from BGG Classification
when the game reaches the metadata stage.

### 1.3 Metadata (`game-metadata/metadata/`)

Fields managed in the portal (NOT in `gameinfos.jsonc` any more — see §2.1):

- **Artist(s) / Designer(s):** comma-separated lists. **Auto-fill** button can fill
  artist, designer, publication year, minimum age from the BGG page (only fills empty
  fields).
- **Publication year:** first publication year (negative for BC).
- **Complexity / Luck / Strategy / Diplomacy:** each 0–5.
  Deep Dive estimate: Complexity ~1–2, Luck ~3–4 (facedown flips), Strategy ~2,
  Diplomacy 0.
- **Description:** array of paragraphs, plain text only, no HTML, 100–150 words total.
- **Minimum age:** as printed on the box ("10+" → 10).
- **Zombie Mode level:** set here after implementing zombie (see §7).
- **Game page warning:** only with admin approval/discussion (e.g. Texas Hold'em
  "no real money" warning).
- **Custom "buy this game" button:** default links to an Amazon search for the game
  name; a custom URL + site name can be supplied.

---

## 2. Game metadata files (JSONC) — formats and Deep Dive status

Canonical doc URLs (from the modernize skill references):
`back-end/game-meta-information/`, `back-end/table-options/`,
`back-end/user-preferences/`, `back-end/game-statistics/`.

### 2.1 `gameinfos.jsonc` — game meta-information

Read in full: `back-end/game-meta-information/`.

- Studio re-reads the file on every modification; if changes don't appear, the JSON
  is invalid — **Reload game informations** on the Manage game page shows the parsed
  JSON or the error.
- **Publisher:** set publisher fields to the real publisher. Special BGG publisher
  IDs: public domain = 171, self-published = 4, prototype/looking for publisher = 772
  (URL may be left empty for these).
- **Time profiles** (`fast/medium/slow_additional_time`): leave defaults; from beta
  an automatic process adjusts them to real durations and later edits need an admin.
- **Recommended player counts:** `suggest_player_number` is a single count or `null`;
  `not_recommend_player_number` an array or `null`. Use `null` unless a count is
  clearly better/worse (BGG player polls help). Suggested count also affects Elo:
  the K-factor multiplier is capped at `suggest_player_number`. **Automatic lobby:**
  without a suggested count it tries the *lowest* supported count first — if that
  count is incompatible with default options, a suggested count is mandatory
  (doc's example: a solo mode that requires training mode must not become default).
- **Player colors:** hex without `#`; provide more than max players if you like, but
  the game must support every color listed. `setupNewGame` assigns them.
- **`losers_not_ranked`:** only when the rules treat all non-winners as equal.
  Results show "Winner" / "Loser"; give all winners the same score, losers `0`.
  Do NOT use for 2-player games, coops, or games where perfect ties are frequent
  (Elo doesn't change when all scores + tiebreakers are equal).
- **Rematch player order:** rematches rotate order by default;
  `disable_player_order_swap_on_rematch: true` switches to random order.
- **`tie_breaker_description`:** explains `playerScoreAux`. **Must stay on one
  line** — it is included in generated JavaScript and newlines can break game load.
  Multiple tiebreakers: combine into one aux integer and use `tie_breaker_split`
  (e.g. `10000*money + 100*buildings + cards`, split `[10000, 100, 1]`; each
  component must stay below its multiplier).
- **Language dependency:** `false` = none; `true` = common language; a map
  `{"1": "en", "2": "fr"}` restricts to listed languages and assigns indexes
  (read via `tableOptions->getGameLanguage()`).
- **Coop Elo (`coop_elo_mode`):** only for coops; generally not recommended.

**Deprecated / removed keys** (per `bga-gameinfos-cleanup` skill ref — remove from
`gameinfos.jsonc`, they now live in the Game Metadata Manager): `designer`, `artist`,
`year`, `presentation`, `tags`, `gamepanel_page_warning`, `custom_buy_button`,
`complexity`, `strategy`, `luck`, `diplomacy`, `is_beta`, `is_sandbox`, `turnControl`,
`enable_3d`, plus nested `game_interface_width.max` only (keep `min`/`autoscale`).

**Deep Dive status — GOOD:** `gameinfos.jsonc` contains **none** of the deprecated
keys and `game_interface_width` has only `min: 740` (no `max`). Publisher Flatout
Games / BGG 42733 / game BGG 376747, `players: [1..6]`, `suggest_player_number: 4`,
`estimated_duration: 20`, `tie_breaker_description: "Most completed rows"` (one
line), `losers_not_ranked: false`, `solo_mode_ranked: false` (correct — solo exists
*in addition to* multiplayer), `favorite_colors_support: true` with
`reattributeColorsBasedOnPreferences` called in `setupNewGame`. One point to
consider: `players` starts at 1, so the automatic lobby tries solo first; that is
fine only because solo works with the default options (difficulty default 1) — if
solo ever required a special mode, a `suggest_player_number` rethink would be needed.

### 2.2 `gameoptions.jsonc` — table options (IDs 100–199)

- Options are read in PHP via `$this->bga->tableOptions->get($id)` — returns `?int`,
  `null` when the option doesn't exist (e.g. table created before the option was
  added). **Always write an explicit fallback:** `$this->bga->tableOptions->get(104) ?? 1`.
  Use `??`, not `?:`, so a legitimate `0` value survives.
- `tableOptions->set($id, $value)` only to resolve a *random* option to a concrete
  value so the displayed option stays consistent; invalid id/value throws.
- `isTurnBased()` / `isRealTime()` / `getGameVersion()` / `getGameLanguage()` replace
  reads of framework globals 200 / 207 / 300. **Never read framework-owned numeric
  globals as if they were table options.**
- JSONC shape: string-quoted numeric keys, `name` / `values` (each with `name`,
  optional `description`) / `default`. Option and preference *names must be
  Capitalized* (code guidelines).

**Deep Dive status — ONE FIX:** `gameoptions.jsonc` itself is well formed (option
`100` "Solo AI Difficulty", Easy 0 / Medium 1 / Hard 2, default 1). But
`modules/php/Game.php:93` reads it the legacy way:

```php
$this->globals->set('soloDifficulty', (int) ($options[100] ?? 1));
```

`$options` is `setupNewGame`'s own parameter. Per the tableOptions doc and the
`bga-new-apis` skill ref, this should be a typed helper reading
`$this->bga->tableOptions->get(100) ?? 1`. Same for any other `table_globals[100]`
-style reads (none others found).

### 2.3 `gamepreferences.jsonc` — user preferences (IDs 100–199)

- Same JSONC shape as options; a preference can carry a `cssPref` value that the
  client reads to toggle CSS.
- **The file must always exist and parse as the empty object `{}` when there are no
  preferences** — never `[]`, `null`, an empty file, or a missing file. Filename is
  `gamepreferences.jsonc`, *not* `userpreferences.jsonc`.
- Client side: `this.bga.userPreferences` reads/updates preferences and reacts to
  changes (front-end overview table).

**Deep Dive status — GOOD:** file contains only comments + `{}`. No preferences
defined yet; obvious candidates when UX work starts: a colorblind/food-color
helper (the commented example in the file already sketches one) and an
animations on/off toggle.

### 2.4 `stats.jsonc` — statistics

- Two scopes: `"table"` and `"player"`, each a map of `name: {id, name, type}`.
  IDs are per-scope; the same numeric id may appear in both scopes.
- Modern API (from `bga-new-apis` ref): `$this->bga->tableStats` /
  `$this->bga->playerStats` with `init($name, $value)`, `get`, `set`, `inc`.
  `playerStats->init($name, $value)` initializes **all** players at once; its
  third argument is a boolean `$updateTableStat`, **not a player ID** — never loop
  init per player.
- Stats must be initialized in `setupNewGame` after players exist.

**Deep Dive status — GOOD, one check:** `stats.jsonc` defines table stats
`turns_number` (10), `game_end_depth` (11) and player stats `turns_number` (10),
`sets_completed` (11), `dives_taken` (12), `predators_hit` (13),
`retreats_triggered` (14), `rocks_collected` (15), `rocks_used` (16),
`points_food` (17); `Game.php:99-110` inits them correctly in one call each.
`game_end_depth` is set from both `PlayerDiveStep.php:113` and `AiTurn.php:82`.
Unverified: whether `dives_taken` and `rocks_used` are ever `inc`'d anywhere
(grep for the `init`/`set` calls only surfaced the inits) — check before release,
or drop unused stats.

---

## 3. Guidelines

### 3.1 UX/UI (`guidelines/`)

The guidelines index page contains only the heading "BGA Studio Guidelines
(UX/UI)" — no body text was retrievable. UX/UI rules therefore come from the
tutorials and front-end docs instead (status-bar-first interaction, board + status
bar mirroring, no confirmation dialogs except rare high-consequence actions —
see §8). If a UX/UI subpage exists, it was not discoverable from the index; re-check
the docs navigation later.

### 3.2 Code (`guidelines/code/`) — read in full

- **Readability first:** clearly named functions/variables, comments when necessary.
  **Everything in code must be in English** — a future maintainer must be able to
  take over.
- **Generated code (SCSS, TypeScript) is tolerated** only if both sources (`src/`)
  and built files are provided, ideally with build tools. **The built file must NOT
  be minimized** — someone taking over may work on the built file ignoring the
  sources. JS/CSS remain the files actually used; BGA handles no other language
  natively.
- **`.tpl` files and `view.php` are deprecated and forbidden for new projects.**
- **Game name and option names must be Capitalized.**
- **Never use undocumented framework functions** — they may change/delete without
  warning; documented functions change as little as possible and with notice.
- **Never override a framework function; write a wrapper with a different name**
  (doc's example: `myGameGetPlayerNameByNo()` wrapping `getPlayerNameByNo()`).
- **Namespacing PSR-4:** namespace matches folder path, e.g.
  `Bga\Games\<mygame>\PowerCard\PowerCardManager` in
  `<mygame>/PowerCard/PowerCardManager.php` — then no `require` is needed (autoload).
- **`.action.php` must not be used any more; use autowired actions.**
- **Action methods must check any input**; to avoid duplication they can use the
  `args` (getArgs) array, e.g. `if (!in_array($cardId, $args['selectableCardsIds']))`
  throw `BgaUserException`.
- **Never use `@` to silence errors** of a function call.

**Deep Dive status — GOOD on the big items:** namespaced PSR-4 classes, no
`.action.php`, no `.tpl`/`view.php`, no `@` found, TS sources + built
`modules/js/Game.js` + `deepdivefg.css` all present with `package.json` build
(`build:ts` rollup, `build:scss` sass). To verify: that the built `Game.js` is
indeed non-minified (it is 591 lines, readable — yes) and that sources/build stay
in sync on every change.

---

## 4. AI tooling (`framework-documentation/ai-tooling/`)

Read in full (65 lines). One skill is available: **Modernize BGA game project**.

- Install: download the ZIP, extract, keep the **whole** `modernize-bga-game-project/`
  folder (`SKILL.md` + `references/` + `agents/`), copy it into the AI tool's global
  skills directory. Copying only `SKILL.md` leaves out the workflow instructions.
- **Default behaviour is list-only.** Invoking the skill, or an unqualified
  "modernize this project", must only list the workflows. Never start editing
  without an explicit selection ("do the first five", "fonts and sounds only",
  "run all modernization workflows"). Run selected workflows **in table order**,
  one by one, committing between steps; the skill warns it does **not guarantee**
  the migrated code works out of the box — double-check the result.
- **Per-skill reminder:** before listing, remind the developer to refresh both
  framework helpers from Studio: right-click `_ide_helper.php` and
  `bga-framework.d.ts` → **Download File**.
- **TypeScript rule (applies to every workflow):** if the project has `src/` with
  `.ts` files, apply JS-affecting migrations to the TS sources and **run the build**
  to regenerate JS; never patch generated JS instead of TS.

The 25 workflows (table order = execution order):

| # | Workflow | What it does |
|---|---|---|
| 1 | `mysql_fetch_assoc` | Legacy DB result fetching → closest BGA DB read method |
| 2 | `bga-jsonc-files` | `.inc.php` config → JSONC, preserving comments; empty prefs = `{}` |
| 3 | `bga-gameinfos-cleanup` | Remove deprecated gameinfos keys + `game_interface_width.max` (only after JSONC migration) |
| 4 | `bga-fonts` | Fonts `img/` → `fonts/` (skip if none) |
| 5 | `bga-sounds` | Sounds `img/` → `sounds/`, MP3/OGG, play by filename stem (skip if none) |
| 6 | `bga-jstpl` | jstpl → template literals |
| 7 | `bga-default-states` | Remove default states 1 and 99 from `states.inc.php` |
| 8 | `bga-material` | Comment-only material deleted; else move to `modules/php/`, require in constructor, typed public props |
| 9 | `bga-new-table` | Namespaced Table/Deck/exceptions, modern decks, clean player-setup INSERT |
| 10 | `bga-new-apis` | Stats/options/turn-based/score/notify → `bga` services; remove redundant helpers |
| 11 | `bga-server-translations` | Game-logic translations → `clienttranslate`/`NotificationMessage` (no new strings) |
| 12 | `bga-js` | scoreCtrl/prefs/global playSound/ajaxcall actions/`format_string_recursive` → BGA APIs |
| 13 | `bga-replace-dojo` | Dojo, `$()` string lookups, `dojo.place` → native JS (keep `setupNotifications` subscriptions) |
| 14 | `bga-remove-view-tpl` | Layout in JS template literals; delete migrated view/TPL files |
| 15 | `bga-namespaced-game` | Legacy game PHP → namespaced `modules/php/Game.php` (needs material first) |
| 16 | `bga-autoload` | Manual/custom class loading → namespace autoloading |
| 17 | `bga-strict-types` | `strict_types` in game-logic PHP (excl. `*.inc.php`); needs `modules/php/Game.php` |
| 18 | `bga-autowired-actions` | `act`-prefixed, autowired validated/injected params; delete `.action.php` |
| 19 | `bga-mysql-strict-mode` | Schema defaults / invalid SQL values for MySQL strict mode |
| 20 | `bga-php8-code` | PHP 8.4 modernization: native helpers, constructor promotion, deprecation cleanup |
| 21 | `bga-game-state-classes` | Selected GAME states `states.inc.php` → state classes |
| 22 | `bga-active-player-state-classes` | Selected ACTIVE_PLAYER states → classes, incl. actions + zombie |
| 23 | `bga-multi-active-player-state-classes` | MULTI_ACTIVE_PLAYER + PRIVATE states → classes |
| 24 | `bga-es6` | Legacy JS entry → `modules/js/Game.js`, `export class Game`, injected `bga` (needs `bga-js`) |
| 25 | `bga-zombie-random-move` | Skip-only zombie → random legal move via existing action (last) |

**Deep Dive status:** the skill is installed at
`~/workspace/custom-skills/modernize-bga-game-project/`. Most workflows are
**already satisfied** (JSONC configs, namespaced Game, state classes, autowired
actions, strict types, ES6/TS) — see the per-workflow applicability notes in
`framework-helpers-audit.md`. The workflows with real remaining work for Deep Dive
are `bga-new-apis` (option reads, score-write notification arg — §9), `bga-php8-code`,
and `bga-zombie-random-move`. Do **not** run any of them until explicitly selected.

---

## 5. Back-end — main game logic (PHP)

Source: `back-end/main-game-logic/` (lines 0–366 read; remainder not re-read — see §0).

- Entry point `modules/php/Game.php`; class extends `Bga\GameFramework\Table`.
  **A new Game instance is created per request** — anything that must survive goes
  in the DB, `globals`, or a persistent component like ItemManager.
- Framework sub-components on `$this->bga` (in Game; `$this->game->bga` in state
  classes): `notify`, `globals`, `tableOptions`, `userPreferences`, `tableStats`,
  `playerStats`, `deckFactory`, `itemManagerFactory`, `counterFactory`,
  `playerScore`, `playerScoreAux`, `logs`, `tournament`, `legacy`, `debug`.
- `setupNewGame($players, $options = [])`: init DB, **return the first state class**.
  `getAllDatas(int $currentPlayerId)`: return the rebuild array; keep the generated
  `players` structure; the framework can supply `?int $currentPlayerNo` (null for
  spectators) or `int $currentPlayerId` — **use that player to decide which private
  data to include, and add no unrelated parameters.**
- `getGameProgression()`: 0–100; also used when a player leaves/concedes.
  `upgradeTableDb($from_version)`: migrate in-progress tables on release.
- State args/actions/zombie live in **state classes**, not Game.
- **Active players:** `activeNextPlayer()` / `activePrevPlayer()`; `gamestate->
  changeActivePlayer($playerId)` followed by a state transition in the same action
  (so the client receives the changed active player). Multiactive:
  `setAllPlayersMultiactive()`, `setPlayersMultiactive($players, $nextState)`,
  `setPlayerNonMultiactive($playerId, $nextState)`, `getActivePlayerList()`,
  `isPlayerActive()`, `updateMultiactiveOrNextState()`. For confirmed DB deadlocks
  in multiactive play there is an advanced `$this->bIndependantMultiactiveTable`
  flag — not relevant to Deep Dive (no multiactive states).
- **Transitions:** a state-class callback returns `TargetState::class` or an int ID
  (redirect processed after the callback finishes). `gamestate->nextState($label)`
  follows a label in the current state's `transitions` map — **a class name is NOT
  a label**; never rewrite `nextState('x')` as `nextState(X::class)` and delete the
  map entry. `jumpToState()` bypasses the map (exceptional dispatch/recovery only).
- **Randomization:** use `bga_rand($min, $max)` (wraps `random_int`). **Do not use
  `rand`, `mt_rand`, or SQL `RAND()`** for game choices. Random array entry: pick a
  random key with `bga_rand(0, count-1)`; random subset without replacement: remove
  each pick from the candidates.
- **Errors:** throwing aborts the request's DB changes + queued notifications; use
  the matching exception type (`BgaUserException` for illegal player moves,
  `BgaSystemException` / `BgaVisibleSystemException` for internal errors).

### 5.1 State classes (`back-end/game-state-classes/`) — read in full (810 lines)

- Each state: `modules/php/States/<Name>.php`, `extends GameState`, constructor
  `__construct(protected Game $game)` + `parent::__construct($game, id:, type:, …)`.
  `declare(strict_types=1);` in every class.
- **IDs:** unique positive integers; **1 and 99 are reserved** (gameSetup / gameEnd)
  — never use or modify them; any other positive int allowed, including > 100.
  Never change an ID once in production (in-progress/turn-based games break).
- **Types:** `ACTIVE_PLAYER` (one player), `MULTIPLE_ACTIVE_PLAYER`,
  `PRIVATE` (parallel states inside a multiactive master), `GAME` (automatic).
- **`name`** defaults to the class name; keep it stable — JS state callbacks and
  comparisons use it.
- **`description`** (shown to non-active players, `${actplayer}` placeholder) and
  **`descriptionMyTurn`** (shown to the active player, `${you}`) — `descriptionMyTurn`
  is **mandatory** for ACTIVE_PLAYER / MULTIPLE_ACTIVE_PLAYER states. May be omitted
  for GAME states (but a description helps when synchronous notifications keep the
  client in a GAME state briefly). Custom `${...}` args come from `getArgs()`;
  `${otherplayer}` requires both `otherplayer` and `otherplayer_id` in args or the
  game won't load.
- **`updateGameProgression: true`** — at least one state must set it; the framework
  then calls `getGameProgression()` on entering that state.
- **`initialPrivate`** — first private state for a multiactive master.
- **Initial state:** return its class from `setupNewGame`; no return → state 2.
- **`getArgs()` magic params:** `int $activePlayerId` / `int $activePlayerNo`
  (ACTIVE_PLAYER only); `int $playerId` / `int $playerNo` (PRIVATE only).
  **All getArgs data is public to all players by default** — never put private data
  there; players can inspect it even if the UI hides it. Private data: `_private`
  keyed by player no/id (needs `notify->setUseNo(true)` in Game constructor for
  number keys); `_merge_private => true` (or `notify->alwaysMergePrivate()`) to
  merge it into `args.args` instead of `args.args._private`. Private args can hurt
  performance in multiactive states — use only when needed.
- **`_no_notify => true`** in getArgs skips front-end state-change notifications for
  auto-skipped states (avoids flashing "You must play a card" before auto-pass);
  if used, `onEnteringState` **must** redirect when the flag is true.
- **`onEnteringState()` magic params:** `array $args` (= getArgs result),
  active/player id/no as above. Returns class/ID to redirect. **Do not override
  `stGameEnd()` / `argGameEnd()` in Game.php** — the game can get stuck on
  "Recording game results…".
- **`act*` methods:** name starts with `act`, mark with `#[PossibleAction]`.
  Magic params: `array $args`, `int $activePlayerId` / `int $activePlayerNo`
  (may differ from the triggering player), `int $currentPlayerId` /
  `int $currentPlayerNo` (the triggering player). Actions not declared in the
  current state are looked up in `Game.php` (actions available in any state).
  Validate every input against the legal set (e.g. `in_array($cardId,
  $playable)` else `BgaUserException`).
- **`zombie()` is mandatory in all non-GAME states.** Framework supplies the zombie
  player's **ID** as first param `int $playerId`; use `int $playerNo` instead to
  get the number. `array $args` (= getArgs) is also injectable. Return value works
  like `onEnteringState`.
- **End-score state:** you cannot modify `endGame`; create a state immediately
  before it for final calculations (Deep Dive's `EndScore`, id 98 → 99).
- **Subfolders under `States/`:** namespace must match the folder or autoloading
  breaks.
- **Design guidance:** the state machine should follow the rulebook's round/turn
  structure; one player state + one GAME "next player" state is enough for a simple
  turn loop; a complex eurogame needs multiactive + pairs + upkeep states.

**Deep Dive status — mostly GOOD:** 8 state classes, ids 10/20/25/30/40/50/51/98
(none reserved), all with `description` + `descriptionMyTurn` on ACTIVE_PLAYER
states, `updateGameProgression: true` on the GAME states that advance turns,
`EndScore` (98) → `ST_END_GAME` (99, file-scope const in `EndScore.php`).
`getArgs()` correctly returns only public data (see §9.1 for the facedown-tile
proof). Zombie callbacks exist on all 4 ACTIVE_PLAYER states — see §7 for the
level assessment.

### 5.2 Notifications — server side (`back-end/main-game-logic/notify/`) — read in full

- `$this->bga->notify->all($name, $message, $args)` (public, players + spectators)
  and `->player($playerIdOrNo, $name, $message, $args)` (one player; IDs by
  default). Empty message = UI update with no log entry. Wrap non-empty messages
  in `clienttranslate`. A `NotificationMessage` object may replace the message
  string (args go inside it, separate `$args` must stay empty).
- `setUseNo(true)` in Game constructor: `player` targets and `_private` keys use
  player numbers. `alwaysMergePrivate()` merges private data into each recipient's
  args. A `decorateNotifArgs` method on Game (or `addDecorator` callable) is
  registered automatically to inject repeated args (e.g. player name).
- **Private data in `all`:** public fields in the main array, per-player private
  under `_private` keyed by id/no. A private entry may itself be a
  `NotificationMessage` for different log text per recipient. For a private-only
  update use `player(...)`; spectators never receive it — use public notifications
  for anything spectators need.
- **Send notifications only from actions, `onEnteringState`, or `setupNewGame`
  (after players exist). Never from `getArgs` or other read-only methods.**
  Notifications are queued and delivered when the action completes; an exception
  rolls back DB changes **and** prevents delivery.
- **Packet limit: 128 KiB per serialized notification packet** (several
  notifications can share one) — send only the changes the UI needs; keep log
  messages as text, render HTML on the client.
- **Log args:** use single-quoted PHP strings for `${...}` placeholders (else PHP
  interpolates). Supply every referenced argument. `i18n` lists arg names needing
  translation (never player names). Player names in colour: pass matching
  `player_name` + `player_id` pairs (`player_name2`/`player_id2` for a second
  player). Nested fragments: an arg may itself be `['log' => …, 'args' => …]`.
- **Log history on reload:** old notifications rebuild the log without calling
  normal handlers; most args are stripped — only `player_id`, `i18n`, args used in
  the message, and fields listed in `preserve` survive. **Rebuild the board from
  `getAllDatas`, never from history handlers.**
- An action with only private notifications has no move ID — include a public
  notification (even with an empty message) if a move ID is needed. Private and
  public channels are stored separately (private first on restore) — don't rely on
  interleaved ordering.

**Deep Dive status:** all server notifications use `notify->all(...)` with
`clienttranslate` messages and `player_id`/`player_name` pairs — good. Two things
to check: (1) `getTileDescription()` builds `tile_desc` via
`sprintf(clienttranslate('%s Food (%d pts)'), ucfirst($color), $points)` and passes
it as a plain arg without an `i18n` entry — verify the translation pipeline
handles this composed string (the documented pattern is to pass translatable
fragments with `'i18n' => [...]`, not a pre-composed string); (2) no
`notify->player(...)` private notifications exist, which is correct for Deep Dive
— there is no per-player hidden information beyond facedown tiles, and those are
already withheld in `getAllDatas` (see §9.1).

### 5.3 Options / stats / scores (from skill refs + overview table)

- `tableStats` / `playerStats`: `init` / `get` / `set` / `inc` (see §2.4).
- `playerScore` / `playerScoreAux`: `set($playerId, $value, $notification = null)`,
  `inc`, `get`, `getAll`, `setAll`. **Pass `null` explicitly as the notification
  argument** when the game already sends its own score notification — an omitted
  argument defaults to an automatic counter notification and an empty
  `NotificationMessage` still sends one. `playerScoreAux` is the tiebreaker: higher
  wins; describe it in `tie_breaker_description`. Never create a second counter
  named `player_score_aux`. `setUseNo(true)` switches the counter to player numbers.
- **Scoring reference (from search snippet):** reverse scoring, coop results and
  ranking rules live on the scoring page — Deep Dive is standard highest-score-wins
  with completed-sets tiebreak, so nothing special applies.

---

## 6. Front-end — game interface logic (JS/TS)

Source: `front-end/game-interface-logic/` (overview read in full, 277 lines).

- Entry point `modules/js/Game.js`, `export class Game`, constructor receives `bga`.
  Keep a `this.bga = bga` property.
- Sub-components on `this.bga`: `statusBar`, `gameArea`, `playerPanels`, `players`,
  `actions`, `states`, `notifications`, `dialogs`, `tableOptions`,
  `userPreferences`, `sounds`, `images`, `display3D`, `gameui`.
- **Lifecycle:** `constructor` (globals) → `setup(gamedatas)` (called on game start,
  on later open, on F5, and on server-side Undo — must rebuild the UI purely from
  `gamedatas`) → `onEnteringState` / `onLeavingState` / `onUpdateActionButtons`
  (all optional when JS state classes are used) → `setupNotifications` (+ handlers).
  `onUpdateActionButtons` runs **before** `onEnteringState` in ACTIVE_PLAYER states
  during play, but **after** it on F5 reload; in MULTIPLE_ACTIVE_PLAYER states the
  active players are not yet active inside `onEnteringState` — use
  `onUpdateActionButtons` for anything depending on active status.
- **JS state classes:** `this.bga.states.register('PlayerTurn', new PlayerTurn(this,
  this.bga))` in the constructor; the framework calls their `onEnteringState` etc.
  automatically. `getCurrentMainStateName()`, `setClientState(name, args)` for
  multi-step interactions without a server round-trip (client states have no PHP
  class; `restoreServerGameState()` is the cheap undo), `isOnClientState()`.
  Remove `this.bga.states.logger = console.log` before production.
- **Actions:** `this.bga.actions.performAction(action, args, {lock, checkAction,
  checkPossibleActions, ignoreDefaultErrorHandler})` — **only in reaction to a user
  action in the interface, never programmatically, in loops, callbacks,
  notifications, or `onEnteringState`/`onUpdateActionButtons`/`onLeavingState`**
  (race conditions; breaks replay/tutorials). It's async: do nothing after the call
  except return (or use promise handlers). The PHP callback returns nothing — results
  come back via notifications. `checkAction(name)` / `checkPossibleActions(name)`
  guard UI affordances.
- **Translations:** `_('…')` for every user-facing string; **never `\n` / `\t` in a
  translatable JS string** (breaks the translation bundle — use HTML markup instead).
  `bga_format(_('… *special* _tile_'), {'*': fn, '_': 'classname'})` for formatting
  without HTML in the source string.
- **Front-end libs:** declare each extra component at the top of the JS file
  (`importEsmLib('bga-animations', '1.x')`, `importDojoLibs([...])`).

### 6.1 Notifications — client side (`front-end/.../notifications/`) — read in full

- `this.bga.notifications.setupPromiseNotifications(params?)` auto-detects `notif_*`
  methods on the game object (default `{prefix: 'notif_', minDuration: 500,
  minDurationNoText: 1}`). Handlers are synchronous with a minimum duration; if a
  handler returns a Promise it ends when the promise AND the min durations are over
  (return instantly-resolving promises when animations are off — see
  `bgaAnimationsActive`). Use `this.bga.gameui.wait(ms)` for waits.
- **Notification functions in JS state classes:** pass
  `handlers: [this, ...this.bga.states.getStateClasses()]` — warning: if the same
  `notif_*` is defined in Game and in several state classes, **all of them run**.
- Manual subscribe: `dojo.subscribe('playDisc', this, 'notif_playDisc')` (legacy
  path; the promise-based setup is the modern one).
- `setSynchronous(name, ms)` / `setSynchronousDuration(ms)` (dynamic duration —
  **must** be called or the UI locks forever) and `setIgnoreNotificationCheck(type,
  predicate)` for conditionally ignoring a notification client-side. **Warning:**
  never combine dynamic synchronous duration with an ignore check without a dummy
  duration (`setSynchronous('x', 5000)`), or an ignored notification leaves the UI
  locked. Ignored notifications are still *received* by the client — **never put
  private info in them**; use `notify->player` / `_private` instead. On reload,
  `preserve` in the PHP payload keeps fields the ignore predicate needs.
- **Reserved notification names** (do not use): `gameStateChange`,
  `gameStateChangePrivateArg`, `gameStateMultipleActiveUpdate`, `newActivePlayer`,
  `playerstatus`, `yourturnack`, `clockalert`, `tableInfosChanged`,
  `playerEliminated`, `tableDecision`, `archivewaitingdelay`,
  `end_archivewaitingdelay`, `replaywaitingdelay`, `end_replaywaitingdelay`,
  `replayinitialwaitingdelay`, `end_replayinitialwaitingdelay`,
  `replay_has_ended`, `updateSpectatorList`, `wouldlikethink`,
  `updateReflexionTime`, `undoRestorePoint`, `resetInterfaceWithAllDatas`,
  `zombieModeFail`, `zombieModeFailWarning`, `aiError`, `skipTurnOfPlayer`,
  `zombieBack`, `allPlayersAreZombie`, `gameResultNeutralized`,
  `playerConcedeGame`, `showTutorial`, `showCursor`, `showCursorClick`,
  `skipTurnOfPlayerWarning`, `banFromTable`, `resultsAvailable`,
  `switchToTurnbased`, `newPrivateState`, `infomsg`.
- Predefined: `tableWindow` (scoring dialogs — PHP side), `message` (log-only),
  `simplePause` (`['time' => ms]` — pure delay for animations).
- **Dialogs** (from search snippet of `dialogs/` page): `dialogs.showMessage`,
  `showMoveUnauthorized`, `confirmation()` (async Promise), `info()`,
  `multipleChoice()`, `generic(title, content, params)`. **Guideline: AVOID
  confirmation dialogs** — they slow the game and bother players; use only for
  rare, high-consequence actions. Never put game elements in dialogs in general;
  show them on the main screen (anchors/scroll for less-used sections). Scoring
  dialogs are managed entirely PHP-side (`tableWindow`).

**Deep Dive status:** `src/ts/Game.ts:418-419` calls
`setupPromiseNotifications()` with no args and all `notif_*` handlers live on the
Game class itself — correct per docs (no `handlers:` list needed). All 9
`performAction` calls (Game.ts:355–395) are inside click handlers — correct.
**Gap found:** the server sends an `aiFinalScore` notification (`EndScore.php:55`)
but there is **no `notif_aiFinalScore` handler** in `Game.ts` — it will only appear
as a log line. Either add a handler or send it as a plain `message`.
Also `notif_tileCollected` uses a bare `setTimeout(…, 400)` instead of returning a
promise / `bga.gameui.wait()` — with promise notifications the 400 ms removal can
race the notification queue; prefer `await this.bga.gameui.wait(400)`.

---

## 7. Zombie mode

Source: `back-end/zombie-mode/` (read in full, 158 lines) + state-classes § "Function
zombie" + `bga-zombie-random-move` skill ref.

- When a player quits / is expelled for time, they become a zombie; results no
  longer count, but the game must be finishable. The zombie is a stand-in, **not**
  a reason to end the game early — "Do not try to end the game early, even in a
  two-player game."
- **Levels:** 0 = passing zombie (move on without acting, unless an action is
  required to keep the game running — e.g. 7 Wonders must discard a random card);
  1 = random legal action; 2 = greedy (greatest immediate benefit from visible
  info, no planning/memory/blocking; ties → cheapest, then random); 3 = smart
  (plans / remembers). **Aim for level 1 or 2.** Solo-only games: level 0 suffices.
  Set the level in the Game Metadata Manager; if parts differ, use the most common
  level, lowest on ties.
- **Implementation:** the framework calls the current state's `zombie()` whenever
  the zombie must act. **Never use `getCurrentPlayerId()` / `getCurrentPlayerName()`
  in zombie code** — there is no current player; use the injected `$playerId` (or
  `$playerNo` + `getPlayerNameByNo($playerNo)`). The state-classes page clarifies
  the injection: first param `int $playerId` → ID, `int $playerNo` → number;
  `array $args` (= getArgs result) is also injectable.
- **Level 1 pattern:** `$choice = $this->getRandomZombieChoice($args['playable…'])`
  then `return $this->act…($choice, $playerId, $args)` — call the existing action,
  don't duplicate its body. **Level 2:** score each legal choice, pick with
  `$this->getBestZombieChoice($pointsByChoice)`. Guard empty choice lists; never
  turn a missing choice into id `0`. Don't append a skip after an action that
  already transitions (double advance).
- **Testing:** debug menu arrow button calls each active player's `zombie()`; or
  Friendly mode → Express Start → open as another player → Quit this game
  (no karma penalty in Friendly).

**Deep Dive status — needs the `bga-zombie-random-move` workflow (level ~0–1,
deterministic):**

| State | Current zombie | Assessment |
|---|---|---|
| `PlayerDiveStep` (`:295`) | Takes `takeableFaceupIds[0]`, else flips `facedownIds[0]`, else skips | Legal and safe, but **always the first id** — deterministic, not random. Level 0/1 borderline. Should use `getRandomZombieChoice(array_values(…))` on the merged legal set (take vs flip are both legal; preferring take is a reasonable greedy tilt, but flipping the *first* facedown id is arbitrary). |
| `ConfirmFlipOrDive` (`:101`) | Always `actKeepFlipped` | Correct and safe — resurfacing ends the turn cleanly. Keep. |
| `RetreatPickTile` (`:92`) | Picks `eligibleTileIds[0]`, else empty retreat | Legal, but deterministic. Level 2 would pick the highest-points eligible tile via `getBestZombieChoice` (points by tile id), falling back to Rock. |
| `SoloChooseTiebreak` (`:75`) | Picks `candidateTileIds[0]` | Deterministic; use `getRandomZombieChoice` (the candidates are tied by definition, so random is exactly right). |

Also: `zombie()` signatures use `int $playerId` and pass it to actions typed
`int $activePlayerId` — consistent, since the framework injects the ID for that
parameter name (verified against the state-classes page). No `getCurrentPlayerId`
in any zombie path. Zombie level to record in the Metadata Manager once upgraded:
level 1 (random) or 2 if the Retreat greedy pick is implemented.

---

## 8. Tutorials — patterns relevant to Deep Dive

### 8.1 Reversi (lines 0–465 read directly; rest via search excerpts)

- **Project hygiene:** `.gitignore` for `.vscode` + `node_modules`; commit after
  each step. TS users: delete `src-disabled`, edit `src/ts/Game.ts`, never
  `modules/js/Game.js` directly.
- **States first:** model the flow as a state machine diagram before coding; rename
  the skeleton states (file + class + `Game.php` + JS references). Renaming leaves
  the old file on the server — delete it via SFTP or you get "Invalid id for state
  class … (already used by another state)".
- **Front-end state text:** `onEnteringState` sets the status bar with
  `${you}` / `${actplayer}`. Temporary status-bar action button first, then wire
  the real board click to `this.bga.states.getCurrentMainStateClass().onPlayDisc?.(x, y)`.
- **Back-end action:** `#[PossibleAction] actPlayDisc(int $x, int $y, int
  $activePlayerNo)` — param names must match the JS `performAction` args; return
  value = next state. `NextPlayer` gives extra time, activates the next player.
- **Board + ItemManager:** game items in a separate manager class
  (`modules/php/Board/BoardManager.php`, `Disc` as `#[Item]` with `#[ItemField]`
  id/location/order/side/x/y). `setupNewGame` creates the initial items.
- **`getAllDatas` / `getArgs`:** a `BoardManager::getBoardDiscs(): Collection`
  feeds `getAllDatas`; `getArgs` sends the active player's possible moves.
- **Rules as pure PHP:** `getPossibleMoves($playerId)` is used both to highlight
  legal squares on the client AND to validate the move server-side; a
  `getTurnedOverDiscs(x, y)` helper computes flips. Doc warning: **don't load the
  whole board with a SQL query multiple times** — DB queries are slow.
- **Notifications:** `setupNotifications()` with `setupPromiseNotifications()`;
  handlers `notif_playDisc`, `notif_turnOverDiscs`, `notif_newScores` (score via
  `scoreCtrl[player_id].toValue(newScore)` in the old tutorial; modern equivalent
  is the `playerScore` PlayerCounter). Until notifications exist, F5 is needed to
  see moves.
- **Zombie (level 1):** `zombie(int $playerId)` in the state class: get possible
  moves, `$possibleMovesArray[bga_rand(0, count-1)]`, play it.
- **End game / stats:** final scores + game stats in the end-score state; debug
  menu (save/restore, zombie arrow) for testing.

### 8.2 Hearts (lines 0–437 read directly; rest via search excerpts)

- Same skeleton flow as Reversi (states → status bar → temp button → real action),
  but with **player zones** (one per player, in a row) and a **hand area** shown only
  to non-spectators (`isCurrentPlayerSpectator()` check). **Private-data rule
  stated explicitly:** each player must only see their own hand — enforced
  server-side in `getAllDatas`/args, not just hidden in CSS.
- Cards via ItemManager (`modules/php/Cards/Card.php`, `#[Item]`, location with
  `locationIndex`); deck dealt in `setupNewGame`.
- **Multi-step flow states:** `GiveCards` (pass 3 cards) is a
  `MULTIPLE_ACTIVE_PLAYER` state; `PlayCard` → `NextPlayer` → `EndTrick` →
  `PlayCard` / `EndRound` → `EndScore` / `gameEnd`. `EndTrick` resolves the trick,
  `EndRound` scores the hand.
- **Scoring:** update `bga->playerScore` (PlayerCounter) when a trick is captured
  — scores update live on the player panels. End condition example:
  `if ($game->playerScore->getMin() <= -100) return 99;` (Hearts is low-score-wins,
  hence `getMin`). Tutorial's simplified scoring: −1 per heart, game ends at −100.
- **Scoring dialog:** for a real game, consider a `tableWindow` scoring dialog;
  out of scope for the tutorial.
- **Options:** the tutorial changes `gameoptions` to 4 players only mid-tutorial
  and notes the reload dance (reload game options → new table).
- **Zombie:** the *new* tutorial's `PlayCard::zombie` throws `BgaUserException('Not
  implemented…')` as a placeholder — i.e. the tutorial itself ships without zombie
  play and says to implement it; the *old* wiki version had a `zombieTurn` form.
  Do not copy the throwing placeholder into a real game.

### 8.3 Tutorial patterns applied to Deep Dive

- **Compute legal moves in PHP, send via `getArgs`, validate against them in
  `act*`.** Deep Dive already does this (`facedownIds`, `takeableFaceupIds`,
  `canSkip`, `validRockDepths` in `PlayerDiveStep::getArgs`, checked again in the
  actions). Keep this shape; it is exactly the Reversi `getPossibleMoves` pattern.
- **Separate decision states instead of one mega-state.** Deep Dive's split
  (`PlayerDiveStep` / `ConfirmFlipOrDive` / `RetreatPickTile`) matches the Hearts
  split (`PlayCard` / `EndTrick` / `GiveCards`) and the state-class doc's design
  guidance. Keep.
- **Notifications drive the board; `getAllDatas` rebuilds it.** Deep Dive's 8
  `notif_*` handlers + full `getAllDatas` rebuild follow the tutorial shape. The
  missing `notif_aiFinalScore` handler (§6.1) is the one gap.
- **EndScore before 99.** Deep Dive's `EndScore` (98) → 99 mirrors both tutorials.
  Hearts' `playerScore->getMin()` pattern is a reminder that Deep Dive's
  highest-score-wins + `playerScoreAux` (completed sets) is the standard path —
  no `getMin`/`getMax` subtlety applies.
- **Solo AI as a GAME state** (`AiTurn`) has no direct tutorial equivalent (neither
  tutorial has an AI opponent); Hearts' `GiveCards` multiactive pattern is the
  closest analogue for the *human* tiebreak decision (`SoloChooseTiebreak` as a
  normal ACTIVE_PLAYER state is the right call — a multiactive state would be
  wrong with a single human).

---

## 9. Deep Dive — findings list (violations / opportunities)

Ordered by likely impact. All paths verified by grep/read on 2026-11-19/20.

### Must fix / verify before alpha

1. **Option read bypasses `tableOptions`** — `modules/php/Game.php:93` uses
   `$options[100] ?? 1` (the `setupNewGame` parameter). Use a typed helper:
   `$this->bga->tableOptions->get(100) ?? 1`. (Table-options doc §2.2.)
2. **`getGameProgression()` denominator is wrong** — `Game.php:44` hardcodes
   `$totalInitial = 120` ("approximate"). Actual facedown tiles at setup vary by
   player count: 160 tiles − extras removed (46 for 1–3P, 0 for 4–6P) − per-depth
   removals (7/3/5/4/3 per depth for 1–2/3/4/5/6 players). E.g. 1P ≈ 79, 6P = 145.
   Progression is therefore overstated at low player counts. Store the real
   initial facedown count in a global at setup (or count `location='ocean'` once
   at setup) and divide by that.
3. **Zombie choices are deterministic, not random** — see §7 table. Upgrade with
   `getRandomZombieChoice` (`PlayerDiveStep`, `SoloChooseTiebreak`) and
   `getBestZombieChoice` (`RetreatPickTile`) via the `bga-zombie-random-move`
   workflow, then set the zombie level in the Metadata Manager.
4. **Score writes may double-notify** — `Game.php:411-412`:
   `$this->playerScore->set($playerId, $total)` /
   `$this->playerScoreAux->set($playerId, $sets)` with no 3rd argument. Per the
   `bga-new-apis` ref, pass `null` explicitly to suppress the automatic counter
   notification when the game sends its own score-related notifications. Verify in
   Studio whether the score counter currently animates twice per collection.

### Should fix

5. **No `notif_aiFinalScore` client handler** — server sends it (`EndScore.php:55`),
   client has no handler (`Game.ts` has 8 `notif_*`, none for this). Add one or
   downgrade the server call to a `message` notification. (§6.1)
6. **`shuffle()` for setup randomness** — `Game.php:193,202` shuffles tile-id arrays
   to remove tiles and assign `tile_order`. The framework doc bans `rand` /
   `mt_rand` / SQL `RAND()` and prescribes `bga_rand` for individual choices; the
   idiomatic path for shuffling game items is Deck/ItemManager shuffle. `shuffle()`
   is not literally in the banned list, but framework-managed randomness is
   preferred and easier to reason about for replays — review when/if the tile
   store migrates to ItemManager (see #8).
7. **`tile_desc` translation composition** — `getTileDescription()` in the state
   classes builds the string with `sprintf(clienttranslate('%s Food (%d pts)'),
   ucfirst($color), $points)` and passes it as a plain notification arg with no
   `i18n` entry. The documented pattern passes translatable fragments with
   `'i18n' => [...]` (or nested `log`/`args` fragments). Verify the composed
   string actually translates in Studio; if not, restructure to the fragment
   pattern. (§5.2)
8. **Raw SQL instead of ItemManager/Deck** — 23 DB calls in `Game.php`, custom
   `ocean_tile` + `trapped_penguin` tables. Raw SQL is a documented path
   (Database page — not yet read directly), so this is **not** a violation, but the
   plan (`docs/implementation_plan.md`) specified a typed `OceanTile` ItemManager
   entity, and ItemManager would remove the hand-rolled ordering/location bookkeeping
   and give typed `Collection::where()` filtering. A migration is a large, optional
   cleanup — decide explicitly, don't drift.
9. **`console.log` left in client code** — `src/ts/Game.ts:16,32,98` (and therefore
   built `modules/js/Game.js:110,123,182`). Docs say to remove state logger /
   console debug before production. Remove or gate behind a debug flag.
10. **`notif_tileCollected` uses bare `setTimeout(…, 400)`** instead of returning a
    promise / `await this.bga.gameui.wait(400)` — can race the promise-notification
    queue. (§6.1)

### Verify (probably fine, confirm in Studio)

11. **Unused stats?** `dives_taken` and `rocks_used` are initialized but no `inc`
    call was found by grep — confirm or remove from `stats.jsonc`.
12. **Facedown-tile privacy — GOOD, verified.** `Game.php` `getAllDatas()` selects
    full tile rows but serializes facedown tiles as only
    `{id, depth, isFaceup: false}` — category/color/points never leave the server.
    This is exactly the `getArgs` private-data rule (§5.1) applied to `getAllDatas`.
13. **`suggest_player_number: 4` with solo as lowest count** — fine today (solo
    works with default options); revisit if solo ever needs a non-default mode.
    (§2.1)
14. **No undo offered after flips** — matches the plan and the hidden-information
    rule (an undo would re-hide revealed info); the framework `logs` API handles
    undo where offered, and Deep Dive correctly offers none here.

### Already compliant (do not "fix")

- No deprecated `gameinfos.jsonc` keys; `game_interface_width` has `min` only.
- `gamepreferences.jsonc` is `{}` (empty-object rule).
- Namespaced PSR-4 classes, `strict_types`, autowired `#[PossibleAction]` actions,
  no `.action.php` / `.tpl` / `view.php`, no `@` error suppression.
- All ACTIVE_PLAYER states have `description` + `descriptionMyTurn`; zombie
  callbacks exist on all four; `zombie(int $playerId)` injection is correct.
- `EndScore` (98) → 99; no override of `stGameEnd`/`argGameEnd`.
- Notifications use `notify->all` + `clienttranslate` + `player_id`/`player_name`
  pairs; no reserved notification names used (`tileFlipped`, `tileCollected`,
  `penguinMovedDepth`, `predatorTrapped`, `penguinRetreat`, `rockIngested`,
  `gameEndTriggered`, `lastDiveFlipped`, `aiFinalScore` — none on the reserved list).
- Built JS is non-minified; TS sources + build scripts present.

---

## 10. Sources read

- https://doc.studio.boardgamearena.com/framework-documentation/ (overview)
- https://doc.studio.boardgamearena.com/framework-documentation/game-metadata/
- https://doc.studio.boardgamearena.com/framework-documentation/game-metadata/media/
- https://doc.studio.boardgamearena.com/framework-documentation/game-metadata/tags/
- https://doc.studio.boardgamearena.com/framework-documentation/game-metadata/metadata/
- https://doc.studio.boardgamearena.com/framework-documentation/guidelines/
- https://doc.studio.boardgamearena.com/framework-documentation/guidelines/code/
- https://doc.studio.boardgamearena.com/framework-documentation/ai-tooling/
- https://doc.studio.boardgamearena.com/framework-documentation/back-end/main-game-logic/ (lines 0–366)
- https://doc.studio.boardgamearena.com/framework-documentation/back-end/main-game-logic/table-options/
- https://doc.studio.boardgamearena.com/framework-documentation/back-end/main-game-logic/notify/
- https://doc.studio.boardgamearena.com/framework-documentation/back-end/game-state-classes/
- https://doc.studio.boardgamearena.com/framework-documentation/back-end/zombie-mode/
- https://doc.studio.boardgamearena.com/framework-documentation/back-end/game-meta-information/
- https://doc.studio.boardgamearena.com/framework-documentation/front-end/game-interface-logic/
- https://doc.studio.boardgamearena.com/framework-documentation/front-end/game-interface-logic/notifications/
- https://doc.studio.boardgamearena.com/get-started/tutorials/tutorial-reversi/ (lines 0–465 + search excerpts)
- https://doc.studio.boardgamearena.com/get-started/tutorials/tutorial-hearts/ (lines 0–437 + search excerpts)
- Local: `~/workspace/custom-skills/modernize-bga-game-project/SKILL.md` and
  `references/bga-{jsonc-files,gameinfos-cleanup,new-apis,zombie-random-move,state-classes-common,autoload,autowired-actions}.md`
- Search snippets: front-end `states/` and `actions/` pages, `dialogs/` page,
  `player-score-aux/` page, old-wiki Reversi/Hearts tutorial mirrors
  (en.doc.boardgamearena.com).

*Written 2026-11-19/20. No game code was edited.*
