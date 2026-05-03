import type { VaultEntry } from "./types";

export type DocumentTreeRow =
  | {
      kind: "folder";
      id: string;
      path: string;
      name: string;
      depth: number;
      count: number;
      collapsed: boolean;
    }
  | {
      kind: "entry";
      id: string;
      entry: VaultEntry;
      depth: number;
    };

interface TreeNode {
  name: string;
  path: string;
  folders: Map<string, TreeNode>;
  entries: VaultEntry[];
  count: number;
}

export function buildDocumentTreeRows(
  entries: VaultEntry[],
  collapsedFolders: string[],
  forceExpand = false,
): DocumentTreeRow[] {
  const collapsed = new Set(collapsedFolders);
  const root: TreeNode = {
    name: "",
    path: "",
    folders: new Map(),
    entries: [],
    count: 0,
  };

  for (const entry of entries) {
    const parts = entry.relPath.split("/").filter(Boolean);
    if (parts.length <= 1) {
      root.entries.push(entry);
      root.count += 1;
      continue;
    }
    let node = root;
    node.count += 1;
    for (const folder of parts.slice(0, -1)) {
      const path = node.path ? `${node.path}/${folder}` : folder;
      let next = node.folders.get(folder);
      if (!next) {
        next = {
          name: folder,
          path,
          folders: new Map(),
          entries: [],
          count: 0,
        };
        node.folders.set(folder, next);
      }
      next.count += 1;
      node = next;
    }
    node.entries.push(entry);
  }

  return flattenNode(root, collapsed, forceExpand, -1);
}

export function nextCollapsedFolders(
  current: string[],
  folderPath: string,
  collapsed: boolean,
): string[] {
  const next = new Set(current);
  if (collapsed) next.add(folderPath);
  else next.delete(folderPath);
  return Array.from(next).sort((a, b) => a.localeCompare(b));
}

function flattenNode(
  node: TreeNode,
  collapsed: Set<string>,
  forceExpand: boolean,
  depth: number,
): DocumentTreeRow[] {
  const rows: DocumentTreeRow[] = [];
  const folders = Array.from(node.folders.values()).sort(compareFolder);
  const entries = [...node.entries].sort(compareEntry);

  for (const folder of folders) {
    const isCollapsed = !forceExpand && collapsed.has(folder.path);
    rows.push({
      kind: "folder",
      id: `folder:${folder.path}`,
      path: folder.path,
      name: folder.name,
      depth: depth + 1,
      count: folder.count,
      collapsed: isCollapsed,
    });
    if (!isCollapsed) {
      rows.push(...flattenNode(folder, collapsed, forceExpand, depth + 1));
    }
  }

  for (const entry of entries) {
    rows.push({
      kind: "entry",
      id: `entry:${entry.path}`,
      entry,
      depth: depth + 1,
    });
  }

  return rows;
}

function compareFolder(a: TreeNode, b: TreeNode): number {
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true });
}

function compareEntry(a: VaultEntry, b: VaultEntry): number {
  return a.relPath.localeCompare(b.relPath, undefined, {
    sensitivity: "base",
    numeric: true,
  });
}
