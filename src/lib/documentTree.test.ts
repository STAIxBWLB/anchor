import { describe, expect, it } from "vitest";
import { buildDocumentTreeRows, nextCollapsedFolders } from "./documentTree";
import type { VaultEntry } from "./types";

function entry(relPath: string, title = relPath): VaultEntry {
  return {
    path: `/vault/${relPath}`,
    relPath,
    title,
    frontmatter: {},
    updatedAt: null,
    wordCount: 0,
    snippet: "",
    fileKind: "md",
    versionCount: 0,
  };
}

describe("buildDocumentTreeRows", () => {
  it("sorts folders before files and then by path", () => {
    const rows = buildDocumentTreeRows([
      entry("zeta.md"),
      entry("meetings/b.md"),
      entry("admin/a.md"),
      entry("alpha.md"),
    ], []);

    expect(rows.map((row) => (row.kind === "folder" ? row.path : row.entry.relPath))).toEqual([
      "admin",
      "admin/a.md",
      "meetings",
      "meetings/b.md",
      "alpha.md",
      "zeta.md",
    ]);
  });

  it("hides descendant entries below collapsed folders", () => {
    const rows = buildDocumentTreeRows([
      entry("projects/rise/plan.md"),
      entry("projects/rise/report.md"),
    ], ["projects"]);

    expect(rows.map((row) => (row.kind === "folder" ? row.path : row.entry.relPath))).toEqual([
      "projects",
    ]);
  });

  it("force-expands collapsed folders during search or filtering", () => {
    const rows = buildDocumentTreeRows([entry("projects/rise/plan.md")], ["projects"], true);

    expect(rows.map((row) => (row.kind === "folder" ? row.path : row.entry.relPath))).toEqual([
      "projects",
      "projects/rise",
      "projects/rise/plan.md",
    ]);
  });
});

describe("nextCollapsedFolders", () => {
  it("adds and removes folder paths deterministically", () => {
    expect(nextCollapsedFolders(["z"], "a", true)).toEqual(["a", "z"]);
    expect(nextCollapsedFolders(["a", "z"], "a", false)).toEqual(["z"]);
  });
});
