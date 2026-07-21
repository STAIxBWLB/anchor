import { describe, expect, it, vi } from "vitest";

import { detectPlainTextCodecId, readClipboardCandidate } from "./clipboardImport";

describe("detectPlainTextCodecId", () => {
  it("detects TSV by tabs", () => {
    expect(detectPlainTextCodecId("a\tb\nc\td")).toBe("tsv");
  });

  it("detects a Markdown table", () => {
    expect(detectPlainTextCodecId("| a | b |\n| --- | --- |\n| c | d |")).toBe(
      "markdown-table",
    );
  });

  it("falls back to plain text", () => {
    expect(detectPlainTextCodecId("just some words")).toBe("plain");
    expect(detectPlainTextCodecId("| only one row |")).toBe("plain");
  });
});

describe("readClipboardCandidate priority", () => {
  it("prefers text/html tables over plain text", async () => {
    const candidate = await readClipboardCandidate({
      readHtml: vi.fn().mockResolvedValue("<table><tr><td>x</td></tr></table>"),
      readText: vi.fn().mockResolvedValue("a\tb"),
    });
    expect(candidate?.codecId).toBe("html-table");
  });

  it("ignores HTML without a table and uses the text", async () => {
    const candidate = await readClipboardCandidate({
      readHtml: vi.fn().mockResolvedValue("<p>hello</p>"),
      readText: vi.fn().mockResolvedValue("a\tb"),
    });
    expect(candidate?.codecId).toBe("tsv");
  });

  it("falls back to text when HTML is unreadable (null)", async () => {
    const candidate = await readClipboardCandidate({
      readHtml: vi.fn().mockResolvedValue(null),
      readText: vi.fn().mockResolvedValue("| h |\n| --- |\n| x |"),
    });
    expect(candidate?.codecId).toBe("markdown-table");
  });

  it("returns plain for ordinary text", async () => {
    const candidate = await readClipboardCandidate({
      readHtml: vi.fn().mockResolvedValue(null),
      readText: vi.fn().mockResolvedValue("hello"),
    });
    expect(candidate?.codecId).toBe("plain");
    expect(candidate?.text).toBe("hello");
  });

  it("returns null when the clipboard is empty", async () => {
    const candidate = await readClipboardCandidate({
      readHtml: vi.fn().mockResolvedValue(null),
      readText: vi.fn().mockResolvedValue(""),
    });
    expect(candidate).toBeNull();
  });

  it("returns null when the text read fails", async () => {
    const candidate = await readClipboardCandidate({
      readHtml: vi.fn().mockResolvedValue(null),
      readText: vi.fn().mockRejectedValue(new Error("denied")),
    });
    expect(candidate).toBeNull();
  });
});
