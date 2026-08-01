/**
 * Типы определения этажа: чистая типизированная модель без Phaser и DOM.
 * Сцены и системы получают текущий этаж через FloorDefinition из реестра.
 */

import type { GameColor } from '../colors/GameColor';

export const TILE_SIZE = 32;

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
  color: GameColor;
  tile: TilePoint;
}

export interface DoorPlacement {
  color: GameColor;
  /** Смежные клетки твёрдого тела двери. */
  tiles: TilePoint[];
}

export type ChestContent = { kind: 'flashCharge' } | { kind: 'secret'; message: string };

export interface ChestPlacement {
  color: GameColor;
  tile: TilePoint;
  content: ChestContent;
}

export interface CrystalPlacement {
  color: GameColor;
  tile: TilePoint;
}

export interface FloorDefinition {
  /** Уникальный идентификатор этажа. */
  id: string;
  /** Порядковый номер (1..3). */
  order: number;
  /** Русское название этажа. */
  name: string;
  cols: number;
  rows: number;
  /** grid[row][col] */
  grid: CellType[][];
  playerStart: TilePoint;
  guardianStart: TilePoint;
  /** Скорость стража в пикселях в секунду. */
  guardianSpeed: number;
  /** Ограничивающий прямоугольник безопасной комнаты (для подписи). */
  safeRoom: GridRect;
  keys: KeyPlacement[];
  doors: DoorPlacement[];
  chests: ChestPlacement[];
  crystals: CrystalPlacement[];
  /** Выходная дверь: сама по себе переход не запускает. */
  exitDoor: DoorPlacement;
  /** Зона перехода за выходной дверью. */
  transitionZone: GridRect;
  /** Цвета, используемые на этаже. */
  colors: GameColor[];
}

/** Проходимая без учёта дверей клетка. */
export function isWalkableCell(cell: CellType): boolean {
  return cell === CellType.Floor || cell === CellType.SafeFloor || cell === CellType.ExitDoor;
}

/** Центр клетки в мировых координатах. */
export function tileCenter(tile: TilePoint): { x: number; y: number } {
  return { x: tile.col * TILE_SIZE + TILE_SIZE / 2, y: tile.row * TILE_SIZE + TILE_SIZE / 2 };
}

/** Находится ли точка сетки внутри прямоугольника. */
export function rectContains(rect: GridRect, col: number, row: number): boolean {
  return col >= rect.col && col < rect.col + rect.cols && row >= rect.row && row < rect.row + rect.rows;
}
