/**
 * Прогноз сна.
 *
 * Идея: окно бодрствования — это время от пробуждения до следующего засыпания.
 * Возрастная норма даёт стартовую оценку, личная история ребёнка её уточняет,
 * длина прошлого сна подправляет. Подробно — в docs/MECHANICS.md.
 */
import { ageInfo } from './age';
import { Child, DremaEvent, Settings, SleepEvent } from './model';
import { Norm, normFor, windowMultiplier } from './norms';
import {
  DayState,
  WindowSample,
  activeSleep,
  dayState,
  durationMin,
  liveEvents,
  sleepKind,
  sleepsOf,
  windowSamples,
} from './sleep';
import { clamp, dropOutliers, median, quantile, roundTo, sigmaFromMad } from './stats';
import {
  DAY,
  MIN,
  atMinutes,
  minutesOfDay,
  parseHM,
  roundLocal,
  startOfDay,
} from './time';

export interface Ctx {
  child: Child;
  /** Все события; чужие дети и удалённые записи отсеиваются внутри. */
  events: DremaEvent[];
  now: number;
  settings: Settings;
}

/** Сколько суток истории учитываем. */
export const HISTORY_DAYS = 14;
/** За сколько суток показываем «её ритм». */
export const RHYTHM_DAYS = 7;
/** Сколько замеров нужно, чтобы доверять личному ритму для конкретного окна. */
export const MIN_POSITION_SAMPLES = 3;
/** «Сила» возрастной нормы в формуле смешивания: столько замеров весит норма. */
export const PRIOR_STRENGTH = 4;
export const MAX_PERSONAL_WEIGHT = 0.85;

export interface ForecastBasis {
  ageMonths: number;
  ageLabelFor: string;
  norm: Norm;
  windowIndex: number;
  windowsTotal: number;
  multiplier: number;
  napNumber: number;
  mode: 'nap' | 'bedtime';
  wakeKind: DayState['wakeKind'];
  /** Оценка по возрасту для этого окна, мин. */
  priorMin: number;
  personal: null | {
    /** Сколько замеров. */
    n: number;
    medianMin: number;
    sigmaMin: number;
    /** Использованы замеры других окон, приведённые к этому. */
    pooled: boolean;
    /** Квартили времени засыпания в этом окне за неделю, минуты от полуночи. */
    startQuartiles: [number, number] | null;
    startCount: number;
  };
  /** Вес личной истории в смеси, от 0 до MAX_PERSONAL_WEIGHT. */
  weight: number;
  blendedMin: number;
  lastSleepMin: number | null;
  lastSleepRefMin: number | null;
  /** Поправка на длину прошлого сна, доля (−0,15…+0,05). */
  adj: number;
  /** Во сколько минут поправка сдвинула окно. */
  adjMin: number;
}

export interface Forecast {
  wakeAt: number;
  predictedAt: number;
  windowStart: number;
  windowEnd: number;
  /** Расчётное окно бодрствования, мин. */
  windowMin: number;
  halfWidthMin: number;
  mode: 'nap' | 'bedtime';
  napNumber: number;
  /** Шкала кольца, мин. */
  ringScaleMin: number;
  basis: ForecastBasis;
}

export type ForecastStatus = 'before' | 'in' | 'overdue';

export interface LiveForecast extends Forecast {
  awakeMin: number;
  status: ForecastStatus;
  /** До прогноза, мин (отрицательное — прогноз прошёл). */
  minutesTo: number;
  /** До конца окна, мин. */
  minutesToEnd: number;
}

export function live(f: Forecast, now: number): LiveForecast {
  const awakeMin = Math.max(0, (now - f.wakeAt) / MIN);
  const status: ForecastStatus =
    now < f.windowStart ? 'before' : now <= f.windowEnd ? 'in' : 'overdue';
  return {
    ...f,
    awakeMin,
    status,
    minutesTo: (f.predictedAt - now) / MIN,
    minutesToEnd: (f.windowEnd - now) / MIN,
  };
}

/** Ночное окно между nightFrom и nightTo (может пересекать полночь). */
export function inNightWindow(now: number, settings: Settings): boolean {
  const from = parseHM(settings.nightFrom);
  const to = parseHM(settings.nightTo);
  if (Number.isNaN(from) || Number.isNaN(to)) return false;
  const m = minutesOfDay(now);
  return from <= to ? m >= from && m < to : m >= from || m < to;
}

