/** Расписание суток для демо-данных. */
import tuned from './tuned.json';

/** Сутки: утреннее пробуждение, окна бодрствования и длительности дневных снов (минуты). */
export interface DayPlan {
  /** Минуты от полуночи. */
  wake: number;
  /** Пять окон: до 1-го, 2-го, 3-го, 4-го дневного сна и до ночного. */
  gaps: [number, number, number, number, number];
  /** Длительности четырёх дневных снов. */
  durs: [number, number, number, number];
}

/** Пятница, 9 октября: день, который нарисован в макете. Здесь всё задано вручную. */
export const FRIDAY: DayPlan = {
  wake: 405, // 06:45
  gaps: [105, 95, 132, 127, 109], // сны в 08:30, 11:00, 14:22, 17:41; ночь в 20:00
  durs: [55, 70, 72, 30],
};

/** Строка таблицы: [пробуждение, окно 1…5, сон 1…4]. */
type Row = number[];

export const fromRow = (r: Row): DayPlan => ({
  wake: r[0],
  gaps: [r[1], r[2], r[3], r[4], r[5]],
  durs: [r[6], r[7], r[8], r[9]],
});

/** Двадцать предыдущих суток подобраны скриптом tools/tune-demo.ts, затем идёт пятница. */
export const PLAN: DayPlan[] = [...(tuned as Row[]).map(fromRow), FRIDAY];
