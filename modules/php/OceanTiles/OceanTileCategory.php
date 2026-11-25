<?php
/**
 *------
 * BGA framework: Gregory Isabelli & Emmanuel Colin & BoardGameArena
 * DeepDiveFG implementation : © Flatout Games / BGA Studio
 *
 * OceanTileCategory.php
 * The category of an OceanTile (its `category` field). Food tiles also
 * carry a colour (OceanTileColor); the other categories have no colour.
 * -----
 */
declare(strict_types=1);

namespace Bga\Games\DeepDiveFG\OceanTiles;

final class OceanTileCategory
{
    public const OPEN_WATER = 'open_water';
    public const ROCK = 'rock';
    public const FOOD = 'food';
    public const PREDATOR = 'predator';
}