/** Типичное время отбоя, минуты от полуночи: ручная настройка → история → норма. */
export function bedtimeTarget(sleeps: SleepEvent[], norm: Norm, settings: Settings, now: number): number {
  const manual = settings.bedtime ? parseHM(settings.bedtime) : NaN;
  if (!Number.isNaN(manual)) return manual;
  const since = now - RHYTHM_DAYS * DAY;
  const starts = sleeps
    .filter((s) => s.t >= since && s.t <= now && sleepKind(s) === 'night')
    .map((s) => minutesOfDay(s.t))
    .filter((m) => m >= 17 * 60 + 30 && m <= 23 * 60 + 30);
  if (starts.length >= 3) return Math.round(median(starts));
  return parseHM(norm.bedtime);
}

function samplesFor(samples: WindowSample[], windowIndex: number, mode: 'nap' | 'bedtime'): WindowSample[] {
  return samples.filter((s) => s.windowIndex === windowIndex && s.mode === mode);
}

function sleepsBefore(sleeps: SleepEvent[], t: number): SleepEvent[] {
  return sleeps.filter((s) => s.t <= t);
}

/** Прогноз ближайшего сна после последнего пробуждения. null — прогнозировать не от чего. */
export function computeForecast(ctx: Ctx): Forecast | null {
  const { child, now, settings } = ctx;
  const sleeps = sleepsOf(ctx.events, child.id);
  if (activeSleep(sleeps)) return null;
  const ds = dayState(sleeps, now);
  if (!ds.last || ds.last.end === null || ds.wakeKind === 'night-waking') return null;

  const age = ageInfo(child.birth, now);
  const norm = normFor(age.months);
  const wakeAt = ds.last.end;

  const mode: 'nap' | 'bedtime' = ds.napsDone >= norm.naps ? 'bedtime' : 'nap';
  const windowIndex = ds.napsDone + 1;
  const windowsTotal = norm.naps + 1;
  const mult = windowMultiplier(windowIndex, windowsTotal);

  const priorMid = (norm.wake[0] + norm.wake[1]) / 2;
  const priorMin = clamp(priorMid * mult, norm.wake[0] * mult * 0.9, norm.wake[1] * mult * 1.1);

  // Замеры за последние 14 суток истории (HISTORY_DAYS), без самого текущего окна.
  const since = now - HISTORY_DAYS * DAY;
  const all = windowSamples(sleepsBefore(sleeps, wakeAt), wakeAt).filter((s) => s.startAt >= since);
  const here = dropOutliers(samplesFor(all, windowIndex, mode).map((s) => s.gapMin));
  const hereRaw = samplesFor(all, windowIndex, mode);

  let personal: ForecastBasis['personal'] = null;
  let personalMin = NaN;
  let nEff = 0;
  let sigma = NaN;

  if (here.length >= MIN_POSITION_SAMPLES) {
    personalMin = median(here);
    sigma = sigmaFromMad(here);
    nEff = here.length;
    personal = { n: here.length, medianMin: personalMin, sigmaMin: sigma, pooled: false, startQuartiles: null, startCount: 0 };
  } else {
    // Мало замеров для этого окна: берём все окна, приведённые к текущему по коэффициенту.
    const pooled = all
      .filter((s) => s.mode === 'nap')
      .map((s) => s.gapMin / windowMultiplier(s.windowIndex, windowsTotal));
    const cleaned = dropOutliers(pooled);
    if (cleaned.length >= 5) {
      personalMin = median(cleaned) * mult;
      sigma = sigmaFromMad(cleaned) * mult;
      nEff = cleaned.length * 0.5;
      personal = { n: cleaned.length, medianMin: personalMin, sigmaMin: sigma, pooled: true, startQuartiles: null, startCount: 0 };
    }
  }

  const weight = personal ? Math.min(MAX_PERSONAL_WEIGHT, nEff / (nEff + PRIOR_STRENGTH)) : 0;
  const blended = personal ? (1 - weight) * priorMin + weight * personalMin : priorMin;

  // Поправка на длину прошлого сна (только после дневного).
  let adj = 0;
  let lastSleepMin: number | null = null;
  let lastSleepRefMin: number | null = null;
  if (ds.wakeKind === 'nap') {
    lastSleepMin = durationMin(ds.last, now);
    const napDurs = sleeps
      .filter((s) => s.end !== null && s.end <= wakeAt && s.t >= since && sleepKind(s) === 'nap' && s.id !== ds.last!.id)
      .map((s) => durationMin(s, now));
    lastSleepRefMin = napDurs.length >= 5 ? median(napDurs) : (norm.napLen[0] + norm.napLen[1]) / 2;
    adj = clamp(((lastSleepMin - lastSleepRefMin) / lastSleepRefMin) * 0.15, -0.15, 0.05);
  }

  const bounded = clamp(blended * (1 + adj), norm.wake[0] * mult * 0.75, norm.wake[1] * mult * 1.25);
  const adjMin = bounded - blended;

  const priorHalf = clamp(roundTo((norm.wake[1] - norm.wake[0]) / 2, 5), 10, 25);
  const half = personal && !Number.isNaN(sigma)
    ? clamp(roundTo(weight * sigma + (1 - weight) * priorHalf, 5), 10, 25)
    : priorHalf;

  let predictedAt = roundLocal(wakeAt + bounded * MIN, 5);

  if (mode === 'bedtime') {
    const target = bedtimeTarget(sleeps, norm, settings, now);
    const anchorDay = startOfDay(wakeAt);
    const targetT = atMinutes(anchorDay, target);
    const lo = targetT - 60 * MIN;
    const hi = targetT + 45 * MIN;
    const floor = wakeAt + 0.6 * norm.wake[0] * MIN;
    predictedAt = Math.max(floor, clamp(predictedAt, lo, hi));
    predictedAt = roundLocal(predictedAt, 5);
  }

  const windowStart = predictedAt - half * MIN;
  const windowEnd = predictedAt + half * MIN;

  // Время засыпания в этом окне за неделю — для «её ритма».
  const weekAgo = now - RHYTHM_DAYS * DAY;
  const starts = hereRaw.filter((s) => s.startAt >= weekAgo).map((s) => minutesOfDay(s.startAt));
  if (personal && starts.length >= MIN_POSITION_SAMPLES) {
    personal.startQuartiles = [roundTo(quantile(starts, 0.25), 5), roundTo(quantile(starts, 0.75), 5)];
    personal.startCount = starts.length;
  } else if (personal) {
    personal.startCount = starts.length;
  }

  const ringScaleMin = Math.max(norm.wake[1], Math.ceil(((windowEnd - wakeAt) / MIN + 5) / 5) * 5);

  return {
    wakeAt,
    predictedAt,
    windowStart,
    windowEnd,
    windowMin: (predictedAt - wakeAt) / MIN,
    halfWidthMin: half,
    mode,
    napNumber: windowIndex,
    ringScaleMin,
    basis: {
      ageMonths: age.months,
      ageLabelFor: age.labelFor,
      norm,
      windowIndex,
      windowsTotal,
      multiplier: mult,
      napNumber: windowIndex,
      mode,
      wakeKind: ds.wakeKind,
      priorMin,
      personal,
      weight,
      blendedMin: blended,
      lastSleepMin,
      lastSleepRefMin,
      adj,
      adjMin,
    },
  };
}

