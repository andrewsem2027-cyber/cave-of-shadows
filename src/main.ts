import Phaser from 'phaser';
import { gameConfig } from './game/config';
import { BootScene } from './game/scenes/BootScene';
import { GameScene } from './game/scenes/GameScene';
import { MenuScene } from './game/scenes/MenuScene';
import { PauseScene } from './game/scenes/PauseScene';
import { VictoryScene } from './game/scenes/VictoryScene';

new Phaser.Game({
  ...gameConfig,
  scene: [BootScene, MenuScene, GameScene, PauseScene, VictoryScene],
});
