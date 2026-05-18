// M4 Export Pipeline (Phase 4 W8) — client-side wrappers + types.
// Spec: plan §M4, src-tauri/src/export/.

import { invoke } from "@tauri-apps/api/core";

export type ExportFormat = "docx" | "hwpx" | "pdf";
export type ExportOutputStatus = "planned" | "pending" | "ready" | "failed";
export type ValidationStatus = "pass" | "missing" | "hash-mismatch" | "skipped";

export interface ExportOutputEntry {
  format: ExportFormat;
  path: string;
  status: ExportOutputStatus;
  sha256: string | null;
  byte_size: number | null;
  reason: string | null;
}

export interface ExportManifest {
  schema_version: number;
  source: string;
  source_sha256: string;
  source_byte_size: number;
  generated_at: string;
  outputs: ExportOutputEntry[];
}

export interface ExportPlanRequest {
  workspaceRoot: string;
  sourcePath: string;
  formats: ExportFormat[];
  outputDir?: string;
}

export interface ExportPlanResponse {
  manifest_path: string;
  manifest: ExportManifest;
}

export async function exportPlan(req: ExportPlanRequest): Promise<ExportPlanResponse> {
  return invoke<ExportPlanResponse>("export_plan", {
    req: {
      workspace_root: req.workspaceRoot,
      source_path: req.sourcePath,
      formats: req.formats,
      output_dir: req.outputDir,
    },
  });
}

export async function exportManifestLoad(manifestPath: string): Promise<ExportManifest> {
  return invoke<ExportManifest>("export_manifest_load", { manifestPath });
}

export interface ValidationEntry {
  format: ExportFormat;
  path: string;
  status: ValidationStatus;
  reason: string | null;
}

export interface ValidationReport {
  manifest_path: string;
  source_path: string;
  source_status: ValidationStatus;
  entries: ValidationEntry[];
}

export async function exportValidate(manifestPath: string): Promise<ValidationReport> {
  return invoke<ValidationReport>("export_validate", { manifestPath });
}
