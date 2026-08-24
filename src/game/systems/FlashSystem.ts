import Phaser from 'phaser';
import { TILE_SIZE } from '../domain/floor/types';
import { GridPoint } from '../domain/pathfinding/findGridPath';
import { hasGridLineOfSight } from '../domain/visibility/hasGridLineOfSight';
import { GuardianSystem } from './GuardianSystem';
import { NotificationSystem } from './NotificationSystem';

/** Дальность вспышки в клетках. */
const FLASH_RANGE_CELLS = 4;
/** Длительность остановки стража. */
const FLASH_STUN_MS = 3000;
const RING_EFFECT_MS = 400;
/** Кольцо видно сквозь темноту, но ниже HUD. */
const RING_DEPTH = 150;
const RING_TEXTURE = 'flash-ring';
const RING_TEXTURE_SIZE = 128;

export interface FlashCallbacks {
  /** Текущее число зарядов. */
  getCharges(): number;
  /** Списать один заряд (уже проверено, что он есть). */
  spendCharge(): void;
  /** Герой жив, возрождение не идёт, игра не на паузе, переход не запущен. */
  canAct(): boolean;
}

/**
 * Защитная световая вспышка: тратит заряд только при успехе —
 * страж не спит, в пределах четырёх клеток и на прямой видимости.
 * Успех — существующая временная пауза стража на 3000 мс без усыпления
 * и телепортации; после паузы продолжается сохранённый шаг.
 */
export class FlashSystem {
  private ringTween: Phaser.Tweens.Tween | null = null;
  private ringImage: Phaser.GameObjects.Image | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly player: Phaser.Physics.Arcade.Image,
    private readonly guardian: GuardianSystem,
    /** Непрозрачность для обзора: стены, закрытые двери, клетки вне карты. */
    private readonly isOpaqueTile: (col: number, row: number) => boolean,
    private readonly notify: NotificationSystem,
    private readonly callbacks: FlashCallbacks,
  ) {
    this.createRingTexture();

    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
  }

  /** Попытка применить вспышку; неуспешная попытка заряд не расходует. */
  tryFlash(): void {
    if (!this.callbacks.canAct()) {
      return;
    }
    if (this.callbacks.getCharges() <= 0) {
      this.notify.notify('НЕТ ЗАРЯДОВ');
      return;
    }
    // Спящий страж не опасен: без расхода заряда и без сообщения.
    if (this.guardian.isSleeping) {
      return;
    }

    const playerCell = this.currentCell(this.player.x, this.player.y);
    const guardianCell = this.guardian.cell;
    const dc = guardianCell.col - playerCell.col;
    const dr = guardianCell.row - playerCell.row;

    if (dc * dc + dr * dr > FLASH_RANGE_CELLS * FLASH_RANGE_CELLS) {
      this.notify.notify('СТРАЖ СЛИШКОМ ДАЛЕКО');
      return;
    }
    if (!hasGridLineOfSight(playerCell, guardianCell, this.isOpaqueTile)) {
      this.notify.notify('СВЕТ НЕ ДОСТАЁТ');
      return;
    }

    // Успех: списать заряд, показать кольцо, временно остановить стража.
    this.callbacks.spendCharge();
    this.playRingEffect();
    this.guardian.pauseFor(FLASH_STUN_MS);
  }

  private currentCell(x: number, y: number): GridPoint {
    return { col: Math.floor(x / TILE_SIZE), row: Math.floor(y / TILE_SIZE) };
  }

  /** Белое кольцо без внешних PNG. */
  private createRingTexture(): void {
    if (this.scene.textures.exists(RING_TEXTURE)) {
      return;
    }
    const graphics = this.scene.add.graphics();
    graphics.lineStyle(6, 0xfff3c4, 1);
    graphics.strokeCircle(RING_TEXTURE_SIZE / 2, RING_TEXTURE_SIZE / 2, RING_TEXTURE_SIZE / 2 - 6);
    graphics.generateTexture(RING_TEXTURE, RING_TEXTURE_SIZE, RING_TEXTURE_SIZE);
    graphics.destroy();
  }

  /** Короткий эффект светового кольца вокруг героя. */
  private playRingEffect(): void {
    this.ringTween?.stop();
    this.ringImage?.destroy();

    this.ringImage = this.scene.add.image(this.player.x, this.player.y, RING_TEXTURE);
    this.ringImage.setDepth(RING_DEPTH);
    this.ringImage.setScale(0.25);
    this.ringImage.setAlpha(1);

    this.ringTween = this.scene.tweens.add({
      targets: this.ringImage,
      scale: 2.4,
      alpha: 0,
      duration: RING_EFFECT_MS,
      onComplete: () => {
        this.ringImage?.destroy();
        this.ringImage = null;
        this.ringTween = null;
      },
    });
  }

  private destroy(): void {
    this.ringTween?.stop();
    this.ringTween = null;
    this.ringImage?.destroy();
    this.ringImage = null;
  }
}
