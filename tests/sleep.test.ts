import { describe, expect, it } from 'vitest';
import { classifyStart, clipSleeps, dayState, isMorningWake, segMinutes, sleepKind, windowSamples } from '../src/engine/sleep';
import { MIN } from '../src/engine/time';
import { at, sleep } from './helpers';

describe('вид сна по времени засыпания', () => {
  it('ночь — с 18:30 до 06:00', () => {
    expect(classifyStart(at(0, '18:29'))).toBe('nap');
    expect(classifyStart(at(0, '18:30'))).toBe('night');
    expect(classifyStart(at(0, '23:59'))).toBe('night');
    expect(classifyStart(at(0, '00:00'))).toBe('night');
    expect(classifyStart(at(0, '05:59'))).toBe('night');
    expect(classifyStart(at(0, '06:00'))).toBe('nap');
    expect(classifyStart(at(0, '12:00'))).toBe('nap');
  });
  it('ручной вид важнее времени', () => {
    expect(sleepKind(sleep(0, '12:00', '13:00', 0, { kind: 'night' }))).toBe('night');
    expect(sleepKind(sleep(0, '22:00', '23:00', 0, { kind: 'nap' }))).toBe('nap');
  });
});

describe('утреннее пробуждение', () => {
  it('ночной сон, закончившийся между 04:30 и 12:00', () => {
    expect(isMorningWake(sleep(-1, '20:00', '06:45', 0))).toBe(true);
    expect(isMorningWake(sleep(-1, '20:00', '04:30', 0))).toBe(true);
    expect(isMorningWake(sleep(-1, '20:00', '04:29', 0))).toBe(false);
    expect(isMorningWake(sleep(-1, '20:00', '03:50', 0))).toBe(false);
  });
  it('дневной сон и идущий сон — не утро', () => {
    expect(isMorningWake(sleep(0, '10:00', '11:00'))).toBe(false);
    expect(isMorningWake(sleep(-1, '20:00', null))).toBe(false);
  });
});

describe('clipSleeps', () => {
  it('режет сон по границам суток', () => {
    const night = sleep(-1, '20:00', '06:45', 0);
    const segs = clipSleeps([night], at(0, '00:00'), at(1, '00:00'), at(0, '12:00'));
    expect(segs).toHaveLength(1);
    expect(segMinutes(segs)).toBe(6 * 60 + 45);
    const yesterday = clipSleeps([night], at(-1, '00:00'), at(0, '00:00'), at(0, '12:00'));
    expect(segMinutes(yesterday)).toBe(4 * 60);
  });
  it('идущий сон считается до «сейчас»', () => {
    const s = sleep(0, '14:00', null);
    const segs = clipSleeps([s], at(0, '00:00'), at(1, '00:00'), at(0, '15:10'));
    expect(segMinutes(segs)).toBe(70);
    expect(segs[0].ongoing).toBe(true);
  });
  it('пересекающиеся записи не считаются дважды', () => {
    const a = sleep(0, '10:00', '11:00');
    const b = sleep(0, '10:30', '11:30');
    const segs = clipSleeps([a, b], at(0, '00:00'), at(1, '00:00'), at(0, '20:00'));
    expect(segs).toHaveLength(1);
    expect(segMinutes(segs)).toBe(90);
  });
  it('сон в будущем не попадает', () => {
    const s = sleep(0, '16:00', '17:00');
    expect(clipSleeps([s], at(0, '00:00'), at(1, '00:00'), at(0, '15:00'))).toHaveLength(1);
    // «сейчас» раньше начала: у идущего сна конец до начала — длины нет
    const going = sleep(0, '16:00', null);
    expect(clipSleeps([going], at(0, '00:00'), at(1, '00:00'), at(0, '15:00'))).toHaveLength(0);
  });
});

describe('состояние дня', () => {
  it('нет снов — «none»', () => {
    expect(dayState([], at(0, '12:00')).wakeKind).toBe('none');
  });
  it('после утреннего пробуждения дневных снов ещё не было', () => {
    const ds = dayState([sleep(-1, '20:00', '06:45', 0)], at(0, '08:00'));
    expect(ds.wakeKind).toBe('morning');
    expect(ds.napsDone).toBe(0);
  });
  it('считает дневные сны с утра', () => {
    const sleeps = [sleep(-1, '20:00', '06:45', 0), sleep(0, '08:30', '09:30'), sleep(0, '11:30', '12:40')];
    const ds = dayState(sleeps, at(0, '13:00'));
    expect(ds.wakeKind).toBe('nap');
    expect(ds.napsDone).toBe(2);
  });
  it('новое утро обнуляет счётчик', () => {
    const sleeps = [
      sleep(-2, '20:00', '06:45', -1),
      sleep(-1, '09:00', '10:00'),
      sleep(-1, '13:00', '14:00'),
      sleep(-1, '20:00', '06:40', 0),
    ];
    const ds = dayState(sleeps, at(0, '07:00'));
    expect(ds.napsDone).toBe(0);
    expect(ds.wakeKind).toBe('morning');
  });
  it('ночное пробуждение в 03:50 — не начало дня', () => {
    const ds = dayState([sleep(-1, '20:00', '03:50', 0)], at(0, '03:55'));
    expect(ds.wakeKind).toBe('night-waking');
  });
  it('идущий сон не считается завершённым', () => {
    const ds = dayState([sleep(-1, '20:00', '06:45', 0), sleep(0, '14:00', null)], at(0, '14:30'));
    expect(ds.last?.end).toBe(at(0, '06:45'));
  });
});

describe('замеры окон бодрствования', () => {
  const sleeps = [
    sleep(-1, '20:00', '06:45', 0),
    sleep(0, '08:30', '09:30'),
    sleep(0, '11:45', '12:45'),
    sleep(0, '20:00', null),
  ];
  it('пары «пробуждение → засыпание» с номером окна и режимом', () => {
    const s = windowSamples(sleeps, at(1, '00:00'));
    expect(s.map((x) => [x.windowIndex, x.mode, x.gapMin])).toEqual([
      [1, 'nap', 105],
      [2, 'nap', 135],
      [3, 'bedtime', 435],
    ]);
  });
  it('слишком короткие и слишком длинные промежутки не берём', () => {
    const odd = [sleep(0, '08:00', '08:30'), sleep(0, '08:35', '09:00'), sleep(0, '23:00', '23:30')];
    const s = windowSamples(odd, at(1, '00:00'));
    // 5 минут — слишком мало; 14 ч — слишком много
    expect(s).toHaveLength(0);
  });
  it('учитывает только то, что случилось до now', () => {
    const s = windowSamples(sleeps, at(0, '12:00'));
    expect(s).toHaveLength(2);
  });
  it('MIN — константа минут', () => {
    expect(MIN).toBe(60000);
  });
});
