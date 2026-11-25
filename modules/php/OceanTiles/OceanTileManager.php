<?php
/**
 *------
 * BGA framework: Gregory Isabelli & Emmanuel Colin & BoardGameArena
 * DeepDiveFG implementation : © Flatout Games / BGA Studio
 *
 * OceanTileManager.php
 * The single owner of all `ocean_tile` access (BGA DB-model rule:
 * "Create a Manager class for each table. Only this class should
 * execute SQL for that table"). Everything else in the game talks to
 * tiles through this class and the ItemManager — no raw SQL on
 * `ocean_tile` anywhere else, and no `trapped_penguin` table at all:
 * a trapped Penguin lives on its Predator tile (OceanTile::$trappedPlayerId).
 * -----
 */
declare(strict_types=1);

namespace Bga\Games\DeepDiveFG\OceanTiles;

use Bga\GameFramework\Components\ItemManager\ItemLocation;
use Bga\GameFramework\Components\ItemManager\ItemManager;
use Bga\Games\DeepDiveFG\Game;

class OceanTileManager
{
    /** @var ItemManager<OceanTile> */
    public ItemManager $items;

    public function __construct(
        protected Game $game,
    ) {
        $this->items = $game->bga->itemManagerFactory->createItemManager(
            OceanTile::class,
            locations: [
                new ItemLocation(OceanTileLocation::LOCATION_OCEAN),
                new ItemLocation(OceanTileLocation::LOCATION_BOX),
                new ItemLocation(OceanTileLocation::LOCATION_TABLEAU),
                new ItemLocation(OceanTileLocation::LOCATION_ROCK),
            ],
        );
    }

    /** Create the `ocean_tile` table from the OceanTile item class. */
    public function initDb(): void
    {
        $this->items->initDb();
    }

    /** Create tiles from createItems() rows (keys are OceanTile property names). */
    public function createTiles(array $rows): void
    {
        $this->items->createItems($rows);
    }

    public function shuffleDepth(int $depth): void
    {
        $this->items->shuffle([OceanTileLocation::LOCATION_OCEAN, $depth]);
    }

    public function getTile(int $tileId): ?OceanTile
    {
        /** @var OceanTile|null */
        return $this->items->getItemById($tileId);
    }

    /** @return OceanTile[] keyed by tile id, in the given id order where possible. */
    public function getTilesByIds(array $ids): array
    {
        if (empty($ids)) {
            return [];
        }
        return $this->items->getItemsByIds(array_map('intval', $ids))->values();
    }

    /** All ocean tiles at a depth, in ItemManager ORDER (the draw order). */
    /** @return OceanTile[] */
    public function getOceanTilesAtDepth(int $depth): array
    {
        return $this->items->getItemsInLocation([OceanTileLocation::LOCATION_OCEAN, $depth])->values();
    }

    /** @return OceanTile[] */
    public function getFacedownTilesAtDepth(int $depth): array
    {
        return array_values(array_filter(
            $this->getOceanTilesAtDepth($depth),
            fn(OceanTile $t) => !$t->isFaceup,
        ));
    }

    public function getFacedownCountAtDepth(int $depth): int
    {
        return count($this->getFacedownTilesAtDepth($depth));
    }

    public function getTotalFacedownCount(): int
    {
        $total = 0;
        for ($d = 1; $d <= 5; $d++) {
            $total += $this->getFacedownCountAtDepth($d);
        }
        return $total;
    }

    public function countOceanTilesAtDepth(int $depth): int
    {
        return $this->items->countItemsInLocation([OceanTileLocation::LOCATION_OCEAN, $depth]);
    }

    /** @return OceanTile[] */
    public function getFaceupTilesAtDepth(int $depth): array
    {
        return array_values(array_filter(
            $this->getOceanTilesAtDepth($depth),
            fn(OceanTile $t) => $t->isFaceup,
        ));
    }

    /** Faceup Food / Rock tiles at a depth (the tiles a player may take). */
    /** @return OceanTile[] */
    public function getTakeableTilesAtDepth(int $depth): array
    {
        return array_values(array_filter(
            $this->getFaceupTilesAtDepth($depth),
            fn(OceanTile $t) => in_array($t->category, [Game::CATEGORY_FOOD, Game::CATEGORY_ROCK], true),
        ));
    }

    /**
     * Faceup Food / Rock tiles across several depths — the rescue
     * candidates when a player's 3rd Penguin is trapped.
     *
     * @param int[] $depths
     * @return OceanTile[]
     */
    public function getEligibleRetreatTiles(array $depths): array
    {
        $tiles = [];
        foreach ($depths as $depth) {
            foreach ($this->getTakeableTilesAtDepth((int) $depth) as $tile) {
                $tiles[] = $tile;
            }
        }
        usort($tiles, fn(OceanTile $a, OceanTile $b) => [$a->depth, -$a->points] <=> [$b->depth, -$b->points]);
        return $tiles;
    }

