<?php

declare(strict_types=1);

namespace Bga\Games\DeepDiveFG\States;

use Bga\GameFramework\StateType;
use Bga\GameFramework\States\GameState;
use Bga\Games\DeepDiveFG\Game;

class NextPlayer extends GameState
{
    public function __construct(
        protected Game $game,
    ) {
        parent::__construct(
            $game,
            id: 40,
            type: StateType::GAME,
            updateGameProgression: true,
        );
    }

    public function onEnteringState(): string
    {
        $activePlayerId = (int) $this->game->getActivePlayerId();
        $this->game->giveExtraTime($activePlayerId);
        $this->tableStats->inc('turns_number', 1);
        $this->playerStats->inc('turns_number', 1, $activePlayerId);

        $isSoloMode = (bool) $this->globals->get('isSoloMode', false);
        $startPlayerId = (int) $this->globals->get('startPlayerId');
        $lastDiveFlipped = (bool) $this->globals->get('lastDiveFlipped', false);

        if ($isSoloMode) {
            $soloAiTurn = (bool) $this->globals->get('soloAiTurn', false);
            if ($soloAiTurn) {
                // AI just completed turn
                $this->globals->set('soloAiTurn', false);
                if ($lastDiveFlipped) {
                    return EndScore::class;
                }
                return StartTurn::class;
            } else {
                // Player just completed turn
                $this->globals->set('soloAiTurn', true);
                return StartTurn::class;
            }
        }

        // Multiplayer mode
        $nextPlayerId = (int) $this->game->activeNextPlayer();

        // Check if Last Dive round has completed (play reaches the Start Player again after Last Dive was active)
        if ($lastDiveFlipped && $nextPlayerId === $startPlayerId) {
            return EndScore::class;
        }

        return StartTurn::class;
    }
}
