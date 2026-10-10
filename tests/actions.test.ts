import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NoteEvent } from '../src/engine/model';
import { liveEvents, sleepsOf } from '../src/engine/sleep';
import { MIN } from '../src/engine/time';
import {
  activeChild, addChild, addEvent, addMember, canUndo, clearDemo, endSleep, exportJSON, hasUserData, importJSON, inspectBackup, loadDemo, logDiaper,
  logFeed, patchEvent, removeChild, removeEvent, removeMember, resetAll, selectChild, setUserName, startSleep, undo, undoDepth,
  undoTo, updateChild, updateMember, updateSettings, validateSleepTimes,
} from '../src/store/actions';
import { disablePersistence, getState } from '../src/store/store';
import { at } from './helpers';

const NOW = at(0, '14:20');

beforeEach(() => {
  disablePersistence();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  resetAll();
});
afterEach(() => {
  vi.useRealTimers();
});

const withChild = () => addChild('Мила', '2026-05-02', 'f');
const eventsOfType = (type: string) => getState().events.filter((e) => e.type === type);

describe('ребёнок', () => {
  it('первый ребёнок завершает знакомство и становится активным', () => {
    expect(getState().onboarded).toBe(false);
    const c = withChild();
    expect(getState().onboarded).toBe(true);
    expect(activeChild()?.id).toBe(c.id);
  });

  it('пустое имя заменяется на «Малыш», пробелы обрезаются', () => {
    expect(addChild('   ', '2026-05-02', 'm').name).toBe('Малыш');
    expect(addChild('  Лев ', '2026-05-02', 'm').name).toBe('Лев');
  });

  it('новый ребёнок становится активным, selectChild переключает обратно', () => {
    const a = withChild();
    const b = addChild('Лев', '2025-01-01', 'm');
    expect(activeChild()?.id).toBe(b.id);
    selectChild(a.id);
    expect(activeChild()?.id).toBe(a.id);
  });

  it('selectChild с неизвестным id ничего не меняет', () => {
    const a = withChild();
    selectChild('нет-такого');
    expect(activeChild()?.id).toBe(a.id);
  });

  it('updateChild меняет только указанные поля', () => {
    const c = withChild();
    updateChild(c.id, { name: 'Мила-Роза' });
    expect(getState().children[0]).toMatchObject({ name: 'Мила-Роза', birth: '2026-05-02', gender: 'f' });
  });

  it('удаление ребёнка удаляет его записи и переключает активного', () => {
    const a = withChild();
    startSleep(at(0, '13:00'));
    const b = addChild('Лев', '2025-01-01', 'm');
    selectChild(a.id);
    removeChild(a.id);
    expect(getState().events).toHaveLength(0);
    expect(activeChild()?.id).toBe(b.id);
    expect(getState().onboarded).toBe(true);
  });

  it('удаление последнего ребёнка возвращает на знакомство', () => {
    const a = withChild();
    removeChild(a.id);
    expect(getState().children).toHaveLength(0);
    expect(getState().activeChildId).toBeNull();
    expect(getState().onboarded).toBe(false);
  });

  it('удаление ребёнка сбрасывает отмену: отменять уже нечего', () => {
    const a = withChild();
    logDiaper(NOW, 'wet');
    expect(canUndo()).toBe(true);
    removeChild(a.id);
    expect(canUndo()).toBe(false);
  });
});

describe('события', () => {
  it('без ребёнка запись невозможна', () => {
    expect(() => addEvent({ type: 'bath', t: NOW }, 'Купание')).toThrow();
  });

  it('запись получает id, ребёнка, время изменения и автора', () => {
    const c = withChild();
    const e = addEvent({ type: 'bath', t: NOW }, 'Купание');
    expect(e.id).toBeTruthy();
    expect(e.childId).toBe(c.id);
    expect(e.updatedAt).toBe(NOW);
    expect(e.by).toBe('Мама');
  });

  it('автор — имя из настроек', () => {
    withChild();
    setUserName('Аня');
    expect(addEvent({ type: 'bath', t: NOW }, 'Купание').by).toBe('Аня');
  });

  it('id уникальны', () => {
    withChild();
    const ids = new Set(Array.from({ length: 50 }, () => addEvent({ type: 'bath', t: NOW }, 'Купание').id));
    expect(ids.size).toBe(50);
  });

  it('правка обновляет updatedAt', () => {
    withChild();
    const e = addEvent<NoteEvent>({ type: 'note', t: NOW, text: 'раз' }, 'Заметка');
    vi.setSystemTime(NOW + 5 * MIN);
    patchEvent(e.id, { text: 'два' } as never, 'Правка');
    const got = getState().events[0];
    expect(got).toMatchObject({ text: 'два', updatedAt: NOW + 5 * MIN });
  });

  it('удаление оставляет «надгробие», а не стирает запись', () => {
    const c = withChild();
    const e = addEvent({ type: 'bath', t: NOW }, 'Купание');
    removeEvent(e.id, 'Удаление');
    expect(getState().events).toHaveLength(1);
    expect(getState().events[0].deleted).toBe(true);
    expect(liveEvents(getState().events, c.id)).toHaveLength(0);
  });

  it('logFeed не записывает пустые и нечисловые поля', () => {
    withChild();
    logFeed(NOW, 'bottle', { ml: 120, left: undefined, right: Number.NaN, note: undefined });
    const f = eventsOfType('feed')[0] as unknown as Record<string, unknown>;
    expect(f.ml).toBe(120);
    expect('left' in f).toBe(false);
    expect('right' in f).toBe(false);
    expect('note' in f).toBe(false);
  });

  it('logDiaper', () => {
    withChild();
    logDiaper(NOW, 'dirty');
    expect(eventsOfType('diaper')[0]).toMatchObject({ kind: 'dirty', t: NOW });
  });
});

