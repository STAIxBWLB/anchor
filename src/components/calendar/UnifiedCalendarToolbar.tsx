import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { addMonths, addWeeks, format, addDays } from "date-fns";
import { ko } from "date-fns/locale/ko";
import { enUS } from "date-fns/locale/en-US";
import type { CalendarLocale, CalendarView } from "../../lib/calendar/types";

interface UnifiedCalendarToolbarProps {
  view: CalendarView;
  viewDate: Date;
  locale: CalendarLocale;
  query: string;
  onQueryChange: (next: string) => void;
  onViewChange: (next: CalendarView) => void;
  onViewDateChange: (next: Date) => void;
  searchPlaceholder?: string;
}

const LABELS: Record<CalendarLocale, Record<string, string>> = {
  en: { search: "Search", day: "Day", week: "Week", month: "Month", today: "Today" },
  ko: { search: "검색", day: "일", week: "주", month: "월", today: "오늘" },
};

export function UnifiedCalendarToolbar({
  view,
  viewDate,
  locale,
  query,
  onQueryChange,
  onViewChange,
  onViewDateChange,
  searchPlaceholder,
}: UnifiedCalendarToolbarProps) {
  const labels = LABELS[locale];
  const localeObj = locale === "ko" ? ko : enUS;
  const title =
    view === "day"
      ? format(viewDate, locale === "ko" ? "yyyy년 M월 d일 EEEE" : "EEEE, MMMM d, yyyy", {
          locale: localeObj,
        })
      : view === "week"
        ? format(viewDate, locale === "ko" ? "yyyy년 M월" : "MMMM yyyy", { locale: localeObj })
        : format(viewDate, locale === "ko" ? "yyyy년 M월" : "MMMM yyyy", { locale: localeObj });

  const shift = (delta: -1 | 1) => {
    if (view === "day") onViewDateChange(addDays(viewDate, delta));
    else if (view === "week") onViewDateChange(addWeeks(viewDate, delta));
    else onViewDateChange(addMonths(viewDate, delta));
  };

  return (
    <header className="cal-toolbar">
      <label className="cal-search" title={searchPlaceholder ?? labels.search}>
        <Search size={14} />
        <input
          type="text"
          value={query}
          placeholder={searchPlaceholder ?? labels.search}
          onChange={(event) => onQueryChange(event.target.value)}
        />
      </label>
      <div className="cal-toolbar-center">
        <button
          type="button"
          className="cal-nav-button"
          onClick={() => shift(-1)}
          aria-label={locale === "ko" ? "이전" : "Previous"}
        >
          <ChevronLeft size={16} />
        </button>
        <span className="cal-title">{title}</span>
        <button
          type="button"
          className="cal-nav-button"
          onClick={() => shift(1)}
          aria-label={locale === "ko" ? "다음" : "Next"}
        >
          <ChevronRight size={16} />
        </button>
      </div>
      <div className="cal-toolbar-right">
        <div className="cal-view-toggle" role="tablist">
          {(["day", "week", "month"] as CalendarView[]).map((option) => (
            <button
              key={option}
              type="button"
              role="tab"
              aria-selected={view === option}
              className={view === option ? "active" : ""}
              onClick={() => onViewChange(option)}
            >
              {labels[option]}
            </button>
          ))}
        </div>
        <button type="button" className="cal-today-button" onClick={() => onViewDateChange(new Date())}>
          {labels.today}
        </button>
      </div>
    </header>
  );
}
