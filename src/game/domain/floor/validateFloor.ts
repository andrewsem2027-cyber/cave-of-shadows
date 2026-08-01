/**
 * Валидатор FloorDefinition: размеры, границы, конфликты объектов и
 * проходимость прогрессии поиском по состоянию (cell, keyMask).
 * Чистый TypeScript без Phaser и DOM.
 */

import { GameColor, isGameColor } from '../colors/GameColor';
import {
  CellType,
  FloorDefinition,
  TilePoint,
  isWalkableCell,
  rectContains,
} from './types';

interface StateNode {
  col: number;
  row: number;
  mask: number;
}

const tileKey = (col: number, row: number): string => `${col},${row}`;

function inBounds(floor: FloorDefinition, col: number, row: number): boolean {
  return col >= 0 && col < floor.cols && row >= 0 && row < floor.rows;
}

/** Цвет закрытой двери на клетке; undefined — двери нет. */
function doorColorAt(floor: FloorDefinition, col: number, row: number): GameColor | undefined {
  for (const door of [...floor.doors, floor.exitDoor]) {
    if (door.tiles.some((tile) => tile.col === col && tile.row === row)) {
      return door.color;
    }
  }
  return undefined;
}

/**
 * Поиск по состоянию (cell, keyMask): посещение ключа добавляет его бит,
 * закрытая дверь проходима только при наличии соответствующего бита.
 * Возвращает множество клеток, достижимых хотя бы с одной маской.
 */
function reachableCells(floor: FloorDefinition): Set<string> {
  const keyColors = floor.keys.map((key) => key.color);
  const bitOf = (color: GameColor): number => {
    const index = keyColors.indexOf(color);
    return index >= 0 ? 1 << index : 0;
  };
  const keyAt = new Map<string, GameColor>();
  for (const key of floor.keys) {
    keyAt.set(tileKey(key.tile.col, key.tile.row), key.color);
  }

  const start: StateNode = { col: floor.playerStart.col, row: floor.playerStart.row, mask: 0 };
  const queue: StateNode[] = [start];
  const visited = new Set<string>([`${start.col},${start.row},0`]);
  const reached = new Set<string>([tileKey(start.col, start.row)]);

  const neighbors: ReadonlyArray<readonly [number, number]> = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];

  for (let head = 0; head < queue.length; head++) {
    const current = queue[head];
    for (const [dc, dr] of neighbors) {
      const col = current.col + dc;
      const row = current.row + dr;
      if (!inBounds(floor, col, row)) {
        continue;
      }
      const cell = floor.grid[row][col];
      if (!isWalkableCell(cell)) {
        continue;
      }
      const door = doorColorAt(floor, col, row);
      if (door !== undefined && (current.mask & bitOf(door)) === 0) {
        continue;
      }
      let mask = current.mask;
      const key = keyAt.get(tileKey(col, row));
      if (key !== undefined) {
        mask |= bitOf(key);
      }
      const stateKey = `${col},${row},${mask}`;
      if (visited.has(stateKey)) {
        continue;
      }
      visited.add(stateKey);
      reached.add(tileKey(col, row));
      queue.push({ col, row, mask });
    }
  }

  return reached;
}

/**
 * Полная проверка этажа. Возвращает список ошибок; каждая содержит
 * floorId и понятную причину. Пустой список — этаж валиден.
 */
