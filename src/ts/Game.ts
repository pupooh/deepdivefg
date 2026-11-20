import { PlayerDiveStep } from "./States/PlayerDiveStep";
import { ConfirmFlipOrDive } from "./States/ConfirmFlipOrDive";
import { RetreatPickTile } from "./States/RetreatPickTile";
import { SoloChooseTiebreak } from "./States/SoloChooseTiebreak";
import { BgaAnimations, BgaCards } from "./libs";
import { OceanTileManager } from "./OceanTileManager";

/** Pseudo-player id for the solo AI opponent (no tableau UI). */
const AI_PLAYER_ID = 9999;

export class Game {
    public bga: Bga<DeepDiveFGPlayer, DeepDiveFGGamedatas>;
    private gamedatas: DeepDiveFGGamedatas;

    private playerDiveStep: PlayerDiveStep;
    private confirmFlipOrDive: ConfirmFlipOrDive;
    private retreatPickTile: RetreatPickTile;
    private soloChooseTiebreak: SoloChooseTiebreak;

    ///////////////////////////////////////////////////
    //// bga-cards

    /** Public so OceanTileManager can take it in its settings. */
    public animationManager!: BgaAnimations.Manager;
    private tileManager!: OceanTileManager;
    private oceanStocks: Record<number, BgaCards.LineStock<OceanTile>> = {};
    private tableauStocks = new Map<string, BgaCards.SlotStock<OceanTile>>();
    private rockStocks: Record<number, BgaCards.VoidStock<OceanTile>> = {};
    /** Tile objects handed to the stocks, keyed by tile id. Notifications merge into these. */
    private tilesById = new Map<number, OceanTile>();
    /** Client-side tableau model: playerId -> rowIdx -> tiles. Mirrors the server rows. */
    private tableauModel: Record<number, Record<number, OceanTile[]>> = {};
    private trappedPenguins: TrappedPenguin[] = [];
    /** Resolves once the setup addCards calls have placed every tile. */
    private stocksReady: Promise<boolean[]> = Promise.resolve([]);
    /** Bumped by every set/clear interactivity call; stale async applies are ignored. */
    private interactivityToken = 0;
    /** Current ocean-tile click handler, set by the active state's interactivity. */
    private oceanClickHandler: ((tile: OceanTile) => void) | null = null;

