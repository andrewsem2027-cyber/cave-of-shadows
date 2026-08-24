/**
 * Состояние найденных ключей этажа: чистые правила без Phaser и DOM.
 * Ключ не расходуется и хранится до конца этажа; количество не считается.
 */

import type { GameColor } from '../colors/GameColor';

export class KeyState {
  private readonly found = new Set<GameColor>();

  add(color: GameColor): void {
    this.found.add(color);
  }

  has(color: GameColor): boolean {
    return this.found.has(color);
  }

  reset(): void {
    this.found.clear();
  }
}
