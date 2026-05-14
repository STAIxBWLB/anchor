import {
  addDays,
  differenceInCalendarDays,
  isSameDay,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subDays,
} from "date-fns";
import type {
  LaneSegment,
  MonthCell,
  TimedChip,
  UnifiedCalendarEvent,
  WeekRowLayout,
} from "./types";

export interface BuildMonthLayoutOptions {
  weekStartsOn: 0 | 1;
  today: Date;
  maxLanes?: number;
  maxTimedPerCell?: number;
}

interface PreparedEvent<T> {
  event: UnifiedCalendarEvent<T>;
  firstDay: Date;
  lastDay: Date;
  asBar: boolean;
}

const DEFAULT_MAX_LANES = 4;
const DEFAULT_MAX_TIMED = 3;

export function buildMonthLayout<T>(
  viewMonth: Date,
  events: Array<UnifiedCalendarEvent<T>>,
  options: BuildMonthLayoutOptions,
): Array<WeekRowLayout<T>> {
  const { weekStartsOn, today } = options;
  const maxLanes = options.maxLanes ?? DEFAULT_MAX_LANES;
  const maxTimedPerCell = options.maxTimedPerCell ?? DEFAULT_MAX_TIMED;
  const firstCell = startOfWeek(startOfMonth(viewMonth), { weekStartsOn });
  const todayMidnight = startOfDay(today);
  const monthIndex = viewMonth.getMonth();
  const monthYear = viewMonth.getFullYear();

  const prepared = events.map((event) => prepareEvent(event)).filter(Boolean) as Array<
    PreparedEvent<T>
  >;

  const weeks: Array<WeekRowLayout<T>> = [];
  for (let weekIdx = 0; weekIdx < 6; weekIdx += 1) {
    const weekStart = addDays(firstCell, weekIdx * 7);
    const weekEnd = addDays(weekStart, 6);
    const cells: MonthCell[] = [];
    for (let col = 0; col < 7; col += 1) {
      const date = addDays(weekStart, col);
      const dow = date.getDay();
      cells.push({
        date,
        inCurrentMonth: date.getMonth() === monthIndex && date.getFullYear() === monthYear,
        isToday: isSameDay(date, todayMidnight),
        isWeekend: dow === 0 || dow === 6,
      });
    }

    const segments: Array<LaneSegment<T>> = [];
    const timedByColumn: Array<Array<TimedChip<T>>> = Array.from({ length: 7 }, () => []);
    const overflowPerCell = new Array<number>(7).fill(0);

    for (const item of prepared) {
      if (item.asBar) {
        if (item.lastDay < weekStart || item.firstDay > weekEnd) continue;
        const segmentStart = item.firstDay < weekStart ? weekStart : item.firstDay;
        const segmentEnd = item.lastDay > weekEnd ? weekEnd : item.lastDay;
        const startColumn = clampColumn(differenceInCalendarDays(segmentStart, weekStart));
        const endColumn = clampColumn(differenceInCalendarDays(segmentEnd, weekStart));
        segments.push({
          event: item.event,
          startColumn,
          endColumn,
          openLeft: item.firstDay < weekStart,
          openRight: item.lastDay > weekEnd,
        });
      } else {
        if (item.firstDay < weekStart || item.firstDay > weekEnd) continue;
        const column = clampColumn(differenceInCalendarDays(item.firstDay, weekStart));
        timedByColumn[column].push({ event: item.event, column });
      }
    }

    segments.sort((a, b) => {
      if (a.startColumn !== b.startColumn) return a.startColumn - b.startColumn;
      return b.endColumn - b.startColumn - (a.endColumn - a.startColumn);
    });

    const lanes: Array<Array<LaneSegment<T>>> = [];
    for (const seg of segments) {
      let placed = false;
      for (let lane = 0; lane < maxLanes && lane < lanes.length + 1; lane += 1) {
        const lanesSeg = lanes[lane] ?? [];
        const conflict = lanesSeg.some(
          (existing) =>
            !(seg.endColumn < existing.startColumn || seg.startColumn > existing.endColumn),
        );
        if (!conflict) {
          if (!lanes[lane]) lanes[lane] = [];
          lanes[lane].push(seg);
          placed = true;
          break;
        }
      }
      if (!placed) {
        for (let col = seg.startColumn; col <= seg.endColumn; col += 1) {
          overflowPerCell[col] += 1;
        }
      }
    }

    for (let col = 0; col < 7; col += 1) {
      const chips = timedByColumn[col];
      chips.sort((a, b) => +a.event.start - +b.event.start);
      if (chips.length > maxTimedPerCell) {
        overflowPerCell[col] += chips.length - maxTimedPerCell;
        timedByColumn[col] = chips.slice(0, maxTimedPerCell);
      }
    }

    weeks.push({ weekStart, cells, lanes, timedByColumn, overflowPerCell });
  }

  return weeks;
}

function prepareEvent<T>(event: UnifiedCalendarEvent<T>): PreparedEvent<T> | null {
  const start = event.start;
  const end = event.end;
  if (!(start instanceof Date) || Number.isNaN(start.getTime())) return null;
  if (!(end instanceof Date) || Number.isNaN(end.getTime())) return null;
  const firstDay = startOfDay(start);
  const inclusiveLast = end > start && isMidnight(end) ? subDays(end, 1) : end;
  const lastDay = startOfDay(inclusiveLast < firstDay ? firstDay : inclusiveLast);
  const spans = differenceInCalendarDays(lastDay, firstDay) + 1;
  const asBar = event.allDay || spans > 1;
  return { event, firstDay, lastDay, asBar };
}

function isMidnight(date: Date): boolean {
  return (
    date.getHours() === 0 &&
    date.getMinutes() === 0 &&
    date.getSeconds() === 0 &&
    date.getMilliseconds() === 0
  );
}

function clampColumn(value: number): number {
  if (value < 0) return 0;
  if (value > 6) return 6;
  return value;
}
