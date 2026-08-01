import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config';
import { ALL_CRYSTALS, FIRST_FLOOR, getFloorById, getNextFloor } from '../domain/floor/floors';
import { FloorDefinition, TILE_SIZE, rectContains } from '../domain/floor/types';
import { KeyState } from '../domain/progression/KeyState';
import { MAX_FLASH_CHARGES, SaveData, createDefaultSave } from '../domain/save/SaveData';
import { loadSave, writeSave } from '../domain/save/saveStorage';
import { FlashSystem } from '../systems/FlashSystem';
import { GuardianSystem } from '../systems/GuardianSystem';
import { LightingSystem } from '../systems/LightingSystem';
import { NotificationSystem } from '../systems/NotificationSystem';
import { PlayerHealthSystem } from '../systems/PlayerHealthSystem';
import { ProgressionSystem } from '../systems/ProgressionSystem';
import { TutorialSystem } from '../systems/TutorialSystem';
import { FloorView } from '../world/FloorView';

const PLAYER_SPEED = 160;
const PLAYER_SIZE = 26;

const DPAD_BUTTON_SIZE = 60;
const DPAD_GAP = 8;
const DPAD_MARGIN = 24;
const DPAD_ALPHA_IDLE = 0.4;
const DPAD_ALPHA_PRESSED = 0.75;

const LANTERN_BUTTON_SIZE = 64;
const FLASH_BUTTON_SIZE = 64;
const PAUSE_BUTTON_SIZE = 40;
const UI_DEPTH = 200;

const CAMERA_LERP = 0.12;

const GUARDIAN_PAUSE_AFTER_HIT_MS = 700;
const GUARDIAN_WAKE_DELAY_MS = 3000;
const DEATH_FADE_MS = 700;
const DEATH_HOLD_MS = 900;
const RESPAWN_FADE_MS = 400;
const TRANSITION_FADE_MS = 450;
const START_FADE_MS = 400;
const TITLE_HOLD_MS = 1800;
const TITLE_FADE_MS = 500;

const COLOR_BACKGROUND = 0x0a0a12;
const COLOR_PLAYER = 0x7a68e0;
const COLOR_PLAYER_EYES = 0xdff6ff;
const COLOR_DPAD = 0x3a4368;
const COLOR_DPAD_ARROW = 0x9fb4ff;
const COLOR_LANTERN_ON = 0xffd98a;
const COLOR_LANTERN_OFF = 0x5a6285;

type Direction = 'up' | 'down' | 'left' | 'right';

const DIRECTIONS: Direction[] = ['up', 'down', 'left', 'right'];

export interface GameSceneData {
  floorId?: string;
}

export class GameScene extends Phaser.Scene {
  private floor!: FloorDefinition;
  private player!: Phaser.Physics.Arcade.Image;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasdKeys!: Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;
  private lanternKey!: Phaser.Input.Keyboard.Key;
  private flashKey!: Phaser.Input.Keyboard.Key;
  private escKey!: Phaser.Input.Keyboard.Key;
  private pauseKey!: Phaser.Input.Keyboard.Key;
  private lighting!: LightingSystem;
  private notify!: NotificationSystem;
  private tutorial!: TutorialSystem;
  private lanternButton!: Phaser.GameObjects.Image;
  private lanternLabel!: Phaser.GameObjects.Text;
  private flashButton!: Phaser.GameObjects.Image;
  private pauseButton!: Phaser.GameObjects.Image;
  private crystalsText!: Phaser.GameObjects.Text;
  private chargesText!: Phaser.GameObjects.Text;
  private dpadButtons!: Record<Direction, Phaser.GameObjects.Image>;
  private dpadPointers: Record<Direction, Set<number>> = {
    up: new Set(),
    down: new Set(),
    left: new Set(),
    right: new Set(),
  };
  private moveVector = new Phaser.Math.Vector2(0, 0);
  private floorView!: FloorView;
  private keyState!: KeyState;
  private progression!: ProgressionSystem;
  private guardian!: GuardianSystem;
  private health!: PlayerHealthSystem;
  private flash!: FlashSystem;
  private save!: SaveData;
  /** Игра начинается в безопасной комнате. */
  private playerIsSafe = true;
  private isRespawning = false;
  private transitioning = false;
  /** Игра остановлена overlay-сценой паузы. */
  private pausedOverlay = false;
  private guardianWakeTimer: Phaser.Time.TimerEvent | null = null;
  private deathTimer: Phaser.Time.TimerEvent | null = null;
  private deathText: Phaser.GameObjects.Text | null = null;