export function validateFloor(floor: FloorDefinition): string[] {
  const errors: string[] = [];
  const fail = (reason: string): void => {
    errors.push(`[${floor.id}] ${reason}`);
  };

  if (floor.grid.length !== floor.rows || floor.grid.some((row) => row.length !== floor.cols)) {
    fail(`сетка не соответствует размерам ${floor.cols}x${floor.rows}`);
    return errors;
  }

  const checkTile = (label: string, tile: TilePoint): boolean => {
    if (!inBounds(floor, tile.col, tile.row)) {
      fail(`${label} вне границ сетки (${tile.col},${tile.row})`);
      return false;
    }
    return true;
  };

  // Старт игрока — на безопасном полу.
  if (checkTile('старт игрока', floor.playerStart)) {
    if (floor.grid[floor.playerStart.row][floor.playerStart.col] !== CellType.SafeFloor) {
      fail('старт игрока не на SafeFloor');
    }
  }

  // Старт стража — на проходимой клетке.
  if (checkTile('старт стража', floor.guardianStart)) {
    const cell = floor.grid[floor.guardianStart.row][floor.guardianStart.col];
    if (!isWalkableCell(cell)) {
      fail('старт стража на непроходимой клетке');
    }
  }

  // Валидность цветов и границы всех объектов.
  const objectTiles = new Map<string, string>();
  const claimTile = (label: string, tile: TilePoint): void => {
    const id = tileKey(tile.col, tile.row);
    const existing = objectTiles.get(id);
    if (existing !== undefined) {
      fail(`конфликт объектов на клетке (${tile.col},${tile.row}): ${existing} и ${label}`);
      return;
    }
    objectTiles.set(id, label);
    if (!checkTile(label, tile)) {
      return;
    }
    const cell = floor.grid[tile.row][tile.col];
    if (!isWalkableCell(cell) || cell === CellType.ExitDoor) {
      fail(`${label} на непроходимой клетке (${tile.col},${tile.row})`);
    }
  };

  for (const key of floor.keys) {
    if (!isGameColor(key.color)) {
      fail(`ключ с невалидным цветом: ${String(key.color)}`);
    }
    claimTile(`ключ ${key.color}`, key.tile);
  }
  for (const crystal of floor.crystals) {
    if (!isGameColor(crystal.color)) {
      fail(`кристалл с невалидным цветом: ${String(crystal.color)}`);
    }
    claimTile(`кристалл ${crystal.color}`, crystal.tile);
  }
  for (const chest of floor.chests) {
    if (!isGameColor(chest.color)) {
      fail(`сундук с невалидным цветом: ${String(chest.color)}`);
    }
    claimTile(`сундук ${chest.color}`, chest.tile);
  }

  // Двери: границы, проходимость клеток, валидность цвета.
  if (floor.exitDoor.tiles.length === 0) {
    fail('отсутствует выходная дверь');
  }
  for (const door of [...floor.doors, floor.exitDoor]) {
    if (!isGameColor(door.color)) {
      fail(`дверь с невалидным цветом: ${String(door.color)}`);
    }
    for (const tile of door.tiles) {
      if (!checkTile(`дверь ${door.color}`, tile)) {
        continue;
      }
      const cell = floor.grid[tile.row][tile.col];
      if (!isWalkableCell(cell)) {
        fail(`дверь ${door.color} на непроходимой клетке (${tile.col},${tile.row})`);
      }
      if (objectTiles.has(tileKey(tile.col, tile.row))) {
        fail(`дверь ${door.color} конфликтует с объектом на клетке (${tile.col},${tile.row})`);
      }
    }
    // У каждой двери должен существовать ключ её цвета.
    if (!floor.keys.some((key) => key.color === door.color)) {
      fail(`нет ключа для двери цвета ${door.color}`);
    }
  }

  // Зона перехода: существует, в границах, проходима.
  if (floor.transitionZone.cols <= 0 || floor.transitionZone.rows <= 0) {
    fail('отсутствует зона перехода');
  } else {
    for (let row = floor.transitionZone.row; row < floor.transitionZone.row + floor.transitionZone.rows; row++) {
      for (let col = floor.transitionZone.col; col < floor.transitionZone.col + floor.transitionZone.cols; col++) {
        if (!inBounds(floor, col, row) || !isWalkableCell(floor.grid[row][col])) {
          fail(`зона перехода содержит непроходимую клетку (${col},${row})`);
        }
      }
    }
  }

  // Цвета этажа покрывают все объекты.
  for (const color of [
    ...floor.keys.map((key) => key.color),
    ...floor.doors.map((door) => door.color),
    floor.exitDoor.color,
    ...floor.chests.map((chest) => chest.color),
    ...floor.crystals.map((crystal) => crystal.color),
  ]) {
    if (!floor.colors.includes(color)) {
      fail(`цвет ${color} используется, но не объявлен в colors этажа`);
    }
  }

  // Прогрессия: достижимость ключей, кристаллов и выхода поиском (cell, keyMask).
  if (errors.length > 0) {
    return errors;
  }
  const reached = reachableCells(floor);
  for (const key of floor.keys) {
    if (!reached.has(tileKey(key.tile.col, key.tile.row))) {
      fail(`ключ ${key.color} недостижим (возможно, заперт за дверью своего цвета)`);
    }
  }
  for (const crystal of floor.crystals) {
    if (!reached.has(tileKey(crystal.tile.col, crystal.tile.row))) {
      fail(`кристалл ${crystal.color} недостижим`);
    }
  }
  for (const chest of floor.chests) {
    if (!reached.has(tileKey(chest.tile.col, chest.tile.row))) {
      fail(`сундук ${chest.color} недостижим`);
    }
  }
  const exitReached = [...reached].some((id) => {
    const [col, row] = id.split(',').map(Number);
    return rectContains(floor.transitionZone, col, row);
  });
  if (!exitReached) {
    fail('зона перехода недостижима');
  }

  return errors;
}

/** Проверка всех этажей реестра. */
export function validateAllFloors(floors: readonly FloorDefinition[]): string[] {
  return floors.flatMap((floor) => validateFloor(floor));
}