    constructor(bga: Bga<DeepDiveFGPlayer, DeepDiveFGGamedatas>) {
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

    setup(gamedatas: DeepDiveFGGamedatas) {
        console.log("Starting Deep Dive setup", gamedatas);
        this.gamedatas = gamedatas;
        this.trappedPenguins = [...(gamedatas.trappedPenguins || [])];

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
                <div id="dd-header-banner">
                    <div id="dd-token-container">
                        <div id="dd-start-token" class="${gamedatas.lastDiveFlipped ? 'last-dive' : 'first-player'}">
                            <span class="token-side token-front">1st</span>
                            <span class="token-side token-back">LAST DIVE</span>
                        </div>
                    </div>
                    <div id="dd-status-text">
                        ${gamedatas.lastDiveFlipped ? _('Last Dive in progress! Each player takes one final turn.') : _('Dive into the depths to catch food sets!')}
                    </div>
                </div>

                <div id="dd-main-layout">
                    <!-- Ocean Board: 5 Depth Rows with horizontal tile lanes -->
                    <div id="dd-ocean-board">
                        ${[1, 2, 3, 4, 5].map(d => this.renderDepthRowHtml(d, gamedatas.depths[d])).join('')}
                    </div>

                    <!-- Player Tableaus Area -->
                    <div id="dd-players-area">
                        <div id="dd-tableaus-container">
                            ${Object.keys(gamedatas.players).map(pId => this.renderPlayerTableauHtml(Number(pId))).join('')}
                        </div>
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
                            <span class="dd-icon-penguin" title="${_('Available Penguins')}">🐧 <strong id="dd-panel-penguins-${playerId}">${tableau ? tableau.availablePenguinsCount : 3}</strong>/3</span>
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

        const addPromises: Promise<boolean>[] = [];

        // Ocean: one LineStock per depth lane.
        for (let d = 1; d <= 5; d++) {
            const lane = document.getElementById(`dd-depth-tiles-${d}`);
            if (!lane) continue;
            const stock = new BgaCards.LineStock<OceanTile>(this.tileManager, lane, {
                wrap: 'nowrap',
                center: false,
                gap: '8px',
            });
            stock.onCardClick = (tile) => {
                if (this.oceanClickHandler) this.oceanClickHandler(tile);
            };
            this.oceanStocks[d] = stock;
            const tiles = (gamedatas.depths[d]?.tiles || []).map(t => this.tilesById.get(t.id)!);
            if (tiles.length) addPromises.push(stock.addCards(tiles));
        }

        // Tableaus: one SlotStock per player per set row (pink/green/yellow slots).
        for (const [pId, tableau] of Object.entries(gamedatas.tableaus || {})) {
            const playerId = Number(pId);
            for (const [rIdx, row] of Object.entries(tableau.rows || {})) {
                const rowIdx = Number(rIdx);
                const tiles = (row.tiles || []).map(t => this.tilesById.get(t.id)!);
                const stock = this.ensureTableauRowStock(playerId, rowIdx);
                if (tiles.length) addPromises.push(stock.addCards(tiles));
            }
        }

        // Rocks: one VoidStock per player, anchored on the tableau header.
        // Collected rocks slide here and disappear into the rock reserve.
        for (const pId of Object.keys(gamedatas.players)) {
            const anchor = document.getElementById(`dd-rock-stock-${Number(pId)}`);
            if (anchor) {
                this.rockStocks[Number(pId)] = new BgaCards.VoidStock<OceanTile>(this.tileManager, anchor);
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

    private renderDepthRowHtml(depth: number, depthData: DepthData): string {
        const depthNames = [
            _('Depth 1 — Sunlight Zone (1–2 pts)'),
            _('Depth 2 — Twilight Zone (2–4 pts)'),
            _('Depth 3 — Midnight Zone (3–5 pts)'),
            _('Depth 4 — Abyssal Zone (5–7 pts)'),
            _('Depth 5 — Hadal Trench (8–10 pts)'),
        ];
        const isExhausted = depthData ? depthData.facedownCount === 0 : false;

        return `
            <div class="dd-depth-row depth-${depth} ${isExhausted ? 'depth-exhausted' : ''}" id="dd-depth-${depth}" data-depth="${depth}">
                <div class="dd-depth-header">
                    <span class="dd-depth-badge">D${depth}</span>
                    <span class="dd-depth-title">${depthNames[depth - 1]}</span>
                    <span class="dd-depth-count-badge">${_('Facedown')}: <strong id="dd-facedown-count-${depth}">${depthData ? depthData.facedownCount : 0}</strong></span>
                    <div class="dd-depth-penguins" id="dd-depth-penguins-${depth}"></div>
                    <span class="dd-depth-exhausted-badge">${_('Exhausted — Skippable')}</span>
                </div>
                <div class="dd-depth-tiles-lane" id="dd-depth-tiles-${depth}"></div>
            </div>
        `;
    }

    private renderTableauRowShellHtml(playerId: number, rowIdx: number): string {
        const tiles = this.tableauModel[playerId]?.[rowIdx] || [];
        const sum = tiles.reduce((s, t) => s + (t.points || 0), 0);
        const isComplete = tiles.length === 3;
        return `
            <div class="dd-tableau-row ${isComplete ? 'row-complete' : 'row-incomplete'}" id="dd-row-${playerId}-${rowIdx}">
                <div class="dd-row-header">
                    <span class="dd-row-label">${_('Set')} ${rowIdx}</span>
                    <span class="dd-row-score-badge">${isComplete ? `${sum} pts` : `${Math.floor(sum / 2)} pts (½)`}</span>
                </div>
                <div class="dd-row-slots"></div>
            </div>
        `;
    }

    private renderPlayerTableauHtml(playerId: number): string {
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
                        <span class="dd-stat-penguins" title="${_('Available Penguins')}">🐧 <span id="dd-avail-penguins-${playerId}">${tableau ? tableau.availablePenguinsCount : 3}</span>/3</span>
                        <span class="dd-stat-rocks" title="${_('Held Rocks')}">🪨 <span id="dd-held-rocks-${playerId}">${tableau ? tableau.rockCount : 0}</span></span>
                        <span class="dd-rock-stock-anchor" id="dd-rock-stock-${playerId}"></span>
                        <span class="dd-stat-score" title="${_('Total Points')}">⭐ <span id="dd-total-score-${playerId}">${tableau ? tableau.score : 0}</span> pts</span>
                    </div>
                </div>
                <div class="dd-tableau-columns-header">
                    <span class="col-title pink-col">${_('Pink 🦐')}</span>
                    <span class="col-title green-col">${_('Green 🐟')}</span>
                    <span class="col-title yellow-col">${_('Yellow 🦑')}</span>
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
    private ensureTableauRowStock(playerId: number, rowIdx: number): BgaCards.SlotStock<OceanTile> {
        const key = `${playerId}-${rowIdx}`;
        const existing = this.tableauStocks.get(key);
        if (existing) return existing;

        let rowEl = document.getElementById(`dd-row-${playerId}-${rowIdx}`);
        if (!rowEl) {
            const container = document.getElementById(`dd-tableau-rows-${playerId}`);
            if (!container) throw new Error(`Tableau rows container missing for player ${playerId}`);
            const emptyMsg = container.querySelector('.dd-empty-tableau-msg');
            if (emptyMsg) emptyMsg.remove();
            container.insertAdjacentHTML('beforeend', this.renderTableauRowShellHtml(playerId, rowIdx));
            rowEl = document.getElementById(`dd-row-${playerId}-${rowIdx}`);
            if (!rowEl) throw new Error(`Failed to create tableau row ${rowIdx} for player ${playerId}`);
        }
        const slotsEl = rowEl.querySelector('.dd-row-slots') as HTMLElement | null;
        if (!slotsEl) throw new Error(`Row slots container missing for player ${playerId} row ${rowIdx}`);

        const stock = new BgaCards.SlotStock<OceanTile>(this.tileManager, slotsEl, {
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
    private mergeTile(notifTile: OceanTile): OceanTile {
        const existing = this.tilesById.get(notifTile.id);
        if (existing) {
            Object.assign(existing, notifTile);
            return existing;
        }
        this.tilesById.set(notifTile.id, notifTile);
        return notifTile;
    }

    /** Run fn once the setup stocks are populated, unless interactivity moved on. */
    private applyWhenStocksReady(token: number, fn: () => void): void {
        void this.stocksReady.then(() => {
            if (token === this.interactivityToken) fn();
        });
    }

    /** Recompute one tableau row's badge/complete state and the player's totals. */
    private updateTableauRowDisplay(playerId: number, rowIdx: number): void {
        const tiles = this.tableauModel[playerId]?.[rowIdx] || [];
        const sum = tiles.reduce((s, t) => s + (t.points || 0), 0);
        const complete = tiles.length === 3;
        const rowEl = document.getElementById(`dd-row-${playerId}-${rowIdx}`);
        if (rowEl) {
            rowEl.classList.toggle('row-complete', complete);
            rowEl.classList.toggle('row-incomplete', !complete);
            const badge = rowEl.querySelector('.dd-row-score-badge');
            if (badge) badge.textContent = complete ? `${sum} pts` : `${Math.floor(sum / 2)} pts (½)`;
        }

        let total = 0;
        let sets = 0;
        for (const row of Object.values(this.tableauModel[playerId] || {})) {
            const rowSum = row.reduce((s, t) => s + (t.points || 0), 0);
            if (row.length === 3) {
                total += rowSum;
                sets++;
            } else {
                total += Math.floor(rowSum / 2);
            }
        }
        const totalEl = document.getElementById(`dd-total-score-${playerId}`);
        if (totalEl) totalEl.textContent = `${total}`;
        const setsEl = document.getElementById(`dd-panel-sets-${playerId}`);
        if (setsEl) setsEl.textContent = `${sets}`;
    }

    private bumpRockCount(playerId: number, delta: number): void {
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

    public setActiveDepth(depth: number) {
        document.querySelectorAll('.dd-depth-row').forEach(el => el.classList.remove('active-depth'));
        const target = document.getElementById(`dd-depth-${depth}`);
        if (target) {
            target.classList.add('active-depth');
        }

        // Update diving penguin marker
        document.querySelectorAll('.dd-depth-penguins').forEach(el => el.innerHTML = '');
        const activePenguinSlot = document.getElementById(`dd-depth-penguins-${depth}`);
        if (activePenguinSlot) {
            activePenguinSlot.innerHTML = `<span class="dd-diving-penguin" title="${_('Diving Penguin')}">🐧</span>`;
        }
    }

    public setDiveStepInteractivity(args: PlayerDiveStepArgs) {
        this.clearInteractivity();
        const token = ++this.interactivityToken;
        const selectableIds = new Set([...args.facedownIds, ...args.takeableFaceupIds]);

        this.oceanClickHandler = (tile) => {
            if (token !== this.interactivityToken) return;
            if (args.facedownIds.includes(tile.id)) this.performFlipTile(tile.id);
            else if (args.takeableFaceupIds.includes(tile.id)) this.performTakeFaceup(tile.id);
        };

        this.applyWhenStocksReady(token, () => {
            const stock = this.oceanStocks[args.currentDepth];
            if (!stock) return;
            const selectable = stock.getCards().filter(t => selectableIds.has(t.id));
            stock.setSelectionMode('single', selectable);
            // Keep the old affordance colours: cyan = flip a facedown tile,
            // teal = take a faceup tile.
            for (const tile of selectable) {
                const el = this.tileManager.getCardElement(tile);
                el.classList.add(args.facedownIds.includes(tile.id) ? 'clickable-flip' : 'clickable-take');
            }
        });
    }

    public setConfirmFlipInteractivity(args: ConfirmFlipOrDiveArgs) {
        this.clearInteractivity();
        const token = ++this.interactivityToken;

        if (args.flippedTile) {
            const tileId = args.flippedTile.id;
            this.oceanClickHandler = (tile) => {
                if (token !== this.interactivityToken) return;
                if (tile.id === tileId) this.performKeepFlipped();
            };
            this.applyWhenStocksReady(token, () => {
                const stock = this.oceanStocks[args.currentDepth];
                const tile = stock?.getCards().find(t => t.id === tileId);
                if (stock && tile) stock.setSelectionMode('single', [tile]);
            });
        }

        // Next depth row clickable to dive deeper
        const nextDepthEl = document.getElementById(`dd-depth-${args.nextDepth}`);
        if (nextDepthEl) {
            nextDepthEl.classList.add('clickable-depth');
            nextDepthEl.onclick = () => this.performDiveDeeper();
        }
    }

    public setRetreatPickInteractivity(args: RetreatPickTileArgs) {
        this.clearInteractivity();
        const token = ++this.interactivityToken;
        const ids = new Set(args.eligibleTileIds);

        this.oceanClickHandler = (tile) => {
            if (token !== this.interactivityToken) return;
            if (ids.has(tile.id)) this.performSelectRetreatTile(tile.id);
        };

        this.applyWhenStocksReady(token, () => {
            for (const stock of Object.values(this.oceanStocks)) {
                const selectable = stock.getCards().filter(t => ids.has(t.id));
                if (selectable.length) stock.setSelectionMode('single', selectable);
            }
        });
    }

    public setSoloTiebreakInteractivity(args: SoloChooseTiebreakArgs) {
        this.clearInteractivity();
        const token = ++this.interactivityToken;
        const ids = new Set(args.candidateTileIds);

        this.oceanClickHandler = (tile) => {
            if (token !== this.interactivityToken) return;
            if (ids.has(tile.id)) this.performChooseAiTile(tile.id);
        };

        this.applyWhenStocksReady(token, () => {
            for (const stock of Object.values(this.oceanStocks)) {
                const selectable = stock.getCards().filter(t => ids.has(t.id));
                if (selectable.length) stock.setSelectionMode('single', selectable);
            }
        });
    }

    public clearInteractivity() {
        this.interactivityToken++;
        this.oceanClickHandler = null;
        for (const stock of Object.values(this.oceanStocks)) {
            stock.setSelectionMode('none');
        }
        document.querySelectorAll('.dd-tile.clickable-flip, .dd-tile.clickable-take').forEach(el => {
            el.classList.remove('clickable-flip', 'clickable-take');
        });
        document.querySelectorAll('.clickable-depth').forEach(el => {
            el.classList.remove('clickable-depth');
            (el as HTMLElement).onclick = null;
        });
    }

    public updateAllTrappedPenguins() {
        // Clear all predator docks
        document.querySelectorAll('.tile-trapped-dock').forEach(el => el.innerHTML = '');

        for (const tp of this.trappedPenguins) {
            const dock = document.getElementById(`dd-dock-${tp.tileId}`);
            if (dock) {
                const player = this.gamedatas.players[tp.playerId];
                const color = player ? player.color : '000000';
                dock.insertAdjacentHTML('beforeend', `
                    <span class="trapped-penguin-meeple" style="color: #${color};" title="${player ? player.name : ''}">🐧</span>
                `);
            }
        }
    }

    ///////////////////////////////////////////////////
    //// Actions to Server

    public performFlipTile(tileId: number) {
        this.clearInteractivity();
        this.bga.actions.performAction("actFlipTile", { tileId });
    }

    public performTakeFaceup(tileId: number) {
        this.clearInteractivity();
        this.bga.actions.performAction("actTakeFaceup", { tileId });
    }

    public performSkipDepth() {
        this.clearInteractivity();
        this.bga.actions.performAction("actSkipDepth");
    }

    public performIngestRock(targetDepth: number) {
        this.clearInteractivity();
        this.bga.actions.performAction("actIngestRock", { targetDepth });
    }

    public performKeepFlipped() {
        this.clearInteractivity();
        this.bga.actions.performAction("actKeepFlipped");
    }

    public performDiveDeeper() {
        this.clearInteractivity();
        this.bga.actions.performAction("actDiveDeeper");
    }

    public performSelectRetreatTile(tileId: number) {
        this.clearInteractivity();
        this.bga.actions.performAction("actSelectRetreatTile", { tileId });
    }

    public performRetreatEmpty() {
        this.clearInteractivity();
        this.bga.actions.performAction("actRetreatEmpty");
    }

    public performChooseAiTile(tileId: number) {
        this.clearInteractivity();
        this.bga.actions.performAction("actChooseAiTile", { tileId });
    }

    public getTileDescription(tile: OceanTile): string {
        if (tile.category === 'food') {
            return `${tile.foodColor ? tile.foodColor.toUpperCase() : ''} Food (${tile.points} pts)`;
        } else if (tile.category === 'rock') {
            return 'Rock 🪨';
        } else if (tile.category === 'predator') {
            return 'Predator 🦈';
        } else if (tile.category === 'open_water') {
            return 'Open Water 🌊';
        }
        return 'Tile';
    }

    ///////////////////////////////////////////////////
    //// Notifications Helper

    private getNotifArgs<T>(notif: any): T {
        return (notif && notif.args) ? notif.args : notif;
    }

    private setupNotifications() {
        this.bga.notifications.setupPromiseNotifications();
    }

    /**
     * Route a collected tile from its ocean stock to its destination:
     * food -> the player's tableau row stock, rock -> the rock VoidStock,
     * AI (no tableau UI) or anything else -> just remove it from the ocean.
     * Also updates the client-side tableau model and scores live.
     */
    private handleTileCollected(playerId: number, tile: OceanTile): void {
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
            } else {
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
            if (!this.tableauModel[playerId]) this.tableauModel[playerId] = {};
            if (!this.tableauModel[playerId][rowIdx]) this.tableauModel[playerId][rowIdx] = [];
            this.tableauModel[playerId][rowIdx].push(regTile);

            const rowStock = this.ensureTableauRowStock(playerId, rowIdx);
            if (oceanStock) {
                // CDN addCard takes a single settings object: fromStock and
                // slot together (not two separate arguments).
                void rowStock.addCard(regTile, { fromStock: oceanStock, slot: regTile.foodColor });
            } else {
                void rowStock.addCard(regTile);
            }
            this.updateTableauRowDisplay(playerId, rowIdx);
            return;
        }

        // Open water or anything else: just remove it from the ocean.
        oceanStock?.removeCard(regTile);
    }

    public notif_tileFlipped(notif: any) {
        const args = this.getNotifArgs<NotifTileFlipped>(notif);
        const { tile, depth, facedownRemaining } = args;

        void this.stocksReady.then(() => {
            // Update facedown counter
            const countBadge = document.getElementById(`dd-facedown-count-${depth}`);
            if (countBadge) {
                countBadge.innerText = `${facedownRemaining}`;
            }

            // Flip the tile in its ocean stock (re-runs setupFrontDiv, so the
            // predator dock is recreated empty and must be re-rendered).
            const regTile = this.mergeTile(tile);
            this.tileManager.setCardVisible(regTile, true);
            this.updateAllTrappedPenguins();
        });
    }

    public notif_tileCollected(notif: any) {
        const args = this.getNotifArgs<NotifTileCollected>(notif);
        void this.stocksReady.then(() => this.handleTileCollected(args.player_id, args.tile));
    }

    public notif_penguinMovedDepth(notif: any) {
        const args = this.getNotifArgs<NotifPenguinMovedDepth>(notif);
        const { toDepth } = args;
        this.setActiveDepth(toDepth);
    }

    public notif_predatorTrapped(notif: any) {
        const args = this.getNotifArgs<NotifPredatorTrapped>(notif);
        const { player_id, tileId, trappedTotal, depth } = args;

        if (!this.trappedPenguins.some(tp => tp.tileId === tileId && tp.playerId === player_id)) {
            this.trappedPenguins.push({ id: tileId, playerId: player_id, tileId, depth });
        }
        // Docks live inside predator front divs; re-render once stocks exist.
        void this.stocksReady.then(() => this.updateAllTrappedPenguins());

        // Update available penguins in panel & tableau
        const avail = Math.max(0, 3 - trappedTotal);
        const panelPenguins = document.getElementById(`dd-panel-penguins-${player_id}`);
        if (panelPenguins) panelPenguins.innerText = `${avail}`;
        const availPenguins = document.getElementById(`dd-avail-penguins-${player_id}`);
        if (availPenguins) availPenguins.innerText = `${avail}`;
    }

    public notif_penguinRetreat(notif: any) {
        const args = this.getNotifArgs<NotifPenguinRetreat>(notif);
        const { player_id, rescuedTile } = args;

        // Reset penguin count to 3
        const panelPenguins = document.getElementById(`dd-panel-penguins-${player_id}`);
        if (panelPenguins) panelPenguins.innerText = `3`;
        const availPenguins = document.getElementById(`dd-avail-penguins-${player_id}`);
        if (availPenguins) availPenguins.innerText = `3`;

        // All of this player's trapped penguins are freed; docks clear.
        this.trappedPenguins = this.trappedPenguins.filter(tp => tp.playerId !== player_id);

        void this.stocksReady.then(() => {
            this.updateAllTrappedPenguins();
            if (rescuedTile) {
                this.handleTileCollected(player_id, rescuedTile);
            }
        });
    }

    public notif_rockIngested(notif: any) {
        const args = this.getNotifArgs<NotifRockIngested>(notif);
        const { player_id, targetDepth } = args;

        this.bumpRockCount(player_id, -1);
        this.setActiveDepth(targetDepth);
    }

    public notif_gameEndTriggered(notif: any) {
        const args = this.getNotifArgs<NotifGameEndTriggered>(notif);
        const { depth } = args;
        const depthRow = document.getElementById(`dd-depth-${depth}`);
        if (depthRow) {
            depthRow.classList.add('depth-exhausted');
        }
    }

    public notif_lastDiveFlipped(notif: any) {
        const token = document.getElementById('dd-start-token');
        if (token) {
            token.classList.remove('first-player');
            token.classList.add('last-dive', 'token-flip-animation');
        }
        const statusText = document.getElementById('dd-status-text');
        if (statusText) {
            statusText.innerText = _('Last Dive in progress! Each player takes one final turn.');
        }
    }
}