describe('отмена', () => {
  it('нечего отменять в начале', () => {
    expect(canUndo()).toBe(false);
    expect(undo()).toBeNull();
  });

  it('отменяет добавление и возвращает подпись', () => {
    withChild();
    logFeed(NOW, 'bottle', { ml: 100 });
    expect(undo()).toBe('Кормление');
    expect(getState().events).toHaveLength(0);
  });

  it('отменяет удаление записи', () => {
    withChild();
    const e = addEvent({ type: 'bath', t: NOW }, 'Купание');
    removeEvent(e.id, 'Удаление');
    undo();
    expect(getState().events[0].deleted).toBeUndefined();
  });

  it('отменяет по одному, в обратном порядке', () => {
    withChild();
    logFeed(NOW, 'bottle', { ml: 100 });
    logDiaper(NOW, 'wet');
    expect(undo()).toBe('Подгузник');
    expect(undo()).toBe('Кормление');
    expect(undo()).toBeNull();
  });

  it('хранит не больше 30 шагов', () => {
    withChild();
    for (let i = 0; i < 40; i++) logDiaper(NOW + i, 'wet');
    expect(undoDepth()).toBe(30);
  });

  it('undoTo откатывает пачку записей одним шагом (голосовая фраза с несколькими действиями)', () => {
    withChild();
    logDiaper(NOW, 'wet');
    const depth = undoDepth();
    logFeed(NOW, 'bottle', { ml: 90 });
    logDiaper(NOW, 'dirty');
    expect(getState().events).toHaveLength(3);
    undoTo(depth);
    expect(getState().events).toHaveLength(1);
  });
});

describe('сон: начало и конец', () => {
  it('нельзя начать сон без ребёнка', () => {
    expect(startSleep()).toEqual({ ok: false, error: 'Сначала добавьте ребёнка' });
  });

  it('старт, потом конец; запись одна и закрывается', () => {
    withChild();
    const r = startSleep(at(0, '13:00'));
    expect(r.ok).toBe(true);
    const e = endSleep(at(0, '14:10'));
    expect(e.ok).toBe(true);
    const sleeps = sleepsOf(getState().events, getState().children[0].id);
    expect(sleeps).toHaveLength(1);
    expect(sleeps[0]).toMatchObject({ t: at(0, '13:00'), end: at(0, '14:10') });
  });

  it('по умолчанию время — сейчас', () => {
    withChild();
    startSleep();
    expect(eventsOfType('sleep')[0].t).toBe(NOW);
  });

  it('второй старт при идущем сне отклоняется', () => {
    withChild();
    startSleep(at(0, '13:00'));
    const r = startSleep(at(0, '13:30'));
    expect(r).toEqual({ ok: false, error: 'Сон уже идёт' });
    expect(eventsOfType('sleep')).toHaveLength(1);
  });

  it('нельзя начать сон в будущем', () => {
    withChild();
    expect(startSleep(NOW + 30 * MIN)).toEqual({ ok: false, error: 'Время ещё не наступило' });
  });

  it('допуск в минуту на расхождение часов', () => {
    withChild();
    expect(startSleep(NOW + 30_000).ok).toBe(true);
  });

  it('нельзя начать сон внутри уже записанного', () => {
    withChild();
    startSleep(at(0, '12:00'));
    endSleep(at(0, '13:00'));
    expect(startSleep(at(0, '12:30'))).toEqual({ ok: false, error: 'В это время уже записан сон' });
  });

  it('конец без начала отклоняется', () => {
    withChild();
    expect(endSleep()).toEqual({ ok: false, error: 'Сейчас сон не идёт' });
  });

  it('пробуждение должно быть позже засыпания', () => {
    withChild();
    startSleep(at(0, '13:00'));
    expect(endSleep(at(0, '12:00'))).toEqual({ ok: false, error: 'Пробуждение должно быть позже засыпания' });
    expect(endSleep(at(0, '13:00')).ok).toBe(false);
  });

  it('пробуждение в будущем отклоняется', () => {
    withChild();
    startSleep(at(0, '13:00'));
    expect(endSleep(NOW + 10 * MIN).ok).toBe(false);
  });

  it('сон дольше 20 часов не закрывается одним нажатием: забыли нажать «проснулась», время нужно указать вручную', () => {
    withChild();
    startSleep(at(-2, '09:00'));
    const r = endSleep();
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toMatch(/больше 20 часов/);
    // сон так и идёт: его можно закрыть, указав реальное время пробуждения
    expect(endSleep(at(-2, '10:30')).ok).toBe(true);
  });

  it('сон ровно на границе в 20 часов ещё можно закрыть', () => {
    withChild();
    startSleep(NOW - 20 * 60 * MIN);
    expect(endSleep().ok).toBe(true);
  });

  it('отмена пробуждения возвращает сон в «идёт»', () => {
    withChild();
    startSleep(at(0, '13:00'));
    endSleep(at(0, '14:00'));
    expect(undo()).toBe('Пробуждение');
    expect(eventsOfType('sleep')[0]).toMatchObject({ end: null });
  });

  it('удалённый сон не мешает начать новый', () => {
    withChild();
    const r = startSleep(at(0, '13:00'));
    if (!r.ok) throw new Error('не стартовал');
    removeEvent(r.value.id, 'Удаление');
    expect(startSleep(at(0, '13:30')).ok).toBe(true);
  });
});

