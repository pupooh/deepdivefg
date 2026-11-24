class PlayerDiveStep {
    constructor(game, bga) {
        this.game = game;
        this.bga = bga;
    }
    onEnteringState(args, isCurrentPlayerActive) {
        this.args = args;
        this.game.setActiveDepth(args.currentDepth);
        if (isCurrentPlayerActive) {
            this.game.setDiveStepInteractivity(args);
            // Add action buttons in status bar
            if (args.canSkip) {
                const nextDepth = args.currentDepth + 1;
                this.bga.statusBar.addActionButton(_(`Skip Depth ${args.currentDepth} (Dive to ${nextDepth})`), () => this.game.performSkipDepth(), { color: 'primary' });
            }
            if (args.canIngestRock && args.validRockDepths.length > 0) {
                args.validRockDepths.forEach(depth => {
                    if (depth > 1) {
                        this.bga.statusBar.addActionButton(_(`Ingest Rock 🪨 Plunge to Depth ${depth}`), () => this.game.performIngestRock(depth), { color: 'secondary' });
                    }
                });
            }
        }
        else {
            this.game.clearInteractivity();
        }
    }
    onLeavingState(args, isCurrentPlayerActive) {
        this.game.clearInteractivity();
    }
}

class ConfirmFlipOrDive {
    constructor(game, bga) {
        this.game = game;
        this.bga = bga;
    }
    onEnteringState(args, isCurrentPlayerActive) {
        this.args = args;
        this.game.setActiveDepth(args.currentDepth);
        if (isCurrentPlayerActive && args.flippedTile) {
            // Resurface button
            this.bga.statusBar.addActionButton(_(`Resurface`), () => this.game.performKeepFlipped(), { color: 'primary' });
            // Dive deeper button
            this.bga.statusBar.addActionButton(_(`Dive deeper`), () => this.game.performDiveDeeper(), { color: 'secondary' });
            this.game.setConfirmFlipInteractivity(args);
        }
        else {
            this.game.clearInteractivity();
        }
    }
    onLeavingState(args, isCurrentPlayerActive) {
        this.game.clearInteractivity();
    }
}

class RetreatPickTile {
    constructor(game, bga) {
        this.game = game;
        this.bga = bga;
    }
    onEnteringState(args, isCurrentPlayerActive) {
        this.args = args;
        if (isCurrentPlayerActive) {
            this.game.setRetreatPickInteractivity(args);
            // Action button for each eligible tile
            args.eligibleTiles.forEach(tile => {
                const desc = this.game.getTileDescription(tile);
                this.bga.statusBar.addActionButton(_(`Rescue ${desc} (Depth ${tile.depth})`), () => this.game.performSelectRetreatTile(tile.id), { color: 'primary' });
            });
            // Retreat empty-handed button
            this.bga.statusBar.addActionButton(_(`Retreat Empty-Handed`), () => this.game.performRetreatEmpty(), { color: 'secondary' });
        }
        else {
            this.game.clearInteractivity();
        }
    }
    onLeavingState(args, isCurrentPlayerActive) {
        this.game.clearInteractivity();
    }
}

class SoloChooseTiebreak {
    constructor(game, bga) {
        this.game = game;
        this.bga = bga;
    }
    onEnteringState(args, isCurrentPlayerActive) {
        this.args = args;
        if (isCurrentPlayerActive) {
            this.game.setSoloTiebreakInteractivity(args);
            args.candidateTiles.forEach(tile => {
                const desc = this.game.getTileDescription(tile);
                this.bga.statusBar.addActionButton(_(`Give AI ${desc} (Depth ${tile.depth})`), () => this.game.performChooseAiTile(tile.id), { color: 'primary' });
            });
        }
        else {
            this.game.clearInteractivity();
        }
    }
    onLeavingState(args, isCurrentPlayerActive) {
        this.game.clearInteractivity();
    }
}

/*
To use the BGA libs, add `import { BgaAnimations, BgaCards } from "./libs";` in the files using them.

To get the latest typing files (that you would save at the root of your game), read the lib doc and see the demo, go to:
https://en.doc.boardgamearena.com/BgaAnimations
https://en.doc.boardgamearena.com/BgaCards
*/
const BgaAnimations = await globalThis.importEsmLib('bga-animations', '1.x');
const BgaCards = await globalThis.importEsmLib('bga-cards', '1.x');

/**
 * The card manager for Deep Dive's ocean tiles.
 *
 * This is our own subclass of the bga-cards library manager, following the
 * Hearts tutorial pattern (`class CardManager extends BgaCards.Manager`).
 * It describes how to display a tile: the `type` gives every card element
 * the `dd-tile` class (and `dd-tile-front` / `dd-tile-back` on the sides),
 * and setupFrontDiv/setupBackDiv paint the faces.
 *
 * Why a subclass, and why `BgaCards.Manager` (not `BgaCards.CardManager`)?
 * Studio loads bga-cards from BGA's CDN
 * (x.boardgamearena.net/data/game-libs/bga-cards/1.x/dist/bga-cards.umd.js),
 * which exports the manager class as `Manager` — `BgaCards.CardManager`
 * does not exist there, so `new BgaCards.CardManager(...)` fails at runtime
 * with "BgaCards.CardManager is not a constructor". The GitHub 1.1.2 code
 * exports it as `CardManager`, but that is a different lineage from what
 * Studio serves. The repo's bga-cards.d.ts / bga-animations.d.ts are the
 * CDN dist typings (downloaded Nov 19, 2026; 1.x then matched 1.0.18) —
 * do not edit them, and re-download only when a new 1.x ships.
 */
