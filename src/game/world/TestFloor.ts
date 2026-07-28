import Phaser from 'phaser';
import {
  CellType,
  FLOOR_COLUMNS,
  FLOOR_ROWS,
  TILE_SIZE,
  TestFloorData,
  createTestFloor,
} from '../domain/floor/testFloor';

const FLOOR_SHADES = [0x14141d, 0x15151f, 0x171822, 0x13131a];
const SAFE_SHADES = [0x16202e, 0x17222f, 0x182433];
const SAFE_RIM = 0x2e4a66;
const FLOOR_CRACK = 0x0e0e14;
const WALL_SHADES = [0x232840, 0x262c46, 0x2b3350];
const WALL_RIM = 0x3d4666;
const COLOR_SAFE_LABEL = '#6f87a8';

function isWalkable(cell: CellType): boolean {
  return cell === CellType.Floor || cell === CellType.SafeFloor;
}

/**
 * Тонкий Phaser-слой фиксированного этажа: один Graphics для визуала,
 * статические тела для стен и двери. Логика планировки живёт в domain.
 */
export class TestFloor {
  readonly widthPixels = FLOOR_COLUMNS * TILE_SIZE;
  readonly heightPixels = FLOOR_ROWS * TILE_SIZE;
  readonly playerStart: { x: number; y: number };
  readonly solids: Phaser.Physics.Arcade.StaticGroup;
  readonly data: TestFloorData;

  constructor(scene: Phaser.Scene) {
    const data = createTestFloor();
    this.data = data;

    this.playerStart = {
      x: data.playerStartTile.col * TILE_SIZE + TILE_SIZE / 2,
      y: data.playerStartTile.row * TILE_SIZE + TILE_SIZE / 2,
    };

    this.draw(scene, data);
    this.solids = this.createSolids(scene, data);

    const labelX = (data.safeRoom.col + data.safeRoom.cols / 2) * TILE_SIZE;
    const labelY = data.safeRoom.row * TILE_SIZE + 6;
    scene.add
      .text(labelX, labelY, 'БЕЗОПАСНО', { fontSize: '14px', color: COLOR_SAFE_LABEL })
      .setOrigin(0.5, 0);
  }

  /** Безопасная ли клетка под мировой позицией (только SafeFloor, с проверкой границ). */
  isSafeAtWorldPosition(x: number, y: number): boolean {
    const col = Math.floor(x / TILE_SIZE);
    const row = Math.floor(y / TILE_SIZE);
    if (col < 0 || col >= FLOOR_COLUMNS || row < 0 || row >= FLOOR_ROWS) {
      return false;
    }
    return this.data.grid[row][col] === CellType.SafeFloor;
  }

  private draw(scene: Phaser.Scene, data: TestFloorData): void {
    const graphics = scene.add.graphics();

    for (let row = 0; row < FLOOR_ROWS; row++) {
      for (let col = 0; col < FLOOR_COLUMNS; col++) {
        const cell = data.grid[row][col];
        const x = col * TILE_SIZE;
        const y = row * TILE_SIZE;

        if (cell === CellType.Wall) {
          this.drawWall(graphics, data, col, row, x, y);
        } else {
          // Клетки выходной двери рисуются как пол: саму дверь показывает
          // система прогрессии, а после открытия остаётся проход.
          this.drawFloor(graphics, data, cell === CellType.ExitDoor ? CellType.Floor : cell, col, row, x, y);
        }
      }
    }
  }

  /** Каменный пол с детерминированными вариациями оттенка и редкими трещинами. */
  private drawFloor(
    graphics: Phaser.GameObjects.Graphics,
    data: TestFloorData,
    cell: CellType,
    col: number,
    row: number,
    x: number,
    y: number,
  ): void {
    const isSafe = cell === CellType.SafeFloor;
    const shades = isSafe ? SAFE_SHADES : FLOOR_SHADES;

    graphics.fillStyle(shades[(col * 7 + row * 13) % shades.length], 1);
    graphics.fillRect(x, y, TILE_SIZE, TILE_SIZE);

    // Редкие короткие трещины: позиция и наличие заданы формулой от координат.
    if ((col * 31 + row * 17) % 23 === 0) {
      graphics.fillStyle(FLOOR_CRACK, 1);
      graphics.fillRect(x + 4 + ((col * 3 + row * 7) % 18), y + 6 + ((col * 11 + row * 3) % 18), 7, 2);
    }

    // Мягкая холодная кромка безопасной полости вместо прямоугольной рамки.
    if (isSafe) {
      this.drawEdgeRim(graphics, data, col, row, x, y, SAFE_RIM, CellType.Wall);
    }
  }

  /** Стена темнее пола; край рядом с проходом подсвечен, как скальный обрыв. */
  private drawWall(
    graphics: Phaser.GameObjects.Graphics,
    data: TestFloorData,
    col: number,
    row: number,
    x: number,
    y: number,
  ): void {
    graphics.fillStyle(WALL_SHADES[(col * 5 + row * 11) % WALL_SHADES.length], 1);
    graphics.fillRect(x, y, TILE_SIZE, TILE_SIZE);

    this.drawEdgeRim(graphics, data, col, row, x, y, WALL_RIM, null);
  }

  /**
   * Полоса на стороне клетки, соседней с проходом (для стен)
   * или со стеной (для безопасного пола).
   */
  private drawEdgeRim(
    graphics: Phaser.GameObjects.Graphics,
    data: TestFloorData,
    col: number,
    row: number,
    x: number,
    y: number,
    color: number,
    rimAgainst: CellType | null,
  ): void {
    const matches = (targetCol: number, targetRow: number): boolean => {
      if (targetCol < 0 || targetCol >= FLOOR_COLUMNS || targetRow < 0 || targetRow >= FLOOR_ROWS) {
        return false;
      }
      const neighbor = data.grid[targetRow][targetCol];
      return rimAgainst === null ? isWalkable(neighbor) : neighbor === rimAgainst;
    };

    graphics.fillStyle(color, 1);
    if (matches(col, row - 1)) {
      graphics.fillRect(x, y, TILE_SIZE, 3);
    }
    if (matches(col, row + 1)) {
      graphics.fillRect(x, y + TILE_SIZE - 3, TILE_SIZE, 3);
    }
    if (matches(col - 1, row)) {
      graphics.fillRect(x, y, 3, TILE_SIZE);
    }
    if (matches(col + 1, row)) {
      graphics.fillRect(x + TILE_SIZE - 3, y, 3, TILE_SIZE);
    }
  }

  /** Строковые прогоны смежных непроходимых клеток объединяются в одно тело. */
  private createSolids(scene: Phaser.Scene, data: TestFloorData): Phaser.Physics.Arcade.StaticGroup {
    const group = scene.physics.add.staticGroup();

    for (let row = 0; row < FLOOR_ROWS; row++) {
      let runStart = -1;

      for (let col = 0; col <= FLOOR_COLUMNS; col++) {
        // Выходная дверь сюда не входит: её твёрдое тело создаётся отдельно,
        // чтобы коллизию можно было отключить независимо от стен.
        const blocking = col < FLOOR_COLUMNS && data.grid[row][col] === CellType.Wall;

        if (blocking && runStart < 0) {
          runStart = col;
        } else if (!blocking && runStart >= 0) {
          const width = (col - runStart) * TILE_SIZE;
          const zone = scene.add.zone(
            runStart * TILE_SIZE + width / 2,
            row * TILE_SIZE + TILE_SIZE / 2,
            width,
            TILE_SIZE,
          );
          scene.physics.add.existing(zone, true);
          group.add(zone);
          runStart = -1;
        }
      }
    }

    return group;
  }
}
