/** Все изменения данных проходят здесь: проверка, отметка времени, отмена. */
import { Child, DiaperKind, DremaEvent, FeedHow, Gender, Role, Settings, SleepEvent } from '../engine/model';
import { MIN, now as clockNow, startOfDay } from '../engine/time';
import { activeSleep, sleepsOf } from '../engine/sleep';
import { demoChild, demoEvents, snapshotAt } from '../demo/demo';
import { AppState, emptyState, sanitizeState } from './state';
import { getState, setState, update } from './store';

export function uid(): string {
  const c = globalThis.crypto;
  if (c && 'randomUUID' in c) return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// ───────────────────────── отмена ─────────────────────────

interface Snapshot {
  label: string;
  events: DremaEvent[];
}
const undoStack: Snapshot[] = [];
const UNDO_LIMIT = 30;

function remember(label: string): void {
  undoStack.push({ label, events: getState().events });
  if (undoStack.length > UNDO_LIMIT) undoStack.shift();
}

export function canUndo(): boolean {
  return undoStack.length > 0;
}

/** Возвращает подпись отменённого действия. */
export function undo(): string | null {
  const snap = undoStack.pop();
  if (!snap) return null;
  update((s) => ({ ...s, events: snap.events }));
  return snap.label;
}

export function forgetUndo(): void {
  undoStack.length = 0;
}

// ───────────────────────── события ─────────────────────────

export function activeChild(s: AppState = getState()): Child | null {
  return s.children.find((c) => c.id === s.activeChildId) ?? s.children[0] ?? null;
}

function author(): string {
  return getState().settings.userName || 'Мама';
}

type NewEvent<T extends DremaEvent> = Omit<T, 'id' | 'childId' | 'updatedAt' | 'by'> & { by?: string };

export function addEvent<T extends DremaEvent>(e: NewEvent<T>, label: string): T {
  const child = activeChild();
  if (!child) throw new Error('Нет выбранного ребёнка');
  const full = { ...e, id: uid(), childId: child.id, updatedAt: Date.now(), by: e.by ?? author() } as T;
  remember(label);
  update((s) => ({ ...s, events: [...s.events, full] }));
  return full;
}

export function patchEvent(id: string, patch: Partial<DremaEvent>, label: string): void {
  remember(label);
  update((s) => ({
    ...s,
    events: s.events.map((e) => (e.id === id ? ({ ...e, ...patch, updatedAt: Date.now() } as DremaEvent) : e)),
  }));
}

/** Удаление оставляет «надгробие», чтобы оно дошло до других устройств. */
export function removeEvent(id: string, label: string): void {
  remember(label);
  update((s) => ({
    ...s,
    events: s.events.map((e) => (e.id === id ? ({ ...e, deleted: true, updatedAt: Date.now() } as DremaEvent) : e)),
  }));
}

// ───────────────────────── сон ─────────────────────────

export type Result<T = void> = { ok: true; value: T } | { ok: false; error: string };

function overlaps(others: SleepEvent[], start: number, end: number, now: number, ignoreId?: string): SleepEvent | undefined {
  return others.find((o) => o.id !== ignoreId && o.t < end && (o.end ?? now) > start);
}

export function startSleep(t: number = clockNow()): Result<SleepEvent> {
  const child = activeChild();
  if (!child) return { ok: false, error: 'Сначала добавьте ребёнка' };
  const n = clockNow();
  if (t > n + MIN) return { ok: false, error: 'Время ещё не наступило' };
  const sleeps = sleepsOf(getState().events, child.id);
  if (activeSleep(sleeps)) return { ok: false, error: 'Сон уже идёт' };
  const clash = overlaps(sleeps, t, t + MIN, n);
  if (clash) return { ok: false, error: 'В это время уже записан сон' };
  const e = addEvent<SleepEvent>({ type: 'sleep', t, end: null }, 'Начало сна');
  return { ok: true, value: e };
}

export function endSleep(t: number = clockNow()): Result<SleepEvent> {
  const child = activeChild();
  if (!child) return { ok: false, error: 'Сначала добавьте ребёнка' };
  const sleeps = sleepsOf(getState().events, child.id);
  const act = activeSleep(sleeps);
  if (!act) return { ok: false, error: 'Сейчас сон не идёт' };
  const n = clockNow();
  if (t > n + MIN) return { ok: false, error: 'Время ещё не наступило' };
  if (t <= act.t) return { ok: false, error: 'Пробуждение должно быть позже засыпания' };
  patchEvent(act.id, { end: t } as Partial<SleepEvent>, 'Пробуждение');
  return { ok: true, value: { ...act, end: t } };
}

/** Проверка правки времени сна (засыпание / пробуждение). */
export function validateSleepTimes(id: string, start: number, end: number | null): string | null {
  const child = activeChild();
  if (!child) return 'Нет выбранного ребёнка';
  const n = clockNow();
  if (start > n + MIN) return 'Засыпание не может быть в будущем';
  if (end !== null && end > n + MIN) return 'Пробуждение не может быть в будущем';
  if (end !== null && end <= start) return 'Пробуждение должно быть позже засыпания';
  if (end !== null && end - start > 20 * 60 * MIN) return 'Сон дольше 20 часов — проверьте время';
  const others = sleepsOf(getState().events, child.id);
  const clash = overlaps(others, start, end ?? n, n, id);
  if (clash) return 'Это время пересекается с другим сном';
  return null;
}

// ───────────────────────── быстрые записи ─────────────────────────

export function logFeed(
  t: number,
  how: FeedHow,
  extra: { ml?: number; left?: number; right?: number; min?: number; note?: string },
): void {
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(extra)) if (v !== undefined && v !== null && !(typeof v === 'number' && Number.isNaN(v))) clean[k] = v;
  addEvent({ type: 'feed', t, how, ...clean } as NewEvent<DremaEvent>, 'Кормление');
}

