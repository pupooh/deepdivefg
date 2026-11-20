<?php
/**
 *------
 * BGA framework: Gregory Isabelli & Emmanuel Colin & BoardGameArena
 * DeepDiveFG implementation : © Flatout Games / BGA Studio
 *
 * Game.php
 * Main game logic for Deep Dive
 * -----
 */
declare(strict_types=1);

namespace Bga\Games\DeepDiveFG;

use Bga\GameFramework\StateType;
use Bga\Games\DeepDiveFG\States\StartTurn;
use Bga\Games\DeepDiveFG\States\PlayerDiveStep;
use Bga\Games\DeepDiveFG\States\ConfirmFlipOrDive;
use Bga\Games\DeepDiveFG\States\RetreatPickTile;
use Bga\Games\DeepDiveFG\States\NextPlayer;
use Bga\Games\DeepDiveFG\States\EndScore;

class Game extends \Bga\GameFramework\Table
{
    public const CATEGORY_OPEN_WATER = 'open_water';
    public const CATEGORY_ROCK = 'rock';
    public const CATEGORY_FOOD = 'food';
    public const CATEGORY_PREDATOR = 'predator';

    public const COLOR_PINK = 'pink';
    public const COLOR_GREEN = 'green';
    public const COLOR_YELLOW = 'yellow';

    public function __construct()
    {
        parent::__construct();
    }

    public function getGameProgression(): int
    {
        $facedownRemaining = (int) $this->getUniqueValueFromDB(
            "SELECT COUNT(*) FROM `ocean_tile` WHERE `location` = 'ocean' AND `is_faceup` = 0"
        );
        $totalInitial = 120; // approximate active tiles across all depths
        $progression = (int) round((1 - ($facedownRemaining / $totalInitial)) * 100);
        return min(100, max(0, $progression));
    }

    public function upgradeTableDb($from_version)
    {
    }

    protected function setupNewGame($players, $options = [])
    {
        $gameinfos = $this->getGameinfos();
        $default_colors = $gameinfos['player_colors'];

        $query_values = [];
        foreach ($players as $player_id => $player) {
            $query_values[] = vsprintf("(%s, '%s', '%s')", [
                $player_id,
                array_shift($default_colors),
                addslashes($player["player_name"]),
            ]);
        }

        static::DbQuery(
            sprintf(
                "INSERT INTO `player` (`player_id`, `player_color`, `player_name`) VALUES %s",
                implode(",", $query_values)
            )
        );

        $this->reattributeColorsBasedOnPreferences($players, $gameinfos["player_colors"]);
        $this->reloadPlayersBasicInfos();

        $playerIds = array_keys($players);
        $playerCount = count($playerIds);
        $isSolo = ($playerCount === 1);

        // Initialize Globals
        $startPlayerId = $playerIds[0];
        $this->globals->set('startPlayerId', $startPlayerId);
        $this->globals->set('currentDepth', 1);
        $this->globals->set('flippedTileId', 0);
        $this->globals->set('usedRockThisTurn', false);
        $this->globals->set('gameEndTriggered', false);
        $this->globals->set('gameEndDepth', 0);
        $this->globals->set('lastDiveFlipped', false);
        $this->globals->set('isSoloMode', $isSolo);
        $this->globals->set('soloAiDepth', 1);
        $this->globals->set('soloAiTurn', false);
        $this->globals->set('soloDifficulty', (int) ($options[100] ?? 1));

        // Create the 160 Ocean Tiles
        $this->generateOceanTiles($playerCount);

        // Initialize Statistics
        $this->tableStats->init('turns_number', 0);
        $this->tableStats->init('game_end_depth', 0);

        $this->playerStats->init([
            'turns_number',
            'sets_completed',
            'dives_taken',
            'predators_hit',
            'retreats_triggered',
            'rocks_collected',
            'rocks_used',
            'points_food',
        ], 0);

        // Activate first player
        $this->activeNextPlayer();

        return StartTurn::class;
    }

