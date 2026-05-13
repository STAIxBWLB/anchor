import { describe, expect, it } from "vitest";
import type { MissionRecord, TaskNoteRow } from "./types";
import {
  activeTasksMissions,
  filterTasksByQuery,
  isOverdue,
  normalizeTaskPriority,
  normalizeTaskStatus,
  rowsToTaskEntries,
  tasksToCalendarEvents,
} from "./tasks";

const rows: TaskNoteRow[] = [
  {
    path: "/work/tasks/active/260514-anchor-tasks.md",
    relPath: "tasks/active/260514-anchor-tasks.md",
    fileName: "260514-anchor-tasks.md",
    bucket: "active",
    sizeBytes: 100,
    updatedAt: "2026-05-14T10:00:00+09:00",
    frontmatter: {
      title: "Anchor tasks mode",
      status: "in_progress",
      priority: "P1",
      due: "2026-05-14",
      project: "Anchor",
      topics: ["tasks"],
    },
  },
  {
    path: "/work/tasks/backlog/sync.md",
    relPath: "tasks/backlog/sync.md",
    fileName: "sync.md",
    bucket: "backlog",
    sizeBytes: 20,
    updatedAt: null,
    frontmatter: {
      title: "Sync tasks",
      priority: "normal",
      project: "Ops",
    },
  },
  {
    path: "/work/tasks/archive/done.md",
    relPath: "tasks/archive/done.md",
    fileName: "done.md",
    bucket: "archive",
    sizeBytes: 20,
    updatedAt: null,
    frontmatter: {
      title: "Done task",
      due: "2026-05-01",
    },
  },
];

describe("task entry helpers", () => {
  it("normalizes status, priority, and frontmatter-derived fields", () => {
    const entries = rowsToTaskEntries(rows);
    const first = entries.find((entry) => entry.relPath.includes("260514"))!;
    const backlog = entries.find((entry) => entry.bucket === "backlog")!;
    const archive = entries.find((entry) => entry.bucket === "archive")!;

    expect(first.status).toBe("in-progress");
    expect(first.priority).toBe("high");
    expect(first.due).toBe("2026-05-14");
    expect(first.project).toBe("Anchor");
    expect(first.topics).toEqual(["tasks"]);
    expect(backlog.status).toBe("backlog");
    expect(backlog.priority).toBe("medium");
    expect(archive.status).toBe("done");
  });

  it("filters by query, status, project, priority, and due scope", () => {
    const entries = rowsToTaskEntries(rows);

    expect(filterTasksByQuery(entries, "anchor").map((entry) => entry.title)).toEqual([
      "Anchor tasks mode",
    ]);
    expect(
      filterTasksByQuery(entries, "", {
        statuses: ["backlog"],
        projects: ["Ops"],
        priorities: ["medium"],
      }).map((entry) => entry.title),
    ).toEqual(["Sync tasks"]);
    expect(
      filterTasksByQuery(entries, "", { due: "overdue" }).map((entry) => entry.title),
    ).toEqual([]);
  });

  it("detects overdue tasks with done and cancelled excluded", () => {
    const active = rowsToTaskEntries(rows).find((entry) => entry.title === "Anchor tasks mode")!;
    const done = rowsToTaskEntries(rows).find((entry) => entry.title === "Done task")!;

    expect(isOverdue({ ...active, due: "2026-05-13" }, "2026-05-14")).toBe(true);
    expect(isOverdue({ ...active, due: "2026-05-14" }, "2026-05-14")).toBe(false);
    expect(isOverdue(done, "2026-05-14")).toBe(false);
  });

  it("converts due and timed tasks to calendar events", () => {
    const timed: TaskNoteRow = {
      path: "/work/tasks/calendar/call.md",
      relPath: "tasks/calendar/call.md",
      fileName: "call.md",
      bucket: "calendar",
      sizeBytes: 10,
      updatedAt: null,
      frontmatter: {
        title: "Timed call",
        calendarStart: "2026-05-14T09:00:00+09:00",
        calendarEnd: "2026-05-14T10:00:00+09:00",
      },
    };
    const events = tasksToCalendarEvents(rowsToTaskEntries([rows[0], rows[1], timed]));

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ title: "Anchor tasks mode", allDay: true });
    expect(events[1]).toMatchObject({ title: "Timed call", allDay: false });
  });
});

describe("task normalizers", () => {
  it("normalizes unknown status from bucket and priority aliases", () => {
    expect(normalizeTaskStatus("weird", "active")).toBe("active");
    expect(normalizeTaskStatus(undefined, "backlog")).toBe("backlog");
    expect(normalizeTaskStatus(undefined, "archive")).toBe("done");
    expect(normalizeTaskPriority("urgent")).toBe("highest");
    expect(normalizeTaskPriority("low")).toBe("low");
    expect(normalizeTaskPriority("unknown")).toBe("none");
  });
});

describe("activeTasksMissions", () => {
  it("keeps only task-management background missions", () => {
    const missions: MissionRecord[] = [
      mission("a", "taskManagementSync"),
      mission("b", "meetingNotesVaultExtract"),
      mission("c", "taskManagementVaultExtract"),
    ];

    expect(activeTasksMissions(missions).map((item) => item.id)).toEqual(["c", "a"]);
  });
});

function mission(id: string, origin: string): MissionRecord {
  const minute = id === "c" ? 3 : id === "b" ? 2 : 1;
  return {
    id,
    kind: "skill",
    startedAt: `2026-05-14T10:0${minute}:00+09:00`,
    lastOutputAt: `2026-05-14T10:0${minute}:00+09:00`,
    status: "running",
    exitCode: null,
    outputLogPath: null,
    metadata: { origin },
  };
}
