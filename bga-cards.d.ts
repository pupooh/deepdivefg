// Minimal typings for bga-cards 1.1.2 (thoun/bga-cards), covering only what
// Deep Dive uses. Source of truth:
//   raw.githubusercontent.com/thoun/bga-cards/1.1.2/bga-cards.d.ts
// Do NOT paste the full upstream file: it redeclares top-level names shared
// with bga-animations (AnimationManager, shouldAnimate, ...) with different
// signatures, which breaks compilation. Grow this file only as new APIs are
// used.
//
// Notes vs the outdated doc pages:
// - The manager class is CardManager (constructed with the game object),
//   NOT `Manager` constructed with settings alone.
// - removeCard/removeCards/removeAll are synchronous, no animation options.

declare namespace BgaCards {
    type CardSelectionMode = 'none' | 'single' | 'multiple';

    type AnimationFunction = (element: HTMLElement, settings: CardAnimationSettings) => Promise<boolean>;

    interface CardAnimationSettings {
        originalSide?: 'front' | 'back';
        rotationDelta?: number;
        animation?: AnimationFunction;
    }

    interface CardAnimation<T> extends CardAnimationSettings {
        /** The stock to take the card from (it is removed from that stock). */
        fromStock?: CardStock<T>;
        /** The element to move the card from. */
        fromElement?: HTMLElement;
    }

    interface CardStockSettings {
        sort?: (a: any, b: any) => number;
        selectableCardClass?: string | null;
        unselectableCardClass?: string | null;
        selectedCardClass?: string | null;
    }

    interface AddCardSettings {
        /** If the card will be on its visible side on the stock. */
        visible?: boolean;
        forceToElement?: HTMLElement;
        /** Force card position. Default to end of list. */
        index?: number;
        /** If the card need to be updated. Default true, will flip the card if needed. */
        updateInformations?: boolean;
        /** Set if the card is selectable. Default true, ignored if the stock is not selectable. */
        selectable?: boolean;
    }

    interface AddCardToSlotSettings extends AddCardSettings {
        /** The slot to place the card on. */
        slot?: number | string;
    }

    interface AddCardToVoidStockSettings extends AddCardSettings {
        remove?: boolean;
    }

    interface RemoveCardSettings {}

    interface LineStockSettings extends CardStockSettings {
        wrap?: 'wrap' | 'nowrap';
        direction?: 'row' | 'column';
        center?: boolean;
        /** CSS gap between cards. '8px' if unset. */
        gap?: string;
    }

    interface SlotStockSettings<T> extends LineStockSettings {
        /** The ids for the slots (can be number or string). */
        slotsIds: (number | string)[];
        /** The classes to apply to each slot. */
        slotClasses?: string[];
        /** How to place the card on a slot automatically. */
        mapCardToSlot?: (card: T) => number | string;
    }

    interface FlipCardSettings {
        /** Update the stored data from the card passed to setCardVisible/flipCard. Default true. */
        updateData?: boolean;
        /** Re-run setupFrontDiv. Default true. */
        updateFront?: boolean;
        /** Re-run setupBackDiv. Default false. */
        updateBack?: boolean;
        /** Delay before updateFront (ms). Default 500. */
        updateFrontDelay?: number;
        /** Delay before updateBack (ms). Default 0. */
        updateBackDelay?: number;
    }

    interface CardManagerSettings<T> {
        /** Id set on each card div. Must be unique per card. */
        getId?: (card: T) => string;
        /** Populate the card's main div (classes/dataset shared by both sides). */
        setupDiv?: (card: T, element: HTMLDivElement) => void;
        /** Populate the card's front div. */
        setupFrontDiv?: (card: T, element: HTMLDivElement) => void;
        /** Populate the card's back div. */
        setupBackDiv?: (card: T, element: HTMLDivElement) => void;
        /** True means the front side should be displayed. */
        isCardVisible?: (card: T) => boolean;
        // animationManager is intentionally omitted: CardManager creates one
        // internally when not provided, and Deep Dive never passes its own.
        /** Card width in px (used for Deck stocks). */
        cardWidth?: number;
        /** Card height in px (used for Deck stocks). */
        cardHeight?: number;
        /** Class applied to selectable cards. Default 'bga-cards_selectable-card'. */
        selectableCardClass?: string | null;
        /** Class applied to unselectable cards. Default 'bga-cards_disabled-card'. */
        unselectableCardClass?: string | null;
        /** Class applied to selected cards. Default 'bga-cards_selected-card'. */
        selectedCardClass?: string | null;
    }

    class CardStock<T> {
        constructor(manager: CardManager<T>, element: HTMLElement, settings?: CardStockSettings);
        getCards(): T[];
        isEmpty(): boolean;
        getSelection(): T[];
        isSelected(card: T): boolean;
        contains(card: T): boolean;
        getCardElement(card: T): HTMLElement;
        addCard(card: T, animation?: CardAnimation<T>, settings?: AddCardSettings): Promise<boolean>;
        addCards(cards: T[], animation?: CardAnimation<T>, settings?: AddCardSettings, shift?: number | boolean): Promise<boolean>;
        removeCard(card: T, settings?: RemoveCardSettings): void;
        removeCards(cards: T[], settings?: RemoveCardSettings): void;
        removeAll(settings?: RemoveCardSettings): void;
        setSelectionMode(selectionMode: CardSelectionMode, selectableCards?: T[]): void;
        setSelectableCards(selectableCards?: T[]): void;
        selectCard(card: T, silent?: boolean): void;
        unselectCard(card: T, silent?: boolean): void;
        selectAll(silent?: boolean): void;
        unselectAll(silent?: boolean): void;
        setCardVisible(card: T, visible: boolean, settings?: FlipCardSettings): void;
        flipCard(card: T, settings?: FlipCardSettings): void;
        onSelectionChange?: (selection: T[], lastChange: T | null) => void;
        onCardClick?: (card: T) => void;
    }

    class LineStock<T> extends CardStock<T> {
        constructor(manager: CardManager<T>, element: HTMLElement, settings?: LineStockSettings);
    }

    class SlotStock<T> extends LineStock<T> {
        constructor(manager: CardManager<T>, element: HTMLElement, settings: SlotStockSettings<T>);
        addCard(card: T, animation?: CardAnimation<T>, settings?: AddCardToSlotSettings): Promise<boolean>;
        setSlotsIds(slotsIds: (number | string)[]): void;
    }

    class VoidStock<T> extends CardStock<T> {
        constructor(manager: CardManager<T>, element: HTMLElement);
        addCard(card: T, animation?: CardAnimation<T>, settings?: AddCardToVoidStockSettings): Promise<boolean>;
    }

    class CardManager<T> {
        // `game` is only read for `game.instantaneousMode`; typed narrowly
        // because this project has no `Game` type in bga-framework.d.ts.
        constructor(game: { instantaneousMode: boolean }, settings: CardManagerSettings<T>);
        animationsActive(): boolean;
        addStock(stock: CardStock<T>): void;
        getCardElement(card: T): HTMLElement;
        isCardVisible(card: T): boolean;
        setCardVisible(card: T, visible?: boolean, settings?: FlipCardSettings): void;
        flipCard(card: T, settings?: FlipCardSettings): void;
        updateCardInformations(card: T, settings?: Omit<FlipCardSettings, 'updateData'>): void;
        getCardWidth(): number | undefined;
        getCardHeight(): number | undefined;
        getSelectableCardClass(): string | null;
        getUnselectableCardClass(): string | null;
        getSelectedCardClass(): string | null;
    }
}

declare global {
    var BgaCards: typeof BgaCards;
}

export = BgaCards;
