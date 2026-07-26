import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config';

export const LANTERN_ON_RADIUS = 190;
export const LANTERN_OFF_RADIUS = 80;

const DARKNESS_COLOR = 0x050510;
const DARKNESS_ALPHA = 0.96;
const TOGGLE_TWEEN_MS = 200;
const SOFT_EDGE_WIDTH = 28;
const SOFT_EDGE_STEPS = 7;
const DARKNESS_DEPTH = 100;

const LIGHT_TEXTURE = 'lantern-light';
const LIGHT_TEXTURE_SIZE = (LANTERN_ON_RADIUS + SOFT_EDGE_WIDTH) * 2;

/**
 * Фонарь и темнота: состояние фонаря, тёмный слой поверх мира и
 * мягкая зона видимости вокруг заданной точки.
 */
export class LightingSystem {
  private isOn = true;
  private currentRadius = LANTERN_ON_RADIUS;
  private radiusTween: Phaser.Tweens.Tween | null = null;
  private darkness: Phaser.GameObjects.RenderTexture;
  private stamp: Phaser.GameObjects.Image;

  constructor(private readonly scene: Phaser.Scene) {
    this.createLightTexture();

    this.darkness = scene.add.renderTexture(0, 0, GAME_WIDTH, GAME_HEIGHT);
    this.darkness.setOrigin(0, 0);
    this.darkness.setDepth(DARKNESS_DEPTH);
    // Слой закреплён относительно экрана: камера движется по миру, темнота нет.
    this.darkness.setScrollFactor(0);

    // Штамп света: не добавляется в Display List, используется только
    // как источник для erase вместе со своими позицией и масштабом.
    this.stamp = new Phaser.GameObjects.Image(scene, 0, 0, LIGHT_TEXTURE);

    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
  }

  get lanternOn(): boolean {
    return this.isOn;
  }

  toggle(): void {
    this.isOn = !this.isOn;
    this.radiusTween?.stop();
    this.radiusTween = this.scene.tweens.add({
      targets: this,
      currentRadius: this.isOn ? LANTERN_ON_RADIUS : LANTERN_OFF_RADIUS,
      duration: TOGGLE_TWEEN_MS,
    });
  }

  /** Принимает мировые координаты игрока, переводит их в экранные. */
  update(playerX: number, playerY: number): void {
    const camera = this.scene.cameras.main;
    this.stamp.setPosition(playerX - camera.scrollX, playerY - camera.scrollY);
    this.stamp.setScale(this.currentRadius / LANTERN_ON_RADIUS);

    this.darkness.clear();
    this.darkness.fill(DARKNESS_COLOR, DARKNESS_ALPHA);
    this.darkness.erase(this.stamp);
    // В Phaser 4 операции DynamicTexture буферизуются: без render() они не попадают в текстуру.
    this.darkness.render();
  }

  /** Мягкий световой круг: непрозрачная середина и кромка с убывающей альфой. */
  private createLightTexture(): void {
    if (this.scene.textures.exists(LIGHT_TEXTURE)) {
      return;
    }

    const center = LIGHT_TEXTURE_SIZE / 2;
    const graphics = this.scene.add.graphics();

    for (let step = SOFT_EDGE_STEPS; step >= 0; step--) {
      const alpha = 1 - step / SOFT_EDGE_STEPS;
      const radius = LANTERN_ON_RADIUS + (SOFT_EDGE_WIDTH * step) / SOFT_EDGE_STEPS;
      graphics.fillStyle(0xffffff, alpha);
      graphics.fillCircle(center, center, radius);
    }

    graphics.generateTexture(LIGHT_TEXTURE, LIGHT_TEXTURE_SIZE, LIGHT_TEXTURE_SIZE);
    graphics.destroy();
  }

  private destroy(): void {
    this.radiusTween?.stop();
    this.radiusTween = null;
    this.stamp.destroy();
    this.darkness.destroy();
  }
}