  constructor() {
    super('GameScene');
  }

  create(data: GameSceneData): void {
    this.cameras.main.setBackgroundColor(COLOR_BACKGROUND);

    this.floor = getFloorById(data.floorId ?? '') ?? FIRST_FLOOR;
    this.playerIsSafe = true;
    this.isRespawning = false;
    this.transitioning = false;
    this.pausedOverlay = false;

    // Глобальный прогресс: продолжение сохранённого этажа или новая игра.
    this.save = loadSave() ?? createDefaultSave();
    this.save.currentFloorId = this.floor.id;
    writeSave(this.save);

    this.createTextures();

    this.floorView = new FloorView(this, this.floor);
    this.physics.world.setBounds(0, 0, this.floorView.widthPixels, this.floorView.heightPixels);

    this.createPlayer();
    this.createCamera();
    this.createKeyboard();

    this.notify = new NotificationSystem(this);
    this.tutorial = new TutorialSystem(this.floor.order === 1, this.notify);

    this.keyState = new KeyState();
    this.progression = new ProgressionSystem(
      this,
      this.player,
      this.floor,
      this.keyState,
      new Set(this.save.collectedCrystals),
      this.notify,
      {
        onKeyCollected: () => {
          this.tutorial.showOnce('keys', 'КЛЮЧИ ОТКРЫВАЮТ ОБЪЕКТЫ ТОГО ЖЕ СИМВОЛА');
        },
        onCrystalCollected: (color) => {
          // Кристалл сохраняется сразу и больше не появляется.
          if (!this.save.collectedCrystals.includes(color)) {
            this.save.collectedCrystals.push(color);
            writeSave(this.save);
          }
          this.notify.notify('КРИСТАЛЛ НАЙДЕН');
          this.tutorial.showOnce('crystals', 'КРИСТАЛЛЫ СПРЯТАНЫ В НЕОБЯЗАТЕЛЬНЫХ МЕСТАХ');
          this.updateCrystalsHud();
        },
        onChestOpened: (content) => {
          if (content.kind === 'flashCharge') {
            this.addFlashCharge();
          } else {
            this.notify.notify(content.message);
          }
        },
      },
    );

    this.guardian = new GuardianSystem(
      this,
      this.player,
      this.floor.grid,
      this.floor.cols,
      this.floor.rows,
      this.floor.guardianStart,
      this.floor.guardianSpeed,
      (col, row) => this.progression.isDoorClosedAt(col, row),
      // Единый callback непрозрачности: стены и клетки вне карты плюс закрытые двери.
      (col, row) => this.floorView.isOpaqueTile(col, row) || this.progression.isDoorClosedAt(col, row),
      () => this.lighting.isLanternOn,
      this.floorView.solids,
    );
    // Игра начинается в безопасной комнате: страж изначально спит.
    this.guardian.sleep();

    this.health = new PlayerHealthSystem(this, this.player);
    this.physics.add.overlap(this.player, this.guardian.gameObject, () => {
      this.handleGuardianContact();
    });

    this.flash = new FlashSystem(
      this,
      this.player,
      this.guardian,
      (col, row) => this.floorView.isOpaqueTile(col, row) || this.progression.isDoorClosedAt(col, row),
      this.notify,
      {
        getCharges: () => this.save.flashCharges,
        spendCharge: () => {
          this.save.flashCharges -= 1;
          writeSave(this.save);
          this.updateChargesHud();
        },
        canAct: () =>
          !this.health.isDead && !this.isRespawning && !this.transitioning && !this.pausedOverlay,
      },
    );

    this.lighting = new LightingSystem(this);
    this.lighting.setLantern(true);
    this.createLanternButton();
    this.createFlashButton();
    this.createPauseButton();
    this.createHudCounters();

    // Два дополнительных указателя для диагонального мультитача на D-pad.
    this.input.addPointer(2);
    this.createDpad();

    this.showFloorTitle();
    this.cameras.main.fadeIn(START_FADE_MS, 0, 0, 0);
    this.tutorial.showOnce('move', 'ИСПОЛЬЗУЙ WASD ИЛИ СТРЕЛКИ');
    this.tutorial.showOnce('safe', 'В БЕЗОПАСНОЙ КОМНАТЕ СТРАЖ СПИТ');

    this.game.events.on(Phaser.Core.Events.BLUR, this.handleFocusLoss, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleFocusLoss, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanupRun, this);
  }

