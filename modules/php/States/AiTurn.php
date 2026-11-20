<?php

declare(strict_types=1);

namespace Bga\Games\DeepDiveFG\States;

use Bga\GameFramework\StateType;
use Bga\GameFramework\States\GameState;
use Bga\Games\DeepDiveFG\Game;

class AiTurn extends GameState
{
    public const AI_PLAYER_ID = 9999;

    public function __construct(
        protected Game $game,
    ) {
        parent::__construct(
            $game,
            id: 50,
            type: StateType::GAME,
            updateGameProgression: true,
        );
    }

    public function onEnteringState(): string
    {
        $aiDepth = (int) $this->globals->get('soloAiDepth', 1);

        // Find the next depth with facedown tiles (starting from aiDepth, wrapping 1..5)
        $targetDepth = $aiDepth;
        for ($i = 0; $i < 5; $i++) {
            $checkDepth = (($aiDepth - 1 + $i) % 5) + 1;
            if ($this->game->getFacedownTilesCount($checkDepth) > 0) {
                $targetDepth = $checkDepth;
                break;
            }
        }

        // Get facedown tiles at targetDepth
        $facedownRows = $this->game->getCollectionFromDb(
            "SELECT `tile_id` AS `id` FROM `ocean_tile` WHERE `depth` = {$targetDepth} AND `location` = 'ocean' AND `is_faceup` = 0 ORDER BY `tile_order` ASC"
        );
        $facedownIds = array_map('intval', array_keys($facedownRows));

        if (empty($facedownIds)) {
            // No facedown tiles anywhere!
            return NextPlayer::class;
        }

        $tileId = $facedownIds[0];
        Game::DbQuery("UPDATE `ocean_tile` SET `is_faceup` = 1 WHERE `tile_id` = {$tileId}");
        $tile = $this->game->getTile($tileId);
        $facedownRemaining = $this->game->getFacedownTilesCount($targetDepth);

        // Advance AI depth marker for next turn (wraps 1..5)
        $nextAiDepth = ($targetDepth % 5) + 1;
        $this->globals->set('soloAiDepth', $nextAiDepth);

        $this->notify->all('tileFlipped', clienttranslate('AI Opponent flips a tile at Depth ${depth}: ${tile_desc}'), [
            'player_id' => self::AI_PLAYER_ID,
            'player_name' => clienttranslate('AI Opponent'),
            'depth' => $targetDepth,
            'tile' => [
                'id' => (int) $tile['tile_id'],
                'depth' => (int) $tile['depth'],
                'category' => $tile['category'],
                'foodColor' => $tile['food_color'],
                'points' => (int) $tile['points'],
                'isExtra' => (bool) $tile['is_extra'],
                'isFaceup' => true,
            ],
            'tile_desc' => $this->getTileDescription($tile),
            'facedownRemaining' => $facedownRemaining,
        ]);

        // Check if game end triggered
        $gameEndTriggered = (bool) $this->globals->get('gameEndTriggered', false);
        if ($facedownRemaining === 0 && !$gameEndTriggered) {
            $this->globals->set('gameEndTriggered', true);
            $this->globals->set('gameEndDepth', $targetDepth);
            $this->tableStats->set('game_end_depth', $targetDepth);
            $this->notify->all('gameEndTriggered', clienttranslate('Depth ${depth} has been exhausted by the AI! Game end is triggered; Last Dive begins when play reaches Start Player.'), [
                'depth' => $targetDepth,
            ]);
        }

        $category = $tile['category'];

        if ($category === Game::CATEGORY_PREDATOR) {
            // AI leaves predator in place and looks for faceup food tiles at targetDepth
            $faceupFood = array_values($this->game->getCollectionFromDb(
                "SELECT `tile_id` AS `id`, `food_color` AS `foodColor`, `points`
                 FROM `ocean_tile`
                 WHERE `depth` = {$targetDepth} AND `location` = 'ocean' AND `is_faceup` = 1 AND `category` = 'food'"
            ));

            if (!empty($faceupFood)) {
                // Determine AI color counts
                $aiFoodCounts = [
                    Game::COLOR_PINK => (int) $this->game->getUniqueValueFromDB("SELECT COUNT(*) FROM `ocean_tile` WHERE `owner_id` = " . self::AI_PLAYER_ID . " AND `location` = 'tableau' AND `food_color` = 'pink'"),
                    Game::COLOR_GREEN => (int) $this->game->getUniqueValueFromDB("SELECT COUNT(*) FROM `ocean_tile` WHERE `owner_id` = " . self::AI_PLAYER_ID . " AND `location` = 'tableau' AND `food_color` = 'green'"),
                    Game::COLOR_YELLOW => (int) $this->game->getUniqueValueFromDB("SELECT COUNT(*) FROM `ocean_tile` WHERE `owner_id` = " . self::AI_PLAYER_ID . " AND `location` = 'tableau' AND `food_color` = 'yellow'"),
                ];

                // Sort candidates:
                // 1) Fewest color in AI tableau
                // 2) Highest points
                usort($faceupFood, function ($a, $b) use ($aiFoodCounts) {
                    $cntA = $aiFoodCounts[$a['foodColor']];
                    $cntB = $aiFoodCounts[$b['foodColor']];
                    if ($cntA !== $cntB) {
                        return $cntA <=> $cntB;
                    }
                    return (int) $b['points'] <=> (int) $a['points'];
                });

                // Check if top candidates tie
                $best = $faceupFood[0];
                $tied = array_filter($faceupFood, function ($item) use ($best, $aiFoodCounts) {
                    return $aiFoodCounts[$item['foodColor']] === $aiFoodCounts[$best['foodColor']]
                        && (int) $item['points'] === (int) $best['points'];
                });

                if (count($tied) > 1) {
                    // Tiebreak required by human player
                    $this->globals->set('soloTiebreakCandidateIds', array_map(fn($t) => (int) $t['id'], array_values($tied)));
                    return SoloChooseTiebreak::class;
                } else {
                    $this->game->collectTileForPlayer((int) $best['id'], self::AI_PLAYER_ID);
                    $this->notify->all('tileCollected', clienttranslate('AI Opponent takes faceup ${tile_desc} from Depth ${depth}!'), [
                        'player_id' => self::AI_PLAYER_ID,
                        'player_name' => clienttranslate('AI Opponent'),
                        'tile' => $best,
                        'tile_desc' => sprintf(clienttranslate('%s Food (%d pts)'), ucfirst((string) $best['foodColor']), (int) $best['points']),
                        'depth' => $targetDepth,
                    ]);
                }
            }
        } else {
            // Food, Rock, or Open Water: AI collects it!
            $loc = match ($category) {
                Game::CATEGORY_ROCK => 'rock',
                Game::CATEGORY_FOOD => 'tableau',
                default => 'tableau',
            };
            if ($category === Game::CATEGORY_FOOD) {
                $this->game->collectTileForPlayer($tileId, self::AI_PLAYER_ID);
            } else {
                Game::DbQuery("UPDATE `ocean_tile` SET `location` = '{$loc}', `owner_id` = " . self::AI_PLAYER_ID . " WHERE `tile_id` = {$tileId}");
            }

            $this->notify->all('tileCollected', clienttranslate('AI Opponent collects ${tile_desc} from Depth ${depth}!'), [
                'player_id' => self::AI_PLAYER_ID,
                'player_name' => clienttranslate('AI Opponent'),
                'tile' => [
                    'id' => (int) $tile['tile_id'],
                    'depth' => (int) $tile['depth'],
                    'category' => $tile['category'],
                    'foodColor' => $tile['food_color'],
                    'points' => (int) $tile['points'],
                ],
                'tile_desc' => $this->getTileDescription($tile),
                'depth' => $targetDepth,
            ]);
        }

        return NextPlayer::class;
    }

    private function getTileDescription(array $tile): string
    {
        return match ($tile['category']) {
            Game::CATEGORY_OPEN_WATER => clienttranslate('Open Water'),
            Game::CATEGORY_ROCK => clienttranslate('Rock'),
            Game::CATEGORY_PREDATOR => clienttranslate('Predator'),
            Game::CATEGORY_FOOD => sprintf(
                clienttranslate('%s Food (%d pts)'),
                ucfirst((string) $tile['food_color']),
                (int) $tile['points']
            ),
            default => clienttranslate('Tile'),
        };
    }
}
