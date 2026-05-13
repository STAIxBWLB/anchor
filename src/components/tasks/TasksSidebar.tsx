import { AlertTriangle, Archive, CalendarDays, CheckCircle2, Inbox, ListTodo } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "../../lib/i18n";
import type { TaskEntry } from "../../lib/tasks";

export type TasksFilterView = "active" | "backlog" | "today" | "overdue" | "done" | "all";

interface TasksSidebarProps {
  entries: TaskEntry[];
  activeView: TasksFilterView;
  selectedProject: string;
  onViewChange: (view: TasksFilterView) => void;
  onProjectChange: (project: string) => void;
  today: string;
}

export function TasksSidebar({
  entries,
  activeView,
  selectedProject,
  onViewChange,
  onProjectChange,
  today,
}: TasksSidebarProps) {
  const { t } = useTranslation();
  const projects = Array.from(
    new Set(entries.map((entry) => entry.project).filter((value): value is string => Boolean(value))),
  ).sort((a, b) => a.localeCompare(b));
  const doneCount = entries.filter((entry) => entry.bucket === "archive" || entry.status === "done").length;
  const views: Array<{
    id: TasksFilterView;
    label: string;
    count: number;
    icon: ReactNode;
  }> = [
    {
      id: "active",
      label: t("tasks.filter.active"),
      count: entries.filter((entry) => entry.status === "active" || entry.status === "in-progress").length,
      icon: <ListTodo size={14} />,
    },
    {
      id: "backlog",
      label: t("tasks.filter.backlog"),
      count: entries.filter((entry) => entry.bucket === "backlog" || entry.status === "backlog").length,
      icon: <Inbox size={14} />,
    },
    {
      id: "today",
      label: t("tasks.filter.today"),
      count: entries.filter((entry) => entry.due === today).length,
      icon: <CalendarDays size={14} />,
    },
    {
      id: "overdue",
      label: t("tasks.filter.overdue"),
      count: entries.filter(
        (entry) => entry.due && entry.due < today && !["cancelled", "done"].includes(entry.status),
      ).length,
      icon: <AlertTriangle size={14} />,
    },
    {
      id: "done",
      label: t("tasks.filter.done"),
      count: doneCount,
      icon: <CheckCircle2 size={14} />,
    },
    {
      id: "all",
      label: t("tasks.filter.all"),
      count: entries.length,
      icon: <Archive size={14} />,
    },
  ];

  return (
    <aside className="tasks-sidebar">
      <div className="tasks-sidebar-section">
        <span className="tasks-sidebar-label">{t("tasks.sidebar.status")}</span>
        {views.map((view) => (
          <button
            type="button"
            key={view.id}
            className={activeView === view.id ? "tasks-filter active" : "tasks-filter"}
            onClick={() => onViewChange(view.id)}
          >
            <span className="tasks-filter-copy">
              {view.icon}
              <span>{view.label}</span>
            </span>
            <span className="tasks-count">{view.count}</span>
          </button>
        ))}
      </div>
      <div className="tasks-sidebar-section">
        <span className="tasks-sidebar-label">{t("tasks.sidebar.projects")}</span>
        <button
          type="button"
          className={selectedProject === "all" ? "tasks-filter active" : "tasks-filter"}
          onClick={() => onProjectChange("all")}
        >
          <span>{t("tasks.project.all")}</span>
          <span className="tasks-count">{entries.length}</span>
        </button>
        {projects.map((project) => (
          <button
            type="button"
            key={project}
            className={selectedProject === project ? "tasks-filter active" : "tasks-filter"}
            onClick={() => onProjectChange(project)}
          >
            <span>{project}</span>
            <span className="tasks-count">
              {entries.filter((entry) => entry.project === project).length}
            </span>
          </button>
        ))}
      </div>
    </aside>
  );
}
