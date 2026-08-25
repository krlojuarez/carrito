import { eachDayOfInterval, parseISO, format, getDay } from 'date-fns';
import type { BusinessWeekday, DateRange, LocalDate } from './types';

/** All calendar dates in [start, end] inclusive, as 'YYYY-MM-DD'. */
export function listDays(range: DateRange): LocalDate[] {
  return eachDayOfInterval({
    start: parseISO(range.start),
    end: parseISO(range.end),
  }).map((d) => format(d, 'yyyy-MM-dd'));
}

export function weekdayOf(date: LocalDate): BusinessWeekday {
  return getDay(parseISO(date)) as BusinessWeekday;
}

export function isBusinessDay(date: LocalDate, businessDays: BusinessWeekday[]): boolean {
  return businessDays.includes(weekdayOf(date));
}

export function countBusinessDays(range: DateRange, businessDays: BusinessWeekday[]): number {
  return listDays(range).filter((d) => isBusinessDay(d, businessDays)).length;
}

export const round1 = (x: number) => Math.round(x * 10) / 10;
export const round2 = (x: number) => Math.round(x * 100) / 100;

export function sum<T>(arr: T[], f: (t: T) => number): number {
  return arr.reduce((a, t) => a + f(t), 0);
}
