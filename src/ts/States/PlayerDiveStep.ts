import { Game } from "../Game";

export class PlayerDiveStep {
    public args: PlayerDiveStepArgs;

    constructor(private game: Game, private bga: Bga<DeepDiveFGPlayer, DeepDiveFGGamedatas>) {
    }

    onEnteringState(args: PlayerDiveStepArgs, isCurrentPlayerActive: boolean) {
        this.args = args;
        this.game.setActiveDepth(args.currentDepth);

        if (isCurrentPlayerActive) {
            this.game.setDiveStepInteractivity(args);

            // Add action buttons in status bar
            if (args.canSkip) {
                const nextDepth = args.currentDepth + 1;
                this.bga.statusBar.addActionButton(
                    _(`Skip Depth ${args.currentDepth} (Dive to ${nextDepth})`),
                    () => this.game.performSkipDepth(),
                    { color: 'primary' }
                );
            }

            if (args.canIngestRock && args.validRockDepths.length > 0) {
                args.validRockDepths.forEach(depth => {
                    if (depth > 1) {
                        this.bga.statusBar.addActionButton(
                            _(`Ingest Rock 🪨 Plunge to Depth ${depth}`),
                            () => this.game.performIngestRock(depth),
                            { color: 'secondary' }
                        );
                    }
                });
            }
        } else {
            this.game.clearInteractivity();
        }
    }

    onLeavingState(args: PlayerDiveStepArgs, isCurrentPlayerActive: boolean) {
        this.game.clearInteractivity();
    }
}
