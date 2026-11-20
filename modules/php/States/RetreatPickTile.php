<?php

declare(strict_types=1);

namespace Bga\Games\DeepDiveFG\States;

use Bga\GameFramework\StateType;
use Bga\GameFramework\States\GameState;
use Bga\GameFramework\States\PossibleAction;
use Bga\GameFramework\Actions\Types\IntParam;
use Bga\GameFramework\UserException;
use Bga\Games\DeepDiveFG\Game;
use Bga\Games\DeepDiveFG\OceanTile;

class RetreatPickTile extends GameState
{
    public function __construct(
        protected Game $game,
    ) {
        parent::__construct(
            $game,
            id: 30,
            type: StateType::ACTIVE_PLAYER,
            description: clienttranslate('3rd Penguin trapped! ${actplayer} must select 1 faceup Food or Rock tile to rescue during Retreat'),
            descriptionMyTurn: clienttranslate('3rd Penguin trapped! ${you} must select 1 faceup Food or Rock tile to rescue during Retreat'),
        );
    }

    public function getArgs(): array
    {
        $activePlayerId = (int) $this->game->getActivePlayerId();
        $trappedPenguins = $this->game->getTrappedPenguins($activePlayerId);
        $trappedDepths = array_unique(array_map(fn($p) => (int) $p['depth'], $trappedPenguins));

        $eligibleTiles = $this->game->tileManager->getEligibleRetreatTiles(array_values($trappedDepths));

        return [
            'trappedDepths' => array_values($trappedDepths),
            'eligibleTileIds' => array_map(fn(OceanTile $t) => $t->id, $eligibleTiles),
            'eligibleTiles' => array_map(fn(OceanTile $t) => $t->toArray(), $eligibleTiles),
        ];
    }

    #[PossibleAction]
    public function actSelectRetreatTile(#[IntParam(min: 1)] int $tileId, int $activePlayerId): string
    {
        $args = $this->getArgs();
        if (!in_array($tileId, $args['eligibleTileIds'])) {
            throw new UserException(clienttranslate('This tile is not eligible for retreat rescue'));
        }

        $collected = $this->game->collectTileForPlayer($tileId, $activePlayerId);
        $this->game->freeTrappedPenguins($activePlayerId);
        $this->playerStats->inc('retreats_triggered', 1, $activePlayerId);

        $this->notify->all('penguinRetreat', clienttranslate('${player_name} retreats all 3 penguins back to the surface and rescues ${tile_desc}!'), [
            'player_id' => $activePlayerId,
            'player_name' => $this->game->getPlayerNameById($activePlayerId),
            'rescuedTile' => [
                'id' => $collected->id,
                'depth' => $collected->depth,
                'category' => $collected->category,
                'foodColor' => $collected->foodColor,
                'points' => $collected->points,
                'rowIndex' => $collected->rowIndex,
            ],
            'tile_desc' => $this->getTileDescription($collected),
        ]);

        return NextPlayer::class;
    }

    #[PossibleAction]
    public function actRetreatEmpty(int $activePlayerId): string
    {
        $this->game->freeTrappedPenguins($activePlayerId);
        $this->playerStats->inc('retreats_triggered', 1, $activePlayerId);

        $this->notify->all('penguinRetreat', clienttranslate('${player_name} retreats all 3 penguins back to the surface empty-handed!'), [
            'player_id' => $activePlayerId,
            'player_name' => $this->game->getPlayerNameById($activePlayerId),
            'rescuedTile' => null,
        ]);

        return NextPlayer::class;
    }

    public function zombie(int $playerId): string
    {
        $args = $this->getArgs();
        if (!empty($args['eligibleTileIds'])) {
            return $this->actSelectRetreatTile($args['eligibleTileIds'][0], $playerId);
        }
        return $this->actRetreatEmpty($playerId);
    }

    private function getTileDescription(OceanTile $tile): string
    {
        return match ($tile->category) {
            Game::CATEGORY_ROCK => clienttranslate('Rock'),
            Game::CATEGORY_FOOD => sprintf(
                clienttranslate('%s Food (%d pts)'),
                ucfirst((string) $tile->foodColor),
                (int) $tile->points
            ),
            default => clienttranslate('Tile'),
        };
    }
}
