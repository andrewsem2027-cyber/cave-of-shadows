/**
 * Состояние найденных ключей этажа: чистые правила без Phaser и DOM.
 * Ключ не расходуется и хранится до конца этажа; количество не считается.
 */

export type KeyColor = 'blue' | 'red';

export class KeyState {
  private readonly found = new Set<KeyColor>();

  add(color: KeyColor): void {
    this.found.add(color);
  }

  has(color: KeyColor): boolean {
    return this.found.has(color);
  }

  reset(): void {
    this.found.clear();
  }
}