describe('проверка правки времени сна', () => {
  const setup = () => {
    withChild();
    const a = startSleep(at(0, '09:00'));
    endSleep(at(0, '10:00'));
    const b = startSleep(at(0, '12:00'));
    endSleep(at(0, '13:00'));
    if (!a.ok || !b.ok) throw new Error('подготовка не удалась');
    return { a: a.value, b: b.value };
  };

  it('нормальная правка проходит', () => {
    const { b } = setup();
    expect(validateSleepTimes(b.id, at(0, '11:30'), at(0, '13:10'))).toBeNull();
  });

  it('пересечение с соседним сном', () => {
    const { b } = setup();
    expect(validateSleepTimes(b.id, at(0, '09:30'), at(0, '13:00'))).toBe('Это время пересекается с другим сном');
  });

  it('вплотную к соседнему сну — можно', () => {
    const { b } = setup();
    expect(validateSleepTimes(b.id, at(0, '10:00'), at(0, '13:00'))).toBeNull();
  });

  it('конец раньше начала', () => {
    const { b } = setup();
    expect(validateSleepTimes(b.id, at(0, '13:00'), at(0, '12:00'))).toBe('Пробуждение должно быть позже засыпания');
  });

  it('будущее время', () => {
    const { b } = setup();
    expect(validateSleepTimes(b.id, NOW + 10 * MIN, null)).toBe('Засыпание не может быть в будущем');
    expect(validateSleepTimes(b.id, at(0, '12:00'), NOW + 10 * MIN)).toBe('Пробуждение не может быть в будущем');
  });

  it('сон дольше 20 часов — просим проверить', () => {
    const { b } = setup();
    expect(validateSleepTimes(b.id, at(-1, '12:00'), at(0, '12:00') - 30 * MIN)).toBe('Сон дольше 20 часов — проверьте время');
  });

  it('идущий сон (end = null) проверяется до «сейчас»', () => {
    const { b } = setup();
    expect(validateSleepTimes(b.id, at(0, '12:00'), null)).toBeNull();
    expect(validateSleepTimes(b.id, at(0, '09:30'), null)).toBe('Это время пересекается с другим сном');
  });
});

describe('настройки и участники', () => {
  it('updateSettings сливает вложенные напоминания, а не затирает их', () => {
    updateSettings({ reminders: { feed: { on: true } } as never });
    const r = getState().settings.reminders;
    expect(r.feed.on).toBe(true);
    expect(r.window).toEqual({ on: true, lead: 10 });
  });

  it('updateSettings меняет простые поля', () => {
    updateSettings({ nightFrom: '20:30' });
    expect(getState().settings.nightFrom).toBe('20:30');
    expect(getState().settings.nightTo).toBe('06:00');
  });

  it('имя пользователя попадает в настройки и владельцу семьи', () => {
    setUserName('  Аня ');
    expect(getState().settings.userName).toBe('Аня');
    expect(getState().members.find((m) => m.role === 'owner')?.name).toBe('Аня');
  });

  it('пустое имя возвращает «Мама»', () => {
    setUserName('Аня');
    setUserName('   ');
    expect(getState().settings.userName).toBe('Мама');
  });

  it('участники: добавить, изменить роль, удалить; владельца удалить нельзя', () => {
    addMember(' Папа ', 'editor');
    const dad = getState().members.find((m) => m.name === 'Папа');
    expect(dad?.role).toBe('editor');
    updateMember(dad!.id, { role: 'viewer' });
    expect(getState().members.find((m) => m.id === dad!.id)?.role).toBe('viewer');
    removeMember(dad!.id);
    expect(getState().members.some((m) => m.id === dad!.id)).toBe(false);
    removeMember('me');
    expect(getState().members.some((m) => m.role === 'owner')).toBe(true);
  });

  it('участник без имени получает «Участник»', () => {
    addMember('   ', 'viewer');
    expect(getState().members.at(-1)?.name).toBe('Участник');
  });
});

