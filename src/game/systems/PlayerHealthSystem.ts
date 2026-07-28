import Phaser from 'phaser';
import { GAME_WIDTH } from '../config';

const MAX_HEARTS = 3;
const INVULNERABILITY_MS = 1500;
const BLINK_HALF_PERIOD_MS = 120;

const HEART_SIZE = 24;
const HEART_GAP = 6;
const HEART_Y = 20;
const HEART_MARGIN_RIGHT = 24;
const HEART_ALPHA_FULL = 1;
const HEART_ALPHA_LOST = 0.22;
const UI_DEPTH = 200;

const COLOR_HEART = 0xff5b7a;

export type DamageResult = 'ignored' | 'damaged' | 'dead';

/**
 * Здоровье героя: 3 сердца, неуязвимость 1500 мс после урона, мигание,
 * индикатор сердец поверх слоя темноты. Сама система не знает о страже
 * и смерти — только считает урон и управляет своим визуалом.
 */
export class PlayerHealthSystem {
  private hearts = MAX_HEARTS;
  private invulnerable = false;
  private dead = false;
  private invulnerabilityTimer: Phaser.Time.TimerEvent | null = null;
  private blinkTween: Phaser.Tweens.Tween | null = null;
  private readonly heartIcons: Phaser.GameObjects.Image[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly player: Phaser.Physics.Arcade.Image,
  ) {
    this.createHeartTexture();
    this.createHearts();

    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.destroy();
    });
  }

  get isDead(): boolean {
    return this.dead;
  }

  /** Пиксельное сердце 24×24 без внешних ассетов. */
  private createHeartTexture(): void {
    if (this.scene.textures.exists('heart')) {
      return;
    }
    const graphics = this.scene.add.graphics();
    graphics.fillStyle(COLOR_HEART, 1);
    graphics.fillCircle(8, 9, 5);
    graphics.fillCircle(16, 9, 5);
    graphics.fillTriangle(3, 11, 21, 11, 12, 22);
    graphics.generateTexture('heart', HEART_SIZE, HEART_SIZE);
    graphics.destroy();
  }

  /** Три сердца в правом верхнем углу: ключи слева, сердца справа. */
  private createHearts(): void {
    const totalWidth = MAX_HEARTS * HEART_SIZE + (MAX_HEARTS - 1) * HEART_GAP;
    const startX = GAME_WIDTH - HEART_MARGIN_RIGHT - totalWidth + HEART_SIZE / 2;
    for (let index = 0; index < MAX_HEARTS; index++) {
      const icon = this.scene.add.image(startX + index * (HEART_SIZE + HEART_GAP), HEART_Y, 'heart');
      icon.setScrollFactor(0);
      icon.setDepth(UI_DEPTH);
      this.heartIcons.push(icon);
    }
  }

  private updateHearts(): void {
    this.heartIcons.forEach((icon, index) => {
      icon.setAlpha(index < this.hearts ? HEART_ALPHA_FULL : HEART_ALPHA_LOST);
    });
  }

  private stopBlink(): void {
    this.blinkTween?.stop();
    this.blinkTween = null;
    this.player.setAlpha(1);
  }

  private clearInvulnerabilityTimer(): void {
    this.invulnerabilityTimer?.remove(false);
    this.invulnerabilityTimer = null;
  }

  /**
   * Одно касание стража. Во время неуязвимости или смерти — 'ignored',
   * новые таймеры при этом не создаются.
   */
  takeDamage(): DamageResult {
    if (this.dead || this.invulnerable) {
      return 'ignored';
    }

    this.hearts -= 1;
    this.updateHearts();

    if (this.hearts <= 0) {
      this.dead = true;
      this.stopBlink();
      return 'dead';
    }

    this.invulnerable = true;
    this.stopBlink();
    this.blinkTween = this.scene.tweens.add({
      targets: this.player,
      alpha: 0.25,
      duration: BLINK_HALF_PERIOD_MS,
      yoyo: true,
      repeat: -1,
    });
    this.clearInvulnerabilityTimer();
    this.invulnerabilityTimer = this.scene.time.delayedCall(INVULNERABILITY_MS, () => {
      this.invulnerabilityTimer = null;
      this.invulnerable = false;
      this.stopBlink();
    });

    return 'damaged';
  }

  /** Полное восстановление после возрождения. */
  reset(): void {
    this.clearInvulnerabilityTimer();
    this.stopBlink();
    this.hearts = MAX_HEARTS;
    this.invulnerable = false;
    this.dead = false;
    this.updateHearts();
  }

  destroy(): void {
    this.clearInvulnerabilityTimer();
    this.stopBlink();
    for (const icon of this.heartIcons) {
      icon.destroy();
    }
    this.heartIcons.length = 0;
  }
}
