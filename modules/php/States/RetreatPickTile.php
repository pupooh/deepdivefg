<?php

declare(strict_types=1);

namespace Bga\Games\DeepDiveFG\States;

use Bga\GameFramework\StateType;
use Bga\GameFramework\States\GameState;
use Bga\GameFramework\States\PossibleAction;
use Bga\GameFramework\Actions\Types\IntParam;
use Bga\GameFramework\UserException;
use Bga\Games\DeepDiveFG\Game;

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
        $depthList = implode(",", $trappedDepths);

        $eligibleTiles = $this->game->getCollectionFromDb(
            "SELECT `tile_id` AS `id`, `depth`, `category`, `food_color` AS `foodColor`, `points`, `is_extra` AS `isExtra`
             FROM `ocean_tile`
             WHERE `location` = 'ocean' AND `is_faceup` = 1 AND `category` IN ('food', 'rock') AND `depth` IN ({$depthList})
             ORDER BY `depth` ASC, `points` DESC"
        );

        return [
            'trappedDepths' => array_values($trappedDepths),
            'eligibleTileIds' => array_map('intval', array_keys($eligibleTiles)),
            'eligibleTiles' => array_values($eligibleTiles),
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
                'id' => (int) $collected['tile_id'],
                'depth' => (int) $collected['depth'],
                'category' => $collected['category'],
                'foodColor' => $collected['food_color'],
                'points' => (int) $collected['points'],
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

    private function getTileDescription(array $tile): string
    {
        return match ($tile['category']) {
            Game::CATEGORY_ROCK => clienttranslate('Rock'),
            Game::CATEGORY_FOOD => sprintf(
                clienttranslate('%s Food (%d pts)'),
                ucfirst((string) $tile['food_color']),
                (int) $tile['points']
            ),
            default => clienttranslate('Tile'),
        };
    }
}
