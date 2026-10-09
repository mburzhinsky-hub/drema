import { AppState, STORAGE_KEY, emptyState, sanitizeState } from './state';

type Listener = () => void;

let state: AppState = emptyState();
let persistEnabled = true;
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<Listener>();

export const getState = (): AppState => state;

export function loadFromStorage(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const s = sanitizeState(JSON.parse(raw));
    if (s) state = s;
  } catch {
    // хранилище недоступно или повреждено — начинаем с чистого листа
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
