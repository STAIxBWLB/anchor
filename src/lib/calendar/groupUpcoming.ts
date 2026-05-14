import {
  addDays,
  differenceInCalendarDays,
  format,
  isSameDay,
  startOfDay,
  type Locale,
} from "date-fns";
import { ko } from "date-fns/locale/ko";
import { enUS } from "date-fns/locale/en-US";
import type { CalendarLocale, UnifiedCalendarEvent } from "./types";

export interface UpcomingGroup<T = unknown> {
  dateISO: string;
  date: Date;
  label: string;
  dateLabel: string;
  events: Array<UnifiedCalendarEvent<T>>;
}

export interface GroupUpcomingOptions {
  today: Date;
  locale: CalendarLocale;
  horizonDays?: number;
}

const LOCALES = { ko, en: enUS };

export function groupUpcomingEvents<T>(
  events: Array<UnifiedCalendarEvent<T>>,
  options: GroupUpcomingOptions,
): Array<UpcomingGroup<T>> {
  const todayMidnight = startOfDay(options.today);
  const horizon = options.horizonDays ?? 30;
  const upperBound = addDays(todayMidnight, horizon);
  const localeObj = LOCALES[options.locale] ?? enUS;

  const buckets = new Map<string, UpcomingGroup<T>>();
  for (const event of events) {
    const eventStart = startOfDay(event.start);
    if (eventStart < todayMidnight) continue;
    if (eventStart > upperBound) continue;
    const key = isoDate(eventStart);
    const existing = buckets.get(key);
    if (existing) {
      existing.events.push(event);
      continue;
    }
    buckets.set(key, {
      dateISO: key,
      date: eventStart,
      label: bucketLabel(eventStart, todayMidnight, options.locale, localeObj),
      dateLabel: dateLabel(eventStart, options.locale, localeObj),
      events: [event],
    });
  }

  const groups = Array.from(buckets.values()).sort((a, b) => +a.date - +b.date);
  for (const group of groups) {
    group.events.sort((a, b) => +a.start - +b.start || a.title.localeCompare(b.title));
  }
  return groups;
}

function bucketLabel(
  date: Date,
  today: Date,
  locale: CalendarLocale,
  localeObj: Locale,
): string {
  const diff = differenceInCalendarDays(date, today);
  if (locale === "ko") {
    if (diff === 0) return "오늘";
    if (diff === 1) return "내일";
    return format(date, "EEEE", { locale: localeObj });
  }
  if (isSameDay(date, today)) return "TODAY";
  if (diff === 1) return "TOMORROW";
  return format(date, "EEE", { locale: localeObj }).toUpperCase();
}

function dateLabel(date: Date, locale: CalendarLocale, localeObj: Locale): string {
  if (locale === "ko") {
    return format(date, "yyyy년 M월 d일", { locale: localeObj });
  }
  return format(date, "MMM d, yyyy", { locale: localeObj });
}

function isoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
