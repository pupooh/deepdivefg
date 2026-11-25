<?php
/**
 *------
 * BGA framework: Gregory Isabelli & Emmanuel Colin & BoardGameArena
 * DeepDiveFG implementation : © Flatout Games / BGA Studio
 *
 * OceanTile.php
 * Typed ItemManager item for one Deep Dive ocean tile.
 *
 * Locations (first LOCATION field):
 *   'ocean'   — still in the ocean; locationArg is the depth (1..5)
 *   'box'     — removed from play at setup, or a spent Rock Tile; locationArg is null
 *   'tableau' — collected Food / Open Water in a player's tableau; locationArg is the player id
 *   'rock'    — collected Rock Tile in a player's rock reserve; locationArg is the player id
 *
 * A trapped Penguin is not a separate table any more: the Predator tile
 * that trapped it carries the trapping player's id in $trappedPlayerId.
 * The table itself is created by ItemManager::initDb() — do NOT declare
 * `ocean_tile` in dbmodel.sql.
 * -----
 */
declare(strict_types=1);

namespace Bga\Games\DeepDiveFG\OceanTiles;

use Bga\GameFramework\Components\ItemManager\Item;
use Bga\GameFramework\Components\ItemManager\ItemField;
use Bga\GameFramework\Components\ItemManager\ItemFieldKind;

#[Item(tableName: 'ocean_tile')]
class OceanTile
{
    public const LOCATION_OCEAN = 'ocean';
    public const LOCATION_BOX = 'box';
    public const LOCATION_TABLEAU = 'tableau';
    public const LOCATION_ROCK = 'rock';

    #[ItemField(kind: ItemFieldKind::ID)]
    public int $id;

    #[ItemField(kind: ItemFieldKind::LOCATION, locationIndex: 0)]
    public string $location;

    // NB: int|null on purpose, NOT int|string|null. ItemManager infers
    // the locationArg storage/validation type from this property type, and
    // a union containing string makes the framework expect string values
    // ("expected string, got int" at game creation). Every locationArg we
    // ever store is an int (depth 1..5, or a player id) or null, so ?int
    // is the exact type — this matches the Hearts tutorial's Card class.
    #[ItemField(kind: ItemFieldKind::LOCATION, locationIndex: 1)]
    public ?int $locationArg = null;

    #[ItemField(kind: ItemFieldKind::ORDER)]
    public int $order = 0;

    #[ItemField]
    public int $depth;

    #[ItemField]
    public string $category;

    #[ItemField]
    public ?string $foodColor = null;

    #[ItemField]
    public int $points = 0;

    #[ItemField]
    public bool $isExtra = false;

    #[ItemField]
    public bool $isFaceup = false;

    /** Player id of the Penguin trapped on this Predator tile, or null. */
    #[ItemField]
    public ?int $trappedPlayerId = null;

    /** 1-based set row in a player's tableau, or null while in the ocean. */
    #[ItemField]
    public ?int $rowIndex = null;

    /**
     * Full public serialisation, as used for faceup ocean tiles in
     * notifications and getAllDatas(). Never call this for a facedown tile.
     */
    public function toArray(): array
    {
        return [
            'id' => $this->id,
            'depth' => $this->depth,
            'category' => $this->category,
            'foodColor' => $this->foodColor,
            'points' => $this->points,
            'isExtra' => $this->isExtra,
            'isFaceup' => $this->isFaceup,
        ];
    }

    /**
     * Facedown tiles must never leak category / colour / points to the
     * client, so they are serialised as id + depth only.
     */
    public function toFacedownArray(): array
    {
        return [
            'id' => $this->id,
            'depth' => $this->depth,
            'isFaceup' => false,
        ];
    }

    /** Serialisation for a tile sitting in a player's tableau. */
    public function toTableauArray(): array
    {
        return [
            'id' => $this->id,
            'depth' => $this->depth,
            'category' => $this->category,
            'foodColor' => $this->foodColor,
            'points' => $this->points,
            'isFaceup' => $this->isFaceup,
            'rowIndex' => $this->rowIndex,
        ];
    }
}
