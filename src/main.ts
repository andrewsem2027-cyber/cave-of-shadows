import Phaser from 'phaser';
import { gameConfig } from './game/config';
import { BootScene } from './game/scenes/BootScene';
import { GameScene } from './game/scenes/GameScene';

new Phaser.Game({
  ...gameConfig,
  scene: [BootScene, GameScene],
});