    /**
     * Generate the 160 Ocean Tiles and adjust according to player count.
     */
    private function generateOceanTiles(int $playerCount): void
    {
        $tiles = [];

        // Definition of the 160 tiles
        // Depth 1 (44 tiles: 6 Open Water, 8 Rock, 24 Food [1-2 pts], 6 Predator)
        // 30 Main, 14 Extra
        $this->addTilesToDefinition($tiles, 1, self::CATEGORY_OPEN_WATER, null, 0, main: 4, extra: 2);
        $this->addTilesToDefinition($tiles, 1, self::CATEGORY_ROCK, null, 0, main: 6, extra: 2);
        $this->addFoodTilesToDefinition($tiles, 1, [1, 2], mainPerColor: 5, extraPerColor: 3); // 15 main food, 9 extra food = 24
        $this->addTilesToDefinition($tiles, 1, self::CATEGORY_PREDATOR, null, 0, main: 5, extra: 1); // 6 predator (total 30 main, 14 extra = 44)

        // Depth 2 (40 tiles: 4 Open Water, 7 Rock, 21 Food [2-4 pts], 8 Predator)
        // 28 Main, 12 Extra
        $this->addTilesToDefinition($tiles, 2, self::CATEGORY_OPEN_WATER, null, 0, main: 3, extra: 1);
        $this->addTilesToDefinition($tiles, 2, self::CATEGORY_ROCK, null, 0, main: 5, extra: 2);
        $this->addFoodTilesToDefinition($tiles, 2, [2, 3, 4], mainPerColor: 5, extraPerColor: 2); // 15 main food, 6 extra food = 21
        $this->addTilesToDefinition($tiles, 2, self::CATEGORY_PREDATOR, null, 0, main: 5, extra: 3); // 8 predator (total 28 main, 12 extra = 40)

        // Depth 3 (30 tiles: 7 Open Water, 0 Rock, 15 Food [3-5 pts], 8 Predator)
        // 22 Main, 8 Extra
        $this->addTilesToDefinition($tiles, 3, self::CATEGORY_OPEN_WATER, null, 0, main: 5, extra: 2);
        $this->addFoodTilesToDefinition($tiles, 3, [3, 4, 5], mainPerColor: 4, extraPerColor: 1); // 12 main food, 3 extra food = 15
        $this->addTilesToDefinition($tiles, 3, self::CATEGORY_PREDATOR, null, 0, main: 5, extra: 3); // 8 predator (total 22 main, 8 extra = 30)

        // Depth 4 (23 tiles: 3 Open Water, 0 Rock, 12 Food [5-7 pts], 8 Predator)
        // 17 Main, 6 Extra
        $this->addTilesToDefinition($tiles, 4, self::CATEGORY_OPEN_WATER, null, 0, main: 2, extra: 1);
        $this->addFoodTilesToDefinition($tiles, 4, [5, 6, 7], mainPerColor: 3, extraPerColor: 1); // 9 main food, 3 extra food = 12
        $this->addTilesToDefinition($tiles, 4, self::CATEGORY_PREDATOR, null, 0, main: 6, extra: 2); // 8 predator (total 17 main, 6 extra = 23)

        // Depth 5 (23 tiles: 0 Open Water, 0 Rock, 12 Food [8-10 pts], 11 Predator)
        // 17 Main, 6 Extra
        $this->addFoodTilesToDefinition($tiles, 5, [8, 9, 10], mainPerColor: 3, extraPerColor: 1); // 9 main food, 3 extra food = 12
        $this->addTilesToDefinition($tiles, 5, self::CATEGORY_PREDATOR, null, 0, main: 8, extra: 3); // 11 predator (total 17 main, 6 extra = 23)

        // Insert all tiles into ocean_tile
        $values = [];
        foreach ($tiles as $t) {
            $foodColorVal = $t['food_color'] ? "'{$t['food_color']}'" : "NULL";
            $values[] = "({$t['depth']}, '{$t['category']}', {$foodColorVal}, {$t['points']}, {$t['is_extra']}, 0, 'ocean', 0)";
        }
        $chunks = array_chunk($values, 50);
        foreach ($chunks as $chunk) {
            static::DbQuery(
                "INSERT INTO `ocean_tile` (`depth`, `category`, `food_color`, `points`, `is_extra`, `is_faceup`, `location`, `tile_order`) VALUES "
                . implode(",", $chunk)
            );
        }

        // Adjust for player count:
        // 1-3 players: Extra tiles are removed to 'box'
        if ($playerCount <= 3) {
            static::DbQuery("UPDATE `ocean_tile` SET `location` = 'box' WHERE `is_extra` = 1");
        }

        // Remove random tiles per depth based on player count
        $removalCount = match ($playerCount) {
            1, 2 => 7,
            3 => 3,
            4 => 5,
            5 => 4,
            6 => 3,
            default => 3,
        };

        for ($d = 1; $d <= 5; $d++) {
            $tilesAtDepth = $this->getCollectionFromDb(
                "SELECT `tile_id` FROM `ocean_tile` WHERE `depth` = {$d} AND `location` = 'ocean'"
            );
            $ids = array_keys($tilesAtDepth);
            shuffle($ids);
            $toRemove = array_slice($ids, 0, $removalCount);
            if (!empty($toRemove)) {
                $removeList = implode(",", $toRemove);
                static::DbQuery("UPDATE `ocean_tile` SET `location` = 'box' WHERE `tile_id` IN ({$removeList})");
            }

            // Assign random tile_order to remaining ocean tiles
            $remainingIds = array_slice($ids, $removalCount);
            shuffle($remainingIds);
            foreach ($remainingIds as $order => $tileId) {
                static::DbQuery("UPDATE `ocean_tile` SET `tile_order` = {$order} WHERE `tile_id` = {$tileId}");
            }
        }
    }

