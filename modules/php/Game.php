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
use Bga\Games\DeepDiveFG\OceanTiles\OceanTile;
use Bga\Games\DeepDiveFG\OceanTiles\OceanTileManager;

class Game extends \Bga\GameFramework\Table
{
    public const CATEGORY_OPEN_WATER = 'open_water';
    public const CATEGORY_ROCK = 'rock';
    public const CATEGORY_FOOD = 'food';
    public const CATEGORY_PREDATOR = 'predator';

    public const COLOR_PINK = 'pink';
    public const COLOR_GREEN = 'green';
    public const COLOR_YELLOW = 'yellow';

    /** Single owner of all `ocean_tile` access (see OceanTileManager). */
    public OceanTileManager $tileManager;

    public function __construct()
    {
        parent::__construct();
        $this->tileManager = new OceanTileManager($this);
    }

    public function getGameProgression(): int
    {
        $facedownRemaining = $this->tileManager->getTotalFacedownCount();
        // Exact active-tile count recorded at setup (79..145 by player count).
        $totalInitial = (int) $this->globals->get('totalOceanTiles', 120);
        if ($totalInitial <= 0) {
            return 0;
        }
        $progression = (int) round((1 - ($facedownRemaining / $totalInitial)) * 100);
        return min(100, max(0, $progression));
    }

