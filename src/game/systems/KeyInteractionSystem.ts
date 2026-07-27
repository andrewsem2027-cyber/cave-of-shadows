import Phaser from 'phaser';
import { GAME_WIDTH } from '../config';
import { FloorProgression, TILE_SIZE, TilePoint } from '../domain/floor/testFloor';
import { KeyColor, KeyState } from '../domain/progression/KeyState';

const UI_DEPTH = 200;
const SECRET_DEPTH = 150;
const NOTIFY_VISIBLE_MS = 1600;
const PROXIMITY_PADDING = TILE_SIZE;

const KEY_TEXTURE_SIZE = 24;
const DOOR_WIDTH = TILE_SIZE;
const DOOR_HEIGHT = TILE_SIZE * 2;
const CHEST_WIDTH = 28;
const CHEST_HEIGHT = 22;

const KEY_COLORS: Record<KeyColor, number> = {
  blue: 0x4a8cff,
  red: 0xe05252,
};

const MISSING_KEY_TEXT: Record<KeyColor, string> = {
  blue: 'НУЖЕН СИНИЙ КЛЮЧ',
  red: 'НУЖЕН КРАСНЫЙ КЛЮЧ',
};

interface DoorRuntime {
  color: KeyColor;
  opened: boolean;
  image: Phaser.GameObjects.Image;
  body: Phaser.Physics.Arcade.StaticBody;
  collider: Phaser.Physics.Arcade.Collider;
}

interface ChestRuntime {
  color: KeyColor;
  opened: boolean;
  image: Phaser.GameObjects.Image;
}

function tileCenter(tile: TilePoint): { x: number; y: number } {
  return { x: tile.col * TILE_SIZE + TILE_SIZE / 2, y: tile.row * TILE_SIZE + TILE_SIZE / 2 };
}

/**
 * Ключи, двери и сундуки этажа: автоподбор ключей, автоматическое открытие
 * дверей в зоне приближения, разовое открытие сундука, уведомления
 * и индикаторы ключей в углу экрана.
 */