    private function addTilesToDefinition(array &$tiles, int $depth, string $category, ?string $foodColor, int $points, int $main, int $extra): void
    {
        for ($i = 0; $i < $main; $i++) {
            $tiles[] = [
                'depth' => $depth,
                'category' => $category,
                'food_color' => $foodColor,
                'points' => $points,
                'is_extra' => 0,
            ];
        }
        for ($i = 0; $i < $extra; $i++) {
            $tiles[] = [
                'depth' => $depth,
                'category' => $category,
                'food_color' => $foodColor,
                'points' => $points,
                'is_extra' => 1,
            ];
        }
    }

    private function addFoodTilesToDefinition(array &$tiles, int $depth, array $possiblePoints, int $mainPerColor, int $extraPerColor): void
    {
        $colors = [self::COLOR_PINK, self::COLOR_GREEN, self::COLOR_YELLOW];
        foreach ($colors as $color) {
            for ($i = 0; $i < $mainPerColor; $i++) {
                $pt = $possiblePoints[$i % count($possiblePoints)];
                $tiles[] = [
                    'depth' => $depth,
                    'category' => self::CATEGORY_FOOD,
                    'food_color' => $color,
                    'points' => $pt,
                    'is_extra' => 0,
                ];
            }
            for ($i = 0; $i < $extraPerColor; $i++) {
                $pt = $possiblePoints[($mainPerColor + $i) % count($possiblePoints)];
                $tiles[] = [
                    'depth' => $depth,
                    'category' => self::CATEGORY_FOOD,
                    'food_color' => $color,
                    'points' => $pt,
                    'is_extra' => 1,
                ];
            }
        }
    }

    /**
     * Public DB helper methods
     */

    public function getTile(int $tileId): ?array
    {
        return $this->getObjectFromDB("SELECT * FROM `ocean_tile` WHERE `tile_id` = {$tileId}");
    }

    public function getFacedownTilesCount(int $depth): int
    {
        return (int) $this->getUniqueValueFromDB(
            "SELECT COUNT(*) FROM `ocean_tile` WHERE `depth` = {$depth} AND `location` = 'ocean' AND `is_faceup` = 0"
        );
    }

    public function getFaceupTilesAtDepth(int $depth): array
    {
        return array_values($this->getCollectionFromDb(
            "SELECT `tile_id` AS `id`, `depth`, `category`, `food_color` AS `foodColor`, `points`, `is_extra` AS `isExtra`, `is_faceup` AS `isFaceup`
             FROM `ocean_tile`
             WHERE `depth` = {$depth} AND `location` = 'ocean' AND `is_faceup` = 1
             ORDER BY `tile_order` ASC"
        ));
    }

    public function getTrappedPenguins(?int $playerId = null): array
    {
        $sql = "SELECT `id`, `player_id` AS `playerId`, `tile_id` AS `tileId`, `depth` FROM `trapped_penguin`";
        if ($playerId !== null) {
            $sql .= " WHERE `player_id` = {$playerId}";
        }
        return array_values($this->getCollectionFromDb($sql));
    }

    public function trapPenguin(int $playerId, int $tileId, int $depth): int
    {
        static::DbQuery(
            "INSERT INTO `trapped_penguin` (`player_id`, `tile_id`, `depth`) VALUES ({$playerId}, {$tileId}, {$depth})"
        );
        return (int) $this->getUniqueValueFromDB(
            "SELECT COUNT(*) FROM `trapped_penguin` WHERE `player_id` = {$playerId}"
        );
    }