/** Ожидания по идущему сну. */
export interface Outlook {
  sleep: SleepEvent;
  kind: 'night' | 'nap';
  /** Обычная длительность, мин: [от, до]. Для ночи — null. */
  range: [number, number] | null;
  /** Шкала кольца, мин. */
  ringScaleMin: number;
  /** Для ночи: сколько уже проспано за эту ночь, мин. */
  nightTotalMin: number | null;
}

const NIGHT_CHAIN_GAP = 4 * 60 * MIN;

export function computeOutlook(ctx: Ctx, sleep: SleepEvent): Outlook {
  const { child, now } = ctx;
  const age = ageInfo(child.birth, now);
  const norm = normFor(age.months);
  const sleeps = sleepsOf(ctx.events, child.id);
  const kind = sleepKind(sleep);

  if (kind === 'night') {
    // Ночь — цепочка ночных кусков с короткими перерывами.
    let total = durationMin(sleep, now);
    let cursor = sleep;
    const before = sleeps.filter((s) => s.t < sleep.t).reverse();
    for (const s of before) {
      if (sleepKind(s) !== 'night' || s.end === null) break;
      if (cursor.t - s.end > NIGHT_CHAIN_GAP) break;
      total += durationMin(s, now);
      cursor = s;
    }
    return { sleep, kind, range: null, ringScaleMin: 720, nightTotalMin: total };
  }

  const since = now - HISTORY_DAYS * DAY;
  const durs = dropOutliers(
    sleeps
      .filter((s) => s.end !== null && s.end <= now && s.t >= since && sleepKind(s) === 'nap' && s.id !== sleep.id)
      .map((s) => durationMin(s, now)),
  );
  let range: [number, number];
  if (durs.length >= 5) {
    range = [roundTo(quantile(durs, 0.25), 5), roundTo(quantile(durs, 0.75), 5)];
    if (range[1] - range[0] < 10) range = [range[0] - 5, range[1] + 5];
  } else {
    range = [norm.napLen[0], norm.napLen[1]];
  }
  const ringScaleMin = Math.max(60, Math.ceil((range[1] + 30) / 30) * 30);
  return { sleep, kind, range, ringScaleMin, nightTotalMin: null };
}

