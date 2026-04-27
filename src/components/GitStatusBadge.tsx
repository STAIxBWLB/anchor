import { GitBranch } from "lucide-react";
import { useEffect, useState } from "react";
import { gitStatus } from "../lib/api";
import type { GitStatus } from "../lib/types";

interface Props {
  vaultPath: string | null;
  /** Bump this number to force a re-poll (after save/snapshot/refresh). */
  refreshTrigger: number;
}

/** Topbar badge showing the active vault's branch + dirty count. Hides
 *  itself when the vault isn't a git repo so non-versioned vaults don't
 *  show stale "no branch" text. */
export function GitStatusBadge({ vaultPath, refreshTrigger }: Props) {
  const [status, setStatus] = useState<GitStatus | null>(null);

  useEffect(() => {
    if (!vaultPath) {
      setStatus(null);
      return;
    }
    let cancelled = false;
    gitStatus(vaultPath)
      .then((next) => {
        if (!cancelled) setStatus(next);
      })
      .catch(() => {
        if (!cancelled) setStatus(null);
      });
    return () => {
      cancelled = true;
    };
  }, [vaultPath, refreshTrigger]);

  if (!status || !status.isRepo) return null;

  const total = status.modified + status.staged + status.untracked;
  const dirty = !status.clean;
  const tooltip = dirty
    ? `${status.branch ?? "—"} · ${status.staged} staged · ${status.modified} modified · ${status.untracked} untracked`
    : `${status.branch ?? "—"} · clean`;

  return (
    <span
      className={dirty ? "git-badge dirty" : "git-badge clean"}
      title={tooltip}
      aria-label={tooltip}
    >
      <GitBranch size={11} />
      <span className="git-badge-branch">{status.branch ?? "—"}</span>
      {dirty ? <span className="git-badge-count">{total}</span> : null}
    </span>
  );
}