class OceanTileManager extends BgaCards.Manager {
    constructor(game) {
        super({
            animationManager: game.animationManager,
            type: 'dd-tile',
            getId: (tile) => `dd-tile-${tile.id}`,
            setupFrontDiv: (tile, div) => {
                // The side div already carries `bga-cards_card-side front
                // dd-tile-front`; add only the face classes, never replace
                // className (that would drop the lib's classes).
                div.classList.add(...tileFaceClasses(tile).split(' '));
                div.innerHTML = renderTileFrontInnerHtml(tile);
            },
            setupBackDiv: (tile, div) => {
                div.classList.add('tile-facedown', `depth-back-${tile.depth}`);
                div.innerHTML = renderTileBackInnerHtml(tile);
            },
            isCardVisible: (tile) => tile.isFaceup,
            cardWidth: 68,
            cardHeight: 68,
            cardBorderRadius: '8px',
        });
    }
}
/** Face classes for a tile's front side (food colour / rock / open water / predator). */
function tileFaceClasses(tile) {
    const cat = tile.category || 'open_water';
    // Front background is driven by depth (depth-front-N), not by category
    // or food color; the food color shows on the animal itself instead.
    return `tile-faceup tile-${cat} depth-front-${tile.depth}`;
}
/** Inner HTML of a facedown tile's back side. */
function renderTileBackInnerHtml(tile) {
    // The wave texture is the back's background image (see Game.scss
    // .tile-facedown::before); no inner content needed.
    return `<div class="tile-back-inner"></div>`;
}
/** Inner HTML of a faceup tile's front side. */
function renderTileFrontInnerHtml(tile) {
    const cat = tile.category || 'open_water';
    let innerHtml = '';
    if (cat === 'food') {
        const color = tile.foodColor || 'pink';
        // Animal by depth, in its food color: rulebook art
        // (img/animal-{species}-{color}.webp).
        const speciesByDepth = {
            1: 'shrimp',
            2: 'crab',
            3: 'school',
            4: 'fish',
            5: 'squid',
        };
        const species = speciesByDepth[tile.depth] || 'fish';
        innerHtml = `
            <div class="tile-animal-img animal-${species}-${color}"></div>
            <div class="tile-points-badge">${tile.points}</div>
        `;
    }
    else if (cat === 'rock') {
        innerHtml = `
            <div class="tile-animal-img tile-rock-img"></div>
        `;
    }
    else if (cat === 'open_water') {
        innerHtml = `
            <div class="tile-animal-img tile-bubbles-img"></div>
        `;
    }
    else if (cat === 'predator') {
        // Predator animal by depth, rulebook art (img/predator-{animal}-d{N}.webp):
        // seal D1-D2, killer whale D3-D4, shark D5.
        const predatorImg = tile.depth === 5 ? 'predator-shark'
            : tile.depth <= 2 ? `predator-seal-d${tile.depth}`
                : `predator-orca-d${tile.depth}`;
        innerHtml = `
            <div class="tile-animal-img ${predatorImg}"></div>
            <span class="tile-predator-warning" title="${_('Predator')}">⚠️</span>
            <div class="tile-trapped-dock" id="dd-dock-${tile.id}"></div>
        `;
    }
    const extraBadge = tile.isExtra ? `<span class="tile-extra-icon" title="${_('4+ Player Tile')}">★</span>` : '';
    return `${extraBadge}${innerHtml}`;
}

/** Pseudo-player id for the solo AI opponent (no tableau UI). */
const AI_PLAYER_ID = 9999;
/** Meeple color name for a player's hex color (gameinfos player_colors).
 *  Exact match for the 6 meeple colors; otherwise the nearest meeple color
 *  by RGB distance — older tables keep the default BGA colors, which must
 *  still map to a meeple instead of falling back to blue. */
