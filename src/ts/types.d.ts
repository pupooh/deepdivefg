interface OceanTile {
    id: number;
    depth: number;
    category?: 'open_water' | 'rock' | 'food' | 'predator';
    foodColor?: 'pink' | 'green' | 'yellow';
    points?: number;
    isExtra?: boolean;
    isFaceup: boolean;
    rowIndex?: number;
}

interface TrappedPenguin {
    id: number;
    playerId: number;
    tileId: number;
    depth: number;
}

interface DepthData {
    depth: number;
    facedownCount: number;
    tiles: OceanTile[];
}

interface TableauRow {
    tiles: OceanTile[];
    sum: number;
}

interface PlayerTableau {
    foodTiles: OceanTile[];
    rockCount: number;
    trappedPenguinsCount: number;
    availablePenguinsCount: number;
    score: number;
    completedSets: number;
    rows: Record<number, TableauRow>;
}

interface DeepDiveFGPlayer extends Player {
    scoreAux: number;
}

interface DeepDiveFGGamedatas extends Gamedatas<DeepDiveFGPlayer> {
    startPlayerId: number;
    currentDepth: number;
    flippedTileId: number;
    usedRockThisTurn: boolean;
    gameEndTriggered: boolean;
    gameEndDepth: number;
    lastDiveFlipped: boolean;
    isSoloMode: boolean;
    soloAiDepth: number;
    soloAiTurn: boolean;
    depths: Record<number, DepthData>;
    trappedPenguins: TrappedPenguin[];
    tableaus: Record<number, PlayerTableau>;
}

/*
 * State args types
 */
interface PlayerDiveStepArgs {
    currentDepth: number;
    canIngestRock: boolean;
    validRockDepths: number[];
    canSkip: boolean;
    facedownCount: number;
    facedownIds: number[];
    takeableFaceupIds: number[];
}

interface ConfirmFlipOrDiveArgs {
    currentDepth: number;
    nextDepth: number;
    flippedTile: OceanTile | null;
}

interface RetreatPickTileArgs {
    trappedDepths: number[];
    eligibleTileIds: number[];
    eligibleTiles: OceanTile[];
}

interface SoloChooseTiebreakArgs {
    candidateTileIds: number[];
    candidateTiles: OceanTile[];
}

/*
 * Notification payload types
 */
interface NotifTileFlipped {
    player_id: number;
    player_name: string;
    depth: number;
    tile: OceanTile;
    tile_desc: string;
    facedownRemaining: number;
}

interface NotifTileCollected {
    player_id: number;
    player_name: string;
    tile: OceanTile;
    tile_desc: string;
    depth?: number;
}

interface NotifPenguinMovedDepth {
    player_id: number;
    player_name: string;
    fromDepth: number;
    toDepth: number;
    tile_desc?: string;
}

interface NotifPredatorTrapped {
    player_id: number;
    player_name: string;
    tileId: number;
    depth: number;
    trappedTotal: number;
}

interface NotifPenguinRetreat {
    player_id: number;
    player_name: string;
    rescuedTile: OceanTile | null;
    tile_desc?: string;
}

interface NotifRockIngested {
    player_id: number;
    player_name: string;
    rockTileId: number;
    targetDepth: number;
}

interface NotifGameEndTriggered {
    depth: number;
}

interface NotifLastDiveFlipped {
    startPlayerId: number;
}
