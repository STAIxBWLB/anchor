import "react-big-calendar/lib/css/react-big-calendar.css";

import {
  Calendar,
  CheckCircle2,
  List,
  Loader2,
  Plus,
  RefreshCcw,
  Search,
  Settings,
  WandSparkles,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Calendar as BigCalendar,
  dateFnsLocalizer,
  type EventPropGetter,
  type View,
} from "react-big-calendar";
import { format, getDay, parse, startOfWeek } from "date-fns";
import { ko } from "date-fns/locale/ko";
import { enUS } from "date-fns/locale/en-US";
import {
  appendTasksLog,
  createTaskNote,
  readTaskMetadata,
  scanTaskNotes,
  updateTaskStatus,
} from "../../lib/api";
import { useTranslation } from "../../lib/i18n";
import type { TasksSettings } from "../../lib/settings";
import type { SkillContextItem, SkillRecord } from "../../lib/skills";
import {
  activeTasksMissions,
  filterTasksByQuery,
  groupTasksByStatus,
  rowsToTaskEntries,
  tasksToCalendarEvents,
  type TaskCalendarEvent,
  type TaskEntry,
  type TaskPriority,
} from "../../lib/tasks";
import type {
  CreateTaskDraft,
  MissionRecord,
  TaskMetadata,
  TaskNoteRow,
  TaskStatus,
} from "../../lib/types";
import { Button } from "../ui/Button";
import { TaskDetailDrawer } from "./TaskDetailDrawer";
import { NewTaskDialog } from "./NewTaskDialog";
import { TasksSidebar, type TasksFilterView } from "./TasksSidebar";

interface TasksPaneProps {
  workPath: string | null;
  effectiveSettings: TasksSettings;
  skills: SkillRecord[];
  processingMissions: MissionRecord[];
  processingLogLines: Record<string, string[]>;
  onRefreshMissions: () => void;
  onOpenSettings: () => void;
  onOpenSkillCompose: (
    skill: SkillRecord | null,
    context: SkillContextItem[],
    prompt?: string,
  ) => void;
  onRevealPath?: (path: string) => void;
  onError: (message: string | null) => void;
}

const locales = { ko, en: enUS };

