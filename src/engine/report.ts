/** Текст выписки для педиатра: то, что уходит в мессенджер или на печать. */
import { ageInfo } from './age';
import { fmtDate, fmtDur, fmtPeriod, plural } from './format';
import { Child } from './model';
import { PeriodStats, ReportExtras, fmtPerDay } from './week';
import { addDays } from './time';

export interface ReportInput {
  child: Child;
  stats: PeriodStats;
  extras: ReportExtras;
  question: string;
  now: number;
}

export function reportHeading(child: Child, stats: PeriodStats, now: number): string {
  const age = ageInfo(child.birth, now);
  return `${child.name}, ${age.label} · ${fmtPeriod(stats.from, stats.to)}`;
}

export interface ReportSection {
  title: string;
  /** Пункты списка. */
  bullets?: string[];
  /** Сплошной текст (вопрос врачу, «записей нет»). */
  text?: string;
}

export interface ReportDoc {
  title: string;
  heading: string;
  sections: ReportSection[];
  footer: string;
}

const hmOf = (t: number): string => new Date(t).toTimeString().slice(0, 5);
const fmtC = (c: number): string => `${c.toFixed(1).replace('.', ',')} °C`;

export function buildReport({ child, stats, extras, question, now }: ReportInput): ReportDoc {
  const sections: ReportSection[] = [];
  const n = stats.basis.length;
  if (n === 0) {
    sections.push({ title: 'ЗАПИСИ', text: 'За выбранный период записей нет.' });
  } else {
    sections.push({
      title: `СОН (в среднем за ${n} ${plural(n, 'день', 'дня', 'дней')})`,
      bullets: [
        `${fmtDur(stats.avgSleepMin)} в сутки, от ${fmtDur(stats.minSleepMin)} до ${fmtDur(stats.maxSleepMin)}`,
        `ночью ${fmtDur(stats.avgNightMin)}, днём ${fmtDur(stats.avgNapMin)} (дневных снов: ${fmtPerDay(stats.avgNaps)})`,
      ],
    });
    const ml = stats.avgMl > 0 ? `, смеси около ${Math.round(stats.avgMl / 10) * 10} мл в сутки` : '';
    sections.push({ title: 'ПИТАНИЕ', bullets: [`кормлений в сутки: ${fmtPerDay(stats.avgFeeds)}${ml}`] });
    sections.push({
      title: 'ПОДГУЗНИКИ',
      bullets: [`в сутки: ${fmtPerDay(stats.avgDiapers)} (мокрых ${fmtPerDay(stats.avgWet)}, грязных ${fmtPerDay(stats.avgDirty)})`],
    });
  }

  if (extras.maxTemp !== null) {
    sections.push({
      title: 'ТЕМПЕРАТУРА',
      bullets: [
        `максимум ${fmtC(extras.maxTemp)}`,
        ...extras.temps.slice(-6).map((t) => `${fmtDate(t.t)} ${hmOf(t.t)} — ${fmtC(t.c)}`),
      ],
    });
  }

  if (extras.meds.length) {
    sections.push({
      title: 'ЛЕКАРСТВА',
      bullets: extras.meds.slice(-8).map((m) => `${fmtDate(m.t)} ${hmOf(m.t)} — ${m.name}${m.dose ? `, ${m.dose}` : ''}`),
    });
  }

  if (extras.growth) {
    const g = extras.growth;
    const p: string[] = [];
    if (g.kg !== undefined) p.push(`${String(g.kg).replace('.', ',')} кг`);
    if (g.cm !== undefined) p.push(`${String(g.cm).replace('.', ',')} см`);
    if (p.length) sections.push({ title: 'РОСТ И ВЕС', bullets: [`${p.join(', ')} (${fmtDate(g.t)})`] });
  }

  const q = question.trim();
  if (q) sections.push({ title: 'ВОПРОС ВРАЧУ', text: q });

  return {
    title: 'Выписка для педиатра',
    heading: reportHeading(child, stats, now),
    sections,
    footer: 'Составлено в приложении «Дрёма» по записям родителей. Это не медицинское заключение.',
  };
}

export function reportToText(doc: ReportDoc): string {
  const lines: string[] = [doc.title, doc.heading, ''];
  for (const s of doc.sections) {
    lines.push(s.title);
    if (s.bullets) for (const b of s.bullets) lines.push(`• ${b}`);
    if (s.text) lines.push(s.text);
    lines.push('');
  }
  lines.push(doc.footer);
  return lines.join('\n');
}

export const buildReportText = (input: ReportInput): string => reportToText(buildReport(input));

/** Первый и последний день периода для заголовка: неделя — 7 суток, месяц — 30. */
export function periodRange(lastDay: number, n: number): { from: number; toExclusive: number } {
  return { from: addDays(lastDay, -(n - 1)), toExclusive: addDays(lastDay, 1) };
}
