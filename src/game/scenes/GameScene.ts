import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config';
import { LightingSystem } from '../systems/LightingSystem';

const PLAYER_SPEED = 160;
const PLAYER_SIZE = 26;
const TILE_SIZE = 32;
const WALL_THICKNESS = 16;

const ROOM_X = 48;
const ROOM_Y = 24;
const ROOM_WIDTH = 864;
const ROOM_HEIGHT = 492;

const DPAD_BUTTON_SIZE = 60;
const DPAD_GAP = 8;
const DPAD_MARGIN = 24;
const DPAD_ALPHA_IDLE = 0.4;
const DPAD_ALPHA_PRESSED = 0.75;

const LANTERN_BUTTON_SIZE = 64;
const UI_DEPTH = 200;

const COLOR_BACKGROUND = 0x0a0a12;
const COLOR_FLOOR = 0x14141d;
const COLOR_FLOOR_GRID = 0x1e1e2e;
const COLOR_WALL = 0x2b3350;
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
  private walls!: Phaser.GameObjects.Rectangle[];

  constructor() {
    super('GameScene');
  }

  create(): void {
    this.cameras.main.setBackgroundColor(COLOR_BACKGROUND);

    this.createTextures();
    this.createRoom();
    this.createPlayer();
    this.createKeyboard();

    this.lighting = new LightingSystem(this);
    this.createLanternButton();

    // Два дополнительных указателя для диагонального мультитача на D-pad.
    this.input.addPointer(2);
    this.createDpad();

    this.game.events.on(Phaser.Core.Events.BLUR, this.handleFocusLoss, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleFocusLoss, this);
  }

  update(): void {
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
  }

  private createTextures(): void {
    const graphics = this.add.graphics();

    // Пол: тёмная плитка с едва заметной сеткой.
    graphics.fillStyle(COLOR_FLOOR, 1);
    graphics.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
    graphics.fillStyle(COLOR_FLOOR_GRID, 1);
    graphics.fillRect(0, 0, TILE_SIZE, 1);
    graphics.fillRect(0, 0, 1, TILE_SIZE);
    graphics.generateTexture('floor-tile', TILE_SIZE, TILE_SIZE);
    graphics.clear();

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

  private createRoom(): void {
    const innerX = ROOM_X + WALL_THICKNESS;
    const innerY = ROOM_Y + WALL_THICKNESS;
    const innerWidth = ROOM_WIDTH - WALL_THICKNESS * 2;
    const innerHeight = ROOM_HEIGHT - WALL_THICKNESS * 2;

    this.add.tileSprite(
      innerX + innerWidth / 2,
      innerY + innerHeight / 2,
      innerWidth,
      innerHeight,
      'floor-tile',
    );

    const walls = [
      this.add.rectangle(ROOM_X + ROOM_WIDTH / 2, ROOM_Y + WALL_THICKNESS / 2, ROOM_WIDTH, WALL_THICKNESS, COLOR_WALL),
      this.add.rectangle(ROOM_X + ROOM_WIDTH / 2, ROOM_Y + ROOM_HEIGHT - WALL_THICKNESS / 2, ROOM_WIDTH, WALL_THICKNESS, COLOR_WALL),
      this.add.rectangle(ROOM_X + WALL_THICKNESS / 2, ROOM_Y + ROOM_HEIGHT / 2, WALL_THICKNESS, ROOM_HEIGHT, COLOR_WALL),
      this.add.rectangle(ROOM_X + ROOM_WIDTH - WALL_THICKNESS / 2, ROOM_Y + ROOM_HEIGHT / 2, WALL_THICKNESS, ROOM_HEIGHT, COLOR_WALL),
    ];

    for (const wall of walls) {
      this.physics.add.existing(wall, true);
    }

    this.walls = walls;
  }

  private createPlayer(): void {
    this.player = this.physics.add.image(
      ROOM_X + ROOM_WIDTH / 2,
      ROOM_Y + ROOM_HEIGHT / 2,
      'player',
    );
    this.player.setCollideWorldBounds(true);
    this.physics.add.collider(this.player, this.walls);
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
    this.lanternButton.setInteractive();
    this.lanternButton.on('pointerdown', () => this.toggleLantern());

    this.lanternLabel = this.add.text(x, y - LANTERN_BUTTON_SIZE / 2 - 6, 'ФОНАРЬ: ВКЛ', {
      fontSize: '14px',
      color: '#9fb4ff',
    });
    this.lanternLabel.setOrigin(0.5, 1);
    this.lanternLabel.setDepth(UI_DEPTH);
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