export function TasksPane({
  workPath,
  effectiveSettings,
  skills,
  processingMissions,
  processingLogLines,
  onRefreshMissions,
  onOpenSettings,
  onOpenSkillCompose,
  onRevealPath,
  onError,
}: TasksPaneProps) {
  const { t, locale } = useTranslation();
  const [rows, setRows] = useState<TaskNoteRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<TasksFilterView>("active");
  const [projectFilter, setProjectFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | "all">("all");
  const [displayMode, setDisplayMode] = useState<"list" | "calendar">(
    effectiveSettings.defaultView === "list" ? "list" : "calendar",
  );
  const [calendarView, setCalendarView] = useState<View>(
    effectiveSettings.defaultView === "day"
      ? "day"
      : effectiveSettings.defaultView === "week"
        ? "week"
        : "month",
  );
  const [selectedRelPath, setSelectedRelPath] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<TaskMetadata | null>(null);
  const [metadataLoading, setMetadataLoading] = useState(false);
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const entries = useMemo(() => rowsToTaskEntries(rows), [rows]);
  const selectedEntry = useMemo(
    () => entries.find((entry) => entry.relPath === selectedRelPath) ?? entries[0] ?? null,
    [entries, selectedRelPath],
  );
  const visibleEntries = useMemo(() => {
    return filterTasksByQuery(entries, query, {
      statuses: statusesForView(view),
      buckets: bucketsForView(view),
      projects: projectFilter === "all" ? [] : [projectFilter],
      priorities: priorityFilter === "all" ? [] : [priorityFilter],
      due: view === "today" || view === "overdue" ? view : null,
    });
  }, [entries, projectFilter, priorityFilter, query, view]);
  const grouped = useMemo(() => groupTasksByStatus(visibleEntries), [visibleEntries]);
  const calendarEvents = useMemo(() => tasksToCalendarEvents(visibleEntries), [visibleEntries]);
  const localizer = useMemo(
    () =>
      dateFnsLocalizer({
        format,
        parse,
        startOfWeek: (date: Date) =>
          startOfWeek(date, { weekStartsOn: effectiveSettings.weekStartsOn }),
        getDay,
        locales,
      }),
    [effectiveSettings.weekStartsOn],
  );
  const tasksMissions = useMemo(
    () => activeTasksMissions(processingMissions),
    [processingMissions],
  );

  const load = useCallback(async () => {
    if (!workPath || !effectiveSettings.enabled) {
      setRows([]);
      return;
    }
    setLoading(true);
    onError(null);
    try {
      setRows(await scanTaskNotes(workPath, effectiveSettings.root));
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [effectiveSettings.enabled, effectiveSettings.root, onError, workPath]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!selectedEntry) {
      setMetadata(null);
      return;
    }
    let cancelled = false;
    setMetadataLoading(true);
    if (workPath) {
      void readTaskMetadata(workPath, selectedEntry.relPath)
        .then((next) => {
          if (!cancelled) setMetadata(next);
        })
        .catch((err) => {
          if (!cancelled) onError(err instanceof Error ? err.message : String(err));
        })
        .finally(() => {
          if (!cancelled) setMetadataLoading(false);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [onError, selectedEntry, workPath]);

  const createTask = async (draft: CreateTaskDraft) => {
    if (!workPath) return;
    await createTaskNote(workPath, draft, effectiveSettings.root);
    await load();
  };

  const setStatus = async (entry: TaskEntry, status: TaskStatus) => {
    if (!workPath) return;
    try {
      const updated = await updateTaskStatus(workPath, entry.relPath, status);
      setRows((current) => current.map((row) => (row.relPath === entry.relPath ? updated : row)));
      setSelectedRelPath(updated.relPath);
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    }
  };

  const openSyncSkill = async () => {
    const skill = findSkill(skills, "task-management");
    const context = selectedEntry ? [{ path: selectedEntry.absPath, kind: "document" }] : [];
    const target = selectedEntry?.relPath ?? effectiveSettings.root ?? "tasks";
    if (workPath && effectiveSettings.hooks.appendVaultLog) {
      const payload = JSON.stringify({ skill: "task-management", target });
      await appendTasksLog(
        workPath,
        `- ${new Date().toISOString()} [sync] ${payload}`,
      ).catch((err) => onError(err instanceof Error ? err.message : String(err)));
    }
    onOpenSkillCompose(
      skill,
      context,
      `Sync local markdown tasks with the configured task-management workflow for ${target}.`,
    );
  };

  if (!workPath) {
    return (
      <main className="tasks-pane tasks-empty">
        <div className="empty-document-plate">
          <h2>{t("tasks.title")}</h2>
          <p>{t("tasks.empty")}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="tasks-pane">
      <TasksSidebar
        entries={entries}
        activeView={view}
        selectedProject={projectFilter}
        onViewChange={setView}
        onProjectChange={setProjectFilter}
        today={today}
      />
      <section className="tasks-main">
        <header className="tasks-header">
          <div>
            <h2>{t("tasks.title")}</h2>
            <p className="muted">{t("tasks.subtitle")}</p>
          </div>
          <div className="tasks-header-actions">
            <Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={() => setNewTaskOpen(true)}>
              {t("tasks.actions.new")}
            </Button>
            <Button size="sm" variant="secondary" icon={<RefreshCcw size={14} />} onClick={() => void load()}>
              {t("tasks.actions.refresh")}
            </Button>
            <Button size="sm" variant="secondary" icon={<WandSparkles size={14} />} onClick={() => void openSyncSkill()}>
              {t("tasks.actions.sync")}
            </Button>
            <Button size="sm" variant="ghost" icon={<Settings size={14} />} onClick={onOpenSettings}>
              {t("tasks.actions.settings")}
            </Button>
          </div>
        </header>
        <div className="tasks-toolbar">
          <label className="tasks-search">
            <Search size={14} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("tasks.search")}
            />
          </label>
          <select
            value={priorityFilter}
            onChange={(event) => setPriorityFilter(event.target.value as TaskPriority | "all")}
          >
            <option value="all">{t("tasks.priority.all")}</option>
            <option value="highest">{t("tasks.priority.highest")}</option>
            <option value="high">{t("tasks.priority.high")}</option>
            <option value="medium">{t("tasks.priority.medium")}</option>
            <option value="low">{t("tasks.priority.low")}</option>
          </select>
          <div className="segmented-control">
            <button
              type="button"
              className={displayMode === "list" ? "active" : ""}
              onClick={() => setDisplayMode("list")}
            >
              <List size={14} />
              {t("tasks.display.list")}
            </button>
            <button
              type="button"
              className={displayMode === "calendar" ? "active" : ""}
              onClick={() => setDisplayMode("calendar")}
            >
              <Calendar size={14} />
              {t("tasks.display.calendar")}
            </button>
          </div>
        </div>
        {loading ? (
          <div className="tasks-loading"><Loader2 size={16} /> {t("tasks.loading")}</div>
        ) : displayMode === "calendar" ? (
          <TaskCalendar
            events={calendarEvents}
            localizer={localizer}
            locale={locale}
            view={calendarView}
            onView={setCalendarView}
            onSelect={(entry) => setSelectedRelPath(entry.relPath)}
            startHour={effectiveSettings.calendarStartHour}
          />
        ) : (
          <TaskList
            grouped={grouped}
            selectedRelPath={selectedRelPath}
            onSelect={setSelectedRelPath}
            onDone={(entry) => void setStatus(entry, "done")}
            t={t}
          />
        )}
        {tasksMissions.length > 0 ? (
          <section className="tasks-runs">
            <header>
              <strong>{t("tasks.runs.title")}</strong>
              <button type="button" className="inline-action" onClick={onRefreshMissions}>
                {t("tasks.actions.refresh")}
              </button>
            </header>
            {tasksMissions.slice(0, 3).map((mission) => (
              <div key={mission.id} className="tasks-run-row">
                <span>{mission.status}</span>
                <code>{mission.id}</code>
                <small>{processingLogLines[mission.id]?.at(-1) ?? ""}</small>
              </div>
            ))}
          </section>
        ) : null}
      </section>
      <TaskDetailDrawer
        entry={selectedEntry}
        metadata={metadata}
        loading={metadataLoading}
        skills={skills}
        onRevealPath={onRevealPath}
        onOpenSkillCompose={onOpenSkillCompose}
      />
      <NewTaskDialog open={newTaskOpen} onClose={() => setNewTaskOpen(false)} onCreate={createTask} />
    </main>
  );
}

function TaskList({
  grouped,
  selectedRelPath,
  onSelect,
  onDone,
  t,
}: {
  grouped: Map<TaskStatus, TaskEntry[]>;
  selectedRelPath: string | null;
  onSelect: (relPath: string) => void;
  onDone: (entry: TaskEntry) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  const order: TaskStatus[] = ["in-progress", "active", "backlog", "done", "cancelled"];
  const visibleGroups = order
    .map((status) => [status, grouped.get(status) ?? []] as const)
    .filter(([, entries]) => entries.length > 0);
  if (visibleGroups.length === 0) {
    return <div className="tasks-list-empty">{t("tasks.list.empty")}</div>;
  }
  return (
    <div className="tasks-list">
      {visibleGroups.map(([status, entries]) => (
        <section className="tasks-group" key={status}>
          <header>
            <strong>{t(`tasks.status.${status === "in-progress" ? "inProgress" : status}`)}</strong>
            <span>{entries.length}</span>
          </header>
          {entries.map((entry) => (
            <button
              type="button"
              key={entry.relPath}
              className={selectedRelPath === entry.relPath ? "task-row selected" : "task-row"}
              onClick={() => onSelect(entry.relPath)}
            >
              <span
                className="task-check"
                role="checkbox"
                aria-checked={entry.status === "done"}
                onClick={(event) => {
                  event.stopPropagation();
                  if (entry.status !== "done") onDone(entry);
                }}
              >
                {entry.status === "done" ? <CheckCircle2 size={16} /> : null}
              </span>
              <span className="task-row-main">
                <strong>{entry.title}</strong>
                <span>{entry.relPath}</span>
              </span>
              <span className={`task-priority priority-${entry.priority}`}>
                {t(`tasks.priority.${entry.priority}`)}
              </span>
              {entry.due ? <span className="task-chip">{entry.due}</span> : null}
              {entry.project ? <span className="task-chip">{entry.project}</span> : null}
            </button>
          ))}
        </section>
      ))}
    </div>
  );
}

function TaskCalendar({
  events,
  localizer,
  locale,
  view,
  onView,
  onSelect,
  startHour,
}: {
  events: TaskCalendarEvent[];
  localizer: ReturnType<typeof dateFnsLocalizer>;
  locale: "ko" | "en";
  view: View;
  onView: (view: View) => void;
  onSelect: (entry: TaskEntry) => void;
  startHour: number;
}) {
  const { t } = useTranslation();
  const eventPropGetter: EventPropGetter<TaskCalendarEvent> = (event) => ({
    className: `task-calendar-event priority-${event.resource.priority}`,
  });
  return (
    <div className="tasks-calendar-shell">
      {events.length === 0 ? <div className="tasks-calendar-empty">{t("tasks.calendar.empty")}</div> : null}
      <BigCalendar<TaskCalendarEvent>
        localizer={localizer}
        culture={locale === "ko" ? "ko" : "en"}
        events={events}
        startAccessor="start"
        endAccessor="end"
        view={view}
        onView={onView}
        views={["month", "week", "day"]}
        onSelectEvent={(event) => onSelect(event.resource)}
        eventPropGetter={eventPropGetter}
        min={new Date(1970, 0, 1, startHour, 0, 0)}
        messages={{
          today: t("tasks.calendar.today"),
          previous: t("tasks.calendar.previous"),
          next: t("tasks.calendar.next"),
          month: t("tasks.calendar.month"),
          week: t("tasks.calendar.week"),
          day: t("tasks.calendar.day"),
          agenda: t("tasks.calendar.agenda"),
        }}
      />
    </div>
  );
}

function statusesForView(view: TasksFilterView): TaskStatus[] {
  if (view === "active" || view === "today" || view === "overdue") {
    return ["active", "in-progress"];
  }
  if (view === "backlog") return ["backlog"];
  if (view === "done") return ["done", "cancelled"];
  return [];
}

function bucketsForView(view: TasksFilterView) {
  if (view === "backlog") return ["backlog" as const];
  if (view === "done") return ["archive" as const];
  return [];
}

function findSkill(skills: SkillRecord[], name: string): SkillRecord | null {
  const normalized = name.toLowerCase();
  return (
    skills.find((skill) => skill.id.toLowerCase() === normalized)
    ?? skills.find((skill) => skill.name.toLowerCase() === normalized)
    ?? null
  );
}