    public function freeTrappedPenguins(int $playerId): void
    {
        static::DbQuery("DELETE FROM `trapped_penguin` WHERE `player_id` = {$playerId}");
    }

    public function getPlayerRockCount(int $playerId): int
    {
        return (int) $this->getUniqueValueFromDB(
            "SELECT COUNT(*) FROM `ocean_tile` WHERE `owner_id` = {$playerId} AND `location` = 'rock'"
        );
    }

    public function canPlayerSkipDepth(int $playerId, int $depth): bool
    {
        if ($depth >= 5) {
            return false;
        }

        // Check if player has trapped penguin at this depth
        $trappedCount = (int) $this->getUniqueValueFromDB(
            "SELECT COUNT(*) FROM `trapped_penguin` WHERE `player_id` = {$playerId} AND `depth` = {$depth}"
        );
        if ($trappedCount > 0) {
            return true;
        }

        // Check if game end triggered and this depth has 0 facedown tiles
        $gameEndTriggered = (bool) $this->globals->get('gameEndTriggered', false);
        if ($gameEndTriggered) {
            $facedownCount = $this->getFacedownTilesCount($depth);
            if ($facedownCount === 0) {
                return true;
            }
        }

        return false;
    }

    public function collectTileForPlayer(int $tileId, int $playerId): array
    {
        $tile = $this->getTile($tileId);
        if (!$tile) {
            throw new \BgaVisibleSystemException("Tile not found: {$tileId}");
        }

        if ($tile['category'] === self::CATEGORY_ROCK) {
            static::DbQuery(
                "UPDATE `ocean_tile` SET `location` = 'rock', `owner_id` = {$playerId}, `is_faceup` = 1 WHERE `tile_id` = {$tileId}"
            );
            $this->playerStats->inc('rocks_collected', 1, $playerId);
        } elseif ($tile['category'] === self::CATEGORY_FOOD) {
            // Determine next rowIndex for this food color
            $foodColor = $tile['food_color'];
            $existingCount = (int) $this->getUniqueValueFromDB(
                "SELECT COUNT(*) FROM `ocean_tile` WHERE `owner_id` = {$playerId} AND `location` = 'tableau' AND `food_color` = '{$foodColor}'"
            );
            $rowIndex = $existingCount + 1;
            static::DbQuery(
                "UPDATE `ocean_tile` SET `location` = 'tableau', `owner_id` = {$playerId}, `row_index` = {$rowIndex}, `is_faceup` = 1 WHERE `tile_id` = {$tileId}"
            );
            $this->updatePlayerScores();
        }

        return $this->getTile($tileId);
    }

    public function computePlayerScore(int $playerId): array
    {
        $foodTiles = $this->getCollectionFromDb(
            "SELECT `tile_id` AS `id`, `food_color` AS `foodColor`, `points`, `row_index` AS `rowIndex`
             FROM `ocean_tile`
             WHERE `owner_id` = {$playerId} AND `location` = 'tableau'
             ORDER BY `row_index` ASC"
        );

        $rows = [];
        foreach ($foodTiles as $t) {
            $r = (int) $t['rowIndex'];
            if (!isset($rows[$r])) {
                $rows[$r] = ['tiles' => [], 'sum' => 0];
            }
            $rows[$r]['tiles'][] = $t;
            $rows[$r]['sum'] += (int) $t['points'];
        }

        $totalScore = 0;
        $completedSets = 0;
        foreach ($rows as $r => $data) {
            if (count($data['tiles']) === 3) {
                $totalScore += $data['sum'];
                $completedSets++;
            } else {
                $totalScore += (int) floor($data['sum'] / 2);
            }
        }

        return [
            'total' => $totalScore,
            'completedSets' => $completedSets,
            'rows' => $rows,
        ];
    }

    public function updatePlayerScores(): void
    {
        $players = $this->loadPlayersBasicInfos();
        foreach (array_keys($players) as $playerId) {
            $scoreData = $this->computePlayerScore((int) $playerId);
            $this->playerScore->set((int) $playerId, $scoreData['total']);
            $this->playerScoreAux->set((int) $playerId, $scoreData['completedSets']);
            $this->playerStats->set('sets_completed', $scoreData['completedSets'], (int) $playerId);
            $this->playerStats->set('points_food', $scoreData['total'], (int) $playerId);
        }
    }

