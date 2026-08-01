import Phaser from 'phaser';
import { FLOORS } from '../domain/floor/floors';
import { validateAllFloors } from '../domain/floor/validateFloor';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  create(): void {
    // Проверка связности всех этажей до старта игры.
    const errors = validateAllFloors(FLOORS);
    if (errors.length > 0) {
      throw new Error(`Ошибки валидации этажей:\n${errors.join('\n')}`);
    }
    this.scene.start('MenuScene');
  }
}