function penguinColorName(colorHex) {
    const hex = (colorHex || '').toLowerCase().replace(/^#/, '');
    const exact = {
        a12167: 'magenta',
        '6a9f44': 'green',
        '3e90bc': 'blue',
        cac42f: 'yellow',
        '55366f': 'purple',
        aa4026: 'orange',
    };
    if (exact[hex])
        return exact[hex];
    if (!/^[0-9a-f]{6}$/.test(hex))
        return 'blue';
    const rgb = {
        magenta: [0xa1, 0x21, 0x67],
        green: [0x6a, 0x9f, 0x44],
        blue: [0x3e, 0x90, 0xbc],
        yellow: [0xca, 0xc4, 0x2f],
        purple: [0x55, 0x36, 0x6f],
        orange: [0xaa, 0x40, 0x26],
    };
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    let best = 'blue';
    let bestDist = Infinity;
    for (const [name, [cr, cg, cb]] of Object.entries(rgb)) {
        const dist = (r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2;
        if (dist < bestDist) {
            bestDist = dist;
            best = name;
        }
    }
    return best;
}
/** The three penguin designs, in the order they stay available. */
const PENGUIN_DESIGN_SUFFIX = ['', '-running', '-lying']; // standing, running, sliding (lying image)
/** CSS classes for one penguin meeple of a given design (0 standing, 1 running, 2 sliding). */
function penguinMeepleClasses(playerColorHex, design) {
    const name = penguinColorName(playerColorHex);
    const d = Math.min(2, Math.max(0, design));
    return `penguin-meeple${d === 2 ? ' penguin-meeple-sliding' : ''} penguin${PENGUIN_DESIGN_SUFFIX[d]}-${name}`;
}
/** HTML for `count` penguin meeples in the player's color: one of each
 *  design (standing, running, sliding). When fewer than 3 are available
 *  the sliding one is gone first (it is the diving penguin), then running. */
function penguinMeeplesHtml(playerColorHex, count) {
    const n = Math.max(0, Math.min(3, count));
    return Array.from({ length: n }, (_, i) => `<span class="${penguinMeepleClasses(playerColorHex, i)}"></span>`).join('');
}
class Game {
    constructor(bga) {
        this.oceanStocks = {};
        this.tableauStocks = new Map();
        this.rockStocks = {};
        /** Tile objects handed to the stocks, keyed by tile id. Notifications merge into these. */
        this.tilesById = new Map();
        /** Client-side tableau model: playerId -> rowIdx -> tiles. Mirrors the server rows. */
        this.tableauModel = {};
        this.trappedPenguins = [];
        /** The player whose penguin is currently diving (hidden from their tableau). */
        this.divingPlayerId = null;
        /** Resolves once the setup addCards calls have placed every tile. */
        this.stocksReady = Promise.resolve([]);
        /** Bumped by every set/clear interactivity call; stale async applies are ignored. */
        this.interactivityToken = 0;
        /** Current ocean-tile click handler, set by the active state's interactivity. */
        this.oceanClickHandler = null;
        console.log('DeepDiveFG constructor');
        this.bga = bga;
        // Register modern state classes
        this.playerDiveStep = new PlayerDiveStep(this, bga);
        this.confirmFlipOrDive = new ConfirmFlipOrDive(this, bga);
        this.retreatPickTile = new RetreatPickTile(this, bga);
        this.soloChooseTiebreak = new SoloChooseTiebreak(this, bga);
        this.bga.states.register('PlayerDiveStep', this.playerDiveStep);
        this.bga.states.register('ConfirmFlipOrDive', this.confirmFlipOrDive);
        this.bga.states.register('RetreatPickTile', this.retreatPickTile);
        this.bga.states.register('SoloChooseTiebreak', this.soloChooseTiebreak);
    }
    setup(gamedatas) {
        console.log("Starting Deep Dive setup", gamedatas);
        this.gamedatas = gamedatas;
        this.trappedPenguins = [...(gamedatas.trappedPenguins || [])];
        // The active player's penguin is diving from the start of their turn
        // (hidden from their tableau); setActiveDepth below confirms it.
        this.divingPlayerId = this.bga.players.getActivePlayerId();
        // Client-side tableau model, built before the board HTML so row
        // shells render with their correct initial scores.
        for (const [pId, tableau] of Object.entries(gamedatas.tableaus || {})) {
            const playerId = Number(pId);
            this.tableauModel[playerId] = {};
            for (const [rIdx, row] of Object.entries(tableau.rows || {})) {
                this.tableauModel[playerId][Number(rIdx)] = [...(row.tiles || [])];
            }
        }
        const gameArea = this.bga.gameArea.getElement();
        gameArea.innerHTML = '';
        // Build main container (lanes and tableau slots start empty; stocks fill them)
        gameArea.insertAdjacentHTML('beforeend', `
            <div id="dd-container">
                <div id="dd-main-layout">
                    <!-- Player Tableaus Area -->
                    <div id="dd-players-area">
                        <div id="dd-tableaus-container">
                            ${Object.keys(gamedatas.players).map(pId => this.renderPlayerTableauHtml(Number(pId))).join('')}
                        </div>
                    </div>

                    <!-- Ocean Board: 5 Depth Rows with wrapping tile lanes -->
                    <div id="dd-ocean-board">
                        ${[1, 2, 3, 4, 5].map(d => this.renderDepthRowHtml(d, gamedatas.depths[d])).join('')}
                    </div>
                </div>
            </div>
        `);
        // Setup player side panels
        Object.entries(gamedatas.players).forEach(([pId, player]) => {
            const playerId = Number(pId);
            const panel = this.bga.playerPanels.getElement(playerId);
            if (panel) {
                const tableau = gamedatas.tableaus[playerId];
                panel.insertAdjacentHTML('beforeend', `
                    <div class="dd-player-panel-extra" id="dd-panel-extra-${playerId}">
                        <div class="dd-panel-row">
                            <span class="dd-icon-penguin" title="${_('Available Penguins')}"><span id="dd-panel-penguins-${playerId}">${penguinMeeplesHtml(player.color, this.availablePenguinCount(playerId))}</span></span>
                            <span class="dd-icon-rock" title="${_('Held Rocks')}">🪨 <strong id="dd-panel-rocks-${playerId}">${tableau ? tableau.rockCount : 0}</strong></span>
                        </div>
                        <div class="dd-panel-row">
                            <span class="dd-icon-sets" title="${_('Completed Food Sets')}">⭐ <strong id="dd-panel-sets-${playerId}">${tableau ? tableau.completedSets : 0}</strong> ${_('Sets')}</span>
                        </div>
                    </div>
                `);
            }
        });
        // Build the tile registry from gamedatas (ocean + tableaus)
        for (let d = 1; d <= 5; d++) {
            for (const tile of gamedatas.depths[d]?.tiles || []) {
                this.tilesById.set(tile.id, tile);
            }
        }
        for (const tableau of Object.values(gamedatas.tableaus || {})) {
            for (const row of Object.values(tableau.rows || {})) {
                for (const tile of row.tiles || []) {
                    this.tilesById.set(tile.id, tile);
                }
            }
        }
        // Animation manager first: the tile manager needs it in its
        // settings, and it gates all bga-cards animations on the
        // framework's replay/instantaneous flag.
        this.animationManager = new BgaAnimations.Manager({
            animationsActive: () => this.bga.gameui.bgaAnimationsActive(),
        });
        // Tile manager: one manager for every tile in the game.
        this.tileManager = new OceanTileManager(this);
        const addPromises = [];
        // Ocean: one LineStock per depth lane.
        for (let d = 1; d <= 5; d++) {
            const lane = document.getElementById(`dd-depth-tiles-${d}`);
            if (!lane)
                continue;
            const stock = new BgaCards.LineStock(this.tileManager, lane, {
                wrap: 'wrap',
                center: false,
                gap: '8px',
            });
            stock.onCardClick = (tile) => {
                if (this.oceanClickHandler)
                    this.oceanClickHandler(tile);
            };
            this.oceanStocks[d] = stock;
            const tiles = (gamedatas.depths[d]?.tiles || []).map(t => this.tilesById.get(t.id));
            if (tiles.length)
                addPromises.push(stock.addCards(tiles));
        }
        // Tableaus: one SlotStock per player per set row (pink/green/yellow slots).
        for (const [pId, tableau] of Object.entries(gamedatas.tableaus || {})) {
            const playerId = Number(pId);
            for (const [rIdx, row] of Object.entries(tableau.rows || {})) {
                const rowIdx = Number(rIdx);
                const tiles = (row.tiles || []).map(t => this.tilesById.get(t.id));
                const stock = this.ensureTableauRowStock(playerId, rowIdx);
                if (tiles.length)
                    addPromises.push(stock.addCards(tiles));
            }
        }
        // Rocks: one VoidStock per player, anchored on the tableau header.
        // Collected rocks slide here and disappear into the rock reserve.
        for (const pId of Object.keys(gamedatas.players)) {
            const anchor = document.getElementById(`dd-rock-stock-${Number(pId)}`);
            if (anchor) {
                this.rockStocks[Number(pId)] = new BgaCards.VoidStock(this.tileManager, anchor);
            }
        }
        this.stocksReady = Promise.all(addPromises);
        // Set active depth
        this.setActiveDepth(gamedatas.currentDepth);
        // Trapped-penguin docks live inside predator front divs, which only
        // exist once the setup addCards have run.
        void this.stocksReady.then(() => this.updateAllTrappedPenguins());
        // Setup cometD notifications
        this.setupNotifications();
        console.log("Deep Dive setup completed");
    }
    ///////////////////////////////////////////////////
    //// HTML Rendering Helpers
    renderDepthRowHtml(depth, depthData) {
        const depthNames = [
            _('Sunlight Zone'),
            _('Twilight Zone'),
            _('Midnight Zone'),
            _('Abyssal Zone'),
            _('Hadal Trench'),
        ];
        const isExhausted = depthData ? depthData.facedownCount === 0 : false;
        return `
            <div class="dd-depth-row depth-${depth} ${isExhausted ? 'depth-exhausted' : ''}" id="dd-depth-${depth}" data-depth="${depth}">
                <div class="dd-depth-header">
                    <span class="dd-depth-badge">D${depth}</span>
                    <span class="dd-depth-title">${depthNames[depth - 1]}</span>
                    <div class="dd-depth-penguins" id="dd-depth-penguins-${depth}"></div>
                    <span class="dd-depth-exhausted-badge">${_('Exhausted — Skippable')}</span>
                </div>
                <div class="dd-depth-tiles-lane" id="dd-depth-tiles-${depth}"></div>
            </div>
        `;
    }
    renderTableauRowShellHtml(playerId, rowIdx) {
        const tiles = this.tableauModel[playerId]?.[rowIdx] || [];
        const sum = tiles.reduce((s, t) => s + (t.points || 0), 0);
        const isComplete = tiles.length === 3;
        const value = isComplete ? sum : Math.floor(sum / 2);
        const tooltip = isComplete ? '' : ` title="${_('Points halved — set not full')}: ${sum} ÷ 2 = ${value}"`;
        return `
            <div class="dd-tableau-row ${isComplete ? 'row-complete' : 'row-incomplete'}" id="dd-row-${playerId}-${rowIdx}">
                <div class="dd-row-slots"></div>
                <span class="dd-row-equals">=</span>
                <span class="dd-row-score-value"${tooltip}>${value}</span>
            </div>
        `;
    }
    renderPlayerTableauHtml(playerId) {
        const player = this.gamedatas.players[playerId];
        const tableau = this.gamedatas.tableaus[playerId];
        const currentUserId = this.bga.players.getCurrentPlayerId();
        const isCurrent = playerId === currentUserId;
        let rowsHtml = '';
        if (tableau && tableau.rows) {
            Object.keys(tableau.rows).forEach(rIdx => {
                rowsHtml += this.renderTableauRowShellHtml(playerId, Number(rIdx));
            });
        }
        if (!rowsHtml) {
            rowsHtml = `<div class="dd-empty-tableau-msg">${_('No food collected yet')}</div>`;
        }
        return `
            <div class="dd-player-tableau ${isCurrent ? 'my-tableau' : 'other-tableau'}" id="dd-tableau-${playerId}" style="border-top-color: #${player.color};">
                <div class="dd-tableau-header">
                    <span class="dd-player-name" style="color: #${player.color}; font-weight: bold;">${player.name}</span>
                    <div class="dd-tableau-stats">
                        <span class="dd-stat-penguins" title="${_('Available Penguins')}"><span id="dd-avail-penguins-${playerId}">${penguinMeeplesHtml(player.color, this.availablePenguinCount(playerId))}</span></span>
                        <span class="dd-stat-rocks" title="${_('Held Rocks')}">🪨 <span id="dd-held-rocks-${playerId}">${tableau ? tableau.rockCount : 0}</span></span>
                        <span class="dd-rock-stock-anchor" id="dd-rock-stock-${playerId}"></span>
                        <span class="dd-stat-score" title="${_('Total Points')}">⭐ <span id="dd-total-score-${playerId}">${tableau ? tableau.score : 0}</span> pts</span>
                    </div>
                </div>
                <div class="dd-tableau-rows" id="dd-tableau-rows-${playerId}">
                    ${rowsHtml}
                </div>
            </div>
        `;
    }
    ///////////////////////////////////////////////////
    //// Stock helpers
    /**
     * Get (creating if needed) the SlotStock for one player's tableau row.
     * Creates the row shell HTML first when the row does not exist yet.
     */
    ensureTableauRowStock(playerId, rowIdx) {
        const key = `${playerId}-${rowIdx}`;
        const existing = this.tableauStocks.get(key);
        if (existing)
            return existing;
        let rowEl = document.getElementById(`dd-row-${playerId}-${rowIdx}`);
        if (!rowEl) {
            const container = document.getElementById(`dd-tableau-rows-${playerId}`);
            if (!container)
                throw new Error(`Tableau rows container missing for player ${playerId}`);
            const emptyMsg = container.querySelector('.dd-empty-tableau-msg');
            if (emptyMsg)
                emptyMsg.remove();
            container.insertAdjacentHTML('beforeend', this.renderTableauRowShellHtml(playerId, rowIdx));
            rowEl = document.getElementById(`dd-row-${playerId}-${rowIdx}`);
            if (!rowEl)
                throw new Error(`Failed to create tableau row ${rowIdx} for player ${playerId}`);
        }
        const slotsEl = rowEl.querySelector('.dd-row-slots');
        if (!slotsEl)
            throw new Error(`Row slots container missing for player ${playerId} row ${rowIdx}`);
        const stock = new BgaCards.SlotStock(this.tileManager, slotsEl, {
            slotsIds: ['pink', 'green', 'yellow'],
            slotClasses: ['dd-slot'],
            mapCardToSlot: (card) => card.foodColor || 'pink',
            wrap: 'nowrap',
            center: false,
            gap: '6px',
        });
        this.tableauStocks.set(key, stock);
        return stock;
    }
    /** Merge a notification's tile payload into the registry object stocks hold. */
    mergeTile(notifTile) {
        const existing = this.tilesById.get(notifTile.id);
        if (existing) {
            Object.assign(existing, notifTile);
            return existing;
        }
        this.tilesById.set(notifTile.id, notifTile);
        return notifTile;
    }
    /** Run fn once the setup stocks are populated, unless interactivity moved on. */
    applyWhenStocksReady(token, fn) {
        void this.stocksReady.then(() => {
            if (token === this.interactivityToken)
                fn();
        });
    }
    /** Recompute one tableau row's value/complete state and the player's totals. */
    updateTableauRowDisplay(playerId, rowIdx) {
        const tiles = this.tableauModel[playerId]?.[rowIdx] || [];
        const sum = tiles.reduce((s, t) => s + (t.points || 0), 0);
        const complete = tiles.length === 3;
        const value = complete ? sum : Math.floor(sum / 2);
        const rowEl = document.getElementById(`dd-row-${playerId}-${rowIdx}`);
        if (rowEl) {
            rowEl.classList.toggle('row-complete', complete);
            rowEl.classList.toggle('row-incomplete', !complete);
            const valueEl = rowEl.querySelector('.dd-row-score-value');
            if (valueEl) {
                valueEl.textContent = String(value);
                if (complete)
                    valueEl.removeAttribute('title');
                else
                    valueEl.setAttribute('title', `${_('Points halved — set not full')}: ${sum} ÷ 2 = ${value}`);
            }
        }
        let total = 0;
        let sets = 0;
        for (const row of Object.values(this.tableauModel[playerId] || {})) {
            const rowSum = row.reduce((s, t) => s + (t.points || 0), 0);
            if (row.length === 3) {
                total += rowSum;
                sets++;
            }
            else {
                total += Math.floor(rowSum / 2);
            }
        }
        const totalEl = document.getElementById(`dd-total-score-${playerId}`);
        if (totalEl)
            totalEl.textContent = `${total}`;
        const setsEl = document.getElementById(`dd-panel-sets-${playerId}`);
        if (setsEl)
            setsEl.textContent = `${sets}`;
    }
    bumpRockCount(playerId, delta) {
        const panelRocks = document.getElementById(`dd-panel-rocks-${playerId}`);
        if (panelRocks) {
            panelRocks.innerText = `${Math.max(0, Number(panelRocks.innerText || '0') + delta)}`;
        }
        const heldRocks = document.getElementById(`dd-held-rocks-${playerId}`);
        if (heldRocks) {
            heldRocks.innerText = `${Math.max(0, Number(heldRocks.innerText || '0') + delta)}`;
        }
    }
    ///////////////////////////////////////////////////
    //// Interactivity & Affordances
    setActiveDepth(depth) {
        document.querySelectorAll('.dd-depth-row').forEach(el => el.classList.remove('active-depth'));
        const target = document.getElementById(`dd-depth-${depth}`);
        if (target) {
            target.classList.add('active-depth');
        }
        // The active player's penguin is diving (hidden from their tableau).
        this.setDivingPlayer(this.bga.players.getActivePlayerId());
        // Update diving penguin marker: the lying meeple in the diving
        // player's color (replaces the 🐧 emoji), waddle animation kept.
        document.querySelectorAll('.dd-diving-penguin').forEach(el => el.remove());
        const activePenguinSlot = document.getElementById(`dd-depth-penguins-${depth}`);
        if (activePenguinSlot) {
            const divingId = this.divingPlayerId;
            const player = divingId !== null ? this.gamedatas.players[divingId] : null;
            const colorName = player ? penguinColorName(player.color) : 'blue';
            activePenguinSlot.innerHTML = `<span class="dd-diving-penguin penguin-lying-${colorName}" title="${_('Diving Penguin')}"></span>`;
        }
    }
    /** Move the diving penguin marker onto the selected tile's center-bottom. */
    moveDivingPenguinToTile(tile) {
        const marker = document.querySelector('.dd-diving-penguin');
        const el = this.tileManager.getCardElement(tile);
        if (!marker || !el)
            return;
        marker.classList.add('dd-on-tile');
        el.appendChild(marker);
    }
    setDiveStepInteractivity(args) {
        this.clearInteractivity();
        const token = ++this.interactivityToken;
        const selectableIds = new Set([...args.facedownIds, ...args.takeableFaceupIds]);
        this.oceanClickHandler = (tile) => {
            if (token !== this.interactivityToken)
                return;
            if (args.facedownIds.includes(tile.id)) {
                this.moveDivingPenguinToTile(tile);
                this.performFlipTile(tile.id);
            }
            else if (args.takeableFaceupIds.includes(tile.id)) {
                this.moveDivingPenguinToTile(tile);
                this.performTakeFaceup(tile.id);
            }
        };
        this.applyWhenStocksReady(token, () => {
            const stock = this.oceanStocks[args.currentDepth];
            if (!stock)
                return;
            const selectable = stock.getCards().filter(t => selectableIds.has(t.id));
            stock.setSelectionMode('single', selectable);
        });
    }
    setConfirmFlipInteractivity(args) {
        this.clearInteractivity();
        const token = ++this.interactivityToken;
        if (args.flippedTile) {
            const tileId = args.flippedTile.id;
            this.oceanClickHandler = (tile) => {
                if (token !== this.interactivityToken)
                    return;
                if (tile.id === tileId) {
                    this.moveDivingPenguinToTile(tile);
                    this.performKeepFlipped();
                }
            };
            this.applyWhenStocksReady(token, () => {
                const stock = this.oceanStocks[args.currentDepth];
                const tile = stock?.getCards().find(t => t.id === tileId);
                if (stock && tile)
                    stock.setSelectionMode('single', [tile]);
            });
        }
        // Next depth row clickable to dive deeper
        const nextDepthEl = document.getElementById(`dd-depth-${args.nextDepth}`);
        if (nextDepthEl) {
            nextDepthEl.classList.add('clickable-depth');
            nextDepthEl.onclick = () => this.performDiveDeeper();
        }
    }
    setRetreatPickInteractivity(args) {
        this.clearInteractivity();
        const token = ++this.interactivityToken;
        const ids = new Set(args.eligibleTileIds);
        this.oceanClickHandler = (tile) => {
            if (token !== this.interactivityToken)
                return;
            if (ids.has(tile.id))
                this.performSelectRetreatTile(tile.id);
        };
        this.applyWhenStocksReady(token, () => {
            for (const stock of Object.values(this.oceanStocks)) {
                const selectable = stock.getCards().filter(t => ids.has(t.id));
                if (selectable.length)
                    stock.setSelectionMode('single', selectable);
            }
        });
    }
    setSoloTiebreakInteractivity(args) {
        this.clearInteractivity();
        const token = ++this.interactivityToken;
        const ids = new Set(args.candidateTileIds);
        this.oceanClickHandler = (tile) => {
            if (token !== this.interactivityToken)
                return;
            if (ids.has(tile.id))
                this.performChooseAiTile(tile.id);
        };
        this.applyWhenStocksReady(token, () => {
            for (const stock of Object.values(this.oceanStocks)) {
                const selectable = stock.getCards().filter(t => ids.has(t.id));
                if (selectable.length)
                    stock.setSelectionMode('single', selectable);
            }
        });
    }
    clearInteractivity() {
        this.interactivityToken++;
        this.oceanClickHandler = null;
        for (const stock of Object.values(this.oceanStocks)) {
            stock.setSelectionMode('none');
        }
        // A penguin moved onto a tile goes back to the depth header on the
        // next setActiveDepth; drop it here so it never lingers on a tile.
        document.querySelectorAll('.dd-tile .dd-diving-penguin').forEach(el => el.remove());
        document.querySelectorAll('.clickable-depth').forEach(el => {
            el.classList.remove('clickable-depth');
            el.onclick = null;
        });
    }
    updateAllTrappedPenguins() {
        // Clear all predator docks
        document.querySelectorAll('.tile-trapped-dock').forEach(el => el.innerHTML = '');
        // A player's trapped penguins, in the order they left the available
        // set, are the sliding one first (it did the dive), then running,
        // then standing — the same order the available display drops them.
        const trappedIndexByPlayer = new Map();
        for (const tp of this.trappedPenguins) {
            const dock = document.getElementById(`dd-dock-${tp.tileId}`);
            if (dock) {
                const player = this.gamedatas.players[tp.playerId];
                const color = player ? player.color : '000000';
                const idx = trappedIndexByPlayer.get(tp.playerId) ?? 0;
                trappedIndexByPlayer.set(tp.playerId, idx + 1);
                const design = Math.max(0, 2 - idx);
                dock.insertAdjacentHTML('beforeend', `
                    <span class="${penguinMeepleClasses(color, design)} trapped-penguin-meeple" title="${player ? player.name : ''}"></span>
                `);
            }
        }
    }
    /** Penguins shown as available: 3 - trapped - (1 while this player's penguin is diving). */
    availablePenguinCount(playerId) {
        const trapped = this.trappedPenguins.filter(tp => tp.playerId === playerId).length;
        return Math.max(0, 3 - trapped - (this.divingPlayerId === playerId ? 1 : 0));
    }
    /** Set (or clear) the diving player, refreshing both players' meeple displays. */
    setDivingPlayer(playerId) {
        if (this.divingPlayerId === playerId)
            return;
        const prev = this.divingPlayerId;
        this.divingPlayerId = playerId;
        if (prev !== null)
            this.updateAvailablePenguins(prev);
        if (playerId !== null)
            this.updateAvailablePenguins(playerId);
    }
    /** Re-render the available-penguin meeples in the panel and tableau. */
    updateAvailablePenguins(playerId) {
        const player = this.gamedatas.players[playerId];
        const color = player ? player.color : '3e90bc';
        const html = penguinMeeplesHtml(color, this.availablePenguinCount(playerId));
        const panelPenguins = document.getElementById(`dd-panel-penguins-${playerId}`);
        if (panelPenguins)
            panelPenguins.innerHTML = html;
        const availPenguins = document.getElementById(`dd-avail-penguins-${playerId}`);
        if (availPenguins)
            availPenguins.innerHTML = html;
    }
    ///////////////////////////////////////////////////
    //// Actions to Server
    performFlipTile(tileId) {
        this.clearInteractivity();
        this.bga.actions.performAction("actFlipTile", { tileId });
    }
    performTakeFaceup(tileId) {
        this.clearInteractivity();
        this.bga.actions.performAction("actTakeFaceup", { tileId });
    }
    performSkipDepth() {
        this.clearInteractivity();
        this.bga.actions.performAction("actSkipDepth");
    }
    performIngestRock(targetDepth) {
        this.clearInteractivity();
        this.bga.actions.performAction("actIngestRock", { targetDepth });
    }
    performKeepFlipped() {
        this.clearInteractivity();
        this.bga.actions.performAction("actKeepFlipped");
    }
    performDiveDeeper() {
        this.clearInteractivity();
        this.bga.actions.performAction("actDiveDeeper");
    }
    performSelectRetreatTile(tileId) {
        this.clearInteractivity();
        this.bga.actions.performAction("actSelectRetreatTile", { tileId });
    }
    performRetreatEmpty() {
        this.clearInteractivity();
        this.bga.actions.performAction("actRetreatEmpty");
    }
    performChooseAiTile(tileId) {
        this.clearInteractivity();
        this.bga.actions.performAction("actChooseAiTile", { tileId });
    }
    getTileDescription(tile) {
        if (tile.category === 'food') {
            return `${tile.foodColor ? tile.foodColor.toUpperCase() : ''} Food (${tile.points} pts)`;
        }
        else if (tile.category === 'rock') {
            return 'Rock 🪨';
        }
        else if (tile.category === 'predator') {
            return 'Predator 🦈';
        }
        else if (tile.category === 'open_water') {
            return 'Open Water 🌊';
        }
        return 'Tile';
    }
    ///////////////////////////////////////////////////
    //// Notifications Helper
    getNotifArgs(notif) {
        return (notif && notif.args) ? notif.args : notif;
    }
    setupNotifications() {
        this.bga.notifications.setupPromiseNotifications();
    }
    /**
     * Route a collected tile from its ocean stock to its destination:
     * food -> the player's tableau row stock, rock -> the rock VoidStock,
     * AI (no tableau UI) or anything else -> just remove it from the ocean.
     * Also updates the client-side tableau model and scores live.
     */
    handleTileCollected(playerId, tile) {
        const regTile = this.mergeTile(tile);
        const oceanStock = this.oceanStocks[regTile.depth];
        if (playerId === AI_PLAYER_ID) {
            oceanStock?.removeCard(regTile);
            return;
        }
        if (regTile.category === 'rock') {
            const rockStock = this.rockStocks[playerId];
            if (rockStock && oceanStock) {
                void rockStock.addCard(regTile, { fromStock: oceanStock });
            }
            else {
                oceanStock?.removeCard(regTile);
            }
            this.bumpRockCount(playerId, 1);
            return;
        }
        if (regTile.category === 'food') {
            let rowIdx = regTile.rowIndex;
            if (rowIdx == null) {
                // Fallback if the server did not send rowIndex: the next row
                // for this food colour (server counts that colour's tiles + 1).
                const colorCount = Object.values(this.tableauModel[playerId] || {})
                    .flat()
                    .filter(t => t.foodColor === regTile.foodColor).length;
                rowIdx = colorCount + 1;
                regTile.rowIndex = rowIdx;
            }
            if (!this.tableauModel[playerId])
                this.tableauModel[playerId] = {};
            if (!this.tableauModel[playerId][rowIdx])
                this.tableauModel[playerId][rowIdx] = [];
            this.tableauModel[playerId][rowIdx].push(regTile);
            const rowStock = this.ensureTableauRowStock(playerId, rowIdx);
            if (oceanStock) {
                // CDN addCard takes a single settings object: fromStock and
                // slot together (not two separate arguments).
                void rowStock.addCard(regTile, { fromStock: oceanStock, slot: regTile.foodColor });
            }
            else {
                void rowStock.addCard(regTile);
            }
            this.updateTableauRowDisplay(playerId, rowIdx);
            return;
        }
        // Open water or anything else: just remove it from the ocean.
        oceanStock?.removeCard(regTile);
    }
    notif_tileFlipped(notif) {
        const args = this.getNotifArgs(notif);
        const { tile } = args;
        void this.stocksReady.then(() => {
            // Flip the tile in its ocean stock (re-runs setupFrontDiv, so the
            // predator dock is recreated empty and must be re-rendered).
            const regTile = this.mergeTile(tile);
            this.tileManager.setCardVisible(regTile, true);
            this.updateAllTrappedPenguins();
        });
    }
    notif_tileCollected(notif) {
        const args = this.getNotifArgs(notif);
        void this.stocksReady.then(() => this.handleTileCollected(args.player_id, args.tile));
    }
    notif_penguinMovedDepth(notif) {
        const args = this.getNotifArgs(notif);
        const { toDepth } = args;
        this.setActiveDepth(toDepth);
    }
    notif_predatorTrapped(notif) {
        const args = this.getNotifArgs(notif);
        const { player_id, tileId, depth } = args;
        if (!this.trappedPenguins.some(tp => tp.tileId === tileId && tp.playerId === player_id)) {
            this.trappedPenguins.push({ id: tileId, playerId: player_id, tileId, depth });
        }
        // Docks live inside predator front divs; re-render once stocks exist.
        void this.stocksReady.then(() => this.updateAllTrappedPenguins());
        // The diving penguin is now trapped (no longer diving); update the
        // available penguins in panel & tableau.
        this.setDivingPlayer(null);
        this.updateAvailablePenguins(player_id);
    }
    notif_penguinRetreat(notif) {
        const args = this.getNotifArgs(notif);
        const { player_id, rescuedTile } = args;
        // All of this player's trapped penguins are freed and the diving
        // penguin is back — restore the available-penguin display.
        this.trappedPenguins = this.trappedPenguins.filter(tp => tp.playerId !== player_id);
        this.setDivingPlayer(null);
        this.updateAvailablePenguins(player_id);
        void this.stocksReady.then(() => {
            this.updateAllTrappedPenguins();
            if (rescuedTile) {
                this.handleTileCollected(player_id, rescuedTile);
            }
        });
    }
    notif_rockIngested(notif) {
        const args = this.getNotifArgs(notif);
        const { player_id, targetDepth } = args;
        this.bumpRockCount(player_id, -1);
        this.setActiveDepth(targetDepth);
    }
    notif_gameEndTriggered(notif) {
        const args = this.getNotifArgs(notif);
        const { depth } = args;
        const depthRow = document.getElementById(`dd-depth-${depth}`);
        if (depthRow) {
            depthRow.classList.add('depth-exhausted');
        }
    }
}

export { Game };
