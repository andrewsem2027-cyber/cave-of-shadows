/**
 * Обучение первого этажа: одноразовые подсказки.
 * Память — на текущую сессию страницы: смерть, перезапуск этажа и
 * переходы не повторяют подсказки; подтверждённая новая игра сбрасывает
 * память через resetTutorialSession.
 */

import { NotificationSystem } from './NotificationSystem';

const shownThisSession = new Set<string>();

/** Сброс памяти подсказок при подтверждённой новой игре. */
export function resetTutorialSession(): void {
  shownThisSession.clear();
}

export class TutorialSystem {
  constructor(
    /** Подсказки показываются только на первом этаже. */
    private readonly enabled: boolean,
    private readonly notify: NotificationSystem,
  ) {}

  /** Показать подсказку не более одного раза за сессию. */
  showOnce(id: string, message: string): void {
    if (!this.enabled || shownThisSession.has(id)) {
      return;
    }
    shownThisSession.add(id);
    this.notify.notify(message);
  }
}
