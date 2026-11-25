<?php
/**
 *------
 * BGA framework: Gregory Isabelli & Emmanuel Colin & BoardGameArena
 * DeepDiveFG implementation : © Flatout Games / BGA Studio
 *
 * OceanTileColor.php
 * The food colour of an OceanTile (its `foodColor` field). Only Food
 * tiles have a colour; the other categories have none.
 * -----
 */
declare(strict_types=1);

namespace Bga\Games\DeepDiveFG\OceanTiles;

final class OceanTileColor
{
    public const PINK = 'pink';
    public const GREEN = 'green';
    public const YELLOW = 'yellow';
}
