<?php

declare(strict_types=1);

namespace Bga\Games\DeepDiveFG\States;

use Bga\GameFramework\StateType;
use Bga\GameFramework\States\GameState;
use Bga\GameFramework\States\PossibleAction;
use Bga\GameFramework\Actions\Types\IntParam;
use Bga\GameFramework\UserException;
use Bga\Games\DeepDiveFG\Game;
use Bga\Games\DeepDiveFG\OceanTiles\OceanTile;
use Bga\Games\DeepDiveFG\OceanTiles\OceanTileCategory;
use Bga\Games\DeepDiveFG\OceanTiles\OceanTileLocation;

class PlayerDiveStep extends GameState
{
    public function __construct(
        protected Game $game,
    ) {
        parent::__construct(
            $game,
            id: 20,
            type: StateType::ACTIVE_PLAYER,
            description: clienttranslate('${actplayer} must flip a tile, take a faceup tile, or dive deeper'),
            descriptionMyTurn: clienttranslate('${you} must flip a tile, take a faceup tile, or dive deeper'),
        );
    }

    public function getArgs(): array
    {
        $activePlayerId = (int) $this->game->getActivePlayerId();
        $currentDepth = (int) $this->globals->get('currentDepth', 1);
        $usedRockThisTurn = (bool) $this->globals->get('usedRockThisTurn', false);
        $rockCount = $this->game->getPlayerRockCount($activePlayerId);

        $canIngestRock = ($currentDepth === 1 && !$usedRockThisTurn && $rockCount > 0);
        $canSkip = $this->game->canPlayerSkipDepth($activePlayerId, $currentDepth);

        $facedownIds = array_map(
            fn(OceanTile $t) => $t->id,
            $this->game->tileManager->getFacedownTilesAtDepth($currentDepth),
        );
        $takeableFaceupIds = array_map(
            fn(OceanTile $t) => $t->id,
            $this->game->tileManager->getTakeableTilesAtDepth($currentDepth),
        );

        // Depths available for rock drop
        $validRockDepths = [];
        if ($canIngestRock) {
            for ($d = 1; $d <= 5; $d++) {
                if ($this->game->tileManager->countOceanTilesAtDepth($d) > 0) {
                    $validRockDepths[] = $d;
                }
            }
        }

        return [
            'currentDepth' => $currentDepth,
            'canIngestRock' => $canIngestRock,
            'validRockDepths' => $validRockDepths,
            'canSkip' => $canSkip,
            'facedownCount' => count($facedownIds),
            'facedownIds' => $facedownIds,
            'takeableFaceupIds' => $takeableFaceupIds,
        ];
    }

