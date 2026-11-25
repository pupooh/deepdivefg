<?php

declare(strict_types=1);

namespace Bga\Games\DeepDiveFG\States;

use Bga\GameFramework\StateType;
use Bga\GameFramework\States\GameState;
use Bga\Games\DeepDiveFG\Game;
use Bga\Games\DeepDiveFG\OceanTiles as OT;

const ST_END_GAME = 99;

class EndScore extends GameState
{
    public function __construct(
        protected Game $game,
    ) {
        parent::__construct(
            $game,
            id: 98,
            type: StateType::GAME,
            updateGameProgression: true,
        );
    }

    public function onEnteringState(): int
    {
        // Final score sync for all players
        $this->game->updatePlayerScores();

        $isSoloMode = (bool) $this->globals->get('isSoloMode', false);
        if ($isSoloMode) {
            $difficulty = (int) $this->globals->get('soloDifficulty', 1);
            $aiScoreData = $this->game->computePlayerScore(AiTurn::AI_PLAYER_ID);
            $aiRockCount = $this->game->tileManager->countPlayerTiles(AiTurn::AI_PLAYER_ID, OT\OceanTileLocation::ROCK);
            $aiOpenWaterCount = $this->game->tileManager->countPlayerTiles(
                AiTurn::AI_PLAYER_ID,
                OT\OceanTileLocation::TABLEAU,
                OT\OceanTileCategory::OPEN_WATER,
            );

            $aiTotalScore = 0;
            if ($difficulty === 0) { // Easy
                $aiTotalScore = $aiScoreData['total'] + ($aiRockCount * 1);
            } elseif ($difficulty === 1) { // Medium
                $aiTotalScore = $aiScoreData['total'] + ($aiRockCount * 3);
            } else { // Hard
                // Full points for ALL food
                $allFoodSum = $this->game->tileManager->sumPlayerFoodPoints(AiTurn::AI_PLAYER_ID);
                $aiTotalScore = $allFoodSum + ($aiRockCount * 5) + ($aiOpenWaterCount * 3);
            }

            $this->notify->all('aiFinalScore', clienttranslate('Final Scoring: AI Opponent scores ${aiScore} points (${aiCompletedSets} completed sets).'), [
                'aiScore' => $aiTotalScore,
                'aiCompletedSets' => $aiScoreData['completedSets'],
                'difficulty' => $difficulty,
            ]);
        }

        return ST_END_GAME;
    }
}
