import { describe, expect, it } from 'vitest';
import { MIN } from '../src/engine/time';
import { describeAction, extractTime, normalize, parseVoice, wordsToDigits, VoiceAction } from '../src/engine/voice';
import { at } from './helpers';

/** «Сейчас» — пятница, 14:20. */
const NOW = at(0, '14:20');
const parse = (text: string, gender: 'f' | 'm' = 'f') => parseVoice(text, { now: NOW, gender });
const only = (text: string): VoiceAction => {
  const r = parse(text);
  expect(r.unknown, `не разобрано: «${r.unknown}»`).toBe('');
  expect(r.actions, text).toHaveLength(1);
  return r.actions[0];
};

describe('числа словами', () => {
  it.each([
    ['сто двадцать', '120'],
    ['двести', '200'],
    ['девяносто пять', '95'],
    ['пятнадцать', '15'],
    ['триста пятьдесят мл', '350 мл'],
    ['семь', '7'],
    ['две минуты', '2 минуты'],
    ['сто двадцать мл и десять минут', '120 мл и 10 минут'],
  ])('«%s» → «%s»', (src, out) => {
    expect(wordsToDigits(src)).toBe(out);
  });

  it('слова без чисел не трогает', () => {
    expect(wordsToDigits('покормила и уложила')).toBe('покормила и уложила');
  });

  it('«сто пять» читается как 105, а не как 100 и 5 по отдельности', () => {
    expect(wordsToDigits('сто пять')).toBe('105');
  });
});

describe('нормализация', () => {
  it('приводит к нижнему регистру, ё → е, убирает кавычки', () => {
    expect(normalize('«Лёша» Уснул!')).toBe('леша уснул');
  });

  it('десятичная запятая превращается в точку', () => {
    expect(normalize('температура 36,6')).toBe('температура 36.6');
  });

  it('запятая-разделитель остаётся отдельным токеном', () => {
    expect(normalize('покормила,120 мл')).toBe('покормила , 120 мл');
  });

  it('«тридцать шесть и шесть» собирается в 36.6', () => {
    expect(normalize('тридцать шесть и шесть')).toBe('36.6');
  });

  it('«и» между обычными числами не трогает', () => {
    expect(normalize('100 и 5')).toBe('100 и 5');
  });
});

describe('время во фразе', () => {
  const at14 = (s: string) => extractTime(s, NOW);

  it('без указания — сейчас', () => {
    const r = at14('покормила');
    expect(r.t).toBe(NOW);
    expect(r.explicit).toBe(false);
  });

  it.each([
    ['только что', 0],
    ['прямо сейчас', 0],
    ['полчаса назад', 30],
    ['час назад', 60],
    ['полтора часа назад', 90],
    ['20 минут назад', 20],
    ['2 часа назад', 120],
    ['1 час 15 минут назад', 75],
  ])('«%s» → %i мин назад', (phrase, minutes) => {
    expect(at14(`уснула ${phrase}`).t).toBe(NOW - minutes * MIN);
  });

  it('убирает время из остатка фразы', () => {
    expect(at14('уснула 20 минут назад').rest).toBe('уснула');
    expect(at14('покормила в 9:30 120 мл').rest).toBe('покормила 120 мл');
  });

  it('«в 9:30» — ближайшее прошедшее: 9:30 сегодня', () => {
    expect(at14('в 9:30').t).toBe(at(0, '09:30'));
  });

  it('«в 2:30» в 14:20 — это 14:30? нет, будущее нельзя: значит, 2:30 сегодня', () => {
    expect(at14('в 2:30').t).toBe(at(0, '02:30'));
  });

  it('время позже «сейчас» откатывается на вчера', () => {
    expect(at14('в 14:50').t).toBe(at(-1, '14:50'));
    expect(at14('в 23:50').t).toBe(at(-1, '23:50'));
  });

  it('минута допуска: «в 14:21» — ещё сегодня', () => {
    expect(at14('в 14:21').t).toBe(at(0, '14:21'));
  });

  it.each([
    ['в 7 утра', '07:00'],
    ['в 2 часа дня', '14:00'],
    ['в 12 ночи', '00:00'],
    ['в 3 ночи', '03:00'],
    ['в 14 часов 20 минут', '14:20'],
  ])('«%s» → %s сегодня', (phrase, hm) => {
    expect(at14(`уснула ${phrase}`).t).toBe(at(0, hm));
  });

  it('вечер, который ещё не наступил, — это вчерашний вечер', () => {
    expect(at14('уснула в 8 вечера').t).toBe(at(-1, '20:00'));
    expect(at14('уснула в 9:30 вечера').t).toBe(at(-1, '21:30'));
  });

  it('«вчера в 23:00»', () => {
    expect(at14('проснулась вчера в 23:00').t).toBe(at(-1, '23:00'));
  });

  it('«в 7» без слов — только в конце фразы', () => {
    expect(at14('проснулся в 7').t).toBe(at(0, '07:00'));
  });

  it('«в 7 20 мл» не принимает объём за минуты', () => {
    const r = at14('покормила в 7 20 мл');
    expect(r.rest).toContain('20 мл');
  });

  it('точка в «7.50 кг» не время', () => {
    const r = at14('вес 7.50 кг');
    expect(r.explicit).toBe(false);
    expect(r.rest).toBe('вес 7.50 кг');
  });

  it('точка после предлога — время', () => {
    expect(at14('в 9.30').t).toBe(at(0, '09:30'));
  });

  it('несуществующее время («25:99») игнорируется', () => {
    expect(at14('в 25:99').explicit).toBe(false);
  });
});

