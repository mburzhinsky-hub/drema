import { AppState, STORAGE_KEY, emptyState, sanitizeState } from './state';

type Listener = () => void;

let state: AppState = emptyState();
let persistEnabled = true;
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<Listener>();

export const getState = (): AppState => state;

/** Куда откладывается то, что лежало в хранилище, но не прочиталось: первая же запись иначе затёрла бы это навсегда. */
export const UNREADABLE_KEY = `${STORAGE_KEY}:unreadable`;

/** Складывает прежнее содержимое рядом: его можно вернуть, а не потерять при первом же сохранении. */
function keepUnreadable(raw: string): void {
  try {
    localStorage.setItem(UNREADABLE_KEY, raw);
  } catch {
    /* места нет — ничего не поделать */
  }
}

/** Что-то из записанного приложение выбросило как непонятное (ребёнок с битой датой, запись неизвестного вида). */
function droppedSomething(parsed: unknown, kept: AppState): boolean {
  if (typeof parsed !== 'object' || parsed === null) return false;
  const p = parsed as { children?: unknown; events?: unknown };
  return (Array.isArray(p.children) && p.children.length > kept.children.length) || (Array.isArray(p.events) && p.events.length > kept.events.length);
}

export function loadFromStorage(): void {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed: unknown = JSON.parse(raw);
    const s = sanitizeState(parsed);
    if (s) {
      state = s;
      // Прочиталось не всё: первая же запись перезапишет хранилище уже без выброшенного, поэтому исходник откладываем.
      if (droppedSomething(parsed, s)) keepUnreadable(raw);
      return;
    }
  } catch {
    // хранилище недоступно или повреждено — начинаем с чистого листа
  }
  // Данные есть, но приложение их не поняло (повреждены или записаны более новой версией). Начинаем с чистого листа,
  // но прежнее содержимое оставляем рядом.
  if (raw) keepUnreadable(raw);
}

export function disablePersistence(): void {
  persistEnabled = false;
}

function flush(): void {
  if (!persistEnabled) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // переполнено или запрещено — приложение продолжит работать в памяти
  }
}

export function setState(next: AppState): void {
  state = next;
  if (persistEnabled) {
    clearTimeout(timer);
    timer = setTimeout(flush, 200);
  }
  for (const l of listeners) l();
}

export function update(fn: (s: AppState) => AppState): void {
  setState(fn(state));
}

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    clearTimeout(timer);
    flush();
  });
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      clearTimeout(timer);
      flush();
    }
  });
}
