import { Game } from "../Game";

export class RetreatPickTile {
    public args: RetreatPickTileArgs;

    constructor(private game: Game, private bga: Bga<DeepDiveFGPlayer, DeepDiveFGGamedatas>) {
    }

    onEnteringState(args: RetreatPickTileArgs, isCurrentPlayerActive: boolean) {
        this.args = args;

        if (isCurrentPlayerActive) {
            this.game.setRetreatPickInteractivity(args);

            // Action button for each eligible tile
            args.eligibleTiles.forEach(tile => {
                const desc = this.game.getTileDescription(tile);
                this.bga.statusBar.addActionButton(
                    _(`Rescue ${desc} (Depth ${tile.depth})`),
                    () => this.game.performSelectRetreatTile(tile.id),
                    { color: 'primary' }
                );
            });

            // Retreat empty-handed button
            this.bga.statusBar.addActionButton(
                _(`Retreat Empty-Handed`),
                () => this.game.performRetreatEmpty(),
                { color: 'secondary' }
            );
        } else {
            this.game.clearInteractivity();
        }
    }

    onLeavingState(args: RetreatPickTileArgs, isCurrentPlayerActive: boolean) {
        this.game.clearInteractivity();
    }
}
