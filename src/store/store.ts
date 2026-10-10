import { AppState, STORAGE_KEY, emptyState, sanitizeState } from './state';

type Listener = () => void;

let state: AppState = emptyState();
let persistEnabled = true;
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<Listener>();

export const getState = (): AppState => state;

/** Куда откладывается то, что лежало в хранилище, но не прочиталось: первая же запись иначе затёрла бы это навсегда. */
export const UNREADABLE_KEY = `${STORAGE_KEY}:unreadable`;

export function loadFromStorage(): void {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const s = sanitizeState(JSON.parse(raw));
    if (s) {
      state = s;
      return;
    }
  } catch {
    // хранилище недоступно или повреждено — начинаем с чистого листа
  }
  // Данные есть, но приложение их не поняло (повреждены или записаны более новой версией). Начинаем с чистого листа,
  // но прежнее содержимое оставляем рядом: его можно вернуть, а не потерять при первом же сохранении.
  if (raw) {
    try {
      localStorage.setItem(UNREADABLE_KEY, raw);
    } catch {
      /* места нет — ничего не поделать */
    }
  }
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
