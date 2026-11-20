import { Game } from "../Game";

export class SoloChooseTiebreak {
    public args: SoloChooseTiebreakArgs;

    constructor(private game: Game, private bga: Bga<DeepDiveFGPlayer, DeepDiveFGGamedatas>) {
    }

    onEnteringState(args: SoloChooseTiebreakArgs, isCurrentPlayerActive: boolean) {
        this.args = args;

        if (isCurrentPlayerActive) {
            this.game.setSoloTiebreakInteractivity(args);

            args.candidateTiles.forEach(tile => {
                const desc = this.game.getTileDescription(tile);
                this.bga.statusBar.addActionButton(
                    _(`Give AI ${desc} (Depth ${tile.depth})`),
                    () => this.game.performChooseAiTile(tile.id),
                    { color: 'primary' }
                );
            });
        } else {
            this.game.clearInteractivity();
        }
    }

    onLeavingState(args: SoloChooseTiebreakArgs, isCurrentPlayerActive: boolean) {
        this.game.clearInteractivity();
    }
}