export class KeyInteractionSystem {
  private readonly doors: DoorRuntime[] = [];
  private readonly chests: ChestRuntime[] = [];
  private readonly indicators = new Map<KeyColor, Phaser.GameObjects.Image>();
  private readonly notifyText: Phaser.GameObjects.Text;
  private notifyUntil = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly player: Phaser.Physics.Arcade.Image,
    progression: FloorProgression,
    private readonly keys: KeyState,
  ) {
    this.createTextures();

    for (const key of progression.keys) {
      this.createKey(key.color, key.tile);
    }
    for (const door of progression.doors) {
      this.createDoor(door.color, door.tiles);
    }
    for (const chest of progression.chests) {
      this.createChest(chest.color, chest.tile);
    }

    this.notifyText = scene.add
      .text(GAME_WIDTH / 2, 16, '', { fontSize: '16px', color: '#ffd98a' })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(UI_DEPTH)
      .setVisible(false);

    this.createIndicators();
  }

  /** Временная графика без PNG: синий ромб, красный треугольник. */
  private createTextures(): void {
    const graphics = this.scene.add.graphics();

    for (const color of ['blue', 'red'] as KeyColor[]) {
      const paint = KEY_COLORS[color];
      const half = KEY_TEXTURE_SIZE / 2;

      graphics.fillStyle(paint, 1);
      if (color === 'blue') {
        // Ромб из двух треугольников.
        graphics.fillTriangle(half, 2, 2, half, KEY_TEXTURE_SIZE - 2, half);
        graphics.fillTriangle(half, KEY_TEXTURE_SIZE - 2, 2, half, KEY_TEXTURE_SIZE - 2, half);
      } else {
        graphics.fillTriangle(half, 3, 3, KEY_TEXTURE_SIZE - 3, KEY_TEXTURE_SIZE - 3, KEY_TEXTURE_SIZE - 3);
      }
      graphics.generateTexture(`key-${color}`, KEY_TEXTURE_SIZE, KEY_TEXTURE_SIZE);
      graphics.clear();

      // Дверь: цветная панель с символом цвета по центру.
      graphics.fillStyle(paint, 1);
      graphics.fillRect(0, 0, DOOR_WIDTH, DOOR_HEIGHT);
      graphics.fillStyle(0x101018, 1);
      if (color === 'blue') {
        graphics.fillTriangle(
          DOOR_WIDTH / 2,
          DOOR_HEIGHT / 2 - 9,
          DOOR_WIDTH / 2 - 9,
          DOOR_HEIGHT / 2,
          DOOR_WIDTH / 2 + 9,
          DOOR_HEIGHT / 2,
        );
        graphics.fillTriangle(
          DOOR_WIDTH / 2,
          DOOR_HEIGHT / 2 + 9,
          DOOR_WIDTH / 2 - 9,
          DOOR_HEIGHT / 2,
          DOOR_WIDTH / 2 + 9,
          DOOR_HEIGHT / 2,
        );
      } else {
        graphics.fillTriangle(
          DOOR_WIDTH / 2,
          DOOR_HEIGHT / 2 - 9,
          DOOR_WIDTH / 2 - 9,
          DOOR_HEIGHT / 2 + 8,
          DOOR_WIDTH / 2 + 9,
          DOOR_HEIGHT / 2 + 8,
        );
      }
      graphics.generateTexture(`door-${color}`, DOOR_WIDTH, DOOR_HEIGHT);
      graphics.clear();

      // Сундук: закрытый — крышка и символ, открытый — тёмный проём и свечение.
      graphics.fillStyle(paint, 1);
      graphics.fillRect(0, 0, CHEST_WIDTH, CHEST_HEIGHT);
      graphics.fillStyle(0x101018, 1);
      graphics.fillRect(0, 7, CHEST_WIDTH, 2);
      graphics.fillTriangle(CHEST_WIDTH / 2, 3, CHEST_WIDTH / 2 - 5, 11, CHEST_WIDTH / 2 + 5, 11);
      graphics.generateTexture(`chest-${color}-closed`, CHEST_WIDTH, CHEST_HEIGHT);
      graphics.clear();

      graphics.fillStyle(paint, 1);
      graphics.fillRect(0, 8, CHEST_WIDTH, CHEST_HEIGHT - 8);
      graphics.fillRect(0, 0, CHEST_WIDTH, 3);
      graphics.fillStyle(0x101018, 1);
      graphics.fillRect(2, 5, CHEST_WIDTH - 4, 5);
      graphics.fillStyle(0xffe9a8, 1);
      graphics.fillRect(CHEST_WIDTH / 2 - 3, 6, 6, 3);
      graphics.generateTexture(`chest-${color}-open`, CHEST_WIDTH, CHEST_HEIGHT);
      graphics.clear();
    }

    graphics.destroy();
  }

  private createKey(color: KeyColor, tile: TilePoint): void {
    const { x, y } = tileCenter(tile);
    const image = this.scene.add.image(x, y, `key-${color}`);

    const zone = this.scene.add.zone(x, y, TILE_SIZE, TILE_SIZE);
    this.scene.physics.add.existing(zone, true);
    this.scene.physics.add.overlap(this.player, zone, () => {
      this.keys.add(color);
      image.destroy();
      zone.destroy();
      this.updateIndicators();
    });
  }

  private createDoor(color: KeyColor, tiles: TilePoint[]): void {
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

    const door: DoorRuntime = { color, opened: false, image, body, collider };
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
      this.showNotification(MISSING_KEY_TEXT[door.color]);
      return;
    }
    door.opened = true;
    door.collider.destroy();
    door.body.enable = false;
    door.image.destroy();
  }

  private createChest(color: KeyColor, tile: TilePoint): void {
    const { x, y } = tileCenter(tile);
    const image = this.scene.add.image(x, y, `chest-${color}-closed`);
    const chest: ChestRuntime = { color, opened: false, image };
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
      this.showNotification(MISSING_KEY_TEXT[chest.color]);
      return;
    }
    chest.opened = true;
    chest.image.setTexture(`chest-${chest.color}-open`);
    this.scene.add
      .text(chest.image.x, chest.image.y - TILE_SIZE, 'СЕКРЕТ НАЙДЕН', {
        fontSize: '14px',
        color: '#ffe9a8',
      })
      .setOrigin(0.5, 1)
      .setDepth(SECRET_DEPTH);
  }

  /** Индикаторы ключей в левом верхнем углу: найденный яркий, нет — тусклый. */
  private createIndicators(): void {
    const colors: KeyColor[] = ['blue', 'red'];
    colors.forEach((color, index) => {
      const icon = this.scene.add.image(20 + index * 32, 20, `key-${color}`);
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

  /** Одно переиспользуемое сообщение с cooldown, без спама каждый кадр. */
  private showNotification(text: string): void {
    const now = this.scene.time.now;
    if (now < this.notifyUntil) {
      return;
    }
    this.notifyUntil = now + NOTIFY_VISIBLE_MS;
    this.notifyText.setText(text);
    this.notifyText.setVisible(true);
    this.scene.time.delayedCall(NOTIFY_VISIBLE_MS, () => {
      if (this.scene.time.now >= this.notifyUntil) {
        this.notifyText.setVisible(false);
      }
    });
  }
}
