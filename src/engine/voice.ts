/**
 * Голосовой ввод: разбор фразы вроде «покормила, 120 мл» или «уснула 20 минут назад».
 *
 * Распознавание речи делает браузер, а здесь — только разбор текста: он работает так же
 * и для набранной фразы, и в тестах. Фраза может содержать несколько действий
 * («покормила 120 мл и поменяла подгузник»), у каждого может быть своё время.
 */
import { DiaperKind, FeedHow, Gender } from './model';
import { MIN, addDays, atMinutes, latestAtOrBefore, startOfDay } from './time';

export type VoiceAction =
  | { kind: 'sleep-start'; t: number }
  | { kind: 'sleep-end'; t: number }
  | { kind: 'feed'; t: number; how: FeedHow; ml?: number; left?: number; right?: number; min?: number; note?: string }
  | { kind: 'diaper'; t: number; diaper: DiaperKind }
  | { kind: 'temp'; t: number; c: number }
  | { kind: 'med'; t: number; name: string; dose?: string }
  | { kind: 'bath'; t: number }
  | { kind: 'walk'; t: number; end?: number }
  | { kind: 'growth'; t: number; kg?: number; cm?: number }
  | { kind: 'note'; t: number; text: string };

/**
 * В JavaScript `\b` и `\w` понимают только латиницу, поэтому русские слова ими не разобрать.
 * `ru()` пересобирает выражение с юникодными границами слов и буквами.
 */
const WORD = '[\\p{L}\\p{N}_]';
const BOUNDARY = `(?:(?<!${WORD})(?=${WORD})|(?<=${WORD})(?!${WORD}))`;
function ru(re: RegExp): RegExp {
  const src = re.source.replace(/\\b/g, BOUNDARY).replace(/\\w/g, WORD);
  return new RegExp(src, re.flags.includes('u') ? re.flags : `${re.flags}u`);
}

export interface VoiceContext {
  now: number;
  gender: Gender;
}

export interface VoiceResult {
  actions: VoiceAction[];
  /** Часть фразы, которую не удалось понять. */
  unknown: string;
}

// ───────────────────────── числа словами ─────────────────────────

const ONES: Record<string, number> = {
  ноль: 0, один: 1, одна: 1, одну: 1, одного: 1, два: 2, две: 2, три: 3, четыре: 4, пять: 5, шесть: 6, семь: 7,
  восемь: 8, девять: 9, десять: 10, одиннадцать: 11, двенадцать: 12, тринадцать: 13, четырнадцать: 14,
  пятнадцать: 15, шестнадцать: 16, семнадцать: 17, восемнадцать: 18, девятнадцать: 19,
};
const TENS: Record<string, number> = {
  двадцать: 20, тридцать: 30, сорок: 40, пятьдесят: 50, шестьдесят: 60, семьдесят: 70, восемьдесят: 80, девяносто: 90,
};
const HUNDREDS: Record<string, number> = {
  сто: 100, двести: 200, триста: 300, четыреста: 400, пятьсот: 500, шестьсот: 600, семьсот: 700, восемьсот: 800, девятьсот: 900,
};

/** Читает число словами (0–999) с позиции i. */
function readNumber(tokens: string[], i: number): { value: number; len: number } | null {
  let j = i;
  let value = 0;
  // 0 — можно сотни, 1 — десятки и «-надцать», 2 — единицы (после десятков), 3 — конец
  let stage = 0;
  while (j < tokens.length) {
    const w = tokens[j];
    if (stage === 0 && w in HUNDREDS) {
      value += HUNDREDS[w];
      stage = 1;
    } else if (stage <= 1 && w in TENS) {
      value += TENS[w];
      stage = 2;
    } else if (stage <= 1 && w in ONES && ONES[w] >= 10) {
      value += ONES[w];
      stage = 3;
    } else if (stage <= 2 && w in ONES && ONES[w] < 10 && !(w === 'ноль' && j > i)) {
      value += ONES[w];
      stage = 3;
    } else {
      break;
    }
    j += 1;
  }
  return j > i ? { value, len: j - i } : null;
}

