import Phaser from 'phaser';
import { COLOR_META, GameColor } from '../domain/colors/GameColor';
import { ChestContent, FloorDefinition, TILE_SIZE, TilePoint, tileCenter } from '../domain/floor/types';
import { KeyState } from '../domain/progression/KeyState';
import { ensureColorTextures } from '../world/colorTextures';
import { NotificationSystem } from './NotificationSystem';

const UI_DEPTH = 200;
const PROXIMITY_PADDING = TILE_SIZE;

interface DoorRuntime {
  color: GameColor;
  isExit: boolean;
  opened: boolean;
  tiles: TilePoint[];
  image: Phaser.GameObjects.Image;
  body: Phaser.Physics.Arcade.StaticBody;
  collider: Phaser.Physics.Arcade.Collider;
}

interface ChestRuntime {
  color: GameColor;
  opened: boolean;
  content: ChestContent;
  image: Phaser.GameObjects.Image;
}

export interface ProgressionCallbacks {
  onKeyCollected?(color: GameColor): void;
  onCrystalCollected(color: GameColor): void;
  /** Сундук открывается всегда, даже если заряды заполнены. */
  onChestOpened(content: ChestContent): void;
}

/**
 * Ключи, двери, сундуки и кристаллы этажа: автоподбор ключей и кристаллов,
 * автоматическое открытие дверей и сундуков в зоне приближения,
 * уведомления через NotificationSystem и индикаторы ключей в углу экрана.
 */
