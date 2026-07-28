import Phaser from 'phaser';
import { CellType, FLOOR_COLUMNS, FLOOR_ROWS, TILE_SIZE, TilePoint } from '../domain/floor/testFloor';
import { findGridPath, GridPoint } from '../domain/pathfinding/findGridPath';

const GUARDIAN_SIZE = 28;
const GUARDIAN_SPEED = 65;
/**
 * Тело уже спрайта: запас по 6 px до стен в клетке 32 px,
 * чтобы углы стен не цепляли коллизию на поворотах.
 */
const GUARDIAN_BODY_SIZE = 20;
/** Аварийное восстановление: одиночный шаг без продвижения за это время. */
const STUCK_TIMEOUT_MS = 500;
const STUCK_MIN_MOVEMENT = 1;

const COLOR_BODY = 0x1a1a26;
const COLOR_EYES = 0xffe9a8;

/**
 * Страж: пошаговая навигация по клеткам. Длинный маршрут не хранится —
 * на каждом шаге берётся только первая соседняя клетка BFS-пути до игрока.
 * Движение строго по одной оси с постоянной скоростью между центрами клеток.
 * Закрытые двери блокируют маршрут, открытые проходимы. Поимка и свет — позднее.
 */
export class GuardianSystem {
  private readonly guardian: Phaser.Physics.Arcade.Image;
  /** Последняя достигнутая клетка: страж всегда стартует шаг из её центра. */
  private reachedCell: GridPoint;
  /** Единственная текущая целевая клетка (ровно один ортогональный шаг). */
  private targetCell: GridPoint | null = null;
  private lastWatchX = 0;
  private lastWatchY = 0;
  private lastMoveAt = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly player: Phaser.Physics.Arcade.Image,
    private readonly grid: CellType[][],
    startTile: TilePoint,
    private readonly isDoorClosedAt: (col: number, row: number) => boolean,
    solids: Phaser.Physics.Arcade.StaticGroup,
  ) {
    this.createTexture();

    this.guardian = scene.physics.add.image(
      startTile.col * TILE_SIZE + TILE_SIZE / 2,
      startTile.row * TILE_SIZE + TILE_SIZE / 2,
      'guardian',
    );
    this.guardian.setCollideWorldBounds(true);
    const body = this.guardian.body as Phaser.Physics.Arcade.Body;
    // Тело 20×20 строго по центру визуала 28×28: offset задаём явно,
    // чтобы старое смещение не сохранялось.
    body.setSize(GUARDIAN_BODY_SIZE, GUARDIAN_BODY_SIZE);
    const bodyOffset = (GUARDIAN_SIZE - GUARDIAN_BODY_SIZE) / 2;
    body.setOffset(bodyOffset, bodyOffset);
    scene.physics.add.collider(this.guardian, solids);

    this.reachedCell = { col: startTile.col, row: startTile.row };
    this.lastWatchX = this.guardian.x;
    this.lastWatchY = this.guardian.y;
    this.lastMoveAt = scene.time.now;

    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.guardian.destroy();
    });
  }

  /** Тёмное тело с двумя светлыми глазами, текстура без PNG. */
  private createTexture(): void {
    if (this.scene.textures.exists('guardian')) {
      return;
    }
    const graphics = this.scene.add.graphics();
    graphics.fillStyle(COLOR_BODY, 1);
    graphics.fillRect(0, 0, GUARDIAN_SIZE, GUARDIAN_SIZE);
    graphics.fillStyle(COLOR_EYES, 1);
    graphics.fillRect(6, 9, 5, 5);
    graphics.fillRect(GUARDIAN_SIZE - 11, 9, 5, 5);
    graphics.generateTexture('guardian', GUARDIAN_SIZE, GUARDIAN_SIZE);
    graphics.destroy();
  }

  /**
   * Синхронная установка позиции: body.reset переносит Arcade Body вместе
   * с игровым объектом и обнуляет скорость/ускорение, поэтому объект и тело
   * никогда не расходятся.
   */
  private placeAt(x: number, y: number): void {
    (this.guardian.body as Phaser.Physics.Arcade.Body).reset(x, y);
  }

  private currentCell(x: number, y: number): GridPoint {
    return {
      col: Phaser.Math.Clamp(Math.floor(x / TILE_SIZE), 0, FLOOR_COLUMNS - 1),
      row: Phaser.Math.Clamp(Math.floor(y / TILE_SIZE), 0, FLOOR_ROWS - 1),
    };
  }

  private isWalkable(col: number, row: number): boolean {
    if (this.grid[row][col] === CellType.Wall) {
      return false;
    }
    return !this.isDoorClosedAt(col, row);
  }

  /**
   * Выбор следующего шага: BFS от последней достигнутой клетки до клетки
   * игрока, берётся только path[0]. Сохраняется, если это ровно один
   * ортогональный шаг. Вызывается только при отсутствии текущей цели.
   */
  private pickNextStep(): void {
    const playerCell = this.currentCell(this.player.x, this.player.y);

    const path = findGridPath(this.reachedCell, playerCell, FLOOR_COLUMNS, FLOOR_ROWS, (col, row) =>
      this.isWalkable(col, row),
    );

    if (path.length === 0) {
      return;
    }

    const next = path[0];
    const step = Math.abs(next.col - this.reachedCell.col) + Math.abs(next.row - this.reachedCell.row);
    if (step !== 1) {
      return;
    }

    this.targetCell = next;
    this.lastWatchX = this.guardian.x;
    this.lastWatchY = this.guardian.y;
    this.lastMoveAt = this.scene.time.now;
  }

  /**
   * Аварийное восстановление: если зафиксированный одиночный шаг не
   * продвинулся за STUCK_TIMEOUT_MS — остановка, возврат в центр последней
   * достигнутой клетки и сброс цели; новый BFS будет построен на следующем кадре.
   */
  private checkStuck(): void {
    if (this.targetCell === null) {
      return;
    }
    const now = this.scene.time.now;
    const moved = Phaser.Math.Distance.Between(this.guardian.x, this.guardian.y, this.lastWatchX, this.lastWatchY);
    if (moved >= STUCK_MIN_MOVEMENT) {
      this.lastWatchX = this.guardian.x;
      this.lastWatchY = this.guardian.y;
      this.lastMoveAt = now;
      return;
    }
    if (now - this.lastMoveAt >= STUCK_TIMEOUT_MS) {
      this.placeAt(
        this.reachedCell.col * TILE_SIZE + TILE_SIZE / 2,
        this.reachedCell.row * TILE_SIZE + TILE_SIZE / 2,
      );
      this.targetCell = null;
    }
  }

  update(): void {
    if (this.targetCell === null) {
      // Ожидание в центре: шаг всегда начинается точно из центра
      // последней достигнутой клетки.
      this.placeAt(
        this.reachedCell.col * TILE_SIZE + TILE_SIZE / 2,
        this.reachedCell.row * TILE_SIZE + TILE_SIZE / 2,
      );
      this.pickNextStep();
      if (this.targetCell === null) {
        return;
      }
      // Начало шага: скорость выставляется один раз, только по одной оси.
      // Поперечная координата уже точная (стоим в центре reachedCell).
      // Watchdog уже инициализирован в pickNextStep. Дальше в этом кадре
      // нельзя вызывать placeAt/reset и аварийное восстановление.
      const next: GridPoint = this.targetCell;
      const dc = next.col - this.reachedCell.col;
      const dr = next.row - this.reachedCell.row;
      if (dc !== 0) {
        this.guardian.setVelocity(dc > 0 ? GUARDIAN_SPEED : -GUARDIAN_SPEED, 0);
      } else {
        this.guardian.setVelocity(0, dr > 0 ? GUARDIAN_SPEED : -GUARDIAN_SPEED);
      }
      return;
    }

    // Активный шаг: координаты вручную не меняем, reset не вызываем,
    // BFS не строим. Проверяем только пересечение целевой координаты.
    const target = this.targetCell;
    const targetX = target.col * TILE_SIZE + TILE_SIZE / 2;
    const targetY = target.row * TILE_SIZE + TILE_SIZE / 2;

    const dCol = target.col - this.reachedCell.col;
    const dRow = target.row - this.reachedCell.row;

    const finished =
      dCol > 0
        ? this.guardian.x >= targetX
        : dCol < 0
          ? this.guardian.x <= targetX
          : dRow > 0
            ? this.guardian.y >= targetY
            : this.guardian.y <= targetY;

    if (finished) {
      // Завершение шага: единственный placeAt; reset намеренно обнуляет
      // обе компоненты скорости. Следующий BFS — только на следующем кадре.
      this.placeAt(targetX, targetY);
      this.reachedCell = target;
      this.targetCell = null;
      return;
    }

    this.checkStuck();
  }
}
