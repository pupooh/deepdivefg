<?php

declare(strict_types=1);

namespace Bga\Games\DeepDiveFG\States;

use Bga\GameFramework\StateType;
use Bga\GameFramework\States\GameState;
use Bga\Games\DeepDiveFG\Game;
use Bga\Games\DeepDiveFG\OceanTiles\OceanTile;

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
        $facedownTiles = $this->game->tileManager->getFacedownTilesAtDepth($targetDepth);
        $facedownIds = array_map(fn(OceanTile $t) => $t->id, $facedownTiles);

        if (empty($facedownIds)) {
            // No facedown tiles anywhere!
            return NextPlayer::class;
        }

        $tileId = $facedownIds[0];
        $tile = $this->game->getTile($tileId);
        if ($tile === null) {
            return NextPlayer::class;
        }
        $this->game->tileManager->flipTile($tile);
        $facedownRemaining = $this->game->getFacedownTilesCount($targetDepth);

        // Advance AI depth marker for next turn (wraps 1..5)
        $nextAiDepth = ($targetDepth % 5) + 1;
        $this->globals->set('soloAiDepth', $nextAiDepth);

        $this->notify->all('tileFlipped', clienttranslate('AI Opponent flips a tile at Depth ${depth}: ${tile_desc}'), [
            'player_id' => self::AI_PLAYER_ID,
            'player_name' => clienttranslate('AI Opponent'),
            'depth' => $targetDepth,
            'tile' => $tile->toArray(),
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

        $category = $tile->category;

        if ($category === Game::CATEGORY_PREDATOR) {
            // AI leaves predator in place and looks for faceup food tiles at targetDepth
            $faceupFood = array_values(array_filter(
                $this->game->tileManager->getFaceupTilesAtDepth($targetDepth),
                fn(OceanTile $t) => $t->category === Game::CATEGORY_FOOD,
            ));

            if (!empty($faceupFood)) {
                // Determine AI color counts
                $aiFoodCounts = [
                    Game::COLOR_PINK => $this->game->tileManager->countPlayerTiles(self::AI_PLAYER_ID, OceanTile::LOCATION_TABLEAU, Game::CATEGORY_FOOD, Game::COLOR_PINK),
                    Game::COLOR_GREEN => $this->game->tileManager->countPlayerTiles(self::AI_PLAYER_ID, OceanTile::LOCATION_TABLEAU, Game::CATEGORY_FOOD, Game::COLOR_GREEN),
                    Game::COLOR_YELLOW => $this->game->tileManager->countPlayerTiles(self::AI_PLAYER_ID, OceanTile::LOCATION_TABLEAU, Game::CATEGORY_FOOD, Game::COLOR_YELLOW),
                ];

                // Sort candidates:
                // 1) Fewest color in AI tableau
                // 2) Highest points
                usort($faceupFood, function (OceanTile $a, OceanTile $b) use ($aiFoodCounts) {
                    $cntA = $aiFoodCounts[$a->foodColor];
                    $cntB = $aiFoodCounts[$b->foodColor];
                    if ($cntA !== $cntB) {
                        return $cntA <=> $cntB;
                    }
                    return (int) $b->points <=> (int) $a->points;
                });

                // Check if top candidates tie
                $best = $faceupFood[0];
                $tied = array_filter($faceupFood, function (OceanTile $item) use ($best, $aiFoodCounts) {
                    return $aiFoodCounts[$item->foodColor] === $aiFoodCounts[$best->foodColor]
                        && (int) $item->points === (int) $best->points;
                });

                if (count($tied) > 1) {
                    // Tiebreak required by human player
                    $this->globals->set('soloTiebreakCandidateIds', array_map(fn(OceanTile $t) => $t->id, array_values($tied)));
                    return SoloChooseTiebreak::class;
                } else {
                    $collected = $this->game->collectTileForPlayer((int) $best->id, self::AI_PLAYER_ID);
                    $this->notify->all('tileCollected', clienttranslate('AI Opponent takes faceup ${tile_desc} from Depth ${depth}!'), [
                        'player_id' => self::AI_PLAYER_ID,
                        'player_name' => clienttranslate('AI Opponent'),
                        'tile' => [
                            'id' => $collected->id,
                            'depth' => $collected->depth,
                            'category' => $collected->category,
                            'foodColor' => $collected->foodColor,
                            'points' => $collected->points,
                            'rowIndex' => $collected->rowIndex,
                        ],
                        'tile_desc' => sprintf(clienttranslate('%s Food (%d pts)'), ucfirst((string) $collected->foodColor), (int) $collected->points),
                        'depth' => $targetDepth,
                    ]);
                }
            }
        } else {
            // Food, Rock, or Open Water: AI collects it!
            $loc = match ($category) {
                Game::CATEGORY_ROCK => OceanTile::LOCATION_ROCK,
                Game::CATEGORY_FOOD => OceanTile::LOCATION_TABLEAU,
                default => OceanTile::LOCATION_TABLEAU,
            };
            $collected = null;
            if ($category === Game::CATEGORY_FOOD) {
                $collected = $this->game->collectTileForPlayer($tileId, self::AI_PLAYER_ID);
            } else {
                $this->game->tileManager->moveTileToPlayerLocation($tile, $loc, self::AI_PLAYER_ID);
            }

            $this->notify->all('tileCollected', clienttranslate('AI Opponent collects ${tile_desc} from Depth ${depth}!'), [
                'player_id' => self::AI_PLAYER_ID,
                'player_name' => clienttranslate('AI Opponent'),
                'tile' => [
                    'id' => $tile->id,
                    'depth' => $tile->depth,
                    'category' => $tile->category,
                    'foodColor' => $tile->foodColor,
                    'points' => $tile->points,
                    'rowIndex' => $collected ? $collected->rowIndex : null,
                ],
                'tile_desc' => $this->getTileDescription($tile),
                'depth' => $targetDepth,
            ]);
        }

        return NextPlayer::class;
    }

    private function getTileDescription(OceanTile $tile): string
    {
        return match ($tile->category) {
            Game::CATEGORY_OPEN_WATER => clienttranslate('Open Water'),
            Game::CATEGORY_ROCK => clienttranslate('Rock'),
            Game::CATEGORY_PREDATOR => clienttranslate('Predator'),
            Game::CATEGORY_FOOD => sprintf(
                clienttranslate('%s Food (%d pts)'),
                ucfirst((string) $tile->foodColor),
                (int) $tile->points
            ),
            default => clienttranslate('Tile'),
        };
    }
}
