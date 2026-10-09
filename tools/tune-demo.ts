/**
 * Подбор расписания демо-данных. Запуск: TZ=Europe/Moscow npx tsx tools/tune-demo.ts [seed] [iterations]
 *
 * Ищет 20 суток, при которых движок выдаёт ровно те цифры, что нарисованы в макете
 * (14:20, окно 14:05–14:35, «8 из 10», 17:35, 13 ч 35 мин, высоты столбиков…).
 * Результат пишется в src/demo/tuned.json.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { backtest, computeForecast, computeOutlook } from '../src/engine/predict';
import { expectedNapLength } from '../src/engine/day';
import { activeSleep, sleepsOf } from '../src/engine/sleep';
import { DEFAULT_SETTINGS } from '../src/engine/model';
import { barHeight, fmtHours, periodStats } from '../src/engine/week';
import { fmtDur } from '../src/engine/format';
import { addDays } from '../src/engine/time';
import { demoChild, demoEvents, snapshotAt } from '../src/demo/demo';
import { FRIDAY, fromRow } from '../src/demo/plan';
import { fixtureDay, fixtureTime } from '../src/demo/scenarios';

const seed = Number(process.argv[2] ?? 1);
const iterations = Number(process.argv[3] ?? 200000);

function rng(s: number): () => number {
  let a = s >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(seed);
const ri = (a: number, b: number): number => a + Math.floor(rand() * (b - a + 1));

// [пробуждение, окна 1..5, сны 1..4]
const LO = [390, 90, 95, 110, 100, 95, 40, 55, 55, 25];
const HI = [435, 125, 135, 150, 140, 140, 80, 95, 95, 75];
const REPORT_DAYS = [14, 15, 16, 17, 18, 19]; // 3–8 октября: индексы 20 суток
const TARGET_PX = [90, 93, 85, 93, 95, 87];

const day = fixtureDay();
const child = demoChild(day);
const T = {
  home: fixtureTime(13, 42),
  sleeping: fixtureTime(15, 34, 8),
  dayNow: fixtureTime(15, 34, 30),
  report: fixtureTime(23, 7),
};

const dist = (x: number, lo: number, hi: number): number => (x < lo ? lo - x : x > hi ? x - hi : 0);

function cost(rows: number[][], verbose = false): number {
  let c = 0;
  const plans = [...rows.map(fromRow), FRIDAY];
  const master = demoEvents(day, { plans });
  const log = (s: string): void => {
    if (verbose) console.log(s);
  };

  // реалистичность: отбой 19:30–21:00
  for (const r of rows) {
    const bed = r[0] + r[1] + r[2] + r[3] + r[4] + r[5] + r[6] + r[7] + r[8] + r[9];
    c += dist(bed, 1170, 1260) * 2;
  }

  // 1. Главный экран
  const home = snapshotAt(master, T.home);
  const ctxH = { child, events: home, now: T.home, settings: DEFAULT_SETTINGS };
  const f = computeForecast(ctxH);
  if (!f) return 1e6;
  c += (Math.abs(f.predictedAt - fixtureTime(14, 20)) / 60000 / 5) * 10;
  c += Math.abs(f.halfWidthMin - 15) * 2;
  c += Math.abs(f.ringScaleMin - 150) * 2;
  const q = f.basis.personal?.startQuartiles;
  if (!q) c += 100;
  else c += (Math.abs(q[0] - 855) + Math.abs(q[1] - 880)) / 5 * 4;
  log(`прогноз ${new Date(f.predictedAt).toTimeString().slice(0, 5)} ±${f.halfWidthMin} кв=${q} n=${f.basis.personal?.n} w=${f.basis.weight.toFixed(2)}`);

  // 2. Точность
  const bt = backtest(ctxH);
  c += Math.abs(bt.hits - 8) * 10 + Math.abs(bt.total - 10) * 10;
  log(`точность ${bt.hits}/${bt.total}`);

  // 3. Журнал: прогноз 17:35
  const dayEv = snapshotAt(master, T.dayNow);
  const f2 = computeForecast({ child, events: dayEv, now: T.dayNow, settings: DEFAULT_SETTINGS });
  if (!f2) return 1e6;
  c += (Math.abs(f2.predictedAt - fixtureTime(17, 35)) / 60000 / 5) * 10;
  const exp = expectedNapLength(sleepsOf(dayEv, child.id), T.dayNow, 70);
  c += Math.abs(exp - 75) * 0.5;
  // гладкая подсказка для поиска: сырая медиана длин дневных снов должна попасть в [72,5; 77,5)
  const napDurs = sleepsOf(dayEv, child.id)
    .filter((e) => e.end !== null && e.end <= T.dayNow && e.t >= T.dayNow - 14 * 86400000 && e.t % 86400000 !== 0 && e.end - e.t < 5 * 3600000 && new Date(e.t).getHours() >= 6 && new Date(e.t).getHours() < 18)
    .map((e) => ((e.end as number) - e.t) / 60000)
    .sort((a, b) => a - b);
  if (napDurs.length) {
    const mid = (napDurs.length - 1) / 2;
    const med = (napDurs[Math.floor(mid)] + napDurs[Math.ceil(mid)]) / 2;
    c += dist(med, 72.6, 77.4) * 2;
  }
  log(`следующий ${new Date(f2.predictedAt).toTimeString().slice(0, 5)} длина ${exp}`);

  // 4. Идёт сон: обычно 1 ч – 1 ч 20 мин
  const sl = snapshotAt(master, T.sleeping).map((e) => (e.type === 'sleep' && e.t === fixtureTime(14, 22) ? { ...e, end: null } : e));
  const act = activeSleep(sleepsOf(sl, child.id));
  if (!act) return 1e6;
  const ol = computeOutlook({ child, events: sl, now: T.sleeping, settings: DEFAULT_SETTINGS }, act);
  if (!ol.range) return 1e6;
  c += (Math.abs(ol.range[0] - 60) + Math.abs(ol.range[1] - 80)) / 5 * 4;
  log(`обычный сон ${ol.range}`);

  // 5. Отчёт
  const rep = snapshotAt(master, T.report);
  const ps = periodStats(rep, child.id, day, 7, T.report);
  const sleeps = ps.days.map((d) => d.sleepMin);
  for (let i = 0; i < 6; i++) {
    const px = barHeight(sleeps[i]);
    c += Math.abs(px - TARGET_PX[i]) * 3;
  }
  c += Math.abs(barHeight(sleeps[6]) - 91) * 3;
  c += Math.abs(Math.round(ps.avgSleepMin) - 815) * 3;
  if (fmtHours(ps.minSleepMin) !== '12,8') c += 6;
  if (fmtHours(ps.maxSleepMin) !== '14,2') c += 6;
  log(`отчёт ${fmtDur(ps.avgSleepMin)} столбики ${ps.days.map((d) => barHeight(d.sleepMin))} ${fmtHours(ps.minSleepMin)}–${fmtHours(ps.maxSleepMin)}`);

  void addDays;
  return c;
}

// Начальное расписание: средний день с небольшим шумом.
function initial(): number[][] {
  const base = [405, 105, 112, 130, 120, 115, 58, 76, 76, 55];
  return Array.from({ length: 20 }, () => base.map((v, k) => Math.min(HI[k], Math.max(LO[k], v + ri(-6, 6)))));
}

const startFile = process.argv[4];
let rows: number[][] = startFile ? JSON.parse(readFileSync(startFile, 'utf8')) : initial();
let best = cost(rows);
console.log('старт, цена', best.toFixed(1));

for (let it = 0; it < iterations && best > 0; it++) {
  const i = ri(0, 19);
  const k = ri(0, 9);
  const old = rows[i][k];
  const step = ri(1, 6) * (rand() < 0.5 ? -1 : 1);
  const nv = Math.min(HI[k], Math.max(LO[k], old + step));
  if (nv === old) continue;
  rows[i][k] = nv;
  // сохраняем сумму окон на днях отчёта: часть шага уходит в соседнее окно
  let second = -1;
  if (k >= 1 && k <= 5 && REPORT_DAYS.includes(i) && rand() < 0.7) {
    second = ri(1, 5);
    if (second === k) second = -1;
    else {
      const o2 = rows[i][second];
      const n2 = Math.min(HI[second], Math.max(LO[second], o2 - (nv - old)));
      rows[i][second] = n2;
      (rows as unknown as { _o2: number })._o2 = o2;
    }
  }
  const c = cost(rows);
  if (c <= best) {
    if (c < best && it % 50 === 0) console.log(it, c.toFixed(1));
    best = c;
  } else {
    rows[i][k] = old;
    if (second >= 0) rows[i][second] = (rows as unknown as { _o2: number })._o2;
  }
}

// Вторая фаза: пока все цифры макета сходятся, сглаживаем расписание — меньше резких отклонений от «среднего» дня.
const BASE = [405, 105, 112, 130, 120, 115, 58, 76, 76, 55];
const SCALE = [12, 10, 10, 10, 10, 10, 8, 8, 8, 10];
const reg = (r: number[][]): number => r.reduce((s, row) => s + row.reduce((a, v, k) => a + ((v - BASE[k]) / SCALE[k]) ** 2, 0), 0);
if (best === 0) {
  let r0 = reg(rows);
  console.log('сглаживание, начало', r0.toFixed(1));
  const phase2 = Number(process.argv[5] ?? 60000);
  for (let it = 0; it < phase2; it++) {
    const i = ri(0, 19);
    const k = ri(0, 9);
    const old = rows[i][k];
    const nv = Math.min(HI[k], Math.max(LO[k], old + ri(1, 5) * (rand() < 0.5 ? -1 : 1)));
    if (nv === old) continue;
    // шаг в окне компенсируем в соседнем окне того же дня, чтобы сумма (а с ней дневной сон) не менялась
    let comp = -1;
    let oldComp = 0;
    if (k >= 1 && k <= 5) {
      comp = ri(1, 5);
      if (comp === k) comp = -1;
    }
    rows[i][k] = nv;
    if (comp >= 0) {
      oldComp = rows[i][comp];
      rows[i][comp] = Math.min(HI[comp], Math.max(LO[comp], oldComp - (nv - old)));
    }
    const r1 = reg(rows);
    if (r1 <= r0 && cost(rows) === 0) {
      r0 = r1;
    } else {
      rows[i][k] = old;
      if (comp >= 0) rows[i][comp] = oldComp;
    }
  }
  console.log('сглаживание, итог', r0.toFixed(1));
}

// Третья фаза: добавляем будничную неровность (дни не должны быть копиями друг друга), не выходя за бюджет отклонений.
if (best === 0 && process.env.DIVERSIFY) {
  const cap = Number(process.env.DIVERSIFY);
  let accepted = 0;
  for (let it = 0; it < 40000; it++) {
    const i = ri(0, 19);
    const k = ri(0, 9);
    const old = rows[i][k];
    const nv = Math.min(HI[k], Math.max(LO[k], old + ri(1, 4) * (rand() < 0.5 ? -1 : 1)));
    if (nv === old) continue;
    let comp = -1;
    let oldComp = 0;
    if (k >= 1 && k <= 5) {
      comp = ri(1, 5);
      if (comp === k) comp = -1;
    }
    rows[i][k] = nv;
    if (comp >= 0) {
      oldComp = rows[i][comp];
      rows[i][comp] = Math.min(HI[comp], Math.max(LO[comp], oldComp - (nv - old)));
    }
    if (reg(rows) <= cap && cost(rows) === 0) accepted++;
    else {
      rows[i][k] = old;
      if (comp >= 0) rows[i][comp] = oldComp;
    }
  }
  console.log('неровность: принято шагов', accepted, 'бюджет', reg(rows).toFixed(1));
}

console.log('итог, цена', best.toFixed(1));
cost(rows, true);
if (best === 0) {
  writeFileSync(new URL('../src/demo/tuned.json', import.meta.url), JSON.stringify(rows));
  console.log('записано в src/demo/tuned.json');
} else {
  writeFileSync(new URL(`../src/demo/tuned.try${seed}.json`, import.meta.url), JSON.stringify(rows));
  console.log('цель не достигнута, лучший вариант сохранён в tuned.try' + seed + '.json');
}
