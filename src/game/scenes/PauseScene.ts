import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config';
import { GameScene } from './GameScene';
import { MenuList } from './menuList';

const COLOR_TITLE = '#c8d4ff';
const COLOR_SUBTLE = '#9fb4ff';

export interface PauseSceneData {
  floorId: string;
}

/**
 * Overlay-сцена паузы: игровая сцена остановлена через scene.pause,
 * её таймеры, твины и физика не продолжаются. Повторное открытие
 * блокируется флагом pausedOverlay в GameScene.
 */
export class PauseScene extends Phaser.Scene {
  private floorId!: string;
  private menu: MenuList | null = null;
  private viewObjects: Phaser.GameObjects.GameObject[] = [];
  private confirmRestart = false;

  constructor() {
    super('PauseScene');
  }

  create(data: PauseSceneData): void {
    this.floorId = data.floorId;
    this.confirmRestart = false;

    // Затемнение поверх игры; блокирует ввод нижележащей сцены.
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x050510, 0.72).setOrigin(0).setInteractive();
    this.add
      .text(GAME_WIDTH / 2, 110, 'ПАУЗА', { fontSize: '36px', color: COLOR_TITLE })
      .setOrigin(0.5, 0);

    this.showMain();

    const keyboard = this.input.keyboard;
    if (keyboard) {
      keyboard.on('keydown-UP', () => this.menu?.move(-1));
      keyboard.on('keydown-W', () => this.menu?.move(-1));
      keyboard.on('keydown-DOWN', () => this.menu?.move(1));
      keyboard.on('keydown-S', () => this.menu?.move(1));
      keyboard.on('keydown-ENTER', () => this.menu?.activate());
      keyboard.on('keydown-SPACE', () => this.menu?.activate());
      keyboard.on('keydown-ESC', () => this.handleEscape());
      keyboard.on('keydown-P', () => this.handleEscape());
    }
  }

  private clearView(): void {
    this.menu?.destroy();
    this.menu = null;
    for (const object of this.viewObjects) {
      object.destroy();
    }
    this.viewObjects = [];
  }

  private handleEscape(): void {
    if (this.confirmRestart) {
      this.showMain();
      return;
    }
    this.resumeGame();
  }

  private showMain(): void {
    this.clearView();
    this.confirmRestart = false;

    this.menu = new MenuList(this, GAME_WIDTH / 2, 220, [
      { label: 'ПРОДОЛЖИТЬ', action: () => this.resumeGame() },
      { label: 'ПЕРЕЗАПУСТИТЬ ЭТАЖ', action: () => this.showConfirmRestart() },
      { label: 'В ГЛАВНОЕ МЕНЮ', action: () => this.goToMenu() },
    ]);
  }

  /** Перезапуск этажа требует подтверждения. */
  private showConfirmRestart(): void {
    this.clearView();
    this.confirmRestart = true;

    this.viewObjects.push(
      this.add
        .text(GAME_WIDTH / 2, 180, 'НАЧАТЬ ЭТАЖ ЗАНОВО? ПРОГРЕСС ЭТАЖА СБРОСИТСЯ', {
          fontSize: '16px',
          color: COLOR_SUBTLE,
        })
        .setOrigin(0.5, 0),
    );

    this.menu = new MenuList(this, GAME_WIDTH / 2, 250, [
      { label: 'ДА', action: () => this.restartFloor() },
      { label: 'НЕТ', action: () => this.showMain() },
    ]);
  }

  private resumeGame(): void {
    const gameScene = this.scene.get('GameScene') as GameScene;
    this.scene.stop();
    this.scene.resume('GameScene');
    gameScene.resumeFromPause();
  }

  private restartFloor(): void {
    this.scene.stop('GameScene');
    // start останавливает текущую сцену паузы и запускает игровую заново.
    this.scene.start('GameScene', { floorId: this.floorId });
  }

  private goToMenu(): void {
    this.scene.stop('GameScene');
    this.scene.start('MenuScene');
  }
}
