/**
 * Детерминированные помощники построения сетки этажа: прямоугольные
 * комнаты и коридоры шириной две клетки из осевых сегментов.
 * Без случайных чисел: одинаковые данные дают одинаковую карту.
 */

import { CellType, GridRect, TilePoint } from './types';

/** Сетка заданного размера, полностью заполненная стенами. */
export function createGrid(cols: number, rows: number): CellType[][] {
  const grid: CellType[][] = [];
  for (let row = 0; row < rows; row++) {
    grid.push(new Array<CellType>(cols).fill(CellType.Wall));
  }
  return grid;
}

function setCell(grid: CellType[][], col: number, row: number, cell: CellType): void {
  if (col >= 1 && col < grid[0].length - 1 && row >= 1 && row < grid.length - 1) {
    grid[row][col] = cell;
  }
}

/** Вырезает прямоугольную комнату. */
export function carveRoom(
  grid: CellType[][],
  rect: GridRect,
  cell: CellType = CellType.Floor,
): void {
  for (let row = rect.row; row < rect.row + rect.rows; row++) {
    for (let col = rect.col; col < rect.col + rect.cols; col++) {
      setCell(grid, col, row, cell);
    }
  }
}

/**
 * Вырезает коридор шириной две клетки как ломаную из осевых сегментов.
 * Сегмент либо строго горизонтальный, либо строго вертикальный.
 */
export function carveCorridor(grid: CellType[][], points: TilePoint[]): void {
  for (let index = 0; index < points.length - 1; index++) {
    const from = points[index];
    const to = points[index + 1];

    if (from.row === to.row) {
      const [start, end] = from.col <= to.col ? [from.col, to.col] : [to.col, from.col];
      for (let col = start; col <= end; col++) {
        setCell(grid, col, from.row, CellType.Floor);
        setCell(grid, col, from.row + 1, CellType.Floor);
      }
    } else if (from.col === to.col) {
      const [start, end] = from.row <= to.row ? [from.row, to.row] : [to.row, from.row];
      for (let row = start; row <= end; row++) {
        setCell(grid, from.col, row, CellType.Floor);
        setCell(grid, from.col + 1, row, CellType.Floor);
      }
    }
  }
}
