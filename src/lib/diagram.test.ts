import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

describe("diagram api wrappers", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    (globalThis as unknown as { window?: unknown }).window = {
      __TAURI_INTERNALS__: {},
    };
  });

  afterEach(() => {
    delete (globalThis as unknown as { window?: unknown }).window;
  });

  it("diagramSaveDocument forwards the workspace/name/body envelope", async () => {
    invokeMock.mockResolvedValueOnce(undefined);
    const { diagramSaveDocument } = await import("./diagram");
    await diagramSaveDocument("/w", "demo", "{\"v\":7}");
    expect(invokeMock).toHaveBeenCalledWith("diagram_save_document", {
      workspace: "/w",
      name: "demo",
      body: "{\"v\":7}",
    });
  });

  it("diagramLoadDocument returns the body string", async () => {
    invokeMock.mockResolvedValueOnce("{\"v\":7}");
    const { diagramLoadDocument } = await import("./diagram");
    const body = await diagramLoadDocument("/w", "demo");
    expect(body).toBe("{\"v\":7}");
    expect(invokeMock).toHaveBeenCalledWith("diagram_load_document", {
      workspace: "/w",
      name: "demo",
    });
  });

  it("diagramListDocuments returns an array", async () => {
    invokeMock.mockResolvedValueOnce([
      { name: "a", size: 12, modifiedAt: 1, docTitle: "A" },
    ]);
    const { diagramListDocuments } = await import("./diagram");
    const files = await diagramListDocuments("/w");
    expect(files).toEqual([{ name: "a", size: 12, modifiedAt: 1, docTitle: "A" }]);
  });

  it("diagramDeleteDocument returns the boolean", async () => {
    invokeMock.mockResolvedValueOnce(true);
    const { diagramDeleteDocument } = await import("./diagram");
    expect(await diagramDeleteDocument("/w", "a")).toBe(true);
  });

  it("falls back to an empty list when not in Tauri", async () => {
    delete (globalThis as unknown as { window?: unknown }).window;
    const { diagramListDocuments } = await import("./diagram");
    expect(await diagramListDocuments("/w")).toEqual([]);
  });

  it("save throws outside Tauri", async () => {
    delete (globalThis as unknown as { window?: unknown }).window;
    const { diagramSaveDocument } = await import("./diagram");
    await expect(diagramSaveDocument("/w", "n", "")).rejects.toThrow(/requires_tauri/);
  });
});
