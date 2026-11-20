<?php

declare(strict_types=1);

namespace Bga\Games\DeepDiveFG\States;

use Bga\GameFramework\StateType;
use Bga\GameFramework\States\GameState;
use Bga\Games\DeepDiveFG\Game;

class StartTurn extends GameState
{
    public function __construct(
        protected Game $game,
    ) {
        parent::__construct(
            $game,
            id: 10,
            type: StateType::GAME,
            updateGameProgression: true,
        );
    }

    public function onEnteringState(): string
    {
        $activePlayerId = (int) $this->game->getActivePlayerId();
        $startPlayerId = (int) $this->globals->get('startPlayerId');
        $gameEndTriggered = (bool) $this->globals->get('gameEndTriggered', false);
        $lastDiveFlipped = (bool) $this->globals->get('lastDiveFlipped', false);

        // If game end was triggered and play has reached the start player, flip token to LAST DIVE
        if ($gameEndTriggered && !$lastDiveFlipped && $activePlayerId === $startPlayerId) {
            $this->globals->set('lastDiveFlipped', true);
            $this->notify->all('lastDiveFlipped', clienttranslate('Play has reached the Start Player! The token is flipped to LAST DIVE: this is everyone’s final turn!'), [
                'startPlayerId' => $startPlayerId,
            ]);
        }

        // Reset turn state
        $this->globals->set('currentDepth', 1);
        $this->globals->set('usedRockThisTurn', false);
        $this->globals->set('flippedTileId', 0);

        // Check for 1P Solo AI Turn
        $isSoloMode = (bool) $this->globals->get('isSoloMode', false);
        $soloAiTurn = (bool) $this->globals->get('soloAiTurn', false);

        if ($isSoloMode && $soloAiTurn) {
            return AiTurn::class;
        }

        $this->playerStats->inc('dives_taken', 1, $activePlayerId);

        return PlayerDiveStep::class;
    }
}
