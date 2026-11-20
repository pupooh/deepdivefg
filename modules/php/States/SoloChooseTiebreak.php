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

class SoloChooseTiebreak extends GameState
{
    public function __construct(
        protected Game $game,
    ) {
        parent::__construct(
            $game,
            id: 51,
            type: StateType::ACTIVE_PLAYER,
            description: clienttranslate('${actplayer} must select which tied Food Tile the AI opponent takes'),
            descriptionMyTurn: clienttranslate('${you} must select which tied Food Tile the AI opponent takes'),
        );
    }

    public function getArgs(): array
    {
        $candidateIds = array_map('intval', (array) $this->globals->get('soloTiebreakCandidateIds', []));

        $candidateTiles = [];
        if (!empty($candidateIds)) {
            $candidateTiles = array_map(
                fn(OceanTile $t) => [
                    'id' => $t->id,
                    'depth' => $t->depth,
                    'category' => $t->category,
                    'foodColor' => $t->foodColor,
                    'points' => $t->points,
                ],
                $this->game->tileManager->getTilesByIds($candidateIds),
            );
        }

        return [
            'candidateTileIds' => $candidateIds,
            'candidateTiles' => $candidateTiles,
        ];
    }

    #[PossibleAction]
    public function actChooseAiTile(#[IntParam(min: 1)] int $tileId, int $activePlayerId): string
    {
        $args = $this->getArgs();
        if (!in_array($tileId, $args['candidateTileIds'])) {
            throw new UserException(clienttranslate('This tile is not one of the tied options'));
        }

        $collected = $this->game->collectTileForPlayer($tileId, AiTurn::AI_PLAYER_ID);

        $this->notify->all('tileCollected', clienttranslate('${player_name} chose ${tile_desc} for the AI Opponent!'), [
            'player_id' => AiTurn::AI_PLAYER_ID,
            'player_name' => clienttranslate('AI Opponent'),
            'tile' => [
                'id' => $collected->id,
                'depth' => $collected->depth,
                'category' => $collected->category,
                'foodColor' => $collected->foodColor,
                'points' => $collected->points,
            ],
            'tile_desc' => sprintf(clienttranslate('%s Food (%d pts)'), ucfirst((string) $collected->foodColor), (int) $collected->points),
            'depth' => (int) $collected->depth,
        ]);

        return NextPlayer::class;
    }

    public function zombie(int $playerId): string
    {
        $args = $this->getArgs();
        if (!empty($args['candidateTileIds'])) {
            return $this->actChooseAiTile($args['candidateTileIds'][0], $playerId);
        }
        return NextPlayer::class;
    }
}