  /** Очистка таймеров, слушателей игры и временных объектов при остановке сцены. */
  private cleanupRun(): void {
    this.game.events.off(Phaser.Core.Events.BLUR, this.handleFocusLoss, this);
    this.cancelGuardianWakeTimer();
    this.deathTimer?.remove(false);
    this.deathTimer = null;
    this.deathText?.destroy();
    this.deathText = null;
  }

  update(): void {
    if (this.isRespawning) {
      // Во время смерти: игрок неподвижен, управление и урон заблокированы.
      this.player.setVelocity(0, 0);
      this.lighting.update(this.player.x, this.player.y);
      return;
    }

    if (this.transitioning) {
      this.lighting.update(this.player.x, this.player.y);
      return;
    }

    const left = this.cursors.left.isDown || this.wasdKeys.A.isDown || this.isDpadActive('left');
    const right = this.cursors.right.isDown || this.wasdKeys.D.isDown || this.isDpadActive('right');
    const up = this.cursors.up.isDown || this.wasdKeys.W.isDown || this.isDpadActive('up');
    const down = this.cursors.down.isDown || this.wasdKeys.S.isDown || this.isDpadActive('down');

    this.moveVector.set((right ? 1 : 0) - (left ? 1 : 0), (down ? 1 : 0) - (up ? 1 : 0));

    if (this.moveVector.lengthSq() > 0) {
      this.moveVector.normalize().scale(PLAYER_SPEED);
    }

    this.player.setVelocity(this.moveVector.x, this.moveVector.y);

    if (Phaser.Input.Keyboard.JustDown(this.lanternKey)) {
      this.toggleLantern();
    }
    if (Phaser.Input.Keyboard.JustDown(this.flashKey)) {
      this.flash.tryFlash();
    }
    if (Phaser.Input.Keyboard.JustDown(this.escKey) || Phaser.Input.Keyboard.JustDown(this.pauseKey)) {
      this.openPause();
    }

    this.lighting.update(this.player.x, this.player.y);
    this.guardian.update();
    this.updateSafeRoomState();
    this.checkTransitionZone();
  }

  /** Переход разрешён только после открытия выходной двери. */
  private checkTransitionZone(): void {
    if (!this.progression.isExitDoorOpen()) {
      return;
    }
    const col = Math.floor(this.player.x / TILE_SIZE);
    const row = Math.floor(this.player.y / TILE_SIZE);
    if (rectContains(this.floor.transitionZone, col, row)) {
      this.startFloorTransition();
    }
  }

