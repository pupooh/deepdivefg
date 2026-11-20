declare namespace BgaAnimations {
    interface ManagerSettings {
        animationsActive?: () => boolean;
    }
    class Manager {
        constructor(settings?: ManagerSettings);
    }
}

declare global {
    var BgaAnimations: typeof BgaAnimations;
}

export = BgaAnimations;
