<?php
/**
 *------
 * BGA framework: Gregory Isabelli & Emmanuel Colin & BoardGameArena
 * DeepDiveFG implementation : © Flatout Games / BGA Studio
 *
 * OceanTileLocation.php
 * The location names an OceanTile can live in (the first LOCATION
 * field of the `ocean_tile` table). The locationArg meaning depends
 * on the location:
 *   'ocean'   — still in the ocean; locationArg is the depth (1..5)
 *   'box'     — removed from play at setup, or a spent Rock Tile; locationArg is null
 *   'tableau' — collected Food / Open Water in a player's tableau; locationArg is the player id
 *   'rock'    — collected Rock Tile in a player's rock reserve; locationArg is the player id
 * -----
 */
declare(strict_types=1);

namespace Bga\Games\DeepDiveFG\OceanTiles;

final class OceanTileLocation
{
    public const OCEAN = 'ocean';
    public const BOX = 'box';
    public const TABLEAU = 'tableau';
    public const ROCK = 'rock';
}
