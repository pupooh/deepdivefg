import { BgaCards } from "./libs";
import type { Game } from "./Game";

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
export class OceanTileManager extends BgaCards.Manager<OceanTile> {
    constructor(game: Game) {
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
function tileFaceClasses(tile: OceanTile): string {
    const cat = tile.category || 'open_water';
    // Front background is driven by depth (depth-front-N), not by category
    // or food color; the food color shows on the animal itself instead.
    return `tile-faceup tile-${cat} depth-front-${tile.depth}`;
}

/** Inner HTML of a facedown tile's back side. */
function renderTileBackInnerHtml(tile: OceanTile): string {
    return `
        <div class="tile-back-inner">
            <span class="tile-wave-pattern">〰️</span>
        </div>
    `;
}

/** Inner HTML of a faceup tile's front side. */
function renderTileFrontInnerHtml(tile: OceanTile): string {
    const cat = tile.category || 'open_water';
    let innerHtml = '';

    if (cat === 'food') {
        const color = tile.foodColor || 'pink';
        // Animal by depth; tinted to the food color by the animal-{color}
        // CSS filter (see Game.scss).
        const depthIcons: Record<number, string> = {
            1: '🦐', // shrimp
            2: '🦀', // crab
            4: '🐟', // fish
            5: '🦑', // squid
        };
        const icon = tile.depth === 3
            ? `<span class="tile-school-fish">🐟🐟🐟</span>` // school of fish
            : (depthIcons[tile.depth] || '🐟');
        innerHtml = `
            <div class="tile-food-icon animal-${color}">${icon}</div>
            <div class="tile-points-badge">${tile.points}</div>
        `;
    } else if (cat === 'rock') {
        innerHtml = `
            <div class="tile-icon">🪨</div>
        `;
    } else if (cat === 'open_water') {
        innerHtml = `
            <div class="tile-icon">🌊</div>
        `;
    } else if (cat === 'predator') {
        // Predator animal by depth, always orange (animal-orange filter).
        const predatorIcons: Record<number, string> = {
            1: '🦭', // seal
            2: '🦭', // seal
            3: '🐋', // killer whale
            4: '🐋', // killer whale
            5: '🦈', // great white shark
        };
        const icon = predatorIcons[tile.depth] || '🦈';
        innerHtml = `
            <div class="tile-icon animal-orange">${icon}</div>
            <div class="tile-trapped-dock" id="dd-dock-${tile.id}"></div>
        `;
    }

    const extraBadge = tile.isExtra ? `<span class="tile-extra-icon" title="${_('4+ Player Tile')}">★</span>` : '';
    return `${extraBadge}${innerHtml}`;
}