export function logDiaper(t: number, kind: DiaperKind): void {
  addEvent({ type: 'diaper', t, kind } as NewEvent<DremaEvent>, 'Подгузник');
}

// ───────────────────────── дети и настройки ─────────────────────────

export function addChild(name: string, birth: string, gender: Gender): Child {
  const child: Child = { id: uid(), name: name.trim() || 'Малыш', birth, gender, createdAt: Date.now() };
  update((s) => ({
    ...s,
    onboarded: true,
    children: [...s.children, child],
    activeChildId: child.id,
  }));
  return child;
}

export function updateChild(id: string, patch: Partial<Pick<Child, 'name' | 'birth' | 'gender'>>): void {
  update((s) => ({ ...s, children: s.children.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
}

export function removeChild(id: string): void {
  update((s) => {
    const children = s.children.filter((c) => c.id !== id);
    return {
      ...s,
      children,
      events: s.events.filter((e) => e.childId !== id),
      activeChildId: s.activeChildId === id ? (children[0]?.id ?? null) : s.activeChildId,
      onboarded: children.length > 0 && s.onboarded,
    };
  });
  forgetUndo();
}

export function selectChild(id: string): void {
  update((s) => (s.children.some((c) => c.id === id) ? { ...s, activeChildId: id } : s));
}

export function updateSettings(patch: Partial<Settings>): void {
  update((s) => ({ ...s, settings: { ...s.settings, ...patch, reminders: { ...s.settings.reminders, ...(patch.reminders ?? {}) } } }));
}

export function setUserName(name: string): void {
  const n = name.trim() || 'Мама';
  update((s) => ({
    ...s,
    settings: { ...s.settings, userName: n },
    members: s.members.map((m) => (m.role === 'owner' ? { ...m, name: n } : m)),
  }));
}

export function addMember(name: string, role: Role): void {
  update((s) => ({ ...s, members: [...s.members, { id: uid(), name: name.trim() || 'Участник', role }] }));
}

export function updateMember(id: string, patch: { name?: string; role?: Role }): void {
  update((s) => ({ ...s, members: s.members.map((m) => (m.id === id ? { ...m, ...patch } : m)) }));
}

export function removeMember(id: string): void {
  update((s) => ({ ...s, members: s.members.filter((m) => m.id !== id || m.role === 'owner') }));
}

// ───────────────────────── данные ─────────────────────────

/** Примерные данные: три недели жизни Милы, «сегодня» — настоящий сегодняшний день. */
export function loadDemo(): void {
  const n = clockNow();
  const anchor = startOfDay(n);
  const child = demoChild(anchor);
  const events = snapshotAt(demoEvents(anchor), n);
  forgetUndo();
  update((s) => ({
    ...s,
    onboarded: true,
    demo: true,
    children: [child, ...s.children.filter((c) => c.id !== child.id)],
    activeChildId: child.id,
    events: [...s.events.filter((e) => e.childId !== child.id), ...events],
    members: [
      { id: 'me', name: s.settings.userName, role: 'owner' },
      { id: 'demo-dad', name: 'Папа', role: 'editor' },
      { id: 'demo-gran', name: 'Бабушка', role: 'viewer' },
    ],
  }));
}

export function clearDemo(): void {
  forgetUndo();
  update((s) => {
    const children = s.children.filter((c) => c.id !== 'demo-mila');
    return {
      ...s,
      demo: false,
      children,
      events: s.events.filter((e) => e.childId !== 'demo-mila'),
      activeChildId: children[0]?.id ?? null,
      onboarded: children.length > 0,
      members: s.members.filter((m) => !m.id.startsWith('demo-')),
    };
  });
}

export function resetAll(): void {
  forgetUndo();
  setState(emptyState());
}

export function exportJSON(): string {
  return JSON.stringify(getState(), null, 2);
}

export function importJSON(text: string): Result<{ children: number; events: number }> {
  try {
    const s = sanitizeState(JSON.parse(text));
    if (!s) return { ok: false, error: 'Файл не похож на резервную копию «Дрёмы»' };
    forgetUndo();
    setState(s);
    return { ok: true, value: { children: s.children.length, events: s.events.length } };
  } catch {
    return { ok: false, error: 'Не удалось прочитать файл' };
  }
}


/** Сколько действий можно отменить: нужно, чтобы одним нажатием отменить пачку записей (голосом). */
export const undoDepth = (): number => undoStack.length;

export function undoTo(depth: number): void {
  while (undoStack.length > depth) undo();
}
