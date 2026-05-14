import { useMemo } from "react";
import { addDays, format, isSameDay, startOfWeek } from "date-fns";
import { ko } from "date-fns/locale/ko";
import { enUS } from "date-fns/locale/en-US";
import { buildMonthLayout } from "../../lib/calendar/buildMonthLayout";
import type {
  CalendarLocale,
  UnifiedCalendarEvent,
} from "../../lib/calendar/types";

interface MonthGridProps<T> {
  viewMonth: Date;
  events: Array<UnifiedCalendarEvent<T>>;
  weekStartsOn: 0 | 1;
  locale: CalendarLocale;
  today: Date;
  selectedDate?: Date | null;
  onSelectEvent?: (event: UnifiedCalendarEvent<T>) => void;
  onSelectDate?: (date: Date) => void;
}

export function MonthGrid<T>({
  viewMonth,
  events,
  weekStartsOn,
  locale,
  today,
  selectedDate,
  onSelectEvent,
  onSelectDate,
}: MonthGridProps<T>) {
  const layout = useMemo(
    () => buildMonthLayout(viewMonth, events, { weekStartsOn, today }),
    [viewMonth, events, weekStartsOn, today],
  );
  const localeObj = locale === "ko" ? ko : enUS;
  const headerStart = startOfWeek(today, { weekStartsOn });

  return (
    <div className="cal-month" role="grid">
      <div className="cal-month-header" role="row">
        {Array.from({ length: 7 }, (_, idx) => (
          <span key={idx} className="cal-dow" role="columnheader">
            {format(addDays(headerStart, idx), locale === "ko" ? "EEEEE" : "EEE", {
              locale: localeObj,
            })}
          </span>
        ))}
      </div>
      <div className="cal-month-body">
        {layout.map((week, weekIdx) => {
          const laneCount = week.lanes.length;
          const styles: React.CSSProperties = {
            gridTemplateRows: `28px repeat(${laneCount}, 22px) minmax(0, 1fr)`,
          };
          return (
            <div
              key={weekIdx}
              className="cal-week-row"
              style={styles}
              data-lanes={laneCount}
            >
              {week.cells.map((cell, col) => (
                <button
                  key={`cell-${col}`}
                  type="button"
                  className={cellClassName(cell, selectedDate)}
                  style={{ gridColumn: col + 1, gridRow: "1 / -1" }}
                  onClick={() => onSelectDate?.(cell.date)}
                  aria-label={format(cell.date, "PPPP", { locale: localeObj })}
                />
              ))}
              {week.cells.map((cell, col) => (
                <span
                  key={`num-${col}`}
                  className={
                    cell.isToday
                      ? "cal-day-number cal-day-number-today"
                      : "cal-day-number"
                  }
                  style={{ gridColumn: col + 1, gridRow: 1 }}
                >
                  {format(cell.date, "d")}
                </span>
              ))}
              {week.lanes.flatMap((lane, laneIdx) =>
                lane.map((seg) => (
                  <button
                    key={`bar-${laneIdx}-${seg.event.id}`}
                    type="button"
                    className={barClassName(seg.event.category, seg.openLeft, seg.openRight)}
                    style={{
                      gridColumn: `${seg.startColumn + 1} / span ${seg.endColumn - seg.startColumn + 1}`,
                      gridRow: laneIdx + 2,
                    }}
                    title={seg.event.title}
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelectEvent?.(seg.event);
                    }}
                  >
                    <span className="cal-bar-label">
                      {seg.openLeft ? null : seg.event.title}
                    </span>
                  </button>
                )),
              )}
              {week.cells.map((_, col) => {
                const chips = week.timedByColumn[col];
                const overflow = week.overflowPerCell[col];
                if (chips.length === 0 && overflow === 0) return null;
                return (
                  <div
                    key={`extras-${col}`}
                    className="cal-extras"
                    style={{ gridColumn: col + 1, gridRow: -2 }}
                  >
                    {chips.map((chip) => (
                      <button
                        key={chip.event.id}
                        type="button"
                        className={`cal-time-chip cat-${chip.event.category}`}
                        title={chip.event.title}
                        onClick={(event) => {
                          event.stopPropagation();
                          onSelectEvent?.(chip.event);
                        }}
                      >
                        <span className="cal-time-chip-time">
                          {format(chip.event.start, locale === "ko" ? "a h:mm" : "h:mma", {
                            locale: localeObj,
                          })}
                        </span>
                        <span className="cal-time-chip-title">{chip.event.title}</span>
                      </button>
                    ))}
                    {overflow > 0 ? (
                      <span className="cal-overflow">+{overflow}</span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function cellClassName(
  cell: { inCurrentMonth: boolean; isToday: boolean; isWeekend: boolean; date: Date },
  selectedDate?: Date | null,
): string {
  const classes = ["cal-day-cell"];
  if (!cell.inCurrentMonth) classes.push("off-range");
  if (cell.isToday) classes.push("today");
  if (cell.isWeekend) classes.push("weekend");
  if (selectedDate && isSameDay(cell.date, selectedDate)) classes.push("selected");
  return classes.join(" ");
}

function barClassName(category: string, openLeft: boolean, openRight: boolean): string {
  const classes = ["cal-bar", `cat-${category}`];
  if (openLeft) classes.push("open-left");
  if (openRight) classes.push("open-right");
  return classes.join(" ");
}