/** Заменяет числа, написанные словами («сто двадцать»), цифрами. */
export function wordsToDigits(text: string): string {
  const tokens = text.split(' ');
  const out: string[] = [];
  let i = 0;
  while (i < tokens.length) {
    const n = readNumber(tokens, i);
    if (n) {
      out.push(String(n.value));
      i += n.len;
    } else {
      out.push(tokens[i]);
      i += 1;
    }
  }
  return out.join(' ');
}

export function normalize(text: string): string {
  let s = text.toLowerCase().replace(/ё/g, 'е');
  s = s.replace(/[«»"“”„]/g, ' ');
  // десятичная запятая: «36,6» → «36.6»
  s = s.replace(/(\d),(\d)/g, '$1.$2');
  s = s.replace(/[^a-zа-я0-9.:, ]+/g, ' ');
  s = s.replace(/\.(?!\d)/g, ' ');
  s = s.replace(/\s*,\s*/g, ' , ');
  s = s.replace(/\s+/g, ' ').trim();
  // «тридцать шесть и шесть» → «36.6»: иначе «и» разрезало бы температуру на две части
  return wordsToDigits(s).replace(/(?<![\d.])(3[4-9]|4[0-2]) и (\d)(?![\d.])/g, '$1.$2');
}

// ───────────────────────── время ─────────────────────────

interface TimeHit {
  t: number;
  /** Была ли названа конкретная минута или «N назад». */
  explicit: boolean;
  /** Что осталось от фразы без указания времени. */
  rest: string;
}

/**
 * Время «в 9:30» без «утра/вечера»: берём ближайший к «сейчас» из прошедших вариантов
 * (9:30 или 21:30, сегодня или вчера).
 */
function latestPast(day: number, h: number, mins: number, now: number, ampm: string | undefined): number {
  if (ampm) {
    let hh = h % 24;
    if (ampm.startsWith('утр')) hh = h === 12 ? 0 : h;
    else if (ampm.startsWith('дн')) hh = h < 12 ? h + 12 : h;
    else if (ampm.startsWith('веч')) hh = h < 12 ? h + 12 : h;
    else if (ampm.startsWith('ноч')) hh = h === 12 ? 0 : h >= 6 && h < 12 ? h + 12 : h;
    return latestAtOrBefore(day, (hh % 24) * 60 + mins, now);
  }
  if (h >= 13 || h === 0) return latestAtOrBefore(day, (h % 24) * 60 + mins, now);
  const cands: number[] = [];
  for (const back of [0, -1]) {
    for (const hh of [h % 12, (h % 12) + 12]) {
      const t = atMinutes(addDays(day, back), hh * 60 + mins);
      if (t <= now + MIN) cands.push(t);
    }
  }
  return Math.max(...cands);
}

/** Ищет в клаузе указание времени. Возвращает момент и клаузу без него. */
export function extractTime(clause: string, now: number): TimeHit {
  let s = clause;
  const today = startOfDay(now);
  const yesterday = ru(/\bвчера\b/).test(s);
  if (yesterday) s = s.replace(ru(/\bвчера\b/), ' ');
  const day = yesterday ? addDays(today, -1) : today;

  const clean = (x: string): string => x.replace(/\s+/g, ' ').trim();
  const ago = (min: number, rest: string): TimeHit => ({ t: now - Math.round(min) * MIN, explicit: true, rest: clean(rest) });

  if (ru(/\b(только что|прямо сейчас|сейчас)\b/).test(s)) {
    return { t: now, explicit: false, rest: clean(s.replace(ru(/\b(только что|прямо сейчас|сейчас)\b/), ' ')) };
  }
  let m = ru(/\bполчаса назад\b/).exec(s);
  if (m) return ago(30, s.replace(m[0], ' '));
  m = ru(/\bполтора часа назад\b/).exec(s);
  if (m) return ago(90, s.replace(m[0], ' '));
  m = ru(/\bчас назад\b/).exec(s);
  if (m) return ago(60, s.replace(m[0], ' '));
  m = ru(/(?:(\d+) (?:час|часа|часов))? ?(?:(\d+) (?:минуту|минуты|минут|мин))? назад\b/).exec(s);
  if (m && (m[1] || m[2])) return ago(Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0), s.replace(m[0], ' '));

  // «в 14:20», «9:30 утра»; с точкой («в 9.30») — только после предлога, иначе «вес 7.50 кг» стало бы временем
  m = ru(/(?:\b(?:в|к|около|с) )?\b(\d{1,2}):(\d{2})\b(?: (утра|дня|вечера|ночи))?/).exec(s)
    ?? ru(/\b(?:в|к|около|с) (\d{1,2})\.(\d{2})\b(?: (утра|дня|вечера|ночи))?/).exec(s);
  if (m && Number(m[1]) < 24 && Number(m[2]) < 60) {
    return { t: latestPast(day, Number(m[1]), Number(m[2]), now, m[3]), explicit: true, rest: clean(s.replace(m[0], ' ')) };
  }
  // «в 2 часа дня», «в 7 утра», «в 14 часов 20 минут», «проснулась в 7»
  // Число после часа считается минутами, только если за ним не стоит единица измерения («в 7 20 мл»).
  m = ru(/\bв (\d{1,2})(?: (?:часа|часов|час))?(?: (\d{1,2})(?! ?(?:мл|г|кг|см|капл|таблет|доз|пакет|раз)\w*\b)(?: (?:минут|минуты|минуту|мин))?)?(?: (утра|дня|вечера|ночи))?(?= |$)/).exec(s);
  if (m && Number(m[1]) <= 24) {
    const tail = s.slice(m.index + m[0].length).trim();
    const explicitEnough = m[3] || /час/.test(m[0]) || m[2] || tail === '';
    const mins = m[2] ? Number(m[2]) : 0;
    if (explicitEnough && mins < 60) {
      return { t: latestPast(day, Number(m[1]), mins, now, m[3]), explicit: true, rest: clean(s.replace(m[0], ' ')) };
    }
  }
  return { t: now, explicit: false, rest: clean(s) };
}

// ───────────────────────── намерения ─────────────────────────

const RE = {
  sleepStart: ru(/\b(усну\w*|засну\w*|заснул\w*|уложил\w*|легл\w*|положил\w*|спать|спит)\b/),
  sleepEnd: ru(/\b(проснул\w*|просну\w*|встал\w*|разбуд\w*|не спит)\b/),
  feed: ru(/\b(покорм\w*|накорм\w*|корм\w*|поел\w*|попил\w*|выпил\w*|съел\w*|бутылк\w*|смес\w*|груд\w*|прикорм\w*|пюре|каш[аиу]|кашей)\b/),
  diaper: ru(/\b(подгузник\w*|памперс\w*|пописал\w*|покакал\w*|какаш\w*|какул\w*|написал\w*|наложил\w*|переодел\w*|поменял\w*|смен\w*|обкакал\w*|мокр\w*)\b/),
  temp: ru(/\b(температур\w*|градус\w*|измерил\w*)\b/),
  bath: ru(/\b(купал\w*|купани\w*|искупал\w*|ванн\w*)\b/),
  walk: ru(/\b(гуля\w*|прогулк\w*|погуля\w*)\b/),
  med: ru(/\b(дал[аи]?|давал\w*|принял\w*|лекарств\w*|витамин\w*)\b/),
  growth: ru(/\b(вес|рост|взвесил\w*|измерили)\b/),
  note: ru(/\b(заметк\w*|запиши|заметь)\b/),
};

/** Продукты прикорма: по ним кормление считается прикормом, а «и яблоко» присоединяется к предыдущему блюду. */
const FOOD = '(?:прикорм\\w*|пюре|каш\\w*|кабачк\\w*|яблок\\w*|банан\\w*|творог\\w*|яйц\\w*|морков\\w*|тыкв\\w*|груш\\w*|брокколи|цветн\\w*|индейк\\w*|рис\\w*|гречк\\w*|овсян\\w*|кукуруз\\w*|персик\\w*|йогурт\\w*|кефир\\w*|мяс\\w*|рыб\\w*)';
const FOOD_RE = ru(new RegExp(`\\b${FOOD}\\b`));

/** Кусок фразы без глагола, который дополняет предыдущее действие: число, сторона груди, единица, продукт. */
const DETAIL = ru(/(\d|\b(?:лев\w*|прав\w*|слева|справа|мл|мин\w*|грамм\w*)\b)/);
const isDetail = (piece: string): boolean => DETAIL.test(piece) || FOOD_RE.test(piece);

const BARE_ML = ru(/^\d+ ?мл$/);

const INTENT_ORDER: Array<keyof typeof RE> = ['note', 'temp', 'growth', 'bath', 'walk', 'sleepEnd', 'sleepStart', 'diaper', 'feed', 'med'];

/** Намерение по ключевым словам; null, если глагола нет. */
function strictIntent(clause: string): keyof typeof RE | null {
  for (const k of INTENT_ORDER) if (RE[k].test(clause)) return k;
  return null;
}

function intentOf(clause: string): keyof typeof RE | null {
  const k = strictIntent(clause);
  if (k) return k;
  // Просто «120 мл» без глагола — это бутылочка. Но «дала 2 мл» — лекарство, поэтому проверяем в последнюю очередь.
  return BARE_ML.test(clause) ? 'feed' : null;
}

const SEP = /(\s*(?:,| и | а потом | а затем | а | потом | затем | еще | также )\s*)/;

/** Клаузы фразы; куски без намерения («и правой 8», «и яблоко») присоединяются к предыдущей через тот же разделитель. */
function clauses(text: string): string[] {
  const parts = text.split(SEP);
  const out: string[] = [];
  for (let i = 0; i < parts.length; i += 2) {
    const piece = parts[i];
    if (piece.trim().length === 0) continue;
    const sep = i > 0 ? parts[i - 1].trim() : '';
    if (out.length > 0 && strictIntent(piece) === null && isDetail(piece)) out[out.length - 1] += `${sep === ',' ? ' ,' : sep ? ` ${sep}` : ''} ${piece}`;
    else out.push(piece);
  }
  return out;
}

function numberBefore(s: string, re: RegExp): number | undefined {
  const m = re.exec(s);
  return m ? Number(m[1]) : undefined;
}

function parseFeed(clause: string, t: number): VoiceAction {
  const how: FeedHow = ru(/\b(груд\w*|кормил\w* грудью|сосал\w*)\b/).test(clause)
    ? 'breast'
    : FOOD_RE.test(clause)
      ? 'solid'
      : 'bottle';

  if (how === 'breast') {
    const left = numberBefore(clause, ru(/(?:лев\w+|слева)\D{0,12}?(\d+)/)) ?? numberBefore(clause, ru(/(\d+)\D{0,12}?(?:лев\w+|слева)/));
    const right = numberBefore(clause, ru(/(?:прав\w+|справа)\D{0,12}?(\d+)/)) ?? numberBefore(clause, ru(/(\d+)\D{0,12}?(?:прав\w+|справа)/));
    const total = numberBefore(clause, ru(/(\d+) ?(?:минут\w*|мин)\b/));
    const a: VoiceAction = { kind: 'feed', t, how };
    if (left !== undefined) a.left = left;
    if (right !== undefined) a.right = right;
    if (left === undefined && right === undefined && total !== undefined) a.min = total;
    return a;
  }

  if (how === 'solid') {
    const note = clause
      .replace(ru(/\b(покормил\w*|накормил\w*|дали|дал\w*|прикорм\w*|поел\w*|съел\w*)\b/g), ' ')
      .replace(/ ,/g, ',')
      .replace(/\s+/g, ' ')
      .trim();
    const a: VoiceAction = { kind: 'feed', t, how };
    if (note) a.note = note.charAt(0).toUpperCase() + note.slice(1);
    return a;
  }

  const unit = numberBefore(clause, ru(/(\d+) ?(?:мл|милилитр\w*|миллилитр\w*|грамм\w*|г)\b/));
  const bare = numberBefore(clause, ru(/\b(\d{2,3})\b/));
  const ml = unit ?? (bare !== undefined && bare >= 20 && bare <= 400 ? bare : undefined);
  const a: VoiceAction = { kind: 'feed', t, how };
  if (ml !== undefined) a.ml = ml;
  return a;
}

function parseDiaper(clause: string, t: number): VoiceAction {
  const dirty = ru(/\b(покакал\w*|какаш\w*|какул\w*|грязн\w*|обкакал\w*|стул\w*|наложил\w*)\b/).test(clause);
  const wet = ru(/\b(пописал\w*|мокр\w*|написал\w*|пипи|описал\w*)\b/).test(clause);
  const both = ru(/\b(оба|и то и другое|мокрый и грязный)\b/).test(clause);
  const diaper: DiaperKind = both || (dirty && wet) ? 'mixed' : dirty ? 'dirty' : 'wet';
  return { kind: 'diaper', t, diaper };
}

function parseTemp(clause: string, t: number): VoiceAction | null {
  // «36.6», «36 6» (после замены слов), «37 и 2» уже без «и»
  let m = ru(/\b(3[4-9]|4[0-2])\.(\d)\b/).exec(clause);
  if (!m) m = ru(/\b(3[4-9]|4[0-2]) (\d)\b/).exec(clause);
  if (m) return { kind: 'temp', t, c: Number(`${m[1]}.${m[2]}`) };
  m = ru(/\b(3[4-9]|4[0-2])\b/).exec(clause);
  if (m) return { kind: 'temp', t, c: Number(m[1]) };
  return null;
}

function parseGrowth(clause: string, t: number): VoiceAction | null {
  const kg = numberBefore(clause, ru(/(\d+(?:\.\d+)?) ?(?:кг|килограмм\w*)/));
  const cm = numberBefore(clause, ru(/(\d+(?:\.\d+)?) ?(?:см|сантиметр\w*)/));
  const w = ru(/\bвес\b\D{0,10}?(\d+(?:\.\d+)?)/).exec(clause);
  const r = ru(/\bрост\b\D{0,10}?(\d+(?:\.\d+)?)/).exec(clause);
  const weight = kg ?? (w ? Number(w[1]) : undefined);
  const height = cm ?? (r ? Number(r[1]) : undefined);
  if (weight === undefined && height === undefined) return null;
  const a: VoiceAction = { kind: 'growth', t };
  if (weight !== undefined && weight < 40) a.kg = weight;
  if (height !== undefined && height > 20 && height < 130) a.cm = height;
  return a.kg === undefined && a.cm === undefined ? null : a;
}

function parseMed(clause: string, t: number): VoiceAction | null {
  const dose = ru(/(\d+(?:\.\d+)? ?(?:капл\w+|мл|миллилитр\w*|таблет\w+|доз\w+|пакетик\w*))/).exec(clause);
  const name = clause
    .replace(ru(/\b(дал[аи]?|давал\w*|принял\w*|лекарств\w*|ему|ей|малышу|малышке)\b/g), ' ')
    .replace(dose?.[0] ?? '\u0000', ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!name) return null;
  const cased = name.replace(/(^| )([а-я])(?= |$)/g, (_m, sp: string, ch: string) => sp + ch.toUpperCase());
  const a: VoiceAction = { kind: 'med', t, name: cased.charAt(0).toUpperCase() + cased.slice(1) };
  if (dose) a.dose = dose[1];
  return a;
}

// ───────────────────────── точка входа ─────────────────────────

export function parseVoice(text: string, ctx: VoiceContext): VoiceResult {
  const norm = normalize(text);
  const actions: VoiceAction[] = [];
  const unknown: string[] = [];

  for (const clause of clauses(norm)) {
    const intent = intentOf(clause);
    if (!intent) {
      unknown.push(clause);
      continue;
    }
    const { t: rawT, rest } = extractTime(clause, ctx.now);
    const t = Math.min(ctx.now, rawT);
    let action: VoiceAction | null = null;
    switch (intent) {
      case 'sleepStart':
        action = { kind: 'sleep-start', t };
        break;
      case 'sleepEnd':
        action = { kind: 'sleep-end', t };
        break;
      case 'feed':
        action = parseFeed(rest, t);
        break;
      case 'diaper':
        action = parseDiaper(rest, t);
        break;
      case 'temp':
        action = parseTemp(rest, t);
        break;
      case 'bath':
        action = { kind: 'bath', t };
        break;
      case 'walk': {
        const dur = numberBefore(rest, ru(/(\d+) ?(?:минут\w*|мин)\b/));
        const hours = numberBefore(rest, ru(/(\d+) ?(?:час\w*)\b/)) ?? (ru(/\bполчаса\b/).test(rest) ? 0.5 : ru(/\bчас(?:ик|ок)?\b/).test(rest) ? 1 : 0);
        const total = (dur ?? 0) + hours * 60;
        action = total > 0 ? { kind: 'walk', t: t - total * MIN, end: t } : { kind: 'walk', t };
        break;
      }
      case 'growth':
        action = parseGrowth(rest, t);
        break;
      case 'med':
        action = parseMed(rest, t);
        break;
      case 'note': {
        const body = rest.replace(RE.note, ' ').replace(/\s+/g, ' ').trim();
        action = body ? { kind: 'note', t, text: body.charAt(0).toUpperCase() + body.slice(1) } : null;
        break;
      }
    }
    if (action) actions.push(action);
    else unknown.push(clause);
  }

  return { actions: mergeDiapers(actions), unknown: unknown.join(', ') };
}

/** «Пописал и покакал» — один подгузник, а не два: соседние записи с одним временем сливаются. */
function mergeDiapers(actions: VoiceAction[]): VoiceAction[] {
  const out: VoiceAction[] = [];
  for (const a of actions) {
    const prev = out[out.length - 1];
    if (a.kind === 'diaper' && prev && prev.kind === 'diaper' && prev.t === a.t && prev.diaper !== a.diaper) {
      prev.diaper = 'mixed';
    } else {
      out.push(a);
    }
  }
  return out;
}

/** Короткое описание действия для подтверждения («Кормление · 120 мл»). */
export function describeAction(a: VoiceAction, g: Gender): string {
  switch (a.kind) {
    case 'sleep-start':
      return g === 'm' ? 'Уснул' : 'Уснула';
    case 'sleep-end':
      return g === 'm' ? 'Проснулся' : 'Проснулась';
    case 'feed':
      if (a.how === 'bottle') return a.ml ? `Кормление · ${a.ml} мл` : 'Кормление';
      if (a.how === 'breast') {
        const sides = [a.left ? `лев. ${a.left} мин` : '', a.right ? `прав. ${a.right} мин` : '', a.min ? `${a.min} мин` : '']
          .filter(Boolean)
          .join(', ');
        return sides ? `Грудь · ${sides}` : 'Грудь';
      }
      return a.note ? `Прикорм · ${a.note}` : 'Прикорм';
    case 'diaper':
      return `Подгузник · ${a.diaper === 'wet' ? 'мокрый' : a.diaper === 'dirty' ? 'грязный' : 'мокрый и грязный'}`;
    case 'temp':
      return `Температура · ${a.c.toFixed(1).replace('.', ',')} °C`;
    case 'med':
      return a.dose ? `${a.name} · ${a.dose}` : a.name;
    case 'bath':
      return 'Купание';
    case 'walk':
      return 'Прогулка';
    case 'growth':
      return [a.kg !== undefined ? `${String(a.kg).replace('.', ',')} кг` : '', a.cm !== undefined ? `${String(a.cm).replace('.', ',')} см` : '']
        .filter(Boolean)
        .join(' · ');
    case 'note':
      return a.text;
  }
}
