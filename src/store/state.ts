import { Child, DEFAULT_SETTINGS, DremaEvent, EventType, Member, Role, Settings } from '../engine/model';
import { parseHM } from '../engine/time';

export interface AppState {
  v: 1;
  onboarded: boolean;
  children: Child[];
  activeChildId: string | null;
  events: DremaEvent[];
  members: Member[];
  settings: Settings;
  /** Показаны примерные данные. */
  demo: boolean;
}

export const STORAGE_KEY = 'drema:v1';

/** Самая длинная заметка: всё, что длиннее, при сохранении и чтении обрезалось бы молча, поэтому ограничиваем при вводе. */
export const NOTE_MAX = 500;

export function emptyState(): AppState {
  return {
    v: 1,
    onboarded: false,
    children: [],
    activeChildId: null,
    events: [],
    members: [{ id: 'me', name: DEFAULT_SETTINGS.userName, role: 'owner' }],
    settings: structuredClone(DEFAULT_SETTINGS),
    demo: false,
  };
}

// ───────────────────────── проверка данных ─────────────────────────
// Данные приходят из хранилища браузера и из файла резервной копии. Любое неверное поле
// должно отсеиваться здесь, а не ломать расчёты и экраны.

const EVENT_TYPES: ReadonlySet<string> = new Set<EventType>(['sleep', 'feed', 'diaper', 'temp', 'med', 'bath', 'walk', 'growth', 'note']);
const ROLES: ReadonlySet<string> = new Set<Role>(['owner', 'editor', 'viewer']);

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Оставляет у записи только числа, которые на самом деле числа. */
function numbers(src: Record<string, unknown>, keys: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of keys) if (isNum(src[k])) out[k] = src[k] as number;
  return out;
}

/** Проверяет одну запись; возвращает исправленную копию или null, если запись непригодна. */
export function sanitizeEvent(raw: unknown, childIds: ReadonlySet<string>): DremaEvent | null {
  if (!isObj(raw)) return null;
  const { id, childId, type, t } = raw;
  if (!isStr(id) || !isStr(childId) || !isStr(type) || !isNum(t)) return null;
  if (!childIds.has(childId) || !EVENT_TYPES.has(type)) return null;

  const base = {
    id,
    childId,
    t,
    updatedAt: isNum(raw.updatedAt) ? raw.updatedAt : 0,
    ...(raw.deleted === true ? { deleted: true as const } : {}),
    ...(isStr(raw.by) ? { by: raw.by.slice(0, 40) } : {}),
  };

  switch (type as EventType) {
    case 'sleep': {
      // Незаконченный сон — только явный null; пустое поле значило бы «спит сейчас» по ошибке.
      if (raw.end !== null && !isNum(raw.end)) return null;
      if (raw.end !== null && (raw.end as number) < t) return null;
      return { ...base, type: 'sleep', end: raw.end as number | null, ...(raw.kind === 'night' || raw.kind === 'nap' ? { kind: raw.kind } : {}) };
    }
    case 'feed': {
      if (raw.how !== 'bottle' && raw.how !== 'breast' && raw.how !== 'solid') return null;
      return {
        ...base,
        type: 'feed',
        how: raw.how,
        ...numbers(raw, ['ml', 'left', 'right', 'min']),
        ...(isStr(raw.note) ? { note: raw.note.slice(0, 120) } : {}),
      };
    }
    case 'diaper':
      if (raw.kind !== 'wet' && raw.kind !== 'dirty' && raw.kind !== 'mixed') return null;
      return { ...base, type: 'diaper', kind: raw.kind };
    case 'temp':
      return isNum(raw.c) ? { ...base, type: 'temp', c: raw.c } : null;
    case 'med':
      return isStr(raw.name) ? { ...base, type: 'med', name: raw.name.slice(0, 80), ...(isStr(raw.dose) ? { dose: raw.dose.slice(0, 40) } : {}) } : null;
    case 'bath':
      return { ...base, type: 'bath' };
    case 'walk':
      return { ...base, type: 'walk', ...(raw.end === null || isNum(raw.end) ? { end: raw.end as number | null } : {}) };
    case 'growth':
      return { ...base, type: 'growth', ...numbers(raw, ['kg', 'cm']) };
    case 'note':
      return isStr(raw.text) ? { ...base, type: 'note', text: raw.text.slice(0, NOTE_MAX) } : null;
  }
}

