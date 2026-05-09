import type {
  InboxClassification,
  InboxDropItem,
  InboxEntry,
  InboxRuntimeConfig,
} from "./types";

export type InboxDecision = "pending" | "accepted" | "rejected";

export interface InboxItemState {
  item: InboxDropItem;
  decision: InboxDecision;
  classification: InboxClassification | null;
  classifying: boolean;
  classifyError: string | null;
}

export function buildInboxItemStates(
  items: InboxDropItem[],
  byId: Map<string, Omit<InboxItemState, "item">>,
): InboxItemState[] {
  return items.map((item) => {
    const carry = byId.get(item.id);
    return {
      item,
      decision: carry?.decision ?? "pending",
      classification: carry?.classification ?? null,
      classifying: carry?.classifying ?? false,
      classifyError: carry?.classifyError ?? null,
    };
  });
}

/** Return only items whose `source` matches `source`. `null` means
 *  "no filter" — pass through. Source comparison is case-sensitive
 *  to match the Rust scanner. */
export function filterItemsBySource<T extends { item: { source: string } }>(
  items: T[],
  source: string | null,
): T[] {
  if (source === null) return items;
  return items.filter((entry) => entry.item.source === source);
}

/** Distinct, alphabetically-stable list of sources observed in the
 *  current inbox snapshot. Used to populate the filter chip row. */
export function uniqueSources<T extends { item: { source: string } }>(items: T[]): string[] {
  const seen = new Set<string>();
  for (const entry of items) seen.add(entry.item.source);
  return [...seen].sort();
}

export function countInboxSources<T extends { item: { source: string } }>(
  items: T[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const entry of items) {
    counts.set(entry.item.source, (counts.get(entry.item.source) ?? 0) + 1);
  }
  return counts;
}

export function buildInboxFeedRowKeys({
  entries,
  files,
  gmail,
}: {
  entries: Array<{ id: string }>;
  files: Array<{ item: { id: string } }>;
  gmail: Array<{ message: { id: string } }>;
}): string[] {
  return [
    ...entries.map((entry) => `entry:${entry.id}`),
    ...files.map((entry) => `file:${entry.item.id}`),
    ...gmail.map((entry) => `gmail:${entry.message.id}`),
  ];
}

export function categoryLabel(category: string): string {
  switch (category) {
    case "task":
      return "할일";
    case "reference":
      return "참고";
    case "meeting":
      return "회의";
    case "admin":
      return "행정";
    default:
      return "분류 없음";
  }
}

export function firstPendingInboxKey(
  rows: Array<{ key: string; decision: InboxDecision }>,
): string | null {
  return rows.find((row) => row.decision === "pending")?.key ?? null;
}

export function nextInboxFocusKey(
  rowKeys: string[],
  currentKey: string | null,
  delta: number,
): string | null {
  if (rowKeys.length === 0) return null;
  const current = currentKey ? rowKeys.indexOf(currentKey) : -1;
  const next = Math.max(0, Math.min(rowKeys.length - 1, current + delta));
  return rowKeys[next] ?? null;
}

export function toggleInboxSelectionKeys(
  rowKeys: string[],
  selected: Set<string>,
  key: string,
  lastSelectedKey: string | null,
  range: boolean,
): Set<string> {
  const next = new Set(selected);
  if (range && lastSelectedKey) {
    const from = rowKeys.indexOf(lastSelectedKey);
    const to = rowKeys.indexOf(key);
    if (from >= 0 && to >= 0) {
      const [start, end] = from < to ? [from, to] : [to, from];
      rowKeys.slice(start, end + 1).forEach((rowKey) => next.add(rowKey));
      return next;
    }
  }
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}

export function inboxEntryProcessPath(entry: InboxEntry): string {
  if (entry.kind === "pendingItem") return entry.manifestPath ?? entry.path;
  return entry.path;
}

export function buildInboxProcessPrompt({
  channel,
  entries,
  config,
}: {
  channel: string;
  entries: InboxEntry[];
  config: InboxRuntimeConfig;
}): string {
  const contextLines =
    entries.length > 0
      ? entries.map((entry) => {
          const label = entry.kind === "pendingItem" ? "pending manifest" : "drop file";
          const source = entry.sourceKind ? ` sourceKind=${entry.sourceKind}` : "";
          return `- ${label}: ${inboxEntryProcessPath(entry)}${source}`;
        })
      : ["- channel header action: process configured local drop files and pending manifests"];

  return [
    `inbox-process ${channel}`,
    "",
    "Process the configured local inbox items for this channel.",
    "Do not fetch providers; external collection stays with io-* and inbox-intake.",
    "Use workspace.config.yaml as the SSOT, especially inbox.paths and inbox.naming.",
    "",
    "Selected context:",
    ...contextLines,
    "",
    "Configured inbox.paths:",
    JSON.stringify(config.paths, null, 2),
    "",
    "Configured inbox.naming:",
    JSON.stringify(config.naming, null, 2),
  ].join("\n");
}
