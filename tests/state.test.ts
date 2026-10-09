import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/engine/model';
import { emptyState, sanitizeEvent, sanitizeState } from '../src/store/state';

const child = { id: 'c1', name: 'Мила', birth: '2026-05-02', gender: 'f', createdAt: 1 };
const ids = new Set(['c1']);
const ev = (extra: Record<string, unknown>) => ({ id: 'e1', childId: 'c1', t: 1000, updatedAt: 5, ...extra });
const good = (events: unknown[] = [], extra: Record<string, unknown> = {}) => ({ v: 1, onboarded: true, children: [child], events, ...extra });

describe('пустое состояние', () => {
  it('в нём есть владелец семьи и настройки по умолчанию', () => {
    const s = emptyState();
    expect(s.members).toEqual([{ id: 'me', name: 'Мама', role: 'owner' }]);
    expect(s.settings).toEqual(DEFAULT_SETTINGS);
    expect(s.onboarded).toBe(false);
  });

  it('настройки — копия, а не общий объект', () => {
    const a = emptyState();
    a.settings.reminders.feed.on = true;
    expect(emptyState().settings.reminders.feed.on).toBe(false);
    expect(DEFAULT_SETTINGS.reminders.feed.on).toBe(false);
  });
});

describe('sanitizeState: структура', () => {
  it.each([null, undefined, 5, 'x', [], {}, { v: 2 }, { v: 1 }, { v: 1, children: [] }, { v: 1, events: [] }])('отклоняет %j', (raw) => {
    expect(sanitizeState(raw)).toBeNull();
  });

  it('принимает минимальную копию', () => {
    const s = sanitizeState(good());
    expect(s).not.toBeNull();
    expect(s!.children).toHaveLength(1);
    expect(s!.activeChildId).toBe('c1');
    expect(s!.onboarded).toBe(true);
  });

  it('«знакомство пройдено» без детей невозможно', () => {
    expect(sanitizeState({ v: 1, onboarded: true, children: [], events: [] })!.onboarded).toBe(false);
  });

  it('активный ребёнок с неизвестным id заменяется первым', () => {
    expect(sanitizeState(good([], { activeChildId: 'нет' }))!.activeChildId).toBe('c1');
  });

  it('отбрасывает детей с неверными полями', () => {
    const s = sanitizeState({
      v: 1,
      children: [child, { ...child, id: 'c2', gender: 'x' }, { ...child, id: 'c3', birth: 'вчера' }, { ...child, id: 5 }, null],
      events: [],
    });
    expect(s!.children.map((c) => c.id)).toEqual(['c1']);
  });

  it('записи несуществующего ребёнка отбрасываются', () => {
    const s = sanitizeState(good([ev({ type: 'bath' }), ev({ id: 'e2', childId: 'призрак', type: 'bath' })]));
    expect(s!.events.map((e) => e.id)).toEqual(['e1']);
  });

  it('при одинаковом id остаётся запись, изменённая позже', () => {
    const s = sanitizeState(good([ev({ type: 'note', text: 'старая', updatedAt: 1 }), ev({ type: 'note', text: 'новая', updatedAt: 9 }), ev({ type: 'note', text: 'ещё старее', updatedAt: 3 })]));
    expect(s!.events).toHaveLength(1);
    expect(s!.events[0]).toMatchObject({ text: 'новая' });
  });
});

describe('sanitizeEvent: общие поля', () => {
  it.each([null, 5, 'x', [], {}, ev({ type: 'неизвестный' }), ev({ type: 'bath', t: Number.NaN }), ev({ type: 'bath', t: 'вчера' }), ev({ type: 'bath', id: 7 })])(
    'отклоняет %j',
    (raw) => {
      expect(sanitizeEvent(raw, ids)).toBeNull();
    },
  );

  it('updatedAt по умолчанию 0', () => {
    expect(sanitizeEvent({ id: 'e', childId: 'c1', t: 1, type: 'bath' }, ids)!.updatedAt).toBe(0);
  });

  it('«надгробие» сохраняется только как true', () => {
    expect(sanitizeEvent(ev({ type: 'bath', deleted: true }), ids)!.deleted).toBe(true);
    expect(sanitizeEvent(ev({ type: 'bath', deleted: 'yes' }), ids)!.deleted).toBeUndefined();
  });

  it('лишние поля отбрасываются', () => {
    const e = sanitizeEvent(ev({ type: 'bath', evil: '<script>' }), ids)!;
    expect('evil' in e).toBe(false);
  });
});

