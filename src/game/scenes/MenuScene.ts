import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config';
import { COLOR_META, GAME_COLORS } from '../domain/colors/GameColor';
import { FLOORS } from '../domain/floor/floors';
import { createDefaultSave } from '../domain/save/SaveData';
import { clearSave, loadSave, writeSave } from '../domain/save/saveStorage';
import { resetTutorialSession } from '../systems/TutorialSystem';
import { ensureColorTextures } from '../world/colorTextures';
import { MenuList } from './menuList';

const COLOR_BACKGROUND = 0x0a0a12;
const COLOR_TITLE = '#c8d4ff';
const COLOR_SUBTLE = '#9fb4ff';

const CONTROLS_TEXT = [
  'WASD / СТРЕЛКИ — ДВИЖЕНИЕ',
  'F — ФОНАРЬ',
  'SPACE — СВЕТОВАЯ ВСПЫШКА',
  'ESC / P — ПАУЗА',
  'КЛЮЧИ И КРИСТАЛЛЫ ПОДБИРАЮТСЯ АВТОМАТИЧЕСКИ',
];

type MenuView = 'main' | 'collection' | 'controls' | 'confirmNewGame';

/**
 * Главное меню: новая игра (с подтверждением при сохранении),
 * продолжение валидного сохранения, коллекция кристаллов, управление.
 */
export class MenuScene extends Phaser.Scene {
  private view: MenuView = 'main';
  private menu: MenuList | null = null;
  private viewObjects: Phaser.GameObjects.GameObject[] = [];

  constructor() {
    super('MenuScene');
  }

  create(): void {
    this.cameras.main.setBackgroundColor(COLOR_BACKGROUND);
    ensureColorTextures(this);

    this.add
      .text(GAME_WIDTH / 2, 70, 'ПЕЩЕРА ТЕНЕЙ', { fontSize: '40px', color: COLOR_TITLE })
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
      keyboard.on('keydown-ESC', () => {
        if (this.view !== 'main') {
          this.showMain();
        }
      });
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

  private showMain(): void {
    this.clearView();
    this.view = 'main';

    const save = loadSave();
    this.menu = new MenuList(this, GAME_WIDTH / 2, 200, [
      { label: 'НОВАЯ ИГРА', action: () => this.handleNewGame() },
      // Продолжение доступно только при валидном сохранении.
      { label: 'ПРОДОЛЖИТЬ', action: () => this.continueGame(), enabled: save !== null },
      { label: 'КОЛЛЕКЦИЯ', action: () => this.showCollection() },
      { label: 'УПРАВЛЕНИЕ', action: () => this.showControls() },
    ]);
  }

  /** При существующем сохранении новая игра требует подтверждения. */
  private handleNewGame(): void {
    if (loadSave() !== null) {
      this.showConfirmNewGame();
      return;
    }
    this.startNewGame();
  }

  private showConfirmNewGame(): void {
    this.clearView();
    this.view = 'confirmNewGame';

    this.viewObjects.push(
      this.add
        .text(GAME_WIDTH / 2, 180, 'СТЕРЕТЬ ПРОГРЕСС И НАЧАТЬ ЗАНОВО?', {
          fontSize: '18px',
          color: COLOR_SUBTLE,
        })
        .setOrigin(0.5, 0),
    );

    this.menu = new MenuList(this, GAME_WIDTH / 2, 260, [
      { label: 'ДА', action: () => this.startNewGame() },
      { label: 'НЕТ', action: () => this.showMain() },
    ]);
  }

  /** Подтверждённая новая игра: очистка кристаллов, зарядов и завершения. */
  private startNewGame(): void {
    clearSave();
    writeSave(createDefaultSave());
    resetTutorialSession();
    this.scene.start('GameScene', { floorId: FLOORS[0].id });
  }

  private continueGame(): void {
    const save = loadSave();
    if (save === null) {
      return;
    }
    this.scene.start('GameScene', { floorId: save.currentFloorId });
  }

  /** Коллекция: шесть ячеек, найденные яркие, ненайденные тусклые. */
  private showCollection(): void {
    this.clearView();
    this.view = 'collection';

    const save = loadSave() ?? createDefaultSave();

    this.viewObjects.push(
      this.add
        .text(GAME_WIDTH / 2, 150, `КРИСТАЛЛЫ: ${save.collectedCrystals.length}/${GAME_COLORS.length}`, {
          fontSize: '20px',
          color: COLOR_SUBTLE,
        })
        .setOrigin(0.5, 0),
    );

    GAME_COLORS.forEach((color, index) => {
      const col = index % 3;
      const row = Math.floor(index / 3);
      const x = GAME_WIDTH / 2 + (col - 1) * 200;
      const y = 230 + row * 130;
      const found = save.collectedCrystals.includes(color);

      const icon = this.add.image(x, y, `crystal-${color}`);
      icon.setAlpha(found ? 1 : 0.25);
      this.viewObjects.push(icon);

      this.viewObjects.push(
        this.add
          .text(x, y + 30, COLOR_META[color].nameRu, { fontSize: '14px', color: COLOR_SUBTLE })
          .setOrigin(0.5, 0)
          .setAlpha(found ? 1 : 0.4),
      );
    });

    this.menu = new MenuList(this, GAME_WIDTH / 2, GAME_HEIGHT - 90, [
      { label: 'НАЗАД', action: () => this.showMain() },
    ]);
  }

  private showControls(): void {
    this.clearView();
    this.view = 'controls';

    CONTROLS_TEXT.forEach((line, index) => {
      this.viewObjects.push(
        this.add
          .text(GAME_WIDTH / 2, 170 + index * 34, line, { fontSize: '18px', color: COLOR_SUBTLE })
          .setOrigin(0.5, 0),
      );
    });

    this.menu = new MenuList(this, GAME_WIDTH / 2, GAME_HEIGHT - 90, [
      { label: 'НАЗАД', action: () => this.showMain() },
    ]);
  }
}
