/**
 * Единая система цветов игры: шесть цветов ключей, дверей, сундуков,
 * кристаллов и UI. Чистые данные без Phaser и DOM, единственный источник
 * метаданных цвета — значения не дублируются в системах.
 */

export type GameColor = 'red' | 'darkRed' | 'purple' | 'cyan' | 'skyBlue' | 'orange';

/** Символ цвета: одинаковый на ключе, двери, сундуке и кристалле. */
export type ColorSymbol = 'triangle' | 'cross' | 'diamond' | 'circle' | 'star' | 'square';

export interface GameColorMeta {
  /** Цветовое значение для заливки. */
  value: number;
  /** Русское название. */
  nameRu: string;
  symbol: ColorSymbol;
  /** Подсказка при подходе к закрытому объекту без ключа. */
  missingKeyText: string;
}

export const GAME_COLORS: readonly GameColor[] = [
  'red',
  'darkRed',
  'purple',
  'cyan',
  'skyBlue',
  'orange',
];

export const COLOR_META: Record<GameColor, GameColorMeta> = {
  red: {
    value: 0xe05252,
    nameRu: 'Красный',
    symbol: 'triangle',
    missingKeyText: 'НУЖЕН КРАСНЫЙ КЛЮЧ',
  },
  darkRed: {
    value: 0x8b1e2d,
    nameRu: 'Тёмно-красный',
    symbol: 'cross',
    missingKeyText: 'НУЖЕН ТЁМНО-КРАСНЫЙ КЛЮЧ',
  },
  purple: {
    value: 0x9a5ae0,
    nameRu: 'Фиолетовый',
    symbol: 'diamond',
    missingKeyText: 'НУЖЕН ФИОЛЕТОВЫЙ КЛЮЧ',
  },
  cyan: {
    value: 0x4a8cff,
    nameRu: 'Голубой',
    symbol: 'circle',
    missingKeyText: 'НУЖЕН ГОЛУБОЙ КЛЮЧ',
  },
  skyBlue: {
    value: 0x7fd4ff,
    nameRu: 'Небесно-голубой',
    symbol: 'star',
    missingKeyText: 'НУЖЕН НЕБЕСНО-ГОЛУБОЙ КЛЮЧ',
  },
  orange: {
    value: 0xf28c3c,
    nameRu: 'Оранжевый',
    symbol: 'square',
    missingKeyText: 'НУЖЕН ОРАНЖЕВЫЙ КЛЮЧ',
  },
};

export function isGameColor(value: unknown): value is GameColor {
  return typeof value === 'string' && (GAME_COLORS as readonly string[]).includes(value);
}