    /** @return OceanTile[] */
    public function getPlayerTiles(int $playerId, string $location): array
    {
        return $this->items->getItemsInLocation([$location, $playerId])->values();
    }

    public function getPlayerRockCount(int $playerId): int
    {
        return $this->items->countItemsInLocation([OceanTileLocation::LOCATION_ROCK, $playerId]);
    }

    public function getPlayerRockTile(int $playerId): ?OceanTile
    {
        return $this->items->getItemsInLocation([OceanTileLocation::LOCATION_ROCK, $playerId])->first();
    }

    /**
     * Count a player's tiles in a location, optionally filtered by
     * category and/or food colour.
     */
    public function countPlayerTiles(int $playerId, string $location, ?string $category = null, ?string $foodColor = null): int
    {
        return count(array_filter(
            $this->getPlayerTiles($playerId, $location),
            fn(OceanTile $t) => ($category === null || $t->category === $category)
                && ($foodColor === null || $t->foodColor === $foodColor),
        ));
    }

    /** Food tiles in a player's tableau, ordered by set row. */
    /** @return OceanTile[] */
    public function getPlayerFoodTiles(int $playerId): array
    {
        $tiles = array_values(array_filter(
            $this->getPlayerTiles($playerId, OceanTileLocation::LOCATION_TABLEAU),
            fn(OceanTile $t) => $t->category === Game::CATEGORY_FOOD,
        ));
        usort($tiles, fn(OceanTile $a, OceanTile $b) => [($a->rowIndex ?? 0), (string) $a->foodColor] <=> [($b->rowIndex ?? 0), (string) $b->foodColor]);
        return $tiles;
    }

    public function sumPlayerFoodPoints(int $playerId): int
    {
        $sum = 0;
        foreach ($this->getPlayerFoodTiles($playerId) as $tile) {
            $sum += $tile->points;
        }
        return $sum;
    }

    // -- Mutations -------------------------------------------------------

    public function flipTile(OceanTile $tile): void
    {
        $tile->isFaceup = true;
        $this->items->updateItem($tile, ['isFaceup']);
    }

    public function moveTileToBox(OceanTile $tile): void
    {
        $tile->trappedPlayerId = null;
        $this->items->moveItem($tile, OceanTileLocation::LOCATION_BOX);
        $this->items->updateItem($tile, ['trappedPlayerId']);
    }

    /** Move a tile into a player's tableau / rock reserve. */
    public function moveTileToPlayerLocation(OceanTile $tile, string $location, int $playerId): void
    {
        $this->items->moveItem($tile, [$location, $playerId]);
    }

    // -- Trapped Penguins -------------------------------------------------
    //
    // A trapped Penguin is the Predator tile itself carrying the trapping
    // player's id. getTrappedPenguins() keeps the old array shape
    // (id / playerId / tileId / depth) so getAllDatas() and the client
    // need no changes.

    /** @return array<int, array{id: int, playerId: int, tileId: int, depth: int}> */
    public function getTrappedPenguins(?int $playerId = null): array
    {
        $trapped = [];
        foreach ($this->items->getAllItems()->values() as $tile) {
            /** @var OceanTile $tile */
            if ($tile->trappedPlayerId === null) {
                continue;
            }
            if ($playerId !== null && $tile->trappedPlayerId !== $playerId) {
                continue;
            }
            $trapped[] = [
                'id' => $tile->id,
                'playerId' => $tile->trappedPlayerId,
                'tileId' => $tile->id,
                'depth' => $tile->depth,
            ];
        }
        return $trapped;
    }

    public function countTrappedPenguins(int $playerId, ?int $depth = null): int
    {
        $count = 0;
        foreach ($this->getTrappedPenguins($playerId) as $tp) {
            if ($depth === null || $tp['depth'] === $depth) {
                $count++;
            }
        }
        return $count;
    }

    /** Trap one Penguin on a Predator tile; returns the player's trapped total. */
    public function trapPenguin(int $playerId, int $tileId): int
    {
        $tile = $this->getTile($tileId);
        if ($tile === null) {
            throw new \BgaVisibleSystemException("Tile not found: {$tileId}");
        }
        $tile->trappedPlayerId = $playerId;
        $this->items->updateItem($tile, ['trappedPlayerId']);
        return $this->countTrappedPenguins($playerId);
    }

    public function freeTrappedPenguins(int $playerId): void
    {
        foreach ($this->getTrappedPenguins($playerId) as $tp) {
            $tile = $this->getTile($tp['tileId']);
            if ($tile !== null) {
                $tile->trappedPlayerId = null;
                $this->items->updateItem($tile, ['trappedPlayerId']);
            }
        }
    }
}
