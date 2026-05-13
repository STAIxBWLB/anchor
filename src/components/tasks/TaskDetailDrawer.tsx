import { FolderOpen, Play, WandSparkles } from "lucide-react";
import { useTranslation } from "../../lib/i18n";
import type { TaskEntry } from "../../lib/tasks";
import type { TaskMetadata } from "../../lib/types";
import type { SkillContextItem, SkillRecord } from "../../lib/skills";
import { Button } from "../ui/Button";

interface TaskDetailDrawerProps {
  entry: TaskEntry | null;
  metadata: TaskMetadata | null;
  loading: boolean;
  skills: SkillRecord[];
  onRevealPath?: (path: string) => void;
  onOpenSkillCompose: (
    skill: SkillRecord | null,
    context: SkillContextItem[],
    prompt?: string,
  ) => void;
}

export function TaskDetailDrawer({
  entry,
  metadata,
  loading,
  skills,
  onRevealPath,
  onOpenSkillCompose,
}: TaskDetailDrawerProps) {
  const { t } = useTranslation();
  if (!entry) {
    return <aside className="task-detail-drawer empty">{t("tasks.detail.empty")}</aside>;
  }
  const context = [{ path: entry.absPath, kind: "document" }];
  const taskManagement = findSkill(skills, "task-management");
  return (
    <aside className="task-detail-drawer">
      <header className="task-detail-header">
        <div>
          <span>{entry.project ?? t("tasks.project.none")}</span>
          <h2>{entry.title}</h2>
          <p>{entry.relPath}</p>
        </div>
        {onRevealPath ? (
          <button
            type="button"
            className="icon-button"
            onClick={() => onRevealPath(entry.absPath)}
            title={t("context.revealInFinder")}
            aria-label={t("context.revealInFinder")}
          >
            <FolderOpen size={14} />
          </button>
        ) : null}
      </header>
      <div className="task-detail-actions">
        <Button
          size="sm"
          variant="secondary"
          icon={<Play size={14} />}
          onClick={() =>
            onOpenSkillCompose(
              taskManagement,
              context,
              `Review and update this task through task-management: ${entry.relPath}`,
            )
          }
        >
          {t("tasks.actions.runSkill")}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          icon={<WandSparkles size={14} />}
          onClick={() => onOpenSkillCompose(null, context)}
        >
          {t("tasks.actions.otherSkill")}
        </Button>
      </div>
      <dl className="task-detail-meta">
        <div>
          <dt>{t("tasks.field.status")}</dt>
          <dd>{t(`tasks.status.${statusKey(entry.status)}`)}</dd>
        </div>
        <div>
          <dt>{t("tasks.field.priority")}</dt>
          <dd>{t(`tasks.priority.${entry.priority}`)}</dd>
        </div>
        <div>
          <dt>{t("tasks.field.due")}</dt>
          <dd>{entry.due ?? "-"}</dd>
        </div>
        <div>
          <dt>{t("tasks.field.bucket")}</dt>
          <dd>{entry.bucket}</dd>
        </div>
      </dl>
      <section className="task-detail-section">
        <h3>{t("tasks.detail.frontmatter")}</h3>
        <div className="task-frontmatter-list">
          {Object.entries(metadata?.frontmatter ?? entry.frontmatter).map(([key, value]) => (
            <div key={key}>
              <span>{key}</span>
              <code>{formatValue(value)}</code>
            </div>
          ))}
        </div>
      </section>
      <section className="task-detail-section">
        <h3>{t("tasks.detail.preview")}</h3>
        {loading ? (
          <p className="muted">{t("tasks.loading")}</p>
        ) : (
          <pre className="task-preview">{metadata?.preview || t("tasks.detail.noPreview")}</pre>
        )}
      </section>
    </aside>
  );
}

function findSkill(skills: SkillRecord[], name: string): SkillRecord | null {
  const normalized = name.toLowerCase();
  return (
    skills.find((skill) => skill.id.toLowerCase() === normalized)
    ?? skills.find((skill) => skill.name.toLowerCase() === normalized)
    ?? null
  );
}

function statusKey(status: TaskEntry["status"]): string {
  return status === "in-progress" ? "inProgress" : status;
}

function formatValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}