  /**
   * Переход на следующий этаж: блокировка ввода, сон стража, затемнение
   * и перезапуск сцены с новым определением этажа. Защищён флагом
   * от повторного запуска.
   */
  private startFloorTransition(): void {
    if (this.transitioning) {
      return;
    }
    this.transitioning = true;
    this.player.setVelocity(0, 0);
    this.handleFocusLoss();

    this.cancelGuardianWakeTimer();
    this.guardian.sleep();

    this.cameras.main.fadeOut(TRANSITION_FADE_MS, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      const next = getNextFloor(this.floor);
      if (next !== undefined) {
        // Сохранить глобальный прогресс и загрузить следующий этаж.
        this.save.currentFloorId = next.id;
        this.save.unlockedFloor = Math.max(this.save.unlockedFloor, next.order);
        writeSave(this.save);
        this.scene.restart({ floorId: next.id });
        return;
      }
      // Выход третьего этажа: завершение игры.
      this.save.completed = true;
      writeSave(this.save);
      this.scene.start('VictoryScene');
    });
  }

  /** Заряд вспышки из сундука: при максимуме сундук всё равно открывается. */
  private addFlashCharge(): void {
    if (this.save.flashCharges >= MAX_FLASH_CHARGES) {
      this.notify.notify('ЗАРЯДЫ ЗАПОЛНЕНЫ');
      return;
    }
    this.save.flashCharges += 1;
    writeSave(this.save);
    this.updateChargesHud();
    this.notify.notify('ЗАРЯД СВЕТА +1');
    this.tutorial.showOnce('flash', 'SPACE — СВЕТОВАЯ ВСПЫШКА');
  }

  /** Компактные счётчики кристаллов и зарядов под индикаторами ключей. */
  private createHudCounters(): void {
    this.crystalsText = this.add
      .text(16, 84, '', { fontSize: '16px', color: '#9fb4ff' })
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(UI_DEPTH);
    this.chargesText = this.add
      .text(16, 108, '', { fontSize: '16px', color: '#ffd98a' })
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(UI_DEPTH);
    this.updateCrystalsHud();
    this.updateChargesHud();
  }

  private updateCrystalsHud(): void {
    this.crystalsText.setText(`◆ ${this.save.collectedCrystals.length}/${ALL_CRYSTALS.length}`);
  }

  private updateChargesHud(): void {
    this.chargesText.setText(`✦ ${this.save.flashCharges}/${MAX_FLASH_CHARGES}`);
  }

  /** Название этажа по центру экрана на короткое время. */
  private showFloorTitle(): void {
    const title = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 60, `ЭТАЖ ${this.floor.order} — ${this.floor.name.toUpperCase()}`, {
        fontSize: '24px',
        color: '#9fb4ff',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(UI_DEPTH + 1);

    this.tweens.add({
      targets: title,
      alpha: 0,
      delay: TITLE_HOLD_MS,
      duration: TITLE_FADE_MS,
      onComplete: () => title.destroy(),
    });
  }

  /** Переходы «вошёл/вышел» из безопасной комнаты, реакция только на фронт. */
  private updateSafeRoomState(): void {
    const safeNow = this.floorView.isSafeAtWorldPosition(this.player.x, this.player.y);
    if (safeNow === this.playerIsSafe) {
      return;
    }
    this.playerIsSafe = safeNow;
    if (safeNow) {
      this.enterSafeRoom();
    } else {
      this.exitSafeRoom();
    }
  }

  private cancelGuardianWakeTimer(): void {
    this.guardianWakeTimer?.remove(false);
    this.guardianWakeTimer = null;
  }

  /** Вход: отменить пробуждение, усыпить стража и вернуть его в исходную точку. */
  private enterSafeRoom(): void {
    this.cancelGuardianWakeTimer();
    this.guardian.sleep();
  }

  /** Выход: страж остаётся спящим ещё GUARDIAN_WAKE_DELAY_MS. */
  private exitSafeRoom(): void {
    this.cancelGuardianWakeTimer();
    this.guardianWakeTimer = this.time.delayedCall(GUARDIAN_WAKE_DELAY_MS, () => {
      this.guardianWakeTimer = null;
      if (!this.playerIsSafe && !this.health.isDead && !this.isRespawning) {
        this.guardian.wake();
      }
    });
  }

  /** Касание стража: урон, пауза стража или последовательность смерти. */
  private handleGuardianContact(): void {
    if (this.isRespawning || this.health.isDead || this.transitioning) {
      return;
    }
    if (this.playerIsSafe) {
      return;
    }
    const result = this.health.takeDamage();
    if (result === 'damaged') {
      this.guardian.pauseFor(GUARDIAN_PAUSE_AFTER_HIT_MS);
    } else if (result === 'dead') {
      this.startDeathSequence();
    }
  }

  /**
   * Смерть и возрождение в стартовой точке безопасной комнаты.
   * Прогресс этажа (ключи, двери, сундуки, кристаллы, заряды, фонарь)
   * не сбрасывается; сцена и этаж не пересоздаются.
   */
  private startDeathSequence(): void {
    this.isRespawning = true;
    this.player.setVelocity(0, 0);
    this.handleFocusLoss();

    this.cancelGuardianWakeTimer();
    this.guardian.sleep();

    this.deathText = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'ВЫ ПОГИБЛИ', { fontSize: '32px', color: '#ff6b7a' })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(UI_DEPTH + 1);

    this.cameras.main.fadeOut(DEATH_FADE_MS, 0, 0, 0);

    this.deathTimer = this.time.delayedCall(DEATH_HOLD_MS, () => {
      this.deathTimer = null;

      // Дискретное возрождение: body.reset переносит игрока и останавливает его.
      (this.player.body as Phaser.Physics.Arcade.Body).reset(
        this.floorView.playerStart.x,
        this.floorView.playerStart.y,
      );
      this.health.reset();
      this.playerIsSafe = true;

      this.deathText?.destroy();
      this.deathText = null;
      this.cameras.main.fadeIn(RESPAWN_FADE_MS, 0, 0, 0);
      this.isRespawning = false;
      // Страж остаётся спящим до следующего выхода из безопасной комнаты.
    });
  }

  private createTextures(): void {
    const graphics = this.add.graphics();

    // Персонаж: приглушённо-фиолетовое тело с двумя светящимися глазами.
    graphics.fillStyle(COLOR_PLAYER, 1);
    graphics.fillRect(0, 0, PLAYER_SIZE, PLAYER_SIZE);
    graphics.fillStyle(COLOR_PLAYER_EYES, 1);
    graphics.fillRect(5, 8, 5, 5);
    graphics.fillRect(PLAYER_SIZE - 10, 8, 5, 5);
    graphics.generateTexture('player', PLAYER_SIZE, PLAYER_SIZE);
    graphics.clear();

    // Кнопки D-pad: подложка и стрелка по направлению.
    const half = DPAD_BUTTON_SIZE / 2;
    const arrow = 12;
    for (const direction of DIRECTIONS) {
      graphics.fillStyle(COLOR_DPAD, 1);
      graphics.fillRect(0, 0, DPAD_BUTTON_SIZE, DPAD_BUTTON_SIZE);
      graphics.fillStyle(COLOR_DPAD_ARROW, 1);
      if (direction === 'up') {
        graphics.fillTriangle(half, half - arrow, half - arrow, half + arrow, half + arrow, half + arrow);
      } else if (direction === 'down') {
        graphics.fillTriangle(half, half + arrow, half - arrow, half - arrow, half + arrow, half - arrow);
      } else if (direction === 'left') {
        graphics.fillTriangle(half - arrow, half, half + arrow, half - arrow, half + arrow, half + arrow);
      } else {
        graphics.fillTriangle(half + arrow, half, half - arrow, half - arrow, half - arrow, half + arrow);
      }
      graphics.generateTexture(`dpad-${direction}`, DPAD_BUTTON_SIZE, DPAD_BUTTON_SIZE);
      graphics.clear();
    }

    // Кнопка фонаря: включён — тёплый светящийся круг, выключен — тусклый контур.
    const lanternCenter = LANTERN_BUTTON_SIZE / 2;
    graphics.fillStyle(COLOR_DPAD, 1);
    graphics.fillRect(0, 0, LANTERN_BUTTON_SIZE, LANTERN_BUTTON_SIZE);
    graphics.fillStyle(COLOR_LANTERN_ON, 1);
    graphics.fillCircle(lanternCenter, lanternCenter + 2, 14);
    graphics.fillRect(lanternCenter - 6, lanternCenter - 20, 12, 6);
    graphics.generateTexture('lantern-on', LANTERN_BUTTON_SIZE, LANTERN_BUTTON_SIZE);
    graphics.clear();

    graphics.fillStyle(COLOR_DPAD, 1);
    graphics.fillRect(0, 0, LANTERN_BUTTON_SIZE, LANTERN_BUTTON_SIZE);
    graphics.lineStyle(2, COLOR_LANTERN_OFF, 1);
    graphics.strokeCircle(lanternCenter, lanternCenter + 2, 14);
    graphics.fillStyle(COLOR_LANTERN_OFF, 1);
    graphics.fillRect(lanternCenter - 6, lanternCenter - 20, 12, 6);
    graphics.generateTexture('lantern-off', LANTERN_BUTTON_SIZE, LANTERN_BUTTON_SIZE);
    graphics.clear();

    // Кнопка вспышки: тёплая молния на подложке.
    const flashCenter = FLASH_BUTTON_SIZE / 2;
    graphics.fillStyle(COLOR_DPAD, 1);
    graphics.fillRect(0, 0, FLASH_BUTTON_SIZE, FLASH_BUTTON_SIZE);
    graphics.fillStyle(COLOR_LANTERN_ON, 1);
    graphics.fillTriangle(
      flashCenter + 4,
      flashCenter - 18,
      flashCenter - 10,
      flashCenter + 4,
      flashCenter + 2,
      flashCenter + 4,
    );
    graphics.fillTriangle(
      flashCenter - 4,
      flashCenter + 18,
      flashCenter + 10,
      flashCenter - 2,
      flashCenter - 2,
      flashCenter - 2,
    );
    graphics.generateTexture('flash-button', FLASH_BUTTON_SIZE, FLASH_BUTTON_SIZE);
    graphics.clear();

    // Кнопка паузы: две вертикальные полосы.
    graphics.fillStyle(COLOR_DPAD, 1);
    graphics.fillRect(0, 0, PAUSE_BUTTON_SIZE, PAUSE_BUTTON_SIZE);
    graphics.fillStyle(COLOR_DPAD_ARROW, 1);
    graphics.fillRect(PAUSE_BUTTON_SIZE / 2 - 9, PAUSE_BUTTON_SIZE / 2 - 9, 6, 18);
    graphics.fillRect(PAUSE_BUTTON_SIZE / 2 + 3, PAUSE_BUTTON_SIZE / 2 - 9, 6, 18);
    graphics.generateTexture('pause-button', PAUSE_BUTTON_SIZE, PAUSE_BUTTON_SIZE);
    graphics.clear();

    graphics.destroy();
  }

  private createPlayer(): void {
    this.player = this.physics.add.image(this.floorView.playerStart.x, this.floorView.playerStart.y, 'player');
    this.player.setCollideWorldBounds(true);
    this.physics.add.collider(this.player, this.floorView.solids);
  }

  private createCamera(): void {
    const camera = this.cameras.main;
    camera.setBounds(0, 0, this.floorView.widthPixels, this.floorView.heightPixels);
    camera.startFollow(this.player, true, CAMERA_LERP, CAMERA_LERP);
  }

  private createKeyboard(): void {
    const keyboard = this.input.keyboard;
    if (!keyboard) {
      return;
    }
    this.cursors = keyboard.createCursorKeys();
    this.wasdKeys = keyboard.addKeys('W,A,S,D') as Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;
    this.lanternKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F);
    this.flashKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.escKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    this.pauseKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.P);
  }

  private createLanternButton(): void {
    const x = GAME_WIDTH - DPAD_MARGIN - LANTERN_BUTTON_SIZE / 2;
    const y = GAME_HEIGHT - DPAD_MARGIN - LANTERN_BUTTON_SIZE / 2;

    this.lanternButton = this.add.image(x, y, 'lantern-on');
    this.lanternButton.setDepth(UI_DEPTH);
    this.lanternButton.setScrollFactor(0);
    this.lanternButton.setInteractive();
    this.lanternButton.on('pointerdown', () => this.toggleLantern());

    this.lanternLabel = this.add.text(x, y - LANTERN_BUTTON_SIZE / 2 - 6, 'ФОНАРЬ: ВКЛ', {
      fontSize: '14px',
      color: '#9fb4ff',
    });
    this.lanternLabel.setOrigin(0.5, 1);
    this.lanternLabel.setDepth(UI_DEPTH);
    this.lanternLabel.setScrollFactor(0);
  }

  /** Отдельная мобильная кнопка вспышки слева от кнопки фонаря. */
  private createFlashButton(): void {
    const x = GAME_WIDTH - DPAD_MARGIN - LANTERN_BUTTON_SIZE - 16 - FLASH_BUTTON_SIZE / 2;
    const y = GAME_HEIGHT - DPAD_MARGIN - FLASH_BUTTON_SIZE / 2;

    this.flashButton = this.add.image(x, y, 'flash-button');
    this.flashButton.setDepth(UI_DEPTH);
    this.flashButton.setScrollFactor(0);
    this.flashButton.setInteractive();
    this.flashButton.on('pointerdown', () => this.flash.tryFlash());
  }

  /** Мобильная кнопка паузы в правом верхнем углу, под сердцами. */
  private createPauseButton(): void {
    const x = GAME_WIDTH - 24 - PAUSE_BUTTON_SIZE / 2;
    const y = 52;

    this.pauseButton = this.add.image(x, y, 'pause-button');
    this.pauseButton.setAlpha(0.7);
    this.pauseButton.setDepth(UI_DEPTH);
    this.pauseButton.setScrollFactor(0);
    this.pauseButton.setInteractive();
    this.pauseButton.on('pointerdown', () => this.openPause());
  }

  /**
   * Открыть паузу: сброс ввода, остановка сцены и её таймеров,
   * запуск overlay-сцены. Повторное открытие заблокировано флагом.
   */
  private openPause(): void {
    if (this.pausedOverlay || this.isRespawning || this.transitioning || this.health.isDead) {
      return;
    }
    this.pausedOverlay = true;
    this.handleFocusLoss();
    this.scene.pause();
    this.scene.launch('PauseScene', { floorId: this.floor.id });
  }

  /** Вызывается PauseScene при возобновлении: сброс застрявшего ввода. */
  resumeFromPause(): void {
    this.pausedOverlay = false;
    this.handleFocusLoss();
  }

  private toggleLantern(): void {
    this.lighting.toggle();
    const isOn = this.lighting.lanternOn;
    this.lanternButton.setTexture(isOn ? 'lantern-on' : 'lantern-off');
    this.lanternLabel.setText(isOn ? 'ФОНАРЬ: ВКЛ' : 'ФОНАРЬ: ВЫКЛ');
    this.tutorial.showOnce('light', 'СВЕТ ПОМОГАЕТ ВИДЕТЬ, НО ВЫДАЁТ ТЕБЯ');
  }

  private createDpad(): void {
    const step = DPAD_BUTTON_SIZE + DPAD_GAP;
    const baseX = DPAD_MARGIN + DPAD_BUTTON_SIZE / 2;
    const baseY = GAME_HEIGHT - DPAD_MARGIN - (step * 2 + DPAD_BUTTON_SIZE) + DPAD_BUTTON_SIZE / 2;

    const positions: Record<Direction, { x: number; y: number }> = {
      up: { x: baseX + step, y: baseY },
      left: { x: baseX, y: baseY + step },
      right: { x: baseX + step * 2, y: baseY + step },
      down: { x: baseX + step, y: baseY + step * 2 },
    };

    this.dpadButtons = {} as Record<Direction, Phaser.GameObjects.Image>;

    for (const direction of DIRECTIONS) {
      const { x, y } = positions[direction];
      const button = this.add.image(x, y, `dpad-${direction}`);
      button.setAlpha(DPAD_ALPHA_IDLE);
      button.setDepth(UI_DEPTH);
      button.setScrollFactor(0);
      button.setInteractive();
      button.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        this.dpadPointers[direction].add(pointer.id);
        button.setAlpha(DPAD_ALPHA_PRESSED);
      });
      const release = (pointer: Phaser.Input.Pointer) => {
        this.dpadPointers[direction].delete(pointer.id);
        if (this.dpadPointers[direction].size === 0) {
          button.setAlpha(DPAD_ALPHA_IDLE);
        }
      };
      button.on('pointerup', release);
      button.on('pointerout', release);
      this.dpadButtons[direction] = button;
    }
  }

  private isDpadActive(direction: Direction): boolean {
    return this.dpadPointers[direction].size > 0;
  }

  private handleFocusLoss(): void {
    for (const direction of DIRECTIONS) {
      this.dpadPointers[direction].clear();
      this.dpadButtons[direction].setAlpha(DPAD_ALPHA_IDLE);
    }
    this.input.keyboard?.resetKeys();
    // При SHUTDOWN объекты сцены уже уничтожены Display List и тела нет:
    // скорость сбрасываем только у живого тела.
    const body = this.player.body as Phaser.Physics.Arcade.Body | null;
    body?.setVelocity(0, 0);
  }
}