    public function getAllDatas(int $currentPlayerId): array
    {
        $result = [];

        // Players basic info & counters
        $result["players"] = $this->getCollectionFromDb(
            "SELECT `player_id` AS `id`, `player_name` AS `name`, `player_color` AS `color`, `player_score` AS `score`, `player_score_aux` AS `scoreAux` FROM `player`"
        );

        $result['startPlayerId'] = (int) $this->globals->get('startPlayerId');
        $result['currentDepth'] = (int) $this->globals->get('currentDepth', 1);
        $result['flippedTileId'] = (int) $this->globals->get('flippedTileId', 0);
        $result['usedRockThisTurn'] = (bool) $this->globals->get('usedRockThisTurn', false);
        $result['gameEndTriggered'] = (bool) $this->globals->get('gameEndTriggered', false);
        $result['gameEndDepth'] = (int) $this->globals->get('gameEndDepth', 0);
        $result['lastDiveFlipped'] = (bool) $this->globals->get('lastDiveFlipped', false);
        $result['isSoloMode'] = (bool) $this->globals->get('isSoloMode', false);
        $result['soloAiDepth'] = (int) $this->globals->get('soloAiDepth', 1);
        $result['soloAiTurn'] = (bool) $this->globals->get('soloAiTurn', false);

        // Depths (1 to 5)
        $depths = [];
        for ($d = 1; $d <= 5; $d++) {
            $facedownCount = $this->getFacedownTilesCount($d);

            // Get all ocean tiles at this depth ordered by tile_order
            $tilesAtDepth = $this->getCollectionFromDb(
                "SELECT `tile_id` AS `id`, `depth`, `category`, `food_color` AS `foodColor`, `points`, `is_extra` AS `isExtra`, `is_faceup` AS `isFaceup`
                 FROM `ocean_tile`
                 WHERE `depth` = {$d} AND `location` = 'ocean'
                 ORDER BY `tile_order` ASC"
            );

            $depthTiles = [];
            foreach ($tilesAtDepth as $row) {
                $isFaceup = ((int) $row['isFaceup'] === 1);
                if ($isFaceup) {
                    $depthTiles[] = [
                        'id' => (int) $row['id'],
                        'depth' => (int) $row['depth'],
                        'category' => $row['category'],
                        'foodColor' => $row['foodColor'],
                        'points' => (int) $row['points'],
                        'isExtra' => (bool) $row['isExtra'],
                        'isFaceup' => true,
                    ];
                } else {
                    $depthTiles[] = [
                        'id' => (int) $row['id'],
                        'depth' => (int) $row['depth'],
                        'isFaceup' => false,
                    ];
                }
            }

            $depths[$d] = [
                'depth' => $d,
                'facedownCount' => $facedownCount,
                'tiles' => $depthTiles,
            ];
        }
        $result['depths'] = $depths;

        // Trapped Penguins
        $result['trappedPenguins'] = $this->getTrappedPenguins();

        // Player tableaus & rocks
        $tableaus = [];
        foreach (array_keys($result['players']) as $pId) {
            $playerId = (int) $pId;
            $scoreData = $this->computePlayerScore($playerId);
            $foodTiles = array_values($this->getCollectionFromDb(
                "SELECT `tile_id` AS `id`, `depth`, `category`, `food_color` AS `foodColor`, `points`, `row_index` AS `rowIndex`
                 FROM `ocean_tile`
                 WHERE `owner_id` = {$playerId} AND `location` = 'tableau'
                 ORDER BY `row_index` ASC, `food_color` ASC"
            ));
            $rockCount = $this->getPlayerRockCount($playerId);
            $trapped = array_values(array_filter($result['trappedPenguins'], fn($tp) => $tp['playerId'] == $playerId));

            $tableaus[$playerId] = [
                'foodTiles' => $foodTiles,
                'rockCount' => $rockCount,
                'trappedPenguinsCount' => count($trapped),
                'availablePenguinsCount' => max(0, 3 - count($trapped)),
                'score' => $scoreData['total'],
                'completedSets' => $scoreData['completedSets'],
                'rows' => $scoreData['rows'],
            ];
        }
        $result['tableaus'] = $tableaus;

        return $result;
    }
}