describe('сон', () => {
  it.each(['уснула', 'заснул', 'уложила спать', 'малыш спит', 'легла', 'уснули'])('«%s» — начало сна', (text) => {
    expect(only(text)).toEqual({ kind: 'sleep-start', t: NOW });
  });

  it.each(['проснулась', 'проснулся только что', 'встала', 'разбудила', 'не спит'])('«%s» — конец сна', (text) => {
    expect(only(text).kind).toBe('sleep-end');
  });

  it('«не спит» — конец, а не начало', () => {
    expect(only('не спит').kind).toBe('sleep-end');
  });

  it('с временем: «уснула 20 минут назад»', () => {
    expect(only('уснула 20 минут назад')).toEqual({ kind: 'sleep-start', t: NOW - 20 * MIN });
  });

  it('«уснула в 21:00, проснулась в 6:30» — два действия с разным временем', () => {
    const r = parse('уснула в 21:00, проснулась в 6:30');
    expect(r.actions).toEqual([
      { kind: 'sleep-start', t: at(-1, '21:00') },
      { kind: 'sleep-end', t: at(0, '06:30') },
    ]);
  });

  it('«а» разделяет действия так же, как запятая', () => {
    const r = parse('уснула в 21:00 а проснулась в 6:30');
    expect(r.actions.map((a) => a.kind)).toEqual(['sleep-start', 'sleep-end']);
  });
});

describe('кормление', () => {
  it('«покормила, 120 мл»', () => {
    expect(only('покормила, 120 мл')).toEqual({ kind: 'feed', t: NOW, how: 'bottle', ml: 120 });
  });

  it('объём словами', () => {
    expect(only('покормил сто двадцать миллилитров')).toMatchObject({ how: 'bottle', ml: 120 });
  });

  it('объём без единиц: «покормила 90»', () => {
    expect(only('покормила 90')).toMatchObject({ ml: 90 });
  });

  it('число вне разумного объёма не считается миллилитрами', () => {
    expect(only('покормила 5')).toEqual({ kind: 'feed', t: NOW, how: 'bottle' });
    expect(only('покормила 900')).toEqual({ kind: 'feed', t: NOW, how: 'bottle' });
  });

  it('без объёма — просто кормление', () => {
    expect(only('покормила')).toEqual({ kind: 'feed', t: NOW, how: 'bottle' });
  });

  it('просто «120 мл» — бутылочка', () => {
    expect(only('120 мл')).toMatchObject({ kind: 'feed', ml: 120 });
  });

  it('но «дала 2 мл парацетамола» — лекарство', () => {
    expect(only('дала 2 мл парацетамола')).toMatchObject({ kind: 'med', dose: '2 мл' });
  });

  it('время и объём вместе', () => {
    expect(only('покормил в 7 утра 90 мл')).toEqual({ kind: 'feed', t: at(0, '07:00'), how: 'bottle', ml: 90 });
  });

  it('«час назад покормила»', () => {
    expect(only('час назад покормила').t).toBe(NOW - 60 * MIN);
  });

  it('грудь: обе стороны', () => {
    expect(only('грудь слева 10 минут справа 8')).toEqual({ kind: 'feed', t: NOW, how: 'breast', left: 10, right: 8 });
  });

  it('грудь: стороны и числа словами через «и»', () => {
    expect(only('покормила грудью левой десять минут и правой восемь')).toMatchObject({ how: 'breast', left: 10, right: 8 });
  });

  it('грудь: одна сторона', () => {
    const a = only('кормила грудью справа 12 минут');
    expect(a).toMatchObject({ how: 'breast', right: 12 });
    expect((a as { left?: number }).left).toBeUndefined();
  });

  it('грудь: общее время без стороны', () => {
    expect(only('кормила грудью 15 минут')).toEqual({ kind: 'feed', t: NOW, how: 'breast', min: 15 });
  });

  it('грудь: число перед стороной («10 минут слева»)', () => {
    expect(only('грудь 10 минут слева')).toMatchObject({ left: 10 });
  });

  it('прикорм: название блюда попадает в заметку', () => {
    expect(only('прикорм кабачок')).toEqual({ kind: 'feed', t: NOW, how: 'solid', note: 'Кабачок' });
  });

  it('прикорм из нескольких продуктов сохраняет «и»', () => {
    expect(only('пюре из кабачка и яблока')).toMatchObject({ how: 'solid', note: 'Пюре из кабачка и яблока' });
  });
});

