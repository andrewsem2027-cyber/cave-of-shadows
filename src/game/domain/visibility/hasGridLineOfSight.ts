/**
 * Прямая видимость между клетками сетки: целочисленный supercover-обход
 * линии между центрами клеток. Чистый TypeScript без Phaser и DOM.
 */

import type { GridPoint } from '../pathfinding/findGridPath';

/**
 * Возвращает true, если между центрами клеток from и to есть прямая
 * видимость: все промежуточные клетки, которых касается линия, прозрачны.
 * Стартовая и конечная клетки сами себя не блокируют. Линия, идущая точно
 * через общий угол двух стен (диагональный просвет), видимости не даёт.
 * Входные данные не изменяются; расстояние и состояние ИИ не проверяются.
 */
export function hasGridLineOfSight(
  from: GridPoint,
  to: GridPoint,
  isOpaque: (col: number, row: number) => boolean,
): boolean {
  let col = from.col;
  let row = from.row;
  const stepsCol = Math.abs(to.col - from.col);
  const stepsRow = Math.abs(to.row - from.row);
  const stepCol = Math.sign(to.col - from.col);
  const stepRow = Math.sign(to.row - from.row);
  let travelledCol = 0;
  let travelledRow = 0;

  while (col !== to.col || row !== to.row) {
    if (stepsCol === 0) {
      row += stepRow;
      travelledRow++;
    } else if (stepsRow === 0) {
      col += stepCol;
      travelledCol++;
    } else {
      // Пересечения границ сравниваются без деления:
      // (travelledCol + 0.5) / stepsCol ? (travelledRow + 0.5) / stepsRow.
      const lhs = (2 * travelledCol + 1) * stepsRow;
      const rhs = (2 * travelledRow + 1) * stepsCol;
      if (lhs === rhs) {
        // Линия проходит точно через общий угол клеток: диагональный
        // просвет между соприкасающимися стенами обзора не даёт.
        if (isOpaque(col + stepCol, row) || isOpaque(col, row + stepRow)) {
          return false;
        }
        col += stepCol;
        row += stepRow;
        travelledCol++;
        travelledRow++;
      } else if (lhs < rhs) {
        col += stepCol;
        travelledCol++;
      } else {
        row += stepRow;
        travelledRow++;
      }
    }

    if (col === to.col && row === to.row) {
      // Конечная клетка не блокирует собственную линию.
      return true;
    }
    if (isOpaque(col, row)) {
      return false;
    }
  }

  return true;
}
