import { Game } from "../Game";

export class ConfirmFlipOrDive {
    public args: ConfirmFlipOrDiveArgs;

    constructor(private game: Game, private bga: Bga<DeepDiveFGPlayer, DeepDiveFGGamedatas>) {
    }

    onEnteringState(args: ConfirmFlipOrDiveArgs, isCurrentPlayerActive: boolean) {
        this.args = args;
        this.game.setActiveDepth(args.currentDepth);

        if (isCurrentPlayerActive && args.flippedTile) {
            // Resurface button
            this.bga.statusBar.addActionButton(
                _(`Resurface`),
                () => this.game.performKeepFlipped(),
                { color: 'primary' }
            );

            // Dive deeper button
            this.bga.statusBar.addActionButton(
                _(`Dive deeper`),
                () => this.game.performDiveDeeper(),
                { color: 'secondary' }
            );

            this.game.setConfirmFlipInteractivity(args);
        } else {
            this.game.clearInteractivity();
        }
    }

    onLeavingState(args: ConfirmFlipOrDiveArgs, isCurrentPlayerActive: boolean) {
        this.game.clearInteractivity();
    }
}
