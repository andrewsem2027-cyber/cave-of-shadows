import Phaser from 'phaser';
import { CellType, FloorDefinition, TILE_SIZE, isWalkableCell } from '../domain/floor/types';

const FLOOR_SHADES = [0x14141d, 0x15151f, 0x171822, 0x13131a];
const SAFE_SHADES = [0x16202e, 0x17222f, 0x182433];
const SAFE_RIM = 0x2e4a66;
const FLOOR_CRACK = 0x0e0e14;
const WALL_SHADES = [0x232840, 0x262c46, 0x2b3350];
const WALL_RIM = 0x3d4666;
const COLOR_SAFE_LABEL = '#6f87a8';

/**
 * Тонкий Phaser-слой этажа: один Graphics для визуала, статические тела
 * для стен. Планировка и данные живут в domain (FloorDefinition).
 */
export class FloorView {
  readonly widthPixels: number;
  readonly heightPixels: number;
  readonly playerStart: { x: number; y: number };
  readonly solids: Phaser.Physics.Arcade.StaticGroup;
  readonly data: FloorDefinition;

  constructor(scene: Phaser.Scene, definition: FloorDefinition) {
    this.data = definition;
    this.widthPixels = definition.cols * TILE_SIZE;
    this.heightPixels = definition.rows * TILE_SIZE;

    this.playerStart = {
      x: definition.playerStart.col * TILE_SIZE + TILE_SIZE / 2,
      y: definition.playerStart.row * TILE_SIZE + TILE_SIZE / 2,
    };

    this.draw(scene, definition);
    this.solids = this.createSolids(scene, definition);

    const labelX = (definition.safeRoom.col + definition.safeRoom.cols / 2) * TILE_SIZE;
    const labelY = definition.safeRoom.row * TILE_SIZE + 6;
    scene.add
      .text(labelX, labelY, 'БЕЗОПАСНО', { fontSize: '14px', color: COLOR_SAFE_LABEL })
      .setOrigin(0.5, 0);
  }

  /** Непрозрачная ли клетка для обзора: стена или выход за пределы карты. */
  isOpaqueTile(col: number, row: number): boolean {
    if (col < 0 || col >= this.data.cols || row < 0 || row >= this.data.rows) {
      return true;
    }
    return this.data.grid[row][col] === CellType.Wall;
  }

  /** Безопасная ли клетка под мировой позицией (только SafeFloor, с проверкой границ). */
  isSafeAtWorldPosition(x: number, y: number): boolean {
    const col = Math.floor(x / TILE_SIZE);
    const row = Math.floor(y / TILE_SIZE);
    if (col < 0 || col >= this.data.cols || row < 0 || row >= this.data.rows) {
      return false;
    }
    return this.data.grid[row][col] === CellType.SafeFloor;
  }

  private draw(scene: Phaser.Scene, data: FloorDefinition): void {
    const graphics = scene.add.graphics();

    for (let row = 0; row < data.rows; row++) {
      for (let col = 0; col < data.cols; col++) {
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
    data: FloorDefinition,
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
    data: FloorDefinition,
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
    data: FloorDefinition,
    col: number,
    row: number,
    x: number,
    y: number,
    color: number,
    rimAgainst: CellType | null,
  ): void {
    const matches = (targetCol: number, targetRow: number): boolean => {
      if (targetCol < 0 || targetCol >= data.cols || targetRow < 0 || targetRow >= data.rows) {
        return false;
      }
      const neighbor = data.grid[targetRow][targetCol];
      return rimAgainst === null ? isWalkableCell(neighbor) && neighbor !== CellType.ExitDoor : neighbor === rimAgainst;
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
  private createSolids(scene: Phaser.Scene, data: FloorDefinition): Phaser.Physics.Arcade.StaticGroup {
    const group = scene.physics.add.staticGroup();

    for (let row = 0; row < data.rows; row++) {
      let runStart = -1;

      for (let col = 0; col <= data.cols; col++) {
        // Выходная дверь сюда не входит: её твёрдое тело создаётся отдельно,
        // чтобы коллизию можно было отключить независимо от стен.
        const blocking = col < data.cols && data.grid[row][col] === CellType.Wall;

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