export class ProgressionSystem {
  private readonly doors: DoorRuntime[] = [];
  private readonly chests: ChestRuntime[] = [];
  private readonly indicators = new Map<GameColor, Phaser.GameObjects.Image>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly player: Phaser.Physics.Arcade.Image,
    private readonly floor: FloorDefinition,
    private readonly keys: KeyState,
    collectedCrystals: ReadonlySet<GameColor>,
    private readonly notify: NotificationSystem,
    private readonly callbacks: ProgressionCallbacks,
  ) {
    ensureColorTextures(scene);

    for (const key of floor.keys) {
      this.createKey(key.color, key.tile);
    }
    for (const door of floor.doors) {
      this.createDoor(door.color, door.tiles, false);
    }
    this.createDoor(floor.exitDoor.color, floor.exitDoor.tiles, true);
    for (const chest of floor.chests) {
      this.createChest(chest.color, chest.tile, chest.content);
    }
    for (const crystal of floor.crystals) {
      // Уже найденный кристалл больше не появляется.
      if (!collectedCrystals.has(crystal.color)) {
        this.createCrystal(crystal.color, crystal.tile);
      }
    }

    this.createIndicators();
  }

  private createKey(color: GameColor, tile: TilePoint): void {
    const { x, y } = tileCenter(tile);
    const image = this.scene.add.image(x, y, `key-${color}`);

    const zone = this.scene.add.zone(x, y, TILE_SIZE, TILE_SIZE);
    this.scene.physics.add.existing(zone, true);
    this.scene.physics.add.overlap(this.player, zone, () => {
      this.keys.add(color);
      image.destroy();
      zone.destroy();
      this.updateIndicators();
      this.callbacks.onKeyCollected?.(color);
    });
  }

  private createCrystal(color: GameColor, tile: TilePoint): void {
    const { x, y } = tileCenter(tile);
    const image = this.scene.add.image(x, y, `crystal-${color}`);

    const zone = this.scene.add.zone(x, y, TILE_SIZE, TILE_SIZE);
    this.scene.physics.add.existing(zone, true);
    this.scene.physics.add.overlap(this.player, zone, () => {
      image.destroy();
      zone.destroy();
      this.callbacks.onCrystalCollected(color);
    });
  }

  private createDoor(color: GameColor, tiles: TilePoint[], isExit: boolean): void {
    const minCol = Math.min(...tiles.map((tile) => tile.col));
    const minRow = Math.min(...tiles.map((tile) => tile.row));
    const maxCol = Math.max(...tiles.map((tile) => tile.col));
    const maxRow = Math.max(...tiles.map((tile) => tile.row));
    const width = (maxCol - minCol + 1) * TILE_SIZE;
    const height = (maxRow - minRow + 1) * TILE_SIZE;
    const centerX = minCol * TILE_SIZE + width / 2;
    const centerY = minRow * TILE_SIZE + height / 2;

    const image = this.scene.add.image(centerX, centerY, `door-${color}`);
    image.setDisplaySize(width, height);

    // Твёрдое тело двери — отдельный коллайдер, отключаемый независимо от стен.
    const solidZone = this.scene.add.zone(centerX, centerY, width, height);
    this.scene.physics.add.existing(solidZone, true);
    const body = solidZone.body as Phaser.Physics.Arcade.StaticBody;
    const collider = this.scene.physics.add.collider(this.player, solidZone);

    const door: DoorRuntime = { color, isExit, opened: false, tiles, image, body, collider };
    this.doors.push(door);

    // Нетвёрдая зона приближения шире двери: коллайдер не пускает игрока
    // внутрь твёрдого тела, поэтому открытие проверяется отдельной зоной.
    const proximity = this.scene.add.zone(
      centerX,
      centerY,
      width + PROXIMITY_PADDING * 2,
      height + PROXIMITY_PADDING * 2,
    );
    this.scene.physics.add.existing(proximity, true);
    this.scene.physics.add.overlap(this.player, proximity, () => this.handleDoorProximity(door));
  }

  private handleDoorProximity(door: DoorRuntime): void {
    if (door.opened) {
      return;
    }
    if (!this.keys.has(door.color)) {
      this.notify.notify(COLOR_META[door.color].missingKeyText);
      return;
    }
    // Открытая дверь теряет коллизию и больше не блокирует BFS и обзор.
    door.opened = true;
    door.collider.destroy();
    door.body.enable = false;
    door.image.destroy();
  }

  /** Публично для системы стража: закрытая дверь блокирует маршрут и обзор. */
  isDoorClosedAt(col: number, row: number): boolean {
    for (const door of this.doors) {
      if (!door.opened && door.tiles.some((tile) => tile.col === col && tile.row === row)) {
        return true;
      }
    }
    return false;
  }

  /** Открыта ли выходная дверь: переход запускает только зона за ней. */
  isExitDoorOpen(): boolean {
    const exit = this.doors.find((door) => door.isExit);
    return exit !== undefined && exit.opened;
  }

  private createChest(color: GameColor, tile: TilePoint, content: ChestContent): void {
    const { x, y } = tileCenter(tile);
    const image = this.scene.add.image(x, y, `chest-${color}-closed`);
    const chest: ChestRuntime = { color, opened: false, content, image };
    this.chests.push(chest);

    const zone = this.scene.add.zone(x, y, TILE_SIZE * 2, TILE_SIZE * 2);
    this.scene.physics.add.existing(zone, true);
    this.scene.physics.add.overlap(this.player, zone, () => this.handleChestProximity(chest));
  }

  private handleChestProximity(chest: ChestRuntime): void {
    if (chest.opened) {
      return;
    }
    if (!this.keys.has(chest.color)) {
      this.notify.notify(COLOR_META[chest.color].missingKeyText);
      return;
    }
    chest.opened = true;
    chest.image.setTexture(`chest-${chest.color}-open`);
    this.callbacks.onChestOpened(chest.content);
  }

  /**
   * Индикаторы ключей в левом верхнем углу: найденный яркий, нет — тусклый.
   * Больше четырёх цветов — две строки.
   */
  private createIndicators(): void {
    const colors = this.floor.colors;
    const perRow = colors.length > 4 ? Math.ceil(colors.length / 2) : colors.length;
    colors.forEach((color, index) => {
      const row = Math.floor(index / perRow);
      const icon = this.scene.add.image(20 + (index % perRow) * 32, 20 + row * 30, `key-${color}`);
      icon.setScrollFactor(0);
      icon.setDepth(UI_DEPTH);
      icon.setAlpha(0.25);
      this.indicators.set(color, icon);
    });
  }

  private updateIndicators(): void {
    for (const [color, icon] of this.indicators) {
      icon.setAlpha(this.keys.has(color) ? 1 : 0.25);
    }
  }
}
