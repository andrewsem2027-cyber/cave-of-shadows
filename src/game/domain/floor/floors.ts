/**
 * Реестр трёх детерминированных этажей игры.
 * Карты строятся из комнат и коридоров без случайных чисел.
 * Чистые данные без Phaser и DOM.
 */

import { GameColor } from '../colors/GameColor';
import { carveCorridor, carveRoom, createGrid } from './carve';
import { CellType, FloorDefinition, GridRect } from './types';

const pt = (col: number, row: number): { col: number; row: number } => ({ col, row });
const rect = (col: number, row: number, cols: number, rows: number): GridRect => ({
  col,
  row,
  cols,
  rows,
});

/**
 * Этаж 1 — «Вход в пещеру». Цвета: красный, голубой.
 * Прогрессия: красный ключ (центр) → красная дверь → голубой ключ →
 * голубая выходная дверь → зона перехода. Красный кристалл и красный
 * сундук с первым зарядом вспышки — в необязательных ветках.
 */
function buildFloor1(): FloorDefinition {
  const cols = 50;
  const rows = 34;
  const grid = createGrid(cols, rows);

  const safeRoom = rect(2, 12, 8, 9);
  carveRoom(grid, safeRoom, CellType.SafeFloor);
  carveRoom(grid, rect(14, 10, 10, 13)); // центральная
  carveRoom(grid, rect(15, 2, 6, 5)); // верхняя ветка (кристалл)
  carveRoom(grid, rect(29, 11, 9, 10)); // правая
  carveRoom(grid, rect(42, 13, 6, 7)); // выходная

  carveCorridor(grid, [pt(9, 15), pt(14, 15)]); // безопасная → центр
  carveCorridor(grid, [pt(17, 10), pt(17, 7)]); // центр → верхняя ветка
  carveCorridor(grid, [pt(23, 15), pt(29, 15)]); // центр → правая
  carveCorridor(grid, [pt(37, 15), pt(42, 15)]); // правая → выходная

  const exitDoorTiles = [pt(40, 15), pt(40, 16)];
  for (const tile of exitDoorTiles) {
    grid[tile.row][tile.col] = CellType.ExitDoor;
  }

  return {
    id: 'floor-1',
    order: 1,
    name: 'Вход в пещеру',
    cols,
    rows,
    grid,
    playerStart: pt(5, 16),
    guardianStart: pt(20, 18),
    guardianSpeed: 65,
    safeRoom,
    keys: [
      { color: 'red', tile: pt(18, 14) },
      { color: 'cyan', tile: pt(33, 14) },
    ],
    doors: [{ color: 'red', tiles: [pt(26, 15), pt(26, 16)] }],
    chests: [{ color: 'red', tile: pt(35, 18), content: { kind: 'flashCharge' } }],
    crystals: [{ color: 'red', tile: pt(17, 4) }],
    exitDoor: { color: 'cyan', tiles: exitDoorTiles },
    transitionZone: rect(43, 15, 3, 2),
    colors: ['red', 'cyan'],
  };
}

/**
 * Этаж 2 — «Затопленные тоннели». Цвета: красный, голубой,
 * фиолетовый, оранжевый. Линейная прогрессия по четырём цветам без
 * циклических зависимостей; кристаллы и сундук — в необязательных ветках.
 */
