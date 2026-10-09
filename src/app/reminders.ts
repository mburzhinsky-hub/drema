/**
 * Показ напоминаний. Планирует и считает engine/reminders.ts; здесь — таймер и уведомления.
 * Срабатывает, пока страница жива (открыта или свёрнута). Закрытое приложение уведомить не может — для этого нужен сервер.
 */
import { dueReminders, Reminder } from '../engine/reminders';
import { now } from '../engine/time';
import { derive } from '../store/select';
import { getState } from '../store/store';
import { showToast } from './ui';

const KEY = 'drema:fired';
const KEEP = 60;

function loadFired(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    const v = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function saveFired(ids: string[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(ids.slice(-KEEP)));
  } catch {
    /* хранилище недоступно — худшее, что будет: напоминание повторится после перезагрузки */
  }
}

export type Permission = NotificationPermission | 'unsupported';

export const notifPermission = (): Permission => (typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);

export async function requestNotifications(): Promise<Permission> {
  if (typeof Notification === 'undefined') return 'unsupported';
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

async function notify(r: Reminder): Promise<void> {
  const opts: NotificationOptions = { body: r.body, tag: r.id, icon: './icon-192.png', badge: './icon-192.png' };
  try {
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
    if (reg) await reg.showNotification(r.title, opts);
    else new Notification(r.title, opts);
  } catch {
    /* система не дала показать уведомление — всплывашка внутри приложения всё равно была */
  }
}

export function checkReminders(): void {
  const s = getState();
  if (!s.onboarded || s.demo) return;
  const t = now();
  const d = derive(s, t);
  if (!d) return;
  const fired = new Set(loadFired());
  const due = dueReminders(d.ctx, fired);
  if (!due.length) return;
  const visible = document.visibilityState === 'visible';
  let changed = false;
  for (const r of due) {
    // Помечаем «показано» только то, что реально показали: иначе напоминание пропадёт, пока вкладка была скрыта без разрешения.
    if (visible) {
      showToast(`${r.title}. ${r.body}`, undefined, { ms: 12000 });
      fired.add(r.id);
      changed = true;
    } else if (notifPermission() === 'granted') {
      void notify(r);
      fired.add(r.id);
      changed = true;
    }
  }
  if (changed) saveFired([...fired]);
}

export function startReminders(): void {
  setInterval(checkReminders, 20_000);
  document.addEventListener('visibilitychange', checkReminders);
  setTimeout(checkReminders, 1500);
}
