/**
 * Поиск кратчайшего пути по сетке обычным BFS.
 * Чистый TypeScript без Phaser и DOM.
 */

export interface GridPoint {
  col: number;
  row: number;
}

const NEIGHBORS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/**
 * Возвращает кратчайший путь от start до target: стартовая клетка исключена,
 * целевая включена, движение только по четырём направлениям.
 * Если пути нет, возвращает пустой массив.
 */
export function findGridPath(
  start: GridPoint,
  target: GridPoint,
  cols: number,
  rows: number,
  isWalkable: (col: number, row: number) => boolean,
): GridPoint[] {
  if (
    start.col === target.col &&
    start.row === target.row
  ) {
    return [];
  }
  if (!isWalkable(target.col, target.row)) {
    return [];
  }

  const index = (col: number, row: number): number => row * cols + col;
  const visited = new Uint8Array(cols * rows);
  const cameFrom = new Int32Array(cols * rows).fill(-1);

  const queue: GridPoint[] = [start];
  visited[index(start.col, start.row)] = 1;

  for (let head = 0; head < queue.length; head++) {
    const current = queue[head];

    for (const [dc, dr] of NEIGHBORS) {
      const col = current.col + dc;
      const row = current.row + dr;

      if (col < 0 || col >= cols || row < 0 || row >= rows) {
        continue;
      }
      const at = index(col, row);
      if (visited[at] === 1 || !isWalkable(col, row)) {
        continue;
      }

      visited[at] = 1;
      cameFrom[at] = index(current.col, current.row);

      if (col === target.col && row === target.row) {
        const path: GridPoint[] = [{ col, row }];
        let back = cameFrom[at];
        while (back !== -1 && back !== index(start.col, start.row)) {
          path.push({ col: back % cols, row: Math.floor(back / cols) });
          back = cameFrom[back];
        }
        path.reverse();
        return path;
      }

      queue.push({ col, row });
    }
  }

  return [];
}
