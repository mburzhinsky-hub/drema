import { describe, expect, it } from 'vitest';
import {
  fmtDur, fmtDurWords, fmtDurWordsGen, fmtNum, fmtPeriod, fmtRange, fmtTimer, genitive, ordinal, plural,
} from '../src/engine/format';
import { at } from './helpers';

describe('plural', () => {
  it.each([
    [1, 'минута'], [2, 'минуты'], [4, 'минуты'], [5, 'минут'], [11, 'минут'], [12, 'минут'], [14, 'минут'],
    [21, 'минута'], [22, 'минуты'], [25, 'минут'], [101, 'минута'], [111, 'минут'], [112, 'минут'], [0, 'минут'],
  ])('%i → %s', (n, word) => {
    expect(plural(n, 'минута', 'минуты', 'минут')).toBe(word);
  });
});

describe('genitive (для N)', () => {
  it('1 месяца, 2 месяцев, 21 месяца, 11 месяцев', () => {
    expect(genitive(1, 'месяца', 'месяцев')).toBe('месяца');
    expect(genitive(2, 'месяца', 'месяцев')).toBe('месяцев');
    expect(genitive(21, 'месяца', 'месяцев')).toBe('месяца');
    expect(genitive(11, 'месяца', 'месяцев')).toBe('месяцев');
  });
});

describe('fmtDur', () => {
  it('часы и минуты', () => {
    expect(fmtDur(92)).toBe('1 ч 32 мин');
    expect(fmtDur(38)).toBe('38 мин');
    expect(fmtDur(120)).toBe('2 ч');
    expect(fmtDur(0)).toBe('0 мин');
  });
  it('округляет и не уходит в минус', () => {
    expect(fmtDur(59.6)).toBe('1 ч');
    expect(fmtDur(-5)).toBe('0 мин');
  });
  it('pad: минуты всегда двумя цифрами, как в макете «10 ч 02 мин»', () => {
    expect(fmtDur(602, { pad: true })).toBe('10 ч 02 мин');
    expect(fmtDur(600, { pad: true })).toBe('10 ч 00 мин');
    expect(fmtDur(45, { pad: true })).toBe('45 мин');
  });
});

describe('fmtTimer', () => {
  it('часы:минуты:секунды', () => {
    expect(fmtTimer(1 * 3600 + 12 * 60 + 8)).toBe('1:12:08');
    expect(fmtTimer(0)).toBe('0:00:00');
    expect(fmtTimer(3599.9)).toBe('0:59:59');
    expect(fmtTimer(-3)).toBe('0:00:00');
  });
});

describe('fmtNum / fmtRange', () => {
  it('запятая как разделитель', () => {
    expect(fmtNum(2.5)).toBe('2,5');
    expect(fmtNum(2)).toBe('2');
    expect(fmtNum(2.25)).toBe('2,25');
  });
  it('диапазон окна: минуты, часы и «часа»', () => {
    expect(fmtRange(30, 60)).toBe('30–60 минут');
    expect(fmtRange(45, 75)).toBe('45–75 минут');
    expect(fmtRange(120, 150)).toBe('2–2,5 часа');
    expect(fmtRange(180, 240)).toBe('3–4 часа');
    expect(fmtRange(105, 135)).toBe('1 ч 45 мин – 2 ч 15 мин');
  });
});

describe('даты', () => {
  it('период в одном месяце и в разных', () => {
    expect(fmtPeriod(at(-6, '00:00'), at(0, '00:00'))).toBe('3 – 9 октября');
    expect(fmtPeriod(at(-12, '00:00'), at(-6, '00:00'))).toBe('27 сентября – 3 октября');
  });
});

describe('порядковые и слова', () => {
  it('ordinal', () => {
    expect(ordinal(1)).toBe('первый');
    expect(ordinal(4)).toBe('четвёртый');
    expect(ordinal(9)).toBe('9-й');
  });
  it('длительность словами для озвучивания', () => {
    expect(fmtDurWords(92)).toBe('1 час 32 минуты');
    expect(fmtDurWords(60)).toBe('1 час');
    expect(fmtDurWords(121)).toBe('2 часа 1 минута');
    expect(fmtDurWords(5)).toBe('5 минут');
  });
  it('в родительном падеже («от … до …»)', () => {
    expect(fmtDurWordsGen(80)).toBe('1 часа 20 минут');
    expect(fmtDurWordsGen(60)).toBe('1 часа');
    expect(fmtDurWordsGen(21)).toBe('21 минуты');
  });
});
