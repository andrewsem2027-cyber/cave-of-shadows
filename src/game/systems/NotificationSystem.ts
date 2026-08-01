import Phaser from 'phaser';
import { GAME_WIDTH } from '../config';

const UI_DEPTH = 200;
const NOTIFY_VISIBLE_MS = 1600;

/**
 * Единое переиспользуемое уведомление вверху экрана: одна строка текста,
 * очередь сообщений без дубликатов, без спама каждый кадр.
 */
export class NotificationSystem {
  private readonly text: Phaser.GameObjects.Text;
  private readonly queue: string[] = [];
  private current: string | null = null;
  private busyUntil = 0;
  private timer: Phaser.Time.TimerEvent | null = null;

  constructor(private readonly scene: Phaser.Scene) {
    this.text = scene.add
      .text(GAME_WIDTH / 2, 16, '', { fontSize: '16px', color: '#ffd98a' })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(UI_DEPTH)
      .setVisible(false);

    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
  }

  /** Поставить сообщение в очередь; повтор уже показанного или queued игнорируется. */
  notify(message: string): void {
    if (this.current === message || this.queue.includes(message)) {
      return;
    }
    this.queue.push(message);
    this.pump();
  }

  private pump(): void {
    if (this.queue.length === 0 || this.scene.time.now < this.busyUntil) {
      return;
    }
    const message = this.queue.shift();
    if (message === undefined) {
      return;
    }
    this.current = message;
    this.text.setText(message);
    this.text.setVisible(true);
    this.busyUntil = this.scene.time.now + NOTIFY_VISIBLE_MS;

    this.timer?.remove(false);
    this.timer = this.scene.time.delayedCall(NOTIFY_VISIBLE_MS, () => {
      this.timer = null;
      this.current = null;
      if (this.queue.length === 0) {
        this.text.setVisible(false);
      }
      this.pump();
    });
  }

  private destroy(): void {
    this.timer?.remove(false);
    this.timer = null;
    this.queue.length = 0;
    this.current = null;
    this.text.destroy();
  }
}