/** Точность прогноза: проверка на прошлом. */
export interface BacktestRow {
  wakeAt: number;
  predictedAt: number;
  windowStart: number;
  windowEnd: number;
  actualAt: number;
  hit: boolean;
  nextId: string;
}

export interface Backtest {
  rows: BacktestRow[];
  hits: number;
  total: number;
}

/**
 * Для каждого недавнего пробуждения заново считаем прогноз так, как будто мы знали
 * только то, что было известно в тот момент, и смотрим, попал ли в окно настоящий сон.
 */
export function backtest(ctx: Ctx, count = 10, days = 7): Backtest {
  const sleeps = sleepsOf(ctx.events, ctx.child.id);
  const since = ctx.now - days * DAY;
  const pairs = windowSamples(sleeps, ctx.now)
    .filter((p) => p.startAt >= since && p.mode !== undefined)
    .sort((a, b) => b.wakeAt - a.wakeAt)
    .slice(0, count);

  const rows: BacktestRow[] = [];
  for (const p of pairs) {
    const known = liveEvents(ctx.events, ctx.child.id).filter((e) =>
      e.type === 'sleep' ? e.t < p.wakeAt : e.t <= p.wakeAt,
    );
    const f = computeForecast({ ...ctx, events: known, now: p.wakeAt });
    if (!f) continue;
    rows.push({
      wakeAt: p.wakeAt,
      predictedAt: f.predictedAt,
      windowStart: f.windowStart,
      windowEnd: f.windowEnd,
      actualAt: p.startAt,
      hit: p.startAt >= f.windowStart && p.startAt <= f.windowEnd,
      nextId: p.nextId,
    });
  }
  return { rows, hits: rows.filter((r) => r.hit).length, total: rows.length };
}

/** Какой прогноз был для этого сна — если попал в окно. Нужно для подписи «Прогноз был 14:20». */
export function forecastFor(ctx: Ctx, sleep: SleepEvent): BacktestRow | null {
  const sleeps = sleepsOf(ctx.events, ctx.child.id);
  const pair = windowSamples(sleeps, ctx.now).find((p) => p.nextId === sleep.id);
  if (!pair) return null;
  const known = liveEvents(ctx.events, ctx.child.id).filter((e) =>
    e.type === 'sleep' ? e.t < pair.wakeAt : e.t <= pair.wakeAt,
  );
  const f = computeForecast({ ...ctx, events: known, now: pair.wakeAt });
  if (!f) return null;
  return {
    wakeAt: pair.wakeAt,
    predictedAt: f.predictedAt,
    windowStart: f.windowStart,
    windowEnd: f.windowEnd,
    actualAt: pair.startAt,
    hit: pair.startAt >= f.windowStart && pair.startAt <= f.windowEnd,
    nextId: sleep.id,
  };
}