function buildFloor2(): FloorDefinition {
  const cols = 60;
  const rows = 40;
  const grid = createGrid(cols, rows);

  const safeRoom = rect(2, 16, 8, 8);
  carveRoom(grid, safeRoom, CellType.SafeFloor);
  carveRoom(grid, rect(13, 13, 9, 11)); // A: красный ключ
  carveRoom(grid, rect(27, 12, 8, 10)); // B: голубой ключ
  carveRoom(grid, rect(39, 14, 8, 9)); // C: фиолетовый ключ
  carveRoom(grid, rect(50, 14, 7, 8)); // D: оранжевый ключ
  carveRoom(grid, rect(51, 25, 7, 7)); // выходная
  carveRoom(grid, rect(28, 3, 6, 5)); // ветка B: голубой кристалл
  carveRoom(grid, rect(40, 26, 6, 5)); // ветка C: фиолетовый сундук
  carveRoom(grid, rect(51, 4, 6, 5)); // ветка D: оранжевый кристалл

  carveCorridor(grid, [pt(9, 18), pt(13, 18)]); // безопасная → A
  carveCorridor(grid, [pt(21, 17), pt(27, 17)]); // A → B
  carveCorridor(grid, [pt(34, 16), pt(39, 16)]); // B → C
  carveCorridor(grid, [pt(46, 17), pt(50, 17)]); // C → D
  carveCorridor(grid, [pt(53, 21), pt(53, 25)]); // D → выходная
  carveCorridor(grid, [pt(30, 12), pt(30, 8)]); // B → ветка кристалла
  carveCorridor(grid, [pt(42, 22), pt(42, 26)]); // C → ветка сундука
  carveCorridor(grid, [pt(53, 14), pt(53, 9)]); // D → ветка кристалла

  const exitDoorTiles = [pt(53, 23), pt(54, 23)];
  for (const tile of exitDoorTiles) {
    grid[tile.row][tile.col] = CellType.ExitDoor;
  }

  return {
    id: 'floor-2',
    order: 2,
    name: 'Затопленные тоннели',
    cols,
    rows,
    grid,
    playerStart: pt(5, 19),
    guardianStart: pt(19, 15),
    guardianSpeed: 75,
    safeRoom,
    keys: [
      { color: 'red', tile: pt(17, 18) },
      { color: 'cyan', tile: pt(31, 17) },
      { color: 'purple', tile: pt(42, 18) },
      { color: 'orange', tile: pt(53, 16) },
    ],
    doors: [
      { color: 'red', tiles: [pt(24, 17), pt(24, 18)] },
      { color: 'cyan', tiles: [pt(36, 16), pt(36, 17)] },
      { color: 'purple', tiles: [pt(48, 17), pt(48, 18)] },
    ],
    chests: [{ color: 'purple', tile: pt(42, 28), content: { kind: 'flashCharge' } }],
    crystals: [
      { color: 'cyan', tile: pt(30, 5) },
      { color: 'orange', tile: pt(53, 6) },
    ],
    exitDoor: { color: 'orange', tiles: exitDoorTiles },
    transitionZone: rect(53, 27, 3, 2),
    colors: ['red', 'cyan', 'purple', 'orange'],
  };
}

/**
 * Этаж 3 — «Сердце глубины». Все шесть цветов.
 * Последовательная цепочка ключей: красный → тёмно-красный → фиолетовый →
 * голубой → небесно-голубой → оранжевая финальная дверь → зона завершения.
 * Кристаллы и сундуки — в необязательных ответвлениях.
 */
