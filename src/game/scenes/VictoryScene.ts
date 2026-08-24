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
const COLOR_TITLE = '#ffd98a';
const COLOR_SUBTLE = '#9fb4ff';

/**
 * Финальная сцена после зоны выхода третьего этажа.
 * Возвращение в меню не очищает коллекцию.
 */
export class VictoryScene extends Phaser.Scene {
  private menu: MenuList | null = null;
  private viewObjects: Phaser.GameObjects.GameObject[] = [];
  private confirmNewGame = false;

  constructor() {
    super('VictoryScene');
  }

  create(): void {
    this.cameras.main.setBackgroundColor(COLOR_BACKGROUND);
    ensureColorTextures(this);
    this.confirmNewGame = false;

    const save = loadSave() ?? createDefaultSave();

    this.add
      .text(GAME_WIDTH / 2, 70, 'ТЫ ВЫБРАЛСЯ!', { fontSize: '44px', color: COLOR_TITLE })
      .setOrigin(0.5, 0);

    this.add
      .text(GAME_WIDTH / 2, 150, `КРИСТАЛЛЫ: ${save.collectedCrystals.length}/${GAME_COLORS.length}`, {
        fontSize: '20px',
        color: COLOR_SUBTLE,
      })
      .setOrigin(0.5, 0);

    // Шесть символов: найденные яркие, пропущенные тусклые.
    GAME_COLORS.forEach((color, index) => {
      const x = GAME_WIDTH / 2 + (index - (GAME_COLORS.length - 1) / 2) * 110;
      const found = save.collectedCrystals.includes(color);

      const icon = this.add.image(x, 240, `crystal-${color}`);
      icon.setAlpha(found ? 1 : 0.25);

      this.add
        .text(x, 270, COLOR_META[color].nameRu, { fontSize: '12px', color: COLOR_SUBTLE })
        .setOrigin(0.5, 0)
        .setAlpha(found ? 1 : 0.4);
    });

    if (save.collectedCrystals.length === GAME_COLORS.length) {
      this.add
        .text(GAME_WIDTH / 2, 320, 'ВСЕ КРИСТАЛЛЫ НАЙДЕНЫ', { fontSize: '22px', color: COLOR_TITLE })
        .setOrigin(0.5, 0);
    }

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
        if (this.confirmNewGame) {
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
    this.confirmNewGame = false;

    this.menu = new MenuList(this, GAME_WIDTH / 2, GAME_HEIGHT - 150, [
      { label: 'В ГЛАВНОЕ МЕНЮ', action: () => this.scene.start('MenuScene') },
      { label: 'НОВАЯ ИГРА', action: () => this.showConfirmNewGame() },
    ]);
  }

    /** Новая игра после финала также стирает прогресс — нужно подтверждение. */
  private showConfirmNewGame(): void {
    this.clearView();
    this.confirmNewGame = true;

    this.viewObjects.push(
      this.add
        .text(GAME_WIDTH / 2, GAME_HEIGHT - 210, 'СТЕРЕТЬ ПРОГРЕСС И НАЧАТЬ ЗАНОВО?', {
          fontSize: '16px',
          color: COLOR_SUBTLE,
        })
        .setOrigin(0.5, 0),
    );

    this.menu = new MenuList(this, GAME_WIDTH / 2, GAME_HEIGHT - 150, [
      { label: 'ДА', action: () => this.startNewGame() },
      { label: 'НЕТ', action: () => this.showMain() },
    ]);
  }

  private startNewGame(): void {
    clearSave();
    writeSave(createDefaultSave());
    resetTutorialSession();
    this.scene.start('GameScene', { floorId: FLOORS[0].id });
  }
}
