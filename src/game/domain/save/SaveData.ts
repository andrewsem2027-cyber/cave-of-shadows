/**
 * Версионированная модель сохранения: чистый TypeScript без Phaser и DOM.
 * Валидация отдельно от хранения: повреждённые данные не ломают запуск.
 */

import { GameColor, isGameColor } from '../colors/GameColor';
import { FLOORS, getFloorById } from '../floor/floors';

export const SAVE_VERSION = 1;
export const MAX_FLASH_CHARGES = 3;

export interface SaveData {
  version: 1;
  /** Этаж, с которого продолжается игра. */
  currentFloorId: string;
  /** Наибольший достигнутый порядковый номер этажа. */
  unlockedFloor: number;
  /** Собранные кристаллы: глобально, переживают смерть и смену этажа. */
  collectedCrystals: GameColor[];
  /** Заряды световой вспышки, 0..3. */
  flashCharges: number;
  /** Игра завершена (финальная сцена показана). */
  completed: boolean;
}

export function createDefaultSave(): SaveData {
  return {
    version: SAVE_VERSION,
    currentFloorId: FLOORS[0].id,
    unlockedFloor: 1,
    collectedCrystals: [],
    flashCharges: 0,
    completed: false,
  };
}

/**
 * Разбор непроверенных данных: невалидное сохранение → null
 * (продолжение недоступно). Неизвестные цвета отбрасываются,
 * заряды ограничиваются диапазоном 0..3.
 */
export function parseSave(raw: unknown): SaveData | null {
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }
  const data = raw as Record<string, unknown>;

  // Неизвестная версия считается невалидной.
  if (data.version !== SAVE_VERSION) {
    return null;
  }

  // Неизвестный этаж делает сохранение невалидным.
  if (typeof data.currentFloorId !== 'string' || getFloorById(data.currentFloorId) === undefined) {
    return null;
  }

  if (
    typeof data.unlockedFloor !== 'number' ||
    !Number.isInteger(data.unlockedFloor) ||
    data.unlockedFloor < 1 ||
    data.unlockedFloor > FLOORS.length
  ) {
    return null;
  }

  if (typeof data.flashCharges !== 'number' || Number.isNaN(data.flashCharges)) {
    return null;
  }

  const crystals: GameColor[] = [];
  if (Array.isArray(data.collectedCrystals)) {
    for (const color of data.collectedCrystals) {
      if (isGameColor(color) && !crystals.includes(color)) {
        crystals.push(color);
      }
    }
  }

  return {
    version: SAVE_VERSION,
    currentFloorId: data.currentFloorId,
    unlockedFloor: data.unlockedFloor,
    collectedCrystals: crystals,
    flashCharges: Math.max(0, Math.min(MAX_FLASH_CHARGES, Math.floor(data.flashCharges))),
    completed: data.completed === true,
  };
}
