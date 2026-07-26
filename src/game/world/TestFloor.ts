import Phaser from 'phaser';
import {
  CellType,
  FLOOR_COLUMNS,
  FLOOR_ROWS,
  TILE_SIZE,
  TestFloorData,
  createTestFloor,
} from '../domain/floor/testFloor';

const COLOR_FLOOR = 0x14141d;
const COLOR_FLOOR_GRID = 0x1e1e2e;
const COLOR_SAFE_FLOOR = 0x15202e;
const COLOR_SAFE_GRID = 0x1e3040;
const COLOR_SAFE_BORDER = 0x2e4a66;
const COLOR_SAFE_LABEL = '#6f87a8';
const COLOR_WALL = 0x2b3350;
const COLOR_DOOR = 0x6b4a8f;
const COLOR_DOOR_SEAM = 0x4a3264;

/**
 * Тонкий Phaser-слой фиксированного этажа: один Graphics для визуала,
 * статические тела для стен и двери. Логика планировки живёт в domain.
 */
export class TestFloor {
  readonly widthPixels = FLOOR_COLUMNS * TILE_SIZE;
  readonly heightPixels = FLOOR_ROWS * TILE_SIZE;
  readonly playerStart: { x: number; y: number };
  readonly solids: Phaser.Physics.Arcade.StaticGroup;

  constructor(scene: Phaser.Scene) {
    const data = createTestFloor();

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

  private draw(scene: Phaser.Scene, data: TestFloorData): void {
    const graphics = scene.add.graphics();

    for (let row = 0; row < FLOOR_ROWS; row++) {
      for (let col = 0; col < FLOOR_COLUMNS; col++) {
        const cell = data.grid[row][col];
        const x = col * TILE_SIZE;
        const y = row * TILE_SIZE;

        if (cell === CellType.Wall) {
          graphics.fillStyle(COLOR_WALL, 1);
          graphics.fillRect(x, y, TILE_SIZE, TILE_SIZE);
        } else if (cell === CellType.ExitDoor) {
          graphics.fillStyle(COLOR_DOOR, 1);
          graphics.fillRect(x, y, TILE_SIZE, TILE_SIZE);
          graphics.fillStyle(COLOR_DOOR_SEAM, 1);
          graphics.fillRect(x + TILE_SIZE / 2 - 1, y + 3, 2, TILE_SIZE - 6);
        } else {
          const isSafe = cell === CellType.SafeFloor;
          graphics.fillStyle(isSafe ? COLOR_SAFE_FLOOR : COLOR_FLOOR, 1);
          graphics.fillRect(x, y, TILE_SIZE, TILE_SIZE);
          graphics.fillStyle(isSafe ? COLOR_SAFE_GRID : COLOR_FLOOR_GRID, 1);
          graphics.fillRect(x, y, TILE_SIZE, 1);
          graphics.fillRect(x, y, 1, TILE_SIZE);
        }
      }
    }

    graphics.lineStyle(2, COLOR_SAFE_BORDER, 1);
    graphics.strokeRect(
      data.safeRoom.col * TILE_SIZE,
      data.safeRoom.row * TILE_SIZE,
      data.safeRoom.cols * TILE_SIZE,
      data.safeRoom.rows * TILE_SIZE,
    );
  }

  /** Строковые прогоны смежных непроходимых клеток объединяются в одно тело. */
  private createSolids(scene: Phaser.Scene, data: TestFloorData): Phaser.Physics.Arcade.StaticGroup {
    const group = scene.physics.add.staticGroup();

    for (let row = 0; row < FLOOR_ROWS; row++) {
      let runStart = -1;

      for (let col = 0; col <= FLOOR_COLUMNS; col++) {
        const blocking =
          col < FLOOR_COLUMNS &&
          (data.grid[row][col] === CellType.Wall || data.grid[row][col] === CellType.ExitDoor);

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
