/**
 * Фиксированный тестовый этаж-пещера: чистые данные без Phaser и DOM.
 * Полости и коридоры вырезаются детерминированными функциями от координат,
 * без случайных чисел: одинаковый запуск всегда создаёт одинаковую карту.
 */

import type { KeyColor } from '../progression/KeyState';

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

export interface KeyPlacement {
  color: KeyColor;
  tile: TilePoint;
}

export interface DoorPlacement {
  color: KeyColor;
  /** Смежные клетки твёрдого тела двери. */
  tiles: TilePoint[];
}

export interface ChestPlacement {
  color: KeyColor;
  tile: TilePoint;
}

export interface FloorProgression {
  keys: KeyPlacement[];
  doors: DoorPlacement[];
  chests: ChestPlacement[];
}

export interface TestFloorData {
  /** grid[row][col] */
  grid: CellType[][];
  playerStartTile: TilePoint;
  guardianStartTile: TilePoint;
  /** Ограничивающий прямоугольник безопасной полости (для подписи). */
  safeRoom: GridRect;
  exitDoorTiles: TilePoint[];
  progression: FloorProgression;
}

interface BlobSpec {
  col: number;
  row: number;
  radiusX: number;
  radiusY: number;
  seed: number;
  cell: CellType;
}

const SAFE_BLOB: BlobSpec = { col: 5, row: 16, radiusX: 4, radiusY: 5, seed: 1, cell: CellType.SafeFloor };

const BLOBS: BlobSpec[] = [
  { col: 19, row: 16, radiusX: 5, radiusY: 6, seed: 7, cell: CellType.Floor },
  { col: 19, row: 4, radiusX: 5, radiusY: 3, seed: 3, cell: CellType.Floor },
  { col: 33, row: 16, radiusX: 5, radiusY: 6, seed: 4, cell: CellType.Floor },
  { col: 46, row: 16, radiusX: 3, radiusY: 5, seed: 5, cell: CellType.Floor },
];

/** Коридоры шириной две клетки как ломаные из осевых сегментов. */
const CORRIDORS: TilePoint[][] = [
  // безопасная → центральная
  [
    { col: 7, row: 15 },
    { col: 10, row: 15 },
    { col: 10, row: 17 },
    { col: 15, row: 17 },
  ],
  // центральная → верхняя ветка
  [
    { col: 19, row: 10 },
    { col: 19, row: 6 },
  ],
  // центральная → правая
  [
    { col: 23, row: 15 },
    { col: 26, row: 15 },
    { col: 26, row: 13 },
    { col: 29, row: 13 },
  ],
  // правая → дальняя
  [
    { col: 37, row: 15 },
    { col: 41, row: 15 },
    { col: 41, row: 17 },
    { col: 44, row: 17 },
  ],
];

const EXIT_DOOR_TILES: TilePoint[] = [
  { col: 49, row: 15 },
  { col: 49, row: 16 },
];

const PLAYER_START_TILE: TilePoint = { col: 5, row: 16 };

/** Старт стража — центр центральной полости, вдали от игрока и дверей. */
const GUARDIAN_START_TILE: TilePoint = { col: 19, row: 16 };

/**
 * Первый цикл прогрессии: синий ключ в верхней полости открывает синюю дверь
 * в коридоре центр → право; за ней красный ключ; красный сундук в нише
 * правой полости; красная дверь закрывает выход из дальней полости.
 */
const PROGRESSION: FloorProgression = {
  keys: [
    { color: 'blue', tile: { col: 19, row: 4 } },
    { color: 'red', tile: { col: 34, row: 16 } },
  ],
  doors: [
    {
      color: 'blue',
      tiles: [
        { col: 25, row: 15 },
        { col: 25, row: 16 },
      ],
    },
    { color: 'red', tiles: EXIT_DOOR_TILES },
  ],
  chests: [{ color: 'red', tile: { col: 33, row: 20 } }],
};

/** Амплитуда неровности края полости (в единицах нормализованной дистанции). */
const EDGE_WOBBLE = 0.22;

function carveBlob(grid: CellType[][], blob: BlobSpec): void {
  const minCol = Math.max(1, Math.floor(blob.col - blob.radiusX - 1));
  const maxCol = Math.min(FLOOR_COLUMNS - 2, Math.ceil(blob.col + blob.radiusX + 1));
  const minRow = Math.max(1, Math.floor(blob.row - blob.radiusY - 1));
  const maxRow = Math.min(FLOOR_ROWS - 2, Math.ceil(blob.row + blob.radiusY + 1));

  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      const dx = col - blob.col;
      const dy = row - blob.row;
      const distance = (dx / blob.radiusX) ** 2 + (dy / blob.radiusY) ** 2;
      const wobble =
        EDGE_WOBBLE * Math.sin(dx * 1.9 + blob.seed * 2.1) * Math.sin(dy * 2.4 + blob.seed * 1.3);

      if (distance + wobble < 1) {
        grid[row][col] = blob.cell;
      }
    }
  }
}

function setFloor(grid: CellType[][], col: number, row: number): void {
  if (col >= 1 && col <= FLOOR_COLUMNS - 2 && row >= 1 && row <= FLOOR_ROWS - 2) {
    grid[row][col] = CellType.Floor;
  }
}

function carveCorridor(grid: CellType[][], points: TilePoint[]): void {
  for (let index = 0; index < points.length - 1; index++) {
    const from = points[index];
    const to = points[index + 1];

    if (from.row === to.row) {
      const [start, end] = from.col <= to.col ? [from.col, to.col] : [to.col, from.col];
      for (let col = start; col <= end; col++) {
        setFloor(grid, col, from.row);
        setFloor(grid, col, from.row + 1);
      }
    } else if (from.col === to.col) {
      const [start, end] = from.row <= to.row ? [from.row, to.row] : [to.row, from.row];
      for (let row = start; row <= end; row++) {
        setFloor(grid, from.col, row);
        setFloor(grid, from.col + 1, row);
      }
    }
  }
}

export function createTestFloor(): TestFloorData {
  const grid: CellType[][] = [];
  for (let row = 0; row < FLOOR_ROWS; row++) {
    grid.push(new Array<CellType>(FLOOR_COLUMNS).fill(CellType.Wall));
  }

  carveBlob(grid, SAFE_BLOB);
  for (const blob of BLOBS) {
    carveBlob(grid, blob);
  }
  for (const corridor of CORRIDORS) {
    carveCorridor(grid, corridor);
  }
  for (const tile of EXIT_DOOR_TILES) {
    grid[tile.row][tile.col] = CellType.ExitDoor;
  }

  return {
    grid,
    playerStartTile: PLAYER_START_TILE,
    guardianStartTile: GUARDIAN_START_TILE,
    safeRoom: {
      col: SAFE_BLOB.col - SAFE_BLOB.radiusX - 1,
      row: SAFE_BLOB.row - SAFE_BLOB.radiusY - 1,
      cols: SAFE_BLOB.radiusX * 2 + 2,
      rows: SAFE_BLOB.radiusY * 2 + 2,
    },
    exitDoorTiles: EXIT_DOOR_TILES,
    progression: PROGRESSION,
  };
}
