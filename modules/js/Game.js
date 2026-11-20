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
            const tile = args.flippedTile;
            const tileDesc = this.game.getTileDescription(tile);
            // Resurface button
            this.bga.statusBar.addActionButton(_(`Resurface with ${tileDesc}`), () => this.game.performKeepFlipped(), { color: 'primary' });
            // Dive deeper button
            this.bga.statusBar.addActionButton(_(`Leave faceup & Dive to Depth ${args.nextDepth} ⬇️`), () => this.game.performDiveDeeper(), { color: 'secondary' });
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

class Game {
    constructor(bga) {
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
        const gameArea = this.bga.gameArea.getElement();
        gameArea.innerHTML = '';
        // Build main container
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
        // Set active depth
        this.setActiveDepth(gamedatas.currentDepth);
        // Update trapped penguins display on predator tiles
        this.updateAllTrappedPenguins();
        // Setup cometD notifications
        this.setupNotifications();
        console.log("Deep Dive setup completed");
    }
    ///////////////////////////////////////////////////
    //// HTML Rendering Helpers
    renderDepthRowHtml(depth, depthData) {
        const depthNames = [
            _('Depth 1 — Sunlight Zone (1–2 pts)'),
            _('Depth 2 — Twilight Zone (2–4 pts)'),
            _('Depth 3 — Midnight Zone (3–5 pts)'),
            _('Depth 4 — Abyssal Zone (5–7 pts)'),
            _('Depth 5 — Hadal Trench (8–10 pts)'),
        ];
        const isExhausted = depthData ? depthData.facedownCount === 0 : false;
        const tiles = depthData ? (depthData.tiles || []) : [];
        return `
            <div class="dd-depth-row depth-${depth} ${isExhausted ? 'depth-exhausted' : ''}" id="dd-depth-${depth}" data-depth="${depth}">
                <div class="dd-depth-header">
                    <span class="dd-depth-badge">D${depth}</span>
                    <span class="dd-depth-title">${depthNames[depth - 1]}</span>
                    <span class="dd-depth-count-badge">${_('Facedown')}: <strong id="dd-facedown-count-${depth}">${depthData ? depthData.facedownCount : 0}</strong></span>
                    <div class="dd-depth-penguins" id="dd-depth-penguins-${depth}"></div>
                    <span class="dd-depth-exhausted-badge">${_('Exhausted — Skippable')}</span>
                </div>
                <div class="dd-depth-tiles-lane" id="dd-depth-tiles-${depth}">
                    ${tiles.map(t => this.renderTileHtml(t)).join('')}
                </div>
            </div>
        `;
    }
    renderTileHtml(tile) {
        if (!tile.isFaceup) {
            return `
                <div class="dd-tile tile-facedown depth-back-${tile.depth}" id="dd-tile-${tile.id}" data-tile-id="${tile.id}" data-depth="${tile.depth}">
                    <div class="tile-back-inner">
                        <span class="tile-depth-num">${tile.depth}</span>
                        <span class="tile-wave-pattern">〰️</span>
                    </div>
                </div>
            `;
        }
        const cat = tile.category || 'open_water';
        let innerHtml = '';
        let extraClasses = `tile-${cat}`;
        if (cat === 'food') {
            const color = tile.foodColor || 'pink';
            extraClasses += ` food-${color}`;
            const foodIcons = { pink: '🦐', green: '🐟', yellow: '🦑' };
            const icon = foodIcons[color] || '🐟';
            innerHtml = `
                <div class="tile-food-icon">${icon}</div>
                <div class="tile-points-badge">${tile.points}</div>
                <div class="tile-color-tag">${color.toUpperCase()}</div>
            `;
        }
        else if (cat === 'rock') {
            innerHtml = `
                <div class="tile-icon">🪨</div>
                <div class="tile-label">${_('ROCK')}</div>
            `;
        }
        else if (cat === 'open_water') {
            innerHtml = `
                <div class="tile-icon">🌊</div>
                <div class="tile-label">${_('OPEN WATER')}</div>
                <div class="tile-sublabel">${_('Dive Deeper')}</div>
            `;
        }
        else if (cat === 'predator') {
            innerHtml = `
                <div class="tile-icon">🦈</div>
                <div class="tile-label">${_('PREDATOR')}</div>
                <div class="tile-trapped-dock" id="dd-dock-${tile.id}"></div>
            `;
        }
        const extraBadge = tile.isExtra ? `<span class="tile-extra-icon" title="${_('4+ Player Tile')}">★</span>` : '';
        return `
            <div class="dd-tile tile-faceup ${extraClasses} depth-${tile.depth}" id="dd-tile-${tile.id}" data-tile-id="${tile.id}" data-depth="${tile.depth}">
                ${extraBadge}
                ${innerHtml}
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
            Object.entries(tableau.rows).forEach(([rIdx, rowData]) => {
                const isComplete = rowData.tiles.length === 3;
                const pinkTile = rowData.tiles.find(t => t.foodColor === 'pink');
                const greenTile = rowData.tiles.find(t => t.foodColor === 'green');
                const yellowTile = rowData.tiles.find(t => t.foodColor === 'yellow');
                rowsHtml += `
                    <div class="dd-tableau-row ${isComplete ? 'row-complete' : 'row-incomplete'}" id="dd-row-${playerId}-${rIdx}">
                        <div class="dd-row-header">
                            <span class="dd-row-label">${_('Set')} ${rIdx}</span>
                            <span class="dd-row-score-badge">${isComplete ? `${rowData.sum} pts` : `${Math.floor(rowData.sum / 2)} pts (½)`}</span>
                        </div>
                        <div class="dd-row-slots">
                            <div class="dd-slot slot-pink">${pinkTile ? this.renderTileHtml(pinkTile) : '<span class="empty-slot-label">🦐</span>'}</div>
                            <div class="dd-slot slot-green">${greenTile ? this.renderTileHtml(greenTile) : '<span class="empty-slot-label">🐟</span>'}</div>
                            <div class="dd-slot slot-yellow">${yellowTile ? this.renderTileHtml(yellowTile) : '<span class="empty-slot-label">🦑</span>'}</div>
                        </div>
                    </div>
                `;
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
    //// Interactivity & Affordances
    setActiveDepth(depth) {
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
    setDiveStepInteractivity(args) {
        this.clearInteractivity();
        // Make facedown tiles at current depth clickable
        args.facedownIds.forEach(tileId => {
            const el = document.getElementById(`dd-tile-${tileId}`);
            if (el) {
                el.classList.add('interactive-tile', 'clickable-flip');
                el.onclick = () => this.performFlipTile(tileId);
            }
        });
        // Make takeable faceup tiles at current depth clickable
        args.takeableFaceupIds.forEach(tileId => {
            const el = document.getElementById(`dd-tile-${tileId}`);
            if (el) {
                el.classList.add('interactive-tile', 'clickable-take');
                el.onclick = () => this.performTakeFaceup(tileId);
            }
        });
    }
    setConfirmFlipInteractivity(args) {
        this.clearInteractivity();
        if (args.flippedTile) {
            const tileEl = document.getElementById(`dd-tile-${args.flippedTile.id}`);
            if (tileEl) {
                tileEl.classList.add('interactive-tile', 'pulse-keep');
                tileEl.onclick = () => this.performKeepFlipped();
            }
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
        args.eligibleTileIds.forEach(tileId => {
            const el = document.getElementById(`dd-tile-${tileId}`);
            if (el) {
                el.classList.add('interactive-tile', 'pulse-rescue');
                el.onclick = () => this.performSelectRetreatTile(tileId);
            }
        });
    }
    setSoloTiebreakInteractivity(args) {
        this.clearInteractivity();
        args.candidateTileIds.forEach(tileId => {
            const el = document.getElementById(`dd-tile-${tileId}`);
            if (el) {
                el.classList.add('interactive-tile', 'pulse-rescue');
                el.onclick = () => this.performChooseAiTile(tileId);
            }
        });
    }
    clearInteractivity() {
        document.querySelectorAll('.interactive-tile, .clickable-depth').forEach(el => {
            el.classList.remove('interactive-tile', 'clickable-flip', 'clickable-take', 'pulse-keep', 'pulse-rescue', 'clickable-depth');
            el.onclick = null;
        });
    }
    updateAllTrappedPenguins() {
        // Clear all predator docks
        document.querySelectorAll('.tile-trapped-dock').forEach(el => el.innerHTML = '');
        if (this.gamedatas && this.gamedatas.trappedPenguins) {
            this.gamedatas.trappedPenguins.forEach(tp => {
                const dock = document.getElementById(`dd-dock-${tp.tileId}`);
                if (dock) {
                    const player = this.gamedatas.players[tp.playerId];
                    const color = player ? player.color : '000000';
                    dock.insertAdjacentHTML('beforeend', `
                        <span class="trapped-penguin-meeple" style="color: #${color};" title="${player ? player.name : ''}">🐧</span>
                    `);
                }
            });
        }
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
    notif_tileFlipped(notif) {
        const args = this.getNotifArgs(notif);
        const { tile, depth, facedownRemaining } = args;
        // Update facedown counter
        const countBadge = document.getElementById(`dd-facedown-count-${depth}`);
        if (countBadge) {
            countBadge.innerText = `${facedownRemaining}`;
        }
        // Replace tile in-place in the horizontal lane
        const existingTile = document.getElementById(`dd-tile-${tile.id}`);
        if (existingTile) {
            existingTile.outerHTML = this.renderTileHtml(tile);
            const newTileEl = document.getElementById(`dd-tile-${tile.id}`);
            if (newTileEl) {
                newTileEl.classList.add('tile-flip-animation');
            }
        }
        else {
            const lane = document.getElementById(`dd-depth-tiles-${depth}`);
            if (lane) {
                lane.insertAdjacentHTML('beforeend', this.renderTileHtml(tile));
            }
        }
    }
    notif_tileCollected(notif) {
        const args = this.getNotifArgs(notif);
        const { player_id, tile } = args;
        const tileEl = document.getElementById(`dd-tile-${tile.id}`);
        if (tileEl) {
            tileEl.classList.add('tile-collect-animation');
            setTimeout(() => tileEl.remove(), 400);
        }
        // Update player tableau & panel counts
        if (tile.category === 'rock') {
            const panelRocks = document.getElementById(`dd-panel-rocks-${player_id}`);
            if (panelRocks) {
                panelRocks.innerText = `${Number(panelRocks.innerText || '0') + 1}`;
            }
            const heldRocks = document.getElementById(`dd-held-rocks-${player_id}`);
            if (heldRocks) {
                heldRocks.innerText = `${Number(heldRocks.innerText || '0') + 1}`;
            }
        }
    }
    notif_penguinMovedDepth(notif) {
        const args = this.getNotifArgs(notif);
        const { toDepth } = args;
        this.setActiveDepth(toDepth);
    }
    notif_predatorTrapped(notif) {
        const args = this.getNotifArgs(notif);
        const { player_id, tileId, trappedTotal } = args;
        const player = this.gamedatas.players[player_id];
        const color = player ? player.color : '000000';
        // Add meeple to dock
        const dock = document.getElementById(`dd-dock-${tileId}`);
        if (dock) {
            dock.insertAdjacentHTML('beforeend', `
                <span class="trapped-penguin-meeple" style="color: #${color};" title="${player ? player.name : ''}">🐧</span>
            `);
        }
        // Update available penguins in panel & tableau
        const avail = Math.max(0, 3 - trappedTotal);
        const panelPenguins = document.getElementById(`dd-panel-penguins-${player_id}`);
        if (panelPenguins)
            panelPenguins.innerText = `${avail}`;
        const availPenguins = document.getElementById(`dd-avail-penguins-${player_id}`);
        if (availPenguins)
            availPenguins.innerText = `${avail}`;
    }
    notif_penguinRetreat(notif) {
        const args = this.getNotifArgs(notif);
        const { player_id, rescuedTile } = args;
        // Reset penguin count to 3
        const panelPenguins = document.getElementById(`dd-panel-penguins-${player_id}`);
        if (panelPenguins)
            panelPenguins.innerText = `3`;
        const availPenguins = document.getElementById(`dd-avail-penguins-${player_id}`);
        if (availPenguins)
            availPenguins.innerText = `3`;
        // If a tile was rescued, remove it from the depth lane
        if (rescuedTile) {
            const tileEl = document.getElementById(`dd-tile-${rescuedTile.id}`);
            if (tileEl) {
                tileEl.classList.add('tile-collect-animation');
                setTimeout(() => tileEl.remove(), 400);
            }
        }
    }
    notif_rockIngested(notif) {
        const args = this.getNotifArgs(notif);
        const { player_id, targetDepth } = args;
        const panelRocks = document.getElementById(`dd-panel-rocks-${player_id}`);
        if (panelRocks) {
            panelRocks.innerText = `${Math.max(0, Number(panelRocks.innerText || '0') - 1)}`;
        }
        const heldRocks = document.getElementById(`dd-held-rocks-${player_id}`);
        if (heldRocks) {
            heldRocks.innerText = `${Math.max(0, Number(heldRocks.innerText || '0') - 1)}`;
        }
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
    notif_lastDiveFlipped(notif) {
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

export { Game };