    public function upgradeTableDb($from_version)
    {
        // The `ocean_tile` table is created by ItemManager::initDb() from the
        // OceanTile class, so new fields are added via
        // $this->tileManager->items->upgradeTableDbAddColumns([...]).
        // NOTE: tables created before this migration used the old raw-SQL
        // schema (tile_id / food_color / ...) and a separate
        // `trapped_penguin` table; they are not migrated in place — a
        // pre-release table must be recreated (Express Stop + new table).
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

        // Create the `ocean_tile` table, then the 160 Ocean Tiles
        $this->tileManager->initDb();
        $totalOceanTiles = $this->generateOceanTiles($playerCount);
        $this->globals->set('totalOceanTiles', $totalOceanTiles);

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
     * Returns the number of tiles left in the ocean (the active tiles).
     */
    private function generateOceanTiles(int $playerCount): int
    {
        $rows = [];

        // Definition of the 160 tiles
        // Depth 1 (44 tiles: 6 Open Water, 8 Rock, 24 Food [1-2 pts], 6 Predator)
        // 30 Main, 14 Extra
        $this->addTilesToDefinition($rows, 1, self::CATEGORY_OPEN_WATER, null, 0, main: 4, extra: 2);
        $this->addTilesToDefinition($rows, 1, self::CATEGORY_ROCK, null, 0, main: 6, extra: 2);
        $this->addFoodTilesToDefinition($rows, 1, [1, 2], mainPerColor: 5, extraPerColor: 3); // 15 main food, 9 extra food = 24
        $this->addTilesToDefinition($rows, 1, self::CATEGORY_PREDATOR, null, 0, main: 5, extra: 1); // 6 predator (total 30 main, 14 extra = 44)

        // Depth 2 (40 tiles: 4 Open Water, 7 Rock, 21 Food [2-4 pts], 8 Predator)
        // 28 Main, 12 Extra
        $this->addTilesToDefinition($rows, 2, self::CATEGORY_OPEN_WATER, null, 0, main: 3, extra: 1);
        $this->addTilesToDefinition($rows, 2, self::CATEGORY_ROCK, null, 0, main: 5, extra: 2);
        $this->addFoodTilesToDefinition($rows, 2, [2, 3, 4], mainPerColor: 5, extraPerColor: 2); // 15 main food, 6 extra food = 21
        $this->addTilesToDefinition($rows, 2, self::CATEGORY_PREDATOR, null, 0, main: 5, extra: 3); // 8 predator (total 28 main, 12 extra = 40)

        // Depth 3 (30 tiles: 7 Open Water, 0 Rock, 15 Food [3-5 pts], 8 Predator)
        // 22 Main, 8 Extra
        $this->addTilesToDefinition($rows, 3, self::CATEGORY_OPEN_WATER, null, 0, main: 5, extra: 2);
        $this->addFoodTilesToDefinition($rows, 3, [3, 4, 5], mainPerColor: 4, extraPerColor: 1); // 12 main food, 3 extra food = 15
        $this->addTilesToDefinition($rows, 3, self::CATEGORY_PREDATOR, null, 0, main: 5, extra: 3); // 8 predator (total 22 main, 8 extra = 30)

        // Depth 4 (23 tiles: 3 Open Water, 0 Rock, 12 Food [5-7 pts], 8 Predator)
        // 17 Main, 6 Extra
        $this->addTilesToDefinition($rows, 4, self::CATEGORY_OPEN_WATER, null, 0, main: 2, extra: 1);
        $this->addFoodTilesToDefinition($rows, 4, [5, 6, 7], mainPerColor: 3, extraPerColor: 1); // 9 main food, 3 extra food = 12
        $this->addTilesToDefinition($rows, 4, self::CATEGORY_PREDATOR, null, 0, main: 6, extra: 2); // 8 predator (total 17 main, 6 extra = 23)

        // Depth 5 (23 tiles: 0 Open Water, 0 Rock, 12 Food [8-10 pts], 11 Predator)
        // 17 Main, 6 Extra
        $this->addFoodTilesToDefinition($rows, 5, [8, 9, 10], mainPerColor: 3, extraPerColor: 1); // 9 main food, 3 extra food = 12
        $this->addTilesToDefinition($rows, 5, self::CATEGORY_PREDATOR, null, 0, main: 8, extra: 3); // 11 predator (total 17 main, 6 extra = 23)

        $this->tileManager->createTiles($rows);

        // Adjust for player count:
        // 1-3 players: Extra tiles are removed to 'box'
        if ($playerCount <= 3) {
            $extraTiles = array_values(array_filter(
                $this->tileManager->items->getAllItems()->values(),
                fn(OceanTile $t) => $t->isExtra,
            ));
            $this->tileManager->items->moveItems($extraTiles, OceanTile::LOCATION_BOX);
        }

        // Remove random tiles per depth based on player count.
        // ItemManager::shuffle() randomises the draw order in each depth,
        // so the first N tiles in that order are a random sample.
        $removalCount = match ($playerCount) {
            1, 2 => 7,
            3 => 3,
            4 => 5,
            5 => 4,
            6 => 3,
            default => 3,
        };

        $totalOceanTiles = 0;
        for ($d = 1; $d <= 5; $d++) {
            $this->tileManager->shuffleDepth($d);
            $tilesAtDepth = $this->tileManager->getOceanTilesAtDepth($d);
            $toRemove = array_slice($tilesAtDepth, 0, $removalCount);
            if (!empty($toRemove)) {
                $this->tileManager->items->moveItems($toRemove, OceanTile::LOCATION_BOX);
            }
            $totalOceanTiles += $this->tileManager->countOceanTilesAtDepth($d);
        }

        return $totalOceanTiles;
    }

    private function addTilesToDefinition(array &$rows, int $depth, string $category, ?string $foodColor, int $points, int $main, int $extra): void
    {
        for ($i = 0; $i < $main; $i++) {
            $rows[] = $this->tileRow($depth, $category, $foodColor, $points, false);
        }
        for ($i = 0; $i < $extra; $i++) {
            $rows[] = $this->tileRow($depth, $category, $foodColor, $points, true);
        }
    }

    private function addFoodTilesToDefinition(array &$rows, int $depth, array $possiblePoints, int $mainPerColor, int $extraPerColor): void
    {
        $colors = [self::COLOR_PINK, self::COLOR_GREEN, self::COLOR_YELLOW];
        foreach ($colors as $color) {
            for ($i = 0; $i < $mainPerColor; $i++) {
                $pt = $possiblePoints[$i % count($possiblePoints)];
                $rows[] = $this->tileRow($depth, self::CATEGORY_FOOD, $color, $pt, false);
            }
            for ($i = 0; $i < $extraPerColor; $i++) {
                $pt = $possiblePoints[($mainPerColor + $i) % count($possiblePoints)];
                $rows[] = $this->tileRow($depth, self::CATEGORY_FOOD, $color, $pt, true);
            }
        }
    }

    /** One createItems() row for a tile still facedown in the ocean. */
    private function tileRow(int $depth, string $category, ?string $foodColor, int $points, bool $isExtra): array
    {
        return [
            'location' => OceanTile::LOCATION_OCEAN,
            'locationArg' => $depth,
            'depth' => $depth,
            'category' => $category,
            'foodColor' => $foodColor,
            'points' => $points,
            'isExtra' => $isExtra,
            'isFaceup' => false,
            'trappedPlayerId' => null,
            'rowIndex' => null,
        ];
    }

    /**
     * Tile helpers — thin wrappers over OceanTileManager, so state classes
     * never touch the tile table directly.
     */

    public function getTile(int $tileId): ?OceanTile
    {
        return $this->tileManager->getTile($tileId);
    }

    public function getFacedownTilesCount(int $depth): int
    {
        return $this->tileManager->getFacedownCountAtDepth($depth);
    }

    /** @return OceanTile[] */
    public function getFaceupTilesAtDepth(int $depth): array
    {
        return $this->tileManager->getFaceupTilesAtDepth($depth);
    }

    /** @return array<int, array{id: int, playerId: int, tileId: int, depth: int}> */
    public function getTrappedPenguins(?int $playerId = null): array
    {
        return $this->tileManager->getTrappedPenguins($playerId);
    }

    public function trapPenguin(int $playerId, int $tileId): int
    {
        return $this->tileManager->trapPenguin($playerId, $tileId);
    }

    public function freeTrappedPenguins(int $playerId): void
    {
        $this->tileManager->freeTrappedPenguins($playerId);
    }

    public function getPlayerRockCount(int $playerId): int
    {
        return $this->tileManager->getPlayerRockCount($playerId);
    }

    public function canPlayerSkipDepth(int $playerId, int $depth): bool
    {
        if ($depth >= 5) {
            return false;
        }

        // Check if player has trapped penguin at this depth
        if ($this->tileManager->countTrappedPenguins($playerId, $depth) > 0) {
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

    public function collectTileForPlayer(int $tileId, int $playerId): OceanTile
    {
        $tile = $this->getTile($tileId);
        if (!$tile) {
            throw new \BgaVisibleSystemException("Tile not found: {$tileId}");
        }

        if ($tile->category === self::CATEGORY_ROCK) {
            $tile->isFaceup = true;
            $this->tileManager->moveTileToPlayerLocation($tile, OceanTile::LOCATION_ROCK, $playerId);
            $this->tileManager->items->updateItem($tile, ['isFaceup']);
            $this->playerStats->inc('rocks_collected', 1, $playerId);
        } elseif ($tile->category === self::CATEGORY_FOOD) {
            // Determine next rowIndex for this food color
            $foodColor = $tile->foodColor;
            $existingCount = $this->tileManager->countPlayerTiles($playerId, OceanTile::LOCATION_TABLEAU, self::CATEGORY_FOOD, $foodColor);
            $tile->rowIndex = $existingCount + 1;
            $tile->isFaceup = true;
            $this->tileManager->moveTileToPlayerLocation($tile, OceanTile::LOCATION_TABLEAU, $playerId);
            $this->tileManager->items->updateItem($tile, ['rowIndex', 'isFaceup']);
            $this->updatePlayerScores();
        }

        return $tile;
    }

    public function computePlayerScore(int $playerId): array
    {
        $rows = [];
        foreach ($this->tileManager->getPlayerFoodTiles($playerId) as $tile) {
            $r = (int) $tile->rowIndex;
            if (!isset($rows[$r])) {
                $rows[$r] = ['tiles' => [], 'sum' => 0];
            }
            $rows[$r]['tiles'][] = $tile->toTableauArray();
            $rows[$r]['sum'] += (int) $tile->points;
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

        // Players basic info & counters (framework `player` table, as in the
        // BGA template — not a game table, so it stays a direct read).
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

            $depthTiles = [];
            foreach ($this->tileManager->getOceanTilesAtDepth($d) as $tile) {
                // Facedown tiles are anonymised: id + depth only.
                $depthTiles[] = $tile->isFaceup ? $tile->toArray() : $tile->toFacedownArray();
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
            $foodTiles = array_map(
                fn(OceanTile $t) => $t->toTableauArray(),
                $this->tileManager->getPlayerFoodTiles($playerId),
            );
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
