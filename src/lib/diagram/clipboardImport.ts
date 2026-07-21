/**
 * OS clipboard → diagram import candidates — Report Pattern Studio Phase 3.
 *
 * Paste priority when no internal (node/cell) clipboard entry exists:
 *
 * 1. `text/html` containing a `<table>` → the html-table codec (the
 *    Excel/Word/HWP paste path, spans + styles preserved).
 * 2. `text/plain` with tabs → TSV grid.
 * 3. `text/plain` shaped like a Markdown table → markdown-table codec.
 * 4. Anything else → plain single-cell text.
 *
 * Dependencies are injectable so tests can mock the clipboard reads.
 */

import { clipboardReadHtml, clipboardReadText } from "../clipboard";

export type ClipboardCodecId = "html-table" | "tsv" | "markdown-table" | "plain";

export interface ClipboardCandidate {
  codecId: ClipboardCodecId;
  text: string;
}

export interface ClipboardReadDeps {
  readHtml?: () => Promise<string | null>;
  readText?: () => Promise<string>;
}

/** Classify plain clipboard text: TSV by tabs, else Markdown table, else plain. */
export function detectPlainTextCodecId(text: string): ClipboardCodecId {
  if (text.includes("\t")) return "tsv";
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length >= 2) {
    const first = lines[0]!;
    if (first.startsWith("|") && first.indexOf("|", 1) >= 0) return "markdown-table";
  }
  return "plain";
}

const TABLE_HTML_RE = /<table[\s>]/i;

/**
 * Read the OS clipboard in priority order. Returns null when nothing usable
 * is on the clipboard (or every read path failed).
 */
export async function readClipboardCandidate(
  deps: ClipboardReadDeps = {},
): Promise<ClipboardCandidate | null> {
  const readHtml = deps.readHtml ?? clipboardReadHtml;
  const readText = deps.readText ?? clipboardReadText;

  const html = await readHtml();
  if (html && TABLE_HTML_RE.test(html)) {
    return { codecId: "html-table", text: html };
  }

  let text = "";
  try {
    text = await readText();
  } catch {
    return null;
  }
  if (!text.trim()) return null;
  return { codecId: detectPlainTextCodecId(text), text };
}
