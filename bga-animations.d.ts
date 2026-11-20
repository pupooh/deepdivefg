// Minimal typings for bga-animations 1.1.2 (thoun/bga-animations), covering
// only what Deep Dive uses. Source of truth:
//   raw.githubusercontent.com/thoun/bga-animations/1.1.2/bga-animations.d.ts
// Do NOT paste the full upstream file: it redeclares top-level names shared
// with bga-cards with different signatures, which breaks compilation.
// Deep Dive does not use the animations API directly today — CardManager
// creates an AnimationManager internally — so this file stays small; grow
// it only as new APIs are used.

declare namespace BgaAnimations {
    interface AnimationManagerSettings {
        /** Default animation duration in ms (default: 500). */
        duration?: number;
        /** The zoom manager, providing the current scale. */
        zoomManager?: any;
    }

    class AnimationManager {
        // `game` is only read for `game.instantaneousMode`; typed narrowly
        // because this project has no `Game` type in bga-framework.d.ts.
        constructor(game: { instantaneousMode: boolean }, settings?: AnimationManagerSettings);
        getSettings(): AnimationManagerSettings | null | undefined;
        animationsActive(): boolean;
    }

    function shouldAnimate(settings?: any): boolean;
}

declare global {
    var BgaAnimations: typeof BgaAnimations;
}

export = BgaAnimations;