    #[PossibleAction]
    public function actFlipTile(#[IntParam(min: 1)] int $tileId, int $activePlayerId): string
    {
        $currentDepth = (int) $this->globals->get('currentDepth', 1);
        $tile = $this->game->getTile($tileId);

        if (!$tile) {
            throw new UserException(clienttranslate('Tile not found'));
        }
        if ($tile->location !== OceanTileLocation::OCEAN || $tile->depth !== $currentDepth || $tile->isFaceup) {
            throw new UserException(clienttranslate('This tile cannot be flipped at the current depth'));
        }

        // Reveal tile
        $this->game->tileManager->flipTile($tile);
        $revealedTile = $tile;

        $facedownRemaining = $this->game->getFacedownTilesCount($currentDepth);

        $this->notify->all('tileFlipped', clienttranslate('${player_name} flips a tile at Depth ${depth}: ${tile_desc}'), [
            'player_id' => $activePlayerId,
            'player_name' => $this->game->getPlayerNameById($activePlayerId),
            'depth' => $currentDepth,
            'tile' => $revealedTile->toArray(),
            'tile_desc' => $this->getTileDescription($revealedTile),
            'facedownRemaining' => $facedownRemaining,
        ]);

        // Check if game end triggered
        $gameEndTriggered = (bool) $this->globals->get('gameEndTriggered', false);
        if ($facedownRemaining === 0 && !$gameEndTriggered) {
            $this->globals->set('gameEndTriggered', true);
            $this->globals->set('gameEndDepth', $currentDepth);
            $this->tableStats->set('game_end_depth', $currentDepth);
            $this->notify->all('gameEndTriggered', clienttranslate('Depth ${depth} has been exhausted! Game end is triggered; all players may now freely bypass this depth, and a Last Dive will begin when turn order reaches the Start Player.'), [
                'depth' => $currentDepth,
            ]);
        }

        // Handle category
        $category = $revealedTile->category;

        if ($category === OceanTileCategory::OPEN_WATER) {
            $nextDepth = $currentDepth + 1;
            $this->globals->set('currentDepth', $nextDepth);
            $this->notify->all('penguinMovedDepth', clienttranslate('${player_name} dives to Depth ${depth} via Open Water!'), [
                'player_id' => $activePlayerId,
                'player_name' => $this->game->getPlayerNameById($activePlayerId),
                'depth' => $nextDepth,
                'fromDepth' => $currentDepth,
                'toDepth' => $nextDepth,
            ]);

            if ($nextDepth <= 5) {
                return PlayerDiveStep::class;
            } else {
                return NextPlayer::class;
            }
        } elseif ($category === OceanTileCategory::FOOD || $category === OceanTileCategory::ROCK) {
            if ($currentDepth === 5) {
                // Auto-collect at depth 5
                $collected = $this->game->collectTileForPlayer($tileId, $activePlayerId);
                $this->notify->all('tileCollected', clienttranslate('${player_name} resurfaces from Depth 5 with ${tile_desc}!'), [
                    'player_id' => $activePlayerId,
                    'player_name' => $this->game->getPlayerNameById($activePlayerId),
                    'tile' => [
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
            } else {
                $this->globals->set('flippedTileId', $tileId);
                return ConfirmFlipOrDive::class;
            }
        } elseif ($category === OceanTileCategory::PREDATOR) {
            $this->playerStats->inc('predators_hit', 1, $activePlayerId);
            $trappedTotal = $this->game->trapPenguin($activePlayerId, $tileId);

            $this->notify->all('predatorTrapped', clienttranslate('${player_name} encountered a Predator at Depth ${depth}! A penguin is trapped! (${trappedTotal}/3 trapped)'), [
                'player_id' => $activePlayerId,
                'player_name' => $this->game->getPlayerNameById($activePlayerId),
                'tileId' => $tileId,
                'depth' => $currentDepth,
                'trappedTotal' => $trappedTotal,
            ]);

            if ($trappedTotal >= 3) {
                // 3rd Penguin Retreat!
                // Identify eligible faceup tiles across depths of trapped penguins
                $trappedPenguins = $this->game->getTrappedPenguins($activePlayerId);
                $trappedDepths = array_unique(array_map(fn($p) => (int) $p['depth'], $trappedPenguins));

                $eligibleTiles = $this->game->tileManager->getEligibleRetreatTiles(array_values($trappedDepths));

                if (!empty($eligibleTiles)) {
                    return RetreatPickTile::class;
                } else {
                    // Empty-handed retreat
                    $this->game->freeTrappedPenguins($activePlayerId);
                    $this->playerStats->inc('retreats_triggered', 1, $activePlayerId);
                    $this->notify->all('penguinRetreat', clienttranslate('${player_name} retreats all 3 penguins back to the surface empty-handed!'), [
                        'player_id' => $activePlayerId,
                        'player_name' => $this->game->getPlayerNameById($activePlayerId),
                        'rescuedTile' => null,
                    ]);
                    return NextPlayer::class;
                }
            } else {
                return NextPlayer::class;
            }
        }

        return NextPlayer::class;
    }

    #[PossibleAction]
    public function actTakeFaceup(#[IntParam(min: 1)] int $tileId, int $activePlayerId): string
    {
        $currentDepth = (int) $this->globals->get('currentDepth', 1);
        $tile = $this->game->getTile($tileId);

        if (!$tile) {
            throw new UserException(clienttranslate('Tile not found'));
        }
        if ($tile->location !== OceanTileLocation::OCEAN || $tile->depth !== $currentDepth || !$tile->isFaceup) {
            throw new UserException(clienttranslate('This tile cannot be taken'));
        }
        if (!in_array($tile->category, [OceanTileCategory::FOOD, OceanTileCategory::ROCK])) {
            throw new UserException(clienttranslate('Only Food or Rock tiles can be taken'));
        }

        $collected = $this->game->collectTileForPlayer($tileId, $activePlayerId);

        $this->notify->all('tileCollected', clienttranslate('${player_name} resurfaces taking a faceup ${tile_desc} from Depth ${depth}!'), [
            'player_id' => $activePlayerId,
            'player_name' => $this->game->getPlayerNameById($activePlayerId),
            'tile' => [
                'id' => $collected->id,
                'depth' => $collected->depth,
                'category' => $collected->category,
                'foodColor' => $collected->foodColor,
                'points' => $collected->points,
                'rowIndex' => $collected->rowIndex,
            ],
            'tile_desc' => $this->getTileDescription($collected),
            'depth' => $currentDepth,
        ]);

        return NextPlayer::class;
    }

    #[PossibleAction]
    public function actSkipDepth(int $activePlayerId): string
    {
        $currentDepth = (int) $this->globals->get('currentDepth', 1);

        if (!$this->game->canPlayerSkipDepth($activePlayerId, $currentDepth)) {
            throw new UserException(clienttranslate('You cannot skip this depth'));
        }

        $nextDepth = $currentDepth + 1;
        $this->globals->set('currentDepth', $nextDepth);

        $this->notify->all('penguinMovedDepth', clienttranslate('${player_name} skips Depth ${fromDepth} and dives to Depth ${toDepth}!'), [
            'player_id' => $activePlayerId,
            'player_name' => $this->game->getPlayerNameById($activePlayerId),
            'fromDepth' => $currentDepth,
            'toDepth' => $nextDepth,
        ]);

        return PlayerDiveStep::class;
    }

    #[PossibleAction]
    public function actIngestRock(#[IntParam(min: 1, max: 5)] int $targetDepth, int $activePlayerId): string
    {
        $currentDepth = (int) $this->globals->get('currentDepth', 1);
        $usedRock = (bool) $this->globals->get('usedRockThisTurn', false);
        $rockCount = $this->game->getPlayerRockCount($activePlayerId);

        if ($currentDepth !== 1 || $usedRock || $rockCount <= 0) {
            throw new UserException(clienttranslate('You cannot ingest a Rock Tile at this time'));
        }

        // Discard 1 rock
        $rockTile = $this->game->tileManager->getPlayerRockTile($activePlayerId);
        if (!$rockTile) {
            throw new UserException(clienttranslate('No rock available'));
        }

        $this->game->tileManager->moveTileToBox($rockTile);
        $this->playerStats->inc('rocks_used', 1, $activePlayerId);
        $this->globals->set('usedRockThisTurn', true);
        $this->globals->set('currentDepth', $targetDepth);

        $this->notify->all('rockIngested', clienttranslate('${player_name} ingests a Rock Tile to plunge straight down to Depth ${targetDepth}!'), [
            'player_id' => $activePlayerId,
            'player_name' => $this->game->getPlayerNameById($activePlayerId),
            'rockTileId' => (int) $rockTile->id,
            'targetDepth' => $targetDepth,
        ]);

        return PlayerDiveStep::class;
    }

    public function zombie(int $playerId): string
    {
        $args = $this->getArgs();
        if (!empty($args['takeableFaceupIds'])) {
            return $this->actTakeFaceup($args['takeableFaceupIds'][0], $playerId);
        }
        if (!empty($args['facedownIds'])) {
            return $this->actFlipTile($args['facedownIds'][0], $playerId);
        }
        if ($args['canSkip']) {
            return $this->actSkipDepth($playerId);
        }
        return NextPlayer::class;
    }

    private function getTileDescription(OceanTile $tile): string
    {
        return match ($tile->category) {
            OceanTileCategory::OPEN_WATER => clienttranslate('Open Water'),
            OceanTileCategory::ROCK => clienttranslate('Rock'),
            OceanTileCategory::PREDATOR => clienttranslate('Predator'),
            OceanTileCategory::FOOD => sprintf(
                clienttranslate('%s Food (%d pts)'),
                ucfirst((string) $tile->foodColor),
                (int) $tile->points
            ),
            default => clienttranslate('Tile'),
        };
    }
}
