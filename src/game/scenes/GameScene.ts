import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config';
import { KeyState } from '../domain/progression/KeyState';
import { KeyInteractionSystem } from '../systems/KeyInteractionSystem';
import { GuardianSystem } from '../systems/GuardianSystem';
import { LightingSystem } from '../systems/LightingSystem';
import { PlayerHealthSystem } from '../systems/PlayerHealthSystem';
import { TestFloor } from '../world/TestFloor';

const PLAYER_SPEED = 160;
const PLAYER_SIZE = 26;

const DPAD_BUTTON_SIZE = 60;
const DPAD_GAP = 8;
const DPAD_MARGIN = 24;
const DPAD_ALPHA_IDLE = 0.4;
const DPAD_ALPHA_PRESSED = 0.75;

const LANTERN_BUTTON_SIZE = 64;
const UI_DEPTH = 200;

const CAMERA_LERP = 0.12;

const GUARDIAN_PAUSE_AFTER_HIT_MS = 700;
const GUARDIAN_WAKE_DELAY_MS = 3000;
const DEATH_FADE_MS = 700;
const DEATH_HOLD_MS = 900;
const RESPAWN_FADE_MS = 400;

const COLOR_BACKGROUND = 0x0a0a12;
const COLOR_PLAYER = 0x7a68e0;
const COLOR_PLAYER_EYES = 0xdff6ff;
const COLOR_DPAD = 0x3a4368;
const COLOR_DPAD_ARROW = 0x9fb4ff;
const COLOR_LANTERN_ON = 0xffd98a;
const COLOR_LANTERN_OFF = 0x5a6285;

type Direction = 'up' | 'down' | 'left' | 'right';

const DIRECTIONS: Direction[] = ['up', 'down', 'left', 'right'];

export class GameScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Image;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasdKeys!: Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;
  private lanternKey!: Phaser.Input.Keyboard.Key;
  private lighting!: LightingSystem;
  private lanternButton!: Phaser.GameObjects.Image;
  private lanternLabel!: Phaser.GameObjects.Text;
  private dpadButtons!: Record<Direction, Phaser.GameObjects.Image>;
  private dpadPointers: Record<Direction, Set<number>> = {
    up: new Set(),
    down: new Set(),
    left: new Set(),
    right: new Set(),
  };
  private moveVector = new Phaser.Math.Vector2(0, 0);
  private testFloor!: TestFloor;
  private keyState!: KeyState;
  private guardian!: GuardianSystem;
  private health!: PlayerHealthSystem;
  /** Игра начинается в безопасной комнате. */
  private playerIsSafe = true;
  private isRespawning = false;
  private guardianWakeTimer: Phaser.Time.TimerEvent | null = null;
  private deathTimer: Phaser.Time.TimerEvent | null = null;
  private deathText: Phaser.GameObjects.Text | null = null;

  constructor() {
    super('GameScene');
  }

  create(): void {
    this.cameras.main.setBackgroundColor(COLOR_BACKGROUND);

    this.createTextures();

    this.testFloor = new TestFloor(this);
    this.physics.world.setBounds(0, 0, this.testFloor.widthPixels, this.testFloor.heightPixels);

    this.createPlayer();
    this.createCamera();
    this.createKeyboard();

    this.keyState = new KeyState();
    const keyInteractions = new KeyInteractionSystem(
      this,
      this.player,
      this.testFloor.data.progression,
      this.keyState,
    );

    this.guardian = new GuardianSystem(
      this,
      this.player,
      this.testFloor.data.grid,
      this.testFloor.data.guardianStartTile,
      (col, row) => keyInteractions.isDoorClosedAt(col, row),
      this.testFloor.solids,
    );
    // Игра начинается в безопасной комнате: страж изначально спит.
    this.guardian.sleep();

    this.health = new PlayerHealthSystem(this, this.player);
    this.physics.add.overlap(this.player, this.guardian.gameObject, () => {
      this.handleGuardianContact();
    });

    this.lighting = new LightingSystem(this);
    this.createLanternButton();

    // Два дополнительных указателя для диагонального мультитача на D-pad.
    this.input.addPointer(2);
    this.createDpad();

    this.game.events.on(Phaser.Core.Events.BLUR, this.handleFocusLoss, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleFocusLoss, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanupRun, this);
  }

  /** Очистка таймеров и временных объектов жизненного цикла при остановке сцены. */
  private cleanupRun(): void {
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

    this.lighting.update(this.player.x, this.player.y);
    this.guardian.update();
    this.updateSafeRoomState();
  }

  /** Переходы «вошёл/вышел» из безопасной комнаты, реакция только на фронт. */
  private updateSafeRoomState(): void {
    const safeNow = this.testFloor.isSafeAtWorldPosition(this.player.x, this.player.y);
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
    if (this.isRespawning || this.health.isDead) {
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
   * Прогресс (ключи, двери, сундук, фонарь) не сбрасывается.
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
        this.testFloor.playerStart.x,
        this.testFloor.playerStart.y,
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

    graphics.destroy();
  }

  private createPlayer(): void {
    this.player = this.physics.add.image(this.testFloor.playerStart.x, this.testFloor.playerStart.y, 'player');
    this.player.setCollideWorldBounds(true);
    this.physics.add.collider(this.player, this.testFloor.solids);
  }

  private createCamera(): void {
    const camera = this.cameras.main;
    camera.setBounds(0, 0, this.testFloor.widthPixels, this.testFloor.heightPixels);
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

  private toggleLantern(): void {
    this.lighting.toggle();
    const isOn = this.lighting.lanternOn;
    this.lanternButton.setTexture(isOn ? 'lantern-on' : 'lantern-off');
    this.lanternLabel.setText(isOn ? 'ФОНАРЬ: ВКЛ' : 'ФОНАРЬ: ВЫКЛ');
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
    this.player.setVelocity(0, 0);
  }
}