describe('примерные данные', () => {
  it('загрузка включает примерного ребёнка с историей на три недели', () => {
    loadDemo();
    const s = getState();
    expect(s.demo).toBe(true);
    expect(s.onboarded).toBe(true);
    expect(activeChild()?.id).toBe('demo-mila');
    expect(s.events.length).toBeGreaterThan(200);
    expect(s.members.map((m) => m.name)).toEqual(expect.arrayContaining(['Папа', 'Бабушка']));
  });

  it('в демо нет записей «из будущего»', () => {
    loadDemo();
    for (const e of getState().events) expect(e.t).toBeLessThanOrEqual(NOW + MIN);
  });

  it('повторная загрузка не дублирует записи', () => {
    loadDemo();
    const n = getState().events.length;
    loadDemo();
    expect(getState().events.length).toBe(n);
    expect(getState().children.filter((c) => c.id === 'demo-mila')).toHaveLength(1);
  });

  it('очистка демо оставляет настоящих детей и их записи', () => {
    const real = withChild();
    logDiaper(NOW, 'wet');
    loadDemo();
    clearDemo();
    const s = getState();
    expect(s.demo).toBe(false);
    expect(s.children.map((c) => c.id)).toEqual([real.id]);
    expect(s.events).toHaveLength(1);
    expect(activeChild()?.id).toBe(real.id);
    expect(s.onboarded).toBe(true);
    expect(s.members.some((m) => m.id.startsWith('demo-'))).toBe(false);
  });

  it('очистка демо без других детей возвращает на знакомство', () => {
    loadDemo();
    clearDemo();
    expect(getState().children).toHaveLength(0);
    expect(getState().onboarded).toBe(false);
  });
});

describe('резервная копия', () => {
  it('выгрузка и загрузка возвращают то же самое', () => {
    withChild();
    startSleep(at(0, '13:00'));
    endSleep(at(0, '14:00'));
    logFeed(at(0, '12:00'), 'bottle', { ml: 110 });
    const text = exportJSON();
    const before = getState();
    resetAll();
    const r = importJSON(text);
    expect(r).toEqual({ ok: true, value: { children: 1, events: 2 } });
    expect(getState()).toEqual(before);
  });

  it('inspectBackup показывает, что в копии, и ничего не меняет', () => {
    withChild();
    logFeed(at(0, '12:00'), 'bottle', { ml: 110 });
    const e = addEvent({ type: 'bath', t: at(0, '11:00') } as never, 'Купание');
    removeEvent(e.id, 'Удаление');
    const text = exportJSON();
    const before = getState();
    expect(inspectBackup(text)).toEqual({ ok: true, value: { children: 1, events: 1 } });
    expect(getState()).toBe(before);
    expect(inspectBackup('это не json').ok).toBe(false);
    expect(inspectBackup('{"v":2,"children":[],"events":[]}').ok).toBe(false);
  });

  it('hasUserData: пусто и примерные данные не считаются, свои записи — считаются', () => {
    resetAll();
    expect(hasUserData()).toBe(false);
    loadDemo();
    expect(hasUserData()).toBe(false);
    clearDemo();
    withChild();
    expect(hasUserData()).toBe(true);
    resetAll();
    loadDemo();
    addChild('Тимур', '2025-09-01', 'm');
    expect(hasUserData()).toBe(true);
  });

  it('загрузка сбрасывает отмену', () => {
    withChild();
    logDiaper(NOW, 'wet');
    importJSON(exportJSON());
    expect(canUndo()).toBe(false);
  });

  it.each([
    ['не JSON', 'это не json'],
    ['пустой объект', '{}'],
    ['чужая версия', '{"v":2,"children":[],"events":[]}'],
    ['без записей', '{"v":1,"children":[]}'],
    ['null', 'null'],
    ['массив', '[]'],
  ])('отклоняет: %s', (_n, text) => {
    withChild();
    const before = getState();
    const r = importJSON(text);
    expect(r.ok).toBe(false);
    expect(getState()).toBe(before);
  });
});
