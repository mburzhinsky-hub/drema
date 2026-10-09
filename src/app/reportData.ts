/** Данные выписки для текущего экрана «Отчёты»: нужны и экрану, и отправке, и печати. */
import { Child } from '../engine/model';
import { ReportDoc, buildReport, reportToText } from '../engine/report';
import { addDays, now, startOfDay } from '../engine/time';
import { PeriodStats, ReportExtras, periodStats, reportExtras } from '../engine/week';
import { derive } from '../store/select';
import { getState } from '../store/store';
import { ui } from './ui';

export interface CurrentReport {
  child: Child;
  stats: PeriodStats;
  extras: ReportExtras;
  doc: ReportDoc;
  text: string;
}

export function currentReport(): CurrentReport | null {
  const t = now();
  const d = derive(getState(), t);
  if (!d) return null;
  const n = ui.reportRange === 'month' ? 30 : 7;
  const last = startOfDay(t);
  const stats = periodStats(d.events, d.child.id, last, n, t);
  const extras = reportExtras(d.events, d.child.id, stats.from, addDays(last, 1));
  const doc = buildReport({ child: d.child, stats, extras, question: ui.reportQuestion, now: t });
  return { child: d.child, stats, extras, doc, text: reportToText(doc) };
}