describe('подгузник', () => {
  it.each([
    ['поменяла подгузник', 'wet'],
    ['пописал', 'wet'],
    ['покакал', 'dirty'],
    ['какашка в памперсе', 'dirty'],
    ['мокрый и грязный подгузник', 'mixed'],
    ['покакал и пописал в одном подгузнике', 'mixed'],
  ])('«%s» → %s', (text, kind) => {
    expect(only(text)).toMatchObject({ kind: 'diaper', diaper: kind });
  });

  it('«пописал и покакал» — один подгузник, а не два', () => {
    const r = parse('пописал и покакал');
    expect(r.actions).toEqual([{ kind: 'diaper', t: NOW, diaper: 'mixed' }]);
  });

  it('два подгузника в разное время не сливаются', () => {
    const r = parse('пописал час назад, покакал только что');
    expect(r.actions).toHaveLength(2);
  });
});

describe('температура', () => {
  it.each([
    ['температура 36,6', 36.6],
    ['температура 38.2', 38.2],
    ['температура тридцать семь и два', 37.2],
    ['тридцать шесть и шесть температура', 36.6],
    ['температура 40', 40],
    ['температура 37 5', 37.5],
  ])('«%s» → %s', (text, c) => {
    expect(only(text)).toEqual({ kind: 'temp', t: NOW, c });
  });

  it('вне 34–42 °C — не температура', () => {
    const r = parse('температура 50');
    expect(r.actions).toEqual([]);
    expect(r.unknown).toBe('температура 50');
  });
});

describe('рост, вес, прогулка, купание, лекарство, заметка', () => {
  it('вес и рост', () => {
    expect(only('вес 7,5 кг рост 68 см')).toEqual({ kind: 'growth', t: NOW, kg: 7.5, cm: 68 });
  });

  it('вес с сотыми не принимается за время', () => {
    expect(only('вес 8.25 кг рост 70 см')).toEqual({ kind: 'growth', t: NOW, kg: 8.25, cm: 70 });
    expect(only('вес 7,50 кг')).toEqual({ kind: 'growth', t: NOW, kg: 7.5 });
  });

  it('нереальный вес отбрасывается', () => {
    expect(parse('вес 70 кг').actions).toEqual([]);
  });

  it('купание', () => {
    expect(only('искупали')).toEqual({ kind: 'bath', t: NOW });
  });

  it('прогулка с длительностью заканчивается «сейчас»', () => {
    expect(only('гуляли 40 минут')).toEqual({ kind: 'walk', t: NOW - 40 * MIN, end: NOW });
    expect(only('гуляли два часа')).toEqual({ kind: 'walk', t: NOW - 120 * MIN, end: NOW });
    expect(only('гуляли час')).toEqual({ kind: 'walk', t: NOW - 60 * MIN, end: NOW });
    expect(only('гуляли полчаса')).toEqual({ kind: 'walk', t: NOW - 30 * MIN, end: NOW });
  });

  it('прогулка без длительности — одна отметка', () => {
    expect(only('пошли гулять')).toEqual({ kind: 'walk', t: NOW });
  });

  it('лекарство: название и доза', () => {
    expect(only('дала витамин д 2 капли')).toEqual({ kind: 'med', t: NOW, name: 'Витамин Д', dose: '2 капли' });
  });

  it('заметка', () => {
    expect(only('заметка зубы режутся')).toEqual({ kind: 'note', t: NOW, text: 'Зубы режутся' });
  });

  it('пустая заметка — не действие', () => {
    expect(parse('заметка').actions).toEqual([]);
  });
});

