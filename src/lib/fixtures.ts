import type {
  CreatedDocument,
  DocumentPayload,
  InboxDropItem,
  VaultEntry,
  WorkspaceRegistry,
  VersionSnapshot,
} from "./types";

export const MOCK_WORKSPACE_PATH = "mock://anchor-sample-workspace";
export const MOCK_VAULT_PATH = MOCK_WORKSPACE_PATH;
export const MOCK_PUBLIC_WORKSPACE_PATH = "mock://anchor-public-workspace";

const now = "2026-04-27T09:00:00+09:00";

const sampleContent = `---
type: meeting
status: active
project: "[[Anchor Project]]"
tags:
  - 회의록
people:
  - "[[김하린]]"
created_at: 2026-04-20T09:00:00+09:00
updated_at: ${now}
---
# Anchor 사업 주간 점검 회의

## 메모
참석자들은 사업 KPI 산식과 예산 집행률 보고 기준을 다음 회의 전까지 정리하기로 했다.
`;

const referenceContent = `---
type: reference
status: archived
tags:
  - glossary
created_at: 2026-04-15T10:00:00+09:00
updated_at: 2026-04-22T11:00:00+09:00
---
# Anchor 용어집

## 본부 약어
- HRD : 인재양성본부
- INT : 국제협력본부
`;

export const mockDocuments: DocumentPayload[] = [
  {
    path: `${MOCK_VAULT_PATH}/anchor-weekly-meeting.md`,
    relPath: "anchor-weekly-meeting.md",
    title: "Anchor 사업 주간 점검 회의",
    content: sampleContent,
    body: sampleContent.split("---\n").slice(2).join("---\n").trim(),
    meta: {
      type: "meeting",
      status: "active",
      project: "[[Anchor Project]]",
    },
    fileKind: "md",
  },
  {
    path: `${MOCK_VAULT_PATH}/references/anchor-glossary.md`,
    relPath: "references/anchor-glossary.md",
    title: "Anchor 용어집",
    content: referenceContent,
    body: referenceContent.split("---\n").slice(2).join("---\n").trim(),
    meta: { type: "reference", status: "archived" },
    fileKind: "md",
  },
];

export function mockEntries(): VaultEntry[] {
  return mockDocuments.map((doc, index) => ({
    path: doc.path,
    relPath: doc.relPath,
    title: doc.title,
    frontmatter: doc.meta,
    updatedAt: index === 0 ? now : "2026-04-22T11:00:00+09:00",
    wordCount: doc.body.split(/\s+/).filter(Boolean).length,
    snippet: doc.body.replace(/\s+/g, " ").slice(0, 220),
    fileKind: doc.fileKind,
    versionCount: 0,
  }));
}

export function readMockDocument(path: string): DocumentPayload {
  const found = mockDocuments.find((doc) => doc.path === path || doc.relPath === path);
  if (!found) return mockDocuments[0];
  return found;
}

export function mockCreateDocument(
  title: string,
  docType: string,
  body: string,
): CreatedDocument {
  const relPath = `${title.toLowerCase().replace(/\s+/g, "-")}.md`;
  const content = `---\ntype: ${docType}\nstatus: draft\nupdated_at: ${now}\n---\n# ${title}\n\n${body}`;
  mockDocuments.unshift({
    path: `${MOCK_VAULT_PATH}/${relPath}`,
    relPath,
    title,
    content,
    body,
    meta: { type: docType, status: "draft" },
    fileKind: "md",
  });
  return { path: `${MOCK_VAULT_PATH}/${relPath}`, relPath, title };
}

export function mockCreateVersion(title: string): VersionSnapshot {
  return {
    path: `${MOCK_VAULT_PATH}/.anchor/versions/${Date.now()}.md`,
    relPath: `.anchor/versions/${Date.now()}.md`,
    title: `${title} - mock snapshot`,
    createdAt: now,
  };
}

export function mockWorkspaceRegistry(): WorkspaceRegistry {
  const includePublic =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).has("mockPublic");
  const workspaces: WorkspaceRegistry["workspaces"] = [
    {
      label: "Sample Workspace",
      path: MOCK_WORKSPACE_PATH,
      visibility: "private",
      externalWriter: null,
      writePolicy: "direct",
    },
  ];
  if (includePublic) {
    workspaces.push({
      label: "Public Workspace",
      path: MOCK_PUBLIC_WORKSPACE_PATH,
      visibility: "public",
      externalWriter: null,
      writePolicy: "direct",
    });
  }
  return {
    workspaces,
    activeByVisibility: {
      private: MOCK_WORKSPACE_PATH,
      public: includePublic ? MOCK_PUBLIC_WORKSPACE_PATH : null,
    },
    hiddenDefaults: [],
  };
}

export function mockInboxDropItems(): InboxDropItem[] {
  return [
    {
      id: "inbox/downloads/gmail/rise-budget-review.pdf",
      path: `${MOCK_VAULT_PATH}/inbox/downloads/gmail/rise-budget-review.pdf`,
      relPath: "inbox/downloads/gmail/rise-budget-review.pdf",
      title: "rise-budget-review.pdf",
      source: "gmail",
      sizeBytes: 184_320,
      receivedAt: now,
    },
    {
      id: "inbox/downloads/sharepoint/weekly-kpi.xlsx",
      path: `${MOCK_VAULT_PATH}/inbox/downloads/sharepoint/weekly-kpi.xlsx`,
      relPath: "inbox/downloads/sharepoint/weekly-kpi.xlsx",
      title: "weekly-kpi.xlsx",
      source: "sharepoint",
      sizeBytes: 92_104,
      receivedAt: "2026-04-26T14:30:00+09:00",
    },
  ];
}
