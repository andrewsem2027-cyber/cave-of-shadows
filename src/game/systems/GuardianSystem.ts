import Phaser from 'phaser';
import { CellType, FLOOR_COLUMNS, FLOOR_ROWS, TILE_SIZE, TilePoint } from '../domain/floor/testFloor';
import { findGridPath, GridPoint } from '../domain/pathfinding/findGridPath';
import { hasGridLineOfSight } from '../domain/visibility/hasGridLineOfSight';

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

/** Радиус обнаружения (в клетках) при включённом фонаре. */
const VISION_RADIUS_LANTERN_ON = 6;
/** Радиус обнаружения (в клетках) при выключенном фонаре. */
const VISION_RADIUS_LANTERN_OFF = 3;
/** Интервал проверки зрения. */
const SENSE_INTERVAL_MS = 150;
/** Ожидание в последней известной точке перед возвратом в idle. */
const SEARCH_WAIT_MS = 3000;

const COLOR_BODY = 0x1a1a26;
const COLOR_EYES = 0xffe9a8;
const COLOR_INDICATOR = '#ffd98a';

type AwarenessState = 'idle' | 'chasing' | 'searching';

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
  /** Исходная удалённая точка стража (центр центральной полости). */
  private readonly homeCell: GridPoint;
  /** Сон в безопасной комнате: нет движения, BFS и урона. */
  private sleeping = false;
  /** Временная пауза после удара: сохранённый шаг продолжается после неё. */
  private paused = false;
  private pauseTimer: Phaser.Time.TimerEvent | null = null;
  /** Текущее состояние обнаружения игрока. */
  private awareness: AwarenessState = 'idle';
  /** Последняя реально замеченная клетка игрока. */
  private lastKnownPlayerCell: GridPoint | null = null;
  /** Момент следующей проверки зрения (scene.time.now). */
  private nextSenseAt = 0;
  /** Конец ожидания в последней известной точке; null — ожидания нет. */
  private searchEndsAt: number | null = null;
  /** Один переиспользуемый индикатор «!»/«?» над стражем. */
  private readonly indicator: Phaser.GameObjects.Text;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly player: Phaser.Physics.Arcade.Image,
    private readonly grid: CellType[][],
    startTile: TilePoint,
    private readonly isDoorClosedAt: (col: number, row: number) => boolean,
    /** Непрозрачность для обзора: стены, закрытые двери, клетки вне карты. */
    private readonly isOpaqueTile: (col: number, row: number) => boolean,
    /** Read-only состояние фонаря: влияет только на радиус обнаружения. */
    private readonly isLanternOn: () => boolean,
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
    this.homeCell = { col: startTile.col, row: startTile.row };
    this.lastWatchX = this.guardian.x;
    this.lastWatchY = this.guardian.y;
    this.lastMoveAt = scene.time.now;

    // Индикатор состояния: мировой объект без setScrollFactor(0),
    // глубина по умолчанию — ниже слоя темноты, сквозь неё не светит.
    this.indicator = scene.add
      .text(this.guardian.x, this.guardian.y - GUARDIAN_SIZE / 2, '', {
        fontSize: '18px',
        color: COLOR_INDICATOR,
      })
      .setOrigin(0.5, 1)
      .setVisible(false);

    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.pauseTimer?.remove(false);
      this.pauseTimer = null;
      this.indicator.destroy();
      this.guardian.destroy();
    });
  }

  /** Игровой объект стража для Arcade overlap с игроком. */
  get gameObject(): Phaser.Physics.Arcade.Image {
    return this.guardian;
  }

  get isSleeping(): boolean {
    return this.sleeping;
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
   * Выбор следующего шага: BFS от последней достигнутой клетки до целевой,
   * берётся только path[0]. Сохраняется, если это ровно один
   * ортогональный шаг. Вызывается только при отсутствии текущей цели.
   */
  private pickNextStep(target: GridPoint): void {
    const path = findGridPath(this.reachedCell, target, FLOOR_COLUMNS, FLOOR_ROWS, (col, row) =>
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

  /** Скорость строго по одной оси в направлении сохранённой targetCell. */
  private applyStepVelocity(): void {
    const target = this.targetCell;
    if (target === null) {
      this.guardian.setVelocity(0, 0);
      return;
    }
    const dc = target.col - this.reachedCell.col;
    const dr = target.row - this.reachedCell.row;
    if (dc !== 0) {
      this.guardian.setVelocity(dc > 0 ? GUARDIAN_SPEED : -GUARDIAN_SPEED, 0);
    } else {
      this.guardian.setVelocity(0, dr > 0 ? GUARDIAN_SPEED : -GUARDIAN_SPEED);
    }
  }

  /** Переинициализация watchdog с текущей позиции и времени. */
  private resetWatchdog(): void {
    this.lastWatchX = this.guardian.x;
    this.lastWatchY = this.guardian.y;
    this.lastMoveAt = this.scene.time.now;
  }

  /**
   * Временная пауза после удара по игроку: скорость нулевая, targetCell и
   * reachedCell сохраняются, body.reset не вызывается, BFS не запускается.
   * После паузы продолжается тот же ортогональный шаг.
   */
  pauseFor(durationMs: number): void {
    if (this.sleeping) {
      return;
    }
    this.pauseTimer?.remove(false);
    this.paused = true;
    this.guardian.setVelocity(0, 0);
    this.pauseTimer = this.scene.time.delayedCall(durationMs, () => {
      this.pauseTimer = null;
      this.paused = false;
      if (this.sleeping) {
        return;
      }
      // Продолжение сохранённого шага без нового BFS.
      this.applyStepVelocity();
      this.resetWatchdog();
    });
  }

  /**
   * Сон в безопасной комнате: остановка, сброс цели, обнаружения и watchdog,
   * один body.reset в исходную точку; BFS и движение прекращаются.
   */
  sleep(): void {
    this.pauseTimer?.remove(false);
    this.pauseTimer = null;
    this.paused = false;
    this.sleeping = true;
    this.targetCell = null;
    this.clearAwareness();
    this.guardian.setVelocity(0, 0);
    this.placeAt(
      this.homeCell.col * TILE_SIZE + TILE_SIZE / 2,
      this.homeCell.row * TILE_SIZE + TILE_SIZE / 2,
    );
    this.reachedCell = { col: this.homeCell.col, row: this.homeCell.row };
    this.resetWatchdog();
  }

  /** Пробуждение: страж в idle, первая проверка зрения — через обычный интервал. */
  wake(): void {
    this.sleeping = false;
    this.awareness = 'idle';
    this.nextSenseAt = this.scene.time.now + SENSE_INTERVAL_MS;
  }

  /** Полный сброс обнаружения: idle, без последней позиции и индикатора. */
  private clearAwareness(): void {
    this.awareness = 'idle';
    this.lastKnownPlayerCell = null;
    this.searchEndsAt = null;
    this.indicator.setVisible(false);
  }

  private showIndicator(mark: string): void {
    this.indicator.setText(mark);
    this.indicator.setVisible(true);
  }

  /**
   * Проверка зрения не чаще SENSE_INTERVAL_MS: игрок виден, если он
   * в радиусе состояния фонаря (круг через квадрат расстояния) и между
   * клетками есть прямая видимость. Фактическая скрытая позиция игрока
   * никуда не сохраняется.
   */
  private sensePlayer(): void {
    const now = this.scene.time.now;
    if (now < this.nextSenseAt) {
      return;
    }
    this.nextSenseAt = now + SENSE_INTERVAL_MS;

    const guardianCell = this.currentCell(this.guardian.x, this.guardian.y);
    const playerCell = this.currentCell(this.player.x, this.player.y);
    const radius = this.isLanternOn() ? VISION_RADIUS_LANTERN_ON : VISION_RADIUS_LANTERN_OFF;
    const dc = playerCell.col - guardianCell.col;
    const dr = playerCell.row - guardianCell.row;

    const visible =
      dc * dc + dr * dr <= radius * radius &&
      hasGridLineOfSight(guardianCell, playerCell, this.isOpaqueTile);

    if (visible) {
      this.awareness = 'chasing';
      this.lastKnownPlayerCell = playerCell;
      this.searchEndsAt = null;
      this.showIndicator('!');
    } else if (this.awareness === 'chasing') {
      // Потеря видимости: идём только к последней реально замеченной клетке.
      this.awareness = 'searching';
      this.showIndicator('?');
    }
  }

  /**
   * Нет активного шага: выбор следующего действия по состоянию обнаружения.
   * Страж всегда стартует шаг точно из центра последней достигнутой клетки.
   */
  private decideNextStep(): void {
    this.placeAt(
      this.reachedCell.col * TILE_SIZE + TILE_SIZE / 2,
      this.reachedCell.row * TILE_SIZE + TILE_SIZE / 2,
    );
    const now = this.scene.time.now;

    if (this.awareness === 'searching' && this.lastKnownPlayerCell !== null) {
      const arrived =
        this.reachedCell.col === this.lastKnownPlayerCell.col &&
        this.reachedCell.row === this.lastKnownPlayerCell.row;
      // Ожидание запускается один раз: по прибытии в точку поиска.
      if (this.searchEndsAt === null && arrived) {
        this.searchEndsAt = now + SEARCH_WAIT_MS;
      }
      if (this.searchEndsAt !== null) {
        // Ожидание: движения и BFS нет, проверки зрения продолжаются.
        this.guardian.setVelocity(0, 0);
        if (now >= this.searchEndsAt) {
          this.clearAwareness();
        }
        return;
      }
      this.pickNextStep(this.lastKnownPlayerCell);
      if (this.targetCell === null) {
        // Пути к последней известной клетке нет: то же ожидание один раз.
        this.searchEndsAt = now + SEARCH_WAIT_MS;
        return;
      }
      this.applyStepVelocity();
      return;
    }

    if (this.awareness === 'chasing') {
      this.pickNextStep(this.currentCell(this.player.x, this.player.y));
      if (this.targetCell === null) {
        return;
      }
      this.applyStepVelocity();
      return;
    }

    // idle: страж стоит, но проверки зрения продолжаются.
    this.guardian.setVelocity(0, 0);
  }

  update(): void {
    if (this.sleeping) {
      return;
    }
    if (this.paused) {
      return;
    }

    this.indicator.setPosition(this.guardian.x, this.guardian.y - GUARDIAN_SIZE / 2 - 2);
    this.sensePlayer();

    if (this.targetCell === null) {
      this.decideNextStep();
      if (this.targetCell === null) {
        return;
      }
      // Начало шага: скорость выставляется один раз, только по одной оси.
      // Поперечная координата уже точная (стоим в центре reachedCell).
      // Watchdog уже инициализирован в pickNextStep. Дальше в этом кадре
      // нельзя вызывать placeAt/reset и аварийное восстановление.
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
