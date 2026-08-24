import Phaser from 'phaser';

const COLOR_ENABLED = '#c8d4ff';
const COLOR_DISABLED = '#5a6285';
const COLOR_SELECTED = '#ffd98a';

export interface MenuItem {
  label: string;
  action: () => void;
  enabled?: boolean;
}

interface MenuEntry {
  item: MenuItem;
  text: Phaser.GameObjects.Text;
}

/**
 * Текстовое меню сцен (главное, пауза, финал): мышь, касание и
 * клавиатурная навигация. Сцена вызывает move/activate из своих
 * обработчиков клавиш; destroy — при смене экрана.
 */
export class MenuList {
  private readonly entries: MenuEntry[] = [];
  private selectedIndex = -1;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    items: MenuItem[],
    lineHeight = 44,
    fontSize = '22px',
  ) {
    items.forEach((item, index) => {
      const enabled = item.enabled !== false;
      const text = scene.add
        .text(x, y + index * lineHeight, item.label, {
          fontSize,
          color: enabled ? COLOR_ENABLED : COLOR_DISABLED,
        })
        .setOrigin(0.5, 0);

      if (enabled) {
        text.setInteractive();
        text.on('pointerover', () => this.select(index));
        text.on('pointerdown', () => {
          this.select(index);
          this.activate();
        });
      }

      this.entries.push({ item, text });
    });

    this.selectFirstEnabled();
  }

  /** Перемещение выбора по доступным пунктам с зацикливанием. */
  move(delta: number): void {
    const enabled = this.entries
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry }) => entry.item.enabled !== false);
    if (enabled.length === 0) {
      return;
    }
    const currentPosition = enabled.findIndex(({ index }) => index === this.selectedIndex);
    const nextPosition = (currentPosition + delta + enabled.length) % enabled.length;
    this.select(enabled[nextPosition].index);
  }

  activate(): void {
    const entry = this.entries[this.selectedIndex];
    if (entry !== undefined && entry.item.enabled !== false) {
      entry.item.action();
    }
  }

  destroy(): void {
    for (const entry of this.entries) {
      entry.text.destroy();
    }
    this.entries.length = 0;
    this.selectedIndex = -1;
  }

  private selectFirstEnabled(): void {
    const index = this.entries.findIndex((entry) => entry.item.enabled !== false);
    if (index >= 0) {
      this.select(index);
    }
  }

  private select(index: number): void {
    this.selectedIndex = index;
    for (let i = 0; i < this.entries.length; i++) {
      const entry = this.entries[i];
      const enabled = entry.item.enabled !== false;
      entry.text.setColor(i === index ? COLOR_SELECTED : enabled ? COLOR_ENABLED : COLOR_DISABLED);
    }
  }
}
