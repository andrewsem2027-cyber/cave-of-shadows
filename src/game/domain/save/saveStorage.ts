/**
 * Адаптер хранения SaveData в localStorage: единственное место,
 * зависящее от DOM. Повреждённый JSON не ломает запуск игры.
 */

import { SaveData, parseSave } from './SaveData';

const STORAGE_KEY = 'cave-of-shadows-save-v1';

/** Читает сохранение; невалидные и повреждённые данные дают null. */
export function loadSave(): SaveData | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      return null;
    }
    return parseSave(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writeSave(data: SaveData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Хранилище недоступно (приватный режим): игра продолжается без записи.
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Хранилище недоступно: очищать нечего.
  }
}
