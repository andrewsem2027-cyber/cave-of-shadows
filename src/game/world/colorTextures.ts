import Phaser from 'phaser';
import { COLOR_META, ColorSymbol, GAME_COLORS } from '../domain/colors/GameColor';

const KEY_TEXTURE_SIZE = 24;
const DOOR_WIDTH = 32;
const DOOR_HEIGHT = 64;
const CHEST_WIDTH = 28;
const CHEST_HEIGHT = 22;
const CRYSTAL_WIDTH = 24;
const CRYSTAL_HEIGHT = 32;

const COLOR_DARK = 0x101018;
const COLOR_GLOW = 0xffe9a8;

/** Пять лучей: десять чередующихся вершин, детерминированно. */
function starPoints(cx: number, cy: number, outer: number, inner: number): Phaser.Math.Vector2[] {
  const points: Phaser.Math.Vector2[] = [];
  for (let index = 0; index < 10; index++) {
    const radius = index % 2 === 0 ? outer : inner;
    const angle = -Math.PI / 2 + (index * Math.PI) / 5;
    points.push(new Phaser.Math.Vector2(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius));
  }
  return points;
}

/** Рисует символ цвета с центром в (cx, cy). */
export function drawColorSymbol(
  graphics: Phaser.GameObjects.Graphics,
  symbol: ColorSymbol,
  cx: number,
  cy: number,
  size: number,
  color: number,
): void {
  const half = size / 2;
  graphics.fillStyle(color, 1);
  switch (symbol) {
    case 'triangle':
      graphics.fillTriangle(cx, cy - half, cx - half, cy + half, cx + half, cy + half);
      break;
    case 'cross':
      graphics.fillRect(cx - size / 6, cy - half, size / 3, size);
      graphics.fillRect(cx - half, cy - size / 6, size, size / 3);
      break;
    case 'diamond':
      graphics.fillTriangle(cx, cy - half, cx - half, cy, cx + half, cy);
      graphics.fillTriangle(cx, cy + half, cx - half, cy, cx + half, cy);
      break;
    case 'circle':
      graphics.fillCircle(cx, cy, half);
      break;
    case 'star':
      graphics.fillPoints(starPoints(cx, cy, half, half * 0.45), true);
      break;
    case 'square':
      graphics.fillRect(cx - half, cy - half, size, size);
      break;
  }
}

/**
 * Генерирует текстуры всех цветных объектов без внешних PNG.
 * Одинаковый символ на ключе, двери, сундуке и кристалле одного цвета.
 * Идемпотентно: существующие текстуры не пересоздаются.
 */
export function ensureColorTextures(scene: Phaser.Scene): void {
  const graphics = scene.add.graphics();

  for (const color of GAME_COLORS) {
    const meta = COLOR_META[color];
    const paint = meta.value;

    // Ключ: цветная головка-кольцо с тёмным символом и бородка.
    if (!scene.textures.exists(`key-${color}`)) {
      graphics.fillStyle(paint, 1);
      graphics.fillCircle(8, 12, 6);
      graphics.fillRect(12, 10, 10, 4);
      graphics.fillRect(18, 14, 3, 5);
      drawColorSymbol(graphics, meta.symbol, 8, 12, 7, COLOR_DARK);
      graphics.generateTexture(`key-${color}`, KEY_TEXTURE_SIZE, KEY_TEXTURE_SIZE);
      graphics.clear();
    }

    // Дверь: цветная панель с тёмным символом по центру.
    if (!scene.textures.exists(`door-${color}`)) {
      graphics.fillStyle(paint, 1);
      graphics.fillRect(0, 0, DOOR_WIDTH, DOOR_HEIGHT);
      drawColorSymbol(graphics, meta.symbol, DOOR_WIDTH / 2, DOOR_HEIGHT / 2, 18, COLOR_DARK);
      graphics.generateTexture(`door-${color}`, DOOR_WIDTH, DOOR_HEIGHT);
      graphics.clear();
    }

    // Сундук закрытый: крышка, тёмная кромка и символ.
    if (!scene.textures.exists(`chest-${color}-closed`)) {
      graphics.fillStyle(paint, 1);
      graphics.fillRect(0, 0, CHEST_WIDTH, CHEST_HEIGHT);
      graphics.fillStyle(COLOR_DARK, 1);
      graphics.fillRect(0, 7, CHEST_WIDTH, 2);
      drawColorSymbol(graphics, meta.symbol, CHEST_WIDTH / 2, 14, 9, COLOR_DARK);
      graphics.generateTexture(`chest-${color}-closed`, CHEST_WIDTH, CHEST_HEIGHT);
      graphics.clear();
    }

    // Сундук открытый: тёмный проём и свечение.
    if (!scene.textures.exists(`chest-${color}-open`)) {
      graphics.fillStyle(paint, 1);
      graphics.fillRect(0, 8, CHEST_WIDTH, CHEST_HEIGHT - 8);
      graphics.fillRect(0, 0, CHEST_WIDTH, 3);
      graphics.fillStyle(COLOR_DARK, 1);
      graphics.fillRect(2, 5, CHEST_WIDTH - 4, 5);
      graphics.fillStyle(COLOR_GLOW, 1);
      graphics.fillRect(CHEST_WIDTH / 2 - 3, 6, 6, 3);
      graphics.generateTexture(`chest-${color}-open`, CHEST_WIDTH, CHEST_HEIGHT);
      graphics.clear();
    }

    // Кристалл: вытянутый цветной осколок с тёмным символом.
    if (!scene.textures.exists(`crystal-${color}`)) {
      graphics.fillStyle(paint, 1);
      const cx = CRYSTAL_WIDTH / 2;
      graphics.fillTriangle(cx, 1, 2, CRYSTAL_HEIGHT / 2, CRYSTAL_WIDTH - 2, CRYSTAL_HEIGHT / 2);
      graphics.fillTriangle(cx, CRYSTAL_HEIGHT - 1, 2, CRYSTAL_HEIGHT / 2, CRYSTAL_WIDTH - 2, CRYSTAL_HEIGHT / 2);
      drawColorSymbol(graphics, meta.symbol, cx, CRYSTAL_HEIGHT / 2, 9, COLOR_DARK);
      graphics.generateTexture(`crystal-${color}`, CRYSTAL_WIDTH, CRYSTAL_HEIGHT);
      graphics.clear();
    }
  }

  graphics.destroy();
}
