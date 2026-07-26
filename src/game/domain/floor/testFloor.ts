/**
 * Фиксированный тестовый этаж: чистые данные без Phaser и DOM.
 * Планировка задана литеральными прямоугольниками, без случайных чисел.
 */

export const TILE_SIZE = 32;
export const FLOOR_COLUMNS = 50;
export const FLOOR_ROWS = 34;

export enum CellType {
  Wall,
  Floor,
  SafeFloor,
  ExitDoor,
}

export interface GridRect {
  col: number;
  row: number;
  cols: number;
  rows: number;
}

export interface TilePoint {
  col: number;
  row: number;
}

export interface TestFloorData {
  /** grid[row][col] */
  grid: CellType[][];
  playerStartTile: TilePoint;
  safeRoom: GridRect;
  exitDoorTiles: TilePoint[];
}

const SAFE_ROOM: GridRect = { col: 2, row: 12, cols: 7, rows: 9 };

/** Обычные комнаты, кроме стартовой безопасной. */
const ROOMS: GridRect[] = [
  { col: 15, row: 11, cols: 8, rows: 11 },
  { col: 14, row: 1, cols: 11, rows: 5 },
  { col: 29, row: 10, cols: 9, rows: 13 },
  { col: 44, row: 11, cols: 5, rows: 11 },
];

/** Короткие коридоры шириной две клетки. */
const CORRIDORS: GridRect[] = [
  { col: 9, row: 15, cols: 6, rows: 2 },
  { col: 18, row: 6, cols: 2, rows: 5 },
  { col: 23, row: 15, cols: 6, rows: 2 },
  { col: 38, row: 15, cols: 6, rows: 2 },
];

const EXIT_DOOR_TILES: TilePoint[] = [
  { col: 49, row: 15 },
  { col: 49, row: 16 },
];

const PLAYER_START_TILE: TilePoint = { col: 5, row: 16 };

function carve(grid: CellType[][], rect: GridRect, cell: CellType): void {
  for (let row = rect.row; row < rect.row + rect.rows; row++) {
    for (let col = rect.col; col < rect.col + rect.cols; col++) {
      grid[row][col] = cell;
    }
  }
}

export function createTestFloor(): TestFloorData {
  const grid: CellType[][] = [];
  for (let row = 0; row < FLOOR_ROWS; row++) {
    grid.push(new Array<CellType>(FLOOR_COLUMNS).fill(CellType.Wall));
  }

  carve(grid, SAFE_ROOM, CellType.SafeFloor);

  for (const room of ROOMS) {
    carve(grid, room, CellType.Floor);
  }
  for (const corridor of CORRIDORS) {
    carve(grid, corridor, CellType.Floor);
  }
  for (const tile of EXIT_DOOR_TILES) {
    grid[tile.row][tile.col] = CellType.ExitDoor;
  }

  return {
    grid,
    playerStartTile: PLAYER_START_TILE,
    safeRoom: SAFE_ROOM,
    exitDoorTiles: EXIT_DOOR_TILES,
  };
}