describe('несколько действий и непонятное', () => {
  it('несколько действий через запятые и «и»', () => {
    const r = parse('покормила 100 мл, поменяла подгузник, уложила спать');
    expect(r.actions.map((a) => a.kind)).toEqual(['feed', 'diaper', 'sleep-start']);
    expect(r.unknown).toBe('');
  });

  it('«а потом» разделяет клаузы', () => {
    const r = parse('покормила 120 мл а потом уложила');
    expect(r.actions.map((a) => a.kind)).toEqual(['feed', 'sleep-start']);
  });

  it('у каждого действия своё время', () => {
    const r = parse('покормила в 13:00 и уложила 10 минут назад');
    expect(r.actions[0].t).toBe(at(0, '13:00'));
    expect(r.actions[1].t).toBe(NOW - 10 * MIN);
  });

  it('непонятная фраза уходит в unknown, ничего не записывается', () => {
    const r = parse('абракадабра');
    expect(r.actions).toEqual([]);
    expect(r.unknown).toBe('абракадабра');
  });

  it('понятное записывается, непонятное остаётся показанным', () => {
    const r = parse('покормила 120 мл, абракадабра');
    expect(r.actions).toHaveLength(1);
    expect(r.unknown).toBe('абракадабра');
  });

  it('пустая строка', () => {
    expect(parse('')).toEqual({ actions: [], unknown: '' });
    expect(parse('   ')).toEqual({ actions: [], unknown: '' });
  });

  it('регистр и знаки препинания не важны', () => {
    expect(only('ПОКОРМИЛА!!! 120 МЛ.')).toMatchObject({ how: 'bottle', ml: 120 });
  });

  it('время действия никогда не позже «сейчас»', () => {
    const r = parse('покормила в 14:21');
    for (const a of r.actions) expect(a.t).toBeLessThanOrEqual(NOW);
  });

  it('кириллические границы слов работают: «покормила» находится в середине фразы', () => {
    // Регрессия: \b в JavaScript не видит русских букв, и разбор молчал на любой фразе.
    expect(parse('мы сегодня покормили малыша 80 мл').actions).toHaveLength(1);
  });
});

describe('описание действия для подтверждения', () => {
  const d = (a: VoiceAction, g: 'f' | 'm' = 'f') => describeAction(a, g);

  it('сон зависит от пола ребёнка', () => {
    expect(d({ kind: 'sleep-start', t: 0 }, 'f')).toBe('Уснула');
    expect(d({ kind: 'sleep-start', t: 0 }, 'm')).toBe('Уснул');
    expect(d({ kind: 'sleep-end', t: 0 }, 'f')).toBe('Проснулась');
    expect(d({ kind: 'sleep-end', t: 0 }, 'm')).toBe('Проснулся');
  });

  it('кормление', () => {
    expect(d({ kind: 'feed', t: 0, how: 'bottle', ml: 120 })).toBe('Кормление · 120 мл');
    expect(d({ kind: 'feed', t: 0, how: 'bottle' })).toBe('Кормление');
    expect(d({ kind: 'feed', t: 0, how: 'breast', left: 10, right: 8 })).toBe('Грудь · лев. 10 мин, прав. 8 мин');
    expect(d({ kind: 'feed', t: 0, how: 'breast', min: 15 })).toBe('Грудь · 15 мин');
    expect(d({ kind: 'feed', t: 0, how: 'breast' })).toBe('Грудь');
    expect(d({ kind: 'feed', t: 0, how: 'solid', note: 'Каша' })).toBe('Прикорм · Каша');
  });

  it('подгузник, температура, рост, лекарство, заметка', () => {
    expect(d({ kind: 'diaper', t: 0, diaper: 'mixed' })).toBe('Подгузник · мокрый и грязный');
    expect(d({ kind: 'temp', t: 0, c: 36.6 })).toBe('Температура · 36,6 °C');
    expect(d({ kind: 'temp', t: 0, c: 38 })).toBe('Температура · 38,0 °C');
    expect(d({ kind: 'growth', t: 0, kg: 7.5, cm: 68 })).toBe('7,5 кг · 68 см');
    expect(d({ kind: 'med', t: 0, name: 'Витамин Д', dose: '2 капли' })).toBe('Витамин Д · 2 капли');
    expect(d({ kind: 'note', t: 0, text: 'Зубы' })).toBe('Зубы');
  });
});