describe('sanitizeEvent: по типам', () => {
  it('сон: идущий — только с явным null', () => {
    expect(sanitizeEvent(ev({ type: 'sleep', end: null }), ids)).toMatchObject({ end: null });
    expect(sanitizeEvent(ev({ type: 'sleep' }), ids)).toBeNull();
    expect(sanitizeEvent(ev({ type: 'sleep', end: 'позже' }), ids)).toBeNull();
  });

  it('сон: конец раньше начала отбрасывается', () => {
    expect(sanitizeEvent(ev({ type: 'sleep', end: 500 }), ids)).toBeNull();
    expect(sanitizeEvent(ev({ type: 'sleep', end: 1000 }), ids)).toMatchObject({ end: 1000 });
  });

  it('сон: вид сохраняется только допустимый', () => {
    expect(sanitizeEvent(ev({ type: 'sleep', end: null, kind: 'nap' }), ids)).toMatchObject({ kind: 'nap' });
    expect(sanitizeEvent(ev({ type: 'sleep', end: null, kind: 'x' }), ids)!).not.toHaveProperty('kind');
  });

  it('кормление: способ обязателен, числа — только числа', () => {
    expect(sanitizeEvent(ev({ type: 'feed' }), ids)).toBeNull();
    expect(sanitizeEvent(ev({ type: 'feed', how: 'ложкой' }), ids)).toBeNull();
    const f = sanitizeEvent(ev({ type: 'feed', how: 'bottle', ml: 120, left: 'много', right: Number.NaN }), ids)!;
    expect(f).toMatchObject({ how: 'bottle', ml: 120 });
    expect(f).not.toHaveProperty('left');
    expect(f).not.toHaveProperty('right');
  });

  it('подгузник: вид обязателен', () => {
    expect(sanitizeEvent(ev({ type: 'diaper', kind: 'dirty' }), ids)).toMatchObject({ kind: 'dirty' });
    expect(sanitizeEvent(ev({ type: 'diaper', kind: 'x' }), ids)).toBeNull();
  });

  it('температура, лекарство, заметка требуют своё поле', () => {
    expect(sanitizeEvent(ev({ type: 'temp', c: 37.1 }), ids)).toMatchObject({ c: 37.1 });
    expect(sanitizeEvent(ev({ type: 'temp' }), ids)).toBeNull();
    expect(sanitizeEvent(ev({ type: 'med', name: 'Вит. Д', dose: '2 капли' }), ids)).toMatchObject({ name: 'Вит. Д', dose: '2 капли' });
    expect(sanitizeEvent(ev({ type: 'med' }), ids)).toBeNull();
    expect(sanitizeEvent(ev({ type: 'note', text: 'зуб' }), ids)).toMatchObject({ text: 'зуб' });
    expect(sanitizeEvent(ev({ type: 'note' }), ids)).toBeNull();
  });

  it('рост и вес: числа сохраняются, мусор отсеивается', () => {
    const g = sanitizeEvent(ev({ type: 'growth', kg: 7.5, cm: '68' }), ids)!;
    expect(g).toMatchObject({ kg: 7.5 });
    expect(g).not.toHaveProperty('cm');
  });

  it('длинные строки обрезаются', () => {
    const n = sanitizeEvent(ev({ type: 'note', text: 'я'.repeat(5000) }), ids) as { text: string };
    expect(n.text.length).toBe(500);
  });
});

describe('sanitizeState: участники и настройки', () => {
  it('владелец есть всегда', () => {
    const s = sanitizeState(good([], { members: [{ id: 'd', name: 'Папа', role: 'editor' }] }))!;
    expect(s.members.some((m) => m.role === 'owner')).toBe(true);
    expect(s.members.some((m) => m.name === 'Папа')).toBe(true);
  });

  it('участники с неверной ролью отбрасываются', () => {
    const s = sanitizeState(good([], { members: [{ id: 'me', name: 'Мама', role: 'owner' }, { id: 'x', name: 'Хакер', role: 'admin' }] }))!;
    expect(s.members.map((m) => m.id)).toEqual(['me']);
  });

  it('пустые настройки дополняются значениями по умолчанию', () => {
    expect(sanitizeState(good())!.settings).toEqual(DEFAULT_SETTINGS);
  });

  it('частичные настройки дополняются, включая вложенные напоминания', () => {
    const s = sanitizeState(good([], { settings: { nightFrom: '20:00', reminders: { feed: { on: true } } } }))!;
    expect(s.settings.nightFrom).toBe('20:00');
    expect(s.settings.nightTo).toBe('06:00');
    expect(s.settings.reminders.feed.on).toBe(true);
    expect(s.settings.reminders.window).toEqual({ on: true, lead: 10 });
  });

  it('неверное время ночи заменяется значением по умолчанию', () => {
    const s = sanitizeState(good([], { settings: { nightFrom: '25:99', nightTo: 'утро', bedtime: 'поздно' } }))!;
    expect(s.settings.nightFrom).toBe('21:00');
    expect(s.settings.nightTo).toBe('06:00');
    expect(s.settings.bedtime).toBeUndefined();
  });

  it('желаемый отбой сохраняется', () => {
    expect(sanitizeState(good([], { settings: { bedtime: '19:45' } }))!.settings.bedtime).toBe('19:45');
  });

  it('упреждение окна ограничено 0–120 минутами', () => {
    expect(sanitizeState(good([], { settings: { reminders: { window: { lead: 9999 } } } }))!.settings.reminders.window.lead).toBe(120);
    expect(sanitizeState(good([], { settings: { reminders: { window: { lead: -5 } } } }))!.settings.reminders.window.lead).toBe(0);
    expect(sanitizeState(good([], { settings: { reminders: { window: { lead: 'скоро' } } } }))!.settings.reminders.window.lead).toBe(10);
  });

  it('пустое имя пользователя заменяется на «Мама»', () => {
    expect(sanitizeState(good([], { settings: { userName: '   ' } }))!.settings.userName).toBe('Мама');
  });

  it('повторная очистка ничего не меняет', () => {
    const once = sanitizeState(good([ev({ type: 'feed', how: 'bottle', ml: 100 })], { settings: { nightFrom: '20:00' } }))!;
    expect(sanitizeState(JSON.parse(JSON.stringify(once)))).toEqual(once);
  });
});