function buildFloor3(): FloorDefinition {
  const cols = 72;
  const rows = 46;
  const grid = createGrid(cols, rows);

  const safeRoom = rect(2, 20, 7, 7);
  carveRoom(grid, safeRoom, CellType.SafeFloor);
  carveRoom(grid, rect(11, 18, 8, 9)); // R1: красный ключ
  carveRoom(grid, rect(22, 18, 8, 9)); // R2: тёмно-красный ключ
  carveRoom(grid, rect(33, 18, 8, 9)); // R3: фиолетовый ключ
  carveRoom(grid, rect(44, 18, 8, 9)); // R4: голубой ключ
  carveRoom(grid, rect(55, 18, 8, 9)); // R5: небесно-голубой ключ
  carveRoom(grid, rect(66, 18, 5, 9)); // R6: оранжевый ключ
  carveRoom(grid, rect(65, 30, 7, 7)); // финальная
  carveRoom(grid, rect(12, 9, 6, 5)); // ветка R1: красный сундук
  carveRoom(grid, rect(23, 9, 6, 5)); // ветка R2: тёмно-красный кристалл
  carveRoom(grid, rect(34, 30, 6, 5)); // ветка R3: фиолетовый кристалл
  carveRoom(grid, rect(45, 30, 6, 5)); // ветка R4: голубой сундук
  carveRoom(grid, rect(56, 9, 6, 5)); // ветка R5: небесно-голубой кристалл

  carveCorridor(grid, [pt(8, 21), pt(11, 21)]); // безопасная → R1
  carveCorridor(grid, [pt(18, 21), pt(22, 21)]); // R1 → R2
  carveCorridor(grid, [pt(29, 21), pt(33, 21)]); // R2 → R3
  carveCorridor(grid, [pt(40, 21), pt(44, 21)]); // R3 → R4
  carveCorridor(grid, [pt(51, 21), pt(55, 21)]); // R4 → R5
  carveCorridor(grid, [pt(62, 21), pt(66, 21)]); // R5 → R6
  carveCorridor(grid, [pt(67, 26), pt(67, 30)]); // R6 → финальная
  carveCorridor(grid, [pt(14, 18), pt(14, 14)]); // R1 → ветка сундука
  carveCorridor(grid, [pt(25, 18), pt(25, 14)]); // R2 → ветка кристалла
  carveCorridor(grid, [pt(36, 26), pt(36, 30)]); // R3 → ветка кристалла
  carveCorridor(grid, [pt(47, 26), pt(47, 30)]); // R4 → ветка сундука
  carveCorridor(grid, [pt(58, 18), pt(58, 14)]); // R5 → ветка кристалла

  const finalDoorTiles = [pt(67, 28), pt(68, 28)];
  for (const tile of finalDoorTiles) {
    grid[tile.row][tile.col] = CellType.ExitDoor;
  }

  return {
    id: 'floor-3',
    order: 3,
    name: 'Сердце глубины',
    cols,
    rows,
    grid,
    playerStart: pt(5, 23),
    guardianStart: pt(25, 21),
    guardianSpeed: 85,
    safeRoom,
    keys: [
      { color: 'red', tile: pt(14, 22) },
      { color: 'darkRed', tile: pt(26, 24) },
      { color: 'purple', tile: pt(36, 22) },
      { color: 'cyan', tile: pt(47, 22) },
      { color: 'skyBlue', tile: pt(58, 22) },
      { color: 'orange', tile: pt(68, 21) },
    ],
    doors: [
      { color: 'red', tiles: [pt(20, 21), pt(20, 22)] },
      { color: 'darkRed', tiles: [pt(31, 21), pt(31, 22)] },
      { color: 'purple', tiles: [pt(42, 21), pt(42, 22)] },
      { color: 'cyan', tiles: [pt(53, 21), pt(53, 22)] },
      { color: 'skyBlue', tiles: [pt(64, 21), pt(64, 22)] },
    ],
    chests: [
      { color: 'red', tile: pt(14, 11), content: { kind: 'flashCharge' } },
      { color: 'cyan', tile: pt(47, 32), content: { kind: 'secret', message: 'СЕКРЕТ НАЙДЕН' } },
    ],
    crystals: [
      { color: 'darkRed', tile: pt(25, 11) },
      { color: 'purple', tile: pt(36, 32) },
      { color: 'skyBlue', tile: pt(58, 11) },
    ],
    exitDoor: { color: 'orange', tiles: finalDoorTiles },
    transitionZone: rect(67, 32, 3, 2),
    colors: ['red', 'darkRed', 'purple', 'cyan', 'skyBlue', 'orange'],
  };
}

/** Реестр этажей в порядке прохождения. */
export const FLOORS: readonly FloorDefinition[] = [buildFloor1(), buildFloor2(), buildFloor3()];

export const FIRST_FLOOR: FloorDefinition = FLOORS[0];

export function getFloorById(id: string): FloorDefinition | undefined {
  return FLOORS.find((floor) => floor.id === id);
}

/** Следующий этаж после текущего; undefined после финального. */
export function getNextFloor(current: FloorDefinition): FloorDefinition | undefined {
  return FLOORS.find((floor) => floor.order === current.order + 1);
}

/** Цвета всех шести кристаллов игры, по одному на цвет. */
export const ALL_CRYSTALS: readonly GameColor[] = FLOORS.flatMap((floor) =>
  floor.crystals.map((crystal) => crystal.color),
);