function sanitizeChild(c: unknown): Child | null {
  if (!isObj(c)) return null;
  if (!isStr(c.id) || !isStr(c.name) || !isStr(c.birth) || (c.gender !== 'f' && c.gender !== 'm')) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(c.birth) || Number.isNaN(Date.parse(c.birth))) return null;
  return { id: c.id, name: c.name.slice(0, 40), birth: c.birth, gender: c.gender, createdAt: isNum(c.createdAt) ? c.createdAt : 0 };
}

function sanitizeMembers(raw: unknown): Member[] {
  const list = Array.isArray(raw)
    ? raw.flatMap((m): Member[] => (isObj(m) && isStr(m.id) && isStr(m.name) && isStr(m.role) && ROLES.has(m.role) ? [{ id: m.id, name: m.name.slice(0, 40), role: m.role as Role }] : []))
    : [];
  // Владелец есть всегда: без него некому подписывать записи и нельзя управлять доступом.
  return list.some((m) => m.role === 'owner') ? list : [...emptyState().members, ...list.filter((m) => m.id !== 'me')];
}

function sanitizeSettings(raw: unknown): Settings {
  const d = structuredClone(DEFAULT_SETTINGS);
  if (!isObj(raw)) return d;
  const hm = (v: unknown, fallback: string): string => (isStr(v) && !Number.isNaN(parseHM(v)) ? v : fallback);
  const r = isObj(raw.reminders) ? raw.reminders : {};
  const win = isObj(r.window) ? r.window : {};
  const feed = isObj(r.feed) ? r.feed : {};
  const wake = isObj(r.wake) ? r.wake : {};
  const bedtime = isStr(raw.bedtime) && !Number.isNaN(parseHM(raw.bedtime)) ? raw.bedtime : undefined;
  return {
    nightAuto: typeof raw.nightAuto === 'boolean' ? raw.nightAuto : d.nightAuto,
    nightFrom: hm(raw.nightFrom, d.nightFrom),
    nightTo: hm(raw.nightTo, d.nightTo),
    ...(bedtime ? { bedtime } : {}),
    reminders: {
      window: {
        on: typeof win.on === 'boolean' ? win.on : d.reminders.window.on,
        lead: isNum(win.lead) ? Math.min(120, Math.max(0, Math.round(win.lead))) : d.reminders.window.lead,
      },
      feed: { on: typeof feed.on === 'boolean' ? feed.on : d.reminders.feed.on },
      wake: { on: typeof wake.on === 'boolean' ? wake.on : d.reminders.wake.on },
    },
    userName: isStr(raw.userName) && raw.userName.trim() ? raw.userName.trim().slice(0, 40) : d.userName,
  };
}

/** Проверка и «лечение» данных из хранилища или файла: без неё чужой файл может сломать экраны. */
export function sanitizeState(raw: unknown): AppState | null {
  if (!isObj(raw)) return null;
  if (raw.v !== 1) return null;
  if (!Array.isArray(raw.children) || !Array.isArray(raw.events)) return null;

  const children = raw.children.flatMap((c): Child[] => {
    const ok = sanitizeChild(c);
    return ok ? [ok] : [];
  });
  const ids = new Set(children.map((c) => c.id));

  // Одинаковый id у двух записей: остаётся та, что изменена позже, как и при слиянии с другим устройством.
  const byId = new Map<string, DremaEvent>();
  for (const e of raw.events) {
    const ok = sanitizeEvent(e, ids);
    if (!ok) continue;
    const prev = byId.get(ok.id);
    if (!prev || ok.updatedAt >= prev.updatedAt) byId.set(ok.id, ok);
  }

  const active = children.find((c) => c.id === raw.activeChildId)?.id ?? children[0]?.id ?? null;
  return {
    v: 1,
    onboarded: raw.onboarded === true && children.length > 0,
    children,
    activeChildId: active,
    events: [...byId.values()],
    members: sanitizeMembers(raw.members),
    settings: sanitizeSettings(raw.settings),
    demo: raw.demo === true,
  };
}
