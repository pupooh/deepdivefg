declare namespace BgaCards {
    interface CardManagerSettings<T> {
        animationManager?: any;
        type?: string;
        setupFrontDiv?: (card: T, div: HTMLDivElement) => void;
        setupBackDiv?: (card: T, div: HTMLDivElement) => void;
        cardWidth?: number;
        cardHeight?: number;
        cardBorderRadius?: string;
        isCardVisible?: (card: T) => boolean;
    }

    class Manager<T = any> {
        constructor(settings: CardManagerSettings<T>);
        getCardElement(card: T): HTMLElement;
    }

    interface StockSettings {
        sort?: (a: any, b: any) => number;
    }

    class CardStock<T = any> {
        constructor(manager: Manager<T>, element: HTMLElement, settings?: StockSettings);
        addCard(card: T, animation?: any): Promise<boolean>;
        addCards(cards: T[], animation?: any): Promise<boolean>;
        removeCard(card: T, animation?: any): Promise<boolean>;
        removeCards(cards: T[], animation?: any): Promise<boolean>;
        removeAll(animation?: any): Promise<boolean>;
        getCards(): T[];
        setSelectionMode(mode: 'none' | 'single' | 'multiple', selectableCards?: T[]): void;
        getSelection(): T[];
        onCardClick?: (card: T) => void;
        onSelectionChange?: (selection: T[], lastChange?: T) => void;
    }

    class HandStock<T = any> extends CardStock<T> {}
    class LineStock<T = any> extends CardStock<T> {}
    class VoidStock<T = any> extends CardStock<T> {}
    class SlotStock<T = any> extends CardStock<T> {}
    class Deck<T = any> extends CardStock<T> {}
}

declare global {
    var BgaCards: typeof BgaCards;
}

export = BgaCards;
