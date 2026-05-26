import { invoke } from "@tauri-apps/api/core";

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

export interface DiagramFile {
  name: string;
  size: number;
  modifiedAt: number;
  docTitle: string;
}

function isTauri(): boolean {
  return typeof window !== "undefined" && Boolean(window.__TAURI_INTERNALS__);
}

export async function diagramSaveDocument(
  workspace: string,
  name: string,
  body: string,
): Promise<void> {
  if (!isTauri()) throw new Error("diagram_save_document_requires_tauri");
  return invoke<void>("diagram_save_document", { workspace, name, body });
}

export async function diagramLoadDocument(
  workspace: string,
  name: string,
): Promise<string> {
  if (!isTauri()) throw new Error("diagram_load_document_requires_tauri");
  return invoke<string>("diagram_load_document", { workspace, name });
}

export async function diagramListDocuments(workspace: string): Promise<DiagramFile[]> {
  if (!isTauri()) return [];
  return invoke<DiagramFile[]>("diagram_list_documents", { workspace });
}

export async function diagramDeleteDocument(
  workspace: string,
  name: string,
): Promise<boolean> {
  if (!isTauri()) return false;
  return invoke<boolean>("diagram_delete_document", { workspace, name });
}

export async function diagramExportBlob(
  workspace: string,
  name: string,
  kind: "png" | "svg" | "json",
  bytes: Uint8Array,
): Promise<string> {
  if (!isTauri()) throw new Error("diagram_export_blob_requires_tauri");
  return invoke<string>("diagram_export_blob", {
    workspace,
    name,
    kind,
    bytes: Array.from(bytes),
  });
}
