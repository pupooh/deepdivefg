<?php

declare(strict_types=1);

namespace Bga\Games\DeepDiveFG\States;

use Bga\GameFramework\StateType;
use Bga\GameFramework\States\GameState;
use Bga\GameFramework\States\PossibleAction;
use Bga\GameFramework\UserException;
use Bga\Games\DeepDiveFG\Game;

class ConfirmFlipOrDive extends GameState
{
    public function __construct(
        protected Game $game,
    ) {
        parent::__construct(
            $game,
            id: 25,
            type: StateType::ACTIVE_PLAYER,
            description: clienttranslate('${actplayer} must decide whether to resurface with their flipped tile or leave it and dive deeper'),
            descriptionMyTurn: clienttranslate('${you} must decide whether to resurface with your flipped tile or leave it and dive deeper'),
        );
    }

    public function getArgs(): array
    {
        $currentDepth = (int) $this->globals->get('currentDepth', 1);
        $flippedTileId = (int) $this->globals->get('flippedTileId', 0);
        $tile = $this->game->getTile($flippedTileId);

        return [
            'currentDepth' => $currentDepth,
            'nextDepth' => $currentDepth + 1,
            'flippedTile' => $tile ? [
                'id' => (int) $tile['tile_id'],
                'depth' => (int) $tile['depth'],
                'category' => $tile['category'],
                'foodColor' => $tile['food_color'],
                'points' => (int) $tile['points'],
                'isExtra' => (bool) $tile['is_extra'],
                'isFaceup' => true,
            ] : null,
        ];
    }

    #[PossibleAction]
    public function actKeepFlipped(int $activePlayerId): string
    {
        $flippedTileId = (int) $this->globals->get('flippedTileId', 0);
        $currentDepth = (int) $this->globals->get('currentDepth', 1);
        $tile = $this->game->getTile($flippedTileId);

        if (!$tile) {
            throw new UserException(clienttranslate('No flipped tile found'));
        }

        $collected = $this->game->collectTileForPlayer($flippedTileId, $activePlayerId);

        $this->notify->all('tileCollected', clienttranslate('${player_name} resurfaces with ${tile_desc} from Depth ${depth}!'), [
            'player_id' => $activePlayerId,
            'player_name' => $this->game->getPlayerNameById($activePlayerId),
            'tile' => [
                'id' => (int) $collected['tile_id'],
                'depth' => (int) $collected['depth'],
                'category' => $collected['category'],
                'foodColor' => $collected['food_color'],
                'points' => (int) $collected['points'],
            ],
            'tile_desc' => $this->getTileDescription($collected),
            'depth' => $currentDepth,
        ]);

        $this->globals->set('flippedTileId', 0);
        return NextPlayer::class;
    }

    #[PossibleAction]
    public function actDiveDeeper(int $activePlayerId): string
    {
        $currentDepth = (int) $this->globals->get('currentDepth', 1);
        $flippedTileId = (int) $this->globals->get('flippedTileId', 0);
        $tile = $this->game->getTile($flippedTileId);
        $nextDepth = $currentDepth + 1;

        $this->globals->set('currentDepth', $nextDepth);
        $this->globals->set('flippedTileId', 0);

        $this->notify->all('penguinMovedDepth', clienttranslate('${player_name} leaves ${tile_desc} faceup at Depth ${fromDepth} and dives to Depth ${toDepth}!'), [
            'player_id' => $activePlayerId,
            'player_name' => $this->game->getPlayerNameById($activePlayerId),
            'fromDepth' => $currentDepth,
            'toDepth' => $nextDepth,
            'tile_desc' => $tile ? $this->getTileDescription($tile) : '',
        ]);

        return PlayerDiveStep::class;
    }

    public function zombie(int $playerId): string
    {
        return $this->actKeepFlipped($playerId);
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
