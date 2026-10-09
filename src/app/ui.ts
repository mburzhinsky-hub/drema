/** Состояние интерфейса, которое не нужно хранить: открытая шторка, уведомление, выбранный день. */
import { DiaperKind, FeedHow, DremaEvent, EventType, Role } from '../engine/model';

export type EntryType = Exclude<EventType, 'sleep' | 'diaper'> | 'diaper';

export interface EntrySheet {
  kind: 'entry';
  type: 'feed' | 'diaper' | 'temp' | 'med' | 'bath' | 'walk' | 'growth' | 'note';
  /** Правка существующей записи. */
  editId?: string;
  /** Время «чч:мм»; пусто — сейчас. */
  time: string;
  how: FeedHow;
  ml: string;
  left: string;
  right: string;
  food: string;
  diaper: DiaperKind;
  temp: string;
  medName: string;
  medDose: string;
  kg: string;
  cm: string;
  text: string;
  minutes: string;
  error?: string;
}

export interface SleepEditSheet {
  kind: 'sleep-edit';
  id: string;
  /** Значения для datetime-local. */
  start: string;
  end: string;
  ongoing: boolean;
  error?: string;
}

export interface ChildSheet {
  kind: 'child';
  mode: 'list' | 'edit' | 'new';
  editId?: string;
  name: string;
  birth: string;
  gender: 'f' | 'm';
  error?: string;
}

export interface VoiceSheet {
  kind: 'voice';
  phase: 'listening' | 'text' | 'confirm';
  transcript: string;
  error?: string;
}

export interface ConfirmSheet {
  kind: 'confirm';
  title: string;
  text: string;
  confirm: string;
  danger: boolean;
  run: () => void;
}

export interface SimpleSheet {
  kind: 'more' | 'reminders' | 'share-report' | 'invite' | 'profile' | 'login';
  text?: string;
  error?: string;
}

export interface MemberSheet {
  kind: 'member';
  id: string;
  name: string;
  role: Role;
}

export type Sheet = EntrySheet | SleepEditSheet | ChildSheet | VoiceSheet | ConfirmSheet | SimpleSheet | MemberSheet;

export interface Toast {
  id: number;
  text: string;
  action?: { label: string; run: () => void };
  /** Поднять выше (когда нет нижней навигации). */
  high?: boolean;
}

export interface VoiceParsed {
  lines: string[];
}

export const ui = {
  sheet: null as Sheet | null,
  toast: null as Toast | null,
  dayOffset: 0,
  dayTab: 'day' as 'day' | 'week',
  reportRange: 'week' as 'week' | 'month',
  reportQuestion: '',
  /** Ночной режим закрыт вручную на эту ночь. */
  nightDismissed: '' as string,
  /** Ночной режим открылся сам (а не по кнопке) — значит, сам и закроется утром. */
  nightAuto: false,
  /** Для чтения из файла и ссылок. */
  loginText: '',
  /** Правка из журнала: последняя событие, открытое в шторке. */
  lastEdit: null as DremaEvent | null,
};

let scheduled = false;
let renderFn: (() => void) | null = null;

export function setRenderer(fn: () => void): void {
  renderFn = fn;
}

/** Перерисовать на ближайшем кадре. */
export function invalidate(): void {
  if (scheduled || !renderFn) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    renderFn?.();
  });
}

/** Перерисовать сразу (тесты и начальная отрисовка). */
export function renderNow(): void {
  renderFn?.();
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;
let toastId = 0;

export function showToast(text: string, action?: Toast['action'], opts: { high?: boolean; ms?: number } = {}): void {
  clearTimeout(toastTimer);
  ui.toast = { id: ++toastId, text, action, high: opts.high };
  invalidate();
  toastTimer = setTimeout(() => {
    ui.toast = null;
    invalidate();
  }, opts.ms ?? 6000);
}

export function hideToast(): void {
  clearTimeout(toastTimer);
  ui.toast = null;
  invalidate();
}

export function openSheet(s: Sheet): void {
  ui.sheet = s;
  invalidate();
}

const closeHooks: Array<(s: Sheet) => void> = [];

/** Что сделать при закрытии шторки (например, остановить микрофон). */
export function onSheetClose(fn: (s: Sheet) => void): void {
  closeHooks.push(fn);
}

export function closeSheet(): void {
  const s = ui.sheet;
  ui.sheet = null;
  if (s) for (const h of closeHooks) h(s);
  invalidate();
}
