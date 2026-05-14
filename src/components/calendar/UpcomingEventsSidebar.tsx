import { format } from "date-fns";
import { ko } from "date-fns/locale/ko";
import { enUS } from "date-fns/locale/en-US";
import { groupUpcomingEvents } from "../../lib/calendar/groupUpcoming";
import type {
  CalendarLocale,
  UnifiedCalendarEvent,
} from "../../lib/calendar/types";

interface UpcomingEventsSidebarProps<T> {
  events: Array<UnifiedCalendarEvent<T>>;
  today: Date;
  locale: CalendarLocale;
  onSelectEvent?: (event: UnifiedCalendarEvent<T>) => void;
  emptyLabel?: string;
}

export function UpcomingEventsSidebar<T>({
  events,
  today,
  locale,
  onSelectEvent,
  emptyLabel,
}: UpcomingEventsSidebarProps<T>) {
  const groups = groupUpcomingEvents(events, { today, locale });
  const localeObj = locale === "ko" ? ko : enUS;
  if (groups.length === 0) {
    return (
      <aside className="cal-sidebar">
        <p className="cal-sidebar-empty">
          {emptyLabel ?? (locale === "ko" ? "다가오는 일정 없음" : "Nothing upcoming")}
        </p>
      </aside>
    );
  }
  return (
    <aside className="cal-sidebar">
      <ul className="cal-sidebar-list">
        {groups.map((group) => (
          <li key={group.dateISO} className="cal-sidebar-group">
            <header className="cal-sidebar-group-header">
              <span className="cal-sidebar-bucket">{group.label}</span>
              <span className="cal-sidebar-date">{group.dateLabel}</span>
            </header>
            <ul className="cal-sidebar-events">
              {group.events.map((event) => (
                <li key={event.id}>
                  <button
                    type="button"
                    className={`cal-sidebar-row cat-${event.category}`}
                    onClick={() => onSelectEvent?.(event)}
                  >
                    <span className="cal-sidebar-swatch" aria-hidden />
                    <span className="cal-sidebar-body">
                      {!event.allDay ? (
                        <span className="cal-sidebar-time">
                          {format(event.start, locale === "ko" ? "a h:mm" : "h:mm a", {
                            locale: localeObj,
                          })}
                        </span>
                      ) : null}
                      <span className="cal-sidebar-title" title={event.title}>
                        {event.title}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </aside>
  );
}
